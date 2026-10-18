export type GameStatus = 'ready' | 'playing' | 'paused' | 'levelClear' | 'gameOver' | 'victory';

export interface Ball {
  x: number;
  y: number;
  /** 단위 방향 벡터. 실제 속도는 레벨/효과에 따라 계산된다. */
  dx: number;
  dy: number;
  /** 발사 전 패들에 붙어 있는 상태 */
  stuck: boolean;
}

export interface Paddle {
  /** 중심 x 좌표 */
  x: number;
}

export interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  unbreakable: boolean;
}

export type PowerUpType = 'expand' | 'multiball' | 'slow' | 'life';

export interface PowerUp {
  /** 중심 좌표 */
  x: number;
  y: number;
  type: PowerUpType;
}

export interface Effects {
  /** 남은 시간(초), 0이면 비활성 */
  expand: number;
  slow: number;
}

export interface GameState {
  level: number;
  score: number;
  lives: number;
  paddle: Paddle;
  balls: Ball[];
  bricks: Brick[];
  powerUps: PowerUp[];
  effects: Effects;
}

export interface Controls {
  left: boolean;
  right: boolean;
  /** 마우스로 조작 중일 때 캔버스 좌표계의 x, 키보드 조작 중이면 null */
  mouseX: number | null;
}

export type GameEvent = 'lifeLost' | 'gameOver' | 'levelClear';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
