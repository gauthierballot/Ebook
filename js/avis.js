// Composant « Avis » : moyenne, liste des avis partagés et formulaire personnel.
// Utilisé dans la fiche livre et dans le lecteur.

import { etat, pseudoActuel } from './etat.js';
import { esc, icones, etoilesHTML, formatDate, messageErreur, toast, confirmer } from './ui.js';

/**
 * Monte le bloc d'avis dans `el` pour le livre donné.
 * @param {HTMLElement} el
 * @param {{id:string, catalogue_id:string, titre:string}} livre
 */
export async function monterAvis(el, livre) {
  el.innerHTML = `<section class="avis" aria-labelledby="titre-avis-${livre.id}">
      <h2 class="titre-3" id="titre-avis-${livre.id}">Avis des lecteurs</h2>
      <div class="zone-avis"><div class="squelette" style="height:90px"></div></div>
    </section>`;
  const zone = el.querySelector('.zone-avis');

  if (!livre.catalogue_id) {
    zone.innerHTML = '<p class="aide">Les avis ne sont pas disponibles pour ce livre.</p>';
    return;
  }

  const { data, error } = await etat.supabase
    .from('reviews')
    .select('id, user_id, book_id, auteur_affiche, note, resume, created_at, updated_at')
    .eq('catalogue_id', livre.catalogue_id)
    .order('created_at', { ascending: false });

  if (error) {
    zone.innerHTML = `<p class="message message-erreur">${esc(messageErreur(error))}</p>
      <button type="button" class="btn btn-secondaire" data-action="recharger">Réessayer</button>`;
    zone.querySelector('[data-action="recharger"]').addEventListener('click', () => monterAvis(el, livre));
    return;
  }

  const avis = data || [];
  const monAvis = etat.user ? avis.find((a) => a.user_id === etat.user.id) : null;
  const moyenne = avis.length ? avis.reduce((s, a) => s + a.note, 0) / avis.length : 0;
  const moyenneTexte = moyenne.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const resume = avis.length
    ? `<div class="avis-resume">
         <span class="avis-moyenne">${moyenneTexte}</span>
         <div>${etoilesHTML(Math.round(moyenne * 10) / 10)}
           <div class="aide" style="color:var(--texte-2);font-size:.86rem">${avis.length} avis</div></div>
       </div>`
    : '<p style="color:var(--texte-2)">Aucun avis pour l\'instant. Sois le premier à partager le tien !</p>';

  const liste = avis.length
    ? `<ul class="liste-avis">${avis.map((a) => `
        <li class="un-avis">
          <div class="un-avis-entete">
            <span class="un-avis-auteur">${esc(a.auteur_affiche)} ${monAvis && a.id === monAvis.id ? '<span class="badge">Toi</span>' : ''}</span>
            <span class="un-avis-date">${formatDate(a.created_at)}</span>
          </div>
          ${etoilesHTML(a.note)}
          ${a.resume ? `<p>${esc(a.resume)}</p>` : ''}
        </li>`).join('')}</ul>`
    : '';

  zone.innerHTML = `${resume}${etat.user ? formulaireHTML(livre, monAvis) : ''}${liste}`;
  if (etat.user) brancherFormulaire(el, zone, livre, monAvis);
}

function formulaireHTML(livre, monAvis) {
  const note = monAvis?.note || 0;
  let etoiles = '';
  // Ordre inversé : l'astuce CSS « row-reverse » colore les étoiles précédentes
  for (let i = 5; i >= 1; i--) {
    etoiles += `<input type="radio" name="note" id="note-${livre.id}-${i}" value="${i}" ${note === i ? 'checked' : ''}>
      <label for="note-${livre.id}-${i}" title="${i} sur 5"><span class="visuellement-cache">${i} étoile${i > 1 ? 's' : ''}</span>${icones.etoile}</label>`;
  }
  return `
    <form class="carte form-avis" novalidate style="margin:18px 0 6px">
      <h3 class="titre-3" style="font-size:1.1rem">${monAvis ? 'Ton avis' : 'Donne ton avis'}</h3>
      <fieldset class="champ">
        <legend>Ta note</legend>
        <div class="choix-etoiles">${etoiles}</div>
      </fieldset>
      <div class="champ">
        <label for="resume-${livre.id}">Ton résumé en quelques mots</label>
        <textarea id="resume-${livre.id}" name="resume" maxlength="500" style="min-height:110px;font-family:var(--police-ui);font-size:1rem"
          placeholder="Ce que tu as aimé, à qui tu le conseillerais…">${esc(monAvis?.resume || '')}</textarea>
        <span class="compteur" aria-live="polite"></span>
      </div>
      <p class="aide" style="color:var(--texte-2);font-size:.84rem">Publié sous le pseudo <strong>${esc(pseudoActuel())}</strong> — modifiable dans <a href="#/compte">Compte</a>. Ton avis est visible par tout le monde.</p>
      <div class="msg-avis"></div>
      <div class="actions">
        <button type="submit" class="btn btn-primaire">${monAvis ? 'Mettre à jour' : 'Publier mon avis'}</button>
        ${monAvis ? '<button type="button" class="btn btn-discret" data-action="supprimer">Supprimer mon avis</button>' : ''}
      </div>
    </form>`;
}

function brancherFormulaire(el, zone, livre, monAvis) {
  const form = zone.querySelector('.form-avis');
  const resume = form.resume;
  const compteur = form.querySelector('.compteur');
  const msg = form.querySelector('.msg-avis');
  const majCompteur = () => { compteur.textContent = `${resume.value.length} / 500`; };
  resume.addEventListener('input', majCompteur);
  majCompteur();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = Number(form.querySelector('input[name="note"]:checked')?.value || 0);
    const texte = resume.value.trim().slice(0, 500);
    if (!note) {
      msg.innerHTML = '<p class="message message-erreur" role="alert">Choisis une note de 1 à 5 étoiles.</p>';
      return;
    }
    const bouton = form.querySelector('button[type="submit"]');
    bouton.disabled = true;

    const donnees = { note, resume: texte, auteur_affiche: pseudoActuel().slice(0, 40) };
    const { error } = monAvis
      ? await etat.supabase.from('reviews').update(donnees).eq('id', monAvis.id)
      : await etat.supabase.from('reviews').insert({ ...donnees, book_id: livre.id, user_id: etat.user.id });

    bouton.disabled = false;
    if (error) {
      const texteErreur = error.code === '23505'
        ? 'Tu as déjà donné ton avis sur ce livre (peut-être depuis un autre exemplaire).'
        : messageErreur(error);
      msg.innerHTML = `<p class="message message-erreur" role="alert">${esc(texteErreur)}</p>`;
      return;
    }
    toast(monAvis ? 'Ton avis est mis à jour.' : 'Merci, ton avis est publié !');
    monterAvis(el, livre);
  });

  form.querySelector('[data-action="supprimer"]')?.addEventListener('click', async () => {
    const ok = await confirmer({ titre: 'Supprimer ton avis ?', texte: 'Il disparaîtra pour tout le monde.', ok: 'Supprimer' });
    if (!ok) return;
    const { error } = await etat.supabase.from('reviews').delete().eq('id', monAvis.id);
    if (error) { toast(messageErreur(error), 'erreur'); return; }
    toast('Ton avis a été supprimé.');
    monterAvis(el, livre);
  });
}
