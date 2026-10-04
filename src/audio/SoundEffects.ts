/**
 * Procedural Web Audio API sound generator.
 * Requires no external audio files and provides zero-latency audio feedback.
 */
export class SoundEffects {
  private static audioCtx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Sound when picking up an object (crisp upward pop/blip).
   */
  public static playGrab(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      const now = ctx.currentTime;

      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio context might be restricted before user gesture
    }
  }

  /**
   * Sound when throwing or releasing an object (soft whoosh / descending tone).
   */
  public static playThrow(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      const now = ctx.currentTime;

      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Ignore audio error
    }
  }

  /**
   * Sound when moving/sliding aisles (mechanical pneumatic whoosh).
   */
  public static playWhoosh(intensity: number = 0.5): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      const now = ctx.currentTime;

      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

      const vol = Math.min(0.3, Math.max(0.05, intensity * 0.25));
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Ignore audio error
    }
  }

  /**
   * Sound when objects collide or bounce against the ground/walls.
   * Pitch and volume scale with collision speed.
   */
  public static playImpact(speed: number = 1.0, isHeavy: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const clampedSpeed = Math.max(0.2, Math.min(speed, 10.0));
    const volume = Math.min(0.35, clampedSpeed * 0.05 + 0.05);

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isHeavy ? "sawtooth" : "triangle";
      const now = ctx.currentTime;

      const baseFreq = isHeavy ? 90 : 160;
      osc.frequency.setValueAtTime(baseFreq + clampedSpeed * 15, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore audio error
    }
  }

  /**
   * Sound when interacting with special triggers (e.g. pressure buttons, spawners).
   */
  public static playChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        const now = ctx.currentTime + idx * 0.06;

        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
      });
    } catch {
      // Ignore audio error
    }
  }

  /**
   * Sound when the aisle altar pillar rises or sinks (pneumatic / hydraulic hum).
   */
  public static playHydraulicRise(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      const now = ctx.currentTime;

      osc.frequency.setValueAtTime(65, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.6);
      osc.frequency.exponentialRampToValueAtTime(45, now + 1.2);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.3);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);
    } catch {
      // Ignore audio error
    }
  }

  /**
   * Sound when cartridge locks into the altar dock (magnetic clamp / servo click).
   */
  public static playDockClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // High pitch clamp click
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "square";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(220, now + 0.08);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Low bass confirmation thud
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(130, now + 0.04);
      osc2.frequency.exponentialRampToValueAtTime(40, now + 0.22);
      gain2.gain.setValueAtTime(0.35, now + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.04);
      osc2.stop(now + 0.22);
    } catch {
      // Ignore audio error
    }
  }

  /**
   * Sound when fiery particle effect bursts (roaring flame whoosh).
   */
  public static playIgnitionFire(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      // White noise buffer for roaring flames
      const bufferSize = ctx.sampleRate * 0.8;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      // Bandpass filter to make it sound like a furnace / whoosh
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(280, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(680, ctx.currentTime + 0.25);
      filter.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.8);
      filter.Q.setValueAtTime(1.8, ctx.currentTime);

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.38, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.8);
    } catch {
      // Ignore audio error
    }
  }
}


