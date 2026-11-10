/**
 * Point d'entrée : état de l'application + câblage des modules.
 *
 *   engine/  → logique pure (phonétique, rimes, répétitions) — sans DOM
 *   ui/      → composants d'interface
 *   store/   → persistance localStorage
 */
import { $, $$, debounce, rafThrottle } from './utils/dom.js';
import { analyzeText } from './engine/analyzer.js';
import { CLASS_LABEL, clearCache } from './engine/phonetics.js';
import { markRepetitions, repeatsInRange, topTics } from './engine/repetition.js';
import { registerWords, rebuildFromLexicon } from './engine/rhymeDictionary.js';
import { loadLexique } from './engine/lexicon.js';
import * as store from './store/storage.js';
import { createEditor } from './ui/editor.js';
import { createSidebar } from './ui/sidebar.js';
import { createInspector } from './ui/inspector.js';
import { createPlayer, isAudioFile } from './ui/player.js';

const DEMO = `[Couplet 1]
J'écris la nuit quand la ville s'endort
Le stylo danse, j'ai du sang sur les accords
J'suis pas d'ici, j'ai grandi dans le décor
Les yeux rivés sur un ciel couleur d'or

T'as vu le temps passer sans faire de bruit
Moi j'ai tracé ma route au fond de la nuit
Chaque mesure est un pas, chaque rime une pluie
J'attends le jour, mais le jour me fuit

[Refrain]
On garde la flamme, on garde le cap
Même quand la vie nous frappe
Maintenant j'avance, le cœur sous la cape
Le monde peut tourner, rien ne m'attrape`;

const KEYS = ['', 'C', 'Cm', 'C#', 'C#m', 'D', 'Dm', 'Eb', 'Ebm', 'E', 'Em', 'F', 'Fm', 'F#', 'F#m',
  'G', 'Gm', 'Ab', 'Abm', 'A', 'Am', 'Bb', 'Bbm', 'B', 'Bm'];
const NOTE_FR = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const keyLabel = (k) => {
  if (!k) return '—';
  const minor = k.endsWith('m');
  const root = minor ? k.slice(0, -1) : k;
  const fr = NOTE_FR[root[0]] + (root[1] === '#' ? '♯' : root[1] === 'b' ? '♭' : '');
  return `${k} · ${fr} ${minor ? 'min' : 'maj'}`;
};

/* ====================== État ====================== */
const state = {
  projects: store.loadProjects(),
  currentId: store.loadCurrentId(),
  settings: store.loadSettings(),
  analysis: null,
  sections: [],
  tics: [],
};

if (!state.projects.length) {
  state.projects.push(store.newProject({ title: 'Démo — Nuit blanche', text: DEMO, bpm: 92, key: 'Am' }));
}
if (!state.projects.some((p) => p.id === state.currentId)) state.currentId = state.projects[0].id;
const current = () => state.projects.find((p) => p.id === state.currentId);

/* ====================== Modules ====================== */
const editor = createEditor($('#editor'), {
  onInput: (text) => {
    const p = current();
    p.text = text;
    p.updatedAt = Date.now();
    setStatus('…');
    analyze();
    save();
    refreshTics();
  },
  onCaret: () => updateInspector(),
});

const sidebar = createSidebar(
  { list: $('#projectList'), tics: $('#ticsList'), ticsScope: $('#ticsScope'), btnNew: $('#btnNew') },
  { onSelect: openProject, onNew: () => openProject(createProject()) },
);

const inspector = createInspector({
  line: $('#insLine'), lineNo: $('#insLineNo'), syl: $('#insSyl'), signature: $('#insSignature'),
  ipa: $('#insIpa'), rhyme: $('#insRhyme'), reps: $('#insReps'), section: $('#insSection'),
  rhymeInput: $('#rhymeInput'), rhymeResults: $('#rhymeResults'),
}, { onInsert: (w) => editor.insertAtCursor(w) });

const player = createPlayer({
  audio: $('#audio'), btnLoad: $('#btnLoad'), fileInput: $('#fileInput'), trackName: $('#trackName'),
  btnPlay: $('#btnPlay'), time: $('#time'), canvas: $('#wave'), waveWrap: $('#waveWrap'),
  btnA: $('#btnA'), btnB: $('#btnB'), btnLoop: $('#btnLoop'), btnBars4: $('#btnBars4'), btnBars8: $('#btnBars8'),
  loopInfo: $('#loopInfo'), btnTap: $('#btnTap'), bpmDisplay: $('#bpmDisplay'), metro: $('#metro'),
  barInfo: $('#barInfo'), btnDownbeat: $('#btnDownbeat'), btnMetro: $('#btnMetro'), btnClick: $('#btnClick'),
}, {
  getBpm: () => current()?.bpm || 90,
  setBpm: (bpm) => { setProjectField('bpm', Math.min(240, Math.max(40, bpm))); syncDocHead(); },
  getOffset: () => current()?.offset || 0,
  setOffset: (t) => setProjectField('offset', t),
});

/* ====================== Analyse ====================== */
const analyze = rafThrottle(() => {
  const { settings: s } = state;
  state.analysis = analyzeText(editor.getText(), { elision: s.elision, strict: s.strict, mode: s.mode });
  state.sections = markRepetitions(state.analysis.lines);
  editor.render(state.analysis, { xray: s.xray, grid: s.grid, reps: s.reps });
  updateInspector();
});

const updateInspector = debounce(() => {
  if (!state.analysis) return;
  const idx = editor.currentLine();
  const lines = state.analysis.lines;
  const sec = state.sections.find((x) => idx >= x.start && idx <= x.end) ?? { start: idx, end: idx };
  let title = 'Section';
  for (let i = sec.start - 1; i >= 0; i--) if (lines[i].isMeta) { title = lines[i].text.trim().replace(/^[\[#\s]+|\]\s*$/g, ''); break; }
  inspector.update({
    line: lines[idx], index: idx,
    repeats: repeatsInRange(lines, sec),
    sectionLabel: `${title} · L${sec.start + 1}–${sec.end + 1}`,
    tics: new Set(state.tics.map((t) => t.lemma)),
    strict: state.settings.strict,
  });
}, 100);

const refreshTics = debounce(() => {
  const texts = state.projects.map((p) => p.text);
  state.tics = topTics(texts, 10);
  sidebar.renderTics(state.tics, state.projects.length);
  registerWords(texts.join(' ').toLowerCase().match(/[\p{L}]{2,}/gu) ?? []);
}, 800);

/* ====================== Sauvegarde ====================== */
const saveStatus = $('#saveStatus');
function setStatus(txt, ok = false) { saveStatus.textContent = txt; saveStatus.classList.toggle('saved', ok); }

const save = debounce(() => {
  const ok = store.saveProjects(state.projects);
  store.saveCurrentId(state.currentId);
  setStatus(ok ? `Sauvegardé ✓ ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '⚠ Sauvegarde impossible', ok);
  sidebar.renderProjects(state.projects, state.currentId);
}, 400);

function setProjectField(field, value) {
  const p = current();
  p[field] = value;
  p.updatedAt = Date.now();
  if (field === 'bpm') player.setBpmDisplay(value);
  save();
}

/* ====================== Projets ====================== */
function createProject() {
  const p = store.newProject({ title: `Texte ${state.projects.length + 1}`, text: '[Couplet 1]\n', bpm: current()?.bpm || 90 });
  state.projects.push(p);
  return p.id;
}

function openProject(id) {
  state.currentId = id;
  const p = current();
  editor.setText(p.text);
  syncDocHead();
  player.setBpmDisplay(p.bpm);
  inspector.resetRhymeInput();
  sidebar.renderProjects(state.projects, state.currentId);
  store.saveCurrentId(id);
  analyze();
  editor.focus();
}

const docTitle = $('#docTitle'), docBpm = $('#docBpm'), docKey = $('#docKey');
docKey.innerHTML = KEYS.map((k) => `<option value="${k}">${keyLabel(k)}</option>`).join('');

function syncDocHead() {
  const p = current();
  docTitle.value = p.title;
  docBpm.value = p.bpm || '';
  docKey.value = p.key || '';
}

docTitle.addEventListener('input', () => setProjectField('title', docTitle.value.trim() || 'Sans titre'));
docBpm.addEventListener('change', () => {
  const v = parseInt(docBpm.value, 10);
  if (v >= 40 && v <= 240) setProjectField('bpm', v); else syncDocHead();
});
docKey.addEventListener('change', () => setProjectField('key', docKey.value));

$('#btnDelete').addEventListener('click', () => {
  const p = current();
  if (!confirm(`Supprimer « ${p.title} » ? Cette action est définitive.`)) return;
  state.projects = state.projects.filter((x) => x.id !== p.id);
  if (!state.projects.length) createProject();
  save.flush();
  refreshTics();
  openProject(state.projects.sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
});

$('#btnExport').addEventListener('click', () => {
  const p = current();
  const header = `${p.title}${p.bpm ? ` — ${p.bpm} BPM` : ''}${p.key ? ` — ${p.key}` : ''}\n\n`;
  const blob = new Blob([header + p.text], { type: 'text/plain;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${(p.title || 'texte').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'texte'}.txt`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ====================== Réglages / toggles ====================== */
const TOGGLES = { tglXray: 'xray', tglGrid: 'grid', tglReps: 'reps', tglElision: 'elision', tglStrict: 'strict' };

function syncToggles() {
  for (const [id, key] of Object.entries(TOGGLES)) $(`#${id}`).setAttribute('aria-pressed', String(!!state.settings[key]));
  $$('#segMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.settings.mode)));
}

function setSetting(key, value) {
  state.settings[key] = value;
  store.saveSettings(state.settings);
  if (key === 'elision' || key === 'strict') clearCache();
  syncToggles();
  analyze();
}

for (const [id, key] of Object.entries(TOGGLES)) $(`#${id}`).addEventListener('click', () => setSetting(key, !state.settings[key]));
$$('#segMode button').forEach((b) => b.addEventListener('click', () => setSetting('mode', b.dataset.mode)));

/* Légende des couleurs */
$('#legend').innerHTML = ['a', 'e', 'E', 'i', 'o', 'u', 'y', 'eu', 'an', 'in', 'on', 'wa']
  .map((c) => `<span class="chip"><span class="dot" style="--vc: var(--v-${c})"></span>${CLASS_LABEL[c]}</span>`).join('')
  + '<span class="chip muted">· surligné = assonance · encadré = rime de fin · vague = multi · pointillé rouge = répétition</span>';

/* ====================== Raccourcis clavier ====================== */
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); player.togglePlay(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save.flush(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const map = { KeyA: () => player.setA(), KeyB: () => player.setB(), KeyL: () => player.toggleLoop(), KeyT: () => player.tap() };
    if (map[e.code]) { e.preventDefault(); map[e.code](); }
  }
}, true);

/* ====================== Drag & drop ====================== */
const overlay = $('#dropOverlay');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; overlay.classList.add('show'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; overlay.classList.remove('show'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.classList.remove('show');
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (isAudioFile(file)) { player.loadFile(file); return; }
  if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/')) {
    const p = store.newProject({ title: file.name.replace(/\.\w+$/, ''), text: await file.text(), bpm: current()?.bpm || 90 });
    state.projects.push(p);
    save();
    refreshTics();
    openProject(p.id);
  }
});

/* ====================== Dictionnaire externe (optionnel) ====================== */
// Dépose un fichier data/lexique.json (format Lexique3 : [{ortho, phon}] ou {mot: phon}) pour l'activer.
loadLexique('data/lexique.json')
  .then((n) => {
    clearCache();
    $('#lexStatus').textContent = `Lexique externe : ${n} entrées · index rimes : ${rebuildFromLexicon()} mots`;
    analyze();
  })
  .catch(() => { $('#lexStatus').textContent = 'Index : liste de base + tes textes. (Ajoute data/lexique.json pour l\'enrichir.)'; });

/* ====================== Démarrage ====================== */
syncToggles();
openProject(state.currentId);
refreshTics.flush();
setStatus('Prêt');
