/// <reference types="node" />
/**
 * 디버깅: MAME 덤프 상태를 불러와 한 프레임을 돌리며 작업 RAM 쓰기를 순서대로 기록한다.
 *   TENGAI_WL_DUMP=<덤프 k-1> TENGAI_WL_NEXT=<덤프 k> TENGAI_WL_OUT=<출력> npx vitest run port.writes
 * 출력 한 줄: "<함수<호출자> <주소> <값>" (바이트 단위, 스택 제외). tengai/tools/wldiff.py로 MAME 기록과 비교한다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spriteLutFrom } from '../rom/parse';

const ASSETS = join(process.cwd(), 'public', 'tengai-assets');
const DUMP = process.env.TENGAI_WL_DUMP ?? '';
const OUT = process.env.TENGAI_WL_OUT ?? '';
const enabled = DUMP !== '' || OUT !== '';

/** 스택 줄에서 변환 함수 이름(f_xxxx, p_xxxx)을 찾는다 */
const FN_NAME = new RegExp('\\b([fp]_[0-9a-f]+) \\(');

describe.skipIf(!enabled)('쓰기 기록', () => {
  it('한 프레임', async () => {
    expect(DUMP !== '' && OUT !== '', 'both TENGAI_WL_DUMP and TENGAI_WL_OUT are required').toBe(true);
    expect(existsSync(DUMP), 'requested write-trace dump does not exist').toBe(true);
    const dump = new Uint8Array(readFileSync(DUMP));
    expect(dump.length, 'write-trace dump is truncated').toBeGreaterThanOrEqual(0x2c006);
    const { TengaiRunner } = await import('./machine');
    const cf = await import('./generated/cfuncs');
    const pc = await import('./generated/pcode');
    const runtime = await import('./runtime');
    const traceAddress = Number(process.env.TENGAI_WL_TRACE ?? 0);
    const trace: unknown[] = [];
    const pcodeFunctions = { ...pc.PCODE_FUNCTIONS };
    if (traceAddress) {
      const original = pcodeFunctions[traceAddress];
      if (!original) throw new Error(`no P-code function to trace: ${traceAddress.toString(16)}`);
      pcodeFunctions[traceAddress] = () => {
        const m = runtime.m;
        const argument = m.r32(m.sp + 4);
        const before = m.r16(0xfffe342c);
        const registers = Array.from({ length: 16 }, (_, i) => runtime.R.getUint32(i * 4));
        const data = Array.from({ length: 16 }, (_, i) => m.r16(argument + i * 2));
        original();
        trace.push({ argument, registers, data, spriteStart: before, spriteEnd: m.r16(0xfffe342c) });
      };
    }
    const bin = (n: string) => new Uint8Array(readFileSync(join(ASSETS, n)));
    const runner = new TengaiRunner(
      { prog: bin('prog.bin'), sprites: bin('sprites.bin'), spriteLut: spriteLutFrom(bin('spritelut.bin')), layers: bin('layers.bin') },
      { FUNCTIONS: cf.FUNCTIONS, PARAMS: cf.PARAMS, PCODE_FUNCTIONS: pcodeFunctions },
    );
    runner.boot();
    runner.loadDump(dump);
    trace.length = 0;
    // 다음 처리 경계 덤프(TENGAI_WL_NEXT)가 있으면 그 처리의 공회전 값과 추가 인터럽트 수를 쓴다
    let extra = 0;
    const next = process.env.TENGAI_WL_NEXT;
    if (next) {
      const n = new Uint8Array(readFileSync(next));
      expect(n.length, 'next write-trace dump is truncated').toBeGreaterThanOrEqual(0x2c006);
      runner.idleSpins = ((n[0x2c001] << 24) | (n[0x2c002] << 16) | (n[0x2c003] << 8) | n[0x2c004]) >>> 0;
      extra = n[0x2c005];
      runner.m.setInputBytes(n[0x95bb], n[0x95bd], n[0x95c3]);
    }
    const manifestPath = join(dirname(DUMP), 'capture.json');
    if (existsSync(manifestPath)) {
      const capture = JSON.parse(readFileSync(manifestPath, 'utf8'));
      for (const poke of capture.pokes ?? []) {
        expect(Number.isInteger(poke.address) && poke.address >= 0xfe0000 && poke.address < 0xffffff && poke.address % 2 === 0, 'invalid fixture address').toBe(true);
        expect(Number.isInteger(poke.value) && poke.value >= 0 && poke.value <= 0xffff, 'invalid fixture value').toBe(true);
        runner.m.w16(poke.address, poke.value);
      }
    }

    const m = runner.m;
    // 깊은 호출에서도 변환 함수 이름이 보이도록 스택을 넉넉히 남긴다
    Error.stackTraceLimit = 60;
    const lines: string[] = [];
    const where = () => {
      const st = String(new Error().stack).split(String.fromCharCode(10));
      const fns = st.map((l) => FN_NAME.exec(l)?.[1]).filter((x): x is string => !!x);
      return fns.length ? fns.slice(0, 2).join('<') : '?';
    };
    const log = (a: number, v: number, size: number) => {
      const addr = a & 0xffffff;
      if (addr < 0xfe0000 || (addr >= 0xff7000 && addr < 0xff8000)) return;
      const w = where();
      for (let i = 0; i < size; i++) lines.push(`${w} ${(addr + i).toString(16)} ${((v >>> ((size - 1 - i) * 8)) & 0xff).toString(16)}`);
    };
    const w8 = m.w8.bind(m);
    const w16 = m.w16.bind(m);
    // w32는 내부에서 w16을 두 번 부르므로 8·16비트 쓰기만 기록한다
    m.w8 = (a, v) => (log(a, v, 1), w8(a, v));
    m.w16 = (a, v) => (log(a, v, 2), w16(a, v));
    try {
      runner.step(extra);
    } finally {
      writeFileSync(OUT, lines.join('\n') + '\n');
      if (traceAddress) writeFileSync(`${OUT}.trace.json`, JSON.stringify(trace, null, 2));
    }
  }, 600_000);
});
