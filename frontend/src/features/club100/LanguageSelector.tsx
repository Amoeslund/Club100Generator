import React from 'react';
import { LanguageOption } from './types';

const LANGUAGES: LanguageOption[] = [
  { code: 'da', label: 'Dansk' },
  { code: 'en', label: 'English' },
];

export const LanguageSelector: React.FC<{
  value: string;
  onChange: (lang: string) => void;
}> = ({ value, onChange }) => (
  <div style={{ border: '3px solid black', padding: 12, marginBottom: 16, background: '#fffbe6', borderRadius: 8 }}>
    <label style={{ fontWeight: 'bold', marginRight: 8 }}>Sprog / Language:</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ fontSize: 18, border: '2px solid black', borderRadius: 4, padding: 4 }}
    >
      {LANGUAGES.map(l => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  </div>
); 