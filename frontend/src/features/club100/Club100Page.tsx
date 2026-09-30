import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Song, Snippet, Club100Job, TrackItem, Effect } from './types';
import { generateTrack, youtubeSearch, getEffects, importMyInstantsEffect, findBestStart } from './api';
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
import { loadTimeline, saveTimeline } from './storage';
const TrackTimeline = lazy(() => import('./TrackTimeline'));

const DEMO_SONGS: Song[] = [
  { url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g', title: 'Ed Sheeran - Perfect' },
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up' },
];

export const Club100Page: React.FC = () => {
  const [trackItems, setTrackItems] = useState<TrackItem[]>([]);
  // Don't persist until the saved timeline has been loaded, or we'd overwrite it with [].
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importText, setImportText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('club100_importText') || '';
    }
    return '';
  });
  const [job, setJob] = useState<Club100Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the saved timeline once; seed demo songs if there is none.
  useEffect(() => {
    loadTimeline()
      .catch(err => {
        console.error('Failed to load saved timeline', err);
        return null;
      })
      .then(saved => {
        setTrackItems(saved && saved.length > 0 ? ensureIds(saved) : DEMO_SONGS.map(songItem));
        setTimelineLoaded(true);
      });
  }, []);

  // Persist on change. A failed save must never crash the page (recordings live in this state).
  useEffect(() => {
    if (!timelineLoaded) return;
    saveTimeline(trackItems)
      .then(() => setSaveError(null))
      .catch(err => {
        console.error('Failed to save timeline', err);
        setSaveError('Could not save the timeline in this browser. Your changes are only kept until you close or reload the page.');
      });
  }, [trackItems, timelineLoaded]);
  useEffect(() => {
    try {
      localStorage.setItem('club100_importText', importText);
    } catch {
      // Draft import text is a convenience; ignore quota errors.
    }
  }, [importText]);

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

  // Import effect from myinstants.com
  const [instantUrl, setInstantUrl] = useState('');
  const [instantStatus, setInstantStatus] = useState<string | null>(null);
  const [instantLoading, setInstantLoading] = useState(false);
  const handleImportInstant = async () => {
    setInstantLoading(true);
    setInstantStatus(null);
    try {
      const effect = await importMyInstantsEffect(instantUrl.trim());
      setEffects(prev => (prev.some(e => e.id === effect.id) ? prev : [...prev, effect]));
      setInstantStatus(`Imported "${effect.name}"`);
      setInstantUrl('');
    } catch (err) {
      setInstantStatus(err instanceof Error ? err.message : 'Import failed');
    }
    setInstantLoading(false);
  };

  // Auto-find the best 60s of every song that has no start time yet
  const [autoStartProgress, setAutoStartProgress] = useState<{ current: number; total: number; failed: number } | null>(null);
  const handleAutoStart = async () => {
    const pending = trackItems.flatMap(item =>
      item.type === 'song' && item.song.start === undefined ? [{ id: item.id, url: item.song.url }] : [],
    );
    const progress = { current: 0, total: pending.length, failed: 0 };
    setAutoStartProgress({ ...progress });
    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        const { id, url } = pending[next++];
        try {
          const { start } = await findBestStart(url);
          setTrackItems(prev => prev.map(it =>
            it.id === id && it.type === 'song' ? { ...it, song: { ...it.song, start } } : it,
          ));
        } catch {
          progress.failed++;
        }
        progress.current++;
        setAutoStartProgress({ ...progress });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  };

  // Auto effect after each song
  const [autoEffectId, setAutoEffectId] = useState<string>('');

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', background: '#fff', border: '5px solid black', borderRadius: 16, boxShadow: '8px 8px 0 #000', padding: 32 }}>
      <h1 style={{ fontSize: 36, fontWeight: 'bold', marginBottom: 16 }}>Club 100 Generator</h1>
      {saveError && (
        <div style={{ border: '3px solid #c00', borderRadius: 8, background: '#ffe3e3', padding: 12, marginBottom: 16, fontWeight: 'bold' }}>{saveError}</div>
      )}
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
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={instantUrl}
            onChange={e => setInstantUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && instantUrl.trim()) handleImportInstant(); }}
            placeholder="Paste myinstants.com link to import effect"
            style={{ flex: 1, fontSize: 15, border: '2px solid #000', borderRadius: 4, padding: 4 }}
          />
          <button
            onClick={handleImportInstant}
            disabled={!instantUrl.trim() || instantLoading}
            style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#a5d8ff', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}
          >
            {instantLoading ? 'Importing...' : 'Import'}
          </button>
        </div>
        {instantStatus && <div style={{ marginTop: 6, fontSize: 14 }}>{instantStatus}</div>}
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
      {/* Auto start times */}
      <div style={{ border: '3px solid black', padding: 12, marginBottom: 16, background: '#f0fff0', borderRadius: 8 }}>
        <button
          onClick={handleAutoStart}
          disabled={!!autoStartProgress && autoStartProgress.current < autoStartProgress.total}
          style={{ fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#b2f2bb', boxShadow: '2px 2px 0 #000', padding: '2px 10px' }}
        >
          Auto-find best minute for songs without start time
        </button>
        {autoStartProgress && (
          <div style={{ marginTop: 6, fontSize: 14 }}>
            {autoStartProgress.current}/{autoStartProgress.total} done
            {autoStartProgress.failed > 0 && ` (${autoStartProgress.failed} failed)`}
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
