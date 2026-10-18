import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, OrthographicCamera, SRGBColorSpace } from 'three';
import { BALL_RADIUS, BUMPERS, FLIPPER_LENGTH, SLINGS, TARGETS, WALLS, type PinballState, type Point } from './engine';

function playfieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 1024, 2048);
  gradient.addColorStop(0, '#122935'); gradient.addColorStop(0.55, '#10212d'); gradient.addColorStop(1, '#182d36');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 2048);
  const x = (v: number) => (v + 4.1) / 8.2 * 1024;
  const y = (v: number) => (8.1 - v) / 16.4 * 2048;
  ctx.strokeStyle = '#29434b'; ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i += 0.5) { ctx.beginPath(); ctx.moveTo(x(i), 0); ctx.lineTo(x(i), 2048); ctx.stroke(); }
  for (let i = -8; i <= 8; i += 0.5) { ctx.beginPath(); ctx.moveTo(0, y(i)); ctx.lineTo(1024, y(i)); ctx.stroke(); }
  ctx.strokeStyle = '#477078'; ctx.lineWidth = 2;
  [1.3, 1.6, 2.8, 3.05].forEach(r => { ctx.beginPath(); ctx.ellipse(x(-0.2), y(0), r * 125, r * 76, -0.38, 0, Math.PI * 2); ctx.stroke(); });
  ctx.fillStyle = '#efb958'; ctx.beginPath(); ctx.arc(x(-0.2), y(0), 61, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#132b36'; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(x(-0.2), y(0), 102, 23, -0.38, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#efb958'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x(-0.2), y(0), 109, 27, -0.38, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 66; i++) {
    const px = 100 + ((i * 283.7) % 770), py = 120 + ((i * 193.3) % 1740);
    ctx.fillStyle = i % 4 ? '#66878a' : '#f6dfaa';
    ctx.beginPath(); ctx.arc(px, py, i % 4 ? 1.4 : 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.font = '900 80px sans-serif'; ctx.fillStyle = '#f1e8cc'; ctx.fillText('O R B I T', x(-0.1), y(-1.75));
  ctx.font = '500 19px sans-serif'; ctx.fillStyle = '#8eaba9'; ctx.fillText('P I N B A L L   C L U B', x(-0.1), y(-2.1));
  ctx.font = '700 17px sans-serif'; ctx.fillStyle = '#e2ad5b'; ctx.fillText('KEEP THE GOOD TIMES ROLLING', x(-0.1), y(1.4));
  ctx.font = '600 15px sans-serif'; ctx.fillStyle = '#7ab9b2'; ctx.fillText('SHOOT FOR THE STARS', x(-0.1), y(7.1));
  ctx.save(); ctx.translate(x(3.34), y(-1)); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#7ab9b2'; ctx.font = '600 17px sans-serif'; ctx.fillText('L A U N C H   S E Q U E N C E', 0, 0); ctx.restore();
  ctx.fillStyle = '#eb936c'; ctx.font = '600 18px sans-serif'; ctx.fillText('D O N ’ T   P A N I C', x(0), y(-6.85));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Camera() {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const cam = camera as OrthographicCamera;
    cam.position.set(0.4, 24, 12.5);
    cam.lookAt(0, 0, 0);
    cam.zoom = Math.min(size.width / 10.1, size.height / 16.8);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Rail({ a, b, color = '#79c5bd', slim = false }: { a: Point; b: Point; color?: string; slim?: boolean }) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return <group position={[(a[0] + b[0]) / 2, 0.24, -(a[1] + b[1]) / 2]} rotation={[0, angle, 0]}>
    <mesh castShadow receiveShadow><boxGeometry args={[length + 0.12, slim ? 0.28 : 0.46, 0.14]} /><meshStandardMaterial color="#b9cccb" metalness={0.8} roughness={0.23} /></mesh>
    <mesh position={[0, slim ? 0.16 : 0.25, 0]}><boxGeometry args={[length, 0.035, 0.055]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.7} toneMapped={false} /></mesh>
  </group>;
}

function Bumper({ game, index }: { game: PinballState; index: number }) {
  const bumper = BUMPERS[index];
  const cap = useRef<Mesh>(null);
  const glow = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const flash = game.bumperFlash[index];
    if (cap.current) cap.current.position.y = 0.48 - flash * 0.12;
    if (glow.current) glow.current.emissiveIntensity = 0.75 + flash * 3;
  });
  return <group position={[bumper.x, 0, -bumper.y]}>
    <mesh receiveShadow><cylinderGeometry args={[0.79, 0.83, 0.12, 40]} /><meshStandardMaterial color="#08151e" metalness={0.6} roughness={0.3} /></mesh>
    <mesh position={[0, 0.21, 0]} castShadow><cylinderGeometry args={[0.48, 0.57, 0.42, 32]} /><meshStandardMaterial color="#d5ddda" metalness={0.8} roughness={0.18} /></mesh>
    <mesh ref={cap} position={[0, 0.48, 0]} castShadow><cylinderGeometry args={[0.66, 0.67, 0.17, 48]} /><meshStandardMaterial ref={glow} color={bumper.color} emissive={bumper.color} emissiveIntensity={0.75} roughness={0.25} metalness={0.25} /></mesh>
    <mesh position={[0, 0.585, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.43, 0.455, 48]} /><meshBasicMaterial color="#fff7df" /></mesh>
    <mesh position={[0, 0.59, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}><planeGeometry args={[0.19, 0.19]} /><meshBasicMaterial color="#fff4d6" /></mesh>
    <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.89, 0.92, 48]} /><meshBasicMaterial color={bumper.color} transparent opacity={0.7} /></mesh>
  </group>;
}

function Target({ game, index }: { game: PinballState; index: number }) {
  const target = TARGETS[index];
  const material = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (!material.current) return;
    const lit = game.targets[index];
    material.current.color.set(lit ? '#ffe6a0' : '#738c8d');
    material.current.emissive.set(lit ? '#ffc857' : '#1b393e');
    material.current.emissiveIntensity = (lit ? 1 : 0.4) + game.targetFlash[index] * 2;
  });
  return <group position={[target.x, 0, -target.y]}>
    <mesh position={[0, 0.19, 0]} castShadow><cylinderGeometry args={[0.22, 0.28, 0.38, 6]} /><meshStandardMaterial ref={material} color="#738c8d" roughness={0.3} metalness={0.6} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}><ringGeometry args={[0.34, 0.38, 24]} /><meshBasicMaterial color="#ffc857" /></mesh>
  </group>;
}

function Flipper({ game, left }: { game: PinballState; left: boolean }) {
  const group = useRef<Group>(null);
  useFrame(() => { if (group.current) group.current.rotation.y = left ? game.leftAngle : game.rightAngle; });
  return <group position={[left ? -2.4 : 2.4, 0.21, 4.9]}>
    <group ref={group}>
      <mesh position={[FLIPPER_LENGTH / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow><capsuleGeometry args={[0.14, FLIPPER_LENGTH - 0.28, 6, 12]} /><meshStandardMaterial color={left ? '#ff926d' : '#83e1d2'} roughness={0.23} metalness={0.25} /></mesh>
      <mesh position={[FLIPPER_LENGTH / 2, 0.15, 0]}><boxGeometry args={[FLIPPER_LENGTH - 0.3, 0.04, 0.09]} /><meshStandardMaterial color="#f8efdb" emissive="#fff0d3" emissiveIntensity={0.4} /></mesh>
    </group>
    <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.13, 0.13, 0.1, 24]} /><meshStandardMaterial color="#e6e5db" metalness={0.8} roughness={0.2} /></mesh>
  </group>;
}

function Ball({ game }: { game: PinballState }) {
  const ball = useRef<Mesh>(null);
  const shadow = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!ball.current) return;
    ball.current.position.set(game.ball.x, BALL_RADIUS + 0.04, -game.ball.y);
    ball.current.rotation.x -= game.ball.vy * dt / BALL_RADIUS;
    ball.current.rotation.z -= game.ball.vx * dt / BALL_RADIUS;
    if (shadow.current) shadow.current.position.set(game.ball.x + 0.09, 0.018, -game.ball.y + 0.1);
  });
  return <>
    <mesh ref={ball} castShadow><sphereGeometry args={[BALL_RADIUS, 28, 20]} /><meshStandardMaterial color="#ecfaff" metalness={0.72} roughness={0.14} emissive="#647b83" emissiveIntensity={0.35} /></mesh>
    <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.27, 20]} /><meshBasicMaterial color="#020812" transparent opacity={0.5} depthWrite={false} /></mesh>
  </>;
}

function Table({ game }: { game: PinballState }) {
  const texture = useMemo(playfieldTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group>
    <mesh position={[0, -0.42, 0]} castShadow><boxGeometry args={[8.4, 0.9, 16.8]} /><meshStandardMaterial color="#13232d" roughness={0.37} metalness={0.45} /></mesh>
    <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[8.2, 16.4]} /><meshStandardMaterial map={texture} roughness={0.48} metalness={0.12} /></mesh>
    {[-4.08, 4.08].map(x => <group key={x} position={[x, 0.16, 0]}>
      <mesh castShadow><boxGeometry args={[0.22, 0.7, 16.6]} /><meshStandardMaterial color="#263943" metalness={0.7} roughness={0.25} /></mesh>
      <mesh position={[0, 0.36, 0]}><boxGeometry args={[0.08, 0.035, 16.4]} /><meshStandardMaterial color="#e9ac58" emissive="#d99a42" emissiveIntensity={0.7} /></mesh>
    </group>)}
    {[-8.28, 8.28].map(z => <mesh key={z} position={[0, 0.16, z]} castShadow><boxGeometry args={[8.35, 0.7, 0.22]} /><meshStandardMaterial color="#263943" metalness={0.7} roughness={0.25} /></mesh>)}
    {WALLS.map(([a, b], i) => <Rail a={a} b={b} key={i} />)}
    {SLINGS.map(([a, b], i) => <Rail a={a} b={b} slim color={i < 3 ? '#ff916b' : '#80dacb'} key={`s${i}`} />)}
    {BUMPERS.map((_, i) => <Bumper game={game} index={i} key={i} />)}
    {TARGETS.map((_, i) => <Target game={game} index={i} key={i} />)}
    <Flipper game={game} left /><Flipper game={game} left={false} />
    <Ball game={game} />
    <mesh position={[3.32, 0.21, 7]} castShadow><cylinderGeometry args={[0.19, 0.23, 0.3, 16]} /><meshStandardMaterial color="#ffc857" metalness={0.6} roughness={0.2} /></mesh>
    {[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[3.32, 0.18, 7.15 + i * 0.12]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.025, 6, 12]} /><meshStandardMaterial color="#acbdbe" metalness={0.8} roughness={0.3} /></mesh>)}
    {[-1, 1].flatMap(sign => [0, 1, 2, 3].map(i => <mesh key={`${sign}${i}`} position={[sign * 3.9, 0.55, -6 + i * 4]}><cylinderGeometry args={[0.07, 0.07, 0.05, 8]} /><meshStandardMaterial color="#d9c494" metalness={0.8} roughness={0.22} /></mesh>))}
  </group>;
}

export function PinballScene({ game, onReady }: { game: PinballState; onReady: () => void }) {
  return <Canvas orthographic shadows frameloop={game.phase === 'playing' ? 'always' : 'demand'} dpr={[1, 1.75]} camera={{ position: [0.4, 24, 12.5], near: 0.1, far: 80, zoom: 40 }}
    gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={onReady}
    fallback={<div className="pinball-webgl-error" role="alert">3D 화면을 사용할 수 없습니다. 브라우저의 그래픽 가속을 켜 주세요.</div>}>
    <Camera />
    <ambientLight intensity={1.2} />
    <hemisphereLight args={['#dcecf2', '#23313b', 2.1]} />
    <directionalLight position={[-5, 13, 5]} intensity={3.1} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-normalBias={0.03} />
    <pointLight position={[-4, 4, -3]} color="#67e3d0" intensity={25} distance={15} />
    <pointLight position={[4, 5, 5]} color="#ff9869" intensity={30} distance={15} />
    <Table game={game} />
  </Canvas>;
}
