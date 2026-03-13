/**
 * Map Module - Leaflet + OpenStreetMap
 */

const MapManager = {
  maps: {},        // { mapId: L.map instance }
  markers: {},     // { mapId: { user, origin, dest } }
  routeLines: {},  // { mapId: L.polyline }
  trailLines: {},  // { mapId: L.polyline }

  /**
   * Initialize a Leaflet map in a container
   */
  init(containerId, options = {}) {
    const el = document.getElementById(containerId);
    if (!el || this.maps[containerId]) return this.maps[containerId];

    const map = L.map(containerId, {
      center: options.center || [20.5937, 78.9629], // India center
      zoom: options.zoom || 5,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    this.maps[containerId] = map;
    this.markers[containerId] = {};

    // Fix map rendering after container becomes visible
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    return map;
  },

  /**
   * Update user position marker (animated blue dot)
   */
  setUserPosition(mapId, lat, lng) {
    const map = this.maps[mapId];
    if (!map) return;

    if (!this.markers[mapId].user) {
      const icon = L.divIcon({
        className: 'user-position-marker-wrapper',
        html: '<div class="user-position-marker"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      this.markers[mapId].user = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
    } else {
      this.markers[mapId].user.setLatLng([lat, lng]);
    }

    // Add point to trail
    this.addTrailPoint(mapId, lat, lng);
  },

  /**
   * Add a point to the user's trail
   */
  addTrailPoint(mapId, lat, lng) {
    const map = this.maps[mapId];
    if (!map) return;

    if (!this.trailLines[mapId]) {
      this.trailLines[mapId] = L.polyline([], {
        color: '#4fc3f7',
        weight: 3,
        opacity: 0.6,
        dashArray: '5, 10'
      }).addTo(map);
    }
    this.trailLines[mapId].addLatLng([lat, lng]);
  },

  /**
   * Draw planned route polyline (green)
   */
  drawRoute(mapId, coordinates) {
    const map = this.maps[mapId];
    if (!map) return;

    if (this.routeLines[mapId]) {
      map.removeLayer(this.routeLines[mapId]);
    }

    // OSRM returns [lng, lat], Leaflet needs [lat, lng]
    const latLngs = coordinates.map(c => [c[1], c[0]]);

    this.routeLines[mapId] = L.polyline(latLngs, {
      color: '#00e676',
      weight: 4,
      opacity: 0.7
    }).addTo(map);

    map.fitBounds(this.routeLines[mapId].getBounds(), { padding: [30, 30] });
  },

  /**
   * Set origin marker (green)
   */
  setOrigin(mapId, lat, lng, label) {
    const map = this.maps[mapId];
    if (!map) return;

    if (this.markers[mapId].origin) {
      map.removeLayer(this.markers[mapId].origin);
    }

    const icon = L.divIcon({
      className: 'origin-marker',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#00e676;border:3px solid white;box-shadow:0 0 10px rgba(0,230,118,0.5);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    this.markers[mapId].origin = L.marker([lat, lng], { icon })
      .bindPopup(`<b>Origin</b><br>${label || ''}`)
      .addTo(map);
  },

  /**
   * Set destination marker (red)
   */
  setDestination(mapId, lat, lng, label) {
    const map = this.maps[mapId];
    if (!map) return;

    if (this.markers[mapId].dest) {
      map.removeLayer(this.markers[mapId].dest);
    }

    const icon = L.divIcon({
      className: 'dest-marker',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#ff1744;border:3px solid white;box-shadow:0 0 10px rgba(255,23,68,0.5);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    this.markers[mapId].dest = L.marker([lat, lng], { icon })
      .bindPopup(`<b>Destination</b><br>${label || ''}`)
      .addTo(map);
  },

  /**
   * Center map on coordinates
   */
  centerOn(mapId, lat, lng, zoom) {
    const map = this.maps[mapId];
    if (map) map.setView([lat, lng], zoom || 14);
  },

  /**
   * Setup click-to-set-location handlers for trip setup
   */
  setupLocationPicker(mapId, onSelect) {
    const map = this.maps[mapId];
    if (!map) return;

    let clickCount = 0;
    map.on('click', (e) => {
      clickCount++;
      const type = clickCount % 2 === 1 ? 'origin' : 'destination';
      
      if (type === 'origin') {
        this.setOrigin(mapId, e.latlng.lat, e.latlng.lng);
      } else {
        this.setDestination(mapId, e.latlng.lat, e.latlng.lng);
      }

      onSelect(type, e.latlng.lat, e.latlng.lng);
    });
  },

  /**
   * Destroy a map instance
   */
  destroy(mapId) {
    const map = this.maps[mapId];
    if (map) {
      map.remove();
      delete this.maps[mapId];
      delete this.markers[mapId];
      delete this.routeLines[mapId];
      delete this.trailLines[mapId];
    }
  },

  /**
   * Invalidate size (call after container becomes visible)
   */
  refresh(mapId) {
    const map = this.maps[mapId];
    if (map) {
      setTimeout(() => map.invalidateSize(), 50);
      setTimeout(() => map.invalidateSize(), 300);
    }
  }
};
