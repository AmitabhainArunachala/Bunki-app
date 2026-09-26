"""Durable local intake and fenced queue. No function executes maintenance commands."""
from __future__ import annotations

import base64
import copy
import hashlib
import hmac
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import sqlite3
import subprocess
import time
from contextlib import contextmanager
from datetime import datetime, timezone

from contract import SCHEMA

VERSION = 'bunki.maintenance/v1'
SERVICE_VERSION = '0.1.0'
CLIENT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STATE = Path.home() / '.dharma' / 'bunki_maintenance'
MAX_ATTACHMENT = 2 * 1024 * 1024
MAX_TOTAL = 6 * 1024 * 1024
MAX_BODY = 9 * 1024 * 1024
IDENT = re.compile(r'^[a-z][a-z0-9_-]{2,95}$')
SAFE_EXT = {'.html', '.js', '.mjs', '.css', '.json', '.png', '.jpg', '.jpeg', '.webp',
            '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav', '.ogg', '.webmanifest', '.svg'}
STATIC_DIRS = {'data', 'fonts', 'audio', 'vendor', 'modules'}
STATIC_MAINTENANCE = {'maintenance/report-client.js', 'maintenance/report-client.css'}


class Problem(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def require(ok, message, code='invalid_payload', status=400):
    if not ok:
        raise Problem(code, message, status)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def new_id(prefix):
    return prefix + '_' + secrets.token_hex(12)


def text_field(value, label, minimum=1, maximum=12000):
    require(isinstance(value, str) and minimum <= len(value) <= maximum, f'{label}: invalid length/type')
    require(not any(0xD800 <= ord(c) <= 0xDFFF for c in value), f'{label}: isolated Unicode surrogate')
    require(minimum == 0 or bool(value.strip()), f'{label}: must contain text')
    return value


def exact(value, required, optional=()):
    require(isinstance(value, dict), 'Expected an object')
    require(set(required) <= set(value) <= set(required) | set(optional), 'Missing or unknown fields')


def validate(value, schema, path='$'):
    """Deliberate, dependency-free implementation of the draft's complete keyword subset."""
    if '$ref' in schema:
        node = SCHEMA
        for part in schema['$ref'].split('/')[1:]:
            node = node[part]
        return validate(value, node, path)
    if 'const' in schema:
        require(value == schema['const'] and type(value) is type(schema['const']), f'{path}: incorrect constant')
    if 'enum' in schema:
        require(value in schema['enum'], f'{path}: unsupported value')
    types = schema.get('type', [])
    types = [types] if isinstance(types, str) else types
    matches = {'object': isinstance(value, dict), 'array': isinstance(value, list),
               'string': isinstance(value, str), 'null': value is None,
               'integer': type(value) is int, 'boolean': type(value) is bool,
               'number': type(value) in (int, float)}
    require(not types or any(matches.get(t, False) for t in types), f'{path}: incorrect type')
    if isinstance(value, dict):
        props = schema.get('properties', {})
        require(set(schema.get('required', [])) <= set(value), f'{path}: missing fields')
        if schema.get('additionalProperties') is False:
            require(set(value) <= set(props), f'{path}: unknown fields')
        for key, item in value.items():
            if key in props:
                validate(item, props[key], f'{path}.{key}')
    if isinstance(value, list):
        require(schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', 100000), f'{path}: item count')
        for i, item in enumerate(value):
            validate(item, schema.get('items', {}), f'{path}[{i}]')
    if isinstance(value, str):
        require(not any(0xD800 <= ord(c) <= 0xDFFF for c in value), f'{path}: isolated Unicode surrogate')
        require(schema.get('minLength', 0) <= len(value) <= schema.get('maxLength', 1000000), f'{path}: text length')
        if schema.get('minLength', 0):
            require(bool(value.strip()), f'{path}: blank text')
        if 'pattern' in schema:
            require(re.fullmatch(schema['pattern'], value) is not None, f'{path}: invalid pattern')
        if schema.get('format') == 'date-time':
            try:
                stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
                require(stamp.tzinfo is not None, f'{path}: timestamp needs timezone')
            except ValueError:
                raise Problem('invalid_payload', f'{path}: invalid timestamp') from None
    if type(value) is int:
        require(value >= schema.get('minimum', value), f'{path}: below minimum')


def safe_relative(value):
    require(isinstance(value, str) and value and '\\' not in value, 'Invalid relative path')
    p = PurePosixPath(value)
    require(not p.is_absolute() and '..' not in p.parts and not any(x.startswith('.') for x in p.parts),
            'Paths must be relative without hidden/traversal segments')
    require(str(p) == value and not any(c in value for c in '*?[]\x00\n\r'), 'Path must be concrete and normalized')
    return value


def allowed_static(root, relative):
    try:
        safe_relative(relative)
    except Problem:
        return None
    p = root / relative
    if any((root / Path(*PurePosixPath(relative).parts[:i])).is_symlink()
           for i in range(1, len(PurePosixPath(relative).parts) + 1)):
        return None
    if p.suffix.lower() not in SAFE_EXT:
        return None
    if '/' in relative and relative.split('/')[0] not in STATIC_DIRS and relative not in STATIC_MAINTENANCE:
        return None
    if p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(root.resolve()):
        return None
    return p


def build_identity(root=CLIENT_ROOT, source_root=None):
    """Hash exactly the allowlisted app assets, never host state or repository secrets."""
    h = hashlib.sha256()
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root).as_posix()
        if allowed_static(root, relative) and relative != 'build-identity.json':
            h.update(relative.encode() + b'\0')
            with path.open('rb') as source:
                while chunk := source.read(1024 * 1024):
                    h.update(chunk)
            h.update(b'\0')
    try:
        sha = subprocess.check_output(['git', '-C', str(source_root or root), 'rev-parse', 'HEAD'],
                                      stderr=subprocess.DEVNULL, timeout=5, text=True).strip()
    except (OSError, subprocess.SubprocessError):
        sha = None
    return {'git_sha': sha, 'artifact_sha256': h.hexdigest()}


def content_catalog(root):
    """Known IDs from shipped JSON only; arbitrary client-invented IDs are rejected."""
    ids = set()
    def walk(v):
        if isinstance(v, dict):
            for key, item in v.items():
                if key in {'id', 'question_id', 'content_id', 'item_id'} and isinstance(item, str) and len(item) <= 160:
                    ids.add(item)
                walk(item)
        elif isinstance(v, list):
            for item in v:
                walk(item)
    for path in (root / 'data').rglob('*.json'):
        if allowed_static(root, path.relative_to(root).as_posix()) and path.stat().st_size <= 30 * 1024 * 1024:
            try:
                walk(json.loads(path.read_text()))
            except (OSError, ValueError):
                continue
    return sorted(ids)


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


class Store:
    def __init__(self, state=DEFAULT_STATE, root=CLIENT_ROOT, build=None, content_ids=None, asset_root=None):
        self.state, self.root = Path(state), Path(root).resolve()
        require(self.root.is_dir(), 'Configured source root must be an existing directory')
        self.state.mkdir(mode=0o700, parents=True, exist_ok=True)
        require(not self.state.is_symlink(), 'State directory cannot be a symlink')
        os.chmod(self.state, 0o700)
        self.db_path = self.state / 'maintenance.sqlite3'
        self.asset_root = Path(asset_root).resolve() if asset_root else self.root
        require(self.asset_root.is_dir(), 'Configured app root must be an existing directory')
        self.build = build or build_identity(self.asset_root, self.root)
        self.content_ids = content_catalog(self.asset_root) if content_ids is None else content_ids
        self.host_id = hashlib.sha256(str(self.root).encode()).hexdigest()[:24]
        for role in ('operator', 'worker'):
            path = self.state / (role + '.key')
            require(not path.is_symlink(), 'Credential file cannot be a symlink')
            try:
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                os.chmod(path, 0o600)
            else:
                with os.fdopen(fd, 'w') as f:
                    f.write(secrets.token_urlsafe(48))
                    f.flush()
                    os.fsync(f.fileno())
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, actor TEXT UNIQUE, created TEXT);
                CREATE TABLE IF NOT EXISTS builds(id TEXT PRIMARY KEY, payload TEXT);
                CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, actor TEXT NOT NULL, payload TEXT NOT NULL,
                  receipt TEXT NOT NULL, status TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'pending',
                  triage_reason TEXT NOT NULL DEFAULT 'Awaiting local model', triage_fence INTEGER DEFAULT 0,
                  triage_until REAL DEFAULT 0, next_attempt REAL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 1);
                CREATE TABLE IF NOT EXISTS attachments(report_id TEXT, id TEXT, name TEXT, mime TEXT, sha TEXT,
                  bytes BLOB, PRIMARY KEY(report_id,id));
                CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, report_id TEXT, actor TEXT, text TEXT,
                  created TEXT, context TEXT);
                CREATE TABLE IF NOT EXISTS idempotency(actor TEXT, key TEXT, digest TEXT, target TEXT,
                  PRIMARY KEY(actor,key));
                CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, payload TEXT, provenance TEXT, created TEXT);
                CREATE TABLE IF NOT EXISTS proposal_reports(proposal_id TEXT, report_id TEXT, report_generation INTEGER,
                  PRIMARY KEY(proposal_id,report_id));
                CREATE TABLE IF NOT EXISTS work_orders(id TEXT PRIMARY KEY, proposal_id TEXT, payload TEXT,
                  state TEXT, worker TEXT, fence INTEGER DEFAULT 0, lease_until REAL DEFAULT 0, result TEXT,
                  completion_relevance TEXT);
                CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, created TEXT, kind TEXT, target TEXT, detail TEXT);
            ''')
            # Serialize additive migration with writers. Historic proposal/order generation
            # is deliberately left unknown: a timestamp cannot prove which evidence was seen.
            db.execute('BEGIN IMMEDIATE')
            report_columns = {r['name'] for r in db.execute('PRAGMA table_info(reports)')}
            if 'generation' not in report_columns:
                db.execute('ALTER TABLE reports ADD COLUMN generation INTEGER NOT NULL DEFAULT 1')
                db.execute("UPDATE reports SET generation=1+(SELECT COUNT(*) FROM messages WHERE report_id=reports.id AND actor='user')")
            if 'report_generation' not in {r['name'] for r in db.execute('PRAGMA table_info(proposal_reports)')}:
                db.execute('ALTER TABLE proposal_reports ADD COLUMN report_generation INTEGER')
            if 'completion_relevance' not in {r['name'] for r in db.execute('PRAGMA table_info(work_orders)')}:
                db.execute('ALTER TABLE work_orders ADD COLUMN completion_relevance TEXT')
            db.execute('INSERT OR IGNORE INTO builds VALUES (?,?)', (digest(self.build), canonical(self.build)))
        os.chmod(self.db_path, 0o600)

    def connect(self):
        require(not self.db_path.is_symlink(), 'Database cannot be a symlink')
        db = sqlite3.connect(self.db_path, timeout=15, factory=ClosingConnection)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA synchronous=FULL')
        db.execute('PRAGMA foreign_keys=ON')
        return db

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def event(self, db, kind, target, detail=None):
        db.execute('INSERT INTO events(created,kind,target,detail) VALUES (?,?,?,?)',
                   (now(), kind, target, canonical(detail or {})))

    def authorize(self, role, token):
        expected = (self.state / (role + '.key')).read_text().strip()
        require(isinstance(token, str) and hmac.compare_digest(expected, token), 'Invalid host credential', 'unauthorized', 401)

    def session(self):
        token, actor = secrets.token_urlsafe(40), new_id('guest')
        with self.transaction() as db:
            require(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0] < 10000,
                    'Local guest capacity reached', 'capacity_reached', 507)
            db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), actor, now()))
        return {'token': token, 'actor_ref': actor}

    def actor(self, token):
        require(isinstance(token, str) and len(token) <= 200, 'Guest receipt credential required', 'unauthorized', 401)
        with self.connect() as db:
            row = db.execute('SELECT actor FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        require(row, 'Guest receipt credential invalid', 'unauthorized', 401)
        return row['actor']

    def validate_context(self, db, context):
        validate(context, SCHEMA['definitions']['LearnerReport']['properties']['context'])
        require(context['build'] == {'git_sha': None, 'artifact_sha256': None} or db.execute('SELECT 1 FROM builds WHERE id=?', (digest(context['build']),)).fetchone(),
                'Unknown build identity; refresh /api/config', 'unknown_build')
        require(set(context['content_ids']) <= set(self.content_ids), 'Unknown content ID', 'unknown_content')
        require(context['route'].startswith('/') and not context['route'].startswith('//') and '\\' not in context['route'],
                'Route must be an application-relative path')

    def owned(self, db, actor, report_id):
        row = db.execute('SELECT * FROM reports WHERE id=? AND actor=?', (report_id, actor)).fetchone()
        require(row, 'Report not found', 'not_found', 404)
        return row

    def idem(self, db, actor, key, value):
        text_field(key, 'idempotency_key', 8, 160)
        row = db.execute('SELECT * FROM idempotency WHERE actor=? AND key=?', (actor, key)).fetchone()
        if row:
            require(row['digest'] == digest(value), 'Idempotency key reused with a different payload', 'idempotency_conflict', 409)
        return row

    def intake(self, actor, envelope):
        exact(envelope, ('idempotency_key', 'report', 'attachments'))
        report = envelope['report']
        validate(report, SCHEMA['definitions']['LearnerReport'])
        require(report['origin'] == {'kind': 'user', 'actor_ref': actor, 'model_ref': None}, 'Report origin does not match authenticated guest')
        require(report['revision'] == 1, 'New report revision must be 1')
        attachments = envelope['attachments']
        require(isinstance(attachments, list) and len(attachments) <= 4, 'At most four attachments')
        encoded, ids, total = [], set(), 0
        for item in attachments:
            exact(item, ('id', 'name', 'mime_type', 'data_base64'))
            require(isinstance(item['id'], str) and IDENT.fullmatch(item['id']), 'Invalid attachment ID')
            require(item['id'] not in ids, 'Duplicate attachment ID')
            ids.add(item['id'])
            text_field(item['name'], 'Attachment name', 1, 160)
            require('/' not in item['name'] and '\\' not in item['name'], 'Attachment name must be a filename')
            require(item['mime_type'] in ('image/png', 'image/jpeg', 'image/webp'), 'Only PNG/JPEG/WebP screenshots allowed')
            require(isinstance(item['data_base64'], str) and len(item['data_base64']) <= (MAX_ATTACHMENT * 4 // 3 + 8), 'Attachment too large', status=413)
            try:
                raw = base64.b64decode(item['data_base64'], validate=True)
            except (ValueError, TypeError):
                raise Problem('invalid_attachment', 'Invalid base64 attachment') from None
            require(0 < len(raw) <= MAX_ATTACHMENT, 'Attachment too large or empty', status=413)
            signatures = {'image/png': raw.startswith(b'\x89PNG\r\n\x1a\n'),
                          'image/jpeg': raw.startswith(b'\xff\xd8\xff'),
                          'image/webp': raw.startswith(b'RIFF') and raw[8:12] == b'WEBP'}
            require(signatures[item['mime_type']], 'Image signature does not match declared type')
            total += len(raw)
            encoded.append((report['id'], item['id'], item['name'], item['mime_type'], hashlib.sha256(raw).hexdigest(), raw))
        require(total <= MAX_TOTAL, 'Total attachment limit exceeded', status=413)
        require(set(report['attachment_ids']) == ids and len(report['attachment_ids']) == len(ids), 'Attachment references do not match')
        evidence_ids = [e['id'] for e in report['evidence']]
        require(len(set(evidence_ids)) == len(evidence_ids), 'Duplicate evidence ID')
        for e in report['evidence']:
            require(e['kind'] in {'user_quote', 'screenshot', 'action_trace'}, 'Guests cannot assert source inspection or verified test evidence')
            if e['artifact_ref'] is not None:
                require(e['artifact_ref'] in {'attachment:' + i for i in ids}, 'Unknown artifact reference')
            if e['kind'] == 'screenshot':
                require(e['artifact_ref'] is not None, 'Screenshot evidence needs an attachment')
        with self.transaction() as db:
            duplicate = self.idem(db, actor, envelope['idempotency_key'], envelope)
            if duplicate:
                return self._view(db, self.owned(db, actor, duplicate['target'])), False
            self.validate_context(db, report['context'])
            require(db.execute('SELECT COUNT(*) FROM reports WHERE actor=?', (actor,)).fetchone()[0] < 200,
                    'Reporter capacity reached', 'capacity_reached', 429)
            require(db.execute('SELECT COUNT(*) FROM reports').fetchone()[0] < 2000,
                    'Local report capacity reached', 'capacity_reached', 507)
            require(db.execute('SELECT COALESCE(SUM(length(bytes)),0) FROM attachments').fetchone()[0] + total <= 256 * 1024 * 1024,
                    'Local attachment capacity reached', 'capacity_reached', 507)
            require(not db.execute('SELECT 1 FROM reports WHERE id=?', (report['id'],)).fetchone(), 'Report ID already exists', 'id_conflict', 409)
            receipt = {'receipt_id': new_id('receipt'), 'report_id': report['id'], 'received_at': now(), 'payload_sha256': digest(envelope)}
            db.execute('INSERT INTO reports(id,actor,payload,receipt,status) VALUES (?,?,?,?,?)',
                       (report['id'], actor, canonical(report), canonical(receipt), 'received'))
            db.executemany('INSERT INTO attachments VALUES (?,?,?,?,?,?)', encoded)
            db.execute('INSERT INTO idempotency VALUES (?,?,?,?)', (actor, envelope['idempotency_key'], digest(envelope), report['id']))
            self.event(db, 'report_received', report['id'], {'payload_sha256': receipt['payload_sha256']})
            result = self._view(db, self.owned(db, actor, report['id']))
        # Transaction commits with synchronous=FULL before the HTTP acknowledgment is emitted.
        return result, True

    def _view(self, db, row):
        proposals = [json.loads(p['payload']) for p in db.execute('SELECT p.payload FROM proposals p JOIN proposal_reports r ON p.id=r.proposal_id WHERE r.report_id=? ORDER BY p.created', (row['id'],))]
        conversation = [dict(m) for m in db.execute('SELECT id,actor,text,created AS created_at,context FROM messages WHERE report_id=? ORDER BY rowid', (row['id'],))]
        for item in conversation:
            item['context'] = json.loads(item['context']) if item['context'] else None
        return {'receipt': json.loads(row['receipt']), 'report': json.loads(row['payload']), 'generation': row['generation'], 'status': row['status'],
                'triage': {'state': row['triage_state'], 'reason': row['triage_reason']}, 'conversation': conversation, 'proposals': proposals}

    def reports(self, actor, report_id=None):
        with self.connect() as db:
            if report_id:
                return self._view(db, self.owned(db, actor, report_id))
            return {'reports': [self._view(db, row) for row in db.execute('SELECT * FROM reports WHERE actor=? ORDER BY rowid DESC', (actor,))]}

    def message(self, actor, report_id, body, reopen=False):
        exact(body, ('idempotency_key', 'text', 'context') if reopen else ('idempotency_key', 'text'))
        text_field(body['text'], 'Message', 1, 4000)
        value = {'operation': 'reopen' if reopen else 'message', 'report_id': report_id, 'body': body}
        with self.transaction() as db:
            self.owned(db, actor, report_id)
            duplicate = self.idem(db, actor, body['idempotency_key'], value)
            if not duplicate:
                require(db.execute('SELECT COUNT(*) FROM messages WHERE report_id=?', (report_id,)).fetchone()[0] < 100,
                        'Report conversation capacity reached', 'capacity_reached', 429)
                if reopen:
                    self.validate_context(db, body['context'])
                db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?)', (new_id('msg'), report_id, 'user', body['text'], now(), canonical(body['context']) if reopen else None))
                db.execute('INSERT INTO idempotency VALUES (?,?,?,?)', (actor, body['idempotency_key'], digest(value), report_id))
                db.execute("UPDATE reports SET generation=generation+1,status='received',triage_state='pending',triage_reason='Follow-up awaiting local model',triage_fence=triage_fence+1,triage_until=0,next_attempt=0 WHERE id=?", (report_id,))
                self.event(db, 'report_reopened' if reopen else 'report_message', report_id)
            return self._view(db, self.owned(db, actor, report_id))

    def attachment(self, actor, report_id, attachment_id):
        with self.connect() as db:
            self.owned(db, actor, report_id)
            row = db.execute('SELECT * FROM attachments WHERE report_id=? AND id=?', (report_id, attachment_id)).fetchone()
            require(row, 'Attachment not found', 'not_found', 404)
            return dict(row)

    def queue_triage(self, actor, report_id):
        with self.transaction() as db:
            row = self.owned(db, actor, report_id)
            # Retry an unavailable model, but never invalidate an active generation or duplicate a completed proposal.
            if row['triage_state'] == 'pending':
                db.execute('UPDATE reports SET next_attempt=0 WHERE id=?', (report_id,))
            return {'queued': row['triage_state'] != 'complete', 'report_id': report_id}

    def claim_triage(self, seconds=180):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM reports WHERE (triage_state='pending' OR (triage_state='running' AND triage_until<?)) AND next_attempt<=? ORDER BY rowid LIMIT 1", (time.time(), time.time())).fetchone()
            if not row:
                return None
            fence = row['triage_fence'] + 1
            db.execute("UPDATE reports SET triage_state='running',triage_reason='Local model is reviewing the selected report',triage_fence=?,triage_until=? WHERE id=?", (fence, time.time() + seconds, row['id']))
            return {'report': json.loads(row['payload']), 'fence': fence,
                    'conversation': [dict(m) for m in db.execute("SELECT actor,text,context FROM messages WHERE report_id=? ORDER BY rowid DESC LIMIT 12", (row['id'],))]}

    def triage_pending(self, report_id, fence, reason):
        with self.transaction() as db:
            db.execute("UPDATE reports SET triage_state='pending',triage_reason=?,triage_until=0,next_attempt=? WHERE id=? AND triage_fence=? AND triage_state='running'", (reason[:500], time.time() + 60, report_id, fence))

    def validate_proposal(self, db, proposal):
        validate(proposal, SCHEMA['definitions']['BuildProposal'])
        require(proposal['revision'] == 1, 'New proposals must use revision 1')
        self.validate_context(db, proposal['context'])
        require(len(proposal['source_report_ids']) == 1, 'This bounded adapter accepts exactly one selected source report per proposal')
        source_evidence = {}
        sources = []
        for report_id in proposal['source_report_ids']:
            row = db.execute('SELECT payload FROM reports WHERE id=?', (report_id,)).fetchone()
            require(row, 'Unknown source report reference', 'unknown_reference')
            source = json.loads(row['payload'])
            sources.append(source)
            for e in source['evidence']:
                require(e['id'] not in source_evidence or e == source_evidence[e['id']], 'Ambiguous source evidence ID')
                source_evidence[e['id']] = e
        require(any(proposal['context'] == s['context'] for s in sources), 'Proposal context must match a referenced report')
        evidence = {e['id']: e for e in proposal['evidence']}
        require(len(evidence) == len(proposal['evidence']), 'Duplicate evidence IDs')
        for eid, e in evidence.items():
            require(source_evidence.get(eid) == e, 'Proposal evidence must resolve unchanged to a source report', 'unknown_reference')
        for claim in proposal['claims']:
            require(set(claim['evidence_ids']) <= set(evidence), 'Claim cites unknown evidence', 'unknown_reference')
            if claim['basis'] == 'inspection':
                require(all(evidence[e]['kind'] in {'source_inspection', 'test_receipt'} for e in claim['evidence_ids']), 'User reports cannot establish inspected facts')
        require(len({c['id'] for c in proposal['acceptance_cases']}) == len(proposal['acceptance_cases']), 'Duplicate acceptance case IDs')
        for path in proposal['proposed_files']:
            safe_relative(path)
        return sources

    def _proposal(self, db, proposal, provenance):
        self.validate_proposal(db, proposal)
        row = db.execute('SELECT payload,provenance FROM proposals WHERE id=?', (proposal['id'],)).fetchone()
        if row:
            require(row['payload'] == canonical(proposal) and row['provenance'] == canonical(provenance), 'Proposal ID conflict', 'id_conflict', 409)
            return proposal
        require(db.execute('SELECT COUNT(*) FROM proposal_reports WHERE report_id=?', (proposal['source_report_ids'][0],)).fetchone()[0] < 32,
                'Report proposal capacity reached', 'capacity_reached', 429)
        db.execute('INSERT INTO proposals VALUES (?,?,?,?)', (proposal['id'], canonical(proposal), canonical(provenance), now()))
        for rid in proposal['source_report_ids']:
            generation = db.execute('SELECT generation FROM reports WHERE id=?', (rid,)).fetchone()['generation']
            db.execute('INSERT INTO proposal_reports(proposal_id,report_id,report_generation) VALUES (?,?,?)', (proposal['id'], rid, generation))
        self.event(db, 'proposal_submitted', proposal['id'], provenance)
        return proposal

    def submit_proposal(self, token, proposal):
        self.authorize('worker', token)
        validate(proposal, SCHEMA['definitions']['BuildProposal'])
        proposal = copy.deepcopy(proposal)
        require(isinstance(proposal, dict), 'Expected proposal object')
        # The host adapter owns attribution; model/client declarations confer no authority.
        proposal['origin'] = {'kind': 'sensei', 'actor_ref': 'host_agent:' + self.host_id, 'model_ref': None}
        with self.transaction() as db:
            return self._proposal(db, proposal, {'adapter': 'host_cli', 'host_id': self.host_id, 'model_verified': False})

    def finish_triage(self, report_id, fence, summary, clarification, proposal, provenance):
        text_field(summary, 'AI summary', 1, 4000)
        if clarification is not None:
            text_field(clarification, 'Clarification', 1, 1000)
        with self.transaction() as db:
            row = db.execute('SELECT * FROM reports WHERE id=?', (report_id,)).fetchone()
            require(row and row['triage_state'] == 'running' and row['triage_fence'] == fence and row['triage_until'] > time.time(), 'Triage lease is stale', 'stale_lease', 409)
            require(proposal['source_report_ids'] == [report_id], 'Local triage may reference only its selected report')
            self._proposal(db, proposal, provenance)
            db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?)', (new_id('msg'), report_id, 'sensei', summary + ('\n\n' + clarification if clarification else ''), now(), None))
            db.execute("UPDATE reports SET triage_state='complete',triage_reason='Local model proposal awaits operator review',triage_until=0,status=CASE WHEN status='received' THEN 'looking_into_it' ELSE status END WHERE id=?", (report_id,))

    def queue_list(self, token):
        self.authorize('worker', token)
        with self.connect() as db:
            return {'host_id': self.host_id,
                    'proposals': [dict(r) | {'payload': json.loads(r['payload']), 'provenance': json.loads(r['provenance'])} for r in db.execute('SELECT * FROM proposals ORDER BY created')],
                    'work_orders': [self._order(r) for r in db.execute('SELECT * FROM work_orders ORDER BY rowid')]}

    def selected_report(self, token, report_id):
        self.authorize('worker', token)
        with self.connect() as db:
            row = db.execute('SELECT * FROM reports WHERE id=?', (report_id,)).fetchone()
            require(row, 'Report not found', 'not_found', 404)
            return self._view(db, row)

    def _order(self, row):
        return dict(row) | {'payload': json.loads(row['payload']), 'result': json.loads(row['result']) if row['result'] else None,
                            'completion_relevance': json.loads(row['completion_relevance']) if row['completion_relevance'] else None}

    def work_order(self, token, body):
        self.authorize('operator', token)
        exact(body, ('proposal_id', 'proposal_revision', 'repository', 'base_build', 'permitted_paths', 'permitted_actions', 'test_budget_seconds', 'expires_at'))
        text_field(body['repository'], 'repository', 1, 2000)
        require(type(body['proposal_revision']) is int and body['proposal_revision'] >= 1, 'Proposal revision must be a positive integer')
        require(Path(body['repository']).resolve() == self.root, 'Work order repository must be this configured host checkout')
        require(body['base_build'] == self.build, 'Work order must target current registered build', 'stale_base', 409)
        paths = body['permitted_paths']
        require(isinstance(paths, list) and 1 <= len(paths) <= 64, 'Explicit permitted paths required')
        for path in paths:
            safe_relative(path)
            require((self.root / path).resolve().is_relative_to(self.root), 'Permitted path escapes checkout')
        actions = body['permitted_actions']
        require(isinstance(actions, list) and actions and all(isinstance(a, str) for a in actions) and set(actions) <= {'inspect', 'edit', 'test'}, 'Unsupported action; queue never authorizes release or execution')
        require(type(body['test_budget_seconds']) is int and 0 <= body['test_budget_seconds'] <= 3600, 'Test budget must be 0..3600 seconds')
        require(type(body['expires_at']) in (int, float) and time.time() < body['expires_at'] <= time.time() + 86400, 'Work order expiry must be within 24 hours')
        with self.transaction() as db:
            row = db.execute('SELECT payload FROM proposals WHERE id=?', (body['proposal_id'],)).fetchone()
            require(row and json.loads(row['payload'])['revision'] == body['proposal_revision'], 'Unknown proposal revision')
            require(not db.execute("SELECT 1 FROM work_orders WHERE proposal_id=? AND state IN ('pending','claimed')", (body['proposal_id'],)).fetchone(), 'Proposal already has active work order', 'work_order_conflict', 409)
            generations = {r['report_id']: r['report_generation'] for r in db.execute('SELECT report_id,report_generation FROM proposal_reports WHERE proposal_id=?', (body['proposal_id'],))}
            order = dict(body) | {'id': new_id('work'), 'host_id': self.host_id, 'created_at': now(), 'authority': 'operator_scoped', 'proposal_sha256': digest(json.loads(row['payload'])), 'source_report_generations': generations}
            db.execute("INSERT INTO work_orders(id,proposal_id,payload,state) VALUES (?,?,?,'pending')", (order['id'], body['proposal_id'], canonical(order)))
            for rid, generation in generations.items():
                if type(generation) is int:
                    db.execute("UPDATE reports SET status='preparing_fix' WHERE id=? AND generation=?", (rid, generation))
            self.event(db, 'work_order_issued', order['id'], {'proposal_id': body['proposal_id'], 'host_id': self.host_id})
            return order

    def claim(self, token, worker, seconds=120, work_id=None):
        self.authorize('worker', token)
        text_field(worker, 'worker', 1, 100)
        require(type(seconds) is int and 10 <= seconds <= 600, 'Lease must be 10..600 seconds')
        with self.transaction() as db:
            candidates = db.execute("SELECT * FROM work_orders WHERE (state='pending' OR (state='claimed' AND lease_until<=?)) ORDER BY rowid", (time.time(),)).fetchall()
            for row in candidates:
                if work_id and row['id'] != work_id:
                    continue
                payload = json.loads(row['payload'])
                if payload['expires_at'] <= time.time():
                    db.execute("UPDATE work_orders SET state='expired' WHERE id=?", (row['id'],))
                    continue
                if payload['base_build'] != self.build:
                    db.execute("UPDATE work_orders SET state='stale_base',lease_until=0 WHERE id=?", (row['id'],))
                    self.event(db, 'work_order_stale_base', row['id'])
                    continue
                fence = row['fence'] + 1
                until = min(time.time() + seconds, payload['expires_at'])
                db.execute("UPDATE work_orders SET state='claimed',worker=?,fence=?,lease_until=? WHERE id=?", (worker, fence, until, row['id']))
                self.event(db, 'work_claimed', row['id'], {'worker': worker, 'fence': fence})
                return self._order(db.execute('SELECT * FROM work_orders WHERE id=?', (row['id'],)).fetchone())
            return None

    def _lease(self, db, work_id, worker, fence):
        row = db.execute('SELECT * FROM work_orders WHERE id=?', (work_id,)).fetchone()
        require(row and row['state'] == 'claimed' and row['worker'] == worker and row['fence'] == fence and row['lease_until'] > time.time(), 'Worker lease expired or fencing token is stale', 'stale_lease', 409)
        require(json.loads(row['payload'])['expires_at'] > time.time(), 'Work order expired', 'stale_lease', 409)
        return row

    def heartbeat(self, token, work_id, worker, fence, seconds=120):
        self.authorize('worker', token)
        require(type(seconds) is int and 10 <= seconds <= 600, 'Lease must be 10..600 seconds')
        with self.transaction() as db:
            row = self._lease(db, work_id, worker, fence)
            until = min(time.time() + seconds, json.loads(row['payload'])['expires_at'])
            db.execute('UPDATE work_orders SET lease_until=? WHERE id=?', (until, work_id))
            return {'id': work_id, 'fence': fence, 'lease_until': until}

    def complete(self, token, work_id, worker, fence, result):
        self.authorize('worker', token)
        exact(result, ('base_build', 'candidate_build', 'changed_files', 'reproduction', 'tests', 'artifacts', 'summary'))
        text_field(result['summary'], 'Result summary', 1, 4000)
        validate(result['candidate_build'], SCHEMA['definitions']['LearnerReport']['properties']['context']['properties']['build'])
        exact(result['reproduction'], ('status', 'details'))
        require(result['reproduction']['status'] in {'reproduced', 'not_reproduced', 'blocked'}, 'Invalid reproduction status')
        text_field(result['reproduction']['details'], 'Reproduction details', 1, 4000)
        require(isinstance(result['tests'], list) and len(result['tests']) <= 64, 'Invalid tests list')
        for test in result['tests']:
            exact(test, ('command', 'outcome', 'details'))
            text_field(test['command'], 'Test command', 1, 1000)
            text_field(test['details'], 'Test details', 1, 4000)
            require(test['outcome'] in {'passed', 'failed', 'blocked', 'not_run'}, 'Invalid test outcome')
        require(isinstance(result['artifacts'], list) and len(result['artifacts']) <= 32, 'Invalid artifacts')
        for artifact in result['artifacts']:
            text_field(artifact, 'Artifact reference', 1, 500)
        with self.transaction() as db:
            row = db.execute('SELECT * FROM work_orders WHERE id=?', (work_id,)).fetchone()
            if row and row['state'] == 'completed' and row['worker'] == worker and row['fence'] == fence and row['result'] == canonical(result):
                return self._order(row)
            row = self._lease(db, work_id, worker, fence)
            order = json.loads(row['payload'])
            require(result['base_build'] == order['base_build'], 'Result base differs from work order', 'stale_base', 409)
            files = result['changed_files']
            require(isinstance(files, list) and len(files) <= 64, 'Invalid changed files')
            for path in files:
                safe_relative(path)
                require(any(path == p or path.startswith(p.rstrip('/') + '/') for p in order['permitted_paths']), 'Changed file outside work order scope', 'scope_violation', 403)
            require(not files or 'edit' in order['permitted_actions'], 'Work order does not authorize edits', 'scope_violation', 403)
            require(not files or result['candidate_build']['artifact_sha256'], 'A changed candidate requires artifact identity')
            db.execute("UPDATE work_orders SET state='completed',result=?,lease_until=0 WHERE id=?", (canonical(result), work_id))
            source_generations = order.get('source_report_generations', {})
            relevance = {'current_report_ids': [], 'stale_report_ids': [], 'untracked_report_ids': [],
                         'source_generations': source_generations, 'generations_at_completion': {}}
            reports = db.execute('SELECT r.id,r.generation FROM reports r JOIN proposal_reports p ON p.report_id=r.id WHERE p.proposal_id=?', (row['proposal_id'],)).fetchall()
            for report in reports:
                rid, generation = report['id'], report['generation']
                relevance['generations_at_completion'][rid] = generation
                source_generation = source_generations.get(rid)
                if type(source_generation) is not int:
                    relevance['untracked_report_ids'].append(rid)
                elif source_generation != generation:
                    relevance['stale_report_ids'].append(rid)
                else:
                    db.execute("UPDATE reports SET status='ready_for_review' WHERE id=? AND generation=?", (rid, source_generation))
                    relevance['current_report_ids'].append(rid)
            db.execute('UPDATE work_orders SET completion_relevance=? WHERE id=?', (canonical(relevance), work_id))
            self.event(db, 'worker_result_submitted', work_id, {'verification': 'unverified', 'release': 'not_released', 'completion_relevance': relevance})
            return self._order(db.execute('SELECT * FROM work_orders WHERE id=?', (work_id,)).fetchone())
