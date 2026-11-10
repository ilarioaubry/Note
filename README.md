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
│   ├── numbers.js         16 → « seize »
│   ├── stopwords.js       Mots outils
│   ├── analyzer.js        Texte → lignes → mots ; rimes, multis, régularité, grille 4/4
│   ├── repetition.js      Répétitions par section de 16 mesures + Radar à Tics
│   └── rhymeDictionary.js Boîte à rimes (index phonétique) + synonymes (branchement prévu)
├── ui/
│   ├── editor.js          Textarea + calque synchronisé (surlignage, badges, grille)
│   ├── sidebar.js         Projets + Radar à Tics
│   ├── inspector.js       Signature vocalique, répétitions locales, boîte à rimes
│   └── player.js          Audio local, forme d'onde, A/B, 4/8 mesures, tap tempo, métronome
├── store/storage.js       localStorage (projets, réglages)
└── utils/dom.js           debounce, rafThrottle, escape…
tests/phonetics.test.js    Tests node:test
data/lexique.json          Lexique 3 converti ({mot: phonétique}, trié par fréquence)
tools/build_lexique.py     Régénère data/lexique.json depuis Lexique383.txt
sw.js                      Service worker : fonctionnement hors ligne
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
  (soulignement en vague, une couleur par groupe).
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

- **Gauche** : textes sauvegardés (BPM + tonalité en tags), « + Nouveau », Radar à Tics (top 10 des mots
  pleins sur tous les textes).
- **Centre** : éditeur ; badge de syllabes par ligne (vert = ±1 par rapport à la médiane des lignes
  précédentes du bloc, orange = ±2-3, rouge-orange au-delà). Toggles : Rayon X (Assonances / Rimes),
  Grille 4/4 (repères de temps, snare en rose sur 2 et 4), Répétitions (pointillé rouge).
  Les lignes `[Couplet]` / `# Refrain` sont des titres de section, non comptées.
- **Droite** : signature vocalique de la ligne courante `[a - i - an - é]`, phonétique, mots répétés
  dans la section (16 mesures max) avec badge `TIC` s'ils sont dans ton top, boîte à rimes
  (clic = insertion au curseur), indexée sur une liste de base + tes propres textes.
- **Bas** : import d'instru par glisser-déposer ou bouton (via `URL.createObjectURL`, rien n'est envoyé),
  forme d'onde (clic = se placer, Maj+glisser = boucle), A / B / ⟲, boucles 4m / 8m calées sur le BPM,
  `1↓` pour caler le temps 1, TAP tempo, métronome visuel + clic sonore.

### Raccourcis

| Raccourci      | Action                |
|----------------|-----------------------|
| `Ctrl+Espace`  | Lecture / pause       |
| `Alt+A` / `Alt+B` | Point A / point B  |
| `Alt+L`        | Activer la boucle     |
| `Alt+T`        | Tap tempo             |
| `Ctrl+S`       | Sauvegarde immédiate (auto-sauvegarde sinon) |

On peut aussi glisser un `.txt` sur la fenêtre pour l'importer comme nouveau texte.

## Sur téléphone

L'interface est pensée mobile d'abord (≤ 900 px de large) : un écran à la fois, avec une barre
d'onglets en bas **Textes · Écrire · Analyse**. Le bouton ⚙ ouvre les réglages avancés (répétitions,
é ≠ è, export, suppression) ; le bouton ⋯ du lecteur ouvre A/B, 8 mesures, tap tempo et
métronome. Quand le clavier s'ouvre, le lecteur et les onglets se masquent pour laisser la place au texte.
Un `manifest.webmanifest` permet d'« Ajouter à l'écran d'accueil » (plein écran, icône dédiée).

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
