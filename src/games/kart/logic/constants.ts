/** 물리 세계의 중력. 아케이드 느낌을 위해 실제보다 3배 강하게 */
export const GRAVITY = -9.81 * 3;

export const LAPS = 3;
export const KART_RADIUS = 0.7;
/** 카트끼리 이 거리 안이면 부딪힌 것으로 보고 옆으로 밀어낸다 */
export const BUMP_DISTANCE = 1.6;
export const BUMP_RESTITUTION = 0.4;
/** 땅 위에서 경사로 설명되는 것보다 더 위로 솟을 수 있는 속도 (m/s) */
export const RISE_ALLOWANCE = 1.5;

// 카트 주행 (단위: m, m/s, rad/s)
export const MAX_SPEED = 26;
export const BOOST_MAX_SPEED = 36;
export const ACCEL = 18;
export const BOOST_ACCEL = 60;
export const BRAKE = 35;
export const COAST_DECEL = 6;
export const OVERSPEED_DECEL = 10;
export const REVERSE_MAX_SPEED = 8;
export const TURN_RATE = 2.0;
/** 이 속도에 도달해야 핸들이 최대로 듣는다 */
export const FULL_TURN_SPEED = 8;
/** 진행 방향으로 속도가 따라붙는 정도 (클수록 덜 미끄러짐) */
export const GRIP = 10;
export const DRIFT_GRIP = 2.5;
export const AIR_GRIP = 0.4;
export const AIR_TURN_FACTOR = 0.3;
export const OFFROAD_SPEED_FACTOR = 0.55;

// 드리프트 → 미니 터보
export const DRIFT_MIN_SPEED = 10;
/** 차지량이 이 값을 넘으면 파란 불꽃(1단계), 다음 값을 넘으면 주황 불꽃(2단계) */
export const DRIFT_CHARGE_LEVELS = [0.9, 2.0];
export const MINI_TURBO_TIME = [0, 0.8, 1.5];

// 부스트
export const BOOST_PAD_TIME = 1.0;
export const BOOST_PAD_HALF_LENGTH = 3;
export const BOOST_PAD_HALF_WIDTH = 3;
export const MUSHROOM_TIME = 1.6;
export const START_BOOST_TIME = 1.0;
/** GO 직전 이 시간 안에 액셀을 밟기 시작하면 스타트 대시 */
export const START_BOOST_WINDOW = [0.1, 1.0];

// 아이템
export const ITEM_BOX_RADIUS = 1.8;
export const ITEM_BOX_RESPAWN = 4;
export const ITEM_ROULETTE_TIME = 1.0;
export const SPIN_OUT_TIME = 1.1;
export const BANANA_RADIUS = 1.2;
export const SHELL_SPEED = 42;
export const SHELL_RADIUS = 1.4;
export const SHELL_LIFE = 5;
export const SHELL_MAX_BOUNCES = 3;
export const MAX_BANANAS = 12;

// 진행
export const COUNTDOWN_TIME = 3.5;
/** 트랙 중앙선에서 이만큼 떨어지면(벽 바깥) 코스로 되돌린다 */
export const RESPAWN_FALL_DEPTH = 8;
export const WRONG_WAY_TIME = 1;
