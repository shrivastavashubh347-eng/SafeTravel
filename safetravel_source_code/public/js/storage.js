/**
 * Storage Module - localForage wrapper (IndexedDB backend)
 * Async storage with no 5MB limit, stores blobs natively
 */

const Storage = {
  _ready: false,

  async init() {
    localforage.config({
      name: 'SafeTravel',
      storeName: 'safetravel_data',
      description: 'SafeTravel app data'
    });
    this._ready = true;
    console.log('[Storage] Initialized (IndexedDB)');
  },

  async get(key) {
    try {
      return await localforage.getItem(key);
    } catch (err) {
      console.error('[Storage] Get error:', key, err);
      return null;
    }
  },

  async set(key, value) {
    try {
      await localforage.setItem(key, value);
    } catch (err) {
      console.error('[Storage] Set error:', key, err);
    }
  },

  async remove(key) {
    try {
      await localforage.removeItem(key);
    } catch (err) {
      console.error('[Storage] Remove error:', key, err);
    }
  },

  async clear() {
    try {
      await localforage.clear();
      console.log('[Storage] All data cleared');
    } catch (err) {
      console.error('[Storage] Clear error:', err);
    }
  },

  // Convenience methods
  async getProfile() {
    return await this.get('user_profile') || {};
  },

  async saveProfile(profile) {
    await this.set('user_profile', profile);
  },

  async getSettings() {
    return await this.get('app_settings') || {
      checkinInterval: 600000,
      missTimeout: 60000,
      autoShare: false,
      notificationSound: true,
      vibration: true,
      routeMonitor: true
    };
  },

  async saveSettings(settings) {
    await this.set('app_settings', settings);
  },

  async getActiveTrip() {
    return await this.get('active_trip');
  },

  async saveActiveTrip(trip) {
    await this.set('active_trip', trip);
  },

  async clearActiveTrip() {
    await this.remove('active_trip');
  },

  async getStats() {
    return await this.get('stats') || { trips: 0, checkins: 0, hours: 0 };
  },

  async updateStats(updates) {
    const stats = await this.getStats();
    Object.assign(stats, updates);
    await this.set('stats', stats);
  }
};
