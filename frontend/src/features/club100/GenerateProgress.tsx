import React from 'react';
import { Club100Job } from './types';

const STAGES: { stage: Club100Job['stage']; label: string }[] = [
  { stage: 'upload', label: 'Sending the running order' },
  { stage: 'download', label: 'Downloading songs' },
  { stage: 'process', label: 'Preparing clips' },
  { stage: 'concat', label: 'Stitching the MP3' },
];

export const GenerateProgress: React.FC<{ job: Club100Job }> = ({ job }) => {
  // 'queued' is the instant between upload and the first download report.
  const stage = job.stage === 'queued' ? 'download' : job.stage;
  const current = Math.max(0, STAGES.findIndex(s => s.stage === stage));
  const counted = (stage === 'download' || stage === 'process') && job.total > 0;
  const pct = counted ? Math.round((job.done / job.total) * 100) : null;

  return (
    <div role="status" aria-live="polite">
      <ol className="c100-steps">
        {STAGES.map((s, i) => (
          <li key={s.stage} className={i < current ? 'is-done' : i === current ? 'is-current' : undefined}>
            {i < current ? '✓ ' : ''}{s.label}
            {i === current && counted && ` ${job.done} of ${job.total}`}
          </li>
        ))}
      </ol>
      <div className="c100-meter" style={{ marginTop: 10 }}>
        <div style={{ width: `${pct ?? (current / STAGES.length) * 100}%` }} />
      </div>
      {job.skipped.length > 0 && <div className="c100-error" style={{ marginTop: 8 }}>Left out so far: {job.skipped.join(', ')}</div>}
    </div>
  );
};
