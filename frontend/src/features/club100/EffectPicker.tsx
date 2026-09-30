import React, { useMemo, useRef, useState } from 'react';
import { Effect } from './types';
import { getEffectAudioUrl } from './api';

const MYINSTANTS_LINK = /^https?:\/\/(www\.)?myinstants\.com\//i;

/**
 * Searchable list of sound effects with instant preview. ▶ plays the effect file itself (effects
 * keep their own level in the MP3, so this is how it will sound); Add hands it to `onAdd`.
 * Enter in the search box adds the first match. Pasting a myinstants.com link imports that sound
 * (via `onImport`), then shows it and plays it so it can be added right away.
 */
export const EffectPicker: React.FC<{
  effects: Effect[];
  onAdd: (effect: Effect) => void;
  onImport?: (url: string) => Promise<Effect>;
  addLabel?: string;
  autoFocus?: boolean;
}> = ({ effects, onAdd, onImport, addLabel = 'Add', autoFocus }) => {
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedId, setImportedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isLink = !!onImport && MYINSTANTS_LINK.test(query.trim());
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (isLink) return [];
    const list = q ? effects.filter(e => e.name.toLowerCase().includes(q)) : effects;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [effects, query, isLink]);

  const toggle = (effect: Effect) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === effect.id && !audio.paused) {
      audio.pause();
      return;
    }
    audio.src = getEffectAudioUrl(effect);
    audio.currentTime = 0;
    setPlayingId(effect.id);
    audio.play().catch(() => setPlayingId(null));
  };

  const add = (effect: Effect) => {
    onAdd(effect);
    setAddedId(effect.id);
  };

  const importLink = async () => {
    if (!onImport || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const effect = await onImport(query.trim());
      setQuery(effect.name);
      setImportedId(effect.id);
      toggle(effect);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import from myinstants.com failed');
    }
    setImporting(false);
  };

  return (
    <div className="c100-stack">
      <input
        className="c100-input"
        autoFocus={autoFocus}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (isLink) importLink();
          else if (matches[0]) add(matches[0]);
        }}
        placeholder={onImport ? `Search ${effects.length} sound effects, or paste a myinstants.com link` : `Search ${effects.length} sound effects`}
        aria-label="Search sound effects"
      />
      {isLink ? (
        <div className="c100-inline">
          <button type="button" className="c100-btn c100-btn-primary" onClick={importLink} disabled={importing}>
            {importing ? 'Importing…' : 'Import this sound'}
          </button>
          <span className="c100-muted">from myinstants.com. It joins your sound effects and plays so you can hear it.</span>
        </div>
      ) : matches.length === 0 ? (
        <div className="c100-muted">
          {effects.length === 0 ? 'No sound effects yet. Paste a myinstants.com link above to import one.' : `No sound effect matches "${query}".${onImport ? ' Paste a myinstants.com link to import a new one.' : ''}`}
        </div>
      ) : (
        <ul className="c100-fx-list">
          {matches.map(effect => {
            const playing = playingId === effect.id;
            return (
              <li key={effect.id} className={`c100-fx${playing ? ' is-playing' : ''}`}>
                <button
                  type="button"
                  className="c100-icon c100-clip is-ready"
                  onClick={() => toggle(effect)}
                  aria-label={playing ? `Stop ${effect.name}` : `Play ${effect.name}`}
                >
                  {playing ? '■' : '▶'}
                </button>
                <span className="c100-fx-name" title={effect.name}>
                  {effect.name}
                  {importedId === effect.id && <span className="c100-muted"> just imported</span>}
                </span>
                <button type="button" className="c100-btn" onClick={() => add(effect)}>
                  {addedId === effect.id ? 'Added' : addLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {importError && <div className="c100-error" role="alert">{importError}</div>}
      <audio
        ref={audioRef}
        preload="none"
        onPause={() => setPlayingId(null)}
        onEnded={() => setPlayingId(null)}
      />
    </div>
  );
};
