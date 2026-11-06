// =============================================================================
//  Fonction Serverless Vercel : /api/ocr
// =============================================================================
//  Reçoit une image en base64 d'une page de livre et utilise l'IA de vision
//  Google Gemini (modèle Flash) pour extraire fidèlement le texte intégral.
// =============================================================================

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  // En-têtes CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'Méthode non autorisée. Utilise POST.' });
  }

  // 1. Vérification de la sécurité : jeton Supabase obligatoire
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ erreur: 'Accès non autorisé. Connecte-toi pour numériser des pages.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const authRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': supabaseAnonKey,
        },
      });

      if (!authRes.ok) {
        return res.status(401).json({ erreur: 'Session invalide ou expirée. Reconnecte-toi.' });
      }
    } catch {
      return res.status(500).json({ erreur: 'Impossible de vérifier la session utilisateur.' });
    }
  }

  // 2. Vérification de la présence de la clé API LLM
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(503).json({
      erreur: "La lecture par IA n'est pas encore configurée.",
      nonConfigure: true,
    });
  }

  // 3. Extraction et validation du corps de la requête
  const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { image, langue = 'fr', type = 'roman' } = corps;

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ erreur: "Image manquante ou invalide dans la requête." });
  }

  // Nettoyer l'éventuel préfixe base64 au cas où
  const cleanBase64 = image.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');

  // 4. Confection des instructions pour Gemini
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const typeNotice = type === 'theatre'
    ? "This page is from a theatrical play. You MUST strictly preserve all character names, stage directions, and every single line break."
    : "This page is from a prose book (novel or essay). Separate distinct paragraphs with a blank line, without breaking lines in the middle of a continuous sentence or paragraph.";

  const promptSystem = `Transcribe faithfully and verbatim the text from this photographed book page, word for word, without summarizing, without correcting, without translating, without inventing, without commentary and without Markdown formatting. Preserve original spelling, accents, apostrophes, quotation marks, and dialogue dashes. Rejoin words hyphenated at line ends. Separate paragraphs with a blank line, without line breaks within paragraphs. For 'theatre' type, preserve character names, stage directions, and every line break. Ignore text from adjacent pages visible at the margins, fingers, and shadows. Keep chapter titles. If a page number is visible at the top or bottom, do not include it. If the page is illegible or contains no text, reply exactly: [ILLISIBLE].

Page language: ${langue === 'en' ? 'English' : 'French'}.
${typeNotice}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: cleanBase64,
                },
              },
              {
                text: promptSystem,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 3000,
        },
      }),
    });

    if (apiRes.status === 429) {
      return res.status(429).json({ erreur: "Trop de photos d'un coup, réessaie dans une minute." });
    }

    if (!apiRes.ok) {
      const errJson = await apiRes.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || `Erreur Gemini (${apiRes.status})`;
      return res.status(502).json({ erreur: `Échec de l'analyse : ${errMsg}` });
    }

    const data = await apiRes.json();
    const candidate = data?.candidates?.[0];

    // Vérification blocage de sécurité
    if (candidate?.finishReason === 'SAFETY') {
      return res.status(422).json({ erreur: "La page a été bloquée par les filtres de sécurité. Reprends la photo." });
    }

    const texte = candidate?.content?.parts?.[0]?.text?.trim() || '';

    if (!texte) {
      return res.status(422).json({ erreur: "Aucun texte n'a pu être extrait de cette image. Reprends la photo." });
    }

    // Aucune image n'est stockée ni journalisée
    return res.status(200).json({ texte });
  } catch (err) {
    return res.status(500).json({ erreur: `Erreur réseau avec le service d'IA : ${err.message || 'serveur injoignable'}` });
  }
}
