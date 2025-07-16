import { NextRequest, NextResponse } from 'next/server';

// Song type for type safety
interface Song {
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
interface YoutubeApiItem {
  id: YoutubeApiId;
  snippet: YoutubeApiSnippet;
}

const YT_API_KEY = process.env.NEXT_YOUTUBE_API_KEY;

function isQuotaExceededError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'error' in err &&
    typeof (err as { error?: unknown }).error === 'object' &&
    Array.isArray((err as { error?: { errors?: unknown[] } }).error?.errors) &&
    ((err as { error: { errors: { reason?: string }[] } }).error.errors[0]?.reason === 'quotaExceeded')
  );
}

function isYoutubeApiItem(item: unknown): item is YoutubeApiItem {
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

async function ytDlpSearch(query: string): Promise<Song[]> {
  const res = await fetch('http://localhost:5001/ytsearch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('yt-dlp backend failed');
  return res.json();
}

async function youtubeApiSearch(query: string): Promise<Song[]> {
  if (!YT_API_KEY) throw new Error('No API key');
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${YT_API_KEY}`;
  const ytRes = await fetch(url);
  if (!ytRes.ok) {
    const err: unknown = await ytRes.json().catch(() => ({}));
    if (isQuotaExceededError(err)) throw new Error('quotaExceeded');
    throw new Error('YouTube API error');
  }
  const data = await ytRes.json();
  const songs: Song[] = Array.isArray(data.items)
    ? data.items.map((item: unknown) => {
        if (isYoutubeApiItem(item)) {
          return {
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails?.default?.url,
          };
        }
        return null;
      }).filter(Boolean) as Song[]
    : [];
  return songs;
}

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  // Run both searches in parallel, return the first successful result with songs
  const promises: Promise<{ source: string; songs: Song[] }> [] = [];
  if (YT_API_KEY) {
    promises.push(
      youtubeApiSearch(query)
        .then(songs => ({ source: 'youtube', songs }))
        .catch(() => { throw new Error('youtube-failed'); })
    );
  }
  promises.push(
    ytDlpSearch(query)
      .then(songs => ({ source: 'ytdlp', songs }))
      .catch(() => { throw new Error('ytdlp-failed'); })
    );

  try {
    const results = await Promise.any(promises);
    if (results.songs && results.songs.length > 0) {
      return NextResponse.json(results.songs);
    }
    // If first to resolve is empty, wait for the other
    // Remove the resolved promise and await the other
    const remainingPromises = promises.length === 2
      ? promises.filter(p => p !== Promise.resolve(results))
      : promises;
    if (remainingPromises.length > 0) {
      try {
        const other = await Promise.race(remainingPromises);
        if (other.songs && other.songs.length > 0) {
          return NextResponse.json(other.songs);
        }
      } catch {}
    }
    return NextResponse.json([], { status: 200 });
  } catch {
    return NextResponse.json({ error: 'All search methods failed' }, { status: 500 });
  }
} 