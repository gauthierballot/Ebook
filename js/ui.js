// Petites fonctions d'interface réutilisées par toutes les vues.

/** Échappe le texte avant de l'insérer dans du HTML (protection XSS). */
export function esc(valeur) {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Icônes SVG inline (traits simples). */
export const icones = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  retour: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  suivant: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  fermer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plusOptions: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>',
  galerie: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  crayon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
  livre: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></svg>',
  etoile: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.5 1.1 6.3L12 17.3l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>',
  coche: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  envoyer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  oeil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  page: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  bulle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/></svg>',
  aller: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  corbeille: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  traduire: '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 4-3 7-6 8M13 21l4-9 4 9M14.5 18h5"/></svg>',
  recherche: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg>',
  audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  stopAudio: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  signet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
};

/** Affiche une notification éphémère. */
export function toast(message, type = 'info', duree = 3200) {
  const zone = document.getElementById('toasts');
  if (!zone) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'erreur' ? 'erreur' : ''}`;
  el.setAttribute('role', type === 'erreur' ? 'alert' : 'status');
  el.textContent = message;
  zone.appendChild(el);
  setTimeout(() => {
    el.classList.add('sortie');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duree);
}

/** Boîte de confirmation élégante. Renvoie une promesse <boolean>. */
export function confirmer({ titre, texte, ok = 'Confirmer', danger = true }) {
  const d = document.getElementById('dialogue');
  if (!d || typeof d.showModal !== 'function') return Promise.resolve(window.confirm(texte || titre));
  d.querySelector('#dialogue-titre').textContent = titre;
  d.querySelector('#dialogue-texte').textContent = texte || '';
  const bouton = d.querySelector('#dialogue-ok');
  bouton.textContent = ok;
  bouton.className = `btn ${danger ? 'btn-danger' : 'btn-primaire'}`;
  d.returnValue = '';
  d.showModal();
  return new Promise((resoudre) => {
    d.addEventListener('close', () => resoudre(d.returnValue === 'ok'), { once: true });
  });
}

/** Bloc « chargement ». */
export function chargementHTML(texte = 'Chargement…') {
  return `<div class="etat-chargement" role="status"><span class="roue" aria-hidden="true"></span><p>${esc(texte)}</p></div>`;
}

/** Bloc « erreur » avec bouton Réessayer (data-action="reessayer"). */
export function erreurHTML(texte, titre = 'Oups…') {
  return `<div class="etat-erreur" role="alert">
    <span class="logo-e grand" aria-hidden="true">E</span>
    <h2>${esc(titre)}</h2>
    <p>${esc(texte)}</p>
    <button type="button" class="btn btn-primaire" data-action="reessayer">Réessayer</button>
  </div>`;
}

/** Libellés lisibles. */
export const libelleType = { roman: 'Roman', theatre: 'Pièce de théâtre', autre: 'Autre' };
export const libelleLangue = { fr: 'Français', en: 'Anglais' };

/** Teinte (0–359) dérivée du titre : chaque livre a sa couleur, toujours la même. */
export function teinteDepuisTexte(texte) {
  let h = 0;
  for (const c of String(texte || '').toLowerCase()) h = (h * 31 + c.codePointAt(0)) >>> 0;
  // On reste dans des teintes nobles (bleus, verts profonds, bordeaux, prunes)
  const palette = [222, 210, 235, 250, 265, 285, 330, 345, 355, 165, 185, 195, 20, 35];
  return palette[h % palette.length];
}

/** Clé de cache local pour la couverture et le résumé Apple Livres. */
function cleMetaApple(titre = '', auteur = '') {
  const norm = `${titre}__${auteur}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `ebook:apple:v1:${norm}`;
}

export function lireMetaApple(titre, auteur) {
  try {
    const brut = localStorage.getItem(cleMetaApple(titre, auteur));
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

export function enregistrerMetaApple(titre, auteur, meta) {
  if (!titre || !meta) return;
  try {
    localStorage.setItem(cleMetaApple(titre, auteur), JSON.stringify({
      couverture: meta.couverture || null,
      resume: meta.resume || '',
      ts: Date.now(),
    }));
  } catch { /* quota atteint : ignoré */ }
}

/** Couverture avec image officielle Apple Livres (ou couverture CSS dorée en secours). */
export function couvertureHTML(livre, { grande = false } = {}) {
  const h = teinteDepuisTexte(livre.titre);
  const enCache = lireMetaApple(livre.titre, livre.auteur);
  const urlCouv = livre.couverture || enCache?.couverture || '';
  const besoinRecherche = !urlCouv && !enCache;

  const attrsAuto = besoinRecherche
    ? ` data-couv-auto data-titre="${esc(livre.titre)}" data-auteur="${esc(livre.auteur || '')}" data-langue="${esc(livre.langue || 'fr')}"`
    : '';

  const imgHTML = urlCouv
    ? `<img class="couv-img" src="${esc(urlCouv)}" alt="" loading="lazy" onerror="this.remove()">`
    : '';

  return `<div class="couverture ${grande ? 'grande' : ''}" style="--h:${h}" aria-hidden="true"${attrsAuto}>
    ${imgHTML}
    <span class="couv-type">${esc(libelleType[livre.type] || '')}</span>
    <div>
      <div class="couv-titre">${esc(livre.titre)}</div>
      <div class="couv-orn"></div>
      <div class="couv-auteur">${esc(livre.auteur || 'Auteur inconnu')}</div>
    </div>
  </div>`;
}

/**
 * Recherche automatiquement sur l'API Apple Livres les couvertures manquantes
 * présentes dans un conteneur DOM et les met en cache.
 */
export async function hydraterCouvertures(racine = document) {
  const blocs = [...racine.querySelectorAll('[data-couv-auto]')];
  if (!blocs.length) return;

  await Promise.allSettled(blocs.map(async (el) => {
    const titre = el.getAttribute('data-titre') || '';
    const auteur = el.getAttribute('data-auteur') || '';
    const langue = el.getAttribute('data-langue') || 'fr';
    el.removeAttribute('data-couv-auto');
    if (!titre) return;

    const deja = lireMetaApple(titre, auteur);
    if (deja) {
      if (deja.couverture) injecterImageCouv(el, deja.couverture);
      return;
    }

    try {
      const pays = langue === 'en' ? 'us' : 'fr';
      const terme = `${titre} ${auteur}`.trim();
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(terme)}&entity=ebook&country=${pays}&limit=4`);
      if (!r.ok) return;
      const json = await r.json();
      const items = Array.isArray(json.results) ? json.results : [];
      const meilleur = items.find((x) => x.price === 0 && x.artworkUrl100) || items.find((x) => x.artworkUrl100);
      const couverture = (meilleur?.artworkUrl100 || '')
        .replace(/\d+x\d+bb/, '600x600bb') || null;
      const resume = String(meilleur?.description || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .slice(0, 600);

      enregistrerMetaApple(titre, auteur, { couverture, resume });
      if (couverture) injecterImageCouv(el, couverture);
    } catch { /* réseau indisponible : on garde la couverture CSS */ }
  }));
}

function injecterImageCouv(el, url) {
  if (!el || el.querySelector('.couv-img')) return;
  const img = document.createElement('img');
  img.className = 'couv-img';
  img.src = url;
  img.alt = '';
  img.loading = 'lazy';
  img.onerror = () => img.remove();
  el.prepend(img);
}

/** Étoiles en lecture seule. */
export function etoilesHTML(note, sur = 5) {
  const n = Math.round(note);
  let html = `<span class="etoiles" role="img" aria-label="${String(note).replace('.', ',')} sur ${sur}">`;
  for (let i = 1; i <= sur; i++) html += `<span class="${i <= n ? '' : 'vide'}">${icones.etoile}</span>`;
  return html + '</span>';
}

/** Date lisible en français : « 4 nov. 2026 ». */
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

/** Transforme une erreur (Supabase, réseau…) en message clair en français. */
export function messageErreur(erreur) {
  if (!navigator.onLine) return 'Tu es hors ligne. Vérifie ta connexion internet puis réessaie.';
  const msg = String(erreur?.message || erreur || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Impossible de joindre le serveur. Vérifie ta connexion internet.';
  }
  if (erreur?.code === 'PGRST116') return 'Ce livre est introuvable (ou ne t\'appartient pas).';
  if (erreur?.code === '42501') return 'Tu n\'as pas les droits pour faire cette action.';
  if (erreur?.code === '22P02') return 'Lien invalide.';
  if (erreur?.code === '23505') return 'Cet élément existe déjà.';
  if (erreur?.code === '23514') return 'Une des valeurs saisies n\'est pas valide (trop longue ?).';
  if (/JWT|token/i.test(msg)) return 'Ta session a expiré. Reconnecte-toi.';
  return 'Une erreur inattendue est survenue. Réessaie dans un instant.';
}

/**
 * Ouvre une « feuille » qui monte du bas de l'écran.
 * Renvoie { el, fermer }. Échap ou toucher le fond la ferme.
 */
export function ouvrirFeuille({ titre, contenu, classe = '' }) {
  const declencheur = document.activeElement;
  const fond = document.createElement('div');
  fond.className = 'feuille-fond';
  const feuille = document.createElement('div');
  feuille.className = `feuille ${classe}`;
  feuille.setAttribute('role', 'dialog');
  feuille.setAttribute('aria-modal', 'true');
  feuille.setAttribute('aria-label', titre);
  feuille.innerHTML = `<div class="feuille-entete">
      <h2>${esc(titre)}</h2>
      <button type="button" class="btn-icone" data-fermer aria-label="Fermer">${icones.fermer}</button>
    </div><div class="feuille-corps">${contenu}</div>`;
  document.body.append(fond, feuille);

  let ouverte = true;
  const fermer = () => {
    if (!ouverte) return;
    ouverte = false;
    document.removeEventListener('keydown', surTouche);
    fond.remove();
    feuille.remove();
    if (declencheur && document.contains(declencheur)) declencheur.focus();
  };
  const surTouche = (e) => { if (e.key === 'Escape') fermer(); };
  fond.addEventListener('click', fermer);
  feuille.querySelector('[data-fermer]').addEventListener('click', fermer);
  document.addEventListener('keydown', surTouche);
  // Focus sur le premier élément interactif
  requestAnimationFrame(() => {
    const premier = feuille.querySelector('.feuille-corps button, .feuille-corps a, .feuille-corps input, .feuille-corps textarea') || feuille.querySelector('[data-fermer]');
    premier?.focus();
  });
  return { el: feuille, fermer };
}
