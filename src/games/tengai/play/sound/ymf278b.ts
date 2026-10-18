/**
 * Yamaha YMF278B (OPL4) — FM(OPL3 호환, OPL4 레지스터) + 24채널 PCM 웨이브테이블.
 *
 * Aaron Giles의 ymfm(MAME가 쓰는 FM 코어)을 TypeScript로 옮긴 것이다.
 * 텐가이에 필요한 OPL4 경로만 남겼다.
 *
 * ---------------------------------------------------------------------------
 * ymfm: BSD 3-Clause License, Copyright (c) 2021, Aaron Giles. All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted
 * provided that the following conditions are met: (1) Redistributions of source code must retain the
 * above copyright notice, this list of conditions and the following disclaimer. (2) Redistributions in
 * binary form must reproduce the above copyright notice, this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided with the distribution. (3) Neither the
 * name of the copyright holder nor the names of its contributors may be used to endorse or promote
 * products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
 * WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY
 * DAMAGES ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE.
 * ---------------------------------------------------------------------------
 */

const bit = (v: number, start: number, len = 1) => (v >>> start) & ((1 << len) - 1);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// 엔벨로프 상태
const EG_ATTACK = 1, EG_DECAY = 2, EG_SUSTAIN = 3, EG_RELEASE = 4, EG_REVERB = 5;
const EG_STATES = 6;

// ------------------------------------------------------------- 공통 표

const SIN_TABLE = [
  0x859,0x6c3,0x607,0x58b,0x52e,0x4e4,0x4a6,0x471,0x443,0x41a,0x3f5,0x3d3,0x3b5,0x398,0x37e,0x365,
  0x34e,0x339,0x324,0x311,0x2ff,0x2ed,0x2dc,0x2cd,0x2bd,0x2af,0x2a0,0x293,0x286,0x279,0x26d,0x261,
  0x256,0x24b,0x240,0x236,0x22c,0x222,0x218,0x20f,0x206,0x1fd,0x1f5,0x1ec,0x1e4,0x1dc,0x1d4,0x1cd,
  0x1c5,0x1be,0x1b7,0x1b0,0x1a9,0x1a2,0x19b,0x195,0x18f,0x188,0x182,0x17c,0x177,0x171,0x16b,0x166,
  0x160,0x15b,0x155,0x150,0x14b,0x146,0x141,0x13c,0x137,0x133,0x12e,0x129,0x125,0x121,0x11c,0x118,
  0x114,0x10f,0x10b,0x107,0x103,0x0ff,0x0fb,0x0f8,0x0f4,0x0f0,0x0ec,0x0e9,0x0e5,0x0e2,0x0de,0x0db,
  0x0d7,0x0d4,0x0d1,0x0cd,0x0ca,0x0c7,0x0c4,0x0c1,0x0be,0x0bb,0x0b8,0x0b5,0x0b2,0x0af,0x0ac,0x0a9,
  0x0a7,0x0a4,0x0a1,0x09f,0x09c,0x099,0x097,0x094,0x092,0x08f,0x08d,0x08a,0x088,0x086,0x083,0x081,
  0x07f,0x07d,0x07a,0x078,0x076,0x074,0x072,0x070,0x06e,0x06c,0x06a,0x068,0x066,0x064,0x062,0x060,
  0x05e,0x05c,0x05b,0x059,0x057,0x055,0x053,0x052,0x050,0x04e,0x04d,0x04b,0x04a,0x048,0x046,0x045,
  0x043,0x042,0x040,0x03f,0x03e,0x03c,0x03b,0x039,0x038,0x037,0x035,0x034,0x033,0x031,0x030,0x02f,
  0x02e,0x02d,0x02b,0x02a,0x029,0x028,0x027,0x026,0x025,0x024,0x023,0x022,0x021,0x020,0x01f,0x01e,
  0x01d,0x01c,0x01b,0x01a,0x019,0x018,0x017,0x017,0x016,0x015,0x014,0x014,0x013,0x012,0x011,0x011,
  0x010,0x00f,0x00f,0x00e,0x00d,0x00d,0x00c,0x00c,0x00b,0x00a,0x00a,0x009,0x009,0x008,0x008,0x007,
  0x007,0x007,0x006,0x006,0x005,0x005,0x005,0x004,0x004,0x004,0x003,0x003,0x003,0x002,0x002,0x002,
  0x002,0x001,0x001,0x001,0x001,0x001,0x001,0x001,0x000,0x000,0x000,0x000,0x000,0x000,0x000,0x000,
];
function absSinAttenuation(input: number) {
  if (bit(input, 8)) input = ~input;
  return SIN_TABLE[input & 0xff];
}

const POWER_TABLE = (() => {
  const raw = [
    0x3fa,0x3f5,0x3ef,0x3ea,0x3e4,0x3df,0x3da,0x3d4,0x3cf,0x3c9,0x3c4,0x3bf,0x3b9,0x3b4,0x3ae,0x3a9,
    0x3a4,0x39f,0x399,0x394,0x38f,0x38a,0x384,0x37f,0x37a,0x375,0x370,0x36a,0x365,0x360,0x35b,0x356,
    0x351,0x34c,0x347,0x342,0x33d,0x338,0x333,0x32e,0x329,0x324,0x31f,0x31a,0x315,0x310,0x30b,0x306,
    0x302,0x2fd,0x2f8,0x2f3,0x2ee,0x2e9,0x2e5,0x2e0,0x2db,0x2d6,0x2d2,0x2cd,0x2c8,0x2c4,0x2bf,0x2ba,
    0x2b5,0x2b1,0x2ac,0x2a8,0x2a3,0x29e,0x29a,0x295,0x291,0x28c,0x288,0x283,0x27f,0x27a,0x276,0x271,
    0x26d,0x268,0x264,0x25f,0x25b,0x257,0x252,0x24e,0x249,0x245,0x241,0x23c,0x238,0x234,0x230,0x22b,
    0x227,0x223,0x21e,0x21a,0x216,0x212,0x20e,0x209,0x205,0x201,0x1fd,0x1f9,0x1f5,0x1f0,0x1ec,0x1e8,
    0x1e4,0x1e0,0x1dc,0x1d8,0x1d4,0x1d0,0x1cc,0x1c8,0x1c4,0x1c0,0x1bc,0x1b8,0x1b4,0x1b0,0x1ac,0x1a8,
    0x1a4,0x1a0,0x19c,0x199,0x195,0x191,0x18d,0x189,0x185,0x181,0x17e,0x17a,0x176,0x172,0x16f,0x16b,
    0x167,0x163,0x160,0x15c,0x158,0x154,0x151,0x14d,0x149,0x146,0x142,0x13e,0x13b,0x137,0x134,0x130,
    0x12c,0x129,0x125,0x122,0x11e,0x11b,0x117,0x114,0x110,0x10c,0x109,0x106,0x102,0x0ff,0x0fb,0x0f8,
    0x0f4,0x0f1,0x0ed,0x0ea,0x0e7,0x0e3,0x0e0,0x0dc,0x0d9,0x0d6,0x0d2,0x0cf,0x0cc,0x0c8,0x0c5,0x0c2,
    0x0be,0x0bb,0x0b8,0x0b5,0x0b1,0x0ae,0x0ab,0x0a8,0x0a4,0x0a1,0x09e,0x09b,0x098,0x094,0x091,0x08e,
    0x08b,0x088,0x085,0x082,0x07e,0x07b,0x078,0x075,0x072,0x06f,0x06c,0x069,0x066,0x063,0x060,0x05d,
    0x05a,0x057,0x054,0x051,0x04e,0x04b,0x048,0x045,0x042,0x03f,0x03c,0x039,0x036,0x033,0x030,0x02d,
    0x02a,0x028,0x025,0x022,0x01f,0x01c,0x019,0x016,0x014,0x011,0x00e,0x00b,0x008,0x006,0x003,0x000,
  ];
  return Uint16Array.from(raw, (a) => (a | 0x400) << 2);
})();
/** 5.8 고정소수점 로그 감쇠 → 13비트 선형 볼륨 */
function attenuationToVolume(input: number) {
  const sh = input >>> 8;
  return sh >= 32 ? 0 : POWER_TABLE[input & 0xff] >>> sh;
}

const INCREMENT_TABLE = Uint32Array.from([
  0x00000000, 0x00000000, 0x10101010, 0x10101010, 0x10101010, 0x10101010, 0x11101110, 0x11101110,
  0x10101010, 0x10111010, 0x11101110, 0x11111110, 0x10101010, 0x10111010, 0x11101110, 0x11111110,
  0x10101010, 0x10111010, 0x11101110, 0x11111110, 0x10101010, 0x10111010, 0x11101110, 0x11111110,
  0x10101010, 0x10111010, 0x11101110, 0x11111110, 0x10101010, 0x10111010, 0x11101110, 0x11111110,
  0x10101010, 0x10111010, 0x11101110, 0x11111110, 0x10101010, 0x10111010, 0x11101110, 0x11111110,
  0x10101010, 0x10111010, 0x11101110, 0x11111110, 0x10101010, 0x10111010, 0x11101110, 0x11111110,
  0x11111111, 0x21112111, 0x21212121, 0x22212221, 0x22222222, 0x42224222, 0x42424242, 0x44424442,
  0x44444444, 0x84448444, 0x84848484, 0x88848884, 0x88888888, 0x88888888, 0x88888888, 0x88888888,
]);
function attenuationIncrement(rate: number, index: number) {
  return (INCREMENT_TABLE[rate] >>> (4 * index)) & 0xf;
}

/** 직전 clockEnvelopeCommon 호출에서 실제로 엔벨로프가 클록됐는지 */
let envelopeClocked = false;

/** 공통 엔벨로프 클록 (FM 연산자와 PCM 채널이 같은 규칙을 쓴다). 새 감쇠값을 돌려준다 */
function clockEnvelopeCommon(state: number, att: number, rate: number, envCounter: number, attackGlitch: boolean): number {
  envelopeClocked = false;
  const rateShift = rate >>> 2;
  envCounter = (envCounter << rateShift) >>> 0;
  if (bit(envCounter, 0, 11) !== 0) return att;
  envelopeClocked = true;
  const relevant = bit(envCounter, rateShift <= 11 ? 11 : rateShift, 3);
  const inc = attenuationIncrement(rate, relevant);
  if (state === EG_ATTACK) {
    // C에서 ~att는 int로 승격되어 음수가 된다 (감쇠가 줄어든다). FM은 62/63 속도에서 증가하지 않는다
    if (!attackGlitch || rate < 62) att += (~att * inc) >> 4;
    return att & 0xffff;
  }
  att += inc;
  if (att >= 0x400) att = 0x3ff;
  return att;
}

// ------------------------------------------------------------- FM (OPL4 레지스터)

const FM_CHANNELS = 18;
const FM_OPERATORS = 36;
const FM_ALL = (1 << FM_CHANNELS) - 1;
const WAVEFORM_LENGTH = 0x400;
const EG_QUIET = 0x380;
const PHASE_STEP_DYNAMIC = 1;
const RHYTHM_CHANNEL = 0xff;
const STATUS_TIMERA = 0x40, STATUS_TIMERB = 0x20, STATUS_IRQ = 0x80;
const OPL4_PRESCALE = 19;

const FNUM_TO_ATTEN = [0, 24, 32, 37, 40, 43, 45, 47, 48, 50, 51, 52, 53, 54, 55, 56];
const PM_SCALE = [8, 4, 0, -4, -8, -4, 0, 4];
/** 알고리즘 표 (ymfm s_algorithm_ops) */
const ALG = (o2: number, o3: number, o4: number, a: number, b: number, c: number) => o2 | (o3 << 1) | (o4 << 4) | (a << 7) | (b << 8) | (c << 9);
const ALGORITHM_OPS = [
  ALG(1, 2, 3, 0, 0, 0), ALG(0, 5, 3, 0, 0, 0), ALG(0, 2, 6, 0, 0, 0), ALG(1, 0, 7, 0, 0, 0),
  ALG(1, 0, 3, 0, 1, 0), ALG(1, 1, 1, 0, 1, 1), ALG(1, 0, 0, 0, 1, 1), ALG(0, 0, 0, 1, 1, 1),
  ALG(1, 2, 3, 0, 0, 0), ALG(0, 2, 3, 1, 0, 0), ALG(1, 0, 3, 0, 1, 0), ALG(0, 2, 0, 1, 0, 1),
];

class OplRegs {
  regs = new Uint8Array(0x200);
  lfoAmCounter = 0;
  lfoPmCounter = 0;
  noiseLfsr = 1;
  lfoAm = 0;
  readonly waveforms: Uint16Array[] = [];

  constructor() {
    const wf = Array.from({ length: 8 }, () => new Uint16Array(WAVEFORM_LENGTH));
    for (let i = 0; i < WAVEFORM_LENGTH; i++) wf[0][i] = absSinAttenuation(i) | (bit(i, 9) << 15);
    const zero = wf[0][0];
    for (let i = 0; i < WAVEFORM_LENGTH; i++) {
      wf[1][i] = bit(i, 9) ? zero : wf[0][i];
      wf[2][i] = wf[0][i] & 0x7fff;
      wf[3][i] = bit(i, 8) ? zero : wf[0][i] & 0x7fff;
      wf[4][i] = bit(i, 9) ? zero : wf[0][(i * 2) & 0x3ff];
      wf[5][i] = bit(i, 9) ? zero : wf[0][(i * 2) & 0x1ff];
      wf[6][i] = bit(i, 9) << 15;
      wf[7][i] = ((bit(i, 9) ? i ^ 0x13ff : i) << 3) & 0xffff;
    }
    this.waveforms = wf;
  }

  reset() {
    this.regs.fill(0);
  }

  private byte(off: number, start: number, count: number, extra = 0) {
    return bit(this.regs[off + extra], start, count);
  }

  // 시스템 레지스터
  timerAValue() { return this.byte(0x02, 0, 8) * 4; }
  timerBValue() { return this.byte(0x03, 0, 8); }
  statusMask() { return this.byte(0x04, 0, 8) & 0x78; }
  irqReset() { return this.byte(0x04, 7, 1); }
  resetTimerB() { return this.byte(0x04, 7, 1) | this.byte(0x04, 5, 1); }
  resetTimerA() { return this.byte(0x04, 7, 1) | this.byte(0x04, 6, 1); }
  loadTimerB() { return this.byte(0x04, 1, 1); }
  loadTimerA() { return this.byte(0x04, 0, 1); }
  noteSelect() { return this.byte(0x08, 6, 1); }
  lfoAmDepth() { return this.byte(0xbd, 7, 1); }
  lfoPmDepth() { return this.byte(0xbd, 6, 1); }
  rhythmEnable() { return this.byte(0xbd, 5, 1); }
  newflag() { return this.byte(0x105, 0, 1); }
  new2flag() { return this.byte(0x105, 1, 1); }
  fouropEnable() { return this.byte(0x104, 0, 6); }

  // 채널
  chBlockFreq(ch: number) { return (this.byte(0xb0, 0, 5, ch) << 8) | this.byte(0xa0, 0, 8, ch); }
  chFeedback(ch: number) { return this.byte(0xc0, 1, 3, ch); }
  chAlgorithm(ch: number) { return this.byte(0xc0, 0, 1, ch) | 8 | (this.byte(0xc3, 0, 1, ch) << 1); }
  chOutput(ch: number, n: number) {
    if (this.newflag()) return this.byte(0xc0 + ch, 4 + n, 1);
    return n === 0 || n === 1 ? 1 : 0;
  }
  chOutputAny(ch: number) { return this.newflag() ? this.byte(0xc0 + ch, 4, 4) : 1; }

  // 연산자
  opLfoAm(op: number) { return this.byte(0x20, 7, 1, op); }
  opLfoPm(op: number) { return this.byte(0x20, 6, 1, op); }
  opEgSustain(op: number) { return this.byte(0x20, 5, 1, op); }
  opKsr(op: number) { return this.byte(0x20, 4, 1, op); }
  opMultiple(op: number) { return this.byte(0x20, 0, 4, op); }
  opKsl(op: number) { const t = this.byte(0x40, 6, 2, op); return bit(t, 1) | (bit(t, 0) << 1); }
  opTotalLevel(op: number) { return this.byte(0x40, 0, 6, op); }
  opAttackRate(op: number) { return this.byte(0x60, 4, 4, op); }
  opDecayRate(op: number) { return this.byte(0x60, 0, 4, op); }
  opSustainLevel(op: number) { return this.byte(0x80, 4, 4, op); }
  opReleaseRate(op: number) { return this.byte(0x80, 0, 4, op); }
  opWaveform(op: number) { return this.byte(0xe0, 0, this.newflag() ? 3 : 2, op); }

  /** 쓰기. 키온이면 [채널, 연산자 마스크]를 돌려준다 */
  write(index: number, data: number): [number, number] | null {
    if (index === 0x04 && bit(data, 7)) this.regs[index] |= 0x80;
    else this.regs[index] = data;
    if (index === 0xbd) return [RHYTHM_CHANNEL, bit(data, 5) ? bit(data, 0, 5) : 0];
    if ((index & 0xf0) === 0xb0) {
      let ch = index & 0x0f;
      if (ch < 9) {
        ch += 9 * bit(index, 8);
        return [ch, bit(data, 5) ? 15 : 0];
      }
    }
    return null;
  }

  clockNoiseAndLfo(): number {
    this.noiseLfsr = ((this.noiseLfsr << 1) | (bit(this.noiseLfsr, 23) ^ bit(this.noiseLfsr, 9) ^ bit(this.noiseLfsr, 8) ^ bit(this.noiseLfsr, 1))) >>> 0;
    const am = this.lfoAmCounter++;
    if (am >= 210 * 64 - 1) this.lfoAmCounter = 0;
    const shift = 9 - 2 * this.lfoAmDepth();
    this.lfoAm = ((am < 105 * 64 ? am : 210 * 64 + 63 - am) >>> shift) & 0xff;
    const pm = this.lfoPmCounter;
    this.lfoPmCounter = (this.lfoPmCounter + 1) & 0xffff;
    return PM_SCALE[bit(pm, 10, 3)] >> (this.lfoPmDepth() ^ 1);
  }

  noiseState() { return this.noiseLfsr >>> 23; }

  operatorMap(dest: number[]) {
    const ol = (a = 0xff, b = 0xff, c = 0xff, d = 0xff) => a | (b << 8) | (c << 16) | (d << 24);
    const f = this.fouropEnable();
    dest[0] = bit(f, 0) ? ol(0, 3, 6, 9) : ol(0, 3);
    dest[1] = bit(f, 1) ? ol(1, 4, 7, 10) : ol(1, 4);
    dest[2] = bit(f, 2) ? ol(2, 5, 8, 11) : ol(2, 5);
    dest[3] = bit(f, 0) ? ol() : ol(6, 9);
    dest[4] = bit(f, 1) ? ol() : ol(7, 10);
    dest[5] = bit(f, 2) ? ol() : ol(8, 11);
    dest[6] = ol(12, 15);
    dest[7] = ol(13, 16);
    dest[8] = ol(14, 17);
    dest[9] = bit(f, 3) ? ol(18, 21, 24, 27) : ol(18, 21);
    dest[10] = bit(f, 4) ? ol(19, 22, 25, 28) : ol(19, 22);
    dest[11] = bit(f, 5) ? ol(20, 23, 26, 29) : ol(20, 23);
    dest[12] = bit(f, 3) ? ol() : ol(24, 27);
    dest[13] = bit(f, 4) ? ol() : ol(25, 28);
    dest[14] = bit(f, 5) ? ol() : ol(26, 29);
    dest[15] = ol(30, 33);
    dest[16] = ol(31, 34);
    dest[17] = ol(32, 35);
  }
}

function effectiveRate(raw: number, ksr: number) {
  return raw === 0 ? 0 : Math.min(raw + ksr, 63);
}
function oplPhaseStep(blockFreq: number, multiple: number, lfoRawPm: number) {
  let fnum = bit(blockFreq, 0, 10) << 2;
  fnum += (lfoRawPm * bit(blockFreq, 7, 3)) >> 1;
  fnum &= 0xfff;
  const block = bit(blockFreq, 10, 3);
  const step = (fnum << block) >>> 2;
  return (step * multiple) >>> 1;
}

class FmOperator {
  choffs = 0;
  phase = 0;
  envAtt = 0x3ff;
  envState = EG_RELEASE;
  keyState = 0;
  keyonLive = 0;
  // 캐시
  waveform: Uint16Array;
  phaseStep = 0;
  totalLevel = 0;
  blockFreq = 0;
  multiple = 0;
  egSustain = 0;
  egRate = new Uint8Array(EG_STATES);

  constructor(private regs: OplRegs, readonly opoffs: number) {
    this.waveform = regs.waveforms[0];
  }

  reset() {
    this.phase = 0;
    this.envAtt = 0x3ff;
    this.envState = EG_RELEASE;
    this.keyState = 0;
    this.keyonLive = 0;
  }

  private cache() {
    const r = this.regs, op = this.opoffs, ch = this.choffs;
    this.waveform = r.waveforms[r.opWaveform(op) % 8];
    const bf = (this.blockFreq = r.chBlockFreq(ch));
    let keycode = bit(bf, 10, 3) << 1;
    keycode |= bit(bf, 9 - r.noteSelect(), 1);
    const mult = r.opMultiple(op);
    this.multiple = ((mult & 0xe) | bit(0xc2aa, mult)) * 2;
    if (this.multiple === 0) this.multiple = 1;
    this.phaseStep = r.opLfoPm(op) === 0 ? oplPhaseStep(bf, this.multiple, 0) : PHASE_STEP_DYNAMIC;
    this.totalLevel = r.opTotalLevel(op) << 3;
    const ksl = r.opKsl(op);
    if (ksl !== 0) this.totalLevel += Math.max(0, FNUM_TO_ATTEN[bit(bf, 6, 4)] - 8 * (bit(bf, 10, 3) ^ 7)) << ksl;
    let sl = r.opSustainLevel(op);
    sl |= (sl + 1) & 0x10;
    this.egSustain = sl << 5;
    const ksrval = keycode >>> (2 * (r.opKsr(op) ^ 1));
    this.egRate[EG_ATTACK] = effectiveRate(r.opAttackRate(op) * 4, ksrval);
    this.egRate[EG_DECAY] = effectiveRate(r.opDecayRate(op) * 4, ksrval);
    this.egRate[EG_SUSTAIN] = r.opEgSustain(op) ? 0 : effectiveRate(r.opReleaseRate(op) * 4, ksrval);
    this.egRate[EG_RELEASE] = effectiveRate(r.opReleaseRate(op) * 4, ksrval);
    this.egRate[0] = 0x3f;
  }

  prepare(): boolean {
    this.cache();
    this.clockKeystate(this.keyonLive !== 0 ? 1 : 0);
    this.keyonLive &= ~(1 << 2);
    return this.envState !== EG_RELEASE || this.envAtt < EG_QUIET;
  }

  private clockKeystate(ks: number) {
    if ((ks ^ this.keyState) !== 0) {
      this.keyState = ks;
      if (ks) this.startAttack();
      else if (this.envState < EG_RELEASE) this.envState = EG_RELEASE;
    }
  }

  private startAttack() {
    if (this.envState === EG_ATTACK) return;
    this.envState = EG_ATTACK;
    this.phase = 0;
    if (this.egRate[EG_ATTACK] >= 62) this.envAtt = 0;
  }

  keyonoff(on: number, type: number) {
    this.keyonLive = (this.keyonLive & ~(1 << type)) | ((on & 1) << type);
  }

  clock(envCounter: number, lfoRawPm: number) {
    if (bit(envCounter, 0, 2) === 0) {
      const ec = envCounter >>> 2;
      if (this.envState === EG_ATTACK && this.envAtt === 0) this.envState = EG_DECAY;
      if (this.envState === EG_DECAY && this.envAtt >= this.egSustain) this.envState = EG_SUSTAIN;
      this.envAtt = clockEnvelopeCommon(this.envState, this.envAtt, this.egRate[this.envState], ec, true);
    }
    let step = this.phaseStep;
    if (step === PHASE_STEP_DYNAMIC) step = oplPhaseStep(this.blockFreq, this.multiple, this.regs.opLfoPm(this.opoffs) ? lfoRawPm : 0);
    this.phase = (this.phase + step) >>> 0;
  }

  get phaseOut() {
    return this.phase >>> 10;
  }

  private envelopeAttenuation(amOffset: number) {
    let r = this.envAtt;
    if (this.regs.opLfoAm(this.opoffs)) r += amOffset;
    r += this.totalLevel;
    return Math.min(r, 0x3ff);
  }

  computeVolume(phase: number, amOffset: number) {
    if (this.envAtt > EG_QUIET) return 0;
    const sinAtt = this.waveform[phase & (WAVEFORM_LENGTH - 1)];
    const envAtt = this.envelopeAttenuation(amOffset) << 2;
    const result = attenuationToVolume((sinAtt & 0x7fff) + envAtt);
    return bit(sinAtt, 15) ? -result : result;
  }
}

/** int16 연산 (C의 int16_t 변수에 담는 효과) */
const s16 = (v: number) => (v << 16) >> 16;

class FmChannel {
  feedback0 = 0;
  feedback1 = 0;
  feedbackIn = 0;
  ops: (FmOperator | null)[] = [null, null, null, null];

  constructor(private regs: OplRegs, readonly choffs: number) {}

  reset() {
    this.feedback0 = this.feedback1 = this.feedbackIn = 0;
  }

  assign(i: number, op: FmOperator | null) {
    this.ops[i] = op;
    if (op) op.choffs = this.choffs;
  }

  keyonoff(states: number, type: number) {
    for (let i = 0; i < 4; i++) this.ops[i]?.keyonoff(bit(states, i), type);
  }

  prepare(): boolean {
    let active = false;
    for (let i = 0; i < 4; i++) if (this.ops[i] && this.ops[i]!.prepare()) active = true;
    return active;
  }

  clock(envCounter: number, lfoRawPm: number) {
    this.feedback0 = this.feedback1;
    this.feedback1 = this.feedbackIn;
    for (let i = 0; i < 4; i++) this.ops[i]?.clock(envCounter, lfoRawPm);
  }

  is4op() {
    return this.ops[2] !== null;
  }

  private addToOutput(out: Int32Array, value: number) {
    const r = this.regs, ch = this.choffs;
    if (r.chOutput(ch, 0)) out[0] += value;
    if (r.chOutput(ch, 1)) out[1] += value;
    if (r.chOutput(ch, 2)) out[2] += value;
    if (r.chOutput(ch, 3)) out[3] += value;
  }

  private op1Value(am: number) {
    let opmod = 0;
    const fb = this.regs.chFeedback(this.choffs);
    if (fb !== 0) opmod = (this.feedback0 + this.feedback1) >> (10 - fb);
    const v = this.ops[0]!.computeVolume(this.ops[0]!.phaseOut + opmod, am);
    this.feedbackIn = s16(v);
    return v;
  }

  output2op(out: Int32Array, rshift: number, clipmax: number) {
    const am = this.regs.lfoAm;
    const op1 = this.op1Value(am);
    if (this.regs.chOutputAny(this.choffs) === 0) return;
    let result: number;
    if (bit(this.regs.chAlgorithm(this.choffs), 0) === 0) {
      result = this.ops[1]!.computeVolume(this.ops[1]!.phaseOut + (op1 >> 1), am) >> rshift;
    } else {
      result = op1 >> rshift;
      result += this.ops[1]!.computeVolume(this.ops[1]!.phaseOut, am) >> rshift;
      result = clamp(result, -clipmax - 1, clipmax);
    }
    this.addToOutput(out, result);
  }

  output4op(out: Int32Array, rshift: number, clipmax: number) {
    const am = this.regs.lfoAm;
    const op1 = this.op1Value(am);
    if (this.regs.chOutputAny(this.choffs) === 0) return;
    const alg = ALGORITHM_OPS[this.regs.chAlgorithm(this.choffs)];
    const o = [0, s16(op1), 0, 0, 0, 0, 0, 0];
    o[2] = s16(this.ops[1]!.computeVolume(this.ops[1]!.phaseOut + (o[bit(alg, 0, 1)] >> 1), am));
    o[5] = s16(o[1] + o[2]);
    o[3] = s16(this.ops[2]!.computeVolume(this.ops[2]!.phaseOut + (o[bit(alg, 1, 3)] >> 1), am));
    o[6] = s16(o[1] + o[3]);
    o[7] = s16(o[2] + o[3]);
    let result = this.ops[3]!.computeVolume(this.ops[3]!.phaseOut + (o[bit(alg, 4, 3)] >> 1), am) >> rshift;
    const clipmin = -clipmax - 1;
    if (bit(alg, 7)) result = clamp(result + (o[1] >> rshift), clipmin, clipmax);
    if (bit(alg, 8)) result = clamp(result + (o[2] >> rshift), clipmin, clipmax);
    if (bit(alg, 9)) result = clamp(result + (o[3] >> rshift), clipmin, clipmax);
    this.addToOutput(out, result);
  }

  outputRhythm6(out: Int32Array, rshift: number) {
    const am = this.regs.lfoAm;
    const op1 = this.op1Value(am);
    const opmod = bit(this.regs.chAlgorithm(this.choffs), 0) ? 0 : op1 >> 1;
    const result = this.ops[1]!.computeVolume(this.ops[1]!.phaseOut + opmod, am) >> rshift;
    this.addToOutput(out, result * 2);
  }

  outputRhythm7(phaseSelect: number, out: Int32Array, rshift: number, clipmax: number) {
    const am = this.regs.lfoAm;
    const noise = bit(this.regs.noiseState(), 0);
    let phase = (phaseSelect << 9) | (0xd0 >> (2 * (noise ^ phaseSelect)));
    let result = this.ops[0]!.computeVolume(phase, am) >> rshift;
    const op13 = this.ops[0]!.phaseOut;
    phase = (0x100 << bit(op13, 8)) ^ (noise << 8);
    result += this.ops[1]!.computeVolume(phase, am) >> rshift;
    result = clamp(result, -clipmax - 1, clipmax);
    this.addToOutput(out, result * 2);
  }

  outputRhythm8(phaseSelect: number, out: Int32Array, rshift: number, clipmax: number) {
    const am = this.regs.lfoAm;
    let result = this.ops[0]!.computeVolume(this.ops[0]!.phaseOut, am) >> rshift;
    const phase = 0x100 | (phaseSelect << 9);
    result += this.ops[1]!.computeVolume(phase, am) >> rshift;
    result = clamp(result, -clipmax - 1, clipmax);
    this.addToOutput(out, result * 2);
  }
}

class FmEngine {
  readonly regs = new OplRegs();
  readonly channels: FmChannel[] = [];
  readonly operators: FmOperator[] = [];
  envCounter = 0;
  status = 0;
  irqMask = STATUS_TIMERA | STATUS_TIMERB;
  irqState = 0;
  timerRunning = [0, 0];
  totalClocks = 0;
  activeChannels = FM_ALL;
  modifiedChannels = FM_ALL;
  prepareCount = 0;
  private map: number[] = new Array(FM_CHANNELS).fill(0);

  constructor(private chip: Ymf278b) {
    for (let c = 0; c < FM_CHANNELS; c++) this.channels.push(new FmChannel(this.regs, (c % 9) + 0x100 * Math.floor(c / 9)));
    for (let o = 0; o < FM_OPERATORS; o++) {
      const r = o % 18;
      this.operators.push(new FmOperator(this.regs, r + 2 * Math.floor(r / 6) + 0x100 * Math.floor(o / 18)));
    }
    this.assignOperators();
  }

  reset() {
    this.setResetStatus(0, 0xff);
    this.regs.reset();
    this.write(0x04, 0);
    for (const c of this.channels) c.reset();
    for (const o of this.operators) o.reset();
  }

  private assignOperators() {
    this.regs.operatorMap(this.map);
    for (let c = 0; c < FM_CHANNELS; c++) {
      for (let i = 0; i < 4; i++) {
        const opnum = (this.map[c] >>> (8 * i)) & 0xff;
        this.channels[c].assign(i, opnum === 0xff ? null : this.operators[opnum]);
      }
    }
  }

  clock() {
    this.totalClocks = (this.totalClocks + 1) & 0xff;
    if (this.modifiedChannels !== 0 || this.prepareCount++ >= 4096) {
      this.assignOperators();
      this.activeChannels = 0;
      for (let c = 0; c < FM_CHANNELS; c++) if (this.channels[c].prepare()) this.activeChannels |= 1 << c;
      this.modifiedChannels = this.prepareCount = 0;
    }
    this.envCounter = (this.envCounter + 4) >>> 0;
    const pm = this.regs.clockNoiseAndLfo();
    for (let c = 0; c < FM_CHANNELS; c++) this.channels[c].clock(this.envCounter, pm);
  }

  output(out: Int32Array, rshift: number, clipmax: number) {
    const mask = this.activeChannels;
    if (this.regs.rhythmEnable()) {
      const op13 = this.operators[13].phaseOut;
      const op17 = this.operators[17].phaseOut;
      const ps = (bit(op13, 2) ^ bit(op13, 7)) | bit(op13, 3) | (bit(op17, 5) ^ bit(op17, 3));
      for (let c = 0; c < FM_CHANNELS; c++) {
        if (!bit(mask, c)) continue;
        const ch = this.channels[c];
        if (c === 6) ch.outputRhythm6(out, rshift);
        else if (c === 7) ch.outputRhythm7(ps, out, rshift, clipmax);
        else if (c === 8) ch.outputRhythm8(ps, out, rshift, clipmax);
        else if (ch.is4op()) ch.output4op(out, rshift, clipmax);
        else ch.output2op(out, rshift, clipmax);
      }
    } else {
      for (let c = 0; c < FM_CHANNELS; c++) {
        if (!bit(mask, c)) continue;
        const ch = this.channels[c];
        if (ch.is4op()) ch.output4op(out, rshift, clipmax);
        else ch.output2op(out, rshift, clipmax);
      }
    }
  }

  write(regnum: number, data: number) {
    if (regnum === 0x04) {
      this.modeWrite(data);
      return;
    }
    this.modifiedChannels = FM_ALL;
    const k = this.regs.write(regnum, data);
    if (!k) return;
    const [ch, mask] = k;
    if (ch < FM_CHANNELS) this.channels[ch].keyonoff(mask, 0);
    else if (ch === RHYTHM_CHANNEL) {
      this.channels[6].keyonoff(bit(mask, 4) ? 3 : 0, 1);
      this.channels[7].keyonoff(bit(mask, 0) | (bit(mask, 3) << 1), 1);
      this.channels[8].keyonoff(bit(mask, 2) | (bit(mask, 1) << 1), 1);
    }
  }

  statusValue() {
    return this.status & ~this.regs.statusMask();
  }

  setResetStatus(set: number, reset: number) {
    this.status = (this.status | set) & ~reset & 0xff;
    this.checkInterrupts();
  }

  private checkInterrupts() {
    const old = this.irqState;
    this.irqState = (this.status & this.irqMask & ~this.regs.statusMask()) !== 0 ? 1 : 0;
    if (this.irqState) this.status |= STATUS_IRQ;
    else this.status &= ~STATUS_IRQ;
    if (old !== this.irqState) this.chip.updateIrq(this.irqState !== 0);
  }

  private modeWrite(data: number) {
    this.modifiedChannels = FM_ALL;
    this.regs.write(0x04, data);
    if (this.regs.irqReset()) {
      this.setResetStatus(0, 0x78);
    } else {
      let resetMask = 0;
      if (this.regs.resetTimerB()) resetMask |= STATUS_TIMERB;
      if (this.regs.resetTimerA()) resetMask |= STATUS_TIMERA;
      this.setResetStatus(0, resetMask);
      this.updateTimer(1, this.regs.loadTimerB(), -(this.totalClocks & 15));
      this.updateTimer(0, this.regs.loadTimerA(), 0);
    }
  }

  private updateTimer(t: number, enable: number, delta: number) {
    if (enable && !this.timerRunning[t]) {
      let period = t === 0 ? 1024 - this.regs.timerAValue() : 16 * (256 - this.regs.timerBValue());
      period += delta;
      this.chip.setTimer(t, period * FM_OPERATORS * OPL4_PRESCALE);
      this.timerRunning[t] = 1;
    } else if (!enable) {
      this.chip.setTimer(t, -1);
      this.timerRunning[t] = 0;
    }
  }

  timerExpired(t: number) {
    this.setResetStatus(t === 0 ? STATUS_TIMERA : STATUS_TIMERB, 0);
    this.timerRunning[t] = 0;
    this.updateTimer(t, 1, 0);
  }
}

// ------------------------------------------------------------- PCM

const PCM_CHANNELS = 24;
const PCM_ALL = (1 << PCM_CHANNELS) - 1;
const PCM_EG_QUIET = 0x200;
const KEY_ON = 1, KEY_PENDING_ON = 2, KEY_PENDING = 4;
const LFO_STEPS = [1, 12, 19, 25, 31, 35, 37, 42];
const AM_DEPTHS = [0, 0x14, 0x20, 0x28, 0x30, 0x40, 0x50, 0x80];
const PM_DEPTHS = [0, 2, 3, 4, 6, 12, 24, 48];

class PcmChannel {
  baseaddr = 0;
  endpos = 0;
  looppos = 0;
  curpos = 0;
  nextpos = 0;
  lfoCounter = 0;
  egState = EG_RELEASE;
  envAtt = 0x3ff;
  totalLevel = 0x7f << 10;
  format = 0;
  keyState = 0;
  // 캐시
  step = 0;
  cTotalLevel = 0;
  panLeft = 0;
  panRight = 0;
  egSustain = 0;
  egRate = new Uint8Array(EG_STATES);
  lfoStep = 0;
  amDepth = 0;
  pmDepth = 0;

  constructor(private eng: PcmEngine, readonly ch: number) {}

  reset() {
    this.baseaddr = this.endpos = this.looppos = this.curpos = this.nextpos = this.lfoCounter = 0;
    this.egState = EG_RELEASE;
    this.envAtt = 0x3ff;
    this.totalLevel = 0x7f << 10;
    this.format = this.keyState = 0;
  }

  private reg(i: number) {
    return this.eng.regs[i + this.ch];
  }

  private cache() {
    const r20 = this.reg(0x20), r38 = this.reg(0x38), r68 = this.reg(0x68);
    const octave = ((bit(r38, 4, 4) << 28) >> 28);
    const fnum = bit(r20, 1, 7) | (bit(r38, 0, 3) << 7);
    // (0x400|fnum) << (octave+7) >> 2  (octave는 -8..7)
    const sh = octave + 7;
    this.step = sh >= 0 ? ((0x400 | fnum) << sh) >>> 2 : 0;
    this.cTotalLevel = bit(this.reg(0x50), 1, 7) << 10;
    const pan = ((bit(r68, 0, 4) << 28) >> 28);
    if (pan >= 0) {
      this.panLeft = pan === 7 ? 0x3ff : 0x20 * pan;
      this.panRight = 0;
    } else if (pan >= -7) {
      this.panLeft = 0;
      this.panRight = pan === -7 ? 0x3ff : -0x20 * pan;
    } else this.panLeft = this.panRight = 0x3ff;
    const r80 = this.reg(0x80);
    this.lfoStep = LFO_STEPS[bit(r80, 3, 3)];
    this.amDepth = AM_DEPTHS[bit(this.reg(0xe0), 0, 3)];
    this.pmDepth = PM_DEPTHS[bit(r80, 0, 3)];
    let sl = bit(this.reg(0xb0), 4, 4);
    sl |= (sl + 1) & 0x10;
    this.egSustain = sl << 5;
    let corr = bit(this.reg(0xc8), 4, 4);
    corr = corr === 15 ? 0 : (octave + corr) * 2 + bit(fnum, 9);
    const eff = (raw: number) => (raw === 0 ? 0 : raw === 15 ? 63 : clamp(raw * 4 + corr, 0, 63));
    this.egRate[EG_ATTACK] = eff(bit(this.reg(0x98), 4, 4));
    this.egRate[EG_DECAY] = eff(bit(this.reg(0x98), 0, 4));
    this.egRate[EG_SUSTAIN] = eff(bit(this.reg(0xb0), 0, 4));
    this.egRate[EG_RELEASE] = eff(bit(this.reg(0xc8), 0, 4));
    this.egRate[EG_REVERB] = 5;
    if (bit(r68, 6)) {
      this.egRate[EG_DECAY] = 48;
      this.egRate[EG_SUSTAIN] = 63;
      this.egRate[EG_RELEASE] = 63;
      this.egSustain = 0x80;
    }
  }

  prepare(): boolean {
    this.cache();
    if (this.keyState & KEY_PENDING) {
      const old = this.keyState;
      this.keyState = (this.keyState >> 1) & KEY_ON;
      if ((old ^ this.keyState) & KEY_ON) {
        if (this.keyState & KEY_ON) this.startAttack();
        else if (this.egState < EG_RELEASE) this.egState = EG_RELEASE;
      }
    }
    if (bit(this.reg(0x50), 0)) this.totalLevel = this.cTotalLevel;
    return this.egState < EG_RELEASE || this.envAtt < PCM_EG_QUIET;
  }

  private startAttack() {
    if (this.egState === EG_ATTACK) return;
    this.egState = EG_ATTACK;
    if (bit(this.reg(0x68), 5)) this.lfoCounter = 0;
    if (this.egRate[EG_ATTACK] === 63) this.envAtt = 0;
    this.curpos = this.nextpos = 0;
  }

  clock(envCounter: number) {
    this.lfoCounter = (this.lfoCounter + this.lfoStep) >>> 0;
    if (this.egState === EG_ATTACK && this.envAtt === 0) this.egState = EG_DECAY;
    if (this.egState === EG_DECAY && this.envAtt >= this.egSustain) this.egState = EG_SUSTAIN;
    this.envAtt = clockEnvelopeCommon(this.egState, this.envAtt, this.egRate[this.egState], envCounter, false);
    if (envelopeClocked && this.egState !== EG_ATTACK && this.envAtt >= 0xc0 && this.egState < EG_REVERB && bit(this.reg(0x38), 3)) this.egState = EG_REVERB;
    let step = this.step;
    if (this.pmDepth !== 0) {
      const sh = (this.lfoCounter + (1 << 16)) >>> 0;
      let v = bit(sh, 10, 7);
      if (bit(sh, 17)) v ^= 0x7f;
      v -= 0x40;
      step = (step + ((v * this.pmDepth) >> 7)) >>> 0;
    }
    this.curpos = this.nextpos;
    this.nextpos = (this.curpos + step) >>> 0;
    if (this.nextpos >= this.endpos) this.nextpos = (this.nextpos + this.looppos - this.endpos) >>> 0;
    if (this.totalLevel !== this.cTotalLevel) {
      if (this.totalLevel < this.cTotalLevel) this.totalLevel = Math.min(this.totalLevel + 19, this.cTotalLevel);
      else this.totalLevel = Math.max(this.totalLevel - 38, this.cTotalLevel);
    }
  }

  output(out: Int32Array) {
    let env = this.envAtt;
    if (env > PCM_EG_QUIET) return;
    if (this.amDepth !== 0) {
      let v = bit(this.lfoCounter, 10, 7);
      if (bit(this.lfoCounter, 17)) v ^= 0x7f;
      env += (v * this.amDepth) >> 7;
    }
    env += this.totalLevel >> 8;
    const lvol = attenuationToVolume(Math.min(env + this.panLeft, 0x3ff) << 2);
    const rvol = attenuationToVolume(Math.min(env + this.panRight, 0x3ff) << 2);
    const s = this.fetchSample();
    const n = bit(this.reg(0x68), 4) * 2;
    out[n] += (lvol * s) >> 15;
    out[n + 1] += (rvol * s) >> 15;
  }

  private fetchSample(): number {
    const rd = (a: number) => this.eng.read(a);
    let addr = this.baseaddr;
    const pos = this.curpos >>> 16;
    if (this.format === 0) return s16(rd(addr + pos) << 8);
    if (this.format === 2) {
      addr += pos * 2;
      return s16((rd(addr) << 8) | rd(addr + 1));
    }
    addr += (pos >>> 1) * 3;
    if ((pos & 1) === 0) return s16((rd(addr) << 8) | ((rd(addr + 1) << 4) & 0xf0));
    return s16((rd(addr + 2) << 8) | (rd(addr + 1) & 0xf0));
  }

  keyonoff(on: boolean) {
    this.keyState |= KEY_PENDING | (on ? KEY_PENDING_ON : 0);
  }

  loadWavetable() {
    const wavnum = this.reg(0x08) | (bit(this.reg(0x20), 0) << 8);
    let hdr = 12 * wavnum;
    if (wavnum >= 384) {
      const bank = bit(this.eng.regs[0x02], 2, 3);
      if (bank !== 0) hdr = 512 * 1024 * bank + (wavnum - 384) * 12;
    }
    const rd = (a: number) => this.eng.read(a);
    const b0 = rd(hdr);
    this.format = bit(b0, 6, 2);
    this.baseaddr = (bit(b0, 0, 6) << 16) | (rd(hdr + 1) << 8) | rd(hdr + 2);
    this.looppos = (((rd(hdr + 3) << 8) | rd(hdr + 4)) * 65536) >>> 0;
    this.endpos = ((-((rd(hdr + 5) << 8) | rd(hdr + 6))) * 65536) >>> 0;
    this.eng.write(0x80 + this.ch, rd(hdr + 7));
    this.eng.write(0x98 + this.ch, rd(hdr + 8));
    this.eng.write(0xb0 + this.ch, rd(hdr + 9));
    this.eng.write(0xc8 + this.ch, rd(hdr + 10));
    this.eng.write(0xe0 + this.ch, rd(hdr + 11));
    this.envAtt = 0x3ff;
  }
}

class PcmEngine {
  readonly regs = new Uint8Array(0x100);
  readonly channels: PcmChannel[] = [];
  envCounter = 0;
  modified = PCM_ALL;
  active = PCM_ALL;
  prepareCount = 0;

  constructor(private rom: Uint8Array) {
    for (let c = 0; c < PCM_CHANNELS; c++) this.channels.push(new PcmChannel(this, c));
  }

  read(addr: number) {
    return this.rom[addr & 0x3fffff] ?? 0;
  }

  reset() {
    this.regs.fill(0);
    this.regs[0xf8] = 0x1b;
    for (const c of this.channels) c.reset();
  }

  private memAddrAutoinc() {
    const r = this.regs;
    const a = (bit(r[3], 0, 6) << 16) | (r[4] << 8) | r[5];
    const n = a + 1;
    r[5] = n & 0xff;
    r[4] = (n >> 8) & 0xff;
    r[3] = (n >> 16) & 0x3f;
    return a;
  }

  clock() {
    if (this.modified !== 0 || this.prepareCount++ >= 4096) {
      this.active = 0;
      for (let c = 0; c < PCM_CHANNELS; c++) if (this.channels[c].prepare()) this.active |= 1 << c;
      this.modified = this.prepareCount = 0;
    }
    this.envCounter = (this.envCounter + 1) >>> 0;
    for (let c = 0; c < PCM_CHANNELS; c++) this.channels[c].clock(this.envCounter >>> 1);
  }

  output(out: Int32Array) {
    for (let c = 0; c < PCM_CHANNELS; c++) this.channels[c].output(out);
  }

  readReg(reg: number) {
    if (reg === 0x06 && bit(this.regs[2], 0)) return this.read(this.memAddrAutoinc());
    return this.regs[reg];
  }

  write(reg: number, data: number) {
    if (reg === 0x06 && bit(this.regs[2], 0)) {
      this.memAddrAutoinc(); // ROM만 있으므로 쓰기는 무시
      return;
    }
    this.modified = PCM_ALL;
    this.regs[reg] = data;
    if (reg >= 0x68 && reg <= 0x7f) this.channels[reg - 0x68].keyonoff(bit(data, 7) !== 0);
    else if (reg >= 0x08 && reg <= 0x1f) this.channels[reg - 0x08].loadWavetable();
  }
}

// ------------------------------------------------------------- 칩

const MIX_SCALE = [0x7fa, 0x5a4, 0x3fd, 0x2d2, 0x1fe, 0x169, 0xff, 0];
const FM_EXTRA_SAMPLE_THRESH = 171;
const FM_EXTRA_SAMPLE_STEP = 192 - FM_EXTRA_SAMPLE_THRESH;
/** 출력 샘플 하나 = 입력 클록(33.8688MHz) 768개 = 44.1kHz */
export const YMF278B_CLOCKS_PER_SAMPLE = 768;
export const YMF278B_SAMPLE_RATE = 33_868_800 / YMF278B_CLOCKS_PER_SAMPLE;

export class Ymf278b {
  private fm: FmEngine;
  private pcm: PcmEngine;
  private address = 0;
  private fmPos = 0;
  private loadRemaining = 0;
  private nextStatusId = false;
  /** 타이머 남은 입력 클록 (-1 = 꺼짐) */
  private timers = [-1, -1];
  irq = false;
  onIrq: ((state: boolean) => void) | null = null;
  private fmOut = new Int32Array(4);
  private pcmOut = new Int32Array(4);

  constructor(pcmRom: Uint8Array) {
    this.fm = new FmEngine(this);
    this.pcm = new PcmEngine(pcmRom);
    this.reset();
  }

  reset() {
    this.fm.reset();
    this.pcm.reset();
    this.nextStatusId = true;
  }

  updateIrq(state: boolean) {
    this.irq = state;
    this.onIrq?.(state);
  }

  setTimer(t: number, clocks: number) {
    this.timers[t] = clocks;
  }

  read(offset: number): number {
    switch (offset & 7) {
      case 0: {
        if (this.nextStatusId) {
          this.nextStatusId = false;
          return this.fm.regs.new2flag() ? 0x02 : this.fm.regs.newflag() ? 0x00 : 0x06;
        }
        let r = this.fm.statusValue();
        if (this.loadRemaining !== 0) r |= 0x02;
        if (!this.fm.regs.new2flag()) r &= ~0x03;
        return r;
      }
      case 5:
        if (bit(this.address, 9)) {
          let r = this.pcm.readReg(this.address & 0xff);
          if ((this.address & 0xff) === 0x02) r |= 0x20;
          return r;
        }
        return 0;
      default:
        return 0xff;
    }
  }

  write(offset: number, data: number) {
    switch (offset & 7) {
      case 0:
        this.address = data;
        break;
      case 1:
      case 3:
        if (bit(this.address, 9) === 0) {
          const old = this.fm.regs.new2flag();
          this.fm.write(this.address, data);
          if (old === 0 && this.fm.regs.new2flag() !== 0) this.nextStatusId = true;
        }
        break;
      case 2:
        this.address = data | 0x100;
        if (this.fm.regs.newflag() === 0 && this.address !== 0x105) this.address &= 0xff;
        break;
      case 4:
        this.address = data | 0x200;
        break;
      case 5:
        if (this.fm.regs.new2flag() === 0) return;
        if (bit(this.address, 9)) {
          const a = this.address & 0xff;
          this.pcm.write(a, data);
          if (a >= 0x08 && a <= 0x1f) this.loadRemaining = 13;
        }
        break;
    }
  }

  /** 입력 클록을 진행해 타이머를 처리한다 */
  private advanceTimers(clocks: number) {
    for (let t = 0; t < 2; t++) {
      if (this.timers[t] < 0) continue;
      this.timers[t] -= clocks;
      if (this.timers[t] <= 0) {
        const over = this.timers[t];
        this.timers[t] = -1;
        this.fm.timerExpired(t);
        if (this.timers[t] > 0) this.timers[t] += over;
      }
    }
  }

  /** 44.1kHz 샘플 하나를 만든다. 반환: 모노 합 (MAME처럼 6개 출력을 모두 섞는다) */
  generate(): number {
    const mixPcmL = MIX_SCALE[bit(this.pcm.regs[0xf9], 0, 3)];
    const mixPcmR = MIX_SCALE[bit(this.pcm.regs[0xf9], 3, 3)];
    const mixFmL = MIX_SCALE[bit(this.pcm.regs[0xf8], 0, 3)];
    const mixFmR = MIX_SCALE[bit(this.pcm.regs[0xf8], 3, 3)];

    this.fmPos += FM_EXTRA_SAMPLE_STEP;
    if (this.fmPos >= FM_EXTRA_SAMPLE_THRESH) {
      this.fm.clock();
      this.fmPos -= FM_EXTRA_SAMPLE_THRESH;
    }
    this.fm.clock();
    this.pcm.clock();

    const f = this.fmOut, p = this.pcmOut;
    f.fill(0);
    p.fill(0);
    this.fm.output(f, 0, 32767);
    this.pcm.output(p);

    const c16 = (v: number) => clamp(v, -32768, 32767);
    const out =
      c16(f[2]) + c16(f[3]) + c16(p[2]) + c16(p[3]) +
      c16((f[0] * mixFmL + p[0] * mixPcmL) >> 11) + c16((f[1] * mixFmR + p[1] * mixPcmR) >> 11);

    if (this.loadRemaining > 0) this.loadRemaining--;
    this.advanceTimers(YMF278B_CLOCKS_PER_SAMPLE);
    return out;
  }
}
