from flask import Flask, Response, request, jsonify, send_file
from flask import send_from_directory
import json
import os
import queue
import re
import subprocess
import tempfile
import threading
import traceback
import uuid
import pathlib
from main import process_audio, build_clip, probe_duration, ensure_cached, song_peaks, CLIP_CACHE_DIR, EFFECTS, YTDLP, is_valid_youtube_url
from myinstants import import_myinstants
from best_start import find_best_start
from flask_cors import CORS

app = Flask(__name__)

# Restrict CORS to configured origins (comma-separated). Defaults to the local dev frontend.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]
CORS(app, origins=ALLOWED_ORIGINS)

# Cap request body size (uploaded snippets arrive as base64 data URLs).
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_CONTENT_LENGTH', str(2 * 1024 * 1024 * 1024)))

EFFECTS_DIR = pathlib.Path(__file__).parent / 'effects'

def build_timeline_from_legacy(data):
    """Convert legacy youtubeUrls/snippets format to timeline format."""
    timeline = []
    youtube_urls = data.get('youtubeUrls', [])
    snippets = data.get('snippets', [])
    i = 0
    while i < max(len(youtube_urls), len(snippets)):
        if i < len(youtube_urls):
            timeline.append({'type': 'song', 'song': {'url': youtube_urls[i], 'title': f'Song {i+1}'}})
        if i < len(snippets):
            timeline.append({'type': 'snippet', 'snippet': snippets[i]})
        i += 1
    return timeline

@app.route('/effects', methods=['GET'])
def list_effects():
    """List all available effects."""
    return jsonify(EFFECTS)

@app.route('/effects/import', methods=['POST'])
def import_effect():
    """Import a sound effect from a myinstants.com instant page URL."""
    url = (request.get_json(silent=True) or {}).get('url', '')
    if not isinstance(url, str):
        return jsonify({'error': 'Missing url'}), 400
    try:
        effect, created = import_myinstants(url)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception:
        print(traceback.format_exc())
        return jsonify({'error': 'Import from myinstants failed'}), 502
    return jsonify(effect), 201 if created else 200

@app.route('/effects/<path:filename>', methods=['GET'])
def serve_effect(filename):
    """Serve an effect audio file by filename."""
    return send_from_directory(EFFECTS_DIR, filename)

@app.route('/generate', methods=['POST'])
def generate():
    """Generate audio from a timeline (or legacy format), streaming progress as NDJSON.

    Each line is a JSON event: {"status": "processing", "stage", "done", "total", "skipped"} while
    working, then a final {"status": "done", "jobId", "skipped"} or {"status": "error", "error"}.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid or missing JSON body"}), 400
    if 'timeline' not in data:
        data['timeline'] = build_timeline_from_legacy(data)
    job_id = str(uuid.uuid4())
    events: queue.Queue = queue.Queue()
    state = {'skipped': []}

    def progress(stage, done, total, skipped):
        state['skipped'] = skipped
        events.put({'status': 'processing', 'stage': stage, 'done': done, 'total': total, 'skipped': skipped})

    def run():
        try:
            output_path = process_audio(data, job_id=job_id, progress=progress)
            if not output_path or not os.path.exists(output_path):
                events.put({'status': 'error', 'error': 'Audio generation failed, no output file was produced.'})
            else:
                events.put({'status': 'done', 'jobId': job_id, 'skipped': state['skipped']})
        except Exception as e:
            # Log the full traceback server-side, but don't leak internals to the client.
            print(traceback.format_exc())
            events.put({'status': 'error', 'error': str(e)})

    # Run outside the response generator so the job finishes even if the browser disconnects.
    threading.Thread(target=run, daemon=True).start()

    def stream():
        while True:
            event = events.get()
            yield json.dumps(event) + '\n'
            if event['status'] != 'processing':
                return

    return Response(stream(), mimetype='application/x-ndjson', headers={'X-Accel-Buffering': 'no'})


def _clip_error(e: Exception) -> str:
    """Short, user-facing reason a clip failed (full details go to the server log)."""
    if isinstance(e, subprocess.TimeoutExpired):
        return f"{e.cmd[0]} timed out"
    if isinstance(e, subprocess.CalledProcessError):
        tool = e.cmd[0] if isinstance(e.cmd, list) else 'command'
        return f"{tool} failed (exit {e.returncode}); the video may be unavailable or region-locked"
    if isinstance(e, (ValueError, FileNotFoundError)):
        return str(e)
    return 'Clip preparation failed'


@app.route('/clips', methods=['POST'])
def prepare_clip():
    """Build (or reuse) the finished clip for one timeline item, so the UI can preview it.

    Body: {"item": TrackItem}. Returns {"clipId", "duration", "start"?}.
    """
    item = (request.get_json(silent=True) or {}).get('item')
    if not isinstance(item, dict):
        return jsonify({'error': 'Missing item'}), 400
    try:
        with tempfile.TemporaryDirectory(prefix='club100_clip_') as scratch:
            clip, info = build_clip(item, pathlib.Path(scratch))
        return jsonify({'clipId': clip.name, 'duration': probe_duration(clip), **info})
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({'error': _clip_error(e)}), 422


@app.route('/clips/<clip_id>', methods=['GET'])
def serve_clip(clip_id):
    """Serve a prepared clip (supports Range requests so the player can seek)."""
    if not re.fullmatch(r'[\w.-]+\.mp3', clip_id):
        return jsonify({'error': 'Invalid clip id'}), 400
    return send_from_directory(CLIP_CACHE_DIR, clip_id, mimetype='audio/mpeg', max_age=3600)


@app.route('/songs/<video_id>/audio', methods=['GET'])
def song_audio(video_id):
    """Full cached audio of a song, for picking start/end in the song editor (Range supported)."""
    if not re.fullmatch(r'[\w-]{11}', video_id):
        return jsonify({'error': 'Invalid video id'}), 400
    try:
        path = ensure_cached(f'https://www.youtube.com/watch?v={video_id}')
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({'error': _clip_error(e)}), 422
    return send_file(path, mimetype='audio/mp4', conditional=True, max_age=3600)


@app.route('/songs/<video_id>/peaks', methods=['GET'])
def song_waveform(video_id):
    """Waveform overview of a song: {duration, bucketsPerSecond, peaks}."""
    if not re.fullmatch(r'[\w-]{11}', video_id):
        return jsonify({'error': 'Invalid video id'}), 400
    try:
        return jsonify(song_peaks(video_id))
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({'error': _clip_error(e)}), 422


@app.route('/download/<job_id>', methods=['GET'])
def download(job_id):
    """Download the generated audio file by job ID."""
    # job_id is a UUID; reject anything else to avoid path traversal.
    if not re.fullmatch(r'[0-9a-fA-F-]{36}', job_id):
        return jsonify({"error": "Invalid job id"}), 400
    output_dir = os.path.join(os.path.dirname(__file__), 'output')
    file_path = os.path.join(output_dir, f'club100_{job_id}.mp3')
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    return send_file(file_path, as_attachment=True)

@app.route('/best-start', methods=['POST'])
def best_start():
    """Find the best 60s start time for a YouTube song."""
    url = (request.get_json(silent=True) or {}).get('url')
    if not is_valid_youtube_url(url):
        return jsonify({'error': 'Missing or invalid YouTube url'}), 400
    try:
        start, method = find_best_start(url)
    except Exception:
        print(traceback.format_exc())
        return jsonify({'error': 'Could not find a start time'}), 500
    return jsonify({'start': start, 'method': method})

@app.route('/ytsearch', methods=['POST'])
def ytsearch():
    """Search YouTube for songs using yt-dlp."""
    data = request.get_json(silent=True) or {}
    query = data.get('query')
    if not query or not isinstance(query, str):
        return jsonify({'error': 'Missing query'}), 400
    try:
        result = subprocess.run(
            YTDLP + [
                '--default-search', 'ytsearch5:',
                '--print', '%(id)s\t%(title)s\t%(uploader)s\t%(thumbnail)s',
                '--',  # end of options: a query starting with '-' must not be parsed as a yt-dlp flag
                query
            ],
            capture_output=True, text=True, check=True, timeout=120
        )
        lines = result.stdout.strip().split('\n')
        songs = []
        for line in lines:
            parts = line.split('\t')
            if len(parts) >= 2:
                song = {
                    'url': f'https://www.youtube.com/watch?v={parts[0]}',
                    'title': parts[1],
                    'artist': parts[2] if len(parts) > 2 else '',
                    'thumbnail': parts[3] if len(parts) > 3 else ''
                }
                songs.append(song)
        return jsonify(songs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # debug defaults off; opt in with FLASK_DEBUG=1 for local development only.
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5001'))
    app.run(host=host, port=port, debug=debug)