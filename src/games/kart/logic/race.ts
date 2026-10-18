import { Vector3 } from 'three';
import { aiInput, aiSpeedFactor, aiWantsItem } from './ai';
import {
  BANANA_RADIUS,
  BUMP_DISTANCE,
  BUMP_RESTITUTION,
  BOOST_PAD_HALF_LENGTH,
  BOOST_PAD_HALF_WIDTH,
  BOOST_PAD_TIME,
  COUNTDOWN_TIME,
  ITEM_BOX_RADIUS,
  ITEM_BOX_RESPAWN,
  ITEM_ROULETTE_TIME,
  KART_RADIUS,
  LAPS,
  MAX_BANANAS,
  MUSHROOM_TIME,
  RESPAWN_FALL_DEPTH,
  SHELL_LIFE,
  SHELL_MAX_BOUNCES,
  SHELL_RADIUS,
  SHELL_SPEED,
  START_BOOST_TIME,
  START_BOOST_WINDOW,
  RISE_ALLOWANCE,
  WRONG_WAY_TIME,
} from './constants';
import type { CourseDef } from './courses';
import { createKart, forwardOf, spinOut, stepKart, type ItemKind, type KartInput, type KartState } from './kart';
import { CHARACTERS, characterById, KARTS, kartById } from './roster';
import { buildTrack, headingOf, isOffroad, locate, pointOnTrack, wrapDistance, wrapIndex, type Track } from './track';

export type Rng = () => number;

export type RaceEvent =
  | 'countdown'
  | 'go'
  | 'lap'
  | 'finalLap'
  | 'finish'
  | 'itemGet'
  | 'useItem'
  | 'boost'
  | 'miniTurbo'
  | 'driftStart'
  | 'hit'
  | 'hitOther'
  | 'bump'
  | 'respawn';

export interface ItemBox {
  position: Vector3;
  respawn: number;
}

export interface Banana {
  position: Vector3;
}

export interface Shell {
  position: Vector3;
  dir: Vector3;
  life: number;
  age: number;
  bounces: number;
  owner: number;
  trackIndex: number;
}

export interface RaceResult {
  name: string;
  kartName: string;
  color: string;
  isPlayer: boolean;
  time: number;
  /** 아직 들어오지 못해 예상 기록으로 매긴 순위인지 */
  estimated: boolean;
}

export interface RaceState {
  track: Track;
  phase: 'countdown' | 'racing' | 'finished';
  /** 남은 카운트다운 시간 */
  countdown: number;
  /** 출발 후 경과 시간 */
  time: number;
  karts: KartState[];
  player: KartState;
  itemBoxes: ItemBox[];
  bananas: Banana[];
  shells: Shell[];
  /** 이번 프레임에 플레이어 쪽에서 일어난 일 (효과음·HUD 연출용) */
  events: RaceEvent[];
  /** 카운트다운 중 액셀을 밟기 시작했을 때의 남은 시간 */
  throttleHeldAt: number | null;
  results: RaceResult[] | null;
}

/** 플레이어가 고른 캐릭터와 카트 */
export interface Selection {
  characterId: string;
  kartId: string;
}

export const DEFAULT_SELECTION: Selection = { characterId: CHARACTERS[0].id, kartId: KARTS[0].id };

/** 출발 순서상 플레이어 자리 (0이 맨 앞). 뒤에서 출발해 추월하는 재미 */
const PLAYER_GRID_SLOT = 5;

export function createRace(course: CourseDef, selection: Selection = DEFAULT_SELECTION, rng: Rng = Math.random): RaceState {
  const track = buildTrack(course);
  const karts: KartState[] = [];

  // CPU는 플레이어가 고르지 않은 캐릭터들이, 서로 다른 카트를 골고루 나눠 탄다
  const rivals = CHARACTERS.filter((c) => c.id !== selection.characterId);
  const kartOffset = Math.floor(rng() * KARTS.length);
  let cpu = 0;
  for (let slot = 0; slot < rivals.length + 1; slot++) {
    const isPlayer = slot === PLAYER_GRID_SLOT;
    const character = isPlayer ? characterById(selection.characterId) : rivals[cpu];
    const kartDef = isPlayer ? kartById(selection.kartId) : KARTS[(cpu + kartOffset) % KARTS.length];
    if (!isPlayer) cpu++;
    const ai = isPlayer ? null : { lane: (rng() * 2 - 1) * 3, skill: 0.9 + rng() * 0.07, itemHeld: 0 };
    const k = createKart(slot, character, kartDef, isPlayer, ai);

    // 출발선 뒤로 2열 종대
    const back = 6 + Math.floor(slot / 2) * 6;
    const index = wrapIndex(track, -Math.round(back / track.spacing));
    const sample = track.samples[index];
    k.position.copy(pointOnTrack(track, index, (slot % 2 === 0 ? 1 : -1) * 3.5)).setY(sample.pos.y + KART_RADIUS);
    k.heading = headingOf(sample.tangent);
    k.trackIndex = index;
    k.distance = sample.dist - track.length;
    karts.push(k);
  }

  const itemBoxes: ItemBox[] = [];
  for (const row of track.itemRows) {
    for (const f of [-0.6, -0.2, 0.2, 0.6]) {
      const p = pointOnTrack(track, row, (f * course.width) / 2);
      itemBoxes.push({ position: p.setY(p.y + 1.2), respawn: 0 });
    }
  }

  return {
    track,
    phase: 'countdown',
    countdown: COUNTDOWN_TIME,
    time: 0,
    karts,
    player: karts.find((k) => k.isPlayer)!,
    itemBoxes,
    bananas: [],
    shells: [],
    events: [],
    throttleHeldAt: null,
    results: null,
  };
}

export const currentLap = (k: KartState) => Math.min(LAPS, k.lap + 1);

/**
 * 레이스를 dt초 진행한다.
 * 호출 전에 각 카트의 position·velocity를 물리 엔진 값으로 채워 두면,
 * 호출 후 desiredVelocity(와 필요하면 respawnAt)를 물리 엔진에 적용하면 된다.
 */
export function stepRace(race: RaceState, dt: number, playerInput: KartInput, rng: Rng = Math.random) {
  race.events.length = 0;

  if (race.phase === 'countdown') {
    stepCountdown(race, dt, playerInput, rng);
    return;
  }

  race.time += dt;
  for (const k of race.karts) stepRacer(race, k, dt, playerInput);
  resolveBumps(race);
  stepItemBoxes(race, dt, rng);
  stepBananas(race);
  stepShells(race, dt);
  updatePlaces(race);
}

function stepCountdown(race: RaceState, dt: number, input: KartInput, rng: Rng) {
  const before = race.countdown;
  race.countdown -= dt;
  if (Math.ceil(before) !== Math.ceil(race.countdown) && race.countdown > 0 && Math.ceil(race.countdown) <= 3) {
    race.events.push('countdown');
  }
  if (input.throttle > 0) race.throttleHeldAt ??= before;
  else race.throttleHeldAt = null;

  for (const k of race.karts) k.desiredVelocity.set(0, k.velocity.y, 0);
  if (race.countdown > 0) return;

  race.phase = 'racing';
  race.countdown = 0;
  race.events.push('go');
  // 스타트 대시: GO 직전 알맞은 타이밍에 액셀을 밟기 시작했으면 부스트
  const held = race.throttleHeldAt;
  if (held !== null && held >= START_BOOST_WINDOW[0] && held <= START_BOOST_WINDOW[1]) {
    race.player.boostTimer = START_BOOST_TIME;
    race.events.push('boost');
  }
  for (const k of race.karts) if (k.ai && rng() < 0.5) k.boostTimer = START_BOOST_TIME * 0.7;
}

function stepRacer(race: RaceState, k: KartState, dt: number, playerInput: KartInput) {
  const { track } = race;
  const loc = locate(track, k.position, k.trackIndex);

  // 코스 밖으로 떨어지거나 벽을 넘어가면 가까운 트랙 중앙으로 복귀
  if (k.position.y < loc.height - RESPAWN_FALL_DEPTH || Math.abs(loc.lateral) > track.wallOffset + 1.5) {
    const sample = track.samples[loc.index];
    k.respawnAt = sample.pos.clone().setY(sample.pos.y + KART_RADIUS + 1);
    k.heading = headingOf(sample.tangent);
    k.desiredVelocity.set(0, 0, 0);
    k.drift.active = false;
    k.trackIndex = loc.index;
    if (k.isPlayer) race.events.push('respawn');
    return;
  }

  const previousAlong = ((k.distance % track.length) + track.length) % track.length;
  k.distance += wrapDistance(track, loc.along - previousAlong);
  k.trackIndex = loc.index;

  const driving = k.isPlayer && race.phase === 'racing' && k.finishTime === null;
  const auto = { ...aiInput(k, race), useItem: aiWantsItem(k, race, dt) };
  const input: KartInput = driving ? playerInput : k.isPlayer ? { ...auto, useItem: false } : auto;
  const env = {
    grounded: k.position.y - KART_RADIUS <= loc.height + 0.35,
    offroad: isOffroad(track, loc),
    speedFactor: k.ai ? aiSpeedFactor(k, race) : 1,
  };
  const sounds = stepKart(k, input, env, dt);
  if (k.isPlayer) race.events.push(...sounds);
  if (env.grounded) limitRise(k, track.samples[loc.index].tangent);

  // 부스트 패드
  const onPad = track.boostPads.some(
    (pad) => Math.abs(wrapDistance(track, loc.along - pad.dist)) < BOOST_PAD_HALF_LENGTH && Math.abs(loc.lateral) < BOOST_PAD_HALF_WIDTH,
  );
  if (onPad && !k.onBoostPad && env.grounded) {
    k.boostTimer = Math.max(k.boostTimer, BOOST_PAD_TIME);
    if (k.isPlayer) race.events.push('boost');
  }
  k.onBoostPad = onPad;

  // 역주행 경고
  const along = track.samples[loc.index].tangent;
  const backwards = forwardOf(k.heading).dot(along) < -0.3 && Math.abs(k.speed) > 3;
  k.wrongWayTime = backwards ? k.wrongWayTime + dt : 0;

  // 아이템
  if (k.itemRoulette > 0) k.itemRoulette = Math.max(0, k.itemRoulette - dt);
  else if (input.useItem && k.item) useItem(race, k);

  // 랩
  const completed = Math.floor(k.distance / track.length);
  if (completed > k.lap && k.finishTime === null) {
    k.lap = completed;
    k.lapTimes.push(race.time - k.lapStartTime);
    k.lapStartTime = race.time;
    if (k.lap >= LAPS) {
      k.finishTime = race.time;
      if (k.isPlayer) finishRace(race);
    } else if (k.isPlayer) {
      race.events.push(k.lap === LAPS - 1 ? 'finalLap' : 'lap');
    }
  }
}

export const isWrongWay = (k: KartState) => k.wrongWayTime >= WRONG_WAY_TIME;

/**
 * 땅 위에 있을 때 위로 솟는 속도를 오르막 경사로 설명되는 만큼까지만 허용한다.
 * 점프대에서는 경사만큼 떠오르지만, 바닥 이음매에 걸려 튀는 일은 막는다.
 */
function limitRise(k: KartState, tangent: Vector3) {
  const flat = Math.hypot(tangent.x, tangent.z) || 1;
  const slope = tangent.y / flat;
  const along = (k.desiredVelocity.x * tangent.x + k.desiredVelocity.z * tangent.z) / flat;
  const maxRise = Math.max(0, along * slope) + RISE_ALLOWANCE;
  if (k.desiredVelocity.y > maxRise) k.desiredVelocity.y = maxRise;
}

/**
 * 카트끼리의 충돌. 물리 엔진에 맡기면 공 모양 충돌체끼리 타고 넘어 위로 튀므로,
 * 물리 충돌은 끄고 여기서 수평으로만 밀어낸다 (무게를 반영한 탄성 충돌 + 겹친 만큼 떼어 놓기).
 * 무거운 카트는 덜 밀리고 가벼운 카트는 더 밀린다.
 */
function resolveBumps(race: RaceState) {
  const { karts } = race;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      if (a.respawnAt || b.respawnAt || Math.abs(a.position.y - b.position.y) > 1.5) continue;
      const nx = b.position.x - a.position.x;
      const nz = b.position.z - a.position.z;
      const d = Math.hypot(nx, nz);
      if (d >= BUMP_DISTANCE || d < 1e-4) continue;
      const n = new Vector3(nx / d, 0, nz / d);
      const approach = b.desiredVelocity.dot(n) - a.desiredVelocity.dot(n);
      const ma = a.tuning.mass;
      const mb = b.tuning.mass;
      // 충격량 J를 질량으로 나눠 속도 변화로 (같은 무게면 J/m = 속도차의 절반)
      const impulse = approach < 0 ? (-approach * (1 + BUMP_RESTITUTION) * ma * mb) / (ma + mb) : 0;
      const push = (BUMP_DISTANCE - d) * 8;
      a.desiredVelocity.addScaledVector(n, -(impulse / ma + (push * mb) / (ma + mb)));
      b.desiredVelocity.addScaledVector(n, impulse / mb + (push * ma) / (ma + mb));
      if (impulse > 1.5 && (a.isPlayer || b.isPlayer)) race.events.push('bump');
    }
  }
}

function finishRace(race: RaceState) {
  race.phase = 'finished';
  race.events.push('finish');
  const total = LAPS * race.track.length;
  race.results = race.karts
    .map((k) => {
      if (k.finishTime !== null) return { k, time: k.finishTime, estimated: false };
      // 아직 달리는 CPU는 지금까지의 평균 속도로 남은 거리를 달린다고 보고 기록을 매긴다
      const average = Math.max(15, k.distance / Math.max(1, race.time));
      return { k, time: race.time + (total - k.distance) / average, estimated: true };
    })
    .sort((a, b) => a.time - b.time)
    .map(({ k, time, estimated }) => ({ name: k.name, kartName: k.kart.name, color: k.color, isPlayer: k.isPlayer, time, estimated }));
}

// ---------- 아이템 ----------

/** 순위가 낮을수록 좋은 아이템이 잘 나온다 */
function rollItem(place: number, rng: Rng): ItemKind {
  const weights: [ItemKind, number][] =
    place <= 2
      ? [['banana', 6], ['shell', 3.5], ['mushroom', 0.5]]
      : place <= 4
        ? [['banana', 3.5], ['shell', 3.5], ['mushroom', 3]]
        : [['banana', 1.5], ['shell', 3.5], ['mushroom', 5]];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [item, w] of weights) {
    roll -= w;
    if (roll < 0) return item;
  }
  return 'mushroom';
}

const horizontalDistance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

function stepItemBoxes(race: RaceState, dt: number, rng: Rng) {
  for (const box of race.itemBoxes) {
    if (box.respawn > 0) {
      box.respawn = Math.max(0, box.respawn - dt);
      continue;
    }
    const k = race.karts.find(
      (k) => !k.item && horizontalDistance(k.position, box.position) < ITEM_BOX_RADIUS && Math.abs(k.position.y - box.position.y) < 2.5,
    );
    if (!k) continue;
    box.respawn = ITEM_BOX_RESPAWN;
    k.item = rollItem(k.place, rng);
    k.itemRoulette = ITEM_ROULETTE_TIME;
    if (k.ai) k.ai.itemHeld = 0;
    if (k.isPlayer) race.events.push('itemGet');
  }
}

export function useItem(race: RaceState, k: KartState) {
  const fwd = forwardOf(k.heading);
  switch (k.item) {
    case 'mushroom':
      k.boostTimer = Math.max(k.boostTimer, MUSHROOM_TIME);
      if (k.isPlayer) race.events.push('boost');
      break;
    case 'banana': {
      const p = k.position.clone().addScaledVector(fwd, -2.4);
      race.bananas.push({ position: p.setY(p.y - KART_RADIUS + 0.3) });
      if (race.bananas.length > MAX_BANANAS) race.bananas.shift();
      break;
    }
    case 'shell':
      race.shells.push({
        position: k.position.clone().addScaledVector(fwd, 2),
        dir: fwd,
        life: SHELL_LIFE,
        age: 0,
        bounces: 0,
        owner: k.id,
        trackIndex: k.trackIndex,
      });
      break;
    case null:
      return;
  }
  k.item = null;
  if (k.isPlayer) race.events.push('useItem');
}

function hitKart(race: RaceState, k: KartState, by: number | null) {
  if (!spinOut(k)) return;
  if (k.isPlayer) race.events.push('hit');
  else if (by === race.player.id) race.events.push('hitOther');
}

function stepBananas(race: RaceState) {
  race.bananas = race.bananas.filter((b) => {
    const k = race.karts.find((k) => horizontalDistance(k.position, b.position) < BANANA_RADIUS && Math.abs(k.position.y - b.position.y) < 2);
    if (!k) return true;
    hitKart(race, k, null);
    return false;
  });
}

function stepShells(race: RaceState, dt: number) {
  const { track } = race;
  const limit = track.wallOffset - 0.5;
  race.shells = race.shells.filter((s) => {
    s.age += dt;
    s.life -= dt;
    s.position.addScaledVector(s.dir, SHELL_SPEED * dt);
    const loc = locate(track, s.position, s.trackIndex);
    s.trackIndex = loc.index;
    s.position.y = loc.height + 0.5;

    // 벽에 부딪히면 반사
    if (Math.abs(loc.lateral) > limit) {
      const normal = track.samples[loc.index].side.clone().multiplyScalar(Math.sign(loc.lateral));
      s.dir.addScaledVector(normal, -2 * s.dir.dot(normal)).setY(0).normalize();
      s.position.addScaledVector(normal, -(Math.abs(loc.lateral) - limit));
      s.bounces++;
    }
    if (s.life <= 0 || s.bounces > SHELL_MAX_BOUNCES) return false;

    const k = race.karts.find(
      (k) => !(k.id === s.owner && s.age < 0.4) && horizontalDistance(k.position, s.position) < SHELL_RADIUS && Math.abs(k.position.y - s.position.y) < 2,
    );
    if (!k) return true;
    hitKart(race, k, s.owner);
    return false;
  });
}

function updatePlaces(race: RaceState) {
  const order = [...race.karts].sort((a, b) => {
    if (a.finishTime !== null || b.finishTime !== null) {
      return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    }
    return b.distance - a.distance;
  });
  order.forEach((k, i) => (k.place = i + 1));
}

