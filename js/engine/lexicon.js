/**
 * Dictionnaire phonétique (exceptions + argot + anglicismes).
 *
 * Format : mot → transcription en notation Lexique 3 (voir rules.js).
 * Le dictionnaire est consulté AVANT les règles G2P : toute entrée ici
 * écrase la transcription calculée.
 *
 * Pour brancher Lexique3 : exporter les colonnes `ortho` et `phon` dans un
 * fichier JSON puis appeler `loadLexique('/data/lexique.json')`.
 * Formats acceptés : { "mot": "phon", ... } ou [{ "ortho": "mot", "phon": "phon" }, ...]
 */

const BUILTIN = {
  // Mots outils irréguliers
  les: 'le', des: 'de', mes: 'me', tes: 'te', ses: 'se', ces: 'se',
  es: 'E', est: 'E', et: 'e', eu: 'y', eus: 'y', eut: 'y', donc: 'd§k',
  "aujourd'hui": 'oZuRd8i', monsieur: 'm°sj2', messieurs: 'mesj2',
  femme: 'fam', femmes: 'fam', ennemi: 'Enmi', ennemis: 'Enmi',
  oignon: 'oN§', second: 's°g§', seconde: 's°g§d', yeux: 'j2', août: 'ut',
  pays: 'pei', paysage: 'peizaZ', fils: 'fis', os: 'Os', bus: 'bys',
  six: 'sis', dix: 'dis', huit: '8it', sept: 'sEt', vingt: 'v5', vingts: 'v5',
  ville: 'vil', villes: 'vil', village: 'vilaZ', mille: 'mil', million: 'milj§',
  millions: 'milj§', milliard: 'miljaR', tranquille: 'tR@kil', examen: 'Egzam5',
  album: 'albOm', parfum: 'paRf5', clef: 'kle', gentil: 'Z@ti', outil: 'uti',
  fusil: 'fyzi', sourcil: 'suRsi', blanc: 'bl@', banc: 'b@', franc: 'fR@',
  tabac: 'taba', estomac: 'Estoma', porc: 'pOR', hier: 'ijER', amen: 'amEn',
  oui: 'wi', ouais: 'wE', gars: 'ga', automne: 'otOn', solennel: 'solanEl',
  // Argot / verlan / rap FR
  wesh: 'wES', wallah: 'wala', miskine: 'miskin', khey: 'kE', bled: 'blEd',
  reuf: 'R9f', zermi: 'zERmi', zinc: 'z5g', igo: 'igo', srab: 'sRab',
  frérot: 'fReRo', daronne: 'daROn', daron: 'daR§', seum: 's9m', ghetto: 'geto',
  binks: 'binks', hlm: 'aSElEm', tess: 'tEs', boloss: 'bolOs', bendo: 'bEndo',
  // Anglicismes courants
  flow: 'flo', money: 'mOnE', game: 'gEm', street: 'stRit', baby: 'bebi',
  yeah: 'jE', life: 'lajf', feat: 'fit', beat: 'bit', beats: 'bit', bitch: 'bitS',
  cash: 'kaS', crew: 'kRu', boss: 'bOs', gang: 'g@g', swag: 'swag', bling: 'bliG',
  hood: 'ud', weed: 'wid', deal: 'dil', dealer: 'dil9R', rapper: 'Rap9R',
  hater: 'Et9R', haters: 'Et9R', killer: 'kil9R', gangster: 'g@gstER',
  punchline: 'p9nSlajn', freestyle: 'fRistajl', squad: 'skwad', team: 'tim',
  cool: 'kul', ok: 'oke', okay: 'okE', hip: 'ip', hop: 'Op', 'hip-hop': 'ipOp',
  shit: 'Sit', night: 'najt', light: 'lajt', fight: 'fajt', high: 'aj', fly: 'flaj',
  sky: 'skaj', why: 'waj', bye: 'baj', bro: 'bRo', gun: 'g9n', fun: 'f9n',
  run: 'R9n', one: 'wan', man: 'man', fan: 'fan', show: 'So', shoot: 'Sut',
  flex: 'flEks', drip: 'dRip', trap: 'tRap', track: 'tRak', love: 'l9v',
  girl: 'g9Rl', people: 'pipOl', bae: 'be', dope: 'dop', block: 'blOk',
  business: 'biznEs', big: 'big', black: 'blak', white: 'wajt', boy: 'bOj',
  boys: 'bOj', mic: 'majk', live: 'lajv', vibe: 'vajb',
  vibes: 'vajb', feeling: 'filiG', style: 'stil', smile: 'smajl', time: 'tajm',
  crime: 'kRim', rhyme: 'Rajm', real: 'Ril', check: 'tSEk', sound: 'sawnd',
  story: 'stORi', sorry: 'sORi', party: 'paRti', honey: '9ni',
  lady: 'ledi', ladies: 'ledi', bad: 'bad', fake: 'fEk', lovely: 'l9vli',
  queen: 'kwin', king: 'kiG', thug: 's9g',
};

let dictionary = new Map(Object.entries(BUILTIN));
let externalLoaded = false;

/** Retourne la transcription d'un mot (notation Lexique) ou undefined. */
export function lookup(word) {
  return dictionary.get(word);
}

/** Ajoute / remplace des entrées (utile pour un dictionnaire personnel). */
export function addEntries(entries) {
  for (const [w, p] of Object.entries(entries)) dictionary.set(w.toLowerCase(), p);
}

/**
 * Charge un dictionnaire externe type Lexique3.
 * @param {string|object|Array} source URL d'un JSON ou données déjà parsées
 * @returns {Promise<number>} nombre d'entrées chargées
 */
export async function loadLexique(source) {
  let data = source;
  if (typeof source === 'string') {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Lexique introuvable : ${source}`);
    data = await res.json();
  }
  let count = 0;
  const builtin = new Map(dictionary); // les exceptions maison restent prioritaires
  if (Array.isArray(data)) {
    for (const e of data) {
      if (e && e.ortho && e.phon && !builtin.has(e.ortho)) { dictionary.set(e.ortho.toLowerCase(), e.phon); count++; }
    }
  } else if (data && typeof data === 'object') {
    for (const [w, p] of Object.entries(data)) {
      if (!builtin.has(w)) { dictionary.set(w.toLowerCase(), p); count++; }
    }
  }
  externalLoaded = count > 0;
  return count;
}

export function hasExternalLexique() { return externalLoaded; }

/** Liste des mots connus du dictionnaire (pour la boîte à rimes). */
export function knownWords() { return [...dictionary.keys()]; }
