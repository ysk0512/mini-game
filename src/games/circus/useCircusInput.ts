import { useEffect, useRef } from 'react';

export interface HeldKeys {
  left: boolean;
  right: boolean;
}

interface InputHandlers {
  /** Space / ↑ / W / Z */
  onJump: () => void;
  /** Enter */
  onAction: () => void;
  /** P / Esc */
  onPause: () => void;
}

/** 좌우 키는 프레임마다 읽도록 ref로, 점프·시작·일시정지는 눌린 순간 콜백으로 전달한다. */
export function useCircusInput(handlers: InputHandlers) {
  const held = useRef<HeldKeys>({ left: false, right: false });
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const h = held.current;
    const setDirection = (code: string, down: boolean) => {
      if (code === 'ArrowLeft' || code === 'KeyA') h.left = down;
      else if (code === 'ArrowRight' || code === 'KeyD') h.right = down;
      else return false;
      return true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (setDirection(e.code, true)) {
        e.preventDefault();
        return;
      }
      switch (e.code) {
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
        case 'KeyZ':
          if (!e.repeat) handlersRef.current.onJump();
          break;
        case 'Enter':
          if (!e.repeat) handlersRef.current.onAction();
          break;
        case 'KeyP':
        case 'Escape':
          if (!e.repeat) handlersRef.current.onPause();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (setDirection(e.code, false) || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    };

    const onBlur = () => {
      h.left = false;
      h.right = false;
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
