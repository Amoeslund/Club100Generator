import React, { useMemo, useRef, useState } from 'react';
import { Effect } from './types';
import { getEffectAudioUrl } from './api';

/**
 * Searchable list of sound effects with instant preview. ▶ plays the effect file itself (effects
 * keep their own level in the MP3, so this is how it will sound); Add hands it to `onAdd`.
 * Enter in the search box adds the first match.
 */
export const EffectPicker: React.FC<{
  effects: Effect[];
  onAdd: (effect: Effect) => void;
  addLabel?: string;
  autoFocus?: boolean;
}> = ({ effects, onAdd, addLabel = 'Add', autoFocus }) => {
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? effects.filter(e => e.name.toLowerCase().includes(q)) : effects;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [effects, query]);

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

  return (
    <div className="c100-stack">
      <input
        className="c100-input"
        autoFocus={autoFocus}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault();
            add(matches[0]);
          }
        }}
        placeholder={`Search ${effects.length} sound effects`}
        aria-label="Search sound effects"
      />
      {matches.length === 0 ? (
        <div className="c100-muted">
          {effects.length === 0 ? 'No sound effects yet. Import one from myinstants.com under Add songs and sound effects.' : `No sound effect matches "${query}".`}
        </div>
      ) : (
        <ul className="c100-fx-list">
          {matches.map(effect => {
            const playing = playingId === effect.id;
            return (
              <li key={effect.id} className={`c100-fx${playing ? ' is-playing' : ''}`}>
                <button
                  type="button"
                  className={`c100-icon c100-clip is-ready`}
                  onClick={() => toggle(effect)}
                  aria-label={playing ? `Stop ${effect.name}` : `Play ${effect.name}`}
                >
                  {playing ? '■' : '▶'}
                </button>
                <span className="c100-fx-name" title={effect.name}>{effect.name}</span>
                <button type="button" className="c100-btn" onClick={() => add(effect)}>
                  {addedId === effect.id ? 'Added' : addLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <audio
        ref={audioRef}
        preload="none"
        onPause={() => setPlayingId(null)}
        onEnded={() => setPlayingId(null)}
      />
    </div>
  );
};
