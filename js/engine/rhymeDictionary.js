/**
 * Boîte à rimes : index phonétique de mots, interrogeable par fin de mot.
 *
 * Sources indexées :
 *   1. une petite liste de base (ci-dessous),
 *   2. les mots des textes de l'utilisateur (registerWords),
 *   3. le dictionnaire externe chargé via lexicon.loadLexique() (rebuildFromLexicon).
 *
 * Synonymes : `registerSynonyms({ mot: [...] })` ou chargement JSON — architecture prête,
 * la liste de base est volontairement minimale.
 */
import { analyzeWord, matchClass } from './phonetics.js';
import { knownWords } from './lexicon.js';

const BASE_WORDS = `
  nuit bruit pluie fuit vie envie ennui minuit survie folie magie mélodie paradis
  ami ici aussi souci merci défi récit cri esprit midi abri oubli pari
  temps sang vent argent moment instant présent tourment serment talent néant océan
  monde ronde onde seconde fécond profond fond son raison prison maison passion vision
  cœur peur douleur couleur valeur honneur sueur rumeur heure leurre malheur bonheur rancœur
  ciel miel réel éternel appel sommeil soleil réveil pareil conseil merveille
  jour amour toujours retour détour velours lourd sourd court parcours discours secours
  rue vue perdu venu inconnu absolu têtu vécu déçu salut statut but
  rêve trêve sève élève grève brève lève
  âme flamme drame lame larme arme charme alarme vacarme
  ville file style exil fragile habile asile tranquille
  route doute goutte écoute coûte croûte déroute
  rage cage page plage orage visage mirage courage passage message rivage sage
  gloire histoire mémoire victoire noire boire croire espoir miroir soir trottoir couloir
  feu jeu bleu peu dieu lieu adieu milieu aveu enjeu
  main demain chemin destin matin refrain chagrin festin sein besoin loin coin
  ombre sombre nombre décombres pénombre
  nord mort sort fort or décor accord dehors trésor effort corps remords
  rap trap cap
  flow micro studio radio tempo ghetto stylo solo écho héros zéro
  rime crime abîme frime prime intime ultime victime estime
  bitume plume lune brume enclume amertume costume fortune
  game flamme dame
  mic beat street
  liberté vérité cité société fierté beauté clarté été côté pitié
`.trim().split(/\s+/);

const index = new Map();       // mot → analyse
const synonyms = new Map();    // mot → [synonymes]

function add(word) {
  const w = word.toLowerCase();
  if (index.has(w) || w.length < 2 || /\d/.test(w)) return;
  const a = analyzeWord(w);
  if (!a.tonic || a.tonic === 'schwa') return;
  index.set(w, a);
}

BASE_WORDS.forEach(add);

/** Ajoute les mots (ex. issus des textes de l'utilisateur) à l'index. */
export function registerWords(words) {
  for (const w of words) if (!w.includes("'")) add(w);
}

/**
 * Ré-indexe les mots les plus fréquents du dictionnaire chargé (Lexique3 est trié par fréquence).
 * Fait par paquets pour ne pas figer l'interface sur téléphone.
 * @returns {Promise<number>} taille de l'index
 */
export async function rebuildFromLexicon(limit = 30000) {
  const words = knownWords().slice(0, limit);
  for (let i = 0; i < words.length; i += 1500) {
    for (const w of words.slice(i, i + 1500)) if (/^\p{L}+$/u.test(w)) add(w);
    await new Promise((r) => setTimeout(r, 0));
  }
  return index.size;
}

export function registerSynonyms(map) {
  for (const [w, list] of Object.entries(map)) synonyms.set(w.toLowerCase(), list);
}

export function findSynonyms(word) {
  return synonyms.get(word.toLowerCase()) ?? [];
}

/** Dernières `n` classes vocaliques d'une analyse. */
const tail = (a, n, strict) => a.vowels.slice(-n).map((c) => matchClass(c, strict)).join('-');

/**
 * Cherche des rimes pour un mot.
 * @returns {{ riches: string[], rimes: string[], assonances: string[] }}
 */
export function findRhymes(word, { limit = 24, strict = false } = {}) {
  const target = analyzeWord(word);
  const res = { riches: [], rimes: [], assonances: [], target };
  if (!target.tonic) return res;
  const self = word.toLowerCase();
  const t2 = tail(target, 2, strict);
  for (const [w, a] of index) {
    if (w === self || a.phon === target.phon) continue;
    const sameKey = a.rhymeKey === target.rhymeKey;
    if (sameKey && target.vowels.length > 1 && a.vowels.length > 1 && tail(a, 2, strict) === t2) res.riches.push(w);
    else if (sameKey) res.rimes.push(w);
    else if (matchClass(a.tonic, strict) === matchClass(target.tonic, strict)) res.assonances.push(w);
  }
  for (const k of ['riches', 'rimes', 'assonances']) res[k] = res[k].slice(0, limit);   // ordre d'insertion = fréquence
  return res;
}
