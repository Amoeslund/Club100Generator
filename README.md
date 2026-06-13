# Club 100 Generator

A web app for generating custom Club 100 tracks by combining YouTube songs, snippets, and sound effects.

---

## Features
- Search and add YouTube songs to a timeline
- Add uploaded/recorded audio snippets
- Add meme sound effects (e.g., Vine Boom)
- Mass import songs by URL or title
- Drag-and-drop timeline editing
- Download generated MP3

---

## Project Structure

```
Club100Generator/
  frontend/         # Next.js React frontend
  scripts/
    audio_worker/   # Python backend (Flask)
```

---

## Prerequisites
- **Node.js** (v18+ recommended)
- **Python** (3.9+ recommended)
- **ffmpeg** (must be in your PATH)
- **yt-dlp** (Python package, for YouTube downloads)

---

## Setup Instructions

### 1. Clone the Repository
```sh
git clone <your-repo-url>
cd Club100Generator
```

### 2. Backend Setup (Python)

#### a. Install Python dependencies
```sh
cd scripts/audio_worker
python -m venv venv
venv/Scripts/activate  # On Windows
# or
source venv/bin/activate  # On Mac/Linux
pip install -r requirements.txt  # Install all backend requirements
```

#### b. Install ffmpeg and yt-dlp
- **ffmpeg:** [Download here](https://ffmpeg.org/download.html) and add to your PATH.
- **yt-dlp:**
```sh
pip install yt-dlp
```

#### c. Run the backend server
```sh
python server.py
```
- The backend will run on [http://localhost:5001](http://localhost:5001)

---

### 3. Frontend Setup (Next.js)

```sh
cd frontend
npm install
# or
yarn install
```

#### a. Start the frontend dev server
```sh
npm run dev
# or
yarn dev
```
- The frontend will run on [http://localhost:3000](http://localhost:3000)

---

## Usage
1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. Search for songs, add snippets/effects, arrange your timeline.
3. Click **Generate Track** to create and download your custom MP3.

---

## Notes
- The backend must be running for the frontend to work.
- For YouTube search, the app uses both the YouTube Data API (if API key is set) and yt-dlp fallback.
- Effects are stored in `scripts/audio_worker/effects/`.
- Output MP3s are saved in `scripts/audio_worker/output/` (files older than 1h are auto-pruned; downloads are cached in `cache/` for 24h).

---

## Configuration (environment variables)

### Backend (`scripts/audio_worker/server.py`)
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist (default `http://localhost:3000`).
- `HOST` / `PORT` — bind address/port (default `127.0.0.1:5001`).
- `FLASK_DEBUG` — set to `1` to enable the debugger (local dev only; off by default).
- `MAX_CONTENT_LENGTH` — max request body in bytes (default 100 MB).
- `YTDLP_TIMEOUT` / `FFMPEG_TIMEOUT` — subprocess timeouts in seconds.

### Frontend
- `NEXT_PUBLIC_BACKEND_URL` — base URL of the Python backend (default `http://localhost:5001`).
- `NEXT_YOUTUBE_API_KEY` — optional YouTube Data API v3 key (see below).

---

## Testing

### Backend (pytest)
```sh
cd scripts/audio_worker
pip install -r requirements-dev.txt
pytest
```

### Frontend (vitest)
```sh
cd frontend
npm test
```

---

## Troubleshooting
- **ffmpeg not found:** Make sure ffmpeg is installed and in your PATH.
- **yt-dlp errors:** Ensure yt-dlp is installed in the backend's Python environment.
- **Port conflicts:** Change ports in `server.py` or `frontend/next.config.js` if needed.

---

## License
This project is for educational and personal use. See individual file headers for third-party asset licenses. 

---

## YouTube Data API (Optional)

To enable higher-quality YouTube search (faster and more reliable), you can use the YouTube Data API v3:

1. [Get an API key from Google Cloud Console](https://console.developers.google.com/apis/credentials).
2. In the `frontend` directory, create a file named `.env.local` with the following content:

```
NEXT_YOUTUBE_API_KEY=[YOUR_API_KEY]
```

If this file is not present, the app will fall back to using `yt-dlp` for YouTube search.

--- 