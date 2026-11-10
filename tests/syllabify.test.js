import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { syllabify, clearSyllableCache } from '../js/engine/syllabify.js';
import { analyzeWord, countSyllables, clearCache } from '../js/engine/phonetics.js';
import { loadLexique } from '../js/engine/lexicon.js';

const cut = (w) => syllabify(w).map((s) => w.slice(s.start, s.end)).join('|');

test('découpe en syllabes écrites', () => {
  assert.equal(cut("J'écris"), "J'é|cris");
  assert.equal(cut('nuit'), 'nuit');
  assert.equal(cut('monde'), 'monde');
  assert.equal(cut('stylo'), 'sty|lo');
  assert.equal(cut('maintenant'), 'mainte|nant');
  assert.equal(cut('samedi'), 'same|di');
  assert.equal(cut('attention'), 'at|ten|tion');
  assert.equal(cut("j'suis"), "j'suis");
  assert.equal(cut('oiseau'), 'oi|seau');
});

test('une syllabe par voyelle prononcée, sans trou, y compris avec Lexique 3', async () => {
  const lex = JSON.parse(readFileSync(new URL('../data/lexique.json', import.meta.url), 'utf8'));
  const n = await loadLexique(lex);
  clearCache(); clearSyllableCache();
  assert.ok(n > 100000, `Lexique chargé (${n} entrées)`);
  const words = Object.keys(lex).filter((_, i) => i % 11 === 0);
  for (const w of words) {
    const sy = syllabify(w);
    assert.equal(sy.length, analyzeWord(w).syllables, w);
    if (!sy.length) continue;
    assert.equal(sy[0].start, 0, w);
    assert.equal(sy.at(-1).end, w.length, w);
    sy.forEach((s, i) => { if (i) assert.equal(s.start, sy[i - 1].end, w); });
  }
});

test('Lexique 3 : mots courants et flow parlé', () => {
  assert.equal(countSyllables('cœur'), 1);
  assert.equal(countSyllables('maintenant'), 2);   // élision appliquée aussi aux mots du dictionnaire
  assert.equal(countSyllables('beaucoup'), 2);
  assert.equal(countSyllables('monde'), 1);
  assert.equal(countSyllables("J'écris la nuit quand la ville s'endort"), 9);
});
