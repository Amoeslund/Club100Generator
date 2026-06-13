import { Song, Snippet, Effect, TrackItem } from './types';

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
export function injectAutoEffect(items: TrackItem[], effect: Effect | undefined): TrackItem[] {
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
    return { kind: 'url', song: { url, title: title || url } };
  }
  return { kind: 'query', query: trimmed };
}

/** Extract the 11-character YouTube video id from any common URL form. */
export function getYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/,
  );
  return match ? match[1] : null;
}
