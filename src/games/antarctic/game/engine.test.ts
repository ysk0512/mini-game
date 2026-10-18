import { describe, expect, it } from 'vitest';
import { COURSES, createGame, makeCourse, nextCourse, update, type Game, type Input, type Kind } from './engine';

const idle: Input = { left: false, right: false, jump: false };
function playing() {
  const g = createGame();
  g.status = 'playing';
  g.entities = [];
  return g;
}
function run(g: Game, seconds: number, input = idle) {
  for (let i = 0; i < Math.round(seconds * 60); i++) update(g, 1 / 60, input);
}
function obstacle(g: Game, kind: Kind, z = 30, x = 0) {
  g.entities.push({ id: g.entities.length, kind, z, x, width: 0.25, done: false });
}

describe('남극탐험 이동과 충돌', () => {
  it('시작 전과 일시정지 중에는 시간과 거리가 멈춘다', () => {
    const g = createGame();
    const original = structuredClone(g);
    run(g, 1);
    expect(g).toEqual(original);
    g.status = 'paused';
    run(g, 1);
    expect(g.distance).toBe(0);
    expect(g.time).toBe(original.time);
  });
  it('자동 전진하고 좌우 이동은 얼음길 안으로 제한된다', () => {
    const g = playing();
    run(g, 1, { ...idle, right: true });
    expect(g.distance).toBeCloseTo(110);
    expect(g.x).toBe(0.94);
    run(g, 2, { ...idle, left: true });
    expect(g.x).toBe(-0.94);
  });
  it.each(['hole', 'seal', 'crack'] as Kind[])('%s 충돌 시 생명은 한 번만 감소한다', kind => {
    const g = playing();
    obstacle(g, kind);
    obstacle(g, kind, 35);
    run(g, 1);
    expect(g.lives).toBe(2);
    expect(g.invincible).toBeGreaterThan(0);
  });
  it.each(['hole', 'seal', 'crack'] as Kind[])('점프로 %s를 넘고 다시 착지한다', kind => {
    const g = playing();
    obstacle(g, kind, 50);
    update(g, 1 / 60, { ...idle, jump: true });
    run(g, 1);
    expect(g.lives).toBe(3);
    expect(g.height).toBe(0);
  });
  it('공중에서 다시 점프해도 높이가 초기화되지 않는다', () => {
    const g = playing();
    update(g, 1 / 60, { ...idle, jump: true });
    run(g, 0.3);
    const velocity = g.vy;
    update(g, 1 / 60, { ...idle, jump: true });
    expect(g.vy).toBeLessThan(velocity);
  });
  it('옆으로 피한 장애물에는 충돌하지 않는다', () => {
    const g = playing();
    obstacle(g, 'hole', 100);
    run(g, 1.2, { ...idle, right: true });
    expect(g.lives).toBe(3);
  });
  it('물고기와 깃발은 한 번만 수집하며 깃발은 시간을 늘린다', () => {
    const g = playing();
    obstacle(g, 'fish', 30);
    obstacle(g, 'flag', 50);
    run(g, 1);
    expect(g.score).toBe(350);
    expect(g.fish).toBe(1);
    expect(g.time).toBeCloseTo(COURSES[0].time + 1);
  });
});

describe('남극탐험 코스와 결과', () => {
  it('시간 초과와 마지막 생명 소진은 게임 종료로 이어진다', () => {
    const timed = playing();
    timed.time = 0.01;
    expect(update(timed, 1 / 60, idle)).toEqual(['gameOver']);
    expect(timed.status).toBe('gameOver');
    const hit = playing();
    hit.lives = 1;
    obstacle(hit, 'seal', 1);
    expect(update(hit, 1 / 60, idle)).toContain('gameOver');
    expect(hit.lives).toBe(0);
    expect(hit.status).toBe('gameOver');
  });
  it('기지 보너스는 한 번만 지급하고 다음 코스에서 점수와 생명을 유지한다', () => {
    const g = playing();
    g.distance = COURSES[0].length - 1;
    g.score = 100;
    g.lives = 2;
    update(g, 1 / 60, idle);
    expect(g.status).toBe('clear');
    expect(g.score).toBe(100 + g.bonus);
    const score = g.score;
    run(g, 2);
    expect(g.score).toBe(score);
    nextCourse(g);
    expect(g.stage).toBe(1);
    expect(g.status).toBe('playing');
    expect(g.distance).toBe(0);
    expect(g.time).toBe(COURSES[1].time);
    expect(g.score).toBe(score);
    expect(g.lives).toBe(2);
  });
  it('마지막 기지는 승리 처리되고 다음 코스 범위를 넘지 않는다', () => {
    const g = playing();
    g.stage = 3;
    g.distance = COURSES[3].length - 1;
    update(g, 1 / 60, idle);
    expect(g.status).toBe('victory');
    nextCourse(g);
    expect(g.stage).toBe(3);
  });
  it('모든 코스에 회피 경로와 제한 시간 내 완주 여유가 있다', () => {
    for (let stage = 0; stage < COURSES.length; stage++) {
      const course = COURSES[stage];
      expect(course.length / course.speed).toBeLessThan(course.time - 8);
      const hazards = makeCourse(stage).filter(e => ['hole', 'seal', 'crack'].includes(e.kind));
      for (const z of new Set(hazards.map(e => e.z))) {
        const row = hazards.filter(e => e.z === z);
        expect([-0.66, 0, 0.66].some(x => row.every(e => Math.abs(x - e.x) > e.width + 0.09))).toBe(true);
      }
    }
  });
  it('모든 코스를 실제 프레임 이동과 점프로 완주할 수 있다', () => {
    const g = createGame();
    g.status = 'playing';
    for (let stage = 0; stage < COURSES.length; stage++) {
      let frames = 0;
      while (g.status === 'playing' && frames++ < 60 * 60) {
        const ahead = g.entities.find(e => !e.done && !['fish', 'flag'].includes(e.kind)
          && e.z > g.distance && e.z - g.distance < 49 && Math.abs(e.x - g.x) < e.width + 0.09);
        update(g, 1 / 60, { ...idle, jump: !!ahead && g.height === 0 });
      }
      expect(g.lives, `코스 ${stage + 1}`).toBe(3);
      expect(g.status).toBe(stage === 3 ? 'victory' : 'clear');
      if (stage < 3) nextCourse(g);
    }
  });
});
