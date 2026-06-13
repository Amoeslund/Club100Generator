import { describe, it, expect } from 'vitest';
import {
  isQuotaExceededError,
  isYoutubeApiItem,
  mapYoutubeApiItems,
  firstNonEmpty,
} from './youtube';

describe('isQuotaExceededError', () => {
  it('detects the quotaExceeded reason', () => {
    expect(isQuotaExceededError({ error: { errors: [{ reason: 'quotaExceeded' }] } })).toBe(true);
  });
  it('rejects other shapes', () => {
    expect(isQuotaExceededError({ error: { errors: [{ reason: 'other' }] } })).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError('nope')).toBe(false);
  });
});

describe('isYoutubeApiItem', () => {
  it('accepts a well-formed item', () => {
    expect(isYoutubeApiItem({ id: { videoId: 'x' }, snippet: { title: 't', channelTitle: 'c' } })).toBe(true);
  });
  it('rejects items missing fields', () => {
    expect(isYoutubeApiItem({ id: {}, snippet: { title: 't', channelTitle: 'c' } })).toBe(false);
    expect(isYoutubeApiItem({ id: { videoId: 'x' }, snippet: { title: 't' } })).toBe(false);
    expect(isYoutubeApiItem(null)).toBe(false);
  });
});

describe('mapYoutubeApiItems', () => {
  it('maps valid items and drops invalid ones', () => {
    const songs = mapYoutubeApiItems([
      { id: { videoId: 'abc' }, snippet: { title: 'Song', channelTitle: 'Artist', thumbnails: { default: { url: 'thumb' } } } },
      { id: {}, snippet: {} },
    ]);
    expect(songs).toEqual([
      { url: 'https://www.youtube.com/watch?v=abc', title: 'Song', artist: 'Artist', thumbnail: 'thumb' },
    ]);
  });
  it('returns [] for non-arrays', () => {
    expect(mapYoutubeApiItems(undefined)).toEqual([]);
  });
});

describe('firstNonEmpty', () => {
  it('returns the first non-empty result in priority order', async () => {
    const out = await firstNonEmpty([
      Promise.resolve([]),
      Promise.resolve([1, 2]),
      Promise.resolve([3]),
    ]);
    expect(out).toEqual([1, 2]);
  });
  it('treats rejections as empty and falls through', async () => {
    const out = await firstNonEmpty<number>([
      Promise.reject(new Error('boom')),
      Promise.resolve([42]),
    ]);
    expect(out).toEqual([42]);
  });
  it('returns [] when everything is empty or failing', async () => {
    const out = await firstNonEmpty<number>([Promise.resolve([]), Promise.reject(new Error('x'))]);
    expect(out).toEqual([]);
  });
});
