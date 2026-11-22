// Downloaded Kenney CC0 sound samples, complemented by hand-authored Web Audio cues.
const SOUND_ASSETS = {
  click: new URL('./assets/audio/click_001.ogg', import.meta.url).href,
  confirmation: new URL('./assets/audio/confirmation_002.ogg', import.meta.url).href,
  drop: new URL('./assets/audio/drop_001.ogg', import.meta.url).href,
  glass: new URL('./assets/audio/glass_004.ogg', import.meta.url).href,
  error: new URL('./assets/audio/error_001.ogg', import.meta.url).href,
};

class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public sonarMode = false;
  public sonarThreshold = 100;
  public sonarAlertMode: 'near-best' | 'new-best' = 'near-best';
  public sonarAlignmentSoundsAllowed = false;
  public alignmentSoundEnabled = true;
  private sonarModeListeners = new Set<(active: boolean) => void>();

  private playSample(url: string, volume = 0.14, allowSonarMode = false): void {
    if (!this.enabled || (this.sonarMode && !allowSonarMode)) return;
    try {
      if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
      const clip = new Audio(url);
      clip.preload = 'auto';
      // Keep downloaded samples deliberately restrained; frequent UI sounds should stay in the background.
      clip.volume = Math.max(0, Math.min(1, volume * 0.4));
      void clip.play().catch(() => undefined);
    } catch {
      // Blocked or unsupported samples must never interrupt gameplay.
    }
  }

  public playEquip(): void { this.playSample(SOUND_ASSETS.confirmation, 0.11); }
  public playError(): void { this.playSample(SOUND_ASSETS.error, 0.08); }

  constructor() {
    try {
      const saved = localStorage.getItem('orbs_sound_enabled');
      this.enabled = saved !== null ? saved === 'true' : true;
      this.sonarMode = localStorage.getItem('orbs_sonar_mode') === 'true';
      this.sonarAlertMode = localStorage.getItem('orbs_sonar_alert_mode') === 'new-best' ? 'new-best' : 'near-best';
      this.sonarAlignmentSoundsAllowed = localStorage.getItem('orbs_sonar_alignment_sounds') === 'true';
      this.alignmentSoundEnabled = localStorage.getItem('io_alignment_sound') !== 'false';
      const savedThreshold = localStorage.getItem('orbs_sonar_threshold');
      if (savedThreshold) {
        this.sonarThreshold = Math.max(10, parseInt(savedThreshold, 10) || 100);
      }
    } catch {
      this.enabled = true;
      this.sonarMode = false;
      this.sonarThreshold = 100;
      this.sonarAlertMode = 'near-best';
      this.sonarAlignmentSoundsAllowed = false;
      this.alignmentSoundEnabled = true;
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

  public subscribeSonarMode(listener: (active: boolean) => void): () => void {
    this.sonarModeListeners.add(listener);
    return () => {
      this.sonarModeListeners.delete(listener);
    };
  }

  public setSonarMode(active: boolean) {
    this.sonarMode = active;
    try {
      localStorage.setItem('orbs_sonar_mode', String(active));
    } catch {}
    for (const listener of this.sonarModeListeners) {
      try { listener(active); } catch {}
    }
    if (active) this.playSonarPing(this.sonarThreshold);
  }

  public setSonarThreshold(threshold: number) {
    this.sonarThreshold = threshold;
    try {
      localStorage.setItem('orbs_sonar_threshold', String(threshold));
    } catch {}
    this.playSonarPing(threshold);
  }

  public setSonarAlertMode(mode: 'near-best' | 'new-best'): void {
    this.sonarAlertMode = mode === 'new-best' ? 'new-best' : 'near-best';
    try { localStorage.setItem('orbs_sonar_alert_mode', this.sonarAlertMode); } catch {}
  }

  public setSonarAlignmentSoundsAllowed(enabled: boolean): void {
    this.sonarAlignmentSoundsAllowed = Boolean(enabled);
    try { localStorage.setItem('orbs_sonar_alignment_sounds', String(this.sonarAlignmentSoundsAllowed)); } catch {}
  }

  // Generic UI clicks were too repetitive. Keep this method as a compatibility no-op.
  public playClick() {}

  public playChime(freq = 523.25, type: OscillatorType = 'sine', duration = 0.25) {
    this.withAudio((ctx, now) => {
      const safeFrequency = Number.isFinite(freq) ? Math.max(40, Math.min(4_000, freq)) : 523.25;
      const safeDuration = Number.isFinite(duration) ? Math.max(0.06, Math.min(1.6, duration)) : 0.25;
      this.tone(ctx, safeFrequency, now, safeDuration, 0.075, type, undefined, -3);
      this.tone(ctx, safeFrequency * 2.01, now + 0.008, safeDuration * 0.72, 0.022, 'sine', undefined, 2);
    });
  }

  public playRollNormal() {
    this.playSample(SOUND_ASSETS.drop, 0.09);
  }

  public setAlignmentSoundEnabled(enabled: boolean): void {
    this.alignmentSoundEnabled = Boolean(enabled);
    try { localStorage.setItem('io_alignment_sound', String(this.alignmentSoundEnabled)); } catch { /* Session setting remains active. */ }
  }

  /** This alert bypasses Silent Sonar; only its dedicated switch or global mute can silence it. */
  public playAlignmentPrompt(): void {
    if (!this.alignmentSoundEnabled) return;
    this.withAudio((ctx, now) => {
      this.filteredNoise(ctx, now, 1.15, 0.018, 1_350, 13, 'lowpass');
      this.tone(ctx, 523.25, now, 0.72, 0.07, 'sine', 392);
      this.tone(ctx, 783.99, now + 0.18, 0.95, 0.075, 'sine', 659.25);
      this.tone(ctx, 1_046.5, now + 0.43, 1.18, 0.065, 'triangle', 880);
      this.tone(ctx, 1_568, now + 0.82, 0.8, 0.024, 'sine');
    }, this.sonarAlignmentSoundsAllowed);
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
    this.playSample(SOUND_ASSETS.glass, 0.12);
  }

  public playEpicFanfare() {
    this.playSample(SOUND_ASSETS.glass, 0.14, true);
  }

  public playMythicFanfare() {
    this.playSample(SOUND_ASSETS.confirmation, 0.16, true);
  }

  public playLevelUpFanfare() {
    this.playSample(SOUND_ASSETS.confirmation, 0.12, true);
  }

  public playNewBestFanfare() {
    this.playSample(SOUND_ASSETS.confirmation, 0.15, true);
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

