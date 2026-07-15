const CACHE = 'nathalie-turnus-v13';
// Core app-shell files: must succeed, or the app has no offline capability at all.
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
// Best-effort extras: nice to have cached for offline use, but this is a third-party URL that can be
// temporarily unreachable (flaky connection, a network/DNS block on fonts.googleapis.com, etc.).
const OPTIONAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Aptos:wght@400;500;600&display=swap'
];

self.addEventListener('install', e => {
  // BUG-HARDENING: caches.addAll() is all-or-nothing — if a single URL in the list fails to fetch,
  // the ENTIRE install step fails and the service worker never activates (no offline capability at
  // all, not even for the app's own local files), until a future install attempt happens to have every
  // single asset succeed at once. Splitting into "must-succeed" core files (addAll, still atomic — if
  // these fail something is genuinely wrong) and "best-effort" extras like the Google Fonts stylesheet
  // (each wrapped in its own .catch so one flaky third-party request can't take the whole app down)
  // makes the app resilient to exactly that kind of transient failure.
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(CORE_ASSETS);
      await Promise.all(OPTIONAL_ASSETS.map(url => c.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// BUG FIX: this used to be cache-FIRST (caches.match(...).then(cached => cached || fetch(...))) —
// meaning once a version was cached, EVERY later visit served that exact cached copy forever, even
// though a newer version was already live on GitHub Pages. This is exactly why a person could push an
// update, confirm it's live, and still have someone else's already-installed app (like Nathalie's,
// added to her home screen) keep showing the old version indefinitely — cache-first never even asks
// the network if a cached copy exists. Flipped to network-FIRST: always try to fetch the latest
// version when online (and refresh the cache with whatever comes back), and only fall back to the
// cached copy when offline or the network request fails. The cache still makes the app usable with no
// connection — it just stops being able to silently freeze everyone on stale content while online.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // BUG FIX: cross-origin requests (e.g. the Firebase SDK <script src="https://www.gstatic.com/...">
  // tags, Google Fonts) must NOT fall back to caches.match('./index.html') on failure — that fallback
  // is meant only for OUR OWN app-shell navigation/asset requests. If a cross-origin script request
  // fails (offline, blocked, flaky CDN) and we hand back the cached index.html HTML document in its
  // place, the browser tries to parse that HTML as JavaScript and throws "Unexpected token '<'". Let
  // the browser handle cross-origin requests with its own normal (uncached, un-intercepted) behavior;
  // we only apply our cache-first-fallback/offline strategy to same-origin requests.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(fresh => {
      const copy = fresh.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return fresh;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))
    )
  );
});
