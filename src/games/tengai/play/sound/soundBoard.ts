import { Z80 } from './z80';
import { Ymf278b, YMF278B_SAMPLE_RATE } from './ymf278b';

/** 사운드 CPU 클록 (MAME s1945: 16MHz/2) */
const Z80_CLOCK = 8_000_000;
const Z80_CYCLES_PER_SAMPLE = Z80_CLOCK / YMF278B_SAMPLE_RATE;

/**
 * 텐가이 사운드 보드: Z80(LZ8420M) + YMF278B, 메인 CPU와는 8비트 래치 하나로 통신한다.
 *   메모리: 0000-7FFF ROM, 8000-81FF RAM, 8200-FFFF 뱅크 ROM (base+0x200+bank*0x8000)
 *   포트:   00 뱅크(비트 4-5), 08-0D YMF278B, 10 래치 읽기, 18 래치 확인(ack)
 *   래치에 값이 들어오면 NMI, YMF278B 타이머는 IRQ.
 */
export class SoundBoard {
  readonly sampleRate = YMF278B_SAMPLE_RATE;
  private z80: Z80;
  private ymf: Ymf278b;
  private ram = new Uint8Array(0x200);
  private bank = 0;
  private latch = 0;
  private pending = false;
  private queue: number[] = [];

  constructor(private rom: Uint8Array, samples: Uint8Array) {
    this.ymf = new Ymf278b(samples);
    this.z80 = new Z80({
      read: (a) => this.read(a),
      write: (a, v) => this.write(a, v),
      input: (p) => this.input(p & 0xff),
      output: (p, v) => this.output(p & 0xff, v),
    });
    this.ymf.onIrq = (s) => (this.z80.irqLine = s);
    this.z80.reset();
  }

  private read(a: number): number {
    if (a < 0x8000) return this.rom[a];
    if (a < 0x8200) return this.ram[a - 0x8000];
    return this.rom[(0x200 + this.bank * 0x8000 + (a - 0x8200)) % this.rom.length];
  }

  private write(a: number, v: number) {
    if (a >= 0x8000 && a < 0x8200) this.ram[a - 0x8000] = v;
  }

  private input(p: number): number {
    if (p >= 0x08 && p <= 0x0d) return this.ymf.read(p - 0x08);
    if (p === 0x10) return this.latch;
    return 0xff;
  }

  private output(p: number, v: number) {
    if (p === 0x00) this.bank = (v >> 4) & 3;
    else if (p >= 0x08 && p <= 0x0d) this.ymf.write(p - 0x08, v);
    else if (p === 0x18) {
      // 확인 신호: 다음 명령을 넘길 수 있다
      this.pending = false;
      this.deliver();
    }
  }

  private deliver() {
    if (this.pending || this.queue.length === 0) return;
    this.latch = this.queue.shift()!;
    this.pending = true;
    this.z80.nmi();
  }

  /** 메인 CPU가 보낸 사운드 명령 */
  command(v: number) {
    this.queue.push(v & 0xff);
    // 너무 밀리면 오래된 것부터 버린다 (확인 신호가 오지 않는 이상 상황 대비)
    if (this.queue.length > 64) this.queue.splice(0, this.queue.length - 64);
    this.deliver();
  }

  /** 샘플 n개를 만들어 out에 [-1, 1] 범위로 채운다 */
  render(out: Float32Array, n = out.length) {
    for (let i = 0; i < n; i++) {
      // Z80은 넘친 사이클을 내부에서 다음 호출로 넘긴다
      this.z80.run(Z80_CYCLES_PER_SAMPLE);
      const s = this.ymf.generate();
      // MAME와 같은 크기 (16비트 기준)
      const v = s / 32768;
      out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }
}
