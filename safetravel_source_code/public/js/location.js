/**
 * Location Module - GPS tracking + WebSocket heartbeat + Wake Lock
 */

const LocationTracker = {
  watchId: null,
  socket: null,
  wakeLock: null,
  currentPosition: null,
  locationHistory: [],
  heartbeatInterval: null,
  isTracking: false,
  tripId: null,

  /**
   * Start tracking with GPS and WebSocket
   */
  async start(tripId) {
    this.tripId = tripId;
    this.isTracking = true;
    this.locationHistory = [];

    // 1. Connect Socket.io
    this.socket = io();
    this.socket.on('connect', () => console.log('[Location] Socket connected'));
    this.socket.on('disconnect', () => console.log('[Location] Socket disconnected'));

    // 2. Request Wake Lock to keep GPS alive
    await this.requestWakeLock();

    // 3. Start GPS watching
    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.onPosition(pos),
        (err) => this.onError(err),
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000
        }
      );
      console.log('[Location] GPS watch started');
    } else {
      console.error('[Location] Geolocation not available');
    }

    // 4. Start heartbeat interval (sends to backend every 10s)
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 10000);
    
    console.log('[Location] Tracking started for trip:', tripId);
  },

  /**
   * Handle new GPS position
   */
  onPosition(pos) {
    this.currentPosition = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      timestamp: new Date().toISOString()
    };

    // Keep last 100 positions
    this.locationHistory.push(this.currentPosition);
    if (this.locationHistory.length > 100) {
      this.locationHistory.shift();
    }

    // Update map if active trip page is visible
    if (SafeTravel.currentPage === 'active-trip') {
      MapManager.setUserPosition('active-trip-map', 
        this.currentPosition.lat, 
        this.currentPosition.lng
      );
    }

    // Check route deviation
    if (SafeTravel.routeMonitor) {
      SafeTravel.routeMonitor.check(this.currentPosition);
    }
  },

  onError(err) {
    console.error('[Location] GPS error:', err.message);
  },

  /**
   * Send heartbeat + location to backend via WebSocket
   */
  sendHeartbeat() {
    if (!this.isTracking || !this.socket) return;

    const data = {
      tripId: this.tripId,
      ...(this.currentPosition || {})
    };

    // Try WebSocket first
    if (this.socket.connected) {
      this.socket.emit('heartbeat', data);
      this.updateHeartbeatStatus('Connected');
    } else {
      // Fallback to HTTP
      this.sendHTTPHeartbeat(data);
      this.updateHeartbeatStatus('HTTP Fallback');
    }
  },

  /**
   * HTTP fallback when WebSocket is down
   */
  async sendHTTPHeartbeat(data) {
    try {
      if (data.lat && data.lng) {
        await fetch(`/api/trip/${this.tripId}/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }
    } catch (err) {
      this.updateHeartbeatStatus('⚠️ Offline');
      console.error('[Location] HTTP heartbeat failed:', err);
    }
  },

  updateHeartbeatStatus(status) {
    const el = document.getElementById('trip-heartbeat-status');
    if (el) el.textContent = `Heartbeat: ${status}`;
  },

  /**
   * Request Screen Wake Lock to prevent background throttling
   */
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('[Location] Wake Lock acquired');
        
        // Re-acquire on visibility change (lock releases when tab hidden)
        document.addEventListener('visibilitychange', async () => {
          if (this.isTracking && document.visibilityState === 'visible') {
            try {
              this.wakeLock = await navigator.wakeLock.request('screen');
              console.log('[Location] Wake Lock re-acquired');
            } catch (e) {}
          }
        });
      } catch (err) {
        console.warn('[Location] Wake Lock failed:', err.message);
      }
    } else {
      console.warn('[Location] Wake Lock API not supported');
    }
  },

  /**
   * Release Wake Lock
   */
  async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        console.log('[Location] Wake Lock released');
      } catch (e) {}
    }
  },

  /**
   * Get current position (one-shot, returns promise)
   */
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (this.currentPosition) {
        resolve(this.currentPosition);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: new Date().toISOString()
          };
          this.currentPosition = position;
          resolve(position);
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  },

  /**
   * Stop all tracking
   */
  async stop() {
    this.isTracking = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    await this.releaseWakeLock();

    console.log('[Location] Tracking stopped');
  }
};
