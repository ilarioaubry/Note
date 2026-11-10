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
  mode: 'assonances',  // 'assonances' | 'rimes'
  grid: false,         // Vue grille 4/4
  reps: true,          // Surlignage des répétitions
  elision: true,       // e caducs internes non comptés
  strict: false,       // distinguer é / è
  click: false,        // clic du métronome
};

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) });
export const saveSettings = (s) => write(KEY_SETTINGS, s);

/* ---------- Banque d'idées : [{ id, text, createdAt }] ---------- */
export const loadIdeas = () => read(KEY_IDEAS, []);
export const saveIdeas = (ideas) => write(KEY_IDEAS, ideas);
export const newIdea = (text) => ({ id: uid(), text, createdAt: Date.now() });

/* ---------- Dictionnaire perso : { mot: { as: 'se prononce comme', phon } } ---------- */
export const loadUserLex = () => read(KEY_USERLEX, {});
export const saveUserLex = (lex) => write(KEY_USERLEX, lex);
