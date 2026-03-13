/**
 * Audio Module - Web Audio API alarm with autoplay workaround
 * Silent oscillator loop keeps audio channel alive during trip
 */

const AudioManager = {
  ctx: null,
  silentOsc: null,
  sirenOsc: null,
  sirenGain: null,
  isInitialized: false,
  isSirenPlaying: false,

  /**
   * Initialize audio on user gesture (called from "Start Trip" button)
   * This MUST be triggered by a user click to unlock Web Audio API
   */
  init() {
    if (this.isInitialized) return;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Silent oscillator — keeps audio channel alive in background
      this.silentOsc = this.ctx.createOscillator();
      const silentGain = this.ctx.createGain();
      silentGain.gain.value = 0.001; // Essentially silent
      this.silentOsc.connect(silentGain);
      silentGain.connect(this.ctx.destination);
      this.silentOsc.start();

      // Prepare siren oscillator
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenGain.connect(this.ctx.destination);

      this.isInitialized = true;
      console.log('[Audio] Initialized — silent loop active');
    } catch (err) {
      console.error('[Audio] Init failed:', err);
    }
  },

  /**
   * Play ascending siren alarm
   */
  startSiren() {
    if (!this.isInitialized || this.isSirenPlaying) return;

    try {
      // Create new oscillator for siren (oscillators are one-shot)
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.connect(this.sirenGain);
      
      // Ascending siren pattern
      const now = this.ctx.currentTime;
      this.sirenGain.gain.setValueAtTime(0.3, now);
      
      // Loop frequency sweep: 440Hz → 880Hz and back
      this.sirenOsc.frequency.setValueAtTime(440, now);
      
      const scheduleLoop = () => {
        if (!this.isSirenPlaying) return;
        const t = this.ctx.currentTime;
        this.sirenOsc.frequency.linearRampToValueAtTime(880, t + 0.5);
        this.sirenOsc.frequency.linearRampToValueAtTime(440, t + 1.0);
        setTimeout(scheduleLoop, 1000);
      };

      this.sirenOsc.start();
      this.isSirenPlaying = true;
      scheduleLoop();
      
      console.log('[Audio] 🔊 Siren started');
    } catch (err) {
      console.error('[Audio] Siren error:', err);
    }
  },

  /**
   * Stop the siren
   */
  stopSiren() {
    if (this.sirenOsc) {
      try {
        this.sirenGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.sirenOsc.stop();
      } catch (e) {}
      this.sirenOsc = null;
    }
    this.isSirenPlaying = false;
    console.log('[Audio] Siren stopped');
  },

  /**
   * Play a short notification beep
   */
  playBeep(frequency = 800, duration = 200) {
    if (!this.isInitialized) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration / 1000);
    } catch (err) {}
  },

  /**
   * Play check-in notification sound (3 ascending beeps)
   */
  playCheckinAlert() {
    if (!this.isInitialized) return;
    this.playBeep(600, 150);
    setTimeout(() => this.playBeep(800, 150), 200);
    setTimeout(() => this.playBeep(1000, 300), 400);
  },

  /**
   * Toggle alarm on/off (from UI toggle)
   */
  toggleAlarm(enabled) {
    if (enabled) {
      this.init(); // Ensure initialized
      this.startSiren();
    } else {
      this.stopSiren();
    }
  },

  /**
   * Cleanup on trip end
   */
  destroy() {
    this.stopSiren();
    if (this.silentOsc) {
      try { this.silentOsc.stop(); } catch (e) {}
      this.silentOsc = null;
    }
    this.isInitialized = false;
    console.log('[Audio] Destroyed');
  }
};
