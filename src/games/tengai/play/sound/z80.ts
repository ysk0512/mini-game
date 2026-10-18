/**
 * Z80 인터프리터 (텐가이 사운드 CPU용). 공식 명령 전체 + 자주 쓰이는 비공식 명령(IXH/IXL, SLL 등).
 * 명령 디코딩은 "Decoding Z80 Opcodes"(x/y/z/p/q) 방식을 따른다.
 */
export interface Z80Bus {
  read(addr: number): number;
  write(addr: number, value: number): void;
  input(port: number): number;
  output(port: number, value: number): void;
}

const FS = 0x80, FZ = 0x40, FY = 0x20, FH = 0x10, FX = 0x08, FP = 0x04, FN = 0x02, FC = 0x01;

const SZ = new Uint8Array(256);
const SZP = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let p = i;
  p ^= p >> 4;
  p ^= p >> 2;
  p ^= p >> 1;
  SZ[i] = (i & 0x80) | (i === 0 ? FZ : 0) | (i & (FY | FX));
  SZP[i] = SZ[i] | ((p & 1) === 0 ? FP : 0);
}

/** 접두 없는 명령의 기본 T-state */
const CYCLES = [
  4, 10, 7, 6, 4, 4, 7, 4, 4, 11, 7, 6, 4, 4, 7, 4,
  8, 10, 7, 6, 4, 4, 7, 4, 12, 11, 7, 6, 4, 4, 7, 4,
  7, 10, 16, 6, 4, 4, 7, 4, 7, 11, 16, 6, 4, 4, 7, 4,
  7, 10, 13, 6, 11, 11, 10, 4, 7, 11, 13, 6, 4, 4, 7, 4,
  4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
  4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
  4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
  7, 7, 7, 7, 7, 7, 4, 7, 4, 4, 4, 4, 4, 4, 7, 4,
  4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
  4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
  4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
  4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
  5, 10, 10, 10, 10, 11, 7, 11, 5, 10, 10, 0, 10, 17, 7, 11,
  5, 10, 10, 11, 10, 11, 7, 11, 5, 4, 10, 11, 10, 0, 7, 11,
  5, 10, 10, 19, 10, 11, 7, 11, 5, 4, 10, 4, 10, 0, 7, 11,
  5, 10, 10, 4, 10, 11, 7, 11, 5, 6, 10, 4, 10, 0, 7, 11,
];

export class Z80 {
  a = 0xff; f = 0xff; b = 0; c = 0; d = 0; e = 0; h = 0; l = 0;
  a2 = 0; f2 = 0; b2 = 0; c2 = 0; d2 = 0; e2 = 0; h2 = 0; l2 = 0;
  ix = 0xffff; iy = 0xffff; sp = 0xffff; pc = 0;
  i = 0; r = 0; iff1 = false; iff2 = false; im = 0; halted = false;
  /** 레벨 인터럽트 선 (음원 칩 IRQ) */
  irqLine = false;
  private nmiPending = false;
  /** EI 직후 한 명령 동안 인터럽트를 받지 않는다 */
  private eiDelay = false;
  /** 현재 명령의 인덱스 레지스터 접두 (0 = HL, 1 = IX, 2 = IY) */
  private idx = 0;
  /** 남은 실행 사이클 (run 중) */
  private budget = 0;

  constructor(private bus: Z80Bus) {}

  reset() {
    this.pc = 0;
    this.iff1 = this.iff2 = false;
    this.im = 0;
    this.halted = false;
    this.i = this.r = 0;
    this.sp = 0xffff;
    this.a = this.f = 0xff;
  }

  /** NMI 신호 (가장자리 트리거) */
  nmi() {
    this.nmiPending = true;
  }

  /** 주어진 사이클만큼 실행. 넘친 사이클을 음수로 돌려 다음 호출에서 갚는다 */
  run(cycles: number): number {
    this.budget += cycles;
    while (this.budget > 0) {
      if (this.nmiPending) {
        this.nmiPending = false;
        this.halted = false;
        this.iff2 = this.iff1;
        this.iff1 = false;
        this.push(this.pc);
        this.pc = 0x66;
        this.budget -= 11;
        continue;
      }
      if (this.irqLine && this.iff1 && !this.eiDelay) {
        this.halted = false;
        this.iff1 = this.iff2 = false;
        if (this.im === 2) {
          this.push(this.pc);
          const v = (this.i << 8) | 0xff;
          this.pc = this.bus.read(v) | (this.bus.read((v + 1) & 0xffff) << 8);
          this.budget -= 19;
        } else {
          // IM 0에서 데이터 버스는 0xFF(RST 38h)로 본다
          this.push(this.pc);
          this.pc = 0x38;
          this.budget -= 13;
        }
        continue;
      }
      this.eiDelay = false;
      if (this.halted) {
        this.budget -= 4;
        continue;
      }
      this.budget -= this.step();
    }
    return this.budget;
  }

  // ---------------------------------------------------------- 메모리 도우미
  private rd(a: number) {
    return this.bus.read(a & 0xffff);
  }
  private wr(a: number, v: number) {
    this.bus.write(a & 0xffff, v & 0xff);
  }
  private fetch() {
    const v = this.bus.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }
  private fetch16() {
    const lo = this.fetch();
    return lo | (this.fetch() << 8);
  }
  private push(v: number) {
    this.sp = (this.sp - 1) & 0xffff;
    this.wr(this.sp, v >> 8);
    this.sp = (this.sp - 1) & 0xffff;
    this.wr(this.sp, v);
  }
  private pop() {
    const lo = this.rd(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    const hi = this.rd(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    return lo | (hi << 8);
  }

  // ---------------------------------------------------------- 레지스터 쌍
  get bc() { return (this.b << 8) | this.c; }
  set bc(v: number) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }
  get de() { return (this.d << 8) | this.e; }
  set de(v: number) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }
  get hl() { return (this.h << 8) | this.l; }
  set hl(v: number) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }
  get af() { return (this.a << 8) | this.f; }
  set af(v: number) { this.a = (v >> 8) & 0xff; this.f = v & 0xff; }

  /** 현재 접두에 따른 HL/IX/IY */
  private get xy() { return this.idx === 0 ? this.hl : this.idx === 1 ? this.ix : this.iy; }
  private set xy(v: number) {
    if (this.idx === 0) this.hl = v;
    else if (this.idx === 1) this.ix = v & 0xffff;
    else this.iy = v & 0xffff;
  }

  /** r 테이블: 0 B,1 C,2 D,3 E,4 H,5 L,6 (HL),7 A. 접두가 있으면 H/L은 IXH/IXL */
  private getR(r: number, mem?: number): number {
    switch (r) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return this.idx === 0 ? this.h : (this.xy >> 8) & 0xff;
      case 5: return this.idx === 0 ? this.l : this.xy & 0xff;
      case 6: return this.rd(mem!);
      default: return this.a;
    }
  }
  private setR(r: number, v: number, mem?: number) {
    v &= 0xff;
    switch (r) {
      case 0: this.b = v; break;
      case 1: this.c = v; break;
      case 2: this.d = v; break;
      case 3: this.e = v; break;
      case 4: if (this.idx === 0) this.h = v; else this.xy = (this.xy & 0xff) | (v << 8); break;
      case 5: if (this.idx === 0) this.l = v; else this.xy = (this.xy & 0xff00) | v; break;
      case 6: this.wr(mem!, v); break;
      default: this.a = v;
    }
  }
  /** (HL) 또는 (IX+d)/(IY+d) 주소. 접두가 있으면 변위를 읽는다 */
  private memAddr(): number {
    if (this.idx === 0) return this.hl;
    const d = (this.fetch() << 24) >> 24;
    return (this.xy + d) & 0xffff;
  }

  /** rp 테이블: 0 BC,1 DE,2 HL/IX/IY,3 SP */
  private getRP(p: number) {
    return p === 0 ? this.bc : p === 1 ? this.de : p === 2 ? this.xy : this.sp;
  }
  private setRP(p: number, v: number) {
    v &= 0xffff;
    if (p === 0) this.bc = v;
    else if (p === 1) this.de = v;
    else if (p === 2) this.xy = v;
    else this.sp = v;
  }
  /** rp2 테이블: 3 = AF */
  private getRP2(p: number) {
    return p === 3 ? this.af : this.getRP(p);
  }
  private setRP2(p: number, v: number) {
    if (p === 3) this.af = v & 0xffff;
    else this.setRP(p, v);
  }

  private cond(y: number): boolean {
    switch (y) {
      case 0: return !(this.f & FZ);
      case 1: return !!(this.f & FZ);
      case 2: return !(this.f & FC);
      case 3: return !!(this.f & FC);
      case 4: return !(this.f & FP);
      case 5: return !!(this.f & FP);
      case 6: return !(this.f & FS);
      default: return !!(this.f & FS);
    }
  }

  // ---------------------------------------------------------- 산술
  private add8(v: number, carry: number) {
    const a = this.a;
    const r = a + v + carry;
    this.f = SZ[r & 0xff] | ((a ^ v ^ r) & FH) | (((a ^ ~v) & (a ^ r) & 0x80) ? FP : 0) | (r > 0xff ? FC : 0);
    this.a = r & 0xff;
  }
  private sub8(v: number, carry: number, store = true) {
    const a = this.a;
    const r = a - v - carry;
    const f = (SZ[r & 0xff] & ~(FY | FX)) | (((store ? r : v) & (FY | FX))) | FN | ((a ^ v ^ r) & FH) | (((a ^ v) & (a ^ r) & 0x80) ? FP : 0) | (r < 0 ? FC : 0);
    this.f = f;
    if (store) this.a = r & 0xff;
  }
  private alu(y: number, v: number) {
    switch (y) {
      case 0: this.add8(v, 0); break;
      case 1: this.add8(v, this.f & FC); break;
      case 2: this.sub8(v, 0); break;
      case 3: this.sub8(v, this.f & FC); break;
      case 4: this.a &= v; this.f = SZP[this.a] | FH; break;
      case 5: this.a ^= v; this.f = SZP[this.a]; break;
      case 6: this.a = (this.a | v) & 0xff; this.f = SZP[this.a]; break;
      default: this.sub8(v, 0, false);
    }
  }
  private inc8(v: number) {
    const r = (v + 1) & 0xff;
    this.f = (this.f & FC) | SZ[r] | ((v & 0xf) === 0xf ? FH : 0) | (v === 0x7f ? FP : 0);
    return r;
  }
  private dec8(v: number) {
    const r = (v - 1) & 0xff;
    this.f = (this.f & FC) | SZ[r] | FN | ((v & 0xf) === 0 ? FH : 0) | (v === 0x80 ? FP : 0);
    return r;
  }
  private add16(a: number, b: number) {
    const r = a + b;
    this.f = (this.f & (FS | FZ | FP)) | (((a ^ b ^ r) >> 8) & FH) | ((r >> 8) & (FY | FX)) | (r > 0xffff ? FC : 0);
    return r & 0xffff;
  }
  private adc16(v: number) {
    const hl = this.hl;
    const r = hl + v + (this.f & FC);
    this.f = (((hl ^ r ^ v) >> 8) & FH) | (r > 0xffff ? FC : 0) | ((r >> 8) & (FS | FY | FX)) | ((r & 0xffff) === 0 ? FZ : 0) | (((v ^ hl ^ 0x8000) & (v ^ r) & 0x8000) ? FP : 0);
    this.hl = r & 0xffff;
  }
  private sbc16(v: number) {
    const hl = this.hl;
    const r = hl - v - (this.f & FC);
    this.f = (((hl ^ r ^ v) >> 8) & FH) | FN | (r < 0 ? FC : 0) | ((r >> 8) & (FS | FY | FX)) | ((r & 0xffff) === 0 ? FZ : 0) | (((v ^ hl) & (hl ^ r) & 0x8000) ? FP : 0);
    this.hl = r & 0xffff;
  }
  /** CB 회전/시프트: y = 0 RLC,1 RRC,2 RL,3 RR,4 SLA,5 SRA,6 SLL,7 SRL */
  private rot(y: number, v: number) {
    let r: number, c: number;
    switch (y) {
      case 0: c = v >> 7; r = ((v << 1) | c) & 0xff; break;
      case 1: c = v & 1; r = (v >> 1) | (c << 7); break;
      case 2: c = v >> 7; r = ((v << 1) | (this.f & FC)) & 0xff; break;
      case 3: c = v & 1; r = (v >> 1) | ((this.f & FC) << 7); break;
      case 4: c = v >> 7; r = (v << 1) & 0xff; break;
      case 5: c = v & 1; r = (v >> 1) | (v & 0x80); break;
      case 6: c = v >> 7; r = ((v << 1) | 1) & 0xff; break;
      default: c = v & 1; r = v >> 1;
    }
    this.f = SZP[r] | c;
    return r;
  }

  // ---------------------------------------------------------- 실행
  private step(): number {
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);
    this.idx = 0;
    let op = this.fetch();
    let extra = 0;
    // DD/FD 접두 (연속되면 마지막 것이 유효)
    while (op === 0xdd || op === 0xfd) {
      this.idx = op === 0xdd ? 1 : 2;
      extra += 4;
      op = this.fetch();
    }
    if (op === 0xcb) return extra + this.execCB();
    if (op === 0xed) {
      this.idx = 0;
      return extra + this.execED();
    }
    return extra + this.exec(op);
  }

  private exec(op: number): number {
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    let cyc = CYCLES[op];
    switch (x) {
      case 0:
        switch (z) {
          case 0:
            switch (y) {
              case 0: break; // NOP
              case 1: { // EX AF,AF'
                let t = this.a; this.a = this.a2; this.a2 = t;
                t = this.f; this.f = this.f2; this.f2 = t;
                break;
              }
              case 2: { // DJNZ
                const d = (this.fetch() << 24) >> 24;
                this.b = (this.b - 1) & 0xff;
                if (this.b !== 0) { this.pc = (this.pc + d) & 0xffff; cyc = 13; }
                break;
              }
              case 3: { const d = (this.fetch() << 24) >> 24; this.pc = (this.pc + d) & 0xffff; break; }
              default: {
                const d = (this.fetch() << 24) >> 24;
                if (this.cond(y - 4)) { this.pc = (this.pc + d) & 0xffff; cyc = 12; }
              }
            }
            break;
          case 1:
            if (q === 0) this.setRP(p, this.fetch16());
            else this.xy = this.add16(this.xy, this.getRP(p));
            break;
          case 2:
            if (q === 0) {
              if (p === 0) this.wr(this.bc, this.a);
              else if (p === 1) this.wr(this.de, this.a);
              else if (p === 2) { const a = this.fetch16(); this.wr(a, this.xy); this.wr(a + 1, this.xy >> 8); }
              else this.wr(this.fetch16(), this.a);
            } else {
              if (p === 0) this.a = this.rd(this.bc);
              else if (p === 1) this.a = this.rd(this.de);
              else if (p === 2) { const a = this.fetch16(); this.xy = this.rd(a) | (this.rd(a + 1) << 8); }
              else this.a = this.rd(this.fetch16());
            }
            break;
          case 3:
            this.setRP(p, this.getRP(p) + (q === 0 ? 1 : -1));
            break;
          case 4: case 5: {
            const mem = y === 6 ? this.memAddr() : 0;
            const v = this.getR(y, mem);
            this.setR(y, z === 4 ? this.inc8(v) : this.dec8(v), mem);
            if (y === 6 && this.idx) cyc += 8;
            break;
          }
          case 6: {
            const mem = y === 6 ? this.memAddr() : 0;
            this.setR(y, this.fetch(), mem);
            if (y === 6 && this.idx) cyc += 4;
            break;
          }
          default:
            switch (y) {
              case 0: { const c = this.a >> 7; this.a = ((this.a << 1) | c) & 0xff; this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 1: { const c = this.a & 1; this.a = (this.a >> 1) | (c << 7); this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 2: { const c = this.a >> 7; this.a = ((this.a << 1) | (this.f & FC)) & 0xff; this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 3: { const c = this.a & 1; this.a = (this.a >> 1) | ((this.f & FC) << 7); this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 4: this.daa(); break;
              case 5: this.a ^= 0xff; this.f = (this.f & (FS | FZ | FP | FC)) | FH | FN | (this.a & (FY | FX)); break;
              case 6: this.f = (this.f & (FS | FZ | FP)) | FC | (this.a & (FY | FX)); break;
              default: this.f = (this.f & (FS | FZ | FP)) | ((this.f & FC) ? FH : FC) | (this.a & (FY | FX));
            }
        }
        break;
      case 1:
        if (op === 0x76) {
          this.halted = true;
        } else if (y === 6 || z === 6) {
          // (HL)/(IX+d)가 끼면 다른 쪽 H/L은 접두와 무관한 진짜 H/L
          const mem = this.memAddr();
          const saved = this.idx;
          if (z === 6) { const v = this.rd(mem); this.idx = 0; this.setR(y, v); }
          else { this.idx = 0; const v = this.getR(z); this.wr(mem, v); }
          this.idx = saved;
          if (saved) cyc += 8;
        } else {
          this.setR(y, this.getR(z));
        }
        break;
      case 2: {
        const mem = z === 6 ? this.memAddr() : 0;
        this.alu(y, this.getR(z, mem));
        if (z === 6 && this.idx) cyc += 8;
        break;
      }
      default:
        switch (z) {
          case 0: if (this.cond(y)) { this.pc = this.pop(); cyc = 11; } break;
          case 1:
            if (q === 0) this.setRP2(p, this.pop());
            else switch (p) {
              case 0: this.pc = this.pop(); break;
              case 1: this.exx(); break;
              case 2: this.pc = this.xy; break;
              default: this.sp = this.xy;
            }
            break;
          case 2: { const a = this.fetch16(); if (this.cond(y)) this.pc = a; break; }
          case 3:
            switch (y) {
              case 0: this.pc = this.fetch16(); break;
              case 2: this.bus.output(this.fetch() | (this.a << 8), this.a); break;
              case 3: this.a = this.bus.input(this.fetch() | (this.a << 8)) & 0xff; break;
              case 4: { const v = this.rd(this.sp) | (this.rd(this.sp + 1) << 8); this.wr(this.sp, this.xy); this.wr(this.sp + 1, this.xy >> 8); this.xy = v; break; }
              case 5: { const t = this.de; this.de = this.hl; this.hl = t; break; }
              case 6: this.iff1 = this.iff2 = false; break;
              default: this.iff1 = this.iff2 = true; this.eiDelay = true;
            }
            break;
          case 4: { const a = this.fetch16(); if (this.cond(y)) { this.push(this.pc); this.pc = a; cyc = 17; } break; }
          case 5:
            if (q === 0) this.push(this.getRP2(p));
            else { const a = this.fetch16(); this.push(this.pc); this.pc = a; } // CALL nn (p=0)
            break;
          case 6: this.alu(y, this.fetch()); break;
          default: this.push(this.pc); this.pc = y * 8;
        }
    }
    return cyc;
  }

  private exx() {
    let t = this.b; this.b = this.b2; this.b2 = t;
    t = this.c; this.c = this.c2; this.c2 = t;
    t = this.d; this.d = this.d2; this.d2 = t;
    t = this.e; this.e = this.e2; this.e2 = t;
    t = this.h; this.h = this.h2; this.h2 = t;
    t = this.l; this.l = this.l2; this.l2 = t;
  }

  private daa() {
    let a = this.a;
    let corr = 0;
    let carry = this.f & FC;
    if ((this.f & FH) || (a & 0xf) > 9) corr |= 0x06;
    if (carry || a > 0x99) { corr |= 0x60; carry = FC; }
    const n = this.f & FN;
    const r = n ? (a - corr) & 0xff : (a + corr) & 0xff;
    const h = n ? ((this.f & FH) && (a & 0xf) < 6 ? FH : 0) : ((a & 0xf) > 9 ? FH : 0);
    a = r;
    this.a = a;
    this.f = SZP[a] | h | n | carry;
  }

  private execCB(): number {
    if (this.idx) {
      // DDCB d op / FDCB d op: 변위가 명령 앞에 온다
      const d = (this.fetch() << 24) >> 24;
      const mem = (this.xy + d) & 0xffff;
      const op = this.fetch();
      const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
      const v = this.rd(mem);
      if (x === 1) {
        this.f = (this.f & FC) | FH | (SZP[v & (1 << y)] & ~(FY | FX)) | ((mem >> 8) & (FY | FX));
        return 20;
      }
      const r = x === 0 ? this.rot(y, v) : x === 2 ? v & ~(1 << y) : v | (1 << y);
      this.wr(mem, r);
      if (z !== 6) { const saved = this.idx; this.idx = 0; this.setR(z, r); this.idx = saved; }
      return 23;
    }
    const op = this.fetch();
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    const mem = this.hl;
    const v = this.getR(z, mem);
    if (x === 1) {
      this.f = (this.f & FC) | FH | (SZP[v & (1 << y)] & ~(FY | FX)) | (v & (FY | FX));
      return z === 6 ? 12 : 8;
    }
    const r = x === 0 ? this.rot(y, v) : x === 2 ? v & ~(1 << y) : v | (1 << y);
    this.setR(z, r, mem);
    return z === 6 ? 15 : 8;
  }

  private execED(): number {
    const op = this.fetch();
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    if (x === 1) {
      switch (z) {
        case 0: { const v = this.bus.input(this.bc) & 0xff; if (y !== 6) this.setR(y, v); this.f = (this.f & FC) | SZP[v]; return 12; }
        case 1: this.bus.output(this.bc, y === 6 ? 0 : this.getR(y)); return 12;
        case 2: if (q === 0) this.sbc16(this.getRP(p)); else this.adc16(this.getRP(p)); return 15;
        case 3: {
          const a = this.fetch16();
          if (q === 0) { const v = this.getRP(p); this.wr(a, v); this.wr(a + 1, v >> 8); }
          else this.setRP(p, this.rd(a) | (this.rd(a + 1) << 8));
          return 20;
        }
        case 4: { const v = this.a; this.a = 0; this.sub8(v, 0); return 8; } // NEG
        case 5: this.pc = this.pop(); this.iff1 = this.iff2; return 14; // RETN/RETI
        case 6: this.im = [0, 0, 1, 2, 0, 0, 1, 2][y]; return 8;
        default:
          switch (y) {
            case 0: this.i = this.a; return 9;
            case 1: this.r = this.a; return 9;
            case 2: this.a = this.i; this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FP : 0); return 9;
            case 3: this.a = this.r; this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FP : 0); return 9;
            case 4: { // RRD
              const m = this.rd(this.hl);
              this.wr(this.hl, (m >> 4) | ((this.a & 0xf) << 4));
              this.a = (this.a & 0xf0) | (m & 0xf);
              this.f = (this.f & FC) | SZP[this.a];
              return 18;
            }
            case 5: { // RLD
              const m = this.rd(this.hl);
              this.wr(this.hl, ((m << 4) | (this.a & 0xf)) & 0xff);
              this.a = (this.a & 0xf0) | (m >> 4);
              this.f = (this.f & FC) | SZP[this.a];
              return 18;
            }
            default: return 8;
          }
      }
    }
    if (x === 2 && z <= 3 && y >= 4) return this.blockOp(y, z);
    return 8; // 정의되지 않은 ED 명령은 NOP 두 개
  }

  /** LDI/CPI/INI/OUTI 계열 (y: 4 증가, 5 감소, 6 증가 반복, 7 감소 반복) */
  private blockOp(y: number, z: number): number {
    const dir = y & 1 ? -1 : 1;
    const repeat = y >= 6;
    switch (z) {
      case 0: { // LD
        const v = this.rd(this.hl);
        this.wr(this.de, v);
        this.hl = this.hl + dir;
        this.de = this.de + dir;
        this.bc = this.bc - 1;
        const n = v + this.a;
        this.f = (this.f & (FS | FZ | FC)) | (this.bc ? FP : 0) | (n & FX) | ((n << 4) & FY);
        if (repeat && this.bc) { this.pc = (this.pc - 2) & 0xffff; return 21; }
        return 16;
      }
      case 1: { // CP
        const v = this.rd(this.hl);
        const r = (this.a - v) & 0xff;
        this.hl = this.hl + dir;
        this.bc = this.bc - 1;
        this.f = (this.f & FC) | (SZ[r] & ~(FY | FX)) | ((this.a ^ v ^ r) & FH) | FN | (this.bc ? FP : 0);
        if (repeat && this.bc && r !== 0) { this.pc = (this.pc - 2) & 0xffff; return 21; }
        return 16;
      }
      case 2: { // IN
        const v = this.bus.input(this.bc) & 0xff;
        this.wr(this.hl, v);
        this.hl = this.hl + dir;
        this.b = (this.b - 1) & 0xff;
        this.f = SZ[this.b] | FN;
        if (repeat && this.b) { this.pc = (this.pc - 2) & 0xffff; return 21; }
        return 16;
      }
      default: { // OUT
        const v = this.rd(this.hl);
        this.b = (this.b - 1) & 0xff;
        this.bus.output(this.bc, v);
        this.hl = this.hl + dir;
        this.f = SZ[this.b] | FN;
        if (repeat && this.b) { this.pc = (this.pc - 2) & 0xffff; return 21; }
        return 16;
      }
    }
  }
}
