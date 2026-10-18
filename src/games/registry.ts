import { lazy, type ComponentType } from 'react';
import BreakoutGame, { BREAKOUT_HIGHSCORE_KEY } from './breakout/BreakoutGame';
import CircusGame, { CIRCUS_HIGHSCORE_KEY } from './circus/CircusGame';
import GalagaGame, { GALAGA_HIGHSCORE_KEY } from './galaga/GalagaGame';
import { recordSummary } from './kart/records';
import AntarcticGame, { ANTARCTIC_HIGHSCORE_KEY } from './antarctic/AntarcticGame';

// three.js가 커서 카트 게임은 들어갈 때 불러온다
const KartGame = lazy(() => import('./kart/KartGame'));
const MarbleGame = lazy(() => import('./marble/MarbleGame'));
// 원작 ROM 데이터가 필요해 개발 중에만 노출한다 (npm run tengai:extract).
// 배포 빌드에는 코드 조각도 넣지 않도록 개발 모드에서만 import 한다
const TengaiGame = import.meta.env.DEV ? lazy(() => import('./tengai/TengaiGame')) : null;

export interface GameInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  /** 점수로 겨루는 게임의 최고 점수 저장 키 */
  highScoreKey?: string;
  /** 점수 대신 다른 기록을 보여 줄 때 (예: 레이스 타임) */
  bestText?: () => string;
  component: ComponentType;
}

export const GAMES: GameInfo[] = [
  {
    id: 'marble',
    title: '구슬 미로',
    description: '공중에 떠 있는 3D 미로! 구슬을 굴려 보석을 모으고, 세 개의 작은 세계를 탐험하세요.',
    icon: '🔮',
    accent: '#a4cfb3',
    highScoreKey: 'marble-highscore',
    component: MarbleGame,
  },
  {
    id: 'antarctic',
    title: '남극탐험',
    description: '펭귄과 함께 떠나는 남극 일주! 얼음 구멍과 물개를 피하고 네 개의 기지에 도착하세요.',
    icon: '🐧',
    accent: '#9fe5df',
    highScoreKey: ANTARCTIC_HIGHSCORE_KEY,
    component: AntarcticGame,
  },
  {
    id: 'breakout',
    title: '벽돌깨기',
    description: '공을 튕겨 벽돌을 모두 깨세요. 5개 스테이지, 아이템 4종.',
    icon: '🧱',
    accent: '#4ade80',
    highScoreKey: BREAKOUT_HIGHSCORE_KEY,
    component: BreakoutGame,
  },
  {
    id: 'circus',
    title: '서커스',
    description: '추억의 서커스 찰리! 사자 불링, 외줄타기, 공 굴리기, 공중그네.',
    icon: '🎪',
    accent: '#f87171',
    highScoreKey: CIRCUS_HIGHSCORE_KEY,
    component: CircusGame,
  },
  {
    id: 'galaga',
    title: '갤러그',
    description: '편대를 이룬 외계 함대를 격추하세요. 트랙터 빔에 잡힌 전투기를 구출하면 듀얼 파이터!',
    icon: '🚀',
    accent: '#60a5fa',
    highScoreKey: GALAGA_HIGHSCORE_KEY,
    component: GalagaGame,
  },
  {
    id: 'kart',
    title: '카트 레이서',
    description: '3D 아케이드 레이싱! 드리프트 미니 터보, 아이템, CPU 라이벌 5명과 3바퀴 승부.',
    icon: '🏎️',
    accent: '#facc15',
    bestText: () => `베스트 ${recordSummary()}`,
    component: KartGame,
  },
  ...(TengaiGame
    ? [
        {
          id: 'tengai',
          title: '텐가이 (개발 중)',
          description: '원작 ROM으로 돌리는 횡스크롤 슈팅 이식판. 1스테이지부터 맞춰 가는 중입니다.',
          icon: '⛩️',
          accent: '#e0b25a',
          bestText: () => '개발 중',
          component: TengaiGame,
        },
      ]
    : []),
];
