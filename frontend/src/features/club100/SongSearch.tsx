import React, { useState } from 'react';
import { Song } from './types';
import { youtubeSearch } from './api';

export const SongSearch: React.FC<{
  onAdd: (song: Song) => void;
}> = ({ onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResults(await youtubeSearch(query));
    } catch (e: unknown) {
      setError((e as Error).message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="c100-stack">
      <form onSubmit={handleSearch} className="c100-inline">
        <input className="c100-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Artist or song title" aria-label="Search YouTube" />
        <button type="submit" className="c100-btn c100-btn-primary" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search YouTube'}
        </button>
      </form>
      {error && <div className="c100-error">{error}</div>}
      {results.length > 0 && (
        <div className="c100-results">
          {results.map(song => (
            <div key={song.url} className="c100-result">
              {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnails, local app */}
              {song.thumbnail && <img src={song.thumbnail} alt="" />}
              <div className="c100-result-title" title={song.title}>
                {song.title}
                {song.artist && <div className="c100-muted">{song.artist}</div>}
              </div>
              <button
                type="button"
                className="c100-btn"
                onClick={() => { onAdd(song); setAdded(prev => new Set(prev).add(song.url)); }}
              >
                {added.has(song.url) ? 'Added' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
