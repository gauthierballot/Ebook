// Vue « Bibliothèque » : grille des livres avec couverture CSS et progression.

import { etat, pseudoActuel } from '../etat.js';
import { esc, icones, couvertureHTML, hydraterCouvertures, erreurHTML, messageErreur } from '../ui.js';
import { lireCache, ecrireCache } from '../cache.js';

export async function afficher(racine) {
  const cleCache = `bibliotheque:${etat.user.id}`;
  const enCache = lireCache(cleCache);

  // Squelette (ou affichage immédiat du cache pendant le chargement)
  if (enCache) rendre(racine, enCache);
  else racine.innerHTML = squeletteHTML();

  const { data, error } = await etat.supabase
    .from('books')
    .select('id, titre, auteur, type, langue, derniere_page, created_at, pages(count)')
    .order('created_at', { ascending: false });

  if (error) {
    if (enCache) return; // on garde l'affichage du cache (hors ligne)
    racine.innerHTML = erreurHTML(messageErreur(error), 'Bibliothèque indisponible');
    racine.querySelector('[data-action="reessayer"]').addEventListener('click', () => afficher(racine));
    return;
  }

  const livres = data.map((l) => ({ ...l, nb_pages: l.pages?.[0]?.count ?? 0 }));
  ecrireCache(cleCache, livres);
  rendre(racine, livres);
}

function salutation() {
  const h = new Date().getHours();
  return h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
}

function rendre(racine, livres) {
  const fab = `<a href="#/ajouter" class="fab" aria-label="Ajouter un livre">${icones.plus}</a>`;

  if (!livres.length) {
    racine.innerHTML = `
      <section class="etat-vide bib-vide">
        <span class="logo-e grand" aria-hidden="true">E</span>
        <h1 class="titre-page">Ta bibliothèque t'attend</h1>
        <p>Photographie les pages d'un livre que tu possèdes : Ebook les transforme en un livre numérique à lire partout.</p>
        <a href="#/ajouter" class="btn btn-primaire">${icones.plus} Ajouter mon premier livre</a>
      </section>${fab}`;
    return;
  }

  const cartes = livres.map((l, i) => {
    const total = l.nb_pages;
    const page = Math.min(Math.max(l.derniere_page || 1, 1), Math.max(total, 1));
    const pourcent = total ? Math.round((page / total) * 100) : 0;
    const lien = total ? `#/lecteur/${l.id}` : `#/ajouter/${l.id}`;
    const etiquette = total
      ? `Lire ${l.titre}${l.auteur ? `, de ${l.auteur}` : ''} — page ${page} sur ${total}`
      : `Ajouter des pages à ${l.titre}`;
    const progression = total ? `Page ${page} / ${total}` : 'Aucune page pour l\'instant';
    return `
      <li class="carte-livre" style="--i:${i}">
        <a class="carte-lien" href="${lien}" aria-label="${esc(etiquette)}">${couvertureHTML(l)}</a>
        <div class="carte-meta">
          <div class="carte-meta-texte">
            <p class="carte-titre">${esc(l.titre)}</p>
            <p class="carte-progression">${esc(progression)}</p>
            <div class="barre" aria-hidden="true"><span style="width:${pourcent}%"></span></div>
          </div>
          <a class="btn-icone" href="#/livre/${l.id}" aria-label="Fiche et avis : ${esc(l.titre)}">${icones.plusOptions}</a>
        </div>
      </li>`;
  }).join('');

  racine.innerHTML = `
    <div class="bib-entete">
      <div>
        <p class="surtitre">${salutation()}, ${esc(pseudoActuel())}</p>
        <h1 class="titre-page">Ma bibliothèque</h1>
      </div>
      <p class="bib-compte">${livres.length} livre${livres.length > 1 ? 's' : ''}</p>
    </div>
    <ul class="grille-livres">${cartes}</ul>
    ${fab}`;
  hydraterCouvertures(racine);
}

function squeletteHTML() {
  const carte = '<li><div class="squelette" style="aspect-ratio:2/3"></div><div class="squelette" style="height:12px;margin-top:12px;width:70%"></div></li>';
  return `<div class="bib-entete"><div><div class="squelette" style="height:14px;width:120px;margin-bottom:10px"></div>
    <h1 class="titre-page">Ma bibliothèque</h1></div></div>
    <ul class="grille-livres" aria-busy="true" aria-label="Chargement de ta bibliothèque">${carte.repeat(4)}</ul>`;
}
