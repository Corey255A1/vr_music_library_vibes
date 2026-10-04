import { MusicTrack } from "./EmbyClient";

export class MusicPlayer {
  private audioElement: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private isSourceConnected = false;

  private freqDataArray: Uint8Array = new Uint8Array(32);
  private currentTrack: MusicTrack | null = null;
  private isPlaying = false;
  private volume = 0.85;

  public onTrackChanged?: (track: MusicTrack) => void;
  public onStateChanged?: (isPlaying: boolean) => void;
  public onTimeUpdate?: (currentTime: number, duration: number) => void;

  constructor() {
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.preload = "auto";
    this.audioElement.volume = this.volume;

    this.setupAudioListeners();
  }

  private setupAudioListeners(): void {
    this.audioElement.addEventListener("play", () => {
      this.isPlaying = true;
      this.ensureWebAudioChain();
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      this.onStateChanged?.(true);
    });

    this.audioElement.addEventListener("pause", () => {
      this.isPlaying = false;
      this.onStateChanged?.(false);
    });

    this.audioElement.addEventListener("ended", () => {
      this.isPlaying = false;
      this.onStateChanged?.(false);
    });

    this.audioElement.addEventListener("timeupdate", () => {
      const cur = this.audioElement.currentTime || 0;
      const dur = this.audioElement.duration || this.currentTrack?.durationSeconds || 1;
      this.onTimeUpdate?.(cur, dur);
    });

    this.audioElement.addEventListener("error", (e) => {
      console.warn("Audio element error during playback:", e);
    });
  }

  private ensureWebAudioChain(): void {
    if (this.isSourceConnected) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (!this.analyser) {
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64; // 32 frequency bins
        this.analyser.smoothingTimeConstant = 0.82;
        this.freqDataArray = new Uint8Array(this.analyser.frequencyBinCount);
      }

      if (!this.gainNode) {
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = this.volume;
      }

      if (!this.sourceNode) {
        try {
          this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
          this.sourceNode.connect(this.analyser);
          this.analyser.connect(this.gainNode);
          this.gainNode.connect(this.audioCtx.destination);
          this.isSourceConnected = true;
        } catch (corsErr) {
          // If CORS restricts MediaElementSource, direct audio still plays via HTML5 element
          console.log("Web Audio MediaElementSource CORS notice (audio plays directly via element):", corsErr);
        }
      }
    } catch (err) {
      console.warn("Could not initialize Web Audio analyzer chain:", err);
    }
  }

  public async playTrack(track: MusicTrack): Promise<void> {
    this.currentTrack = track;
    this.onTrackChanged?.(track);

    try {
      this.audioElement.src = track.streamUrl;
      this.audioElement.currentTime = 0;
      await this.audioElement.play();
      this.isPlaying = true;
      this.onStateChanged?.(true);
    } catch (err) {
      console.warn("Audio autoplay policy or stream loading:", err);
      // Attempt play on next user interaction if blocked
      const resumeOnGesture = () => {
        this.audioElement.play().catch(() => {});
        window.removeEventListener("click", resumeOnGesture);
        window.removeEventListener("keydown", resumeOnGesture);
      };
      window.addEventListener("click", resumeOnGesture, { once: true });
      window.addEventListener("keydown", resumeOnGesture, { once: true });
    }
  }

  public pause(): void {
    this.audioElement.pause();
  }

  public resume(): void {
    if (this.currentTrack) {
      this.audioElement.play().catch(() => {});
    }
  }

  public togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.resume();
    }
  }

  public seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this.audioElement.currentTime = Math.max(0, Math.min(this.audioElement.duration || 9999, seconds));
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audioElement.volume = this.volume;
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getCurrentTrack(): MusicTrack | null {
    return this.currentTrack;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTime(): number {
    return this.audioElement.currentTime || 0;
  }

  public getDuration(): number {
    return this.audioElement.duration || this.currentTrack?.durationSeconds || 0;
  }

  public getPlaybackProgress(): {
    currentSeconds: number;
    durationSeconds: number;
    progress01: number;
    remainingSeconds: number;
  } {
    const cur = this.audioElement.currentTime || 0;
    const dur = this.audioElement.duration || this.currentTrack?.durationSeconds || 180;
    const progress01 = Math.max(0, Math.min(1, cur / dur));
    const remainingSeconds = Math.max(0, dur - cur);

    return {
      currentSeconds: cur,
      durationSeconds: dur,
      progress01,
      remainingSeconds,
    };
  }

  /**
   * Retrieves real-time frequency spectrum data for the 32 bands.
   * If real Web Audio analyzer is connected and active, uses live FFT.
   * Otherwise generates a high-energy algorithmic visualization based on playback time.
   */
  public getFrequencyData(): Uint8Array {
    if (this.isPlaying && this.isSourceConnected && this.analyser) {
      this.analyser.getByteFrequencyData(this.freqDataArray as unknown as Uint8Array<ArrayBuffer>);
      return this.freqDataArray;
    }

    // Algorithmic fallback visualizer if audio element is cross-origin
    if (this.isPlaying) {
      const time = performance.now() * 0.005;
      for (let i = 0; i < 32; i++) {
        const wave1 = Math.sin(time * 1.8 + i * 0.4);
        const wave2 = Math.cos(time * 2.9 - i * 0.25);
        const beat = (Math.sin(time * 4.0) + 1.0) * 0.5;
        const bassBoost = i < 8 ? beat * 80 : 0;
        const val = Math.min(255, Math.max(20, Math.floor(((wave1 + wave2 + 2) / 4) * 190 + bassBoost)));
        this.freqDataArray[i] = val;
      }
    } else {
      // Slowly decay bars to 0 when paused
      for (let i = 0; i < 32; i++) {
        this.freqDataArray[i] = Math.max(0, Math.floor(this.freqDataArray[i] * 0.85));
      }
    }

    return this.freqDataArray;
  }

  /**
   * Samples an image URL via an offscreen canvas to extract the dominant vibrant color.
   */
  public static async extractDominantColor(imageUrl: string, fallbackHex: string = "#ff007f"): Promise<string> {
    if (!imageUrl) return fallbackHex;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(fallbackHex);
            return;
          }

          ctx.drawImage(img, 0, 0, 64, 64);
          const data = ctx.getImageData(0, 0, 64, 64).data;

          let rSum = 0;
          let gSum = 0;
          let bSum = 0;
          let count = 0;

          for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Filter out near-blacks and near-whites to find vibrant tones
            const brightness = (r + g + b) / 3;
            const saturation = Math.max(r, g, b) - Math.min(r, g, b);

            if (brightness > 30 && brightness < 225 && saturation > 35) {
              rSum += r;
              gSum += g;
              bSum += b;
              count++;
            }
          }

          if (count > 0) {
            const avgR = Math.round(rSum / count);
            const avgG = Math.round(gSum / count);
            const avgB = Math.round(bSum / count);
            const hex = `#${((1 << 24) + (avgR << 16) + (avgG << 8) + avgB).toString(16).slice(1)}`;
            resolve(hex);
            return;
          }
        } catch {
          // Canvas tainted or error
        }
        resolve(fallbackHex);
      };

      img.onerror = () => {
        resolve(fallbackHex);
      };

      img.src = imageUrl;
    });
  }
}
