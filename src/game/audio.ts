import type { GameEffect } from './RaceEngine';

export class RaceAudio {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) this.unlock();
  }

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) this.context = new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {
      // The game remains playable on browsers without Web Audio.
    }
  }

  play(effect: GameEffect) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const tone = (from: number, to: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    };

    switch (effect) {
      case 'start':
        tone(180, 500, 0.22, 0.08, 'sawtooth');
        tone(380, 680, 0.18, 0.04, 'sine', 0.1);
        break;
      case 'steer':
        tone(270, 190, 0.07, 0.025, 'triangle');
        break;
      case 'boost':
        tone(150, 580, 0.32, 0.065, 'sawtooth');
        tone(500, 900, 0.25, 0.035, 'sine');
        break;
      case 'pass':
        tone(460, 560, 0.06, 0.018, 'sine');
        break;
      case 'near':
        tone(620, 930, 0.12, 0.045, 'triangle');
        tone(930, 1250, 0.16, 0.035, 'sine', 0.07);
        break;
      case 'hit':
        tone(160, 42, 0.35, 0.13, 'sawtooth');
        tone(90, 35, 0.4, 0.1, 'square');
        break;
      case 'over':
        tone(310, 110, 0.45, 0.06, 'triangle');
        break;
    }
  }

  destroy() {
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  }
}