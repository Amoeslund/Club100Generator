import React, { useState } from 'react';
import { Song } from './types';
import { youtubeSearch } from './api';

export const SongSearch: React.FC<{
  onAdd: (song: Song) => void;
}> = ({ onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await youtubeSearch(query);
      setResults(res);
    } catch (e: any) {
      setError(e.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: '3px solid black', padding: 12, marginBottom: 16, background: '#f0e6ff', borderRadius: 8 }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', marginBottom: 8 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search YouTube for songs..."
          style={{ flex: 1, fontSize: 16, border: '2px solid black', borderRadius: 4, padding: 4, marginRight: 8 }}
        />
        <button type="submit" style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {results.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #aaa', borderRadius: 4, background: '#fff' }}>
          {results.map((song, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: 6, borderBottom: '1px solid #eee' }}>
              {song.thumbnail && <img src={song.thumbnail} alt="thumb" style={{ width: 40, height: 40, marginRight: 8, borderRadius: 4, border: '1px solid #ccc' }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold' }}>{song.title}</div>
                <div style={{ fontSize: 13, color: '#666' }}>{song.artist}</div>
              </div>
              <button onClick={() => onAdd(song)} style={{ marginLeft: 8, fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#ffd6a5', padding: '4px 12px' }}>
                + Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 