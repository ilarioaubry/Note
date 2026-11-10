/**
 * Fonctions IA de l'application. Chacune prépare le contexte, appelle Claude (client.js)
 * et renvoie un résultat vérifié (prompts.js → normalize*).
 */
import { askJSON } from './client.js';
import {
  buildSystem, analysisPrompt, suggestPrompt, profilePrompt, ideasPrompt, synthesisPrompt,
  ANALYSIS_SCHEMA, SUGGEST_SCHEMA, PROFILE_SCHEMA, IDEAS_SCHEMA, SYNTHESIS_SCHEMA,
  normalizeAnalysis, normalizeSuggestions, resolveIdea, ideaTag, hashText,
} from './prompts.js';

/**
 * Analyse approfondie d'un texte.
 * @param {{project:object, lines:object[], ideas:object[], profile:object|null, signal?:AbortSignal}} p
 * @returns {Promise<{hash:string, at:number, model:string, cost:number, data:object}>}
 */
export async function analyzeWithAI({ project, lines, ideas, profile, knownThemes = [], signal }) {
  const hash = hashText(project.text);        // empreinte prise avant l'appel : le texte peut changer pendant
  const res = await askJSON({
    system: buildSystem({ ideas, profile }),
    user: analysisPrompt({ title: project.title, lines, knownThemes }),
    schema: ANALYSIS_SCHEMA,
    effort: 'medium',
    maxTokens: 16000,
    signal,
  });
  return {
    hash,
    at: Date.now(),
    model: res.model,
    cost: res.cost,
    data: normalizeAnalysis(res.data, { lineCount: lines.length, ideas }),
  };
}

/**
 * « Souffle-moi » : fins de ligne et suites possibles pour la ligne en cours.
 * @returns {Promise<{fins:string[], suites:{texte:string, ideaId:string|null}[], cost:number}>}
 */
export async function suggestWithAI({ project, lines, index, target, rhymeWith, ideas, profile, signal }) {
  const res = await askJSON({
    system: buildSystem({ ideas, profile }),
    user: suggestPrompt({ title: project.title, lines, index, target, rhymeWith }),
    schema: SUGGEST_SCHEMA,
    effort: 'low',
    maxTokens: 8000,
    signal,
  });
  return { ...normalizeSuggestions(res.data, ideas), cost: res.cost };
}

/** Profil d'écriture, à partir de tous les textes et de la banque d'idées. */
export async function profileWithAI({ texts, ideas, signal }) {
  const res = await askJSON({
    system: buildSystem({ ideas, profile: null }),
    user: profilePrompt({ texts }),
    schema: PROFILE_SCHEMA,
    effort: 'medium',
    maxTokens: 12000,
    signal,
  });
  const list = (a, n) => (Array.isArray(a) ? a : []).map((s) => String(s).trim()).filter(Boolean).slice(0, n);
  const d = res.data;
  return {
    at: Date.now(),
    cost: res.cost,
    data: {
      portrait: String(d.portrait ?? '').trim(),
      themes: list(d.themes, 6),
      signatures: list(d.signatures, 12),
      procedes: list(d.procedes, 5),
      forces: list(d.forces, 3),
      angles_morts: list(d.angles_morts, 3),
    },
  };
}

/**
 * Classe les idées qui ne l'ont pas encore été (sens, thèmes, humeur), par paquets.
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{meta:Map<string,object>, cost:number}>} id d'idée → { sens, themes, mood }
 */
export async function classifyIdeasWithAI({ ideas, profile, onProgress, signal }) {
  const todo = ideas.map((idea, k) => ({ idea, k })).filter(({ idea }) => !idea.ai);
  const meta = new Map();
  let cost = 0;
  const known = new Set(ideas.flatMap((i) => i.ai?.themes ?? []));
  const BATCH = 60;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await askJSON({
      system: buildSystem({ ideas, profile }),
      user: ideasPrompt({ tags: batch.map(({ k }) => ideaTag(k)), knownThemes: [...known] }),
      schema: IDEAS_SCHEMA,
      effort: 'low',
      maxTokens: 16000,
      signal,
    });
    cost += res.cost;
    for (const e of res.data.idees ?? []) {
      const id = resolveIdea(e.idee, ideas);
      if (!id) continue;
      const themes = (Array.isArray(e.themes) ? e.themes : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 2);
      themes.forEach((t) => known.add(t));
      meta.set(id, { sens: String(e.sens ?? '').trim(), themes, mood: String(e.mood ?? '').trim() });
    }
    onProgress?.(Math.min(i + BATCH, todo.length), todo.length);
  }
  return { meta, cost };
}

/**
 * Synthèse d'un projet (album) : ce qu'il raconte, redites, angles à explorer.
 * @param {{album:string, texts:object[], analyses:object, ideas:object[], usage:Map, profile:object|null}} p
 */
export async function synthesizeWithAI({ album, texts, analyses, ideas, usage, profile, signal }) {
  const songs = texts.map((t) => {
    const a = analyses[t.id]?.data;
    const summary = a
      ? `Résumé : ${a.resume}\nIntention : ${a.intention}\nHumeur : ${a.mood}\nThèmes : ${a.themes.map((x) => x.nom).join(', ')}`
      : t.text.trim();
    return { title: t.title, status: t.status, summary };
  });
  const freeTags = ideas.map((i, k) => ({ i, k })).filter(({ i }) => !(usage.get(i.id) ?? []).length).map(({ k }) => ideaTag(k));
  const res = await askJSON({
    system: buildSystem({ ideas, profile }),
    user: synthesisPrompt({ album, songs, freeTags }),
    schema: SYNTHESIS_SCHEMA,
    effort: 'medium',
    maxTokens: 12000,
    signal,
  });
  const d = res.data;
  return {
    at: Date.now(),
    cost: res.cost,
    data: {
      vue: String(d.vue ?? '').trim(),
      themes: (d.themes ?? []).map((t) => ({ nom: String(t.nom ?? '').trim(), sons: (t.sons ?? []).map(String) })).filter((t) => t.nom),
      redites: (d.redites ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 3),
      a_explorer: (d.a_explorer ?? []).slice(0, 4).map((x) => ({
        titre: String(x.titre ?? '').trim(),
        pourquoi: String(x.pourquoi ?? '').trim(),
        ideaIds: (x.idees ?? []).map((tag) => resolveIdea(tag, ideas)).filter(Boolean),
      })).filter((x) => x.titre),
    },
  };
}
