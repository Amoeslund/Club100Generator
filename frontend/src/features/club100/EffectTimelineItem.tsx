import React from 'react';
import { Effect } from './types';

interface EffectTimelineItemProps {
  effect: Effect;
  onRemove: () => void;
}

export const EffectTimelineItem: React.FC<EffectTimelineItemProps> = ({ effect, onRemove }) => (
  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
    <span style={{ fontWeight: 'bold', color: '#333', fontSize: 18, marginRight: 12 }}>{effect.name}</span>
    <audio controls src={effect.audioUrl} style={{ marginRight: 8, height: 32, background: '#fff', flex: 1 }} />
    <button onClick={onRemove} style={{ color: 'red', fontWeight: 'bold', border: '2px solid #000', borderRadius: 4, background: '#fff', padding: '2px 8px', cursor: 'pointer', boxShadow: '2px 2px 0 #000', marginLeft: 'auto' }}>✕</button>
  </div>
);