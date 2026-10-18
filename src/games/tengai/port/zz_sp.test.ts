/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { spriteLutFrom } from '../rom/parse';
import { R } from './runtime';
it('sp drift', async () => {
  const { TengaiRunner } = await import('./machine');
  const cf = await import('./generated/cfuncs');
  const pc = await import('./generated/pcode');
  const A = 'public/tengai-assets';
  const bin = (n: string) => new Uint8Array(readFileSync(join(A, n)));
  const runner = new TengaiRunner({ prog: bin('prog.bin'), sprites: bin('sprites.bin'), spriteLut: spriteLutFrom(bin('spritelut.bin')), layers: bin('layers.bin') }, { FUNCTIONS: cf.FUNCTIONS, PARAMS: cf.PARAMS, PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS });
  const D = 'D:/Projects/REA_example/tengai/capture/play2/';
  runner.loadDump(new Uint8Array(readFileSync(D + 'd003000.bin')));
  const m = runner.m;
  // 함수별 SP 변화 추적: m.call을 감싼다
  const call = m.call.bind(m);
  const leaks = new Map<number, number>();
  m.call = (addr: number, ...args: number[]) => {
    const before = R.getUint32(60);
    const r = call(addr, ...args);
    const d = R.getUint32(60) - before;
    if (d) leaks.set(addr, (leaks.get(addr) ?? 0) + 1);
    return r;
  };
  const sp0 = R.getUint32(60);
  for (let k = 3001; k <= 3050; k++) {
    const n = new Uint8Array(readFileSync(D + 'd' + String(k).padStart(6, '0') + '.bin'));
    m.setInputBytes(n[0x95bb], n[0x95bd], n[0x95c3]);
    runner.step();
  }
  console.log('sp drift', (R.getUint32(60) - sp0) | 0, 'leaky m.call targets', [...leaks].map(([a, c]) => a.toString(16) + 'x' + c).join(' '));
});
