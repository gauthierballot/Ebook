// =============================================================================
//  Lecteur, façon Apple Livres : une page à la fois, balayage, marque-page,
//  réglages d'affichage, traduction (livres en anglais) et avis.
// =============================================================================

import { etat } from '../etat.js';
import { esc, icones, toast, erreurHTML, messageErreur, ouvrirFeuille } from '../ui.js';
import { lireCache, ecrireCache, supprimerCache } from '../cache.js';
import { themeActuel } from '../theme.js';
import { enregistrerPageLue, enregistrerTempsLecture, calculerProgression, ouvrirReglageObjectif } from '../objectif.js';

const CLE_REGLAGES = 'ebook-lecteur';
const TAILLES = [16, 17, 18, 20, 22, 24, 27, 30, 34];
const INTERLIGNES = { serre: 1.45, normal: 1.65, aere: 1.9 };

function lireReglages() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem(CLE_REGLAGES)) || {}; } catch { /* valeurs par défaut */ }
  return {
    taille: TAILLES.includes(r.taille) ? r.taille : 20,
    interligne: INTERLIGNES[r.interligne] ? r.interligne : 'normal',
    theme: ['clair', 'sepia', 'sombre'].includes(r.theme) ? r.theme : (themeActuel() === 'sombre' ? 'sombre' : 'clair'),
  };
}
function sauverReglages(r) {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(r)); } catch { /* rien */ }
}

// ---------------------------------------------------------------------------
// Mise en forme du texte
// ---------------------------------------------------------------------------

/**
 * Découpe le texte d'une page en blocs.
 * - Théâtre : une ligne = un bloc (les retours à la ligne sont conservés).
 * - Roman / autre : on reforme les paragraphes coupés par la mise en page papier.
 */
export function blocsDuTexte(texte, type) {
  const lignes = String(texte || '').replace(/\r/g, '').split('\n');
  if (type === 'theatre') {
    while (lignes.length && !lignes[lignes.length - 1].trim()) lignes.pop();
    return lignes;
  }

  const pleines = lignes.map((l) => l.trim()).filter(Boolean);
  const moyenne = pleines.reduce((s, l) => s + l.length, 0) / (pleines.length || 1);
  const blocs = [];
  let courant = '';

  for (const brut of lignes) {
    const ligne = brut.trim();
    if (!ligne) { if (courant) blocs.push(courant); courant = ''; continue; }
    // Une réplique de dialogue (« — ») commence toujours un nouveau paragraphe
    if (courant && /^[—–]/.test(ligne)) { blocs.push(courant); courant = ''; }

    if (!courant) courant = ligne;
    else if (/[-‐]$/.test(courant) && /^\p{Ll}/u.test(ligne)) courant = courant.slice(0, -1) + ligne; // mot coupé
    else courant += ` ${ligne}`;

    // Ligne courte terminée par une ponctuation forte : fin de paragraphe probable
    if (ligne.length < moyenne * 0.72 && /[.!?…»"”:]$/.test(ligne)) { blocs.push(courant); courant = ''; }
  }
  if (courant) blocs.push(courant);
  return blocs;
}

/** Entoure chaque mot d'un <span> touchable (livres en anglais). */
function motsCliquables(texte) {
  return String(texte)
    .split(/(\p{L}[\p{L}'’-]*\p{L}|\p{L})/u)
    .map((morceau, i) => (i % 2 ? `<span class="mot">${esc(morceau)}</span>` : esc(morceau)))
    .join('');
}

function blocsHTML(blocs, { mots = false, type } = {}) {
  if (!blocs.some((b) => b.trim())) return '<p class="page-vide">Cette page est vide.</p>';
  return blocs.map((b) => {
    const contenu = mots ? motsCliquables(b) : esc(b);
    const classe = type !== 'theatre' && /^[—–]/.test(b) ? ' class="dialogue-ligne"' : '';
    return `<p${classe}>${contenu || '&nbsp;'}</p>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Vue
// ---------------------------------------------------------------------------
export async function afficher(racine, { params }) {
  const idLivre = params[0];
  const cleCache = `livre:${idLivre}`;

  // 1. Chargement du livre et de ses pages (avec repli sur le cache hors ligne)
  const [livreRes, pagesRes] = await Promise.all([
    etat.supabase.from('books').select('id, titre, auteur, type, langue, derniere_page, catalogue_id').eq('id', idLivre).single(),
    etat.supabase.from('pages').select('id, numero, texte').eq('book_id', idLivre).order('numero', { ascending: true }),
  ]);

  let livre, pages;
  const erreur = livreRes.error || pagesRes.error;
  if (erreur) {
    const cache = lireCache(cleCache);
    if (!cache || erreur.code === 'PGRST116') {
      racine.innerHTML = `<div style="padding:24px">${erreurHTML(messageErreur(erreur), 'Livre indisponible')}
        <div class="actions" style="justify-content:center"><a class="btn btn-secondaire" href="#/bibliotheque">Retour à la bibliothèque</a></div></div>`;
      racine.querySelector('[data-action="reessayer"]').addEventListener('click', () => location.reload());
      return;
    }
    ({ livre, pages } = cache);
    toast('Lecture hors ligne : version enregistrée sur ton appareil.');
  } else {
    livre = livreRes.data;
    pages = pagesRes.data;
    ecrireCache(cleCache, { livre, pages });
  }

  // Marque-page en attente (enregistré hors ligne lors d'une lecture précédente)
  const enAttente = lireCache(`marque:${idLivre}`);
  if (enAttente) livre.derniere_page = enAttente;

  const total = pages.length;
  const estAnglais = livre.langue === 'en';
  let reglages = lireReglages();
  let index = Math.min(Math.max((livre.derniere_page || 1) - 1, 0), Math.max(total - 1, 0));
  const traductions = new Map(); // index de page -> blocs traduits
  let voirTraduction = false;
  let minuterieMarque = null;
  let feuilleOuverte = null;
  let bulle = null;

  // 2. Squelette du lecteur
  racine.innerHTML = `
    <div class="lecteur">
      <header class="lecteur-barre">
        <a href="#/bibliotheque" class="btn-icone" aria-label="Retour à la bibliothèque">${icones.retour}</a>
        <div class="lecteur-titre"><strong>${esc(livre.titre)}</strong><span>${esc(livre.auteur || '')}</span></div>
        <button type="button" class="btn-icone btn-aa" data-action="reglages" aria-label="Réglages d'affichage">Aa</button>
        <button type="button" class="btn-icone" data-action="menu" aria-label="Plus d'options">${icones.plusOptions}</button>
      </header>
      <div class="lecteur-zone">
        <article class="lecteur-page ${livre.type === 'theatre' ? 'theatre' : ''}" lang="${livre.langue}" tabindex="-1" aria-live="polite"></article>
        <div class="lecteur-fin"></div>
      </div>
      <footer class="lecteur-pied">
        <button type="button" class="btn-icone" data-action="precedente" aria-label="Page précédente">${icones.retour}</button>
        <div class="lecteur-centre">
          <span class="indicateur-page" aria-live="polite"></span>
          <div class="lecteur-avancement" aria-hidden="true"><span></span></div>
          ${estAnglais && total ? `<button type="button" class="btn-traduire" data-action="traduire">${icones.traduire}<span>Traduire la page</span></button>` : ''}
        </div>
        <button type="button" class="btn-icone" data-action="suivante" aria-label="Page suivante">${icones.suivant}</button>
      </footer>
    </div>`;

  const lecteur = racine.querySelector('.lecteur');
  const zone = racine.querySelector('.lecteur-zone');
  const article = racine.querySelector('.lecteur-page');
  const fin = racine.querySelector('.lecteur-fin');
  const indicateur = racine.querySelector('.indicateur-page');
  const avancement = racine.querySelector('.lecteur-avancement span');
  const btnPrec = racine.querySelector('[data-action="precedente"]');
  const btnSuiv = racine.querySelector('[data-action="suivante"]');
  const btnTrad = racine.querySelector('[data-action="traduire"]');

  function appliquerReglages() {
    lecteur.classList.remove('theme-clair', 'theme-sepia', 'theme-sombre');
    lecteur.classList.add(`theme-${reglages.theme}`);
    lecteur.style.setProperty('--taille', `${reglages.taille}px`);
    lecteur.style.setProperty('--interligne', INTERLIGNES[reglages.interligne]);
  }

  // 3. Affichage d'une page
  function rendre(direction = 0) {
    fermerBulle();
    if (!total) {
      article.innerHTML = `<div class="etat-vide" style="font-family:var(--police-ui)">
          <h2>Aucune page pour l'instant</h2>
          <p>Photographie les premières pages pour commencer ta lecture.</p>
          <a class="btn btn-primaire" href="#/ajouter/${livre.id}">${icones.photo} Ajouter des pages</a></div>`;
      indicateur.textContent = '0 page';
      btnPrec.disabled = btnSuiv.disabled = true;
      return;
    }

    const page = pages[index];
    const traduite = voirTraduction && traductions.has(index);
    if (traduite) {
      article.innerHTML = `<div class="mention-traduction"><span>Traduction automatique (MyMemory)</span></div>
        ${blocsHTML(traductions.get(index), { type: livre.type })}`;
      article.lang = 'fr';
    } else {
      article.innerHTML = blocsHTML(blocsDuTexte(page.texte, livre.type), { mots: estAnglais, type: livre.type });
      article.lang = livre.langue;
    }

    // Animation de tourne-page
    article.classList.remove('entree-suivante', 'entree-precedente');
    if (direction) {
      void article.offsetWidth; // relance l'animation
      article.classList.add(direction > 0 ? 'entree-suivante' : 'entree-precedente');
    }

    indicateur.textContent = `Page ${index + 1} / ${total}`;
    avancement.style.width = `${((index + 1) / total) * 100}%`;
    btnPrec.disabled = index === 0;
    btnSuiv.disabled = index === total - 1;
    if (btnTrad) btnTrad.querySelector('span').textContent = traduite ? 'Voir l\'original' : 'Traduire la page';

    // Fin du livre (dernière page enregistrée)
    fin.innerHTML = index === total - 1 ? `
      <div class="fin-livre">
        <span class="logo-e" aria-hidden="true">E</span>
        <p>Tu es arrivé à la dernière page enregistrée.</p>
        <div class="actions" style="justify-content:center">
          <a class="btn btn-secondaire" href="#/ajouter/${livre.id}">${icones.photo} Ajouter des pages</a>
          <button type="button" class="btn btn-primaire" data-action="avis">Donner mon avis</button>
        </div>
      </div>` : '';
    fin.querySelector('[data-action="avis"]')?.addEventListener('click', ouvrirAvis);
  }

  function allerA(nouvel, direction) {
    if (nouvel < 0 || nouvel >= total || nouvel === index) return;
    if (direction > 0) enregistrerPageLue(livre.id, index + 1);
    index = nouvel;
    window.scrollTo({ top: 0, behavior: 'instant' });
    rendre(direction);
    programmerMarquePage();
    programmerValidationPage();
  }
  const suivante = () => allerA(index + 1, 1);
  const precedente = () => allerA(index - 1, -1);

  // Validation d'une page après 4 secondes de lecture effective
  let minuteriePageLue = null;
  function programmerValidationPage() {
    clearTimeout(minuteriePageLue);
    if (!total) return;
    minuteriePageLue = setTimeout(() => {
      if (document.visibilityState !== 'hidden') {
        enregistrerPageLue(livre.id, index + 1);
      }
    }, 4000);
  }

  // Chronomètre du temps de lecture actif (enregistré toutes les 15 s et à la sortie)
  let debutTranche = Date.now();
  function comptabiliserTranche() {
    if (!total || document.visibilityState === 'hidden') {
      debutTranche = Date.now();
      return;
    }
    const ecoule = Math.floor((Date.now() - debutTranche) / 1000);
    if (ecoule >= 3) {
      enregistrerTempsLecture(Math.min(ecoule, 120));
      debutTranche = Date.now();
    }
  }
  const intervalleTemps = setInterval(comptabiliserTranche, 15000);

  // 4. Marque-page automatique (enregistré 0,8 s après le changement de page)
  function programmerMarquePage() {
    clearTimeout(minuterieMarque);
    minuterieMarque = setTimeout(enregistrerMarquePage, 800);
  }
  async function enregistrerMarquePage() {
    clearTimeout(minuterieMarque);
    minuterieMarque = null;
    const page = index + 1;
    if (!total || page === livre.derniere_page) return;
    livre.derniere_page = page;
    ecrireCache(cleCache, { livre, pages });
    const { error } = await etat.supabase.from('books').update({ derniere_page: page }).eq('id', livre.id);
    if (error) ecrireCache(`marque:${livre.id}`, page); // réessai à la prochaine ouverture
    else supprimerCache(`marque:${livre.id}`);
    supprimerCache(`bibliotheque:${etat.user.id}`);
  }

  // 5. Traduction de la page entière
  async function basculerTraduction() {
    if (traductions.has(index)) {
      voirTraduction = !voirTraduction;
      rendre();
      return;
    }
    const indexPage = index;
    const label = btnTrad.querySelector('span');
    btnTrad.disabled = true;
    label.textContent = 'Traduction…';
    try {
      const { traduireBlocs } = await import('../traduction.js');
      const blocs = blocsDuTexte(pages[indexPage].texte, livre.type);
      const traduits = await traduireBlocs(blocs, (fait, nb) => {
        if (indexPage === index) label.textContent = `Traduction… ${fait}/${nb}`;
      });
      traductions.set(indexPage, traduits);
      if (indexPage === index) { voirTraduction = true; rendre(); }
    } catch (e) {
      toast(e?.message || 'La traduction a échoué.', 'erreur', 5000);
      if (indexPage === index) label.textContent = 'Traduire la page';
    } finally {
      btnTrad.disabled = false;
    }
  }

  // 6. Traduction d'un mot au toucher
  function fermerBulle() {
    if (!bulle) return;
    bulle.remove();
    bulle = null;
    article.querySelectorAll('.mot.actif').forEach((m) => m.classList.remove('actif'));
  }
  async function traduireMot(span) {
    fermerBulle();
    const mot = span.textContent.replace(/^['’-]+|['’-]+$/g, '');
    span.classList.add('actif');
    bulle = document.createElement('div');
    bulle.className = 'bulle-mot';
    bulle.setAttribute('role', 'status');
    bulle.innerHTML = `<div class="bulle-contenu"><div class="bulle-source" lang="en">${esc(mot)}</div>
      <div class="bulle-trad"><span class="roue petite" aria-hidden="true" style="display:inline-block"></span> <span class="visuellement-cache">Traduction en cours</span></div></div>
      <button type="button" class="btn-icone" aria-label="Fermer la traduction">${icones.fermer}</button>`;
    document.body.appendChild(bulle);
    const maBulle = bulle;
    bulle.querySelector('button').addEventListener('click', fermerBulle);

    // Position : sous le mot (ou au-dessus s'il est trop bas)
    const r = span.getBoundingClientRect();
    const b = bulle.getBoundingClientRect();
    const gauche = Math.min(Math.max(12, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - 12);
    const enBas = r.bottom + b.height + 16 < window.innerHeight - 80;
    bulle.style.left = `${gauche}px`;
    bulle.style.top = `${enBas ? r.bottom + 8 : Math.max(12, r.top - b.height - 8)}px`;

    try {
      const { traduire } = await import('../traduction.js');
      const resultat = await traduire(mot);
      if (bulle !== maBulle) return;
      maBulle.querySelector('.bulle-trad').textContent = resultat || '—';
    } catch (e) {
      if (bulle !== maBulle) return;
      const zoneTrad = maBulle.querySelector('.bulle-trad');
      zoneTrad.style.fontWeight = '400';
      zoneTrad.style.fontSize = '.9rem';
      zoneTrad.textContent = e?.message || 'Traduction indisponible.';
    }
  }

  // 7. Feuilles : réglages, menu, avis, aller à, modifier
  function ouvrir(options) {
    feuilleOuverte?.fermer();
    fermerBulle();
    const f = ouvrirFeuille(options);
    const fermerOrigine = f.fermer;
    f.fermer = () => { fermerOrigine(); if (feuilleOuverte === f) feuilleOuverte = null; };
    f.el.querySelector('[data-fermer]').addEventListener('click', () => { if (feuilleOuverte === f) feuilleOuverte = null; });
    f.el.previousElementSibling?.addEventListener('click', () => { if (feuilleOuverte === f) feuilleOuverte = null; });
    feuilleOuverte = f;
    return f;
  }

  function ouvrirReglages() {
    const segTheme = [['clair', 'Clair', '#FFFFFF'], ['sepia', 'Sépia', '#F7EFDF'], ['sombre', 'Sombre', '#121214']]
      .map(([v, l, c]) => `<input type="radio" name="theme-lecture" id="tl-${v}" value="${v}" ${reglages.theme === v ? 'checked' : ''}>
        <label for="tl-${v}"><span class="pastille-theme" style="background:${c}"></span>${l}</label>`).join('');
    const segInter = [['serre', 'Serré'], ['normal', 'Normal'], ['aere', 'Aéré']]
      .map(([v, l]) => `<input type="radio" name="interligne" id="il-${v}" value="${v}" ${reglages.interligne === v ? 'checked' : ''}>
        <label for="il-${v}">${l}</label>`).join('');

    const f = ouvrir({
      titre: 'Affichage',
      contenu: `
        <div class="reglage">
          <p class="etiquette" id="lbl-taille">Taille du texte</p>
          <div class="reglage-taille" role="group" aria-labelledby="lbl-taille">
            <button type="button" class="btn btn-secondaire" data-taille="-1" aria-label="Réduire le texte" style="font-size:.9rem">A</button>
            <output aria-live="polite">${reglages.taille} px</output>
            <button type="button" class="btn btn-secondaire" data-taille="1" aria-label="Agrandir le texte" style="font-size:1.4rem">A</button>
          </div>
        </div>
        <fieldset class="reglage"><legend class="etiquette" style="margin-bottom:8px">Interligne</legend><div class="segments">${segInter}</div></fieldset>
        <fieldset class="reglage"><legend class="etiquette" style="margin-bottom:8px">Thème de lecture</legend><div class="segments">${segTheme}</div></fieldset>`,
    });
    const sortie = f.el.querySelector('output');
    f.el.querySelectorAll('[data-taille]').forEach((b) => b.addEventListener('click', () => {
      const i = TAILLES.indexOf(reglages.taille) + Number(b.dataset.taille);
      reglages.taille = TAILLES[Math.min(Math.max(i, 0), TAILLES.length - 1)];
      sortie.textContent = `${reglages.taille} px`;
      sauverReglages(reglages);
      appliquerReglages();
    }));
    f.el.querySelectorAll('input[name="interligne"]').forEach((r) => r.addEventListener('change', () => {
      reglages.interligne = r.value; sauverReglages(reglages); appliquerReglages();
    }));
    f.el.querySelectorAll('input[name="theme-lecture"]').forEach((r) => r.addEventListener('change', () => {
      reglages.theme = r.value; sauverReglages(reglages); appliquerReglages();
    }));
  }

  function ouvrirMenu() {
    const prog = calculerProgression();
    const f = ouvrir({
      titre: 'Options',
      contenu: `<ul class="liste-menu">
        <li><button type="button" data-m="objectif">${icones.coche} Objectif du jour (${prog.pourcent} %)</button></li>
        <li><button type="button" data-m="avis">${icones.etoile.replace('fill="currentColor"', '')} Avis des lecteurs</button></li>
        ${total ? `<li><button type="button" data-m="aller">${icones.aller} Aller à la page…</button></li>
        <li><button type="button" data-m="modifier">${icones.crayon} Corriger le texte de cette page</button></li>` : ''}
        <li><a href="#/ajouter/${livre.id}">${icones.photo} Ajouter des pages</a></li>
        <li><a href="#/livre/${livre.id}">${icones.livre} Fiche du livre</a></li>
      </ul>`,
    });
    f.el.querySelector('[data-m="objectif"]').addEventListener('click', () => {
      f.fermer();
      ouvrirReglageObjectif();
    });
    f.el.querySelector('[data-m="avis"]').addEventListener('click', ouvrirAvis);
    f.el.querySelector('[data-m="aller"]')?.addEventListener('click', ouvrirAllerA);
    f.el.querySelector('[data-m="modifier"]')?.addEventListener('click', ouvrirModifier);
    f.el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => f.fermer()));
  }

  async function ouvrirAvis() {
    const f = ouvrir({ titre: livre.titre, contenu: '<div class="conteneur-avis"></div>' });
    const { monterAvis } = await import('../avis.js');
    monterAvis(f.el.querySelector('.conteneur-avis'), livre);
  }

  function ouvrirAllerA() {
    const f = ouvrir({
      titre: 'Aller à la page',
      contenu: `<form novalidate>
        <div class="champ"><label for="aller-num">Numéro de page (1 à ${total})</label>
        <input class="saisie" id="aller-num" type="number" inputmode="numeric" min="1" max="${total}" value="${index + 1}"></div>
        <button type="submit" class="btn btn-primaire btn-bloc">Aller</button></form>`,
    });
    f.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseInt(f.el.querySelector('#aller-num').value, 10);
      if (!n || n < 1 || n > total) { toast(`Choisis un numéro entre 1 et ${total}.`, 'erreur'); return; }
      f.fermer();
      allerA(n - 1, n - 1 > index ? 1 : -1);
    });
  }

  function ouvrirModifier() {
    const page = pages[index];
    const f = ouvrir({
      titre: `Corriger la page ${index + 1}`,
      contenu: `<form novalidate>
        <div class="champ"><label for="modif-texte">Texte de la page</label>
        <textarea id="modif-texte" maxlength="20000" lang="${livre.langue}" style="min-height:45dvh">${esc(page.texte)}</textarea></div>
        <button type="submit" class="btn btn-primaire btn-bloc">Enregistrer</button></form>`,
    });
    f.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texte = f.el.querySelector('#modif-texte').value.replace(/\r/g, '').trim();
      if (!texte) { toast('La page ne peut pas être vide.', 'erreur'); return; }
      const bouton = f.el.querySelector('button[type="submit"]');
      bouton.disabled = true;
      const { error } = await etat.supabase.from('pages').update({ texte }).eq('id', page.id);
      bouton.disabled = false;
      if (error) { toast(messageErreur(error), 'erreur'); return; }
      page.texte = texte;
      traductions.delete(index);
      ecrireCache(cleCache, { livre, pages });
      f.fermer();
      rendre();
      toast('Page corrigée.');
    });
  }

  // 8. Écouteurs : boutons, balayage, clavier, mots
  racine.querySelector('[data-action="reglages"]').addEventListener('click', ouvrirReglages);
  racine.querySelector('[data-action="menu"]').addEventListener('click', ouvrirMenu);
  btnPrec.addEventListener('click', precedente);
  btnSuiv.addEventListener('click', suivante);
  btnTrad?.addEventListener('click', basculerTraduction);

  article.addEventListener('click', (e) => {
    const mot = e.target.closest('.mot');
    if (mot && estAnglais) traduireMot(mot);
  });

  // Balayage horizontal : gauche = page suivante, droite = page précédente
  let depart = null;
  zone.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { depart = null; return; }
    depart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  zone.addEventListener('touchend', (e) => {
    if (!depart) return;
    const dx = e.changedTouches[0].clientX - depart.x;
    const dy = e.changedTouches[0].clientY - depart.y;
    const rapide = Date.now() - depart.t < 700;
    depart = null;
    if (String(window.getSelection?.() || '').length) return; // sélection de texte en cours
    if (rapide && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) suivante(); else precedente();
    }
  }, { passive: true });

  const surTouche = (e) => {
    if (feuilleOuverte || e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); suivante(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); precedente(); }
    if (e.key === 'Escape') fermerBulle();
  };
  const surClicDocument = (e) => {
    if (bulle && !bulle.contains(e.target) && !e.target.closest('.mot')) fermerBulle();
  };
  const surDefilement = () => fermerBulle();
  const surCacher = () => {
    if (document.visibilityState === 'hidden') {
      comptabiliserTranche();
      if (minuterieMarque) enregistrerMarquePage();
    } else {
      debutTranche = Date.now();
    }
  };

  document.addEventListener('keydown', surTouche);
  document.addEventListener('click', surClicDocument);
  window.addEventListener('scroll', surDefilement, { passive: true });
  document.addEventListener('visibilitychange', surCacher);

  appliquerReglages();
  rendre();
  programmerValidationPage();
  // Synchronise le marque-page s'il avait été enregistré hors ligne
  if (enAttente) { livre.derniere_page = -1; programmerMarquePage(); }

  // 9. Nettoyage quand on quitte le lecteur
  return () => {
    clearInterval(intervalleTemps);
    clearTimeout(minuteriePageLue);
    comptabiliserTranche();
    if (minuterieMarque) enregistrerMarquePage();
    feuilleOuverte?.fermer();
    fermerBulle();
    document.removeEventListener('keydown', surTouche);
    document.removeEventListener('click', surClicDocument);
    window.removeEventListener('scroll', surDefilement);
    document.removeEventListener('visibilitychange', surCacher);
  };
}
