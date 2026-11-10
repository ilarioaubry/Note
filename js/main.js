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
import { clearSyllableCache } from './engine/syllabify.js';
import { clearConsonanceCache } from './engine/consonance.js';
import { markRepetitions, repeatsInRange, topTics } from './engine/repetition.js';
import { registerWords, rebuildFromLexicon } from './engine/rhymeDictionary.js';
import { loadLexique, setUserEntry, removeUserEntry, isKnownWord, stripAccents } from './engine/lexicon.js';
import { reindexWord } from './engine/rhymeDictionary.js';
import { detectThemes, detectMood, keywords, contentWords } from './engine/themes.js';
import { detectFigures } from './engine/figures.js';
import { soundsLike, isIdeaUsed } from './engine/ideas.js';
import { ideaUsage, albumReport } from './engine/project.js';
import { analyzeWord, tokenize } from './engine/phonetics.js';
import * as store from './store/storage.js';
import { createEditor } from './ui/editor.js';
import { createSidebar } from './ui/sidebar.js';
import { createInspector } from './ui/inspector.js';
import { createPlayer, isAudioFile } from './ui/player.js';
import { createIdeasView } from './ui/ideas.js';
import { createOverview, ALL_ALBUMS } from './ui/overview.js';
import { createUnderstanding } from './ui/understanding.js';

const DEMO = `[Couplet 1]
j'écris la nuit quand la ville s'endort
le stylo danse, j'ai du sang sur les accords
j'suis pas d'ici, j'ai grandi dans le décor
les yeux rivés sur un ciel couleur d'or

t'as vu le temps passer sans faire de bruit
moi j'ai tracé ma route au fond de la nuit
chaque mesure est un pas, chaque rime une pluie
j'attends le jour, mais le jour me fuit

[Refrain]
on garde la flamme, on garde le cap
même quand la vie nous frappe
y'a personne qui m'arrête, perf et presque sans père
le monde peut tourner, rien ne m'attrape`;

/* ====================== État ====================== */
const state = {
  projects: store.loadProjects(),
  currentId: store.loadCurrentId(),
  settings: { ...store.loadSettings(), elision: true },   // le flow parlé (élision des e caducs) est toujours actif
  analysis: null,
  sections: [],
  tics: [],
  ideas: store.loadIdeas(),          // banque d'idées
  userLex: store.loadUserLex(),      // corrections de prononciation
  usage: new Map(),                  // idée → sons validés où elle est dite
  album: ALL_ALBUMS,                 // projet affiché dans la vue d'ensemble
  lexReady: false,
};

// Corrections de prononciation : appliquées avant toute analyse
for (const [w, e] of Object.entries(state.userLex)) setUserEntry(w, e.phon);

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
    refreshJargon();
    if (p.status === 'valide') refreshIdeas();
  },
  onCaret: () => updateInspector(),
});

const sidebar = createSidebar(
  { list: $('#projectList'), tics: $('#ticsList'), ticsScope: $('#ticsScope'), btnNew: $('#btnNew') },
  {
    onSelect: (id) => { openProject(id); setView('write'); },
    onNew: () => { openProject(createProject()); setView('write'); },
    onTitle: (v) => setProjectField('title', v.trim() || 'Sans titre'),
    onBpm: (v) => { if (v >= 40 && v <= 240) setProjectField('bpm', v); else sidebar.syncEdit(current()); },
    onKey: (v) => setProjectField('key', v),
    onAlbum: (v) => { setProjectField('album', v); refreshIdeas(); },
    onStatus: (v) => { setProjectField('status', v); sidebar.syncEdit(current()); save.flush(); refreshIdeas(); },
    onExport: () => exportCurrent(),
    onDelete: () => deleteCurrent(),
  },
);

const inspector = createInspector({
  line: $('#insLine'), lineNo: $('#insLineNo'), syl: $('#insSyl'), signature: $('#insSignature'),
  ipa: $('#insIpa'), rhyme: $('#insRhyme'), cons: $('#insCons'), reps: $('#insReps'), section: $('#insSection'),
  rhymeInput: $('#rhymeInput'), rhymeResults: $('#rhymeResults'),
}, { onInsert: (w) => { setView('write'); editor.insertAtCursor(w); } });

const player = createPlayer({
  audio: $('#audio'), btnLoad: $('#btnLoad'), fileInput: $('#fileInput'), trackName: $('#trackName'),
  btnPlay: $('#btnPlay'), time: $('#time'), canvas: $('#wave'), waveWrap: $('#waveWrap'),
  btnA: $('#btnA'), btnB: $('#btnB'), btnLoop: $('#btnLoop'), btnBars4: $('#btnBars4'), btnBars8: $('#btnBars8'),
  loopInfo: $('#loopInfo'), btnTap: $('#btnTap'), bpmDisplay: $('#bpmDisplay'), metro: $('#metro'),
  barInfo: $('#barInfo'), btnDownbeat: $('#btnDownbeat'), btnMetro: $('#btnMetro'), btnClick: $('#btnClick'),
}, {
  getBpm: () => current()?.bpm || 90,
  setBpm: (bpm) => { setProjectField('bpm', Math.min(240, Math.max(40, bpm))); sidebar.syncEdit(current()); },
  getOffset: () => current()?.offset || 0,
  setOffset: (t) => setProjectField('offset', t),
});

const understanding = createUnderstanding({
  words: $('#insWords'), editor: $('#pronEditor'), sounds: $('#soundsList'), summary: $('#textSummary'),
}, {
  onPronounce: (word, as) => {
    const phon = analyzeWord(as).phon;                 // calculé AVANT d'enregistrer la correction
    state.userLex[word] = { as, phon };
    store.saveUserLex(state.userLex);
    setUserEntry(word, phon);
    afterLexChange(word);
  },
  onUnpronounce: (word) => {
    delete state.userLex[word];
    store.saveUserLex(state.userLex);
    removeUserEntry(word);
    afterLexChange(word);
  },
  onUseLine: (text) => { setView('write'); editor.insertLineBelow(text); },
  onGotoLine: (i) => { setView('write'); requestAnimationFrame(() => editor.gotoLine(i)); },
});

function afterLexChange(word) {
  resetCaches();
  reindexWord(word);
  analyze();
  refreshJargon();
}

const ideasView = createIdeasView({
  count: $('#ideasCount'), paste: $('#ideasPaste'), importBtn: $('#ideasImportBtn'), preview: $('#ideasPreview'),
  details: $('#ideasImport'), search: $('#ideasSearch'), filter: $('#ideasFilter'), themes: $('#ideasThemes'), list: $('#ideasList'),
}, {
  onImport: (frags) => {
    const known = new Set(state.ideas.map((i) => i.text));
    const added = frags.filter((f) => !known.has(f)).map((f) => store.newIdea(f));
    state.ideas.push(...added);
    saveIdeas();
    return added.length;
  },
  onInsert: (text) => { setView('write'); editor.insertLineBelow(text); },
  onDelete: (id) => { state.ideas = state.ideas.filter((i) => i.id !== id); saveIdeas(); },
});

function saveIdeas() {
  store.saveIdeas(state.ideas);
  refreshIdeas();
  refreshTics();
  refreshJargon();
  updateInspector();
}

const overview = createOverview({ select: $('#albumSelect'), body: $('#albumBody'), jargon: $('#jargonList') }, {
  onSelectAlbum: (v) => { state.album = v; refreshOverview(); },
  onShowIdeas: (f) => { ideasView.setFilter(f); showIdeas(); },
  onWord: (w) => { setView('inspect'); understanding.editWord(w); },
});

/* ====================== Compréhension (thèmes, figures, idées, projet) ====================== */
const refreshSummary = debounce(() => {
  const p = current();
  if (!state.analysis || !p) return;
  const words = new Set(contentWords(p.text));
  understanding.renderSummary({
    themes: detectThemes(p.text),
    mood: detectMood(p.text),
    keywords: keywords(p.text, state.projects.filter((x) => x.id !== p.id).map((x) => x.text)),
    figures: detectFigures(state.analysis),
    ideas: state.ideas.filter((i) => isIdeaUsed(i.text, p.text, words)),
  });
}, 600);

const refreshIdeas = debounce(() => {
  state.usage = ideaUsage(state.ideas, state.projects);
  ideasView.update({ ideas: state.ideas, usage: state.usage });
  refreshOverview();
}, 300);

function refreshOverview() {
  const albums = [...new Set(state.projects.map((p) => p.album).filter(Boolean))].sort();
  const texts = albums.includes(state.album) ? state.projects.filter((p) => p.album === state.album) : state.projects;
  overview.render({ albums, selected: state.album, report: albumReport(texts, state.ideas, state.usage) });
}

/** Mots que tu emploies et que le dictionnaire ne connaît pas (argot, jargon, mots inventés). */
const refreshJargon = debounce(() => {
  if (!state.lexReady) return;
  const counts = new Map();
  for (const text of [...state.projects.map((p) => p.text), ...state.ideas.map((i) => i.text)]) {
    for (const line of text.split('\n')) {
      if (/^\s*[\[#]/.test(line)) continue;
      for (const t of tokenize(line)) {
        const w = t.text.toLowerCase().replace(/’/g, "'").split("'").pop();
        if (w.length < 3 || !/^\p{L}+$/u.test(w)) continue;
        const mine = Boolean(state.userLex[w]);                       // mot corrigé par toi : il reste dans ton vocabulaire
        if (!mine && (isKnownWord(w) || isKnownWord(w.replace(/[sx]$/, '')) || isKnownWord(stripAccents(w)))) continue;
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }
  overview.renderJargon([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40)
    .map(([word, count]) => ({ word, count, fixed: Boolean(state.userLex[word]) })));
}, 1200);

/* ====================== Analyse ====================== */
const analyze = rafThrottle(() => {
  const { settings: s } = state;
  state.analysis = analyzeText(editor.getText(), { elision: s.elision, strict: s.strict, mode: s.mode });
  state.sections = markRepetitions(state.analysis.lines);
  editor.render(state.analysis, { xray: s.xray, grid: s.grid, mode: s.mode });
  updateInspector();
  refreshSummary();
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
  const line = lines[idx];
  understanding.renderWords(line, state.userLex);
  const lyric = line && !line.isMeta && line.words.length;
  understanding.renderSounds(lyric ? soundsLike(line.text, state.ideas) : [], state.ideas.length > 0);
}, 100);

const refreshTics = debounce(() => {
  const texts = [...state.projects.map((p) => p.text), ...state.ideas.map((i) => i.text)];
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
  sidebar.closeEdit();
  player.setBpmDisplay(p.bpm);
  inspector.resetRhymeInput();
  sidebar.renderProjects(state.projects, state.currentId);
  store.saveCurrentId(id);
  analyze();
  if (!isMobile()) editor.focus();   // sur téléphone, ne pas ouvrir le clavier tout seul
}

function deleteCurrent() {
  const p = current();
  if (!confirm(`Supprimer « ${p.title} » ? Cette action est définitive.`)) return;
  state.projects = state.projects.filter((x) => x.id !== p.id);
  if (!state.projects.length) createProject();
  save.flush();
  refreshTics();
  openProject(state.projects.sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
}

function exportCurrent() {
  const p = current();
  const header = `${p.title}${p.bpm ? ` — ${p.bpm} BPM` : ''}${p.key ? ` — ${p.key}` : ''}\n\n`;
  const blob = new Blob([header + p.text], { type: 'text/plain;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${(p.title || 'texte').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'texte'}.txt`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ====================== Réglages / toggles ====================== */
const TOGGLES = { tglXray: 'xray', tglGrid: 'grid', tglStrict: 'strict' };

function syncToggles() {
  for (const [id, key] of Object.entries(TOGGLES)) $(`#${id}`).setAttribute('aria-pressed', String(!!state.settings[key]));
  $$('#segMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.settings.mode)));
}

function setSetting(key, value) {
  state.settings[key] = value;
  store.saveSettings(state.settings);
  if (key === 'elision' || key === 'strict') resetCaches();
  syncToggles();
  analyze();
}

for (const [id, key] of Object.entries(TOGGLES)) $(`#${id}`).addEventListener('click', () => setSetting(key, !state.settings[key]));
$$('#segMode button').forEach((b) => b.addEventListener('click', () => setSetting('mode', b.dataset.mode)));

/* Légende des couleurs (assonances) */
$('#legend').innerHTML = ['a', 'e', 'E', 'i', 'o', 'u', 'y', 'eu', 'an', 'in', 'on', 'wa']
  .map((c) => `<span class="chip"><span class="dot" style="--vc: var(--v-${c})"></span>${CLASS_LABEL[c]}</span>`).join('')
  + '<span class="chip muted">· surligné = assonance · encadré = rime de fin · mode Consonnes : sons consonnes qui reviennent</span>';

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

/* ====================== Mobile : onglets, réglages, clavier ====================== */
const app = $('#app');
const isMobile = () => matchMedia('(max-width: 900px)').matches;
let savedScroll = 0;

function setView(view) {
  const ta = editor.textarea;
  if (app.dataset.view === 'write') savedScroll = editor.scroller.scrollTop;
  app.dataset.view = view;
  $$('#tabbar button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  if (view === 'write') {
    editor.scroller.scrollTop = savedScroll;
  } else {
    ta.blur();
  }
}
$$('#tabbar button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

// Ordinateur : la colonne de gauche bascule entre Textes et Idées
$$('[data-left]').forEach((b) => b.addEventListener('click', () => { app.dataset.left = b.dataset.left; }));
function showIdeas() {
  if (isMobile()) setView('ideas');
  else app.dataset.left = 'ideas';
}

$('#btnPlMore').addEventListener('click', () => {
  const open = $('#player').classList.toggle('open');
  $('#btnPlMore').setAttribute('aria-expanded', String(open));
});

// Hauteur réellement visible (iOS ne redimensionne pas la page quand le clavier s'ouvre)
const vv = window.visualViewport;
function fitViewport() {
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
  app.classList.toggle('kbd', isMobile() && window.innerHeight - h > 150);
  if (isMobile()) window.scrollTo(0, 0);
}
vv?.addEventListener('resize', fitViewport);
vv?.addEventListener('scroll', fitViewport);
window.addEventListener('orientationchange', () => setTimeout(fitViewport, 200));
fitViewport();

const resetCaches = () => { clearCache(); clearSyllableCache(); clearConsonanceCache(); };

/* ====================== Dictionnaire externe (optionnel) ====================== */
// Lexique 3 (CC BY-SA 4.0, New & Pallier) converti en { mot: phonétique }, trié par fréquence.
const lexStatus = $('#lexStatus');
loadLexique('data/lexique.json')
  .then(async (n) => {
    resetCaches();
    state.lexReady = true;
    refreshJargon();
    lexStatus.textContent = `Lexique 3 : ${n.toLocaleString('fr-FR')} mots · indexation des rimes…`;
    analyze();
    const size = await rebuildFromLexicon();
    lexStatus.textContent = `Lexique 3 : ${n.toLocaleString('fr-FR')} mots · ${size.toLocaleString('fr-FR')} indexés pour les rimes.`;
    inspector.refreshRhymes?.();
  })
  .catch(() => { lexStatus.textContent = "Dictionnaire indisponible : liste de base + tes textes."; });

/* ====================== Hors ligne ====================== */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.ready.then(() => { $('#offlineTag').hidden = false; }).catch(() => {});
}

/* ====================== Démarrage ====================== */
syncToggles();
openProject(state.currentId);
refreshTics.flush();
refreshIdeas.flush();
setStatus('Prêt');
