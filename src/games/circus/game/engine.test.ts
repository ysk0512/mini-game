import { describe, expect, it } from 'vitest';
import {
  BALL_ROLL_SPEED,
  BALL_TOP,
  FLOOR_Y,
  INITIAL_LIVES,
  RING_SPEED,
  ROPE_Y,
  START_BONUS,
  TRAPEZE_OMEGA,
} from './constants';
import { createCircus, startStage, STAGES, update } from './engine';
import type { BallLevel, CircusState, Input, LionLevel, RopeLevel, TrapezeLevel } from './types';

const dt = 1 / 60;
const idle: Input = { left: false, right: false, jump: false };
const right: Input = { left: false, right: true, jump: false };
const noSpawn = () => 0.99;

function playing(stage: number): CircusState {
  const s = createCircus(noSpawn);
  startStage(s, stage, noSpawn);
  s.phase = 'playing';
  return s;
}

/** 입력 함수를 받아 n프레임 진행 */
function run(s: CircusState, frames: number, input: (frame: number) => Input = () => idle) {
  for (let f = 0; f < frames; f++) update(s, dt, input(f), noSpawn);
}

describe('사자 불링', () => {
  function withRing(s: CircusState, distance: number) {
    const level = s.level as LionLevel;
    level.pots = [];
    level.spawnTimer = Infinity;
    level.rings = [{ x: s.player.x + distance, scored: false }];
    return level;
  }

  it('가만히 서 있으면 불링에 부딪힌다', () => {
    const s = playing(0);
    withRing(s, 100);
    run(s, 120);
    expect(s.phase).toBe('dying');
  });

  it('달리며 알맞게 점프하면 불링을 통과하고 점수를 얻는다', () => {
    const s = playing(0);
    withRing(s, 200);
    // 링과의 거리가 좁혀지는 속도(달리기 150 + 링 60)로 점프 시점 계산
    const jumpFrame = Math.round(((200 - 90) / (150 + RING_SPEED)) * 60);
    run(s, 120, (f) => ({ ...right, jump: f === jumpFrame }));
    expect(s.phase).toBe('playing');
    expect(s.score).toBe(100);
  });

  it('불항아리에 닿으면 죽는다', () => {
    const s = playing(0);
    const level = withRing(s, 10000);
    level.rings = [];
    level.pots = [{ x: s.player.x + 80, scored: false }];
    run(s, 60, () => right);
    expect(s.phase).toBe('dying');
  });

  it('골에 도착하면 보너스가 점수로 옮겨지고 다음 스테이지로 간다', () => {
    const s = playing(0);
    withRing(s, 10000).rings = [];
    s.player.x = STAGES[0].length - 1;
    run(s, 2, () => right);
    expect(s.phase).toBe('clear');
    const total = s.score + s.bonus;
    expect(total).toBeGreaterThan(4900);
    run(s, 60 * 3);
    expect(s.stage).toBe(1);
    expect(s.score).toBe(total);
    expect(s.bonus).toBe(START_BONUS);
  });
});

describe('외줄타기', () => {
  it('원숭이를 뛰어넘으면 점수를 얻고, 부딪히면 죽는다', () => {
    const s = playing(1);
    const level = s.level as RopeLevel;
    level.spawnTimer = Infinity;
    // 걸어가며(130) 다가오는 원숭이(70)와 70px 남았을 때 점프
    level.monkeys = [{ x: s.player.x + 200, y: ROPE_Y, vy: 0, blue: false, scored: false }];
    run(s, 40, (f) => ({ ...right, jump: f === 39 }));
    run(s, 60);
    expect(s.phase).toBe('playing');
    expect(s.score).toBe(100);

    level.monkeys = [{ x: s.player.x + 60, y: ROPE_Y, vy: 0, blue: false, scored: false }];
    run(s, 90);
    expect(s.phase).toBe('dying');
  });

  it('파란 원숭이는 앞의 갈색 원숭이를 뛰어넘는다', () => {
    const s = playing(1);
    const level = s.level as RopeLevel;
    level.spawnTimer = Infinity;
    s.player.x = 30;
    level.monkeys = [
      { x: 700, y: ROPE_Y, vy: 0, blue: false, scored: false },
      { x: 790, y: ROPE_Y, vy: 0, blue: true, scored: false },
    ];
    let maxHop = 0;
    for (let f = 0; f < 90; f++) {
      run(s, 1);
      maxHop = Math.max(maxHop, ROPE_Y - level.monkeys[1].y);
    }
    expect(maxHop).toBeGreaterThan(30);
    expect(level.monkeys[1].x).toBeLessThan(level.monkeys[0].x);
  });
});

describe('공 굴리기', () => {
  it('제자리 점프로 굴러오는 공 위에 올라탈 수 있다', () => {
    const s = playing(2);
    const level = s.level as BallLevel;
    level.spawnTimer = Infinity;
    level.balls.push({ id: 99, x: s.player.x + 110, vx: -BALL_ROLL_SPEED, scored: false });
    // 거리가 50px쯤 남았을 때 점프하면 착지 순간 공이 발밑에 온다
    run(s, 61, (f) => ({ ...idle, jump: f === 60 }));
    run(s, 60);
    expect(s.phase).toBe('playing');
    expect(level.ridingId).toBe(99);
    expect(s.score).toBe(100);
  });

  it('공끼리 부딪히면 죽는다', () => {
    const s = playing(2);
    const level = s.level as BallLevel;
    level.spawnTimer = Infinity;
    level.balls.push({ id: 99, x: s.player.x + 70, vx: -BALL_ROLL_SPEED, scored: false });
    run(s, 90);
    expect(s.phase).toBe('dying');
  });

  it('공을 놓치고 바닥에 떨어지면 죽는다', () => {
    const s = playing(2);
    (s.level as BallLevel).spawnTimer = Infinity;
    run(s, 1, () => ({ ...right, jump: true }));
    run(s, 60);
    expect(s.phase).toBe('dying');
    expect(s.player.y).toBe(FLOOR_Y);
    expect(BALL_TOP).toBeLessThan(FLOOR_Y);
  });
});

describe('공중그네', () => {
  const period = (2 * Math.PI) / TRAPEZE_OMEGA;

  /** from 그네(-1이면 시작 발판)에서 delay초 기다렸다 뛰었을 때 다음 목표에 닿는지 */
  function attempt(from: number, delay: number) {
    const s = playing(3);
    const level = s.level as TrapezeLevel;
    level.checkpoint = from;
    level.holding = from >= 0 ? from : null;
    level.standing = from < 0;
    s.player.x = 110;
    run(s, Math.round(delay / dt));
    run(s, 1, () => ({ ...idle, jump: true }));
    for (let f = 0; f < 180 && s.phase === 'playing' && level.holding === null; f++) run(s, 1);
    if (from === level.trapezes.length - 1) return s.phase === 'clear';
    return level.holding === from + 1;
  }

  it('시작 발판부터 골까지 모든 구간에 성공할 수 있는 타이밍이 있다', () => {
    const count = (playing(3).level as TrapezeLevel).trapezes.length;
    for (let from = -1; from < count; from++) {
      let ok = false;
      for (let delay = 0; delay < period && !ok; delay += 0.02) ok = attempt(from, delay);
      expect(ok, `구간 ${from} → ${from + 1}`).toBe(true);
    }
  });

  it('아무 때나 놓으면 떨어질 수도 있다', () => {
    let failures = 0;
    for (let delay = 0; delay < period; delay += 0.05) if (!attempt(0, delay)) failures++;
    expect(failures).toBeGreaterThan(0);
  });
});

describe('진행', () => {
  it('죽으면 생명이 줄고 체크포인트에서 다시 시작한다', () => {
    const s = playing(0);
    s.checkpointX = 900;
    s.phase = 'dying';
    s.phaseTimer = 0.01;
    run(s, 1);
    expect(s.lives).toBe(INITIAL_LIVES - 1);
    expect(s.phase).toBe('intro');
    expect(s.player.x).toBe(900);
  });

  it('지나간 거리 표지판이 체크포인트가 된다', () => {
    const s = playing(1);
    (s.level as RopeLevel).spawnTimer = Infinity;
    s.player.x = 650;
    run(s, 1);
    expect(s.checkpointX).toBe(600);
  });

  it('생명이 다 떨어지면 gameOver, 마지막 스테이지를 깨면 victory', () => {
    const s = playing(0);
    s.lives = 1;
    s.phase = 'dying';
    s.phaseTimer = 0.01;
    expect(update(s, dt, idle, noSpawn)).toEqual(['gameOver']);

    const v = playing(STAGES.length - 1);
    v.phase = 'clear';
    v.phaseTimer = 0.01;
    v.bonus = 0;
    expect(update(v, dt, idle, noSpawn)).toEqual(['victory']);
  });
});
