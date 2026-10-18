/// <reference types="node" />
/**
 * 사운드 보드 검증: MAME가 기록한 사운드 명령(프레임 번호와 값)을 그대로 넣고, MAME 녹음과 음량 흐름을 비교한다.
 *   MAME: soundio.lua(TENGAI_PLAY=1) + -samplerate 44100 -wavwrite <wav>
 *   TENGAI_SOUND_CMDS=<명령 기록> TENGAI_SOUND_WAV=<MAME wav> [TENGAI_SOUND_OUT=<우리 wav>] npx vitest run sound.compare
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SoundBoard } from './soundBoard';

const ASSETS = join(process.cwd(), 'public', 'tengai-assets');
const CMDS = process.env.TENGAI_SOUND_CMDS ?? '';
const WAV = process.env.TENGAI_SOUND_WAV ?? '';
const OUT = process.env.TENGAI_SOUND_OUT ?? '';
const enabled = CMDS !== '' && WAV !== '' && existsSync(join(ASSETS, 'samples.bin'));

/** 원작 화면 주사율 */
const FPS = 14_318_181 / 2 / 456 / 262;

/** 16비트 PCM wav를 채널 평균 모노로 읽는다 */
function readWav(buf: Buffer): { rate: number; data: Float32Array } {
  let off = 12;
  let rate = 0;
  let channels = 1;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10);
      rate = buf.readUInt32LE(off + 12);
    } else if (id === 'data') {
      const n = Math.floor(size / 2 / channels);
      const data = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += buf.readInt16LE(off + 8 + (i * channels + c) * 2);
        data[i] = s / channels / 32768;
      }
      return { rate, data };
    }
    off += 8 + size + (size & 1);
  }
  throw new Error('wav data 없음');
}

function writeWav(path: string, samples: Float32Array, rate: number) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
  writeFileSync(path, buf);
}

/** 프레임 길이 창마다 RMS */
function envelope(data: Float32Array, rate: number): Float64Array {
  const win = rate / FPS;
  const n = Math.floor(data.length / win);
  const env = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const a = Math.floor(f * win);
    const b = Math.floor((f + 1) * win);
    for (let i = a; i < b; i++) s += data[i] * data[i];
    env[f] = Math.sqrt(s / (b - a));
  }
  return env;
}

function correlation(a: Float64Array, b: Float64Array, shift: number, from: number, to: number) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  for (let i = from; i < to; i++) {
    const j = i + shift;
    if (j < 0 || j >= b.length || i >= a.length) continue;
    sa += a[i]; sb += b[j]; saa += a[i] * a[i]; sbb += b[j] * b[j]; sab += a[i] * b[j]; n++;
  }
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  return { r: cov / Math.sqrt(va * vb), ratio: Math.sqrt(saa / sbb) };
}

describe.skipIf(!enabled)('사운드 보드 대 MAME', () => {
  it('같은 명령으로 같은 음량 흐름', () => {
    const bin = (n: string) => new Uint8Array(readFileSync(join(ASSETS, n)));
    const mame = readWav(readFileSync(WAV));
    const cmds = new Map<number, number[]>();
    let last = 0;
    for (const line of readFileSync(CMDS, 'utf8').split('\n')) {
      const m = /^cmd (\d+) ([0-9a-f]+)/.exec(line);
      if (!m) continue;
      const f = Number(m[1]);
      cmds.set(f, [...(cmds.get(f) ?? []), parseInt(m[2], 16)]);
      last = Math.max(last, f);
    }
    const board = new SoundBoard(bin('sound-z80.bin'), bin('samples.bin'));
    const frames = Math.min(Math.floor(mame.data.length / (mame.rate / FPS)), last + 600);
    const perFrame = board.sampleRate / FPS;
    const ours = new Float32Array(Math.floor(perFrame * frames));
    let written = 0;
    let acc = 0;
    for (let f = 0; f < frames; f++) {
      for (const c of cmds.get(f) ?? []) board.command(c);
      acc += perFrame;
      const n = Math.min(Math.floor(acc), ours.length - written);
      acc -= n;
      board.render(ours.subarray(written, written + n), n);
      written += n;
    }
    if (OUT) writeWav(OUT, ours, Math.round(board.sampleRate));

    const a = envelope(ours, board.sampleRate);
    const b = envelope(mame.data, mame.rate);
    // MAME 쪽 시작 지연을 찾는다 (±30프레임)
    let best = { shift: 0, r: -1, ratio: 0 };
    for (let s = -30; s <= 30; s++) {
      const c = correlation(a, b, s, 0, a.length);
      if (c.r > best.r) best = { shift: s, ...c };
    }
    console.log(`MAME ${mame.rate}Hz, ${frames}프레임, 명령 ${[...cmds.values()].flat().length}개, 지연 ${best.shift}프레임`);
    console.log(`전체: 상관 ${best.r.toFixed(3)}, 음량비(우리/MAME) ${best.ratio.toFixed(3)}`);
    const SPAN = 600;
    for (let from = 0; from < a.length; from += SPAN) {
      const c = correlation(a, b, best.shift, from, Math.min(a.length, from + SPAN));
      console.log(`  ${from}~${from + SPAN}: 상관 ${c.r.toFixed(3)}, 음량비 ${c.ratio.toFixed(3)}`);
    }
    expect(best.r).toBeGreaterThan(0.8);
  }, 600_000);
});
