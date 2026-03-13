/**
 * SOS Module - Emergency protocol activation
 */

const SOSManager = {
  isActive: false,

  /**
   * Trigger SOS protocol
   * @param {string} triggerType - 'manual', 'checkin_missed', 'user_need_help', 'route_deviation'
   */
  async trigger(triggerType = 'manual') {
    if (this.isActive) return;
    this.isActive = true;

    console.log(`[SOS] 🚨 SOS TRIGGERED: ${triggerType}`);

    // Start alarm
    AudioManager.init();
    AudioManager.startSiren();

    // Vibrate long pattern
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }

    // Navigate to SOS page
    SafeTravel.navigateTo('sos');

    // Get trip and user data
    const trip = await Storage.getActiveTrip();
    const profile = await Storage.getProfile();
    const position = LocationTracker.currentPosition;

    // Send SOS to backend
    try {
      const response = await fetch('/api/emergency/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: trip?.id || null,
          user_id: profile?.id || null,
          trigger_type: triggerType
        })
      });

      const result = await response.json();

      // Show report
      this.showReport(result, triggerType, position);

      console.log('[SOS] Emergency protocol executed');
    } catch (err) {
      console.error('[SOS] Backend SOS failed:', err);
      // Still show local report
      this.showLocalReport(triggerType, position, profile, trip);
    }

    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 EMERGENCY SOS ACTIVATED', {
        body: 'Emergency contacts have been notified',
        tag: 'safetravel-sos',
        requireInteraction: true
      });
    }
  },

  /**
   * Show emergency report from backend response
   */
  showReport(result, triggerType, position) {
    const reportEl = document.getElementById('sos-report');
    const reportTime = document.getElementById('sos-report-time');
    const reportDetails = document.getElementById('sos-report-details');

    if (!reportEl) return;

    reportEl.style.display = 'block';
    reportTime.textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let html = `<p style="margin-bottom:8px;"><strong>Trigger:</strong> ${this.getTriggerLabel(triggerType)}</p>`;
    
    if (position) {
      html += `<p style="margin-bottom:8px;">
        <strong>📍 Location:</strong> 
        <a href="https://www.google.com/maps?q=${position.lat},${position.lng}" target="_blank" style="color: var(--accent-blue);">
          ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}
        </a>
      </p>`;
    }

    if (result.trackingUrl) {
      html += `<p style="margin-bottom:8px;"><strong>📡 Live Tracking:</strong> <a href="${result.trackingUrl}" target="_blank" style="color: var(--accent-blue);">${result.trackingUrl}</a></p>`;
    }

    html += `<p style="color: var(--accent-green);">✅ Emergency contacts notified</p>`;

    reportDetails.innerHTML = html;
  },

  /**
   * Show local report when backend is unreachable
   */
  showLocalReport(triggerType, position, profile, trip) {
    const reportEl = document.getElementById('sos-report');
    const reportDetails = document.getElementById('sos-report-details');
    const reportTime = document.getElementById('sos-report-time');

    if (!reportEl) return;

    reportEl.style.display = 'block';
    reportTime.textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let html = `<p style="color: var(--accent-yellow); margin-bottom:8px;">⚠️ Could not reach server. Use buttons below to manually alert contacts.</p>`;
    
    if (position) {
      html += `<p><strong>📍 Location:</strong> <a href="https://www.google.com/maps?q=${position.lat},${position.lng}" target="_blank">${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}</a></p>`;
    }

    reportDetails.innerHTML = html;
  },

  getTriggerLabel(type) {
    const labels = {
      'manual': 'Manual SOS Button',
      'checkin_missed': 'Check-in Missed (Auto)',
      'user_need_help': 'User Pressed "I Need Help"',
      'route_deviation': 'Critical Route Deviation',
      'auto_deadman_switch': 'Dead Man\'s Switch (Server)'
    };
    return labels[type] || type;
  },

  /**
   * Share location via WhatsApp
   */
  async shareWhatsApp() {
    const pos = LocationTracker.currentPosition;
    const profile = await Storage.getProfile();
    const trip = await Storage.getActiveTrip();

    const message = encodeURIComponent(
      `🚨 EMERGENCY SOS 🚨\n\n` +
      `${profile?.name || 'I'} need${profile?.name ? 's' : ''} immediate help!\n\n` +
      `📞 Phone: ${profile?.phone || 'N/A'}\n` +
      `🩸 Blood: ${profile?.blood_group || 'N/A'}\n` +
      `📍 Location: ${pos ? `https://www.google.com/maps?q=${pos.lat},${pos.lng}` : 'Unavailable'}\n` +
      `${trip?.vehicle_number ? `🚗 Vehicle: ${trip.vehicle_number}\n` : ''}` +
      `${trip?.driver_name ? `👤 Driver: ${trip.driver_name}\n` : ''}` +
      `\n📞 Emergency: 112 | 1091 | 181\n` +
      `— SafeTravel Safety App`
    );

    window.open(`https://wa.me/?text=${message}`, '_blank');
  },

  /**
   * Share via SMS
   */
  async shareSMS() {
    const pos = LocationTracker.currentPosition;
    const profile = await Storage.getProfile();

    const message = encodeURIComponent(
      `🚨 SOS: ${profile?.name || 'Someone'} needs help! ` +
      `Location: ${pos ? `https://maps.google.com/?q=${pos.lat},${pos.lng}` : 'N/A'} ` +
      `Phone: ${profile?.phone || 'N/A'} Blood: ${profile?.blood_group || 'N/A'}`
    );

    window.open(`sms:?body=${message}`, '_self');
  },

  /**
   * Copy location to clipboard
   */
  async copyLocation() {
    const pos = LocationTracker.currentPosition;
    if (!pos) {
      SafeTravel.showToast('📍 Location not available yet', 'warning');
      return;
    }

    const text = `🚨 Emergency Location: https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    
    try {
      await navigator.clipboard.writeText(text);
      SafeTravel.showToast('📋 Location copied to clipboard!', 'success');
    } catch (err) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      SafeTravel.showToast('📋 Location copied!', 'success');
    }
  },

  /**
   * Share via email
   */
  async shareEmail() {
    const pos = LocationTracker.currentPosition;
    const profile = await Storage.getProfile();
    const trip = await Storage.getActiveTrip();

    const subject = encodeURIComponent(`🚨 EMERGENCY SOS: ${profile?.name || 'Traveler'} Needs Help!`);
    const body = encodeURIComponent(
      `EMERGENCY SOS ALERT\n\n` +
      `Name: ${profile?.name || 'N/A'}\n` +
      `Phone: ${profile?.phone || 'N/A'}\n` +
      `Blood Group: ${profile?.blood_group || 'N/A'}\n` +
      `Location: ${pos ? `https://www.google.com/maps?q=${pos.lat},${pos.lng}` : 'N/A'}\n` +
      `${trip?.vehicle_number ? `Vehicle: ${trip.vehicle_number}\n` : ''}` +
      `${trip?.driver_name ? `Driver: ${trip.driver_name}\n` : ''}` +
      `\nEmergency Numbers:\n112 (Police) | 1091 (Women) | 181 (Helpline)\n`
    );

    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  },

  /**
   * Reset SOS state
   */
  reset() {
    this.isActive = false;
    AudioManager.stopSiren();
  }
};
