/**
 * Règles G2P (graphème → phonème) pour le français parlé / rappé.
 *
 * Notation de sortie : alphabet phonétique de Lexique 3 (1 caractère = 1 phonème),
 * pour pouvoir brancher directement un `lexique.json` issu de Lexique3 plus tard.
 *
 *   Voyelles : a i e E(ɛ) o O(ɔ) u y 2(ø) 9(œ) °(ə) @(ɑ̃) 5(ɛ̃) 1(œ̃) §(ɔ̃)
 *   Semi-voyelles : j w 8(ɥ)
 *   Consonnes : p b t d k g f v s z S(ʃ) Z(ʒ) m n N(ɲ) G(ŋ) l R(ʁ)
 *
 * Marqueurs internes (résolus dans phonetics.js) :
 *   ~  e muet final : devient ə seulement si le mot n'a aucune autre voyelle (le, je, que)
 *   ^  -ent muet : devient ɑ̃ seulement si le mot n'a aucune autre voyelle (vent, dent)
 *
 * Fonctionnement : le mot est lu de gauche à droite ; à chaque position on essaie
 * les règles DANS L'ORDRE et la première qui matche consomme ses caractères.
 * Les lookbehind / lookahead servent de contexte et ne consomment rien.
 * Une règle = [motif regex, sortie (string) | (mot, match) => string].
 */
import {
  NASAL_ENT, MUTE_MENT, IENT_AN, KEEP_FINAL_T, KEEP_FINAL_D,
  SILENT_FINAL_P, ER_PRONOUNCED,
} from './exceptions.js';

export const MUTE_E = '~';
export const MUTE_ENT = '^';

const V = 'aeiouyàâäéèêëîïôöûüùœ';      // lettres voyelles
const C = 'bcçdfghjklmnpqrstvwxz';       // lettres consonnes
const FRONT = 'eiyéèêëîï';               // voyelles qui « adoucissent » c et g
const NN = `(?![${V}nh])`;               // n non suivi de voyelle/n/h  → nasale
const NM = `(?![${V}mh])`;
const NOT_MUTE = '(?!e(?:nt)?$)';        // la voyelle suivante n'est pas un e muet final
const CLUSTER = '[bcdfgkptv][rl]';       // groupes consonne + liquide (cr, pl, tr…)

const CONS = {
  b: 'b', c: 'k', d: 'd', f: 'f', g: 'g', j: 'Z', k: 'k', l: 'l', m: 'm', n: 'n',
  p: 'p', q: 'k', r: 'R', s: 's', t: 't', v: 'v', w: 'w', x: 'ks', z: 'z', ç: 's', h: '',
};

/* ---------- Terminaisons à logique lexicale ---------- */

function entEnding(word) {
  if (NASAL_ENT.has(word)) return '@';
  if (word.endsWith('ment') && !MUTE_MENT.has(word)) return '@';   // moment, vraiment
  return MUTE_ENT;                                                   // ils chantent
}

function ientEnding(word) {
  if (IENT_AN.has(word)) return new RegExp(`${CLUSTER}ient$`).test(word) ? 'ij@' : 'j@';
  if (/[tv]ient$/.test(word)) return 'j5';                           // vient, tient
  return 'i';                                                         // crient, oublient
}

/* ---------- Table de règles (l'ordre compte !) ---------- */

const RAW_RULES = [
  // — Terminaisons —
  ['aient$', 'E'],
  ['oient$', 'wa'],
  ['ient$', ientEnding],
  ['ent$', entEnding],
  ['ing$', 'iG'],
  ['er$', (w) => (ER_PRONOUNCED.has(w) ? 'ER' : 'e')],
  ['ez$', 'e'],
  ['et$', 'E'],
  ['ed$', 'e'],
  ['ai$', 'e'],
  ['ay$', 'E'],
  ['um$', 'Om'],
  ['om$', '§'],

  // — Groupes vocaliques —
  ['emm(?=ent$)', 'am'],           // évidemment
  ['^emm', '@m'],                  // emmener
  ['^enn', '@n'],                  // ennui
  ['eau', 'o'],
  ['aill', 'aj'], ['ail$', 'aj'],
  ['eill', 'Ej'], ['eil$', 'Ej'],
  ['œill', '2j'], ['œil$', '2j'],
  ['ueill', '2j'], ['ueil$', '2j'],
  ['euill', '2j'], ['euil$', '2j'],
  ['ouill', 'uj'], ['ouil$', 'uj'],
  [`ay(?=[${V}])`, 'Ej'],          // crayon
  [`oy(?=[${V}])`, 'waj'],         // voyage
  [`uy(?=[${V}])`, '8ij'],         // tuyau
  [`oin${NN}`, 'w5'],              // loin
  ['o[iî]', 'wa'],                 // moi, boîte
  [`ain${NN}`, '5'], [`aim${NM}`, '5'], [`ein${NN}`, '5'],
  ['a[iî]', 'E'], ['ei', 'E'],
  ['au', 'o'],
  ['(?:eu|eû|œu|œ)', '2'],
  ['oo', 'u'], ['ee', 'i'],        // anglicismes : cool, street
  [`ou(?=[${V}])${NOT_MUTE}`, 'w'],// oui, jouer
  ['o[uùû]', 'u'],
  ['ui', '8i'],                    // nuit, suis, lui
  ['(?<=i)en(?=(?:ce|te?)$)', '@'],// science, patiente
  [`(?<=[iyé])en${NN}`, '5'],      // bien, moyen, européen
  [`an${NN}`, '@'], ['am(?=[bp])', '@'],
  [`en${NN}`, '@'], ['em(?=[bp])', '@'],
  [`[iy]n${NN}`, '5'], ['[iy]m(?=[bp])', '5'],
  [`un${NN}`, '5'], ['um(?=[bp])', '5'],
  [`on${NN}`, '§'], ['om(?=[bp])', '§'],
  ['é', 'e'], ['[èêë]', 'E'],

  // — Le « e » —
  ['e$', MUTE_E],                                           // monde, vie
  ['e(?=x)', 'E'],                                          // exister
  [`e(?=([${C}])\\1)`, 'E'],                                // belle, cette
  [`e(?=[${C}]{2})(?!${CLUSTER}|ch|ph|th|gn|qu)`, 'E'],     // merci, reste
  [`e(?=[${C}]$)`, 'E'],                                    // avec, sel
  ['e', '°'],                                               // petit, chemin

  // — i / y / u (semi-voyelles) —
  ['^ill', 'il'],                                           // illusion
  [`(?<=[${C}])ill`, 'ij'],                                 // fille, famille
  [`(?<=${CLUSTER})[iy](?=[${V}])`, 'ij'],                  // crier, oublier
  [`[iy](?=[${V}])${NOT_MUTE}`, 'j'],                       // pied, rien, yeux
  ['[iîïy]', 'i'],
  [`(?<=${CLUSTER})u(?=[${V}])`, 'y'],                      // cruel
  [`u(?=[${V}])${NOT_MUTE}`, '8'],                          // nuage
  ['[uûùü]', 'y'],
  ['[aàâä]', 'a'],
  ['[oôö]', 'o'],

  // — Consonnes —
  ['sch', 'S'],
  ['ch(?=[rl])', 'k'],                                      // chrome
  ['ch', 'S'],
  ['ph', 'f'],
  ['th', 't'],
  ['gn', 'N'],
  ['qu', 'k'],
  [`gu(?=[${FRONT}])`, 'g'],                                // guerre
  ['ge(?=[aoâôu])', 'Z'],                                   // mangeons
  [`g(?=[${FRONT}])`, 'Z'],
  ['(?<=n)g$', ''],                                         // long, sang
  [`sc(?=[${FRONT}])`, 's'],
  [`cc(?=[${FRONT}])`, 'ks'],
  [`c(?=[${FRONT}])`, 's'],
  ['ck', 'k'],
  ['(?<=n)c$', ''],                                         // blanc
  ['(?<![sx])t(?=i(?:on|el|al|eu|en[ct]))', 's'],           // nation, patience
  ['t$', (w) => (KEEP_FINAL_T.has(w) ? 't' : '')],
  ['d$', (w) => (KEEP_FINAL_D.has(w) ? 'd' : '')],
  ['p$', (w) => (SILENT_FINAL_P.has(w) || /mp$/.test(w) ? '' : 'p')],
  [`(?<=^[eé])x(?=[${V}h])`, 'gz'],                         // exemple
  ['ss', 's'],
  [`(?<=[${V}])s(?=[${V}])`, 'z'],                          // maison
  [`([${C}])\\1`, (w, m) => CONS[m[1]] ?? ''],              // consonnes doubles
  [`[${C}]`, (w, m) => CONS[m[0]] ?? ''],
];

/** Règles compilées (regex « sticky » : elles ne testent qu'à la position courante). */
export const RULES = RAW_RULES.map(([pattern, out]) => ({
  pattern,
  re: new RegExp(pattern, 'yu'),
  out,
}));

/**
 * Applique la table de règles à un mot (déjà normalisé, sans apostrophe ni tiret) en gardant
 * l'alignement lettres ↔ phonèmes (sert à découper le mot en syllabes à l'écran).
 * @returns {{phon:string, src:number[], spans:{s:number,e:number}[]}}
 *   phon  : transcription en notation Lexique (avec marqueurs ~ et ^)
 *   src   : pour chaque caractère de phon, l'index du bloc de lettres qui l'a produit
 *   spans : blocs de lettres consommés par chaque règle ({s,e} en indices de lettres)
 */
export function applyRulesAligned(word) {
  let phon = '';
  const src = [];
  const spans = [];
  let i = 0;
  while (i < word.length) {
    let matched = false;
    for (const rule of RULES) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(word);
      if (!m || m[0].length === 0) continue;
      const o = typeof rule.out === 'function' ? rule.out(word, m) : rule.out;
      const t = spans.length;
      spans.push({ s: i, e: i + m[0].length });
      for (let k = 0; k < o.length; k++) src.push(t);
      phon += o;
      i += m[0].length;
      matched = true;
      break;
    }
    if (!matched) i += 1; // caractère inconnu (chiffre, symbole) : ignoré
  }
  return { phon, src, spans };
}

/** Transcription seule (notation Lexique, avec marqueurs ~ et ^). */
export function applyRules(word) {
  return applyRulesAligned(word).phon;
}
