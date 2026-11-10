/**
 * Figures de style repérées par règles (sans IA), sur un texte déjà analysé (analyzeText).
 *
 *  anaphore      : 2 lignes de suite qui commencent par les 2 mêmes mots (ou 3 lignes par le même mot)
 *  parallélisme  : une ligne dont deux segments commencent pareil (« on garde la flamme, on garde le cap »)
 *  épiphore      : 2 lignes de suite qui finissent par le même mot
 *  comparaison   : comme, tel(le) un(e), pareil à, on dirait, semblable à
 *  métaphore     : « X est / c'est / j'suis un(e) Y » (probable, à vérifier)
 *  antithèse     : deux contraires dans la même ligne ou deux lignes voisines (jour / nuit…)
 *  paronomase    : deux mots qui ne diffèrent que d'un son (rime / crime, rap / drap)
 *  allitération  : un son consonne qui domine la ligne (détecté par consonance.js)
 *  assonance     : une voyelle qui revient sur au moins 4 syllabes et 40 % de la ligne
 *  épizeuxe      : un mot répété immédiatement (« encore, encore »)
 *  question rhétorique : ligne qui finit par « ? »
 *
 * Chaque figure : { type, label, lines: [index de ligne], detail }.
 */
import { normalize, matchClass, CLASS_LABEL } from './phonetics.js';
import { consonantLabel } from './consonance.js';
import { stripAccents } from './lexicon.js';
import { isStopword } from './stopwords.js';

export const FIGURE_LABEL = {
  anaphore: 'Anaphore',
  parallelisme: 'Parallélisme',
  epiphore: 'Épiphore',
  comparaison: 'Comparaison',
  metaphore: 'Métaphore (probable)',
  antithese: 'Antithèse',
  paronomase: 'Paronomase',
  alliteration: 'Allitération',
  assonance: 'Assonance',
  epizeuxe: 'Épizeuxe (répétition)',
  question: 'Question rhétorique',
};

/** Paires de contraires (sans accents). Chaque mot reconnaît aussi ses formes proches. */
const ANTONYMS = `jour/nuit vie/mort vivre/mourir haut/bas riche/pauvre amour/haine aimer/haïr ombre/lumière
  guerre/paix ange/démon paradis/enfer perdre/gagner chaud/froid blanc/noir début/fin rire/pleurer
  monter/descendre vrai/faux tout/rien seul/ensemble feu/eau ciel/terre ciel/enfer naître/mourir
  sourire/larme force/faiblesse fort/faible bien/mal hier/demain passé/futur entrer/sortir partir/rester
  silence/bruit plein/vide lent/rapide jeune/vieux dieu/diable roi/esclave ami/ennemi frère/ennemi
  victoire/défaite gagnant/perdant sommet/bas-fond soleil/pluie paix/guerre douceur/violence espoir/désespoir`
  .trim().split(/\s+/).map((p) => p.split('/').map((w) => stripAccents(w)));

const near = (w, base) => w === base || (base.length >= 4 && w.startsWith(base) && w.length - base.length <= 3);

const COMPARISON_RE = /\b(comme|tel(?:le)?s? (?:un|une|des|que)|pareil(?:le)?s? (?:à|a|au)|on dirait|semblable (?:à|a)|ressemble)\b/iu;
const METAPHOR_RE = /\b(?:c['’]est|(?:j['’]suis|je suis|t['’]es|tu es|il est|elle est|on est|la vie est|le monde est|\p{L}{3,} est|\p{L}{3,} sont))\s+(?:un|une|des|le|la|les|mon|ma|mes|ton|ta|ce|cette)\s+\p{L}{3,}/iu;

const plainWords = (line) => line.words.map((w) => stripAccents(normalize(w.text).split("'").pop()));
const firstWords = (line, n) => line.words.slice(0, n).map((w) => stripAccents(normalize(w.text))).join(' ');

/** Distance d'édition ≤ 1 entre deux chaînes de phonèmes (substitution, ajout ou retrait d'un son). */
function oneEditApart(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * @param {{lines:object[]}} analysis résultat de analyzeText
 * @returns {{type:string,label:string,lines:number[],detail:string}[]}
 */
export function detectFigures(analysis) {
  const out = [];
  const add = (type, lines, detail) => out.push({ type, label: FIGURE_LABEL[type], lines, detail });
  const lyric = analysis.lines.filter((l) => !l.isMeta && !l.isEmpty && l.words.length);

  // Lignes consécutives dans la même section (un titre ou une ligne vide coupe)
  const runs = [];
  let run = [];
  for (const l of analysis.lines) {
    if (l.isMeta || l.isEmpty || !l.words.length) { if (run.length) runs.push(run); run = []; continue; }
    run.push(l);
  }
  if (run.length) runs.push(run);

  for (const r of runs) {
    // Anaphore : 2 premiers mots identiques sur 2+ lignes, ou 1er mot (plein) sur 3+ lignes
    for (let i = 0; i < r.length; ) {
      let j = i + 1;
      const k2 = firstWords(r[i], 2);
      while (j < r.length && r[i].words.length >= 2 && firstWords(r[j], 2) === k2) j++;
      if (j - i >= 2) { add('anaphore', r.slice(i, j).map((l) => l.index), `« ${r[i].words.slice(0, 2).map((w) => w.text).join(' ')}… »`); i = j; continue; }
      const k1 = firstWords(r[i], 1);
      j = i + 1;
      while (j < r.length && firstWords(r[j], 1) === k1) j++;
      if (j - i >= 3) { add('anaphore', r.slice(i, j).map((l) => l.index), `« ${r[i].words[0].text}… »`); i = j; continue; }
      i++;
    }
    // Épiphore : même dernier mot sur 2+ lignes de suite
    for (let i = 0; i < r.length; ) {
      const last = r[i].words.at(-1).lemma;
      let j = i + 1;
      while (j < r.length && r[j].words.at(-1).lemma === last) j++;
      if (j - i >= 2) { add('epiphore', r.slice(i, j).map((l) => l.index), `« …${r[i].words.at(-1).text} »`); i = j; continue; }
      i++;
    }
    // Antithèse entre deux lignes voisines
    for (let i = 0; i + 1 < r.length; i++) {
      const a = plainWords(r[i]), b = plainWords(r[i + 1]);
      for (const [x, y] of ANTONYMS) {
        const ab = a.some((w) => near(w, x)) && b.some((w) => near(w, y));
        const ba = a.some((w) => near(w, y)) && b.some((w) => near(w, x));
        const inOne = (ws) => ws.some((w) => near(w, x)) && ws.some((w) => near(w, y));
        if ((ab || ba) && !inOne(a) && !inOne(b)) { add('antithese', [r[i].index, r[i + 1].index], `${x} / ${y}`); break; }
      }
    }
  }

  for (const l of lyric) {
    const plain = plainWords(l);

    // Parallélisme : deux segments (séparés par , ; :) qui commencent par les mêmes 2 mots
    const parts = l.text.split(/[,;:]/).map((p) => normalize(p).trim().split(/\s+/).slice(0, 2).join(' ')).filter((p) => p.split(' ').length === 2);
    const seen = new Set();
    for (const p of parts) { if (seen.has(p)) { add('parallelisme', [l.index], `« ${p}… »`); break; } seen.add(p); }

    if (COMPARISON_RE.test(l.text)) add('comparaison', [l.index], `« ${l.text.match(COMPARISON_RE)[0]} »`);
    else if (METAPHOR_RE.test(l.text)) add('metaphore', [l.index], `« ${l.text.match(METAPHOR_RE)[0]} »`);

    for (const [x, y] of ANTONYMS) {
      if (plain.some((w) => near(w, x)) && plain.some((w) => near(w, y))) { add('antithese', [l.index], `${x} / ${y}`); break; }
    }

    // Paronomase : deux mots pleins de la ligne à un son près
    const full = l.words.filter((w) => !w.isStop && w.phon.length >= 3);
    paro: for (let i = 0; i < full.length; i++) {
      for (let j = i + 1; j < full.length; j++) {
        if (full[i].lemma !== full[j].lemma && oneEditApart(full[i].phon, full[j].phon)) {
          add('paronomase', [l.index], `${full[i].text} / ${full[j].text}`);
          break paro;
        }
      }
    }

    // Allitération (consonance.js) : un son retenu au moins 3 fois dans la ligne
    const allit = (l.cons ?? []).filter((c) => c.count >= 3);
    if (allit.length) add('alliteration', [l.index], allit.map((c) => `${consonantLabel(c.ph)} ×${c.count}`).join(', '));

    // Assonance : une même voyelle sur ≥ 4 syllabes et ≥ 40 % des syllabes (hors e muet)
    const vowels = l.words.flatMap((w) => w.vowels).filter((c) => c !== 'schwa').map((c) => matchClass(c));
    const counts = new Map();
    for (const c of vowels) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const [c, n] of counts) {
      if (n >= 4 && n / vowels.length >= 0.4) { add('assonance', [l.index], `[${CLASS_LABEL[c] ?? c}] ×${n}`); break; }
    }

    // Épizeuxe : mot plein répété immédiatement
    for (let i = 1; i < plain.length; i++) {
      if (plain[i] === plain[i - 1] && plain[i].length >= 3 && !isStopword(plain[i])) { add('epizeuxe', [l.index], `« ${l.words[i].text} »`); break; }
    }

    if (/\?\s*$/.test(l.text)) add('question', [l.index], '');
  }

  // Ordre de lecture
  return out.sort((a, b) => a.lines[0] - b.lines[0]);
}
