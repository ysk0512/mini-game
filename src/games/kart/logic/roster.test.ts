import { describe, expect, it } from 'vitest';
import { COURSES } from './courses';
import { createKart, NO_INPUT, stepKart, type KartInput, type KartState } from './kart';
import { createRace, stepRace } from './race';
import { CHARACTERS, KARTS, kartById, STAT_MAX, type Stats } from './roster';

const dt = 1 / 60;

function drive(k: KartState, input: KartInput, seconds: number) {
  for (let t = 0; t < seconds; t += dt) {
    stepKart(k, input, { grounded: true, offroad: false, speedFactor: 1 }, dt);
    k.velocity.copy(k.desiredVelocity);
    k.position.addScaledVector(k.velocity, dt);
  }
}

const kart = (id: string) => createKart(0, CHARACTERS[0], kartById(id), true, null);

/** 정지 상태에서 목표 속도까지 걸리는 시간 */
function timeTo(id: string, speed: number) {
  const k = kart(id);
  for (let t = 0; t < 10; t += dt) {
    drive(k, { ...NO_INPUT, throttle: 1 }, dt);
    if (k.speed >= speed) return t;
  }
  return Infinity;
}

/** 드리프트를 시작해 파란 불꽃(1단계)이 될 때까지 걸리는 시간 */
function timeToBlueSpark(id: string) {
  const k = kart(id);
  drive(k, { ...NO_INPUT, throttle: 1 }, 3);
  for (let t = 0; t < 5; t += dt) {
    drive(k, { ...NO_INPUT, throttle: 1, steer: 1, drift: true }, dt);
    if (k.drift.charge >= 0.9) return t;
  }
  return Infinity;
}

describe('카트·캐릭터 목록', () => {
  it('모든 카트는 능력치 합이 같고 1~5 범위다', () => {
    const sum = (s: Stats) => Object.values(s).reduce((a, b) => a + b, 0);
    for (const k of KARTS) {
      expect(sum(k.stats), k.name).toBe(15);
      for (const v of Object.values(k.stats)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(STAT_MAX);
      }
    }
    expect(new Set(KARTS.map((k) => k.id)).size).toBe(KARTS.length);
  });

  it('캐릭터는 6명 (플레이어 1 + CPU 5)', () => {
    expect(CHARACTERS).toHaveLength(6);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(6);
  });
});

describe('능력치가 주행에 반영된다', () => {
  it('속도: 스피드스터 > 스탠다드 > 버기, 차이는 크지 않다', () => {
    const top = (id: string) => {
      const k = kart(id);
      drive(k, { ...NO_INPUT, throttle: 1 }, 6);
      return k.speed;
    };
    const [fast, normal, slow] = [top('speedster'), top('standard'), top('buggy')];
    expect(fast).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(slow);
    expect(fast / slow).toBeLessThan(1.12);
  });

  it('가속: 버기가 가장 빠르고 불도저가 가장 느리다', () => {
    const times = KARTS.map((k) => timeTo(k.id, 20));
    expect(Math.min(...times)).toBe(timeTo('buggy', 20));
    expect(Math.max(...times)).toBe(timeTo('tank', 20));
  });

  it('핸들링: 같은 시간 꺾으면 버기가 스피드스터보다 많이 돈다', () => {
    const turned = (id: string) => {
      const k = kart(id);
      drive(k, { ...NO_INPUT, throttle: 1 }, 3);
      const before = k.heading;
      drive(k, { ...NO_INPUT, throttle: 1, steer: 1 }, 0.5);
      return before - k.heading;
    };
    expect(turned('buggy')).toBeGreaterThan(turned('speedster'));
  });

  it('드리프트: 드리프터가 미니 터보를 가장 빨리 모은다', () => {
    const times = KARTS.map((k) => timeToBlueSpark(k.id));
    expect(Math.min(...times)).toBe(timeToBlueSpark('drifter'));
  });

  it('무게: 무거운 카트와 부딪히면 가벼운 카트가 더 크게 밀린다', () => {
    const race = createRace(COURSES[0], { characterId: 'red', kartId: 'standard' }, () => 0.5);
    race.phase = 'racing';
    const [light, heavy] = race.karts;
    light.kart = kartById('drifter');
    light.tuning = createKart(0, CHARACTERS[0], kartById('drifter'), false, null).tuning;
    heavy.kart = kartById('tank');
    heavy.tuning = createKart(0, CHARACTERS[0], kartById('tank'), false, null).tuning;
    // 정지한 두 카트를 살짝 겹쳐 놓고 서로 마주 보며 다가가게 한다
    heavy.position.copy(light.position).setX(light.position.x + 1.2);
    for (const k of [light, heavy]) {
      k.velocity.set(0, 0, 0);
      k.speed = 0;
      k.trackIndex = light.trackIndex;
    }
    stepRace(race, dt, NO_INPUT, () => 0.5);
    // 질량비(1.3 : 0.7)만큼 가벼운 쪽이 더 밀린다
    expect(Math.abs(light.desiredVelocity.x)).toBeGreaterThan(Math.abs(heavy.desiredVelocity.x) * 1.5);
  });
});

describe('레이스 구성', () => {
  it('고른 캐릭터·카트로 출전하고, CPU는 나머지 캐릭터 5명', () => {
    const race = createRace(COURSES[1], { characterId: 'fox', kartId: 'buggy' }, () => 0.3);
    expect(race.player.character.id).toBe('fox');
    expect(race.player.kart.id).toBe('buggy');
    const rivals = race.karts.filter((k) => !k.isPlayer);
    expect(rivals).toHaveLength(5);
    expect(new Set(rivals.map((k) => k.character.id)).size).toBe(5);
    expect(rivals.map((k) => k.character.id)).not.toContain('fox');
    // CPU 다섯이 카트 다섯 종류를 하나씩
    expect(new Set(rivals.map((k) => k.kart.id)).size).toBe(KARTS.length);
  });
});
