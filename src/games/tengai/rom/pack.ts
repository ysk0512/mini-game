import { unzipSync } from 'fflate';
import * as manual from '../port/manual';
import * as runtime from '../port/runtime';
import type { GeneratedPort } from '../play/TengaiPlayer';
import { spriteLutFrom, type TengaiRom } from './parse';

/**
 * 텐가이 데이터 파일 (npm run tengai:pack 이 만드는 zip).
 * 공개 사이트에는 원작 데이터가 없으므로 사용자가 가진 파일을 골라 브라우저(IndexedDB)에만 저장해 쓴다.
 */
export interface TengaiPack {
  rom: TengaiRom;
  port: GeneratedPort;
}

export class BadPackError extends Error {}

/** 변환본은 CommonJS로 묶여 있고 runtime/manual을 require 한다 */
function evalModule(code: string): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const require = (id: string) => {
    if (id === '../runtime') return runtime;
    if (id === '../manual') return manual;
    throw new BadPackError(`알 수 없는 모듈: ${id}`);
  };
  new Function('exports', 'require', code)(exports, require);
  return exports;
}

export function unpack(data: Uint8Array): TengaiPack {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new BadPackError('zip 파일이 아닙니다.');
  }
  const need = (name: string) => {
    const f = files[name];
    if (!f) throw new BadPackError(`텐가이 데이터 파일이 아닙니다 (${name} 없음).`);
    return f;
  };
  need('pack.json');
  const text = new TextDecoder();
  const cf = evalModule(text.decode(need('cfuncs.js')));
  const pc = evalModule(text.decode(need('pcode.js')));
  return {
    rom: {
      prog: need('prog.bin'),
      sprites: need('sprites.bin'),
      spriteLut: spriteLutFrom(need('spritelut.bin')),
      layers: need('layers.bin'),
      soundCpu: files['sound-z80.bin'],
      samples: files['samples.bin'],
    },
    port: {
      FUNCTIONS: cf.FUNCTIONS as GeneratedPort['FUNCTIONS'],
      PARAMS: cf.PARAMS as GeneratedPort['PARAMS'],
      PCODE_FUNCTIONS: pc.PCODE_FUNCTIONS as GeneratedPort['PCODE_FUNCTIONS'],
    },
  };
}

const DB = 'tengai';
const STORE = 'pack';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** 저장해 둔 데이터 파일 (없으면 null) */
export async function readStoredPack(): Promise<Uint8Array | null> {
  const buf = await withStore<ArrayBuffer | undefined>('readonly', (s) => s.get(KEY));
  return buf ? new Uint8Array(buf) : null;
}

export function storePack(data: Uint8Array): Promise<unknown> {
  return withStore('readwrite', (s) => s.put(data.slice().buffer, KEY));
}

export function clearStoredPack(): Promise<unknown> {
  return withStore('readwrite', (s) => s.delete(KEY));
}
