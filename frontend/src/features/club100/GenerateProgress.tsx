import React from 'react';
import { Club100Job } from './types';

const STAGES: { stage: Club100Job['stage']; label: string }[] = [
  { stage: 'upload', label: 'Uploading timeline' },
  { stage: 'download', label: 'Downloading songs' },
  { stage: 'process', label: 'Normalizing clips' },
  { stage: 'concat', label: 'Stitching the track' },
];

export const GenerateProgress: React.FC<{ job: Club100Job }> = ({ job }) => {
  // 'queued' is the instant between upload and the first download report.
  const stage = job.stage === 'queued' ? 'download' : job.stage;
  const current = Math.max(0, STAGES.findIndex(s => s.stage === stage));
  const counted = stage === 'download' || stage === 'process';
  const pct = counted && job.total > 0 ? Math.round((job.done / job.total) * 100) : null;

  return (
    <div style={{ marginTop: 16, padding: 16, border: '2px solid black', borderRadius: 8, background: '#fffbe6' }}>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {STAGES.map((s, i) => (
          <li key={s.stage} style={{ fontWeight: i === current ? 'bold' : 'normal', opacity: i > current ? 0.4 : 1 }}>
            {i < current ? '✅' : i === current ? '⏳' : '⬜'} {s.label}
            {i === current && counted && job.total > 0 && ` (${job.done}/${job.total})`}
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 12, height: 16, border: '2px solid black', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div
          style={{
            height: '100%',
            width: pct === null ? '100%' : `${pct}%`,
            background: '#baffc9',
            transition: 'width 0.5s',
            animation: pct === null ? 'club100-pulse 1.2s ease-in-out infinite' : undefined,
          }}
        />
      </div>
      <style>{`@keyframes club100-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
      {job.skipped.length > 0 && (
        <div style={{ marginTop: 8, color: '#b00' }}>
          Skipped so far: {job.skipped.join(', ')}
        </div>
      )}
    </div>
  );
};
