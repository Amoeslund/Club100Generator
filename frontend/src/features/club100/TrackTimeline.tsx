import React, { useMemo, useState } from 'react';
import { TrackItem, Effect } from './types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { youtubeSearch } from './api';
import { effectItem, formatTime, parseImportLine, sectionItem, snippetItem, songItem } from './timeline';
import { ClipState } from './useClips';
import { SongEditor } from './SongEditor';
import { EffectPicker } from './EffectPicker';

type RecorderInstance = { stop: () => Promise<{ blob: Blob }>; start: () => void; init: (s: MediaStream) => Promise<void> };
type Updater = (update: (prev: TrackItem[]) => TrackItem[]) => void;

const END = '__end';

/** Insert `item` after the item with `afterId` (or at the end for END). */
function insertAfterId(items: TrackItem[], afterId: string, item: TrackItem): TrackItem[] {
  const idx = afterId === END ? items.length - 1 : items.findIndex(it => it.id === afterId);
  const next = [...items];
  next.splice(idx + 1, 0, item);
  return next;
}

export const TrackTimeline: React.FC<{
  items: TrackItem[];
  onChange: Updater;
  effects: Effect[];
  clips: Record<string, ClipState>;
  activeItemId: string | null;
  onPlayItem: (id: string) => void;
  onRetryClip: (item: TrackItem) => void;
  headerExtra?: React.ReactNode;
}> = ({ items, onChange, effects, clips, activeItemId, onPlayItem, onRetryClip, headerExtra }) => {
  const [editorId, setEditorId] = useState<string | null>(null);
  const [insertAfter, setInsertAfter] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const songNumbers = useMemo(() => {
    let n = 0;
    return items.map(it => (it.type === 'song' ? ++n : null));
  }, [items]);
  const songCount = songNumbers.filter(n => n !== null).length;

  const update = (id: string, next: TrackItem) => onChange(prev => prev.map(it => (it.id === id ? next : it)));
  const remove = (item: TrackItem) => {
    if (item.type === 'snippet' && !window.confirm('Delete this recording? You can only get it back from a backup.')) return;
    onChange(prev => prev.filter(it => it.id !== item.id));
  };
  const insert = (afterId: string, item: TrackItem) => {
    onChange(prev => insertAfterId(prev, afterId, item));
    setInsertAfter(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(prev => {
      const from = prev.findIndex(it => it.id === active.id);
      const to = prev.findIndex(it => it.id === over.id);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  return (
    <section aria-labelledby="c100-order-title">
      <div className="c100-list-head">
        <h2 id="c100-order-title" className="c100-panel-title">
          Running order <span className="c100-muted">{songCount} {songCount === 1 ? 'song' : 'songs'}</span>
        </h2>
        <div className="c100-inline">
          {headerExtra}
          {items.length > 0 && (
            <button
              type="button"
              className="c100-btn c100-btn-quiet c100-btn-danger"
              onClick={() => {
                if (window.confirm(`Remove all ${items.length} items from the running order? Today's automatic backup still has the version from when you opened the page.`)) onChange(() => []);
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>
      <div className="c100-list">
        {items.length === 0 && (
          <div className="c100-empty">The running order is empty. Add songs with the panel above, or add one below.</div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
            {items.map((item, i) => (
              <TimelineRow
                key={item.id}
                item={item}
                songNumber={songNumbers[i]}
                clip={clips[item.id]}
                active={item.id === activeItemId}
                editorOpen={editorId === item.id}
                insertOpen={insertAfter === item.id}
                effects={effects}
                onUpdate={next => update(item.id, next)}
                onRemove={() => remove(item)}
                onPlay={() => onPlayItem(item.id)}
                onRetry={() => onRetryClip(item)}
                onToggleEditor={() => setEditorId(id => (id === item.id ? null : item.id))}
                onToggleInsert={() => setInsertAfter(id => (id === item.id ? null : item.id))}
                onInsert={newItem => insert(item.id, newItem)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {insertAfter === END ? (
          <InsertPanel effects={effects} onInsert={newItem => insert(END, newItem)} onClose={() => setInsertAfter(null)} end />
        ) : (
          <div className="c100-insert c100-insert-end">
            <button type="button" className="c100-btn" onClick={() => setInsertAfter(END)}>+ Add at the end</button>
          </div>
        )}
      </div>
    </section>
  );
};

// Module level so rows keep their state (open editor, playing previews) across re-renders.
const TimelineRow: React.FC<{
  item: TrackItem;
  songNumber: number | null;
  clip: ClipState | undefined;
  active: boolean;
  editorOpen: boolean;
  insertOpen: boolean;
  effects: Effect[];
  onUpdate: (item: TrackItem) => void;
  onRemove: () => void;
  onPlay: () => void;
  onRetry: () => void;
  onToggleEditor: () => void;
  onToggleInsert: () => void;
  onInsert: (item: TrackItem) => void;
}> = ({ item, songNumber, clip, active, editorOpen, insertOpen, effects, onUpdate, onRemove, onPlay, onRetry, onToggleEditor, onToggleInsert, onInsert }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const handle = (
    <button type="button" className="c100-handle" aria-label="Drag to reorder (or press space, then arrow keys)" {...attributes} {...listeners}>
      ⠿
    </button>
  );
  const actions = (
    <div className="c100-row-actions">
      {item.type !== 'section' && <ClipControl clip={clip} onPlay={onPlay} onRetry={onRetry} />}
      {item.type === 'song' && (
        <button type="button" className="c100-icon" onClick={onToggleEditor} aria-expanded={editorOpen}>
          {editorOpen ? 'Done' : 'Edit clip'}
        </button>
      )}
      <button type="button" className="c100-icon c100-reveal" onClick={onToggleInsert} aria-expanded={insertOpen} aria-label="Insert below">+</button>
      <button type="button" className="c100-icon c100-reveal" onClick={onRemove} aria-label="Remove">✕</button>
    </div>
  );

  let body: React.ReactNode;
  if (item.type === 'section') {
    body = (
      <>
        {handle}
        <input
          className="c100-section-title"
          defaultValue={item.section.title}
          placeholder="Name this section"
          aria-label="Section title"
          onBlur={e => { if (e.target.value !== item.section.title) onUpdate({ ...item, section: { title: e.target.value } }); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        {actions}
      </>
    );
  } else {
    let title: React.ReactNode;
    let sub: React.ReactNode;
    const seconds = clip?.status === 'ready' && clip.duration ? `${Math.round(clip.duration)}s` : null;
    if (item.type === 'song') {
      title = item.song.title;
      const start = item.song.start;
      const length = item.song.end !== undefined && start !== undefined ? Math.min(60, item.song.end - start) : 60;
      sub = start === undefined ? 'Random start' : `${formatTime(start, true)}–${formatTime(start + length, true)}`;
    } else if (item.type === 'effect') {
      title = item.effect.name;
      sub = seconds ? `Sound effect, ${seconds}` : 'Sound effect';
    } else {
      title = (
        <input
          className="c100-section-title"
          style={{ fontSize: 15, fontWeight: 600 }}
          defaultValue={item.snippet.label ?? ''}
          placeholder="Recording (click to name it)"
          aria-label="Recording name"
          onBlur={e => {
            const label = e.target.value.trim() || undefined;
            if (label !== item.snippet.label) onUpdate({ ...item, snippet: { ...item.snippet, label } });
          }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      );
      sub = seconds ? `Recording, ${seconds}` : 'Recording';
    }
    body = (
      <>
        {handle}
        <span className="c100-num" aria-label={songNumber ? `Minute ${songNumber}` : undefined}>{songNumber ?? ''}</span>
        <div className="c100-row-main">
          <div className="c100-row-title" title={typeof title === 'string' ? title : undefined}>{title}</div>
          <div className="c100-row-sub">
            {sub}
            {clip?.status === 'error' && <span className="c100-error"> {clip.error}</span>}
          </div>
        </div>
        {actions}
      </>
    );
  }

  return (
    <div
      ref={setNodeRef}
      id={`item-${item.id}`}
      className={`c100-item${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className={`c100-row${active ? ' is-active' : ''}`} data-type={item.type}>{body}</div>
      {item.type === 'song' && editorOpen && (
        <SongEditor
          song={item.song}
          onChange={(start, end) => onUpdate({ ...item, song: { ...item.song, start, end } })}
          onClose={onToggleEditor}
        />
      )}
      {insertOpen && <InsertPanel effects={effects} onInsert={onInsert} onClose={onToggleInsert} />}
    </div>
  );
};

/** Play button once the clip is ready; spinner while preparing; retry when it failed. */
const ClipControl: React.FC<{ clip: ClipState | undefined; onPlay: () => void; onRetry: () => void }> = ({ clip, onPlay, onRetry }) => {
  if (clip?.status === 'ready') {
    return <button type="button" className="c100-icon c100-clip is-ready" onClick={onPlay} aria-label="Play from here">▶</button>;
  }
  if (clip?.status === 'error') {
    return <button type="button" className="c100-icon c100-clip is-error" onClick={onRetry} aria-label={`Retry. ${clip.error ?? 'The clip failed'}`} title={clip.error}>↻</button>;
  }
  return <span className="c100-icon c100-clip is-pending" role="status" aria-label="Preparing clip"><span className="c100-spin">◌</span></span>;
};

type InsertKind = 'song' | 'snippet' | 'effect' | 'section';

/** Add a song, recording, sound effect or section at a specific spot in the running order. */
const InsertPanel: React.FC<{ effects: Effect[]; onInsert: (item: TrackItem) => void; onClose: () => void; end?: boolean }> = ({ effects, onInsert, onClose, end }) => {
  const [kind, setKind] = useState<InsertKind>('song');
  const tabs: [InsertKind, string][] = [['song', 'Song'], ['snippet', 'Recording'], ['effect', 'Sound effect'], ['section', 'Section']];
  return (
    <div className={`c100-insert${end ? ' c100-insert-end' : ''}`}>
      <div className="c100-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" className="c100-tab" aria-selected={kind === k} onClick={() => setKind(k)}>{label}</button>
        ))}
        <button type="button" className="c100-tab" style={{ marginLeft: 'auto' }} onClick={onClose}>Cancel</button>
      </div>
      {kind === 'song' && <SongInsert onInsert={onInsert} />}
      {kind === 'snippet' && <RecordingInsert onInsert={onInsert} />}
      {kind === 'effect' && <EffectInsert effects={effects} onInsert={onInsert} />}
      {kind === 'section' && <SectionInsert onInsert={onInsert} />}
    </div>
  );
};

const SongInsert: React.FC<{ onInsert: (item: TrackItem) => void }> = ({ onInsert }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseImportLine(text);
    if (!parsed) return;
    setError(null);
    if (parsed.kind === 'url') {
      onInsert(songItem(parsed.song));
      return;
    }
    setBusy(true);
    try {
      const [first] = await youtubeSearch(parsed.query);
      if (first) onInsert(songItem(first));
      else setError(`No YouTube results for "${parsed.query}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
    setBusy(false);
  };
  return (
    <form className="c100-inline" onSubmit={submit}>
      <input className="c100-input" autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="YouTube link (a ?t= start is kept) or a song to search for" />
      <button type="submit" className="c100-btn c100-btn-primary" disabled={!text.trim() || busy}>{busy ? 'Searching…' : 'Add song'}</button>
      {error && <span className="c100-error">{error}</span>}
    </form>
  );
};

const RecordingInsert: React.FC<{ onInsert: (item: TrackItem) => void }> = ({ onInsert }) => {
  const [audio, setAudio] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<RecorderInstance | null>(null);
  const [context, setContext] = useState<AudioContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setAudio(null);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      setContext(ctx);
      const Recorder = (await import('recorder-js')).default;
      const rec = new Recorder(ctx, { type: 'wav' });
      await rec.init(stream);
      setRecorder(rec);
      rec.start();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? `Could not start the microphone: ${err.message}` : 'Could not start the microphone');
    }
  };
  const stop = async () => {
    if (!recorder) return;
    const { blob } = await recorder.stop();
    const reader = new FileReader();
    reader.onloadend = () => setAudio(reader.result as string);
    reader.readAsDataURL(blob);
    setRecording(false);
    setRecorder(null);
    context?.close();
    setContext(null);
  };

  return (
    <div className="c100-stack">
      <div className="c100-inline">
        {!recording && !audio && <button type="button" className="c100-btn c100-btn-primary" onClick={start}>Record</button>}
        {recording && <button type="button" className="c100-btn c100-btn-danger" onClick={stop}>Stop recording</button>}
        {audio && (
          <>
            <audio controls src={audio} style={{ height: 32 }} />
            <button type="button" className="c100-btn c100-btn-quiet" onClick={() => setAudio(null)}>Record again</button>
          </>
        )}
        {!recording && (
          <label className="c100-btn">
            Upload a file
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onloadend = () => setAudio(reader.result as string);
                reader.readAsDataURL(file);
                if (!label) setLabel(file.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </label>
        )}
      </div>
      {audio && (
        <div className="c100-inline">
          <input className="c100-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Name (optional)" />
          <button type="button" className="c100-btn c100-btn-primary" onClick={() => onInsert(snippetItem({ type: 'upload', audioUrl: audio, label: label.trim() || undefined }))}>
            Add recording
          </button>
        </div>
      )}
      {error && <span className="c100-error">{error}</span>}
    </div>
  );
};

const EffectInsert: React.FC<{ effects: Effect[]; onInsert: (item: TrackItem) => void }> = ({ effects, onInsert }) => (
  <EffectPicker effects={effects} onAdd={effect => onInsert(effectItem(effect))} addLabel="Add here" autoFocus />
);

const SectionInsert: React.FC<{ onInsert: (item: TrackItem) => void }> = ({ onInsert }) => {
  const [title, setTitle] = useState('');
  return (
    <form className="c100-inline" onSubmit={e => { e.preventDefault(); onInsert(sectionItem({ title: title.trim() })); }}>
      <input className="c100-input" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Section name, e.g. Warm-up or 90s hits" />
      <button type="submit" className="c100-btn c100-btn-primary">Add section</button>
      <span className="c100-muted">Sections group what follows them. They add no sound.</span>
    </form>
  );
};

export default TrackTimeline;
