import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted, unlockAudio } from './sound';

export function useMuted() {
  return useSyncExternalStore(subscribeMuted, isMuted);
}

export function toggleMuted() {
  setMuted(!isMuted());
  unlockAudio();
}

export function MuteButton() {
  const muted = useMuted();
  return (
    <button
      type="button"
      className="mute-button"
      onClick={(e) => {
        e.currentTarget.blur();
        toggleMuted();
      }}
      title={muted ? '소리 켜기 (M)' : '소리 끄기 (M)'}
      aria-label={muted ? '소리 켜기' : '소리 끄기'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
