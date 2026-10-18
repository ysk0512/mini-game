import { useRef, type RefObject } from 'react';
import { useGameLoop } from '../../../shared/useGameLoop';
import { useHiDpiCanvas } from '../../../shared/useHiDpiCanvas';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { draw } from '../game/render';
import type { Controls, GameState, GameStatus } from '../game/types';
import { useInput } from '../useInput';

interface Props {
  gameRef: RefObject<GameState>;
  status: GameStatus;
  /** 매 프레임 그리기 전에 호출된다 */
  onFrame: (dt: number, controls: Controls) => void;
  onAction: () => void;
  onPause: () => void;
}

export function GameCanvas({ gameRef, status, onFrame, onAction, onPause }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controls = useInput(canvasRef, { onAction, onPause });

  useHiDpiCanvas(canvasRef, CANVAS_WIDTH, CANVAS_HEIGHT);

  useGameLoop((dt) => {
    onFrame(dt, controls.current);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx, gameRef.current, status === 'playing');
  });

  return <canvas ref={canvasRef} className="game-canvas" onClick={onAction} />;
}
