/**
 * SafeTravel Server - Express + Socket.io
 * Industrial-grade travel safety backend with Dead Man's Switch
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

// Initialize database (creates tables if needed)
const { stmts } = require('./db/database');

// Initialize emergency handler
const EmergencyHandler = require('./routes/emergency');
const emergencyHandler = new EmergencyHandler();

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Initialize Dead Man's Switch
const DeadManSwitch = require('./dead-man-switch');
const deadManSwitch = new DeadManSwitch(io, emergencyHandler);

// Share with routes
app.deadManSwitch = deadManSwitch;
app.emergencyHandler = emergencyHandler;

// ─── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// ─── Live Tracking Page ───────────────────────────────────────
app.get('/track/:token', (req, res) => {
  const trip = stmts.getTripByToken.get(req.params.token);
  if (!trip) return res.status(404).send('Tracking link not found or expired');
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SafeTravel Live Tracking</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; }
    #map { height: 60vh; width: 100%; }
    .info-panel {
      padding: 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .status-active { background: rgba(0,230,118,0.15); color: #00e676; border: 1px solid rgba(0,230,118,0.3); }
    .status-emergency { background: rgba(255,23,68,0.15); color: #ff1744; border: 1px solid rgba(255,23,68,0.3); animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .detail-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .detail-card h3 { color: #ff6b35; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .detail-label { color: #999; }
    .detail-value { color: #fff; font-weight: 600; }
    .emergency-numbers { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
    .emergency-btn { display: block; padding: 12px; background: rgba(255,23,68,0.1); border: 1px solid rgba(255,23,68,0.3); border-radius: 8px; color: #ff6b35; text-decoration: none; text-align: center; font-weight: 600; }
    .emergency-btn:hover { background: rgba(255,23,68,0.2); }
    .header { background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
    .header h1 { font-size: 18px; color: #ff6b35; }
    .live-dot { width: 10px; height: 10px; border-radius: 50%; background: #00e676; animation: blink 1.5s infinite; }
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="live-dot"></div>
    <h1>SafeTravel Live Tracking</h1>
  </div>
  <div id="map"></div>
  <div class="info-panel">
    <div id="status"></div>
    <div class="detail-card">
      <h3>👤 Traveler</h3>
      <div id="traveler-info"></div>
    </div>
    <div class="detail-card">
      <h3>🚗 Vehicle</h3>
      <div id="vehicle-info"></div>
    </div>
    <div class="detail-card">
      <h3>📞 Emergency Numbers</h3>
      <div class="emergency-numbers">
        <a href="tel:112" class="emergency-btn">🚔 112 Police</a>
        <a href="tel:1091" class="emergency-btn">👩 1091 Women</a>
        <a href="tel:181" class="emergency-btn">📞 181 Helpline</a>
        <a href="tel:1098" class="emergency-btn">👶 1098 Child</a>
      </div>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const token = '${req.params.token}';
    const tripId = '${trip.id}';
    
    // Initialize map
    const map = L.map('map').setView([${trip.last_lat || 20.5937}, ${trip.last_lng || 78.9629}], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    // Markers
    let userMarker = null;
    const trailCoords = [];
    let trailLine = null;

    function updateMarker(lat, lng) {
      if (!userMarker) {
        const icon = L.divIcon({
          className: 'user-marker',
          html: '<div style="width:20px;height:20px;border-radius:50%;background:#4fc3f7;border:3px solid white;box-shadow:0 0 15px rgba(79,195,247,0.5);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        userMarker = L.marker([lat, lng], { icon }).addTo(map);
      } else {
        userMarker.setLatLng([lat, lng]);
      }
      trailCoords.push([lat, lng]);
      if (trailLine) map.removeLayer(trailLine);
      trailLine = L.polyline(trailCoords, { color: '#4fc3f7', weight: 3, opacity: 0.7 }).addTo(map);
      map.panTo([lat, lng]);
    }

    // Load initial data
    fetch('/api/track-data/' + token)
      .then(r => r.json())
      .then(data => {
        const statusEl = document.getElementById('status');
        const isEmergency = data.trip.status === 'emergency';
        statusEl.innerHTML = '<span class="status-badge ' + (isEmergency ? 'status-emergency' : 'status-active') + '">' + 
          (isEmergency ? '🚨 EMERGENCY' : '✅ Active Trip') + '</span>';
        
        document.getElementById('traveler-info').innerHTML =
          '<div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">' + (data.user?.name || 'N/A') + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">' + (data.user?.phone || 'N/A') + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">Blood Group</span><span class="detail-value" style="color:#ff6b35">' + (data.user?.blood_group || 'N/A') + '</span></div>';
        
        document.getElementById('vehicle-info').innerHTML =
          '<div class="detail-row"><span class="detail-label">Driver</span><span class="detail-value">' + (data.trip.driver_name || 'N/A') + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">Vehicle #</span><span class="detail-value" style="color:#ff6b35">' + (data.trip.vehicle_number || 'N/A') + '</span></div>';

        // Plot existing locations
        if (data.locations?.length) {
          data.locations.forEach(loc => updateMarker(loc.lat, loc.lng));
          map.fitBounds(trailLine.getBounds(), { padding: [30, 30] });
        } else if (data.trip.last_lat) {
          updateMarker(data.trip.last_lat, data.trip.last_lng);
        }
      });

    // Socket.io real-time updates
    const socket = io();
    socket.emit('join_tracking', { tripId });
    
    socket.on('location_update', (data) => {
      if (data.tripId === tripId) {
        updateMarker(data.lat, data.lng);
      }
    });

    socket.on('sos_triggered', (report) => {
      document.getElementById('status').innerHTML = 
        '<span class="status-badge status-emergency">🚨 EMERGENCY - SOS TRIGGERED</span>';
    });

    socket.on('heartbeat_warning', (data) => {
      if (data.tripId === tripId) {
        document.getElementById('status').innerHTML = 
          '<span class="status-badge status-emergency">⚠️ HEARTBEAT LOST (' + data.elapsed + 's)</span>';
      }
    });
  </script>
</body>
</html>`);
});

// ─── Socket.io Events ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Traveler sends heartbeat + location
  socket.on('heartbeat', (data) => {
    const { tripId, lat, lng, accuracy, speed, heading } = data;
    
    if (!tripId) return;

    try {
      const now = new Date().toISOString();
      
      // Update DB
      if (lat && lng) {
        stmts.insertLocation.run({
          trip_id: tripId, lat, lng,
          accuracy: accuracy || null,
          speed: speed || null,
          heading: heading || null
        });
        stmts.updateTripHeartbeat.run(now, lat, lng, tripId);
      } else {
        stmts.updateTripCheckin.run(now, tripId);
      }

      // Update dead man's switch
      deadManSwitch.recordHeartbeat(tripId);

      // Broadcast to tracking room
      if (lat && lng) {
        io.to(`track:${tripId}`).emit('location_update', {
          tripId, lat, lng, accuracy, speed, heading, timestamp: now
        });
      }
    } catch (err) {
      console.error('[Socket] Heartbeat error:', err.message);
    }
  });

  // Contact joins tracking room
  socket.on('join_tracking', (data) => {
    if (data.tripId) {
      socket.join(`track:${data.tripId}`);
      console.log(`[Socket] ${socket.id} joined tracking room: ${data.tripId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     🛡️  SafeTravel Server Running        ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log('  ║  🌐 http://localhost:' + PORT + '              ║');
  console.log('  ║  ⚡ Socket.io: Connected                 ║');
  console.log('  ║  🔒 Dead Man\'s Switch: Active            ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // Start dead man's switch monitor
  deadManSwitch.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  deadManSwitch.stop();
  server.close();
  process.exit(0);
});

module.exports = { app, server, io };
