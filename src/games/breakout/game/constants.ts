export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const PADDLE_WIDTH = 100;
export const PADDLE_HEIGHT = 14;
export const PADDLE_Y = CANVAS_HEIGHT - 40;
export const PADDLE_SPEED = 650; // px/s

export const BALL_RADIUS = 7;
export const BASE_BALL_SPEED = 360; // px/s
export const BALL_SPEED_PER_LEVEL = 40;
/** 패들 끝에 맞았을 때의 최대 반사각 (수직 기준) */
export const MAX_BOUNCE_ANGLE = Math.PI / 3;
/** 발사 시 수직 기준 최대 각도 */
export const LAUNCH_ANGLE = Math.PI / 12;
export const MAX_BALLS = 12;

export const BRICK_HEIGHT = 22;
export const BRICK_GAP = 4;
export const BRICK_TOP = 60;
export const BRICK_SIDE = 20;
export const POINTS_PER_HP = 10;

export const INITIAL_LIVES = 3;

export const POWERUP_CHANCE = 0.15;
export const POWERUP_DURATION = 10; // s
export const POWERUP_WIDTH = 36;
export const POWERUP_HEIGHT = 16;
export const POWERUP_FALL_SPEED = 150; // px/s
export const EXPAND_FACTOR = 1.5;
export const SLOW_FACTOR = 0.7;
export const MULTIBALL_SPREAD = Math.PI / 7;
