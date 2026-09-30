import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { TrackItem } from './types';
import { ClipState } from './useClips';
import { getClipUrl } from './api';
import { buildSegments, formatTime, locate, songNumberAt } from './timeline';

export type TimelinePlayerHandle = { playItem: (id: string) => void };

const SEGMENT_COLORS: Record<TrackItem['type'], string> = { song: '#ffd166', snippet: '#ff8fd0', effect: '#74c0fc', section: 'transparent' };

function itemLabel(items: TrackItem[], idx: number): string {
  const item = items[idx];
  if (!item) return '';
  if (item.type === 'song') return `#${songNumberAt(items, idx)} ${item.song.title}`;
  if (item.type === 'effect') return `🔊 ${item.effect.name}`;
  return '🎤 Snippet';
}

/**
 * Plays the prepared clips back to back as one continuous track, with a scrub bar over the
 * whole timeline. Nothing is generated: each clip is the exact audio the final MP3 will contain.
 */
export const TimelinePlayer = forwardRef<TimelinePlayerHandle, {
  items: TrackItem[];
  clips: Record<string, ClipState>;
  onActiveChange: (id: string | null) => void;
}>(({ items, clips, onActiveChange }, ref) => {
  const segments = useMemo(() => buildSegments(items, clips), [items, clips]);
  const total = segments.length ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0;
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // seconds into the current clip
  const [playing, setPlaying] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const loadedClip = useRef<string | null>(null);

  const index = segments.findIndex(s => s.id === currentId);
  const current = index >= 0 ? segments[index] : null;
  const time = current ? current.start + offset : 0;

  useEffect(() => onActiveChange(current ? current.id : null), [current?.id, onActiveChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the current segment's clip, or reload it at the same spot if it was rebuilt (e.g. new start).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (loadedClip.current !== current.clipId) {
      loadedClip.current = current.clipId;
      if (pendingSeek.current === null) pendingSeek.current = Math.min(offset, current.duration);
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
      // Same file already loaded (also when a song appears twice): just move the playhead.
      audio.currentTime = hit.offset;
      if (playing && audio.paused) audio.play().catch(() => setPlaying(false));
    } else {
      pendingSeek.current = hit.offset;
    }
  }, [segments, total, playing]);

  useImperativeHandle(ref, () => ({
    playItem: (id: string) => {
      const seg = segments.find(s => s.id === id);
      if (!seg) return;
      seekTo(seg.start);
      setPlaying(true);
    },
  }), [segments, seekTo]);

  const step = (delta: number) => {
    const target = segments[Math.max(0, Math.min(segments.length - 1, (index < 0 ? 0 : index) + delta))];
    if (target) seekTo(target.start);
  };

  const togglePlay = () => {
    if (!current && segments.length) {
      pendingSeek.current = 0;
      setCurrentId(segments[0].id);
    }
    setPlaying(p => !p);
  };

  // Scrubbing: click or drag anywhere on the bar.
  const scrubAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || total === 0) return;
    seekTo(((clientX - rect.left) / rect.width) * total);
  };

  const currentItemIdx = current ? items.findIndex(it => it.id === current.id) : -1;
  const readyCount = segments.length;
  const pendingCount = items.filter(it => clips[it.id]?.status === 'pending').length;
  const errorCount = items.filter(it => clips[it.id]?.status === 'error').length;

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, background: '#fffbe6',
      borderTop: '3px solid #000', boxShadow: '0 -4px 0 #000', padding: '10px 16px',
    }}>
      <audio
        ref={audioRef}
        preload="auto"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio && pendingSeek.current !== null) {
            audio.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
          if (playing) audio?.play().catch(() => setPlaying(false));
        }}
        onTimeUpdate={() => setOffset(audioRef.current?.currentTime ?? 0)}
        onEnded={() => {
          const next = segments[index + 1];
          if (next) {
            seekTo(next.start);
          } else {
            setPlaying(false);
          }
        }}
      />
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <PlayerButton onClick={() => step(-1)} title="Previous item">⏮</PlayerButton>
          <PlayerButton onClick={togglePlay} title={playing ? 'Pause' : 'Play'} wide disabled={!readyCount}>{playing ? '⏸' : '▶'}</PlayerButton>
          <PlayerButton onClick={() => step(1)} title="Next item">⏭</PlayerButton>
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 15, minWidth: 130 }}>
            {formatTime(time)} / {formatTime(total)}
          </span>
          <button
            onClick={() => current && document.getElementById(`item-${current.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            title="Show in timeline"
            style={{ flex: 1, textAlign: 'left', fontWeight: 'bold', fontSize: 16, background: 'none', border: 'none', cursor: current ? 'pointer' : 'default', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
          >
            {current ? itemLabel(items, currentItemIdx) : 'Press play to hear the timeline'}
          </button>
          <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
            {readyCount}/{items.length} ready
            {pendingCount > 0 && ` · ⏳ ${pendingCount}`}
            {errorCount > 0 && <span style={{ color: '#c00' }}> · ❌ {errorCount}</span>}
          </span>
        </div>
        <div
          ref={barRef}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e.clientX); }}
          onPointerMove={e => { if (e.buttons === 1) scrubAt(e.clientX); }}
          style={{ position: 'relative', height: 28, display: 'flex', border: '2px solid #000', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: '#fff', touchAction: 'none' }}
        >
          {segments.map(seg => {
            const item = items.find(it => it.id === seg.id)!;
            return (
              <div
                key={seg.id}
                title={itemLabel(items, items.indexOf(item))}
                style={{
                  flex: `${seg.duration} 0 0`, background: SEGMENT_COLORS[item.type],
                  borderRight: '1px solid rgba(0,0,0,0.35)', opacity: seg.id === current?.id ? 1 : 0.75,
                }}
              />
            );
          })}
          {total > 0 && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(time / total) * 100}%`, width: 3, background: '#000', pointerEvents: 'none' }} />
          )}
        </div>
      </div>
    </div>
  );
});
TimelinePlayer.displayName = 'TimelinePlayer';

const PlayerButton: React.FC<{ onClick: () => void; title: string; wide?: boolean; disabled?: boolean; children: React.ReactNode }> = ({ onClick, title, wide, disabled, children }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    style={{
      fontSize: 18, fontWeight: 'bold', border: '2px solid #000', borderRadius: 6, background: disabled ? '#ddd' : '#baffc9',
      boxShadow: '2px 2px 0 #000', padding: '2px 0', width: wide ? 52 : 40, cursor: disabled ? 'not-allowed' : 'pointer',
    }}
  >
    {children}
  </button>
);
