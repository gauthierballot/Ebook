// =============================================================================
//  Traduction anglais → français avec l'API gratuite MyMemory (sans clé)
//  https://mymemory.translated.net/doc/spec.php
// =============================================================================

import { MYMEMORY_EMAIL } from './config.js';

const API = 'https://api.mymemory.translated.net/get';
const TAILLE_MAX = 450; // MyMemory accepte 500 octets maximum par requête
const cache = new Map();

/** Levée quand le quota gratuit du jour est épuisé. */
export class LimiteAtteinte extends Error {
  constructor() {
    super('La limite quotidienne de traductions gratuites est atteinte. Réessaie demain.');
    this.code = 'limite';
  }
}

/** Décode les entités HTML que MyMemory renvoie parfois (&#39; etc.). */
function decoder(texte) {
  const t = document.createElement('textarea');
  t.innerHTML = texte;
  return t.value;
}

/** Traduit un court texte (≤ 450 caractères). */
export async function traduire(texte) {
  const source = String(texte || '').trim();
  if (!source) return '';
  if (cache.has(source)) return cache.get(source);
  if (!navigator.onLine) throw new Error('Tu es hors ligne : la traduction a besoin d\'internet.');

  const params = new URLSearchParams({ q: source, langpair: 'en|fr' });
  if (MYMEMORY_EMAIL) params.set('de', MYMEMORY_EMAIL);

  let reponse;
  try {
    reponse = await fetch(`${API}?${params}`);
  } catch {
    throw new Error('Le service de traduction est injoignable. Réessaie plus tard.');
  }
  if (reponse.status === 429) throw new LimiteAtteinte();
  if (!reponse.ok) throw new Error('Le service de traduction ne répond pas correctement.');

  const donnees = await reponse.json().catch(() => null);
  const traduction = donnees?.responseData?.translatedText || '';
  const statut = Number(donnees?.responseStatus);

  if (donnees?.quotaFinished || statut === 429 || /MYMEMORY WARNING|YOU USED ALL AVAILABLE FREE TRANSLATIONS/i.test(traduction)) {
    throw new LimiteAtteinte();
  }
  if (statut !== 200 || !traduction) throw new Error('La traduction n\'a pas pu être obtenue.');

  const resultat = decoder(traduction);
  cache.set(source, resultat);
  return resultat;
}

/** Découpe un long texte en morceaux ≤ 450 caractères (phrases, puis mots). */
function decouper(texte) {
  if (texte.length <= TAILLE_MAX) return [texte];
  const phrases = texte.match(/[^.!?;:]+[.!?;:]+["'»”)]*\s*|[^.!?;:]+$/g) || [texte];
  const morceaux = [];
  let courant = '';
  for (const phrase of phrases) {
    if (phrase.length > TAILLE_MAX) {
      if (courant) { morceaux.push(courant); courant = ''; }
      let tampon = '';
      for (const mot of phrase.split(/(\s+)/)) {
        if ((tampon + mot).length > TAILLE_MAX) { morceaux.push(tampon); tampon = ''; }
        tampon += mot;
      }
      if (tampon.trim()) courant = tampon;
    } else if ((courant + phrase).length > TAILLE_MAX) {
      morceaux.push(courant);
      courant = phrase;
    } else {
      courant += phrase;
    }
  }
  if (courant.trim()) morceaux.push(courant);
  return morceaux.map((m) => m.trim()).filter(Boolean);
}

/**
 * Traduit une liste de blocs (paragraphes ou répliques) en conservant leur ordre.
 * @param {string[]} blocs
 * @param {(fait:number,total:number)=>void} surProgression
 * @returns {Promise<string[]>}
 */
export async function traduireBlocs(blocs, surProgression) {
  const taches = [];
  blocs.forEach((bloc, i) => {
    if (!bloc.trim()) return;
    decouper(bloc).forEach((morceau, j) => taches.push({ i, j, morceau }));
  });

  const resultats = blocs.map(() => []);
  let fait = 0;
  let indice = 0;

  // 3 requêtes en parallèle maximum, pour rester raisonnable avec le service gratuit
  async function ouvrier() {
    while (indice < taches.length) {
      const t = taches[indice++];
      resultats[t.i][t.j] = await traduire(t.morceau);
      surProgression?.(++fait, taches.length);
    }
  }
  await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
  return resultats.map((parts) => parts.join(' '));
}
