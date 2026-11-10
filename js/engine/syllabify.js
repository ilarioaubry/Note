/**
 * Découpe un mot écrit en syllabes « rap », pour le surlignage à l'écran.
 *
 * Principe : chaque syllabe prononcée a un noyau vocalique (une ou plusieurs lettres :
 * « ou », « eau », « ain »…). On retrouve ces noyaux en rejouant les règles G2P avec
 * alignement (rules.js), puis on place les frontières entre noyaux avec les règles
 * classiques de coupe (une consonne va avec la voyelle suivante, groupes bl/cr/ch… insécables).
 *
 * Garantie : le résultat a toujours exactement `analyzeWord(token).syllables` éléments,
 * qui couvrent le mot en entier sans trou. Si l'alignement par règles ne colle pas avec le
 * dictionnaire (mot d'argot, Lexique3…), on retombe sur les groupes de voyelles écrites,
 * puis sur un découpage régulier.
 */
import { applyRulesAligned, MUTE_E, MUTE_ENT } from './rules.js';
import {
  analyzeWord, normalize, stripSilentFinal, ELISION_RE, VOWEL_PHONES, DEFAULT_OPTS,
} from './phonetics.js';

const LETTER_VOWELS = 'aeiouyàâäéèêëîïôöûüùœ';
const cache = new Map();

export function clearSyllableCache() { cache.clear(); }

/* ---------- 1. Noyaux via les règles G2P ---------- */

/** Noyaux vocaliques d'un segment (sans apostrophe ni tiret), en indices de lettres. */
function segmentNuclei(seg, isPrefix, elision) {
  let w = seg;
  if (isPrefix) {
    if (seg === 'y') return [];
    if (!/[aeiouyàâéèêîôû]$/.test(seg)) w = `${seg}e`;                 // j' t' l' qu' → comme « je, te… »
  }
  const prefixMode = isPrefix && w !== seg;
  const { phon, src, spans } = applyRulesAligned(prefixMode ? w : stripSilentFinal(w));

  // e muets : mêmes règles que phonetics.resolveMutes
  const hasVowel = [...phon].some((c) => VOWEL_PHONES.has(c));
  const chars = [];
  let converted = false;
  for (let i = 0; i < phon.length; i++) {
    const c = phon[i];
    if (c === MUTE_E || c === MUTE_ENT) {
      if (!prefixMode && !hasVowel && !converted) { converted = true; chars.push({ c: c === MUTE_E ? '°' : '@', t: src[i] }); }
      continue;
    }
    chars.push({ c, t: src[i] });
  }

  // élision des e caducs internes : mêmes règles que phonetics.elideSchwas
  const removed = new Set();
  if (elision) {
    const str = chars.map((x) => x.c).join('');
    for (const m of str.matchAll(ELISION_RE)) removed.add(m.index);
  }

  const out = [];
  const seen = new Set();
  chars.forEach((x, i) => {
    if (removed.has(i) || !VOWEL_PHONES.has(x.c) || seen.has(x.t)) return;
    seen.add(x.t);
    const sp = spans[x.t];
    if (sp.s < seg.length) out.push({ s: sp.s, e: Math.min(sp.e, seg.length) });
  });
  return out;
}

function alignedNuclei(word, elision) {
  const out = [];
  let pos = 0;
  for (const part of word.split('-')) {
    const segs = part.split("'");
    segs.forEach((seg, si) => {
      if (seg) for (const n of segmentNuclei(seg, si < segs.length - 1, elision)) out.push({ s: pos + n.s, e: pos + n.e });
      pos += seg.length + 1;                                              // + séparateur
    });
  }
  return out;
}

/* ---------- 2. Repli : groupes de voyelles écrites ---------- */

function letterGroupNuclei(word, N) {
  const groups = [];
  for (const m of word.matchAll(new RegExp(`[${LETTER_VOWELS}]+`, 'g'))) {
    let s = m.index;
    const e = s + m[0].length;
    const prev = word[s - 1];
    if (m[0][0] === 'u' && (prev === 'q' || (prev === 'g' && /[eiéèê]/.test(word[s + 1] ?? '')))) s += 1;   // qu, gu
    if (s < e) groups.push({ s, e });
  }
  // e muet final (monde, vies, chantent)
  if (groups.length > 1) {
    const last = groups.at(-1);
    if (word[last.s] === 'e' && last.e - last.s === 1 && /^(s|nts?)?$/.test(word.slice(last.e))) groups.pop();
  }
  // trop peu de groupes : on coupe les plus longs (diérèses : « ia », « io »)
  while (groups.length < N) {
    let k = -1, best = 1;
    groups.forEach((g, i) => { if (g.e - g.s > best) { best = g.e - g.s; k = i; } });
    if (k < 0) return null;
    const g = groups[k];
    const mid = g.s + Math.ceil((g.e - g.s) / 2);
    groups.splice(k, 1, { s: g.s, e: mid }, { s: mid, e: g.e });
  }
  return groups.length === N ? groups : null;
}

/* ---------- 3. Dernier recours : découpage régulier ---------- */

function evenNuclei(len, N) {
  return Array.from({ length: N }, (_, k) => {
    const p = Math.min(len - 1, Math.floor(((k + 0.5) * len) / N));
    return { s: p, e: p + 1 };
  });
}

/* ---------- Frontières entre noyaux ---------- */

/** Nombre de lettres de `gap` qui restent avec la syllabe précédente. */
function splitGap(gap) {
  const sep = Math.max(gap.lastIndexOf("'"), gap.lastIndexOf('-'));
  if (sep >= 0) return sep + 1;                                           // j' | écris
  if (gap === 'x') return 1;                                              // ex|emple
  // semi-voyelle devant la voyelle suivante : at|ten|tion (le « ti » reste groupé)
  if (gap.length >= 2 && /[iuy]$/.test(gap) && !/[iuy]$/.test(gap.slice(0, -1))) return splitGap(gap.slice(0, -1));
  const n = gap.length;
  if (n <= 1) return 0;
  const e = gap.indexOf('e');                                             // e caduc : sam|e|di → « same|di »
  if (e >= 0) return e + 1;
  const tail = gap.slice(-2);
  if (/^[bcdfgkptv][rl]$/.test(tail) || /^(ch|ph|th|gn|qu|sh)$/.test(tail)) return n - 2;
  return n - 1;
}

function cut(token, nuclei, classes) {
  const N = nuclei.length;
  const ns = nuclei.map((n) => ({ ...n })).sort((a, b) => a.s - b.s);
  for (let k = 1; k < N; k++) if (ns[k].s < ns[k - 1].e) ns[k].s = ns[k - 1].e;   // jamais de chevauchement
  const bounds = [0];
  for (let k = 0; k < N - 1; k++) {
    const gap = token.slice(ns[k].e, Math.max(ns[k].e, ns[k + 1].s));
    bounds.push(ns[k].e + splitGap(gap));
  }
  bounds.push(token.length);
  return classes.map((cls, k) => ({ start: bounds[k], end: bounds[k + 1], cls }));
}

/**
 * @param {string} token mot tel qu'écrit (casse et accents conservés)
 * @returns {{start:number,end:number,cls:string}[]} syllabes (indices dans `token`), une par voyelle prononcée
 */
export function syllabify(token, opts = DEFAULT_OPTS) {
  const key = `${opts.elision ? 1 : 0}|${token}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { syllables: N, vowels: classes } = analyzeWord(token, opts);
  let result = [];
  if (N > 0) {
    const word = normalize(token);
    let nuclei = null;
    if (word.length === token.length && !/\d/.test(word)) {
      nuclei = alignedNuclei(word, opts.elision);
      if (nuclei.length !== N) nuclei = letterGroupNuclei(word, N);
    }
    if (!nuclei || nuclei.length !== N) nuclei = evenNuclei(token.length, N);
    result = cut(token, nuclei, classes);
  }
  cache.set(key, result);
  return result;
}
