/**
 * Client IA : appels à Claude (API Anthropic) directement depuis le navigateur,
 * avec la clé API de l'utilisateur, stockée uniquement sur son appareil.
 *
 * - SDK officiel @anthropic-ai/sdk, embarqué dans vendor/ et chargé au premier appel.
 * - Réponses en JSON garanti par schéma (output_config.format).
 * - Rien n'est envoyé tant qu'une fonction IA n'est pas déclenchée.
 */

const STORAGE_KEY = 'frm.ai.v1';

/** Modèles proposés. Prix en dollars par million de jetons (entrée / sortie / lecture de cache). */
export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', hint: 'le plus fin · recommandé', in: 4, out: 20, cacheRead: 0.2, fallbacks: true },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'plus rapide · moitié prix', in: 2, out: 10, cacheRead: 0.1, fallbacks: true },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', hint: 'le moins cher', in: 0.1, out: 0.5, cacheRead: 0.01, fallbacks: false },
];
export const DEFAULT_MODEL = MODELS[0].id;
const modelInfo = (id) => MODELS.find((m) => m.id === id) ?? MODELS[0];

const DEFAULT_CONFIG = { key: '', model: DEFAULT_MODEL, auto: true, spent: 0, calls: 0 };

export function loadAIConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return { ...DEFAULT_CONFIG }; }
}
export function saveAIConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* stockage indisponible */ }
}
export const hasKey = (cfg = loadAIConfig()) => Boolean(cfg.key && cfg.key.trim());

/** Erreur IA avec un message prêt à afficher (en français) et un code pour l'interface. */
export class AIError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

let sdk = null;
async function loadSDK() {
  sdk ??= (await import('../../vendor/anthropic-sdk.js')).default;
  return sdk;
}

/** Coût estimé d'un appel, en dollars (les écritures de cache 1 h comptent double). */
export function estimateCost(usage, modelId) {
  const m = modelInfo(modelId);
  const u = usage ?? {};
  return ((u.input_tokens ?? 0) * m.in
    + (u.cache_creation_input_tokens ?? 0) * m.in * 2
    + (u.cache_read_input_tokens ?? 0) * m.cacheRead
    + (u.output_tokens ?? 0) * m.out) / 1e6;
}

function translate(err, Anthropic) {
  if (err instanceof AIError) return err;
  if (err?.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError) return new AIError('abort', 'Demande annulée.');
  if (err instanceof Anthropic.AuthenticationError) return new AIError('auth', 'Clé API refusée. Vérifie-la dans Analyse → Réglages.');
  if (err instanceof Anthropic.PermissionDeniedError) return new AIError('auth', "Cette clé n'a pas accès à ce modèle.");
  if (err instanceof Anthropic.RateLimitError) return new AIError('rate', 'Trop de demandes à la suite. Réessaie dans une minute.');
  if (err instanceof Anthropic.APIConnectionError) return new AIError('network', "Pas de connexion à l'IA. Vérifie le réseau.");
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || err.status >= 500) return new AIError('server', "Le service d'IA est saturé. Réessaie dans un instant.");
    // On affiche le message de l'API tel quel (ex. crédit insuffisant) : c'est lui qui dit quoi faire.
    const detail = String(err.error?.error?.message ?? err.message ?? '').slice(0, 160);
    return new AIError('api', `L'IA a refusé la demande (${err.status ?? 'erreur'})${detail ? ` : ${detail}` : '.'}`);
  }
  return new AIError('unknown', "L'appel à l'IA a échoué.");
}

/**
 * Pose une question à Claude et renvoie un objet JSON conforme au schéma.
 *
 * @param {object} p
 * @param {Array}  p.system    blocs système (texte + cache_control)
 * @param {string} p.user      message utilisateur
 * @param {object} p.schema    schéma JSON de la réponse
 * @param {'low'|'medium'|'high'} [p.effort]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{data:object, usage:object, cost:number, model:string}>}
 */
export async function askJSON({ system, user, schema, effort = 'medium', maxTokens = 16000, signal }) {
  const cfg = loadAIConfig();
  if (!hasKey(cfg)) throw new AIError('nokey', 'Ajoute ta clé API dans Analyse → Réglages.');
  const Anthropic = await loadSDK();
  const client = new Anthropic({ apiKey: cfg.key.trim(), dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 180000 });
  const model = modelInfo(cfg.model);

  const params = {
    model: model.id,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
  };

  // Repli côté serveur : si le modèle décline une demande (classifieur de sécurité), elle est rejouée
  // sur le modèle recommandé par Anthropic au lieu d'échouer. Non disponible pour Haiku 5.5.
  const run = (withFallbacks) => (withFallbacks
    ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
    : client.messages.stream(params, { signal })).finalMessage();

  let message;
  try {
    try {
      message = await run(model.fallbacks);
    } catch (err) {
      // Si l'option de repli n'est pas acceptée pour ce compte, on réessaie une fois sans elle.
      if (model.fallbacks && err instanceof Anthropic.BadRequestError) message = await run(false);
      else throw err;
    }
  } catch (err) {
    throw translate(err, Anthropic);
  }

  if (message.stop_reason === 'refusal') throw new AIError('refusal', "L'IA a décliné cette demande. Reformule ou réessaie.");
  if (message.stop_reason === 'max_tokens') throw new AIError('length', 'Réponse trop longue, coupée. Réessaie sur un texte plus court.');

  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw new AIError('format', "Réponse illisible de l'IA. Réessaie."); }

  const cost = estimateCost(message.usage, model.id);
  const now = loadAIConfig();
  saveAIConfig({ ...now, spent: (now.spent ?? 0) + cost, calls: (now.calls ?? 0) + 1 });
  return { data, usage: message.usage, cost, model: message.model ?? model.id };
}

/** Vérifie la clé avec une demande minuscule. */
export async function testKey() {
  const res = await askJSON({
    system: [{ type: 'text', text: 'Réponds en JSON.' }],
    user: 'Réponds {"ok": true}.',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
    effort: 'low',
    maxTokens: 2000,
  });
  return res.data.ok === true;
}
