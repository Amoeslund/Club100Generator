import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Song, Snippet, Club100Job, TrackItem, Effect } from './types';
import { generateTrack, youtubeSearch, getEffects } from './api';
import { GenerateButton } from './GenerateButton';
import { SongSearch } from './SongSearch';
import {
  addSong,
  insertAfter,
  removeAt,
  moveItem,
  updateAt,
  injectAutoEffect,
  ensureIds,
  songItem,
  snippetItem,
  effectItem,
  parseImportLine,
} from './timeline';
const TrackTimeline = lazy(() => import('./TrackTimeline'));

const DEMO_SONGS: Song[] = [
  { url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g', title: 'Ed Sheeran - Perfect' },
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up' },
];

export const Club100Page: React.FC = () => {
  const [trackItems, setTrackItems] = useState<TrackItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('club100_trackItems');
      if (saved) {
        try {
          return ensureIds(JSON.parse(saved));
        } catch {}
      }
    }
    return [];
  });
  const [importText, setImportText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('club100_importText') || '';
    }
    return '';
  });
  const [job, setJob] = useState<Club100Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist to localStorage on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('club100_trackItems', JSON.stringify(trackItems));
    }
  }, [trackItems]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('club100_importText', importText);
    }
  }, [importText]);

  // Seed the timeline with demo songs once if it starts empty.
  useEffect(() => {
    setTrackItems(prev => (prev.length === 0 ? DEMO_SONGS.map(songItem) : prev));
  }, []);

  const handleAddSong = (song: Song) => setTrackItems(prev => addSong(prev, song));
  const handleAddSnippet = (snippet: Snippet, idx: number) =>
    setTrackItems(prev => insertAfter(prev, snippetItem(snippet), idx));
  const handleAddEffect = (effect: Effect, idx: number) =>
    setTrackItems(prev => insertAfter(prev, effectItem(effect), idx));
  const handleUpdateItem = (idx: number, item: TrackItem) => setTrackItems(prev => updateAt(prev, idx, item));
  const handleRemoveItem = (idx: number) => setTrackItems(prev => removeAt(prev, idx));
  const handleMoveItem = (from: number, to: number) => setTrackItems(prev => moveItem(prev, from, to));

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setJob(null);
    try {
      const autoEffect = effects.find(e => e.id === autoEffectId);
      const timeline = autoEffectId ? injectAutoEffect(trackItems, autoEffect) : trackItems;
      const result = await generateTrack({ timeline });
      setJob(result);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to generate track');
    } finally {
      setLoading(false);
    }
  };

  // Mass import logic (add as songs at end)
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ found: string[]; notFound: string[] } | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const handleMassImport = async () => {
    setImportLoading(true);
    setImportResult(null);
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    setImportProgress({ current: 0, total: lines.length });
    let processed = 0;
    const bump = () => {
      processed += 1;
      setImportProgress({ current: processed, total: lines.length });
    };
    // Resolve every line (in parallel), preserving order via index.
    const results = await Promise.all(
      lines.map(async (line, index) => {
        const parsed = parseImportLine(line);
        if (!parsed) {
          bump();
          return { song: null as Song | null, label: line, index };
        }
        if (parsed.kind === 'url') {
          bump();
          return { song: parsed.song, label: parsed.song.title, index };
        }
        try {
          const found = await youtubeSearch(parsed.query);
          bump();
          return { song: found?.[0] ?? null, label: parsed.query, index };
        } catch {
          bump();
          return { song: null as Song | null, label: parsed.query, index };
        }
      }),
    );
    results.sort((a, b) => a.index - b.index);
    const found: string[] = [];
    const notFound: string[] = [];
    const imported: Song[] = [];
    for (const r of results) {
      if (r.song) {
        imported.push(r.song);
        found.push(r.label);
      } else {
        notFound.push(r.label);
      }
    }
    setTrackItems(prev => [...prev, ...imported.map(songItem)]);
    setImportText('');
    setImportResult({ found, notFound });
    setImportLoading(false);
    setImportProgress(null);
  };

  // Effects
  const [effects, setEffects] = useState<Effect[]>([]);
  useEffect(() => {
    getEffects().then(setEffects).catch(() => setEffects([]));
  }, []);
  const [addEffectIdx, setAddEffectIdx] = useState<number | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string>('');

  // Auto effect after each song
  const [autoEffectId, setAutoEffectId] = useState<string>('');

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', background: '#fff', border: '5px solid black', borderRadius: 16, boxShadow: '8px 8px 0 #000', padding: 32 }}>
      <h1 style={{ fontSize: 36, fontWeight: 'bold', marginBottom: 16 }}>Club 100 Generator</h1>
      <SongSearch onAdd={handleAddSong} />
      {/* Auto effect after each song */}
      <div style={{ border: '3px solid #000', borderRadius: 8, background: '#fffbe6', padding: 12, marginBottom: 16 }}>
        <label style={{ fontWeight: 'bold', marginRight: 8 }}>Effect to play after each song:</label>
        <select
          value={autoEffectId}
          onChange={e => setAutoEffectId(e.target.value)}
          style={{ fontSize: 16, border: '2px solid #000', borderRadius: 4, padding: 4 }}
        >
          <option value="">None</option>
          {effects.map(effect => (
            <option key={effect.id} value={effect.id}>{effect.name}</option>
          ))}
        </select>
      </div>
      {/* Mass import UI */}
      <div style={{ border: '3px solid black', padding: 12, marginBottom: 16, background: '#e6f7ff', borderRadius: 8 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Mass Import Songs</div>
        <textarea
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder={"Paste either YouTube URLs or song names, one per line. Optionally add a title after a comma or tab.\nExample:\nhttps://youtu.be/abc123, My Song Title"}
          rows={4}
          style={{ width: '100%', fontSize: 15, border: '2px solid black', borderRadius: 4, marginBottom: 8, padding: 6 }}
        />
        <button
          onClick={handleMassImport}
          style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }}
          disabled={!importText.trim() || importLoading}
        >
          {importLoading ? 'Importing...' : 'Import Songs'}
        </button>
        {importProgress && (
          <div style={{ marginTop: 8, color: '#333', fontWeight: 'bold' }}>
            Importing: {importProgress.current} / {importProgress.total}
            <div style={{ height: 8, background: '#eee', borderRadius: 4, marginTop: 4, width: '100%' }}>
              <div style={{ height: 8, background: '#baffc9', borderRadius: 4, width: `${importProgress.total ? (importProgress.current / importProgress.total) * 100 : 0}%`, transition: 'width 0.2s' }} />
            </div>
          </div>
        )}
        {importResult && (
          <div style={{ marginTop: 8 }}>
            {importResult.found.length > 0 && (
              <div style={{ color: 'green', fontSize: 15, marginBottom: 4 }}>
                <b>Found:</b> {importResult.found.join(', ')}
              </div>
            )}
            {importResult.notFound.length > 0 && (
              <div style={{ color: 'red', fontSize: 15 }}>
                <b>Not found:</b> {importResult.notFound.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
      <Suspense fallback={<div>Loading timeline...</div>}>
        <TrackTimeline
          items={trackItems}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
          onMoveItem={handleMoveItem}
          onAddSong={handleAddSong}
          onAddSnippet={handleAddSnippet}
          onAddEffect={handleAddEffect}
          effects={effects}
          addEffectIdx={addEffectIdx}
          setAddEffectIdx={setAddEffectIdx}
          selectedEffectId={selectedEffectId}
          setSelectedEffectId={setSelectedEffectId}
          onClearTimeline={() => setTrackItems([])}
        />
      </Suspense>
      <GenerateButton onClick={handleGenerate} loading={loading} />
      {loading && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: 40, height: 40, border: '4px solid #000', borderRadius: '50%', borderTop: '4px solid #baffc9', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ fontWeight: 'bold', marginTop: 8 }}>Generating track...</div>
        </div>
      )}
      {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
      {job && (
        <div style={{ marginTop: 24, padding: 16, border: '2px solid black', borderRadius: 8, background: '#e6ffe6' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Track Status: {job.status}</div>
          {job.downloadUrl && (
            <a href={job.downloadUrl} download style={{ fontSize: 18, color: '#007700', fontWeight: 'bold' }}>Download MP3</a>
          )}
        </div>
      )}
    </div>
  );
};
