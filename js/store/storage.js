/**
 * Persistance localStorage : projets (textes) + réglages.
 * Toutes les lectures/écritures sont protégées (navigation privée, quota…).
 */
import { uid } from '../utils/dom.js';

const KEY_PROJECTS = 'frm.projects.v1';
const KEY_CURRENT = 'frm.current.v1';
const KEY_SETTINGS = 'frm.settings.v1';
const KEY_IDEAS = 'frm.ideas.v1';
const KEY_USERLEX = 'frm.userlex.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function newProject(partial = {}) {
  const now = Date.now();
  // status : 'brouillon' | 'valide' ; album : nom du projet (album, mixtape…) auquel le son appartient
  return { id: uid(), title: 'Sans titre', text: '', bpm: 90, key: '', offset: 0, status: 'brouillon', album: '', createdAt: now, updatedAt: now, ...partial };
}

export const loadProjects = () => read(KEY_PROJECTS, []);
export const saveProjects = (projects) => write(KEY_PROJECTS, projects);
export const loadCurrentId = () => read(KEY_CURRENT, null);
export const saveCurrentId = (id) => write(KEY_CURRENT, id);

export const DEFAULT_SETTINGS = {
  xray: true,          // Rayon X phonétique
  mode: 'essentiel',   // 'essentiel' (ce qui est fait pour rimer) | 'assonances' (tout) | 'consonnes'
  grid: false,         // Vue grille 4/4
  reps: true,          // Surlignage des répétitions
  elision: true,       // e caducs internes non comptés
  strict: false,       // distinguer é / è
  cons: true,          // modes Assonances / Rimes : afficher aussi les consonnes vraiment marquées
  click: false,        // clic du métronome
};

export const loadSettings = () => {
  const s = { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) };
  // Passage au mode Essentiel (une seule fois) ; l'ancien mode « Rimes » n'existe plus
  if (!s.essentielV1) { s.mode = 'essentiel'; s.essentielV1 = true; }
  if (s.mode === 'rimes') s.mode = 'essentiel';
  return s;
};
export const saveSettings = (s) => write(KEY_SETTINGS, s);

/* ---------- Banque d'idées : [{ id, text, createdAt }] ---------- */
export const loadIdeas = () => read(KEY_IDEAS, []);
export const saveIdeas = (ideas) => write(KEY_IDEAS, ideas);
export const newIdea = (text) => ({ id: uid(), text, createdAt: Date.now() });

/* ---------- Dictionnaire perso : { mot: { as: 'se prononce comme', phon } } ---------- */
export const loadUserLex = () => read(KEY_USERLEX, {});
export const saveUserLex = (lex) => write(KEY_USERLEX, lex);

/* ---------- Résultats IA (gardés pour ne pas repayer une analyse déjà faite) ---------- */
// analyses : { [idTexte]: { hash, at, model, cost, data } }
export const loadAnalyses = () => read('frm.analyses.v1', {});
export const saveAnalyses = (a) => write('frm.analyses.v1', a);
// profil d'écriture : { at, data } | null
export const loadProfile = () => read('frm.profile.v1', null);
export const saveProfile = (p) => write('frm.profile.v1', p);
// synthèses de projet : { [nomProjet]: { at, data } }
export const loadSyntheses = () => read('frm.synth.v1', {});
export const saveSyntheses = (s) => write('frm.synth.v1', s);

/* ---------- Références, artistes et objectifs du projet final ----------
   [{ id, kind: 'artiste' | 'reference' | 'objectif', text, note, done, createdAt }] */
export const loadRefs = () => read('frm.refs.v1', []);
export const saveRefs = (r) => write('frm.refs.v1', r);
export const newRef = (kind, text, note = '') => ({ id: uid(), kind, text, note, done: false, createdAt: Date.now() });
