/**
 * SafeTravel Service Worker
 * Caches static assets for offline use
 */

const CACHE_NAME = 'safetravel-v1';
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/js/storage.js',
  '/js/audio.js',
  '/js/map.js',
  '/js/location.js',
  '/js/route-monitor.js',
  '/js/checkin.js',
  '/js/sos.js',
  '/js/trip.js',
  '/pages/home.html',
  '/pages/profile.html',
  '/pages/trip-setup.html',
  '/pages/active-trip.html',
  '/pages/sos.html',
  '/pages/settings.html'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first, cache fallback
self.addEventListener('fetch', (event) => {
  // Skip API requests and socket.io
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/socket.io/') ||
      event.request.url.includes('/track/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Return cached version
        return caches.match(event.request);
      })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'SafeTravel', {
      body: data.body || 'Safety check-in required',
      icon: '🛡️',
      badge: '🛡️',
      tag: 'safetravel',
      requireInteraction: true,
      vibrate: [300, 100, 300]
    })
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll().then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow('/');
      }
    })
  );
});
