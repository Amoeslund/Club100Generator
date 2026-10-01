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

Backend env vars: `ALLOWED_ORIGINS` (CORS, default `http://localhost:3000`), `HOST`, `PORT`, `FLASK_DEBUG`, `MAX_CONTENT_LENGTH`, `YTDLP_TIMEOUT`, `FFMPEG_TIMEOUT`, `CACHE_MAX_AGE_HOURS` (default 168), `SONG_LUFS` (default -12), `SNIPPET_LUFS` (default -10), `WORKERS`, `DOWNLOAD_WORKERS`. Frontend: `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:5001`), optional `NEXT_YOUTUBE_API_KEY` in `frontend/.env.local` for the YouTube Data API search path.

## Architecture

### Request flow
- The browser calls the Flask backend directly at `BACKEND_URL` (`frontend/src/features/club100/config.ts`) for `/generate`, `/clips`, `/clips/<clipId>`, `/songs/<videoId>/audio`, `/songs/<videoId>/peaks`, `/songs/<videoId>/info`, `/download/<jobId>`, `/effects`, `/effects/<file>`, `/effects/import`, `/best-start`. CORS is restricted to `ALLOWED_ORIGINS`.
- YouTube search goes through the Next route `frontend/src/app/api/youtube-search/route.ts` (helpers in `youtube.ts`). It uses the YouTube Data API when a key is set, with the backend's `/ytsearch` (yt-dlp) as fallback. The client caches results in `localStorage` for 24h.

### Timeline contract
The app revolves around an ordered `TrackItem[]` (`types.ts`), each with a stable `id`. It is persisted in IndexedDB (`storage.ts`, DB `club100`, store `kv`, key `trackItems`) and the stored format must stay backward compatible: add optional fields or new item types, never rename or migrate existing ones. `storage.ts` keeps one untouched daily backup (`trackItems.backup.YYYY-MM-DD`, last 3), taken on load and on a session's first save, and `BackupControls.tsx` exports/imports the timeline as JSON.
- `song`: `{ url, title, start?, end? }`. `start` (seconds, 0.1s precision) pins the clip start; otherwise a random start is chosen and then pinned. Optional `end` sets the clip length (shorter or longer than the default 60s, clamped to the video).
- `snippet`: `{ type: 'upload', audioUrl, label? }`, where `audioUrl` is a base64 `data:` URL (browser recordings/uploads are sent inline). There is no TTS.
- `effect`: `{ id, ... }`; only `id` is used server-side, looked up in `EFFECTS_MAP`.
- `section`: `{ title }`, an optional user-added heading of any length. No audio: `audioTimeline()` strips sections before `/generate`, and `process_audio` ignores them too. Songs are numbered (minute 1, 2, ...) across sections.

Pure timeline and import-parsing helpers live in `timeline.ts` (unit tested in `timeline.test.ts`). Mass import lines are either a YouTube URL (a `?t=` start time becomes `song.start`) followed by an optional tab/comma-separated title, or a free-text search query. A song whose title is still its link (`needsTitle`) gets its YouTube title filled in by `Club100Page.tsx` from `GET /songs/<videoId>/info` (`video_title`: oEmbed, yt-dlp fallback). UI state lives in `Club100Page.tsx`; `TrackTimeline.tsx` is the lazy-loaded dnd-kit running order (rows live at module level so they don't remount on every render).

### UI and design
Styles live in `club100.css` as `c100-*` classes with CSS-variable tokens; one typeface (Bricolage Grotesque via `next/font` in `app/layout.tsx`). Colour carries meaning only: song yellow, snippet pink, effect blue, red only for what is playing and what failed. The tool is a generic Club 100 generator, not tied to one party's theme. Layout: running order on the left, a sticky sidebar with the MP3 export, and `TimelinePlayer.tsx` as a big timeline docked at the bottom of the screen (`--dock-h`): transport, current minute, section headings as bands, one block per item sized by length and numbered by minute (label spacing adapts to width), a time ruler; click or drag to scrub. The wheel zooms around the pointer (down to 20s across the track), Shift+wheel or a horizontal swipe pans, double-click or 0 zooms out; while zoomed the view follows the playhead.

### Audio pipeline (`scripts/audio_worker/main.py`, `process_audio`)
`/generate` streams NDJSON progress on the same response (`{status:'processing', stage, done, total, skipped}` lines, then a final `done` with `jobId` or `error`). `process_audio` runs in its own thread so it finishes even if the browser disconnects. `generateTrack` in `api.ts` reads the stream and `GenerateProgress.tsx` renders it. No polling.
1. `ensure_cached` makes sure each song's full audio is in `cache/<videoId>.full.m4a` (per-video locks, atomic writes, mtime refreshed on use; `DOWNLOAD_WORKERS`, default 6). Only YouTube URLs are accepted (`is_valid_youtube_url`).
2. Every item becomes a finished clip in `cache/clips/` via `encode_clip`, encoded exactly once in `CLIP_ENCODE` format (44.1kHz stereo 192k MP3) with `WORKERS` (default CPU count) threads. Songs are trimmed straight from the cache (duration via `ffprobe`, no yt-dlp call) and get two-pass `loudnorm` to `SONG_LUFS`; snippets to `SNIPPET_LUFS`; effects are re-encoded at their own level. Clips are cached by video/start/LUFS, snippet content hash, and effect file mtime, so regenerating an edited timeline only encodes what changed (99 songs: ~60s cold, ~2s warm).
3. The clips are stitched with the concat demuxer and `-c copy` into `output/club100_<uuid>.mp3`.

Failed items are logged and skipped without failing the job; their labels are reported in `skipped` and shown under the download link. Output files are pruned after 1h and cache/clip files after `CACHE_MAX_AGE_HOURS` without use.

All yt-dlp invocations must go through `YTDLP` in `main.py` (`--js-runtimes node --no-playlist`) and pass a timeout. User-supplied search text goes after `--` so it can't be parsed as a flag.

### Clip preview, song editor and player
Every item is prepared as soon as it is added or edited: `useClips.ts` queues `POST /clips` (`build_clip`, max 6 in flight, network errors retried) whenever an item's `clipKey` (`timeline.ts`) changes, and keeps `{status, clipId, duration}` per item id; stale responses are dropped by key. A song without a `start` gets a random one from the backend, which is pinned into the item so the preview and the generated track use the same minute. The "after every song" effect is prepared under the pseudo id `__after-song` and inserted after each song by `buildSegments`, so the preview matches the MP3. `buildSegments` lays out every item (not-ready ones with an estimated length and `status` pending/error, so nothing disappears from the timeline); `TimelinePlayer.tsx` plays the ready ones back to back from `GET /clips/<clipId>` (Range support) and skips the rest (`nextReady`). Only one `<audio>` plays at a time (a capture-phase `play` listener in `Club100Page.tsx`).

`SongEditor.tsx` ("Edit clip") draws the full song's waveform from `GET /songs/<videoId>/peaks` (`song_peaks`, cached as `cache/<id>.peaks.json`) and plays `GET /songs/<videoId>/audio` (the cached full file). Drag the clip window or its edges to set `start`/`end`; changes apply on release and rebuild the clip.

### Best start time (`best_start.py`, `POST /best-start`)
Picks the best 60s window from YouTube's "most replayed" heatmap. It removes the linear viewer drop-off trend, ignores the first 8% of the video and starts 6s before the hotspot. Videos without a heatmap fall back to the loudest minute of the audio, reusing the generator's cache file.

### Effects
Built-in effects are the `EFFECTS` list in `main.py` plus files in `scripts/audio_worker/effects/`. `POST /effects/import` (`myinstants.py`) takes a myinstants.com instant page, reads its `og:audio` MP3 (browser User-Agent needed because of Cloudflare), saves it as `effects/mi-<slug>.mp3` and persists the entry in `effects/custom_effects.json`, which is merged into `EFFECTS` at startup. To add a built-in effect by hand, drop the MP3 in `effects/` and add an `{id, name, audioUrl: '/effects/<file>'}` entry to `EFFECTS`.
