#!/usr/bin/env python3
"""RADIUS iMessage Companion — local bridge for auto-sending via Mac Messages."""

import json
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 5123
VERSION = '1.3.0'


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
