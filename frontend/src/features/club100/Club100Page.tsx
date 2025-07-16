import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Song, Snippet, Club100Job, TrackItem, Effect } from './types';
import { getSnippets, generateTrack, youtubeSearch, getEffects } from './api';
import { LanguageSelector } from './LanguageSelector';
import { GenerateButton } from './GenerateButton';
import { SongSearch } from './SongSearch';
const TrackTimeline = lazy(() => import('./TrackTimeline'));

export const Club100Page: React.FC = () => {
  // Load from localStorage if present
  const [language, setLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('club100_language');
      if (saved) return saved;
    }
    return 'da';
  });
  const [trackItems, setTrackItems] = useState<TrackItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('club100_trackItems');
      if (saved) {
        try {
          return JSON.parse(saved);
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
  // Unified timeline state
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
      localStorage.setItem('club100_language', language);
    }
  }, [language]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('club100_importText', importText);
    }
  }, [importText]);

  // On language change, initialize with interleaved demo data if empty
  useEffect(() => {
    if (trackItems.length === 0) {
      getSnippets(language).then(snippets => {
        // Demo: interleave default songs and snippets
        const demoSongs: Song[] = [
          { url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g', title: 'Ed Sheeran - Perfect' },
          { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up' },
        ];
        const items: TrackItem[] = [];
        for (let i = 0; i < Math.max(demoSongs.length, snippets.length); i++) {
          if (demoSongs[i]) items.push({ type: 'song', song: demoSongs[i] });
          if (snippets[i]) items.push({ type: 'snippet', snippet: snippets[i] });
        }
        setTrackItems(items);
      });
    }
  }, [language]);

  // Add song after last song or at end
  const handleAddSong = (song: Song) => {
    let idx = -1;
    for (let i = trackItems.length - 1; i >= 0; i--) {
      if (trackItems[i].type === 'song') { idx = i; break; }
    }
    const newItems = [...trackItems];
    newItems.splice(idx + 1, 0, { type: 'song', song });
    setTrackItems(newItems);
  };
  // Add snippet at a specific index
  const handleAddSnippet = (snippet: Snippet, idx: number) => {
    const newItems = [...trackItems];
    newItems.splice(idx + 1, 0, { type: 'snippet', snippet });
    setTrackItems(newItems);
  };
  // Update item (edit)
  const handleUpdateItem = (idx: number, item: TrackItem) => {
    const updated = [...trackItems];
    updated[idx] = item;
    setTrackItems(updated);
  };
  // Remove item
  const handleRemoveItem = (idx: number) => {
    setTrackItems(trackItems.filter((_, i) => i !== idx));
  };
  // Move item
  const handleMoveItem = (from: number, to: number) => {
    if (to < 0 || to >= trackItems.length) return;
    const updated = [...trackItems];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    setTrackItems(updated);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setJob(null);
    try {
      // Inject auto effect after every song if selected
      const autoEffect = effects.find(e => e.id === autoEffectId);
      const timelineWithEffects = autoEffectId ? injectAutoEffect(trackItems, autoEffect) : trackItems;
      const job = await generateTrack({ timeline: timelineWithEffects, language });
      setJob(job);
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
    setImportProgress({ current: 0, total: 0 });
    // Each line: url [tab or comma or space] title (optional) OR just a title
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    setImportProgress({ current: 0, total: lines.length });
    const found: string[] = [];
    const notFound: string[] = [];
    let processed = 0;
    // Prepare all search promises, each returns {song, found, index}
    const searchPromises = lines.map((line, index) => (async () => {
      // Try to split by tab, then comma, then space
      const [first, ...rest] = line.split(/\t|,|\s{2,}/);
      const isUrl = first.startsWith('http');
      if (isUrl) {
        const urlTrimmed = first.trim();
        const title = rest.join(' ').trim();
        processed++;
        setImportProgress({ current: processed, total: lines.length });
        return { song: { url: urlTrimmed, title: title || urlTrimmed }, found: title || urlTrimmed, notFound: null, index };
      } else {
        // Treat as search query
        try {
          const results = await youtubeSearch(line);
          processed++;
          setImportProgress({ current: processed, total: lines.length });
          if (results && results.length > 0) {
            return { song: results[0], found: line, notFound: null, index };
          } else {
            return { song: null, found: null, notFound: line, index };
          }
        } catch {
          processed++;
          setImportProgress({ current: processed, total: lines.length });
          return { song: null, found: null, notFound: line, index };
        }
      }
    })());
    const results = await Promise.all(searchPromises);
    // Sort by index to preserve order
    results.sort((a, b) => a.index - b.index);
    const imported: Song[] = [];
    for (const r of results) {
      if (r.song) {
        imported.push(r.song);
        found.push(r.found!);
      } else if (r.notFound) {
        notFound.push(r.notFound);
      }
    }
    setTrackItems(prev => [
      ...prev,
      ...imported.map(s => ({ type: 'song' as const, song: s }))
    ]);
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
  const handleAddEffect = (effect: Effect, idx: number) => {
    const newItems = [...trackItems];
    newItems.splice(idx + 1, 0, { type: 'effect', effect });
    setTrackItems(newItems);
  };

  // Auto effect after each song
  const [autoEffectId, setAutoEffectId] = useState<string>('');

  // Helper to inject effect after every song (including after last song)
  function injectAutoEffect(timeline: TrackItem[], effect: Effect | undefined): TrackItem[] {
    if (!effect) return timeline;
    const result: TrackItem[] = [];
    for (let i = 0; i < timeline.length; i++) {
      result.push(timeline[i]);
      if (timeline[i].type === 'song') {
        result.push({ type: 'effect', effect });
      }
    }
    return result;
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', background: '#fff', border: '5px solid black', borderRadius: 16, boxShadow: '8px 8px 0 #000', padding: 32 }}>
      <h1 style={{ fontSize: 36, fontWeight: 'bold', marginBottom: 16 }}>Club 100 Generator</h1>
      <LanguageSelector value={language} onChange={setLanguage} />
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
              <div style={{ height: 8, background: '#baffc9', borderRadius: 4, width: `${(importProgress.current / importProgress.total) * 100}%`, transition: 'width 0.2s' }} />
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
          onAddEffect={(effect, idx) => handleAddEffect(effect, idx)}
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
