/**
 * Dead Man's Switch - Backend Heartbeat Monitor
 * 
 * The SERVER owns the check-in timer. If no heartbeat is received
 * within the user's configured threshold + grace period, SOS fires
 * automatically — even if the phone is destroyed.
 */

const { stmts } = require('./db/database');

class DeadManSwitch {
  constructor(io, emergencyHandler) {
    this.io = io;
    this.emergencyHandler = emergencyHandler;
    this.activeTrips = new Map(); // tripId -> { interval, threshold, graceMs, userId }
    this.checkInterval = null;
  }

  start() {
    // Check all active trips every second
    this.checkInterval = setInterval(() => this.checkAllTrips(), 1000);
    console.log('[DeadManSwitch] Monitor started — checking every 1s');

    // Load any active trips from DB on restart
    this.loadActiveTrips();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.activeTrips.clear();
    console.log('[DeadManSwitch] Monitor stopped');
  }

  loadActiveTrips() {
    try {
      const trips = stmts.getActiveTrips.all();
      for (const trip of trips) {
        this.registerTrip(trip.id, trip.user_id, trip.checkin_interval, trip.miss_timeout);
        console.log(`[DeadManSwitch] Loaded active trip: ${trip.id}`);
      }
    } catch (err) {
      console.error('[DeadManSwitch] Error loading active trips:', err.message);
    }
  }

  registerTrip(tripId, userId, checkinInterval, missTimeout) {
    // Total time before auto-SOS = checkinInterval + missTimeout + 15s grace
    const totalThreshold = checkinInterval + missTimeout + 15000;
    
    this.activeTrips.set(tripId, {
      userId,
      checkinInterval,
      missTimeout,
      totalThreshold,
      lastActivity: Date.now(),
      warned: false
    });
    
    console.log(`[DeadManSwitch] Registered trip ${tripId} | threshold: ${totalThreshold / 1000}s`);
  }

  recordHeartbeat(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (trip) {
      trip.lastActivity = Date.now();
      trip.warned = false;
    }
  }

  recordCheckin(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (trip) {
      trip.lastActivity = Date.now();
      trip.warned = false;
    }
  }

  deregisterTrip(tripId) {
    this.activeTrips.delete(tripId);
    console.log(`[DeadManSwitch] Deregistered trip ${tripId}`);
  }

  checkAllTrips() {
    const now = Date.now();

    for (const [tripId, trip] of this.activeTrips) {
      const elapsed = now - trip.lastActivity;

      // Warning phase: heartbeat lost for more than checkin interval
      if (!trip.warned && elapsed > trip.checkinInterval) {
        trip.warned = true;
        console.log(`[DeadManSwitch] ⚠️ Trip ${tripId}: heartbeat lost for ${Math.round(elapsed / 1000)}s`);
        
        // Emit warning to any connected tracking clients
        this.io.to(`track:${tripId}`).emit('heartbeat_warning', {
          tripId,
          elapsed: Math.round(elapsed / 1000),
          threshold: Math.round(trip.totalThreshold / 1000)
        });
      }

      // SOS phase: exceeded total threshold
      if (elapsed > trip.totalThreshold) {
        console.log(`[DeadManSwitch] 🚨 Trip ${tripId}: AUTO-SOS TRIGGERED (${Math.round(elapsed / 1000)}s without heartbeat)`);
        
        this.triggerAutoSOS(tripId, trip);
        this.deregisterTrip(tripId);
      }
    }
  }

  async triggerAutoSOS(tripId, tripMeta) {
    try {
      // Get full trip details from DB
      const trip = stmts.getTrip.get(tripId);
      if (!trip) return;

      const user = stmts.getUser.get(trip.user_id);
      const contacts = stmts.getUserContacts.all(trip.user_id);
      const lastLocation = stmts.getLastLocation.get(tripId);

      // Update trip status
      stmts.updateTripStatus.run('emergency', tripId);

      // Build emergency report
      const report = {
        triggerType: 'auto_deadman_switch',
        timestamp: new Date().toISOString(),
        user: user ? {
          name: user.name,
          phone: user.phone,
          email: user.email,
          blood_group: user.blood_group,
          medical_info: user.medical_info,
          hasPhoto: !!user.photo
        } : null,
        trip: {
          id: trip.id,
          driver_name: trip.driver_name,
          vehicle_number: trip.vehicle_number,
          tracking_token: trip.tracking_token,
          origin: { lat: trip.origin_lat, lng: trip.origin_lng, name: trip.origin_name },
          destination: { lat: trip.dest_lat, lng: trip.dest_lng, name: trip.dest_name }
        },
        lastKnownLocation: lastLocation ? {
          lat: lastLocation.lat,
          lng: lastLocation.lng,
          accuracy: lastLocation.accuracy,
          timestamp: lastLocation.timestamp
        } : { lat: trip.last_lat, lng: trip.last_lng },
        mapsLink: lastLocation 
          ? `https://www.google.com/maps?q=${lastLocation.lat},${lastLocation.lng}`
          : `https://www.google.com/maps?q=${trip.last_lat},${trip.last_lng}`
      };

      // Fire emergency handler
      await this.emergencyHandler.handleSOS(report, contacts, user, trip);

      // Broadcast to tracking room
      this.io.to(`track:${tripId}`).emit('sos_triggered', report);

      console.log(`[DeadManSwitch] 🚨 SOS executed for trip ${tripId}`);
    } catch (err) {
      console.error(`[DeadManSwitch] ERROR triggering SOS for trip ${tripId}:`, err);
    }
  }
}

module.exports = DeadManSwitch;
