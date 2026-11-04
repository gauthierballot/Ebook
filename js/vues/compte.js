// =============================================================================
//  Compte : Inscription, Connexion, Profil, Déconnexion et Mot de passe
// =============================================================================

import { etat, pseudoActuel } from '../etat.js';
import { esc, icones, toast, messageErreur, confirmer } from '../ui.js';
import { viderCache } from '../cache.js';

export async function afficher(racine) {
  // Si l'utilisateur est en cours de réinitialisation de mot de passe (suite à un lien reçu par e-mail)
  if (etat.recuperation) {
    afficherNouveauMotDePasse(racine);
    return;
  }

  if (etat.user) {
    await afficherProfil(racine);
  } else {
    afficherAuth(racine);
  }
}

// ---------------------------------------------------------------------------
// 1. Utilisateur connecté : Profil, statistiques et déconnexion
// ---------------------------------------------------------------------------
async function afficherProfil(racine) {
  const user = etat.user;
  const pseudo = pseudoActuel();
  const email = user.email || '';

  racine.innerHTML = `
    <div class="auth-tete">
      <span class="logo-e grand" aria-hidden="true">E</span>
      <h1 class="titre-page">Mon compte</h1>
      <p class="sous-titre">Gère ton identifiant de lecteur et tes avis publics.</p>
    </div>

    ${etat.messageAuth ? `<div class="message message-${etat.messageAuth.type}" role="status">${esc(etat.messageAuth.texte)}</div>` : ''}

    <div class="carte">
      <h2 class="titre-3">Profil</h2>
      
      <div class="info-ligne">
        <span>Adresse e-mail</span>
        <span>${esc(email)}</span>
      </div>

      <form id="form-pseudo" novalidate style="margin-top:18px">
        <div id="pseudo-msg"></div>
        <div class="champ">
          <label for="pseudo">Pseudo affiché publiquement (sur tes avis)</label>
          <input class="saisie" id="pseudo" name="pseudo" value="${esc(pseudo)}" maxlength="40" required autocomplete="nickname">
          <p class="aide">Ce pseudo apparaît au-dessus des avis que tu publies.</p>
        </div>
        <button type="submit" class="btn btn-secondaire" id="btn-sauver-pseudo">Enregistrer le pseudo</button>
      </form>
    </div>

    <div class="carte" style="margin-top:18px">
      <h2 class="titre-3">Changer de mot de passe</h2>
      <form id="form-mdp" novalidate>
        <div id="mdp-msg"></div>
        <div class="champ">
          <label for="nouveau-mdp">Nouveau mot de passe (6 caractères min.)</label>
          <div class="mot-de-passe">
            <input class="saisie" type="password" id="nouveau-mdp" name="mdp" minlength="6" required autocomplete="new-password">
            <button type="button" class="btn-icone" data-toggle="nouveau-mdp" aria-label="Afficher le mot de passe">${icones.oeil}</button>
          </div>
        </div>
        <button type="submit" class="btn btn-secondaire" id="btn-sauver-mdp">Mettre à jour le mot de passe</button>
      </form>
    </div>

    <div class="carte" style="margin-top:18px">
      <h2 class="titre-3" style="color:var(--danger)">Déconnexion</h2>
      <p style="color:var(--texte-2)">Tu pourras te reconnecter à tout moment pour retrouver ta bibliothèque et tes pages.</p>
      <button type="button" class="btn btn-danger" id="btn-deconnexion">Me déconnecter</button>
    </div>`;

  etat.messageAuth = null; // consommé

  brancherAffichageMdp(racine);

  // Formulaire pseudo
  const formPseudo = racine.querySelector('#form-pseudo');
  const msgPseudo = racine.querySelector('#pseudo-msg');
  formPseudo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nouveau = formPseudo.pseudo.value.trim();
    if (!nouveau) {
      msgPseudo.innerHTML = '<p class="message message-erreur">Le pseudo ne peut pas être vide.</p>';
      return;
    }
    const btn = formPseudo.querySelector('#btn-sauver-pseudo');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';

    const { data, error } = await etat.supabase.auth.updateUser({
      data: { pseudo: nouveau },
    });

    btn.disabled = false;
    btn.textContent = 'Enregistrer le pseudo';

    if (error) {
      msgPseudo.innerHTML = `<p class="message message-erreur">${esc(traduireErreurAuth(error))}</p>`;
      return;
    }

    etat.user = data.user;
    toast('Ton pseudo a été mis à jour.');
    msgPseudo.innerHTML = '<p class="message message-succes">Pseudo mis à jour avec succès.</p>';
  });

  // Formulaire mot de passe
  const formMdp = racine.querySelector('#form-mdp');
  const msgMdp = racine.querySelector('#mdp-msg');
  formMdp.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = formMdp.mdp.value;
    if (pass.length < 6) {
      msgMdp.innerHTML = '<p class="message message-erreur">Le mot de passe doit comporter au moins 6 caractères.</p>';
      return;
    }
    const btn = formMdp.querySelector('#btn-sauver-mdp');
    btn.disabled = true;
    btn.textContent = 'Mise à jour…';

    const { error } = await etat.supabase.auth.updateUser({ password: pass });

    btn.disabled = false;
    btn.textContent = 'Mettre à jour le mot de passe';

    if (error) {
      msgMdp.innerHTML = `<p class="message message-erreur">${esc(traduireErreurAuth(error))}</p>`;
      return;
    }

    formMdp.reset();
    toast('Ton mot de passe a bien été modifié.');
    msgMdp.innerHTML = '<p class="message message-succes">Mot de passe modifié avec succès.</p>';
  });

  // Bouton déconnexion
  racine.querySelector('#btn-deconnexion').addEventListener('click', async () => {
    const ok = await confirmer({
      titre: 'Te déconnecter ?',
      texte: 'Tes livres resteront en sécurité sur ton compte.',
      ok: 'Me déconnecter',
      danger: false,
    });
    if (!ok) return;

    await etat.supabase.auth.signOut();
    viderCache();
    toast('Tu es déconnecté.');
    afficher(racine);
  });
}

// ---------------------------------------------------------------------------
// 2. Visiteur non connecté : Connexion / Inscription / Récupération
// ---------------------------------------------------------------------------
function afficherAuth(racine) {
  let mode = 'connexion'; // 'connexion' | 'inscription' | 'oubli'

  function rendre() {
    racine.innerHTML = `
      <div class="auth-tete">
        <span class="logo-e grand" aria-hidden="true">E</span>
        <h1 class="titre-page">${mode === 'inscription' ? 'Créer un compte' : (mode === 'oubli' ? 'Mot de passe oublié' : 'Connexion')}</h1>
        <p class="sous-titre">${mode === 'inscription' ? 'Rejoins Ebook pour photographier et lire tes livres.' : (mode === 'oubli' ? 'Reçois un lien pour réinitialiser ton mot de passe.' : 'Retrouve ta bibliothèque et continue ta lecture.')}</p>
      </div>

      ${etat.messageAuth ? `<div class="message message-${etat.messageAuth.type}" role="status">${esc(etat.messageAuth.texte)}</div>` : ''}

      <div class="carte">
        <div id="auth-msg"></div>

        ${mode === 'oubli' ? renduOubli() : (mode === 'inscription' ? renduInscription() : renduConnexion())}
      </div>

      <p class="aide" style="text-align:center;margin-top:24px;color:var(--texte-2);font-size:.85rem">
        Ebook est un projet personnel sans publicité.<br>
        En continuant, tu acceptes notre politique de <a href="#/confidentialite">confidentialité</a>.
      </p>`;

    etat.messageAuth = null;
    brancherAffichageMdp(racine);
    brancherEvenementsAuth();
  }

  function renduConnexion() {
    return `
      <form id="form-auth" novalidate>
        <div class="champ">
          <label for="email">Adresse e-mail</label>
          <input class="saisie" type="email" id="email" name="email" required autocomplete="email" placeholder="toi@exemple.fr">
        </div>
        <div class="champ">
          <label for="mdp">Mot de passe</label>
          <div class="mot-de-passe">
            <input class="saisie" type="password" id="mdp" name="mdp" required autocomplete="current-password">
            <button type="button" class="btn-icone" data-toggle="mdp" aria-label="Afficher le mot de passe">${icones.oeil}</button>
          </div>
        </div>
        <div style="text-align:right;margin-bottom:14px">
          <button type="button" class="lien-texte" id="btn-oubli" style="font-size:.88rem">Mot de passe oublié ?</button>
        </div>
        <button type="submit" class="btn btn-primaire btn-bloc" id="btn-action">Me connecter</button>
      </form>
      <div style="margin-top:20px;text-align:center;border-top:1px solid var(--bordure);padding-top:16px">
        <span style="color:var(--texte-2);font-size:.92rem">Pas encore de compte ?</span>
        <button type="button" class="lien-texte" id="btn-bascule" style="font-weight:600">Créer un compte</button>
      </div>`;
  }

  function renduInscription() {
    return `
      <form id="form-auth" novalidate>
        <div class="champ">
          <label for="pseudo">Pseudo de lecteur</label>
          <input class="saisie" id="pseudo" name="pseudo" maxlength="40" required autocomplete="nickname" placeholder="Ex. : Victor, Juliette…">
        </div>
        <div class="champ">
          <label for="email">Adresse e-mail</label>
          <input class="saisie" type="email" id="email" name="email" required autocomplete="email" placeholder="toi@exemple.fr">
        </div>
        <div class="champ">
          <label for="mdp">Mot de passe (6 caractères min.)</label>
          <div class="mot-de-passe">
            <input class="saisie" type="password" id="mdp" name="mdp" minlength="6" required autocomplete="new-password">
            <button type="button" class="btn-icone" data-toggle="mdp" aria-label="Afficher le mot de passe">${icones.oeil}</button>
          </div>
        </div>
        <button type="submit" class="btn btn-primaire btn-bloc" id="btn-action">Créer mon compte</button>
      </form>
      <div style="margin-top:20px;text-align:center;border-top:1px solid var(--bordure);padding-top:16px">
        <span style="color:var(--texte-2);font-size:.92rem">Tu as déjà un compte ?</span>
        <button type="button" class="lien-texte" id="btn-bascule" style="font-weight:600">Me connecter</button>
      </div>`;
  }

  function renduOubli() {
    return `
      <form id="form-auth" novalidate>
        <p style="color:var(--texte-2);font-size:.92rem;margin-bottom:16px">Entre ton adresse e-mail. Tu recevras un lien sécurisé pour définir un nouveau mot de passe.</p>
        <div class="champ">
          <label for="email">Adresse e-mail</label>
          <input class="saisie" type="email" id="email" name="email" required autocomplete="email" placeholder="toi@exemple.fr">
        </div>
        <button type="submit" class="btn btn-primaire btn-bloc" id="btn-action">Envoyer le lien de réinitialisation</button>
      </form>
      <div style="margin-top:20px;text-align:center;border-top:1px solid var(--bordure);padding-top:16px">
        <button type="button" class="lien-texte" id="btn-retour-connexion">Retour à la connexion</button>
      </div>`;
  }

  function brancherEvenementsAuth() {
    const form = racine.querySelector('#form-auth');
    const msg = racine.querySelector('#auth-msg');

    racine.querySelector('#btn-bascule')?.addEventListener('click', () => {
      mode = mode === 'connexion' ? 'inscription' : 'connexion';
      rendre();
    });

    racine.querySelector('#btn-oubli')?.addEventListener('click', () => {
      mode = 'oubli';
      rendre();
    });

    racine.querySelector('#btn-retour-connexion')?.addEventListener('click', () => {
      mode = 'connexion';
      rendre();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.innerHTML = '';

      const email = form.email.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.innerHTML = '<p class="message message-erreur">Merci de saisir une adresse e-mail valide.</p>';
        form.email.focus();
        return;
      }

      const btn = form.querySelector('#btn-action');
      btn.disabled = true;

      // 1. Mot de passe oublié
      if (mode === 'oubli') {
        btn.textContent = 'Envoi…';
        const { error } = await etat.supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/#/compte`,
        });
        btn.disabled = false;
        btn.textContent = 'Envoyer le lien de réinitialisation';

        if (error) {
          msg.innerHTML = `<p class="message message-erreur">${esc(traduireErreurAuth(error))}</p>`;
          return;
        }

        msg.innerHTML = '<p class="message message-succes">Si cette adresse est enregistrée, tu recevras un e-mail dans quelques instants avec un lien pour réinitialiser ton mot de passe.</p>';
        return;
      }

      // 2. Connexion ou Inscription
      const mdp = form.mdp.value;
      if (mdp.length < 6) {
        msg.innerHTML = '<p class="message message-erreur">Le mot de passe doit comporter au moins 6 caractères.</p>';
        btn.disabled = false;
        form.mdp.focus();
        return;
      }

      if (mode === 'inscription') {
        const pseudo = (form.pseudo?.value || '').trim() || email.split('@')[0];
        btn.textContent = 'Création du compte…';

        const { data, error } = await etat.supabase.auth.signUp({
          email,
          password: mdp,
          options: {
            data: { pseudo },
            emailRedirectTo: `${window.location.origin}/#/compte`,
          },
        });

        btn.disabled = false;
        btn.textContent = 'Créer mon compte';

        if (error) {
          msg.innerHTML = `<p class="message message-erreur">${esc(traduireErreurAuth(error))}</p>`;
          return;
        }

        // Si Supabase nécessite la confirmation d'e-mail
        if (data.user && !data.session) {
          msg.innerHTML = '<p class="message message-succes">Ton compte a été créé ! Un e-mail de confirmation t\'a été envoyé. Clique sur le lien pour valider ton compte et commencer à lire.</p>';
          form.reset();
          return;
        }

        // Connecté directement
        etat.user = data.user;
        etat.session = data.session;
        toast('Bienvenue sur Ebook !');
        terminerAuth();
      } else {
        // Connexion
        btn.textContent = 'Connexion…';

        const { data, error } = await etat.supabase.auth.signInWithPassword({
          email,
          password: mdp,
        });

        btn.disabled = false;
        btn.textContent = 'Me connecter';

        if (error) {
          msg.innerHTML = `<p class="message message-erreur">${esc(traduireErreurAuth(error))}</p>`;
          return;
        }

        etat.user = data.user;
        etat.session = data.session;
        toast('Connexion réussie.');
        terminerAuth();
      }
    });
  }

  function terminerAuth() {
    const dest = etat.retour || '#/bibliotheque';
    etat.retour = null;
    location.hash = dest;
  }

  rendre();
}

// ---------------------------------------------------------------------------
// 3. Réinitialisation de mot de passe (suite à un lien reçu)
// ---------------------------------------------------------------------------
function afficherNouveauMotDePasse(racine) {
  racine.innerHTML = `
    <div class="auth-tete">
      <span class="logo-e grand" aria-hidden="true">E</span>
      <h1 class="titre-page">Nouveau mot de passe</h1>
      <p class="sous-titre">Choisis un nouveau mot de passe sécurisé pour ton compte.</p>
    </div>

    <div class="carte">
      <form id="form-reset" novalidate>
        <div id="reset-msg"></div>
        <div class="champ">
          <label for="nouveau-pass">Nouveau mot de passe (6 car. min.)</label>
          <div class="mot-de-passe">
            <input class="saisie" type="password" id="nouveau-pass" name="pass" minlength="6" required autocomplete="new-password">
            <button type="button" class="btn-icone" data-toggle="nouveau-pass" aria-label="Afficher le mot de passe">${icones.oeil}</button>
          </div>
        </div>
        <button type="submit" class="btn btn-primaire btn-bloc" id="btn-save-pass">Valider le nouveau mot de passe</button>
      </form>
    </div>`;

  brancherAffichageMdp(racine);

  const form = racine.querySelector('#form-reset');
  const msg = racine.querySelector('#reset-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = form.pass.value;
    if (pass.length < 6) {
      msg.innerHTML = '<p class="message message-erreur">Le mot de passe doit comporter au moins 6 caractères.</p>';
      return;
    }

    const btn = form.querySelector('#btn-save-pass');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';

    const { error } = await etat.supabase.auth.updateUser({ password: pass });

    btn.disabled = false;
    btn.textContent = 'Valider le nouveau mot de passe';

    if (error) {
      msg.innerHTML = `<p class="message message-erreur">${esc(traduireErreurAuth(error))}</p>`;
      return;
    }

    etat.recuperation = false;
    toast('Ton mot de passe a bien été mis à jour.');
    location.hash = '#/bibliotheque';
  });
}

// ---------------------------------------------------------------------------
// Aides : bascule œil mot de passe & traduction des erreurs Supabase en français
// ---------------------------------------------------------------------------
function brancherAffichageMdp(racine) {
  racine.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = racine.querySelector(`#${btn.dataset.toggle}`);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
    });
  });
}

function traduireErreurAuth(erreur) {
  const msg = String(erreur?.message || erreur || '');
  if (/invalid login credentials/i.test(msg) || /invalid credentials/i.test(msg)) {
    return 'Adresse e-mail ou mot de passe incorrect.';
  }
  if (/user already registered/i.test(msg) || /user_already_exists/i.test(msg)) {
    return 'Cette adresse e-mail est déjà associée à un compte. Essaie de te connecter.';
  }
  if (/password should be at least/i.test(msg) || /weak_password/i.test(msg)) {
    return 'Le mot de passe doit comporter au moins 6 caractères.';
  }
  if (/email rate limit exceeded/i.test(msg) || /over_email_send_rate_limit/i.test(msg)) {
    return 'Trop de tentatives en peu de temps. Patiente quelques minutes avant de réessayer.';
  }
  if (/email not confirmed/i.test(msg)) {
    return 'Ton adresse e-mail n\'est pas encore confirmée. Vérifie ta boîte de réception ou tes courriers indésirables.';
  }
  if (/signup requires a valid password/i.test(msg)) {
    return 'Merci de saisir un mot de passe valide.';
  }
  if (/network|fetch/i.test(msg)) {
    return 'Impossible de joindre le serveur d\'authentification. Vérifie ta connexion internet.';
  }
  return messageErreur(erreur);
}
