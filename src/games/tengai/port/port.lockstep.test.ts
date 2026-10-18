/// <reference types="node" />
/**
 * 이식본과 MAME를 프레임 단위로 대조한다. tools/ramdump.lua 덤프 폴더를 줄 때만 돈다:
 *   TENGAI_LOCK_DIR=<폴더> npx vitest run port.lockstep
 * 게임 프레임 카운터(0xFFFE0004)가 같은 상태끼리 작업 RAM과 하드웨어 영역을 비교하고,
 * 처음 어긋난 프레임의 차이 주소를 보고한다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { spriteLutFrom, type TengaiRom } from '../rom/parse';
import { SCREEN_H, SCREEN_W } from '../video/psikyoVideo';

const ASSETS = join(process.cwd(), 'public', 'tengai-assets');
const DIR = process.env.TENGAI_LOCK_DIR ?? '';
const MAX = Number(process.env.TENGAI_LOCK_FRAMES ?? 100000);
/** 이 프레임 카운터의 MAME 상태에서 시작한다 (0이면 부팅부터) */
const START = Number(process.env.TENGAI_LOCK_START ?? 0);
const enabled = DIR !== '';
/** Optional evidence output: JSON summary and selected step screenshots. */
const OUT = process.env.TENGAI_LOCK_OUT ?? '';
const SHOTS = new Set((process.env.TENGAI_LOCK_SHOTS ?? '').split(',').filter(Boolean).map(Number));

const RAM = 0x20000;
/** 비교에서 뺄 RAM 구간 (오프셋, 0xFE0000 기준): 공회전 카운터, 보호칩 상태 비트가 섞인 입력 바이트, 스택 */
const IGNORE: [number, number][] = [
  [0x0000, 0x0004],
  [0x95c3, 0x95c4],
  [0x17000, 0x18000],
];
// Compute contiguous spans once; checking IGNORE.some for every byte dominates long captures.
const COMPARE_RAM: [number, number][] = [];
let cursor = 0;
for (const [lo, hi] of IGNORE) {
  if (cursor < lo) COMPARE_RAM.push([cursor, lo]);
  cursor = hi;
}
if (cursor < RAM) COMPARE_RAM.push([cursor, RAM]);

const r32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

describe.skipIf(!enabled)('MAME 대조', () => {
  it('프레임별 메모리 일치', async () => {
    expect(existsSync(DIR), 'requested dump directory does not exist').toBe(true);
    expect(Number.isInteger(START) && START >= 0, 'invalid start step').toBe(true);
    expect(Number.isInteger(MAX) && MAX > 0, 'invalid step limit').toBe(true);
    const { TengaiRunner } = await import('./machine');
    const cf = await import('./generated/cfuncs');
    const pc = await import('./generated/pcode');
    const bin = (n: string) => new Uint8Array(readFileSync(join(ASSETS, n)));
    const rom: TengaiRom = { prog: bin('prog.bin'), sprites: bin('sprites.bin'), spriteLut: spriteLutFrom(bin('spritelut.bin')), layers: bin('layers.bin') };
    const runner = new TengaiRunner(rom, { FUNCTIONS: cf.FUNCTIONS, PARAMS: cf.PARAMS, PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS });

    // 처리 경계 덤프 dNNNNNN.bin (tools/ramdump.lua): 순번 k = k번째 처리가 끝난 상태
    const path = (k: number) => join(DIR, `d${String(k).padStart(6, '0')}.bin`);
    const load = (k: number) => {
      const dump = new Uint8Array(readFileSync(path(k)));
      expect(dump.length, `dump ${k} is truncated`).toBeGreaterThanOrEqual(0x2c006);
      return dump;
    };
    const numbers = readdirSync(DIR).filter((n) => /^d\d{6}\.bin$/.test(n)).map((n) => Number(n.slice(1, 7)));
    const end = Math.min(START + MAX, numbers.reduce((a, b) => Math.max(a, b), -1));
    expect(end, 'no subsequent dump steps were found').toBeGreaterThan(START);
    const manifestPath = join(DIR, 'capture.json');
    const capture = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : undefined;
    if (OUT) mkdirSync(OUT, { recursive: true });

    const m = runner.m;
    if (START > 0) runner.loadDump(load(START));
    else runner.boot();
    const report: string[] = [];
    let resyncs = 0;
    let compared = 0;
    let last = START;
    const resyncedSteps: number[] = [];
    const evidence = (status: 'running' | 'passed' | 'failed', differences: string[] = []) => {
      if (OUT) writeFileSync(join(OUT, 'lockstep.json'), JSON.stringify({
        status, directory: DIR, capture, start: START, end: last, compared, resyncedSteps,
        ignoredRamOffsets: IGNORE, differences,
      }, null, 2));
    };
    evidence('running');
    for (let k = START + 1; k <= end; k++) {
      const after = load(k);
      last = k;
      runner.idleSpins = r32(after, 0x2c001);
      // 이 처리를 시작시킨 인터럽트가 읽어 RAM에 남긴 입력 (0xFE95BB P1, 0xFE95BD P2, 0xFE95C3 코인 등)
      m.setInputBytes(after[0x95bb], after[0x95bd], after[0x95c3]);
      const extra = after[0x2c005];
      runner.step(extra);
      const c = k;
      if (extra > 0) {
        // 처리 도중 인터럽트가 들어온 지연 프레임: 인터럽트 시점이 달라 난수 등이 어긋나므로 MAME 상태로 다시 맞춘다
        runner.loadDump(after);
        resyncs++;
        resyncedSteps.push(k);
        continue;
      }
      const diffs: string[] = [];
      for (const [lo, hi] of COMPARE_RAM) {
        for (let o = lo; o < hi && diffs.length < 40; o++) {
          if (m.ram[o] !== after[o]) diffs.push(`ram ${(0xfe0000 + o).toString(16)}: ours ${m.ram[o].toString(16)} mame ${after[o].toString(16)}`);
        }
      }
      const regions: [string, Uint8Array, number][] = [
        ['spr', m.video.spriteRam, RAM],
        ['pal', m.video.paletteRam, RAM + 0x2000],
        ['vram', m.video.vram, RAM + 0x4000],
      ];
      for (const [name, ours, base] of regions) {
        let n = 0;
        let first = -1;
        for (let i = 0; i < ours.length; i++) {
          if (ours[i] !== after[base + i]) {
            n++;
            if (first < 0) first = i;
          }
        }
        if (n) diffs.push(`${name}: ${n} bytes differ, first at +${first.toString(16)}`);
      }
      if (m.video.bankByte !== after[0x2c000]) {
        diffs.push(`bank: ours ${m.video.bankByte.toString(16)} mame ${after[0x2c000].toString(16)}`);
      }
      if (diffs.length) {
        report.push(`logic ${c} (extra irqs ${extra}):`, ...diffs);
        evidence('failed', diffs);
        throw new Error(report.join('\n'));
      }
      compared++;
      if (OUT && SHOTS.has(k)) {
        const target = runner.render();
        const png = new PNG({ width: SCREEN_W, height: SCREEN_H });
        for (let i = 0; i < target.pixels.length; i++) {
          const color = target.pixels[i];
          png.data.set([color & 255, (color >>> 8) & 255, (color >>> 16) & 255, 255], i * 4);
        }
        writeFileSync(join(OUT, `d${String(k).padStart(6, '0')}.png`), PNG.sync.write(png));
      }
      if (c % 100 === 0) {
        report.push(`logic ${c}: ok (resynced ${resyncs} lag frames so far)`);
        evidence('running');
      }
    }
    console.log(report.join('\n'));
    console.log(`Compared ${compared} steps through ${last}; resynchronized ${resyncs} lag steps (not compared).`);
    expect(compared, 'no comparable dump steps were found').toBeGreaterThan(0);
    evidence('passed');
  }, 600_000);
});
