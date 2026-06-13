// Pure helpers for the YouTube search route, extracted so they can be unit tested
// without spinning up the Next.js request pipeline.

export interface Song {
  url: string;
  title: string;
  artist?: string;
  thumbnail?: string;
}

interface YoutubeApiId {
  videoId: string;
}
interface YoutubeApiSnippet {
  title: string;
  channelTitle: string;
  thumbnails?: { default?: { url?: string } };
}
export interface YoutubeApiItem {
  id: YoutubeApiId;
  snippet: YoutubeApiSnippet;
}

export function isQuotaExceededError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'error' in err &&
    typeof (err as { error?: unknown }).error === 'object' &&
    Array.isArray((err as { error?: { errors?: unknown[] } }).error?.errors) &&
    (err as { error: { errors: { reason?: string }[] } }).error.errors[0]?.reason === 'quotaExceeded'
  );
}

export function isYoutubeApiItem(item: unknown): item is YoutubeApiItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    typeof (item as { id?: unknown }).id === 'object' &&
    (item as { id: { videoId?: string } }).id?.videoId !== undefined &&
    'snippet' in item &&
    typeof (item as { snippet?: unknown }).snippet === 'object' &&
    (item as { snippet: { title?: string; channelTitle?: string } }).snippet?.title !== undefined &&
    (item as { snippet: { title?: string; channelTitle?: string } }).snippet?.channelTitle !== undefined
  );
}

/** Map a raw YouTube Data API `items` array into our Song shape. */
export function mapYoutubeApiItems(items: unknown): Song[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item: unknown): Song | null => {
      if (isYoutubeApiItem(item)) {
        return {
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.default?.url,
        };
      }
      return null;
    })
    .filter((s): s is Song => s !== null);
}

/**
 * Resolve to the first non-empty result list, in priority order. Rejected
 * promises are treated as empty. Returns [] if nothing produced results.
 *
 * (Replaces the previous broken `Promise.any` + identity-filter logic.)
 */
export async function firstNonEmpty<T>(promises: Promise<T[]>[]): Promise<T[]> {
  const settled = await Promise.all(promises.map(p => p.then(v => v).catch(() => [] as T[])));
  for (const result of settled) {
    if (result.length > 0) return result;
  }
  return [];
}
