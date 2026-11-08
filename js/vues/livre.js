// =============================================================================
//  Fiche livre : détails, couverture, actions et avis
// =============================================================================

import { etat } from '../etat.js';
import { esc, icones, couvertureHTML, hydraterCouvertures, lireMetaApple, erreurHTML, messageErreur, toast, confirmer, libelleType, libelleLangue, formatDate, ouvrirFeuille } from '../ui.js';
import { monterAvis } from '../avis.js';
import { supprimerCache } from '../cache.js';

export async function afficher(racine, { params }) {
  const idLivre = params[0];

  const { data: livre, error } = await etat.supabase
    .from('books')
    .select('id, user_id, catalogue_id, titre, auteur, type, langue, derniere_page, created_at, pages(count)')
    .eq('id', idLivre)
    .single();

  if (error || !livre) {
    racine.innerHTML = `
      <div style="padding:24px">
        ${erreurHTML(messageErreur(error), 'Livre introuvable')}
        <div class="actions" style="justify-content:center;margin-top:16px">
          <a class="btn btn-secondaire" href="#/bibliotheque">${icones.retour} Retour à la bibliothèque</a>
        </div>
      </div>`;
    return;
  }

  const nbPages = livre.pages?.[0]?.count ?? 0;
  const dernierePage = Math.min(Math.max(livre.derniere_page || 1, 1), Math.max(nbPages, 1));

  racine.innerHTML = `
    <div style="margin-bottom:16px">
      <a class="btn btn-discret" href="#/bibliotheque" style="padding-left:0">
        ${icones.retour} Bibliothèque
      </a>
    </div>

    <div class="fiche">
      <div class="fiche-tete">
        ${couvertureHTML(livre, { grande: true })}
        <h1>${esc(livre.titre)}</h1>
        <p class="fiche-auteur">${esc(livre.auteur || 'Auteur inconnu')}</p>

        <ul class="fiche-infos">
          <li>${esc(libelleType[livre.type] || 'Livre')}</li>
          <li>${esc(libelleLangue[livre.langue] || 'Français')}</li>
          <li>${nbPages} page${nbPages > 1 ? 's' : ''}</li>
          ${nbPages > 0 ? `<li>Marque-page : p. ${dernierePage}</li>` : ''}
          <li>Ajouté le ${formatDate(livre.created_at)}</li>
        </ul>

        <p id="fiche-resume-apple" class="aide" style="margin-top:12px;text-align:left;line-height:1.5;display:none"></p>

        <div class="actions" style="margin-top:20px">
          ${nbPages > 0
            ? `<a class="btn btn-primaire" href="#/lecteur/${livre.id}">${icones.livre} Lire (p. ${dernierePage})</a>`
            : `<a class="btn btn-primaire" href="#/ajouter/${livre.id}">${icones.photo} Ajouter la 1ère page</a>`
          }
          <a class="btn btn-secondaire" href="#/ajouter/${livre.id}">${icones.plus} Ajouter des pages</a>
          <button type="button" class="btn btn-secondaire" data-action="modifier">${icones.crayon} Modifier</button>
          <button type="button" class="btn btn-discret" style="color:var(--danger)" data-action="supprimer">${icones.corbeille} Supprimer</button>
        </div>
      </div>

      <div class="zone-avis-fiche"></div>
    </div>`;

  // Hydrater la couverture officielle Apple Livres et afficher le résumé s'il existe
  const majResume = () => {
    const meta = lireMetaApple(livre.titre, livre.auteur);
    const elResume = racine.querySelector('#fiche-resume-apple');
    if (elResume && meta?.resume) {
      elResume.textContent = meta.resume;
      elResume.style.display = 'block';
    }
  };
  majResume();
  hydraterCouvertures(racine).then(majResume);

  // Monter les avis
  const zoneAvis = racine.querySelector('.zone-avis-fiche');
  monterAvis(zoneAvis, livre);

  // Modification des infos du livre
  racine.querySelector('[data-action="modifier"]').addEventListener('click', () => {
    ouvrirModification(livre, () => afficher(racine, { params }));
  });

  // Suppression du livre
  racine.querySelector('[data-action="supprimer"]').addEventListener('click', async () => {
    const ok = await confirmer({
      titre: `Supprimer « ${livre.titre} » ?`,
      texte: 'Toutes les pages photographiées de ce livre seront définitivement supprimées.',
      ok: 'Supprimer définitivement',
      danger: true,
    });
    if (!ok) return;

    const { error: delErr } = await etat.supabase
      .from('books')
      .delete()
      .eq('id', livre.id);

    if (delErr) {
      toast(messageErreur(delErr), 'erreur');
      return;
    }

    supprimerCache(`bibliotheque:${etat.user.id}`);
    supprimerCache(`livre:${livre.id}`);
    toast('Livre supprimé de ta bibliothèque.');
    location.hash = '#/bibliotheque';
  });
}

function ouvrirModification(livre, rafraichir) {
  const f = ouvrirFeuille({
    titre: 'Modifier le livre',
    contenu: `
      <form id="form-modif-livre" novalidate>
        <div id="modif-msg"></div>
        <div class="champ">
          <label for="modif-titre">Titre</label>
          <input class="saisie" id="modif-titre" name="titre" value="${esc(livre.titre)}" required maxlength="200">
        </div>
        <div class="champ">
          <label for="modif-auteur">Auteur</label>
          <input class="saisie" id="modif-auteur" name="auteur" value="${esc(livre.auteur || '')}" maxlength="200">
        </div>
        <fieldset class="champ">
          <legend>Type de livre</legend>
          <div class="segments">
            <input type="radio" name="type" id="m-type-roman" value="roman" ${livre.type === 'roman' ? 'checked' : ''}><label for="m-type-roman">Roman</label>
            <input type="radio" name="type" id="m-type-theatre" value="theatre" ${livre.type === 'theatre' ? 'checked' : ''}><label for="m-type-theatre">Théâtre</label>
            <input type="radio" name="type" id="m-type-autre" value="autre" ${livre.type === 'autre' ? 'checked' : ''}><label for="m-type-autre">Autre</label>
          </div>
        </fieldset>
        <fieldset class="champ">
          <legend>Langue du livre</legend>
          <div class="segments">
            <input type="radio" name="langue" id="m-langue-fr" value="fr" ${livre.langue === 'fr' ? 'checked' : ''}><label for="m-langue-fr">Français</label>
            <input type="radio" name="langue" id="m-langue-en" value="en" ${livre.langue === 'en' ? 'checked' : ''}><label for="m-langue-en">Anglais</label>
          </div>
        </fieldset>
        <div class="actions">
          <button type="submit" class="btn btn-primaire btn-bloc">Enregistrer les modifications</button>
        </div>
      </form>`,
  });

  const form = f.el.querySelector('#form-modif-livre');
  const zoneMsg = f.el.querySelector('#modif-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titre = form.titre.value.trim();
    const auteur = form.auteur.value.trim();
    const type = form.type.value;
    const langue = form.langue.value;

    if (!titre) {
      zoneMsg.innerHTML = '<p class="message message-erreur">Le titre ne peut pas être vide.</p>';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    const { error } = await etat.supabase
      .from('books')
      .update({ titre, auteur, type, langue })
      .eq('id', livre.id);

    btn.disabled = false;

    if (error) {
      zoneMsg.innerHTML = `<p class="message message-erreur">${esc(messageErreur(error))}</p>`;
      return;
    }

    supprimerCache(`bibliotheque:${etat.user.id}`);
    supprimerCache(`livre:${livre.id}`);
    toast('Informations mises à jour.');
    f.fermer();
    rafraichir();
  });
}
