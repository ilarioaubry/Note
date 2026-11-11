/**
 * Allitérations et consonances : un son consonne qui revient plus souvent que le hasard
 * ne le voudrait (le « p » de « personne, perf, presque, père », le « s » de « sonne, sans »).
 *
 *  1. consonantsOf(token) : consonnes prononcées d'un mot avec leur position dans les lettres,
 *     via les règles G2P alignées (les lettres muettes ne comptent pas : « sans » = un seul son s).
 *  2. detectConsonance(seq) : pour chaque fenêtre d'une ou deux lignes consécutives (dans la même
 *     section), un son est retenu s'il apparaît au moins 3 fois et si, vu la fréquence normale de ce
 *     son en français, c'est improbable (queue de Poisson ≤ 20 %). Plus le son est courant (r, l…),
 *     plus il en faut ; un « p » ou un « b » se remarquent vite.
 *
 * Le comptage se fait sur le son exact (p ≠ b) ; la couleur regroupe les sons voisins (p/b, t/d…).
 */
import { applyRulesAligned, MUTE_E, MUTE_ENT } from './rules.js';
import { normalize, stripSilentFinal, VOWEL_PHONES } from './phonetics.js';

const SEMI = new Set(['j', 'w', '8']);
const cache = new Map();

export function clearConsonanceCache() { cache.clear(); }

/** Part de chaque son parmi les consonnes d'un texte français (valeurs approximatives, en %). */
const FREQ = {
  R: 17, l: 12, t: 11, s: 10, n: 9, d: 7, k: 7, m: 6, p: 5, v: 4, z: 3, b: 2.5, f: 2.5, Z: 2, g: 1.5, S: 1, N: 0.3, G: 0.2, w: 0.5,
};

/** Famille de couleur d'un son (CSS : data-c). */
export const FAMILY = {
  p: 'p', b: 'p', t: 't', d: 't', k: 'k', g: 'k', f: 'f', v: 'f', s: 's', z: 's',
  S: 'sh', Z: 'sh', m: 'm', n: 'm', N: 'm', G: 'm', l: 'l', R: 'r', w: 'w',
};

/** Libellé lisible d'un son (ce que l'auteur lit dans son texte). */
export const LABEL = { R: 'r', S: 'ch', Z: 'j', N: 'gn', G: 'ng', k: 'k', s: 's', z: 'z', w: 'w' };
export const consonantLabel = (ph) => LABEL[ph] ?? ph;

/** Consonnes d'un segment sans apostrophe : [{ s, e, ph }] en indices de lettres du segment. */
function segmentConsonants(seg, isPrefix) {
  let w = seg;
  if (isPrefix) {
    if (seg === 'y') return [];                                                          // y'a : semi-voyelle, pas de consonne
    if (!/[aeiouyàâéèêîôû]$/.test(seg)) w = `${seg}e`;
  }
  const { phon, src, spans } = applyRulesAligned(isPrefix && w !== seg ? w : stripSilentFinal(w));
  const out = [];
  for (let i = 0; i < phon.length; i++) {
    const c = phon[i];
    if (VOWEL_PHONES.has(c) || SEMI.has(c) || c === MUTE_E || c === MUTE_ENT) continue;
    const sp = spans[src[i]];
    if (sp.s < seg.length) out.push({ s: sp.s, e: Math.min(sp.e, seg.length), ph: c });
  }
  return out;
}

/** Consonnes prononcées d'un mot écrit : [{ s, e, ph }] en indices de lettres du mot. */
export function consonantsOf(token) {
  const hit = cache.get(token);
  if (hit) return hit;
  const word = normalize(token);
  const out = [];
  if (word.length === token.length && !/\d/.test(word)) {
    let pos = 0;
    for (const part of word.split('-')) {
      const segs = part.split("'");
      segs.forEach((seg, si) => {
        if (seg) for (const c of segmentConsonants(seg, si < segs.length - 1)) out.push({ s: pos + c.s, e: pos + c.e, ph: c.ph });
        pos += seg.length + 1;
      });
    }
  }
  cache.set(token, out);
  return out;
}

/** P(X ≥ k) pour X ~ Poisson(λ). */
function poissonTail(k, lambda) {
  let term = Math.exp(-lambda), cdf = 0;
  for (let i = 0; i < k; i++) { cdf += term; term *= lambda / (i + 1); }
  return Math.max(0, 1 - cdf);
}

const MIN_COUNT = 3;
const MAX_TAIL = 0.2;
/* « Vraiment marqué » : affiché en plus des voyelles dans les modes Assonances et Rimes.
   Soit 4 occurrences ou plus et très improbable par hasard, soit 3 et quasi impossible par hasard. */
const STRONG = [{ min: 4, tail: 0.03 }, { min: 3, tail: 0.004 }];
const FREQ_SUM = Object.values(FREQ).reduce((a, b) => a + b, 0);

/**
 * @param {{line:{words:object[]}, group:number}[]} seq lignes de texte (hors titres et lignes vides)
 * Marque `occ.hl = true` sur chaque consonne retenue (et `occ.strong` si elle est vraiment marquée) ;
 * renseigne `line.cons` = [{ ph, count, strong }] triés.
 * Prérequis : chaque mot porte `cons` = [{ s, e, ph, hl }].
 */
export function detectConsonance(seq) {
  const windows = [];
  for (let i = 0; i < seq.length; i++) {
    windows.push([i]);
    if (i + 1 < seq.length && seq[i + 1].group === seq[i].group) windows.push([i, i + 1]);
  }
  for (const idx of windows) {
    const occ = idx.flatMap((i) => seq[i].line.words.filter((w) => !w.isClitic).flatMap((w) => w.cons));
    const n = occ.length;
    if (n < MIN_COUNT) continue;
    const counts = new Map();
    for (const o of occ) counts.set(o.ph, (counts.get(o.ph) ?? 0) + 1);
    // le son doit se retrouver dans au moins 3 mots différents (un mot qui se répète n'est pas une allitération)
    const wordsWith = new Map();
    for (const i of idx) for (const w of seq[i].line.words) {
      if (w.isClitic) continue;
      for (const ph of new Set(w.cons.map((o) => o.ph))) wordsWith.set(ph, (wordsWith.get(ph) ?? new Set()).add(w.lemma));
    }
    const kept = new Set();
    const strong = new Set();
    for (const [ph, c] of counts) {
      if ((wordsWith.get(ph)?.size ?? 0) < MIN_COUNT) continue;
      const p = (FREQ[ph] ?? 1) / FREQ_SUM;
      const tail = poissonTail(c, n * p);
      if (c >= MIN_COUNT && tail <= MAX_TAIL) kept.add(ph);
      if (STRONG.some((r) => c >= r.min && tail <= r.tail)) strong.add(ph);
    }
    for (const o of occ) {
      if (kept.has(o.ph)) o.hl = true;
      if (strong.has(o.ph)) o.strong = true;
    }
  }
  detectAlliteration(seq, windows);

  for (const { line } of seq) {
    const counts = new Map();
    const strongPh = new Set();
    for (const w of line.words) for (const o of w.cons) {
      if (o.hl) counts.set(o.ph, (counts.get(o.ph) ?? 0) + 1);
      if (o.strong) strongPh.add(o.ph);
    }
    line.cons = [...counts].map(([ph, count]) => ({ ph, count, strong: strongPh.has(ph) })).sort((a, b) => b.count - a.count);
  }
}

/**
 * Allitération au sens strict, pour le mode Essentiel : le même son en TÊTE de mot
 * (« Personne, Perf, Presque… Père »), sur au moins 4 mots pleins différents dans une ou deux lignes,
 * et improbable par hasard. Les consonnes au milieu des mots ne comptent pas : c'est ce qui sépare
 * une allitération voulue d'un « s » qui traîne partout. Marque `occ.allit = true`.
 */
const ALLIT_MIN = 4;
function detectAlliteration(seq, windows) {
  for (const idx of windows) {
    const heads = [];
    for (const i of idx) {
      for (const w of seq[i].line.words) {
        if (w.isStop || !w.cons.length) continue;
        // tête du mot porteur : après l'élision (« j'suis » → s, « d'ici » → rien : le d est l'article)
        const start = Math.max(w.text.lastIndexOf("'"), w.text.lastIndexOf('’')) + 1;
        const first = w.cons.find((c) => c.s >= start);
        if (first && first.s === start) heads.push({ w, o: first });
      }
    }
    const n = heads.length;
    if (n < ALLIT_MIN) continue;
    const byPh = new Map();
    for (const h of heads) {
      if (!byPh.has(h.o.ph)) byPh.set(h.o.ph, []);
      byPh.get(h.o.ph).push(h);
    }
    for (const [ph, list] of byPh) {
      const lemmas = new Set(list.map((h) => h.w.lemma));
      if (lemmas.size < ALLIT_MIN) continue;
      const p = (FREQ[ph] ?? 1) / FREQ_SUM;
      if (poissonTail(lemmas.size, n * p * 1.6) > 0.05) continue;   // les débuts de mots sont plus souvent consonantiques
      for (const h of list) h.o.allit = true;
    }
  }
}
