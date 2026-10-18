import {
  ACCEL,
  BOOST_MAX_SPEED,
  GRIP,
  MAX_SPEED,
  TURN_RATE,
} from './constants';

/** 1~5 단계 능력치. 카트마다 합이 같아서 '무조건 좋은 카트'는 없다 */
export interface Stats {
  /** 최고 속도 */
  speed: number;
  /** 가속력 */
  accel: number;
  /** 핸들링 (회전·접지력) */
  handling: number;
  /** 드리프트 미니 터보 차지 속도 */
  drift: number;
  /** 무게: 무거울수록 부딪혔을 때 덜 밀린다 */
  weight: number;
}

export const STAT_LABELS: Record<keyof Stats, string> = {
  speed: '속도',
  accel: '가속',
  handling: '핸들링',
  drift: '드리프트',
  weight: '무게',
};

export const STAT_MAX = 5;

/** 보이는 모양 */
export interface KartBody {
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  /** 스포일러 폭 (0이면 없음) */
  spoiler: number;
  /** 버기용 롤바 */
  rollBar: boolean;
  /** 옆 날개 */
  fins: boolean;
}

export interface KartDef {
  id: string;
  name: string;
  description: string;
  stats: Stats;
  body: KartBody;
}

export type Headgear = 'cap' | 'bolt' | 'bunny' | 'bear' | 'fox' | 'penguin';

export interface CharacterDef {
  id: string;
  name: string;
  /** 카트 차체·미니맵 점 색 */
  color: string;
  /** 헬멧·장식 색 */
  accent: string;
  headgear: Headgear;
  /** 선택 화면 아이콘 */
  icon: string;
}

export const KARTS: KartDef[] = [
  {
    id: 'standard',
    name: '스탠다드',
    description: '모든 능력이 고른 기본 카트.',
    stats: { speed: 3, accel: 3, handling: 3, drift: 3, weight: 3 },
    body: { length: 1.9, width: 1.25, height: 0.3, wheelRadius: 0.3, spoiler: 1.3, rollBar: false, fins: false },
  },
  {
    id: 'speedster',
    name: '스피드스터',
    description: '최고 속도가 가장 빠르지만 출발이 느리고 핸들이 무겁다.',
    stats: { speed: 5, accel: 2, handling: 2, drift: 3, weight: 3 },
    body: { length: 2.25, width: 1.1, height: 0.24, wheelRadius: 0.28, spoiler: 1.5, rollBar: false, fins: false },
  },
  {
    id: 'buggy',
    name: '버기',
    description: '가속과 핸들링이 뛰어난 가벼운 카트. 최고 속도는 낮다.',
    stats: { speed: 2, accel: 5, handling: 4, drift: 2, weight: 2 },
    body: { length: 1.6, width: 1.3, height: 0.34, wheelRadius: 0.4, spoiler: 0, rollBar: true, fins: false },
  },
  {
    id: 'drifter',
    name: '드리프터',
    description: '미니 터보가 가장 빨리 차오른다. 가벼워서 잘 밀린다.',
    stats: { speed: 3, accel: 3, handling: 3, drift: 5, weight: 1 },
    body: { length: 1.95, width: 1.3, height: 0.26, wheelRadius: 0.3, spoiler: 1.6, rollBar: false, fins: true },
  },
  {
    id: 'tank',
    name: '불도저',
    description: '무겁고 빠르다. 부딪히면 상대를 밀어내지만 가속이 가장 느리다.',
    stats: { speed: 4, accel: 1, handling: 2, drift: 3, weight: 5 },
    body: { length: 2.05, width: 1.5, height: 0.42, wheelRadius: 0.36, spoiler: 0.9, rollBar: false, fins: false },
  },
];

export const CHARACTERS: CharacterDef[] = [
  { id: 'red', name: '레드', color: '#ef4444', accent: '#f8fafc', headgear: 'cap', icon: '🧢' },
  { id: 'bolt', name: '번개', color: '#facc15', accent: '#1f2937', headgear: 'bolt', icon: '⚡' },
  { id: 'bunny', name: '토끼', color: '#f472b6', accent: '#fdf2f8', headgear: 'bunny', icon: '🐰' },
  { id: 'bear', name: '곰돌이', color: '#a16207', accent: '#78350f', headgear: 'bear', icon: '🐻' },
  { id: 'fox', name: '여우', color: '#fb923c', accent: '#fff7ed', headgear: 'fox', icon: '🦊' },
  { id: 'penguin', name: '펭귄', color: '#60a5fa', accent: '#111827', headgear: 'penguin', icon: '🐧' },
];

export const kartById = (id: string) => KARTS.find((k) => k.id === id) ?? KARTS[0];
export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

/** 실제 주행에 쓰이는 값 */
export interface KartTuning {
  maxSpeed: number;
  boostMaxSpeed: number;
  accel: number;
  turnRate: number;
  grip: number;
  /** 드리프트 차지 속도 배율 */
  driftCharge: number;
  /** 부딪힐 때 쓰는 상대 질량 */
  mass: number;
}

/** 3을 기준(배율 1)으로 한 단계마다 step만큼 오르내린다 */
const scale = (value: number, step: number) => 1 + (value - 3) * step;

/** 능력치 → 주행 값. 차이는 '조금씩': 최고 속도는 ±6%, 가속은 ±20% 정도 */
export function tuningOf(stats: Stats): KartTuning {
  const speed = scale(stats.speed, 0.03);
  return {
    maxSpeed: MAX_SPEED * speed,
    boostMaxSpeed: BOOST_MAX_SPEED * speed,
    accel: ACCEL * scale(stats.accel, 0.1),
    turnRate: TURN_RATE * scale(stats.handling, 0.05),
    grip: GRIP * scale(stats.handling, 0.08),
    driftCharge: scale(stats.drift, 0.08),
    mass: scale(stats.weight, 0.15),
  };
}

export const DEFAULT_TUNING = tuningOf(KARTS[0].stats);
