/**
 * Check-in Module - Safety check-in timer and modal
 * NOTE: This is the client-side UX layer. The REAL safety net
 * is the Dead Man's Switch on the backend.
 */

const CheckinManager = {
  interval: 600000,      // Default 10 min
  missTimeout: 60000,    // Default 60s
  countdownTimer: null,
  missTimer: null,
  remainingMs: 0,
  isActive: false,
  isMissCountdown: false,

  /**
   * Start the check-in timer system
   */
  start(intervalMs, missTimeoutMs) {
    this.interval = intervalMs || 600000;
    this.missTimeout = missTimeoutMs || 60000;
    this.isActive = true;
    this.startMainTimer();
    console.log(`[Checkin] Started | interval: ${this.interval/1000}s | miss: ${this.missTimeout/1000}s`);
  },

  /**
   * Main countdown timer
   */
  startMainTimer() {
    if (!this.isActive) return;
    
    this.remainingMs = this.interval;
    this.isMissCountdown = false;
    this.hideModal();

    this.countdownTimer = setInterval(() => {
      this.remainingMs -= 1000;
      this.updateCountdownDisplay();

      if (this.remainingMs <= 0) {
        clearInterval(this.countdownTimer);
        this.showCheckinPopup();
      }
    }, 1000);
  },

  /**
   * Show "Are you safe?" modal with miss countdown
   */
  showCheckinPopup() {
    const modal = document.getElementById('checkin-modal');
    if (modal) modal.style.display = 'flex';

    this.isMissCountdown = true;
    let missRemaining = this.missTimeout;

    // Play alert sound
    AudioManager.playCheckinAlert();

    // Show browser notification
    this.showNotification();

    // Vibrate
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 300]);
    }

    // Miss countdown
    this.updateMissDisplay(missRemaining);
    
    this.missTimer = setInterval(() => {
      missRemaining -= 1000;
      this.updateMissDisplay(missRemaining);

      if (missRemaining <= 0) {
        clearInterval(this.missTimer);
        this.onMiss();
      }
    }, 1000);
  },

  /**
   * Update the main countdown display on active-trip page
   */
  updateCountdownDisplay() {
    const display = document.getElementById('trip-countdown');
    if (!display) return;

    const totalSec = Math.max(0, Math.ceil(this.remainingMs / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    display.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    
    // Color based on time remaining
    const ratio = this.remainingMs / this.interval;
    if (ratio < 0.1) {
      display.className = 'trip-timer-value danger';
    } else if (ratio < 0.3) {
      display.className = 'trip-timer-value warning';
    } else {
      display.className = 'trip-timer-value';
    }
  },

  /**
   * Update the miss countdown in the modal
   */
  updateMissDisplay(remainingMs) {
    const timeEl = document.getElementById('countdown-time');
    const ringEl = document.getElementById('countdown-ring');
    if (!timeEl || !ringEl) return;

    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    timeEl.textContent = seconds;

    // Countdown ring animation
    const circumference = 339.292; // 2 * PI * 54
    const progress = 1 - (remainingMs / this.missTimeout);
    ringEl.style.strokeDashoffset = circumference * progress;

    // Warning colors when low
    if (seconds <= 15) {
      timeEl.className = 'countdown-time warning';
      ringEl.className.baseVal = 'countdown-progress warning';
    } else {
      timeEl.className = 'countdown-time';
      ringEl.className.baseVal = 'countdown-progress';
    }
  },

  /**
   * Show browser notification
   */
  async showNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('SafeTravel — Are You Safe?', {
        body: 'Please respond to the safety check-in',
        icon: '🛡️',
        tag: 'safetravel-checkin',
        requireInteraction: true,
        vibrate: [300, 100, 300]
      });
    }
  },

  /**
   * User confirmed safe
   */
  async confirmSafe() {
    clearInterval(this.missTimer);
    this.hideModal();

    // Reset main timer
    this.startMainTimer();

    // Notify backend
    const trip = await Storage.getActiveTrip();
    if (trip) {
      try {
        await fetch(`/api/trip/${trip.id}/checkin`, { method: 'POST' });
      } catch (err) {
        console.error('[Checkin] Server checkin failed:', err);
      }
    }

    // Update stats
    const stats = await Storage.getStats();
    stats.checkins = (stats.checkins || 0) + 1;
    await Storage.updateStats(stats);

    // Visual feedback
    SafeTravel.showToast('✅ You\'re safe! Timer reset.', 'success');
    AudioManager.playBeep(1000, 100);

    console.log('[Checkin] User confirmed safe');
  },

  /**
   * User pressed "I need help"
   */
  needHelp() {
    clearInterval(this.missTimer);
    this.hideModal();
    SafeTravel.sos.trigger('user_need_help');
    console.log('[Checkin] User needs help — SOS triggered');
  },

  /**
   * User missed the check-in (timeout)
   */
  onMiss() {
    this.hideModal();
    SafeTravel.sos.trigger('checkin_missed');
    console.log('[Checkin] ⚠️ Check-in MISSED — SOS triggered');
  },

  /**
   * Hide the modal
   */
  hideModal() {
    const modal = document.getElementById('checkin-modal');
    if (modal) modal.style.display = 'none';
  },

  /**
   * Stop the check-in system
   */
  stop() {
    this.isActive = false;
    clearInterval(this.countdownTimer);
    clearInterval(this.missTimer);
    this.hideModal();
    console.log('[Checkin] Stopped');
  }
};
