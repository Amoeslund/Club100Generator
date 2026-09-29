"""Find the best 60-second window of a YouTube song.

Primary source is YouTube's "most replayed" heatmap. Viewers drop off over the
course of a video, so a linear trend is removed before picking the peak, and
the first part of the video is ignored (everyone "replays" the start).
Videos without a heatmap fall back to the loudest 60 seconds of the audio.
"""
import json
import subprocess

import numpy as np

from main import FFMPEG_TIMEOUT, YTDLP, YTDLP_TIMEOUT, ensure_cached

CLIP = 60
LEAD_IN = 6  # start a few seconds before the hotspot so the chorus/drop lands
SKIP_FRACTION = 0.08


def _heatmap_start(heatmap, duration):
    ts = np.array([(h['start_time'] + h['end_time']) / 2 for h in heatmap])
    vs = np.array([h['value'] for h in heatmap])
    keep = ts > duration * SKIP_FRACTION
    if keep.sum() < 3:
        return None
    trend = np.polyval(np.polyfit(ts[keep], vs[keep], 1), ts)
    score = np.convolve(np.where(keep, vs - trend, -9), np.ones(3) / 3, 'same')
    return int(ts[np.argmax(score)]) - LEAD_IN


def _loudness_start(url):
    # Same cache file as the generator uses, so a later generate doesn't re-download
    path = ensure_cached(url)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                         capture_output=True, check=True, timeout=FFMPEG_TIMEOUT).stdout
    y = np.frombuffer(raw, np.int16).astype(np.float32)
    per_second = np.sqrt(np.add.reduceat(y ** 2, np.arange(0, len(y), 8000)) / 8000)
    if len(per_second) <= CLIP:
        return 0
    return int(np.argmax(np.convolve(per_second, np.ones(CLIP), 'valid')))


def find_best_start(url):
    """Return (start_seconds, method) for the best 60s clip of a YouTube video."""
    result = subprocess.run(YTDLP + ["--skip-download", "--dump-json", url],
                            capture_output=True, text=True, encoding='utf-8', check=True, timeout=YTDLP_TIMEOUT)
    info = json.loads(result.stdout.strip().splitlines()[-1])
    duration = info.get('duration') or 0
    if duration <= CLIP:
        return 0, 'short'
    start, method = None, 'heatmap'
    if info.get('heatmap'):
        start = _heatmap_start(info['heatmap'], duration)
    if start is None:
        start, method = _loudness_start(url), 'loudness'
    return max(0, min(int(duration - CLIP), start)), method
