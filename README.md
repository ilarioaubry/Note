# Flow & Rimes Matrix — V1

IDE local (100 % navigateur, zéro dépendance, zéro build) pour écrire du rap français :
compte de syllabes **parlées**, assonances / rimes / multis en temps réel, détecteur de
répétitions, Radar à Tics et lecteur d'instru avec boucle A/B.

## Lancer

Les modules ES6 exigent un serveur HTTP local (le protocole `file://` bloque les imports) :

```bash
npm start              # = python3 -m http.server 8080  → http://localhost:8080
# ou : npx serve .
npm test               # tests du moteur phonétique (Node ≥ 18, aucune install)
```

## Architecture

```
index.html                 Squelette 3 colonnes + barre audio
css/styles.css             Thème studio sombre, couleurs des classes vocaliques (variables CSS)
js/
├── main.js                État de l'app + câblage des modules
├── engine/                ← LOGIQUE PURE, sans DOM, testable dans Node
│   ├── phonetics.js       API du moteur : analyzeWord, countSyllables, vowelSignature
│   ├── rules.js           Table de règles G2P (regex ordonnées) — à enrichir
│   ├── exceptions.js      Listes d'exceptions (-ent prononcé, -er en [ɛʁ], -t final…)
│   ├── lexicon.js         Dictionnaire (argot, anglicismes) + loadLexique() pour Lexique3
│   ├── syllabify.js       Découpe le mot écrit en syllabes (surlignage par syllabe)
│   ├── consonance.js      Allitérations / consonances (sons consonnes qui reviennent)
│   ├── themes.js          Thèmes, humeur, mots-clés (lexiques, sans IA)
│   ├── figures.js         Figures de style repérées par règles
│   ├── ideas.js           Banque d'idées : découpage de note, « ça sonne avec », idée dite ou non
│   ├── project.js         Vue projet : thèmes abordés, idées pas encore dites
│   ├── numbers.js         16 → « seize »
│   ├── stopwords.js       Mots outils
│   ├── analyzer.js        Texte → lignes → mots ; rimes, multis, régularité, grille 4/4
│   ├── repetition.js      Répétitions par section de 16 mesures + Radar à Tics
│   └── rhymeDictionary.js Boîte à rimes (index phonétique) + synonymes (branchement prévu)
├── ai/                    ← IA (Claude, API Anthropic), appelée depuis le navigateur avec ta clé
│   ├── client.js          Clé, modèle, appel avec réponse JSON garantie par schéma, coût estimé
│   ├── prompts.js         Rôle, contexte (banque d'idées, profil), schémas, normalisation — pur, testé
│   └── features.js        Analyse, Souffle-moi, profil, classement des idées, synthèse de projet
├── app/assistant.js       Orchestre l'IA : quand analyser, ce qu'on garde, vérification locale
├── ui/
│   ├── editor.js          Textarea + calque synchronisé (surlignage, badges, grille)
│   ├── sidebar.js         Projets + Radar à Tics
│   ├── inspector.js       Signature vocalique, répétitions locales, boîte à rimes
│   ├── analysis.js        Analyse → Texte : lecture par l'IA + graphique de rythme
│   ├── aisettings.js      Réglages de l'IA (clé, modèle, analyse automatique, dépense)
│   ├── suggest.js         Feuille « Souffle-moi »
│   ├── tabs.js            Sous-onglets
│   ├── understanding.js   Prononciation perso, « ça sonne avec », repérage local (sans IA)
│   ├── ideas.js           Onglet Idées (banque d'idées)
│   ├── overview.js        Panneau Projet + « Ton vocabulaire »
│   └── player.js          Audio local, forme d'onde, A/B, 4/8 mesures, tap tempo, métronome
├── store/storage.js       localStorage (projets, réglages)
└── utils/dom.js           debounce, rafThrottle, escape…
tests/phonetics.test.js    Tests node:test
data/lexique.json          Lexique 3 converti ({mot: phonétique}, trié par fréquence)
tools/build_lexique.py     Régénère data/lexique.json depuis Lexique383.txt
sw.js                      Service worker : fonctionnement hors ligne
vendor/anthropic-sdk.js    SDK officiel @anthropic-ai/sdk 1.8.0, empaqueté (voir vendor/README.md)
```

## Le moteur phonétique

**Pipeline pour un mot** : normalisation → découpe aux apostrophes/tirets (`j'suis` = `j'` + `suis`)
→ dictionnaire, sinon règles G2P → résolution des e muets → (option) élision des e caducs internes.

**Notation** : l'alphabet de **Lexique 3** (1 caractère = 1 phonème) : `a i e E o O u y 2 9 ° @ 5 1 §`,
semi-voyelles `j w 8`, consonnes `p b t d k g f v s z S Z m n N G l R`. Un fichier Lexique3 se branche donc
tel quel. L'inspecteur affiche la conversion en API (`/ʒsɥi/`).

**Règles « rap »** :
- e muet final jamais compté (`monde` = 1), sauf s'il est la seule voyelle (`je`, `que`, `le`).
- `-ent` des verbes muet (`ils chantent` = 2) ; `-ent` / `-ment` des noms et adverbes prononcé
  (`moment`, `souvent`, `argent`) via listes d'exceptions.
- Apostrophes : `j'suis` = 1, `t'as` = 1, `p'tit` = 1, `y'a` = 1 ; `je suis` = 2.
- Synérèse du parlé : `nuit`, `lion`, `jouer` = 1 syllabe ; mais `crier`, `oublier` gardent la diérèse
  après consonne + r/l.
- **Flow parlé** (toggle, activé par défaut) : loi des trois consonnes, `maint'nant` = 2,
  `sam'di` = 2, mais `appartement` = 4.

**Rimes** (`analyzer.js`), sur une fenêtre glissante de 4 lignes (ligne + 3 voisines, sans franchir un `[Titre]`) :
- *Assonances* : même voyelle tonique (dernière voyelle prononcée) sur un mot plein ou un mot de fin de ligne.
- *Rimes* : voyelle tonique + consonnes finales identiques (`accords` / `décor` / `d'or`).
- *Rime de fin* : dernier mot qui rime avec un autre dernier mot (encadré).
- *Multis* : séquences de 2 à 4 voyelles qui se répètent et finissent sur la tonique d'un mot plein
  (toutes les syllabes de la séquence sont colorées, en plus soutenu).
- **Surlignage par syllabe** : le mot est découpé en syllabes écrites (`syllabify.js`) et seule la syllabe
  concernée est colorée (`écris` → seul `cris` ; rime riche = les deux dernières syllabes).
- é et è sont fusionnés par défaut (toggle `é ≠ è` pour le mode strict).

### Enrichir le moteur

| Pour…                               | Modifier                                                    |
|-------------------------------------|-------------------------------------------------------------|
| un mot mal transcrit                | ajouter une entrée dans `lexicon.js` (`'mot': 'phon'`)      |
| une famille de mots                 | `exceptions.js` (ex. `NASAL_ENT`, `KEEP_FINAL_T`)           |
| une règle générale                  | `rules.js` : l'ordre compte, la première règle qui matche gagne |
| le dictionnaire                     | `data/lexique.json` (Lexique 3, chargé au démarrage ; tes entrées de `lexicon.js` restent prioritaires). Voir `tools/build_lexique.py` |

Ajoute un test dans `tests/phonetics.test.js` à chaque correction pour ne pas régresser.

## Interface

Quatre zones (colonnes sur ordinateur, onglets **Textes · Écrire · Analyse · Idées** sur téléphone ;
sur ordinateur, le bouton « Idées ✦ » bascule la colonne de gauche). Chaque zone a des sous-onglets pour
ne montrer qu'un sujet à la fois : Textes → Textes · Projet · Profil ; Analyse → Texte · Ligne · Réglages.

- **Écrire** : le texte seul, plein écran. Retour à la ligne automatique, marge à gauche, badge de syllabes à
  droite de chaque ligne (vert = ±1 par rapport à la médiane des lignes précédentes du bloc, orange = ±2-3,
  rouge-orange au-delà). Les lignes `[Couplet]` / `# Refrain` sont des titres de section, non comptées.
  Police système (San Francisco sur iPhone, comme l'app Notes). Aucun soulignement : la couleur est un fond
  teinté sur la syllabe.
- **Textes** : liste des textes ; le crayon ✎ de la carte sélectionnée ouvre titre, BPM, gamme, export et
  suppression. Radar à Tics en dessous (top 10 des mots pleins sur tous les textes).
- **Analyse** : réglages d'affichage (Rayon X, Assonances/Rimes/Consonnes, Grille 4/4, é ≠ è), signature vocalique de la
  ligne courante `[a - i - an - é]`, phonétique, mots répétés dans la section (16 mesures max, badge `TIC`
  s'ils sont dans ton top) et boîte à rimes (un clic insère le mot au curseur).
- **Bas** : import d'instru par glisser-déposer ou bouton (via `URL.createObjectURL`, rien n'est envoyé),
  forme d'onde (clic ou glisser = se placer, Maj+glisser = boucle), A / B / ⟲, boucles 4m / 8m calées sur le
  BPM, `1↓` pour caler le temps 1, TAP tempo, métronome visuel + clic sonore.

### Consonances et allitérations

Le mode **Consonnes** (Analyse → Affichage → Rayon X) colore, dans ton texte tel que tu l'écris, les sons
consonnes qui reviennent plus souvent que le hasard : le **p** de « personne, perf, presque, père », le **s**
de « sonne, sans, presque ». La couleur regroupe les sons voisins (p/b rose, t/d orange, k/g jaune, f/v vert
d'eau, s/z bleu, ch/j violet, m/n bleu foncé, l vert, r rouge) ; l'inspecteur résume la ligne courante
(`p ×2 · s ×1`).

Comment c'est décidé (`consonance.js`) :
- on compte les **sons** prononcés, pas les lettres : « sans » = un seul `s`, « chante » = `ch` + `t` ;
- fenêtres d'une et de deux lignes consécutives (dans la même section) ;
- un son est retenu s'il apparaît **au moins 3 fois, dans au moins 3 mots différents**, et si c'est improbable
  vu sa fréquence normale en français (queue de Poisson ≤ 20 %) : un `p` ou un `b` se remarque vite, un `r`
  ou un `l` doit vraiment dominer ;
- les petits mots (le, la, de, je, ne, que…) sont ignorés, sinon « le / la / les » créeraient de fausses
  allitérations.

Seuils réglables en tête de `consonance.js` (`MIN_COUNT`, `MAX_TAIL`, table `FREQ`).

### Raccourcis (ordinateur)

| Raccourci      | Action                |
|----------------|-----------------------|
| `Ctrl+Espace`  | Lecture / pause       |
| `Alt+A` / `Alt+B` | Point A / point B  |
| `Alt+L`        | Activer la boucle     |
| `Alt+T`        | Tap tempo             |
| `Ctrl+S`       | Sauvegarde immédiate (auto-sauvegarde sinon) |

On peut aussi glisser un `.txt` sur la fenêtre pour l'importer comme nouveau texte.

## Sur téléphone

Un écran à la fois, barre d'onglets en bas. Le bouton ⋯ du lecteur ouvre A/B, 8 mesures, tap tempo et
métronome. Quand le clavier s'ouvre, le lecteur et les onglets se masquent pour laisser la place au texte.
Le `manifest.webmanifest` permet d'« Ajouter à l'écran d'accueil » (plein écran, icône dédiée).

## L'IA : le moteur de compréhension

Le moteur local sait compter et faire rimer ; il ne comprend pas le sens. La compréhension est confiée
à **Claude** (API Anthropic), appelé directement depuis le navigateur avec **ta clé API**, que tu colles
dans **Analyse → Réglages** (elle reste sur l'appareil, dans `localStorage`).

| Fonction | Où | Ce que fait l'IA |
|---|---|---|
| **Lecture du texte** | Analyse → Texte | Résumé en phrases, intention, humeur, thèmes, ce qui marche, ce qui est à reprendre (avec une piste), figures de style, fil du texte, idées de ta banque reconnues **même reformulées**, idées à placer |
| **Souffle-moi** | bouton ✦ sur Écrire | Fins pour la ligne en cours et lignes pour la suite, dans ta voix et le propos du texte, nourries par ta banque d'idées |
| **Profil d'écriture** | Textes → Profil | Portrait de ta voix (thèmes, mots, procédés, forces, angles morts), réinjecté dans toutes les demandes |
| **Classement des idées** | Idées | Sens, thèmes et humeur de chaque idée importée |
| **Synthèse de projet** | Textes → Projet | Ce que raconte le projet, redites, angles encore à écrire à partir de ta banque |

Principes de conception :

- **Hybride.** L'IA s'occupe du sens ; le moteur local garde ce qu'il fait mieux (syllabes, rimes,
  allitérations, rythme). Les nombres de syllabes sont fournis à l'IA, et chaque proposition de
  Souffle-moi est **revérifiée localement** (syllabes, rythme des lignes voisines, rime).
- **On ne paie pas deux fois.** Une lecture est gardée par texte tant qu'il ne change pas ; un bandeau
  signale quand le texte a bougé. La banque d'idées et le profil sont mis en cache côté API (1 h).
- **Quand ça part.** L'analyse se lance à l'ouverture de l'onglet Analyse si le texte a changé (réglable),
  au passage d'un texte en « Validé » (suivie d'une mise à jour du profil), à l'import d'idées, et sur
  les boutons. Rien d'autre ne quitte l'appareil.
- **Modèle.** Claude Opus 5.5 par défaut ; Sonnet 5.5 et Haiku 5.5 au choix dans les réglages. La
  dépense estimée est affichée.
- **Sans clé**, l'app reste utilisable : repérage local des thèmes et figures, rimes, rythme.

Confidentialité : le texte, la banque d'idées et le profil sont envoyés à Anthropic au moment d'une
demande. D'après la documentation de l'API, ces données ne servent pas à l'entraînement sans accord
exprès ([détails](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)).

Tests : `tests/ai.test.js` couvre le contexte, les schémas et la normalisation, sans réseau.

## Mémoire d'écriture et repérage local (sans IA)

Rien n'est envoyé nulle part : tout est calculé sur le téléphone, hors ligne.

- **Banque d'idées** (onglet Idées) : colle ta note d'idées, elle est découpée en fragments (une ligne
  vide, une ligne de tirets `---` ou une date seule sépare deux idées). Recherche, filtre par thème,
  « pas encore dites / déjà dites », insertion dans le texte en un geste.
- **Ça sonne avec…** (Analyse) : les lignes de ta banque qui riment avec la ligne en cours (rime riche,
  rime, assonance), pour ressortir un vieux bout de texte au bon moment.
- **Ce texte** (Analyse) : thèmes dominants, humeur, mots forts (ce qui distingue ce texte de tes autres),
  figures de style repérées avec la ligne (anaphore, épiphore, parallélisme, comparaison, métaphore
  probable, antithèse, paronomase, allitération, assonance, épizeuxe, question rhétorique), et les idées
  de ta banque présentes dans le texte.
- **Statut et projet** (crayon ✎ du texte) : Brouillon / Validé et nom du projet (album, mixtape…).
  Une idée devient « dite » quand elle apparaît dans un texte **validé** (une de ses lignes telle quelle,
  ou la moitié de ses mots pleins).
- **Projet** (onglet Textes) : sons validés, thèmes abordés, et les thèmes présents dans tes idées mais
  encore absents de tes sons validés.
- **Ton vocabulaire** : les mots que tu emploies et que le dictionnaire ne connaît pas. Touche un mot (ici
  ou dans « Mots de la ligne ») pour indiquer comment il se dit, en l'écrivant comme il se prononce
  (« zbeul » → « zebeul ») : la correction est retenue partout, et réversible.
- **Boîte à rimes** : tes propres mots sont proposés en premier.
- **Accents oubliés** : « j'ecoute », « deja », « tete » sont lus comme « j'écoute », « déjà », « tête ».

Limites : thèmes et humeur viennent de lexiques (`themes.js`) — l'analyse voit ce qui est dit
explicitement, pas le second degré ni les images inédites. Les lexiques sont faits pour être enrichis.

## Hors ligne

Un service worker (`sw.js`) met l'app et le dictionnaire en cache à la première visite en ligne :
ensuite tout fonctionne sans réseau (le code se met à jour tout seul dès que tu es en ligne).
Après une modification de `data/lexique.json`, incrémenter `VERSION` dans `sw.js`.

## Crédits

Dictionnaire phonétique : **Lexique 3** — New, B., Pallier, C., Brysbaert, M., Ferrand, L. (2004),
[www.lexique.org](https://www.lexique.org), licence CC BY-SA 4.0. `data/lexique.json` en est une version
dérivée (mêmes conditions de partage).

## Limites connues (V1)

- Les homographes (`les poules couvent` / `le couvent`, `fils`, `plus`) prennent la prononciation la plus
  fréquente de Lexique 3 ; le contexte n'est pas analysé.
- La grille 4/4 répartit les syllabes en 4 temps égaux : c'est un repère visuel, pas un calage réel du flow.
