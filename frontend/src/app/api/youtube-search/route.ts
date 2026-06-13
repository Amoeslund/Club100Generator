import { NextRequest, NextResponse } from 'next/server';
import {
  Song,
  isQuotaExceededError,
  mapYoutubeApiItems,
  firstNonEmpty,
} from './youtube';

const YT_API_KEY = process.env.NEXT_YOUTUBE_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5001';

async function ytDlpSearch(query: string): Promise<Song[]> {
  const res = await fetch(`${BACKEND_URL}/ytsearch`, {
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
  return mapYoutubeApiItems(data.items);
}

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  // Try the Data API first (if configured), then fall back to yt-dlp. The first
  // method that returns results wins; failures are treated as empty.
  const searches: Promise<Song[]>[] = [];
  if (YT_API_KEY) searches.push(youtubeApiSearch(query));
  searches.push(ytDlpSearch(query));

  const songs = await firstNonEmpty(searches);
  return NextResponse.json(songs);
}
