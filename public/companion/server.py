#!/usr/bin/env python3
"""RADIUS iMessage Companion — local bridge for auto-sending via Mac Messages."""

import json
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 5123
VERSION = '1.2.0'


def send_imessage(phone: str, message: str) -> dict:
    # json.dumps handles all quoting/escaping for AppleScript string literals
    script = (
        'tell application "Messages"\n'
        '  set svc to 1st service whose service type = iMessage\n'
        f'  send {json.dumps(message)} to buddy {json.dumps(phone)} of svc\n'
        'end tell'
    )
    result = subprocess.run(
        ['osascript'],
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

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/ping':
            body = json.dumps({'ok': True}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        elif self.path == '/version':
            body = json.dumps({'version': VERSION}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors()
            self.end_headers()
            self.wfile.write(body)
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
            resp = json.dumps({'success': False, 'error': 'phone and message required'}).encode()
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self._cors()
            self.end_headers()
            self.wfile.write(resp)
            return

        result = send_imessage(phone, message)

        resp = json.dumps(result).encode()
        self.send_response(200 if result['success'] else 500)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(resp)

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
