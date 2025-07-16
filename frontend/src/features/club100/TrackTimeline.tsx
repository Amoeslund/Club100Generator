/**
 * TrackTimeline.tsx
 *
 * Timeline editor for Club 100 Generator. Allows users to add, edit, reorder, and preview songs, snippets (TTS or upload/recorded), and sound effects.
 * Supports drag-and-drop reordering, inline editing, and YouTube preview. Integrates with dnd-kit for drag-and-drop and recorder-js for audio recording.
 */
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
import { getEffectDataUrl } from './api';

/**
 * Main timeline editor for arranging songs, snippets, and effects.
 * @param items List of timeline items (songs, snippets, effects)
 * @param onUpdateItem Callback to update a timeline item
 * @param onRemoveItem Callback to remove a timeline item
 * @param onMoveItem Callback to move a timeline item
 * @param onAddSong Callback to add a song
 * @param onAddSnippet Callback to add a snippet
 * @param onAddEffect Callback to add an effect
 * @param onClearTimeline Callback to clear the timeline
 * @param effects List of available effects
 * @param addEffectIdx Index for adding an effect inline
 * @param setAddEffectIdx Setter for addEffectIdx
 * @param selectedEffectId Currently selected effect ID
 * @param setSelectedEffectId Setter for selectedEffectId
 */
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
  // Inline snippet add state
  const [addSnippetIdx, setAddSnippetIdx] = useState<number | null>(null);
  const [newSnippetType, setNewSnippetType] = useState<'tts' | 'upload'>('upload');
  const [newSnippetText, setNewSnippetText] = useState('');
  const [newSnippetAudio, setNewSnippetAudio] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorderInstance, setRecorderInstance] = useState<InstanceType<typeof Recorder> | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // Recording logic
  const handleStartRecording = async () => {
    setNewSnippetAudio(null);
    setRecording(true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    setAudioContext(context);
    // Dynamically import Recorder
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
      reader.onloadend = () => {
        setNewSnippetAudio(reader.result as string);
      };
      reader.readAsDataURL(blob);
      setRecording(false);
      setRecorderInstance(null);
      if (audioContext) {
        audioContext.close();
        setAudioContext(null);
      }
    }
  };

  // Add snippet at idx
  const handleAddSnippetAt = (idx: number) => {
    setAddSnippetIdx(idx);
    setNewSnippetType('upload');
    setNewSnippetText('');
    setNewSnippetAudio(null);
  };
  const handleSubmitSnippet = () => {
    if (newSnippetType === 'tts' && newSnippetText.trim()) {
      onAddSnippet({ type: 'tts', text: newSnippetText }, addSnippetIdx!);
      setAddSnippetIdx(null);
    } else if (newSnippetType === 'upload' && newSnippetAudio) {
      onAddSnippet({ type: 'upload', audioUrl: newSnippetAudio }, addSnippetIdx!);
      setAddSnippetIdx(null);
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

  // Helper to extract YouTube video ID from URL
  function getYoutubeId(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/);
    return match ? match[1] : null;
  }

  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor));

  // dnd-kit drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = typeof active.id === 'string' ? Number(active.id.replace('trackitem-', '')) : active.id;
    const to = typeof over.id === 'string' ? Number(over.id.replace('trackitem-', '')) : over.id;
    if (from !== to) onMoveItem(from, to);
  };

  // Sortable item component
  const SortableTrackItem: React.FC<{ item: TrackItem; i: number }> = ({ item, i }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `trackitem-${i}` });
    // Neubrutalist backgrounds
    const bgColor = item.type === 'song'
      ? (isDragging ? '#ffe6a5' : '#fffbe6')
      : (isDragging ? '#ffb3de' : '#ffe6f7');
    // Compute song number (skip snippets)
    let songNumber: number | null = null;
    if (item.type === 'song') {
      songNumber = items.slice(0, i + 1).filter(it => it.type === 'song').length;
    }
    // Local state for TTS and start time
    const [ttsValue, setTtsValue] = useState(item.type === 'snippet' && item.snippet.type === 'tts' ? item.snippet.text || '' : '');
    const [startValue, setStartValue] = useState(item.type === 'song' && item.song.start !== undefined ? String(item.song.start) : '');
    // Update local state if item changes
    React.useEffect(() => {
      if (item.type === 'snippet' && item.snippet.type === 'tts') setTtsValue(item.snippet.text || '');
    }, [item.type === 'snippet' && item.snippet.type === 'tts' ? item.snippet.text : undefined]);
    React.useEffect(() => {
      if (item.type === 'song') setStartValue(item.song.start !== undefined ? String(item.song.start) : '');
    }, [item.type === 'song' ? item.song.start : undefined]);
    return (
      <React.Fragment key={i}>
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
          {/* Only number songs */}
          {songNumber !== null && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                minWidth: 36,
                minHeight: 36,
                marginRight: 10,
                fontWeight: 'bold',
                fontSize: 18,
                border: '2px solid #000',
                borderRadius: 8,
                background: '#fffbe6',
                boxShadow: '2px 2px 0 #000',
              }}
            >
              {songNumber}
            </span>
          )}
          {/* Drag handle */}
          <span
            {...attributes}
            {...listeners}
            style={{
              cursor: 'grab',
              userSelect: 'none',
              fontSize: 22,
              marginRight: 12,
              padding: '0 6px',
              display: 'flex',
              alignItems: 'center',
            }}
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
                    fontWeight: 'bold',
                    color: '#333',
                    fontSize: 18,
                    maxWidth: '50%',
                    wordBreak: 'break-word',
                    whiteSpace: 'normal',
                    overflowWrap: 'break-word',
                    overflow: 'hidden',
                    display: 'block',
                    flex: '0 0 50%',
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
                      if (item.song.start !== start) {
                        onUpdateItem(i, { ...item, song: { ...item.song, start } });
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="Start (s)"
                    style={{
                      width: 70,
                      fontSize: 15,
                      fontWeight: 'bold',
                      border: '3px solid #000',
                      borderRadius: 6,
                      background: '#fffbe6',
                      boxShadow: '2px 2px 0 #000',
                      padding: '6px 8px',
                      MozAppearance: 'textfield',
                      appearance: 'textfield',
                    }}
                    title="Start time in seconds (optional)"
                    className="no-spinner"
                  />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setPreviewIdx(previewIdx === i ? null : i);
                    }}
                    style={{
                      fontWeight: 'bold',
                      border: '2px solid #000',
                      borderRadius: 4,
                      background: '#e6f7ff',
                      padding: '2px 10px',
                      boxShadow: '2px 2px 0 #000',
                      cursor: 'pointer',
                    }}
                  >
                    {previewIdx === i ? 'Close Preview' : 'Preview'}
                  </button>
                  <button onClick={() => onRemoveItem(i)} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>✕</button>
                </div>
              </div>
            ) : item.type === 'effect' ? (
              <EffectTimelineItem effect={item.effect} onRemove={() => onRemoveItem(i)} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                {item.snippet.type === 'tts' ? (
                  <input
                    value={ttsValue}
                    onChange={e => setTtsValue(e.target.value)}
                    onBlur={() => {
                      if ((item.snippet.text || '') !== ttsValue) {
                        onUpdateItem(i, { type: 'snippet', snippet: { ...item.snippet, text: ttsValue } });
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    style={{ fontSize: 16, border: '2px solid #000', borderRadius: 4, padding: 4, marginRight: 8, background: '#fff', flex: 1 }}
                    placeholder="TTS text..."
                  />
                ) : (
                  <audio controls src={item.snippet.audioUrl || ''} style={{ marginRight: 8, height: 32, background: '#fff', flex: 1 }} />
                )}
                <button onClick={() => onRemoveItem(i)} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000', marginLeft: 'auto' }}>✕</button>
              </div>
            )}
          </div>
        </div>
        {/* YouTube Preview */}
        {item.type === 'song' && previewIdx === i && getYoutubeId(item.song.url) && (
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
        {/* Inline add buttons after each item */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={handleAddSongAt} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffd6a5', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Song</button>
          <button onClick={() => setAddEffectIdx(i)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#a5d8ff', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Effect</button>
          {addEffectIdx === i && (
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
                    onAddEffect(effect, addEffectIdx);
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
                onClick={() => {
                  setAddEffectIdx(null);
                  setSelectedEffectId('');
                }}
                style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}
              >
                Cancel
              </button>
            </div>
          )}
          {addSnippetIdx === i ? (
            <div style={{ background: '#fffbe6', border: '2px solid #888', borderRadius: 6, padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ marginBottom: 4 }}>
                <select value={newSnippetType} onChange={e => setNewSnippetType(e.target.value as 'upload' | 'tts'  )} style={{ fontSize: 15, border: '1px solid #888', borderRadius: 4, marginRight: 8 }}>
                  <option value="upload">Record/Upload</option>
                  <option value="tts">TTS</option>
                </select>
              </div>
              {newSnippetType === 'tts' ? (
                <TtsAddInput
                  value={newSnippetText}
                  setValue={setNewSnippetText}
                  onAdd={() => {
                    if (newSnippetText.trim()) {
                      onAddSnippet({ type: 'tts', text: newSnippetText }, addSnippetIdx!);
                      setAddSnippetIdx(null);
                    }
                  }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {!recording && !newSnippetAudio && (
                    <button onClick={handleStartRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffd6a5', padding: '4px 12px', marginRight: 8 }}>🎤 Record</button>
                  )}
                  {recording && (
                    <button onClick={handleStopRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffaaaa', padding: '4px 12px', marginRight: 8 }}>⏹ Stop</button>
                  )}
                  {newSnippetAudio && (
                    <>
                      <audio ref={audioRef} controls src={newSnippetAudio} style={{ marginRight: 8, height: 32 }} />
                      <button onClick={() => setNewSnippetAudio(null)} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#eee', padding: '2px 8px', marginRight: 8 }}>Re-record</button>
                    </>
                  )}
                  <label style={{
                    fontWeight: 'bold',
                    border: '1px solid #000',
                    borderRadius: 6,
                    background: '#ffe6f7',
                    padding: '4px 14px',
                    marginRight: 8,
                    cursor: 'pointer',
                    display: 'inline-block',
                  }}>
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
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleSubmitSnippet}
                  style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }}
                  disabled={newSnippetType === 'tts' ? !newSnippetText.trim() : !newSnippetAudio}
                >
                  Add
                </button>
                <button
                  onClick={handleCancelSnippet}
                  style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => handleAddSnippetAt(i)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffe6f7', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Snippet</button>
          )}
        </div>
      </React.Fragment>
    );
  };

  return (
    <div style={{ border: '3px solid black', padding: 12, marginBottom: 16, background: '#e6f7ff', borderRadius: 8, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold' }}>Timeline (edit, add, reorder):</span>
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to clear the entire timeline?')) {
              onClearTimeline();
            }
          }}
          style={{
            fontWeight: 'bold',
            border: '2px solid #000',
            borderRadius: 6,
            background: '#ffd6a5',
            boxShadow: '2px 2px 0 #000',
            padding: '6px 18px',
            color: '#c00',
            marginLeft: 12,
            cursor: 'pointer',
          }}
        >
          Clear Timeline
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((_, i) => `trackitem-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item, i) => (
            <SortableTrackItem key={i} item={item} i={i} />
          ))}
        </SortableContext>
      </DndContext>
      {/* Add at end (not draggable) */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={handleAddSongAt} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffd6a5', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Song</button>
        <button onClick={() => setAddEffectIdx(items.length)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#a5d8ff', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Effect</button>
        {addEffectIdx === items.length && (
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
                  onAddEffect(effect, addEffectIdx);
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
              onClick={() => {
                setAddEffectIdx(null);
                setSelectedEffectId('');
              }}
              style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}
            >
              Cancel
            </button>
          </div>
        )}
        {addSnippetIdx === items.length ? (
          <div style={{ background: '#fffbe6', border: '2px solid #888', borderRadius: 6, padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ marginBottom: 4 }}>
              <select value={newSnippetType} onChange={e => setNewSnippetType(e.target.value as 'tts' | 'upload')} style={{ fontSize: 15, border: '1px solid #888', borderRadius: 4, marginRight: 8 }}>
                <option value="tts">TTS</option>
                <option value="upload">Record/Upload</option>
              </select>
            </div>
            {newSnippetType === 'tts' ? (
              <TtsAddInput
                value={newSnippetText}
                setValue={setNewSnippetText}
                onAdd={() => {
                  if (newSnippetText.trim()) {
                    onAddSnippet({ type: 'tts', text: newSnippetText }, addSnippetIdx!);
                    setAddSnippetIdx(null);
                  }
                }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {!recording && !newSnippetAudio && (
                  <button onClick={handleStartRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffd6a5', padding: '4px 12px', marginRight: 8 }}>🎤 Record</button>
                )}
                {recording && (
                  <button onClick={handleStopRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffaaaa', padding: '4px 12px', marginRight: 8 }}>⏹ Stop</button>
                )}
                {newSnippetAudio && (
                  <>
                    <audio ref={audioRef} controls src={newSnippetAudio} style={{ marginRight: 8, height: 32 }} />
                    <button onClick={() => setNewSnippetAudio(null)} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#eee', padding: '2px 8px', marginRight: 8 }}>Re-record</button>
                  </>
                )}
                <label style={{
                  fontWeight: 'bold',
                  border: '2px solid #000',
                  borderRadius: 6,
                  background: '#ffe6f7',
                  boxShadow: '2px 2px 0 #000',
                  padding: '4px 14px',
                  marginRight: 8,
                  cursor: 'pointer',
                  display: 'inline-block',
                }}>
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
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={handleSubmitSnippet}
                style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }}
                disabled={newSnippetType === 'tts' ? !newSnippetText.trim() : !newSnippetAudio}
              >
                Add
              </button>
              <button
                onClick={handleCancelSnippet}
                style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => handleAddSnippetAt(items.length)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffe6f7', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Snippet</button>
        )}
      </div>
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

/**
 * SortableTrackItem
 * Renders a single timeline item (song, snippet, or effect) with drag handle, editing, and preview controls.
 */
const SortableTrackItem: React.FC<{ item: TrackItem; i: number }> = ({ item, i }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `trackitem-${i}` });
  // Neubrutalist backgrounds
  const bgColor = item.type === 'song'
    ? (isDragging ? '#ffe6a5' : '#fffbe6')
    : (isDragging ? '#ffb3de' : '#ffe6f7');
  // Compute song number (skip snippets)
  let songNumber: number | null = null;
  if (item.type === 'song') {
    songNumber = items.slice(0, i + 1).filter(it => it.type === 'song').length;
  }
  // Local state for TTS and start time
  const [ttsValue, setTtsValue] = useState(item.type === 'snippet' && item.snippet.type === 'tts' ? item.snippet.text || '' : '');
  const [startValue, setStartValue] = useState(item.type === 'song' && item.song.start !== undefined ? String(item.song.start) : '');
  // Update local state if item changes
  React.useEffect(() => {
    if (item.type === 'snippet' && item.snippet.type === 'tts') setTtsValue(item.snippet.text || '');
  }, [item.type === 'snippet' && item.snippet.type === 'tts' ? item.snippet.text : undefined]);
  React.useEffect(() => {
    if (item.type === 'song') setStartValue(item.song.start !== undefined ? String(item.song.start) : '');
  }, [item.type === 'song' ? item.song.start : undefined]);
  return (
    <React.Fragment key={i}>
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
        {/* Only number songs */}
        {songNumber !== null && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              minWidth: 36,
              minHeight: 36,
              marginRight: 10,
              fontWeight: 'bold',
              fontSize: 18,
              border: '2px solid #000',
              borderRadius: 8,
              background: '#fffbe6',
              boxShadow: '2px 2px 0 #000',
            }}
          >
            {songNumber}
          </span>
        )}
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            userSelect: 'none',
            fontSize: 22,
            marginRight: 12,
            padding: '0 6px',
            display: 'flex',
            alignItems: 'center',
          }}
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
                  fontWeight: 'bold',
                  color: '#333',
                  fontSize: 18,
                  maxWidth: '50%',
                  wordBreak: 'break-word',
                  whiteSpace: 'normal',
                  overflowWrap: 'break-word',
                  overflow: 'hidden',
                  display: 'block',
                  flex: '0 0 50%',
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
                    if (item.song.start !== start) {
                      onUpdateItem(i, { ...item, song: { ...item.song, start } });
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Start (s)"
                  style={{
                    width: 70,
                    fontSize: 15,
                    fontWeight: 'bold',
                    border: '3px solid #000',
                    borderRadius: 6,
                    background: '#fffbe6',
                    boxShadow: '2px 2px 0 #000',
                    padding: '6px 8px',
                    MozAppearance: 'textfield',
                    appearance: 'textfield',
                  }}
                  title="Start time in seconds (optional)"
                  className="no-spinner"
                />
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setPreviewIdx(previewIdx === i ? null : i);
                  }}
                  style={{
                    fontWeight: 'bold',
                    border: '2px solid #000',
                    borderRadius: 4,
                    background: '#e6f7ff',
                    padding: '2px 10px',
                    boxShadow: '2px 2px 0 #000',
                    cursor: 'pointer',
                  }}
                >
                  {previewIdx === i ? 'Close Preview' : 'Preview'}
                </button>
                <button onClick={() => onRemoveItem(i)} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>✕</button>
              </div>
            </div>
          ) : item.type === 'effect' ? (
            <EffectTimelineItem effect={item.effect} onRemove={() => onRemoveItem(i)} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {item.snippet.type === 'tts' ? (
                <input
                  value={ttsValue}
                  onChange={e => setTtsValue(e.target.value)}
                  onBlur={() => {
                    if ((item.snippet.text || '') !== ttsValue) {
                      onUpdateItem(i, { type: 'snippet', snippet: { ...item.snippet, text: ttsValue } });
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  style={{ fontSize: 16, border: '2px solid #000', borderRadius: 4, padding: 4, marginRight: 8, background: '#fff', flex: 1 }}
                  placeholder="TTS text..."
                />
              ) : (
                <audio controls src={item.snippet.audioUrl || ''} style={{ marginRight: 8, height: 32, background: '#fff', flex: 1 }} />
              )}
              <button onClick={() => onRemoveItem(i)} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000', marginLeft: 'auto' }}>✕</button>
            </div>
          )}
        </div>
      </div>
      {/* YouTube Preview */}
      {item.type === 'song' && previewIdx === i && getYoutubeId(item.song.url) && (
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
      {/* Inline add buttons after each item */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={handleAddSongAt} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffd6a5', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Song</button>
        <button onClick={() => setAddEffectIdx(i)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#a5d8ff', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Effect</button>
        {addEffectIdx === i && (
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
                  onAddEffect(effect, addEffectIdx);
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
              onClick={() => {
                setAddEffectIdx(null);
                setSelectedEffectId('');
              }}
              style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}
            >
              Cancel
            </button>
          </div>
        )}
        {addSnippetIdx === i ? (
          <div style={{ background: '#fffbe6', border: '2px solid #888', borderRadius: 6, padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ marginBottom: 4 }}>
              <select value={newSnippetType} onChange={e => setNewSnippetType(e.target.value as 'tts' | 'upload')} style={{ fontSize: 15, border: '1px solid #888', borderRadius: 4, marginRight: 8 }}>
                <option value="tts">TTS</option>
                <option value="upload">Record/Upload</option>
              </select>
            </div>
            {newSnippetType === 'tts' ? (
              <TtsAddInput
                value={newSnippetText}
                setValue={setNewSnippetText}
                onAdd={() => {
                  if (newSnippetText.trim()) {
                    onAddSnippet({ type: 'tts', text: newSnippetText }, addSnippetIdx!);
                    setAddSnippetIdx(null);
                  }
                }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {!recording && !newSnippetAudio && (
                  <button onClick={handleStartRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffd6a5', padding: '4px 12px', marginRight: 8 }}>🎤 Record</button>
                )}
                {recording && (
                  <button onClick={handleStopRecording} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#ffaaaa', padding: '4px 12px', marginRight: 8 }}>⏹ Stop</button>
                )}
                {newSnippetAudio && (
                  <>
                    <audio ref={audioRef} controls src={newSnippetAudio} style={{ marginRight: 8, height: 32 }} />
                    <button onClick={() => setNewSnippetAudio(null)} style={{ fontWeight: 'bold', border: '1px solid #888', borderRadius: 4, background: '#eee', padding: '2px 8px', marginRight: 8 }}>Re-record</button>
                  </>
                )}
                <label style={{
                  fontWeight: 'bold',
                  border: '2px solid #000',
                  borderRadius: 6,
                  background: '#ffe6f7',
                  boxShadow: '2px 2px 0 #000',
                  padding: '4px 14px',
                  marginRight: 8,
                  cursor: 'pointer',
                  display: 'inline-block',
                }}>
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
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={handleSubmitSnippet}
                style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }}
                disabled={newSnippetType === 'tts' ? !newSnippetText.trim() : !newSnippetAudio}
              >
                Add
              </button>
              <button
                onClick={handleCancelSnippet}
                style={{ fontWeight: 'bold', border: '2px solid #888', borderRadius: 4, background: '#eee', padding: '4px 16px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => handleAddSnippetAt(i)} style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#ffe6f7', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}>+ Snippet</button>
        )}
      </div>
    </React.Fragment>
  );
};

/**
 * TtsAddInput
 * Input for adding TTS snippets. Submits on blur or Enter.
 */
const TtsAddInput: React.FC<{
  value: string;
  setValue: (v: string) => void;
  onAdd: () => void;
}> = ({ value, setValue, onAdd }) => {
  return (
    <input
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim()) onAdd();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="Enter TTS text..."
      style={{ fontSize: 15, border: '1px solid #888', borderRadius: 4, padding: 4, marginRight: 8, width: 220 }}
      autoFocus
    />
  );
};

/**
 * EffectTimelineItem
 * Fetches and plays effect audio as a data URL. Shows loading/error states.
 */
const EffectTimelineItem: React.FC<{ effect: Effect; onRemove: () => void }> = ({ effect, onRemove }) => {
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    getEffectDataUrl(effect.id)
      .then(url => { if (mounted) setAudioUrl(url); })
      .catch(() => { if (mounted) setAudioUrl(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [effect.id]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      <span style={{ fontWeight: 'bold', color: '#333', fontSize: 18, flex: 1 }}>{effect.name}</span>
      {loading ? (
        <span style={{ marginRight: 8, color: '#888' }}>Loading...</span>
      ) : audioUrl ? (
        <audio controls src={audioUrl} style={{ marginRight: 8, height: 32, background: '#fff' }} />
      ) : (
        <span style={{ marginRight: 8, color: 'red' }}>Error</span>
      )}
      <button onClick={onRemove} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000', marginLeft: 'auto' }}>✕</button>
    </div>
  );
}; 