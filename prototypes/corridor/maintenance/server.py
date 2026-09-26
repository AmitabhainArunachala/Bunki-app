"""Loopback-only HTTP facade; browser credentials never authorize host operations."""
import argparse
import json
import mimetypes
from pathlib import Path
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

from local_ai import LocalAI
from store import (CLIENT_ROOT, DEFAULT_STATE, MAX_ATTACHMENT, MAX_BODY, MAX_TOTAL,
                   SERVICE_VERSION, VERSION, Problem, Store, allowed_static, canonical, exact, require)


class MaintenanceServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, store, app_root=None, ai=None):
        require(address[0] == '127.0.0.1', 'Service binds only to 127.0.0.1')
        self.store, self.app_root, self.ai = store, Path(app_root).resolve() if app_root else None, ai
        self.rate_lock, self.rate = threading.Lock(), {}
        super().__init__(address, Handler)
        self.origin = f'http://127.0.0.1:{self.server_port}'
        self.allowed_origins = {self.origin, 'http://127.0.0.1:57031'}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'BunkiMaintenance/' + SERVICE_VERSION
    sys_version = ''

    def log_message(self, fmt, *args):
        # Raw URLs, report text, and authorization headers are deliberately never logged.
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def guard(self, write=False):
        require(self.headers.get('Host') == self.server.origin.removeprefix('http://'), 'Unrecognized Host', 'forbidden_host', 403)
        origin = self.headers.get('Origin')
        require(origin is None or origin in self.server.allowed_origins, 'Origin is not allowed', 'forbidden_origin', 403)
        if write:
            require(origin in self.server.allowed_origins, 'A trusted Origin is required for writes', 'forbidden_origin', 403)
        require(self.headers.get('Sec-Fetch-Site') != 'cross-site' or origin in self.server.allowed_origins, 'Cross-site request rejected', 'forbidden_origin', 403)

    def actor(self):
        value = self.headers.get('Authorization', '')
        require(value.startswith('Bearer '), 'Guest receipt credential required', 'unauthorized', 401)
        return self.server.store.actor(value[7:])

    def read_body(self):
        require(not self.headers.get('Transfer-Encoding'), 'Transfer-Encoding is unsupported')
        require(self.headers.get('Content-Type', '').split(';')[0].strip().lower() == 'application/json', 'application/json required', status=415)
        require(len(self.headers.get_all('Content-Length', [])) == 1, 'Exactly one Content-Length required', status=411)
        try:
            length = int(self.headers['Content-Length'])
        except ValueError:
            raise Problem('invalid_payload', 'Invalid Content-Length') from None
        require(0 < length <= MAX_BODY, 'Request body exceeds limit', status=413)
        raw = self.rfile.read(length)
        require(len(raw) == length, 'Incomplete request body')
        def unique(pairs):
            value = {}
            for k, v in pairs:
                require(k not in value, 'Duplicate JSON field')
                value[k] = v
            return value
        try:
            return json.loads(raw, object_pairs_hook=unique, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (ValueError, UnicodeError, RecursionError):
            raise Problem('invalid_payload', 'Malformed JSON') from None

    def send(self, status, value=None, raw=None, mime='application/json', filename=None):
        body = raw if raw is not None else canonical(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-site')
        if filename:
            self.send_header('Content-Disposition', 'attachment; filename="screenshot"')
        origin = self.headers.get('Origin')
        if origin in self.server.allowed_origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def error(self, error):
        # Close after rejection: an unread request body must not become a second request.
        self.close_connection = True
        self.send(error.status, {'error': {'code': error.code, 'message': error.message}})

    def path_parts(self):
        parsed = urlsplit(self.path)
        require(not parsed.scheme and not parsed.netloc and not parsed.fragment, 'Only local paths are supported')
        require(not parsed.query or not parsed.path.startswith('/api/'), 'API query parameters are unsupported')
        return unquote(parsed.path)

    def do_OPTIONS(self):
        try:
            self.guard(write=True)
            self.send(204, raw=b'')
        except Problem as error:
            self.error(error)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        try:
            self.guard()
            path = self.path_parts()
            store = self.server.store
            if path == '/api/config':
                return self.send(200, {'schema_version': VERSION, 'service_version': SERVICE_VERSION,
                                      'build': store.build, 'content_ids': store.content_ids,
                                      'limits': {'attachment_bytes': MAX_ATTACHMENT, 'attachment_count': 4, 'total_attachment_bytes': MAX_TOTAL},
                                      'ai': self.server.ai.status if self.server.ai else {'status': 'pending', 'model': None, 'reason': 'Local AI worker disabled'}})
            if path == '/api/reports':
                return self.send(200, store.reports(self.actor()))
            match = re.fullmatch(r'/api/reports/([a-z][a-z0-9_-]{2,95})(?:/attachments/([a-z][a-z0-9_-]{2,95}))?', path)
            if match:
                actor = self.actor()
                if match[2]:
                    item = store.attachment(actor, match[1], match[2])
                    return self.send(200, raw=item['bytes'], mime=item['mime'], filename=item['name'])
                return self.send(200, store.reports(actor, match[1]))
            if self.server.app_root and not path.startswith('/api/'):
                file = allowed_static(self.server.app_root, 'index.html' if path == '/' else path.lstrip('/'))
                if file:
                    mime = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
                    return self.send(200, raw=file.read_bytes(), mime=mime)
            raise Problem('not_found', 'Resource not found', 404)
        except Problem as error:
            self.error(error)
        except (OSError, ValueError, sqlite3.Error):
            self.error(Problem('service_unavailable', 'Local maintenance storage is unavailable', 503))

    def do_POST(self):
        try:
            self.guard(write=True)
            path = self.path_parts()
            store = self.server.store
            if path == '/api/session':
                body = self.read_body()
                exact(body, ())
                with self.server.rate_lock:
                    bucket = int(time.time() // 60)
                    previous, count = self.server.rate.get('session', (bucket, 0))
                    count = count if previous == bucket else 0
                    require(count < 60, 'Session creation rate exceeded', 'rate_limited', 429)
                    self.server.rate['session'] = (bucket, count + 1)
                return self.send(201, store.session())
            actor = self.actor()
            body = self.read_body()
            if path == '/api/reports':
                result, created = store.intake(actor, body)
                return self.send(201 if created else 200, result)
            match = re.fullmatch(r'/api/reports/([a-z][a-z0-9_-]{2,95})/(messages|reopen|propose)', path)
            if match:
                if match[2] == 'propose':
                    exact(body, ())
                    return self.send(202, store.queue_triage(actor, match[1]))
                return self.send(200, store.message(actor, match[1], body, reopen=match[2] == 'reopen'))
            raise Problem('not_found', 'Endpoint not found', 404)
        except Problem as error:
            self.error(error)
        except (OSError, ValueError, sqlite3.Error):
            self.error(Problem('service_unavailable', 'Local maintenance storage is unavailable', 503))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=57032)
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--source-root', type=Path, default=CLIENT_ROOT)
    parser.add_argument('--app-root', type=Path, help='Optional allowlisted static app directory')
    parser.add_argument('--ollama-endpoint', default='http://127.0.0.1:11434')
    parser.add_argument('--ollama-model')
    parser.add_argument('--no-ai', action='store_true')
    args = parser.parse_args()
    store = Store(args.state_dir, args.source_root, asset_root=args.app_root)
    ai = None if args.no_ai else LocalAI(store, args.ollama_endpoint, args.ollama_model)
    server = MaintenanceServer(('127.0.0.1', args.port), store, args.app_root, ai)
    if ai:
        threading.Thread(target=ai.run, daemon=True, name='bunki-local-triage').start()
    print(canonical({'origin': server.origin, 'state_dir': str(store.state), 'build': store.build}), flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        if ai:
            ai.stop.set()
        server.server_close()


if __name__ == '__main__':
    main()
