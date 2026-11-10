/**
 * Vue d'ensemble d'un projet (album, mixtape…) : ce qui a été dit, ce qui reste à dire.
 * Seuls les textes VALIDÉS comptent comme « dits ».
 */
import { detectThemes, contentWords } from './themes.js';
import { isIdeaUsed } from './ideas.js';

/**
 * Pour chaque idée, les textes validés où elle est dite.
 * @returns {Map<string, {id:string,title:string}[]>} id d'idée → textes
 */
export function ideaUsage(ideas, texts) {
  const validated = texts.filter((t) => t.status === 'valide').map((t) => ({ t, words: new Set(contentWords(t.text)) }));
  const out = new Map();
  for (const idea of ideas) {
    out.set(idea.id, validated.filter(({ t, words }) => isIdeaUsed(idea.text, t.text, words)).map(({ t }) => ({ id: t.id, title: t.title })));
  }
  return out;
}

/**
 * @param {object[]} texts textes du projet (ou tous)
 * @param {object[]} ideas banque d'idées
 * @param {Map} usage résultat de ideaUsage (sur tous les textes validés)
 */
export function albumReport(texts, ideas, usage) {
  const validated = texts.filter((t) => t.status === 'valide');
  const covered = new Map();
  for (const t of validated) {
    for (const th of detectThemes(t.text)) {
      const e = covered.get(th.id) ?? { id: th.id, label: th.label, count: 0, songs: [] };
      e.count += th.count;
      e.songs.push(t.title);
      covered.set(th.id, e);
    }
  }
  const free = ideas.filter((i) => !(usage.get(i.id) ?? []).length);
  const used = ideas.filter((i) => (usage.get(i.id) ?? []).length);
  const waiting = new Map();
  for (const i of free) {
    for (const th of detectThemes(i.text)) {
      if (covered.has(th.id)) continue;
      const e = waiting.get(th.id) ?? { id: th.id, label: th.label, ideas: 0 };
      e.ideas++;
      waiting.set(th.id, e);
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
