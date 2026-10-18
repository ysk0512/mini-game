import { useEffect, useMemo, useRef } from 'react';
import { useGameLoop } from '../../shared/useGameLoop';
import type { RaceState } from './logic/race';
import type { Track } from './logic/track';

const SIZE = 170;
const PADDING = 12;

/**
 * 트랙 좌표 → 미니맵 좌표 변환.
 * 출발 방향(+z)을 위로, 그리고 운전석에서 보이는 대로 +x를 왼쪽에 그린다.
 */
function projection(track: Track, size: number, padding: number) {
  const xs = track.samples.map((s) => -s.pos.x);
  const zs = track.samples.map((s) => s.pos.z);
  const minX = Math.min(...xs);
  const maxZ = Math.max(...zs);
  const scale = (size - padding * 2) / Math.max(Math.max(...xs) - minX, maxZ - Math.min(...zs));
  const offsetX = (size - (Math.max(...xs) - minX) * scale) / 2;
  const offsetY = (size - (maxZ - Math.min(...zs)) * scale) / 2;
  return (x: number, z: number): [number, number] => [offsetX + (-x - minX) * scale, offsetY + (maxZ - z) * scale];
}

export function drawTrackShape(ctx: CanvasRenderingContext2D, track: Track, size: number, padding: number, lineWidth: number) {
  const project = projection(track, size, padding);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  track.samples.forEach((s, i) => {
    const [x, y] = project(s.pos.x, s.pos.z);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.lineWidth = lineWidth + 4;
  ctx.stroke();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  // 출발선
  const [sx, sy] = project(track.samples[0].pos.x, track.samples[0].pos.z);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(sx - 4, sy - 2, 8, 4);
  return project;
}

/** 코스 선택 화면의 작은 코스 모양 */
export function TrackPreview({ track }: { track: Track }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawTrackShape(ctx, track, 140, 10, 4);
  }, [track]);
  return <canvas ref={ref} width={140} height={140} className="track-preview" />;
}

export function Minimap({ race }: { race: RaceState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 코스 모양은 한 번만 그려 두고 매 프레임 복사한다
  const background = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const project = drawTrackShape(canvas.getContext('2d')!, race.track, SIZE, PADDING, 5);
    return { canvas, project };
  }, [race.track]);

  useGameLoop(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(background.canvas, 0, 0);
    // 플레이어를 맨 위에 그리도록 마지막에
    const karts = [...race.karts].sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer));
    for (const k of karts) {
      const [x, y] = background.project(k.position.x, k.position.z);
      ctx.beginPath();
      ctx.arc(x, y, k.isPlayer ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = k.color;
      ctx.fill();
      ctx.lineWidth = k.isPlayer ? 2.5 : 1.5;
      ctx.strokeStyle = k.isPlayer ? '#ffffff' : '#0f172a';
      ctx.stroke();
    }
  });

  return <canvas ref={ref} width={SIZE} height={SIZE} className="minimap" />;
}
