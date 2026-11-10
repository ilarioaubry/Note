/**
 * Banque d'idées : fragments de texte gardés de côté (ta note d'idées), sans IA.
 *
 *  splitNote(text)            découpe une note collée en fragments
 *  ideaCoverage(idea, text)   part des mots pleins de l'idée qu'on retrouve dans un texte
 *  isIdeaUsed(idea, text)     l'idée a-t-elle été dite dans ce texte ?
 *  soundsLike(line, ideas)    lignes de la banque qui sonnent comme la ligne en cours
 */
import { analyzeWord, countSyllables, tokenize, matchClass } from './phonetics.js';
import { contentWords } from './themes.js';

/** Ligne qui sépare deux idées : vide, que de la ponctuation (---, ***, •), ou une date seule. */
const SEPARATOR_RE = /^\s*(?:[-–—_*=~•·.#]{2,}|[-–—_*=~•·.#]?\s*\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\s*[-–—_*=~•·.#]?)\s*$/u;

/**
 * Découpe une note en fragments : séparés par une ligne vide, une ligne de tirets/étoiles
 * ou une date seule. Les doublons exacts sont ignorés.
 * @returns {string[]}
 */
export function splitNote(text) {
  const out = [];
  let cur = [];
  const flush = () => {
    const t = cur.join('\n').trim();
    if (t && !out.includes(t)) out.push(t);
    cur = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim() || SEPARATOR_RE.test(raw)) { flush(); continue; }
    cur.push(raw.replace(/\s+$/, ''));
  }
  flush();
  return out;
}

/** Part (0–1) des mots pleins de l'idée présents dans le texte. */
export function ideaCoverage(ideaText, textOrWords) {
  const idea = [...new Set(contentWords(ideaText))];
  if (!idea.length) return 0;
  const words = textOrWords instanceof Set ? textOrWords : new Set(contentWords(textOrWords));
  return idea.filter((w) => words.has(w)).length / idea.length;
}

/**
 * Une idée est « dite » dans un texte si l'une de ses lignes y figure telle quelle,
 * ou si au moins la moitié de ses mots pleins (et 2 au minimum) s'y retrouvent.
 */
export function isIdeaUsed(ideaText, text, textWords) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const body = norm(text);
  if (ideaText.split('\n').some((l) => norm(l).length >= 12 && body.includes(norm(l)))) return true;
  const idea = [...new Set(contentWords(ideaText))];
  if (idea.length < 2) return false;
  const words = textWords ?? new Set(contentWords(text));
  return idea.filter((w) => words.has(w)).length / idea.length >= 0.5;
}

/** Fin de ligne : rime (voyelle + consonnes finales) et deux dernières voyelles. */
function ending(line) {
  const toks = tokenize(line);
  const last = toks.at(-1);
  if (!last) return null;
  const a = analyzeWord(last.text);
  if (!a.tonic || a.tonic === 'schwa') return null;
  const vowels = toks.flatMap((t) => analyzeWord(t.text).vowels).filter((c) => c !== 'schwa').map((c) => matchClass(c));
  return { key: a.rhymeKey, tonic: matchClass(a.tonic), tail2: vowels.slice(-2).join('-'), word: last.text.toLowerCase() };
}

/**
 * Lignes de la banque d'idées qui sonnent comme `line` (même rime de fin, voire même rime riche),
 * avec un bonus si le nombre de syllabes est proche.
 * @param {string} line ligne en cours
 * @param {{id:string,text:string}[]} ideas
 * @returns {{ideaId:string, text:string, score:number, kind:string}[]}
 */
export function soundsLike(line, ideas, limit = 6) {
  const target = ending(line);
  if (!target) return [];
  const syl = countSyllables(line);
  const res = [];
  for (const idea of ideas) {
    for (const l of idea.text.split('\n')) {
      if (!l.trim()) continue;
      const e = ending(l);
      if (!e || e.word === target.word) continue;
      let score = 0, kind = '';
      if (e.key === target.key && e.tail2 === target.tail2) { score = 3; kind = 'rime riche'; }
      else if (e.key === target.key) { score = 2; kind = 'rime'; }
      else if (e.tonic === target.tonic) { score = 1; kind = 'assonance'; }
      if (!score) continue;
      const d = Math.abs(countSyllables(l) - syl);
      score += d <= 1 ? 0.5 : d <= 3 ? 0.2 : 0;
      res.push({ ideaId: idea.id, text: l.trim(), score, kind });
    }
  }
  return res.sort((a, b) => b.score - a.score).slice(0, limit);
}
