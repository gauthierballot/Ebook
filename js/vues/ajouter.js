// Vue « Ajouter » :
//  - #/ajouter      : formulaire du nouveau livre
//  - #/ajouter/ID   : ajout des pages (photo → OCR → correction → enregistrement)

import { etat } from '../etat.js';
import { esc, icones, toast, erreurHTML, messageErreur, libelleType } from '../ui.js';
import { supprimerCache } from '../cache.js';

export async function afficher(racine, { params }) {
  if (params[0]) return afficherPages(racine, params[0]);
  afficherFormulaire(racine);
}

// ---------------------------------------------------------------------------
// 1. Formulaire « nouveau livre »
// ---------------------------------------------------------------------------
function afficherFormulaire(racine) {
  racine.innerHTML = `
    <div class="etapes" aria-hidden="true"><span class="actif"></span><span></span></div>
    <p class="surtitre">Étape 1 sur 2</p>
    <h1 class="titre-page">Nouveau livre</h1>
    <p class="sous-titre">Quelques infos, puis tu photographieras les pages.</p>

    <form class="carte" id="form-livre" novalidate>
      <div id="form-message"></div>
      <div class="champ">
        <label for="titre">Titre</label>
        <input class="saisie" id="titre" name="titre" required maxlength="200" autocomplete="off" placeholder="Ex. : Le Petit Prince">
      </div>
      <div class="champ">
        <label for="auteur">Auteur</label>
        <input class="saisie" id="auteur" name="auteur" maxlength="200" autocomplete="off" placeholder="Ex. : Antoine de Saint-Exupéry">
      </div>
      <fieldset class="champ">
        <legend>Type de livre</legend>
        <div class="segments">
          <input type="radio" name="type" id="type-roman" value="roman" checked><label for="type-roman">Roman</label>
          <input type="radio" name="type" id="type-theatre" value="theatre"><label for="type-theatre">Théâtre</label>
          <input type="radio" name="type" id="type-autre" value="autre"><label for="type-autre">Autre</label>
        </div>
        <p class="aide">Pour le théâtre, les retours à la ligne sont conservés à la lecture.</p>
      </fieldset>
      <fieldset class="champ">
        <legend>Langue du livre</legend>
        <div class="segments">
          <input type="radio" name="langue" id="langue-fr" value="fr" checked><label for="langue-fr">Français</label>
          <input type="radio" name="langue" id="langue-en" value="en"><label for="langue-en">Anglais</label>
        </div>
        <p class="aide">En anglais, tu pourras traduire un mot ou une page pendant la lecture.</p>
      </fieldset>
      <button class="btn btn-primaire btn-bloc" type="submit">Continuer ${icones.suivant}</button>
    </form>
    <p class="aide" style="margin-top:16px;text-align:center;color:var(--texte-2);font-size:.85rem">
      N'ajoute que des livres que tu possèdes, pour ton usage personnel.
    </p>`;

  const form = racine.querySelector('#form-livre');
  const zoneMessage = racine.querySelector('#form-message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const champTitre = form.titre;
    const titre = champTitre.value.trim();
    const auteur = form.auteur.value.trim();
    if (!titre) {
      champTitre.setAttribute('aria-invalid', 'true');
      zoneMessage.innerHTML = '<p class="message message-erreur" role="alert">Donne un titre à ton livre.</p>';
      champTitre.focus();
      return;
    }
    champTitre.removeAttribute('aria-invalid');
    const bouton = form.querySelector('button[type="submit"]');
    bouton.disabled = true;
    bouton.innerHTML = '<span class="roue petite" aria-hidden="true"></span> Création…';

    const { data, error } = await etat.supabase
      .from('books')
      .insert({ titre, auteur, type: form.type.value, langue: form.langue.value, user_id: etat.user.id })
      .select('id')
      .single();

    if (error) {
      zoneMessage.innerHTML = `<p class="message message-erreur" role="alert">${esc(messageErreur(error))}</p>`;
      bouton.disabled = false;
      bouton.innerHTML = `Continuer ${icones.suivant}`;
      return;
    }
    supprimerCache(`bibliotheque:${etat.user.id}`);
    toast('Livre créé. Place aux pages !');
    location.hash = `#/ajouter/${data.id}`;
  });

  form.titre.focus();
}

// ---------------------------------------------------------------------------
// 2. Ajout des pages
// ---------------------------------------------------------------------------
async function afficherPages(racine, idLivre) {
  const [livreRes, derniereRes] = await Promise.all([
    etat.supabase.from('books').select('id, titre, auteur, type, langue').eq('id', idLivre).single(),
    etat.supabase.from('pages').select('numero').eq('book_id', idLivre).order('numero', { ascending: false }).limit(1),
  ]);

  const erreur = livreRes.error || derniereRes.error;
  if (erreur) {
    racine.innerHTML = erreurHTML(messageErreur(erreur), 'Livre indisponible');
    racine.querySelector('[data-action="reessayer"]').addEventListener('click', () => afficherPages(racine, idLivre));
    return;
  }

  const livre = livreRes.data;
  let numero = (derniereRes.data[0]?.numero || 0) + 1; // prochaine page à ajouter
  let pagesAjoutees = 0;
  let jetonOCR = 0;              // permet d'ignorer une lecture annulée
  let urlApercu = null;
  let ocr = null;                // module OCR, chargé à la demande

  racine.innerHTML = `
    <div class="etapes" aria-hidden="true"><span class="actif"></span><span class="actif"></span></div>
    <p class="surtitre">${esc(libelleType[livre.type])} · ${livre.langue === 'en' ? 'Anglais' : 'Français'}</p>
    <h1 class="titre-page">${esc(livre.titre)}</h1>
    <p class="sous-titre">${esc(livre.auteur || 'Auteur inconnu')}</p>
    <section class="carte" id="etape" aria-live="polite"></section>
    <div class="actions" style="justify-content:center">
      <a class="btn btn-discret" href="#/livre/${livre.id}">Voir la fiche du livre</a>
    </div>`;
  const zone = racine.querySelector('#etape');

  const libererApercu = () => { if (urlApercu) { URL.revokeObjectURL(urlApercu); urlApercu = null; } };

  // --- État : choix de la photo ---
  function etapeChoix() {
    libererApercu();
    zone.innerHTML = `
      <h2 class="titre-3">Page ${numero}</h2>
      <p class="aide" style="color:var(--texte-2)">Cadre la page du livre pour que l'IA en extraie le texte mot pour mot.</p>
      
      <details class="conseils-photo">
        <summary>Pour une meilleure lecture</summary>
        <ul>
          <li>Pose le livre bien à plat</li>
          <li>Privilégie une bonne lumière uniforme sans ombre</li>
          <li>Tiens ton téléphone bien parallèle à la page</li>
          <li>Cadre une seule page à la fois</li>
          <li>Vérifie que tout le texte est bien visible</li>
        </ul>
      </details>

      <div class="grands-choix">
        <div>
          <input type="file" id="photo-camera" class="visuellement-cache" accept="image/*" capture="environment">
          <label for="photo-camera" class="grand-choix principal">
            <span class="pastille">${icones.photo}</span>
            <span>Prendre une photo<small>Avec l'appareil photo</small></span>
          </label>
        </div>
        <div>
          <input type="file" id="photo-galerie" class="visuellement-cache" accept="image/*">
          <label for="photo-galerie" class="grand-choix">
            <span class="pastille">${icones.galerie}</span>
            <span>Choisir depuis la galerie<small>Une photo déjà prise</small></span>
          </label>
        </div>
        <button type="button" class="grand-choix pleine" data-action="manuel">
          <span class="pastille">${icones.crayon}</span>
          <span>Saisir le texte à la main<small>Si la photo ne fonctionne pas</small></span>
        </button>
      </div>
      ${pagesAjoutees || numero > 1 ? `<div class="actions colonne"><a class="btn btn-secondaire" href="#/lecteur/${livre.id}">Terminer</a></div>` : ''}`;

    zone.querySelectorAll('input[type="file"]').forEach((input) => {
      input.addEventListener('change', () => {
        const fichier = input.files?.[0];
        input.value = '';
        if (fichier) lancerOCR(fichier);
      });
    });
    zone.querySelector('[data-action="manuel"]').addEventListener('click', () => etapeCorrection('', null));
  }

  // --- État : lecture en cours ---
  async function lancerOCR(fichier) {
    if (!fichier.type.startsWith('image/') && fichier.type !== '') {
      etapeErreur('Ce fichier n\'est pas une image.', '');
      return;
    }
    const monJeton = ++jetonOCR;
    libererApercu();
    urlApercu = URL.createObjectURL(fichier);

    zone.innerHTML = `
      <h2 class="titre-3">Lecture de la page ${numero}</h2>
      <img class="apercu-photo" src="${urlApercu}" alt="Aperçu de la photo de la page ${numero}">
      <div class="progression-ocr" role="progressbar" aria-label="Progression de la lecture" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
      <p class="progression-libelle"><span id="ocr-libelle">Lecture de la page…</span><span id="ocr-pourcent">0 %</span></p>
      <div id="ocr-secours-msg"></div>
      <div class="actions colonne"><button type="button" class="btn btn-secondaire" data-action="annuler">Annuler</button></div>`;

    const barre = zone.querySelector('.progression-ocr');
    const remplissage = barre.querySelector('span');
    const libelle = zone.querySelector('#ocr-libelle');
    const pourcent = zone.querySelector('#ocr-pourcent');
    const zoneSecours = zone.querySelector('#ocr-secours-msg');

    zone.querySelector('[data-action="annuler"]').addEventListener('click', () => {
      jetonOCR++;
      ocr?.annulerOCR();
      etapeChoix();
    });

    try {
      ocr = ocr || await import('../ocr.js'); // chargement paresseux
      const options = {
        langue: livre.langue,
        type: livre.type,
        token: etat.session?.access_token,
      };

      const resultat = await ocr.reconnaitre(fichier, options, ({ libelle: l, pourcent: p, messageSecours }) => {
        if (monJeton !== jetonOCR) return;
        remplissage.style.width = `${p}%`;
        barre.setAttribute('aria-valuenow', String(p));
        libelle.textContent = l;
        pourcent.textContent = `${p} %`;
        if (messageSecours && zoneSecours && !zoneSecours.innerHTML) {
          zoneSecours.innerHTML = `<p class="message message-info" style="font-size:0.86rem;margin-top:10px">${esc(messageSecours)}</p>`;
        }
      });

      if (monJeton !== jetonOCR) return;
      etapeCorrection(resultat.texte, resultat);
    } catch (e) {
      if (monJeton !== jetonOCR) return;
      if (e?.code === 'annule') { etapeChoix(); return; }
      etapeErreur(e?.message || 'La lecture a échoué.', e?.texte || '');
    }
  }

  // --- État : erreur de lecture ---
  function etapeErreur(message, texteParti) {
    zone.innerHTML = `
      <h2 class="titre-3">Page ${numero}</h2>
      ${urlApercu ? `<img class="apercu-photo" src="${urlApercu}" alt="Photo de la page ${numero}">` : ''}
      <p class="message message-erreur" role="alert">${esc(message)}</p>
      <p class="aide" style="color:var(--texte-2)">Conseils : lumière suffisante, téléphone bien parallèle à la page, pas de reflets ni de doigts masquant les lignes.</p>
      <div class="actions colonne">
        <input type="file" id="reprise-camera" class="visuellement-cache" accept="image/*" capture="environment">
        <label for="reprise-camera" class="btn btn-primaire">${icones.photo} Reprendre la photo</label>
        <input type="file" id="reprise-galerie" class="visuellement-cache" accept="image/*">
        <label for="reprise-galerie" class="btn btn-secondaire">${icones.galerie} Choisir une autre image</label>
        ${texteParti ? '<button type="button" class="btn btn-discret" data-action="garder">Garder ce qui a été lu et corriger</button>' : ''}
        <button type="button" class="btn btn-discret" data-action="manuel">Saisir le texte à la main</button>
      </div>`;
    zone.querySelectorAll('input[type="file"]').forEach((input) => {
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        input.value = '';
        if (f) lancerOCR(f);
      });
    });
    zone.querySelector('[data-action="garder"]')?.addEventListener('click', () => etapeCorrection(texteParti, null));
    zone.querySelector('[data-action="manuel"]').addEventListener('click', () => etapeCorrection('', null));
    zone.querySelector('.message').focus?.();
  }

  // --- État : correction du texte ---
  function etapeCorrection(texte, details = null) {
    let messageAvertissement = '';
    if (details?.secoursActive) {
      messageAvertissement += '<p class="message message-info" style="font-size:0.88rem">Lecture locale (moteur de secours), la qualité peut être moindre.</p>';
    }
    if (details?.faibleConfiance) {
      messageAvertissement += '<p class="message message-avertissement">Lecture peu fiable, vérifie le texte ou reprends la photo avec plus de lumière.</p>';
    }

    zone.innerHTML = `
      <h2 class="titre-3">Page ${numero}</h2>
      ${messageAvertissement}
      <form id="form-page" novalidate>
        <div class="champ">
          <label for="texte-page">${texte ? 'Texte reconnu — corrige-le si besoin' : 'Texte de la page'}</label>
          <textarea id="texte-page" maxlength="20000" spellcheck="true" lang="${livre.langue}">${esc(texte)}</textarea>
          <span class="compteur" id="compteur"></span>
        </div>
        <div id="page-message"></div>
        <div class="actions colonne">
          <button type="submit" class="btn btn-primaire">${icones.coche} Enregistrer la page</button>
          <button type="button" class="btn btn-secondaire" data-action="reprendre">${icones.photo} Reprendre la photo</button>
        </div>
      </form>`;

    const zoneTexte = zone.querySelector('#texte-page');
    const compteur = zone.querySelector('#compteur');
    const majCompteur = () => { compteur.textContent = `${zoneTexte.value.length.toLocaleString('fr-FR')} caractères`; };
    zoneTexte.addEventListener('input', majCompteur);
    majCompteur();
    if (!texte) zoneTexte.focus();

    zone.querySelector('[data-action="reprendre"]').addEventListener('click', etapeChoix);
    zone.querySelector('#form-page').addEventListener('submit', async (e) => {
      e.preventDefault();
      const contenu = zoneTexte.value.replace(/\r/g, '').trim();
      const zoneMsg = zone.querySelector('#page-message');
      if (!contenu) {
        zoneMsg.innerHTML = '<p class="message message-erreur" role="alert">La page est vide. Ajoute du texte ou reprends la photo.</p>';
        return;
      }
      const bouton = e.submitter || zone.querySelector('button[type="submit"]');
      bouton.disabled = true;
      bouton.innerHTML = '<span class="roue petite" aria-hidden="true"></span> Enregistrement…';

      const erreur = await enregistrerPage(contenu);
      if (erreur) {
        zoneMsg.innerHTML = `<p class="message message-erreur" role="alert">${esc(messageErreur(erreur))} Ton texte est conservé.</p>`;
        bouton.disabled = false;
        bouton.innerHTML = `${icones.coche} Enregistrer la page`;
        return;
      }
      etapeEnregistree();
    });
  }

  async function enregistrerPage(texte) {
    let { error } = await etat.supabase.from('pages').insert({ book_id: livre.id, numero, texte });
    if (error?.code === '23505') {
      // Numéro déjà pris (page ajoutée depuis un autre appareil) : on prend le suivant
      const { data } = await etat.supabase.from('pages').select('numero').eq('book_id', livre.id).order('numero', { ascending: false }).limit(1);
      numero = (data?.[0]?.numero || numero) + 1;
      ({ error } = await etat.supabase.from('pages').insert({ book_id: livre.id, numero, texte }));
    }
    if (!error) {
      pagesAjoutees++;
      supprimerCache(`bibliotheque:${etat.user.id}`);
      supprimerCache(`livre:${livre.id}`);
    }
    return error;
  }

  // --- État : page enregistrée ---
  function etapeEnregistree() {
    libererApercu();
    zone.innerHTML = `
      <div class="succes-page">
        <div class="coche">${icones.coche}</div>
        <h2 class="titre-3">Page ${numero} enregistrée</h2>
        <p style="color:var(--texte-2)">${pagesAjoutees} page${pagesAjoutees > 1 ? 's' : ''} ajoutée${pagesAjoutees > 1 ? 's' : ''} pendant cette séance.</p>
      </div>
      <div class="actions colonne">
        <button type="button" class="btn btn-primaire" data-action="suivante">Page suivante ${icones.suivant}</button>
        <a class="btn btn-secondaire" href="#/lecteur/${livre.id}">Terminer</a>
      </div>`;
    zone.querySelector('[data-action="suivante"]').addEventListener('click', () => {
      numero++;
      etapeChoix();
    });
    zone.querySelector('[data-action="suivante"]').focus();
  }

  etapeChoix();

  // Nettoyage quand on quitte la vue : on libère le moteur OCR et l'aperçu
  return () => {
    jetonOCR++;
    libererApercu();
    ocr?.arreterOCR();
  };
}
