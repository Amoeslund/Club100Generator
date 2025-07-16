import sys
import json
import os
import shutil
import subprocess
import tempfile
from gtts import gTTS
from pathlib import Path
import random
from TTS.api import TTS
import base64
import pathlib
import concurrent.futures
import uuid
from server import db, Job
import datetime
from utils import extract_youtube_id, get_youtube_duration
import logging

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

# --- Helper Functions ---
def download_random_youtube_audio(url: str, out_path: Path, start_override: int | None = None) -> None:
    """Download a random 60s audio segment from a YouTube video, with caching."""
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
    # Check cache
    if cache_path and cache_path.exists():
        shutil.copy(cache_path, temp_audio)
    else:
        cmd_dl = ["yt-dlp", "-f", "bestaudio", "-o", str(temp_audio), url]
        subprocess.run(cmd_dl, check=True)
        if cache_path:
            shutil.copy(temp_audio, cache_path)
    cmd_trim = ["ffmpeg", "-y", "-ss", str(start), "-i", str(temp_audio), "-t", "60", "-acodec", "mp3", str(out_path)]
    subprocess.run(cmd_trim, check=True)
    temp_audio.unlink(missing_ok=True)

def generate_tts_with_fade(text: str, lang: str, out_path: Path) -> None:
    """Generate TTS audio with fade in/out and standardize format."""
    if lang == "da":
        tts = gTTS(text=text, lang=lang)
        raw_path = out_path.with_suffix('.raw.mp3')
        tts.save(str(raw_path))
    else:
        if lang == "en":
            model_name = "tts_models/en/ljspeech/tacotron2-DDC"
        else:
            model_name = "tts_models/multilingual/multi-dataset/your_tts"
        tts = TTS(model_name)
        raw_path = out_path.with_suffix('.raw.wav')
        if hasattr(tts, 'is_multi_speaker') and tts.is_multi_speaker:
            speaker = tts.speakers[0]
            if hasattr(tts, 'is_multi_lingual') and tts.is_multi_lingual:
                tts.tts_to_file(text=text, speaker=speaker, language=lang, file_path=str(raw_path))
            else:
                tts.tts_to_file(text=text, speaker=speaker, file_path=str(raw_path))
        elif hasattr(tts, 'is_multi_lingual') and tts.is_multi_lingual:
            tts.tts_to_file(text=text, language=lang, file_path=str(raw_path))
        else:
            tts.tts_to_file(text=text, file_path=str(raw_path))
    cmd_probe = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(raw_path)]
    result = subprocess.run(cmd_probe, capture_output=True, text=True, check=True)
    duration = float(result.stdout.strip())
    if duration > 2.2:
        fade = 1.0
    else:
        fade = min(0.5, duration * 0.1)
    fade_filter = f"afade=t=in:ss=0:d={fade:.2f},afade=t=out:st={max(0, duration-fade):.2f}:d={fade:.2f}"
    faded_path = out_path.with_suffix('.faded.mp3')
    std_path = out_path.with_suffix('.std.mp3')
    cmd_fade = ["ffmpeg", "-y", "-i", str(raw_path), "-af", fade_filter, str(faded_path)]
    fade_proc = subprocess.run(cmd_fade, capture_output=True, text=True)
    if fade_proc.returncode != 0:
        raise Exception(f"ffmpeg fade failed: {fade_proc.stderr}")
    if not faded_path.exists() or faded_path.stat().st_size == 0:
        raise Exception(f"TTS fade output missing: {faded_path}")
    cmd_std = ["ffmpeg", "-y", "-i", str(faded_path), "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k", str(std_path)]
    std_proc = subprocess.run(cmd_std, capture_output=True, text=True)
    if std_proc.returncode != 0:
        raise Exception(f"ffmpeg std re-encode failed: {std_proc.stderr}")
    if not std_path.exists() or std_path.stat().st_size == 0:
        raise Exception(f"TTS std output missing: {std_path}")
    std_path.replace(out_path)
    raw_path.unlink(missing_ok=True)
    faded_path.unlink(missing_ok=True)

def download_songs_parallel(timeline: list, job_dir: Path) -> dict:
    """Download all songs in parallel and return a mapping of index to file path."""
    song_download_tasks = []
    for i, item in enumerate(timeline):
        if item.get('type') == 'song' and 'song' in item:
            song = item['song']
            url = song.get('url')
            start_override = song.get('start')
            song_raw = job_dir / f"song_{i:03d}_raw.mp3"
            song_download_tasks.append((i, url, song_raw, start_override))
    song_download_results = {}
    if song_download_tasks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(download_song_task, args) for args in song_download_tasks]
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result is not None and isinstance(result, tuple) and len(result) == 2:
                    i, song_raw = result
                    if i is not None and song_raw is not None:
                        song_download_results[i] = song_raw
    return song_download_results

def process_timeline_item(args) -> tuple:
    """Process a single timeline item (song, snippet, or effect)."""
    i, item, song_download_results, job_dir = args
    try:
        if item.get('type') == 'song' and 'song' in item:
            song = item['song']
            url = song.get('url')
            song_raw = song_download_results.get(i)
            song_std = job_dir / f"song_{i:03d}.mp3"
            if song_raw and song_raw.exists():
                cmd = ["ffmpeg", "-y", "-i", str(song_raw), "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k", str(song_std)]
                subprocess.run(cmd, check=True)
                song_raw.unlink(missing_ok=True)
                return (i, song_std)
            else:
                logging.error(f"Song download failed for {url}")
                return (i, None)
        elif item.get('type') == 'snippet' and 'snippet' in item:
            snippet = item['snippet']
            snippet_faded = job_dir / f"snippet_{i:03d}.mp3"
            if snippet.get('type') == 'upload' and snippet.get('audioUrl'):
                import re
                audio_url = snippet['audioUrl']
                match = re.match(r'data:audio/\w+;base64,(.*)', audio_url)
                b64data = match.group(1) if match else audio_url
                audio_bytes = base64.b64decode(b64data)
                temp_upload = job_dir / f"snippet_{i:03d}_upload"
                with open(temp_upload, 'wb') as f:
                    f.write(audio_bytes)
                cmd = ["ffmpeg", "-y", "-i", str(temp_upload), "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k", str(snippet_faded)]
                subprocess.run(cmd, check=True)
                temp_upload.unlink(missing_ok=True)
                return (i, snippet_faded)
            else:
                generate_tts_with_fade(snippet["text"], snippet.get("language", "da"), snippet_faded)
                return (i, snippet_faded)
        elif item.get('type') == 'effect' and 'effect' in item:
            effect = item['effect']
            effect_id = effect.get('id')
            effect_meta = EFFECTS_MAP.get(effect_id)
            if effect_meta:
                filename = effect_meta['audioUrl'].split('/')[-1]
                effect_path = EFFECTS_DIR / filename
                if effect_path.exists():
                    effect_copy = job_dir / f"effect_{i:03d}.mp3"
                    shutil.copy(effect_path, effect_copy)
                    return (i, effect_copy)
                else:
                    logging.error(f"Effect file not found: {effect_path}")
                    return (i, None)
            else:
                logging.error(f"Unknown effect id: {effect_id}")
                return (i, None)
    except Exception as e:
        logging.error(f"Error processing item {i}: {e}")
        return (i, None)

def process_audio(data: dict) -> str:
    """Process the timeline and generate the final audio file. Returns output path."""
    timeline = data.get("timeline", [])
    language = data.get("language", "da")
    job_id = str(uuid.uuid4())
    job_dir = Path(tempfile.gettempdir()) / f"club100_{job_id}"
    job_dir.mkdir(exist_ok=True)
    audio_files = []
    try:
        song_download_results = download_songs_parallel(timeline, job_dir)
        item_tasks = [(i, item, song_download_results, job_dir) for i, item in enumerate(timeline)]
        processed_results = {}
        if item_tasks:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(process_timeline_item, args) for args in item_tasks]
                for future in concurrent.futures.as_completed(futures):
                    result = future.result()
                    if result is not None and isinstance(result, tuple) and len(result) == 2:
                        i, out_path = result
                        if i is not None and out_path is not None:
                            processed_results[i] = out_path
        audio_files = []
        for i in range(len(timeline)):
            out_path = processed_results.get(i)
            if out_path and hasattr(out_path, 'exists') and out_path.exists():
                audio_files.append(out_path)
            else:
                logging.warning(f"Skipping item {i} due to processing error")
        concat_list = job_dir / "concat.txt"
        with open(concat_list, "w", encoding="utf-8") as f:
            for af in audio_files:
                if not af.exists() or af.stat().st_size == 0:
                    logging.warning(f"[WARN] File missing or empty before concat: {af}")
                f.write(f"file '{af.as_posix()}'\n")
        output_mp3 = OUTPUT_DIR / f"club100_{job_id}.mp3"
        cmd_concat = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
            "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k", str(output_mp3)
        ]
        subprocess.run(cmd_concat, check=True)
        job = Job(id=job_id, status='done', output_path=str(output_mp3), created_at=datetime.datetime.utcnow())
        db.session.add(job)
        db.session.commit()
        now = datetime.datetime.now()
        for f in CACHE_DIR.glob('*.m4a'):
            if f.stat().st_mtime < (now - datetime.timedelta(days=7)).timestamp():
                f.unlink()
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