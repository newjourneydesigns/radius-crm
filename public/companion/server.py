#!/usr/bin/env python3
"""RADIUS iMessage Companion — local bridge for auto-sending via Mac Messages."""

import json
import os
import sqlite3
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 5123
VERSION = '1.4.0'

# Apple's Messages database. Reading it is the only way to learn whether a
# message actually delivered (vs. merely being queued to iMessage) — the send
# AppleScript exits 0 even for a green-bubble number that can never receive an
# iMessage. Opening chat.db requires Full Disk Access on the process running
# this companion (the python3 interpreter launched by the LaunchAgent).
CHAT_DB = os.path.expanduser('~/Library/Messages/chat.db')

# message.date is nanoseconds since the "Mac absolute time" epoch (2001-01-01);
# this is the offset from the Unix epoch in seconds.
MAC_EPOCH_OFFSET = 978307200


def messages_is_running() -> bool:
    return subprocess.run(['pgrep', '-x', 'Messages'], capture_output=True).returncode == 0


def messages_state() -> dict:
    """Preflight for Auto Send. AppleScript accepts a send (exit 0) even when
    Messages is closed, signed out, or iMessage is disabled — states where
    nothing actually goes out — so verify them up front."""
    if not messages_is_running():
        return {'ok': False, 'error': 'Messages is not open. Open the Messages app, then try again.'}
    result = subprocess.run(
        ['osascript', '-e',
         'tell application "Messages" to get enabled of 1st service whose service type = iMessage'],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        return {'ok': False, 'error': 'Messages is not signed in to iMessage. Sign in via Messages → Settings → iMessage, then try again.'}
    if result.stdout.strip() != 'true':
        return {'ok': False, 'error': 'Your iMessage account is turned off in Messages. Enable it via Messages → Settings → iMessage, then try again.'}
    return {'ok': True}


def send_imessage(phone: str, message: str) -> dict:
    # Cheap re-check per message: if Messages quits mid-batch, report real
    # failures instead of letting AppleScript exit 0 into the void.
    if not messages_is_running():
        return {'success': False, 'error': 'Messages is not open'}
    # Pass phone/message as argv so emoji and special chars never touch AppleScript source
    script = (
        'on run argv\n'
        '  tell application "Messages"\n'
        '    set svc to 1st service whose service type = iMessage\n'
        '    send (item 2 of argv) to buddy (item 1 of argv) of svc\n'
        '  end tell\n'
        'end run'
    )
    result = subprocess.run(
        ['osascript', '-', phone, message],
        input=script,
        capture_output=True,
        text=True,
        timeout=15,
    )
    if result.returncode != 0:
        return {'success': False, 'error': result.stderr.strip() or 'AppleScript failed'}
    return {'success': True}


def _last10(num: str) -> str:
    """Reduce a phone number to its last 10 digits so the various formats
    Messages and RADIUS use ("+12145551234", "2145551234", "(214) 555-1234")
    all match. Good enough for US numbers, which is all this feature targets."""
    digits = ''.join(ch for ch in num if ch.isdigit())
    return digits[-10:]


def _open_chat_db():
    """Open chat.db read-only. Raises sqlite3.Error (or PermissionError) when
    Full Disk Access hasn't been granted — the caller treats that as no_access.
    Opened read-write-capable (query_only guards against writes) because a
    strict ?mode=ro connection can't read messages still sitting in the WAL,
    which is exactly where a just-sent message lives."""
    con = sqlite3.connect(CHAT_DB, timeout=5)
    con.execute('PRAGMA query_only = ON')
    return con


def can_verify() -> bool:
    try:
        con = _open_chat_db()
    except (sqlite3.Error, OSError):
        return False
    con.close()
    return True


def verify_delivery(phones: list, since_ms: int) -> dict:
    """Classify the most recent outgoing message to each phone as delivered /
    failed / pending by reading Apple's delivery receipts from chat.db.

    Returns {'ok': False, 'error': 'no_access'} when chat.db can't be read
    (Full Disk Access missing) so RADIUS can prompt the user to grant it."""
    targets = {}  # last-10-digits -> original phone string (the response key)
    for p in phones:
        key = _last10(p)
        if key:
            targets.setdefault(key, p)
    if not targets:
        return {'ok': True, 'results': {}}

    # Rewind a few seconds so a message that landed as the batch started isn't
    # missed to clock granularity.
    since_mac_ns = int((since_ms / 1000 - MAC_EPOCH_OFFSET - 5) * 1_000_000_000)

    try:
        con = _open_chat_db()
    except (sqlite3.Error, OSError):
        return {'ok': False, 'error': 'no_access'}
    try:
        rows = con.execute(
            'SELECT h.id, m.service, m.error, m.is_sent, m.is_delivered, m.date '
            'FROM message m JOIN handle h ON m.handle_id = h.ROWID '
            'WHERE m.is_from_me = 1 AND m.date > ?',
            (since_mac_ns,),
        ).fetchall()
    except sqlite3.Error:
        return {'ok': False, 'error': 'no_access'}
    finally:
        con.close()

    # Keep only the latest message per target number.
    latest = {}
    for handle, service, error, is_sent, is_delivered, date in rows:
        key = _last10(handle or '')
        if key not in targets:
            continue
        prev = latest.get(key)
        if prev is None or date > prev[4]:
            latest[key] = (service, error or 0, is_sent, is_delivered, date)

    results = {}
    for key, original in targets.items():
        row = latest.get(key)
        if row is None:
            # No matching message yet — still queued, or the handle hasn't been
            # written. Caller keeps polling; unresolved at timeout = unconfirmed.
            results[original] = {'status': 'unknown', 'service': None, 'error': 0}
            continue
        service, error, is_sent, is_delivered, _date = row
        if error != 0:
            status = 'failed'
        elif (service or '').upper() == 'IMESSAGE':
            # iMessage carries a real delivery receipt — trust it.
            status = 'delivered' if is_delivered else 'pending'
        else:
            # SMS/RCS give no delivery receipt; "sent" is the best signal there is.
            status = 'delivered' if is_sent else 'pending'
        results[original] = {'status': status, 'service': service, 'error': error}
    return {'ok': True, 'results': results}


def fire_notification(sent: int, failed: int) -> None:
    label = f"{sent} message{'s' if sent != 1 else ''} sent"
    if failed:
        label += f', {failed} failed'
    script = f'display notification {json.dumps(label)} with title "RADIUS" sound name "Glass"'
    subprocess.run(['osascript', '-e', script], capture_output=True, timeout=5)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silence default access log

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/ping':
            self._json(200, {'ok': True})
        elif self.path == '/version':
            self._json(200, {'version': VERSION})
        elif self.path == '/preflight':
            state = messages_state()
            self._json(200 if state['ok'] else 503, state)
        elif self.path == '/verify-capable':
            # Tells RADIUS whether delivery verification is available (Full Disk
            # Access granted). python_path is the exact binary the user must add
            # to Full Disk Access, surfaced in the setup guide.
            self._json(200, {'capable': can_verify(), 'python_path': sys.executable})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length) or b'{}')

        if self.path == '/notify':
            fire_notification(int(body.get('sent', 0)), int(body.get('failed', 0)))
            self.send_response(200)
            self._cors()
            self.end_headers()
            return

        if self.path == '/verify':
            phones = body.get('phones') or []
            since_ms = int(body.get('since_ms', 0))
            if not isinstance(phones, list):
                self._json(400, {'ok': False, 'error': 'phones must be a list'})
                return
            self._json(200, verify_delivery(phones, since_ms))
            return

        if self.path != '/send':
            self.send_response(404)
            self.end_headers()
            return

        phone = (body.get('phone') or '').strip()
        message = (body.get('message') or '').strip()
        delay_ms = int(body.get('delay_ms', 0))

        if not phone or not message:
            self._json(400, {'success': False, 'error': 'phone and message required'})
            return

        result = send_imessage(phone, message)
        self._json(200 if result['success'] else 500, result)

        if delay_ms > 0:
            time.sleep(delay_ms / 1000)


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print(f'RADIUS iMessage Companion — listening on port {PORT}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
        sys.exit(0)
