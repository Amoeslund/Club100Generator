import React, { useEffect, useRef, useState } from 'react';
import { ClipState } from './useClips';
import { getClipUrl } from './api';

/** Play/stop button for an effect's prepared clip, i.e. exactly as it will sound in the MP3. */
export const EffectPreview: React.FC<{ clip: ClipState | undefined; name: string }> = ({ clip, name }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const ready = clip?.status === 'ready' && clip.clipId;

  // A different effect was picked: stop the old one.
  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [clip?.clipId]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = 0;
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  if (clip?.status === 'error') {
    return <span className="c100-icon c100-clip is-error" title={clip.error} aria-label={`${name} could not be prepared: ${clip.error}`}>!</span>;
  }
  return (
    <>
      <button
        type="button"
        className={`c100-icon c100-clip ${ready ? 'is-ready' : 'is-pending'}`}
        onClick={toggle}
        disabled={!ready}
        aria-label={playing ? `Stop ${name}` : `Play ${name}`}
        title={ready ? `Play ${name}` : 'Preparing…'}
      >
        {ready ? (playing ? '■' : '▶') : <span className="c100-spin">◌</span>}
      </button>
      {ready && (
        <audio
          ref={audioRef}
          src={getClipUrl(clip.clipId!)}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </>
  );
};
