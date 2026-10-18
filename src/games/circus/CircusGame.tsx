import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGameLoop } from '../../shared/useGameLoop';
import { useHiDpiCanvas } from '../../shared/useHiDpiCanvas';
import { useHighScore } from '../../shared/useHighScore';
import { VIEW_HEIGHT, VIEW_WIDTH } from './game/constants';
import { createCircus, displayBonus, STAGES, startStage, update } from './game/engine';
import { draw } from './game/render';
import type { CircusState, CircusStatus } from './game/types';
import { useCircusInput } from './useCircusInput';

export const CIRCUS_HIGHSCORE_KEY = 'circus-highscore';

interface HudInfo {
  score: number;
  lives: number;
  stage: number;
  bonus: number;
}

const toHud = (s: CircusState): HudInfo => ({ score: s.score, lives: s.lives, stage: s.stage, bonus: displayBonus(s) });

const sameHud = (a: HudInfo, b: HudInfo) =>
  a.score === b.score && a.lives === b.lives && a.stage === b.stage && a.bonus === b.bonus;

export default function CircusGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useHiDpiCanvas(canvasRef, VIEW_WIDTH, VIEW_HEIGHT);

  const [initialGame] = useState(() => createCircus());
  // 게임 상태는 매 프레임 바뀌므로 ref에 두고, HUD에 필요한 값만 바뀔 때 state로 반영한다
  const gameRef = useRef(initialGame);
  const [hud, setHud] = useState(() => toHud(initialGame));
  const hudRef = useRef(hud);

  // 키 입력·프레임 콜백에서 즉시 최신 상태를 읽기 위해 ref와 함께 관리한다
  const [status, setStatus] = useState<CircusStatus>('ready');
  const statusRef = useRef(status);
  const changeStatus = (next: CircusStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const [highScore, submitHighScore] = useHighScore(CIRCUS_HIGHSCORE_KEY);
  const [newRecord, setNewRecord] = useState(false);
  const jumpQueued = useRef(false);

  const syncHud = () => {
    const next = toHud(gameRef.current);
    if (sameHud(hudRef.current, next)) return;
    hudRef.current = next;
    setHud(next);
  };

  const handleAction = () => {
    switch (statusRef.current) {
      case 'ready':
        changeStatus('playing');
        break;
      case 'paused':
        changeStatus('playing');
        break;
      case 'gameOver':
      case 'victory':
        gameRef.current = createCircus();
        setNewRecord(false);
        changeStatus('ready');
        syncHud();
        break;
    }
  };

  const handleSelectStage = (index: number) => {
    startStage(gameRef.current, index);
    syncHud();
    changeStatus('playing');
  };

  const handleJump = () => {
    if (statusRef.current === 'playing') jumpQueued.current = true;
    else handleAction();
  };

  const handlePause = () => {
    if (statusRef.current === 'playing') changeStatus('paused');
    else if (statusRef.current === 'paused') changeStatus('playing');
  };

  const held = useCircusInput({ onJump: handleJump, onAction: handleAction, onPause: handlePause });

  useGameLoop((dt) => {
    const game = gameRef.current;
    if (statusRef.current === 'playing') {
      const events = update(game, dt, { ...held.current, jump: jumpQueued.current });
      jumpQueued.current = false;
      for (const event of events) {
        setNewRecord(submitHighScore(game.score));
        changeStatus(event);
      }
      syncHud();
    }
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx, game);
  });

  // 다른 창으로 전환하면 자동 일시정지
  useEffect(() => {
    const onBlur = () => {
      if (statusRef.current === 'playing') {
        statusRef.current = 'paused';
        setStatus('paused');
      }
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  return (
    <div className="game-page">
      <h1>서커스</h1>
      <div className="board circus-board">
        <div className="hud circus-hud">
          <span>SCORE <strong>{hud.score}</strong></span>
          <span>HI <strong>{Math.max(highScore, hud.score)}</strong></span>
          <span>STAGE <strong>{hud.stage + 1}/{STAGES.length}</strong></span>
          <span>BONUS <strong>{hud.bonus}</strong></span>
          <span className="lives">{'♥'.repeat(Math.max(0, hud.lives))}</span>
        </div>
        <div className="stage">
          <canvas
            ref={canvasRef}
            className="game-canvas circus-canvas"
            onPointerDown={(e) => {
              e.preventDefault();
              handleJump();
            }}
          />
          {status !== 'playing' && (
            <CircusOverlay
              status={status}
              hud={hud}
              highScore={highScore}
              newRecord={newRecord}
              onAction={handleAction}
              onSelectStage={handleSelectStage}
            />
          )}
        </div>
      </div>
      <p className="help">← → / A D: 이동 · Space / ↑ / 클릭: 점프 · P / Esc: 일시정지</p>
    </div>
  );
}

interface OverlayProps {
  status: Exclude<CircusStatus, 'playing'>;
  hud: HudInfo;
  highScore: number;
  newRecord: boolean;
  onAction: () => void;
  onSelectStage: (index: number) => void;
}

function CircusOverlay({ status, hud, highScore, newRecord, onAction, onSelectStage }: OverlayProps) {
  const result = (
    <>
      <p>점수 {hud.score}</p>
      <p>{newRecord ? '🎉 최고 기록 달성!' : `최고 점수 ${highScore}`}</p>
    </>
  );

  let title: string;
  let body: ReactNode;
  let button: string;
  switch (status) {
    case 'ready':
      title = '서커스';
      body = (
        <>
          <p>Space로 1스테이지부터 시작하거나, 연습할 스테이지를 고르세요</p>
          <ol className="stage-list">
            {STAGES.map((stage, i) => (
              <li key={stage.kind}>
                <button type="button" onClick={() => onSelectStage(i)}>
                  STAGE {i + 1} · {stage.name}
                </button>
              </li>
            ))}
          </ol>
        </>
      );
      button = '시작';
      break;
    case 'paused':
      title = '일시정지';
      body = <p>P / Esc로 계속</p>;
      button = '계속하기';
      break;
    case 'gameOver':
      title = 'GAME OVER';
      body = result;
      button = '다시 시작';
      break;
    case 'victory':
      title = '모든 스테이지 클리어!';
      body = result;
      button = '다시 시작';
      break;
  }

  return (
    <div className="overlay">
      <h2>{title}</h2>
      {body}
      <button type="button" onClick={onAction}>
        {button}
      </button>
    </div>
  );
}
