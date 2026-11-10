/**
 * Prompts, schémas de réponse et normalisation — fonctions pures (testables sans réseau).
 *
 * Contexte commun à toutes les demandes (blocs système, dans cet ordre pour le cache) :
 *   1. le rôle (texte figé)
 *   2. la banque d'idées  — change rarement → point de cache
 *   3. le profil d'auteur — change à chaque texte validé → point de cache
 * Le texte en cours et la consigne viennent ensuite, dans le message utilisateur.
 */

export const SYSTEM_ROLE = `Tu es le partenaire d'écriture intégré à Flow & Rimes Matrix, un carnet d'écriture pour un rappeur francophone. L'auteur écrit ses textes dans l'application. Tu vois le texte sur lequel il travaille, sa banque d'idées (des fragments notés au fil du temps, dont beaucoup n'ont pas encore trouvé leur place) et, quand il existe, son profil d'écriture.

Ton rôle : comprendre ce qu'il écrit comme le ferait un lecteur attentif qui connaît le rap français — le sens, l'intention, le sous-texte, les images, l'argot, le verlan, les références — puis l'aider à avancer, sans écrire à sa place.

Ce qui compte pour lui :
- C'est son texte et sa voix. Reste dans son registre, son vocabulaire et ses thèmes. Ne lisse pas et ne moralise pas : la rue, l'argent, la violence, l'ego trip sont des matériaux d'écriture légitimes.
- Sois concret et honnête. Désigne la ligne, dis précisément ce qui marche ou ce qui affaiblit le texte, et pourquoi. Un compliment vague ou une critique vague ne l'aide pas. Quand une rubrique n'a rien de vrai à dire, laisse-la vide plutôt que de la remplir.
- L'application calcule elle-même les syllabes, les rimes et les allitérations. Les nombres de syllabes qu'on te donne sont fiables (compte parlé : les e muets ne se prononcent pas, « j'suis » vaut une syllabe). Ne les recalcule pas ; ton apport est le sens et le style.
- Les lignes sont numérotées L1, L2… et les titres de section comme [Couplet 1] comptent dans la numérotation. Quand tu désignes une ligne, donne ce numéro.
- Les idées de la banque sont étiquetées I1, I2… Une idée est « utilisée » dans un texte quand son sens y est exprimé, même reformulé avec d'autres mots. Une simple proximité de thème ne suffit pas.
- Écris en français, directement, en tutoyant l'auteur.`;

/* ---------- Mise en forme du contexte ---------- */

export const ideaTag = (index) => `I${index + 1}`;

/** Banque d'idées en texte : une idée par ligne, « [I3] première ligne / deuxième ligne ». */
export function formatBank(ideas) {
  if (!ideas.length) return "Banque d'idées : vide pour l'instant.";
  return `Banque d'idées de l'auteur (${ideas.length}) :\n`
    + ideas.map((i, k) => `[${ideaTag(k)}] ${i.text.replace(/\s*\n\s*/g, ' / ')}`).join('\n');
}

export function formatProfile(profile) {
  if (!profile) return "Profil d'écriture : pas encore établi.";
  const list = (label, arr) => (arr?.length ? `\n${label} : ${arr.join(' · ')}` : '');
  return `Profil d'écriture de l'auteur :\n${profile.portrait ?? ''}`
    + list('Thèmes récurrents', profile.themes)
    + list('Mots et expressions signature', profile.signatures)
    + list('Procédés habituels', profile.procedes)
    + list('Forces', profile.forces)
    + list('Angles morts', profile.angles_morts);
}

/** Blocs système communs. Les deux derniers portent un point de cache d'une heure. */
export function buildSystem({ ideas, profile }) {
  const cache = { type: 'ephemeral', ttl: '1h' };
  return [
    { type: 'text', text: SYSTEM_ROLE },
    { type: 'text', text: formatBank(ideas), cache_control: cache },
    { type: 'text', text: formatProfile(profile), cache_control: cache },
  ];
}

/** Texte numéroté « L3: … (11 syl.) » ; les lignes vides sont gardées pour que les numéros collent à l'éditeur. */
export function numberText(lines) {
  return lines.map((l, i) => {
    const syl = !l.isMeta && !l.isEmpty && l.words?.length ? `   (${l.syllables} syl.)` : '';
    return `L${i + 1}: ${l.text}${syl}`;
  }).join('\n');
}

/* ---------- Schémas ---------- */

const obj = (properties, description) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false, ...(description ? { description } : {}),
});
const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const arr = (items, description) => ({ type: 'array', items, description });

export const ANALYSIS_SCHEMA = obj({
  resume: str('2 à 3 phrases : ce que dit vraiment le texte, sous-texte compris. Pas une liste de thèmes.'),
  intention: str("Ce que l'auteur cherche à faire avec ce texte, en une courte phrase (confession, revendication, ego trip, hommage, récit…)."),
  mood: str("L'humeur dominante en 1 à 3 mots."),
  themes: arr(obj({
    nom: str('Nom court du thème (2-3 mots), tel que tu le nommerais pour ce texte.'),
    lignes: arr(int('numéro de ligne'), 'Lignes où ce thème porte le plus.'),
  }), 'Les thèmes réellement portés par le texte, du plus présent au moins présent (4 au plus).'),
  figures: arr(obj({
    type: str('Nom de la figure (métaphore, comparaison, anaphore, antithèse, paronomase, double sens, métonymie, hyperbole, chute…).'),
    ligne: int('Numéro de la ligne.'),
    extrait: str('Les mots concernés, cités tels quels.'),
    effet: str("Ce que la figure produit ici, en une phrase."),
  }), 'Figures de style réellement présentes. Laisse les allitérations et assonances, déjà repérées par l\'application.'),
  points_forts: arr(obj({
    ligne: int('Numéro de la ligne.'),
    extrait: str('La ligne ou le passage, cité tel quel.'),
    pourquoi: str('Pourquoi ça marche, précisément.'),
  }), 'Les meilleures lignes : punchlines, images justes, chutes (3 au plus).'),
  a_retravailler: arr(obj({
    ligne: int('Numéro de la ligne.'),
    extrait: str('Le passage, cité tel quel.'),
    probleme: str("Ce qui l'affaiblit : cliché, remplissage, image floue, redite, rupture de ton, chute qui arrive trop tôt…"),
    piste: str('Une direction concrète pour le reprendre, dans sa voix. Une piste, pas une réécriture complète.'),
  }), 'Les passages qui affaiblissent le texte (4 au plus). Vide si le texte tient.'),
  fil: str('Le fil du texte : est-ce que le propos tient du début à la fin, et sinon où il décroche. 1 à 2 phrases.'),
  idees_utilisees: arr(obj({
    idee: str('Étiquette de l\'idée, par exemple I12.'),
    ligne: int('Ligne du texte où son sens est exprimé.'),
    comment: str('En quelques mots : reprise telle quelle, ou comment elle est reformulée.'),
  }), 'Idées de la banque dont le sens est exprimé dans ce texte, même reformulé.'),
  idees_a_placer: arr(obj({
    idee: str('Étiquette de l\'idée, par exemple I7.'),
    pourquoi: str('Pourquoi elle irait bien dans ce texte, et où.'),
  }), 'Idées de la banque pas encore utilisées qui prolongeraient ce texte (3 au plus). Vide si aucune ne colle vraiment.'),
});

export const SUGGEST_SCHEMA = obj({
  fins: arr(obj({
    texte: str('La fin proposée pour la ligne en cours : uniquement les mots à ajouter après ce qui est déjà écrit.'),
  }), 'Façons de terminer la ligne en cours (4). Vide si la ligne en cours est vide ou déjà complète.'),
  suites: arr(obj({
    texte: str('Une ligne complète pour la suite.'),
    idee: str("Étiquette de l'idée de la banque dont elle s'inspire (ex. I4), ou chaîne vide."),
  }), 'Lignes possibles pour la suite (5), variées dans l\'angle.'),
});

export const PROFILE_SCHEMA = obj({
  portrait: str("3 à 4 phrases : comment cet auteur écrit, ce qui fait sa voix. Concret, appuyé sur ses textes."),
  themes: arr(str('thème'), 'Ses thèmes récurrents (6 au plus), nommés court.'),
  signatures: arr(str('mot ou expression'), 'Mots, expressions, jargon et argot qui reviennent et le signent (12 au plus).'),
  procedes: arr(str('procédé'), 'Tournures et procédés qu\'il utilise souvent (5 au plus).'),
  forces: arr(str('force'), 'Ce qu\'il fait de mieux (3 au plus).'),
  angles_morts: arr(str('angle mort'), 'Ce qu\'il évite, répète trop ou pourrait explorer (3 au plus).'),
});

export const IDEAS_SCHEMA = obj({
  idees: arr(obj({
    idee: str("Étiquette de l'idée, par exemple I3."),
    sens: str("Ce que l'idée veut dire, en 12 mots au plus."),
    themes: arr(str('thème'), '1 ou 2 thèmes, nommés court. Réutilise les mêmes intitulés d\'une idée à l\'autre.'),
    mood: str("L'humeur en 1 ou 2 mots."),
  }), 'Une entrée par idée demandée.'),
});

export const SYNTHESIS_SCHEMA = obj({
  vue: str("3 à 4 phrases : ce que raconte le projet dans son ensemble à ce stade, et ce qui lui manque."),
  themes: arr(obj({
    nom: str('Nom court du thème.'),
    sons: arr(str('titre du son'), 'Sons validés qui le portent.'),
  }), 'Thèmes couverts par les sons validés, du plus présent au moins présent.'),
  redites: arr(str('redite'), 'Ce qui se répète d\'un son à l\'autre au point de lasser (3 au plus). Vide si rien.'),
  a_explorer: arr(obj({
    titre: str("L'angle ou le sujet, en quelques mots."),
    pourquoi: str('Pourquoi il manque au projet.'),
    idees: arr(str('étiquette'), 'Idées de la banque (étiquettes) qui pourraient le nourrir.'),
  }), 'Angles pas encore abordés que la banque d\'idées permet d\'écrire (4 au plus).'),
});

/* ---------- Messages utilisateur ---------- */

export function analysisPrompt({ title, lines, knownThemes = [] }) {
  return `Voici le texte « ${title} », tel qu'il est écrit en ce moment.

<texte>
${numberText(lines)}
</texte>

Analyse-le pour l'auteur : ce qu'il dit, ce qui marche, ce qui est à reprendre, et le lien avec sa banque d'idées.${knownThemes.length ? `
Thèmes déjà nommés dans ses autres textes et ses idées : ${knownThemes.join(', ')}. Reprends le même intitulé quand c'est le même thème (c'est ce qui permet de suivre un thème d'un son à l'autre) ; nomme-en un nouveau seulement s'il est vraiment différent.` : ''}`;
}

/**
 * @param {object} p
 * @param {object[]} p.lines        lignes analysées par le moteur local
 * @param {number}  p.index         index (0-based) de la ligne en cours
 * @param {number|null} p.target    nombre de syllabes visé (médiane des lignes voisines)
 * @param {string}  p.rhymeWith     dernier mot de la ligne précédente (rime à tenir), ou ''
 */
export function suggestPrompt({ title, lines, index, target, rhymeWith }) {
  const cur = lines[index];
  const empty = !cur || cur.isEmpty || cur.isMeta;
  const facts = [
    target ? `Les lignes voisines font environ ${target} syllabes : vise cette longueur (à une ou deux près).` : '',
    rhymeWith ? `La ligne précédente finit sur « ${rhymeWith} » : fais rimer avec, ou ouvre une nouvelle rime si c'est plus juste.` : '',
  ].filter(Boolean).join('\n');
  return `Voici le texte « ${title} ».

<texte>
${numberText(lines)}
</texte>

L'auteur est sur la ligne L${index + 1}${empty ? ", qui est vide : il cherche la suite." : ` : « ${cur.text.trim()} ». Il cherche comment la finir, puis comment enchaîner.`}
${facts}

Propose-lui de quoi avancer, dans sa voix et dans le propos du texte. Sers-toi de sa banque d'idées quand une idée colle. Des lignes qu'il pourrait vraiment garder : pas de remplissage, pas de cliché.`;
}

export function profilePrompt({ texts }) {
  const body = texts.map((t) => `<texte titre="${t.title}"${t.status === 'valide' ? ' statut="validé"' : ''}>\n${t.text.trim()}\n</texte>`).join('\n\n');
  return `Voici tous les textes de l'auteur (sa banque d'idées est plus haut).

${body}

Dresse son profil d'écriture, appuyé sur ce qu'il écrit vraiment. Il servira à lui proposer des mots et des suites qui lui ressemblent.`;
}

export function ideasPrompt({ tags, knownThemes }) {
  return `Classe ces idées de la banque : ${tags.join(', ')}.
Pour chacune, dis ce qu'elle veut dire, son ou ses thèmes et son humeur.${knownThemes.length ? `\nThèmes déjà utilisés (reprends-les quand ils conviennent) : ${knownThemes.join(', ')}.` : ''}`;
}

export function synthesisPrompt({ album, songs, freeTags }) {
  const body = songs.map((s) => `<son titre="${s.title}" statut="${s.status === 'valide' ? 'validé' : 'brouillon'}">\n${s.summary}\n</son>`).join('\n\n');
  return `Voici le projet ${album ? `« ${album} »` : "de l'auteur (tous ses textes)"}.

${body}

Idées de la banque pas encore utilisées dans un son validé : ${freeTags.length ? freeTags.join(', ') : 'aucune'}.

Fais la synthèse du projet : ce qu'il raconte déjà, ce qui se répète, et ce que sa banque d'idées lui permettrait encore d'écrire.`;
}

/* ---------- Normalisation des réponses ---------- */

const clampLine = (n, max) => (Number.isInteger(n) && n >= 1 && n <= max ? n : null);

/** Étiquette « I12 » → id réel de l'idée (ou null). */
export function resolveIdea(tag, ideas) {
  const m = /^I(\d+)$/.exec(String(tag).trim());
  if (!m) return null;
  return ideas[Number(m[1]) - 1]?.id ?? null;
}

/** Vérifie et nettoie une analyse : numéros de ligne valides, idées existantes, listes bornées. */
export function normalizeAnalysis(data, { lineCount, ideas }) {
  const withLine = (list, max) => (Array.isArray(list) ? list : [])
    .map((x) => ({ ...x, ligne: clampLine(x.ligne, lineCount) }))
    .filter((x) => x.ligne !== null)
    .slice(0, max);
  const seen = new Set();
  return {
    resume: String(data.resume ?? '').trim(),
    intention: String(data.intention ?? '').trim(),
    mood: String(data.mood ?? '').trim(),
    fil: String(data.fil ?? '').trim(),
    themes: (Array.isArray(data.themes) ? data.themes : []).slice(0, 4).map((t) => ({
      nom: String(t.nom ?? '').trim(),
      lignes: (Array.isArray(t.lignes) ? t.lignes : []).map((n) => clampLine(n, lineCount)).filter((n) => n !== null),
    })).filter((t) => t.nom),
    figures: withLine(data.figures, 12),
    points_forts: withLine(data.points_forts, 3),
    a_retravailler: withLine(data.a_retravailler, 4),
    idees_utilisees: withLine(data.idees_utilisees, 50)
      .map((x) => ({ id: resolveIdea(x.idee, ideas), ligne: x.ligne, comment: String(x.comment ?? '') }))
      .filter((x) => x.id && !seen.has(x.id) && seen.add(x.id)),
    idees_a_placer: (Array.isArray(data.idees_a_placer) ? data.idees_a_placer : [])
      .map((x) => ({ id: resolveIdea(x.idee, ideas), pourquoi: String(x.pourquoi ?? '') }))
      .filter((x) => x.id && !seen.has(x.id))
      .slice(0, 3),
  };
}

export function normalizeSuggestions(data, ideas) {
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  return {
    fins: (Array.isArray(data.fins) ? data.fins : []).map((x) => clean(x.texte)).filter(Boolean).slice(0, 4),
    suites: (Array.isArray(data.suites) ? data.suites : [])
      .map((x) => ({ texte: clean(x.texte), ideaId: resolveIdea(x.idee, ideas) }))
      .filter((x) => x.texte).slice(0, 5),
  };
}

/** Empreinte courte d'un texte : sert à savoir si l'analyse stockée est encore à jour. */
export function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}
