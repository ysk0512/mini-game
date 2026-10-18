import { Vector3 } from 'three';
import {
  AIR_GRIP,
  AIR_TURN_FACTOR,
  BOOST_ACCEL,
  BRAKE,
  COAST_DECEL,
  DRIFT_CHARGE_LEVELS,
  DRIFT_GRIP,
  DRIFT_MIN_SPEED,
  FULL_TURN_SPEED,
  MINI_TURBO_TIME,
  OFFROAD_SPEED_FACTOR,
  OVERSPEED_DECEL,
  REVERSE_MAX_SPEED,
  SPIN_OUT_TIME,
} from './constants';
import { tuningOf, type CharacterDef, type KartDef, type KartTuning } from './roster';

export type ItemKind = 'mushroom' | 'banana' | 'shell';

export interface KartInput {
  /** -1(후진·브레이크) ~ 1(가속) */
  throttle: number;
  /** -1(왼쪽) ~ 1(오른쪽) */
  steer: number;
  drift: boolean;
  /** 이번 프레임에 아이템 키를 눌렀는지 */
  useItem: boolean;
}

export const NO_INPUT: KartInput = { throttle: 0, steer: 0, drift: false, useItem: false };

export interface Drift {
  active: boolean;
  /** -1 왼쪽, 1 오른쪽 */
  dir: number;
  charge: number;
}

export interface AiProfile {
  /** 코스 중앙선에서의 기본 주행 차선 */
  lane: number;
  /** 최고 속도 배율 */
  skill: number;
  /** 아이템을 들고 있던 시간 */
  itemHeld: number;
}

export interface KartState {
  id: number;
  name: string;
  color: string;
  character: CharacterDef;
  kart: KartDef;
  /** 카트 능력치에서 나온 주행 값 */
  tuning: KartTuning;
  isPlayer: boolean;
  ai: AiProfile | null;

  /** 물리 엔진에서 읽어 온 위치·속도 */
  position: Vector3;
  velocity: Vector3;
  /** 물리 엔진에 넘길 이번 프레임 목표 속도 */
  desiredVelocity: Vector3;
  /** 값이 있으면 그 위치로 순간이동 (코스 이탈 복귀) */
  respawnAt: Vector3 | null;

  /** forward = (sin h, 0, cos h) */
  heading: number;
  /** 진행 방향 속력 (후진이면 음수) */
  speed: number;
  steer: number;
  grounded: boolean;
  offroad: boolean;
  drift: Drift;
  boostTimer: number;
  spinTimer: number;
  /** 드리프트 시작 시 살짝 뛰어오르는 연출용 */
  hopTimer: number;

  item: ItemKind | null;
  itemRoulette: number;

  trackIndex: number;
  /** 출발선부터 달린 누적 거리 (역주행하면 줄어든다) */
  distance: number;
  lap: number;
  lapStartTime: number;
  lapTimes: number[];
  finishTime: number | null;
  place: number;
  wrongWayTime: number;
  onBoostPad: boolean;
}

export interface KartEnv {
  grounded: boolean;
  offroad: boolean;
  /** AI 난이도 조절용 최고 속도 배율 */
  speedFactor: number;
}

export type KartSound = 'driftStart' | 'miniTurbo';

export const forwardOf = (heading: number) => new Vector3(Math.sin(heading), 0, Math.cos(heading));

/** 드리프트 차지 단계: 0 없음, 1 파랑, 2 주황 */
export function driftLevel(drift: Drift) {
  if (!drift.active) return 0;
  if (drift.charge >= DRIFT_CHARGE_LEVELS[1]) return 2;
  return drift.charge >= DRIFT_CHARGE_LEVELS[0] ? 1 : 0;
}

export function spinOut(k: KartState) {
  if (k.spinTimer > 0) return false;
  k.spinTimer = SPIN_OUT_TIME;
  k.drift.active = false;
  k.boostTimer = 0;
  return true;
}

const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

/**
 * 카트 한 대를 dt초 진행한다. 물리 엔진이 계산한 현재 속도(k.velocity)에서 출발해
 * 이번 프레임의 heading과 목표 속도(k.desiredVelocity)를 정한다.
 * 벽에 부딪혀 속도가 줄면 다음 프레임 계산에도 그대로 반영된다.
 */
export function stepKart(k: KartState, input: KartInput, env: KartEnv, dt: number): KartSound[] {
  const sounds: KartSound[] = [];
  k.grounded = env.grounded;
  k.offroad = env.offroad;
  k.hopTimer = Math.max(0, k.hopTimer - dt);

  const horizontal = new Vector3(k.velocity.x, 0, k.velocity.z);
  let forward = forwardOf(k.heading);
  // 속력은 카트가 기억하고, 물리 엔진은 줄이기만 한다 (벽·충돌로 실제 속도가 줄면 그만큼 감속)
  let speed = Math.sign(k.speed) * Math.min(Math.abs(k.speed), horizontal.length() + 0.5);

  // 바나나·등딱지에 맞아 빙글빙글 도는 중: 조작 불가, 감속
  if (k.spinTimer > 0) {
    k.spinTimer = Math.max(0, k.spinTimer - dt);
    speed *= Math.exp(-3 * dt);
    k.speed = speed;
    k.steer = 0;
    horizontal.multiplyScalar(Math.exp(-3 * dt));
    k.desiredVelocity.set(horizontal.x, k.velocity.y, horizontal.z);
    return sounds;
  }

  const t = k.tuning;
  const boosting = k.boostTimer > 0;
  k.boostTimer = Math.max(0, k.boostTimer - dt);
  const offroadFactor = env.offroad && !boosting ? OFFROAD_SPEED_FACTOR : 1;
  const maxSpeed = (boosting ? t.boostMaxSpeed : t.maxSpeed * env.speedFactor) * offroadFactor;

  // 가속·감속
  if (boosting) {
    speed = Math.min(maxSpeed, speed + BOOST_ACCEL * dt);
  } else if (input.throttle > 0) {
    speed = speed > maxSpeed ? Math.max(maxSpeed, speed - OVERSPEED_DECEL * dt) : Math.min(maxSpeed, speed + t.accel * input.throttle * dt);
  } else if (input.throttle < 0) {
    speed = speed > 0 ? speed - BRAKE * dt : Math.max(-REVERSE_MAX_SPEED, speed - t.accel * 0.5 * dt);
  } else {
    speed = approach(speed, 0, (speed > maxSpeed ? OVERSPEED_DECEL : COAST_DECEL) * dt);
  }

  // 조향 (오른쪽으로 꺾으면 heading이 줄어든다)
  const steer = Math.max(-1, Math.min(1, input.steer));
  k.steer = steer;
  const turnStrength = Math.min(1, Math.abs(speed) / FULL_TURN_SPEED) * Math.sign(speed || 1);
  let turn = -steer * t.turnRate * turnStrength;

  const d = k.drift;
  if (env.grounded && !d.active && input.drift && steer !== 0 && speed > DRIFT_MIN_SPEED) {
    d.active = true;
    d.dir = Math.sign(steer);
    d.charge = 0;
    k.hopTimer = 0.18;
    sounds.push('driftStart');
  }
  if (d.active) {
    if (!input.drift || speed < DRIFT_MIN_SPEED * 0.6) {
      const level = driftLevel(d);
      d.active = false;
      if (level > 0) {
        k.boostTimer = Math.max(k.boostTimer, MINI_TURBO_TIME[level]);
        sounds.push('miniTurbo');
      }
    } else {
      // 드리프트 방향으로 계속 돌고, 같은 쪽으로 더 꺾으면 더 날카롭게·차지도 빨리
      const tighten = steer * d.dir;
      turn = -d.dir * t.turnRate * (0.55 + 0.45 * tighten);
      if (env.grounded) d.charge += dt * (0.8 + 0.6 * Math.max(0, tighten)) * t.driftCharge;
    }
  }
  if (!env.grounded) turn *= AIR_TURN_FACTOR;
  k.heading += turn * dt;
  forward = forwardOf(k.heading);

  // 접지력: 실제 속도가 진행 방향을 얼마나 빨리 따라가는지 (드리프트·공중에서는 미끄러진다)
  const grip = !env.grounded ? AIR_GRIP : d.active ? DRIFT_GRIP : t.grip;
  const target = forward.multiplyScalar(speed);
  if (!env.grounded) target.setLength(horizontal.length() > Math.abs(speed) ? horizontal.length() : Math.abs(speed));
  horizontal.lerp(target, 1 - Math.exp(-grip * dt));
  // 미끄러지는 동안에도 속력 자체는 유지
  if (env.grounded && horizontal.lengthSq() > 0) horizontal.setLength(Math.abs(speed));

  k.speed = speed;
  k.desiredVelocity.set(horizontal.x, k.velocity.y, horizontal.z);
  return sounds;
}

export function createKart(id: number, character: CharacterDef, kart: KartDef, isPlayer: boolean, ai: AiProfile | null): KartState {
  return {
    id,
    name: character.name,
    color: character.color,
    character,
    kart,
    tuning: tuningOf(kart.stats),
    isPlayer,
    ai,
    position: new Vector3(),
    velocity: new Vector3(),
    desiredVelocity: new Vector3(),
    respawnAt: null,
    heading: 0,
    speed: 0,
    steer: 0,
    grounded: true,
    offroad: false,
    drift: { active: false, dir: 0, charge: 0 },
    boostTimer: 0,
    spinTimer: 0,
    hopTimer: 0,
    item: null,
    itemRoulette: 0,
    trackIndex: 0,
    distance: 0,
    lap: 0,
    lapStartTime: 0,
    lapTimes: [],
    finishTime: null,
    place: 1,
    wrongWayTime: 0,
    onBoostPad: false,
  };
}
