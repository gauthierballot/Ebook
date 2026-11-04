// État partagé de l'application (client Supabase, session, utilisateur).
// Les vues lisent cet objet plutôt que d'importer Supabase directement,
// ce qui permet à l'application de démarrer même si le CDN est injoignable.

export const etat = {
  supabase: null,      // client Supabase (null si non configuré ou CDN indisponible)
  configOk: false,     // false si js/config.js contient encore les valeurs d'exemple
  session: null,
  user: null,
  retour: null,        // route à rouvrir après la connexion
  recuperation: false, // true quand on revient d'un lien « mot de passe oublié »
  messageAuth: null,   // message à afficher sur la page Compte (ex. e-mail confirmé)
};

/** Pseudo de l'utilisateur connecté (ou partie avant @ de l'e-mail). */
export function pseudoActuel() {
  const u = etat.user;
  if (!u) return '';
  const p = (u.user_metadata?.pseudo || '').trim();
  return p || (u.email || 'Lecteur').split('@')[0].slice(0, 40);
}
