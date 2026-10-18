import type { CSSProperties } from 'react';
import { GAMES } from '../games/registry';
import { readHighScore } from '../shared/useHighScore';

export function Home() {
  return (
    <div className="home">
      <h1 className="home-title">미니 아케이드</h1>
      <p className="home-subtitle">플레이할 게임을 선택하세요</p>
      <div className="game-grid">
        {GAMES.map((game) => (
          <a
            key={game.id}
            className="game-card"
            href={`#/${game.id}`}
            style={{ '--accent': game.accent } as CSSProperties}
          >
            <span className="game-icon" aria-hidden>
              {game.icon}
            </span>
            <span className="game-name">{game.title}</span>
            <span className="game-desc">{game.description}</span>
            <span className="game-best">
              {game.bestText ? game.bestText() : `최고 점수 ${readHighScore(game.highScoreKey ?? game.id)}`}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
