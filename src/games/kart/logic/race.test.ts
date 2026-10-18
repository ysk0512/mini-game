import { describe, expect, it } from 'vitest';
import { aiInput } from './ai';
import { KART_RADIUS, LAPS, MAX_SPEED, OFFROAD_SPEED_FACTOR } from './constants';
import { COURSES } from './courses';
import { createKart, forwardOf, NO_INPUT, spinOut, stepKart, type KartInput, type KartState } from './kart';
import { createRace, DEFAULT_SELECTION, isWrongWay, stepRace, useItem, type RaceState } from './race';
import { CHARACTERS, KARTS } from './roster';
import { buildTrack, isOffroad, locate, pointOnTrack } from './track';

const dt = 1 / 60;
const fixed = () => 0.5;

/** 물리 엔진 대신: 목표 속도대로 움직이고, 트랙 높이에 붙고, 벽 밖으로 못 나간다 */
function physics(race: RaceState) {
  const { track } = race;
  for (const k of race.karts) {
    if (k.respawnAt) {
      k.position.copy(k.respawnAt);
      k.velocity.set(0, 0, 0);
      k.respawnAt = null;
      continue;
    }
    k.velocity.copy(k.desiredVelocity).setY(0);
    k.position.addScaledVector(k.velocity, dt);
    const loc = locate(track, k.position, k.trackIndex);
    const limit = track.wallOffset - KART_RADIUS;
    if (Math.abs(loc.lateral) > limit) {
      const side = track.samples[loc.index].side.clone().multiplyScalar(Math.sign(loc.lateral));
      k.position.addScaledVector(side, -(Math.abs(loc.lateral) - limit));
      k.velocity.addScaledVector(side, -Math.max(0, k.velocity.dot(side)));
    }
    k.position.y = loc.height + KART_RADIUS;
  }
}

function run(race: RaceState, seconds: number, input: (r: RaceState) => KartInput = () => NO_INPUT) {
  for (let t = 0; t < seconds; t += dt) {
    stepRace(race, dt, input(race), fixed);
    physics(race);
  }
}

const autopilot = (r: RaceState): KartInput => ({ ...aiInput(r.player, r), useItem: false });

function racing(courseIndex = 0) {
  const race = createRace(COURSES[courseIndex], DEFAULT_SELECTION, fixed);
  race.phase = 'racing';
  race.countdown = 0;
  return race;
}

describe('트랙', () => {
  it.each(COURSES.map((c) => [c.name, c] as const))('%s: 샘플·위치 찾기', (_, course) => {
    const track = buildTrack(course);
    expect(track.length).toBeGreaterThan(400);
    expect(track.spacing).toBeCloseTo(2, 0);
    const i = 37;
    const center = locate(track, track.samples[i].pos);
    expect(center.index).toBe(i);
    expect(Math.abs(center.lateral)).toBeLessThan(0.01);
    expect(center.along).toBeCloseTo(track.samples[i].dist, 1);

    const offset = locate(track, pointOnTrack(track, i, 3), i);
    expect(offset.lateral).toBeCloseTo(3, 1);
    expect(isOffroad(track, offset)).toBe(false);
    expect(isOffroad(track, locate(track, pointOnTrack(track, i, course.width / 2 + 1), i))).toBe(true);
    expect(track.boostPads).toHaveLength(course.boostPads.length);
    expect(track.itemRows).toHaveLength(course.itemRows.length);
  });

  it.each(COURSES.map((c) => [c.name, c] as const))('%s: 급커브에서도 바닥·벽이 접히지 않는다', (_, course) => {
    // 커브 반경이 (벽 + 벽 두께)보다 작으면 안쪽 가장자리가 뒤로 접혀 충돌체가 꼬인다
    const track = buildTrack(course);
    const edge = track.wallOffset + 1.2;
    const { samples } = track;
    samples.forEach((a, i) => {
      const b = samples[(i + 1) % samples.length];
      for (const offset of [edge, -edge]) {
        const pa = a.pos.clone().addScaledVector(a.side, offset);
        const pb = b.pos.clone().addScaledVector(b.side, offset);
        expect((pb.x - pa.x) * a.tangent.x + (pb.z - pa.z) * a.tangent.z, `${i}번째 구간`).toBeGreaterThan(0);
      }
    });
  });
});

describe('카트 조작', () => {
  function drive(k: KartState, input: KartInput, seconds: number, offroad = false) {
    const sounds: string[] = [];
    for (let t = 0; t < seconds; t += dt) {
      sounds.push(...stepKart(k, input, { grounded: true, offroad, speedFactor: 1 }, dt));
      k.velocity.copy(k.desiredVelocity);
      k.position.addScaledVector(k.velocity, dt);
    }
    return sounds;
  }
  const kart = () => createKart(0, CHARACTERS[0], KARTS[0], true, null);

  it('액셀을 밟으면 최고 속도까지, 오프로드에서는 더 느리게', () => {
    const k = kart();
    drive(k, { ...NO_INPUT, throttle: 1 }, 3);
    expect(k.speed).toBeCloseTo(MAX_SPEED, 0);

    const slow = kart();
    drive(slow, { ...NO_INPUT, throttle: 1 }, 3, true);
    expect(slow.speed).toBeCloseTo(MAX_SPEED * OFFROAD_SPEED_FACTOR, 0);
  });

  it('오른쪽으로 꺾으면 heading이 줄고 오른쪽(-x)으로 간다', () => {
    const k = kart();
    drive(k, { ...NO_INPUT, throttle: 1 }, 1);
    drive(k, { ...NO_INPUT, throttle: 1, steer: 1 }, 0.5);
    expect(k.heading).toBeLessThan(0);
    expect(k.velocity.x).toBeLessThan(0);
  });

  it('드리프트를 오래 유지했다 놓으면 미니 터보로 최고 속도를 넘는다', () => {
    const k = kart();
    drive(k, { ...NO_INPUT, throttle: 1 }, 2);
    const sounds = drive(k, { ...NO_INPUT, throttle: 1, steer: 1, drift: true }, 2.5);
    expect(sounds).toContain('driftStart');
    expect(k.drift.active).toBe(true);
    const release = drive(k, { ...NO_INPUT, throttle: 1 }, 0.4);
    expect(release).toContain('miniTurbo');
    expect(k.speed).toBeGreaterThan(MAX_SPEED + 3);
  });

  it('짧은 드리프트는 부스트가 없다', () => {
    const k = kart();
    drive(k, { ...NO_INPUT, throttle: 1 }, 2);
    drive(k, { ...NO_INPUT, throttle: 1, steer: -1, drift: true }, 0.3);
    expect(drive(k, { ...NO_INPUT, throttle: 1 }, 0.1)).not.toContain('miniTurbo');
    expect(k.boostTimer).toBe(0);
  });

  it('스핀아웃 중에는 조작이 안 되고 속도가 줄어든다', () => {
    const k = kart();
    drive(k, { ...NO_INPUT, throttle: 1 }, 3);
    spinOut(k);
    const heading = k.heading;
    drive(k, { ...NO_INPUT, throttle: 1, steer: 1 }, 0.8);
    expect(k.heading).toBe(heading);
    expect(k.speed).toBeLessThan(MAX_SPEED * 0.2);
  });
});

describe('레이스', () => {
  it('카운트다운 동안은 움직이지 않고, 끝나면 GO', () => {
    const race = createRace(COURSES[0], DEFAULT_SELECTION, fixed);
    const start = race.player.position.clone();
    const events: string[] = [];
    for (let t = 0; t < 3.3; t += dt) {
      stepRace(race, dt, NO_INPUT, fixed);
      physics(race);
      events.push(...race.events);
    }
    expect(race.player.position.distanceTo(start)).toBeLessThan(0.01);
    expect(events.filter((e) => e === 'countdown')).toHaveLength(3);
    run(race, 0.5);
    expect(race.phase).toBe('racing');
  });

  it('GO 직전에 액셀을 밟으면 스타트 대시, 너무 일찍 밟으면 없음', () => {
    const good = createRace(COURSES[0], DEFAULT_SELECTION, fixed);
    run(good, 3.0);
    run(good, 0.6, () => ({ ...NO_INPUT, throttle: 1 }));
    expect(good.player.boostTimer).toBeGreaterThan(0);

    const early = createRace(COURSES[0], DEFAULT_SELECTION, fixed);
    run(early, 4, () => ({ ...NO_INPUT, throttle: 1 }));
    expect(early.player.boostTimer).toBe(0);
  });

  it.each(COURSES.map((c, i) => [c.name, i] as const))('%s: 모든 카트가 3바퀴를 완주하고 결과가 나온다', (_, i) => {
    const race = racing(i);
    run(race, 240, autopilot);
    expect(race.phase).toBe('finished');
    expect(race.player.lapTimes).toHaveLength(LAPS);
    expect(race.results).toHaveLength(6);
    const times = race.results!.map((r) => r.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // 한 바퀴가 너무 짧거나 길지 않다 (속도감 있는 20~60초)
    for (const lap of race.player.lapTimes) {
      expect(lap).toBeGreaterThan(15);
      expect(lap).toBeLessThan(60);
    }
  });

  it('출발선을 처음 지날 때는 랩으로 치지 않는다', () => {
    const race = racing();
    run(race, 5, autopilot);
    expect(race.player.distance).toBeGreaterThan(0);
    expect(race.player.lap).toBe(0);
  });

  it('아이템 박스를 먹으면 룰렛 후 아이템을 쓸 수 있다', () => {
    const race = racing();
    const box = race.itemBoxes[0];
    race.player.position.set(box.position.x, race.player.position.y, box.position.z);
    race.player.trackIndex = race.track.itemRows[0];
    run(race, dt);
    expect(race.player.item).not.toBeNull();
    expect(race.events).toContain('itemGet');
    expect(box.respawn).toBeGreaterThan(0);
  });

  it('바나나를 밟으면 스핀', () => {
    const race = racing();
    const k = race.karts[0];
    race.bananas.push({ position: k.position.clone() });
    run(race, dt);
    expect(k.spinTimer).toBeGreaterThan(0);
    expect(race.bananas).toHaveLength(0);
  });

  it('등딱지를 쏘면 앞 카트를 맞힌다', () => {
    const race = racing();
    const p = race.player;
    const target = race.karts[0];
    // 앞 카트를 플레이어 바로 앞으로 옮긴다 (출발 대열의 다른 카트보다 가깝게)
    const ahead = p.position.clone().addScaledVector(forwardOf(p.heading), 4.5);
    target.position.copy(ahead);
    target.trackIndex = locate(race.track, ahead).index;
    p.item = 'shell';
    useItem(race, p);
    expect(race.shells).toHaveLength(1);
    for (let t = 0; t < 1 && race.shells.length; t += dt) stepRace(race, dt, NO_INPUT, fixed);
    expect(target.spinTimer).toBeGreaterThan(0);
    expect(race.events).toContain('hitOther');
  });

  it('반대로 달리면 역주행 경고', () => {
    const race = racing();
    race.player.heading += Math.PI;
    run(race, 2, () => ({ ...NO_INPUT, throttle: 1 }));
    expect(isWrongWay(race.player)).toBe(true);
    expect(race.player.distance).toBeLessThan(race.karts[0].distance);
  });

  it('코스 밖으로 떨어지면 트랙으로 돌아온다', () => {
    const race = racing();
    race.player.position.y -= 20;
    stepRace(race, dt, NO_INPUT, fixed);
    expect(race.player.respawnAt).not.toBeNull();
    expect(race.events).toContain('respawn');
    physics(race);
    const loc = locate(race.track, race.player.position, race.player.trackIndex);
    expect(Math.abs(loc.lateral)).toBeLessThan(0.5);
  });

  it('부스트 패드를 밟으면 부스트', () => {
    const race = racing();
    const pad = race.track.boostPads[0];
    race.player.position.copy(pointOnTrack(race.track, pad.index, 0)).setY(race.player.position.y);
    race.player.trackIndex = pad.index;
    run(race, dt);
    expect(race.player.boostTimer).toBeGreaterThan(0);
    expect(race.events).toContain('boost');
  });

  it('카트끼리 부딪히면 옆으로만 밀려나고 위로 튀지 않는다', () => {
    const race = racing();
    const [a, b] = race.karts;
    // a를 b 바로 뒤(진행 방향)로 옮겨 빠르게 들이받게 한다
    const fwd = forwardOf(b.heading);
    a.position.copy(b.position).addScaledVector(fwd, -1.2);
    a.trackIndex = b.trackIndex;
    a.heading = b.heading;
    a.speed = 20;
    a.velocity.copy(fwd).multiplyScalar(20);
    stepRace(race, dt, NO_INPUT, fixed);
    expect(a.desiredVelocity.dot(fwd)).toBeLessThan(b.desiredVelocity.dot(fwd));
    expect(a.desiredVelocity.y).toBeCloseTo(a.velocity.y);
    expect(b.desiredVelocity.y).toBeCloseTo(b.velocity.y);
  });

  it('순위는 달린 거리 순서', () => {
    const race = racing();
    run(race, 10, autopilot);
    const sorted = [...race.karts].sort((a, b) => a.place - b.place);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].distance).toBeGreaterThanOrEqual(sorted[i].distance);
    expect(new Set(race.karts.map((k) => k.place)).size).toBe(6);
  });
});

