// =============================================================================
//  Surlignages & Carnet de citations favorites (strictement privé par utilisateur)
//  - Surlignage en 3 couleurs (jaune, rose, bleu) + note personnelle
//  - Synchronisation locale (localStorage) et dans Supabase Auth user_metadata
// =============================================================================

import { etat } from './etat.js';
import { esc, icones, toast, ouvrirFeuille } from './ui.js';

function cleStockage() {
  const uid = etat.user?.id || 'invite';
  return `ebook:citations:v1:${uid}`;
}

/** Lit la liste complète des citations de l'utilisateur (fusion local + compte privé). */
export function lireToutesCitations() {
  let locales = [];
  try {
    const brut = localStorage.getItem(cleStockage());
    if (brut) locales = JSON.parse(brut) || [];
  } catch { /* ignoré */ }

  const distantes = Array.isArray(etat.user?.user_metadata?.citations_favorites)
    ? etat.user.user_metadata.citations_favorites
    : [];

  const parId = new Map();
  for (const c of [...distantes, ...locales]) {
    if (c && c.id && !c.supprime) {
      const existant = parId.get(c.id);
      if (!existant || (c.updatedAt || 0) >= (existant.updatedAt || 0)) {
        parId.set(c.id, c);
      }
    } else if (c && c.id && c.supprime) {
      parId.delete(c.id);
    }
  }

  return [...parId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function lireCitationsLivre(bookId, numeroPage = null) {
  const toutes = lireToutesCitations().filter((c) => c.bookId === bookId);
  if (numeroPage !== null) return toutes.filter((c) => Number(c.page) === Number(numeroPage));
  return toutes;
}

let minuterieSync = null;

function sauverListeCitations(liste) {
  const propre = liste.slice(0, 300); // garde les 300 plus récentes
  try {
    localStorage.setItem(cleStockage(), JSON.stringify(propre));
  } catch { /* quota */ }

  if (etat.user && etat.supabase) {
    etat.user.user_metadata = {
      ...(etat.user.user_metadata || {}),
      citations_favorites: propre,
    };

    clearTimeout(minuterieSync);
    minuterieSync = setTimeout(async () => {
      try {
        const { data } = await etat.supabase.auth.updateUser({
          data: { citations_favorites: propre },
        });
        if (data?.user) etat.user = data.user;
      } catch { /* hors-ligne */ }
    }, 2000);
  }
}

export function ajouterCitation({ bookId, page = 1, texte = '', couleur = 'jaune', note = '' }) {
  const extrait = String(texte || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!extrait && !note.trim()) return null;

  const liste = lireToutesCitations();
  const maintenant = Date.now();
  // Si le même texte est déjà surligné sur cette page, on le met à jour
  const existantIdx = liste.findIndex((c) => c.bookId === bookId && Number(c.page) === Number(page) && c.texte === extrait);

  let item;
  if (existantIdx >= 0) {
    item = {
      ...liste[existantIdx],
      couleur,
      note: note.trim() || liste[existantIdx].note || '',
      updatedAt: maintenant,
    };
    liste[existantIdx] = item;
  } else {
    item = {
      id: `cit_${maintenant}_${Math.random().toString(36).slice(2, 7)}`,
      bookId,
      page: Number(page) || 1,
      texte: extrait,
      couleur: ['jaune', 'rose', 'bleu'].includes(couleur) ? couleur : 'jaune',
      note: String(note || '').trim().slice(0, 400),
      createdAt: maintenant,
      updatedAt: maintenant,
    };
    liste.unshift(item);
  }

  sauverListeCitations(liste);
  return item;
}

export function modifierCitation(id, modifs = {}) {
  const liste = lireToutesCitations();
  const idx = liste.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  liste[idx] = {
    ...liste[idx],
    ...modifs,
    updatedAt: Date.now(),
  };
  sauverListeCitations(liste);
  return liste[idx];
}

export function supprimerCitation(id) {
  const liste = lireToutesCitations().filter((c) => c.id !== id);
  sauverListeCitations(liste);
}

/**
 * Applique visuellement les surlignages et un éventuel mot recherché dans un bloc de texte déjà échappé.
 */
export function decorerTexteHTML(htmlEchappe, citationsPage = [], termeRecherche = '') {
  let resultat = htmlEchappe;

  // 1. Surlignages enregistrés sur cette page
  for (const c of citationsPage) {
    if (!c.texte || c.texte.length < 2) continue;
    const cibleEchappee = esc(c.texte);
    if (resultat.includes(cibleEchappee)) {
      const mark = `<mark class="surligne surligne-${esc(c.couleur || 'jaune')}" data-citation-id="${esc(c.id)}" title="${esc(c.note ? 'Note : ' + c.note : 'Cliquer pour modifier ce surlignage')}">${cibleEchappee}</mark>`;
      resultat = resultat.replace(cibleEchappee, mark);
    }
  }

  // 2. Mot recherché (si une recherche dans le livre est active)
  if (termeRecherche && termeRecherche.trim().length >= 2) {
    const motif = esc(termeRecherche.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const reg = new RegExp(`(${motif})(?![^<]*>)`, 'gi');
      resultat = resultat.replace(reg, '<mark class="surligne-recherche">$1</mark>');
    } catch { /* regex invalide */ }
  }

  return resultat;
}

/**
 * Ouvre une feuille pour modifier la couleur ou la note d'un surlignage existant (ou le supprimer).
 */
export function ouvrirEditionCitation(citation, surChangement) {
  const couleurs = [
    ['jaune', 'Jaune'],
    ['rose', 'Rose'],
    ['bleu', 'Bleu'],
  ];

  const f = ouvrirFeuille({
    titre: `Surlignage · Page ${citation.page}`,
    contenu: `
      <blockquote class="citation-apercu surligne-${esc(citation.couleur)}">
        « ${esc(citation.texte)} »
      </blockquote>
      <form id="form-edit-citation" novalidate>
        <fieldset class="champ">
          <legend>Couleur du surlignage</legend>
          <div class="segments">
            ${couleurs.map(([v, l]) => `
              <input type="radio" name="couleur" id="coul-${v}" value="${v}" ${citation.couleur === v ? 'checked' : ''}>
              <label for="coul-${v}"><span class="pastille-surligne ${v}"></span>${l}</label>
            `).join('')}
          </div>
        </fieldset>
        <div class="champ">
          <label for="cit-note">Note personnelle (optionnelle)</label>
          <textarea id="cit-note" name="note" maxlength="400" style="min-height:95px;font-family:var(--police-ui)" placeholder="Ajoute une réflexion, une idée ou un repère…">${esc(citation.note || '')}</textarea>
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primaire" style="flex:1">${icones.coche} Enregistrer</button>
          <button type="button" class="btn btn-danger" id="btn-suppr-cit" aria-label="Supprimer ce surlignage">${icones.corbeille}</button>
        </div>
      </form>`,
  });

  f.el.querySelector('#form-edit-citation').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    modifierCitation(citation.id, {
      couleur: form.couleur.value,
      note: form.note.value.trim(),
    });
    toast('Surlignage mis à jour.');
    f.fermer();
    surChangement?.();
  });

  f.el.querySelector('#btn-suppr-cit').addEventListener('click', () => {
    supprimerCitation(citation.id);
    toast('Surlignage retiré.');
    f.fermer();
    surChangement?.();
  });
}

/**
 * Ouvre le carnet complet des citations et notes d'un livre.
 */
export function ouvrirCarnetCitations(livre, { pageCourante = 1, allerAPage = null, surChangement = null } = {}) {
  function rendreContenu(f) {
    const liste = lireCitationsLivre(livre.id);
    const corps = f.el.querySelector('.feuille-corps');

    corps.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px">
        <p class="aide" style="margin:0;color:var(--texte-2)">
          💡 Astuce : sélectionne du texte sur une page du lecteur pour le surligner en 1 clic.
        </p>
        <button type="button" class="btn btn-secondaire" id="btn-nouvelle-cit" style="min-height:38px;padding:6px 14px;font-size:.86rem;flex-shrink:0">
          ${icones.plus} Note libre
        </button>
      </div>
      <div id="zone-form-nouvelle-cit" style="display:none;margin-bottom:16px"></div>
      ${!liste.length ? `
        <div class="etat-vide" style="padding:28px 12px">
          <p style="margin:0;color:var(--texte-2)">Aucun passage surligné ni citation favorite pour ce livre.</p>
        </div>
      ` : `
        <ul class="liste-citations">
          ${liste.map((c) => `
            <li class="carte-citation surligne-bord-${esc(c.couleur || 'jaune')}">
              <div class="carte-citation-entete">
                <span class="badge-page-cit">Page ${c.page}</span>
                <div style="display:flex;gap:4px">
                  ${allerAPage ? `<button type="button" class="btn btn-discret" data-aller-page="${c.page}" style="min-height:32px;padding:4px 10px;font-size:.8rem">Y aller ${icones.aller}</button>` : ''}
                  <button type="button" class="btn-icone" data-editer-cit="${esc(c.id)}" aria-label="Modifier" style="width:32px;height:32px">${icones.crayon}</button>
                  <button type="button" class="btn-icone" data-suppr-cit="${esc(c.id)}" aria-label="Supprimer" style="width:32px;height:32px;color:var(--danger)">${icones.corbeille}</button>
                </div>
              </div>
              ${c.texte ? `<blockquote class="carte-citation-texte">« ${esc(c.texte)} »</blockquote>` : ''}
              ${c.note ? `<p class="carte-citation-note">💬 ${esc(c.note)}</p>` : ''}
            </li>
          `).join('')}
        </ul>
      `}`;

    corps.querySelector('#btn-nouvelle-cit')?.addEventListener('click', () => {
      const z = corps.querySelector('#zone-form-nouvelle-cit');
      z.style.display = z.style.display === 'none' ? 'block' : 'none';
      if (z.style.display === 'block') {
        z.innerHTML = `
          <form class="carte" id="form-ajout-cit-manuel" style="padding:14px" novalidate>
            <div class="champ" style="margin-bottom:10px">
              <label for="nc-texte">Citation ou passage (p. ${pageCourante})</label>
              <textarea id="nc-texte" name="texte" maxlength="500" style="min-height:70px" placeholder="Copie ou écris une phrase marquante…"></textarea>
            </div>
            <div class="champ" style="margin-bottom:10px">
              <label for="nc-note">Note personnelle</label>
              <input class="saisie" id="nc-note" name="note" maxlength="300" placeholder="Ton commentaire…">
            </div>
            <button type="submit" class="btn btn-primaire btn-bloc" style="min-height:40px">Ajouter au carnet</button>
          </form>`;
        z.querySelector('#form-ajout-cit-manuel').addEventListener('submit', (e) => {
          e.preventDefault();
          const fMan = e.currentTarget;
          const item = ajouterCitation({
            bookId: livre.id,
            page: pageCourante,
            texte: fMan.texte.value,
            note: fMan.note.value,
            couleur: 'jaune',
          });
          if (!item) {
            toast('Écris une citation ou une note.', 'erreur');
            return;
          }
          toast('Citation enregistrée !');
          surChangement?.();
          rendreContenu(f);
        });
      }
    });

    corps.querySelectorAll('[data-aller-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = Number(btn.getAttribute('data-aller-page'));
        f.fermer();
        allerAPage?.(p);
      });
    });

    corps.querySelectorAll('[data-editer-cit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cit = liste.find((x) => x.id === btn.getAttribute('data-editer-cit'));
        if (!cit) return;
        f.fermer();
        ouvrirEditionCitation(cit, surChangement);
      });
    });

    corps.querySelectorAll('[data-suppr-cit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        supprimerCitation(btn.getAttribute('data-suppr-cit'));
        toast('Citation supprimée.');
        surChangement?.();
        rendreContenu(f);
      });
    });
  }

  const f = ouvrirFeuille({
    titre: `Citations & notes · ${livre.titre}`,
    contenu: '<div></div>',
  });
  rendreContenu(f);
  return f;
}
