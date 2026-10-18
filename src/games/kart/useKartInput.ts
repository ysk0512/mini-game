import { useCallback, useEffect, useRef } from 'react';
import { unlockAudio } from '../../shared/sound';
import type { KartInput } from './logic/kart';

interface Handlers {
  /** P / Esc */
  onPause: () => void;
  /** M */
  onMute: () => void;
}

const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight'],
  item: ['KeyX', 'KeyE', 'KeyJ'],
};
type Action = keyof typeof KEYS;

const actionOf = (code: string) => (Object.keys(KEYS) as Action[]).find((a) => KEYS[a].includes(code));

/** 누르고 있는 키를 모아 두었다가, 매 프레임 readInput()으로 KartInput을 만든다 */
export function useKartInput(handlers: Handlers) {
  const held = useRef<Record<Action, boolean>>({ up: false, down: false, left: false, right: false, drift: false, item: false });
  const itemPressed = useRef(false);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      unlockAudio();
      const action = actionOf(e.code);
      if (action) {
        if (action === 'item' && !e.repeat) itemPressed.current = true;
        held.current[action] = true;
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      if (e.code === 'KeyP' || e.code === 'Escape') handlersRef.current.onPause();
      else if (e.code === 'KeyM') handlersRef.current.onMute();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const action = actionOf(e.code);
      if (!action) return;
      held.current[action] = false;
      e.preventDefault();
    };
    const onBlur = () => {
      for (const a of Object.keys(held.current) as Action[]) held.current[a] = false;
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

  // 참조만 읽으므로 항상 같은 함수 (3D 장면이 불필요하게 다시 그려지지 않게)
  return useCallback((): KartInput => {
    const h = held.current;
    const useItem = itemPressed.current;
    itemPressed.current = false;
    return {
      throttle: Number(h.up) - Number(h.down),
      steer: Number(h.right) - Number(h.left),
      drift: h.drift,
      useItem,
    };
  }, []);
}
