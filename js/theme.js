// Gestion du thème clair / sombre de l'application.
// - Par défaut : on suit le réglage du système (prefers-color-scheme).
// - Dès que l'utilisateur bascule manuellement, son choix est mémorisé.

const CLE = 'ebook-theme';
const requete = window.matchMedia('(prefers-color-scheme: dark)');

function lireChoix() {
  try { return localStorage.getItem(CLE); } catch { return null; }
}

export function themeActuel() {
  return document.documentElement.dataset.theme === 'sombre' ? 'sombre' : 'clair';
}

function appliquer(theme) {
  document.documentElement.dataset.theme = theme;
  const bouton = document.getElementById('bascule-theme');
  if (bouton) bouton.setAttribute('aria-label', theme === 'sombre' ? 'Activer le mode clair' : 'Activer le mode sombre');
  document.dispatchEvent(new CustomEvent('ebook:theme', { detail: theme }));
}

export function initialiserTheme() {
  const choix = lireChoix();
  appliquer(choix === 'sombre' || choix === 'clair' ? choix : (requete.matches ? 'sombre' : 'clair'));

  // Si l'utilisateur n'a rien choisi, on suit les changements du système
  requete.addEventListener('change', (e) => {
    if (!lireChoix()) appliquer(e.matches ? 'sombre' : 'clair');
  });

  document.getElementById('bascule-theme')?.addEventListener('click', () => {
    const nouveau = themeActuel() === 'sombre' ? 'clair' : 'sombre';
    try { localStorage.setItem(CLE, nouveau); } catch { /* stockage indisponible : tant pis */ }
    appliquer(nouveau);
  });
}
