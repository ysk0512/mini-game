import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MuteButton, toggleMuted } from '../../shared/MuteButton';
import { unlockAudio } from '../../shared/sound';
import { useGameLoop } from '../../shared/useGameLoop';
import { useHiDpiCanvas } from '../../shared/useHiDpiCanvas';
import { useHighScore } from '../../shared/useHighScore';
import { VIEW_HEIGHT, VIEW_WIDTH } from './game/constants';
import { createGalaga, update } from './game/engine';
import { draw } from './game/render';
import type { GalagaState, GalagaStatus } from './game/types';
import { playGalagaSounds } from './sounds';
import { useGalagaInput } from './useGalagaInput';

export const GALAGA_HIGHSCORE_KEY = 'galaga-highscore';

interface HudInfo {
  score: number;
  lives: number;
  stage: number;
  shots: number;
  hits: number;
}

const toHud = (s: GalagaState): HudInfo => ({ score: s.score, lives: s.lives, stage: s.stage, shots: s.shots, hits: s.hits });

const sameHud = (a: HudInfo, b: HudInfo) =>
  a.score === b.score && a.lives === b.lives && a.stage === b.stage && a.shots === b.shots && a.hits === b.hits;

export default function GalagaGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useHiDpiCanvas(canvasRef, VIEW_WIDTH, VIEW_HEIGHT);

  const [initialGame] = useState(createGalaga);
  // 게임 상태는 매 프레임 바뀌므로 ref에 두고, HUD에 필요한 값만 바뀔 때 state로 반영한다
  const gameRef = useRef(initialGame);
  const [hud, setHud] = useState(() => toHud(initialGame));
  const hudRef = useRef(hud);

  // 키 입력·프레임 콜백에서 즉시 최신 상태를 읽기 위해 ref와 함께 관리한다
  const [status, setStatus] = useState<GalagaStatus>('ready');
  const statusRef = useRef(status);
  const changeStatus = (next: GalagaStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const [highScore, submitHighScore] = useHighScore(GALAGA_HIGHSCORE_KEY);
  const [newRecord, setNewRecord] = useState(false);
  /** 터치·마우스: 누르고 있는 동안 그 x 좌표로 이동하며 연사 */
  const pointer = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });

  const syncHud = () => {
    const next = toHud(gameRef.current);
    if (sameHud(hudRef.current, next)) return;
    hudRef.current = next;
    setHud(next);
  };

  const handleAction = () => {
    unlockAudio();
    switch (statusRef.current) {
      case 'ready':
      case 'paused':
        changeStatus('playing');
        break;
      case 'gameOver':
        gameRef.current = createGalaga();
        setNewRecord(false);
        changeStatus('ready');
        syncHud();
        break;
    }
  };

  const handlePause = () => {
    if (statusRef.current === 'playing') changeStatus('paused');
    else if (statusRef.current === 'paused') changeStatus('playing');
  };

  const held = useGalagaInput({
    onFirePress: () => {
      if (statusRef.current !== 'playing') handleAction();
    },
    onAction: handleAction,
    onPause: handlePause,
    onMute: toggleMuted,
  });

  useGameLoop((dt) => {
    const game = gameRef.current;
    if (statusRef.current === 'playing') {
      const ptr = pointer.current;
      const playerX = game.player.x;
      const events = update(game, dt, {
        left: held.current.left || (ptr.active && ptr.x < playerX - 4),
        right: held.current.right || (ptr.active && ptr.x > playerX + 4),
        fire: held.current.fire || ptr.active,
      });
      playGalagaSounds(game.sounds);
      game.sounds.length = 0;
      if (events.includes('gameOver')) {
        setNewRecord(submitHighScore(game.score));
        changeStatus('gameOver');
      }
      syncHud();
    }
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx, game);
  });

  // 다른 창으로 전환하면 자동 일시정지
  useEffect(() => {
    const onBlur = () => {
      pointer.current.active = false;
      if (statusRef.current === 'playing') {
        statusRef.current = 'paused';
        setStatus('paused');
      }
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  const toCanvasX = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH;
  };

  return (
    <div className="game-page">
      <h1>갤러그</h1>
      <div className="board galaga-board">
        <div className="hud arcade-hud">
          <span>1UP <strong>{hud.score}</strong></span>
          <span>HI <strong>{Math.max(highScore, hud.score)}</strong></span>
          <span>STAGE <strong>{hud.stage}</strong></span>
          <span className="reserve" title="남은 전투기">
            {'▲'.repeat(Math.max(0, hud.lives - 1))}
          </span>
          <MuteButton />
        </div>
        <div className="stage">
          <canvas
            ref={canvasRef}
            className="game-canvas galaga-canvas"
            onPointerDown={(e) => {
              unlockAudio();
              e.currentTarget.setPointerCapture(e.pointerId);
              pointer.current = { active: true, x: toCanvasX(e) };
            }}
            onPointerMove={(e) => {
              if (pointer.current.active) pointer.current.x = toCanvasX(e);
            }}
            onPointerUp={() => (pointer.current.active = false)}
            onPointerCancel={() => (pointer.current.active = false)}
          />
          {status !== 'playing' && (
            <GalagaOverlay status={status} hud={hud} highScore={highScore} newRecord={newRecord} onAction={handleAction} />
          )}
        </div>
      </div>
      <p className="help">← → / A D: 이동 · Space / Z: 발사 · 터치: 누른 곳으로 이동하며 연사 · P / Esc: 일시정지 · M: 소리</p>
    </div>
  );
}

interface OverlayProps {
  status: Exclude<GalagaStatus, 'playing'>;
  hud: HudInfo;
  highScore: number;
  newRecord: boolean;
  onAction: () => void;
}

function GalagaOverlay({ status, hud, highScore, newRecord, onAction }: OverlayProps) {
  let title: string;
  let body: ReactNode;
  let button: string;
  switch (status) {
    case 'ready':
      title = '갤러그';
      body = (
        <>
          <p>Space로 시작</p>
          <ul className="galaga-tips">
            <li>보스(초록)는 두 번 맞혀야 격추됩니다</li>
            <li>트랙터 빔에 잡힌 전투기는, 그 보스가 급강하할 때 격추하면 구출되어 듀얼 파이터가 됩니다</li>
            <li>3스테이지부터 4스테이지마다 챌린징 스테이지</li>
          </ul>
        </>
      );
      button = '시작';
      break;
    case 'paused':
      title = '일시정지';
      body = <p>P / Esc로 계속</p>;
      button = '계속하기';
      break;
    case 'gameOver': {
      const ratio = hud.shots ? ((hud.hits / hud.shots) * 100).toFixed(1) : '0.0';
      title = 'GAME OVER';
      body = (
        <>
          <p>점수 {hud.score}</p>
          <p>{newRecord ? '🎉 최고 기록 달성!' : `최고 점수 ${highScore}`}</p>
          <table className="result-table">
            <tbody>
              <tr>
                <td>발사</td>
                <td>{hud.shots}</td>
              </tr>
              <tr>
                <td>명중</td>
                <td>{hud.hits}</td>
              </tr>
              <tr>
                <td>명중률</td>
                <td>{ratio}%</td>
              </tr>
            </tbody>
          </table>
        </>
      );
      button = '다시 시작';
      break;
    }
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
