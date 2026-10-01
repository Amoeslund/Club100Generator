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
  clipKey,
  buildSegments,
  nextReady,
  locate,
  formatTime,
  needsTitle,
  parseTimeInput,
  sectionItem,
  audioTimeline,
  sectionAt,
  songNumberAt,
  parseImportLine,
  parseStartParam,
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

describe('parseStartParam', () => {
  it('reads plain seconds', () => {
    expect(parseStartParam('https://www.youtube.com/watch?v=abcdefghijk&t=83')).toBe(83);
    expect(parseStartParam('https://youtu.be/abcdefghijk?t=83s')).toBe(83);
  });
  it('reads minute/hour notation', () => {
    expect(parseStartParam('https://youtu.be/abcdefghijk?t=1m23s')).toBe(83);
    expect(parseStartParam('https://youtu.be/abcdefghijk?t=1h0m5s')).toBe(3605);
  });
  it('returns undefined when absent or malformed', () => {
    expect(parseStartParam('https://youtu.be/abcdefghijk')).toBeUndefined();
    expect(parseStartParam('https://youtu.be/abcdefghijk?t=abc')).toBeUndefined();
    expect(parseStartParam('not a url')).toBeUndefined();
  });
  it('is applied by parseImportLine', () => {
    const parsed = parseImportLine('https://www.youtube.com/watch?v=abcdefghijk&t=42	My Song');
    expect(parsed).toEqual({ kind: 'url', song: { url: 'https://www.youtube.com/watch?v=abcdefghijk&t=42', title: 'My Song', start: 42 } });
  });
});

describe('clip helpers', () => {
  const song = songItem({ url: 'https://youtu.be/aaaaaaaaaaa', title: 'A', start: 10 });
  const fx = effectItem({ id: 'airhorn', name: 'Airhorn', audioUrl: '/effects/airhorn.mp3' });
  const snip = snippetItem({ type: 'upload', audioUrl: 'data:audio/wav;base64,AAAA' });

  it('clipKey changes when the audio changes', () => {
    expect(clipKey(song)).toBe(clipKey({ ...song }));
    expect(clipKey(song)).not.toBe(clipKey(songItem({ url: 'https://youtu.be/aaaaaaaaaaa', title: 'A', start: 11 })));
    expect(clipKey(snip)).not.toBe(clipKey(snippetItem({ type: 'upload', audioUrl: 'data:audio/wav;base64,AAAB' })));
    expect(clipKey(fx)).toBe('effect|airhorn');
    // Songs without an end keep the key format they had before `end` existed.
    expect(clipKey(song)).toBe('song|https://youtu.be/aaaaaaaaaaa|10');
    expect(clipKey(songItem({ url: 'https://youtu.be/aaaaaaaaaaa', title: 'A', start: 10, end: 40 }))).toBe('song|https://youtu.be/aaaaaaaaaaa|10|40');
  });

  it('buildSegments lays out every item and locate finds offsets', () => {
    const segs = buildSegments([song, snip, fx], {
      [song.id]: { status: 'ready', clipId: 'a.mp3', duration: 60 },
      [snip.id]: { status: 'pending' },
      [fx.id]: { status: 'ready', clipId: 'fx.mp3', duration: 3 },
    });
    // The pending snippet is shown with an estimated 3s but has no audio.
    expect(segs.map(s => [s.itemId, s.status, s.start])).toEqual([[song.id, 'ready', 0], [snip.id, 'pending', 60], [fx.id, 'ready', 63]]);
    expect(segs[1].clipId).toBeUndefined();
    expect(nextReady(segs, 1)).toBe(2);
    expect(nextReady(segs, 3)).toBe(-1);
    const withAfter = buildSegments([song, fx], {
      [song.id]: { status: 'ready', clipId: 'a.mp3', duration: 60 },
      [fx.id]: { status: 'ready', clipId: 'fx.mp3', duration: 3 },
    }, { status: 'ready', clipId: 'horn.mp3', duration: 2 });
    expect(withAfter.map(s => [s.id, s.itemId, s.start, !!s.after])).toEqual([
      [song.id, song.id, 0, false], [`${song.id}:after`, song.id, 60, true], [fx.id, fx.id, 62, false],
    ]);
    expect(locate(segs, 64.5)).toEqual({ index: 2, offset: 1.5 });
    expect(locate(segs, 999)).toEqual({ index: 2, offset: 3 });
    expect(locate([], 0)).toBeNull();
  });

  it('unready songs are estimated from their start and end', () => {
    const short = songItem({ url: 'https://youtu.be/aaaaaaaaaaa', title: 'A', start: 10, end: 40 });
    const failed = songItem({ url: 'https://youtu.be/bbbbbbbbbbb', title: 'B' });
    const segs = buildSegments([short, failed], { [failed.id]: { status: 'error' } });
    expect(segs.map(s => [s.status, s.duration])).toEqual([['pending', 30], ['error', 60]]);
  });

  it('formatTime', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(5942)).toBe('1:39:02');
  });
});

describe('sections and start times', () => {
  it('parseTimeInput accepts m:ss, h:mm:ss and seconds', () => {
    expect(parseTimeInput('1:26')).toBe(86);
    expect(parseTimeInput('86')).toBe(86);
    expect(parseTimeInput('1:02:03')).toBe(3723);
    expect(parseTimeInput('  ')).toBeUndefined();
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('1:2:3:4')).toBeNull();
    expect(parseTimeInput('1:26.5')).toBe(86.5);
    expect(formatTime(86.5, true)).toBe('1:26.5');
    expect(formatTime(86, true)).toBe('1:26');
  });

  it('sections are dropped from the audio timeline and skipped by the player', () => {
    const intro = sectionItem({ title: 'Intro' });
    const song = songItem({ url: 'https://youtu.be/aaaaaaaaaaa', title: 'A', start: 0 });
    expect(audioTimeline([intro, song])).toEqual([song]);
    expect(buildSegments([intro, song], { [song.id]: { status: 'ready', clipId: 'a.mp3', duration: 60 } }))
      .toEqual([{ id: song.id, itemId: song.id, kind: 'song', status: 'ready', clipId: 'a.mp3', start: 0, duration: 60 }]);
    expect(sectionAt([intro, song], 1)).toBe('Intro');
    expect(sectionAt([song, intro], 0)).toBeNull();
    expect(songNumberAt([intro, song], 1)).toBe(1);
  });

  it('timelines saved before sections existed load unchanged', () => {
    const saved = [
      { id: 'a', type: 'song', song: { url: 'https://www.youtube.com/watch?v=_B0CyOAO8y0&t=11', title: 'Entry', start: 11 } },
      { type: 'snippet', snippet: { type: 'upload', audioUrl: 'data:audio/wav;base64,AAAA' } },
      { id: 'c', type: 'effect', effect: { id: 'mi_clown', name: 'Clown', audioUrl: '/effects/mi-clown.mp3' } },
    ] as Partial<TrackItem>[];
    const loaded = ensureIds(saved);
    expect(loaded[0]).toBe(saved[0]);
    expect(loaded[2]).toBe(saved[2]);
    expect(loaded[1]).toMatchObject(saved[1]);
    expect(audioTimeline(loaded)).toEqual(loaded);
  });
});

describe('needsTitle', () => {
  it('flags songs whose title is still the link', () => {
    expect(needsTitle({ url: 'https://youtu.be/aaaaaaaaaaa', title: 'https://youtu.be/aaaaaaaaaaa' })).toBe(true);
    expect(needsTitle({ url: 'https://youtu.be/aaaaaaaaaaa?t=5', title: 'https://youtu.be/aaaaaaaaaaa' })).toBe(true);
    expect(needsTitle({ url: 'https://youtu.be/aaaaaaaaaaa', title: '' })).toBe(true);
    expect(needsTitle({ url: 'https://youtu.be/aaaaaaaaaaa', title: 'Layla - DJ Robin' })).toBe(false);
  });
});
