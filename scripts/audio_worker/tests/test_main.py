import sys
import time
from pathlib import Path

# Make the audio_worker package importable when running pytest from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main  # noqa: E402


class TestExtractYoutubeId:
    def test_watch_url(self):
        assert main.extract_youtube_id('https://www.youtube.com/watch?v=dQw4w9WgXcQ') == 'dQw4w9WgXcQ'

    def test_short_url(self):
        assert main.extract_youtube_id('https://youtu.be/dQw4w9WgXcQ') == 'dQw4w9WgXcQ'

    def test_embed_url(self):
        assert main.extract_youtube_id('https://youtube.com/embed/dQw4w9WgXcQ') == 'dQw4w9WgXcQ'

    def test_no_id(self):
        assert main.extract_youtube_id('https://example.com/foo') is None


class TestIsValidYoutubeUrl:
    def test_accepts_youtube_hosts(self):
        assert main.is_valid_youtube_url('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
        assert main.is_valid_youtube_url('https://youtu.be/dQw4w9WgXcQ')
        assert main.is_valid_youtube_url('https://music.youtube.com/watch?v=dQw4w9WgXcQ')

    def test_rejects_non_youtube_hosts(self):
        # SSRF guard: arbitrary hosts must be rejected even if they look video-ish.
        assert not main.is_valid_youtube_url('https://evil.com/watch?v=dQw4w9WgXcQ')
        assert not main.is_valid_youtube_url('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')

    def test_rejects_non_http_schemes(self):
        assert not main.is_valid_youtube_url('file:///etc/passwd')
        assert not main.is_valid_youtube_url('ftp://youtube.com/watch?v=dQw4w9WgXcQ')

    def test_rejects_youtube_url_without_video_id(self):
        assert not main.is_valid_youtube_url('https://www.youtube.com/feed/subscriptions')

    def test_rejects_non_string(self):
        assert not main.is_valid_youtube_url(None)
        assert not main.is_valid_youtube_url(12345)


class TestDownloadGuard:
    def test_refuses_non_youtube_url(self, tmp_path):
        import pytest
        with pytest.raises(ValueError):
            main.download_random_youtube_audio('https://evil.com/x', tmp_path / 'out.mp3')


class TestCacheLocks:
    def test_same_key_returns_same_lock(self):
        a = main._get_cache_lock('vid1')
        b = main._get_cache_lock('vid1')
        c = main._get_cache_lock('vid2')
        assert a is b
        assert a is not c


class TestCleanupOldFiles:
    def test_deletes_old_keeps_new(self, tmp_path):
        old = tmp_path / 'old.mp3'
        new = tmp_path / 'new.mp3'
        old.write_text('x')
        new.write_text('y')
        old_time = time.time() - 7200  # 2 hours ago
        import os
        os.utime(old, (old_time, old_time))
        main.cleanup_old_files(tmp_path, max_age_seconds=3600)
        assert not old.exists()
        assert new.exists()

    def test_missing_directory_is_noop(self, tmp_path):
        main.cleanup_old_files(tmp_path / 'does-not-exist', max_age_seconds=1)


class TestEffectsMap:
    def test_every_effect_file_exists(self):
        for effect in main.EFFECTS:
            filename = effect['audioUrl'].split('/')[-1]
            assert (main.EFFECTS_DIR / filename).exists(), f"missing effect file: {filename}"

    def test_ids_are_unique(self):
        ids = [e['id'] for e in main.EFFECTS]
        assert len(ids) == len(set(ids))
