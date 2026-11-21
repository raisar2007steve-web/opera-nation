/**
 * Web Audio API sound design, generated procedurally (no external audio files):
 * city ambience, rain bed, footsteps, engine and UI/mission cues.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private started = false;
  private volume = 0.7;
  private rainTarget = 0;

  async start(): Promise<void> {
    if (this.started) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      await ctx.resume();

      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);

      // City ambience: filtered noise bed + low drone.
      const noise = ctx.createBufferSource();
      noise.buffer = this.makeNoise(4, "brown");
      noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.value = 420;
      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.value = 0.1;
      noise.connect(noiseFilter).connect(this.ambientGain).connect(this.master);
      noise.start();

      const drone = ctx.createOscillator();
      drone.type = "sine";
      drone.frequency.value = 54;
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.035;
      drone.connect(droneGain).connect(this.master);
      drone.start();

      // Rain bed (gain modulated by weather).
      const rainNoise = ctx.createBufferSource();
      rainNoise.buffer = this.makeNoise(3, "white");
      rainNoise.loop = true;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = "bandpass";
      rainFilter.frequency.value = 1400;
      rainFilter.Q.value = 0.7;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      rainNoise.connect(rainFilter).connect(this.rainGain).connect(this.master);
      rainNoise.start();

      // Engine tone, silent until driving.
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.master);
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 60;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 320;
      this.engineOsc.connect(engineFilter).connect(this.engineGain);
      this.engineOsc.start();
      this.engineOsc2 = ctx.createOscillator();
      this.engineOsc2.type = "square";
      this.engineOsc2.frequency.value = 91;
      const g2 = ctx.createGain();
      g2.gain.value = 0.3;
      this.engineOsc2.connect(g2).connect(this.engineGain);
      this.engineOsc2.start();

      this.started = true;
    } catch {
      // Audio is optional; never block gameplay on it.
      this.started = false;
    }
  }

  private makeNoise(seconds: number, kind: "white" | "brown"): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        data[i] = white * 0.6;
      }
    }
    return buffer;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.value = this.volume;
  }

  setRain(level: number): void {
    this.rainTarget = level;
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(level * 0.11, this.ctx!.currentTime, 0.6);
    }
  }

  setEngine(active: boolean, speedKmh: number): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineOsc2) return;
    const now = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(active ? 0.09 : 0, now, 0.12);
    if (active) {
      const pitch = 48 + Math.min(120, speedKmh * 1.1);
      this.engineOsc.frequency.setTargetAtTime(pitch, now, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(pitch * 1.52, now, 0.08);
    }
  }

  footstep(sprinting: boolean): void {
    this.click(sprinting ? 0.055 : 0.035, sprinting ? 130 : 100, 0.05);
  }

  jump(): void {
    this.click(0.06, 260, 0.06);
  }

  land(): void {
    this.click(0.07, 70, 0.09);
  }

  uiClick(): void {
    this.click(0.028, 620, 0.04);
  }

  success(): void {
    this.tone(523.25, 0.12, 0.05);
    this.tone(659.25, 0.12, 0.18);
    this.tone(783.99, 0.2, 0.3);
  }

  fail(): void {
    this.tone(220, 0.2, 0.05);
    this.tone(160, 0.3, 0.18);
  }

  private click(gain: number, freq: number, duration: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  private tone(freq: number, duration: number, delay: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.09, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  dispose(): void {
    this.engineOsc?.stop();
    this.engineOsc2?.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
