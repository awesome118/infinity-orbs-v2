// A small, synthesized sound palette: soft instrument pips for play, and a restrained
// harmonic lift when an unusually rare orb appears. No audio files or network calls.
type ToneOptions = {
  type?: OscillatorType;
  gain?: number;
  pan?: number;
  attack?: number;
  endFrequency?: number;
};

class SoundFX {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private echo: DelayNode | null = null;
  private echoFeedback: GainNode | null = null;
  private echoWet: GainNode | null = null;
  private rollIndex = 0;
  public enabled = true;
  public sonarMode = false;
  public sonarThreshold = 100;

  constructor() {
    try {
      const saved = localStorage.getItem('orbs_sound_enabled');
      this.enabled = saved !== null ? saved === 'true' : true;
      this.sonarMode = localStorage.getItem('orbs_sonar_mode') === 'true';
      const threshold = Number(localStorage.getItem('orbs_sonar_threshold'));
      if (Number.isFinite(threshold) && threshold >= 10) this.sonarThreshold = threshold;
    } catch {
      this.enabled = true;
    }
  }

  private initCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.output = this.ctx.createGain();
      this.output.gain.value = 0.72;

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -22;
      compressor.knee.value = 18;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.2;
      this.output.connect(compressor);
      compressor.connect(this.ctx.destination);

      this.echo = this.ctx.createDelay(0.35);
      this.echo.delayTime.value = 0.17;
      this.echoFeedback = this.ctx.createGain();
      this.echoFeedback.gain.value = 0.13;
      this.echoWet = this.ctx.createGain();
      this.echoWet.gain.value = 0.12;
      this.output.connect(this.echo);
      this.echo.connect(this.echoFeedback);
      this.echoFeedback.connect(this.echo);
      this.echo.connect(this.echoWet);
      this.echoWet.connect(compressor);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(frequency: number, startOffset: number, duration: number, options: ToneOptions = {}) {
    const ctx = this.initCtx();
    if (!ctx || !this.output) return;
    const start = ctx.currentTime + startOffset;
    const end = start + duration;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(1, frequency), start);
    if (options.endFrequency && options.endFrequency > 0) {
      osc.frequency.exponentialRampToValueAtTime(options.endFrequency, end);
    }
    const peak = Math.max(0.0002, options.gain ?? 0.06);
    const attack = Math.min(options.attack ?? 0.008, duration * 0.4);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(peak, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(envelope);
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
      envelope.connect(panner);
      panner.connect(this.output);
    } else {
      envelope.connect(this.output);
    }
    osc.start(start);
    osc.stop(end + 0.01);
  }

  private sequence(notes: number[], spacing: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    notes.forEach((note, index) => {
      this.tone(note, index * spacing, duration, {
        type,
        gain: gain * (index === notes.length - 1 ? 0.84 : 0.58),
        pan: notes.length > 1 ? (index / (notes.length - 1) - 0.5) * 0.3 : 0,
      });
    });
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    try { localStorage.setItem('orbs_sound_enabled', String(this.enabled)); } catch {}
    if (this.enabled) this.playClick();
    return this.enabled;
  }

  public setSonarMode(active: boolean) {
    this.sonarMode = active;
    try { localStorage.setItem('orbs_sonar_mode', String(active)); } catch {}
    if (active) this.playSonarPing(this.sonarThreshold);
  }

  public setSonarThreshold(threshold: number) {
    this.sonarThreshold = threshold;
    try { localStorage.setItem('orbs_sonar_threshold', String(threshold)); } catch {}
    this.playSonarPing(threshold);
  }

  public playClick() {
    if (!this.enabled || this.sonarMode) return;
    this.tone(560, 0, 0.065, { type: 'sine', gain: 0.026, endFrequency: 440, attack: 0.004 });
    this.tone(840, 0.012, 0.05, { type: 'sine', gain: 0.009, pan: 0.12 });
  }

  public playChime(freq = 523.25, type: OscillatorType = 'sine', duration = 0.25) {
    if (!this.enabled || this.sonarMode) return;
    this.tone(freq, 0, duration, { type, gain: 0.065, attack: 0.012 });
    this.tone(freq * 1.5, 0.018, duration * 0.7, { type: 'sine', gain: 0.014, pan: 0.14 });
  }

  public playRollNormal() {
    if (!this.enabled || this.sonarMode) return;
    const scale = [392, 440, 493.88, 587.33, 440, 523.25];
    const note = scale[this.rollIndex++ % scale.length];
    this.tone(note, 0, 0.105, { type: 'sine', gain: 0.035, endFrequency: note * 0.98, attack: 0.006 });
    this.tone(note * 1.5, 0.045, 0.11, { type: 'triangle', gain: 0.016, pan: 0.16, attack: 0.009 });
  }

  /** An airy, unmistakable ping used by the optional rare-drop alert. */
  public playSonarPing(rarity: number) {
    if (!this.enabled) return;
    const root = rarity >= 10_000 ? 987.77 : rarity >= 1_000 ? 783.99 : 659.25;
    this.tone(root, 0, 0.58, { type: 'sine', gain: 0.12, attack: 0.02 });
    this.tone(root * 1.25, 0.075, 0.66, { type: 'sine', gain: 0.064, pan: 0.18, attack: 0.02 });
    this.tone(root * 1.5, 0.17, 0.78, { type: 'sine', gain: 0.035, pan: -0.16, attack: 0.025 });
  }

  public playRareRiser() {
    if (!this.enabled || this.sonarMode) return;
    this.tone(293.66, 0, 0.38, { type: 'sine', gain: 0.04, endFrequency: 587.33, attack: 0.08 });
    this.sequence([392, 493.88, 587.33], 0.11, 0.3, 0.045, 'triangle');
  }

  public playEpicFanfare() {
    if (!this.enabled) return;
    this.sequence([392, 493.88, 587.33, 783.99], 0.105, 0.54, 0.105);
    this.tone(196, 0, 0.38, { type: 'sine', gain: 0.045, endFrequency: 174.61, attack: 0.05 });
    this.tone(1174.66, 0.34, 0.42, { type: 'sine', gain: 0.024, pan: 0.2 });
  }

  public playMythicFanfare() {
    if (!this.enabled) return;
    this.tone(130.81, 0, 0.75, { type: 'sine', gain: 0.075, endFrequency: 98, attack: 0.05 });
    this.sequence([261.63, 329.63, 392, 493.88, 587.33, 783.99], 0.105, 0.88, 0.11);
    this.tone(987.77, 0.56, 0.95, { type: 'sine', gain: 0.04, pan: 0.2 });
    this.tone(1174.66, 0.68, 0.9, { type: 'sine', gain: 0.022, pan: -0.18 });
  }

  public playLevelUpFanfare() {
    if (!this.enabled) return;
    this.sequence([392, 493.88, 587.33, 783.99, 987.77], 0.075, 0.45, 0.08, 'triangle');
  }

  public playNewBestFanfare() {
    if (!this.enabled) return;
    this.tone(98, 0, 0.66, { type: 'sine', gain: 0.09, endFrequency: 65.41, attack: 0.025 });
    this.sequence([293.66, 369.99, 440, 587.33, 739.99, 880, 1174.66], 0.09, 0.82, 0.105);
  }

  public playSacrificeSound() {
    if (!this.enabled) return;
    this.tone(220, 0, 0.62, { type: 'sine', gain: 0.055, endFrequency: 440, attack: 0.08 });
    this.tone(329.63, 0.18, 0.56, { type: 'sine', gain: 0.04, endFrequency: 164.81, pan: 0.12 });
  }
}

export const sound = new SoundFX();
