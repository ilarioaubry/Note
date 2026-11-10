import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText } from '../js/engine/analyzer.js';
import {
  buildSystem, formatBank, numberText, analysisPrompt, suggestPrompt, resolveIdea, normalizeAnalysis,
  normalizeSuggestions, hashText, ANALYSIS_SCHEMA, SUGGEST_SCHEMA, PROFILE_SCHEMA, IDEAS_SCHEMA, SYNTHESIS_SCHEMA,
  REFS_SCHEMA, formatRefs, resolveRef, normalizeGoals, normalizeRefSuggestions,
} from '../js/ai/prompts.js';
import { estimateCost } from '../js/ai/client.js';
import { ideaUsage, albumReport } from '../js/engine/project.js';

const ideas = [{ id: 'a1', text: 'ma mère prie pour moi\nchaque soir' }, { id: 'b2', text: 'la thune et le béton' }];

test('contexte : rôle, puis banque et profil avec point de cache', () => {
  const sys = buildSystem({ ideas, profile: null });
  assert.equal(sys.length, 3);
  assert.equal(sys[0].cache_control, undefined);
  assert.deepEqual(sys[1].cache_control, { type: 'ephemeral', ttl: '1h' });
  assert.ok(sys[1].text.includes('[I1] ma mère prie pour moi / chaque soir'));
  assert.ok(sys[1].text.includes('[I2] la thune et le béton'));
  // préfixe stable : mêmes entrées → mêmes octets (condition du cache)
  assert.equal(JSON.stringify(buildSystem({ ideas, profile: null })), JSON.stringify(sys));
  assert.ok(formatBank([]).includes('vide'));
});

test('texte numéroté comme dans l\'éditeur, avec les syllabes du moteur local', () => {
  const { lines } = analyzeText("[Couplet]\nj'écris la nuit\n\nle jour se lève");
  const t = numberText(lines);
  assert.ok(t.startsWith('L1: [Couplet]\nL2: j\'écris la nuit   (4 syl.)\nL3: \nL4: le jour se lève'));
  assert.ok(analysisPrompt({ title: 'Test', lines }).includes('« Test »'));
  const p = suggestPrompt({ title: 'Test', lines, index: 2, target: 4, rhymeWith: 'nuit' });
  assert.ok(p.includes('L3') && p.includes('vide') && p.includes('« nuit »') && p.includes('4 syllabes'));
});

test('étiquettes d\'idées → identifiants réels', () => {
  assert.equal(resolveIdea('I1', ideas), 'a1');
  assert.equal(resolveIdea('I2', ideas), 'b2');
  assert.equal(resolveIdea('I9', ideas), null);
  assert.equal(resolveIdea('n\'importe quoi', ideas), null);
});

test('analyse nettoyée : lignes hors texte et idées inconnues écartées', () => {
  const a = normalizeAnalysis({
    resume: ' Un texte. ', intention: 'confession', mood: 'sombre', fil: 'tient',
    themes: [{ nom: 'la mère', lignes: [2, 99] }, { nom: '', lignes: [] }],
    figures: [{ type: 'métaphore', ligne: 2, extrait: 'x', effet: 'y' }, { type: 'bug', ligne: 0, extrait: '', effet: '' }],
    points_forts: [{ ligne: 2, extrait: 'x', pourquoi: 'y' }],
    a_retravailler: [{ ligne: 400, extrait: 'x', probleme: 'p', piste: 'q' }],
    idees_utilisees: [{ idee: 'I1', ligne: 2, comment: 'reformulée' }, { idee: 'I7', ligne: 2, comment: '' }, { idee: 'I1', ligne: 3, comment: 'doublon' }],
    idees_a_placer: [{ idee: 'I1', pourquoi: 'déjà utilisée' }, { idee: 'I2', pourquoi: 'colle' }],
  }, { lineCount: 4, ideas });
  assert.equal(a.resume, 'Un texte.');
  assert.deepEqual(a.themes, [{ nom: 'la mère', lignes: [2] }]);
  assert.equal(a.figures.length, 1);
  assert.equal(a.a_retravailler.length, 0);
  assert.deepEqual(a.idees_utilisees.map((x) => x.id), ['a1']);
  assert.deepEqual(a.idees_a_placer.map((x) => x.id), ['b2']);
});

test('suggestions nettoyées', () => {
  const s = normalizeSuggestions({ fins: [{ texte: '  dans le noir ' }, { texte: '' }], suites: [{ texte: 'une ligne', idee: 'I2' }, { texte: 'autre', idee: '' }] }, ideas);
  assert.deepEqual(s.fins, ['dans le noir']);
  assert.deepEqual(s.suites, [{ texte: 'une ligne', ideaId: 'b2', refId: null }, { texte: 'autre', ideaId: null, refId: null }]);
});

test('schémas valides pour les sorties structurées (objets fermés, tout requis)', () => {
  const check = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual(s.required, Object.keys(s.properties));
      Object.values(s.properties).forEach(check);
    } else if (s.type === 'array') check(s.items);
  };
  [ANALYSIS_SCHEMA, SUGGEST_SCHEMA, PROFILE_SCHEMA, IDEAS_SCHEMA, SYNTHESIS_SCHEMA, REFS_SCHEMA].forEach(check);
});

test('empreinte de texte et estimation de coût', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  const c = estimateCost({ input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000 }, 'claude-opus-5-5');
  assert.equal(Number(c.toFixed(2)), 6.2);   // 4 $ + 2 $ + 0,20 $
});

test('idée reformulée : reconnue grâce à l\'analyse IA d\'un texte validé', () => {
  const texts = [{ id: 't1', title: 'Son 1', status: 'valide', text: 'la daronne a usé ses genoux sur le tapis' }];
  assert.equal(ideaUsage(ideas, texts).get('a1').length, 0, 'aucun mot commun : le repérage local ne la voit pas');
  const analyses = { t1: { data: { themes: [{ nom: 'La mère', lignes: [1] }], idees_utilisees: [{ id: 'a1', ligne: 1 }] } } };
  const usage = ideaUsage(ideas, texts, analyses);
  assert.equal(usage.get('a1').length, 1);
  const r = albumReport(texts, ideas, usage, analyses);
  assert.equal(r.used, 1);
  assert.equal(r.covered[0].label, 'La mère');
});

const refs = [
  { id: 'r1', kind: 'artiste', text: 'Nekfeu', note: "l'introspection" },
  { id: 'o1', kind: 'objectif', text: 'un son sur mon père' },
  { id: 'r2', kind: 'reference', text: 'Scarface' },
  { id: 'o2', kind: 'objectif', text: 'un refrain chanté', done: true },
];

test('références (R…) et objectifs (O…) dans le contexte mis en cache', () => {
  const t = formatRefs(refs);
  assert.ok(t.includes("[R1] (artiste) Nekfeu — l'introspection"));
  assert.ok(t.includes('[R2] (référence) Scarface'));
  assert.ok(t.includes('[O1] un son sur mon père'));
  assert.ok(t.includes('[O2] un refrain chanté (il le considère comme fait)'));
  const sys = buildSystem({ ideas, profile: null, refs });
  assert.equal(sys.length, 3);
  assert.ok(sys[1].text.includes('[I1]') && sys[1].text.includes('[R1]'), 'idées et références dans le même bloc en cache');
  assert.equal(resolveRef('R2', refs, 'R'), 'r2');
  assert.equal(resolveRef('O1', refs, 'O'), 'o1');
  assert.equal(resolveRef('O3', refs, 'O'), null);
});

test('analyse : références culturelles et objectifs touchés', () => {
  const a = normalizeAnalysis({
    resume: 'x', intention: '', mood: '', fil: '', themes: [], figures: [], points_forts: [], a_retravailler: [],
    idees_utilisees: [], idees_a_placer: [],
    references_culturelles: [{ ligne: 2, reference: 'Scarface', explication: "l'ascension", tag: 'R2' }, { ligne: 3, reference: 'Zidane', explication: 'le coup de tête', tag: '' }],
    objectifs_touches: [{ objectif: 'O1', ligne: 2, comment: 'le père apparaît' }, { objectif: 'O9', ligne: 2, comment: '' }],
    piste_reference: 'R1 pour la fin',
  }, { lineCount: 4, ideas, refs });
  assert.deepEqual(a.references_culturelles.map((x) => [x.reference, x.refId]), [['Scarface', 'r2'], ['Zidane', null]]);
  assert.deepEqual(a.objectifs_touches.map((x) => x.id), ['o1']);
  assert.equal(a.piste_reference, 'R1 pour la fin');
});

test('bilan des objectifs et suggestions de références', () => {
  const g = normalizeGoals([{ objectif: 'O1', statut: 'partiel', ou: 'Son 2' }, { objectif: 'O2', statut: 'bof', ou: '' }], refs);
  assert.deepEqual([...g], [['o1', { statut: 'partiel', ou: 'Son 2' }]]);
  const r = normalizeRefSuggestions({ suggestions: [{ nom: 'Nekfeu', type: 'artiste', pourquoi: 'déjà là' }, { nom: 'La Haine', type: 'reference', pourquoi: 'la banlieue' }] }, refs);
  assert.deepEqual(r.map((x) => [x.nom, x.kind]), [['La Haine', 'reference']]);
});

test('objectifs : coché, réalisé dans un son validé, en cours, ou d\'après la synthèse', async () => {
  const { goalStatus } = await import('../js/engine/project.js');
  const projects = [{ id: 't1', title: 'Son 1', status: 'valide' }, { id: 't2', title: 'Brouillon', status: 'brouillon' }];
  const analyses = { t1: { data: { objectifs_touches: [{ id: 'o1' }] } }, t2: { data: { objectifs_touches: [{ id: 'o3' }] } } };
  const syntheses = { __all__: { at: 1, data: { goals: [['o4', { statut: 'partiel', ou: 'effleuré dans Son 1' }]] } } };
  const ctx = { projects, analyses, syntheses };
  assert.equal(goalStatus({ id: 'o1' }, ctx).statut, 'fait');
  assert.equal(goalStatus({ id: 'o2', done: true }, ctx).source, 'main');
  assert.equal(goalStatus({ id: 'o3' }, ctx).statut, 'partiel');
  assert.deepEqual(goalStatus({ id: 'o4' }, ctx), { statut: 'partiel', ou: 'effleuré dans Son 1', source: 'synthese' });
  assert.equal(goalStatus({ id: 'o5' }, ctx).statut, 'manquant');
});
