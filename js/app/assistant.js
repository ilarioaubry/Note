/**
 * Assistant : orchestre les fonctions IA et leur affichage.
 *
 *  - Analyse du texte : lancée à l'ouverture de l'onglet Analyse si le texte a changé (réglable),
 *    gardée en mémoire tant que le texte ne bouge pas (pas de double facturation).
 *  - Souffle-moi : propositions vérifiées par le moteur local (syllabes, rime).
 *  - Profil d'écriture : établi à la demande, rafraîchi quand un texte est validé.
 *  - Banque d'idées : classement des idées non lues ; les idées reconnues dans un texte validé
 *    (même reformulées) passent en « dites ».
 *  - Synthèse de projet.
 */
import { hasKey, loadAIConfig, MODELS } from '../ai/client.js';
import { analyzeWithAI, suggestWithAI, profileWithAI, classifyIdeasWithAI, synthesizeWithAI } from '../ai/features.js';
import { hashText } from '../ai/prompts.js';
import { analyzeWord, countSyllables } from '../engine/phonetics.js';

const isLyric = (l) => l && !l.isMeta && !l.isEmpty && l.words?.length > 0;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

export function createAssistant({ state, store, editor, current, views, refreshIdeas, albumTexts, analysisVisible, openSettings }) {
  const { analysisView, suggest, overview, ideasView, understanding } = views;
  const busy = { analysis: null, suggest: null, profile: false, synth: false, classify: false };
  const errors = { analysis: null, profile: null, synth: null, classify: null };
  let autoTried = null;          // empreinte du dernier texte analysé automatiquement (évite les boucles après une erreur)
  let lastSignature = '';
  let classifyProgress = { done: 0, total: 0 };

  const lines = () => state.analysis?.lines ?? [];
  const lyricCount = () => lines().filter(isLyric).length;
  const ideasById = () => new Map(state.ideas.map((i) => [i.id, i]));
  const profileData = () => state.profile?.data ?? null;

  /** Intitulés de thèmes déjà utilisés (idées classées, autres textes analysés) : l'IA les reprend d'un son à l'autre. */
  function knownThemes(exceptTextId) {
    const names = new Map();
    const add = (n) => { const k = n.trim().toLowerCase(); if (k && !names.has(k)) names.set(k, n.trim()); };
    state.ideas.forEach((i) => (i.ai?.themes ?? []).forEach(add));
    Object.entries(state.analyses).forEach(([id, a]) => { if (id !== exceptTextId) (a.data?.themes ?? []).forEach((t) => add(t.nom)); });
    return [...names.values()].slice(0, 40);
  }

  /* ---------------- Analyse du texte ---------------- */

  function renderAnalysis(force = false) {
    const p = current();
    if (!p) return;
    const stored = state.analyses[p.id];
    const loading = busy.analysis?.id === p.id;
    let st;
    if (loading) st = 'loading';
    else if (errors.analysis) st = 'error';
    else if (stored) st = 'ready';
    else if (!hasKey()) st = 'nokey';
    else if (lyricCount() < 2) st = 'empty';
    else st = 'idle';
    const stale = Boolean(stored) && stored.hash !== hashText(p.text);

    const cfg = loadAIConfig();
    analysisView.setBadge(hasKey(cfg) ? `IA · ${MODELS.find((m) => m.id === cfg.model)?.label ?? ''}` : 'IA non activée');
    understanding.showSummary(st !== 'ready' && st !== 'loading');

    // On ne redessine que si quelque chose a changé (sinon le minuteur et le défilement sauteraient)
    const signature = [p.id, st, stale, stored?.at, errors.analysis, state.ideas.length].join('|');
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    analysisView.render({ state: st, result: stored, stale, error: errors.analysis, ideasById: ideasById() });
  }

  async function runAnalysis() {
    const p = current();
    if (!p || !hasKey() || lyricCount() < 2) { renderAnalysis(); return false; }
    busy.analysis?.controller.abort();
    const controller = new AbortController();
    busy.analysis = { id: p.id, controller };
    errors.analysis = null;
    renderAnalysis();
    let ok = false;
    try {
      const res = await analyzeWithAI({
        project: p, lines: lines(), ideas: state.ideas, profile: profileData(), knownThemes: knownThemes(p.id), signal: controller.signal,
      });
      state.analyses[p.id] = res;
      store.saveAnalyses(state.analyses);
      ok = true;
    } catch (err) {
      if (err.code !== 'abort') errors.analysis = err.message;
    } finally {
      if (busy.analysis?.controller === controller) busy.analysis = null;
      renderAnalysis();
    }
    if (ok) refreshIdeas();            // les idées reconnues comptent si le texte est validé
    return ok;
  }

  function cancelAnalysis() {
    busy.analysis?.controller.abort();
    busy.analysis = null;
    renderAnalysis();
  }

  /** Lance l'analyse toute seule si l'onglet est visible, que le texte a changé et que c'est autorisé. */
  function maybeAutoAnalyze() {
    const p = current();
    if (!p || !analysisVisible() || busy.analysis || !hasKey() || !loadAIConfig().auto || lyricCount() < 2) return;
    const hash = hashText(p.text);
    if (state.analyses[p.id]?.hash === hash || autoTried === hash) return;
    autoTried = hash;
    runAnalysis();
  }

  /* ---------------- Souffle-moi ---------------- */

  function suggestContext() {
    const all = lines();
    const index = Math.min(editor.currentLine(), Math.max(0, all.length - 1));
    const cur = all[index];
    const prev = [];
    for (let i = index - 1; i >= 0 && prev.length < 4; i--) {
      if (all[i].isMeta) break;
      if (isLyric(all[i])) prev.push(all[i]);
    }
    const target = median(prev.map((l) => l.syllables));
    const lastWord = (l) => l?.words?.at(-1)?.text ?? '';
    return {
      index, cur, target,
      rhymeForEnding: lastWord(prev[0]),
      rhymeForNext: isLyric(cur) ? lastWord(cur) : lastWord(prev[0]),
      label: isLyric(cur) ? `Ligne en cours : « ${cur.text.trim()} »` : (prev[0] ? `Après : « ${prev[0].text.trim()} »` : 'Début du texte'),
    };
  }

  /** Vérifie une proposition avec le moteur local : syllabes, rythme, rime. */
  function annotate(text, { target, rhymeWith, fromIdea = false, base = '' }) {
    const full = `${base} ${text}`.trim();
    const syllables = countSyllables(full);
    const last = full.match(/[\p{L}'’-]+(?=[^\p{L}]*$)/u)?.[0] ?? '';
    const rhymes = Boolean(rhymeWith && last
      && analyzeWord(last).rhymeKey && analyzeWord(last).rhymeKey === analyzeWord(rhymeWith).rhymeKey
      && last.toLowerCase() !== rhymeWith.toLowerCase());
    return { texte: text, syllables, fit: target ? Math.abs(syllables - target) <= 1 : false, rhymes, fromIdea };
  }

  async function runSuggest() {
    const p = current();
    if (!hasKey()) { suggest.render({ state: 'nokey' }); return; }
    const ctx = suggestContext();
    busy.suggest?.abort();
    const controller = new AbortController();
    busy.suggest = controller;
    suggest.render({ state: 'loading', context: ctx.label });
    try {
      const res = await suggestWithAI({
        project: p, lines: lines(), index: ctx.index, target: ctx.target, rhymeWith: ctx.rhymeForNext,
        ideas: state.ideas, profile: profileData(), signal: controller.signal,
      });
      const base = isLyric(ctx.cur) ? ctx.cur.text.trim() : '';
      suggest.render({
        state: 'ready',
        context: ctx.label,
        result: {
          fins: base ? res.fins.map((t) => annotate(t, { target: ctx.target, rhymeWith: ctx.rhymeForEnding, base })) : [],
          suites: res.suites.map((s) => annotate(s.texte, { target: ctx.target, rhymeWith: ctx.rhymeForNext, fromIdea: Boolean(s.ideaId) })),
        },
      });
    } catch (err) {
      if (err.code !== 'abort') suggest.render({ state: 'error', context: ctx.label, error: err.message });
    } finally {
      if (busy.suggest === controller) busy.suggest = null;
    }
  }

  function openSuggest() {
    suggest.open();
    runSuggest();
  }
  function cancelSuggest() { busy.suggest?.abort(); busy.suggest = null; }

  /* ---------------- Profil d'écriture ---------------- */

  function renderProfile() {
    const st = busy.profile ? 'loading' : errors.profile ? 'error' : state.profile ? 'ready' : !hasKey() ? 'nokey' : 'idle';
    overview.renderProfile({ state: st, result: state.profile, error: errors.profile });
  }

  async function runProfile() {
    if (!hasKey() || busy.profile) { renderProfile(); return; }
    const texts = state.projects.filter((t) => t.text.trim().length > 20);
    if (!texts.length && !state.ideas.length) return;
    busy.profile = true;
    errors.profile = null;
    renderProfile();
    try {
      const res = await profileWithAI({ texts, ideas: state.ideas });
      state.profile = { at: res.at, data: res.data };
      store.saveProfile(state.profile);
    } catch (err) {
      if (err.code !== 'abort') errors.profile = err.message;
    } finally {
      busy.profile = false;
      renderProfile();
    }
  }

  /* ---------------- Banque d'idées ---------------- */

  function renderIdeasAI() {
    const todo = state.ideas.filter((i) => !i.ai).length;
    const st = busy.classify ? 'loading' : errors.classify ? 'error' : !hasKey() ? 'nokey' : 'idle';
    ideasView.renderAI({ state: st, todo: busy.classify ? classifyProgress.total : todo, done: classifyProgress.done, error: errors.classify });
  }

  async function runClassify() {
    if (!hasKey() || busy.classify) { renderIdeasAI(); return; }
    const total = state.ideas.filter((i) => !i.ai).length;
    if (!total) { renderIdeasAI(); return; }
    busy.classify = true;
    errors.classify = null;
    classifyProgress = { done: 0, total };
    renderIdeasAI();
    try {
      const { meta } = await classifyIdeasWithAI({
        ideas: state.ideas, profile: profileData(),
        onProgress: (done) => { classifyProgress.done = done; renderIdeasAI(); },
      });
      for (const idea of state.ideas) if (meta.has(idea.id)) idea.ai = meta.get(idea.id);
      store.saveIdeas(state.ideas);
    } catch (err) {
      if (err.code !== 'abort') errors.classify = err.message;
    } finally {
      busy.classify = false;
      refreshIdeas();
      renderIdeasAI();
    }
  }

  /* ---------------- Synthèse de projet ---------------- */

  function renderSynthesis() {
    const stored = state.syntheses[state.album];
    const st = busy.synth ? 'loading' : errors.synth ? 'error' : stored ? 'ready' : !hasKey() ? 'nokey' : 'idle';
    overview.renderSynthesis({ state: st, result: stored, error: errors.synth, ideasById: ideasById() });
  }

  async function runSynthesis() {
    if (!hasKey() || busy.synth) { renderSynthesis(); return; }
    const key = state.album;
    busy.synth = true;
    errors.synth = null;
    renderSynthesis();
    try {
      const { albumName, texts } = albumTexts();
      const res = await synthesizeWithAI({
        album: albumName, texts: texts.filter((t) => t.text.trim()), analyses: state.analyses,
        ideas: state.ideas, usage: state.usage, profile: profileData(),
      });
      state.syntheses[key] = { at: res.at, data: res.data };
      store.saveSyntheses(state.syntheses);
    } catch (err) {
      if (err.code !== 'abort') errors.synth = err.message;
    } finally {
      busy.synth = false;
      renderSynthesis();
    }
  }

  /* ---------------- Événements de l'application ---------------- */

  /** Un texte vient d'être validé : on s'assure que son analyse est à jour, puis on rafraîchit le profil. */
  async function onValidated() {
    const p = current();
    if (!p || !hasKey()) return;
    if (state.analyses[p.id]?.hash !== hashText(p.text)) await runAnalysis();
    runProfile();
  }

  function onProjectOpened() {
    errors.analysis = null;
    autoTried = null;
    renderAnalysis(true);
    maybeAutoAnalyze();
  }

  function forget(textId) {
    delete state.analyses[textId];
    store.saveAnalyses(state.analyses);
  }

  function renderAll() {
    errors.analysis = null;
    renderAnalysis(true);
    renderProfile();
    renderSynthesis();
    renderIdeasAI();
  }

  return {
    renderAnalysis, runAnalysis, cancelAnalysis, maybeAutoAnalyze,
    openSuggest, runSuggest, cancelSuggest,
    renderProfile, runProfile,
    renderIdeasAI, runClassify,
    renderSynthesis, runSynthesis,
    onValidated, onProjectOpened, forget, renderAll, openSettings,
  };
}
