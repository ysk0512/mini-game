import { isMuted, subscribeMuted } from '../../../../shared/sound';

/** 링 버퍼 재생기 (AudioWorklet). 메인 스레드가 프레임마다 샘플 묶음을 보낸다 */
const WORKLET = `
class TengaiRing extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = [];
    this.off = 0;
    this.len = 0;
    this.max = sampleRate * 0.2;
    this.port.onmessage = (e) => {
      this.q.push(e.data);
      this.len += e.data.length;
      // 너무 쌓이면(탭 전환 뒤 등) 오래된 소리를 버려 지연을 줄인다
      while (this.len > this.max && this.q.length > 1) {
        const d = this.q.shift();
        this.len -= d.length - this.off;
        this.off = 0;
      }
    };
  }
  process(_inputs, outputs) {
    const ch = outputs[0];
    const out = ch[0];
    let i = 0;
    while (i < out.length && this.q.length) {
      const b = this.q[0];
      const n = Math.min(out.length - i, b.length - this.off);
      out.set(b.subarray(this.off, this.off + n), i);
      i += n;
      this.off += n;
      this.len -= n;
      if (this.off >= b.length) { this.q.shift(); this.off = 0; }
    }
    if (i < out.length) out.fill(0, i);
    for (let c = 1; c < ch.length; c++) ch[c].set(out);
    return true;
  }
}
registerProcessor('tengai-ring', TengaiRing);
`;

/** 사운드 보드 출력(44.1kHz 모노)을 브라우저로 내보낸다. 첫 사용자 입력 때 start()를 불러야 한다 */
export class AudioOut {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private starting: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private sampleRate: number) {}

  get ready() {
    return this.node !== null;
  }

  start(): Promise<void> {
    if (this.starting) return this.starting.then(() => void this.ctx?.resume());
    this.starting = (async () => {
      const ctx = new AudioContext({ sampleRate: this.sampleRate });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(ctx, 'tengai-ring', { outputChannelCount: [2] });
      const gain = ctx.createGain();
      gain.gain.value = isMuted() ? 0 : 1;
      node.connect(gain).connect(ctx.destination);
      this.unsubscribe = subscribeMuted(() => {
        gain.gain.value = isMuted() ? 0 : 1;
      });
      this.ctx = ctx;
      this.node = node;
      this.gain = gain;
      await ctx.resume();
    })();
    return this.starting;
  }

  /** 샘플 묶음을 보낸다 (소유권을 넘기므로 호출한 쪽은 버퍼를 다시 쓰지 않는다) */
  push(samples: Float32Array) {
    if (!this.node || this.ctx?.state !== 'running') return;
    this.node.port.postMessage(samples, [samples.buffer]);
  }

  close() {
    this.unsubscribe?.();
    this.node?.disconnect();
    this.gain?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.node = null;
  }
}
