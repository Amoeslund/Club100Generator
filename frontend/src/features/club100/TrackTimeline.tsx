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
import { SortableTrackItem } from './SortableTrackItem';
import { getYoutubeId } from './utils';

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

// TTS Add Input: only submit on blur or Enter
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

// EffectTimelineItem: fetches and plays effect audio as data URL
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