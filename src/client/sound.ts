// Hand-authored Web Audio effects. Every sound is synthesized from oscillator
// patterns and filtered noise; there are no sampled or AI-generated assets.
class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public sonarMode = false;
  public sonarThreshold = 100;

  constructor() {
    try {
      const saved = localStorage.getItem('orbs_sound_enabled');
      this.enabled = saved !== null ? saved === 'true' : true;
      this.sonarMode = localStorage.getItem('orbs_sonar_mode') === 'true';
      const savedThreshold = localStorage.getItem('orbs_sonar_threshold');
      if (savedThreshold) {
        this.sonarThreshold = Math.max(10, parseInt(savedThreshold, 10) || 100);
      }
    } catch {
      this.enabled = true;
      this.sonarMode = false;
      this.sonarThreshold = 100;
    }
  }

  private initCtx(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const browserWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = window.AudioContext || browserWindow.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private withAudio(play: (ctx: AudioContext, now: number) => void, allowSonarMode = false) {
    if (!this.enabled || (this.sonarMode && !allowSonarMode)) return;
    try {
      const ctx = this.initCtx();
      if (ctx) play(ctx, ctx.currentTime);
    } catch {}
  }

  private tone(
    ctx: AudioContext,
    frequency: number,
    startAt: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    endFrequency?: number,
    detune = 0,
  ) {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const endAt = startAt + Math.max(0.025, duration);
    const safeFrequency = Math.max(20, Math.min(8_000, frequency));

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(safeFrequency, startAt);
    oscillator.detune.setValueAtTime(detune, startAt);
    if (endFrequency && endFrequency > 0) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), endAt);
    }

    const peak = Math.max(0.001, Math.min(0.25, volume));
    const attack = Math.min(0.012, duration * 0.2);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.linearRampToValueAtTime(peak, startAt + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(envelope);
    envelope.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.01);
  }

  private filteredNoise(
    ctx: AudioContext,
    startAt: number,
    duration: number,
    volume: number,
    cutoff: number,
    seed: number,
    filterType: BiquadFilterType = 'bandpass',
  ) {
    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let state = seed >>> 0 || 1;
    for (let i = 0; i < frameCount; i++) {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      samples[i] = ((state / 0x1_0000_0000) * 2 - 1) * (1 - i / frameCount);
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    const endAt = startAt + duration;
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(80, Math.min(10_000, cutoff)), startAt);
    filter.Q.setValueAtTime(0.7, startAt);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.linearRampToValueAtTime(Math.max(0.001, Math.min(0.18, volume)), startAt + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(ctx.destination);
    source.start(startAt);
    source.stop(endAt + 0.01);
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('orbs_sound_enabled', String(this.enabled));
    } catch {}
    if (this.enabled) this.playChime(440, 'sine', 0.1);
    return this.enabled;
  }

  public setSonarMode(active: boolean) {
    this.sonarMode = active;
    try {
      localStorage.setItem('orbs_sonar_mode', String(active));
    } catch {}
    if (active) this.playSonarPing(this.sonarThreshold);
  }

  public setSonarThreshold(threshold: number) {
    this.sonarThreshold = threshold;
    try {
      localStorage.setItem('orbs_sonar_threshold', String(threshold));
    } catch {}
    this.playSonarPing(threshold);
  }

  public playClick() {
    this.withAudio((ctx, now) => {
      this.filteredNoise(ctx, now, 0.035, 0.035, 2_600, 17);
      this.tone(ctx, 520, now, 0.055, 0.035, 'triangle', 360);
    });
  }

  public playChime(freq = 523.25, type: OscillatorType = 'sine', duration = 0.25) {
    this.withAudio((ctx, now) => {
      const safeFrequency = Number.isFinite(freq) ? Math.max(40, Math.min(4_000, freq)) : 523.25;
      const safeDuration = Number.isFinite(duration) ? Math.max(0.06, Math.min(1.6, duration)) : 0.25;
      this.tone(ctx, safeFrequency, now, safeDuration, 0.075, type, undefined, -3);
      this.tone(ctx, safeFrequency * 2.01, now + 0.008, safeDuration * 0.72, 0.022, 'sine', undefined, 2);
    });
  }

  public playRollNormal() {
    this.withAudio((ctx, now) => {
      this.filteredNoise(ctx, now, 0.055, 0.025, 2_000, 23, 'lowpass');
      this.tone(ctx, 659.25, now + 0.008, 0.115, 0.045, 'sine', 523.25);
      this.tone(ctx, 392, now + 0.052, 0.09, 0.025, 'triangle', 440);
    });
  }

  /** A rarity-scaled sonar mark, retained while Silent Sonar mode is active. */
  public playSonarPing(rarity: number) {
    this.withAudio((ctx, now) => {
      const base = rarity >= 10_000 ? 1_318.51 : rarity >= 1_000 ? 1_046.5 : 880;
      this.tone(ctx, base, now, 0.42, 0.12, 'sine', base * 0.985);
      this.tone(ctx, base * 1.5, now + 0.055, 0.48, 0.065, 'sine');
      this.tone(ctx, base * 2, now + 0.12, 0.31, 0.022, 'triangle');
    }, true);
  }

  public playRareRiser() {
    this.withAudio((ctx, now) => {
      this.filteredNoise(ctx, now, 0.42, 0.045, 1_400, 31, 'lowpass');
      this.tone(ctx, 330, now, 0.42, 0.04, 'triangle', 660);
      this.tone(ctx, 880, now + 0.37, 0.32, 0.055, 'sine');
    });
  }

  public playEpicFanfare() {
    this.withAudio((ctx, now) => {
      [523.25, 659.25, 783.99, 1_046.5].forEach((frequency, index) => {
        this.tone(ctx, frequency, now + index * 0.09, 0.42, 0.085, 'triangle');
      });
      this.tone(ctx, 1_568, now + 0.29, 0.36, 0.028, 'sine');
    }, true);
  }

  public playMythicFanfare() {
    this.withAudio((ctx, now) => {
      [392, 493.88, 587.33, 783.99, 987.77, 1_174.66, 1_567.98].forEach((frequency, index) => {
        const startAt = now + index * 0.085;
        this.tone(ctx, frequency, startAt, 0.72, 0.075, index % 2 ? 'triangle' : 'sine');
        this.tone(ctx, frequency * 2, startAt + 0.018, 0.43, 0.018, 'sine');
      });
    }, true);
  }

  public playLevelUpFanfare() {
    this.withAudio((ctx, now) => {
      [392, 493.88, 587.33, 783.99].forEach((frequency, index) => {
        this.tone(ctx, frequency, now + index * 0.085, 0.34, 0.07, 'triangle');
      });
      [392, 587.33, 783.99].forEach(frequency => {
        this.tone(ctx, frequency, now + 0.28, 0.42, 0.028, 'sine');
      });
    }, true);
  }

  public playNewBestFanfare() {
    this.withAudio((ctx, now) => {
      this.filteredNoise(ctx, now, 0.26, 0.09, 180, 47, 'lowpass');
      this.tone(ctx, 82, now, 0.5, 0.12, 'sine', 42);
      [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1_046.5, 1_318.51].forEach((frequency, index) => {
        this.tone(ctx, frequency, now + index * 0.075, 0.72, 0.072, index % 2 ? 'triangle' : 'sine');
      });
    }, true);
  }

  public playSacrificeSound() {
    this.withAudio((ctx, now) => {
      this.filteredNoise(ctx, now, 0.32, 0.055, 520, 59, 'lowpass');
      this.tone(ctx, 130.81, now, 0.52, 0.085, 'triangle', 523.25);
      this.tone(ctx, 261.63, now + 0.19, 0.62, 0.045, 'sine', 196);
      this.tone(ctx, 392, now + 0.46, 0.38, 0.03, 'sine');
    }, true);
  }
}

export const sound = new SoundFX();

