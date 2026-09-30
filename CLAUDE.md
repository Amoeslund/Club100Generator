# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Club 100 track generator: a local-only web app that stitches 1-minute YouTube song clips, uploaded/recorded speech snippets and meme sound effects into a single MP3. Two processes must both run:

- `frontend/`: Next.js 15 / React 19 UI (port 3000)
- `scripts/audio_worker/`: Python Flask backend doing all audio work via `yt-dlp` + `ffmpeg` (port 5001)

`ffmpeg`/`ffprobe`, `yt-dlp` and Node must be on PATH. The backend shells out to them directly, and yt-dlp uses Node as its JavaScript runtime for YouTube.

## Commands

Backend (from `scripts/audio_worker/`):
```sh
uv venv --python 3.11 venv
uv pip install --python venv/Scripts/python.exe --exclude-newer <date 3+ days ago> -r requirements-dev.txt
venv/Scripts/python.exe server.py                   # :5001, binds 127.0.0.1, debug off unless FLASK_DEBUG=1
venv/Scripts/python.exe prefetch.py "../../klovne songs med timestamps.txt"   # download a mass-import list into the cache
venv/Scripts/python.exe -m pytest                   # all backend tests
venv/Scripts/python.exe -m pytest tests/test_server.py -k BestStart   # single test class
```

Frontend (from `frontend/`):
```sh
npm install
npm run dev                 # next dev --turbopack, :3000 (/ redirects to /club100)
npm test                    # vitest run
npx vitest run -t parseStartParam   # single test by name
npm run lint
npm run build
```

`.claude/launch.json` has `backend` (venv python) and `frontend` configurations.

Organization policy: any package manager config must require packages to be at least 3 days old (supply-chain protection). `frontend/.npmrc` sets `min-release-age=3`; for uv, pass `--exclude-newer`.

Backend env vars: `ALLOWED_ORIGINS` (CORS, default `http://localhost:3000`), `HOST`, `PORT`, `FLASK_DEBUG`, `MAX_CONTENT_LENGTH`, `YTDLP_TIMEOUT`, `FFMPEG_TIMEOUT`, `CACHE_MAX_AGE_HOURS` (default 168), `SONG_LUFS` (default -12), `SNIPPET_LUFS` (default -10). Frontend: `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:5001`), optional `NEXT_YOUTUBE_API_KEY` in `frontend/.env.local` for the YouTube Data API search path.

## Architecture

### Request flow
- The browser calls the Flask backend directly at `BACKEND_URL` (`frontend/src/features/club100/config.ts`) for `/generate`, `/jobs/<jobId>`, `/download/<jobId>`, `/effects`, `/effects/<file>`, `/effects/import`, `/best-start`. CORS is restricted to `ALLOWED_ORIGINS`.
- YouTube search goes through the Next route `frontend/src/app/api/youtube-search/route.ts` (helpers in `youtube.ts`). It uses the YouTube Data API when a key is set, with the backend's `/ytsearch` (yt-dlp) as fallback. The client caches results in `localStorage` for 24h.

### Timeline contract
The app revolves around an ordered `TrackItem[]` (`types.ts`), each with a stable `id`, POSTed as `{ timeline }` to `/generate`:
- `song`: `{ url, title, start? }`. `start` pins the clip start; otherwise a random 60s window is chosen.
- `snippet`: `{ type: 'upload', audioUrl }`, where `audioUrl` is a base64 `data:` URL (browser recordings/uploads are sent inline). There is no TTS.
- `effect`: `{ id, ... }`; only `id` is used server-side, looked up in `EFFECTS_MAP`.

Pure timeline and import-parsing helpers live in `timeline.ts` (unit tested in `timeline.test.ts`). Mass import lines are either a YouTube URL (a `?t=` start time becomes `song.start`) followed by an optional tab/comma-separated title, or a free-text search query. UI state lives in `Club100Page.tsx`; `TrackTimeline.tsx` is the lazy-loaded dnd-kit timeline.

### Audio pipeline (`scripts/audio_worker/main.py`, `process_audio`)
`/generate` returns 202 with a `jobId` and runs `process_audio` in a background thread; the frontend (`generateTrack` in `api.ts`) polls `GET /jobs/<jobId>` every second for `{status, stage, done, total, skipped}` and `GenerateProgress.tsx` renders it. Jobs live in memory (`JOBS` in `server.py`), so a backend restart loses running jobs.
1. Download all songs in parallel. Only YouTube URLs are accepted (`is_valid_youtube_url`). Full audio is cached by `ensure_cached` as `cache/<videoId>.full.m4a` (per-video locks, atomic writes, mtime refreshed on use), then trimmed to 60s.
2. Process every item in parallel: re-encode songs and decode uploaded snippets with two-pass `loudnorm` (`loudnorm_filter`; songs to `SONG_LUFS`, snippets to `SNIPPET_LUFS`), and copy effects into the job temp dir untouched, so airhorns and the hardbass edit keep their level.
3. Normalize to 44.1kHz stereo 192k MP3 and concat into `output/club100_<uuid>.mp3`.

Failed items are logged and skipped without failing the job; their labels are reported in the job's `skipped` list and shown under the download link. Output files are pruned after 1h and cache files after `CACHE_MAX_AGE_HOURS` without use.

All yt-dlp invocations must go through `YTDLP` in `main.py` (`--js-runtimes node --no-playlist`) and pass a timeout. User-supplied search text goes after `--` so it can't be parsed as a flag.

### Best start time (`best_start.py`, `POST /best-start`)
Picks the best 60s window from YouTube's "most replayed" heatmap. It removes the linear viewer drop-off trend, ignores the first 8% of the video and starts 6s before the hotspot. Videos without a heatmap fall back to the loudest minute of the audio, reusing the generator's cache file.

### Effects
Built-in effects are the `EFFECTS` list in `main.py` plus files in `scripts/audio_worker/effects/`. `POST /effects/import` (`myinstants.py`) takes a myinstants.com instant page, reads its `og:audio` MP3 (browser User-Agent needed because of Cloudflare), saves it as `effects/mi-<slug>.mp3` and persists the entry in `effects/custom_effects.json`, which is merged into `EFFECTS` at startup. To add a built-in effect by hand, drop the MP3 in `effects/` and add an `{id, name, audioUrl: '/effects/<file>'}` entry to `EFFECTS`.
