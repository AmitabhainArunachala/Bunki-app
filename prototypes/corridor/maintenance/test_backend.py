"""Run with python3 -m unittest discover -s maintenance -p 'test_backend.py'. All state is temporary."""
import base64
import copy
import http.client
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from local_ai import LocalAI
from server import MaintenanceServer
from store import Problem, Store, VERSION, allowed_static, now


class BackendTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='bunki-maintenance-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'app'
        self.root.mkdir()
        (self.root / 'index.html').write_text('<h1>Fixture app</h1>')
        self.build = {'git_sha': 'a' * 40, 'artifact_sha256': 'b' * 64}
        self.store = Store(Path(self.temp.name) / 'state', self.root, self.build, ['q2'])
        self.session = self.store.session()
        self.actor = self.session['actor_ref']
        self.worker = (self.store.state / 'worker.key').read_text()
        self.operator = (self.store.state / 'operator.key').read_text()
        self.report = {
            'schema_version': VERSION, 'id': 'report_q2', 'revision': 1, 'created_at': now(),
            'origin': {'kind': 'user', 'actor_ref': self.actor, 'model_ref': None},
            'context': {'app_id': 'bunki', 'surface': 'explanation', 'route': '/',
                        'build': self.build, 'content_ids': ['q2'], 'locale': 'en'},
            'evidence': [{'id': 'evidence_q2', 'kind': 'user_quote', 'summary': '支障 has no reading.', 'artifact_ref': None}],
            'execution_authority': 'none', 'kind': 'learner_report', 'category': 'content',
            'user_words': '点検 has a reading, but 支障 does not.', 'expected': 'Readings for both',
            'actual': 'One reading missing', 'reproduction_steps': ['Open question 2'], 'attachment_ids': []}
        self.envelope = {'idempotency_key': 'stable_report_q2', 'report': self.report, 'attachments': []}

    def intake(self):
        return self.store.intake(self.actor, self.envelope)[0]

    def proposal(self):
        p = {k: copy.deepcopy(self.report[k]) for k in ('schema_version', 'revision', 'created_at', 'context', 'evidence', 'execution_authority')}
        p.update({'id': 'proposal_q2', 'kind': 'build_proposal',
                  'origin': {'kind': 'sensei', 'actor_ref': 'untrusted_claim', 'model_ref': 'unverified'},
                  'source_report_ids': ['report_q2'], 'title': 'Consistent reading coverage',
                  'problem': 'Learner reports a missing reading',
                  'claims': [{'text': 'Reading may be missing', 'basis': 'user_report', 'evidence_ids': ['evidence_q2']}],
                  'proposed_change': 'Review reading coverage in equivalent surfaces',
                  'proposed_files': ['index.html'],
                  'acceptance_cases': [{'id': 'case_q2', 'given': 'Question 2 explanation', 'when': 'Selecting each term', 'then': 'Both readings are accessible'}],
                  'unknowns': ['Not reproduced by a maintainer yet'], 'rollback': 'Revert the scoped candidate', 'requested_action': 'review'})
        return p

    def order(self):
        self.intake()
        self.store.submit_proposal(self.worker, self.proposal())
        return self.store.work_order(self.operator, {
            'proposal_id': 'proposal_q2', 'proposal_revision': 1, 'repository': str(self.root),
            'base_build': self.build, 'permitted_paths': ['index.html'], 'permitted_actions': ['inspect', 'edit', 'test'],
            'test_budget_seconds': 60, 'expires_at': time.time() + 3600})

    def result(self):
        return {'base_build': self.build, 'candidate_build': {'git_sha': None, 'artifact_sha256': 'c' * 64},
                'changed_files': ['index.html'], 'reproduction': {'status': 'reproduced', 'details': 'Fixture reproduced'},
                'tests': [{'command': 'fixture check', 'outcome': 'passed', 'details': 'Both readings accessible'}],
                'artifacts': ['fixture:result'], 'summary': 'Candidate awaiting independent review'}

    def expect_problem(self, code, call):
        with self.assertRaises(Problem) as caught:
            call()
        self.assertEqual(caught.exception.code, code)

    def test_durable_receipt_and_idempotency(self):
        first, created = self.store.intake(self.actor, self.envelope)
        self.assertTrue(created)
        reopened = Store(self.store.state, self.root, self.build, ['q2'])
        actor = reopened.actor(self.session['token'])
        second, created = reopened.intake(actor, self.envelope)
        self.assertFalse(created)
        self.assertEqual(first['receipt'], second['receipt'])
        self.assertEqual(second['status'], 'received')
        self.envelope['report']['user_words'] += ' changed'
        self.expect_problem('idempotency_conflict', lambda: reopened.intake(actor, self.envelope))

    def test_session_cannot_read_other_reports_or_images(self):
        self.intake()
        other = self.store.session()['actor_ref']
        self.assertEqual(self.store.reports(other), {'reports': []})
        self.expect_problem('not_found', lambda: self.store.reports(other, 'report_q2'))
        self.expect_problem('not_found', lambda: self.store.attachment(other, 'report_q2', 'image_q2'))

    def test_forged_actor_authority_unknown_fields_rejected(self):
        for change in ({'execution_authority': 'execute'}, {'status': 'fixed'}, {'origin': {'kind': 'user', 'actor_ref': 'other', 'model_ref': None}}):
            payload = copy.deepcopy(self.envelope)
            payload['report'].update(change)
            self.expect_problem('invalid_payload', lambda: self.store.intake(self.actor, payload))

    def test_unknown_build_and_content_ids_rejected_but_explicit_unknown_build_allowed(self):
        self.report['context']['build'] = {'git_sha': 'f' * 40, 'artifact_sha256': 'e' * 64}
        self.expect_problem('unknown_build', self.intake)
        self.report['context']['build'] = {'git_sha': None, 'artifact_sha256': None}
        self.report['context']['content_ids'] = ['invented']
        self.expect_problem('unknown_content', self.intake)
        self.report['context']['content_ids'] = []
        self.assertEqual(self.intake()['status'], 'received')

    def test_invalid_schema_dates_and_boolean_revision_rejected(self):
        for field, value in [('schema_version', 'v99'), ('created_at', 'yesterday'), ('revision', True)]:
            envelope = copy.deepcopy(self.envelope)
            envelope['report'][field] = value
            self.expect_problem('invalid_payload', lambda: self.store.intake(self.actor, envelope))

    def test_attachment_durable_corruption_and_bounds(self):
        image = b'\x89PNG\r\n\x1a\nfixture'
        self.envelope['attachments'] = [{'id': 'image_q2', 'name': 'capture.png', 'mime_type': 'image/png', 'data_base64': base64.b64encode(image).decode()}]
        self.report['attachment_ids'] = ['image_q2']
        self.report['evidence'].append({'id': 'evidence_image', 'kind': 'screenshot', 'summary': 'Selected screenshot', 'artifact_ref': 'attachment:image_q2'})
        self.intake()
        self.assertEqual(self.store.attachment(self.actor, 'report_q2', 'image_q2')['bytes'], image)
        self.envelope['attachments'][0]['data_base64'] = '!!!'
        self.expect_problem('invalid_attachment', self.intake)
        self.envelope['attachments'][0]['data_base64'] = base64.b64encode(b'not an image').decode()
        self.expect_problem('invalid_payload', self.intake)
        self.envelope['attachments'][0]['data_base64'] = 'a' * 3000000
        self.expect_problem('invalid_payload', self.intake)

    def test_missing_attachment_and_forged_inspection_rejected(self):
        self.report['attachment_ids'] = ['missing_file']
        self.expect_problem('invalid_payload', self.intake)
        self.report['attachment_ids'] = []
        self.report['evidence'][0]['kind'] = 'source_inspection'
        self.expect_problem('invalid_payload', self.intake)

    def test_message_retry_reopen_and_triage_fencing(self):
        self.intake()
        job = self.store.claim_triage()
        body = {'idempotency_key': 'message_same_001', 'text': 'Still happening', 'context': self.report['context']}
        self.store.message(self.actor, 'report_q2', body, reopen=True)
        view = self.store.message(self.actor, 'report_q2', body, reopen=True)
        self.assertEqual(len(view['conversation']), 1)
        self.assertEqual(view['status'], 'received')
        self.expect_problem('stale_lease', lambda: self.store.finish_triage('report_q2', job['fence'], 'Old summary', None, self.proposal(), {}))

    def assert_followup_result_is_stale(self, reopen):
        order = self.order()
        claim = self.store.claim(self.worker, 'old_worker')
        body = {'idempotency_key': 'new_evidence_after_claim', 'text': 'New evidence after worker started.'}
        if reopen:
            body['context'] = self.report['context']
        view = self.store.message(self.actor, 'report_q2', body, reopen=reopen)
        self.assertEqual(view['generation'], 2)
        duplicate = self.store.message(self.actor, 'report_q2', body, reopen=reopen)
        self.assertEqual(duplicate['generation'], 2)
        done = self.store.complete(self.worker, order['id'], 'old_worker', claim['fence'], self.result())
        self.assertEqual(done['state'], 'completed')
        self.assertEqual(done['result'], self.result())
        self.assertEqual(done['completion_relevance']['stale_report_ids'], ['report_q2'])
        self.assertEqual(done['completion_relevance']['current_report_ids'], [])
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'received')
        self.store.complete(self.worker, order['id'], 'old_worker', claim['fence'], self.result())
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'received')

    def test_reopen_keeps_old_completed_result_without_status_promotion(self):
        self.assert_followup_result_is_stale(reopen=True)

    def test_message_keeps_old_completed_result_without_status_promotion(self):
        self.assert_followup_result_is_stale(reopen=False)

    def test_completion_then_followup_returns_received(self):
        order = self.order()
        claim = self.store.claim(self.worker, 'worker')
        self.store.complete(self.worker, order['id'], 'worker', claim['fence'], self.result())
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'ready_for_review')
        self.store.message(self.actor, 'report_q2', {'idempotency_key': 'after_completion_001', 'text': 'Still happening'})
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'received')

    def fresh_order_after_followup(self):
        self.store.message(self.actor, 'report_q2', {'idempotency_key': 'new_generation_for_new_order', 'text': 'New evidence'})
        proposal = self.proposal()
        proposal['id'] = 'proposal_new_evidence'
        self.store.submit_proposal(self.worker, proposal)
        return self.store.work_order(self.operator, {
            'proposal_id': proposal['id'], 'proposal_revision': 1, 'repository': str(self.root),
            'base_build': self.build, 'permitted_paths': ['index.html'], 'permitted_actions': ['inspect', 'edit', 'test'],
            'test_budget_seconds': 60, 'expires_at': time.time() + 3600})

    def test_old_completion_does_not_override_new_active_order(self):
        old = self.order()
        old_claim = self.store.claim(self.worker, 'old_worker')
        fresh = self.fresh_order_after_followup()
        fresh_claim = self.store.claim(self.worker, 'new_worker', work_id=fresh['id'])
        self.store.complete(self.worker, old['id'], 'old_worker', old_claim['fence'], self.result())
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'preparing_fix')
        completed = self.store.complete(self.worker, fresh['id'], 'new_worker', fresh_claim['fence'], self.result())
        self.assertEqual(completed['completion_relevance']['current_report_ids'], ['report_q2'])
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'ready_for_review')

    def test_old_completion_after_new_completion_preserves_new_status(self):
        old = self.order()
        old_claim = self.store.claim(self.worker, 'old_worker')
        fresh = self.fresh_order_after_followup()
        fresh_claim = self.store.claim(self.worker, 'new_worker', work_id=fresh['id'])
        self.store.complete(self.worker, fresh['id'], 'new_worker', fresh_claim['fence'], self.result())
        completed = self.store.complete(self.worker, old['id'], 'old_worker', old_claim['fence'], self.result())
        self.assertEqual(completed['completion_relevance']['stale_report_ids'], ['report_q2'])
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'ready_for_review')

    def test_old_proposal_cannot_promote_report_after_followup(self):
        self.intake()
        self.store.submit_proposal(self.worker, self.proposal())
        self.store.message(self.actor, 'report_q2', {'idempotency_key': 'followup_before_order', 'text': 'New evidence'})
        order = self.store.work_order(self.operator, {
            'proposal_id': 'proposal_q2', 'proposal_revision': 1, 'repository': str(self.root),
            'base_build': self.build, 'permitted_paths': ['index.html'], 'permitted_actions': ['inspect', 'edit', 'test'],
            'test_budget_seconds': 60, 'expires_at': time.time() + 3600})
        self.assertEqual(order['source_report_generations'], {'report_q2': 1})
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'received')

    def test_stale_base_order_does_not_starve_fresh_order(self):
        old = self.order()
        self.store.build = {'git_sha': 'c' * 40, 'artifact_sha256': 'd' * 64}
        proposal = self.proposal()
        proposal['id'] = 'proposal_fresh_base'
        self.store.submit_proposal(self.worker, proposal)
        fresh = self.store.work_order(self.operator, {
            'proposal_id': proposal['id'], 'proposal_revision': 1, 'repository': str(self.root),
            'base_build': self.store.build, 'permitted_paths': ['index.html'], 'permitted_actions': ['inspect'],
            'test_budget_seconds': 60, 'expires_at': time.time() + 3600})
        claimed = self.store.claim(self.worker, 'fresh_worker')
        self.assertEqual(claimed['id'], fresh['id'])
        orders = {r['id']: r for r in self.store.queue_list(self.worker)['work_orders']}
        self.assertEqual(orders[old['id']]['state'], 'stale_base')

    def test_existing_database_migration_keeps_legacy_generation_untracked(self):
        order = self.order()
        claim = self.store.claim(self.worker, 'legacy_worker')
        self.store.message(self.actor, 'report_q2', {'idempotency_key': 'legacy_new_evidence', 'text': 'New evidence'})
        with self.store.transaction() as db:
            db.execute('ALTER TABLE reports DROP COLUMN generation')
            db.execute('ALTER TABLE proposal_reports DROP COLUMN report_generation')
            db.execute('ALTER TABLE work_orders DROP COLUMN completion_relevance')
            payload = json.loads(db.execute('SELECT payload FROM work_orders WHERE id=?', (order['id'],)).fetchone()['payload'])
            del payload['source_report_generations']
            db.execute('UPDATE work_orders SET payload=? WHERE id=?', (json.dumps(payload), order['id']))
        migrated = Store(self.store.state, self.root, self.build, ['q2'])
        self.assertEqual(migrated.reports(self.actor, 'report_q2')['generation'], 2)
        done = migrated.complete(self.worker, order['id'], 'legacy_worker', claim['fence'], self.result())
        self.assertEqual(done['completion_relevance']['untracked_report_ids'], ['report_q2'])
        self.assertEqual(migrated.reports(self.actor, 'report_q2')['status'], 'received')
        Store(self.store.state, self.root, self.build, ['q2'])  # Additive migration is idempotent.

    def test_isolated_unicode_surrogates_rejected_before_storage(self):
        self.report['user_words'] = 'x' * 3999 + '😀'
        self.report['actual'] = 'x' * 3999 + chr(0xD83D)
        self.expect_problem('invalid_payload', self.intake)

    def test_semantic_proposal_refs_and_inspection_promotion(self):
        self.intake()
        for mutation in ('source', 'claim', 'inspection', 'evidence', 'path'):
            p = self.proposal()
            if mutation == 'source':
                p['source_report_ids'] = ['invented_report']
            elif mutation == 'claim':
                p['claims'][0]['evidence_ids'] = ['invented_evidence']
            elif mutation == 'inspection':
                p['claims'][0]['basis'] = 'inspection'
            elif mutation == 'evidence':
                p['evidence'][0]['summary'] = 'Rewritten quotation'
            else:
                p['proposed_files'] = ['../outside.py']
            with self.assertRaises(Problem):
                self.store.submit_proposal(self.worker, p)

    def test_host_attribution_and_proposal_is_not_work_authority(self):
        self.intake()
        p = self.store.submit_proposal(self.worker, self.proposal())
        self.assertTrue(p['origin']['actor_ref'].startswith('host_agent:'))
        self.assertIsNone(p['origin']['model_ref'])
        self.assertIsNone(self.store.claim(self.worker, 'codex'))
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'received')

    def test_operator_required_and_scope_restricted(self):
        self.intake()
        self.store.submit_proposal(self.worker, self.proposal())
        body = {'proposal_id': 'proposal_q2', 'proposal_revision': 1, 'repository': str(self.root),
                'base_build': self.build, 'permitted_paths': ['index.html'], 'permitted_actions': ['edit'],
                'test_budget_seconds': 60, 'expires_at': time.time() + 3600}
        self.expect_problem('unauthorized', lambda: self.store.work_order(self.worker, body))
        body['permitted_actions'] = ['deploy']
        self.expect_problem('invalid_payload', lambda: self.store.work_order(self.operator, body))
        body['permitted_actions'] = ['edit']
        body['repository'] = str(self.root.parent)
        self.expect_problem('invalid_payload', lambda: self.store.work_order(self.operator, body))

    def test_worker_crash_reclaim_and_old_fence_rejection(self):
        order = self.order()
        first = self.store.claim(self.worker, 'codex', 10)
        self.assertIsNone(self.store.claim(self.worker, 'claude'))
        self.store.heartbeat(self.worker, order['id'], 'codex', first['fence'])
        with self.store.transaction() as db:
            db.execute('UPDATE work_orders SET lease_until=0 WHERE id=?', (order['id'],))
        second = self.store.claim(self.worker, 'claude')
        self.assertGreater(second['fence'], first['fence'])
        self.expect_problem('stale_lease', lambda: self.store.heartbeat(self.worker, order['id'], 'codex', first['fence']))
        self.expect_problem('stale_lease', lambda: self.store.complete(self.worker, order['id'], 'codex', first['fence'], self.result()))
        done = self.store.complete(self.worker, order['id'], 'claude', second['fence'], self.result())
        self.assertEqual(done['state'], 'completed')
        self.assertEqual(self.store.complete(self.worker, order['id'], 'claude', second['fence'], self.result()), done)
        self.assertEqual(self.store.reports(self.actor, 'report_q2')['status'], 'ready_for_review')

    def test_concurrent_claim_is_single_owner_and_expired_order_is_skipped(self):
        from concurrent.futures import ThreadPoolExecutor
        order = self.order()
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(lambda worker: self.store.claim(self.worker, worker), ['agent_one', 'agent_two']))
        self.assertEqual(sum(c is not None for c in claims), 1)
        with self.store.transaction() as db:
            row = db.execute('SELECT payload FROM work_orders WHERE id=?', (order['id'],)).fetchone()
            payload = json.loads(row['payload'])
            payload['expires_at'] = time.time() - 1
            db.execute('UPDATE work_orders SET lease_until=0,payload=? WHERE id=?', (json.dumps(payload), order['id']))
        self.assertIsNone(self.store.claim(self.worker, 'agent_three'))

    def test_out_of_scope_result_and_stale_base_rejected(self):
        order = self.order()
        claimed = self.store.claim(self.worker, 'agent')
        result = self.result()
        result['changed_files'] = ['outside.py']
        self.expect_problem('scope_violation', lambda: self.store.complete(self.worker, order['id'], 'agent', claimed['fence'], result))
        result = self.result()
        result['base_build'] = {'git_sha': None, 'artifact_sha256': None}
        self.expect_problem('stale_base', lambda: self.store.complete(self.worker, order['id'], 'agent', claimed['fence'], result))

    def test_completed_result_cannot_claim_released(self):
        order = self.order()
        claimed = self.store.claim(self.worker, 'agent')
        result = self.result()
        result['release'] = 'fixed'
        self.expect_problem('invalid_payload', lambda: self.store.complete(self.worker, order['id'], 'agent', claimed['fence'], result))

    def test_pending_without_model_and_cloud_rejected(self):
        self.intake()
        ai = LocalAI(self.store)
        with patch.object(ai, 'request', return_value={'models': [{'name': 'x:cloud', 'size': 99999999, 'remote_host': 'https://ollama.com'}]}):
            self.assertTrue(ai.run_once())
        view = self.store.reports(self.actor, 'report_q2')
        self.assertEqual(view['triage']['state'], 'pending')
        self.assertEqual(view['status'], 'received')
        self.assertEqual(view['proposals'], [])
        self.assertIn('cloud relay', view['triage']['reason'])

    def test_nonlocal_model_endpoint_rejected(self):
        for endpoint in ('https://api.example.org', 'http://localhost:11434', 'http://127.0.0.1@evil.example', 'http://127.0.0.1:11434/path'):
            self.expect_problem('invalid_payload', lambda: LocalAI(self.store, endpoint))

    def test_model_output_is_host_bound_and_exports_one_report_only(self):
        self.intake()
        other = copy.deepcopy(self.envelope)
        other['idempotency_key'] = 'another_report_002'
        other['report']['id'] = 'report_private'
        other['report']['user_words'] = 'OTHER_PRIVATE_TEXT'
        self.store.intake(self.actor, other)
        ai = LocalAI(self.store)
        proposal = self.proposal()
        fields = ('title', 'problem', 'claims', 'proposed_change', 'proposed_files', 'acceptance_cases', 'unknowns', 'rollback')
        output = {'summary': 'A learner reports missing reading coverage.', 'clarification': None,
                  'proposal': {f: proposal[f] for f in fields}}
        for case in output['proposal']['acceptance_cases']:
            del case['id']
        calls = []
        def request(path, body=None, timeout=3):
            calls.append((path, body))
            if path == '/api/tags':
                return {'models': [{'name': 'local:latest', 'size': 9000000, 'digest': 'actual-model-digest', 'details': {'format': 'gguf'}, 'capabilities': ['completion']}]}
            return {'done': True, 'message': {'content': json.dumps(output)}}
        with patch.object(ai, 'request', side_effect=request):
            self.assertTrue(ai.run_once())
        self.assertNotIn('OTHER_PRIVATE_TEXT', json.dumps(calls))
        view = self.store.reports(self.actor, 'report_q2')
        self.assertEqual(view['triage']['state'], 'complete')
        self.assertEqual(view['proposals'][0]['origin']['model_ref'], 'local:latest')
        self.assertEqual(view['proposals'][0]['source_report_ids'], ['report_q2'])
        self.assertEqual(view['proposals'][0]['execution_authority'], 'none')
        self.assertIsNone(self.store.claim(self.worker, 'agent'))

    def test_malicious_model_claim_does_not_promote_to_inspected_fact(self):
        self.intake()
        ai = LocalAI(self.store)
        p = self.proposal()
        p['claims'][0]['basis'] = 'inspection'
        fields = ('title', 'problem', 'claims', 'proposed_change', 'proposed_files', 'acceptance_cases', 'unknowns', 'rollback')
        output = {'summary': 'Invented inspection', 'clarification': None, 'proposal': {f: p[f] for f in fields}}
        for case in output['proposal']['acceptance_cases']:
            del case['id']
        with patch.object(ai, 'discover', return_value={'name': 'fixture', 'digest': 'fixture'}), patch.object(ai, 'request', return_value={'done': True, 'message': {'content': json.dumps(output)}}):
            ai.run_once()
        view = self.store.reports(self.actor, 'report_q2')
        self.assertEqual(view['triage']['state'], 'pending')
        self.assertEqual(view['conversation'], [])

    def test_static_allowlist_rejects_secrets_symlinks_and_traversal(self):
        (self.root / '.env').write_text('secret')
        (self.root / 'worker.key').write_text('secret')
        (self.root / 'server.py').write_text('private backend')
        (self.root / 'link.js').symlink_to(self.root / 'index.html')
        (self.root / 'actual').mkdir()
        (self.root / 'actual' / 'chunk.js').write_text('public')
        (self.root / 'modules').symlink_to(self.root / 'actual', target_is_directory=True)
        for path in ('.env', 'worker.key', 'server.py', 'link.js', '../index.html', '/index.html'):
            self.assertIsNone(allowed_static(self.root, path))
        self.assertEqual(allowed_static(self.root, 'index.html'), self.root / 'index.html')
        self.assertIsNone(allowed_static(self.root, 'modules/chunk.js'))

    def http_server(self):
        server = MaintenanceServer(('127.0.0.1', 0), self.store, self.root)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def close():
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
        self.addCleanup(close)
        return server

    def test_http_origin_auth_csrf_and_idempotent_protocol(self):
        server = self.http_server()
        def request(method, path, body=None, token=None, origin=None, host=None):
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
            headers = {'Content-Type': 'application/json'}
            if origin is not None:
                headers['Origin'] = origin
            if token:
                headers['Authorization'] = 'Bearer ' + token
            if host:
                headers['Host'] = host
            connection.request(method, path, json.dumps(body) if body is not None else None, headers)
            response = connection.getresponse()
            raw = response.read()
            connection.close()
            return response.status, raw
        self.assertEqual(request('GET', '/api/config')[0], 200)
        self.assertEqual(request('GET', '/api/config', host='evil.example')[0], 403)
        self.assertEqual(request('GET', '/api/config', origin='https://evil.example')[0], 403)
        self.assertEqual(request('POST', '/api/session', {})[0], 403)
        self.assertEqual(request('POST', '/api/session', {}, origin=server.origin)[0], 201)
        self.assertEqual(request('GET', '/api/reports')[0], 401)
        self.assertEqual(request('POST', '/api/reports', self.envelope, self.session['token'], 'https://evil.example')[0], 403)
        first = request('POST', '/api/reports', self.envelope, self.session['token'], server.origin)
        second = request('POST', '/api/reports', self.envelope, self.session['token'], server.origin)
        self.assertEqual(first[0], 201)
        self.assertEqual(second[0], 200)
        self.assertEqual(json.loads(first[1])['receipt'], json.loads(second[1])['receipt'])
        self.assertEqual(request('GET', '/operator.key')[0], 404)
        self.assertEqual(request('GET', '/')[0], 200)

    def test_bind_restriction(self):
        self.expect_problem('invalid_payload', lambda: MaintenanceServer(('0.0.0.0', 0), self.store))


if __name__ == '__main__':
    unittest.main()
