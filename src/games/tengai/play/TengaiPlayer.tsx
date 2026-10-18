import { useEffect, useRef, useState } from 'react';
import type { TengaiRom } from '../rom/parse';
import { SCREEN_H, SCREEN_W } from '../video/psikyoVideo';
import { TengaiRunner } from '../port/machine';
import type { PlayerInput } from '../port/runtime';
import { MuteButton, toggleMuted } from '../../../shared/MuteButton';
import { frameInput, listenKeyboard, type KeyboardState } from './keyboard';
import { AudioOut } from './sound/audioOut';
import { SoundBoard } from './sound/soundBoard';

export interface GeneratedPort {
  FUNCTIONS: Record<number, (...a: number[]) => number | void>;
  PARAMS: Record<number, [number, number, boolean][]>;
  PCODE_FUNCTIONS: Record<number, () => void>;
}

/** 원작 화면 주사율 (MAME psikyo: 14.318181MHz/2, 456 x 262) */
const FRAME_SECONDS = 1 / (14_318_181 / 2 / 456 / 262);
/** 탭 전환 등으로 밀린 시간은 이만큼까지만 따라잡는다 */
const MAX_CATCH_UP = 4;

const emptyInput = (): PlayerInput => ({ up: false, down: false, left: false, right: false, b1: false, b2: false, b3: false, start: false });

interface Props {
  rom: TengaiRom;
  port: GeneratedPort;
}

/** 원작 로직 이식본을 60fps로 돌려 캔버스에 그린다 */
export function TengaiPlayer({ rom, port }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const image = ctx.createImageData(SCREEN_W, SCREEN_H);
    const pixels = new Uint32Array(image.data.buffer);

    let runner: TengaiRunner;
    try {
      runner = new TengaiRunner(rom, port);
      runner.boot();
    } catch (e) {
      setError(`부팅 실패: ${String(e)}`);
      return;
    }

    const keys: KeyboardState = { player: emptyInput(), coin: false, pulse: new Map() };
    const stop = listenKeyboard(keys, () => {
      pausedRef.current = !pausedRef.current;
      setPaused(pausedRef.current);
    });

    // 사운드: 원작 사운드 보드(Z80 + YMF278B)를 같이 돌린다. 브라우저 정책상 첫 입력 때 소리를 켠다
    const board = rom.soundCpu && rom.samples ? new SoundBoard(rom.soundCpu, rom.samples) : null;
    const audio = board ? new AudioOut(board.sampleRate) : null;
    const samplesPerFrame = board ? board.sampleRate * FRAME_SECONDS : 0;
    let sampleAcc = 0;
    const unlock = () => void audio?.start().catch((e) => console.warn('audio start failed', e));
    const onKeyM = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !e.repeat) toggleMuted();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', onKeyM);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;
    let fpsStart = last;
    let dead = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (dead) return;
      acc = Math.min(acc + (now - last) / 1000, FRAME_SECONDS * MAX_CATCH_UP);
      last = now;
      if (pausedRef.current) {
        acc = 0;
        return;
      }
      let stepped = false;
      try {
        while (acc >= FRAME_SECONDS) {
          acc -= FRAME_SECONDS;
          const m = runner.m;
          const input = frameInput(keys);
          m.p1 = input.player;
          m.coin1 = input.coin;
          // 원작은 VBLANK까지의 공회전 횟수를 난수에 섞는다. 실기처럼 매 프레임 조금씩 다르게 준다
          runner.idleSpins = 8000 + ((Math.random() * 3000) | 0);
          runner.step();
          frames++;
          stepped = true;
          if (board) {
            for (const c of m.soundCommands) board.command(c);
            sampleAcc += samplesPerFrame;
            const n = Math.floor(sampleAcc);
            sampleAcc -= n;
            const buf = new Float32Array(n);
            board.render(buf);
            audio!.push(buf);
          }
        }
        if (stepped) {
          pixels.set(runner.render().pixels);
          ctx.putImageData(image, 0, 0);
        }
      } catch (e) {
        dead = true;
        setError(`프레임 ${runner.frame}에서 멈춤: ${e instanceof Error ? e.message : String(e)}`);
        console.error(e);
      }
      if (now - fpsStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsStart)));
        frames = 0;
        fpsStart = now;
      }
    };
    raf = requestAnimationFrame(tick);

    // 다른 창으로 가면 자동 일시정지
    const onBlur = () => {
      pausedRef.current = true;
      setPaused(true);
    };
    window.addEventListener('blur', onBlur);

    return () => {
      cancelAnimationFrame(raf);
      stop();
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', onKeyM);
      audio?.close();
    };
  }, [rom, port]);

  return (
    <div className="tengai-player">
      <div className="tengai-screen">
        <canvas ref={canvasRef} className="tengai-pixel tengai-canvas" />
        {paused && !error && (
          <button
            type="button"
            className="tengai-overlay"
            onClick={() => {
              pausedRef.current = false;
              setPaused(false);
            }}
          >
            일시정지 · 클릭하거나 P를 누르면 계속
          </button>
        )}
        {error && <div className="tengai-overlay tengai-error">{error}</div>}
      </div>
      <p className="tengai-note">
        코인 <kbd>5</kbd>/<kbd>Shift</kbd> · 시작 <kbd>Enter</kbd> · 이동 방향키/WASD · 샷 <kbd>Z</kbd>(누르고 있으면 모아쏘기) · 폭탄 <kbd>X</kbd> · 일시정지 <kbd>P</kbd> · 소리 <kbd>M</kbd>
        <span className="tengai-fps">{fps} fps</span>
        <MuteButton />
      </p>
    </div>
  );
}
