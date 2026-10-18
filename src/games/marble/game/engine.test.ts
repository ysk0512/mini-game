import { describe, expect, it } from 'vitest';
import { COURSES, platformPosition, type Vec3 } from './courses';
import { createMarble, drive, inspectPosition, movement, tick, togglePause, type MarbleInput } from './engine';

const idle: MarbleInput = { x: 0, y: 0, brake: false, jump: false };
const above = (at: Vec3): Vec3 => [at[0], at[1] + 0.36, at[2]];
function playing(stage = 0) { const g = createMarble(stage); g.phase = 'playing'; return g; }

describe('구슬 조작', () => {
  it('화면 기준 이동에서 대각선의 속도가 더 빨라지지 않는다', () => {
    const diagonal = movement({ ...idle, x: 1, y: -1 });
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
    expect(movement({ ...idle, y: -1 })).toEqual({ x: -0.6, z: -0.8 });
  });
  it('관성은 유지하지만 최고 속도가 제한되고 브레이크가 빠르게 멈춘다', () => {
    let velocity = { x: 0, y: 2, z: 0 };
    for (let i = 0; i < 300; i++) velocity = drive(velocity, { ...idle, x: 1 }, 1 / 60);
    expect(Math.hypot(velocity.x, velocity.z)).toBeLessThanOrEqual(5.100001);
    const coasting = drive(velocity, idle, 0.1);
    const braking = drive(velocity, { ...idle, brake: true }, 0.1);
    expect(Math.hypot(braking.x, braking.z)).toBeLessThan(Math.hypot(coasting.x, coasting.z) * 0.6);
    expect(braking.y).toBe(2);
  });
});

describe('구슬 미로 진행', () => {
  it('보석은 한 번만 수집하며 아래로 떨어지는 중에는 수집되지 않는다', () => {
    const g = playing();
    const gem = COURSES[0].gems[0];
    expect(inspectPosition(g, [gem[0], -2, gem[2]])).toEqual([]);
    expect(inspectPosition(g, above(gem))).toContain('gem');
    expect(inspectPosition(g, above(gem))).not.toContain('gem');
    expect(g.score).toBe(100);
  });
  it('모든 보석을 수집해야 골인할 수 있고 보너스는 중복 지급되지 않는다', () => {
    const g = playing();
    const c = COURSES[0];
    expect(inspectPosition(g, above(c.goal))).toContain('locked');
    expect(g.phase).toBe('playing');
    c.gems.forEach(at => inspectPosition(g, above(at)));
    expect(inspectPosition(g, above(c.goal))).toContain('clear');
    expect(g.phase).toBe('clear');
    const score = g.score;
    inspectPosition(g, above(c.goal));
    expect(g.score).toBe(score);
    expect(g.stars).toBe(3);
  });
  it('체크포인트가 뒤로 되돌아가지 않고 수집한 보석을 유지한 채 부활한다', () => {
    const g = playing();
    const c = COURSES[0];
    inspectPosition(g, above(c.gems[0]));
    inspectPosition(g, above(c.checkpoints[1]));
    inspectPosition(g, above(c.checkpoints[0]));
    expect(g.checkpoint).toBe(1);
    expect(inspectPosition(g, [7, -5, 6])).toEqual(['fall']);
    inspectPosition(g, [7, -6, 6]);
    expect(g.falls).toBe(1);
    tick(g, 1);
    expect(g.phase).toBe('playing');
    expect(g.respawn?.[0]).toBe(c.checkpoints[1][0]);
    expect(g.respawn?.[2]).toBe(c.checkpoints[1][2]);
    expect(g.collected.size).toBe(1);
  });
  it('시작 전과 일시정지는 시간과 부활 타이머를 멈춘다', () => {
    const g = createMarble();
    tick(g, 10);
    expect(g.time).toBe(0);
    g.phase = 'playing';
    inspectPosition(g, [0, -5, 0]);
    togglePause(g);
    tick(g, 10);
    expect(g.phase).toBe('paused');
    expect(g.time).toBe(0);
    expect(g.fallTimer).toBe(0.7);
    togglePause(g);
    expect(g.phase).toBe('falling');
    tick(g, 0.8);
    expect(g.phase).toBe('playing');
  });
  it('점프대가 공중에서 연속 발동하지 않는다', () => {
    const g = playing(2);
    const at = above(COURSES[2].springs[0]);
    expect(inspectPosition(g, at)).toContain('spring');
    expect(inspectPosition(g, at)).not.toContain('spring');
    tick(g, 2);
    expect(inspectPosition(g, [at[0], 1.5, at[2]])).not.toContain('spring');
  });
  it('마지막 코스는 승리로 끝나고 낙하 횟수가 별과 점수에 반영된다', () => {
    const g = playing(2);
    g.time = 100;
    g.falls = 4;
    COURSES[2].gems.forEach(at => inspectPosition(g, above(at)));
    inspectPosition(g, above(COURSES[2].goal));
    expect(g.phase).toBe('victory');
    expect(g.stars).toBe(1);
    expect(g.bonus).toBe(600);
  });
  it('다음 코스와 새 게임의 점수 및 수집 상태가 분리된다', () => {
    const g = createMarble(1, 1500);
    expect(g.score).toBe(1500);
    expect(g.collected.size).toBe(0);
    expect(g.checkpoint).toBe(-1);
    expect(createMarble().score).toBe(0);
  });
  it('이동 발판은 양쪽 선착장까지 왕복한다', () => {
    const platform = COURSES[2].platforms.find(p => p.motion)!;
    expect(platformPosition(platform, 0)[2]).toBe(2);
    expect(platformPosition(platform, 3)[2]).toBe(-2);
    expect(platformPosition(platform, 6)[2]).toBe(2);
  });
});
