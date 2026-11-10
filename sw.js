/* Service worker : l'app et le dictionnaire fonctionnent sans connexion.
 * - code (html/js/css) : réseau d'abord (toujours à jour en ligne), cache en secours
 * - dictionnaire et icônes : cache d'abord (gros fichiers qui ne changent presque jamais)
 * Incrémenter VERSION force le renouvellement du cache (surtout si data/lexique.json change). */
const VERSION = 'v7';
const CACHE = `flow-matrix-${VERSION}`;

const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js',
  'js/engine/analyzer.js', 'js/engine/consonance.js', 'js/engine/exceptions.js', 'js/engine/lexicon.js', 'js/engine/numbers.js',
  'js/engine/phonetics.js', 'js/engine/repetition.js', 'js/engine/rhymeDictionary.js', 'js/engine/rules.js',
  'js/engine/stopwords.js', 'js/engine/syllabify.js',
  'js/store/storage.js', 'js/ui/editor.js', 'js/ui/inspector.js', 'js/ui/player.js', 'js/ui/sidebar.js',
  'js/utils/dom.js',
];
const BIG = ['data/lexique.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.all(BIG.map((u) => cache.add(u).catch(() => {})));   // le dictionnaire ne doit pas bloquer l'installation
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('flow-matrix-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(/\/(data|icons)\//.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
