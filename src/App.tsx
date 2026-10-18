import { Suspense, useEffect, useState } from 'react';
import { GAMES } from './games/registry';
import { Home } from './home/Home';

/** '#/circus' → 'circus', 그 외는 홈 */
const currentRoute = () => window.location.hash.replace(/^#\/?/, '');

function useHashRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const game = GAMES.find((g) => g.id === route);
  useEffect(() => {
    document.title = game ? `${game.title} | 미니 아케이드` : '미니 아케이드';
  }, [game]);

  if (!game) {
    return (
      <div className="app">
        <Home />
      </div>
    );
  }

  const Game = game.component;
  return (
    <div className="app">
      <a className="back-link" href="#/">
        ← 홈으로
      </a>
      <Suspense fallback={<p className="loading">불러오는 중…</p>}>
        <Game key={game.id} />
      </Suspense>
    </div>
  );
}
