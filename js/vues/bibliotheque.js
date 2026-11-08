// Vue « Bibliothèque » : grille des livres avec couverture, recherche, filtres et objectif quotidien.

import { etat, pseudoActuel } from '../etat.js';
import { esc, icones, couvertureHTML, hydraterCouvertures, erreurHTML, messageErreur } from '../ui.js';
import { lireCache, ecrireCache } from '../cache.js';
import { carteObjectifHTML, brancherCarteObjectif } from '../objectif.js';

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

function normaliser(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function statutLivre(l) {
  const total = l.nb_pages || 0;
  const page = l.derniere_page || 1;
  if (!total) return 'vide';
  if (page >= total && total > 1) return 'termine';
  if (page > 1) return 'encours';
  return 'acommencer';
}

function rendre(racine, livres) {
  const fab = `<a href="#/ajouter" class="fab" aria-label="Ajouter un livre">${icones.plus}</a>`;

  if (!livres.length) {
    racine.innerHTML = `
      ${carteObjectifHTML()}
      <section class="etat-vide bib-vide">
        <span class="logo-e grand" aria-hidden="true">E</span>
        <h1 class="titre-page">Ta bibliothèque t'attend</h1>
        <p>Photographie les pages d'un livre que tu possèdes ou choisis un classique gratuit : Ebook les transforme en un livre numérique à lire partout.</p>
        <a href="#/ajouter" class="btn btn-primaire">${icones.plus} Ajouter mon premier livre</a>
      </section>${fab}`;
    brancherCarteObjectif(racine, () => rendre(racine, livres));
    return;
  }

  let filtreActif = 'tous'; // 'tous' | 'encours' | 'termine' | 'roman' | 'theatre'
  let requete = '';

  const filtres = [
    ['tous', 'Tous'],
    ['encours', 'En cours'],
    ['termine', 'Terminés'],
    ['roman', 'Romans'],
    ['theatre', 'Théâtre'],
  ];

  racine.innerHTML = `
    <div class="bib-entete">
      <div>
        <p class="surtitre">${salutation()}, ${esc(pseudoActuel())}</p>
        <h1 class="titre-page">Ma bibliothèque</h1>
      </div>
      <p class="bib-compte" id="bib-compteur">${livres.length} livre${livres.length > 1 ? 's' : ''}</p>
    </div>

    <div id="zone-objectif-bib">${carteObjectifHTML()}</div>

    <div class="bib-outils">
      <div class="bib-recherche">
        <span class="bib-recherche-icone" aria-hidden="true">${icones.recherche}</span>
        <input type="search" class="saisie bib-recherche-saisie" id="bib-q" placeholder="Rechercher un titre ou un auteur…" autocomplete="off" aria-label="Rechercher un livre dans ta bibliothèque">
      </div>
      <div class="bib-filtres" role="tablist" aria-label="Filtrer les livres">
        ${filtres.map(([id, label]) => `
          <button type="button" class="pastille-filtre ${id === 'tous' ? 'actif' : ''}" data-filtre="${id}">
            ${label}
          </button>
        `).join('')}
      </div>
    </div>

    <div id="bib-resultats"></div>
    ${fab}`;

  const zoneResultats = racine.querySelector('#bib-resultats');
  const compteur = racine.querySelector('#bib-compteur');
  const champRecherche = racine.querySelector('#bib-q');
  const zoneObjectif = racine.querySelector('#zone-objectif-bib');

  function rafraichirObjectif() {
    zoneObjectif.innerHTML = carteObjectifHTML();
    brancherCarteObjectif(zoneObjectif, rafraichirObjectif);
  }
  brancherCarteObjectif(zoneObjectif, rafraichirObjectif);

  function rendreGrille() {
    const q = normaliser(requete.trim());
    const filtresLivres = livres.filter((l) => {
      if (q && !normaliser(`${l.titre} ${l.auteur}`).includes(q)) return false;
      const st = statutLivre(l);
      if (filtreActif === 'encours') return st === 'encours' || (st === 'acommencer' && l.nb_pages > 0);
      if (filtreActif === 'termine') return st === 'termine';
      if (filtreActif === 'roman') return l.type === 'roman';
      if (filtreActif === 'theatre') return l.type === 'theatre';
      return true;
    });

    compteur.textContent = `${filtresLivres.length} livre${filtresLivres.length > 1 ? 's' : ''}`;

    if (!filtresLivres.length) {
      zoneResultats.innerHTML = `
        <div class="etat-vide" style="padding:36px 16px">
          <p style="margin:0 0 10px">Aucun livre ne correspond à ce filtre.</p>
          <button type="button" class="btn btn-secondaire" id="btn-reinit-filtre">Tout afficher</button>
        </div>`;
      zoneResultats.querySelector('#btn-reinit-filtre')?.addEventListener('click', () => {
        filtreActif = 'tous';
        requete = '';
        champRecherche.value = '';
        racine.querySelectorAll('[data-filtre]').forEach((b) => b.classList.toggle('actif', b.dataset.filtre === 'tous'));
        rendreGrille();
      });
      return;
    }

    const cartes = filtresLivres.map((l, i) => {
      const total = l.nb_pages;
      const page = Math.min(Math.max(l.derniere_page || 1, 1), Math.max(total, 1));
      const pourcent = total ? Math.round((page / total) * 100) : 0;
      const lien = total ? `#/lecteur/${l.id}` : `#/ajouter/${l.id}`;
      const etiquette = total
        ? `Lire ${l.titre}${l.auteur ? `, de ${l.auteur}` : ''} — page ${page} sur ${total}`
        : `Ajouter des pages à ${l.titre}`;
      const progression = total
        ? (pourcent >= 100 && total > 1 ? `✓ Terminé (${total} p.)` : `Page ${page} / ${total}`)
        : 'Aucune page pour l\'instant';
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

    zoneResultats.innerHTML = `<ul class="grille-livres">${cartes}</ul>`;
    hydraterCouvertures(zoneResultats);
  }

  champRecherche.addEventListener('input', () => {
    requete = champRecherche.value;
    rendreGrille();
  });

  racine.querySelectorAll('[data-filtre]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filtreActif = btn.dataset.filtre;
      racine.querySelectorAll('[data-filtre]').forEach((b) => b.classList.toggle('actif', b === btn));
      rendreGrille();
    });
  });

  rendreGrille();
}

function squeletteHTML() {
  const carte = '<li><div class="squelette" style="aspect-ratio:2/3"></div><div class="squelette" style="height:12px;margin-top:12px;width:70%"></div></li>';
  return `<div class="bib-entete"><div><div class="squelette" style="height:14px;width:120px;margin-bottom:10px"></div>
    <h1 class="titre-page">Ma bibliothèque</h1></div></div>
    <ul class="grille-livres" aria-busy="true" aria-label="Chargement de ta bibliothèque">${carte.repeat(4)}</ul>`;
}
