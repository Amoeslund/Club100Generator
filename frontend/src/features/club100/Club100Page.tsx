import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { Song, Club100Job, TrackItem, Effect } from './types';
import { generateTrack, youtubeSearch, getEffects, importMyInstantsEffect, findBestStart } from './api';
import { GenerateProgress } from './GenerateProgress';
import { SongSearch } from './SongSearch';
import { addSong, injectAutoEffect, ensureIds, songItem, effectItem, parseImportLine, audioTimeline } from './timeline';
import { loadTimeline, saveTimeline } from './storage';
import { useClips } from './useClips';
import { BackupControls } from './BackupControls';
import { TimelinePlayer, TimelinePlayerHandle } from './TimelinePlayer';
import { EffectPreview } from './EffectPreview';
import { EffectPicker } from './EffectPicker';
import './club100.css';
const TrackTimeline = lazy(() => import('./TrackTimeline'));

const DEMO_SONGS: Song[] = [
  { url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g', title: 'Ed Sheeran - Perfect' },
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up' },
];

// Clip-cache id for the "effect after every song" setting (not a timeline item).
const AFTER_SONG_ID = '__after-song';

function usePersistentString(key: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem(key) || '' : ''));
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // A convenience setting; ignore quota errors.
    }
  }, [key, value]);
  return [value, setValue];
}

export const Club100Page: React.FC = () => {
  const [trackItems, setTrackItems] = useState<TrackItem[]>([]);
  // Don't persist until the saved timeline has been loaded, or we'd overwrite it with [].
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importText, setImportText] = usePersistentString('club100_importText');
  const [autoEffectId, setAutoEffectId] = usePersistentString('club100_autoEffectId');
  const [job, setJob] = useState<Club100Job | null>(null);
  const [progress, setProgress] = useState<Club100Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effects
  const [effects, setEffects] = useState<Effect[]>([]);
  useEffect(() => {
    getEffects().then(setEffects).catch(() => setEffects([]));
  }, []);
  const autoEffect = effects.find(e => e.id === autoEffectId);

  // Clips are prepared in the background as soon as items are added or edited. A random song start
  // chosen by the backend is pinned into the item so preview and generated track match.
  const pinStart = useCallback((id: string, start: number) => {
    setTrackItems(prev => prev.map(it =>
      it.id === id && it.type === 'song' && it.song.start === undefined ? { ...it, song: { ...it.song, start } } : it));
  }, []);
  const clipItems = useMemo<TrackItem[]>(
    () => (autoEffect ? [...trackItems, { id: AFTER_SONG_ID, type: 'effect', effect: autoEffect }] : trackItems),
    [trackItems, autoEffect],
  );
  const { clips, retry: retryClip } = useClips(clipItems, pinStart);
  const playerRef = useRef<TimelinePlayerHandle>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const handlePlayItem = useCallback((id: string) => playerRef.current?.playItem(id), []);

  // Only one thing plays at a time: the track player, a song editor or a recording preview.
  useEffect(() => {
    const onPlay = (e: Event) => {
      document.querySelectorAll('audio').forEach(a => { if (a !== e.target && !a.paused) a.pause(); });
    };
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, []);

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
        setSaveError('Could not save the running order in this browser. Changes are only kept until you close or reload the page, so use Export timeline now.');
      });
  }, [trackItems, timelineLoaded]);

  const handleAddSong = (song: Song) => setTrackItems(prev => addSong(prev, song));

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setJob(null);
    setProgress({ jobId: '', status: 'processing', stage: 'upload', done: 0, total: 0, skipped: [] });
    try {
      const audio = audioTimeline(trackItems);
      const timeline = autoEffect ? injectAutoEffect(audio, autoEffect) : audio;
      setJob(await generateTrack({ timeline }, setProgress));
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to generate track');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  // Mass import (adds songs at the end)
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

  // Import a sound from a myinstants.com page into the effect library.
  const importInstant = useCallback(async (url: string) => {
    const effect = await importMyInstantsEffect(url);
    setEffects(prev => (prev.some(e => e.id === effect.id) ? prev : [...prev, effect]));
    return effect;
  }, []);

  // Find the best 60s of every song that has no start time yet
  const [autoStartProgress, setAutoStartProgress] = useState<{ current: number; total: number; failed: number } | null>(null);
  const songsWithoutStart = trackItems.filter(it => it.type === 'song' && it.song.start === undefined).length;
  const handleAutoStart = async () => {
    const pending = trackItems.flatMap(item =>
      item.type === 'song' && item.song.start === undefined ? [{ id: item.id, url: item.song.url }] : [],
    );
    const state = { current: 0, total: pending.length, failed: 0 };
    setAutoStartProgress({ ...state });
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
          state.failed++;
        }
        state.current++;
        setAutoStartProgress({ ...state });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  };

  const [addTab, setAddTab] = useState<'search' | 'list' | 'effects'>('search');
  // Open the add panel once for an empty running order; afterwards it stays how the user left it.
  const [addOpen, setAddOpen] = useState(false);
  const openedForEmpty = useRef(false);
  useEffect(() => {
    if (timelineLoaded && !openedForEmpty.current) {
      openedForEmpty.current = true;
      if (trackItems.length === 0) setAddOpen(true);
    }
  }, [timelineLoaded, trackItems.length]);
  const addTabs: [typeof addTab, string][] = [['search', 'Search YouTube'], ['list', 'Paste a list'], ['effects', 'Sound effects']];

  return (
    <div className="c100">
      <div className="c100-page">
        <header className="c100-header">
          <h1 className="c100-title">Club 100 Generator</h1>
          <BackupControls items={trackItems} onReplace={setTrackItems} />
        </header>
        {saveError && <div className="c100-banner" role="alert">{saveError}</div>}

        <div className="c100-layout">
          <main>
            <details className="c100-add" open={addOpen} onToggle={e => setAddOpen(e.currentTarget.open)}>
              <summary>Add songs and sound effects</summary>
              <div className="c100-add-body">
                <div className="c100-tabs" role="tablist">
                  {addTabs.map(([k, label]) => (
                    <button key={k} type="button" role="tab" className="c100-tab" aria-selected={addTab === k} onClick={() => setAddTab(k)}>{label}</button>
                  ))}
                </div>

                {addTab === 'search' && <SongSearch onAdd={handleAddSong} />}

                {addTab === 'list' && (
                  <div className="c100-stack">
                    <textarea
                      className="c100-textarea"
                      value={importText}
                      onChange={e => setImportText(e.target.value)}
                      placeholder={'One song per line: a YouTube link (a ?t= start is kept, a title can follow after a tab or comma) or a song to search for.\nhttps://youtu.be/dQw4w9WgXcQ?t=43, Rick Astley - Never Gonna Give You Up\nDarude Sandstorm'}
                      rows={6}
                    />
                    <div className="c100-inline">
                      <button type="button" className="c100-btn c100-btn-primary" onClick={handleMassImport} disabled={!importText.trim() || importLoading}>
                        {importLoading ? 'Adding…' : 'Add songs to the end'}
                      </button>
                      {importProgress && <span className="c100-muted">{importProgress.current} of {importProgress.total}</span>}
                    </div>
                    {importProgress && (
                      <div className="c100-meter"><div style={{ width: `${importProgress.total ? (importProgress.current / importProgress.total) * 100 : 0}%` }} /></div>
                    )}
                    {importResult && (
                      <div className="c100-muted">
                        Added {importResult.found.length} {importResult.found.length === 1 ? 'song' : 'songs'}.
                        {importResult.notFound.length > 0 && <span className="c100-error"> Not found: {importResult.notFound.join(', ')}</span>}
                      </div>
                    )}
                  </div>
                )}

                {addTab === 'effects' && (
                  <div className="c100-stack">
                    <EffectPicker
                      effects={effects}
                      onImport={importInstant}
                      addLabel="Add at the end"
                      onAdd={effect => setTrackItems(prev => [...prev, effectItem(effect)])}
                    />
                    <div className="c100-muted">To place one between two songs, use the + on a row.</div>
                  </div>
                )}
              </div>
            </details>

            <Suspense fallback={<div className="c100-muted">Loading the running order…</div>}>
              <TrackTimeline
                items={trackItems}
                onChange={setTrackItems}
                effects={effects}
                clips={clips}
                activeItemId={activeItemId}
                onPlayItem={handlePlayItem}
                onRetryClip={retryClip}
                onImportEffect={importInstant}
                headerExtra={songsWithoutStart > 0 && (
                  <button
                    type="button"
                    className="c100-btn"
                    onClick={handleAutoStart}
                    disabled={!!autoStartProgress && autoStartProgress.current < autoStartProgress.total}
                  >
                    {autoStartProgress && autoStartProgress.current < autoStartProgress.total
                      ? `Finding best minutes ${autoStartProgress.current} of ${autoStartProgress.total}`
                      : `Find the best minute for ${songsWithoutStart} ${songsWithoutStart === 1 ? 'song' : 'songs'}`}
                  </button>
                )}
              />
            </Suspense>
          </main>

          <aside className="c100-side" aria-label="Export">

            <div className="c100-panel c100-stack">
              <div className="c100-stack" style={{ gap: 4 }}>
                <label htmlFor="c100-after-song" style={{ fontWeight: 600 }}>After every song</label>
                <div className="c100-inline" style={{ flexWrap: 'nowrap' }}>
                  <select id="c100-after-song" className="c100-select" style={{ flex: 1, minWidth: 0 }} value={autoEffectId} onChange={e => setAutoEffectId(e.target.value)}>
                    <option value="">Nothing</option>
                    {effects.map(effect => <option key={effect.id} value={effect.id}>{effect.name}</option>)}
                  </select>
                  {autoEffect && <EffectPreview clip={clips[AFTER_SONG_ID]} name={autoEffect.name} />}
                </div>
                {autoEffect && (
                  <button
                    type="button"
                    className="c100-btn c100-btn-quiet"
                    style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
                    disabled={clips[AFTER_SONG_ID]?.status !== 'ready'}
                    onClick={() => playerRef.current?.previewAfterSong()}
                  >
                    Hear it between songs
                  </button>
                )}
              </div>
              <button type="button" className="c100-btn c100-btn-primary c100-generate" onClick={handleGenerate} disabled={loading || trackItems.length === 0}>
                {loading ? 'Making the MP3…' : 'Make the MP3'}
              </button>
              {loading && progress && <GenerateProgress job={progress} />}
              {error && <div className="c100-error" role="alert">{error}</div>}
              {job && (
                <div>
                  <a className="c100-download" href={job.downloadUrl} download>Download MP3</a>
                  {job.skipped.length > 0 && (
                    <>
                      <div className="c100-error" style={{ marginTop: 10, fontWeight: 600 }}>
                        Left out of the MP3 ({job.skipped.length}):
                      </div>
                      <ul className="c100-skipped">{job.skipped.map((label, i) => <li key={i}>{label}</li>)}</ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      <TimelinePlayer ref={playerRef} items={trackItems} clips={clips} afterSong={autoEffect ? clips[AFTER_SONG_ID] : undefined} afterSongName={autoEffect?.name} onActiveChange={setActiveItemId} />
    </div>
  );
};
