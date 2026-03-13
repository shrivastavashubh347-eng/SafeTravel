/**
 * Trip Module - Trip management, driver/vehicle uploads, profile handling
 */

const TripManager = {
  selectedInterval: 600000,
  selectedMissTimeout: 60000,
  setupMapInitialized: false,

  /**
   * Select check-in interval
   */
  selectInterval(btn) {
    document.querySelectorAll('#checkin-interval-selector .interval-option')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.selectedInterval = parseInt(btn.dataset.ms);
  },

  /**
   * Select miss timeout
   */
  selectMissTimeout(btn) {
    document.querySelectorAll('#miss-timeout-selector .interval-option')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.selectedMissTimeout = parseInt(btn.dataset.ms);
  },

  /**
   * Initialize the trip setup map
   */
  initSetupMap() {
    if (this.setupMapInitialized) {
      MapManager.refresh('trip-setup-map');
      return;
    }

    const map = MapManager.init('trip-setup-map', { zoom: 5 });
    if (!map) return;

    // Try to center on user's location
    LocationTracker.getCurrentPosition().then(pos => {
      MapManager.centerOn('trip-setup-map', pos.lat, pos.lng, 12);
    }).catch(() => {});

    // Setup click-to-set-location
    MapManager.setupLocationPicker('trip-setup-map', (type, lat, lng) => {
      if (type === 'origin') {
        document.getElementById('trip-origin-lat').value = lat;
        document.getElementById('trip-origin-lng').value = lng;
        document.getElementById('trip-origin-name').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      } else {
        document.getElementById('trip-dest-lat').value = lat;
        document.getElementById('trip-dest-lng').value = lng;
        document.getElementById('trip-dest-name').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    });

    this.setupMapInitialized = true;
  },

  /**
   * Preview uploaded photo
   */
  previewPhoto(input, previewId) {
    const preview = document.getElementById(previewId);
    if (!preview || !input.files || !input.files[0]) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
  },

  /**
   * Save user profile
   */
  async saveProfile(event) {
    event.preventDefault();

    const profile = await Storage.getProfile();
    const id = profile.id || crypto.randomUUID();

    // Collect form data
    const formData = new FormData();
    formData.append('id', id);
    formData.append('name', document.getElementById('profile-name').value);
    formData.append('phone', document.getElementById('profile-phone').value);
    formData.append('email', document.getElementById('profile-email').value || '');
    formData.append('blood_group', document.getElementById('profile-blood').value);
    formData.append('medical_info', document.getElementById('profile-medical').value);

    // Photo
    const photoInput = document.querySelector('#profile-photo-upload input[type="file"]');
    if (photoInput.files[0]) {
      formData.append('photo', photoInput.files[0]);
    }

    // Emergency contacts
    const contacts = this.collectContacts();
    formData.append('contacts', JSON.stringify(contacts));

    try {
      const response = await fetch('/api/user', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (result.success) {
        // Save locally too
        await Storage.saveProfile({
          id,
          name: document.getElementById('profile-name').value,
          phone: document.getElementById('profile-phone').value,
          email: document.getElementById('profile-email').value,
          blood_group: document.getElementById('profile-blood').value,
          medical_info: document.getElementById('profile-medical').value,
          contacts
        });

        SafeTravel.showToast('✅ Profile saved!', 'success');
      }
    } catch (err) {
      console.error('[Trip] Profile save error:', err);
      // Still save locally
      await Storage.saveProfile({
        id,
        name: document.getElementById('profile-name').value,
        phone: document.getElementById('profile-phone').value,
        email: document.getElementById('profile-email').value,
        blood_group: document.getElementById('profile-blood').value,
        medical_info: document.getElementById('profile-medical').value,
        contacts
      });
      SafeTravel.showToast('💾 Saved locally (server unreachable)', 'warning');
    }
  },

  /**
   * Load profile into form
   */
  async loadProfile() {
    const profile = await Storage.getProfile();
    if (!profile || !profile.name) return;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('profile-name', profile.name);
    setVal('profile-phone', profile.phone);
    setVal('profile-email', profile.email);
    setVal('profile-blood', profile.blood_group);
    setVal('profile-medical', profile.medical_info);

    // Load contacts
    const contactsList = document.getElementById('contacts-list');
    if (contactsList && profile.contacts) {
      contactsList.innerHTML = '';
      profile.contacts.forEach(c => this.addContactField(c));
    }
  },

  /**
   * Add emergency contact field
   */
  addContactField(data = {}) {
    const list = document.getElementById('contacts-list');
    if (!list) return;

    const existing = list.querySelectorAll('.contact-entry');
    if (existing.length >= 5) {
      SafeTravel.showToast('Maximum 5 contacts allowed', 'warning');
      return;
    }

    const idx = existing.length;
    const div = document.createElement('div');
    div.className = 'contact-entry card';
    div.style.padding = '12px';
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:13px; font-weight:600; color:var(--accent-orange);">Contact ${idx + 1}</span>
        <button type="button" class="contact-remove" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
      <div class="form-group" style="margin-bottom:8px;">
        <input type="text" class="form-input contact-name-input" placeholder="Name" value="${data.name || ''}" style="padding:8px 12px; font-size:13px;">
      </div>
      <div class="form-row" style="gap:8px;">
        <div class="form-group" style="margin-bottom:0;">
          <input type="tel" class="form-input contact-phone-input" placeholder="Phone" value="${data.phone || ''}" style="padding:8px 12px; font-size:13px;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <input type="email" class="form-input contact-email-input" placeholder="Email" value="${data.email || ''}" style="padding:8px 12px; font-size:13px;">
        </div>
      </div>
      <div class="form-group" style="margin-top:8px; margin-bottom:0;">
        <input type="text" class="form-input contact-relation-input" placeholder="Relationship (e.g. Mother, Friend)" value="${data.relationship || ''}" style="padding:8px 12px; font-size:13px;">
      </div>
    `;
    list.appendChild(div);
  },

  /**
   * Collect contacts from form
   */
  collectContacts() {
    const entries = document.querySelectorAll('.contact-entry');
    const contacts = [];
    entries.forEach(entry => {
      const name = entry.querySelector('.contact-name-input')?.value;
      const phone = entry.querySelector('.contact-phone-input')?.value;
      const email = entry.querySelector('.contact-email-input')?.value;
      const relationship = entry.querySelector('.contact-relation-input')?.value;
      if (name && phone) {
        contacts.push({ name, phone, email, relationship });
      }
    });
    return contacts;
  },

  /**
   * Start a trip
   */
  async startTrip(event) {
    event.preventDefault();

    const profile = await Storage.getProfile();
    if (!profile || !profile.name) {
      SafeTravel.showToast('⚠️ Please set up your profile first', 'warning');
      SafeTravel.navigateTo('profile');
      return;
    }

    const originLat = document.getElementById('trip-origin-lat').value;
    const originLng = document.getElementById('trip-origin-lng').value;
    const destLat = document.getElementById('trip-dest-lat').value;
    const destLng = document.getElementById('trip-dest-lng').value;

    // Build form data with photos
    const formData = new FormData();
    formData.append('user_id', profile.id);
    formData.append('origin_lat', originLat);
    formData.append('origin_lng', originLng);
    formData.append('origin_name', document.getElementById('trip-origin-name').value);
    formData.append('dest_lat', destLat);
    formData.append('dest_lng', destLng);
    formData.append('dest_name', document.getElementById('trip-dest-name').value);
    formData.append('driver_name', document.getElementById('trip-driver-name').value);
    formData.append('vehicle_number', document.getElementById('trip-vehicle-number').value);
    formData.append('checkin_interval', this.selectedInterval);
    formData.append('miss_timeout', this.selectedMissTimeout);

    const driverPhoto = document.getElementById('trip-driver-photo').files[0];
    const vehiclePhoto = document.getElementById('trip-vehicle-photo').files[0];
    if (driverPhoto) formData.append('driver_photo', driverPhoto);
    if (vehiclePhoto) formData.append('vehicle_photo', vehiclePhoto);

    try {
      const response = await fetch('/api/trip', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (result.success) {
        // Save to local storage
        await Storage.saveActiveTrip({
          id: result.trip.id,
          tracking_token: result.trip.tracking_token,
          tracking_url: result.trip.tracking_url,
          driver_name: document.getElementById('trip-driver-name').value,
          vehicle_number: document.getElementById('trip-vehicle-number').value,
          driver_photo: driverPhoto ? await this.fileToDataURL(driverPhoto) : null,
          vehicle_photo: vehiclePhoto ? await this.fileToDataURL(vehiclePhoto) : null,
          checkin_interval: this.selectedInterval,
          miss_timeout: this.selectedMissTimeout,
          originLat, originLng, destLat, destLng
        });

        // Update stats
        const stats = await Storage.getStats();
        stats.trips = (stats.trips || 0) + 1;
        await Storage.updateStats(stats);

        // Initialize audio (user gesture — critical for autoplay)
        AudioManager.init();

        // Start location tracking + heartbeat
        await LocationTracker.start(result.trip.id);

        // Start check-in timer
        CheckinManager.start(this.selectedInterval, this.selectedMissTimeout);

        // Start route monitoring if both points set
        if (originLat && originLng && destLat && destLng) {
          SafeTravel.routeMonitor = RouteMonitor;
          RouteMonitor.start(originLng, originLat, destLng, destLat);
        }

        // Navigate to active trip
        SafeTravel.navigateTo('active-trip');
        SafeTravel.showToast('🛡️ Trip started! Stay safe.', 'success');

        console.log('[Trip] Trip started:', result.trip.id);
      }
    } catch (err) {
      console.error('[Trip] Start error:', err);
      SafeTravel.showToast('❌ Failed to start trip', 'error');
    }
  },

  /**
   * Initialize active trip dashboard
   */
  async initActiveTripDashboard() {
    const trip = await Storage.getActiveTrip();
    if (!trip) {
      SafeTravel.navigateTo('home');
      return;
    }

    // Init map
    setTimeout(() => {
      MapManager.init('active-trip-map', { zoom: 14 });
      MapManager.refresh('active-trip-map');

      // Show user position
      if (LocationTracker.currentPosition) {
        MapManager.setUserPosition('active-trip-map',
          LocationTracker.currentPosition.lat,
          LocationTracker.currentPosition.lng
        );
        MapManager.centerOn('active-trip-map',
          LocationTracker.currentPosition.lat,
          LocationTracker.currentPosition.lng,
          14
        );
      }
    }, 200);

    // Show driver details
    if (trip.driver_name) {
      document.getElementById('trip-driver-card').style.display = 'block';
      document.getElementById('trip-active-driver-name').textContent = trip.driver_name;
      document.getElementById('trip-active-vehicle-number').textContent = trip.vehicle_number || '—';

      if (trip.driver_photo) {
        const driverImg = document.getElementById('trip-active-driver-photo');
        driverImg.src = trip.driver_photo;
        driverImg.style.display = 'block';
      }
      if (trip.vehicle_photo) {
        const vehicleImg = document.getElementById('trip-active-vehicle-photo');
        vehicleImg.src = trip.vehicle_photo;
        vehicleImg.style.display = 'block';
      }
    }
  },

  /**
   * End current trip
   */
  async endTrip() {
    const trip = await Storage.getActiveTrip();
    if (!trip) return;

    if (!confirm('End this trip? Protection will be deactivated.')) return;

    try {
      await fetch(`/api/trip/${trip.id}/end`, { method: 'PUT' });
    } catch (err) {
      console.error('[Trip] End trip error:', err);
    }

    // Stop all systems
    CheckinManager.stop();
    LocationTracker.stop();
    RouteMonitor.stop();
    AudioManager.destroy();
    SOSManager.reset();

    // Clear active trip
    await Storage.clearActiveTrip();

    // Update stats
    const stats = await Storage.getStats();
    stats.hours = (stats.hours || 0) + 1;
    await Storage.updateStats(stats);

    // Navigate home
    SafeTravel.navigateTo('home');
    SafeTravel.showToast('✅ Trip ended safely', 'success');
  },

  /**
   * Toggle battery saver mode
   */
  toggleBatterySaver(enabled) {
    if (enabled) {
      document.body.classList.add('battery-saver');
    } else {
      document.body.classList.remove('battery-saver');
    }
  },

  /**
   * Share tracking link via WhatsApp
   */
  async shareWhatsApp() {
    const trip = await Storage.getActiveTrip();
    if (!trip || !trip.tracking_url) return;

    const url = `${window.location.origin}${trip.tracking_url}`;
    const profile = await Storage.getProfile();
    const message = encodeURIComponent(
      `🛡️ Track my trip live!\n\n` +
      `${profile?.name || 'I'} is traveling and sharing their live location for safety.\n\n` +
      `📍 Track here: ${url}\n\n` +
      `— SafeTravel`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  },

  /**
   * Copy tracking link
   */
  async copyTrackingLink() {
    const trip = await Storage.getActiveTrip();
    if (!trip || !trip.tracking_url) return;

    const url = `${window.location.origin}${trip.tracking_url}`;
    try {
      await navigator.clipboard.writeText(url);
      SafeTravel.showToast('📋 Tracking link copied!', 'success');
    } catch (err) {
      SafeTravel.showToast('Could not copy link', 'error');
    }
  },

  /**
   * Convert File to Data URL
   */
  fileToDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }
};
