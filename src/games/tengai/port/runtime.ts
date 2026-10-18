/**
 * 텐가이 이식 런타임: 원작 메모리 배치(68EC020, 24비트 주소)와 하드웨어 입출력을 흉내 낸다.
 *
 * 게임 로직은 원작 프로그램을 디컴파일해 옮긴 TypeScript 함수들(generated/)이고,
 * 이 모듈은 그 함수들이 읽고 쓰는 메모리·입출력·호출 규약만 제공한다.
 *
 *   0x000000-0x0FFFFF  프로그램 ROM
 *   0x400000-0x401FFF  스프라이트 RAM      ┐
 *   0x600000-0x601FFF  팔레트 RAM          ├ psikyoVideo의 VideoState와 같은 배열
 *   0x800000-0x807FFF  레이어 VRAM·레지스터 ┘
 *   0xC00000-0xC0001F  입력, DIP 스위치, 보호칩(MCU), 사운드 래치
 *   0xFE0000-0xFFFFFF  작업 RAM (스택 포함)
 */
import { createVideoState, type VideoState } from '../video/psikyoVideo';

/** Ghidra 68020 레지스터 공간 (P-code 변환 함수가 쓴다). 크기는 넉넉히 */
export const R = new DataView(new ArrayBuffer(4096));
/** 레지스터 오프셋 (Ghidra 68000 언어 정의) */
export const REG = { D0: 0, D1: 4, A0: 32, A1: 36, SP: 60, SR: 512 } as const;

type CFunc = (...a: number[]) => number | void;
type PFunc = () => void;
type Params = [offset: number, size: number, signed: boolean][];

/** 입력 상태 (눌림 = true). 하드웨어는 active low */
export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  b1: boolean;
  b2: boolean;
  b3: boolean;
  start: boolean;
}

const NO_INPUT: PlayerInput = { up: false, down: false, left: false, right: false, b1: false, b2: false, b3: false, start: false };

/** 기본 DIP: SW1 0xFF(1코인 1크레딧), SW2 0xFD(데모 사운드 켬, 보통 난이도, 3기, 보너스 600K) */
const DSW_DEFAULT = 0xfffd;
/** 지역 설정 0x0F = 일본 (tengaij) */
const REGION = 0x0f;

export class TengaiMachine {
  readonly rom: Uint8Array;
  readonly ram = new Uint8Array(0x20000);
  readonly video: VideoState = createVideoState();

  p1: PlayerInput = { ...NO_INPUT };
  p2: PlayerInput = { ...NO_INPUT };
  coin1 = false;
  coin2 = false;
  service = false;
  dsw = DSW_DEFAULT;

  /** 사운드 CPU로 보낸 명령 (프레임마다 비운다) */
  readonly soundCommands: number[] = [];

  // 보호칩(MCU) HLE — MAME s1945_state와 같은 동작 (tengai는 표가 없다)
  private mcuStatus = false;
  private mcuInlatch = 0xff;
  private mcuLatch1 = 0xff;
  private mcuLatch2 = 0xff;
  private mcuLatching = 0x5;
  private mcuControl = 0xff;
  private mcuDirection = 0;
  private mcuMode = 0;
  private mcuBctrl = 0;

  private cfuncs: Record<number, CFunc> = {};
  private pfuncs: Record<number, PFunc> = {};
  private params: Record<number, Params> = {};

  /** 메모리를 계속 폴링하는 대기 루프를 끊기 위한 카운터 (인터럽트 대신 VBLANK를 일으킨다) */
  pollBudget = Infinity;
  onPollExhausted: (() => void) | null = null;

  constructor(prog: Uint8Array) {
    this.rom = prog;
  }

  /**
   * 게임이 RAM에 저장하는 형식(눌림 = 1)의 입력 바이트로 입력 상태를 정한다 (MAME 대조용)
   * p1/p2: 위 0x80, 아래 0x40, 오른쪽 0x20, 왼쪽 0x10, 버튼1~3 0x08~0x02, 시작 0x01
   * sys: 코인1 0x01, 코인2 0x02, 서비스 0x10
   */
  setInputBytes(p1: number, p2: number, sys: number) {
    const dec = (v: number): PlayerInput => ({
      up: !!(v & 0x80), down: !!(v & 0x40), right: !!(v & 0x20), left: !!(v & 0x10),
      b1: !!(v & 0x08), b2: !!(v & 0x04), b3: !!(v & 0x02), start: !!(v & 0x01),
    });
    this.p1 = dec(p1);
    this.p2 = dec(p2);
    this.coin1 = !!(sys & 0x01);
    this.coin2 = !!(sys & 0x02);
    this.service = !!(sys & 0x10);
  }

  /** 저장된 상태를 불러올 때 타일 뱅크 레지스터(쓰기 전용)도 맞춘다 */
  restoreBankByte(v: number) {
    this.mcuBctrl = v;
    this.video.bankByte = v;
  }

  registerFunctions(cfuncs: Record<number, CFunc>, pfuncs: Record<number, PFunc>, params: Record<number, Params>) {
    this.cfuncs = cfuncs;
    this.pfuncs = pfuncs;
    this.params = params;
  }

  // ------------------------------------------------------------ 메모리

  r8(addr: number): number {
    const a = addr & 0xffffff;
    const page = a >>> 16;
    if (page >= 0xfe) return this.ram[a - 0xfe0000];
    if (page < 0x10) return this.rom[a];
    if (page === 0x40) return a < 0x402000 ? this.video.spriteRam[a - 0x400000] : 0;
    if (page === 0x60) return a < 0x602000 ? this.video.paletteRam[a - 0x600000] : 0;
    if (page === 0x80) return a < 0x808000 ? this.video.vram[a - 0x800000] : 0;
    if (page === 0xc0) return this.ioRead(a, 1);
    return 0;
  }

  r16(addr: number): number {
    const a = addr & 0xffffff;
    if (a >= 0xfe0000 && a < 0xffffff) {
      const o = a - 0xfe0000;
      return (this.ram[o] << 8) | this.ram[o + 1];
    }
    if (a >>> 16 === 0xc0) return this.ioRead(a, 2);
    return (this.r8(a) << 8) | this.r8(a + 1);
  }

  r32(addr: number): number {
    const a = addr & 0xffffff;
    if (a >= 0xfe0000 && a < 0xfffffd) {
      const o = a - 0xfe0000;
      const ram = this.ram;
      return ((ram[o] << 24) | (ram[o + 1] << 16) | (ram[o + 2] << 8) | ram[o + 3]) >>> 0;
    }
    if (a >>> 16 === 0xc0) return this.ioRead(a, 4);
    return ((this.r16(a) << 16) | this.r16(a + 2)) >>> 0;
  }

  r8s(a: number) {
    return (this.r8(a) << 24) >> 24;
  }
  r16s(a: number) {
    return (this.r16(a) << 16) >> 16;
  }
  r32s(a: number) {
    return this.r32(a) | 0;
  }

  w8(addr: number, v: number): void {
    const a = addr & 0xffffff;
    const page = a >>> 16;
    if (page >= 0xfe) {
      this.ram[a - 0xfe0000] = v;
      return;
    }
    if (page === 0x40) {
      if (a < 0x402000) this.video.spriteRam[a - 0x400000] = v;
      return;
    }
    if (page === 0x60) {
      if (a < 0x602000) this.video.paletteRam[a - 0x600000] = v;
      return;
    }
    if (page === 0x80) {
      if (a < 0x808000) this.video.vram[a - 0x800000] = v;
      return;
    }
    if (page === 0xc0) this.ioWrite(a, v & 0xff);
    // ROM과 매핑 없는 영역 쓰기는 무시
  }

  w16(addr: number, v: number): void {
    const a = addr & 0xffffff;
    if (a >= 0xfe0000 && a < 0xffffff) {
      const o = a - 0xfe0000;
      this.ram[o] = v >>> 8;
      this.ram[o + 1] = v;
      return;
    }
    this.w8(a, v >>> 8);
    this.w8(a + 1, v);
  }

  w32(addr: number, v: number): void {
    this.w16(addr, v >>> 16);
    this.w16(addr + 2, v);
  }

  // 대입 식용: 쓰고 그 값(해당 타입)을 돌려준다
  w8v(a: number, v: number) {
    this.w8(a, v);
    return v & 0xff;
  }
  w8vs(a: number, v: number) {
    this.w8(a, v);
    return (v << 24) >> 24;
  }
  w16v(a: number, v: number) {
    this.w16(a, v);
    return v & 0xffff;
  }
  w16vs(a: number, v: number) {
    this.w16(a, v);
    return (v << 16) >> 16;
  }
  w32v(a: number, v: number) {
    this.w32(a, v);
    return v >>> 0;
  }
  w32vs(a: number, v: number) {
    this.w32(a, v);
    return v | 0;
  }

  // ------------------------------------------------------------ 입출력

  private inputByte(p: PlayerInput): number {
    // 비트 7..0 = 위, 아래, 오른쪽, 왼쪽, 버튼1, 버튼2, 버튼3, 시작 (active low)
    let v = 0;
    if (p.up) v |= 0x80;
    if (p.down) v |= 0x40;
    if (p.right) v |= 0x20;
    if (p.left) v |= 0x10;
    if (p.b1) v |= 0x08;
    if (p.b2) v |= 0x04;
    if (p.b3) v |= 0x02;
    if (p.start) v |= 0x01;
    return ~v & 0xff;
  }

  /**
   * c00000-c00007은 MAME에서 32비트 핸들러 하나라서, 접근 한 번(바이트든 롱워드든)에 부수 효과도 한 번이다.
   *   c00000: P1 | P2 | 0xFF | 코인·상태 (MCU 상태 비트는 읽을 때마다 토글)
   *   c00004: SW1 | SW2 | MCU 래치 | (MCU bctrl 상위 니블 | 지역)
   */
  private ioPort32(a: number): number {
    if (a < 0xc00004) {
      // 0 코인1, 1 코인2, 2 MCU 상태(active high), 4 서비스1, 5 서비스 모드, 6 틸트, 7 사운드 래치 대기(active high, 항상 비어 있음)
      let low = 0x7b;
      if (this.coin1) low &= ~0x01;
      if (this.coin2) low &= ~0x02;
      if (this.service) low &= ~0x10;
      if (this.mcuStatus) low |= 0x04;
      this.mcuStatus = !this.mcuStatus;
      return ((this.inputByte(this.p1) << 24) | (this.inputByte(this.p2) << 16) | 0xff00 | low) >>> 0;
    }
    return ((((this.dsw & 0xffff) << 16) | REGION | this.mcuDataRead()) >>> 0);
  }

  private ioRead(a: number, size: 1 | 2 | 4): number {
    if (a < 0xc00008) {
      const word = this.ioPort32(a & ~3);
      const shift = (4 - (a & 3) - size) * 8;
      return size === 4 ? word : (word >>> shift) & (size === 1 ? 0xff : 0xffff);
    }
    if (a === 0xc00008) return this.mcuLatching | 0x08;
    return size === 1 ? 0xff : size === 2 ? 0xffff : 0xffffffff;
  }

  private mcuDataRead(): number {
    let res: number;
    if (this.mcuControl & 16) {
      res = this.mcuLatching & 4 ? 0xff00 : this.mcuLatch1 << 8;
      this.mcuLatching |= 4;
    } else {
      res = this.mcuLatching & 1 ? 0xff00 : this.mcuLatch2 << 8;
      this.mcuLatching |= 1;
    }
    return res | (this.mcuBctrl & 0xf0);
  }


  private ioWrite(a: number, v: number) {
    switch (a) {
      case 0xc00006:
        this.mcuInlatch = v;
        break;
      case 0xc00007:
        // 타일 뱅크: 비트 4-5 레이어0, 6-7 레이어1
        this.mcuBctrl = v;
        this.video.bankByte = v;
        break;
      case 0xc00008:
        this.mcuControl = v;
        break;
      case 0xc00009:
        this.mcuDirection = v;
        break;
      case 0xc0000b:
        this.mcuCommand(v);
        break;
      case 0xc00011:
        this.soundCommands.push(v);
        break;
    }
  }

  private mcuCommand(data: number) {
    switch (data | (this.mcuDirection ? 0x100 : 0)) {
      case 0x11c:
        this.mcuLatching = 5;
        break;
      case 0x013:
        // 표 읽기: tengai는 표가 없다
        this.mcuLatching = 1;
        break;
      case 0x113:
        this.mcuMode = this.mcuInlatch;
        if (this.mcuMode === 1) {
          this.mcuLatching &= ~1;
          this.mcuLatch2 = 0x55;
        } else {
          this.mcuLatching &= ~1;
          this.mcuLatching |= 2;
        }
        this.mcuLatching &= ~4;
        this.mcuLatch1 = this.mcuInlatch;
        break;
      case 0x010:
      case 0x110:
        this.mcuLatching |= 4;
        break;
    }
  }

  // ------------------------------------------------------------ 산술 도우미

  idiv(a: number, b: number) {
    return b === 0 ? 0 : Math.trunc(a / b) | 0;
  }
  imod(a: number, b: number) {
    return b === 0 ? 0 : (a % b) | 0;
  }
  udiv(a: number, b: number) {
    return b === 0 ? 0 : Math.floor((a >>> 0) / (b >>> 0)) >>> 0;
  }
  umod(a: number, b: number) {
    return b === 0 ? 0 : (a >>> 0) % (b >>> 0) >>> 0;
  }
  private mask(size: number) {
    return size >= 4 ? 0xffffffff : (1 << (size * 8)) - 1;
  }
  private sign(v: number, size: number) {
    const s = 32 - size * 8;
    return ((v << s) >> s);
  }
  shl(v: number, n: number, size: number) {
    if (n >= size * 8 || n >= 32) return 0;
    return size === 4 ? (v << n) >>> 0 : (v << n) & this.mask(size);
  }
  shr(v: number, n: number, size: number) {
    if (n >= 32) return 0;
    return (v >>> n) & this.mask(size);
  }
  sar(v: number, n: number, size: number) {
    const s = this.sign(v, size);
    const r = n >= 32 ? (s < 0 ? -1 : 0) : s >> n;
    return size === 4 ? r >>> 0 : r & this.mask(size);
  }
  carry(a: number, b: number, size: number) {
    const mk = this.mask(size);
    return (a & mk) + (b & mk) > mk ? 1 : 0;
  }
  scarry(a: number, b: number, size: number) {
    const r = this.sign(a, size) + this.sign(b, size);
    const lim = 2 ** (size * 8 - 1);
    return r >= lim || r < -lim ? 1 : 0;
  }
  sborrow(a: number, b: number, size: number) {
    const r = this.sign(a, size) - this.sign(b, size);
    const lim = 2 ** (size * 8 - 1);
    return r >= lim || r < -lim ? 1 : 0;
  }
  // C 변환 코드의 가변 시프트: 32 이상이면 0(또는 부호 채움). JS는 시프트 양을 5비트로 자르므로 따로 처리
  cshl(v: number, n: number) {
    return n >>> 0 >= 32 ? 0 : v << n;
  }
  cshr(v: number, n: number) {
    return n >>> 0 >= 32 ? 0 : v >>> n;
  }
  csar(v: number, n: number) {
    return n >>> 0 >= 32 ? (v < 0 ? -1 : 0) : v >> n;
  }

  /** 회전 결과의 N, C 플래그 (rotate 직후 읽는다) */
  rotN = 0;
  rotC = 0;
  /** 68k ror/rol: 회전량은 레지스터 값 mod 64, 실제 회전은 mod 크기. C = 마지막으로 밀려난 비트 */
  rotate(v: number, count: number, size: number, right: boolean): number {
    const bits = size * 8;
    const mk = this.mask(size);
    let x = v & mk;
    const n = count % bits;
    if (n) x = right ? ((x >>> n) | (x << (bits - n))) & mk : ((x << n) | (x >>> (bits - n))) & mk;
    x >>>= 0;
    this.rotN = (x >>> (bits - 1)) & 1;
    this.rotC = count === 0 ? 0 : right ? this.rotN : x & 1;
    return x;
  }

  popcount(v: number) {
    let c = 0;
    for (let x = v >>> 0; x; x &= x - 1) c++;
    return c;
  }

  // ------------------------------------------------------------ 스택과 호출

  get sp() {
    return R.getUint32(REG.SP);
  }
  set sp(v: number) {
    R.setUint32(REG.SP, v >>> 0);
  }

  /** C 변환 함수의 주소를 취하는 지역 변수용 스택 프레임 */
  enter(size: number): number {
    const fp = this.sp;
    this.sp = fp - size;
    return fp;
  }
  leave(size: number) {
    this.sp = this.sp + size;
  }

  /** C 변환 코드의 간접 호출 */
  call(addr: number, ...args: number[]): number {
    const a = addr & 0xffffff;
    const c = this.cfuncs[a];
    if (c) return (c(...args) ?? 0) >>> 0;
    if (this.pfuncs[a]) return this.callPcode(a, args);
    throw new Error(`call to unknown function ${a.toString(16)}`);
  }

  /** C 변환 코드 → P-code 함수: 인자를 스택에 쌓고 가짜 복귀 주소를 넣은 뒤 실행, D0를 돌려준다 */
  callPcode(addr: number, args: number[]): number {
    const p = this.pfuncs[addr];
    if (!p) throw new Error(`no pcode function ${addr.toString(16)}`);
    const layout = this.params[addr] ?? args.map((_, i): [number, number, boolean] => [4 + i * 4, 4, true]);
    const area = layout.reduce((end, [off, size]) => Math.max(end, off + size), 4) - 4;
    const frame = (area + 1) & ~1;
    const base = this.sp - frame - 4;
    layout.forEach(([off, size], i) => {
      const v = args[i] ?? 0;
      if (size === 1) this.w8(base + off, v);
      else if (size === 2) this.w16(base + off, v);
      else this.w32(base + off, v);
    });
    this.w32(base, 0xdeadbeef);
    this.sp = base;
    p();
    // P-code 함수는 rts로 복귀 주소를 꺼낸다
    this.sp = base + 4 + frame;
    return R.getUint32(REG.D0);
  }

  /** P-code 함수 안의 jsr/bsr: 복귀 주소는 이미 스택 위에 있다 */
  callFromPcode(addr: number) {
    const a = addr & 0xffffff;
    const p = this.pfuncs[a];
    if (p) {
      p();
      return;
    }
    const c = this.cfuncs[a];
    if (!c) throw new Error(`pcode call to unknown function ${a.toString(16)}`);
    const sp = this.sp;
    const layout = this.params[a] ?? [];
    const args = layout.map(([off, size, signed]) => {
      if (size === 1) return signed ? this.r8s(sp + off) : this.r8(sp + off);
      if (size === 2) return signed ? this.r16s(sp + off) : this.r16(sp + off);
      return signed ? this.r32s(sp + off) : this.r32(sp + off);
    });
    const r = c(...args);
    R.setUint32(REG.D0, (r ?? R.getUint32(REG.D0)) >>> 0);
    // C 함수가 rts 한 것처럼 복귀 주소를 꺼낸다
    this.sp = sp + 4;
  }

  /** P-code 함수 밖으로의 jmp/bra (꼬리 호출) */
  tailFromPcode(addr: number) {
    this.callFromPcode(addr);
  }

  /** 디컴파일이 깨진 지점에 도달했을 때 */
  bad(): never {
    throw new Error('reached undecodable code');
  }
}

/** 생성된 함수들이 참조하는 현재 머신 (한 번에 하나만 돌린다) */
export let m: TengaiMachine = null as unknown as TengaiMachine;

export function setMachine(machine: TengaiMachine) {
  m = machine;
}
