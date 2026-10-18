import { audioContextIfEnabled, melody, playSound, type SoundEffect } from '../../shared/sound';
import type { RaceEvent } from './logic/race';

/** 아이템 룰렛: 짧은 틱이 점점 느려지다 '띵' */
const roulette = [
  ...Array.from({ length: 10 }, (_, i) => ({ type: 'square' as const, from: 1200, duration: 0.03, volume: 0.04, delay: i * 0.06 + i * i * 0.003 })),
  { type: 'triangle' as const, from: 1568, duration: 0.25, volume: 0.08, delay: 0.95 },
];

const EFFECTS: Partial<Record<RaceEvent, SoundEffect>> = {
  countdown: { tones: [{ type: 'square', from: 440, duration: 0.25, volume: 0.08 }] },
  go: { tones: [{ type: 'square', from: 880, duration: 0.6, volume: 0.09 }] },
  lap: { tones: melody('square', [784, 988, 1175], 0.1, 0.06) },
  finalLap: { tones: melody('square', [659, 784, 988, 1319, 988, 1319], 0.09, 0.07) },
  finish: { tones: melody('square', [523, 659, 784, 1047, 784, 1047, 1319], 0.13, 0.07) },
  itemGet: { tones: roulette },
  useItem: { noise: [{ duration: 0.18, volume: 0.15, from: 4000, to: 600 }] },
  boost: {
    tones: [{ type: 'sawtooth', from: 180, to: 720, duration: 0.45, volume: 0.06 }],
    noise: [{ duration: 0.4, volume: 0.1, from: 1500, to: 6000 }],
  },
  miniTurbo: { tones: [{ type: 'sawtooth', from: 260, to: 900, duration: 0.3, volume: 0.06 }] },
  driftStart: { noise: [{ duration: 0.12, volume: 0.08, from: 5000, to: 2500 }] },
  hit: { tones: [{ type: 'square', from: 600, to: 120, duration: 0.6, volume: 0.07 }] },
  hitOther: { tones: melody('triangle', [1319, 1760], 0.07, 0.07) },
  bump: { noise: [{ duration: 0.12, volume: 0.18, from: 900, to: 120 }] },
  respawn: { tones: melody('sine', [523, 784], 0.12, 0.07) },
};

export function playRaceSounds(events: RaceEvent[]) {
  for (const e of new Set(events)) {
    const effect = EFFECTS[e];
    if (effect) playSound(effect);
  }
}

/** 속도에 따라 높낮이가 바뀌는 엔진음 */
export class EngineSound {
  private nodes: { ctx: AudioContext; low: OscillatorNode; high: OscillatorNode; gain: GainNode } | null = null;

  update(speedRatio: number, boosting: boolean) {
    const ctx = audioContextIfEnabled();
    if (!ctx) {
      // 음소거되면 바로 조용히
      this.stop();
      return;
    }
    if (!this.nodes) {
      const low = ctx.createOscillator();
      const high = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      low.type = 'sawtooth';
      high.type = 'square';
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      gain.gain.value = 0;
      low.connect(filter);
      high.connect(filter);
      filter.connect(gain).connect(ctx.destination);
      low.start();
      high.start();
      this.nodes = { ctx, low, high, gain };
    }
    const { low, high, gain } = this.nodes;
    const now = ctx.currentTime;
    const base = 50 + Math.min(1.4, speedRatio) * 120 + (boosting ? 35 : 0);
    low.frequency.setTargetAtTime(base, now, 0.06);
    high.frequency.setTargetAtTime(base * 1.5, now, 0.06);
    gain.gain.setTargetAtTime(0.025 + Math.min(1, speedRatio) * 0.02, now, 0.1);
  }

  stop() {
    if (!this.nodes) return;
    const { ctx, low, high, gain } = this.nodes;
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    low.stop(ctx.currentTime + 0.3);
    high.stop(ctx.currentTime + 0.3);
    this.nodes = null;
  }
}
