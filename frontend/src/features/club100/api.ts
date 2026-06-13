import { Club100Job, Song, TrackItem, Effect } from './types';
import { BACKEND_URL } from './config';

export async function generateTrack(payload: { timeline: TrackItem[] }): Promise<Club100Job> {
  const res = await fetch(`${BACKEND_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to start generation');
  const data = await res.json();
  return {
    jobId: data.jobId,
    status: 'done', // Python backend is synchronous for now
    downloadUrl: `${BACKEND_URL}/download/${data.jobId}`,
  };
}

export function getDownloadUrl(jobId: string): string {
  return `${BACKEND_URL}/download/${jobId}`;
}

// --- YouTube Search ---
/**
 * Search YouTube for songs via the Next.js `/api/youtube-search` route, which
 * uses the YouTube Data API (if NEXT_YOUTUBE_API_KEY is set) and falls back to yt-dlp.
 * Results are cached in localStorage for 24h.
 */
export async function youtubeSearch(query: string): Promise<Song[]> {
  const cacheKey = 'ytsearch_' + encodeURIComponent(query.trim().toLowerCase());
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { timestamp, results } = JSON.parse(cached);
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          return results;
        }
      } catch {}
    }
  }
  const res = await fetch('/api/youtube-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('Search failed');
  const results = await res.json();
  if (typeof window !== 'undefined') {
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), results }));
  }
  return results;
}

export async function getEffects(): Promise<Effect[]> {
  const res = await fetch(`${BACKEND_URL}/effects`);
  if (!res.ok) throw new Error('Failed to fetch effects');
  return res.json();
}

/** Direct, cacheable URL to an effect's audio file served by the backend. */
export function getEffectAudioUrl(effect: Effect): string {
  return `${BACKEND_URL}${effect.audioUrl}`;
}
