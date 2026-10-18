export const VIEW_WIDTH = 800;
export const VIEW_HEIGHT = 480;

export const GRAVITY = 1500;
export const JUMP_SPEED = 560;
/** 카메라 기준 플레이어의 화면상 x 위치 */
export const CAMERA_LEAD = 250;
export const MIN_X = 30;
export const PLAYER_START_X = 80;
/** 골 지점 뒤로 보여줄 여유 공간 */
export const GOAL_AREA = 300;

/** 거리 표지판(=체크포인트) 간격. 30px = 1m */
export const MARKER_SPACING = 300;
export const PX_PER_METER = 30;

export const INITIAL_LIVES = 3;
export const START_BONUS = 5000;
export const BONUS_DRAIN = 100; // 초당
export const BONUS_TRANSFER_RATE = 4000; // 클리어 시 초당 점수로 옮겨지는 양

export const INTRO_TIME = 1.6;
export const DYING_TIME = 1.6;
export const CLEAR_TIME = 2.2;

/** 찰리 스프라이트(30x48) 기준 히트박스 */
export const CHARLIE_HALF_WIDTH = 10;
export const CHARLIE_HEIGHT = 46;

// 1. 사자 불링
export const FLOOR_Y = 400;
export const LION_SPEED = 150;
export const LION_BACK_SPEED = 75;
export const LION_HALF_LENGTH = 27;
export const LION_HEIGHT = 30;
export const RIDER_BOTTOM = 24; // 사자 발에서 찰리 발까지
export const RIDER_TOP = 66;
export const RING_SPEED = 60;
export const RING_INTERVAL: [number, number] = [2.4, 3.8];
export const RING_TOP = FLOOR_Y - 200;
export const RING_BOTTOM = FLOOR_Y - 64;
export const RING_EDGE_HALF = 5;
export const POT_HALF_WIDTH = 10;
export const POT_HEIGHT = 34;
export const RING_SCORE = 100;
export const POT_SCORE = 200;

// 2. 외줄타기
export const ROPE_Y = 320;
export const WALK_SPEED = 130;
export const WALK_BACK_SPEED = 70;
export const MONKEY_SPEED = 70;
export const BLUE_MONKEY_SPEED = 170;
export const MONKEY_INTERVAL: [number, number] = [1.4, 2.6];
export const BLUE_MONKEY_CHANCE = 0.3;
export const MONKEY_HALF_WIDTH = 9;
export const MONKEY_HEIGHT = 26;
/** 파란 원숭이가 앞의 갈색 원숭이를 뛰어넘기 시작하는 거리 */
export const BLUE_HOP_DISTANCE = 50;
export const BLUE_HOP_SPEED = 380;
export const MONKEY_SCORE = 100;
export const BLUE_MONKEY_SCORE = 200;

// 3. 공 굴리기
export const BALL_RADIUS = 22;
export const BALL_TOP = FLOOR_Y - BALL_RADIUS * 2;
export const BALL_PUSH_SPEED = 110;
export const BALL_BACK_SPEED = 60;
export const BALL_ROLL_SPEED = 60;
export const BALL_INTERVAL: [number, number] = [1.8, 3.0];
export const BALL_SCORE = 100;

// 4. 공중그네
export const TRAPEZE_COUNT = 7;
export const TRAPEZE_SPACING = 240;
export const TRAPEZE_FIRST_X = 300;
export const TRAPEZE_ANCHOR_Y = 30;
export const TRAPEZE_ROPE = 170;
export const TRAPEZE_OMEGA = 2.4;
export const TRAPEZE_GRAVITY = 1100;
export const RELEASE_BOOST_X = 80;
export const RELEASE_BOOST_Y = 380;
export const CATCH_RADIUS = 34;
/** 손(그네 봉)에서 발까지 */
export const HANG_LENGTH = 52;
export const PLATFORM_TOP = 230;
export const START_PLATFORM_END = 150;
export const PLATFORM_JUMP_VX = 230;
export const PLATFORM_JUMP_VY = 330;
export const PLATFORM_WALK_SPEED = 100;
export const TRAPEZE_SCORE = 200;
