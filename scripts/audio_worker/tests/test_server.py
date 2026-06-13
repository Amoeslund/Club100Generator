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

    def test_error_response_has_no_traceback(self, client, monkeypatch):
        def boom(_data):
            raise RuntimeError('kaboom')

        monkeypatch.setattr(server, 'process_audio', boom)
        resp = client.post('/generate', json={'timeline': []})
        assert resp.status_code == 500
        body = resp.get_json()
        assert 'traceback' not in body
        assert body['error'] == 'kaboom'


class TestYtSearchEndpoint:
    def test_missing_query(self, client):
        resp = client.post('/ytsearch', json={})
        assert resp.status_code == 400
