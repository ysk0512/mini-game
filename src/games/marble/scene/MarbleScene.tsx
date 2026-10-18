import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BallCollider, CoefficientCombineRule, CuboidCollider, Physics, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { memo, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Color, Group, Mesh, MeshStandardMaterial, OrthographicCamera, Quaternion, Vector3 } from 'three';
import { COURSES, platformPosition, type Platform, type Vec3 } from '../game/courses';
import { drive, inspectPosition, MARBLE_RADIUS, STEP, tick, type MarbleEvent, type MarbleGame, type MarbleInput } from '../game/engine';
import { carryByPlatform } from '../game/platformCarry';

interface Props {
  game: MarbleGame;
  paused: boolean;
  overview: boolean;
  readInput: () => MarbleInput;
  onEvents: (events: MarbleEvent[]) => void;
  onTick: () => void;
  onReady: () => void;
}
const CAMERA_OFFSET = new Vector3(12, 22, 16);

function Camera({ game, overview }: { game: MarbleGame; overview: boolean }) {
  const { camera, size } = useThree();
  const target = useRef(new Vector3(-1, 0, 1));
  const desired = useRef(new Vector3());
  useLayoutEffect(() => {
    const orthographic = camera as OrthographicCamera;
    orthographic.position.set(11, 22, 17);
    orthographic.lookAt(-1, 0, 1);
    orthographic.zoom = Math.min(size.width / 31, size.height / 24);
    orthographic.updateProjectionMatrix();
  }, [camera, size]);
  useFrame((_, delta) => {
    const follow = size.width < 608 && !overview && game.phase !== 'ready';
    const dt = Math.min(delta, 1 / 20);
    desired.current.set(follow ? game.position[0] : -1, follow ? Math.max(0, game.position[1] - MARBLE_RADIUS) : 0, follow ? game.position[2] : 1);
    target.current.lerp(desired.current, 1 - Math.exp(-6 * dt));
    camera.position.copy(target.current).add(CAMERA_OFFSET);
    camera.lookAt(target.current);
    const orthographic = camera as OrthographicCamera;
    const zoom = follow ? Math.min(size.width / 13, size.height / 16) : Math.min(size.width / 31, size.height / 24);
    orthographic.zoom += (zoom - orthographic.zoom) * (1 - Math.exp(-6 * dt));
    orthographic.updateProjectionMatrix();
  });
  return null;
}

function PlatformView({ platform, game }: { platform: Platform; game: MarbleGame }) {
  const body = useRef<RapierRigidBody>(null);
  const [width, depth] = platform.size;
  const top = platform.motion ? '#a8d7c8' : '#f0eee1';
  useBeforePhysicsStep(() => {
    if (!platform.motion || !body.current) return;
    const [x, y, z] = platformPosition(platform, game.clock);
    body.current.setNextKinematicTranslation({ x, y, z });
  });
  return (
    <RigidBody ref={body} type={platform.motion ? 'kinematicPosition' : 'fixed'} colliders={false}
      position={platformPosition(platform, 0)} rotation={[platform.tilt ?? 0, 0, 0]}>
      <CuboidCollider args={[width / 2, 0.35, depth / 2]} position={[0, -0.35, 0]} friction={platform.motion ? 0 : 1} frictionCombineRule={platform.motion ? CoefficientCombineRule.Min : CoefficientCombineRule.Average} restitution={0.05} />
      <mesh receiveShadow castShadow position={[0, -0.35, 0]}>
        <boxGeometry args={[width, 0.7, depth]} />
        {['#6d8f84', '#557a72', top, '#44685f', '#64877c', '#75988b'].map((color, i) =>
          <meshStandardMaterial key={i} attach={`material-${i}`} color={color} roughness={0.85} />)}
      </mesh>
      <mesh position={[0, -0.74, 0]}>
        <boxGeometry args={[Math.max(0.2, width - 0.18), 0.08, Math.max(0.2, depth - 0.18)]} />
        <meshStandardMaterial color={platform.motion ? '#80ccbb' : '#45675e'} />
      </mesh>
      {platform.motion && [-0.65, 0, 0.65].map(x => <mesh key={x} position={[x, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.09, 1.3]} /><meshStandardMaterial color="#5a9687" /></mesh>)}
    </RigidBody>
  );
}

function Sweeper({ at, length, speed, game }: { at: Vec3; length: number; speed: number; game: MarbleGame }) {
  const body = useRef<RapierRigidBody>(null);
  const rotation = useRef(new Quaternion());
  const axis = useRef(new Vector3(0, 1, 0));
  useBeforePhysicsStep(() => {
    rotation.current.setFromAxisAngle(axis.current, game.clock * speed);
    body.current?.setNextKinematicRotation(rotation.current);
  });
  return <group position={at}>
    <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.2, 0.28, 0.4, 16]} /><meshStandardMaterial color="#6e6c74" /></mesh>
    <RigidBody ref={body} type="kinematicPosition" position={[0, 0.42, 0]} colliders={false}>
      <CuboidCollider args={[length / 2, 0.13, 0.13]} restitution={0.35} />
      <mesh castShadow><boxGeometry args={[length, 0.26, 0.26]} /><meshStandardMaterial color="#e69b8c" /></mesh>
      {[-1, 1].map(sign => <mesh key={sign} position={[sign * length / 2, 0, 0]} castShadow><sphereGeometry args={[0.2, 12, 12]} /><meshStandardMaterial color="#f3be94" /></mesh>)}
    </RigidBody>
  </group>;
}

function Gem({ at, index, game }: { at: Vec3; index: number; game: MarbleGame }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = !game.collected.has(index);
    ref.current.position.y = at[1] + 0.7 + Math.sin(game.clock * 2.8 + index) * 0.12;
    ref.current.rotation.y = game.clock * 1.4 + index;
  });
  return <group ref={ref} position={[at[0], at[1] + 0.7, at[2]]}>
    <mesh castShadow><octahedronGeometry args={[0.33]} /><meshStandardMaterial color="#f4c76e" emissive="#c78d36" emissiveIntensity={0.18} metalness={0.3} roughness={0.3} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}><ringGeometry args={[0.21, 0.27, 24]} /><meshBasicMaterial color="#d9b879" side={2} transparent opacity={0.55} /></mesh>
  </group>;
}

function Checkpoint({ at, index, game }: { at: Vec3; index: number; game: MarbleGame }) {
  const material = useRef<MeshStandardMaterial>(null);
  useFrame(() => material.current?.color.set(game.checkpoint >= index ? '#51bca4' : '#b8bca8'));
  return <group position={at}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}><ringGeometry args={[0.66, 0.81, 40]} /><meshStandardMaterial ref={material} color="#b8bca8" /></mesh>
    <mesh position={[-0.95, 0.6, -0.7]} castShadow><cylinderGeometry args={[0.035, 0.035, 1.2, 8]} /><meshStandardMaterial color="#507b6d" /></mesh>
    <mesh position={[-0.68, 1.03, -0.7]} castShadow><boxGeometry args={[0.5, 0.3, 0.035]} /><meshStandardMaterial color="#8bc8b2" /></mesh>
  </group>;
}

function Portal({ game }: { game: MarbleGame }) {
  const ring = useRef<Mesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const ready = new Color('#77d7b9');
  const locked = new Color('#a7b7ac');
  useFrame(() => {
    const active = game.collected.size === COURSES[game.stage].gems.length;
    material.current?.color.copy(active ? ready : locked);
    if (material.current) material.current.emissiveIntensity = active ? 0.5 : 0.03;
    if (ring.current) ring.current.position.y = 1.15 + Math.sin(game.clock * 2) * 0.07;
  });
  return <group position={COURSES[game.stage].goal}>
    <mesh receiveShadow position={[0, 0.025, 0]}><cylinderGeometry args={[1, 1, 0.05, 40]} /><meshStandardMaterial color="#bad0b8" /></mesh>
    <mesh ref={ring} position={[0, 1.15, 0]} rotation={[0, 0.64, 0]} castShadow><torusGeometry args={[0.92, 0.1, 12, 64]} /><meshStandardMaterial ref={material} color="#a7b7ac" emissive="#5accad" roughness={0.3} metalness={0.2} /></mesh>
    <mesh position={[0, 2.45, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.27, 0.27, 0.27]} /><meshStandardMaterial color="#82bda8" /></mesh>
  </group>;
}

function Tree({ at, scale = 1 }: { at: Vec3; scale?: number }) {
  return <group position={at} scale={scale}>
    <mesh castShadow position={[0, 0.25, 0]}><cylinderGeometry args={[0.07, 0.1, 0.5, 7]} /><meshStandardMaterial color="#b8a083" /></mesh>
    <mesh castShadow position={[0, 0.7, 0]}><icosahedronGeometry args={[0.46, 0]} /><meshStandardMaterial color="#88aa8a" flatShading /></mesh>
    <mesh castShadow position={[0.14, 1, -0.06]}><icosahedronGeometry args={[0.28, 0]} /><meshStandardMaterial color="#b2c19a" flatShading /></mesh>
  </group>;
}

function WorldDecor({ game }: { game: MarbleGame }) {
  const course = COURSES[game.stage];
  return <>
    <color attach="background" args={[game.stage === 2 ? '#dfe0ed' : game.stage === 1 ? '#eee4db' : '#dce9e3']} />
    <ambientLight intensity={1.1} />
    <hemisphereLight args={['#f6f6e9', '#7a9290', 1.3]} />
    <directionalLight position={[-8, 18, 9]} intensity={2.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-normalBias={0.035} shadow-bias={-0.0001} />
    <directionalLight position={[10, 8, -10]} intensity={1} color="#e0eafd" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial transparent opacity={0.12} /></mesh>
    <Tree at={[-9.2, 0, 8.9]} scale={0.9} />
    <Tree at={[course.goal[0] + 1.15, course.goal[1], course.goal[2] - 1.15]} scale={0.8} />
    <Tree at={[course.goal[0] - 1.15, course.goal[1], course.goal[2] - 1.15]} scale={0.55} />
    <group position={[course.start[0], 0.012, course.start[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><ringGeometry args={[0.7, 0.77, 40]} /><meshStandardMaterial color="#9fae99" /></mesh>
    </group>
    {course.springs.map((at, i) => <group key={i} position={at}>
      <mesh position={[0, 0.035, 0]}><boxGeometry args={[1, 0.07, 1.4]} /><meshStandardMaterial color="#e5b867" emissive="#c69436" emissiveIntensity={0.1} /></mesh>
      {[0, 0.25, -0.25].map(x => <mesh key={x} position={[x, 0.08, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}><coneGeometry args={[0.16, 0.22, 3]} /><meshStandardMaterial color="#fff5c9" /></mesh>)}
    </group>)}
  </>;
}

function MarbleWorld({ game, readInput, onEvents, onTick, onReady }: Omit<Props, 'paused'>) {
  const body = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();
  const course = COURSES[game.stage];
  useEffect(() => { onReady(); }, [onReady]);
  useBeforePhysicsStep(() => {
    const ball = body.current;
    if (!ball) return;
    tick(game, STEP);
    if (game.respawn) {
      const [x, y, z] = game.respawn;
      ball.setTranslation({ x, y, z }, true);
      ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      game.position = [...game.respawn];
      game.respawn = null;
      onEvents(['respawn']);
    }
    if (game.phase !== 'playing') return;
    const input = readInput();
    const position = ball.translation();
    const hit = world.castRay(new rapier.Ray(position, { x: 0, y: -1, z: 0 }), MARBLE_RADIUS + 0.13, true, undefined, undefined, undefined, ball);
    carryByPlatform(ball, hit?.collider.parent() ?? null);
    const velocity = drive(ball.linvel(), input, STEP);
    if (input.jump && game.jumpCooldown === 0) {
      if (hit) {
        velocity.y = 4.9;
        game.jumpCooldown = 0.3;
      }
    }
    ball.setLinvel(velocity, true);
  });
  useAfterPhysicsStep(() => {
    const ball = body.current;
    if (!ball) return;
    const position = ball.translation();
    const events = inspectPosition(game, [position.x, position.y, position.z]);
    if (events.includes('spring')) {
      const velocity = ball.linvel();
      ball.setLinvel({ x: Math.max(4.4, velocity.x), y: 6.5, z: velocity.z * 0.3 }, true);
    }
    if (events.length) onEvents(events);
    onTick();
  });
  return <>
    {course.platforms.map(platform => <PlatformView key={platform.id} platform={platform} game={game} />)}
    {course.sweepers.map((sweeper, i) => <Sweeper key={i} {...sweeper} game={game} />)}
    <RigidBody ref={body} colliders={false} position={game.position} ccd canSleep={false} angularDamping={0.6}>
      <BallCollider args={[MARBLE_RADIUS]} mass={1} friction={0.7} restitution={0.12} />
      <mesh castShadow><sphereGeometry args={[MARBLE_RADIUS, 32, 24]} /><meshStandardMaterial color="#ed8c8d" roughness={0.23} metalness={0.22} /></mesh>
      {[0, Math.PI / 2].map(angle => <mesh key={angle} rotation={[angle, 0, 0]}><torusGeometry args={[MARBLE_RADIUS - 0.006, 0.017, 8, 48]} /><meshStandardMaterial color="#fff0d5" roughness={0.3} /></mesh>)}
    </RigidBody>
    {course.gems.map((at, i) => <Gem key={i} at={at} index={i} game={game} />)}
    {course.checkpoints.map((at, i) => <Checkpoint key={i} at={at} index={i} game={game} />)}
    <Portal game={game} />
  </>;
}

export const MarbleScene = memo(function MarbleScene(props: Props) {
  return <Canvas shadows orthographic camera={{ position: [11, 22, 17], zoom: 22, near: 0.1, far: 100 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
    <Camera game={props.game} overview={props.overview} />
    <WorldDecor game={props.game} />
    <Suspense fallback={null}>
      <Physics gravity={[0, -16, 0]} timeStep={STEP} paused={props.paused} interpolate>
        <MarbleWorld {...props} />
      </Physics>
    </Suspense>
  </Canvas>;
});
