import React, { useEffect, useRef, useState } from 'react';
import { TrackItem } from './types';
import { ensureIds } from './timeline';
import { exportTimeline, listBackups, loadBackup, readTimelineFile } from './storage';

/** Export the timeline to a file, or replace it from a file or an automatic daily backup. */
export const BackupControls: React.FC<{
  items: TrackItem[];
  onReplace: (items: TrackItem[]) => void;
}> = ({ items, onReplace }) => {
  const [backups, setBackups] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listBackups().then(setBackups).catch(() => setBackups([]));
  }, []);

  const replace = (restored: Partial<TrackItem>[], source: string) => {
    const snippets = restored.filter(it => it.type === 'snippet').length;
    if (!window.confirm(`Replace the current timeline (${items.length} items) with ${source} (${restored.length} items, ${snippets} snippets)?`)) return;
    onReplace(ensureIds(restored));
    setStatus(`Restored ${source}`);
  };

  return (
    <div className="c100-backup">
      <button type="button" className="c100-btn" onClick={() => exportTimeline(items)}>Export timeline</button>
      <button type="button" className="c100-btn" onClick={() => fileRef.current?.click()}>Import file…</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            replace(await readTimelineFile(file), file.name);
          } catch (err) {
            setStatus(err instanceof Error ? err.message : 'Could not read the file');
          }
        }}
      />
      {backups.length > 0 && (
        <select
          className="c100-select"
          value=""
          aria-label="Restore an automatic backup"
          onChange={async e => {
            const date = e.target.value;
            if (!date) return;
            const restored = await loadBackup(date);
            if (restored) replace(restored, `the backup from ${date}`);
          }}
        >
          <option value="">Restore backup…</option>
          {backups.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      )}
      {status && <span className="c100-muted">{status}</span>}
    </div>
  );
};
