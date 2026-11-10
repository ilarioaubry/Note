/**
 * Vue d'ensemble d'un projet (album, mixtape…) : ce qui a été dit, ce qui reste à dire.
 * Seuls les textes VALIDÉS comptent comme « dits ».
 *
 * Deux sources, combinées :
 *  - l'analyse IA du texte quand elle existe (thèmes nommés par l'IA, idées reconnues même reformulées) ;
 *  - sinon le repérage local (lexiques de themes.js, mots en commun).
 */
import { detectThemes, contentWords } from './themes.js';
import { isIdeaUsed } from './ideas.js';

/**
 * Pour chaque idée, les textes validés où elle est dite.
 * @param {object[]} ideas
 * @param {object[]} texts
 * @param {object} [analyses] id de texte → analyse IA stockée ({ data: { idees_utilisees: [{id}] } })
 * @returns {Map<string, {id:string,title:string}[]>} id d'idée → textes
 */
export function ideaUsage(ideas, texts, analyses = {}) {
  const validated = texts.filter((t) => t.status === 'valide').map((t) => ({
    t,
    words: new Set(contentWords(t.text)),
    ai: new Set((analyses[t.id]?.data?.idees_utilisees ?? []).map((x) => x.id)),
  }));
  const out = new Map();
  for (const idea of ideas) {
    out.set(idea.id, validated
      .filter(({ t, words, ai }) => ai.has(idea.id) || isIdeaUsed(idea.text, t.text, words))
      .map(({ t }) => ({ id: t.id, title: t.title })));
  }
  return out;
}

const key = (name) => name.trim().toLowerCase();

/** Thèmes d'un texte : ceux de l'analyse IA si elle existe, sinon le repérage local. */
export function themesOfText(text, analysis) {
  const ai = analysis?.data?.themes;
  if (ai?.length) return ai.map((t) => ({ label: t.nom, count: Math.max(1, t.lignes?.length ?? 1) }));
  return detectThemes(text.text).map((t) => ({ label: t.label, count: t.count }));
}

/** Thèmes d'une idée : ceux donnés par l'IA si elle a été classée, sinon le repérage local. */
export function themesOfIdea(idea) {
  if (idea.ai?.themes?.length) return idea.ai.themes;
  return detectThemes(idea.text).map((t) => t.label);
}

/**
 * @param {object[]} texts textes du projet (ou tous)
 * @param {object[]} ideas banque d'idées
 * @param {Map} usage résultat de ideaUsage (sur tous les textes validés)
 * @param {object} [analyses] analyses IA stockées
 */
export function albumReport(texts, ideas, usage, analyses = {}) {
  const validated = texts.filter((t) => t.status === 'valide');
  const covered = new Map();
  for (const t of validated) {
    for (const th of themesOfText(t, analyses[t.id])) {
      const e = covered.get(key(th.label)) ?? { id: key(th.label), label: th.label, count: 0, songs: [] };
      e.count += th.count;
      if (!e.songs.includes(t.title)) e.songs.push(t.title);
      covered.set(key(th.label), e);
    }
  }
  const free = ideas.filter((i) => !(usage.get(i.id) ?? []).length);
  const used = ideas.filter((i) => (usage.get(i.id) ?? []).length);
  const waiting = new Map();
  for (const i of free) {
    for (const label of themesOfIdea(i)) {
      if (covered.has(key(label))) continue;
      const e = waiting.get(key(label)) ?? { id: key(label), label, ideas: 0 };
      e.ideas++;
      waiting.set(key(label), e);
    }
  }
  return {
    total: texts.length,
    validated: validated.length,
    covered: [...covered.values()].sort((a, b) => b.songs.length - a.songs.length || b.count - a.count),
    waiting: [...waiting.values()].sort((a, b) => b.ideas - a.ideas),
    free: free.length,
    used: used.length,
  };
}

/**
 * Où en est un objectif du projet final (« ce que je veux retrouver ») :
 *  - coché à la main → fait ;
 *  - réalisé dans un son validé (d'après la lecture IA du texte) → fait ;
 *  - réalisé dans un brouillon → partiel ;
 *  - sinon, le dernier bilan de synthèse IA s'il existe ; sinon à faire.
 * @returns {{statut:'fait'|'partiel'|'manquant', ou:string, source:'main'|'texte'|'synthese'|null}}
 */
export function goalStatus(goal, { projects, analyses = {}, syntheses = {} }) {
  if (goal.done) return { statut: 'fait', ou: 'coché', source: 'main' };
  const touching = projects.filter((p) => (analyses[p.id]?.data?.objectifs_touches ?? []).some((x) => x.id === goal.id));
  const validated = touching.filter((p) => p.status === 'valide');
  if (validated.length) return { statut: 'fait', ou: validated.map((p) => p.title).join(', '), source: 'texte' };
  if (touching.length) return { statut: 'partiel', ou: `en cours dans ${touching.map((p) => `« ${p.title} »`).join(', ')}`, source: 'texte' };
  const latest = Object.values(syntheses).filter((x) => x?.data?.goals).sort((a, b) => b.at - a.at)[0];
  const fromSynth = latest ? new Map(latest.data.goals).get(goal.id) : null;
  if (fromSynth) return { ...fromSynth, source: 'synthese' };
  return { statut: 'manquant', ou: '', source: null };
}
