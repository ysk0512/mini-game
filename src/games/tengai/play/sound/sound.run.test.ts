/// <reference types="node" />
/**
 * 사운드 실험: 이식본을 돌리며 사운드 명령을 사운드 보드에 넣고 WAV로 남긴다.
 *   TENGAI_SOUND_FRAMES=1800 TENGAI_SOUND_OUT=<파일.wav> npx vitest run sound.run
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spriteLutFrom } from '../../rom/parse';
import { SoundBoard } from './soundBoard';

const ASSETS = join(process.cwd(), 'public', 'tengai-assets');
const FRAMES = Number(process.env.TENGAI_SOUND_FRAMES ?? 0);
const OUT = process.env.TENGAI_SOUND_OUT ?? '';
const enabled = FRAMES > 0 && OUT !== '' && existsSync(join(ASSETS, 'samples.bin'));

/** 원작 화면 주사율 */
const FPS = 14_318_181 / 2 / 456 / 262;

function wav16(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true));
  return new Uint8Array(buf);
}

describe.skipIf(!enabled)('사운드 실험', () => {
  it('데모 화면 소리', async () => {
    const { TengaiRunner } = await import('../../port/machine');
    const cf = await import('../../port/generated/cfuncs');
    const pc = await import('../../port/generated/pcode');
    const bin = (n: string) => new Uint8Array(readFileSync(join(ASSETS, n)));
    const runner = new TengaiRunner(
      { prog: bin('prog.bin'), sprites: bin('sprites.bin'), spriteLut: spriteLutFrom(bin('spritelut.bin')), layers: bin('layers.bin') },
      { FUNCTIONS: cf.FUNCTIONS, PARAMS: cf.PARAMS, PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS },
    );
    const board = new SoundBoard(bin('sound-z80.bin'), bin('samples.bin'));
    runner.boot();
    const perFrame = board.sampleRate / FPS;
    const total = Math.floor(perFrame * FRAMES);
    const out = new Float32Array(total);
    let written = 0;
    let acc = 0;
    let gameMs = 0;
    let soundMs = 0;
    const cmds: string[] = [];
    for (let f = 0; f < FRAMES; f++) {
      let t = performance.now();
      runner.step();
      gameMs += performance.now() - t;
      for (const c of runner.m.soundCommands) {
        board.command(c);
        cmds.push(`${f} ${c.toString(16)}`);
      }
      acc += perFrame;
      const n = Math.min(Math.floor(acc), total - written);
      acc -= n;
      t = performance.now();
      board.render(out.subarray(written, written + n), n);
      soundMs += performance.now() - t;
      written += n;
    }
    writeFileSync(OUT, wav16(out, Math.round(board.sampleRate)));
    let peak = 0;
    for (const s of out) peak = Math.max(peak, Math.abs(s));
    console.log(`frames ${FRAMES}: game ${(gameMs / FRAMES).toFixed(2)} ms/frame, sound ${(soundMs / FRAMES).toFixed(2)} ms/frame, peak ${peak.toFixed(3)}, commands ${cmds.length}`);
    console.log(cmds.slice(0, 30).join(' | '));
    expect(written).toBe(total);
  }, 600_000);
});
