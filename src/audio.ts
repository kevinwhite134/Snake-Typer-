import type { Settings } from './storage.ts';

type Cue = 'correct' | 'error' | 'complete' | 'jump' | 'land' | 'death' | 'menu' | 'record' | 'tick' | 'stage';
type Note = [number, number, number, OscillatorType, number];

const CUES: Record<Cue, Note[]> = {
  correct: [[660, 820, 0.07, 'sine', 0.11]],
  error: [[170, 82, 0.16, 'triangle', 0.25]],
  complete: [[523, 610, 0.09, 'sine', 0.18], [784, 980, 0.15, 'triangle', 0.14]],
  jump: [[185, 490, 0.16, 'triangle', 0.12]],
  land: [[130, 58, 0.10, 'sine', 0.23]],
  death: [[230, 39, 0.38, 'sawtooth', 0.14], [80, 38, 0.25, 'triangle', 0.14]],
  menu: [[365, 590, 0.08, 'sine', 0.16]],
  record: [[523, 523, 0.16, 'triangle', 0.13], [659, 659, 0.15, 'triangle', 0.13], [1047, 1047, 0.27, 'sine', 0.19]],
  tick: [[330, 400, 0.12, 'sine', 0.19]],
  stage: [[392, 590, 0.12, 'triangle', 0.13], [784, 880, 0.20, 'sine', 0.17]],
};

export class ArcadeAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private effects?: GainNode;
  private playing = false;
  private nextBeat = 0;
  private beat = 0;

  constructor(private readonly settings: Settings) {}

  unlock(): void {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        this.music.connect(this.master);
        this.effects.connect(this.master);
        this.master.connect(this.context.destination);
        this.update();
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      // The game can run without an audio output device.
    }
  }

  update(): void {
    if (!this.context || !this.master || !this.music || !this.effects) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.master, now, 0.018);
    this.music.gain.setTargetAtTime(this.playing ? this.settings.music : 0, now, 0.018);
    this.effects.gain.setTargetAtTime(this.settings.effects, now, 0.018);
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    if (playing) this.nextBeat = (this.context?.currentTime ?? 0) + 0.035;
    this.update();
  }

  cue(name: Cue): void {
    if (this.context?.state !== 'running' || !this.effects || this.settings.muted || !this.settings.effects) return;
    CUES[name].forEach((note, i) => this.tone(this.effects!, this.context!.currentTime + i * 0.065, note));
  }

  frame(): void {
    const context = this.context;
    const music = this.music;
    if (!this.playing || !music || context?.state !== 'running') return;
    if (this.nextBeat < context.currentTime) this.nextBeat = context.currentTime + 0.015;
    while (this.nextBeat < context.currentTime + 0.075) {
      if (!this.settings.muted && this.settings.music) {
        // An original 16-step arpeggio over a four-bar bass line.
        const roots = [110, 87.31, 130.81, 98];
        const melody = [0, 7, 12, 15, 7, 12, 19, 12, 0, 7, 12, 15, 10, 12, 19, 15];
        const root = roots[Math.floor(this.beat / 16) % roots.length];
        const pitch = root * 2 ** (melody[this.beat % 16] / 12) * 2;
        this.tone(music, this.nextBeat, [pitch, pitch, 0.15, 'triangle', 0.15]);
        if (this.beat % 4 === 0) this.tone(music, this.nextBeat, [root, root, 0.28, 'sine', 0.34]);
        if (this.beat % 8 === 0) this.tone(music, this.nextBeat, [110, 42, 0.20, 'sine', 0.42]);
      }
      this.beat += 1;
      this.nextBeat += 0.15;
    }
  }

  private tone(output: GainNode, start: number, [from, to, duration, shape, volume]: Note): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(envelope).connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
}
