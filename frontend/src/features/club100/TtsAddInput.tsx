import React from 'react';

interface TtsAddInputProps {
  value: string;
  setValue: (v: string) => void;
  onAdd: () => void;
}

export const TtsAddInput: React.FC<TtsAddInputProps> = ({ value, setValue, onAdd }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <input
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onAdd();
      }}
      style={{ fontSize: 16, border: '2px solid #000', borderRadius: 4, padding: 4, flex: 1 }}
      placeholder="TTS text..."
    />
    <button
      onClick={onAdd}
      style={{ fontWeight: 'bold', border: '2px solid black', borderRadius: 4, background: '#baffc9', padding: '4px 16px' }}
      disabled={!value.trim()}
    >
      Add
    </button>
  </div>
);