// =============================================================================
//  Service Worker : mise en cache du shell de l'application pour le hors-ligne
// =============================================================================

const VERSION = 'ebook-v8';
const FICHIERS_STATIQUES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/config.js',
  'js/etat.js',
  'js/ui.js',
  'js/theme.js',
  'js/cache.js',
  'js/ocr.js',
  'js/traduction.js',
  'js/avis.js',
  'js/objectif.js',
  'js/citations.js',
  'js/vues/bibliotheque.js',
  'js/vues/ajouter.js',
  'js/vues/lecteur.js',
  'js/vues/livre.js',
  'js/vues/recommandations.js',
  'js/vues/compte.js',
  'js/vues/confidentialite.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FICHIERS_STATIQUES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cles) => Promise.all(
      cles.map((cle) => {
        if (cle !== VERSION) return caches.delete(cle);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Ne pas intercepter les requêtes API Vercel ni les appels Supabase / CDN distants
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((reponseEnCache) => {
      // Stratégie Stale-While-Revalidate pour les fichiers du domaine
      const promesseReseau = fetch(e.request).then((reponseReseau) => {
        if (reponseReseau && reponseReseau.status === 200) {
          const copie = reponseReseau.clone();
          caches.open(VERSION).then((cache) => cache.put(e.request, copie));
        }
        return reponseReseau;
      }).catch(() => null);

      return reponseEnCache || promesseReseau;
    })
  );
});
