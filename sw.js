/* Service worker: mở app khi mạng yếu. Giao diện lấy mạng trước (để luôn có bản mới), thư viện quét lấy bộ nhớ trước. */
const VER = 'kk-4.1.0';
const SHELL = ['./', 'index.html', 'app.css?v=6', 'app.js?v=6', 'ocrparse.js?v=6', 'config.js?v=6', 'canxem.js?v=6', 'quantri.js?v=6', 'manifest.webmanifest', 'icon.svg', 'icon-192.png',
  'vendor/zxing/zxing-reader.js', 'vendor/zxing/zxing_reader.wasm', 'huong-dan.html', 'vendor/qrcode/qrcode.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // gọi API (POST) đi thẳng
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/')) {                // thư viện nặng: bộ nhớ trước
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {                  // giao diện: mạng trước, lỗi mạng thì lấy bộ nhớ
    if (res.ok) { const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
