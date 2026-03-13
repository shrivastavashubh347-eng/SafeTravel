/**
 * Route Monitor - Turf.js offline route deviation detection
 * Fetches OSRM route once, then checks deviation locally
 */

const RouteMonitor = {
  routeGeoJSON: null,  // Stored route polyline
  isMonitoring: false,
  lastDeviation: null,
  deviationCallbacks: [],

  /**
   * Fetch route from OSRM and start monitoring
   */
  async start(originLng, originLat, destLng, destLat) {
    try {
      // Fetch route from OSRM (one-time)
      const origin = `${originLng},${originLat}`;
      const dest = `${destLng},${destLat}`;
      
      const response = await fetch(`/api/route?origin=${origin}&destination=${dest}`);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
        console.warn('[RouteMonitor] Failed to get route from OSRM');
        return false;
      }

      // Store the route as a Turf.js line
      this.routeGeoJSON = turf.lineString(data.routes[0].geometry.coordinates);
      this.isMonitoring = true;

      // Draw route on map
      MapManager.drawRoute('active-trip-map', data.routes[0].geometry.coordinates);

      console.log('[RouteMonitor] Route loaded, monitoring started');
      return true;
    } catch (err) {
      console.error('[RouteMonitor] Error fetching route:', err);
      return false;
    }
  },

  /**
   * Check current position against route (called on every GPS update)
   * Uses Turf.js for client-side spatial analysis — NO network needed
   */
  check(position) {
    if (!this.isMonitoring || !this.routeGeoJSON) return;

    try {
      const point = turf.point([position.lng, position.lat]);
      
      // Calculate distance from current position to nearest point on route
      const deviation = turf.pointToLineDistance(point, this.routeGeoJSON, { units: 'meters' });
      
      this.lastDeviation = deviation;

      const alertEl = document.getElementById('route-alert');
      const alertText = document.getElementById('route-alert-text');

      if (deviation > 1000) {
        // CRITICAL: > 1km deviation
        if (alertEl) {
          alertEl.style.display = 'block';
          alertEl.className = 'route-alert critical';
          alertText.textContent = `🚨 ROUTE DEVIATION: ${Math.round(deviation)}m off route!`;
        }
        this.notify('critical', deviation);
      } else if (deviation > 500) {
        // WARNING: 500m - 1km
        if (alertEl) {
          alertEl.style.display = 'block';
          alertEl.className = 'route-alert';
          alertText.textContent = `⚠️ Off route by ${Math.round(deviation)}m`;
        }
        this.notify('warning', deviation);
      } else {
        // OK: within 500m
        if (alertEl) alertEl.style.display = 'none';
      }
    } catch (err) {
      console.error('[RouteMonitor] Check error:', err);
    }
  },

  notify(level, deviation) {
    // Vibrate on deviation
    if ('vibrate' in navigator) {
      if (level === 'critical') {
        navigator.vibrate([200, 100, 200, 100, 200]);
      } else {
        navigator.vibrate([200]);
      }
    }

    // Play alert sound
    if (level === 'critical') {
      AudioManager.playBeep(1000, 500);
    } else {
      AudioManager.playBeep(600, 200);
    }

    // Notify callbacks
    for (const cb of this.deviationCallbacks) {
      cb(level, deviation);
    }
  },

  /**
   * Register callback for deviation events
   */
  onDeviation(callback) {
    this.deviationCallbacks.push(callback);
  },

  /**
   * Get current deviation in meters
   */
  getDeviation() {
    return this.lastDeviation;
  },

  /**
   * Stop monitoring
   */
  stop() {
    this.isMonitoring = false;
    this.routeGeoJSON = null;
    this.lastDeviation = null;
    this.deviationCallbacks = [];
    console.log('[RouteMonitor] Stopped');
  }
};
