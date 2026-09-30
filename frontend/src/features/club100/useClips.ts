import { useCallback, useEffect, useRef, useState } from 'react';
import { TrackItem } from './types';
import { prepareClip } from './api';
import { clipKey, isAudioItem } from './timeline';

export type ClipState = {
  /** clipKey of the item this state belongs to; a mismatch means the state is stale. */
  key: string;
  status: 'pending' | 'ready' | 'error';
  clipId?: string;
  duration?: number;
  error?: string;
};

// Parallel /clips requests. The backend encodes on all cores; this just keeps the queue flowing.
const CONCURRENCY = 6;
// Network failures (backend restarting or not started yet) are retried with a growing delay.
const NETWORK_RETRIES = 8;
const RETRY_DELAY_MS = 1500;

/**
 * Prepare the finished clip for every timeline item as soon as it is added or changed.
 *
 * Songs without a start get a random start from the backend, which is reported through
 * `onPinStart` so the preview and the generated track use the same minute.
 */
export function useClips(items: TrackItem[], onPinStart: (id: string, start: number) => void) {
  const [clips, setClips] = useState<Record<string, ClipState>>({});
  const wanted = useRef(new Map<string, string>()); // item id -> current clipKey
  const requested = useRef(new Map<string, string>()); // item id -> clipKey already queued/built
  const queue = useRef<TrackItem[]>([]);
  const active = useRef(0);
  const attempts = useRef(new Map<string, number>());
  const pinStart = useRef(onPinStart);
  pinStart.current = onPinStart;

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length > 0) {
      const item = queue.current.shift()!;
      const key = clipKey(item);
      if (wanted.current.get(item.id) !== key) continue; // edited or removed while queued
      active.current++;
      prepareClip(item)
        .then(res => {
          let doneKey = key;
          if (item.type === 'song' && item.song.start === undefined && res.start !== undefined) {
            doneKey = clipKey({ ...item, song: { ...item.song, start: res.start } });
            wanted.current.set(item.id, doneKey);
            requested.current.set(item.id, doneKey);
            pinStart.current(item.id, res.start);
          }
          attempts.current.delete(item.id);
          if (wanted.current.get(item.id) !== doneKey) return;
          setClips(c => ({ ...c, [item.id]: { key: doneKey, status: 'ready', clipId: res.clipId, duration: res.duration } }));
        })
        .catch((e: Error) => {
          if (wanted.current.get(item.id) !== key) return;
          const tries = (attempts.current.get(item.id) ?? 0) + 1;
          // fetch() rejects with a TypeError only when the backend can't be reached at all.
          if (e instanceof TypeError && tries <= NETWORK_RETRIES) {
            attempts.current.set(item.id, tries);
            setTimeout(() => {
              if (wanted.current.get(item.id) !== key) return;
              queue.current.push(item);
              pump();
            }, RETRY_DELAY_MS * tries);
            return;
          }
          attempts.current.delete(item.id);
          const error = e instanceof TypeError ? 'The backend is not reachable. Is it running?' : e.message;
          setClips(c => ({ ...c, [item.id]: { key, status: 'error', error } }));
        })
        .finally(() => {
          active.current--;
          pump();
        });
    }
  }, []);

  useEffect(() => {
    const ids = new Set(items.filter(isAudioItem).map(it => it.id));
    for (const id of [...wanted.current.keys()]) {
      if (!ids.has(id)) {
        wanted.current.delete(id);
        requested.current.delete(id);
      }
    }
    const fresh: TrackItem[] = [];
    for (const item of items) {
      if (!isAudioItem(item)) continue; // sections have no audio
      const key = clipKey(item);
      wanted.current.set(item.id, key);
      if (requested.current.get(item.id) !== key) {
        requested.current.set(item.id, key);
        fresh.push(item);
      }
    }
    if (fresh.length > 0) {
      queue.current.push(...fresh);
      setClips(c => {
        const next = { ...c };
        for (const item of fresh) next[item.id] = { key: clipKey(item), status: 'pending' };
        return next;
      });
    }
    pump();
  }, [items, pump]);

  const retry = useCallback((item: TrackItem) => {
    requested.current.delete(item.id);
    const key = clipKey(item);
    requested.current.set(item.id, key);
    wanted.current.set(item.id, key);
    queue.current.unshift(item);
    setClips(c => ({ ...c, [item.id]: { key, status: 'pending' } }));
    pump();
  }, [pump]);

  return { clips, retry };
}
