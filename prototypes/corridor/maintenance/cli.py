"""Provider-neutral local adapter. All output is JSON; no operation runs shell commands."""
import argparse
import json
from pathlib import Path
import sys

from local_ai import LocalAI
from store import CLIENT_ROOT, DEFAULT_STATE, MAX_BODY, Problem, Store, canonical, require


def input_json():
    data = sys.stdin.read(MAX_BODY + 1)
    require(len(data) <= MAX_BODY, 'Input exceeds limit')
    try:
        return json.loads(data)
    except ValueError:
        raise Problem('invalid_payload', 'Provide JSON on stdin') from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--source-root', type=Path, default=CLIENT_ROOT)
    parser.add_argument('--app-root', type=Path)
    parser.add_argument('--credential-file', type=Path, help='Private local key file; never a token argument')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('list')
    sub.add_parser('config')
    sub.add_parser('submit-proposal')
    sub.add_parser('create-work-order', help='Operator-only; explicit scope JSON on stdin')
    report = sub.add_parser('report', help='Export exactly one selected report')
    report.add_argument('report_id')
    claim = sub.add_parser('claim')
    claim.add_argument('--worker', required=True)
    claim.add_argument('--seconds', type=int, default=120)
    claim.add_argument('--work-id')
    for command in ('heartbeat', 'complete'):
        item = sub.add_parser(command)
        item.add_argument('work_id')
        item.add_argument('--worker', required=True)
        item.add_argument('--fence', required=True, type=int)
        if command == 'heartbeat':
            item.add_argument('--seconds', type=int, default=120)
    triage = sub.add_parser('triage-once')
    triage.add_argument('--ollama-endpoint', default='http://127.0.0.1:11434')
    triage.add_argument('--ollama-model')
    args = parser.parse_args(argv)
    try:
        require((args.state_dir / 'maintenance.sqlite3').is_file(), 'Start the service once to initialize host state', 'not_initialized', 409)
        role = 'operator' if args.command == 'create-work-order' else 'worker'
        key = args.credential_file or args.state_dir / (role + '.key')
        require(key.is_file() and not key.is_symlink() and key.stat().st_mode & 0o077 == 0, 'Credential file must be private (0600)')
        token = key.read_text().strip()
        store = Store(args.state_dir, args.source_root, asset_root=args.app_root)
        store.authorize(role, token)
        if args.command == 'list':
            result = store.queue_list(token)
        elif args.command == 'config':
            result = {'build': store.build, 'host_id': store.host_id, 'repository': str(store.root)}
        elif args.command == 'report':
            result = store.selected_report(token, args.report_id)
        elif args.command == 'submit-proposal':
            result = store.submit_proposal(token, input_json())
        elif args.command == 'create-work-order':
            result = store.work_order(token, input_json())
        elif args.command == 'claim':
            result = store.claim(token, args.worker, args.seconds, args.work_id)
        elif args.command == 'heartbeat':
            result = store.heartbeat(token, args.work_id, args.worker, args.fence, args.seconds)
        elif args.command == 'complete':
            result = store.complete(token, args.work_id, args.worker, args.fence, input_json())
        else:
            ai = LocalAI(store, args.ollama_endpoint, args.ollama_model)
            result = {'processed': ai.run_once(), 'ai': ai.status}
        print(canonical({'ok': True, 'result': result}))
        return 0
    except (Problem, OSError) as error:
        if isinstance(error, Problem):
            result = {'code': error.code, 'message': error.message}
        else:
            result = {'code': 'host_io_error', 'message': 'Local state or credential is unavailable'}
        print(canonical({'ok': False, 'error': result}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
