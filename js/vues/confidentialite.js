// =============================================================================
//  Page légale et de confidentialité : mentions minimales, transparentes et claires
// =============================================================================

import { icones } from '../ui.js';

export async function afficher(racine) {
  racine.innerHTML = `
    <div style="margin-bottom:16px">
      <a class="btn btn-discret" href="#/bibliotheque" style="padding-left:0">
        ${icones.retour} Retour
      </a>
    </div>

    <div class="carte legal">
      <h1 class="titre-page">Confidentialité &amp; Mentions légales</h1>
      <p class="sous-titre">Ebook est un projet personnel, indépendant et sans publicité.</p>

      <h2>1. Éditeur du site</h2>
      <p>
        Ce site est conçu et édité par <strong>Gauthier Ballot</strong>, à titre de projet personnel non commercial.<br>
        Contact par e-mail : <span class="a-completer">[À COMPLÉTER : votre-email@domaine.fr]</span>
      </p>

      <h2>2. Hébergement de l'application</h2>
      <p>
        L'application web est hébergée sur l'infrastructure de :<br>
        <strong>Vercel Inc.</strong><br>
        440 N Barranca Ave #4133, Covina, CA 91723, États-Unis<br>
        Site web : <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a>
      </p>

      <h2>3. Données personnelles et hébergement des données</h2>
      <p>
        Les données de base de données et d'authentification sont hébergées chez :<br>
        <strong>Supabase Inc.</strong> (offre cloud gérée).
      </p>
      <p>Les seules données collectées sont strictement nécessaires au fonctionnement du service :</p>
      <ul>
        <li><strong>Adresse e-mail et mot de passe chiffré</strong> : pour la création et la sécurisation de ton compte.</li>
        <li><strong>Pseudo de lecteur</strong> : modifiable à tout moment, visible publiquement uniquement si tu choisis de publier un avis.</li>
        <li><strong>Livres et pages numérisées</strong> : tes photographies et les textes extraits restent <strong>strictement privés</strong> et ne sont accessibles que par ton compte utilisateur via les règles de sécurité Row Level Security (RLS) de la base de données. Les photos de pages sont envoyées au service Google Gemini uniquement pour en extraire le texte, elles ne sont pas conservées par Ebook.</li>
        <li><strong>Avis et notes</strong> : si tu publies un avis littéraire, celui-ci est rendu public afin de partager ton ressenti avec les autres lecteurs.</li>
      </ul>

      <h2>4. Finalité et absence de suivi publicitaire</h2>
      <p>
        Ces données sont utilisées uniquement pour te permettre de lire tes propres livres en mobilité et de partager des avis de lecture.<br>
        <strong>Aucune publicité, aucun traqueur publicitaire, aucun outil d'analyse tiers et aucune revente de données</strong> ne sont présents sur ce site.
      </p>

      <h2>5. Cookies et stockage local</h2>
      <p>
        Ce site n'utilise <strong>aucun cookie de suivi ni cookie publicitaire</strong>. Par conséquent, conformément aux recommandations de la CNIL et au RGPD, aucun bandeau de consentement intrusif n'est requis.<br>
        Seules des données strictement nécessaires au fonctionnement technique sont stockées sur ton navigateur (via le stockage local / <code>localStorage</code>) :
      </p>
      <ul>
        <li>Le jeton d'authentification de ta session Supabase (pour rester connecté).</li>
        <li>La mémorisation de ta préférence de thème (clair ou sombre).</li>
        <li>Tes préférences de confort de lecture (taille de police, interligne, thème sépia/sombre).</li>
        <li>Un cache temporaire de tes pages pour permettre la lecture hors ligne.</li>
      </ul>

      <h2>6. Propriété intellectuelle et usage personnel</h2>
      <p>
        Ebook est un outil technologique de lecture destiné exclusivement à la copie privée. <strong>Tu t'engages à ne photographier et numériser que des livres physiques dont tu es légitimement propriétaire, pour ton usage personnel et privé</strong> dans le cercle familial, dans le respect du Code de la Propriété Intellectuelle.
      </p>

      <h2>7. Tes droits (accès, modification, suppression)</h2>
      <p>
        Conformément à la réglementation relative à la protection des données personnelles, tu disposes d'un droit d'accès, de rectification et de suppression de toutes tes données personnelles.<br>
        Tu peux à tout moment supprimer tes livres et tes avis directement depuis l'application, ou demander la suppression intégrale de ton compte par e-mail à l'adresse de contact mentionnée au paragraphe 1.
      </p>
    </div>`;
}
