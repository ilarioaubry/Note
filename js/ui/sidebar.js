/**
 * Colonne « Textes » : liste des textes, crayon ✎ sur le texte sélectionné
 * (titre, BPM, gamme, export, suppression) et Radar à Tics.
 */
import { escapeHTML } from '../utils/dom.js';

export const KEYS = ['', 'C', 'Cm', 'C#', 'C#m', 'D', 'Dm', 'Eb', 'Ebm', 'E', 'Em', 'F', 'Fm', 'F#', 'F#m',
  'G', 'Gm', 'Ab', 'Abm', 'A', 'Am', 'Bb', 'Bbm', 'B', 'Bm'];
const NOTE_FR = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
export const keyLabel = (k) => {
  if (!k) return 'Gamme —';
  const minor = k.endsWith('m');
  const root = minor ? k.slice(0, -1) : k;
  const fr = NOTE_FR[root[0]] + (root[1] === '#' ? '♯' : root[1] === 'b' ? '♭' : '');
  return `${k} · ${fr} ${minor ? 'min' : 'maj'}`;
};

export function createSidebar({ list, tics, ticsScope, btnNew }, { onSelect, onNew, onTitle, onBpm, onKey, onExport, onDelete }) {
  let editing = false;
  let lastProjects = [];
  let lastId = null;

  /* ----- Panneau d'édition (un seul nœud, replacé sous la carte active) ----- */
  const panel = document.createElement('li');
  panel.className = 'edit-panel';
  panel.innerHTML = `
    <label class="field wide"><span>Titre</span><input id="docTitle" type="text" placeholder="Titre du morceau" spellcheck="false" autocomplete="off"></label>
    <div class="edit-row">
      <label class="field"><span>BPM</span><input id="docBpm" type="number" inputmode="numeric" min="40" max="240" step="1"></label>
      <label class="field grow"><span>Gamme</span><select id="docKey">${KEYS.map((k) => `<option value="${k}">${escapeHTML(keyLabel(k))}</option>`).join('')}</select></label>
    </div>
    <div class="edit-row">
      <button class="btn" id="btnExport" type="button">Exporter .txt</button>
      <button class="btn btn-danger" id="btnDelete" type="button">Supprimer</button>
    </div>`;
  const $in = (sel) => panel.querySelector(sel);
  const inTitle = $in('#docTitle'), inBpm = $in('#docBpm'), inKey = $in('#docKey');

  inTitle.addEventListener('input', () => onTitle(inTitle.value));
  // BPM : pris en compte dès que la valeur est valide (40–240) ; à la sortie du champ, une valeur invalide est remise à jour
  inBpm.addEventListener('input', () => { const v = parseInt(inBpm.value, 10); if (v >= 40 && v <= 240) onBpm(v); });
  inBpm.addEventListener('change', () => onBpm(parseInt(inBpm.value, 10)));
  inKey.addEventListener('change', () => onKey(inKey.value));
  $in('#btnExport').addEventListener('click', onExport);
  $in('#btnDelete').addEventListener('click', onDelete);
  panel.addEventListener('click', (e) => e.stopPropagation());

  btnNew.addEventListener('click', () => { editing = false; onNew(); });
  list.addEventListener('click', (e) => {
    if (e.target.closest('.edit-panel')) return;
    const pencil = e.target.closest('[data-edit]');
    if (pencil) { setEditing(!editing); return; }
    const li = e.target.closest('li[data-id]');
    if (li) { if (li.dataset.id !== lastId) editing = false; onSelect(li.dataset.id); }
  });

  function setEditing(v) {
    editing = v;
    renderProjects(lastProjects, lastId);
    if (v) inTitle.focus({ preventScroll: false });
  }

  /** Remplit le panneau (sans écraser un champ en cours de saisie). */
  function syncEdit(p) {
    if (!p) return;
    if (document.activeElement !== inTitle) inTitle.value = p.title === 'Sans titre' ? '' : p.title;
    if (document.activeElement !== inBpm) inBpm.value = p.bpm || '';
    inKey.value = p.key || '';
  }

  const cardHTML = (p, active) => {
    const lines = p.text.split('\n').filter((l) => l.trim() && !/^\s*[\[#]/.test(l)).length;
    const date = new Date(p.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `<span class="p-top"><span class="p-title">${escapeHTML(p.title || 'Sans titre')}</span>${
      active ? `<button class="p-edit${editing ? ' on' : ''}" data-edit type="button" aria-label="Modifier le titre, le BPM et la gamme" aria-expanded="${editing}">✎</button>` : ''}</span>
      <span class="p-meta">
        ${p.bpm ? `<span class="tag bpm">${p.bpm} BPM</span>` : ''}
        ${p.key ? `<span class="tag key">${escapeHTML(p.key)}</span>` : ''}
        <span class="tag">${lines} l.</span>
        <span class="muted small">${date}</span>
      </span>`;
  };

  function renderProjects(projects, currentId) {
    lastProjects = projects;
    lastId = currentId;
    const current = projects.find((p) => p.id === currentId);

    // Pendant la saisie dans le panneau, on ne touche pas au DOM (le clavier se fermerait) : on ne rafraîchit que la carte
    if (panel.isConnected && panel.contains(document.activeElement)) {
      const li = list.querySelector('li.active');
      if (li && current) li.innerHTML = cardHTML(current, true);
      return;
    }

    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    list.innerHTML = sorted.map((p) =>
      `<li data-id="${p.id}" class="${p.id === currentId ? 'active' : ''}">${cardHTML(p, p.id === currentId)}</li>`).join('');
    if (editing && current) {
      list.querySelector('li.active')?.after(panel);
      syncEdit(current);
    }
  }

  function renderTics(top, nTexts) {
    ticsScope.textContent = `${nTexts} texte${nTexts > 1 ? 's' : ''}`;
    if (!top.length) {
      tics.innerHTML = '<li class="empty">Pas encore assez de matière.</li>';
      return;
    }
    const max = top[0].count;
    tics.innerHTML = top.map((t) => `<li title="${t.count} occurrences">
      <span>${escapeHTML(t.word)}</span><span class="count">×${t.count}</span>
      <span class="bar-bg"><span class="bar-fg" style="display:block;width:${Math.round((t.count / max) * 100)}%"></span></span>
    </li>`).join('');
  }

  return { renderProjects, renderTics, syncEdit, closeEdit: () => { editing = false; } };
}
