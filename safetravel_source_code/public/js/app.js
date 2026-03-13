/**
 * SafeTravel App Controller - SPA Router + Module Orchestrator
 */

const SafeTravel = {
  currentPage: 'home',
  routeMonitor: null,
  pages: {},
  pageCache: {},

  /**
   * Initialize the application
   */
  async init() {
    console.log('[SafeTravel] Initializing...');

    // Init storage
    await Storage.init();

    // Request notification permission
    this.requestNotificationPermission();

    // Register service worker
    this.registerServiceWorker();

    // Load settings
    await this.loadSettings();

    // Check for active trip
    const activeTrip = await Storage.getActiveTrip();
    if (activeTrip) {
      // Resume tracking
      await LocationTracker.start(activeTrip.id);
      CheckinManager.start(activeTrip.checkin_interval, activeTrip.miss_timeout);
      
      if (activeTrip.originLat && activeTrip.destLat) {
        this.routeMonitor = RouteMonitor;
        RouteMonitor.start(activeTrip.originLng, activeTrip.originLat, activeTrip.destLng, activeTrip.destLat);
      }
    }

    // Navigate to initial page
    const initialPage = activeTrip ? 'active-trip' : 'home';
    await this.navigateTo(initialPage);

    // Load stats on home
    this.updateHomeStats();

    // Hide loading screen
    setTimeout(() => {
      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('app').style.display = 'block';
    }, 1500);

    console.log('[SafeTravel] Ready!');
  },

  /**
   * Navigate to a page
   */
  async navigateTo(pageName) {
    const container = document.getElementById('page-container');
    if (!container) return;

    // Fetch page HTML
    let html = this.pageCache[pageName];
    if (!html) {
      try {
        const response = await fetch(`/pages/${pageName}.html`);
        html = await response.text();
        this.pageCache[pageName] = html;
      } catch (err) {
        console.error(`[Router] Failed to load page: ${pageName}`, err);
        return;
      }
    }

    // Inject page
    container.innerHTML = html;
    this.currentPage = pageName;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Page-specific initialization
    this.onPageLoad(pageName);
  },

  /**
   * Page-specific initialization hooks
   */
  async onPageLoad(pageName) {
    switch (pageName) {
      case 'home':
        this.updateHomeStats();
        this.updateHomeContacts();
        this.updateActiveTripBanner();
        break;

      case 'profile':
        TripManager.loadProfile();
        break;

      case 'trip-setup':
        setTimeout(() => TripManager.initSetupMap(), 100);
        break;

      case 'active-trip':
        TripManager.initActiveTripDashboard();
        break;

      case 'settings':
        this.loadSettingsUI();
        break;
    }
  },

  /**
   * Update home page stats
   */
  async updateHomeStats() {
    const stats = await Storage.getStats();
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setEl('stat-trips', stats.trips || 0);
    setEl('stat-safe', stats.checkins || 0);
    setEl('stat-hours', stats.hours || 0);
  },

  /**
   * Update home contacts display
   */
  async updateHomeContacts() {
    const profile = await Storage.getProfile();
    const list = document.getElementById('home-contacts-list');
    if (!list || !profile.contacts || profile.contacts.length === 0) return;

    list.innerHTML = profile.contacts.map(c => `
      <div class="contact-item">
        <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="contact-details">
          <div class="contact-name">${c.name}</div>
          <div class="contact-phone">${c.phone}</div>
          ${c.relationship ? `<div class="contact-relation">${c.relationship}</div>` : ''}
        </div>
        <a href="tel:${c.phone}" style="color: var(--accent-green); font-size: 20px; text-decoration: none;">📞</a>
      </div>
    `).join('');
  },

  /**
   * Show/hide active trip banner on home
   */
  async updateActiveTripBanner() {
    const trip = await Storage.getActiveTrip();
    const banner = document.getElementById('active-trip-banner');
    if (!banner) return;

    if (trip) {
      banner.style.display = 'block';
      const dest = document.getElementById('active-trip-dest');
      if (dest) dest.textContent = `To: ${trip.dest_name || 'Tap to view'}`;
    } else {
      banner.style.display = 'none';
    }
  },

  /**
   * Load settings into UI
   */
  async loadSettingsUI() {
    const settings = await Storage.getSettings();

    // Set interval buttons
    document.querySelectorAll('#settings-interval .interval-option').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.ms) === settings.checkinInterval);
    });

    // Set miss timeout buttons
    document.querySelectorAll('#settings-miss-timeout .interval-option').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.ms) === settings.missTimeout);
    });

    // Toggles
    const setToggle = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = val;
    };
    setToggle('setting-auto-share', settings.autoShare);
    setToggle('setting-notification-sound', settings.notificationSound);
    setToggle('setting-vibration', settings.vibration);
    setToggle('setting-route-monitor', settings.routeMonitor);
  },

  /**
   * Load settings
   */
  async loadSettings() {
    const settings = await Storage.getSettings();
    TripManager.selectedInterval = settings.checkinInterval;
    TripManager.selectedMissTimeout = settings.missTimeout;
  },

  /**
   * Settings management
   */
  settings: {
    async setInterval(btn) {
      document.querySelectorAll('#settings-interval .interval-option')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const settings = await Storage.getSettings();
      settings.checkinInterval = parseInt(btn.dataset.ms);
      await Storage.saveSettings(settings);
      TripManager.selectedInterval = settings.checkinInterval;
      SafeTravel.showToast('✅ Check-in interval updated', 'success');
    },

    async setMissTimeout(btn) {
      document.querySelectorAll('#settings-miss-timeout .interval-option')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const settings = await Storage.getSettings();
      settings.missTimeout = parseInt(btn.dataset.ms);
      await Storage.saveSettings(settings);
      TripManager.selectedMissTimeout = settings.missTimeout;
      SafeTravel.showToast('✅ Miss timeout updated', 'success');
    },

    async save() {
      const settings = await Storage.getSettings();
      settings.autoShare = document.getElementById('setting-auto-share')?.checked || false;
      settings.notificationSound = document.getElementById('setting-notification-sound')?.checked ?? true;
      settings.vibration = document.getElementById('setting-vibration')?.checked ?? true;
      settings.routeMonitor = document.getElementById('setting-route-monitor')?.checked ?? true;
      await Storage.saveSettings(settings);
    },

    async clearAllData() {
      if (!confirm('Clear all local data? This cannot be undone.')) return;
      await Storage.clear();
      SafeTravel.showToast('🗑️ All data cleared', 'success');
      SafeTravel.navigateTo('home');
    }
  },

  /**
   * Module references for cross-module access
   */
  checkin: CheckinManager,
  sos: SOSManager,
  audio: AudioManager,
  trip: TripManager,
  location: LocationTracker,

  /**
   * Show toast notification
   */
  showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  },

  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  },

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        console.log('[SW] Registered:', reg.scope);
      } catch (err) {
        console.warn('[SW] Registration failed:', err);
      }
    }
  }
};

// Boot the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => SafeTravel.init());
