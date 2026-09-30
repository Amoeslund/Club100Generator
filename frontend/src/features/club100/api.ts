import { Club100Job, Song, TrackItem, Effect } from './types';
import { BACKEND_URL } from './config';

/**
 * Start a generation job and poll `/jobs/<id>` until it finishes, reporting
 * progress through `onProgress`. Resolves with the finished job.
 */
export async function generateTrack(
  payload: { timeline: TrackItem[] },
  onProgress?: (job: Club100Job) => void,
): Promise<Club100Job> {
  const res = await fetch(`${BACKEND_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to start generation (${res.status} ${res.statusText})`);
  const { jobId } = await res.json();
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const poll = await fetch(`${BACKEND_URL}/jobs/${jobId}`);
    if (!poll.ok) throw new Error(`Lost track of generation job (${poll.status})`);
    const job: Club100Job = await poll.json();
    if (job.status === 'error') throw new Error(job.error || 'Generation failed');
    if (job.status === 'done') return { ...job, downloadUrl: getDownloadUrl(jobId) };
    onProgress?.(job);
  }
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

export async function importMyInstantsEffect(url: string): Promise<Effect> {
  const res = await fetch(`${BACKEND_URL}/effects/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to import effect');
  return data;
}

export async function findBestStart(url: string): Promise<{ start: number; method: string }> {
  const res = await fetch(`${BACKEND_URL}/best-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to find best start');
  return data;
}

/** Direct, cacheable URL to an effect's audio file served by the backend. */
export function getEffectAudioUrl(effect: Effect): string {
  return `${BACKEND_URL}${effect.audioUrl}`;
}
