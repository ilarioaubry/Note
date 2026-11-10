/**
 * Analyse d'un texte complet : lignes → mots → phonétique, puis détection
 * des rimes / assonances / multisyllabiques et régularité syllabique.
 *
 * Aucune dépendance DOM : testable dans Node.
 */
import { analyzeWord, tokenize, normalize, matchClass, DEFAULT_OPTS } from './phonetics.js';
import { isStopword } from './stopwords.js';
import { syllabify } from './syllabify.js';

export const WINDOW = 3;          // fenêtre glissante : ligne courante + 3 voisines = 4 lignes
const MULTI_MAX = 4;
const MULTI_MIN = 2;

const META_RE = /^\s*[\[#]/;      // [Couplet 1], # Refrain…

/** Mot « lemme » pour les répétitions : dernier segment après apostrophe, sans pluriel. */
export function lemmaOf(token) {
  let w = normalize(token).split("'").filter(Boolean).pop() ?? '';
  if (w.length > 3 && /[sx]$/.test(w) && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

function analyzeLine(text, index, opts) {
  const isMeta = META_RE.test(text);
  const isEmpty = text.trim() === '';
  const words = [];
  let syl = 0;
  if (!isMeta && !isEmpty) {
    for (const tok of tokenize(text)) {
      const a = analyzeWord(tok.text, opts);
      const lemma = lemmaOf(tok.text);
      words.push({
        ...tok, ...a,
        lemma,
        isStop: isStopword(lemma) || lemma.length < 2,
        sylStart: syl,
        // une entrée par syllabe prononcée : { start, end (dans le mot), cls, hl, rich, endRhyme, multi }
        syls: syllabify(tok.text, opts).map((x) => ({ ...x, hl: null, rich: false, endRhyme: false, multi: null })),
        rep: false,
      });
      syl += a.syllables;
    }
  }
  return {
    index, text, isMeta, isEmpty, words,
    syllables: syl,
    signature: words.flatMap((w) => w.vowels),
    status: 'neutral', reference: null,
  };
}

/**
 * @param {string} text
 * @param {object} opts { elision, strict, mode: 'rimes'|'assonances' }
 */
export function analyzeText(text, opts = {}) {
  const o = { ...DEFAULT_OPTS, mode: 'assonances', ...opts };
  const lines = text.split('\n').map((t, i) => analyzeLine(t, i, o));

  // Séquence des lignes de texte (hors vides/titres), groupées par section ([Couplet], [Refrain]…)
  const seq = [];
  let group = 0;
  for (const l of lines) {
    if (l.isMeta) { group++; continue; }
    if (!l.isEmpty && l.words.length) seq.push({ line: l, group });
  }

  detectRhymes(seq, o);
  detectMultis(seq, o);
  computeRegularity(lines);
  return { lines, opts: o };
}

/* ---------------- Rimes & assonances ---------------- */

function rhymeId(w, o) {
  if (!w.tonic || w.tonic === 'schwa') return null;
  return o.mode === 'rimes' ? w.rhymeKey : matchClass(w.tonic, o.strict);
}

const tail2 = (w, strict) => w.vowels.slice(-2).map((c) => matchClass(c, strict)).join('-');
const sameTail = (w, v, strict) => w.vowels.length > 1 && v.vowels.length > 1 && tail2(w, strict) === tail2(v, strict);

/** Colore la syllabe tonique du mot (et la précédente si la rime est riche). */
function markTonic(w, rich, strict) {
  const n = w.syls.length;
  if (!n) return;
  const last = w.syls[n - 1];
  last.hl = matchClass(last.cls, strict);
  last.rich = rich;
  if (rich && n > 1 && w.syls[n - 2].cls !== 'schwa') {
    w.syls[n - 2].hl = matchClass(w.syls[n - 2].cls, strict);
    w.syls[n - 2].rich = true;
  }
}

function detectRhymes(seq, o) {
  // Candidats : mots pleins + dernier mot de chaque ligne
  const cands = seq.map(({ line }) => line.words.filter((w, i) => !w.isStop || i === line.words.length - 1));

  for (let a = 0; a < seq.length; a++) {
    for (const w of cands[a]) {
      const id = rhymeId(w, o);
      if (!id) continue;
      let hit = false, rich = false;
      for (let b = Math.max(0, a - WINDOW); b <= Math.min(seq.length - 1, a + WINDOW); b++) {
        if (seq[b].group !== seq[a].group) continue;
        for (const v of cands[b]) {
          if (v === w || rhymeId(v, o) !== id) continue;
          if (v.lemma === w.lemma) continue;                      // même mot = répétition, pas rime
          hit = true;
          if (w.rhymeKey === v.rhymeKey && sameTail(w, v, o.strict)) rich = true;   // rime riche : 2 dernières voyelles
        }
      }
      if (hit) markTonic(w, rich, o.strict);
    }
  }

  // Rimes de fin de ligne (sur le dernier mot)
  for (let a = 0; a < seq.length; a++) {
    const wa = seq[a].line.words.at(-1);
    const id = rhymeId(wa, o);
    if (!id) continue;
    for (let b = Math.max(0, a - WINDOW); b <= Math.min(seq.length - 1, a + WINDOW); b++) {
      if (b === a || seq[b].group !== seq[a].group) continue;
      if (rhymeId(seq[b].line.words.at(-1), o) === id) { const t = wa.syls.at(-1); if (t) t.endRhyme = true; break; }
    }
  }
}

/* ---------------- Multisyllabiques ---------------- */

function detectMultis(seq, o) {
  // Syllabes de chaque ligne : { cls, word }
  const syls = seq.map(({ line }) => line.words.flatMap((w) =>
    w.vowels.map((c, k) => ({ cls: matchClass(c, o.strict), word: w, syl: w.syls[k], last: k === w.vowels.length - 1 }))));
  const claimed = syls.map((s) => new Array(s.length).fill(false));
  let groupId = 0;

  for (let n = MULTI_MAX; n >= MULTI_MIN; n--) {
    // key → occurrences
    const occ = new Map();
    syls.forEach((s, li) => {
      for (let end = n - 1; end < s.length; end++) {
        if (!s[end].last || s[end].word.isStop) continue;          // finit sur un mot plein, sur sa tonique
        const span = s.slice(end - n + 1, end + 1);
        if (span.some((x) => x.cls === 'schwa')) continue;
        if (n === 2 && span[0].word.isStop) continue;              // évite « la nuit » / « la vie » partout
        const key = span.map((x) => x.cls).join('-');
        const text = [...new Set(span.map((x) => x.word))].map((w) => w.lemma).join(' ');
        if (!occ.has(key)) occ.set(key, []);
        occ.get(key).push({ li, start: end - n + 1, end, text });
      }
    });

    for (const list of occ.values()) {
      if (list.length < 2) continue;
      const keep = new Set();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const A = list[i], B = list[j];
          if (Math.abs(A.li - B.li) > WINDOW || seq[A.li].group !== seq[B.li].group) continue;
          if (A.li === B.li && !(A.end < B.start || B.end < A.start)) continue;   // chevauchement
          if (A.text === B.text) continue;                                         // simple répétition
          keep.add(A); keep.add(B);
        }
      }
      const free = [...keep].filter((x) => !claimed[x.li].slice(x.start, x.end + 1).some(Boolean));
      if (free.length < 2) continue;
      const gid = groupId++;
      for (const x of free) {
        for (let k = x.start; k <= x.end; k++) {
          claimed[x.li][k] = true;
          const sy = syls[x.li][k].syl;
          if (sy && sy.multi === null) sy.multi = gid;
        }
      }
    }
  }
}

/* ---------------- Régularité syllabique ---------------- */

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function computeRegularity(lines) {
  let block = [];
  for (const l of lines) {
    if (l.isMeta || l.isEmpty) { block = []; continue; }
    if (block.length) {
      const ref = median(block.slice(-4));
      const diff = Math.abs(l.syllables - ref);
      l.reference = ref;
      l.status = diff <= 1 ? 'ok' : diff <= 3 ? 'warn' : 'off';
    }
    block.push(l.syllables);
  }
}

/* ---------------- Grille 4/4 ---------------- */

/**
 * Répartit les syllabes d'une ligne sur 4 temps.
 * @returns {Map<number, number[]>} index du mot → temps (1-4) qui commencent sur ce mot
 */
export function beatMarkers(line) {
  const map = new Map();
  const S = line.syllables;
  if (!S) return map;
  for (let beat = 0; beat < 4; beat++) {
    const target = Math.floor((beat * S) / 4);
    const idx = line.words.findIndex((w) => target >= w.sylStart && target < w.sylStart + Math.max(1, w.syllables));
    if (idx < 0) continue;
    if (!map.has(idx)) map.set(idx, []);
    map.get(idx).push(beat + 1);
  }
  return map;
}
