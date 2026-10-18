export const VIEW_WIDTH = 480;
export const VIEW_HEIGHT = 640;

// 플레이어
export const PLAYER_Y = 592;
export const PLAYER_SPEED = 260;
export const SHIP_HALF_WIDTH = 11;
export const SHIP_HEIGHT = 22;
/** 듀얼 파이터일 때 중심에서 각 전투기까지의 거리 */
export const DUAL_OFFSET = 15;
export const PLAYER_BULLET_SPEED = 620;
/** 화면에 동시에 있을 수 있는 내 총알 수 (듀얼은 2배) */
export const MAX_PLAYER_SHOTS = 2;
export const FIRE_COOLDOWN = 0.16;
export const INITIAL_LIVES = 3;
export const EXTRA_LIFE_SCORES = [20000, 70000];
export const RESPAWN_TIME = 2.2;

// 적
export const ENEMY_RADIUS = 13;
export const ENEMY_BULLET_SPEED = 250;
export const ENTRY_SPEED = 300;
export const SLOT_SPEED = 260;
export const DIVE_BASE_SPEED = 200;
export const DIVE_SPEED_PER_STAGE = 8;
export const BOSS_HP = 2;

export const SCORES = {
  bee: { formation: 50, diving: 100 },
  butterfly: { formation: 80, diving: 160 },
  boss: { formation: 150, diving: 400 },
} as const;

// 편대
export const FORMATION_COLUMNS = 10;
export const FORMATION_TOP = 92;
export const FORMATION_SPACING_X = 36;
export const FORMATION_SPACING_Y = 32;
export const SWAY_AMPLITUDE = 18;
export const BREATH_AMOUNT = 0.12;

// 트랙터 빔
export const BEAM_STOP_Y = 330;
export const BEAM_TIME = 3.2;
/** 빔이 다 펼쳐지기까지 걸리는 시간 */
export const BEAM_OPEN_TIME = 0.5;
/** 플레이어 높이에서 빔의 반폭 */
export const BEAM_HALF_WIDTH = 34;
export const CAPTIVE_RISE_SPEED = 90;
export const CAPTIVE_OFFSET_Y = -28;
export const RESCUE_SPEED = 220;

// 진행
export const INTRO_TIME = 2.2;
export const STAGE_CLEAR_TIME = 1.4;
export const CHALLENGE_RESULT_TIME = 3.2;
export const GAME_OVER_DELAY = 2;
export const CHALLENGE_HIT_SCORE = 100;
export const CHALLENGE_PERFECT_BONUS = 10000;
export const ENEMY_COUNT = 40;
