/**
 * 디컴파일 결과를 그대로 쓸 수 없는 함수의 수동 이식본.
 * tools/c2ts.py에 수동 목록 파일을 주면 생성 코드가 이 모듈의 같은 이름 함수를 부른다.
 */
import { m } from './runtime';

/**
 * Task cleanup callback referenced by the ROM table at 0x1d1c4.
 * 0x1a2ea: JSR 0x15a06; JSR 0x15748; RTS.
 * This indirect-only entry was missing from the original Ghidra function list.
 */
export function f_1a2ea(): void {
  m.call(0x15a06);
  m.call(0x15748);
}

/** 0x5106: JSR 0x15a06; JSR 0x15a3e; RTS (script cleanup callback). */
export function f_5106(): void {
  m.call(0x15a06);
  m.call(0x15a3e);
}

/** Deferred layer upload callbacks, 0x5920/0x5940 (three stack arguments). */
function uploadLayer(target: number): void {
  const data = m.r32(0xfffe45a4);
  m.call(target, m.r32(data), m.r16s(data + 4), m.r16s(data + 6));
  m.w32(0xfffea6c4, 0);
}

export const EXTRA_FUNCTIONS = {
  0x1a2ea: f_1a2ea,
  0x5106: f_5106,
  0x5920: () => uploadLayer(0x1795e),
  0x5940: () => uploadLayer(0x180b8),
  // 0xe0f2..0xe11a: initialize the intro's row-scroll transition.
  0xe0f2: () => {
    m.call(0x189e0);
    m.call(0x18a4c, 0x100);
    m.call(0x18a62, 0x100);
    m.w16(0xfffe4d10, 0);
    m.w16(0xfffe4d12, 0);
  },
};
