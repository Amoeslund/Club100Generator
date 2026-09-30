import sys
import time
from pathlib import Path

# Make the audio_worker package importable when running pytest from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

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
            main.song_clip('https://evil.com/x')


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


class TestBestStartHeatmap:
    def test_picks_hotspot_with_lead_in(self):
        from best_start import LEAD_IN, _heatmap_start
        duration = 200
        heatmap = [{'start_time': t, 'end_time': t + 2, 'value': 0.5} for t in range(0, duration, 2)]
        heatmap[0]['value'] = 1.0  # everyone "replays" the start
        for i in (59, 60, 61):  # the real hotspot, centred on 121s
            heatmap[i]['value'] = 1.0
        assert _heatmap_start(heatmap, duration) == 121 - LEAD_IN


class TestDecodeDataUrl:
    def test_mime_with_dash_and_params(self):
        import base64
        payload = base64.b64encode(b'\x00\x01audio').decode()
        for mime in ('audio/mpeg', 'audio/x-m4a', 'audio/webm;codecs=opus', 'application/octet-stream'):
            assert main.decode_data_url(f'data:{mime};base64,{payload}') == b'\x00\x01audio'

    def test_bare_base64(self):
        import base64
        assert main.decode_data_url(base64.b64encode(b'hi').decode()) == b'hi'

    def test_rejects_non_base64_data_url(self):
        with pytest.raises(ValueError):
            main.decode_data_url('data:audio/wav,raw-bytes')


class TestYtdlp:
    def test_no_playlist(self):
        assert '--no-playlist' in main.YTDLP


class TestAddCustomEffect:
    def test_dedupes_and_persists(self, tmp_path, monkeypatch):
        monkeypatch.setattr(main, 'CUSTOM_EFFECTS_FILE', tmp_path / 'custom_effects.json')
        monkeypatch.setattr(main, 'EFFECTS', [])
        monkeypatch.setattr(main, 'EFFECTS_MAP', {})
        first = main.add_custom_effect({'id': 'mi_x', 'name': 'X', 'audioUrl': '/effects/mi-x.mp3'})
        again = main.add_custom_effect({'id': 'mi_x', 'name': 'Other', 'audioUrl': '/effects/other.mp3'})
        assert again is first
        assert len(main.EFFECTS) == 1
        import json
        assert [e['id'] for e in json.loads((tmp_path / 'custom_effects.json').read_text())] == ['mi_x']


class TestLoudnormFilter:
    def _tone(self, tmp_path, filt):
        import subprocess
        path = tmp_path / 'in.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', filt, str(path)], check=True)
        return path

    def test_measures_and_returns_linear_filter(self, tmp_path):
        path = self._tone(tmp_path, 'sine=frequency=300:duration=3,volume=-30dB')
        args = main.loudnorm_filter(path, -12)
        assert args[0] == '-af'
        assert 'loudnorm=I=-12' in args[1] and 'linear=true' in args[1] and 'measured_I=' in args[1]

    def test_silence_leaves_level_unchanged(self, tmp_path):
        path = self._tone(tmp_path, 'anullsrc=r=44100:cl=stereo:d=3')
        assert main.loudnorm_filter(path, -12) == []


class TestClipPipeline:
    def _tone(self, path, seconds, rate=48000, layout='mono'):
        import subprocess
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                        f'sine=frequency=440:duration={seconds}:sample_rate={rate}',
                        '-ac', '1' if layout == 'mono' else '2', str(path)], check=True)
        return path

    def test_encode_clip_is_cached(self, tmp_path, monkeypatch):
        src = self._tone(tmp_path / 'fx.mp3', 1)
        out = tmp_path / 'clip.mp3'
        main.encode_clip(['-i', str(src)], out, None)
        assert out.exists()
        monkeypatch.setattr(main.subprocess, 'run', lambda *a, **k: (_ for _ in ()).throw(AssertionError('re-encoded')))
        assert main.encode_clip(['-i', str(src)], out, None) == out

    def test_process_audio_concats_mixed_formats(self, tmp_path, monkeypatch):
        # Effects in different sample rates/channels must still stitch into one valid MP3.
        monkeypatch.setattr(main, 'CLIP_CACHE_DIR', tmp_path)
        monkeypatch.setattr(main, 'EFFECTS_DIR', tmp_path)
        self._tone(tmp_path / 'a.mp3', 2, 48000, 'mono')
        self._tone(tmp_path / 'b.mp3', 3, 22050, 'stereo')
        monkeypatch.setitem(main.EFFECTS_MAP, 'ta', {'id': 'ta', 'audioUrl': '/effects/a.mp3'})
        monkeypatch.setitem(main.EFFECTS_MAP, 'tb', {'id': 'tb', 'audioUrl': '/effects/b.mp3'})
        seen = []
        out = main.process_audio({'timeline': [
            {'type': 'section', 'section': {'title': 'Intro'}},
            {'type': 'effect', 'effect': {'id': 'ta'}},
            {'type': 'effect', 'effect': {'id': 'nope', 'name': 'Missing'}},
            {'type': 'effect', 'effect': {'id': 'tb'}},
        ]}, progress=lambda *a: seen.append(a))
        assert 4.8 < main.probe_duration(Path(out)) < 5.3
        assert seen[-1][3] == ['Missing']
        Path(out).unlink()


class TestSongClipWindow:
    def _fake_cache(self, tmp_path, monkeypatch, seconds=120):
        import subprocess
        full = tmp_path / 'full.m4a'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'sine=duration={seconds}',
                        '-c:a', 'aac', str(full)], check=True)
        monkeypatch.setattr(main, 'ensure_cached', lambda url: full)
        monkeypatch.setattr(main, 'CLIP_CACHE_DIR', tmp_path)
        return full

    def test_full_minute_keeps_original_cache_name(self, tmp_path, monkeypatch):
        self._fake_cache(tmp_path, monkeypatch)
        clip, start = main.song_clip('https://youtu.be/aaaaaaaaaaa', 41)
        assert start == 41
        assert clip.name == f'song_aaaaaaaaaaa_41_{main.SONG_LUFS:g}.mp3'
        assert 59.5 < main.probe_duration(clip) < 60.5

    def test_end_shortens_clip(self, tmp_path, monkeypatch):
        self._fake_cache(tmp_path, monkeypatch)
        clip, start = main.song_clip('https://youtu.be/aaaaaaaaaaa', 10.5, 40)
        assert start == 10.5
        assert '_29.5s_' in clip.name
        assert 29 < main.probe_duration(clip) < 30.2

    def test_end_before_start_is_ignored(self, tmp_path, monkeypatch):
        self._fake_cache(tmp_path, monkeypatch)
        clip, _ = main.song_clip('https://youtu.be/aaaaaaaaaaa', 30, 5)
        assert 59.5 < main.probe_duration(clip) < 60.5

    def test_peaks(self, tmp_path, monkeypatch):
        self._fake_cache(tmp_path, monkeypatch, seconds=3)
        monkeypatch.setattr(main, 'CACHE_DIR', tmp_path)
        result = main.song_peaks('aaaaaaaaaaa')
        assert 2.9 < result['duration'] < 3.2
        assert len(result['peaks']) in (12, 13)
        assert max(result['peaks']) == 1
        assert main.song_peaks('aaaaaaaaaaa') == result  # cached
