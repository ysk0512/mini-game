import { useFrame, useThree } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import { PerspectiveCamera, Vector3, type Group } from 'three';
import { MAX_SPEED } from '../logic/constants';
import { forwardOf } from '../logic/kart';
import type { RaceState } from '../logic/race';

const DISTANCE = 6.5;
const HEIGHT = 2.6;
const BASE_FOV = 62;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * 플레이어 뒤를 따라가는 카메라.
 * 빨라질수록 시야각이 넓어지고, 부스트 중에는 더 넓어지며 살짝 흔들린다.
 */
export function CameraRig({ race, playerVisual }: { race: RaceState; playerVisual: RefObject<Group | null> }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const yaw = useRef<number | null>(null);
  const target = useRef(new Vector3());

  useFrame((_, delta) => {
    const visual = playerVisual.current;
    if (!visual) return;
    const dt = Math.min(delta, 1 / 20);
    const k = race.player;
    visual.getWorldPosition(target.current);

    // 드리프트 중에는 카메라가 카트 방향을 조금 늦게 따라가 미끄러지는 느낌을 준다
    const follow = k.drift.active ? 3 : 6;
    if (yaw.current === null) yaw.current = k.heading;
    yaw.current += wrapAngle(k.heading - yaw.current) * (1 - Math.exp(-follow * dt));
    const back = forwardOf(yaw.current);

    const desired = target.current.clone().addScaledVector(back, -DISTANCE);
    desired.y += HEIGHT;
    if (camera.position.distanceTo(desired) > 40) camera.position.copy(desired);
    else camera.position.lerp(desired, 1 - Math.exp(-10 * dt));

    const boosting = k.boostTimer > 0;
    if (boosting) {
      camera.position.x += (Math.random() - 0.5) * 0.06;
      camera.position.y += (Math.random() - 0.5) * 0.06;
    }
    camera.lookAt(target.current.clone().addScaledVector(back, 3).setY(target.current.y + 1));

    const speedRatio = Math.min(1.4, Math.abs(k.speed) / MAX_SPEED);
    const fov = BASE_FOV + speedRatio * 14 + (boosting ? 10 : 0);
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  });

  return null;
}
