// 텐가이 데이터 파일 만들기: 추출한 ROM 에셋 + 원작 프로그램 변환본을 zip 하나로 묶는다.
//   npm run tengai:pack [-- <출력 경로>]   (기본: tengai-pack.zip)
// 공개 사이트에는 원작 데이터가 없으므로, 이 파일을 브라우저에서 직접 골라 플레이한다.
// 원작 저작물이 들어 있으니 커밋하거나 남에게 주지 않는다 (.gitignore).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { zipSync } from 'fflate';

const root = process.cwd();
const assets = join(root, 'public', 'tengai-assets');
const generated = join(root, 'src', 'games', 'tengai', 'port', 'generated');
const out = process.argv[2] ?? join(root, 'tengai-pack.zip');

const ASSET_FILES = ['prog.bin', 'sprites.bin', 'spritelut.bin', 'layers.bin', 'sound-z80.bin', 'samples.bin'];
for (const f of ASSET_FILES) {
  if (!existsSync(join(assets, f))) throw new Error(`${f}가 없습니다. 먼저 npm run tengai:extract 를 실행하세요.`);
}

/** 변환본을 CommonJS로 묶는다. runtime/manual은 브라우저 쪽 모듈을 require로 넘겨받는다 */
async function bundle(name) {
  const input = join(generated, `${name}.ts`);
  if (!existsSync(input)) throw new Error(`${input}가 없습니다. tengai/tools/build_port.sh 로 먼저 생성하세요.`);
  const build = await rolldown({ input, external: ['../runtime', '../manual'], logLevel: 'silent' });
  const { output } = await build.generate({ format: 'cjs', minify: true });
  await build.close();
  return new TextEncoder().encode(output[0].code);
}

const files = {
  'pack.json': new TextEncoder().encode(JSON.stringify({ format: 1, created: new Date().toISOString() })),
  'cfuncs.js': await bundle('cfuncs'),
  'pcode.js': await bundle('pcode'),
};
for (const f of ASSET_FILES) files[f] = new Uint8Array(readFileSync(join(assets, f)));

const zip = zipSync(files, { level: 6 });
writeFileSync(out, zip);
console.log(`${out} (${(zip.length / 1024 / 1024).toFixed(1)}MB)`);
