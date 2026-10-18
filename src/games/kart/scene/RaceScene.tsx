import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, type RapierRigidBody } from '@react-three/rapier';
import { memo, Suspense, useRef, type RefObject } from 'react';
import type { Group } from 'three';
import { GRAVITY } from '../logic/constants';
import type { KartInput } from '../logic/kart';
import { stepRace, type RaceEvent, type RaceState } from '../logic/race';
import { CameraRig } from './CameraRig';
import { ItemsView } from './ItemsView';
import { KartView } from './KartView';
import { Scenery } from './Scenery';
import { TrackView } from './TrackView';

interface Props {
  race: RaceState;
  paused: boolean;
  /** 매 프레임 플레이어 입력을 읽는다 (아이템 키는 읽는 순간 소비) */
  readInput: () => KartInput;
  onEvents: (events: RaceEvent[]) => void;
}

/**
 * 레이스 로직과 물리 엔진을 잇는다.
 * 물리 결과(위치·속도)를 레이스 상태에 넣고 → 로직을 한 프레임 진행 → 목표 속도를 물리 몸체에 적용.
 */
function RaceDriver({ race, paused, readInput, onEvents, bodies }: Props & { bodies: RefObject<(RapierRigidBody | null)[]> }) {
  useFrame((_, delta) => {
    if (paused) return;
    const dt = Math.min(delta, 1 / 30);
    const list = bodies.current;
    for (const k of race.karts) {
      const b = list[k.id];
      if (!b) return; // 물리 몸체가 아직 준비되지 않았다
      const t = b.translation();
      const v = b.linvel();
      k.position.set(t.x, t.y, t.z);
      k.velocity.set(v.x, v.y, v.z);
    }

    stepRace(race, dt, readInput());

    for (const k of race.karts) {
      const b = list[k.id]!;
      if (k.respawnAt) {
        b.setTranslation(k.respawnAt, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        k.respawnAt = null;
      } else {
        b.setLinvel(k.desiredVelocity, true);
      }
    }
    if (race.events.length) onEvents(race.events);
  });
  return null;
}

/** HUD가 자주 바뀌어도 3D 장면은 다시 렌더링하지 않도록 memo (props는 모두 안정적인 값) */
export const RaceScene = memo(function RaceScene(props: Props) {
  const { race, paused } = props;
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const playerVisual = useRef<Group | null>(null);

  return (
    <Canvas camera={{ fov: 62, near: 0.1, far: 1500, position: [0, 5, -10] }} dpr={[1, 2]} gl={{ antialias: true }}>
      <Suspense fallback={null}>
        <Scenery track={race.track} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} paused={paused}>
          <TrackView track={race.track} />
          {race.karts.map((k) => (
            <KartView
              key={k.id}
              kart={k}
              onBody={(id, b) => {
                bodies.current[id] = b;
              }}
              onVisual={(id, g) => {
                if (id === race.player.id) playerVisual.current = g;
              }}
            />
          ))}
          <RaceDriver {...props} bodies={bodies} />
        </Physics>
        <ItemsView race={race} />
        <CameraRig race={race} playerVisual={playerVisual} />
      </Suspense>
    </Canvas>
  );
});
