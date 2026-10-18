import type { ReactNode } from 'react';
import { POWERUP_STYLES } from '../game/render';
import type { GameStatus, PowerUpType } from '../game/types';
import type { HudInfo } from './HUD';

interface Props {
  status: Exclude<GameStatus, 'playing'>;
  hud: HudInfo;
  highScore: number;
  newRecord: boolean;
  onAction: () => void;
}

const POWERUP_NAMES: Record<PowerUpType, string> = {
  expand: '패들 확장',
  multiball: '멀티볼',
  slow: '슬로우',
  life: '생명 +1',
};

export function Overlay({ status, hud, highScore, newRecord, onAction }: Props) {
  const stage = hud.level + 1;
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
      title = `스테이지 ${stage}`;
      body = (
        <>
          <p>Space 또는 클릭으로 시작</p>
          <ul className="legend">
            {(Object.keys(POWERUP_STYLES) as PowerUpType[]).map((type) => (
              <li key={type}>
                <span className="badge" style={{ background: POWERUP_STYLES[type].color }}>
                  {POWERUP_STYLES[type].label}
                </span>
                {POWERUP_NAMES[type]}
              </li>
            ))}
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
    case 'levelClear':
      title = `스테이지 ${stage} 클리어!`;
      body = <p>점수 {hud.score}</p>;
      button = '다음 스테이지';
      break;
    case 'gameOver':
      title = '게임 오버';
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
