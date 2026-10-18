"""Record pytest's actual collection and call/teardown outcomes; no stdout inference."""
import hashlib
import json
import os
import pytest
from pathlib import Path
from datetime import datetime, timezone

_receipt = dict(schemaVersion=1, kind='bunki-framework-suite', framework='pytest',
                runId=os.environ.get('KAIRO_GATE_RUN_ID'), version=pytest.__version__, scheduledFiles=[], files=[],
                collected=[], completed=[], errors=[], fullAcceptance=False)
_calls = {}

def pytest_sessionstart(session):
    _receipt['startedAt'] = datetime.now(timezone.utc).isoformat()
    # The corpus's declared `not realdata` is the existing canonical scope.
    o = session.config.option
    narrowers = ('keyword', 'lf', 'ff', 'stepwise', 'maxfail', 'deselect', 'ignore', 'ignore_glob', 'collectonly')
    _receipt['narrowingReasons'] = [key for key in narrowers if getattr(o, key, False)]
    if any('::' in str(argument) for argument in session.config.args):
        _receipt['narrowingReasons'].append('node-id-selection')
    if o.markexpr not in ('', 'not realdata'):
        _receipt['narrowingReasons'].append('marker-selection')
    _receipt['filtered'] = bool(_receipt['narrowingReasons'])

def pytest_collection_finish(session):
    _receipt['collected'] = [dict(id=i.nodeid, file=str(i.path)) for i in session.items]
    paths = sorted(set(str(i.path) for i in session.items))
    _receipt['scheduledFiles'] = paths
    _receipt['files'] = [dict(path=p, sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest()) for p in paths]

def pytest_runtest_logreport(report):
    if report.when == 'call':
        _calls[report.nodeid] = dict(id=report.nodeid, status='passed' if report.passed else report.outcome,
                                   retry=0, expectedFailure=hasattr(report, 'wasxfail'))
    elif report.failed or report.skipped:
        _receipt['errors'].append(report.nodeid + ':' + report.when + ':' + report.outcome)
    if report.when == 'teardown' and report.nodeid in _calls:
        _receipt['completed'].append(_calls.pop(report.nodeid))

def pytest_sessionfinish(session, exitstatus):
    r = _receipt
    expected = [i['id'] for i in r['collected']]
    observed = [i['id'] for i in r['completed']]
    r['fullAcceptance'] = bool(exitstatus == 0 and expected and len(set(expected)) == len(expected)
        and sorted(expected) == sorted(observed) and not r['filtered'] and not r['errors']
        and all(i['status'] == 'passed' and not i['expectedFailure'] for i in r['completed']))
    r['completedAt'] = datetime.now(timezone.utc).isoformat()
    out = Path(os.environ['KAIRO_FRAMEWORK_RECEIPT'])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(r, indent=2) + '\n')
