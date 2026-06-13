from flask import Flask, request, jsonify, send_file
from flask import send_from_directory
import os
import re
import subprocess
import traceback
import pathlib
from main import process_audio, EFFECTS
from flask_cors import CORS

app = Flask(__name__)

# Restrict CORS to configured origins (comma-separated). Defaults to the local dev frontend.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]
CORS(app, origins=ALLOWED_ORIGINS)

# Cap request body size (uploaded snippets arrive as base64 data URLs).
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_CONTENT_LENGTH', str(100 * 1024 * 1024)))

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

@app.route('/effects/<path:filename>', methods=['GET'])
def serve_effect(filename):
    """Serve an effect audio file by filename."""
    return send_from_directory(EFFECTS_DIR, filename)

@app.route('/generate', methods=['POST'])
def generate():
    """Generate audio from a timeline or legacy format."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid or missing JSON body"}), 400
    if 'timeline' not in data:
        data['timeline'] = build_timeline_from_legacy(data)
    try:
        output_path = process_audio(data)
        if not output_path or not os.path.exists(output_path):
            return jsonify({"error": "Audio generation failed, no output file was produced."}), 500
        job_id = os.path.basename(output_path).replace('club100_', '').replace('.mp3', '')
        return jsonify({"jobId": job_id})
    except Exception as e:
        # Log the full traceback server-side, but don't leak internals to the client.
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

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

@app.route('/ytsearch', methods=['POST'])
def ytsearch():
    """Search YouTube for songs using yt-dlp."""
    data = request.get_json(silent=True) or {}
    query = data.get('query')
    if not query or not isinstance(query, str):
        return jsonify({'error': 'Missing query'}), 400
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '--default-search', 'ytsearch5:',
                '--print', '%(id)s\t%(title)s\t%(uploader)s\t%(thumbnail)s',
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