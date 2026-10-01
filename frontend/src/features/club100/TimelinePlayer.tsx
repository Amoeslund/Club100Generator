import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TrackItem } from './types';
import { ClipState } from './useClips';
import { getClipUrl } from './api';
import { buildSegments, formatTime, locate, nextReady, Segment } from './timeline';

export type TimelinePlayerHandle = {
  playItem: (id: string) => void;
  /** Play the lead-in to the next "after every song" effect (from the current song, or the first). */
  previewAfterSong: () => boolean;
};

const AFTER_SONG_LEAD_IN = 4; // seconds of the song heard before its after-song effect

const MINUTES = 100;
const LABEL_SPACING_PX = 22; // minimum room per minute number on the track
const TICK_SPACING_PX = 72; // minimum room per time label on the ruler
const MIN_VIEW_SECONDS = 20; // deepest zoom: 20 seconds across the whole track
const TICK_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600]; // seconds

function itemTitle(item: TrackItem | undefined): string {
  if (!item) return '';
  if (item.type === 'song') return item.song.title;
  if (item.type === 'effect') return item.effect.name;
  if (item.type === 'snippet') return item.snippet.label || 'Recording';
  return item.section.title;
}

/**
 * The whole Club 100 as one big timeline docked at the bottom of the screen. Every item is a
 * block sized by its length (songs numbered by minute, section headings above), and the clips
 * play back to back exactly as the MP3 will sound. Items still preparing or failed are shown but
 * skipped. Click or drag anywhere on it to scrub.
 */
export const TimelinePlayer = forwardRef<TimelinePlayerHandle, {
  items: TrackItem[];
  clips: Record<string, ClipState>;
  afterSong?: ClipState;
  /** Name of the effect played after every song, for the "now playing" line. */
  afterSongName?: string;
  onActiveChange: (id: string | null) => void;
}>(({ items, clips, afterSong, afterSongName, onActiveChange }, ref) => {
  const segments = useMemo(() => buildSegments(items, clips, afterSong), [items, clips, afterSong]);
  const total = segments.length ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0;
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(1000);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // seconds into the current segment
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  // Visible window of the timeline in seconds; null span means "fit the whole Club 100".
  const [view, setView] = useState<{ start: number; span: number | null }>({ start: 0, span: null });
  const pendingSeek = useRef<number | null>(null);
  const loadedClip = useRef<string | null>(null);
  // Loading a new src fires 'pause'; that must not stop continuous playback.
  const switching = useRef(false);

  const index = segments.findIndex(s => s.id === currentId && s.status === 'ready');
  const current = index >= 0 ? segments[index] : null;
  const time = current ? current.start + offset : 0;

  const itemsById = useMemo(() => new Map(items.map(it => [it.id, it])), [items]);
  // Minute (song number) of every audio item; snippets/effects belong to the song before them.
  const minuteOf = useMemo(() => {
    const map = new Map<string, number>();
    let m = 0;
    for (const it of items) {
      if (it.type === 'song') m++;
      if (it.type !== 'section') map.set(it.id, m);
    }
    return map;
  }, [items]);
  const songCount = useMemo(() => items.filter(it => it.type === 'song').length, [items]);
  const sectionOf = useMemo(() => {
    const map = new Map<string, string>();
    let title = '';
    for (const it of items) {
      if (it.type === 'section') title = it.section.title;
      else if (title) map.set(it.id, title);
    }
    return map;
  }, [items]);
  // Section bands: from the first segment after a section heading to the next heading.
  const bands = useMemo(() => {
    const firstSeg = new Map<string, Segment>();
    for (const s of segments) if (!firstSeg.has(s.itemId)) firstSeg.set(s.itemId, s);
    const result: { id: string; title: string; start: number; end: number }[] = [];
    let open: { id: string; title: string; start: number | null } | null = null;
    const close = (end: number) => {
      if (open && open.start !== null && end > open.start) result.push({ id: open.id, title: open.title, start: open.start, end });
    };
    for (const it of items) {
      if (it.type === 'section') {
        close(nextStart(it));
        open = { id: it.id, title: it.section.title, start: null };
      } else if (open && open.start === null) {
        open.start = firstSeg.get(it.id)?.start ?? null;
      }
    }
    close(total);
    return result;

    // Start time of the first audio item after `section` (where the previous band ends).
    function nextStart(section: TrackItem): number {
      for (let i = items.indexOf(section) + 1; i < items.length; i++) {
        const seg = firstSeg.get(items[i].id);
        if (seg) return seg.start;
      }
      return total;
    }
  }, [items, segments, total]);

  const currentItem = current ? itemsById.get(current.itemId) : undefined;
  const minute = current ? minuteOf.get(current.itemId) || null : null;
  const audioItems = items.filter(it => it.type !== 'section');
  const readyCount = audioItems.filter(it => clips[it.id]?.status === 'ready').length;
  const pendingCount = audioItems.filter(it => clips[it.id]?.status === 'pending').length;
  const errorCount = audioItems.filter(it => clips[it.id]?.status === 'error').length;

  useEffect(() => onActiveChange(current ? current.itemId : null), [current?.itemId, onActiveChange]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the current segment's clip, or reload it at the same spot if it was rebuilt (e.g. new start).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current?.clipId) return;
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

  /** Move to global time `t`; a spot inside an item that isn't ready moves on to the next ready one. */
  const seekTo = useCallback((t: number) => {
    const hit = locate(segments, Math.max(0, Math.min(t, total)));
    if (!hit) return;
    let i = hit.index;
    let at = hit.offset;
    if (segments[i].status !== 'ready') {
      i = nextReady(segments, i);
      at = 0;
      if (i < 0) return;
    }
    const seg = segments[i];
    const audio = audioRef.current;
    setOffset(at);
    setCurrentId(seg.id);
    if (audio && loadedClip.current === seg.clipId) {
      // Same file already loaded (a repeated song or effect): just move the playhead.
      audio.currentTime = at;
      if (playing && audio.paused) audio.play().catch(() => setPlaying(false));
    } else {
      pendingSeek.current = at;
    }
  }, [segments, total, playing]);

  const playItem = useCallback((id: string) => {
    const seg = segments.find(s => s.itemId === id && s.status === 'ready');
    if (!seg) return;
    seekTo(seg.start);
    setPlaying(true);
  }, [segments, seekTo]);
  const previewAfterSong = useCallback(() => {
    const afters = segments.filter(s => s.after && s.status === 'ready');
    const target = afters.find(s => current && s.start >= current.start) ?? afters[0];
    if (!target) return false;
    seekTo(Math.max(0, target.start - AFTER_SONG_LEAD_IN));
    setPlaying(true);
    return true;
  }, [segments, current, seekTo]);
  useImperativeHandle(ref, () => ({ playItem, previewAfterSong }), [playItem, previewAfterSong]);

  const step = (delta: number) => {
    // Jump by timeline item (a song together with its after-song effect counts as one).
    const starts = segments.filter(s => s.status === 'ready' && !s.after);
    const pos = starts.findIndex(s => s.itemId === current?.itemId);
    const target = starts[Math.max(0, Math.min(starts.length - 1, (pos < 0 ? 0 : pos) + delta))];
    if (target) seekTo(target.start);
  };

  const togglePlay = () => {
    if (!current) {
      const first = nextReady(segments, 0);
      if (first < 0) return;
      seekTo(segments[first].start);
    }
    setPlaying(p => !p);
  };

  // Zoom: the wheel zooms around the pointer, Shift+wheel or a horizontal swipe pans.
  const viewSpan = Math.min(total, view.span ?? total) || total;
  const viewStart = Math.max(0, Math.min(total - viewSpan, view.start));
  const zoomed = viewSpan < total - 0.5;
  const clampView = useCallback((start: number, span: number) => {
    const s = Math.max(Math.min(MIN_VIEW_SECONDS, total), Math.min(total, span));
    return s >= total - 0.5 ? { start: 0, span: null } : { start: Math.max(0, Math.min(total - s, start)), span: s };
  }, [total]);
  const viewRef = useRef({ viewStart, viewSpan });
  viewRef.current = { viewStart, viewSpan };
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // Native listener: React's onWheel is passive, so it can't stop the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      if (!total) return;
      e.preventDefault();
      const { viewStart: vs, viewSpan: span } = viewRef.current;
      const rect = el.getBoundingClientRect();
      const pan = e.shiftKey ? e.deltaY : Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      // Several wheel events can arrive before React re-renders: update the ref right away.
      const apply = (v: { start: number; span: number | null }) => {
        viewRef.current = { viewStart: v.start, viewSpan: v.span ?? total };
        setView(v);
      };
      if (pan) {
        apply(clampView(vs + (pan / rect.width) * span, span));
        return;
      }
      const anchor = vs + ((e.clientX - rect.left) / rect.width) * span;
      const factor = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      const next = span * factor;
      apply(clampView(anchor - ((anchor - vs) / span) * next, next));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [total, clampView]);
  // Keep the playhead in view while playing a zoomed timeline.
  useEffect(() => {
    if (!zoomed || !playing) return;
    if (time < viewStart || time > viewStart + viewSpan) setView(clampView(time - viewSpan * 0.1, viewSpan));
  }, [zoomed, playing, time, viewStart, viewSpan, clampView]);

  const timeAtX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || total === 0) return null;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return { x, t: viewStart + (x / rect.width) * viewSpan };
  };

  const pct = (t: number) => (viewSpan ? ((t - viewStart) / viewSpan) * 100 : 0);
  const visible = (start: number, end: number) => end > viewStart && start < viewStart + viewSpan;
  const hoverSeg = hover ? segments[locate(segments, hover.t)?.index ?? -1] : undefined;
  const hoverItem = hoverSeg ? itemsById.get(hoverSeg.itemId) : undefined;
  // Number every minute when there is room, otherwise every 2nd/5th/10th... so labels never collide.
  const perMinutePx = songCount && viewSpan ? (trackWidth * (total / viewSpan)) / songCount : trackWidth;
  const labelEvery = [1, 2, 5, 10, 20, 25, 50].find(n => n * perMinutePx >= LABEL_SPACING_PX) ?? 50;
  const tickEvery = TICK_STEPS.find(sec => viewSpan && (sec / viewSpan) * trackWidth >= TICK_SPACING_PX) ?? 3600;
  const ticks: number[] = [];
  for (let t = Math.ceil(viewStart / tickEvery) * tickEvery; t <= viewStart + viewSpan; t += tickEvery) if (t > 0) ticks.push(t);
  const describe = (seg: Segment | undefined, item: TrackItem | undefined) =>
    seg?.after ? `${afterSongName ?? 'Sound effect'}, after ${itemTitle(item)}` : itemTitle(item);

  return (
    <div className="c100-dock" role="region" aria-label="Player">
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
          const next = nextReady(segments, index + 1);
          if (next >= 0) seekTo(segments[next].start);
          else setPlaying(false);
        }}
      />
      <div className="c100-dock-head">
        <div className="c100-transport">
          <button type="button" className="c100-icon" onClick={() => step(-1)} aria-label="Previous item" disabled={!readyCount}>⏮</button>
          <button type="button" className="c100-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} disabled={!readyCount}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" className="c100-icon" onClick={() => step(1)} aria-label="Next item" disabled={!readyCount}>⏭</button>
        </div>
        <div className="c100-now" aria-live="polite">
          <span className={`c100-now-minute${minute ? '' : ' is-idle'}`}>{minute ?? 0}</span>
          <span className="c100-now-of">of {Math.max(MINUTES, songCount)}</span>
        </div>
        <div className="c100-now-text">
          <button
            type="button"
            className="c100-now-title"
            disabled={!currentItem}
            onClick={() => current && document.getElementById(`item-${current.itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            title={currentItem ? 'Show in the running order' : undefined}
          >
            {currentItem ? describe(current ?? undefined, currentItem) : readyCount ? 'Press play to hear your Club 100' : 'Add songs to hear your Club 100'}
          </button>
          {currentItem && sectionOf.get(currentItem.id) && <div className="c100-muted">{sectionOf.get(currentItem.id)}</div>}
        </div>
        <div className="c100-dock-status">
          <span className="c100-time">
            {zoomed && (
              <button type="button" className="c100-btn c100-btn-quiet c100-zoom-reset" onClick={() => setView({ start: 0, span: null })} title="Show the whole Club 100 (double-click the timeline or press 0)">
                Zoom out
              </button>
            )}
            {formatTime(time)} / {formatTime(total)}
          </span>
          <span className="c100-muted">
            {readyCount === audioItems.length ? `All ${audioItems.length} clips ready` : `${readyCount} of ${audioItems.length} clips ready`}
            {pendingCount > 0 && `, ${pendingCount} preparing`}
            {errorCount > 0 && <span className="c100-error">, {errorCount} failed</span>}
          </span>
        </div>
      </div>

      <div className="c100-timeline">
        <div className="c100-bands" aria-hidden>
          {bands.filter(b => visible(b.start, b.end)).map(b => {
            // A band that starts off-screen keeps its title readable at the left edge.
            const left = Math.max(0, pct(b.start));
            return (
              <span key={b.id} className="c100-band" style={{ left: `${left}%`, width: `${Math.min(100, pct(b.end)) - left}%` }} title={b.title || undefined}>
                {b.title}
              </span>
            );
          })}
        </div>
        <div
          ref={trackRef}
          className="c100-track"
          role="slider"
          tabIndex={0}
          aria-label="Position in the Club 100"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`Minute ${minute ?? 0}, ${formatTime(time)}`}
          onPointerDown={e => {
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
            const hit = timeAtX(e.clientX);
            if (hit) seekTo(hit.t);
          }}
          onPointerMove={e => {
            const hit = timeAtX(e.clientX);
            setHover(hit);
            if (hit && e.buttons === 1) seekTo(hit.t);
          }}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={() => setView({ start: 0, span: null })}
          onKeyDown={e => {
            if (e.key === '+' || e.key === '=') { e.preventDefault(); setView(clampView(time - viewSpan / 4, viewSpan / 2)); }
            if (e.key === '-') { e.preventDefault(); setView(clampView(time - viewSpan, viewSpan * 2)); }
            if (e.key === '0') { e.preventDefault(); setView({ start: 0, span: null }); }
            if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(time + (e.shiftKey ? 60 : 5)); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(time - (e.shiftKey ? 60 : 5)); }
            if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
          }}
        >
          {segments.filter(seg => visible(seg.start, seg.start + seg.duration)).map(seg => {
            const m = minuteOf.get(seg.itemId) ?? 0;
            const isSong = seg.kind === 'song' && !seg.after;
            const showLabel = isSong && (m % labelEvery === 0 || (m === 1 && labelEvery <= 5));
            const isCurrent = !!current && seg.id === current.id;
            return (
              <span
                key={seg.id}
                className={`c100-block is-${seg.status}${isCurrent ? ' is-current' : ''}`}
                data-kind={seg.kind}
                // Clamped to the visible window so a zoomed block never spills out of the track.
                style={{ left: `${Math.max(0, pct(seg.start))}%`, width: `${Math.min(100, pct(seg.start + seg.duration)) - Math.max(0, pct(seg.start))}%` }}
              >
                {showLabel && <span className="c100-block-label">{m}</span>}
              </span>
            );
          })}
          {total > 0 && visible(time, time) && <span className="c100-track-playhead" style={{ left: `${pct(time)}%` }} />}
          {hover && hoverItem && (
            <span className="c100-tip" style={{ left: hover.x }}>
              {hoverItem.type === 'song' && !hoverSeg?.after ? `Minute ${minuteOf.get(hoverItem.id)}: ` : ''}
              {describe(hoverSeg, hoverItem)}
              {hoverSeg?.status === 'pending' && ' (preparing)'}
              {hoverSeg?.status === 'error' && ' (failed)'}
              <span className="c100-tip-time"> {formatTime(hover.t)}</span>
            </span>
          )}
        </div>
        <div className="c100-ruler" aria-hidden>
          <span style={{ left: 0, transform: 'none' }}>{formatTime(viewStart)}</span>
          {ticks.map(t => ((pct(t) / 100) * trackWidth > 44 && (pct(t) / 100) * trackWidth < trackWidth - 64 ? <span key={t} style={{ left: `${pct(t)}%` }}>{formatTime(t)}</span> : null))}
          <span style={{ left: 'auto', right: 0, transform: 'none' }}>{formatTime(viewStart + viewSpan)}</span>
        </div>
        {zoomed ? (
          <div className="c100-overview" aria-hidden>
            <span style={{ left: `${(viewStart / total) * 100}%`, width: `${(viewSpan / total) * 100}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
});
TimelinePlayer.displayName = 'TimelinePlayer';
