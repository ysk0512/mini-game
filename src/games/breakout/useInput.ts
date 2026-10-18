import { useEffect, useRef, type RefObject } from 'react';
import { CANVAS_WIDTH } from './game/constants';
import type { Controls } from './game/types';

interface InputHandlers {
  /** Space / Enter */
  onAction: () => void;
  /** P / Esc */
  onPause: () => void;
}

/** 키보드·마우스 입력을 Controls ref로 모은다. 프레임마다 읽으므로 state가 아닌 ref를 쓴다. */
export function useInput(canvasRef: RefObject<HTMLCanvasElement | null>, handlers: InputHandlers) {
  const controls = useRef<Controls>({ left: false, right: false, mouseX: null });
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const c = controls.current;

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          c.left = true;
          c.mouseX = null;
          break;
        case 'ArrowRight':
        case 'KeyD':
          c.right = true;
          c.mouseX = null;
          break;
        case 'Space':
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
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          c.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          c.right = false;
          break;
        case 'Space':
        case 'Enter':
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      c.mouseX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    };

    const onBlur = () => {
      c.left = false;
      c.right = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onBlur);
    };
  }, [canvasRef]);

  return controls;
}
