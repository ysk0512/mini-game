import { useEffect, useRef } from 'react';
import { unlockAudio } from '../../shared/sound';

export interface HeldKeys {
  left: boolean;
  right: boolean;
  fire: boolean;
}

interface InputHandlers {
  /** Space / Z (누른 순간) */
  onFirePress: () => void;
  /** Enter */
  onAction: () => void;
  /** P / Esc */
  onPause: () => void;
  /** M */
  onMute: () => void;
}

/** 이동·발사 키는 누르고 있는 동안 ref로, 나머지는 눌린 순간 콜백으로 전달한다. */
export function useGalagaInput(handlers: InputHandlers) {
  const held = useRef<HeldKeys>({ left: false, right: false, fire: false });
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const h = held.current;
    const setHeld = (code: string, down: boolean) => {
      if (code === 'ArrowLeft' || code === 'KeyA') h.left = down;
      else if (code === 'ArrowRight' || code === 'KeyD') h.right = down;
      else if (code === 'Space' || code === 'KeyZ') h.fire = down;
      else return false;
      return true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      unlockAudio();
      const fireKey = e.code === 'Space' || e.code === 'KeyZ';
      if (fireKey && !e.repeat) handlersRef.current.onFirePress();
      if (setHeld(e.code, true)) {
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      switch (e.code) {
        case 'Enter':
          handlersRef.current.onAction();
          break;
        case 'KeyP':
        case 'Escape':
          handlersRef.current.onPause();
          break;
        case 'KeyM':
          handlersRef.current.onMute();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (setHeld(e.code, false) || e.code === 'Enter') e.preventDefault();
    };

    const onBlur = () => {
      h.left = false;
      h.right = false;
      h.fire = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return held;
}
