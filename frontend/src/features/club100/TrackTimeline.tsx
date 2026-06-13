import React, { useRef, useState } from 'react';
import { TrackItem, Song, Snippet, Effect } from './types';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getEffectAudioUrl } from './api';
import { getYoutubeId, songNumberAt } from './timeline';

type RecorderInstance = { stop: () => Promise<{ blob: Blob }>; start: () => void; init: (s: MediaStream) => Promise<void> };

export const TrackTimeline: React.FC<{
  items: TrackItem[];
  onUpdateItem: (idx: number, item: TrackItem) => void;
  onRemoveItem: (idx: number) => void;
  onMoveItem: (from: number, to: number) => void;
  onAddSong: (song: Song) => void;
  onAddSnippet: (snippet: Snippet, idx: number) => void;
  onAddEffect: (effect: Effect, idx: number) => void;
  onClearTimeline: () => void;
  effects: Effect[];
  addEffectIdx: number | null;
  setAddEffectIdx: (idx: number | null) => void;
  selectedEffectId: string;
  setSelectedEffectId: (id: string) => void;
}> = ({ items, onUpdateItem, onRemoveItem, onMoveItem, onAddSong, onAddSnippet, onAddEffect, onClearTimeline, effects, addEffectIdx, setAddEffectIdx, selectedEffectId, setSelectedEffectId }) => {
  // Inline snippet add state (shared across the add-controls instances)
  const [addSnippetIdx, setAddSnippetIdx] = useState<number | null>(null);
  const [newSnippetAudio, setNewSnippetAudio] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorderInstance, setRecorderInstance] = useState<RecorderInstance | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Recording logic
  const handleStartRecording = async () => {
    setNewSnippetAudio(null);
    setRecording(true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    setAudioContext(context);
    const Recorder = (await import('recorder-js')).default;
    const recorder = new Recorder(context, { type: 'wav' });
    await recorder.init(stream);
    setRecorderInstance(recorder);
    recorder.start();
  };
  const handleStopRecording = async () => {
    if (recorderInstance) {
      const { blob } = await recorderInstance.stop();
      const reader = new FileReader();
      reader.onloadend = () => setNewSnippetAudio(reader.result as string);
      reader.readAsDataURL(blob);
      setRecording(false);
      setRecorderInstance(null);
      if (audioContext) {
        audioContext.close();
        setAudioContext(null);
      }
    }
  };

  const handleAddSnippetAt = (idx: number) => {
    setAddSnippetIdx(idx);
    setNewSnippetAudio(null);
  };
  const handleSubmitSnippet = () => {
    if (newSnippetAudio && addSnippetIdx !== null) {
      onAddSnippet({ type: 'upload', audioUrl: newSnippetAudio }, addSnippetIdx);
      setAddSnippetIdx(null);
      setNewSnippetAudio(null);
    }
  };
  const handleCancelSnippet = () => {
    setAddSnippetIdx(null);
    setNewSnippetAudio(null);
    setRecording(false);
  };

  // Song add (prompt for now)
  const handleAddSongAt = () => {
    const url = window.prompt('YouTube URL?');
    if (!url) return;
    const title = window.prompt('Song title?') || url;
    onAddSong({ url, title });
  };

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex(it => it.id === active.id);
    const to = items.findIndex(it => it.id === over.id);
    if (from !== -1 && to !== -1 && from !== to) onMoveItem(from, to);
  };

  // Shared add-controls block, rendered after each item and at the end of the list.
  const AddControls: React.FC<{ idx: number }> = ({ idx }) => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
      <button onClick={handleAddSongAt} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffd6a5', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Song</button>
      <button onClick={() => setAddEffectIdx(idx)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#a5d8ff', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Effect</button>
      {addEffectIdx === idx && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e6f7ff', border: '2px solid #888', borderRadius: 6, padding: 8 }}>
          <select value={selectedEffectId} onChange={e => setSelectedEffectId(e.target.value)} style={{ fontSize: 15, border: '1px solid #888', borderRadius: 4, marginRight: 8 }}>
            <option value="">Select effect...</option>
            {effects.map(effect => (
              <option key={effect.id} value={effect.id}>{effect.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              const effect = effects.find(e => e.id === selectedEffectId);
              if (effect) {
                onAddEffect(effect, idx);
                setAddEffectIdx(null);
                setSelectedEffectId('');
              }
            }}
            style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }}
            disabled={!selectedEffectId}
          >
            Add
          </button>
          <button
            onClick={() => { setAddEffectIdx(null); setSelectedEffectId(''); }}
            style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}
          >
            Cancel
          </button>
        </div>
      )}
      {addSnippetIdx === idx ? (
        <div style={{ background: '#fffbe6', border: '2px solid #888', borderRadius: 6, padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            {!recording && !newSnippetAudio && (
              <button onClick={handleStartRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffd6a5', padding: '4px 12px' }}>🎤 Record</button>
            )}
            {recording && (
              <button onClick={handleStopRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffaaaa', padding: '4px 12px' }}>⏹ Stop</button>
            )}
            {newSnippetAudio && (
              <>
                <audio ref={audioRef} controls src={newSnippetAudio} style={{ height: 32 }} />
                <button onClick={() => setNewSnippetAudio(null)} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#eee', padding: '2px 8px' }}>Re-record</button>
              </>
            )}
            <label style={{ fontWeight: 'bold', border: '1px solid #000', borderRadius: 6, background: '#ffe6f7', padding: '4px 14px', cursor: 'pointer', display: 'inline-block' }}>
              Upload
              <input
                type="file"
                accept="audio/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setNewSnippetAudio(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={handleSubmitSnippet} style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }} disabled={!newSnippetAudio}>Add</button>
            <button onClick={handleCancelSnippet} style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => handleAddSnippetAt(idx)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffe6f7', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Snippet</button>
      )}
    </div>
  );

  // Sortable item component
  const SortableTrackItem: React.FC<{ item: TrackItem; i: number }> = ({ item, i }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const bgColor = item.type === 'song'
      ? (isDragging ? '#ffe6a5' : '#fffbe6')
      : (isDragging ? '#ffb3de' : '#ffe6f7');
    const songNumber = songNumberAt(items, i);
    const [startValue, setStartValue] = useState(item.type === 'song' && item.song.start !== undefined ? String(item.song.start) : '');
    const [previewOpen, setPreviewOpen] = useState(false);
    React.useEffect(() => {
      if (item.type === 'song') setStartValue(item.song.start !== undefined ? String(item.song.start) : '');
    }, [item.type === 'song' ? item.song.start : undefined]);
    return (
      <>
        <div
          ref={setNodeRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 6,
            background: bgColor,
            border: '3px solid #000',
            borderRadius: 8,
            boxShadow: isDragging ? '0 0 0 4px #000' : '4px 4px 0 #000',
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.7 : 1,
            cursor: 'default',
          }}
        >
          {songNumber !== null && (
            <span
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, minWidth: 36, minHeight: 36, marginRight: 10,
                fontWeight: 'bold', fontSize: 18, border: '2px solid #000', borderRadius: 8,
                background: '#fffbe6', boxShadow: '2px 2px 0 #000',
              }}
            >
              {songNumber}
            </span>
          )}
          <span
            {...attributes}
            {...listeners}
            style={{ cursor: 'grab', userSelect: 'none', fontSize: 22, marginRight: 12, padding: '0 6px', display: 'flex', alignItems: 'center' }}
            aria-label="Drag handle"
            tabIndex={0}
          >
            ☰
          </span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            {item.type === 'song' ? (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <span
                  style={{
                    fontWeight: 'bold', color: '#333', fontSize: 18, maxWidth: '50%',
                    wordBreak: 'break-word', whiteSpace: 'normal', overflowWrap: 'break-word',
                    overflow: 'hidden', display: 'block', flex: '0 0 50%',
                  }}
                >
                  {item.song.title}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    value={startValue}
                    onChange={e => setStartValue(e.target.value)}
                    onBlur={() => {
                      const start = startValue === '' ? undefined : Number(startValue);
                      if (item.type === 'song' && item.song.start !== start) {
                        onUpdateItem(i, { ...item, song: { ...item.song, start } });
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder="Start (s)"
                    style={{
                      width: 70, fontSize: 15, fontWeight: 'bold', border: '3px solid #000',
                      borderRadius: 6, background: '#fffbe6', boxShadow: '2px 2px 0 #000',
                      padding: '6px 8px', MozAppearance: 'textfield', appearance: 'textfield',
                    }}
                    title="Start time in seconds (optional)"
                    className="no-spinner"
                  />
                  <button
                    onClick={e => { e.stopPropagation(); setPreviewOpen(o => !o); }}
                    style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#e6f7ff', padding: '2px 10px', boxShadow: '2px 2px 0 #000', cursor: 'pointer' }}
                  >
                    {previewOpen ? 'Close Preview' : 'Preview'}
                  </button>
                  <button onClick={() => onRemoveItem(i)} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>✕</button>
                </div>
              </div>
            ) : item.type === 'effect' ? (
              <EffectTimelineItem effect={item.effect} onRemove={() => onRemoveItem(i)} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <audio controls src={item.snippet.audioUrl || ''} style={{ marginRight: 8, height: 32, background: '#fff', flex: 1 }} />
                <button onClick={() => onRemoveItem(i)} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000', marginLeft: 'auto' }}>✕</button>
              </div>
            )}
          </div>
        </div>
        {item.type === 'song' && previewOpen && getYoutubeId(item.song.url) && (
          <div style={{ margin: '8px 0 16px 0', display: 'flex', justifyContent: 'center' }}>
            <iframe
              width="360"
              height="203"
              src={`https://www.youtube.com/embed/${getYoutubeId(item.song.url)}?autoplay=1`}
              title="YouTube preview"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ borderRadius: 8, border: '2px solid #000', boxShadow: '2px 2px 0 #000' }}
            />
          </div>
        )}
        <AddControls idx={i} />
      </>
    );
  };

  return (
    <div style={{ border: '3px solid black', padding: 12, marginBottom: 16, background: '#e6f7ff', borderRadius: 8, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold' }}>Timeline (edit, add, reorder):</span>
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to clear the entire timeline?')) onClearTimeline();
          }}
          style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 6, background: '#ffd6a5', boxShadow: '2px 2px 0 #000', padding: '6px 18px', color: '#c00', marginLeft: 12, cursor: 'pointer' }}
        >
          Clear Timeline
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableTrackItem key={item.id} item={item} i={i} />
          ))}
        </SortableContext>
      </DndContext>
      {/* Add at end (not draggable) */}
      <AddControls idx={items.length} />
      {/* Hide number input spinners for Chrome, Safari, Edge */}
      <style>{`
        input.no-spinner::-webkit-outer-spin-button,
        input.no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input.no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
};

// EffectTimelineItem: plays the effect audio served directly by the backend.
const EffectTimelineItem: React.FC<{ effect: Effect; onRemove: () => void }> = ({ effect, onRemove }) => (
  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
    <span style={{ fontWeight: 'bold', color: '#333', fontSize: 18, flex: 1 }}>{effect.name}</span>
    <audio controls src={getEffectAudioUrl(effect)} style={{ marginRight: 8, height: 32, background: '#fff' }} />
    <button onClick={onRemove} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000', marginLeft: 'auto' }}>✕</button>
  </div>
);

export default TrackTimeline;
