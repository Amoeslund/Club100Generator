import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
import server  # noqa: E402


@pytest.fixture
def client():
    server.app.config['TESTING'] = True
    with server.app.test_client() as c:
        yield c


class TestBuildTimelineFromLegacy:
    def test_interleaves_songs_and_snippets(self):
        data = {
            'youtubeUrls': ['u1', 'u2'],
            'snippets': [{'type': 'upload'}],
        }
        timeline = server.build_timeline_from_legacy(data)
        types = [item['type'] for item in timeline]
        assert types == ['song', 'snippet', 'song']
        assert timeline[0]['song']['url'] == 'u1'


class TestEffectsEndpoint:
    def test_lists_effects(self, client):
        resp = client.get('/effects')
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data, list)
        assert any(e['id'] == 'vine_boom' for e in data)


class TestDownloadEndpoint:
    def test_rejects_invalid_job_id(self, client):
        # Path-traversal / non-UUID ids must be rejected before touching the filesystem.
        resp = client.get('/download/..%2f..%2fetc%2fpasswd')
        assert resp.status_code in (400, 404)

    def test_rejects_non_uuid(self, client):
        resp = client.get('/download/not-a-uuid')
        assert resp.status_code == 400

    def test_missing_file_returns_404(self, client):
        resp = client.get('/download/12345678-1234-1234-1234-123456789abc')
        assert resp.status_code == 404


class TestGenerateEndpoint:
    def test_rejects_non_json_body(self, client):
        resp = client.post('/generate', data='not json', content_type='text/plain')
        assert resp.status_code == 400

    @staticmethod
    def events(resp):
        return [json.loads(line) for line in resp.get_data(as_text=True).splitlines()]

    def test_error_response_has_no_traceback(self, client, monkeypatch):
        def boom(_data, **_kwargs):
            raise RuntimeError('kaboom')

        monkeypatch.setattr(server, 'process_audio', boom)
        resp = client.post('/generate', json={'timeline': []})
        assert resp.status_code == 200
        final = self.events(resp)[-1]
        assert final['status'] == 'error'
        assert 'traceback' not in final
        assert final['error'] == 'kaboom'

    def test_streams_progress_then_done(self, client, monkeypatch, tmp_path):
        out = tmp_path / 'out.mp3'
        out.write_bytes(b'x')

        def fake(_data, job_id=None, progress=None):
            progress('process', 1, 2, ['Broken Song'])
            return str(out)

        monkeypatch.setattr(server, 'process_audio', fake)
        events = self.events(client.post('/generate', json={'timeline': []}))
        assert events[0] == {'status': 'processing', 'stage': 'process', 'done': 1, 'total': 2,
                             'skipped': ['Broken Song']}
        assert events[-1]['status'] == 'done'
        assert events[-1]['skipped'] == ['Broken Song']
        assert events[-1]['jobId']


class TestYtSearchEndpoint:
    def test_missing_query(self, client):
        resp = client.post('/ytsearch', json={})
        assert resp.status_code == 400


class TestBestStartEndpoint:
    def test_rejects_non_youtube_url(self, client):
        resp = client.post('/best-start', json={'url': 'https://example.com/watch?v=abcdefghijk'})
        assert resp.status_code == 400

    def test_returns_start(self, client, monkeypatch):
        monkeypatch.setattr(server, 'find_best_start', lambda url: (42, 'heatmap'))
        resp = client.post('/best-start', json={'url': 'https://www.youtube.com/watch?v=abcdefghijk'})
        assert resp.status_code == 200
        assert resp.get_json() == {'start': 42, 'method': 'heatmap'}


class TestImportEffectEndpoint:
    def test_rejects_non_myinstants_url(self, client):
        resp = client.post('/effects/import', json={'url': 'https://evil.com/instant/x/'})
        assert resp.status_code == 400

    def test_rejects_non_instant_page(self, client):
        resp = client.post('/effects/import', json={'url': 'https://www.myinstants.com/en/search/?name=clown'})
        assert resp.status_code == 400


class TestYtSearchOptionInjection:
    def test_query_cannot_inject_options(self, client, monkeypatch):
        seen = {}

        def fake_run(cmd, **kwargs):
            seen['cmd'] = cmd

            class R:
                stdout = ''
            return R()

        monkeypatch.setattr(server.subprocess, 'run', fake_run)
        resp = client.post('/ytsearch', json={'query': '-U'})
        assert resp.status_code == 200
        cmd = seen['cmd']
        assert cmd[-2:] == ['--', '-U']
