import React from 'react';

export const GenerateButton: React.FC<{
  onClick: () => void;
  loading?: boolean;
}> = ({ onClick, loading }) => (
  <button
    onClick={onClick}
    disabled={loading}
    style={{
      fontSize: 22,
      fontWeight: 'bold',
      border: '3px solid black',
      borderRadius: 8,
      background: loading ? '#ccc' : '#baffc9',
      color: '#222',
      padding: '16px 32px',
      boxShadow: '4px 4px 0 #000',
      cursor: loading ? 'not-allowed' : 'pointer',
      margin: '24px 0',
    }}
  >
    {loading ? 'Generating...' : 'Generate Track'}
  </button>
); 