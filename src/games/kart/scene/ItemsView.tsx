import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { MAX_BANANAS } from '../logic/constants';
import type { RaceState } from '../logic/race';

const SHELL_POOL = 10;

/** 아이템 박스·바나나·등딱지. 개수가 바뀌므로 미리 만든 풀에서 보이기/숨기기만 한다 */
export function ItemsView({ race }: { race: RaceState }) {
  const boxes = useRef<(Mesh | null)[]>([]);
  const bananas = useRef<(Group | null)[]>([]);
  const shells = useRef<(Group | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    race.itemBoxes.forEach((box, i) => {
      const m = boxes.current[i];
      if (!m) return;
      m.visible = box.respawn === 0;
      m.position.set(box.position.x, box.position.y + Math.sin(t * 2 + i) * 0.15, box.position.z);
      m.rotation.set(t * 0.9 + i, t * 1.3 + i, 0);
      (m.material as MeshStandardMaterial).emissive.setHSL((t * 0.25 + i * 0.1) % 1, 0.9, 0.45);
    });
    bananas.current.forEach((g, i) => {
      if (!g) return;
      const b = race.bananas[i];
      g.visible = !!b;
      if (b) g.position.copy(b.position);
    });
    shells.current.forEach((g, i) => {
      if (!g) return;
      const s = race.shells[i];
      g.visible = !!s;
      if (!s) return;
      g.position.copy(s.position);
      g.rotation.y = t * 12;
    });
  });

  return (
    <>
      {race.itemBoxes.map((_, i) => (
        <mesh
          key={`box${i}`}
          ref={(m) => {
            boxes.current[i] = m;
          }}
        >
          <boxGeometry args={[1.3, 1.3, 1.3]} />
          <meshStandardMaterial color="#ffffff" emissive="#a855f7" emissiveIntensity={0.9} transparent opacity={0.75} />
        </mesh>
      ))}
      {Array.from({ length: MAX_BANANAS }, (_, i) => (
        <group
          key={`banana${i}`}
          ref={(g) => {
            bananas.current[i] = g;
          }}
          visible={false}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.1, 0]}>
            <torusGeometry args={[0.38, 0.13, 8, 14, Math.PI]} />
            <meshStandardMaterial color="#facc15" roughness={0.5} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: SHELL_POOL }, (_, i) => (
        <group
          key={`shell${i}`}
          ref={(g) => {
            shells.current[i] = g;
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[0.45, 14, 10]} />
            <meshStandardMaterial color="#16a34a" roughness={0.35} />
          </mesh>
          <mesh rotation-x={Math.PI / 2} position={[0, -0.12, 0]}>
            <torusGeometry args={[0.45, 0.08, 6, 16]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </group>
      ))}
    </>
  );
}
