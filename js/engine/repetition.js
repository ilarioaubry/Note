/**
 * Détecteur de répétitions et « Radar à Tics ».
 */
import { tokenize } from './phonetics.js';
import { lemmaOf } from './analyzer.js';
import { isStopword } from './stopwords.js';

export const SECTION_SIZE = 16;   // « 16 mesures »

const isContent = (lemma) => lemma.length >= 3 && !isStopword(lemma) && !/^\d+$/.test(lemma);

/** Lemmes des mots pleins d'un texte (lignes de titre ignorées). */
export function contentLemmas(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (/^\s*[\[#]/.test(line)) continue;
    for (const t of tokenize(line)) {
      const l = lemmaOf(t.text);
      if (isContent(l)) out.push({ lemma: l, surface: t.text.toLowerCase() });
    }
  }
  return out;
}

/** Top N des mots pleins les plus utilisés sur un ensemble de textes. */
export function topTics(texts, n = 10) {
  const counts = new Map();
  const surface = new Map();
  for (const text of texts) {
    for (const { lemma, surface: s } of contentLemmas(text)) {
      counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
      if (!surface.has(lemma)) surface.set(lemma, s.includes("'") ? lemma : s);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([lemma, count]) => ({ lemma, word: surface.get(lemma), count }));
}

/**
 * Découpe les lignes analysées en sections : délimitées par les titres [..]/#,
 * et découpées en blocs de 16 lignes de texte au maximum.
 * @returns {Array<{start:number,end:number}>} indices de lignes inclusifs
 */
export function sectionsOf(lines) {
  const out = [];
  let start = null, count = 0;
  const close = (end) => { if (start !== null) out.push({ start, end }); start = null; count = 0; };
  lines.forEach((l, i) => {
    if (l.isMeta) { close(i - 1); return; }
    if (start === null) start = i;
    if (!l.isEmpty) count++;
    if (count === SECTION_SIZE) close(i);
  });
  close(lines.length - 1);
  return out.filter((s) => s.end >= s.start);
}

/** Mots pleins répétés dans une plage de lignes : Map lemme → { count, word, lines } */
export function repeatsInRange(lines, { start, end }) {
  const map = new Map();
  for (let i = start; i <= end; i++) {
    for (const w of lines[i]?.words ?? []) {
      if (w.isStop || !isContent(w.lemma)) continue;
      const e = map.get(w.lemma) ?? { count: 0, word: w.text.toLowerCase(), lemma: w.lemma, lines: new Set() };
      e.count++;
      e.lines.add(i);
      map.set(w.lemma, e);
    }
  }
  for (const [k, v] of map) if (v.count < 2) map.delete(k);
  return map;
}

/** Marque `w.rep = true` sur les mots répétés de chaque section. */
export function markRepetitions(lines) {
  const sections = sectionsOf(lines);
  for (const sec of sections) {
    const reps = repeatsInRange(lines, sec);
    for (let i = sec.start; i <= sec.end; i++) {
      for (const w of lines[i].words) if (reps.has(w.lemma)) w.rep = true;
    }
  }
  return sections;
}
