// =============================================================================
//  Recommandations : assistant de lecture par chat
//  Appelle la fonction serverless Vercel /api/recommander.js
// =============================================================================

import { etat } from '../etat.js';
import { esc, icones } from '../ui.js';
import { lireCache } from '../cache.js';

export async function afficher(racine) {
  // Récupérer les livres de la bibliothèque pour contextualiser la recommandation
  let titresBibliotheque = [];
  if (etat.user && etat.supabase) {
    const enCache = lireCache(`bibliotheque:${etat.user.id}`);
    if (enCache && Array.isArray(enCache)) {
      titresBibliotheque = enCache.map((l) => `${l.titre}${l.auteur ? ` (${l.auteur})` : ''}`);
    } else {
      const { data } = await etat.supabase
        .from('books')
        .select('titre, auteur')
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) {
        titresBibliotheque = data.map((l) => `${l.titre}${l.auteur ? ` (${l.auteur})` : ''}`);
      }
    }
  }

  racine.innerHTML = `
    <h1 class="titre-page">Conseils de lecture</h1>
    <p class="sous-titre">Dis-moi ce qui te ferait plaisir : genre, ambiance, format ou auteur.</p>

    <div class="chat">
      <div class="suggestions" role="group" aria-label="Suggestions de requêtes">
        <button type="button" class="suggestion" data-texte="Un roman court et rythmé">Un roman court et rythmé</button>
        <button type="button" class="suggestion" data-texte="Une pièce de théâtre classique">Une pièce de théâtre classique</button>
        <button type="button" class="suggestion" data-texte="Un classique captivant en anglais">Un livre en anglais accessible</button>
        <button type="button" class="suggestion" data-texte="Un roman initiatique ou philosophique">Un roman philosophique</button>
      </div>

      <div class="chat-fil" id="chat-fil" aria-live="polite">
        <div class="bulle bot">
          Bonjour ! Envie d'une nouvelle lecture ? Décris-moi tes envies du moment ou clique sur l'une des suggestions ci-dessus.
          ${titresBibliotheque.length
            ? `<br><small style="color:var(--texte-2);display:block;margin-top:6px">Je prendrai aussi en compte tes ${titresBibliotheque.length} livre${titresBibliotheque.length > 1 ? 's' : ''} enregistrés.</small>`
            : ''
          }
        </div>
      </div>

      <form class="chat-saisie" id="chat-form">
        <textarea id="chat-input" placeholder="Ex. : Un suspense haletant pour le week-end…" rows="1" aria-label="Message pour l'assistant de recommandation"></textarea>
        <button type="submit" class="btn-icone" aria-label="Envoyer le message" id="btn-envoyer">${icones.envoyer}</button>
      </form>
    </div>`;

  const fil = racine.querySelector('#chat-fil');
  const form = racine.querySelector('#chat-form');
  const input = racine.querySelector('#chat-input');
  const btnEnvoyer = racine.querySelector('#btn-envoyer');

  // Ajustement automatique de la hauteur du textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // Clic sur une suggestion
  racine.querySelectorAll('.suggestion').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.texte;
      input.style.height = 'auto';
      input.focus();
      form.requestSubmit();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texte = input.value.trim();
    if (!texte) return;

    input.value = '';
    input.style.height = 'auto';

    // 1. Bulle utilisateur
    ajouterBulle(fil, 'moi', texte);

    // 2. Bulle de chargement "..."
    const idAttente = `attente-${Date.now()}`;
    const bulleAttente = document.createElement('div');
    bulleAttente.className = 'bulle bot';
    bulleAttente.id = idAttente;
    bulleAttente.innerHTML = '<span class="ecrit" aria-label="En train d\'écrire"><span></span><span></span><span></span></span>';
    fil.appendChild(bulleAttente);
    defilerBas(fil);

    input.disabled = true;
    btnEnvoyer.disabled = true;

    try {
      const res = await fetch('/api/recommander', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: texte,
          bibliotheque: titresBibliotheque,
        }),
      });

      const donnees = await res.json().catch(() => ({}));
      bulleAttente.remove();

      if (!res.ok) {
        const messageRetour = donnees.message || donnees.reponse || 'Une erreur est survenue lors de la recherche de recommandations.';
        ajouterBulle(fil, 'bot info', messageRetour);
      } else {
        const reponse = donnees.reponse || donnees.message || 'Voici quelques suggestions pour toi.';
        ajouterBulle(fil, 'bot', reponse);
      }
    } catch {
      bulleAttente.remove();
      ajouterBulle(fil, 'bot info', 'Les recommandations seront bientôt disponibles. (Connexion à l\'assistant impossible pour l\'instant)');
    } finally {
      input.disabled = false;
      btnEnvoyer.disabled = false;
      input.focus();
      defilerBas(fil);
    }
  });
}

function ajouterBulle(fil, classe, texte) {
  const bulle = document.createElement('div');
  bulle.className = `bulle ${classe}`;
  // Formater les retours à la ligne
  bulle.innerHTML = esc(texte).replace(/\n/g, '<br>');
  fil.appendChild(bulle);
  defilerBas(fil);
}

function defilerBas(fil) {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
