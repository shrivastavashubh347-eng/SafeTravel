/**
 * API Routes - Trip, User, Location management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const multer = require('multer');
const { stmts } = require('../db/database');

const router = express.Router();

// Multer for photo uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ─── User Profile ─────────────────────────────────────────────

// Create or update user profile
router.post('/user', upload.single('photo'), (req, res) => {
  try {
    const { name, phone, email, blood_group, medical_info, contacts } = req.body;
    const id = req.body.id || uuidv4();
    const photo = req.file ? req.file.buffer : null;

    stmts.upsertUser.run({
      id, name, phone, email,
      blood_group: blood_group || null,
      medical_info: medical_info || null,
      photo
    });

    // Update emergency contacts
    if (contacts) {
      const contactList = typeof contacts === 'string' ? JSON.parse(contacts) : contacts;
      stmts.deleteUserContacts.run(id);
      for (const contact of contactList) {
        stmts.insertContact.run({
          user_id: id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email || null,
          relationship: contact.relationship || null
        });
      }
    }

    const user = stmts.getUser.get(id);
    const userContacts = stmts.getUserContacts.all(id);

    res.json({ 
      success: true, 
      user: { ...user, photo: user.photo ? true : false },
      contacts: userContacts
    });
  } catch (err) {
    console.error('[API] User save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user profile
router.get('/user/:id', (req, res) => {
  try {
    const user = stmts.getUser.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const contacts = stmts.getUserContacts.all(req.params.id);
    res.json({ 
      user: { ...user, photo: user.photo ? Buffer.from(user.photo).toString('base64') : null },
      contacts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user photo
router.get('/user/:id/photo', (req, res) => {
  try {
    const user = stmts.getUser.get(req.params.id);
    if (!user || !user.photo) return res.status(404).send('No photo');
    res.set('Content-Type', 'image/jpeg');
    res.send(user.photo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trip Management ──────────────────────────────────────────

// Create and start a trip
router.post('/trip', upload.fields([
  { name: 'driver_photo', maxCount: 1 },
  { name: 'vehicle_photo', maxCount: 1 }
]), (req, res) => {
  try {
    const {
      user_id, origin_lat, origin_lng, origin_name,
      dest_lat, dest_lng, dest_name,
      driver_name, vehicle_number,
      checkin_interval, miss_timeout, route_geojson
    } = req.body;

    const id = uuidv4();
    const tracking_token = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();

    const driverPhoto = req.files?.driver_photo?.[0]?.buffer || null;
    const vehiclePhoto = req.files?.vehicle_photo?.[0]?.buffer || null;

    stmts.insertTrip.run({
      id, user_id,
      origin_lat: parseFloat(origin_lat) || null,
      origin_lng: parseFloat(origin_lng) || null,
      origin_name: origin_name || null,
      dest_lat: parseFloat(dest_lat) || null,
      dest_lng: parseFloat(dest_lng) || null,
      dest_name: dest_name || null,
      driver_name: driver_name || null,
      driver_photo: driverPhoto,
      vehicle_photo: vehiclePhoto,
      vehicle_number: vehicle_number || null,
      checkin_interval: parseInt(checkin_interval) || 600000,
      miss_timeout: parseInt(miss_timeout) || 60000,
      route_geojson: route_geojson || null,
      tracking_token,
      status: 'active',
      last_heartbeat: now,
      last_lat: parseFloat(origin_lat) || null,
      last_lng: parseFloat(origin_lng) || null,
      started_at: now
    });

    // Register with dead man's switch (via app reference)
    if (req.app.deadManSwitch) {
      req.app.deadManSwitch.registerTrip(
        id, user_id,
        parseInt(checkin_interval) || 600000,
        parseInt(miss_timeout) || 60000
      );
    }

    const trip = stmts.getTrip.get(id);

    res.json({
      success: true,
      trip: {
        ...trip,
        driver_photo: !!trip.driver_photo,
        vehicle_photo: !!trip.vehicle_photo,
        tracking_token,
        tracking_url: `/track/${tracking_token}`
      }
    });
  } catch (err) {
    console.error('[API] Trip create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get trip details
router.get('/trip/:id', (req, res) => {
  try {
    const trip = stmts.getTrip.get(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const locations = stmts.getRecentLocations.all(req.params.id, 100);

    res.json({
      trip: {
        ...trip,
        driver_photo: trip.driver_photo ? Buffer.from(trip.driver_photo).toString('base64') : null,
        vehicle_photo: trip.vehicle_photo ? Buffer.from(trip.vehicle_photo).toString('base64') : null
      },
      locations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// End a trip
router.put('/trip/:id/end', (req, res) => {
  try {
    stmts.updateTripStatus.run('completed', req.params.id);
    
    if (req.app.deadManSwitch) {
      req.app.deadManSwitch.deregisterTrip(req.params.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record check-in (user confirmed safe)
router.post('/trip/:id/checkin', (req, res) => {
  try {
    const now = new Date().toISOString();
    stmts.updateTripCheckin.run(now, req.params.id);
    
    if (req.app.deadManSwitch) {
      req.app.deadManSwitch.recordCheckin(req.params.id);
    }

    res.json({ success: true, timestamp: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update location
router.put('/trip/:id/location', (req, res) => {
  try {
    const { lat, lng, accuracy, speed, heading } = req.body;
    const now = new Date().toISOString();

    stmts.insertLocation.run({
      trip_id: req.params.id,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      accuracy: parseFloat(accuracy) || null,
      speed: parseFloat(speed) || null,
      heading: parseFloat(heading) || null
    });

    stmts.updateTripHeartbeat.run(now, parseFloat(lat), parseFloat(lng), req.params.id);

    if (req.app.deadManSwitch) {
      req.app.deadManSwitch.recordHeartbeat(req.params.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── OSRM Route Proxy ────────────────────────────────────────

router.get('/route', async (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'origin and destination required (lng,lat format)' });
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${origin};${destination}?overview=full&geometries=geojson&steps=true`;
    
    const response = await fetch(url);
    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error('[API] Route proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch route' });
  }
});

// ─── Manual SOS ───────────────────────────────────────────────

router.post('/emergency/sos', async (req, res) => {
  try {
    const { trip_id, user_id, trigger_type } = req.body;

    const trip = stmts.getTrip.get(trip_id);
    const user = stmts.getUser.get(user_id);
    const contacts = stmts.getUserContacts.all(user_id);
    const lastLocation = stmts.getLastLocation.get(trip_id);

    if (trip) {
      stmts.updateTripStatus.run('emergency', trip_id);
      if (req.app.deadManSwitch) {
        req.app.deadManSwitch.deregisterTrip(trip_id);
      }
    }

    const report = {
      triggerType: trigger_type || 'manual',
      timestamp: new Date().toISOString(),
      user: user ? {
        name: user.name, phone: user.phone, email: user.email,
        blood_group: user.blood_group, medical_info: user.medical_info,
        hasPhoto: !!user.photo
      } : null,
      trip: trip ? {
        id: trip.id, driver_name: trip.driver_name,
        vehicle_number: trip.vehicle_number, tracking_token: trip.tracking_token,
        origin: { lat: trip.origin_lat, lng: trip.origin_lng, name: trip.origin_name },
        destination: { lat: trip.dest_lat, lng: trip.dest_lng, name: trip.dest_name }
      } : null,
      lastKnownLocation: lastLocation ? {
        lat: lastLocation.lat, lng: lastLocation.lng,
        accuracy: lastLocation.accuracy, timestamp: lastLocation.timestamp
      } : (trip ? { lat: trip.last_lat, lng: trip.last_lng } : null),
      mapsLink: lastLocation
        ? `https://www.google.com/maps?q=${lastLocation.lat},${lastLocation.lng}`
        : (trip ? `https://www.google.com/maps?q=${trip.last_lat},${trip.last_lng}` : null)
    };

    const result = await req.app.emergencyHandler.handleSOS(report, contacts, user, trip || { id: 'none', user_id, tracking_token: 'none' });

    res.json({ success: true, report, ...result });
  } catch (err) {
    console.error('[API] SOS error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Tracking data for live link ──────────────────────────────

router.get('/track-data/:token', (req, res) => {
  try {
    const trip = stmts.getTripByToken.get(req.params.token);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const user = stmts.getUser.get(trip.user_id);
    const locations = stmts.getRecentLocations.all(trip.id, 200);

    res.json({
      trip: {
        id: trip.id,
        status: trip.status,
        origin: { lat: trip.origin_lat, lng: trip.origin_lng, name: trip.origin_name },
        destination: { lat: trip.dest_lat, lng: trip.dest_lng, name: trip.dest_name },
        driver_name: trip.driver_name,
        vehicle_number: trip.vehicle_number,
        last_lat: trip.last_lat,
        last_lng: trip.last_lng,
        started_at: trip.started_at
      },
      user: user ? {
        name: user.name, phone: user.phone,
        blood_group: user.blood_group
      } : null,
      locations: locations.reverse()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
