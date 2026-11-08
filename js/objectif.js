// =============================================================================
//  Objectif de lecture personnel (strictement privé, propre à chaque utilisateur)
//  - Choix entre un objectif en « pages » ou en « minutes » par jour
//  - Rendu d'un diagramme circulaire SVG en pourcentage
//  - Série de jours consécutifs (« Streak » 🔥) et semainier (L M M J V S D)
//  - Synchronisé en local (localStorage) et dans les métadonnées privées Supabase Auth
// =============================================================================

import { etat } from './etat.js';
import { esc, icones, toast, ouvrirFeuille } from './ui.js';

const DEFAUT = {
  unite: 'pages', // 'pages' | 'minutes'
  cible: 10,      // 10 pages par défaut (ou 15 minutes)
};

function formaterDateLocale(d = new Date()) {
  const annee = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

function dateDuJour() {
  return formaterDateLocale(new Date());
}

function cleStockage() {
  const uid = etat.user?.id || 'invite';
  return `ebook:objectif:v1:${uid}`;
}

/** Fusionne deux historiques journaliers (en gardant les valeurs maximales de chaque jour). */
function fusionnerHistoriques(h1 = {}, h2 = {}) {
  const fusion = {};
  const cles = new Set([...Object.keys(h1 || {}), ...Object.keys(h2 || {})]);
  // On conserve les 60 derniers jours pour garder un objet léger
  const triees = [...cles].sort().slice(-60);
  for (const date of triees) {
    const a = h1?.[date] || {};
    const b = h2?.[date] || {};
    fusion[date] = {
      pages: Math.max(a.pages || 0, b.pages || 0),
      secondes: Math.max(a.secondes || 0, b.secondes || 0),
      atteint: Boolean(a.atteint || b.atteint),
    };
  }
  return fusion;
}

/**
 * Lit l'objectif, la progression du jour et l'historique de l'utilisateur connecté.
 * Fusionne les données locales et les métadonnées privées du compte Supabase.
 */
export function lireObjectif() {
  const aujourdhui = dateDuJour();
  let local = null;
  try {
    const brut = localStorage.getItem(cleStockage());
    if (brut) local = JSON.parse(brut);
  } catch { /* ignoré */ }

  const distant = etat.user?.user_metadata?.objectif_lecture || null;

  // Unité et cible : priorité à la modification la plus récente
  const sourceConfig = (distant?.updatedAt || 0) > (local?.updatedAt || 0) ? distant : (local || distant);
  const unite = sourceConfig?.unite === 'minutes' ? 'minutes' : DEFAUT.unite;
  const cible = Math.max(1, Math.min(1000, parseInt(sourceConfig?.cible, 10) || (unite === 'minutes' ? 15 : DEFAUT.cible)));

  // Progression du jour : uniquement si la date correspond à aujourd'hui
  const localJour = local?.dateJour === aujourdhui ? local : null;
  const distantJour = distant?.dateJour === aujourdhui ? distant : null;

  const pagesAujourdhui = Math.max(localJour?.pagesAujourdhui || 0, distantJour?.pagesAujourdhui || 0);
  const secondesAujourdhui = Math.max(localJour?.secondesAujourdhui || 0, distantJour?.secondesAujourdhui || 0);
  const clesPagesLues = [...new Set([
    ...(Array.isArray(localJour?.clesPagesLues) ? localJour.clesPagesLues : []),
    ...(Array.isArray(distantJour?.clesPagesLues) ? distantJour.clesPagesLues : []),
  ])].slice(-500);
  const feliciteAujourdhui = Boolean(localJour?.feliciteAujourdhui || distantJour?.feliciteAujourdhui);

  const historique = fusionnerHistoriques(local?.historique, distant?.historique);
  const valeurJour = unite === 'minutes' ? Math.floor(secondesAujourdhui / 60) : pagesAujourdhui;
  if (pagesAujourdhui > 0 || secondesAujourdhui > 0) {
    historique[aujourdhui] = {
      pages: Math.max(historique[aujourdhui]?.pages || 0, pagesAujourdhui),
      secondes: Math.max(historique[aujourdhui]?.secondes || 0, secondesAujourdhui),
      atteint: Boolean(historique[aujourdhui]?.atteint || valeurJour >= cible),
    };
  }

  return {
    unite,
    cible,
    dateJour: aujourdhui,
    pagesAujourdhui,
    secondesAujourdhui,
    clesPagesLues,
    feliciteAujourdhui,
    historique,
    updatedAt: Math.max(local?.updatedAt || 0, distant?.updatedAt || 0),
  };
}

let minuterieSync = null;

/** Enregistre l'objectif en local immédiatement et synchronise en arrière-plan sur le compte privé Supabase. */
export function sauverObjectif(donnees, { syncImmediat = false } = {}) {
  const base = lireObjectif();
  const aujourdhui = dateDuJour();
  const fusion = {
    ...base,
    ...donnees,
    dateJour: aujourdhui,
    updatedAt: Date.now(),
  };

  const minutes = Math.floor((fusion.secondesAujourdhui || 0) / 60);
  const valeur = fusion.unite === 'minutes' ? minutes : (fusion.pagesAujourdhui || 0);
  const atteint = valeur >= Math.max(1, fusion.cible || 1);

  const historique = { ...(fusion.historique || {}) };
  if (fusion.pagesAujourdhui > 0 || fusion.secondesAujourdhui > 0 || historique[aujourdhui]) {
    historique[aujourdhui] = {
      pages: fusion.pagesAujourdhui || 0,
      secondes: fusion.secondesAujourdhui || 0,
      atteint,
    };
  }
  fusion.historique = historique;

  try {
    localStorage.setItem(cleStockage(), JSON.stringify(fusion));
  } catch { /* quota */ }

  if (etat.user && etat.supabase) {
    etat.user.user_metadata = {
      ...(etat.user.user_metadata || {}),
      objectif_lecture: fusion,
    };

    clearTimeout(minuterieSync);
    const synchroniser = async () => {
      try {
        const { data } = await etat.supabase.auth.updateUser({
          data: { objectif_lecture: fusion },
        });
        if (data?.user) etat.user = data.user;
      } catch { /* hors-ligne : sera resynchronisé plus tard */ }
    };

    if (syncImmediat) {
      return synchroniser().then(() => fusion);
    }
    minuterieSync = setTimeout(synchroniser, 2500);
  }

  return Promise.resolve(fusion);
}

/** Calcule la série de jours consécutifs de lecture (« Streak ») et les 7 jours de la semaine (L à D). */
export function calculerSerieEtSemaine(obj = lireObjectif()) {
  const hist = obj.historique || {};
  const auj = new Date();
  auj.setHours(12, 0, 0, 0);
  const cleAuj = formaterDateLocale(auj);

  const aLuLeJour = (cle) => {
    const j = hist[cle];
    return Boolean(j && (j.pages > 0 || j.secondes >= 60 || j.atteint));
  };

  // Série de jours consécutifs : on part d'aujourd'hui (si lu aujourd'hui) ou d'hier
  let serie = 0;
  const curseur = new Date(auj);
  if (!aLuLeJour(cleAuj)) {
    curseur.setDate(curseur.getDate() - 1);
  }
  while (serie < 365) {
    const cle = formaterDateLocale(curseur);
    if (aLuLeJour(cle)) {
      serie++;
      curseur.setDate(curseur.getDate() - 1);
    } else {
      break;
    }
  }

  // Semainier du lundi au dimanche de la semaine en cours
  const jourSemaine = (auj.getDay() + 6) % 7; // 0 = Lundi ... 6 = Dimanche
  const lundi = new Date(auj);
  lundi.setDate(auj.getDate() - jourSemaine);

  const lettres = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const noms = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const semaine = lettres.map((lettre, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    const cle = formaterDateLocale(d);
    const info = hist[cle];
    const atteint = Boolean(info?.atteint);
    const actif = aLuLeJour(cle);
    return {
      lettre,
      nom: noms[i],
      estAujourdhui: cle === cleAuj,
      etat: atteint ? 'atteint' : (actif ? 'partiel' : 'vide'),
    };
  });

  return { serie, semaine };
}

/** Calcule les métriques d'affichage (valeur actuelle, cible, pourcentage 0-100, série, semainier). */
export function calculerProgression(obj = lireObjectif()) {
  const minutes = Math.floor((obj.secondesAujourdhui || 0) / 60);
  const valeur = obj.unite === 'minutes' ? minutes : (obj.pagesAujourdhui || 0);
  const cible = Math.max(1, obj.cible || 1);
  const pourcent = Math.min(100, Math.round((valeur / cible) * 100));
  const atteint = valeur >= cible;
  const { serie, semaine } = calculerSerieEtSemaine(obj);

  return {
    unite: obj.unite,
    cible,
    valeur,
    minutes,
    pages: obj.pagesAujourdhui || 0,
    pourcent,
    atteint,
    serie,
    semaine,
  };
}

/**
 * Appelé par le lecteur quand une page est lue.
 * Incrémente le compteur de pages du jour (une fois par page distincte et par jour).
 */
export function enregistrerPageLue(idLivre, numeroPage) {
  if (!idLivre || !numeroPage) return;
  const obj = lireObjectif();
  const clePage = `${idLivre}:${numeroPage}`;
  if (obj.clesPagesLues.includes(clePage)) return;

  const nouvellesCles = [...obj.clesPagesLues, clePage];
  const pagesAujourdhui = obj.pagesAujourdhui + 1;
  const misAJour = {
    ...obj,
    pagesAujourdhui,
    clesPagesLues: nouvellesCles,
  };

  verifierFelicitation(misAJour);
  sauverObjectif(misAJour);
}

/**
 * Appelé périodiquement par le lecteur pendant la lecture active.
 * Ajoute `secondes` au temps de lecture du jour.
 */
export function enregistrerTempsLecture(secondes) {
  if (!secondes || secondes <= 0) return;
  const obj = lireObjectif();
  const secondesAujourdhui = (obj.secondesAujourdhui || 0) + Math.round(secondes);
  const misAJour = {
    ...obj,
    secondesAujourdhui,
  };

  verifierFelicitation(misAJour);
  sauverObjectif(misAJour);
}

function verifierFelicitation(obj) {
  if (obj.feliciteAujourdhui) return;
  const prog = calculerProgression(obj);
  if (prog.atteint) {
    obj.feliciteAujourdhui = true;
    toast('🎉 Objectif de lecture du jour atteint ! Bravo !');
  }
}

/**
 * Génère le diagramme circulaire SVG (anneau de progression) avec le pourcentage au centre.
 */
export function diagrammeCirculaireHTML(pourcent, { taille = 92, atteint = false } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(pourcent || 0)));
  const rayon = 38;
  const circonference = +(2 * Math.PI * rayon).toFixed(2);
  const decalage = +((circonference * (100 - p)) / 100).toFixed(2);

  return `
    <div class="objectif-anneau ${atteint ? 'atteint' : ''}" style="width:${taille}px;height:${taille}px" role="img" aria-label="Progression de l'objectif : ${p} %">
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle class="anneau-fond" cx="48" cy="48" r="${rayon}" />
        <circle class="anneau-valeur" cx="48" cy="48" r="${rayon}"
          stroke-dasharray="${circonference}"
          stroke-dashoffset="${decalage}" />
      </svg>
      <div class="anneau-centre">
        <span class="anneau-pourcent">${p}<small>%</small></span>
      </div>
    </div>`;
}

/**
 * Génère la carte complète de l'objectif de lecture (diagramme circulaire + série + semainier).
 */
export function carteObjectifHTML() {
  const prog = calculerProgression();
  const libelleUnite = prog.unite === 'minutes'
    ? `${prog.valeur} / ${prog.cible} min aujourd'hui`
    : `${prog.valeur} / ${prog.cible} page${prog.cible > 1 ? 's' : ''} aujourd'hui`;

  const sousTexte = prog.atteint
    ? 'Objectif quotidien atteint, bravo !'
    : (prog.unite === 'minutes'
      ? `Encore ${Math.max(0, prog.cible - prog.valeur)} min pour atteindre ton objectif.`
      : `Encore ${Math.max(0, prog.cible - prog.valeur)} page${prog.cible - prog.valeur > 1 ? 's' : ''} pour atteindre ton objectif.`);

  const badgeSerie = prog.serie > 0
    ? `<span class="badge-serie" title="Jours consécutifs de lecture">🔥 ${prog.serie} jour${prog.serie > 1 ? 's' : ''} de suite</span>`
    : `<span class="badge-serie inactif">🔥 Série : 0 jour</span>`;

  const semainierHTML = prog.semaine.map((j) => `
    <div class="jour-semaine ${j.etat} ${j.estAujourdhui ? 'aujourdhui' : ''}" title="${esc(j.nom)}">
      <span class="jour-rond">${j.etat === 'atteint' ? '✓' : j.lettre}</span>
      <span class="jour-lettre">${j.lettre}</span>
    </div>
  `).join('');

  return `
    <section class="carte carte-objectif" aria-label="Mon objectif de lecture quotidien">
      ${diagrammeCirculaireHTML(prog.pourcent, { atteint: prog.atteint })}
      <div class="objectif-infos">
        <div class="objectif-entete">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="surtitre" style="margin:0">Objectif · Privé</span>
            ${badgeSerie}
          </div>
          <button type="button" class="btn btn-discret btn-objectif-reglage" data-action="regler-objectif">
            ${icones.crayon} Modifier
          </button>
        </div>
        <h2 class="objectif-titre">${esc(libelleUnite)}</h2>
        <p class="objectif-sous-texte">${esc(sousTexte)}</p>
        <div class="semainier" aria-label="Activité de lecture de la semaine">${semainierHTML}</div>
      </div>
    </section>`;
}

/**
 * Ouvre la feuille de configuration de l'objectif (Pages ou Minutes + cible).
 */
export function ouvrirReglageObjectif(surChangement) {
  const actuel = lireObjectif();
  const suggestionsPages = [5, 10, 20, 30, 50];
  const suggestionsMinutes = [10, 15, 20, 30, 45, 60];

  const f = ouvrirFeuille({
    titre: 'Mon objectif de lecture',
    contenu: `
      <form id="form-objectif" novalidate>
        <p class="aide" style="color:var(--texte-2);margin-bottom:16px">
          🔒 Cet objectif est strictement personnel et n'est jamais visible par les autres utilisateurs.
        </p>

        <fieldset class="champ">
          <legend>Type d'objectif quotidien</legend>
          <div class="segments">
            <input type="radio" name="unite" id="obj-pages" value="pages" ${actuel.unite === 'pages' ? 'checked' : ''}>
            <label for="obj-pages">En pages</label>
            <input type="radio" name="unite" id="obj-minutes" value="minutes" ${actuel.unite === 'minutes' ? 'checked' : ''}>
            <label for="obj-minutes">En minutes</label>
          </div>
        </fieldset>

        <div class="champ">
          <label for="obj-cible" id="lbl-obj-cible">
            ${actuel.unite === 'minutes' ? 'Nombre de minutes par jour' : 'Nombre de pages par jour'}
          </label>
          <input class="saisie" type="number" id="obj-cible" name="cible" inputmode="numeric" min="1" max="1000" required value="${actuel.cible}">
          <div class="suggestions" id="obj-suggestions" style="margin-top:8px"></div>
        </div>

        <div class="actions" style="margin-top:20px">
          <button type="submit" class="btn btn-primaire btn-bloc" id="btn-sauver-obj">Enregistrer mon objectif</button>
        </div>
      </form>`,
  });

  const form = f.el.querySelector('#form-objectif');
  const champCible = form.querySelector('#obj-cible');
  const labelCible = form.querySelector('#lbl-obj-cible');
  const zoneSuggestions = form.querySelector('#obj-suggestions');

  function rendreSuggestions(unite) {
    const liste = unite === 'minutes' ? suggestionsMinutes : suggestionsPages;
    const suffixe = unite === 'minutes' ? 'min' : 'p.';
    zoneSuggestions.innerHTML = liste.map((val) => `
      <button type="button" class="suggestion" data-val="${val}" style="min-height:36px;padding:6px 12px;font-size:.85rem">
        ${val} ${suffixe}
      </button>
    `).join('');
    zoneSuggestions.querySelectorAll('[data-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        champCible.value = btn.getAttribute('data-val');
      });
    });
  }

  rendreSuggestions(actuel.unite);

  form.querySelectorAll('input[name="unite"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const u = radio.value;
      labelCible.textContent = u === 'minutes' ? 'Nombre de minutes par jour' : 'Nombre de pages par jour';
      if (u === 'minutes' && Number(champCible.value) === 10) champCible.value = 15;
      if (u === 'pages' && Number(champCible.value) === 15) champCible.value = 10;
      rendreSuggestions(u);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const unite = form.unite.value === 'minutes' ? 'minutes' : 'pages';
    const cible = Math.max(1, Math.min(1000, parseInt(champCible.value, 10) || 10));
    const btn = form.querySelector('#btn-sauver-obj');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';

    const progAvant = calculerProgression();
    await sauverObjectif({
      unite,
      cible,
      feliciteAujourdhui: progAvant.valeur >= cible,
    }, { syncImmediat: true });

    toast('Objectif de lecture mis à jour !');
    f.fermer();
    surChangement?.();
  });
}

/**
 * Branche le bouton « Modifier » d'une carte objectif présente dans `racine`.
 */
export function brancherCarteObjectif(racine, rafraichir) {
  racine.querySelectorAll('[data-action="regler-objectif"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ouvrirReglageObjectif(rafraichir);
    });
  });
}
