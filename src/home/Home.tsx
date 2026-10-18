import { useEffect, useState, type CSSProperties } from 'react';
import { GAMES } from '../games/registry';
import { readHighScore } from '../shared/useHighScore';

/** 홈 화면에서 이 글자를 차례로 누르면 숨긴 게임이 보이고, 한 번 더 누르면 다시 숨는다 */
const SECRET = 'tengai';
const SECRET_KEY = 'secret-menu-unlocked';

function readUnlocked() {
  try {
    return localStorage.getItem(SECRET_KEY) === '1';
  } catch {
    return false;
  }
}

function useSecretMenu() {
  const [unlocked, setUnlocked] = useState(readUnlocked);

  useEffect(() => {
    let typed = '';
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-SECRET.length);
      if (typed !== SECRET) return;
      typed = '';
      setUnlocked((was) => {
        try {
          if (was) localStorage.removeItem(SECRET_KEY);
          else localStorage.setItem(SECRET_KEY, '1');
        } catch {
          // 저장이 안 되면 이번 방문 동안만 보인다
        }
        return !was;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return unlocked;
}

export function Home() {
  const unlocked = useSecretMenu();
  const games = GAMES.filter((g) => !g.hidden || unlocked);

  return (
    <div className="home">
      <h1 className="home-title">미니 아케이드</h1>
      <p className="home-subtitle">플레이할 게임을 선택하세요</p>
      <div className="game-grid">
        {games.map((game) => (
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
