// =============================================================================
//  Ebook — point d'entrée : démarrage, session Supabase et routage par hash
// =============================================================================

import { etat } from './etat.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { initialiserTheme } from './theme.js';
import { chargementHTML, erreurHTML, messageErreur } from './ui.js';

// supabase-js est chargé depuis un CDN, sous forme de module ES
const URL_SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const UUID = '([0-9a-fA-F-]{36})';

// Table des routes. « protege » = connexion obligatoire.
const routes = [
  { motif: /^\/?$/, redirection: '/bibliotheque' },
  { motif: /^\/bibliotheque$/, vue: () => import('./vues/bibliotheque.js'), protege: true, nav: 'bibliotheque', titre: 'Ma bibliothèque' },
  { motif: /^\/ajouter$/, vue: () => import('./vues/ajouter.js'), protege: true, nav: 'ajouter', titre: 'Ajouter un livre', etroit: true },
  { motif: new RegExp(`^/ajouter/${UUID}$`), vue: () => import('./vues/ajouter.js'), protege: true, nav: 'ajouter', titre: 'Ajouter des pages', etroit: true },
  { motif: new RegExp(`^/lecteur/${UUID}$`), vue: () => import('./vues/lecteur.js'), protege: true, lecture: true, titre: 'Lecture' },
  { motif: new RegExp(`^/livre/${UUID}$`), vue: () => import('./vues/livre.js'), protege: true, nav: 'bibliotheque', titre: 'Fiche du livre' },
  { motif: /^\/recommandations$/, vue: () => import('./vues/recommandations.js'), nav: 'recommandations', titre: 'Conseils de lecture', etroit: true },
  { motif: /^\/compte$/, vue: () => import('./vues/compte.js'), nav: 'compte', titre: 'Mon compte', etroit: true, besoinSupabase: true },
  { motif: /^\/confidentialite$/, vue: () => import('./vues/confidentialite.js'), titre: 'Confidentialité', etroit: true },
];

const contenu = document.getElementById('contenu');
let jeton = 0;          // identifiant de la navigation en cours
let nettoyage = null;   // fonction de nettoyage renvoyée par la vue précédente
let premiereVue = true;

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
initialiserTheme();
surveillerConnexion();
surveillerDefilement();
demarrer();

async function demarrer() {
  etat.configOk = !SUPABASE_URL.includes('VOTRE-PROJET') && !SUPABASE_ANON_KEY.includes('VOTRE_CLE');

  if (etat.configOk) {
    try {
      const { createClient } = await import(URL_SUPABASE_JS);
      etat.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      // getSession() attend aussi le traitement d'un éventuel lien de confirmation
      const { data } = await etat.supabase.auth.getSession();
      etat.session = data.session;
      etat.user = data.session?.user ?? null;
      etat.supabase.auth.onAuthStateChange(surChangementAuth);
    } catch {
      etat.supabase = null; // CDN injoignable (hors ligne ?) : on affichera un message
    }
  }

  traiterRetourAuth();
  window.addEventListener('hashchange', router);
  router();
  enregistrerServiceWorker();
}

/** Réagit aux connexions / déconnexions (dans cet onglet ou un autre). */
function surChangementAuth(evenement, session) {
  etat.session = session;
  etat.user = session?.user ?? null;

  if (evenement === 'PASSWORD_RECOVERY') {
    etat.recuperation = true;
    if (location.hash !== '#/compte') location.hash = '#/compte';
    else router();
  }
  if (evenement === 'SIGNED_OUT') {
    const route = trouverRoute(cheminActuel())?.route;
    if (route?.protege) location.hash = '#/compte';
  }
}

/**
 * Les liens envoyés par e-mail (confirmation, mot de passe oublié) reviennent
 * avec des paramètres dans le hash (#access_token=… ou #error=…).
 * On les lit puis on les retire pour ne pas perturber le routeur.
 */
function traiterRetourAuth() {
  const h = location.hash.slice(1);
  if (!/(access_token|error_description|error_code)=/.test(h)) return;
  const p = new URLSearchParams(h);
  if (p.get('error_description')) {
    etat.messageAuth = {
      type: 'erreur',
      texte: p.get('error_code') === 'otp_expired'
        ? 'Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau.'
        : 'Le lien n\'est pas valide. Réessaie ou demande un nouveau lien.',
    };
    history.replaceState(null, '', '#/compte');
    return;
  }
  if (p.get('type') === 'recovery') {
    etat.recuperation = true;
    history.replaceState(null, '', '#/compte');
    return;
  }
  if (p.get('type') === 'signup' || p.get('type') === 'email') {
    etat.messageAuth = { type: 'succes', texte: 'Ton adresse e-mail est confirmée. Bienvenue !' };
  }
  history.replaceState(null, '', etat.user ? '#/bibliotheque' : '#/compte');
}

// ---------------------------------------------------------------------------
// Routeur
// ---------------------------------------------------------------------------
function cheminActuel() {
  return decodeURIComponent(location.hash.replace(/^#/, '')).split('?')[0] || '/';
}

function trouverRoute(chemin) {
  for (const route of routes) {
    const m = chemin.match(route.motif);
    if (m) return { route, params: m.slice(1) };
  }
  return null;
}

async function router() {
  const monJeton = ++jeton;

  // On nettoie la vue précédente (écouteurs, minuteries…)
  if (typeof nettoyage === 'function') {
    try { nettoyage(); } catch { /* sans gravité */ }
  }
  nettoyage = null;

  const [, query = ''] = location.hash.split('?');
  const chemin = cheminActuel();
  const trouve = trouverRoute(chemin);

  // Chaque vue s'affiche dans un conteneur neuf : une vue lente qui finit
  // de charger après un changement de page écrit dans un élément détaché.
  const racine = document.createElement('div');
  racine.className = 'vue';

  if (!trouve) {
    preparerHabillage({});
    contenu.replaceChildren(racine);
    racine.innerHTML = `<div class="etat-vide"><span class="logo-e grand" aria-hidden="true">E</span>
      <h2>Page introuvable</h2><p>Cette page n'existe pas ou a été déplacée.</p>
      <a class="btn btn-primaire" href="#/bibliotheque">Retour à la bibliothèque</a></div>`;
    document.title = 'Page introuvable — Ebook';
    return;
  }

  const { route, params } = trouve;
  if (route.redirection) { location.replace(`#${route.redirection}`); return; }

  // Supabase indispensable mais absent
  if ((route.protege || route.besoinSupabase) && !etat.supabase) {
    preparerHabillage(route);
    contenu.replaceChildren(racine);
    racine.innerHTML = etat.configOk ? erreurHTML(messageErreur(new Error('Failed to fetch')), 'Connexion impossible') : configManquanteHTML();
    racine.querySelector('[data-action="reessayer"]')?.addEventListener('click', () => location.reload());
    document.title = 'Ebook';
    return;
  }

  // Page réservée aux personnes connectées
  if (route.protege && !etat.user) {
    etat.retour = location.hash;
    location.replace('#/compte');
    return;
  }

  preparerHabillage(route);
  contenu.replaceChildren(racine);
  racine.innerHTML = chargementHTML();
  document.title = `${route.titre} — Ebook`;

  try {
    const module = await route.vue();
    if (monJeton !== jeton) return;
    window.scrollTo(0, 0);
    const resultat = await module.afficher(racine, {
      params,
      query: new URLSearchParams(query),
      estActuelle: () => monJeton === jeton,
    });
    if (monJeton === jeton) nettoyage = resultat;
    else if (typeof resultat === 'function') resultat();
  } catch (e) {
    if (monJeton !== jeton) return;
    racine.innerHTML = erreurHTML(navigator.onLine
      ? 'Cette page n\'a pas pu s\'afficher. Recharge l\'application.'
      : 'Tu es hors ligne et cette page n\'a pas encore été chargée.');
    racine.querySelector('[data-action="reessayer"]')?.addEventListener('click', () => router());
  }

  // Accessibilité : on place le focus sur le contenu après un changement de page
  if (!premiereVue && !route.lecture) contenu.focus({ preventScroll: true });
  premiereVue = false;
}

/** Met à jour la navigation active et le mode lecture plein écran. */
function preparerHabillage(route) {
  document.body.classList.toggle('mode-lecture', !!route.lecture);
  contenu.classList.toggle('etroit', !!route.etroit);
  document.querySelectorAll('[data-nav]').forEach((lien) => {
    if (lien.dataset.nav === route.nav) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  });
}

function configManquanteHTML() {
  return `<div class="carte config-manquante" style="margin-top:24px">
    <p class="surtitre">Configuration</p>
    <h1 class="titre-3">Il reste une petite étape</h1>
    <p>Ebook n'est pas encore relié à Supabase. Ouvre le fichier <code>js/config.js</code> et remplace
    <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> par les valeurs de ton projet
    (Supabase &gt; Project Settings &gt; API).</p>
    <p>Ensuite, recharge cette page.</p>
    <a class="btn btn-secondaire" href="#/confidentialite">Voir la page de confidentialité</a>
  </div>`;
}

// ---------------------------------------------------------------------------
// Hors ligne, défilement, service worker
// ---------------------------------------------------------------------------
function surveillerConnexion() {
  const bandeau = document.getElementById('hors-ligne');
  const maj = () => { bandeau.hidden = navigator.onLine; };
  window.addEventListener('online', maj);
  window.addEventListener('offline', maj);
  maj();
}

function surveillerDefilement() {
  const entete = document.getElementById('entete');
  window.addEventListener('scroll', () => entete.classList.toggle('defile', window.scrollY > 4), { passive: true });
}

function enregistrerServiceWorker() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* facultatif : on ignore */ });
  }
}
