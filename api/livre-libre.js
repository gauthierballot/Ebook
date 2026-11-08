// =============================================================================
//  Fonction Serverless Vercel : /api/livre-libre
// =============================================================================
//  Cherche et importe la version complète d'un livre UNIQUEMENT s'il est dans
//  le domaine public, depuis la bibliothèque libre Project Gutenberg.
//
//  Règle appliquée (droit français / européen) : un livre est libre si TOUS ses
//  auteurs sont morts depuis plus de 70 ans (au 1er janvier de l'année en cours)
//  ET si Gutenberg le marque « Public domain in the USA ».
//  Les livres encore protégés ne sont jamais importés.
//
//  POST { action: 'chercher', titre, auteur, langue }  -> { resultats: [...] }
//  POST { action: 'importer', id, type }               -> { pages: [...] }
// =============================================================================

const GUTENBERG = 'https://www.gutenberg.org';
const TAILLE_PAGE = 1800;        // caractères visés par page du lecteur
const TAILLE_MAX_TEXTE = 4_000_000;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée.' });

  // 1. Seuls les utilisateurs connectés peuvent utiliser ce service
  const erreurAuth = await verifierJeton(req.headers.authorization);
  if (erreurAuth) return res.status(401).json({ erreur: erreurAuth });

  const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  try {
    if (corps.action === 'chercher') return res.status(200).json(await chercher(corps));
    if (corps.action === 'importer') return res.status(200).json(await importer(corps));
    if (corps.action === 'analyser-couverture') return res.status(200).json(await analyserCouverture(corps));
    if (corps.action === 'meta-apple') return res.status(200).json(await chercherMetaApple(corps));
    if (corps.action === 'resumer') return res.status(200).json(await resumerLivre(corps));
    return res.status(400).json({ erreur: 'Action inconnue.' });
  } catch (e) {
    const statut = e.statut || 502;
    return res.status(statut).json({ erreur: e.messageUtilisateur || 'La bibliothèque libre ne répond pas. Réessaie plus tard.' });
  }
}

// -----------------------------------------------------------------------------
// Sécurité : vérification du jeton Supabase
// -----------------------------------------------------------------------------
async function verifierJeton(entete = '') {
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : '';
  if (!jeton) return 'Connecte-toi pour utiliser cette fonction.';
  const url = process.env.SUPABASE_URL || 'https://vwcqiffpdzkfvfcqlhyx.supabase.co';
  const cle = process.env.SUPABASE_ANON_KEY || 'sb_publishable_SqWEdr3yfyDpQ4NZTwdcHA_vDdcVqa_';
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, { headers: { Authorization: `Bearer ${jeton}`, apikey: cle } });
    return r.ok ? null : 'Session invalide ou expirée. Reconnecte-toi.';
  } catch {
    return 'Impossible de vérifier ta session.';
  }
}

function erreur(statut, messageUtilisateur) {
  const e = new Error(messageUtilisateur);
  e.statut = statut;
  e.messageUtilisateur = messageUtilisateur;
  return e;
}

async function recuperer(url, delai = 12000) {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), delai);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Ebook-lecteur-personnel/1.0' } });
    if (r.status === 404) throw erreur(404, 'Ce livre est introuvable dans la bibliothèque libre.');
    if (!r.ok) throw erreur(502, 'La bibliothèque libre ne répond pas correctement.');
    return await r.text();
  } catch (e) {
    if (e.messageUtilisateur) throw e;
    throw erreur(504, 'La bibliothèque libre met trop de temps à répondre. Réessaie.');
  } finally {
    clearTimeout(minuterie);
  }
}

// -----------------------------------------------------------------------------
// Statut juridique d'un livre (lu dans la fiche RDF officielle de Gutenberg)
// -----------------------------------------------------------------------------
async function lireFiche(id) {
  const rdf = await recuperer(`${GUTENBERG}/cache/epub/${id}/pg${id}.rdf`);
  const annee = new Date().getFullYear();

  // Auteurs : nom + années de naissance / décès
  const auteurs = [...rdf.matchAll(/<pgterms:agent[\s\S]*?<\/pgterms:agent>/g)].map(([bloc]) => ({
    nom: nomLisible((bloc.match(/<pgterms:name>([\s\S]*?)<\/pgterms:name>/) || [])[1] || ''),
    naissance: Number((bloc.match(/<pgterms:birthdate[^>]*>(-?\d+)/) || [])[1]) || null,
    deces: Number((bloc.match(/<pgterms:deathdate[^>]*>(-?\d+)/) || [])[1]) || null,
  }));
  const droits = (rdf.match(/<dcterms:rights>([\s\S]*?)<\/dcterms:rights>/) || [])[1] || '';
  const langue = (rdf.match(/<dcterms:language>[\s\S]*?<rdf:value[^>]*>([a-z]+)/) || [])[1] || '';
  const titre = decoder((rdf.match(/<dcterms:title>([\s\S]*?)<\/dcterms:title>/) || [])[1] || '').replace(/\s+/g, ' ').trim();

  let libre = true;
  let raison = '';
  if (!/public domain/i.test(droits)) {
    libre = false; raison = 'Encore protégé par le droit d\'auteur.';
  } else if (!auteurs.length || auteurs.some((a) => !a.deces)) {
    libre = false; raison = 'Date de décès de l\'auteur inconnue : impossible de garantir qu\'il est libre en France.';
  } else {
    const dernier = Math.max(...auteurs.map((a) => a.deces));
    if (dernier + 70 >= annee) {
      libre = false; raison = `Encore protégé en France jusqu'au 1er janvier ${dernier + 71}.`;
    }
  }
  return { id, titre, auteurs, langue, libre, raison };
}

function nomLisible(nom) {
  // « Hugo, Victor » -> « Victor Hugo »
  const n = decoder(nom).replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const [famille, prenom] = n.split(/,\s*/);
  return prenom ? `${prenom} ${famille}` : n;
}

function decoder(t) {
  return String(t)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

// -----------------------------------------------------------------------------
// Métadonnées & Couvertures officielles Apple Livres (iTunes Search API)
// -----------------------------------------------------------------------------
async function chercherMetaApple({ titre = '', auteur = '', langue = 'fr' }) {
  const t = String(titre).trim().slice(0, 150);
  const a = String(auteur).trim().slice(0, 100);
  if (!t) return null;

  const pays = langue === 'en' ? 'us' : 'fr';
  const terme = `${t} ${a}`.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(terme)}&entity=ebook&country=${pays}&limit=5`;

  try {
    const texte = await recuperer(url, 6000);
    const json = JSON.parse(texte);
    const items = Array.isArray(json.results) ? json.results : [];
    if (!items.length) return null;

    // Privilégier l'édition gratuite (souvent l'édition classique officielle sur Apple Livres) ou le premier résultat pertinent
    const meilleur = items.find((x) => x.price === 0 && x.artworkUrl100) || items.find((x) => x.artworkUrl100) || items[0];
    const couverture = (meilleur.artworkUrl100 || meilleur.artworkUrl60 || '')
      .replace(/\d+x\d+bb/, '600x600bb');

    const resumeBrut = String(meilleur.description || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    return {
      titreOfficiel: decoder(meilleur.trackName || t),
      auteurOfficiel: decoder(meilleur.artistName || a),
      couverture: couverture || null,
      resume: decoder(resumeBrut).slice(0, 600),
      gratuitApple: meilleur.price === 0,
      genre: Array.isArray(meilleur.genres) ? meilleur.genres[0] : '',
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Recherche combinée : Texte intégral Gutenberg + Couverture officielle Apple
// -----------------------------------------------------------------------------
async function chercher({ titre = '', auteur = '', langue = 'fr' }) {
  const t = String(titre).trim().slice(0, 150);
  const a = String(auteur).trim().slice(0, 100);
  if (!t) throw erreur(400, 'Titre manquant.');

  // On lance en parallèle la recherche Gutenberg et la recherche de couverture Apple Livres
  const [idsInitiaux, metaApple] = await Promise.all([
    idsGutenberg(`${t} ${a}`.trim()).catch(() => []),
    chercherMetaApple({ titre: t, auteur: a, langue }),
  ]);

  let ids = idsInitiaux;
  if (!ids.length && a) ids = await idsGutenberg(t).catch(() => []);

  // Fiches lues en parallèle (5 maximum pour rester rapide)
  const fiches = (await Promise.allSettled(ids.slice(0, 5).map(lireFiche)))
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((f) => !langue || f.langue === langue);

  return {
    metaApple,
    resultats: fiches.map((f) => ({
      id: f.id,
      titre: f.titre,
      auteur: f.auteurs.map((x) => x.nom).join(', '),
      annees: f.auteurs.map((x) => (x.naissance || x.deces ? `${x.naissance ?? '?'}–${x.deces ?? '?'}` : '')).filter(Boolean).join(', '),
      libre: f.libre,
      raison: f.raison,
      couverture: metaApple?.couverture || `${GUTENBERG}/cache/epub/${f.id}/pg${f.id}.cover.medium.jpg`,
      resume: metaApple?.resume || '',
    })),
  };
}

async function idsGutenberg(requete) {
  const xml = await recuperer(`${GUTENBERG}/ebooks/search.opds/?query=${encodeURIComponent(requete)}`);
  const ids = [...xml.matchAll(/<id>[^<]*\/ebooks\/(\d+)\.opds<\/id>/g)].map((m) => Number(m[1]));
  return [...new Set(ids)];
}

// -----------------------------------------------------------------------------
// Import du texte complet
// -----------------------------------------------------------------------------
async function importer({ id, type = 'roman' }) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw erreur(400, 'Identifiant de livre invalide.');

  // On revérifie le statut côté serveur : on ne fait jamais confiance au navigateur
  const fiche = await lireFiche(n);
  if (!fiche.libre) throw erreur(403, `Import impossible : ${fiche.raison}`);

  const brut = await recuperer(`${GUTENBERG}/cache/epub/${n}/pg${n}.txt`, 20000);
  if (brut.length > TAILLE_MAX_TEXTE) throw erreur(413, 'Ce livre est trop volumineux. Choisis plutôt un tome séparé.');

  const texte = nettoyer(brut);
  const pages = paginer(texte, type === 'theatre');
  if (pages.length < 2) throw erreur(422, 'Le texte de ce livre n\'a pas pu être récupéré proprement.');

  return { titre: fiche.titre, pages };
}

/** Retire l'en-tête et la licence Gutenberg, les marques d'italique, etc. */
function nettoyer(brut) {
  let t = brut.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const debut = t.search(/^\*{3}\s*START OF (THE|THIS) PROJECT GUTENBERG.*$/im);
  if (debut >= 0) t = t.slice(t.indexOf('\n', debut) + 1);
  const fin = t.search(/^\*{3}\s*END OF (THE|THIS) PROJECT GUTENBERG/im);
  if (fin >= 0) t = t.slice(0, fin);

  return t
    .split('\n')
    // Lignes de crédits de numérisation en tête de texte
    .filter((l, i) => !(i < 40 && /^(produced by|this file was produced|e-text prepared|transcriber)/i.test(l.trim())))
    .join('\n')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/--/g, '—')   // Gutenberg écrit les tirets longs « -- »
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Découpe le texte en pages d'environ 1 800 caractères, sans couper un paragraphe. */
function paginer(texte, theatre) {
  const paragraphes = texte
    .split(/\n\s*\n/)
    .map((p) => (theatre
      ? p.split('\n').map((l) => l.trimEnd()).join('\n').trim()   // théâtre : on garde les lignes
      : p.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim())) // roman : on reforme le paragraphe
    .filter(Boolean)
    .flatMap((p) => (p.length > TAILLE_PAGE * 2 ? decouperLong(p) : [p]));

  const pages = [];
  let courante = '';
  for (const p of paragraphes) {
    if (courante && courante.length + p.length > TAILLE_PAGE) {
      pages.push(courante);
      courante = p;
    } else {
      courante = courante ? `${courante}\n\n${p}` : p;
    }
  }
  if (courante) pages.push(courante);
  return pages;
}

function decouperLong(paragraphe) {
  const phrases = paragraphe.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) || [paragraphe];
  const morceaux = [];
  let courant = '';
  for (const ph of phrases) {
    if (courant && courant.length + ph.length > TAILLE_PAGE) { morceaux.push(courant.trim()); courant = ''; }
    courant += ph;
  }
  if (courant.trim()) morceaux.push(courant.trim());
  return morceaux;
}

// -----------------------------------------------------------------------------
// Analyse d'une photo de couverture / page de garde par IA Gemini
// -----------------------------------------------------------------------------
async function analyserCouverture({ image }) {
  if (!image || typeof image !== 'string') {
    throw erreur(400, 'Image manquante ou invalide.');
  }
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw erreur(503, "La lecture par IA n'est pas encore configurée (clé LLM_API_KEY manquante).");
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const cleanBase64 = image.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');

  const prompt = `You are a specialist in bibliographical identification and book cataloging.
Look carefully at this photo of a book cover or title/half-title page.
Identify:
1. "titre": exact book title.
2. "auteur": full author name (Firstname Lastname).
3. "langue": main language ("fr" for French, "en" for English).
4. "type": "theatre" if this is a theatrical play, otherwise "roman" for any novel, story, or essay.

Respond ONLY with a valid raw JSON object, without markdown code fences or backticks:
{"titre": "...", "auteur": "...", "langue": "fr", "type": "roman"}

If the image is not a book cover/title page or the title is impossible to determine, respond with:
{"erreur": "Impossible de lire le titre ou l'auteur sur cette photo."}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let reponse;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 300,
        },
      }),
    });
  } catch {
    throw erreur(502, "Impossible de joindre le service de vision par IA.");
  }

  if (!reponse.ok) {
    if (reponse.status === 429) throw erreur(429, "Trop de demandes en même temps. Réessaie dans une minute.");
    throw erreur(reponse.status, `Le service de vision a répondu avec une erreur (${reponse.status}).`);
  }

  const data = await reponse.json();
  const texteBrut = data.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text?.trim() || '';

  const jsonTexte = texteBrut.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let infos;
  try {
    infos = JSON.parse(jsonTexte);
  } catch {
    throw erreur(422, "L'IA n'a pas pu identifier le titre du livre sur cette photo.");
  }

  if (infos.erreur) {
    throw erreur(422, infos.erreur);
  }

  const titre = String(infos.titre || '').trim();
  const auteur = String(infos.auteur || '').trim();
  const langue = infos.langue === 'en' ? 'en' : 'fr';
  const type = infos.type === 'theatre' ? 'theatre' : 'roman';

  // Recherche automatique des versions libres et de la couverture officielle Apple
  let resultats = [];
  let metaApple = null;
  if (titre) {
    try {
      const res = await chercher({ titre, auteur, langue });
      resultats = res.resultats || [];
      metaApple = res.metaApple || null;
    } catch {
      resultats = [];
    }
  }

  return { titre, auteur, langue, type, resultats, metaApple };
}

// -----------------------------------------------------------------------------
// Génération de résumé de livre ou de page (IA Gemini + repli Apple Livres)
// -----------------------------------------------------------------------------
async function resumerLivre({ titre = '', auteur = '', mode = 'apercu', textePage = '' }) {
  const t = String(titre).trim().slice(0, 180);
  const a = String(auteur).trim().slice(0, 120);
  const extrait = String(textePage || '').trim().slice(0, 6000);

  if (!t && !extrait) {
    throw erreur(400, 'Titre ou texte manquant pour le résumé.');
  }

  const apiKey = process.env.LLM_API_KEY;
  if (apiKey && apiKey.trim()) {
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    let consigne;
    if (mode === 'page' && extrait) {
      consigne = `Tu es un assistant de lecture littéraire clair et pédagogue.
Voici une page tirée du livre « ${t || 'Livre'} »${a ? ` de ${a}` : ''}.
Résume clairement en français (en 4 à 6 phrases fluides, sans balises Markdown) ce qui se passe sur cette page, les personnages présents et le sens des passages difficiles :

${extrait}`;
    } else if (mode === 'complet') {
      consigne = `Tu es un spécialiste de la littérature.
Rédige en français un résumé complet et structuré du livre « ${t} »${a ? ` de ${a}` : ''} (environ 150 à 220 mots, sans balises Markdown, en 3 paragraphes séparés par une ligne vide) :
1. Le contexte et le point de départ de l'intrigue avec les personnages principaux.
2. Les grandes péripéties et le dénouement de l'œuvre.
3. Les thèmes majeurs et la portée littéraire du livre.`;
    } else {
      consigne = `Tu es un libraire passionné.
Rédige en français un résumé de présentation captivant et SANS SPOILER (sans révéler la fin) du livre « ${t} »${a ? ` de ${a}` : ''} (environ 100 à 140 mots, sans balises Markdown, en 2 paragraphes séparés par une ligne vide) :
1. L'histoire de départ et les personnages principaux.
2. L'ambiance du livre et pourquoi c'est un chef-d'œuvre incontournable.`;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const reponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: consigne }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 600,
          },
        }),
      });

      if (reponse.ok) {
        const data = await reponse.json();
        const resumeIA = data.candidates?.[0]?.content?.parts
          ?.filter((p) => typeof p.text === 'string' && !p.thought)
          ?.map((p) => p.text)
          ?.join('\n')
          ?.trim() || '';
        if (resumeIA) {
          return { resume: resumeIA, source: 'ia', mode };
        }
      }
    } catch { /* repli sur Apple Livres ci-dessous */ }
  }

  // Repli sur la description officielle Apple Livres si l'IA est indisponible
  if (t) {
    const meta = await chercherMetaApple({ titre: t, auteur: a });
    if (meta?.resume) {
      return { resume: meta.resume, source: 'apple', mode };
    }
  }

  throw erreur(503, 'Impossible de générer le résumé pour le moment.');
}
