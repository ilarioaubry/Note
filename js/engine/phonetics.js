/**
 * Moteur phonétique & syllabique « Spoken / Rap » — aucune dépendance DOM.
 *
 * API principale :
 *   analyzeWord(token, opts) → { phon, ipa, vowels, syllables, tonic, coda, rhymeKey }
 *   countSyllables(text, opts) → nombre
 *   vowelSignature(text, opts) → ['a', 'i', 'an', ...]
 *
 * Pipeline pour un mot :
 *   normalisation → découpe aux tirets/apostrophes (j'suis = j' + suis)
 *   → dictionnaire (lexicon.js) sinon règles G2P (rules.js)
 *   → résolution des e muets → élision optionnelle des e caducs internes
 */
import { applyRules, MUTE_E, MUTE_ENT } from './rules.js';
import { lookup } from './lexicon.js';
import { KEEP_FINAL_S, KEEP_FINAL_X } from './exceptions.js';
import { numberToWords } from './numbers.js';

/** Phonèmes vocaliques (notation Lexique). */
export const VOWEL_PHONES = new Set(['a', 'i', 'e', 'E', 'o', 'O', 'u', 'y', '2', '9', '°', '@', '5', '1', '§']);
const VOWEL_CHARS = 'aieEoOuy29°@51§';

/** Phonème → classe d'assonance (clé CSS). */
const PHONE_CLASS = {
  a: 'a', e: 'e', E: 'E', i: 'i', o: 'o', O: 'o', u: 'u', y: 'y',
  2: 'eu', 9: 'eu', '°': 'schwa', '@': 'an', 5: 'in', 1: 'in', '§': 'on',
};

/** Classe → libellé lisible par un rappeur. */
export const CLASS_LABEL = {
  a: 'a', e: 'é', E: 'è', i: 'i', o: 'o', u: 'ou', y: 'u', eu: 'eu',
  schwa: 'e', an: 'an', in: 'in', on: 'on', wa: 'oi',
};

const IPA = {
  E: 'ɛ', O: 'ɔ', 2: 'ø', 9: 'œ', '°': 'ə', '@': 'ɑ̃', 5: 'ɛ̃', 1: 'œ̃', '§': 'ɔ̃',
  R: 'ʁ', S: 'ʃ', Z: 'ʒ', N: 'ɲ', G: 'ŋ', 8: 'ɥ',
};

export const DEFAULT_OPTS = {
  elision: true,   // « maint'nant », « sam'di » : e caducs internes non comptés
  strict: false,   // false : é/è fusionnés pour la détection de rimes
};

const cache = new Map();

/** Minuscules, apostrophes typographiques unifiées. */
export function normalize(word) {
  return word.normalize('NFC').toLowerCase().replace(/[’`´ʼ]/g, "'").replace(/æ/g, 'ae');
}

/** Retire le -s / -x final muet (pluriels, 2e personne…). */
function stripSilentFinal(w) {
  if (w.length >= 2 && w.endsWith('s') && !w.endsWith('ss') && !KEEP_FINAL_S.has(w)) w = w.slice(0, -1);
  if (w.length > 2 && /(?:ux|ix|aix|oix)$/.test(w) && !KEEP_FINAL_X.has(w)) w = w.slice(0, -1);
  return w;
}

/** Remplace les marqueurs ~ / ^ : prononcés seulement si le mot n'a pas d'autre voyelle. */
function resolveMutes(phon) {
  const hasVowel = [...phon].some((c) => VOWEL_PHONES.has(c));
  if (hasVowel) return phon.replace(/[~^]/g, '');
  let done = false;
  return phon.replace(/[~^]/g, (m) => {
    if (done) return '';
    done = true;
    return m === MUTE_E ? '°' : '@';
  });
}

/** Loi des trois consonnes simplifiée : V C ə C → V C C (samedi → sam'di). */
const ELISION_RE = new RegExp(`(?<=[${VOWEL_CHARS}][^${VOWEL_CHARS}jw8])°(?=[^${VOWEL_CHARS}jw8])`, 'gu');
function elideSchwas(phon) {
  return phon.replace(ELISION_RE, '');
}

/** Transcrit un segment simple (sans apostrophe ni tiret). */
function segmentToPhon(seg, isElidedPrefix) {
  if (!seg) return '';
  if (isElidedPrefix) {
    if (seg === 'y') return 'j';                          // y'a → [ja]
    if (!/[aeiouyàâéèêîôû]/.test(seg.slice(-1))) {
      // j' t' l' qu' jusqu' : on transcrit comme « je, te… » puis on retire le e
      return applyRules(seg + 'e').replace(/[~^]/g, '');
    }
  }
  const direct = lookup(seg);
  if (direct !== undefined) return direct;
  const stripped = stripSilentFinal(seg);
  const viaStripped = lookup(stripped);
  if (viaStripped !== undefined) return viaStripped;
  return resolveMutes(applyRules(stripped));
}

/** Transcription phonétique d'un mot (notation Lexique). */
export function wordToPhon(token, opts = DEFAULT_OPTS) {
  const word = normalize(token);
  const key = `${opts.elision ? 1 : 0}|${word}`;
  if (cache.has(key)) return cache.get(key);

  let phon;
  if (/^\d+$/.test(word)) {
    phon = numberToWords(Number(word)).split(/[\s-]+/).map((w) => wordToPhon(w, opts)).join('');
  } else {
    const whole = lookup(word);
    if (whole !== undefined) {
      phon = whole;
    } else {
      phon = word.split('-').map((part) => {
        const segs = part.split("'");
        return segs.map((s, i) => {
          const p = segmentToPhon(s, i < segs.length - 1);
          return opts.elision ? elideSchwas(p) : p;
        }).join('');
      }).join('');
    }
  }
  cache.set(key, phon);
  return phon;
}

/** Liste des voyelles d'une transcription : [{ phone, cls, index }]. « wa » = une seule voyelle [oi]. */
export function vowelsOf(phon) {
  const out = [];
  for (let i = 0; i < phon.length; i++) {
    const c = phon[i];
    if (!VOWEL_PHONES.has(c)) continue;
    const cls = c === 'a' && phon[i - 1] === 'w' ? 'wa' : PHONE_CLASS[c];
    out.push({ phone: c, cls, index: i });
  }
  return out;
}

/** Classe utilisée pour comparer (fusion é/è en mode non strict). */
export function matchClass(cls, strict = false) {
  if (!strict && cls === 'E') return 'e';
  return cls;
}

export function toIPA(phon) {
  return [...phon].map((c) => IPA[c] ?? c).join('');
}

/** Analyse complète d'un mot. */
export function analyzeWord(token, opts = DEFAULT_OPTS) {
  const phon = wordToPhon(token, opts);
  const vowels = vowelsOf(phon);
  const last = vowels[vowels.length - 1];
  const tonic = last ? last.cls : null;
  const coda = last ? phon.slice(last.index + 1) : '';
  const rhymeKey = last ? `${matchClass(tonic, opts.strict)}|${coda}` : null;
  return {
    phon,
    ipa: toIPA(phon),
    vowels: vowels.map((v) => v.cls),
    syllables: vowels.length,
    tonic,
    coda,
    rhymeKey,
  };
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*['’]?/gu;

/** Découpe une ligne en tokens avec positions. */
export function tokenize(line) {
  const out = [];
  for (const m of line.matchAll(WORD_RE)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

export function countSyllables(text, opts = DEFAULT_OPTS) {
  return tokenize(text).reduce((n, t) => n + analyzeWord(t.text, opts).syllables, 0);
}

export function vowelSignature(text, opts = DEFAULT_OPTS) {
  return tokenize(text).flatMap((t) => analyzeWord(t.text, opts).vowels);
}

/** Vide le cache (après chargement d'un nouveau dictionnaire). */
export function clearCache() { cache.clear(); }
