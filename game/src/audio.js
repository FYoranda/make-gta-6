// Solmar Bay — procedural WebAudio sound. No audio files, no network:
// every sound is synthesized with oscillators and filtered noise.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  /** Must be called from a user gesture at least once. Safe to call often. */
  resume() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (e) { /* audio unavailable: the game plays silent */ }
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.1);
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  uiClick() { this._blip(660, 0.08, 'square', 0.12, 880); }
  pickup() { this._blip(523, 0.12, 'sine', 0.2); setTimeout(() => this._blip(784, 0.18, 'sine', 0.2), 90); }
  cash() {
    this._blip(880, 0.1, 'sine', 0.18);
    setTimeout(() => this._blip(1174, 0.1, 'sine', 0.18), 80);
    setTimeout(() => this._blip(1568, 0.22, 'sine', 0.2), 160);
  }
  gunshot() { this._noise(0.14, 0.5, 2600, 'highpass'); this._blip(140, 0.1, 'square', 0.25, 60); }
  hit() { this._blip(220, 0.08, 'square', 0.15, 180); }
  crash() { this._noise(0.35, 0.5, 500); this._blip(90, 0.25, 'sawtooth', 0.25, 45); }
  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'triangle', 0.22), i * 110));
  }
  wantedUp() { this._blip(392, 0.14, 'square', 0.16); setTimeout(() => this._blip(311, 0.2, 'square', 0.16), 130); }

  /** Continuous engine hum; speed01 in 0..1, on toggles it. */
  engine(speed01, on) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 145, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + speed01 * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
  }

  /** Two-tone police siren while any police car is near. */
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); this.sirenLfo.start();
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc = null; this.sirenLfo = null; this.sirenGain = null;
    }
  }

  /** Looping synthwave bassline, scheduled step by step. */
  setMusic(on) {
    if (!this.ctx) return;
    if (on && !this.musicTimer) {
      const bass = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 82.4, 0, 73.4, 0];
      this.musicStep = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const f = bass[this.musicStep % bass.length];
        this.musicStep++;
        if (f > 0) this._blip(f, 0.22, 'triangle', 0.09);
        if (this.musicStep % 4 === 0) this._blip(220 + (this.musicStep % 16) * 6, 0.1, 'sine', 0.03);
      }, 210);
    } else if (!on && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
