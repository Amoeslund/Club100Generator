from flask import Flask, request, jsonify, send_file
from flask import send_from_directory
import tempfile
import os
import json
import subprocess
import traceback
import pathlib
import base64
from main import process_audio, EFFECTS
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import datetime

app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///club100.db'
db = SQLAlchemy(app)

EFFECTS_DIR = pathlib.Path(__file__).parent / 'effects'

class Job(db.Model):
    id = db.Column(db.String, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    status = db.Column(db.String)
    output_path = db.Column(db.String)

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

@app.route('/effects/<effect_id>/data', methods=['GET'])
def effect_data(effect_id):
    """Return base64 data URL for a given effect ID."""
    effect = next((e for e in EFFECTS if e['id'] == effect_id), None)
    if not effect:
        return jsonify({'error': 'Effect not found'}), 404
    file_path = EFFECTS_DIR / effect['audioUrl'].split('/')[-1]
    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404
    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    mime = 'audio/mpeg' if file_path.suffix == '.mp3' else 'audio/wav'
    data_url = f'data:{mime};base64,{b64}'
    return jsonify({'dataUrl': data_url})

@app.route('/generate', methods=['POST'])
def generate():
    """Generate audio from a timeline or legacy format."""
    data = request.get_json()
    if 'timeline' not in data:
        data['timeline'] = build_timeline_from_legacy(data)
    try:
        output_path = process_audio(data)
        print(f"DEBUG: output_path = {output_path}")
        if not output_path:
            print("DEBUG: output_path is None or empty!")
            return jsonify({"error": "Audio generation failed, no output file was produced."}), 500
        if not os.path.exists(output_path):
            print(f"DEBUG: File does not exist at {output_path}")
        else:
            print(f"DEBUG: File exists at {output_path}, size: {os.path.getsize(output_path)} bytes")
        job_id = os.path.basename(output_path).replace('club100_', '').replace('.mp3', '')
        print(f"DEBUG: job_id = {job_id}")
        return jsonify({"output": output_path, "jobId": job_id})
    except Exception as e:
        tb = traceback.format_exc()
        print(tb)
        return jsonify({"error": str(e), "traceback": tb}), 500

@app.route('/download/<job_id>', methods=['GET'])
def download(job_id):
    """Download the generated audio file by job ID."""
    output_dir = os.path.join(os.path.dirname(__file__), 'output')
    file_path = os.path.join(output_dir, f'club100_{job_id}.mp3')
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    return send_file(file_path, as_attachment=True)

@app.route('/ytsearch', methods=['POST'])
def ytsearch():
    """Search YouTube for songs using yt-dlp."""
    data = request.get_json()
    query = data.get('query')
    if not query:
        return jsonify({'error': 'Missing query'}), 400
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '--default-search', 'ytsearch5:',
                '--print', '%(id)s\t%(title)s\t%(uploader)s\t%(thumbnail)s',
                query
            ],
            capture_output=True, text=True, check=True
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
                print(song)
                songs.append(song)
        return jsonify(songs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/initdb', methods=['POST'])
def init_db():
    db.create_all()
    return jsonify({'status': 'initialized'})

@app.route('/jobs', methods=['GET'])
def list_jobs():
    jobs = Job.query.order_by(Job.created_at.desc()).all()
    return jsonify([
        {'id': j.id, 'created_at': j.created_at.isoformat(), 'status': j.status, 'output_path': j.output_path}
        for j in jobs
    ])

@app.route('/cache/clear', methods=['POST'])
def clear_cache():
    import shutil
    cache_dir = pathlib.Path(__file__).parent / 'cache'
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
        cache_dir.mkdir(exist_ok=True)
    return jsonify({'status': 'cache cleared'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True) 