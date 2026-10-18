export type CircusStatus = 'ready' | 'playing' | 'paused' | 'gameOver' | 'victory';

/** 엔진 내부 진행 단계 */
export type Phase = 'intro' | 'playing' | 'dying' | 'clear' | 'done';

export type StageKind = 'lion' | 'rope' | 'balls' | 'trapeze';

export interface Input {
  left: boolean;
  right: boolean;
  /** 이번 프레임에 점프 키가 눌렸는지 (엣지 트리거) */
  jump: boolean;
}

export interface Player {
  x: number;
  /** 발 위치 */
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** 걷기 애니메이션 누적 시간 */
  anim: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ring {
  x: number;
  scored: boolean;
}

export interface Pot {
  x: number;
  scored: boolean;
}

export interface LionLevel {
  kind: 'lion';
  rings: Ring[];
  pots: Pot[];
  spawnTimer: number;
}

export interface Monkey {
  x: number;
  y: number;
  vy: number;
  blue: boolean;
  scored: boolean;
}

export interface RopeLevel {
  kind: 'rope';
  monkeys: Monkey[];
  spawnTimer: number;
}

export interface RollingBall {
  id: number;
  x: number;
  vx: number;
  scored: boolean;
}

export interface BallLevel {
  kind: 'balls';
  balls: RollingBall[];
  /** 타고 있는 공, 공중에 있으면 null */
  ridingId: number | null;
  nextId: number;
  spawnTimer: number;
}

export interface Trapeze {
  ax: number;
  ay: number;
  amp: number;
  phase: number;
}

export interface TrapezeLevel {
  kind: 'trapeze';
  trapezes: Trapeze[];
  /** 매달린 그네 인덱스 */
  holding: number | null;
  /** 시작 발판 위에 서 있는지 */
  standing: boolean;
  /** 방금 놓은 그네를 바로 다시 잡지 않도록 */
  lastReleased: number | null;
  releaseTimer: number;
  /** 다시 시작할 그네 인덱스, -1이면 시작 발판 */
  checkpoint: number;
}

export type Level = LionLevel | RopeLevel | BallLevel | TrapezeLevel;

export interface CircusState {
  stage: number;
  score: number;
  lives: number;
  bonus: number;
  /** 경과 시간 (애니메이션·그네 흔들림 기준) */
  time: number;
  phase: Phase;
  phaseTimer: number;
  checkpointX: number;
  cameraX: number;
  player: Player;
  level: Level;
  deathCause: 'hit' | 'fall' | null;
}

export type CircusEvent = 'gameOver' | 'victory';
