// =============================================================================
//  OCR : Reconnaissance de texte pour Ebook
//  1. Voie principale : IA de vision Google Gemini via la serverless /api/ocr
//  2. Voie de secours : Tesseract.js optimisé en local dans le navigateur
// =============================================================================

const URL_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let promesseScriptTesseract = null;
let tesseractWorker = null;
let tesseractLangue = null;
let rappelProgression = null;

export class ErreurOCR extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code; // 'chargement' | 'image' | 'vide' | 'illisible' | 'annule' | 'reseau'
    Object.assign(this, details);
  }
}

// -----------------------------------------------------------------------------
// 1. Décodage et orientation EXIF de la photo
// -----------------------------------------------------------------------------
async function chargerImageOriente(fichier) {
  try {
    return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  } catch {
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

// -----------------------------------------------------------------------------
// 2. Préparation pour l'IA Gemini (voie principale)
//    - Orientation EXIF corrigée
//    - Côté le plus long à 1600 px max
//    - Export JPEG qualité 0.85 SANS niveaux de gris ni altération de contraste
// -----------------------------------------------------------------------------
export async function preparerPourGemini(fichier) {
  let img;
  try {
    img = await chargerImageOriente(fichier);
  } catch {
    throw new ErreurOCR('image', "Format d'image non supporté ou fichier illisible.");
  }

  const w = img.width;
  const h = img.height;
  if (!w || !h) throw new ErreurOCR('image', "L'image semble vide ou corrompue.");

  const maxCote = 1600;
  const ratio = Math.min(1, maxCote / Math.max(w, h));
  const cibleW = Math.round(w * ratio);
  const cibleH = Math.round(h * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = cibleW;
  canvas.height = cibleH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cibleW, cibleH);

  if (typeof img.close === 'function') img.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
}

// -----------------------------------------------------------------------------
// 3. Appel de l'API /api/ocr (Gemini)
// -----------------------------------------------------------------------------
async function reconnaitreParGemini(fichier, { langue = 'fr', type = 'roman', token }, surProgression) {
  surProgression?.({ libelle: "Préparation de l'image…", pourcent: 15 });
  const base64 = await preparerPourGemini(fichier);

  surProgression?.({ libelle: "Lecture de la page par l'IA…", pourcent: 45 });

  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const reponse = await fetch('/api/ocr', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image: base64,
      langue,
      type,
    }),
  });

  surProgression?.({ libelle: "Finalisation du texte…", pourcent: 85 });

  const donnees = await reponse.json().catch(() => ({}));

  if (!reponse.ok) {
    const message = donnees.erreur || `Erreur serveur (${reponse.status})`;
    throw new ErreurOCR('ia_echec', message, { statut: reponse.status, nonConfigure: donnees.nonConfigure });
  }

  const texte = (donnees.texte || '').trim();

  if (texte === '[ILLISIBLE]') {
    throw new ErreurOCR('illisible', "La page est illisible ou ne contient pas de texte. Reprends la photo avec plus de lumière.");
  }

  if (!texte) {
    throw new ErreurOCR('vide', "Aucun texte n'a été trouvé sur cette page.");
  }

  surProgression?.({ libelle: "Terminé !", pourcent: 100 });
  return {
    texte,
    mode: 'ia',
    confiance: 99,
  };
}

// -----------------------------------------------------------------------------
// 4. Moteur de secours : Tesseract.js optimisé
// -----------------------------------------------------------------------------
function chargerScriptTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!promesseScriptTesseract) {
    promesseScriptTesseract = new Promise((resoudre, rejeter) => {
      const s = document.createElement('script');
      s.src = URL_TESSERACT;
      s.async = true;
      s.onload = () => resoudre();
      s.onerror = () => {
        s.remove();
        promesseScriptTesseract = null;
        rejeter(new ErreurOCR('chargement', "Impossible de charger Tesseract.js."));
      };
      document.head.appendChild(s);
    });
  }
  return promesseScriptTesseract;
}

const ETAPES_TESSERACT = {
  'loading tesseract core': 'Chargement du moteur local…',
  'initializing tesseract': 'Initialisation du moteur…',
  'loading language traineddata': 'Téléchargement de la langue…',
  'loaded language traineddata': 'Langue chargée…',
  'recognizing text': 'Lecture locale du texte…',
};

function journalTesseract(m) {
  if (!rappelProgression || !m?.status) return;
  const p = typeof m.progress === 'number' ? m.progress : 0;
  const global = m.status === 'recognizing text' ? 40 + p * 55 : Math.min(38, 10 + p * 28);
  rappelProgression({
    libelle: ETAPES_TESSERACT[m.status] || 'Traitement local…',
    pourcent: Math.round(global),
    secours: true,
  });
}

async function obtenirWorkerTesseract(langueCode) {
  if (tesseractWorker && tesseractLangue === langueCode) {
    return tesseractWorker;
  }

  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch {}
    tesseractWorker = null;
    tesseractLangue = null;
  }

  await chargerScriptTesseract();

  try {
    const w = await window.Tesseract.createWorker(langueCode, 1, {
      logger: journalTesseract,
      errorHandler: () => {},
    });
    tesseractWorker = w;
    tesseractLangue = langueCode;
    return w;
  } catch {
    throw new ErreurOCR('chargement', `Impossible de charger les données linguistiques pour ${langueCode}. Vérifie ta connexion.`);
  }
}

// Prétraitement modéré pour Tesseract (largeur 1800-2200px, niveaux de gris doux)
async function pretraiterPourTesseract(fichier) {
  const img = await chargerImageOriente(fichier);
  const w = img.width;
  const h = img.height;
  if (!w || !h) throw new ErreurOCR('image', "Image vide.");

  // Largeur cible entre 1800 et 2200 px
  const cibleW = Math.min(2200, Math.max(1800, Math.round(w)));
  const echelle = cibleW / w;
  const cibleH = Math.round(h * echelle);

  const canvas = document.createElement('canvas');
  canvas.width = cibleW;
  canvas.height = cibleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cibleW, cibleH);
  if (typeof img.close === 'function') img.close();

  const donnees = ctx.getImageData(0, 0, cibleW, cibleH);
  const px = donnees.data;

  // Niveaux de gris + calcul min/max modéré
  const histo = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = lum;
    histo[lum]++;
  }

  // Étirement doux du contraste (ignore 0.5% des extrêmes pour éviter d'écraser les caractères fins)
  const total = cibleW * cibleH;
  let cumul = 0, bas = 0, haut = 255;
  for (let v = 0; v < 256; v++) { cumul += histo[v]; if (cumul > total * 0.005) { bas = v; break; } }
  cumul = 0;
  for (let v = 255; v >= 0; v--) { cumul += histo[v]; if (cumul > total * 0.005) { haut = v; break; } }
  const etendue = Math.max(1, haut - bas);

  for (let i = 0; i < px.length; i += 4) {
    let v = ((px[i] - bas) * 255) / etendue;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    px[i] = px[i + 1] = px[i + 2] = v;
  }

  ctx.putImageData(donnees, 0, 0);
  return canvas;
}

export function nettoyerTexte(brut) {
  return String(brut || '')
    .replace(/\r/g, '')
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    .split('\n')
    .map((ligne) => ligne.replace(/[ \t]+$/g, '').replace(/^[ \t]+/, ''))
    .filter((ligne) => ligne === '' || /[\p{L}\p{N}]/u.test(ligne))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function reconnaitreParTesseract(fichier, { langue = 'fr', type = 'roman' }, surProgression) {
  const codeLangue = langue === 'en' ? 'eng' : 'fra';
  rappelProgression = surProgression;

  surProgression?.({ libelle: "Préparation pour lecture locale…", pourcent: 10, secours: true });
  const canvas = await pretraiterPourTesseract(fichier);

  const w = await obtenirWorkerTesseract(codeLangue);

  // PSM 6 pour le théâtre (bloc uniforme), PSM 3 pour les romans
  const psm = type === 'theatre' ? '6' : '3';
  await w.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: '1',
  });

  surProgression?.({ libelle: "Lecture locale en cours…", pourcent: 40, secours: true });
  const resultat = await w.recognize(canvas);

  rappelProgression = null;

  const texte = nettoyerTexte(resultat?.data?.text);
  const confiance = Math.round(resultat?.data?.confidence ?? 0);
  const nbLettres = (texte.match(/\p{L}/gu) || []).length;

  if (nbLettres < 15) {
    throw new ErreurOCR('vide', "Aucun texte trouvé. Vérifie le cadrage et l'éclairage.", { texte, confiance });
  }

  return {
    texte,
    mode: 'local',
    confiance,
    faibleConfiance: confiance < 60,
  };
}

// -----------------------------------------------------------------------------
// 5. Point d'entrée principal : Gemini d'abord, Tesseract en secours
// -----------------------------------------------------------------------------
export async function reconnaitre(fichier, options = {}, surProgression) {
  const { langue = 'fr', type = 'roman', token } = options;

  // Tentative 1 : IA Gemini
  try {
    return await reconnaitreParGemini(fichier, { langue, type, token }, surProgression);
  } catch (err) {
    // Si la page a été déclarée illisible par Gemini ou annulée, on ne passe pas en secours
    if (err.code === 'illisible' || err.code === 'annule') {
      throw err;
    }

    // Bascule automatique sur Tesseract en secours
    surProgression?.({
      libelle: "Bascule sur le moteur local de secours…",
      pourcent: 20,
      secours: true,
      messageSecours: "Lecture locale, la qualité peut être moindre.",
    });

    const resSecours = await reconnaitreParTesseract(fichier, { langue, type }, surProgression);
    resSecours.secoursActive = true;
    return resSecours;
  }
}

export async function arreterOCR() {
  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch {}
    tesseractWorker = null;
    tesseractLangue = null;
  }
  rappelProgression = null;
}

export function annulerOCR() {
  return arreterOCR();
}
