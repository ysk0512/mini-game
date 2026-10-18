import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { KART_RADIUS } from '../logic/constants';
import { driftLevel, type KartState } from '../logic/kart';
import type { CharacterDef } from '../logic/roster';

/** 물리 공의 중심이 원점이므로 바닥은 그 반지름만큼 아래 */
const GROUND = -KART_RADIUS;
const SPARK_COLORS = ['#ffffff', '#38bdf8', '#fb923c'];

interface Props {
  kart: KartState;
  /** 카메라가 따라갈 수 있게 최상위 그룹을 알려 준다 */
  groupRef?: (group: Group | null) => void;
}

/**
 * 보이는 카트와 운전자. 차체 모양은 카트 종류(body)에서, 색과 머리 장식은 캐릭터에서 온다.
 * heading·드리프트·부스트 같은 상태는 매 프레임 KartState에서 읽어 연출한다.
 */
export function KartModel({ kart, groupRef }: Props) {
  const { body: shape } = kart.kart;
  const character = kart.character;
  const yaw = useRef<Group | null>(null);
  const body = useRef<Group>(null);
  const frontWheels = useRef<(Group | null)[]>([]);
  const wheels = useRef<(Mesh | null)[]>([]);
  const sparks = useRef<(Mesh | null)[]>([]);
  const flame = useRef<Mesh>(null);
  const spin = useRef(0);
  const roll = useRef(0);

  useFrame(({ clock }, delta) => {
    if (!yaw.current || !body.current) return;
    const k = kart;
    // 스핀아웃이면 제자리에서 빙글빙글
    spin.current = k.spinTimer > 0 ? spin.current + delta * 14 : 0;
    yaw.current.rotation.y = k.heading + spin.current;

    // 드리프트 쪽으로 기울고, 시작할 때 살짝 뛰어오른다
    const targetRoll = k.drift.active ? -k.drift.dir * 0.12 : 0;
    roll.current += (targetRoll - roll.current) * Math.min(1, delta * 10);
    body.current.rotation.z = roll.current;
    body.current.rotation.y = k.drift.active ? -k.drift.dir * 0.35 : 0;
    body.current.position.y = Math.sin((k.hopTimer / 0.18) * Math.PI) * 0.35;

    for (const fw of frontWheels.current) if (fw) fw.rotation.y = -k.steer * 0.4;
    for (const w of wheels.current) if (w) w.rotation.x += (k.speed / shape.wheelRadius) * delta;

    const level = driftLevel(k.drift);
    sparks.current.forEach((s) => {
      if (!s) return;
      s.visible = k.drift.active && k.grounded;
      s.scale.setScalar(0.6 + Math.random() * 0.8);
      (s.material as MeshStandardMaterial).emissive.set(SPARK_COLORS[level]);
    });
    if (flame.current) {
      flame.current.visible = k.boostTimer > 0;
      flame.current.scale.set(1, 1, 0.8 + Math.sin(clock.elapsedTime * 60) * 0.3);
    }
  });

  const { length: L, width: W, height: H, wheelRadius: wr } = shape;
  const floor = GROUND + Math.max(0.12, wr * 0.6);
  const top = floor + H;
  const seatZ = -0.2;
  const headY = top + 0.85;
  const wheelWidth = 0.22 + wr * 0.3;

  return (
    <group
      ref={(g) => {
        yaw.current = g;
        groupRef?.(g);
      }}
    >
      {/* 그림자 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, GROUND + 0.03, 0]}>
        <circleGeometry args={[Math.max(L, W) * 0.6, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.3} depthWrite={false} />
      </mesh>

      <group ref={body}>
        {/* 차체 */}
        <mesh position={[0, floor + H / 2, 0]}>
          <boxGeometry args={[W, H, L]} />
          <meshStandardMaterial color={character.color} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, top + 0.011, 0]}>
          <boxGeometry args={[W * 0.22, 0.02, L * 0.92]} />
          <meshStandardMaterial color={character.accent} roughness={0.5} />
        </mesh>
        <mesh position={[0, floor + H * 0.6, L / 2]} rotation-x={0.5}>
          <boxGeometry args={[W * 0.8, H * 0.8, L * 0.26]} />
          <meshStandardMaterial color={character.color} roughness={0.4} />
        </mesh>

        {/* 운전석과 운전자 */}
        <mesh position={[0, top + 0.15, seatZ - 0.05]}>
          <boxGeometry args={[0.7, 0.35, 0.6]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, top + 0.45, seatZ]}>
          <cylinderGeometry args={[0.24, 0.3, 0.45, 10]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
        <mesh position={[0, headY, seatZ]}>
          <sphereGeometry args={[0.3, 16, 12]} />
          <meshStandardMaterial color={character.color} roughness={0.3} metalness={0.15} />
        </mesh>
        <group position={[0, headY, seatZ]}>
          <Headgear character={character} />
        </group>

        {shape.spoiler > 0 && (
          <group position={[0, top + 0.4, -L / 2 + 0.1]}>
            <mesh>
              <boxGeometry args={[shape.spoiler, 0.08, 0.32]} />
              <meshStandardMaterial color="#111827" />
            </mesh>
            {[-1, 1].map((x) => (
              <mesh key={x} position={[x * shape.spoiler * 0.3, -0.2, 0]}>
                <boxGeometry args={[0.06, 0.4, 0.1]} />
                <meshStandardMaterial color="#111827" />
              </mesh>
            ))}
          </group>
        )}
        {shape.rollBar && (
          <mesh position={[0, top, seatZ - 0.45]}>
            <torusGeometry args={[0.55, 0.06, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#d4d4d8" metalness={0.6} roughness={0.3} />
          </mesh>
        )}
        {shape.fins &&
          [-1, 1].map((x) => (
            <mesh key={x} position={[x * (W / 2 + 0.03), top + 0.12, -L / 2 + 0.45]}>
              <boxGeometry args={[0.06, 0.36, 0.8]} />
              <meshStandardMaterial color={character.accent} />
            </mesh>
          ))}

        {/* 바퀴: 앞바퀴는 조향 방향으로 돈다 */}
        {[-1, 1].flatMap((x) =>
          [1, -1].map((side) => {
            const front = side > 0;
            const index = (x + 1) / 2 + (front ? 0 : 2);
            return (
              <group
                key={`${x}${side}`}
                position={[x * (W / 2 + 0.05), GROUND + wr, side * L * 0.34]}
                ref={(g) => {
                  if (front) frontWheels.current[(x + 1) / 2] = g;
                }}
              >
                <mesh
                  ref={(m) => {
                    wheels.current[index] = m;
                  }}
                  rotation-z={Math.PI / 2}
                >
                  <cylinderGeometry args={[wr, wr, wheelWidth, 14]} />
                  <meshStandardMaterial color="#18181b" roughness={0.8} />
                </mesh>
              </group>
            );
          }),
        )}

        {/* 드리프트 불꽃 */}
        {[-1, 1].map((x, i) => (
          <mesh
            key={x}
            ref={(m) => {
              sparks.current[i] = m;
            }}
            position={[x * (W / 2 + 0.05), GROUND + 0.12, -L * 0.5]}
            visible={false}
          >
            <octahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
          </mesh>
        ))}
        {/* 부스트 화염 */}
        <mesh ref={flame} position={[0, floor + H / 2, -L / 2 - 0.45]} rotation-x={-Math.PI / 2} visible={false}>
          <coneGeometry args={[0.28, 0.9, 10]} />
          <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2.5} transparent opacity={0.85} />
        </mesh>
      </group>
    </group>
  );
}

/** 머리(반지름 0.3 구) 중심 기준의 캐릭터 장식 */
function Headgear({ character }: { character: CharacterDef }) {
  const { color, accent } = character;
  const eyes = (
    <>
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * 0.1, 0.06, 0.27]}>
          <sphereGeometry args={[0.045, 8, 6]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
    </>
  );
  const visor = (
    <mesh position={[0, 0, 0.22]}>
      <boxGeometry args={[0.42, 0.14, 0.12]} />
      <meshStandardMaterial color="#111827" roughness={0.1} />
    </mesh>
  );

  switch (character.headgear) {
    case 'cap':
      return (
        <>
          {visor}
          <mesh position={[0, 0.16, 0.26]} rotation-x={0.15}>
            <boxGeometry args={[0.4, 0.05, 0.3]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        </>
      );
    case 'bolt':
      return (
        <>
          {visor}
          {/* 번개 모양 볏 */}
          <mesh position={[0.04, 0.36, 0]} rotation-z={-0.5}>
            <boxGeometry args={[0.08, 0.26, 0.08]} />
            <meshStandardMaterial color={accent} />
          </mesh>
          <mesh position={[-0.04, 0.55, 0]} rotation-z={0.5}>
            <boxGeometry args={[0.08, 0.26, 0.08]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        </>
      );
    case 'bunny':
      return (
        <>
          {eyes}
          {[-1, 1].map((x) => (
            <mesh key={x} position={[x * 0.12, 0.48, -0.02]} rotation-z={-x * 0.15}>
              <capsuleGeometry args={[0.07, 0.4, 4, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
        </>
      );
    case 'bear':
      return (
        <>
          {eyes}
          {[-1, 1].map((x) => (
            <mesh key={x} position={[x * 0.22, 0.22, 0]}>
              <sphereGeometry args={[0.11, 10, 8]} />
              <meshStandardMaterial color={accent} />
            </mesh>
          ))}
        </>
      );
    case 'fox':
      return (
        <>
          {eyes}
          {[-1, 1].map((x) => (
            <mesh key={x} position={[x * 0.17, 0.32, 0]} rotation-z={-x * 0.25}>
              <coneGeometry args={[0.1, 0.26, 6]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
          <mesh position={[0, -0.08, 0.27]}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        </>
      );
    case 'penguin':
      return (
        <>
          {eyes}
          <mesh position={[0, -0.04, 0.36]} rotation-x={Math.PI / 2}>
            <coneGeometry args={[0.07, 0.18, 8]} />
            <meshStandardMaterial color="#f59e0b" />
          </mesh>
          <mesh position={[0, -0.02, 0.12]} scale={[1, 1, 0.6]}>
            <sphereGeometry args={[0.22, 12, 10]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </>
      );
  }
}
