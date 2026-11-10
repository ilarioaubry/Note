import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWord, countSyllables } from '../js/engine/phonetics.js';
import { analyzeText } from '../js/engine/analyzer.js';
import { topTics } from '../js/engine/repetition.js';
import { findRhymes } from '../js/engine/rhymeDictionary.js';

const syl = (t, opts) => countSyllables(t, opts);
const vowels = (w) => analyzeWord(w).vowels.join('-');

test('e muet final et terminaisons muettes', () => {
  assert.equal(syl('monde'), 1);
  assert.equal(syl('mondes'), 1);
  assert.equal(syl('ils chantent'), 2);
  assert.equal(syl('elles parlent'), 2);
  assert.equal(syl('ils aiment'), 2);
  assert.equal(syl('je'), 1);
  assert.equal(syl('que'), 1);
});

test('-ent prononcé [ɑ̃]', () => {
  assert.equal(syl('moment'), 2);
  assert.equal(syl('souvent'), 2);
  assert.equal(syl('argent'), 2);
  assert.equal(syl('vent'), 1);
  assert.equal(syl('vraiment'), 2);
});

test('élisions et apostrophes', () => {
  assert.equal(syl("j'suis"), 1);
  assert.equal(syl('je suis'), 2);
  assert.equal(syl("t'as"), 1);
  assert.equal(syl("p'tit"), 1);
  assert.equal(syl("y'a"), 1);
  assert.equal(syl("aujourd'hui"), 3);
  assert.equal(syl("J'écris la nuit quand la ville s'endort"), 9);
});

test('flow parlé : e caducs internes', () => {
  assert.equal(syl('maintenant', { elision: true }), 2);
  assert.equal(syl('maintenant', { elision: false }), 3);
  assert.equal(syl('samedi', { elision: true }), 2);
  assert.equal(syl('appartement', { elision: true }), 4);
});

test('semi-voyelles et diphtongues', () => {
  assert.equal(syl('nuit'), 1);
  assert.equal(syl('lumière'), 2);
  assert.equal(syl('famille'), 2);
  assert.equal(syl('attention'), 3);
  assert.equal(syl('crier'), 2);
});

test('nombres en toutes lettres', () => {
  assert.equal(syl('16'), 1);
  assert.equal(syl('93'), 3); // quatre-vingt-treize, « quatre » = 1 syllabe en parlé
});

test('voyelles toniques (assonances)', () => {
  assert.equal(vowels('maison'), 'E-on');
  assert.equal(vowels('enfant'), 'an-an');
  assert.equal(vowels('moi'), 'wa');
  assert.equal(vowels('jour'), 'u');
  assert.equal(vowels('bien'), 'in');
  assert.equal(vowels('rue'), 'y');
  assert.equal(vowels('feu'), 'eu');
  assert.equal(vowels('été'), 'e-e');
});

test('rimes de fin de ligne et multis', () => {
  const r = analyzeText("J'marche dans la nuit noire\nJ'cherche un peu d'espoir\nToujours la même histoire", { mode: 'rimes' });
  const ends = r.lines.map((l) => l.words.at(-1));
  assert.ok(ends.every((w) => w.endRhyme), 'noire / espoir / histoire riment');
});

test('régularité syllabique', () => {
  const r = analyzeText('un deux trois quatre\ncinq six sept huit\nun deux trois quatre cinq six sept huit neuf');
  assert.equal(r.lines[1].status, 'ok');
  assert.equal(r.lines[2].status, 'off');
});

test('radar à tics ignore les mots outils', () => {
  const top = topTics(['le rêve et le rêve', 'mon rêve, ma rue, la rue']);
  assert.equal(top[0].lemma, 'rêve');
  assert.equal(top[0].count, 3);
  assert.ok(!top.some((t) => t.lemma === 'le'));
});

test('boîte à rimes', () => {
  const r = findRhymes('nuit');
  assert.ok(r.rimes.includes('bruit') || r.riches.includes('bruit'));
});
