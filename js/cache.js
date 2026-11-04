// Petit cache local (localStorage) pour lire ses livres hors ligne.
// Seules les données de l'utilisateur connecté sont stockées, sur son appareil.

const PREFIXE = 'ebook-cache:';

export function lireCache(cle) {
  try {
    const brut = localStorage.getItem(PREFIXE + cle);
    return brut ? JSON.parse(brut) : null;
  } catch { return null; }
}

export function ecrireCache(cle, valeur) {
  try {
    localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
  } catch {
    // Stockage plein : on libère les livres en cache puis on réessaie une fois
    viderCache('livre:');
    try { localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur)); } catch { /* tant pis */ }
  }
}

export function supprimerCache(cle) {
  try { localStorage.removeItem(PREFIXE + cle); } catch { /* rien */ }
}

/** Vide tout le cache (ou seulement les clés qui commencent par `debut`). */
export function viderCache(debut = '') {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIXE + debut))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* rien */ }
}
