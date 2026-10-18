// 텐가이 ROM(MAME 'tengai' 세트 zip)을 브라우저가 읽을 수 있는 형태로 풀어 public/tengai-assets/에 둔다.
// 원작 데이터이므로 이 폴더는 커밋하지 않는다(.gitignore). 개인 학습용.
//
// usage: npm run tengai:extract -- <Tengai.zip 경로>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public', 'tengai-assets');

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('usage: npm run tengai:extract -- <Tengai.zip 경로>');
  process.exit(1);
}

const entries = unzipSync(readFileSync(zipPath));
/** zip 안 파일 이름은 대소문자가 섞여 있을 수 있다 */
const byName = new Map(Object.entries(entries).map(([name, data]) => [name.toLowerCase(), data]));

function need(name, size) {
  const data = byName.get(name);
  if (!data) throw new Error(`zip에 ${name}이(가) 없습니다`);
  if (data.length !== size) throw new Error(`${name} 크기가 ${data.length}바이트입니다 (예상 ${size})`);
  return data;
}

const MB = 0x100000;
const u40 = need('2-u40.bin', MB / 2);
const u41 = need('3-u41.bin', MB / 2);

// 68EC020 프로그램: MAME ROM_LOAD32_WORD_SWAP. 두 ROM을 16비트씩 번갈아 놓고 각 워드의 바이트를 뒤집는다.
const prog = new Uint8Array(MB);
for (let i = 0; i < u40.length; i += 2) {
  const o = i * 2;
  prog[o] = u40[i + 1];
  prog[o + 1] = u40[i];
  prog[o + 2] = u41[i + 1];
  prog[o + 3] = u41[i];
}
const view = new DataView(prog.buffer);
const ssp = view.getUint32(0);
const resetPc = view.getUint32(4);
if (ssp !== 0xffff8000 || resetPc !== 0x80a) {
  throw new Error(`프로그램 벡터가 예상과 다릅니다 (SSP ${ssp.toString(16)}, PC ${resetPc.toString(16)}). 다른 버전의 덤프일 수 있습니다.`);
}

// 스프라이트 타일: u20, u22, u21 순서 (u21만 뒷부분이 비어 있음 = 마지막 뱅크)
const sprites = concat([need('u20.bin', 2 * MB), need('u22.bin', 2 * MB), need('u21.bin', 2 * MB)]);

const files = {
  'prog.bin': prog,
  'sprites.bin': sprites,
  'spritelut.bin': need('u1.bin', MB / 4),
  'layers.bin': need('u34.bin', 4 * MB),
  'sound-z80.bin': need('1-u63.bin', MB / 8),
  'samples.bin': concat([need('u61.bin', 2 * MB), need('u62.bin', 2 * MB)]),
};

mkdirSync(OUT, { recursive: true });
const manifest = { source: 'MAME tengai', files: {} };
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  manifest.files[name] = { size: data.length, sha1: createHash('sha1').update(data).digest('hex') };
  console.log(`${name.padEnd(14)} ${String(data.length).padStart(8)} bytes`);
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n→ ${OUT}`);

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
