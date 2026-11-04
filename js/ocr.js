// =============================================================================
//  OCR : reconnaissance du texte d'une photo, dans le navigateur (Tesseract.js)
//  Le script Tesseract (lourd) n'est chargé qu'au moment d'ajouter une page.
// =============================================================================

const URL_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LANGUES = ['fra', 'eng']; // français + anglais

let promesseScript = null;
let worker = null;
let promesseWorker = null;
let rappelProgression = null; // fonction appelée pendant l'OCR

/** Erreur « métier » avec un code lisible par l'interface. */
export class ErreurOCR extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;          // 'chargement' | 'image' | 'vide' | 'illisible' | 'annule'
    Object.assign(this, details);
  }
}

/** Charge le script Tesseract une seule fois. */
function chargerScript() {
  if (window.Tesseract) return Promise.resolve();
  if (!promesseScript) {
    promesseScript = new Promise((resoudre, rejeter) => {
      const s = document.createElement('script');
      s.src = URL_TESSERACT;
      s.async = true;
      s.onload = () => resoudre();
      s.onerror = () => { s.remove(); rejeter(new Error('script')); };
      document.head.appendChild(s);
    }).catch((e) => { promesseScript = null; throw e; });
  }
  return promesseScript;
}

/** Libellés français des étapes internes de Tesseract. */
const ETAPES = {
  'loading tesseract core': 'Chargement du moteur de lecture…',
  'initializing tesseract': 'Démarrage du moteur…',
  'initialized tesseract': 'Démarrage du moteur…',
  'loading language traineddata': 'Chargement des langues (une seule fois)…',
  'loaded language traineddata': 'Langues prêtes…',
  'initializing api': 'Préparation…',
  'initialized api': 'Préparation…',
  'recognizing text': 'Lecture du texte…',
};

function journal(m) {
  if (!rappelProgression || !m?.status) return;
  const p = typeof m.progress === 'number' ? m.progress : 0;
  // 0 → 30 % : chargement ; 30 → 100 % : reconnaissance
  const global = m.status === 'recognizing text' ? 30 + p * 70 : Math.min(28, 5 + p * 23);
  rappelProgression({ libelle: ETAPES[m.status] || 'Traitement…', pourcent: Math.round(global) });
}

async function obtenirWorker() {
  if (worker) return worker;
  if (!promesseWorker) {
    promesseWorker = (async () => {
      await chargerScript();
      const w = await window.Tesseract.createWorker(LANGUES, 1, { logger: journal, errorHandler: () => {} });
      await w.setParameters({ preserve_interword_spaces: '1' });
      worker = w;
      return w;
    })().catch((e) => { promesseWorker = null; throw e; });
  }
  return promesseWorker;
}

/** Libère la mémoire (appelé quand on quitte l'écran d'ajout). */
export async function arreterOCR() {
  const w = worker;
  worker = null;
  promesseWorker = null;
  if (w) { try { await w.terminate(); } catch { /* déjà arrêté */ } }
}

// ---------------------------------------------------------------------------
// Prétraitement de l'image : redimensionnement, niveaux de gris, contraste
// ---------------------------------------------------------------------------
async function decoderImage(fichier) {
  try {
    return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  } catch {
    // Repli pour les anciens navigateurs
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function pretraiter(fichier) {
  let image;
  try {
    image = await decoderImage(fichier);
  } catch {
    throw new ErreurOCR('image', 'Ce format d\'image n\'est pas pris en charge. Essaie une photo JPEG ou PNG.');
  }

  const largeur = image.width;
  const hauteur = image.height;
  if (!largeur || !hauteur) throw new ErreurOCR('image', 'Cette image semble vide ou abîmée.');

  // Côté le plus long ramené entre 1 400 et 2 400 px : bon compromis précision / vitesse
  const cote = Math.max(largeur, hauteur);
  const echelle = cote > 2400 ? 2400 / cote : cote < 1400 ? Math.min(2, 1400 / cote) : 1;
  const l = Math.round(largeur * echelle);
  const h = Math.round(hauteur * echelle);

  const canvas = document.createElement('canvas');
  canvas.width = l;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, l, h);
  if (typeof image.close === 'function') image.close();

  const donnees = ctx.getImageData(0, 0, l, h);
  const px = donnees.data;

  // 1) Niveaux de gris (luminance) + histogramme
  const histo = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = g;
    histo[g]++;
  }

  // 2) Étirement du contraste : on ignore 1 % des pixels les plus sombres et clairs
  const total = l * h;
  let cumul = 0, bas = 0, haut = 255;
  for (let v = 0; v < 256; v++) { cumul += histo[v]; if (cumul > total * 0.01) { bas = v; break; } }
  cumul = 0;
  for (let v = 255; v >= 0; v--) { cumul += histo[v]; if (cumul > total * 0.01) { haut = v; break; } }
  const etendue = Math.max(1, haut - bas);

  for (let i = 0; i < px.length; i += 4) {
    let v = ((px[i] - bas) * 255) / etendue;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    // Légère courbe pour foncer l'encre sans écraser les détails
    v = 255 * Math.pow(v / 255, 1.15);
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(donnees, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Nettoyage du texte reconnu
// ---------------------------------------------------------------------------
export function nettoyerTexte(brut) {
  return String(brut || '')
    .replace(/\r/g, '')
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    .split('\n')
    .map((ligne) => ligne.replace(/[ \t]+$/g, '').replace(/^[ \t]+/, ''))
    // On retire les lignes de « bruit » (ex. « | », « ~ ») sans aucune lettre ni chiffre
    .filter((ligne) => ligne === '' || /[\p{L}\p{N}]/u.test(ligne))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Reconnaissance complète
// ---------------------------------------------------------------------------
/**
 * Lit le texte d'une photo.
 * @param {File} fichier
 * @param {(p:{libelle:string,pourcent:number})=>void} surProgression
 * @returns {Promise<{texte:string, confiance:number}>}
 */
export async function reconnaitre(fichier, surProgression) {
  rappelProgression = surProgression;
  surProgression?.({ libelle: 'Préparation de l\'image…', pourcent: 2 });

  const canvas = await pretraiter(fichier);

  let w;
  try {
    w = await obtenirWorker();
  } catch {
    throw new ErreurOCR('chargement', navigator.onLine
      ? 'Le moteur de lecture n\'a pas pu se charger. Réessaie dans un instant.'
      : 'Tu es hors ligne : le moteur de lecture doit être téléchargé la première fois.');
  }

  let resultat;
  try {
    resultat = await w.recognize(canvas);
  } catch {
    if (!worker) throw new ErreurOCR('annule', 'Lecture annulée.');
    throw new ErreurOCR('illisible', 'La lecture de la photo a échoué. Reprends la photo.');
  } finally {
    rappelProgression = null;
  }

  const texte = nettoyerTexte(resultat?.data?.text);
  const confiance = Math.round(resultat?.data?.confidence ?? 0);
  const nbLettres = (texte.match(/\p{L}/gu) || []).length;

  if (nbLettres < 15) {
    throw new ErreurOCR('vide', 'Aucun texte n\'a été trouvé sur cette photo. Vérifie que la page est bien cadrée et éclairée.', { texte, confiance });
  }
  if (confiance < 30) {
    throw new ErreurOCR('illisible', 'La photo semble floue ou mal éclairée : le texte est difficile à lire.', { texte, confiance });
  }
  return { texte, confiance };
}

/** Annule une lecture en cours (en arrêtant le moteur). */
export function annulerOCR() {
  return arreterOCR();
}
