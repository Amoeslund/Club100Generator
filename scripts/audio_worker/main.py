import sys
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
import random
import array
import base64
import pathlib
import concurrent.futures
import uuid

EFFECTS_DIR = pathlib.Path(__file__).parent / 'effects'
EFFECTS = [
    {
        'id': 'vine_boom',
        'name': 'Vine Boom',
        'audioUrl': '/effects/vine-boom.mp3',
    },
    {
        'id': 'vine_boom_spam',
        'name': 'Vine Boom Spam',
        'audioUrl': '/effects/vine-boom-spam.mp3',
    },
    {
        'id': 'sus_meme_sound',
        'name': 'Sus meme sound',
        'audioUrl': '/effects/sus-meme-sound.mp3',
    },
    {
        'id': 'sexy_sax',
        'name': 'Sexy Sax',
        'audioUrl': '/effects/sexy-sax.mp3',
    },
    {
        'id': 'mlg_airhorn',
        'name': 'MLG Airhorn',
        'audioUrl': '/effects/mlg_airhorn.mp3',
    },
    {
        'id': 'fart',
        'name': 'Fart',
        'audioUrl': '/effects/fart.mp3',
    },
    {
        'id': 'among_us_role_reveal',
        'name': 'Among Us Role Reveal',
        'audioUrl': '/effects/among-us-role-reveal.mp3',
    },
    {
        'id': 'anime_wow',
        'name': 'Anime Wow',
        'audioUrl': '/effects/anime-wow.mp3',
    },
    {
        'id': 'pew_pew',
        'name': 'Pew Pew',
        'audioUrl': '/effects/pew-pew.mp3',
    },
    {
        'id': 'rizz',
        'name': 'Rizz Sound Effect',
        'audioUrl': '/effects/rizz.mp3',
    },
    {
        'id': 'discord_notification',
        'name': 'Discord Notification',
        'audioUrl': '/effects/discord-notification.mp3',
    },
    {
        'id': 'spongebob_fail',
        'name': 'SpongeBob Fail',
        'audioUrl': '/effects/spongebob-fail.mp3',
    },
    {
        'id': 'metal_pipe_clang',
        'name': 'Metal Pipe Clang',
        'audioUrl': '/effects/metal-pipe-clang.mp3',
    },
    {
        'id': 'flashbang',
        'name': 'Flashbang',
        'audioUrl': '/effects/flashbang.mp3',
    },
    {
        'id': 'fart_button',
        'name': 'Fart Button',
        'audioUrl': '/effects/fart-button.mp3',
    },
    {
        'id': 'gayy_echo',
        'name': 'GAYY ECHO',
        'audioUrl': '/effects/gayy-echo.mp3',
    },
    {
        'id': 'punch',
        'name': 'Punch Sound',
        'audioUrl': '/effects/punch.mp3',
    },
    {
        'id': 'error_sounds',
        'name': 'Error SOUNDSS',
        'audioUrl': '/effects/error-sounds.mp3',
    },
    {
        'id': 'bone_crack',
        'name': 'Bone Crack',
        'audioUrl': '/effects/bone-crack.mp3',
    },
    {
        'id': 'ding',
        'name': 'Ding Sound Effect',
        'audioUrl': '/effects/ding.mp3',
    },
    {
        'id': 'dun_dun_dunnnnnnnn',
        'name': 'Dun Dun Dunnnnnnnn',
        'audioUrl': '/effects/dun-dun-dunnnnnnnn.mp3',
    },
    {
        'id': 'undertaker_bell',
        'name': 'The Undertaker Bell',
        'audioUrl': '/effects/undertaker-bell.mp3',
    },
    {
        'id': 'death_sound_fortnite',
        'name': 'Death Sound (Fortnite)',
        'audioUrl': '/effects/death-sound-fortnite.mp3',
    },
    {
        'id': 'a_few_moments_later',
        'name': 'A Few Moments Later (SpongeBob)',
        'audioUrl': '/effects/a-few-moments-later.mp3',
    },
    {
        'id': 'asian_meme_huh',
        'name': 'Asian Meme Huh?',
        'audioUrl': '/effects/asian-meme-huh.mp3',
    },
    {
        'id': 'goofy_ahh_car_horn',
        'name': 'Goofy Ahh Car Horn',
        'audioUrl': '/effects/goofy-ahh-car-horn.mp3',
    },
    {
        'id': 'taco_bell_bong',
        'name': 'Taco Bell Bong',
        'audioUrl': '/effects/taco-bell-bong.mp3',
    },
    {
        'id': 'apple_pay',
        'name': 'Apple Pay Sound',
        'audioUrl': '/effects/apple-pay.mp3',
    },
    {
        'id': 'fart_meme',
        'name': 'Fart Meme Sound',
        'audioUrl': '/effects/fart-meme.mp3',
    },
    {
        'id': 'galaxy_meme',
        'name': 'Galaxy Meme',
        'audioUrl': '/effects/galaxy-meme.mp3',
    },
    {
        'id': 'discord_call',
        'name': 'Discord Call',
        'audioUrl': '/effects/discord-call.mp3',
    },
    {
        'id': '999_social_credit_siren',
        'name': '999 Social Credit Siren',
        'audioUrl': '/effects/999-social-credit-siren.mp3',
    },
    {
        'id': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'name': 'Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'audioUrl': '/effects/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3',
    },
    {
        'id': 'aww',
        'name': 'Aww',
        'audioUrl': '/effects/aww.mp3',
    },
    {
        'id': 'chalo',
        'name': 'Chalo',
        'audioUrl': '/effects/chalo.mp3',
    },
    {
        'id': 'gopgopgop',
        'name': 'GopGopGop',
        'audioUrl': '/effects/gopgopgop.mp3',
    },
    {
        'id': 'hub_intro_sound',
        'name': 'Hub Intro Sound',
        'audioUrl': '/effects/hub-intro-sound.mp3',
    },
    {
        'id': 'mac_quack',
        'name': 'Mac Quack',
        'audioUrl': '/effects/mac-quack.mp3',
    },
    {
        'id': 'door_knocking',
        'name': 'Door Knocking',
        'audioUrl': '/effects/door-knocking.mp3',
    },
    # Add more effects here as needed
]
# Effects imported at runtime (e.g. from myinstants) are persisted here
CUSTOM_EFFECTS_FILE = EFFECTS_DIR / 'custom_effects.json'
if CUSTOM_EFFECTS_FILE.exists():
    EFFECTS.extend(json.loads(CUSTOM_EFFECTS_FILE.read_text(encoding='utf-8')))
EFFECTS_MAP = {e['id']: e for e in EFFECTS}
# Guards EFFECTS/EFFECTS_MAP and custom_effects.json against concurrent imports (Flask is threaded).
CUSTOM_EFFECTS_LOCK = threading.RLock()

def add_custom_effect(effect):
    """Register a new effect and persist it to custom_effects.json.

    Returns the registered effect; if one with the same id already exists, that one is returned unchanged.
    """
    with CUSTOM_EFFECTS_LOCK:
        existing = EFFECTS_MAP.get(effect['id'])
        if existing:
            return existing
        custom = []
        if CUSTOM_EFFECTS_FILE.exists():
            custom = json.loads(CUSTOM_EFFECTS_FILE.read_text(encoding='utf-8'))
        custom.append(effect)
        tmp = CUSTOM_EFFECTS_FILE.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(custom, indent=2, ensure_ascii=False), encoding='utf-8')
        os.replace(tmp, CUSTOM_EFFECTS_FILE)
        EFFECTS.append(effect)
        EFFECTS_MAP[effect['id']] = effect
        return effect

# yt-dlp needs a JavaScript runtime to solve YouTube's challenges; Node is used here.
# --no-playlist: a watch URL carrying &list= (e.g. copied from a Mix) must resolve to just that video.
YTDLP = ["yt-dlp", "--js-runtimes", "node", "--no-playlist"]

def decode_data_url(data_url: str) -> bytes:
    """Decode a base64 data URL (any MIME type, with or without parameters) or a bare base64 string."""
    match = re.match(r'data:[^,]*;base64,(.*)', data_url, re.S)
    if match:
        return base64.b64decode(match.group(1))
    if data_url.startswith('data:'):
        raise ValueError('Only base64-encoded data URLs are supported')
    return base64.b64decode(data_url)

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
# Finished, loudness-normalized clips keyed by source/start/target, so re-generating an edited
# timeline only encodes the items that changed.
CLIP_CACHE_DIR = CACHE_DIR / "clips"
CLIP_CACHE_DIR.mkdir(exist_ok=True)
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)
# Downloaded songs are kept this long after their last use (prefetch a setlist days ahead of a party).
CACHE_MAX_AGE_HOURS = float(os.environ.get("CACHE_MAX_AGE_HOURS", str(7 * 24)))

# Subprocess timeouts (seconds) so a hanging yt-dlp/ffmpeg can't tie up a worker forever.
YTDLP_TIMEOUT = int(os.environ.get("YTDLP_TIMEOUT", "300"))
FFMPEG_TIMEOUT = int(os.environ.get("FFMPEG_TIMEOUT", "180"))

# Loudness targets (integrated LUFS). Songs are levelled so clips from different uploads sit at the
# same volume; snippets a bit louder so recorded speech cuts through. Effects are left untouched.
SONG_LUFS = float(os.environ.get("SONG_LUFS", "-12"))
SNIPPET_LUFS = float(os.environ.get("SNIPPET_LUFS", "-10"))
TRUE_PEAK_DB = -1.0

# Every clip is encoded once, in this exact format, so the final concat can stream-copy.
CLIP_ENCODE = ["-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k"]
# ffmpeg work is CPU bound; downloads are network bound and YouTube gets grumpy past a handful.
WORKERS = int(os.environ.get("WORKERS", str(os.cpu_count() or 4)))
DOWNLOAD_WORKERS = int(os.environ.get("DOWNLOAD_WORKERS", "6"))

def loudnorm_filter(src, target_lufs: float) -> list[str]:
    """ffmpeg args for two-pass (linear) loudness normalization to `target_lufs`.

    `src` is a file path or a list of ffmpeg input args (e.g. ['-ss', '30', '-t', '60', '-i', path]).
    Returns [] if the input can't be measured (e.g. silence or too short), so encoding falls back to
    leaving the level unchanged.
    """
    inputs = src if isinstance(src, list) else ["-i", str(src)]
    base = f"loudnorm=I={target_lufs}:TP={TRUE_PEAK_DB}:LRA=11"
    probe = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", *inputs, "-af", f"{base}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, timeout=FFMPEG_TIMEOUT,
    )
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", probe.stderr)
    if probe.returncode != 0 or not match:
        return []
    m = json.loads(match.group(0))
    if not all(re.fullmatch(r"-?\d+(\.\d+)?", str(m.get(k, ""))) for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")):
        return []  # -inf for silent input
    return ["-af", (f"{base}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
                    f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")]

# Per-video locks so two timeline entries with the same URL don't race on the cache file.
_cache_locks_guard = threading.Lock()
_cache_locks: dict[str, threading.Lock] = {}

def _get_cache_lock(key: str) -> threading.Lock:
    with _cache_locks_guard:
        lock = _cache_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _cache_locks[key] = lock
        return lock

def cleanup_old_files(directory: Path, max_age_seconds: int):
    """Delete files in a directory older than max_age_seconds to bound disk usage."""
    now = time.time()
    try:
        for f in directory.iterdir():
            try:
                if f.is_file() and now - f.stat().st_mtime > max_age_seconds:
                    f.unlink(missing_ok=True)
            except OSError:
                pass
    except FileNotFoundError:
        pass

# --- Helper Functions ---
def extract_youtube_id(url):
    """Extract the YouTube video ID from a URL."""
    patterns = [
        r"(?:v=|youtu\.be/|youtube\.com/embed/)([\w-]{11})",
        r"youtube\.com/watch\?v=([\w-]{11})"
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None

def is_valid_youtube_url(url) -> bool:
    """Only allow real YouTube URLs through to yt-dlp (guards against SSRF / arbitrary fetches)."""
    if not isinstance(url, str):
        return False
    if not re.match(r"^https?://", url):
        return False
    host = re.sub(r"^https?://", "", url).split("/")[0].split(":")[0].lower()
    allowed = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
    return host in allowed and extract_youtube_id(url) is not None

def probe_duration(path: Path) -> float:
    """Duration of a local media file in seconds."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True, timeout=FFMPEG_TIMEOUT,
    )
    return float(result.stdout.strip())

def ensure_cached(url) -> Path:
    """Return the cached full audio for a YouTube URL, downloading it first if needed."""
    if not is_valid_youtube_url(url):
        raise ValueError(f"Refusing to download non-YouTube URL: {url!r}")
    video_id = extract_youtube_id(url)
    cache_path = CACHE_DIR / f"{video_id}.full.m4a"
    # Serialize downloads of the same video so concurrent entries don't corrupt the cache file.
    with _get_cache_lock(video_id):
        if cache_path.exists():
            os.utime(cache_path)  # mark as recently used so cleanup keeps it
        else:
            # Download to a temp name, then atomically move into place.
            partial = cache_path.with_suffix('.m4a.partial')
            subprocess.run(YTDLP + ["-f", "bestaudio", "-o", str(partial), url], check=True, timeout=YTDLP_TIMEOUT)
            os.replace(partial, cache_path)
    return cache_path

def encode_clip(inputs: list[str], out: Path, target_lufs: float | None) -> Path:
    """Encode `inputs` to `out` in CLIP_ENCODE format, loudness-normalized unless target_lufs is None.

    Cached: an existing `out` is reused. Writes atomically so a crash never leaves a half clip.
    """
    with _get_cache_lock(out.name):
        if out.exists():
            os.utime(out)
            return out
        af = loudnorm_filter(inputs, target_lufs) if target_lufs is not None else []
        partial = out.with_name(out.name + ".partial")
        subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, *af, *CLIP_ENCODE, "-f", "mp3", str(partial)],
                       check=True, timeout=FFMPEG_TIMEOUT)
        os.replace(partial, out)
    return out

CLIP_SECONDS = 60

def song_clip(url, start_override=None, end=None) -> tuple[Path, float]:
    """Normalized clip of a YouTube video: 60s from `start_override` (or a random start).

    An optional `end` (seconds into the video) shortens the clip; it never makes it longer than
    CLIP_SECONDS. Starts keep 0.1s precision. Returns (clip path, start second actually used).
    """
    if not is_valid_youtube_url(url):
        raise ValueError(f"Refusing to download non-YouTube URL: {url!r}")
    full = ensure_cached(url)
    duration = probe_duration(full)
    wanted_start = None if start_override is None else round(float(start_override), 1)
    length = CLIP_SECONDS
    if end is not None and wanted_start is not None and float(end) > wanted_start:
        length = min(CLIP_SECONDS, round(float(end) - wanted_start, 1))
    if duration <= length:
        start = 0
    elif wanted_start is not None:
        start = max(0, min(int(duration) - length, wanted_start))
    else:
        start = random.randint(0, int(duration) - CLIP_SECONDS)
    # Full-length clips keep their original cache name, so existing clips are reused.
    suffix = "" if length == CLIP_SECONDS else f"_{length:g}s"
    clip = CLIP_CACHE_DIR / f"song_{extract_youtube_id(url)}_{start:g}{suffix}_{SONG_LUFS:g}.mp3"
    return encode_clip(["-ss", f"{start:g}", "-t", f"{length:g}", "-i", str(full)], clip, SONG_LUFS), start

def audio_mimetype(path: Path) -> str:
    """Real container type of a cached download. yt-dlp's bestaudio is usually WebM/Opus even
    though the cache file is named .m4a, and browsers need the right type to play and seek."""
    with open(path, "rb") as f:
        head = f.read(12)
    if head.startswith(bytes.fromhex("1a45dfa3")):  # EBML header (WebM/Matroska)
        return "audio/webm"
    if head[4:8] == b"ftyp":
        return "audio/mp4"
    if head.startswith(b"OggS"):
        return "audio/ogg"
    return "application/octet-stream"

def song_peaks(video_id: str, buckets_per_second: int = 4) -> dict:
    """Waveform overview of a cached song: {duration, peaks[0..1]} at `buckets_per_second`."""
    cache_path = ensure_cached(f"https://www.youtube.com/watch?v={video_id}")
    peaks_path = CACHE_DIR / f"{video_id}.peaks.json"
    # Keyed by source size: the cache file's mtime is refreshed on every use, so it can't be compared.
    source_size = cache_path.stat().st_size
    if peaks_path.exists():
        cached = json.loads(peaks_path.read_text(encoding="utf-8"))
        if cached.get("sourceSize") == source_size and cached.get("bucketsPerSecond") == buckets_per_second:
            os.utime(peaks_path)
            return {k: v for k, v in cached.items() if k != "sourceSize"}
    rate = 2000
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(cache_path), "-ac", "1", "-ar", str(rate), "-f", "s16le", "-"],
        capture_output=True, check=True, timeout=FFMPEG_TIMEOUT,
    ).stdout
    samples = array.array("h", pcm[: len(pcm) - len(pcm) % 2])
    step = rate // buckets_per_second
    raw = [max(map(abs, samples[i:i + step]), default=0) for i in range(0, len(samples), step)]
    top = max(raw, default=0) or 1
    result = {"duration": len(samples) / rate, "bucketsPerSecond": buckets_per_second,
              "peaks": [round(v / top, 3) for v in raw]}
    tmp = peaks_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({**result, "sourceSize": source_size}), encoding="utf-8")
    os.replace(tmp, peaks_path)
    return result

def snippet_clip(audio_bytes: bytes, scratch_dir: Path) -> Path:
    """Normalized clip of an uploaded/recorded snippet, cached by content hash."""
    digest = hashlib.sha256(audio_bytes).hexdigest()[:20]
    clip = CLIP_CACHE_DIR / f"snippet_{digest}_{SNIPPET_LUFS:g}.mp3"
    if clip.exists():
        os.utime(clip)
        return clip
    upload = scratch_dir / f"upload_{digest}"
    upload.write_bytes(audio_bytes)
    return encode_clip(["-i", str(upload)], clip, SNIPPET_LUFS)

def effect_clip(effect_path: Path) -> Path:
    """Effect re-encoded to the clip format at its original level (no loudnorm)."""
    clip = CLIP_CACHE_DIR / f"effect_{effect_path.stem}_{int(effect_path.stat().st_mtime)}.mp3"
    return encode_clip(["-i", str(effect_path)], clip, None)

def build_clip(item: dict, scratch_dir: Path) -> tuple[Path, dict]:
    """Finished clip for one timeline item. Returns (clip path, info), where info carries
    the song start actually used so a random start can be pinned by the caller."""
    kind = item.get('type')
    if kind == 'song' and isinstance(item.get('song'), dict):
        clip, start = song_clip(item['song'].get('url'), item['song'].get('start'), item['song'].get('end'))
        return clip, {'start': start}
    if kind == 'snippet' and isinstance(item.get('snippet'), dict):
        snippet = item['snippet']
        if snippet.get('type') != 'upload' or not snippet.get('audioUrl'):
            raise ValueError(f"unsupported snippet type {snippet.get('type')!r}")
        return snippet_clip(decode_data_url(snippet['audioUrl']), scratch_dir), {}
    if kind == 'effect' and isinstance(item.get('effect'), dict):
        effect_meta = EFFECTS_MAP.get(item['effect'].get('id'))
        if not effect_meta:
            raise ValueError(f"unknown effect id {item['effect'].get('id')!r}")
        effect_path = EFFECTS_DIR / effect_meta['audioUrl'].split('/')[-1]
        if not effect_path.exists():
            raise FileNotFoundError(effect_path)
        return effect_clip(effect_path), {}
    raise ValueError(f"unknown item type {kind!r}")

# --- Main Processing Function ---
def item_label(i: int, item: dict) -> str:
    """Human-readable label for a timeline item, used in progress and skip reports."""
    kind = item.get('type')
    if kind == 'song':
        return (item.get('song') or {}).get('title') or f"Song #{i + 1}"
    if kind == 'effect':
        effect = item.get('effect') or {}
        return effect.get('name') or effect.get('id') or f"Effect #{i + 1}"
    return f"{kind or 'Item'} #{i + 1}"


def process_audio(data: dict, job_id: str | None = None, progress=None) -> str:
    """Process the timeline and generate the final audio file. Returns output path.

    `progress(stage, done, total, skipped)` is called as work completes, where
    stage is 'download', 'process' or 'concat' and skipped lists item labels.
    """
    # Sections are UI-only headings without audio; drop them before numbering anything.
    timeline = [item for item in data.get("timeline", []) if item.get('type') != 'section']
    skipped: list[str] = []

    def report(stage, done, total):
        if progress:
            progress(stage, done, total, list(skipped))

    # Bound disk usage: drop stale generated output (1h) and unused cached audio.
    cleanup_old_files(OUTPUT_DIR, 60 * 60)
    cleanup_old_files(CACHE_DIR, CACHE_MAX_AGE_HOURS * 60 * 60)
    cleanup_old_files(CLIP_CACHE_DIR, CACHE_MAX_AGE_HOURS * 60 * 60)
    job_id = job_id or str(uuid.uuid4())
    job_dir = Path(tempfile.gettempdir()) / f"club100_{job_id}"
    job_dir.mkdir(exist_ok=True)
    try:
        # 1. Make sure every song's full audio is in the cache (network bound, instant when cached).
        urls = list(dict.fromkeys(
            item['song'].get('url') for item in timeline
            if item.get('type') == 'song' and isinstance(item.get('song'), dict)
        ))

        def fetch(url):
            try:
                ensure_cached(url)
            except Exception as e:
                print(f"Error downloading {url}: {e}", file=sys.stderr)

        report('download', 0, len(urls))
        with concurrent.futures.ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
            for done, _ in enumerate(concurrent.futures.as_completed(executor.submit(fetch, u) for u in urls), 1):
                report('download', done, len(urls))

        # 2. Build a normalized clip per item (CPU bound, cached per song/start, snippet and effect).
        clips: dict[int, Path] = {}
        report('process', 0, len(timeline))
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = {executor.submit(lambda it: build_clip(it, job_dir)[0], item): i for i, item in enumerate(timeline)}
            for done, future in enumerate(concurrent.futures.as_completed(futures), 1):
                i = futures[future]
                try:
                    clips[i] = future.result()
                except Exception as e:
                    print(f"Skipping item {i}: {e}", file=sys.stderr)
                    skipped.append(item_label(i, timeline[i]))
                report('process', done, len(timeline))

        # 3. Stitch in timeline order. All clips share CLIP_ENCODE, so the MP3 frames are copied as-is.
        report('concat', 0, 1)
        concat_list = job_dir / "concat.txt"
        with open(concat_list, "w", encoding="utf-8") as f:
            for i in sorted(clips):
                f.write(f"file '{clips[i].as_posix()}'\n")
        output_mp3 = OUTPUT_DIR / f"club100_{job_id}.mp3"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(concat_list),
                        "-c", "copy", str(output_mp3)], check=True, timeout=FFMPEG_TIMEOUT)
        return str(output_mp3)
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py <input.json>")
        sys.exit(1)
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = json.load(f)
    output_path = process_audio(data)
    print(output_path) 