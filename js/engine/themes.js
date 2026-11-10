/**
 * Thèmes, humeur et mots-clés d'un texte — 100 % local, par lexiques.
 *
 * Ce n'est pas de la « compréhension » au sens d'une IA : on reconnaît les champs lexicaux
 * (argent, rue, famille…) et le vocabulaire émotionnel. C'est fiable sur ce qui est dit
 * explicitement, aveugle au second degré. Les lexiques sont faits pour être enrichis.
 *
 * Un « radical » de 4 lettres ou plus reconnaît aussi les formes dérivées proches
 * (rêve → rêver, rêves ; trahi → trahir, trahison), sans accents (reve = rêve).
 */
import { tokenize } from './phonetics.js';
import { lemmaOf } from './analyzer.js';
import { stripAccents } from './lexicon.js';
import { isStopword } from './stopwords.js';

const words = (s) => s.trim().split(/\s+/).map((w) => stripAccents(w.toLowerCase()));
const T = (id, label, list) => ({ id, label, stems: words(list) });

export const THEMES = [
  T('argent', 'Argent', `argent thune oseille biff fric cash money billet liasse euro banque riche richesse pauvre pauvreté
    dette loyer salaire paye business bizness chiffre million milliard coffre monnaie luxe rolex smic
    sous moula`),
  T('rue', 'Rue / quartier', `rue tess quartier bloc hall bendo cité hlm bitume trottoir banlieue ghetto zone immeuble
    escalier dalle barre terrain charbon guetteur béton périph`),
  T('justice', 'Police / prison', `police keuf flic schmitt condé prison taule placard cellule juge avocat menottes procès
    peine barreaux mitard parloir détenu sirène gyrophare perquis garde-à-vue tribunal`),
  T('famille', 'Famille', `mère mama daronne daron père papa frère reuf sœur soeur famille enfant fils fille gamin
    cousin héritage maison foyer grand-mère grand-père`),
  T('amour', 'Amour', `amour aimer aime cœur coeur bébé chérie meuf femme bisou embrasser baiser passion désir jalousie
    couple mariage tendresse amoureux`),
  T('loyaute', 'Loyauté / trahison', `traître trahir trahi trahison fake loyal loyauté confiance parole serment fidèle
    respect poignard jaloux balance faux-frère rancune`),
  T('ambition', 'Ambition / réussite', `rêve rêver réussir réussite succès sommet gloire objectif ambition victoire
    gagner champion trône couronne empire charbonner percer monter grimper mérite`),
  T('melancolie', 'Mélancolie / solitude', `seul solitude vide pluie larme pleurer triste tristesse mélancolie nostalgie
    froid ombre sombre blessure douleur fatigue fatigué gris perdu`),
  T('mort', 'Mort / deuil', `mort mourir tombeau cercueil deuil enterrement décès funérailles disparu cimetière
    défunt rip`),
  T('foi', 'Foi / spiritualité', `dieu prière prier foi paradis enfer ange démon diable âme seigneur coran bible mosquée
    église wallah inchallah karma miracle péché croire`),
  T('rap', 'Le rap / l\'écriture', `micro rime rimer flow studio instru beat couplet refrain rap rappeur mesure stylo plume
    texte scène public album feat punchline freestyle`),
  T('passe', 'Enfance / passé', `enfance souvenir avant hier passé école cartable jeunesse grandir mémoire autrefois
    nostalgique petit`),
  T('colere', 'Colère / conflit', `rage colère haine haïr vengeance venger guerre combat frapper rancœur hargne violence
    brûler tirer arme bagarre ennemi`),
  T('fete', 'Fête', `fête soirée boîte club danser danse bouteille champagne alcool vodka shot ivre bourré ambiance
    teuf`),
  T('drogue', 'Drogue', `weed shit beuh joint pétard bédo pochon cocaïne coke came dealer plaquette pilon fumer
    défoncé`),
  T('destin', 'Temps / destin', `temps destin heure horloge minute avenir futur demain chance hasard sort étoile chemin
    route`),
  T('liberte', 'Liberté / évasion', `liberté libre partir fuir évasion voyage ailleurs mer avion horizon loin envol
    ailes`),
  T('ego', 'Ego trip', `meilleur boss roi patron légende king numéro élite puissant invincible imbattable intouchable
    goat`),
];

export const MOODS = [
  { id: 'sombre', label: 'sombre', stems: words(`noir sombre nuit ombre froid vide mort larme pleurer seul solitude
    triste douleur mal blessure peur fatigue gris pluie perdu`) },
  { id: 'rage', label: 'rageur', stems: words(`rage colère haine guerre combat frapper sang venger vengeance tirer
    brûler violence crier ennemi`) },
  { id: 'conquerant', label: 'conquérant', stems: words(`roi trône couronne boss meilleur gagner victoire sommet
    réussir gloire empire champion fort puissant monter`) },
  { id: 'nostalgique', label: 'nostalgique', stems: words(`souvenir enfance avant hier passé autrefois mémoire
    nostalgie gamin jeunesse`) },
  { id: 'amoureux', label: 'amoureux', stems: words(`amour aimer cœur baiser passion tendresse douce bébé chérie`) },
  { id: 'festif', label: 'festif', stems: words(`fête danser soirée club champagne bouteille ambiance rire teuf`) },
  { id: 'espoir', label: 'plein d\'espoir', stems: words(`espoir rêve lumière soleil demain avenir croire foi lever
    renaître briller`) },
];

/** Le mot (sans accents) correspond-il au radical ? */
function matches(word, stem) {
  if (word === stem) return true;
  return stem.length >= 4 && word.startsWith(stem) && word.length - stem.length <= 4;
}

/** Mots pleins d'un texte (lemmes accentués), titres de section et mots outils exclus. */
export function contentLemmas(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (/^\s*[\[#]/.test(line)) continue;
    for (const t of tokenize(line)) {
      const raw = t.text.toLowerCase().replace(/’/g, "'").split("'").pop();
      const l = lemmaOf(t.text);
      if (l.length < 3 || isStopword(l) || isStopword(raw)) continue;
      out.push(l);
    }
  }
  return out;
}

/** Mêmes mots, sans accents : pour comparer (reve = rêve). */
export const contentWords = (text) => contentLemmas(text).map(stripAccents);

function score(list, groups) {
  const res = [];
  for (const g of groups) {
    const hits = new Map();
    for (const w of list) if (g.stems.some((s) => matches(w, s))) hits.set(w, (hits.get(w) ?? 0) + 1);
    const count = [...hits.values()].reduce((a, b) => a + b, 0);
    if (count) res.push({ id: g.id, label: g.label, count, words: [...hits.keys()] });
  }
  return res.sort((a, b) => b.count - a.count || b.words.length - a.words.length);
}

/**
 * Thèmes d'un texte : [{ id, label, count, words }] triés.
 * Un thème n'est retenu qu'avec 2 occurrences, ou 1 seule si le texte est court (fragment d'idée).
 */
export function detectThemes(text) {
  const list = contentWords(text);
  const min = list.length < 25 ? 1 : 2;
  return score(list, THEMES).filter((t) => t.count >= min);
}

/** Humeur dominante : [{ id, label, count, share }] (share = part des mots émotionnels). */
export function detectMood(text) {
  const res = score(contentWords(text), MOODS);
  const total = res.reduce((a, m) => a + m.count, 0);
  return res.map((m) => ({ ...m, share: total ? m.count / total : 0 }));
}

/**
 * Mots-clés : mots pleins les plus propres à ce texte, comparés à tous tes autres textes
 * (fréquence ici × rareté ailleurs, façon TF-IDF).
 */
export function keywords(text, corpus = [], n = 8) {
  const tf = new Map();
  const shown = new Map();                       // forme sans accents → forme affichée (accentuée)
  for (const l of contentLemmas(text)) {
    const w = stripAccents(l);
    tf.set(w, (tf.get(w) ?? 0) + 1);
    if (!shown.has(w) || l !== w) shown.set(w, l);
  }
  const docs = corpus.map((t) => new Set(contentWords(t)));
  const N = docs.length + 1;
  return [...tf]
    .map(([w, c]) => {
      const df = 1 + docs.filter((d) => d.has(w)).length;
      return { word: shown.get(w), score: c * Math.log(1 + N / df) };
    })
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, n)
    .map((x) => x.word);
}
