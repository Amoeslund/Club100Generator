import sys
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
EFFECTS_MAP = {e['id']: e for e in EFFECTS}

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Subprocess timeouts (seconds) so a hanging yt-dlp/ffmpeg can't tie up a worker forever.
YTDLP_TIMEOUT = int(os.environ.get("YTDLP_TIMEOUT", "300"))
FFMPEG_TIMEOUT = int(os.environ.get("FFMPEG_TIMEOUT", "180"))

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

def get_youtube_duration(url):
    """Get the duration of a YouTube video in seconds using yt-dlp."""
    cmd = ["yt-dlp", "--get-duration", url]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=YTDLP_TIMEOUT)
    duration_str = result.stdout.strip()
    parts = duration_str.split(":")
    if len(parts) == 3:
        h, m, s = map(int, parts)
        return h * 3600 + m * 60 + s
    elif len(parts) == 2:
        m, s = map(int, parts)
        return m * 60 + s
    else:
        return int(parts[0])

def download_random_youtube_audio(url, out_path, start_override=None):
    """Download a random 60s audio segment from a YouTube video, with caching."""
    if not is_valid_youtube_url(url):
        raise ValueError(f"Refusing to download non-YouTube URL: {url!r}")
    duration = get_youtube_duration(url)
    if duration <= 60:
        start = 0
    else:
        if start_override is not None:
            start = max(0, min(duration - 60, int(start_override)))
        else:
            start = random.randint(0, duration - 60)
    video_id = extract_youtube_id(url)
    cache_path = CACHE_DIR / f"{video_id}.full.m4a" if video_id else None
    temp_audio = out_path.with_suffix('.full.m4a')
    # Serialize downloads of the same video so concurrent entries don't corrupt the cache file.
    lock = _get_cache_lock(video_id or url)
    with lock:
        if cache_path and cache_path.exists():
            shutil.copy(cache_path, temp_audio)
        else:
            cmd_dl = ["yt-dlp", "-f", "bestaudio", "-o", str(temp_audio), url]
            subprocess.run(cmd_dl, check=True, timeout=YTDLP_TIMEOUT)
            if cache_path:
                # Write to a temp file then atomically move into place.
                cache_tmp = cache_path.with_suffix('.m4a.partial')
                shutil.copy(temp_audio, cache_tmp)
                os.replace(cache_tmp, cache_path)
    cmd_trim = ["ffmpeg", "-y", "-ss", str(start), "-i", str(temp_audio), "-t", "60", "-acodec", "mp3", str(out_path)]
    subprocess.run(cmd_trim, check=True, timeout=FFMPEG_TIMEOUT)
    temp_audio.unlink(missing_ok=True)

# --- Main Processing Function ---
def process_audio(data: dict) -> str:
    """Process the timeline and generate the final audio file. Returns output path."""
    timeline = data.get("timeline", [])
    # Bound disk usage: drop stale generated output (1h) and cached downloads (24h).
    cleanup_old_files(OUTPUT_DIR, 60 * 60)
    cleanup_old_files(CACHE_DIR, 24 * 60 * 60)
    job_id = str(uuid.uuid4())
    job_dir = Path(tempfile.gettempdir()) / f"club100_{job_id}"
    job_dir.mkdir(exist_ok=True)
    audio_files = []
    try:
        # 1. Download all songs in parallel first
        song_download_tasks = []
        song_download_results = {}
        for i, item in enumerate(timeline):
            if item.get('type') == 'song' and 'song' in item:
                song = item['song']
                url = song.get('url')
                start_override = song.get('start')
                song_raw = job_dir / f"song_{i:03d}_raw.mp3"
                song_download_tasks.append((i, url, song_raw, start_override))
        def download_song_task(args):
            i, url, song_raw, start_override = args
            try:
                download_random_youtube_audio(url, song_raw, start_override)
                return (i, song_raw)
            except Exception as e:
                print(f"Error downloading {url}: {e}", file=sys.stderr)
                return (i, None)
        if song_download_tasks:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(download_song_task, args) for args in song_download_tasks]
                for future in concurrent.futures.as_completed(futures):
                    result = future.result()
                    if result is not None and isinstance(result, tuple) and len(result) == 2:
                        i, song_raw = result
                        if i is not None and song_raw is not None:
                            song_download_results[i] = song_raw

        # 2. Process all timeline items in parallel (re-encode/generate/copy)
        def process_item_task(args):
            i, item = args
            try:
                if item.get('type') == 'song' and 'song' in item:
                    song = item['song']
                    url = song.get('url')
                    song_raw = song_download_results.get(i)
                    song_std = job_dir / f"song_{i:03d}.mp3"
                    if song_raw and song_raw.exists():
                        cmd = ["ffmpeg", "-y", "-i", str(song_raw), "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k", str(song_std)]
                        subprocess.run(cmd, check=True, timeout=FFMPEG_TIMEOUT)
                        song_raw.unlink(missing_ok=True)
                        return (i, song_std)
                    else:
                        print(f"Song download failed for {url}", file=sys.stderr)
                        return (i, None)
                elif item.get('type') == 'snippet' and 'snippet' in item:
                    snippet = item['snippet']
                    snippet_faded = job_dir / f"snippet_{i:03d}.mp3"
                    if snippet.get('type') == 'upload' and snippet.get('audioUrl'):
                        audio_url = snippet['audioUrl']
                        match = re.match(r'data:audio/\w+;base64,(.*)', audio_url)
                        b64data = match.group(1) if match else audio_url
                        audio_bytes = base64.b64decode(b64data)
                        temp_upload = job_dir / f"snippet_{i:03d}_upload"
                        with open(temp_upload, 'wb') as f:
                            f.write(audio_bytes)
                        cmd = ["ffmpeg", "-y", "-i", str(temp_upload), "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k", str(snippet_faded)]
                        subprocess.run(cmd, check=True, timeout=FFMPEG_TIMEOUT)
                        temp_upload.unlink(missing_ok=True)
                        return (i, snippet_faded)
                    else:
                        print(f"Skipping unsupported snippet (only uploaded audio is supported): {snippet.get('type')}", file=sys.stderr)
                        return (i, None)
                elif item.get('type') == 'effect' and 'effect' in item:
                    effect = item['effect']
                    effect_id = effect.get('id')
                    effect_meta = EFFECTS_MAP.get(effect_id)
                    if effect_meta:
                        filename = effect_meta['audioUrl'].split('/')[-1]
                        effect_path = EFFECTS_DIR / filename
                        if effect_path.exists():
                            # Copy to job dir to avoid file lock issues
                            effect_copy = job_dir / f"effect_{i:03d}.mp3"
                            shutil.copy(effect_path, effect_copy)
                            return (i, effect_copy)
                        else:
                            print(f"Effect file not found: {effect_path}", file=sys.stderr)
                            return (i, None)
                    else:
                        print(f"Unknown effect id: {effect_id}", file=sys.stderr)
                        return (i, None)
            except Exception as e:
                print(f"Error processing item {i}: {e}", file=sys.stderr)
                return (i, None)

        item_tasks = [(i, item) for i, item in enumerate(timeline)]
        processed_results = {}
        if item_tasks:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(process_item_task, args) for args in item_tasks]
                for future in concurrent.futures.as_completed(futures):
                    result = future.result()
                    if result is not None and isinstance(result, tuple) and len(result) == 2:
                        i, out_path = result
                        if i is not None and out_path is not None:
                            processed_results[i] = out_path

        # 3. Collect processed audio files in timeline order
        audio_files = []
        for i in range(len(timeline)):
            out_path = processed_results.get(i)
            if out_path and hasattr(out_path, 'exists') and out_path.exists():
                audio_files.append(out_path)
            else:
                print(f"Skipping item {i} due to processing error", file=sys.stderr)
        concat_list = job_dir / "concat.txt"
        with open(concat_list, "w", encoding="utf-8") as f:
            for af in audio_files:
                if not af.exists() or af.stat().st_size == 0:
                    print(f"[WARN] File missing or empty before concat: {af}", file=sys.stderr)
                f.write(f"file '{af.as_posix()}'\n")
        output_mp3 = OUTPUT_DIR / f"club100_{job_id}.mp3"
        # Re-encode the concatenated audio to ensure valid MP3 output
        cmd_concat = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
            "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k", str(output_mp3)
        ]
        subprocess.run(cmd_concat, check=True, timeout=FFMPEG_TIMEOUT)
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