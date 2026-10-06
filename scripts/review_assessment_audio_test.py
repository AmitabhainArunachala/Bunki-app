"""Offline guard tests: synthetic responses never establish media capability."""
import base64
import copy
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

from review_assessment_audio import AudioGuardError, CallBudget, NativeAudioGuard, ROUTES, sha, validate_metadata, require_native_capability, save

MODEL = 'thinkingmachines/inkling:free'
PIN = {'model': MODEL, **ROUTES[MODEL], 'returnedModels': [MODEL, 'thinkingmachines/inkling-20260715']}
AUDIO = b'synthetic fixture bytes'


class GuardTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        base = Path.home() / '.dharma/bunki_assessment/2026-09-23/editorial/native-audio-free/guard-tests'
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.root = Path(self.temp.name)
        self.sent = []

    async def asyncTearDown(self):
        self.temp.cleanup()

    def guard(self, raw=None):
        async def create(**kwargs):
            self.sent.append(kwargs)
            return SimpleNamespace(model_dump=lambda **_: raw if raw is not None else {'model': MODEL, 'provider': 'Thinking Machines', 'usage': {'cost': 0}})
        async def close():
            return None
        client = SimpleNamespace(base_url='https://openrouter.ai/api/v1/', _client=SimpleNamespace(follow_redirects=True), max_retries=2, chat=SimpleNamespace(completions=SimpleNamespace(create=create)), close=close)
        provider = SimpleNamespace(_client_or_raise=lambda: client)
        return NativeAudioGuard(provider, PIN, [{'sha256': sha(AUDIO), 'mediaId': 'synthetic'}], self.root, 'fixture', CallBudget(self.root / 'budget'))

    def request(self):
        return {'model': MODEL, 'messages': [{'role': 'user', 'content': [{'type': 'input_audio', 'input_audio': {'format': 'mp3', 'data': base64.b64encode(AUDIO).decode()}}]}]}

    async def test_exact_provider_zero_prices_no_retries_and_raw_identity(self):
        guard = self.guard()
        await guard.create(**self.request())
        self.assertEqual(guard.client.max_retries, 0)
        self.assertFalse(guard.client._client.follow_redirects)
        self.assertEqual(self.sent[0]['extra_body']['provider'], {'only': ['thinkingmachines/nvfp4'], 'allow_fallbacks': False, 'max_price': {'prompt': 0, 'completion': 0, 'request': 0, 'image': 0}})
        self.assertTrue(guard.identity_verified)
        with self.assertRaises(AudioGuardError):
            await guard.create(**self.request())
        self.assertEqual(len(self.sent), 1)

    async def test_missing_or_substituted_raw_model_provider_and_cost_stop_run(self):
        for index, raw in enumerate([
            {'provider': 'Thinking Machines', 'usage': {'cost': 0}},
            {'model': 'paid-model', 'provider': 'Thinking Machines', 'usage': {'cost': 0}},
            {'model': MODEL, 'provider': 'other', 'usage': {'cost': 0}},
            {'model': MODEL, 'provider': 'Thinking Machines', 'usage': {}},
            {'model': MODEL, 'provider': 'Thinking Machines', 'usage': {'cost': 0.001}},
            {'model': MODEL, 'provider': 'Thinking Machines', 'usage': {'cost': 0, 'cost_details': {'upstream': 0.001}}},
        ]):
            self.root = Path(self.temp.name) / str(index); self.root.mkdir()
            guard = self.guard(raw)
            with self.assertRaises(AudioGuardError):
                await guard.create(**self.request())
            self.assertFalse(guard.identity_verified)
            with self.assertRaises(AudioGuardError):
                guard.budget.update({'requestStem': 'another'})

    async def test_wrong_attachment_or_routing_never_calls_sdk(self):
        for mutate in [lambda r: r.update(model='thinkingmachines/inkling'), lambda r: r.update(extra_body={'models': ['paid']}), lambda r: r.update(messages=[])]:
            request = self.request(); mutate(request)
            with self.assertRaises(AudioGuardError):
                await self.guard().create(**request)
        self.assertEqual(self.sent, [])

    async def test_inline_wav_representation_preserves_bytes_and_refuses_remote_urls(self):
        guard = self.guard()
        request = self.request(); request['messages'][0]['content'] = [{'type': 'audio_url', 'audio_url': {'url': 'https://example.invalid/audio.wav'}}]
        with self.assertRaises(AudioGuardError):
            await guard.create(**request)
        self.assertEqual(self.sent, [])
        request['messages'][0]['content'][0]['audio_url']['url'] = 'data:audio/wav;base64,' + base64.b64encode(AUDIO).decode()
        await guard.create(**request)
        self.assertTrue(guard.identity_verified)

    async def test_custom_base_url_refused_before_request(self):
        provider = SimpleNamespace(_client_or_raise=lambda: SimpleNamespace(base_url='https://other.invalid/api/v1'))
        with self.assertRaises(AudioGuardError):
            NativeAudioGuard(provider, PIN, [], self.root, 'fixture', CallBudget(self.root / 'budget'))

    async def test_quota_429_stops_shared_budget_without_retry(self):
        guard = self.guard()
        class SyntheticQuotaError(Exception):
            status_code = 429
            body = {'error': {'message': 'Synthetic rate limit'}}
        async def fail(**kwargs):
            self.sent.append(kwargs)
            raise SyntheticQuotaError()
        guard.original = fail
        with self.assertRaises(SyntheticQuotaError):
            await guard.create(**self.request())
        self.assertEqual(len(self.sent), 1)
        with self.assertRaises(AudioGuardError):
            guard.budget.update({'requestStem': 'another-model'})

    async def test_successful_zero_cost_transport_without_hearing_cannot_authorize_review(self):
        raw = save(self.root / 'raw.json', {'model': MODEL, 'provider': 'Thinking Machines', 'usage': {'cost': 0}})
        response = save(self.root / 'response.json', {'model': MODEL, 'content': '{"directlyHeardAudio":false,"heardFacts":[],"spokenQuestion":""}'})
        receipt = save(self.root / 'probe.json', {'format': 'kairo-native-audio-capability-probe', 'status': 'completed', 'requestedModel': MODEL,
            'keyProvided': False, 'transcriptProvided': False, 'response': response,
            'guard': {'metadata': PIN, 'rawIdentityAndZeroCostVerified': True, 'baseUrl': 'https://openrouter.ai/api/v1', 'followRedirects': False, 'rawResponse': raw}})
        with self.assertRaisesRegex(AudioGuardError, 'probe-did-not-establish-direct-hearing'):
            require_native_capability(receipt, MODEL)

    async def test_budget_is_serial_and_counts_failed_reservations(self):
        budget = CallBudget(self.root / 'budget')
        for index in range(20):
            stem = str(index); budget.update({'requestStem': stem})
            with self.assertRaises(AudioGuardError):
                budget.update({'requestStem': 'concurrent'})
            budget.update(finished=stem)
        with self.assertRaises(AudioGuardError):
            budget.update({'requestStem': '21st'})

    async def test_metadata_requires_native_audio_exact_tag_and_every_price_zero(self):
        row = {'id': MODEL, 'canonical_slug': 'thinkingmachines/inkling-20260715', 'architecture': {'input_modalities': ['audio']}, 'pricing': {'prompt': '0', 'completion': '0'}}
        endpoint = {'tag': 'thinkingmachines/nvfp4', 'provider_name': 'Thinking Machines', 'model_id': MODEL, 'name': 'Thinking Machines | thinkingmachines/inkling-20260715:free', 'pricing': {'prompt': '0', 'completion': '0'}}
        models = {'data': [row]}; endpoints = {'data': {'id': MODEL, 'architecture': row['architecture'], 'endpoints': [endpoint]}}
        self.assertIn(row['canonical_slug'], validate_metadata(MODEL, models, endpoints)['returnedModels'])
        for mutate in [lambda m, e: m['data'][0]['pricing'].update(audio='0.01'), lambda m, e: e['data']['endpoints'][0].update(tag='other'), lambda m, e: m['data'][0].update(architecture={'input_modalities': ['text']})]:
            m, e = copy.deepcopy(models), copy.deepcopy(endpoints); mutate(m, e)
            with self.assertRaises(AudioGuardError): validate_metadata(MODEL, m, e)


if __name__ == '__main__':
    unittest.main()
