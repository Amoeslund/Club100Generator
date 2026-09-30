import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Song } from './types';
import { fetchSongPeaks, findBestStart, getSongAudioUrl, SongPeaks } from './api';
import { formatTime, getYoutubeId, parseTimeInput } from './timeline';

const CLIP_SECONDS = 60;
const HEIGHT = 88;
const EDGE_GRAB_PX = 8;
// Canvas can't read CSS variables cheaply; these mirror the tokens in club100.css.
const COLORS = { bar: '#b9bdcc', barIn: '#1d1b3a', window: '#fff4c2', edge: '#1d1b3a', playhead: '#e4002b' };

// 'press' is a pointer down inside the clip: a click there seeks, only real movement drags the clip.
type DragMode = 'start' | 'end' | 'move' | 'seek' | 'press';
const DRAG_THRESHOLD_PX = 4;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pick a song's clip on the full downloaded audio: click to listen anywhere, drag the window to
 * move it, drag its edges to set start and (optional) end. Changes are applied when you let go.
 */
export const SongEditor: React.FC<{
  song: Song;
  onChange: (start: number | undefined, end: number | undefined) => void;
  onClose: () => void;
}> = ({ song, onChange, onClose }) => {
  const videoId = getYoutubeId(song.url);
  const [peaks, setPeaks] = useState<SongPeaks | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [start, setStart] = useState(song.start ?? 0);
  const [end, setEnd] = useState<number | undefined>(song.end);
  const [playhead, setPlayhead] = useState(song.start ?? 0);
  const [playing, setPlaying] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [width, setWidth] = useState(600);
  const original = useRef({ start: song.start, end: song.end });
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; offset: number; downX: number } | null>(null);
  const stopAt = useRef<number | null>(null);

  const duration = peaks?.duration ?? 0;
  const length = Math.min(end !== undefined ? end - start : CLIP_SECONDS, CLIP_SECONDS, Math.max(0, duration - start));

  // Follow external changes (e.g. best-minute button elsewhere) when not dragging.
  useEffect(() => {
    if (drag.current) return;
    setStart(song.start ?? 0);
    setEnd(song.end);
  }, [song.start, song.end]);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    fetchSongPeaks(videoId).then(p => !cancelled && setPeaks(p), e => !cancelled && setLoadError(e.message));
    return () => { cancelled = true; };
  }, [videoId]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Smooth playhead while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        if (stopAt.current !== null && audio.currentTime >= stopAt.current) {
          audio.pause();
          stopAt.current = null;
        }
        setPlayhead(audio.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);
    const x = (t: number) => (t / duration) * width;
    const winStart = x(start);
    const winEnd = x(start + length);
    ctx.fillStyle = COLORS.window;
    ctx.fillRect(winStart, 0, winEnd - winStart, HEIGHT);
    const per = peaks.peaks.length / width;
    for (let px = 0; px < width; px += 2) {
      let v = 0;
      for (let i = Math.floor(px * per); i < Math.min(peaks.peaks.length, Math.ceil((px + 2) * per)); i++) v = Math.max(v, peaks.peaks[i]);
      const h = Math.max(1, v * (HEIGHT - 12));
      ctx.fillStyle = px >= winStart && px <= winEnd ? COLORS.barIn : COLORS.bar;
      ctx.fillRect(px, (HEIGHT - h) / 2, 1.5, h);
    }
    ctx.fillStyle = COLORS.edge;
    ctx.fillRect(winStart - 1.5, 0, 3, HEIGHT);
    ctx.fillRect(winEnd - 1.5, 0, 3, HEIGHT);
    ctx.fillStyle = COLORS.playhead;
    ctx.fillRect(x(playhead) - 1, 0, 2, HEIGHT);
  }, [peaks, width, duration, start, length, playhead]);
  useEffect(draw, [draw]);

  const commit = (s: number, e: number | undefined) => {
    const nextEnd = e !== undefined && e - s >= CLIP_SECONDS - 0.05 ? undefined : e;
    if (s !== song.start || nextEnd !== song.end) onChange(round1(s), nextEnd === undefined ? undefined : round1(nextEnd));
  };

  const timeAt = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  };

  const seek = (t: number) => {
    setPlayhead(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!duration) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    const t = timeAt(e.clientX);
    const px = (tt: number) => (tt / duration) * width;
    const clickPx = px(t);
    let mode: DragMode = 'seek';
    if (Math.abs(clickPx - px(start)) <= EDGE_GRAB_PX) mode = 'start';
    else if (Math.abs(clickPx - px(start + length)) <= EDGE_GRAB_PX) mode = 'end';
    else if (t > start && t < start + length) mode = 'press';
    drag.current = { mode, offset: t - start, downX: e.clientX };
    if (mode === 'seek') {
      stopAt.current = null;
      seek(t);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!duration || !wrap) return;
    const t = timeAt(e.clientX);
    if (!drag.current) {
      const px = (tt: number) => (tt / duration) * width;
      const p = px(t);
      const onEdge = Math.abs(p - px(start)) <= EDGE_GRAB_PX || Math.abs(p - px(start + length)) <= EDGE_GRAB_PX;
      wrap.style.cursor = onEdge ? 'col-resize' : t > start && t < start + length ? 'grab' : 'pointer';
      return;
    }
    if (drag.current.mode === 'press' && Math.abs(e.clientX - drag.current.downX) > DRAG_THRESHOLD_PX) drag.current.mode = 'move';
    const { mode, offset } = drag.current;
    if (mode === 'seek') seek(t);
    if (mode === 'start') {
      const limitEnd = end ?? start + length;
      setStart(round1(Math.max(end !== undefined ? Math.max(0, end - CLIP_SECONDS) : 0, Math.min(t, limitEnd - 1))));
    }
    if (mode === 'end') setEnd(round1(Math.max(start + 1, Math.min(t, start + CLIP_SECONDS, duration))));
    if (mode === 'move') {
      const s = round1(Math.max(0, Math.min(duration - length, t - offset)));
      if (end !== undefined) setEnd(round1(s + (end - start)));
      setStart(s);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const mode = drag.current?.mode;
    drag.current = null;
    if (mode === 'press') {
      stopAt.current = null;
      seek(timeAt(e.clientX));
    } else if (mode && mode !== 'seek') commit(start, end);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      stopAt.current = null;
      audio.play();
    } else audio.pause();
  };

  const playClip = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = start;
    stopAt.current = start + length;
    audio.play();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -step : step;
    const s = round1(Math.max(0, Math.min(duration - length, start + delta)));
    if (end !== undefined) setEnd(round1(s + (end - start)));
    setStart(s);
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const { start: best } = await findBestStart(song.url);
      setStart(best);
      setEnd(undefined);
      commit(best, undefined);
      seek(best);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not find a best minute');
    }
    setSuggesting(false);
  };

  const changed = original.current.start !== song.start || original.current.end !== song.end;

  return (
    <div className="c100-editor">
      <div className="c100-editor-head">
        <span className="c100-editor-window">
          Clip {formatTime(start, true)}–{formatTime(start + length, true)} <span className="c100-muted">({Math.round(length * 10) / 10}s)</span>
        </span>
        {videoId && (
          <a className="c100-muted" href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}`} target="_blank" rel="noreferrer">
            Open on YouTube
          </a>
        )}
        <button type="button" className="c100-btn c100-btn-quiet" onClick={onClose} aria-label="Close editor">Close</button>
      </div>

      <div
        ref={wrapRef}
        className="c100-wave"
        role="slider"
        tabIndex={0}
        aria-label="Clip start. Arrow keys move it by 0.1s, Shift+arrow by 1s."
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={start}
        aria-valuetext={`Clip starts at ${formatTime(start, true)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') commit(start, end); }}
      >
        {peaks ? (
          <canvas ref={canvasRef} style={{ width, height: HEIGHT, display: 'block' }} />
        ) : (
          <div className="c100-wave-empty">{loadError ?? 'Loading the song…'}</div>
        )}
      </div>
      {duration > 0 && (
        <div className="c100-wave-scale c100-muted">
          <span>0:00</span>
          <span>{formatTime(playhead, true)}: click anywhere to listen from there, drag the clip or its edges to change it</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}

      <div className="c100-editor-controls">
        <button type="button" className="c100-btn" onClick={togglePlay} disabled={!peaks}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" className="c100-btn" onClick={playClip} disabled={!peaks}>Play clip</button>
        <TimeField
          label="Start"
          value={start}
          onCommit={v => {
            if (v === undefined) return;
            setStart(v);
            commit(v, end);
            seek(v);
          }}
        />
        <TimeField
          label="End"
          value={end}
          placeholder="+60s"
          onCommit={v => {
            const e = v !== undefined && v > start ? Math.min(v, start + CLIP_SECONDS) : undefined;
            setEnd(e);
            commit(start, e);
          }}
        />
        <button type="button" className="c100-btn" onClick={() => { setStart(round1(playhead)); commit(round1(playhead), end !== undefined && end > playhead ? end : undefined); }} disabled={!peaks}>
          Start here
        </button>
        <button type="button" className="c100-btn" onClick={() => { if (playhead > start) { const e = round1(Math.min(playhead, start + CLIP_SECONDS)); setEnd(e); commit(start, e); } }} disabled={!peaks || playhead <= start}>
          End here
        </button>
        <button type="button" className="c100-btn" onClick={suggest} disabled={suggesting}>{suggesting ? 'Finding…' : 'Suggest best minute'}</button>
        {changed && (
          <button type="button" className="c100-btn c100-btn-quiet" onClick={() => onChange(original.current.start, original.current.end)}>Undo changes</button>
        )}
      </div>

      {videoId && (
        <audio
          ref={audioRef}
          src={getSongAudioUrl(videoId)}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onSeeked={() => setPlayhead(audioRef.current?.currentTime ?? 0)}
        />
      )}
    </div>
  );
};

/** m:ss(.t) text field that commits on blur or Enter; empty commits undefined. */
const TimeField: React.FC<{ label: string; value: number | undefined; placeholder?: string; onCommit: (v: number | undefined) => void }> = ({ label, value, placeholder, onCommit }) => {
  const [text, setText] = useState(value === undefined ? '' : formatTime(value, true));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(value === undefined ? '' : formatTime(value, true)), [value]);
  return (
    <label className="c100-timefield">
      <span>{label}</span>
      <input
        className="c100-input"
        value={text}
        placeholder={placeholder}
        aria-invalid={invalid}
        onChange={e => { setText(e.target.value); setInvalid(false); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onBlur={() => {
          const v = parseTimeInput(text);
          if (v === null) { setInvalid(true); return; }
          onCommit(v);
        }}
      />
    </label>
  );
};
