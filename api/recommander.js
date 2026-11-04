// =============================================================================
//  Fonction Serverless Vercel : /api/recommander
// =============================================================================
//  Cette fonction reçoit la demande de lecture et la liste des livres de la
//  bibliothèque de l'utilisateur, puis interroge un modèle de langage (LLM).
//
//  CONFIGURATION :
//  1. Si la variable d'environnement LLM_API_KEY est absente, la fonction
//     renvoie un message cordial indiquant que le service arrive bientôt.
//  2. Pour activer l'IA :
//     - Dans Vercel > Ton Projet > Settings > Environment Variables
//     - Ajoute une variable nommée LLM_API_KEY avec ta clé API
//     - (Optionnel) Ajoute LLM_PROVIDER = "gemini" ou "anthropic" (défaut : "gemini")
// =============================================================================

export default async function handler(req, res) {
  // En-têtes CORS pour les requêtes locales ou transverses
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Méthode non autorisée. Utilise POST.' });
  }

  const { message = '', bibliotheque = [] } = typeof req.body === 'string'
    ? JSON.parse(req.body || '{}')
    : (req.body || {});

  const apiKey = process.env.LLM_API_KEY;

  // ---------------------------------------------------------------------------
  // Cas où la clé n'est pas encore configurée
  // ---------------------------------------------------------------------------
  if (!apiKey || !apiKey.trim()) {
    return res.status(200).json({
      statut: 'bientot_disponible',
      reponse: 'Les recommandations seront bientôt disponibles. (L\'administrateur n\'a pas encore configuré la clé d\'API LLM_API_KEY dans Vercel).',
    });
  }

  // ---------------------------------------------------------------------------
  // Confection du prompt système pour les recommandations
  // ---------------------------------------------------------------------------
  const systemPrompt = `Tu es le conseiller littéraire de l'application "Ebook".
Ton rôle est de recommander 2 à 4 livres pertinents (romans, pièces de théâtre, essais) selon les envies exprimées par le lecteur.
Pour chaque recommandation :
- Indique le Titre en gras et l'Auteur en italique.
- Donne 2-3 phrases captivantes expliquant pourquoi ce livre correspond à la demande.
- Si pertinent, précise le genre et le niveau d'accessibilité.
Adopte un ton chaleureux, élégant, cultivé et passionné. Ne tutoie pas de façon excessivement familière mais reste accessible.
Réponds uniquement en français.`;

  const contexteLivres = bibliotheque.length > 0
    ? `\n\nLivres déjà présents dans la bibliothèque du lecteur :\n- ${bibliotheque.slice(0, 20).join('\n- ')}\n(Évite de recommander ces mêmes livres, sauf si demandé explicitement).`
    : '';

  const promptFinal = `${systemPrompt}${contexteLivres}\n\nDemande du lecteur : "${message}"`;

  try {
    const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

    // -------------------------------------------------------------------------
    // OPTION A : Google Gemini (utilise l'API REST native sans package npm requis)
    // -------------------------------------------------------------------------
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const apiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptFinal }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          },
        }),
      });

      if (!apiRes.ok) {
        const errData = await apiRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Erreur API Gemini (${apiRes.status})`);
      }

      const data = await apiRes.json();
      const texteReponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texteReponse) throw new Error('Réponse vide du modèle');

      return res.status(200).json({ reponse: texteReponse });
    }

    // -------------------------------------------------------------------------
    // OPTION B : Anthropic Claude
    // (Décommente / sélectionne avec LLM_PROVIDER="anthropic")
    // -------------------------------------------------------------------------
    if (provider === 'anthropic') {
      const url = 'https://api.anthropic.com/v1/messages';
      const apiRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1000,
          system: systemPrompt + contexteLivres,
          messages: [{ role: 'user', content: message }],
        }),
      });

      if (!apiRes.ok) {
        const errData = await apiRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Erreur API Anthropic (${apiRes.status})`);
      }

      const data = await apiRes.json();
      const texteReponse = data?.content?.[0]?.text;
      if (!texteReponse) throw new Error('Réponse vide du modèle');

      return res.status(200).json({ reponse: texteReponse });
    }

    return res.status(400).json({ message: `Fournisseur LLM inconnu : ${provider}` });
  } catch (err) {
    console.error('Erreur /api/recommander :', err);
    return res.status(500).json({
      message: 'Impossible d\'obtenir une recommandation pour le moment.',
      details: err.message,
    });
  }
}
