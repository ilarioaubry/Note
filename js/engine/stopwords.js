/** Mots outils (exclus du Radar à Tics et des alertes de répétition). */
export const STOPWORDS = new Set(`
  le la les l de du des d un une et ou où mais donc or ni car
  je j me m moi tu t te toi il elle on nous vous ils elles se s soi lui leur leurs eux y en
  ce c ça ca cet cette ces ceci cela mon ma mes ton ta tes son sa ses notre nos votre vos
  qui que qu quoi dont lequel laquelle
  à a au aux dans par pour sur sous avec sans chez vers entre contre depuis pendant avant après
  est es suis sont sommes êtes être ai as avons avez ont avoir été était étais étaient
  fait fais faire ne n pas plus moins très trop tout tous toute toutes rien même si comme
  quand alors aussi encore bien là ici oui non va vais vas vont peut peux veut faut
  sais sait cest jai jsuis mal quelque quelques chaque autre autres
`.trim().split(/\s+/));

export const isStopword = (w) => STOPWORDS.has(w);

/**
 * Petits mots grammaticaux (articles, pronoms, « de », « ne », « que »…) : ils reviennent partout et
 * fabriqueraient de fausses allitérations (le/la/les → « l »). Exclus de la détection de consonances.
 */
export const CLITICS = new Set(`
  le la les l de du des d un une et ou je j me m moi te t tu toi il elle on nous vous ils elles se s soi lui
  y en ce c ça ca cet cette ces ne n que qu qui à a au aux est es mon ma mes ton ta tes son sa ses
`.trim().split(/\s+/));

export const isClitic = (w) => CLITICS.has(w);
