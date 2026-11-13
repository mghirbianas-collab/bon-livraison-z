// Service worker : mise en cache de l'application pour un fonctionnement hors ligne.
// Les données (Supabase) ne passent jamais par ce cache : elles sont gérées par l'application.
const V = 'bl-vente-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './icon-180.png'];
const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    await Promise.allSettled(CDN.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.hostname.endsWith('.supabase.co')) return;
  const cdn = CDN.includes(r.url);
  if (!cdn && u.origin !== location.origin) return;
  // Page de l'application : toujours la version la plus récente si le réseau répond (4 s max), sinon la copie locale
  if (!cdn && (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html'))) {
    e.respondWith((async () => {
      const c = await caches.open(V);
      try {
        const x = await Promise.race([fetch(r, { cache: 'no-cache' }), new Promise((_, j) => setTimeout(j, 4000))]);
        if (x && x.ok) c.put('./index.html', x.clone());
        return x;
      } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  // Autres fichiers : réponse immédiate depuis le cache, mise à jour en arrière-plan
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(r, { ignoreSearch: !cdn });
    const net = fetch(r, cdn ? { mode: 'no-cors' } : undefined).then(x => {
      if (x && (x.ok || x.type === 'opaque')) c.put(r, x.clone());
      return x;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const x = await net;
    if (x) return x;
    if (r.mode === 'navigate') return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
    return Response.error();
  })());
});
