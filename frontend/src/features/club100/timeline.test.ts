import { describe, it, expect } from 'vitest';
import {
  songItem,
  snippetItem,
  effectItem,
  ensureIds,
  addSong,
  insertAfter,
  removeAt,
  moveItem,
  updateAt,
  injectAutoEffect,
  songNumberAt,
  parseImportLine,
  getYoutubeId,
  makeId,
} from './timeline';
import { Song, Effect, TrackItem } from './types';

const song = (title: string): Song => ({ url: `https://youtu.be/${title}`, title });
const effect: Effect = { id: 'boom', name: 'Vine Boom', audioUrl: '/effects/vine-boom.mp3' };

describe('makeId', () => {
  it('returns unique ids', () => {
    expect(makeId()).not.toBe(makeId());
  });
});

describe('item builders', () => {
  it('attach ids and types', () => {
    expect(songItem(song('a'))).toMatchObject({ type: 'song' });
    expect(snippetItem({ type: 'upload' })).toMatchObject({ type: 'snippet' });
    expect(effectItem(effect)).toMatchObject({ type: 'effect' });
    expect(songItem(song('a')).id).toBeTruthy();
  });
});

describe('ensureIds', () => {
  it('adds ids to items missing them, preserves existing', () => {
    const result = ensureIds([
      { type: 'song', song: song('a') },
      { id: 'keep', type: 'effect', effect },
    ] as Partial<TrackItem>[]);
    expect(result[0].id).toBeTruthy();
    expect(result[1].id).toBe('keep');
  });
});

describe('addSong', () => {
  it('appends to an empty timeline', () => {
    const out = addSong([], song('a'));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('song');
  });

  it('inserts after the last song, before trailing snippets/effects', () => {
    const items: TrackItem[] = [songItem(song('a')), effectItem(effect)];
    const out = addSong(items, song('b'));
    // new song should land at index 1 (right after the existing song)
    expect(out.map(i => i.type)).toEqual(['song', 'song', 'effect']);
    expect((out[1] as Extract<TrackItem, { type: 'song' }>).song.title).toBe('b');
  });
});

describe('insertAfter / removeAt / updateAt', () => {
  it('inserts immediately after the given index', () => {
    const items = [songItem(song('a')), songItem(song('b'))];
    const out = insertAfter(items, effectItem(effect), 0);
    expect(out.map(i => i.type)).toEqual(['song', 'effect', 'song']);
  });
  it('removes by index', () => {
    const items = [songItem(song('a')), songItem(song('b'))];
    expect(removeAt(items, 0)).toHaveLength(1);
  });
  it('updates by index without mutating input', () => {
    const items = [songItem(song('a'))];
    const replacement = songItem(song('z'));
    const out = updateAt(items, 0, replacement);
    expect(out[0]).toBe(replacement);
    expect(items[0]).not.toBe(replacement);
  });
});

describe('moveItem', () => {
  it('reorders items', () => {
    const items = [songItem(song('a')), songItem(song('b')), songItem(song('c'))];
    const out = moveItem(items, 0, 2);
    expect(out.map(i => (i as Extract<TrackItem, { type: 'song' }>).song.title)).toEqual(['b', 'c', 'a']);
  });
  it('ignores out-of-range moves', () => {
    const items = [songItem(song('a'))];
    expect(moveItem(items, 0, 5)).toBe(items);
    expect(moveItem(items, -1, 0)).toBe(items);
  });
});

describe('injectAutoEffect', () => {
  it('returns input unchanged when no effect', () => {
    const items = [songItem(song('a'))];
    expect(injectAutoEffect(items, undefined)).toBe(items);
  });
  it('inserts an effect after every song', () => {
    const items = [songItem(song('a')), snippetItem({ type: 'upload' }), songItem(song('b'))];
    const out = injectAutoEffect(items, effect);
    expect(out.map(i => i.type)).toEqual(['song', 'effect', 'snippet', 'song', 'effect']);
  });
});

describe('songNumberAt', () => {
  it('numbers only songs, skipping other items', () => {
    const items = [songItem(song('a')), effectItem(effect), songItem(song('b'))];
    expect(songNumberAt(items, 0)).toBe(1);
    expect(songNumberAt(items, 1)).toBeNull();
    expect(songNumberAt(items, 2)).toBe(2);
  });
});

describe('parseImportLine', () => {
  it('returns null for blank lines', () => {
    expect(parseImportLine('   ')).toBeNull();
  });
  it('parses a bare URL', () => {
    const r = parseImportLine('https://youtu.be/abc');
    expect(r).toEqual({ kind: 'url', song: { url: 'https://youtu.be/abc', title: 'https://youtu.be/abc' } });
  });
  it('parses a URL with a comma-separated title', () => {
    const r = parseImportLine('https://youtu.be/abc, My Song');
    expect(r).toEqual({ kind: 'url', song: { url: 'https://youtu.be/abc', title: 'My Song' } });
  });
  it('parses a tab-separated title', () => {
    const r = parseImportLine('https://youtu.be/abc\tTabbed Title');
    expect(r).toMatchObject({ kind: 'url', song: { title: 'Tabbed Title' } });
  });
  it('treats non-URL text as a search query', () => {
    expect(parseImportLine('never gonna give you up')).toEqual({ kind: 'query', query: 'never gonna give you up' });
  });
});

describe('getYoutubeId', () => {
  it('extracts ids from watch, short, embed, and shorts URLs', () => {
    expect(getYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('returns null for non-YouTube URLs', () => {
    expect(getYoutubeId('https://example.com/video')).toBeNull();
  });
});
