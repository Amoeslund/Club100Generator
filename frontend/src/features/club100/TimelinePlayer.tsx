import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { TrackItem } from './types';
import { ClipState } from './useClips';
import { getClipUrl } from './api';
import { buildSegments, formatTime, locate } from './timeline';

export type TimelinePlayerHandle = { playItem: (id: string) => void };

const MINUTES = 100;

function itemTitle(item: TrackItem | undefined): string {
  if (!item) return '';
  if (item.type === 'song') return item.song.title;
  if (item.type === 'effect') return item.effect.name;
  if (item.type === 'snippet') return item.snippet.label || 'Recording';
  return item.section.title;
}

/**
 * Plays the prepared clips back to back as one continuous track (including the "after every
 * song" effect), with a scrub bar and a grid of the 100 minutes. Nothing is generated: each
 * clip is the exact audio the final MP3 will contain.
 */
export const TimelinePlayer = forwardRef<TimelinePlayerHandle, {
  items: TrackItem[];
  clips: Record<string, ClipState>;
  afterSong?: ClipState;
  onActiveChange: (id: string | null) => void;
}>(({ items, clips, afterSong, onActiveChange }, ref) => {
  const segments = useMemo(() => buildSegments(items, clips, afterSong), [items, clips, afterSong]);
  const total = segments.length ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0;
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // seconds into the current segment
  const [playing, setPlaying] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const loadedClip = useRef<string | null>(null);
  // Loading a new src fires 'pause'; that must not stop continuous playback.
  const switching = useRef(false);

  const index = segments.findIndex(s => s.id === currentId);
  const current = index >= 0 ? segments[index] : null;
  const time = current ? current.start + offset : 0;

  const itemsById = useMemo(() => new Map(items.map(it => [it.id, it])), [items]);
  const songs = useMemo(() => items.filter(it => it.type === 'song'), [items]);
  const sectionStarts = useMemo(() => {
    // Song ids that are the first song after a section heading.
    const starts = new Set<string>();
    let pending = false;
    for (const it of items) {
      if (it.type === 'section') pending = true;
      else if (it.type === 'song' && pending) { starts.add(it.id); pending = false; }
    }
    return starts;
  }, [items]);
  const sectionOf = useMemo(() => {
    const map = new Map<string, string>();
    let title: string | null = null;
    for (const it of items) {
      if (it.type === 'section') title = it.section.title || 'Untitled section';
      else if (title) map.set(it.id, title);
    }
    return map;
  }, [items]);

  const currentItem = current ? itemsById.get(current.itemId) : undefined;
  const minute = current ? songs.findIndex(s => s.id === current.itemId) + 1 || null : null;
  // Snippets/effects belong to the minute of the song before them.
  const minuteOfTime = useMemo(() => {
    if (!current) return null;
    let m = 0;
    for (const it of items) {
      if (it.type === 'song') m++;
      if (it.id === current.itemId) return m || null;
    }
    return null;
  }, [items, current]);
  const shownMinute = minute ?? minuteOfTime;

  useEffect(() => onActiveChange(current ? current.itemId : null), [current?.itemId, onActiveChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the current segment's clip, or reload it at the same spot if it was rebuilt (e.g. new start).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (loadedClip.current !== current.clipId) {
      loadedClip.current = current.clipId;
      if (pendingSeek.current === null) pendingSeek.current = Math.min(offset, current.duration);
      switching.current = true;
      audio.src = getClipUrl(current.clipId);
      audio.load();
    }
  }, [current?.clipId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && audio.paused && audio.src) audio.play().catch(() => setPlaying(false));
    if (!playing && !audio.paused) audio.pause();
  }, [playing, current?.clipId]);

  const seekTo = useCallback((t: number) => {
    const hit = locate(segments, Math.max(0, Math.min(t, total)));
    if (!hit) return;
    const seg = segments[hit.index];
    const audio = audioRef.current;
    setOffset(hit.offset);
    setCurrentId(seg.id);
    if (audio && loadedClip.current === seg.clipId) {
      // Same file already loaded (a repeated song or effect): just move the playhead.
      audio.currentTime = hit.offset;
      if (playing && audio.paused) audio.play().catch(() => setPlaying(false));
    } else {
      pendingSeek.current = hit.offset;
    }
  }, [segments, total, playing]);

  const playItem = useCallback((id: string) => {
    const seg = segments.find(s => s.itemId === id);
    if (!seg) return;
    seekTo(seg.start);
    setPlaying(true);
  }, [segments, seekTo]);
  useImperativeHandle(ref, () => ({ playItem }), [playItem]);

  const step = (delta: number) => {
    // Jump by timeline item (a song together with its after-song effect counts as one).
    const itemStarts = segments.filter((s, i) => i === 0 || s.itemId !== segments[i - 1].itemId);
    const pos = itemStarts.findIndex(s => s.itemId === current?.itemId);
    const target = itemStarts[Math.max(0, Math.min(itemStarts.length - 1, (pos < 0 ? 0 : pos) + delta))];
    if (target) seekTo(target.start);
  };

  const togglePlay = () => {
    if (!current && segments.length) {
      pendingSeek.current = 0;
      setCurrentId(segments[0].id);
    }
    setPlaying(p => !p);
  };

  const scrubAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || total === 0) return;
    seekTo(((clientX - rect.left) / rect.width) * total);
  };

  const audioItems = items.filter(it => it.type !== 'section');
  const readyCount = audioItems.filter(it => clips[it.id]?.status === 'ready').length;
  const pendingCount = audioItems.filter(it => clips[it.id]?.status === 'pending').length;
  const errorCount = audioItems.filter(it => clips[it.id]?.status === 'error').length;
  const cellCount = Math.max(MINUTES, Math.ceil(songs.length / 10) * 10);

  return (
    <div className="c100-panel c100-player">
      <audio
        ref={audioRef}
        preload="auto"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          switching.current = false;
          if (audio && pendingSeek.current !== null) {
            audio.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
          if (playing) audio?.play().catch(() => setPlaying(false));
        }}
        onTimeUpdate={() => setOffset(audioRef.current?.currentTime ?? 0)}
        onPause={() => { if (!switching.current && audioRef.current && !audioRef.current.ended) setPlaying(false); }}
        onPlay={() => setPlaying(true)}
        onEnded={() => {
          const next = segments[index + 1];
          if (next) seekTo(next.start);
          else setPlaying(false);
        }}
      />
      <div className="c100-now" aria-live="polite">
        <span className="c100-now-minute">{shownMinute ?? '–'}</span>
        <span className="c100-now-of">of {Math.max(MINUTES, songs.length)}</span>
      </div>
      <button
        type="button"
        className="c100-now-title"
        disabled={!currentItem}
        onClick={() => current && document.getElementById(`item-${current.itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        title={currentItem ? 'Show in the running order' : undefined}
      >
        {currentItem
          ? `${current?.id.endsWith(':after') ? 'After-song effect' : itemTitle(currentItem)}${sectionOf.get(currentItem.id) ? `, ${sectionOf.get(currentItem.id)}` : ''}`
          : readyCount ? 'Press play to hear your Club 100' : 'Add songs to hear your Club 100'}
      </button>

      <div className="c100-transport">
        <button type="button" className="c100-icon" onClick={() => step(-1)} aria-label="Previous item" disabled={!readyCount}>⏮</button>
        <button type="button" className="c100-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} disabled={!readyCount}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" className="c100-icon" onClick={() => step(1)} aria-label="Next item" disabled={!readyCount}>⏭</button>
        <span className="c100-time">{formatTime(time)} / {formatTime(total)}</span>
      </div>

      <div
        ref={barRef}
        className="c100-scrub"
        role="slider"
        tabIndex={0}
        aria-label="Position in the track"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={formatTime(time)}
        onPointerDown={e => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ } scrubAt(e.clientX); }}
        onPointerMove={e => { if (e.buttons === 1) scrubAt(e.clientX); }}
        onKeyDown={e => {
          if (e.key === 'ArrowRight') seekTo(time + (e.shiftKey ? 60 : 5));
          if (e.key === 'ArrowLeft') seekTo(time - (e.shiftKey ? 60 : 5));
        }}
      >
        {segments.map(seg => (
          <span
            key={seg.id}
            data-type={seg.id.endsWith(':after') ? 'effect' : itemsById.get(seg.itemId)?.type}
            style={{ flex: `${seg.duration} 0 0` }}
          />
        ))}
        {total > 0 && <span className="c100-playhead" style={{ left: `${(time / total) * 100}%` }} />}
      </div>

      <div className="c100-grid" role="group" aria-label="Minutes">
        {Array.from({ length: cellCount }, (_, i) => {
          const song = songs[i];
          if (!song) return <span key={`empty-${i}`} className="c100-cell is-missing" aria-hidden>{i + 1}</span>;
          const clip = clips[song.id];
          const state = song.id === currentItem?.id || (currentItem && minuteOfTime === i + 1 && currentItem.type !== 'song')
            ? 'is-playing'
            : clip?.status === 'ready' ? 'is-ready' : clip?.status === 'error' ? 'is-error' : 'is-pending';
          const section = sectionOf.get(song.id);
          const label = `Minute ${i + 1}: ${itemTitle(song)}${section ? ` (${section})` : ''}${clip?.status === 'error' ? `. Failed: ${clip.error}` : ''}`;
          return (
            <button
              key={song.id}
              type="button"
              className={`c100-cell ${state}${sectionStarts.has(song.id) ? ' is-section-start' : ''}`}
              title={label}
              aria-label={label}
              disabled={clip?.status !== 'ready'}
              onClick={() => playItem(song.id)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="c100-grid-foot c100-muted">
        <span>{readyCount} of {audioItems.length} clips ready</span>
        <span>
          {pendingCount > 0 && `${pendingCount} preparing`}
          {pendingCount > 0 && errorCount > 0 && ', '}
          {errorCount > 0 && <span className="c100-error">{errorCount} failed</span>}
        </span>
      </div>
    </div>
  );
});
TimelinePlayer.displayName = 'TimelinePlayer';
