import { Song, Snippet, Effect, Section, TrackItem, AudioItem } from './types';

// Pure, framework-free helpers for building and manipulating the timeline.
// Kept separate from React components so they can be unit tested in isolation.

let _counter = 0;

/** Generate a stable, unique id for a track item. */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  _counter += 1;
  return `item-${Date.now()}-${_counter}`;
}

export function songItem(song: Song): TrackItem {
  return { id: makeId(), type: 'song', song };
}
export function snippetItem(snippet: Snippet): TrackItem {
  return { id: makeId(), type: 'snippet', snippet };
}
export function effectItem(effect: Effect): TrackItem {
  return { id: makeId(), type: 'effect', effect };
}
export function sectionItem(section: Section): TrackItem {
  return { id: makeId(), type: 'section', section };
}

export function isAudioItem(item: TrackItem): item is AudioItem {
  return item.type !== 'section';
}

/** The timeline as sent to the backend: sections are UI-only and carry no audio. */
export function audioTimeline(items: TrackItem[]): AudioItem[] {
  return items.filter(isAudioItem);
}

/** Title of the section an item belongs to (the nearest section above it), if any. */
export function sectionAt(items: TrackItem[], idx: number): string | null {
  for (let i = idx; i >= 0; i--) {
    const item = items[i];
    if (item?.type === 'section') return item.section.title || 'Untitled section';
  }
  return null;
}

/** Ensure every item has an id (migrates timelines persisted before ids existed). */
export function ensureIds(items: Partial<TrackItem>[]): TrackItem[] {
  return items.map(item => (item.id ? (item as TrackItem) : ({ ...item, id: makeId() } as TrackItem)));
}

/** Insert a new song after the last existing song, or at the end if there are none. */
export function addSong(items: TrackItem[], song: Song): TrackItem[] {
  let idx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === 'song') {
      idx = i;
      break;
    }
  }
  const next = [...items];
  next.splice(idx + 1, 0, songItem(song));
  return next;
}

/** Insert an item immediately after the given index. */
export function insertAfter(items: TrackItem[], item: TrackItem, idx: number): TrackItem[] {
  const next = [...items];
  next.splice(idx + 1, 0, item);
  return next;
}

export function removeAt(items: TrackItem[], idx: number): TrackItem[] {
  return items.filter((_, i) => i !== idx);
}

export function moveItem(items: TrackItem[], from: number, to: number): TrackItem[] {
  if (to < 0 || to >= items.length || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function updateAt(items: TrackItem[], idx: number, item: TrackItem): TrackItem[] {
  if (idx < 0 || idx >= items.length) return items;
  const next = [...items];
  next[idx] = item;
  return next;
}

/** Insert a copy of `effect` after every song in the timeline. */
export function injectAutoEffect<T extends TrackItem>(items: T[], effect: Effect | undefined): TrackItem[] {
  if (!effect) return items;
  const result: TrackItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.type === 'song') {
      result.push(effectItem(effect));
    }
  }
  return result;
}

/** The 1-based song number for a given index (snippets/effects are not numbered). */
export function songNumberAt(items: TrackItem[], idx: number): number | null {
  if (items[idx]?.type !== 'song') return null;
  return items.slice(0, idx + 1).filter(it => it.type === 'song').length;
}

export type ParsedImportLine =
  | { kind: 'url'; song: Song }
  | { kind: 'query'; query: string };

/**
 * Parse a single mass-import line. Lines are either a YouTube URL (optionally
 * followed by a title after a tab/comma/double-space) or a free-text search query.
 */
export function parseImportLine(line: string): ParsedImportLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [first, ...rest] = trimmed.split(/\t|,|\s{2,}/);
  if (first.startsWith('http')) {
    const url = first.trim();
    const title = rest.join(' ').trim();
    const start = parseStartParam(url);
    return { kind: 'url', song: { url, title: title || url, ...(start !== undefined && { start }) } };
  }
  return { kind: 'query', query: trimmed };
}

/** Read a YouTube start time (?t=83, t=83s, t=1m23s) from a URL, in seconds. */
export function parseStartParam(url: string): number | undefined {
  let t: string | null;
  try {
    t = new URL(url).searchParams.get('t');
  } catch {
    return undefined;
  }
  const m = t?.match(/^(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?$/);
  if (!t || !m) return undefined;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/** Extract the 11-character YouTube video id from any common URL form. */
export function getYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/,
  );
  return match ? match[1] : null;
}

/** Cheap string hash (FNV-1a) so large snippet data URLs can be compared by value. */
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/** Identity of the audio an item produces: a changed key means its clip must be rebuilt. */
export function clipKey(item: TrackItem): string {
  if (item.type === 'section') return 'section';
  if (item.type === 'song') return `song|${item.song.url}|${item.song.start ?? ''}`;
  if (item.type === 'effect') return `effect|${item.effect.id}`;
  return `snippet|${hashString(item.snippet.audioUrl ?? '')}`;
}

export type Segment = { id: string; clipId: string; start: number; duration: number };

/** Lay the ready clips end to end in timeline order; items without a ready clip are left out. */
export function buildSegments(
  items: TrackItem[],
  clips: Record<string, { status: string; clipId?: string; duration?: number } | undefined>,
): Segment[] {
  const segments: Segment[] = [];
  let t = 0;
  for (const item of items) {
    if (!isAudioItem(item)) continue;
    const clip = clips[item.id];
    if (clip?.status !== 'ready' || !clip.clipId || !clip.duration) continue;
    segments.push({ id: item.id, clipId: clip.clipId, start: t, duration: clip.duration });
    t += clip.duration;
  }
  return segments;
}

/** Find the segment containing global time `t` and the offset into it (clamped to the ends). */
export function locate(segments: Segment[], t: number): { index: number; offset: number } | null {
  if (segments.length === 0) return null;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (t < s.start + s.duration) return { index: i, offset: Math.max(0, t - s.start) };
  }
  const last = segments.length - 1;
  return { index: last, offset: segments[last].duration };
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Parse a start time typed as "1:26", "1:02:03" or plain seconds ("86"). Empty means random. */
export function parseTimeInput(value: string): number | undefined | null {
  const v = value.trim();
  if (v === '') return undefined;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(v)) return null;
  return v.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}
