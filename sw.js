/* Service worker Admin Gudang (PWA)
   - Hanya menangani file dari origin yang sama (halaman, lib/, ikon). API, Google Sheets, dan semua
     permintaan POST TIDAK disentuh sama sekali (langsung ke jaringan).
   - Halaman: jaringan dulu (maks 4 detik), cadangan dari cache bila offline.
   - lib/ dan ikon: cache dulu (versi dipin, jarang berubah).
   - Font Google: disimpan setelah pertama kali dimuat agar tampilan tetap sama saat offline.
   Naikkan CACHE_NAME setiap kali file di lib/ atau ikon diganti. */
const CACHE_NAME = 'admin-gudang-v2';
const FONT_CACHE = 'admin-gudang-font-v1';
const ASSETS = [
  './', './index.html', './manifest.json', './icon.svg',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './lib/html2canvas.min.js', './lib/sweetalert2.all.min.js', './lib/Sortable.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of ASSETS) {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { console.warn('[SW] lewati:', url, e && e.message); }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [CACHE_NAME, FONT_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function halaman(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await Promise.race([
      fetch(req, { cache: 'no-store' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (res && res.status === 200) cache.put('./index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheDulu(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.status === 200) cache.put(req, res.clone());
  return res;
}

async function font(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  const dariNet = fetch(req).then(res => {
    if (res && (res.status === 200 || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await dariNet) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(font(req));
    return;
  }
  if (url.origin !== self.location.origin) return;   // API, Google Sheets, dll: biarkan ke jaringan

  if (req.mode === 'navigate') { event.respondWith(halaman(req)); return; }
  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(cacheDulu(req).catch(() => caches.match(req)));
});
