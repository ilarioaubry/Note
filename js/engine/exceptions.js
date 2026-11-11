/**
 * Listes d'exceptions orthographiques utilisées par les règles G2P.
 * Toutes les entrées sont en minuscules, avec accents.
 * Enrichir ces listes est le moyen le plus simple d'améliorer le moteur
 * sans toucher aux règles.
 */

const set = (str) => new Set(str.trim().split(/\s+/));

/** Mots dont le -s final se prononce (on ne le retire pas). */
export const KEEP_FINAL_S = set(`
  bus os fils tennis maïs hélas ours cactus virus bonus campus focus bis
  gratis jadis oasis iris tournevis autobus terminus chorus sinus lotus
  atlas mars sens
`);

/** Mots dont le -x final se prononce. */
export const KEEP_FINAL_X = set(`six dix index phénix coccyx lux`);

/** Mots dont le -t final se prononce. */
export const KEEP_FINAL_T = set(`
  net sept huit but brut chut ouest dot direct correct exact strict intact
  contact impact compact tact infect abject verdict district
  street beat feat tweet shit cut hit fit boot shoot night light fight
  flirt short shirt smart start test best must toast ghetto
  scout sprint script yacht kit spot hot pot shot rocket ticket jet
`);

/** Mots dont le -d final se prononce. */
export const KEEP_FINAL_D = set(`
  sud raid bled stand weed hood gold god kid bad mad squad head red bird
  cold world lord sound board food good wood band cloud kid crowd
`);

/** Mots dont le -p final est muet (en plus de -mp : champ, camp...). */
export const SILENT_FINAL_P = set(`trop beaucoup coup loup sirop galop drap contrecoup sparadrap`);

/** Mots en -er où l'on prononce [ɛʁ] (et pas [e] comme l'infinitif). */
export const ER_PRONOUNCED = set(`
  mer fer ver cher fier hier hiver enfer amer super cancer laser poker
  hamster bunker leader dealer rapper hater flipper killer player gangster
  joker cuiller revolver poster cover mixer boxer roller loser timer
  master winner teaser sniper trader banker ranger biker
`);

/** Mots en -ent (hors -ment) où -ent se prononce [ɑ̃]. */
export const NASAL_ENT = set(`
  dent vent lent cent gent sent ment souvent accent argent talent parent
  présent absent serpent content torrent urgent adolescent différent
  prudent violent innocent évident intelligent excellent permanent récent
  décent indécent agent sergent régent négligent diligent accident incident
  occident président résident ardent strident équivalent insolent opulent
  succulent fréquent éloquent conséquent couvent auvent paravent avent
  précédent confident impudent imprudent décadent compétent incompétent
  latent patent transparent apparent cohérent incohérent adhérent
  indifférent concurrent récurrent omniprésent pertinent continent imminent
  éminent détergent émergent divergent convergent indulgent contingent
  fervent client patient
`);

/**
 * Verbes conjugués en -ment (3e pers. pluriel) : -ent muet.
 * Par défaut, un mot en -ment est considéré comme adverbe/nom ([ɑ̃]).
 */
export const MUTE_MENT = set(`
  aiment sèment riment priment dorment ferment forment transforment
  informent calment filment arment charment fument allument consument
  assument estiment animent abiment abîment rament brament chôment nomment
  consomment somment gomment assomment dégomment triment impriment
  expriment suppriment oppriment dépriment compriment répriment enferment
  referment affirment confirment germent alarment désarment programment
  réclament proclament acclament clament déclament enflamment blâment
  trament crament embaument parfument rallument résument hument plument
  frament essaiment sament fament gèment
`);

/** Mots en -ient où l'on prononce [jɑ̃] (et pas [jɛ̃] comme « vient »). */
export const IENT_AN = set(`
  client patient impatient orient quotient conscient inconscient ingrédient
  expédient inconvénient récipient efficient déficient omniscient
`);
