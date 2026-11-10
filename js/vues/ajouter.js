// Vue « Ajouter » :
//  - #/ajouter      : formulaire du nouveau livre + détection couverture + import domaine public
//  - #/ajouter/ID   : ajout des pages (photo → OCR → correction → enregistrement)

import { etat } from '../etat.js';
import { esc, icones, toast, erreurHTML, messageErreur, libelleType, enregistrerMetaApple, ouvrirFeuilleResume } from '../ui.js';
import { supprimerCache } from '../cache.js';

// Sélection des grands classiques gratuits présents sur Apple Livres + Project Gutenberg (versions FR, EN et VO vérifiées)
const CLASSIQUES_APPLE = [
  {
    id: 17489,
    titre: 'Les Misérables — Tome I',
    auteur: 'Victor Hugo',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 17489, titre: 'Les Misérables — Tome I', langue: 'fr', nomLangue: 'Français' },
      en: { id: 135, titre: 'Les Misérables (English)', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication7/v4/c3/ea/2e/c3ea2e71-e8a6-7b2e-38b2-9133445afef2/coverArt.2311cd.jpg/600x600bb.jpg',
    resume: "En 1815, Jean Valjean est libéré après dix-neuf ans de bagne pour avoir volé un pain. Rejeté de tous, il croise la route de Mgr Myriel qui bouleverse son destin, tandis que le destin tragique de Fantine et de sa petite Cosette se noue sous l'œil implacable de l'inspecteur Javert.",
  },
  {
    id: 17989,
    titre: 'Le Comte de Monte-Cristo — Tome I',
    auteur: 'Alexandre Dumas',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 17989, titre: 'Le Comte de Monte-Cristo — Tome I', langue: 'fr', nomLangue: 'Français' },
      en: { id: 1184, titre: 'The Count of Monte Cristo', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication1/v4/6b/2e/71/6b2e7171-9764-0336-95f2-fd8d03be90ef/coverArt.c5ee7e.jpg/600x600bb.jpg',
    resume: "Jeune marin promis à un bel avenir et sur le point d'épouser Mercédès, Edmond Dantès est victime d'un complot jaloux et enfermé au château d'If. Sa rencontre secrète avec l'abbé Faria lui ouvre la voie de la liberté, du trésor de Monte-Cristo et d'une vengeance magistrale.",
  },
  {
    id: 6838,
    titre: "Le Dernier Jour d'un condamné",
    auteur: 'Victor Hugo',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 6838, titre: "Le Dernier Jour d'un condamné", langue: 'fr', nomLangue: 'Français' },
      en: { id: 65215, titre: 'The Last Day of a Condemned', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication114/v4/9c/30/f8/9c30f83e-c6ab-eb1f-253e-d704d7ff1346/PD_Le_dernier_jour_d_un_condamne-Adj.jpg/600x600bb.jpg',
    resume: "De sa cellule de Bicêtre jusqu'à l'échafaud de la place de Grève, un homme condamné à mort confie heure par heure ses pensées, ses angoisses, ses souvenirs d'enfance et la douleur déchirante de laisser derrière lui sa petite fille de trois ans. Un plaidoyer bouleversant contre la peine de mort.",
  },
  {
    id: 32854,
    titre: 'Arsène Lupin, gentleman-cambrioleur',
    auteur: 'Maurice Leblanc',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 32854, titre: 'Arsène Lupin, gentleman-cambrioleur', langue: 'fr', nomLangue: 'Français' },
      en: { id: 6133, titre: 'The Extraordinary Adventures of Arsène Lupin', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication124/v4/42/aa/46/42aa463c-b168-2211-89a1-3c8f71d15134/Lupincover_podklad_fr.jpg/600x600bb.jpg',
    resume: "Maître du déguisement, de l'ironie et du panache, Arsène Lupin dépouille les châteaux et les milliardaires avec une élégance infaillible. De son arrestation sur un transatlantique à son évasion de la Santé et son premier duel avec Herlock Sholmes, neuf aventures pleines d'esprit et de mystère.",
  },
  {
    id: 20973,
    titre: 'Le Tour du monde en 80 jours',
    auteur: 'Jules Verne',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 20973, titre: 'Le Tour du monde en 80 jours', langue: 'fr', nomLangue: 'Français' },
      en: { id: 103, titre: 'Around the World in Eighty Days', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication6/v4/27/06/b8/2706b858-79d6-a463-df8f-d3d95a2a6b99/PDFR001850.jpg/600x600bb.jpg',
    resume: "Le flegmatique gentleman londonien Phileas Fogg parie la moitié de sa fortune qu'il fera le tour de la Terre en quatre-vingts jours. Accompagné de son fidèle valet français Passepartout et poursuivi par l'inspecteur Fix, il se lance dans une course haletante à travers les continents.",
  },
  {
    id: 5097,
    titre: 'Vingt mille lieues sous les mers',
    auteur: 'Jules Verne',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 5097, titre: 'Vingt mille lieues sous les mers', langue: 'fr', nomLangue: 'Français' },
      en: { id: 164, titre: 'Twenty Thousand Leagues under the Sea', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication62/v4/58/50/23/5850238d-daec-7bd3-3293-83839c45e15c/coverArt.a7a47a.jpg/600x600bb.jpg',
    resume: "Partis traquer un mystérieux monstre marin, le professeur Aronnax, son domestique Conseil et le harponneur Ned Land sont recueillis à bord du Nautilus, le sous-marin prodige de l'énigmatique capitaine Nemo. Commence alors une odyssée inoubliable au cœur des océans.",
  },
  {
    id: 1256,
    titre: 'Cyrano de Bergerac',
    auteur: 'Edmond Rostand',
    type: 'theatre',
    langue: 'fr',
    versions: {
      fr: { id: 1256, titre: 'Cyrano de Bergerac', langue: 'fr', nomLangue: 'Français' },
      en: { id: 1254, titre: 'Cyrano de Bergerac (English)', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication1/v4/18/9e/7a/189e7a40-e609-8f03-1978-c017a94a3813/coverArt.8b64e8.jpg/600x600bb.jpg',
    resume: "Bretteur intrépide et poète étincelant affublé d'un nez démesuré, Cyrano aime en secret sa cousine Roxane. Mais Roxane aime le beau Christian, qui manque d'esprit : par amour, Cyrano prête sa voix et ses lettres à son rival dans un chef-d'œuvre de panache et d'émotion.",
  },
  {
    id: 6318,
    titre: "L'Avare",
    auteur: 'Molière',
    type: 'theatre',
    langue: 'fr',
    versions: {
      fr: { id: 6318, titre: "L'Avare", langue: 'fr', nomLangue: 'Français' },
      en: { id: 6923, titre: 'The Miser', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication4/v4/19/92/ff/1992fff4-b290-b2f9-5807-64d868c69332/9782806231994.jpg/600x600bb.jpg',
    resume: "Obsédé par sa cassette d'or enterrée dans son jardin, le vieil Harpagon tyrannise sa maison et prétend marier ses enfants Cléante et Élise contre leur gré tout en convoitant la jeune Mariane. Une comédie incisive et irrésistible sur l'avarice et les passions humaines.",
  },
  {
    id: 10775,
    titre: 'Le Horla',
    auteur: 'Guy de Maupassant',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 10775, titre: 'Le Horla', langue: 'fr', nomLangue: 'Français' },
      en: { id: 3080, titre: 'The Horla and Other Stories', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication114/v4/60/83/4e/60834ea6-55ee-476c-4fdf-d8c9e9513e69/PD_Le_horla-Adj.jpg/600x600bb.jpg',
    resume: "Sous la forme d'un journal intime, le narrateur raconte comment une présence invisible et troublante — le Horla — s'empare peu à peu de ses nuits, boit l'eau de sa carafe et gouverne sa volonté. Sombre-t-il dans la folie ou un être surnaturel le hante-t-il réellement ?",
  },
  {
    id: 14155,
    titre: 'Madame Bovary',
    auteur: 'Gustave Flaubert',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 14155, titre: 'Madame Bovary', langue: 'fr', nomLangue: 'Français' },
      en: { id: 2413, titre: 'Madame Bovary (English)', langue: 'en', nomLangue: 'Anglais' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication211/v4/fd/4f/30/fd4f300a-e01a-84ad-034e-0ecf578e4853/303e0c05-2e3a-4cc2-aecc-cdbea53f8a07_cover_image.jpg/600x600bb.jpg',
    resume: "Nourrie de lectures romantiques, Emma épouse Charles Bovary, modeste médecin de province, mais étouffe rapidement dans la monotonie conjugale. Rêvant de luxe et de passions ardentes, elle cherche l'évasion dans l'adultère et les dépenses jusqu'au vertige.",
  },
  {
    id: 16066,
    titre: 'Don Quichotte — Tome I',
    auteur: 'Miguel de Cervantes',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 16066, titre: 'Don Quichotte — Tome I', langue: 'fr', nomLangue: 'Français' },
      en: { id: 5921, titre: 'Don Quixote — Vol. I', langue: 'en', nomLangue: 'Anglais' },
      vo: { id: 2000, titre: 'Don Quijote (VO Espagnol)', langue: 'es', nomLangue: 'Espagnol' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication221/v4/59/98/53/59985377-76e3-8e4d-d4f9-1181e76ac663/9782080153784.jpg/600x600bb.jpg',
    resume: "Fasciné par les romans de chevalerie, l'hidalgo Alonso Quichano se baptise Don Quichotte de la Manche et part redresser les torts sur son maigre cheval Rossinante, accompagné du fidèle Sancho Panza, prenant les moulins à vent pour des géants.",
  },
  {
    id: 22768,
    titre: "La Divine Comédie : L'Enfer",
    auteur: 'Dante Alighieri',
    type: 'roman',
    langue: 'fr',
    versions: {
      fr: { id: 22768, titre: "La Divine Comédie : L'Enfer", langue: 'fr', nomLangue: 'Français' },
      en: { id: 41537, titre: 'The Divine Comedy: The Inferno', langue: 'en', nomLangue: 'Anglais' },
      vo: { id: 1009, titre: 'La Divina Commedia: Inferno (VO Italien)', langue: 'it', nomLangue: 'Italien' },
    },
    couverture: 'https://is1-ssl.mzstatic.com/image/thumb/Publication211/v4/00/6e/ea/006eea7e-f0ef-5151-ebd4-04b730694b4d/cover.jpg/600x600bb.jpg',
    resume: "Égaré dans une forêt obscure au milieu du chemin de sa vie, le poète Dante est guidé par l'ombre de Virgile à travers les neuf cercles concentriques de l'Enfer. Un voyage vertigineux et fondateur de la littérature européenne.",
  },
];

export async function afficher(racine, { params }) {
  if (params[0]) return afficherPages(racine, params[0]);
  afficherFormulaire(racine);
}

// ---------------------------------------------------------------------------
// 1. Formulaire « nouveau livre » avec détection de couverture et import libre
// ---------------------------------------------------------------------------
function afficherFormulaire(racine) {
  racine.innerHTML = `
    <div class="etapes" aria-hidden="true"><span class="actif"></span><span></span></div>
    <p class="surtitre">Étape 1 sur 2</p>
    <h1 class="titre-page">Nouveau livre</h1>
    <p class="sous-titre">Renseigne le livre ou prends sa couverture en photo.</p>

    <!-- Zone de détection automatique par photo de couverture -->
    <div class="carte-couverture" id="zone-couverture">
      <p class="titre-3" style="font-size:1.15rem;margin-bottom:4px">📸 Couverture ou page de garde</p>
      <p class="aide" style="margin-bottom:12px">Prends la couverture en photo : l'IA identifie le livre et vérifie si la version complète est disponible gratuitement.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <input type="file" id="couv-camera" class="visuellement-cache" accept="image/*" capture="environment">
        <label for="couv-camera" class="btn btn-secondaire" style="font-size:.92rem;min-height:42px;padding:8px 16px;">
          ${icones.photo} Appareil photo
        </label>
        <input type="file" id="couv-galerie" class="visuellement-cache" accept="image/*">
        <label for="couv-galerie" class="btn btn-discret" style="font-size:.92rem;min-height:42px;padding:8px 16px;">
          ${icones.galerie} Galerie
        </label>
      </div>
      <div id="couv-statut" style="display:none;margin-top:12px;font-size:.92rem;"></div>
    </div>

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

      <!-- Zone de résultat de la bibliothèque libre -->
      <div id="zone-libre"></div>

      <button class="btn btn-primaire btn-bloc" type="submit">Continuer ${icones.suivant}</button>
    </form>

    <!-- Catalogue des grands classiques gratuits d'Apple Livres + Gutenberg -->
    <section class="carte section-classiques-apple" aria-labelledby="titre-classiques-apple">
      <p class="surtitre">Sélection Apple Livres & Domaine Public</p>
      <h2 class="titre-3" id="titre-classiques-apple" style="margin-bottom:4px">📚 Grands classiques gratuits en 1 clic</h2>
      <p class="aide" style="color:var(--texte-2);margin-bottom:8px">
        Ces classiques gratuits sur Apple Livres ont plus de 70 ans : clique sur une couverture pour ajouter directement tout le livre dans ta bibliothèque.
      </p>
      <div class="grille-classiques-apple" id="grille-classiques">
        ${CLASSIQUES_APPLE.map((c, idx) => {
          const aVo = Boolean(c.versions?.vo?.id && c.versions.vo.langue !== 'fr' && c.versions.vo.langue !== 'en');
          return `
            <div class="carte-classique-apple">
              <img class="couv-mini" src="${esc(c.couverture)}" alt="${esc(c.titre)}" loading="lazy" data-classique-resume="${idx}" style="cursor:pointer" title="Voir le résumé et les versions">
              <span class="titre-mini">${esc(c.titre)}</span>
              <span class="auteur-mini">${esc(c.auteur)}</span>
              <div class="actions-classique-mini">
                <button type="button" class="btn-mini-resume" data-classique-resume="${idx}" aria-label="Voir le résumé de ${esc(c.titre)}">📖 Résumé</button>
                <div class="rangee-versions-mini" role="group" aria-label="Choisir la version de ${esc(c.titre)}">
                  ${c.versions?.fr ? `<button type="button" class="btn-ver-mini" data-classique-ver="${idx}:fr" title="Importer la version française (${esc(c.versions.fr.titre)})">🇫🇷 FR</button>` : ''}
                  ${c.versions?.en ? `<button type="button" class="btn-ver-mini" data-classique-ver="${idx}:en" title="Importer la version anglaise (${esc(c.versions.en.titre)})">🇬🇧 EN</button>` : ''}
                  ${aVo ? `<button type="button" class="btn-ver-mini vo" data-classique-ver="${idx}:vo" title="Importer la VO en ${esc(c.versions.vo.nomLangue)} (${esc(c.versions.vo.titre)})">🌍 VO</button>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>

    <p class="aide" style="margin-top:16px;text-align:center;color:var(--texte-2);font-size:.85rem">
      N'ajoute que des livres que tu possèdes, pour ton usage personnel.
    </p>`;

  const form = racine.querySelector('#form-livre');
  const zoneMessage = racine.querySelector('#form-message');
  const zoneLibre = racine.querySelector('#zone-libre');
  const couvStatut = racine.querySelector('#couv-statut');

  let delaiRecherche = null;
  let ocrModule = null;

  function importerVersionClassique(c, cleVer = 'fr') {
    if (!c) return;
    const ver = c.versions?.[cleVer] || c.versions?.fr || { id: c.id, titre: c.titre, langue: 'fr', nomLangue: 'Français' };
    form.titre.value = ver.titre || c.titre;
    form.auteur.value = c.auteur;
    form.querySelector(c.type === 'theatre' ? '#type-theatre' : '#type-roman').checked = true;
    form.querySelector(ver.langue === 'en' ? '#langue-en' : '#langue-fr').checked = true;
    enregistrerMetaApple(ver.titre || c.titre, c.auteur, {
      couverture: c.couverture,
      resume: c.resume || '',
      versions: c.versions || null,
      langueEdition: ver.langue || 'fr',
      nomLangueEdition: ver.nomLangue || 'Français',
    });
    afficherResultatLibre([{
      id: ver.id,
      titre: ver.titre || c.titre,
      auteur: c.auteur,
      langue: ver.langue || 'fr',
      nomLangue: ver.nomLangue || 'Français',
      libre: true,
      couverture: c.couverture,
      resume: c.resume || '',
    }], { couverture: c.couverture, resume: c.resume || '' }, c.versions || null);
    zoneLibre.scrollIntoView({ behavior: 'smooth', block: 'center' });
    lancerImportComplet(ver.id, {
      titre: ver.titre || c.titre,
      couverture: c.couverture,
      resume: c.resume || '',
      versions: c.versions || null,
      langue: ver.langue || 'fr',
      nomLangue: ver.nomLangue || 'Français',
    });
  }

  // --- Clic sur un bouton de version (🇫🇷 FR, 🇬🇧 EN ou 🌍 VO) d'un classique ---
  racine.querySelectorAll('[data-classique-ver]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [idxStr, cleVer] = (btn.getAttribute('data-classique-ver') || '').split(':');
      const c = CLASSIQUES_APPLE[Number(idxStr)];
      importerVersionClassique(c, cleVer || 'fr');
    });
  });

  // --- Clic sur « 📖 Résumé » ou sur la couverture d'un classique gratuit ---
  racine.querySelectorAll('[data-classique-resume]').forEach((el) => {
    el.addEventListener('click', () => {
      const c = CLASSIQUES_APPLE[Number(el.getAttribute('data-classique-resume'))];
      if (!c) return;
      ouvrirFeuilleResume({
        titre: c.titre,
        auteur: c.auteur,
        couverture: c.couverture,
        resumeInitial: c.resume || '',
        versions: c.versions || null,
        token: etat.session?.access_token,
        surImporter: () => importerVersionClassique(c, 'fr'),
        surImporterVersion: (_ver, cle) => importerVersionClassique(c, cle),
      });
    });
  });

  // --- Gestion de la photo de couverture / page de garde ---
  async function traiterCouverture(fichier) {
    if (!fichier || (!fichier.type.startsWith('image/') && fichier.type !== '')) {
      toast('Sélectionne une image valide.');
      return;
    }
    couvStatut.style.display = 'block';
    couvStatut.innerHTML = '<span class="roue petite" aria-hidden="true"></span> Analyse de la couverture par l\'IA…';

    try {
      ocrModule = ocrModule || await import('../ocr.js');
      const base64 = await ocrModule.preparerPourGemini(fichier);

      const token = etat.session?.access_token;
      const r = await fetch('/api/livre-libre', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'analyser-couverture', image: base64 }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.erreur || 'Impossible d\'analyser la couverture.');
      }

      const donnees = await r.json();
      couvStatut.innerHTML = '<span style="color:var(--succes)">✓ Titre et auteur identifiés !</span>';

      if (donnees.titre) form.titre.value = donnees.titre;
      if (donnees.auteur) form.auteur.value = donnees.auteur;
      if (donnees.type === 'theatre') {
        form.querySelector('#type-theatre').checked = true;
      } else {
        form.querySelector('#type-roman').checked = true;
      }
      if (donnees.langue === 'en') {
        form.querySelector('#langue-en').checked = true;
      } else {
        form.querySelector('#langue-fr').checked = true;
      }

      afficherResultatLibre(donnees.resultats || [], donnees.metaApple || null, donnees.versions || null);
    } catch (e) {
      couvStatut.innerHTML = `<span style="color:var(--danger)">${esc(e.message || 'Échec de l\'analyse')}</span>`;
    }
  }

  racine.querySelector('#couv-camera').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) traiterCouverture(f);
  });
  racine.querySelector('#couv-galerie').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) traiterCouverture(f);
  });

  // --- Recherche automatique lors de la saisie ---
  function planifierRecherche() {
    clearTimeout(delaiRecherche);
    const titre = form.titre.value.trim();
    const auteur = form.auteur.value.trim();
    if (titre.length < 3) {
      zoneLibre.innerHTML = '';
      return;
    }
    zoneLibre.innerHTML = '<p class="aide" style="margin:10px 0;"><span class="roue petite" aria-hidden="true"></span> Recherche des versions (FR, EN & VO) sur Apple Livres & bibliothèque libre…</p>';
    delaiRecherche = setTimeout(async () => {
      try {
        const token = etat.session?.access_token;
        const r = await fetch('/api/livre-libre', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'chercher',
            titre,
            auteur,
            langue: form.langue.value,
          }),
        });
        if (!r.ok) {
          zoneLibre.innerHTML = '';
          return;
        }
        const { resultats, metaApple, versions } = await r.json();
        afficherResultatLibre(resultats || [], metaApple || null, versions || null);
      } catch {
        zoneLibre.innerHTML = '';
      }
    }, 600);
  }

  form.titre.addEventListener('input', planifierRecherche);
  form.auteur.addEventListener('input', planifierRecherche);
  form.querySelectorAll('input[name="langue"]').forEach((i) => i.addEventListener('change', planifierRecherche));

  // --- Affichage du résultat (Couverture Apple + Statut Domaine Public + Versions FR / EN / VO) ---
  function afficherResultatLibre(resultats, metaApple = null, versionsServeur = null) {
    const titreSaisi = form.titre.value.trim();
    const auteurSaisi = form.auteur.value.trim();
    if ((metaApple || versionsServeur) && titreSaisi) {
      enregistrerMetaApple(titreSaisi, auteurSaisi, { ...(metaApple || {}), versions: versionsServeur });
    }

    const couvUrl = resultats?.[0]?.couverture || metaApple?.couverture || '';
    const resumeTexte = resultats?.[0]?.resume || metaApple?.resume || '';
    const blocApercuApple = couvUrl
      ? `<div class="apercu-apple">
           <img class="apercu-apple-img" src="${esc(couvUrl)}" alt="" onerror="this.remove()">
           <div class="apercu-apple-corps">
             <strong style="font-size:.96rem;color:var(--texte);display:block">${esc(metaApple?.titreOfficiel || resultats?.[0]?.titre || titreSaisi)}</strong>
             <span style="font-size:.84rem;color:var(--texte-2)">${esc(metaApple?.auteurOfficiel || resultats?.[0]?.auteur || auteurSaisi)}</span>
             ${resumeTexte ? `<p class="apercu-apple-resume">${esc(resumeTexte)}</p>` : ''}
           </div>
         </div>`
      : '';

    if (!resultats || !resultats.length) {
      zoneLibre.innerHTML = `
        <div class="carte-libre-refuse">
          ${blocApercuApple}
          <p style="margin:0 0 4px;font-weight:600;color:var(--texte);">🔒 Livre sous droits d'auteur (non gratuit)</p>
          <p style="margin:0;">${couvUrl ? "La couverture officielle Apple Livres a bien été récupérée !" : "Seuls les ouvrages du domaine public peuvent être importés en 1 clic."} Clique sur <strong>Continuer</strong> ci-dessous pour numériser tes propres pages papier avec l'appareil photo.</p>
        </div>`;
      return;
    }

    const libre = resultats.find((r) => r.libre) || resultats[0];

    if (libre.libre) {
      // Construire les versions disponibles : FR, EN et VO (uniquement si la VO n'est ni française ni anglaise)
      const vers = versionsServeur || {
        fr: resultats.find((r) => r.libre && r.langue === 'fr') || (libre.langue === 'fr' ? libre : null),
        en: resultats.find((r) => r.libre && r.langue === 'en') || (libre.langue === 'en' ? libre : null),
        vo: resultats.find((r) => r.libre && r.langue && r.langue !== 'fr' && r.langue !== 'en') || null,
      };
      const aVoSeparee = Boolean(vers?.vo?.id && vers.vo.langue && vers.vo.langue !== 'fr' && vers.vo.langue !== 'en');

      zoneLibre.innerHTML = `
        <div class="carte-libre-trouve">
          <span class="badge-domaine-public">✨ Gratuit sur Apple Livres & Domaine Public</span>
          ${blocApercuApple || `
            <h3 style="font-size:1.1rem;margin:4px 0 2px;">${esc(libre.titre)}</h3>
            <p style="margin:0 0 8px;color:var(--texte-2);font-size:.88rem;">${esc(libre.auteur)}${libre.annees ? ' (' + esc(libre.annees) + ')' : ''}</p>
          `}
          <p style="margin:0 0 10px;font-size:.9rem;">
            Ce classique fait partie du <strong>domaine public</strong>. Choisis la version gratuite à importer en 1 clic :
          </p>

          <div class="grille-versions-libres" id="grille-versions-trouvees">
            ${vers?.fr?.id ? `
              <button type="button" class="btn-version-libre" data-import-ver="fr">
                <span class="drapeau-ver">🇫🇷</span>
                <span><strong>Version française</strong><small>${esc(vers.fr.titre || libre.titre)}</small></span>
              </button>` : ''}
            ${vers?.en?.id ? `
              <button type="button" class="btn-version-libre" data-import-ver="en">
                <span class="drapeau-ver">🇬🇧</span>
                <span><strong>Version anglaise</strong><small>${esc(vers.en.titre || libre.titre)}</small></span>
              </button>` : ''}
            ${aVoSeparee ? `
              <button type="button" class="btn-version-libre vo" data-import-ver="vo">
                <span class="drapeau-ver">🌍</span>
                <span><strong>Version VO (${esc(vers.vo.nomLangue || vers.vo.langue.toUpperCase())})</strong><small>${esc(vers.vo.titre || libre.titre)}</small></span>
              </button>` : ''}
            ${(!vers?.fr?.id && !vers?.en?.id && !aVoSeparee) ? `
              <button type="button" class="btn btn-succes btn-bloc" id="btn-import-libre">
                📥 Importer tout le livre en 1 clic
              </button>` : ''}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button type="button" class="btn btn-secondaire btn-bloc" id="btn-resume-libre">
              📖 Voir le résumé du livre
            </button>
          </div>
          <p class="aide" style="margin-top:8px;text-align:center;font-size:.8rem;">Ou continue ci-dessous pour numériser tes propres pages manuellement.</p>
        </div>`;

      const declencherVersion = (cle) => {
        const v = vers?.[cle] || libre;
        if (!v?.id) return;
        lancerImportComplet(v.id, {
          titre: v.titre || libre.titre || titreSaisi,
          couverture: libre.couverture || metaApple?.couverture,
          resume: libre.resume || metaApple?.resume,
          versions: vers,
          langue: v.langue || 'fr',
          nomLangue: v.nomLangue || (v.langue === 'en' ? 'Anglais' : 'Français'),
        }, zoneLibre.querySelector(`[data-import-ver="${cle}"]`));
      };

      zoneLibre.querySelectorAll('[data-import-ver]').forEach((btn) => {
        btn.addEventListener('click', () => declencherVersion(btn.getAttribute('data-import-ver')));
      });

      zoneLibre.querySelector('#btn-import-libre')?.addEventListener('click', () => lancerImportComplet(libre.id, {
        titre: libre.titre || titreSaisi,
        couverture: libre.couverture || metaApple?.couverture,
        resume: libre.resume || metaApple?.resume,
        versions: vers,
        langue: libre.langue || form.langue.value,
        nomLangue: libre.nomLangue || '',
      }));

      zoneLibre.querySelector('#btn-resume-libre').addEventListener('click', () => {
        ouvrirFeuilleResume({
          titre: libre.titre || titreSaisi,
          auteur: libre.auteur || auteurSaisi,
          couverture: libre.couverture || metaApple?.couverture || '',
          resumeInitial: libre.resume || metaApple?.resume || '',
          versions: vers,
          token: etat.session?.access_token,
          surImporter: () => lancerImportComplet(libre.id, {
            couverture: libre.couverture || metaApple?.couverture,
            resume: libre.resume || metaApple?.resume,
            versions: vers,
          }),
          surImporterVersion: (_v, cle) => declencherVersion(cle),
        });
      });
    } else {
      zoneLibre.innerHTML = `
        <div class="carte-libre-refuse">
          ${blocApercuApple}
          <p style="margin:0 0 4px;font-weight:600;color:var(--texte);">🔒 Livre protégé par les droits d'auteur</p>
          <p style="margin:0 0 6px;">${esc(libre.raison || "Ce livre est encore sous droits d'auteur.")}</p>
          <p style="margin:0;font-size:.82rem;">La couverture officielle Apple Livres est prête : clique sur <strong>Continuer</strong> ci-dessous pour photographier tes pages personnelles.</p>
        </div>`;
    }
  }

  // --- Import intégral en 1 clic ---
  async function lancerImportComplet(idGutenberg, meta = null, boutonClique = null) {
    const bouton = boutonClique || zoneLibre.querySelector('#btn-import-libre');
    const tousBoutons = [...zoneLibre.querySelectorAll('[data-import-ver], #btn-import-libre')];
    tousBoutons.forEach((b) => { b.disabled = true; });
    if (bouton) {
      bouton.innerHTML = '<span class="roue petite" aria-hidden="true"></span> Récupération et pagination du texte…';
    }

    try {
      const token = etat.session?.access_token;
      const r = await fetch('/api/livre-libre', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'importer',
          id: idGutenberg,
          type: form.type.value,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.erreur || "Impossible d'importer le texte de ce livre.");
      }

      const { titre, langue: langueGutenberg, nomLangue: nomLangueGutenberg, pages } = await r.json();
      if (bouton) bouton.innerHTML = `<span class="roue petite" aria-hidden="true"></span> Enregistrement (${pages.length} pages)…`;

      const codeLang = meta?.langue || langueGutenberg || form.langue.value || 'fr';
      const nomLang = meta?.nomLangue || nomLangueGutenberg || (codeLang === 'en' ? 'Anglais' : 'Français');
      let titreFinal = (meta?.titre || form.titre.value.trim() || titre).slice(0, 180);
      if (codeLang !== 'fr' && codeLang !== 'en' && !/VO/i.test(titreFinal)) {
        titreFinal = `${titreFinal} (VO · ${nomLang})`.slice(0, 200);
      }
      const auteurFinal = form.auteur.value.trim();

      // La colonne Supabase books.langue accepte 'fr' ou 'en'
      const langueBdd = codeLang === 'en' ? 'en' : 'fr';

      enregistrerMetaApple(titreFinal, auteurFinal, {
        ...(meta || {}),
        langueEdition: codeLang,
        nomLangueEdition: nomLang,
      });

      // 1. Créer le livre dans Supabase
      const { data: livreCree, error: errLivre } = await etat.supabase
        .from('books')
        .insert({
          titre: titreFinal,
          auteur: auteurFinal,
          type: form.type.value,
          langue: langueBdd,
          user_id: etat.user.id,
        })
        .select('id')
        .single();

      if (errLivre) throw errLivre;

      // 2. Insérer toutes les pages par lots de 50
      const tailleLot = 50;
      for (let i = 0; i < pages.length; i += tailleLot) {
        const lot = pages.slice(i, i + tailleLot).map((texte, idx) => ({
          book_id: livreCree.id,
          numero: i + idx + 1,
          texte,
        }));
        const { error: errPages } = await etat.supabase.from('pages').insert(lot);
        if (errPages) throw errPages;
      }

      supprimerCache(`bibliotheque:${etat.user.id}`);
      toast(`Livre intégral importé avec succès (${pages.length} pages) !`);
      location.hash = `#/lecteur/${livreCree.id}`;
    } catch (e) {
      tousBoutons.forEach((b) => { b.disabled = false; });
      if (bouton) {
        bouton.disabled = false;
        bouton.innerHTML = '📥 Réessayer l\'import';
      }
      zoneMessage.innerHTML = `<p class="message message-erreur" role="alert">${esc(messageErreur(e))}</p>`;
    }
  }

  // --- Soumission manuelle normale vers l'étape 2 (appareil photo) ---
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
      ${numero === 1 && pagesAjoutees === 0 ? `
        <div id="zone-import-libre-rapide" style="margin-top:18px;border-top:1px solid var(--bordure);padding-top:16px;">
          <button type="button" class="btn btn-discret btn-bloc" data-action="chercher-libre">
            ✨ Vérifier si ce livre existe en version complète gratuite
          </button>
          <div id="retour-libre-rapide" style="margin-top:10px;"></div>
        </div>
      ` : ''}
      ${pagesAjoutees || numero > 1 ? `<div class="actions colonne"><a class="btn btn-secondaire" href="#/lecteur/${livre.id}">Terminer</a></div>` : ''}`;

    zone.querySelectorAll('input[type="file"]').forEach((input) => {
      input.addEventListener('change', () => {
        const fichier = input.files?.[0];
        input.value = '';
        if (fichier) lancerOCR(fichier);
      });
    });
    zone.querySelector('[data-action="manuel"]').addEventListener('click', () => etapeCorrection('', null));

    const btnChercherLibre = zone.querySelector('[data-action="chercher-libre"]');
    const zoneRetourRapide = zone.querySelector('#retour-libre-rapide');
    if (btnChercherLibre && zoneRetourRapide) {
      btnChercherLibre.addEventListener('click', async () => {
        btnChercherLibre.disabled = true;
        btnChercherLibre.innerHTML = '<span class="roue petite" aria-hidden="true"></span> Recherche en cours…';
        try {
          const token = etat.session?.access_token;
          const r = await fetch('/api/livre-libre', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              action: 'chercher',
              titre: livre.titre,
              auteur: livre.auteur,
              langue: livre.langue,
            }),
          });
          const { resultats = [], versions = null } = await r.json();
          const match = resultats.find((x) => x.libre);
          if (match) {
            const vers = versions || {
              fr: resultats.find((x) => x.libre && x.langue === 'fr') || (match.langue === 'fr' ? match : null),
              en: resultats.find((x) => x.libre && x.langue === 'en') || (match.langue === 'en' ? match : null),
              vo: resultats.find((x) => x.libre && x.langue && x.langue !== 'fr' && x.langue !== 'en') || null,
            };
            const aVoSeparee = Boolean(vers?.vo?.id && vers.vo.langue && vers.vo.langue !== 'fr' && vers.vo.langue !== 'en');

            zoneRetourRapide.innerHTML = `
              <div class="carte-libre-trouve" style="margin:0;">
                <span class="badge-domaine-public">✨ Version complète trouvée</span>
                <p style="margin:4px 0 10px;font-size:.9rem;">
                  <strong>${esc(match.titre)}</strong> (${esc(match.auteur)}) est dans le domaine public ! Choisis la version à importer :
                </p>
                <div class="grille-versions-libres">
                  ${vers?.fr?.id ? `
                    <button type="button" class="btn-version-libre" data-remplir-id="${vers.fr.id}" data-remplir-lang="fr">
                      <span class="drapeau-ver">🇫🇷</span>
                      <span><strong>Version française</strong><small>${esc(vers.fr.titre || match.titre)}</small></span>
                    </button>` : ''}
                  ${vers?.en?.id ? `
                    <button type="button" class="btn-version-libre" data-remplir-id="${vers.en.id}" data-remplir-lang="en">
                      <span class="drapeau-ver">🇬🇧</span>
                      <span><strong>Version anglaise</strong><small>${esc(vers.en.titre || match.titre)}</small></span>
                    </button>` : ''}
                  ${aVoSeparee ? `
                    <button type="button" class="btn-version-libre vo" data-remplir-id="${vers.vo.id}" data-remplir-lang="fr">
                      <span class="drapeau-ver">🌍</span>
                      <span><strong>Version VO (${esc(vers.vo.nomLangue || vers.vo.langue.toUpperCase())})</strong><small>${esc(vers.vo.titre || match.titre)}</small></span>
                    </button>` : ''}
                  ${(!vers?.fr?.id && !vers?.en?.id && !aVoSeparee) ? `
                    <button type="button" class="btn btn-succes btn-bloc" data-remplir-id="${match.id}" data-remplir-lang="${match.langue === 'en' ? 'en' : 'fr'}">
                      📥 Importer toutes les pages maintenant
                    </button>` : ''}
                </div>
              </div>`;
            zoneRetourRapide.querySelectorAll('[data-remplir-id]').forEach((btnRemp) => {
              btnRemp.addEventListener('click', async (e) => {
                const b = e.currentTarget;
                const idImport = Number(b.getAttribute('data-remplir-id'));
                const langImport = b.getAttribute('data-remplir-lang') === 'en' ? 'en' : 'fr';
                b.disabled = true;
                b.innerHTML = '<span class="roue petite" aria-hidden="true"></span> Récupération et pagination…';
                try {
                  const rImp = await fetch('/api/livre-libre', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ action: 'importer', id: idImport, type: livre.type }),
                  });
                  const { pages = [] } = await rImp.json();
                  b.innerHTML = `<span class="roue petite" aria-hidden="true"></span> Enregistrement (${pages.length} pages)…`;
                  if (langImport !== livre.langue) {
                    await etat.supabase.from('books').update({ langue: langImport }).eq('id', livre.id);
                  }
                  const tailleLot = 50;
                  for (let i = 0; i < pages.length; i += tailleLot) {
                    const lot = pages.slice(i, i + tailleLot).map((texte, idx) => ({
                      book_id: livre.id,
                      numero: i + idx + 1,
                      texte,
                    }));
                    await etat.supabase.from('pages').insert(lot);
                  }
                  supprimerCache(`bibliotheque:${etat.user.id}`);
                  supprimerCache(`livre:${livre.id}`);
                  toast(`Livre complet importé (${pages.length} pages) !`);
                  location.hash = `#/lecteur/${livre.id}`;
                } catch (err) {
                  b.disabled = false;
                  b.innerHTML = '📥 Réessayer';
                  toast(messageErreur(err));
                }
              });
            });
          } else {
            zoneRetourRapide.innerHTML = `
              <div class="carte-libre-refuse" style="margin:0;">
                🔒 Ce livre n'est pas disponible dans le domaine public (ou est encore protégé par le droit d'auteur). Continue avec l'appareil photo ci-dessus !
              </div>`;
            btnChercherLibre.style.display = 'none';
          }
        } catch {
          btnChercherLibre.disabled = false;
          btnChercherLibre.innerHTML = '✨ Vérifier si ce livre existe en version complète gratuite';
          zoneRetourRapide.innerHTML = '<p class="message message-erreur" style="margin:0;font-size:.85rem;">Impossible de joindre la bibliothèque libre.</p>';
        }
      });
    }
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
      messageAvertissement += `<p class="message message-avertissement" style="font-size:0.88rem">
        <strong>Lecture locale, la qualité peut être moindre.</strong><br>
        La lecture par IA n'a pas fonctionné : ${esc(details.raisonSecours || 'raison inconnue')}</p>`;
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
