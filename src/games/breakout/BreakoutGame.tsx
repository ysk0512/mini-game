import { useEffect, useRef, useState } from 'react';
import { useHighScore } from '../../shared/useHighScore';
import { GameCanvas } from './components/GameCanvas';
import { HUD, type HudInfo } from './components/HUD';
import { Overlay } from './components/Overlay';
import { createGame, isLastLevel, launchBalls, loadLevel, update } from './game/engine';
import type { Controls, GameState, GameStatus } from './game/types';

export const BREAKOUT_HIGHSCORE_KEY = 'breakout-highscore';

function toHud(game: GameState): HudInfo {
  return {
    score: game.score,
    lives: game.lives,
    level: game.level,
    expand: Math.ceil(game.effects.expand),
    slow: Math.ceil(game.effects.slow),
  };
}

const sameHud = (a: HudInfo, b: HudInfo) =>
  a.score === b.score && a.lives === b.lives && a.level === b.level && a.expand === b.expand && a.slow === b.slow;

export default function BreakoutGame() {
  const [initialGame] = useState(createGame);
  // 게임 상태는 매 프레임 바뀌므로 ref에 두고, HUD에 필요한 값만 바뀔 때 state로 반영한다
  const gameRef = useRef(initialGame);
  const [hud, setHud] = useState(() => toHud(initialGame));
  const hudRef = useRef(hud);

  // 키 입력·프레임 콜백에서 즉시 최신 상태를 읽기 위해 ref와 함께 관리한다
  const [status, setStatus] = useState<GameStatus>('ready');
  const statusRef = useRef(status);
  const changeStatus = (next: GameStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const [highScore, submitHighScore] = useHighScore(BREAKOUT_HIGHSCORE_KEY);
  const [newRecord, setNewRecord] = useState(false);

  const syncHud = () => {
    const next = toHud(gameRef.current);
    if (sameHud(hudRef.current, next)) return;
    hudRef.current = next;
    setHud(next);
  };

  const finish = (result: 'gameOver' | 'victory') => {
    setNewRecord(submitHighScore(gameRef.current.score));
    changeStatus(result);
  };

  const handleFrame = (dt: number, controls: Controls) => {
    if (statusRef.current !== 'playing') return;
    const game = gameRef.current;
    for (const event of update(game, dt, controls)) {
      if (event === 'gameOver') finish('gameOver');
      else if (event === 'levelClear') {
        if (isLastLevel(game)) finish('victory');
        else changeStatus('levelClear');
      }
    }
    syncHud();
  };

  const handleAction = () => {
    const game = gameRef.current;
    switch (statusRef.current) {
      case 'ready':
        launchBalls(game);
        changeStatus('playing');
        break;
      case 'playing':
        launchBalls(game);
        break;
      case 'paused':
        changeStatus('playing');
        break;
      case 'levelClear':
        loadLevel(game, game.level + 1);
        changeStatus('playing');
        syncHud();
        break;
      case 'gameOver':
      case 'victory':
        gameRef.current = createGame();
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
      <h1>벽돌깨기</h1>
      <div className="board">
        <HUD hud={hud} highScore={highScore} />
        <div className="stage">
          <GameCanvas
            gameRef={gameRef}
            status={status}
            onFrame={handleFrame}
            onAction={handleAction}
            onPause={handlePause}
          />
          {status !== 'playing' && (
            <Overlay status={status} hud={hud} highScore={highScore} newRecord={newRecord} onAction={handleAction} />
          )}
        </div>
      </div>
      <p className="help">← → / A D / 마우스: 이동 · Space / 클릭: 발사 · P / Esc: 일시정지</p>
    </div>
  );
}
