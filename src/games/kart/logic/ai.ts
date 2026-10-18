import { forwardOf, type KartInput, type KartState } from './kart';
import type { RaceState } from './race';
import { wrapIndex } from './track';

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * CPU 운전: 속도에 비례해 앞쪽 트랙 지점을 바라보고 따라간다.
 * 각자 차선을 살짝 바꿔 가며 달려서 한 줄로 늘어서지 않는다.
 */
export function aiInput(k: KartState, race: RaceState): Omit<KartInput, 'useItem'> {
  const { track } = race;
  const lookahead = 8 + Math.abs(k.speed) * 0.5;
  const ahead = track.samples[wrapIndex(track, k.trackIndex + Math.round(lookahead / track.spacing))];
  const laneLimit = track.course.width / 2 - 2;
  const lane = clamp((k.ai?.lane ?? 0) + Math.sin(race.time * 0.4 + k.id * 1.7) * 1.5, -laneLimit, laneLimit);
  const target = ahead.pos.clone().addScaledVector(ahead.side, lane);

  const desired = Math.atan2(target.x - k.position.x, target.z - k.position.z);
  const diff = wrapAngle(desired - k.heading);
  // heading이 줄어드는 쪽이 오른쪽(steer +)
  const steer = clamp(-diff * 3, -1, 1);
  const sharp = Math.abs(diff) > 0.7 && k.speed > 15;
  return { throttle: sharp ? 0.2 : 1, steer, drift: false };
}

/** 플레이어와의 거리에 따라 CPU 속도를 조절해 너무 멀리 달아나거나 처지지 않게 한다 */
export function aiSpeedFactor(k: KartState, race: RaceState) {
  const skill = k.ai?.skill ?? 1;
  const gap = k.distance - race.player.distance;
  return skill - clamp(gap / 60, -1, 1) * 0.07;
}

/** CPU가 지금 아이템을 쓸지 */
export function aiWantsItem(k: KartState, race: RaceState, dt: number) {
  if (!k.item || k.itemRoulette > 0 || !k.ai) return false;
  k.ai.itemHeld += dt;
  const others = race.karts.filter((o) => o !== k);
  switch (k.item) {
    case 'mushroom':
      return Math.abs(k.steer) < 0.3;
    case 'shell': {
      const fwd = forwardOf(k.heading);
      const target = others.some((o) => {
        const gap = o.distance - k.distance;
        if (gap < 3 || gap > 35) return false;
        const to = o.position.clone().sub(k.position).setY(0).normalize();
        return to.dot(fwd) > 0.95;
      });
      return target || k.ai.itemHeld > 8;
    }
    case 'banana':
      return others.some((o) => k.distance - o.distance > 2 && k.distance - o.distance < 15) || k.ai.itemHeld > 10;
  }
}
