import type { Slot } from './formation';
import type { Path } from './path';

export type GalagaStatus = 'ready' | 'playing' | 'paused' | 'gameOver';

/** 엔진 내부 진행 단계 */
export type Phase = 'intro' | 'playing' | 'stageClear' | 'challengeResult' | 'over' | 'done';

export type EnemyKind = 'bee' | 'butterfly' | 'boss';

export type EnemyMode =
  /** 아직 등장 전 */
  | 'waiting'
  /** 입장 곡선을 따라 비행 */
  | 'entering'
  /** 편대 자리로 이동 */
  | 'toSlot'
  | 'formation'
  /** 급강하 곡선을 따라 비행 */
  | 'diving'
  /** 트랙터 빔 발사 중 */
  | 'beaming'
  /** 챌린징 스테이지: 곡선을 따라 날아갔다 사라짐 */
  | 'challenge';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** 챌린징 스테이지 적은 편대 자리가 없다 */
  slot: Slot | null;
  x: number;
  y: number;
  /** 스프라이트 회전 각도 (위쪽이 0) */
  angle: number;
  hp: number;
  mode: EnemyMode;
  path: Path | null;
  /** 경로를 따라 이동한 거리 */
  distance: number;
  speed: number;
  /** waiting → entering 으로 바뀌는 스테이지 경과 시간 */
  spawnAt: number;
  /** 다음 사격까지 남은 시간, 쏠 총알이 없으면 Infinity */
  fireTimer: number;
  shotsLeft: number;
  /** 트랙터 빔 급강하인지 */
  beamDive: boolean;
  beamTimer: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Player {
  /** 듀얼일 때는 두 전투기의 가운데 */
  x: number;
  alive: boolean;
  dual: boolean;
  respawnTimer: number;
  fireCooldown: number;
}

export type CaptiveState =
  /** 빔에 끌려 올라가는 중 */
  | 'rising'
  /** 보스 위에 붙잡혀 있음 */
  | 'held'
  /** 구출되어 플레이어에게 내려오는 중 */
  | 'rescued'
  /** 편대의 보스가 격추되어 화면 밖으로 날아가는 중 */
  | 'leaving';

export interface Captive {
  state: CaptiveState;
  x: number;
  y: number;
  bossId: number;
}

export interface Explosion {
  x: number;
  y: number;
  age: number;
  big: boolean;
  color: string;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
}

export type SoundName =
  | 'shoot'
  | 'bossHit'
  | 'explode'
  | 'playerDie'
  | 'beam'
  | 'capture'
  | 'rescue'
  | 'stageStart'
  | 'extraLife';

export interface GalagaState {
  /** 1부터 시작 */
  stage: number;
  challenge: boolean;
  score: number;
  lives: number;
  phase: Phase;
  phaseTimer: number;
  time: number;
  /** 스테이지 시작(intro 이후) 경과 시간 */
  stageTime: number;
  /** 편대가 다 모였는지 (흔들림 → 숨쉬기 전환) */
  assembled: boolean;
  formationTime: number;
  diveTimer: number;
  player: Player;
  enemies: Enemy[];
  playerBullets: Bullet[];
  enemyBullets: Bullet[];
  captive: Captive | null;
  explosions: Explosion[];
  popups: Popup[];
  nextEnemyId: number;
  shots: number;
  hits: number;
  challengeHits: number;
  extraLivesGiven: number;
  /** 이번 프레임에 재생할 효과음 (컴포넌트가 재생 후 비운다) */
  sounds: SoundName[];
}

export interface Input {
  left: boolean;
  right: boolean;
  fire: boolean;
}

export type GalagaEvent = 'gameOver';
