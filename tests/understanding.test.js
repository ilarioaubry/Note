import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText } from '../js/engine/analyzer.js';
import { detectThemes, detectMood, keywords } from '../js/engine/themes.js';
import { detectFigures } from '../js/engine/figures.js';
import { splitNote, isIdeaUsed, soundsLike } from '../js/engine/ideas.js';
import { setUserEntry, removeUserEntry } from '../js/engine/lexicon.js';
import { analyzeWord, clearCache } from '../js/engine/phonetics.js';
import { registerWords, findRhymes } from '../js/engine/rhymeDictionary.js';

const types = (text) => detectFigures(analyzeText(text)).map((f) => f.type);

test('thèmes : champs lexicaux, accents facultatifs', () => {
  const t = detectThemes("j'compte les billets, la thune et l'oseille\nles keufs tournent dans le quartier, la tess est calme");
  const ids = t.map((x) => x.id);
  assert.ok(ids.includes('argent'));
  assert.ok(ids.includes('rue'));
  assert.ok(ids.includes('justice'));
  assert.ok(detectThemes('mon reve de reussite').some((x) => x.id === 'ambition'), 'rêve sans accent');
});

test('humeur dominante', () => {
  const m = detectMood('seul dans la nuit, le froid, les larmes et le vide');
  assert.equal(m[0].id, 'sombre');
});

test('mots-clés propres au texte (TF-IDF)', () => {
  const k = keywords('la mer la mer encore la mer et le vent', ['le vent souffle', 'le vent tourne']);
  assert.equal(k[0], 'mer');
});

test('figures : anaphore, épiphore, comparaison, antithèse, paronomase, parallélisme, question', () => {
  assert.ok(types("j'veux la paix\nj'veux la gloire").includes('anaphore'));
  assert.ok(types('je cours vers toi\nje pense à toi').includes('epiphore'));
  assert.ok(types('je brille comme une étoile').includes('comparaison'));
  assert.ok(types('le jour se lève\net la nuit tombe').includes('antithese'));
  assert.ok(types('une rime pour un crime').includes('paronomase'));
  assert.ok(types('on garde la flamme, on garde le cap').includes('parallelisme'));
  assert.ok(types('qui peut me juger ?').includes('question'));
  assert.ok(types('la vie est une chienne').includes('metaphore'));
});

test('figures : allitération en p repérée', () => {
  const f = detectFigures(analyzeText('pas peur de perdre, je prends le pouvoir'));
  assert.ok(f.some((x) => x.type === 'alliteration' && x.detail.includes('p')));
});

test('note découpée en idées (lignes vides, tirets, dates)', () => {
  const note = "première idée\nsur deux lignes\n\n---\nidée deux\n12/03/24\nidée trois\n\n\nidée deux";
  assert.deepEqual(splitNote(note), ['première idée\nsur deux lignes', 'idée deux', 'idée trois']);
});

test('idée dite dans un texte validé', () => {
  assert.ok(isIdeaUsed('la mer efface les traces de mes pas', "j'ai vu la mer effacer mes traces sur le sable"));
  assert.ok(!isIdeaUsed('la mer efface les traces de mes pas', 'rien à voir, la ville et le béton'));
  assert.ok(isIdeaUsed("j'écris la nuit quand la ville s'endort", "[Couplet]\nj'écris la nuit quand la ville s'endort\nsuite"));
});

test('« ça sonne avec » : rime riche d\'abord', () => {
  const ideas = [{ id: 'a', text: 'je vis comme un roi\nla foi\nun coup de bambou' }, { id: 'b', text: 'loin de toi, je perds la voix' }];
  const r = soundsLike('on avance avec la foi', ideas);
  assert.ok(r.length >= 2);
  assert.ok(r.every((x) => x.kind));
  assert.ok(!r.some((x) => x.text === 'un coup de bambou'));
});

test('dictionnaire perso : correction prioritaire et réversible', () => {
  const before = analyzeWord('wesh').phon;
  setUserEntry('wesh', analyzeWord('ouèche').phon);
  clearCache();
  assert.equal(analyzeWord('wesh').vowels.join(), analyzeWord('ouèche').vowels.join());
  removeUserEntry('wesh');
  clearCache();
  assert.equal(analyzeWord('wesh').phon, before);
});

test('boîte à rimes : tes mots en premier', () => {
  registerWords(['frisson', 'bastion']);
  const r = findRhymes('maison');
  const all = [...r.riches, ...r.rimes, ...r.assonances];
  assert.ok(all.indexOf('frisson') !== -1);
  assert.ok(all.indexOf('frisson') < all.indexOf('saison') || all.indexOf('saison') === -1);
});

test('projet : idées dites dans les sons validés, thèmes en attente', async () => {
  const { ideaUsage, albumReport } = await import('../js/engine/project.js');
  const texts = [
    { id: 't1', title: 'Son 1', status: 'valide', text: "les billets, la thune, l'oseille\nj'compte l'argent du quartier" },
    { id: 't2', title: 'Son 2', status: 'brouillon', text: 'ma mère, mon père, la famille' },
  ];
  const ideas = [
    { id: 'i1', text: "compter la thune et l'oseille" },
    { id: 'i2', text: 'la prière de ma mère, dieu et le paradis' },
  ];
  const usage = ideaUsage(ideas, texts);
  assert.equal(usage.get('i1').length, 1);
  assert.equal(usage.get('i2').length, 0);
  const r = albumReport(texts, ideas, usage);
  assert.equal(r.validated, 1);
  assert.ok(r.covered.some((t) => t.label === 'Argent'));
  assert.ok(r.waiting.some((t) => t.label === 'Foi / spiritualité'), 'la foi est dans les idées mais pas encore dans un son validé');
  assert.equal(r.free, 1);
});

test('thèmes : « la nuit tombe » ne parle pas de la mort', () => {
  assert.ok(!detectThemes('le jour se lève et la nuit tombe sur mes rêves').some((t) => t.id === 'mort'));
});

test('multi « chat qui rate » ↔ « shakira » : un seul groupe, deux passages', async () => {
  const { analyzeText } = await import('../js/engine/analyzer.js');
  const r = analyzeText("des troue dans chaque paire, dans chaque personne dans chaque mii\nj'suis le chat qui rate le rat, elle danse sur shakira,");
  const occ = new Map();
  for (const l of r.lines) for (const w of l.words) for (const s of w.syls) if (s.occ) occ.set(s.occ, [...(occ.get(s.occ) ?? []), w.text]);
  const passages = [...occ.values()].map((ws) => [...new Set(ws)].join(' '));
  assert.ok(passages.includes('chat qui rate'), passages.join(' | '));
  assert.ok(passages.includes('shakira'), passages.join(' | '));
  assert.equal(new Set([...occ.keys()].map((k) => k.split('.')[0])).size, 1, 'les deux passages sont dans le même groupe');
});

test('répétitions serrées : « dans chaque » ×3, mots outils compris', async () => {
  const { analyzeText } = await import('../js/engine/analyzer.js');
  const { markRepetitions } = await import('../js/engine/repetition.js');
  const r = analyzeText('des troue dans chaque paire, dans chaque personne dans chaque mii\nle jour se lève et la nuit tombe');
  markRepetitions(r.lines);
  const rep = (li) => r.lines[li].words.filter((w) => w.rep).map((w) => w.text);
  assert.deepEqual(rep(0), ['dans', 'chaque', 'dans', 'chaque', 'dans', 'chaque']);
  assert.deepEqual(rep(1), [], 'rien de répété');
  assert.ok(r.lines[0].words.find((w) => w.text === 'dans').isStop, '« dans » reste un mot outil');
});
