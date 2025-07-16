import { Snippet, Club100Job, Song, TrackItem } from './types';
import type { Effect } from './types';

const PY_BACKEND = 'http://localhost:5001';

// Local fallback for snippets
const SNIPPETS: Record<string, Snippet[]> = {
  da: [
  ],
  en: [],
};

export async function getSnippets(language: string): Promise<Snippet[]> {
  return SNIPPETS[language] || SNIPPETS['da'];
}

export async function generateTrack(payload: {
  timeline: TrackItem[];
  language: string;
}): Promise<Club100Job> {
  const res = await fetch(`${PY_BACKEND}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to start generation');
  const data = await res.json();
  return {
    jobId: data.jobId,
    status: 'done', // Python backend is synchronous for now
    downloadUrl: `${PY_BACKEND}/download/${data.jobId}`,
    workerOutput: data.output,
  };
}

export function getDownloadUrl(jobId: string): string {
  return `${PY_BACKEND}/download/${jobId}`;
}

// --- YouTube Search ---
/**
 * Search YouTube for songs using the Data API v3.
 * Requires NEXT_PUBLIC_YT_API_KEY in .env.local
 */
const CACHE_VERSION = 'v1';

export function clearYoutubeSearchCache() {
  if (typeof window === 'undefined') return;
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('ytsearch_')) {
      localStorage.removeItem(key);
    }
  });
  localStorage.setItem('ytsearch_cache_version', CACHE_VERSION);
}

export async function youtubeSearch(query: string): Promise<Song[]> {
  if (typeof window !== 'undefined') {
    const cacheKey = 'ytsearch_' + encodeURIComponent(query.trim().toLowerCase());
    const cached = localStorage.getItem(cacheKey);
    const cacheVersion = localStorage.getItem('ytsearch_cache_version');
    if (cached && cacheVersion === CACHE_VERSION) {
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
    const cacheKey = 'ytsearch_' + encodeURIComponent(query.trim().toLowerCase());
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), results }));
    localStorage.setItem('ytsearch_cache_version', CACHE_VERSION);
  }
  return results;
}

export async function getEffects(): Promise<Effect[]> {
  const res = await fetch('http://localhost:5001/effects');
  if (!res.ok) throw new Error('Failed to fetch effects');
  return res.json();
}

export async function getEffectDataUrl(effectId: string): Promise<string> {
  const res = await fetch(`http://localhost:5001/effects/${effectId}/data`);
  if (!res.ok) throw new Error('Failed to fetch effect data');
  const data = await res.json();
  return data.dataUrl;
} 