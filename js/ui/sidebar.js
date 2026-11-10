/** Colonne gauche : liste des textes + Radar à Tics. */
import { escapeHTML } from '../utils/dom.js';

export function createSidebar({ list, tics, ticsScope, btnNew }, { onSelect, onNew }) {
  btnNew.addEventListener('click', () => onNew());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) onSelect(li.dataset.id);
  });

  function renderProjects(projects, currentId) {
    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    list.innerHTML = sorted.map((p) => {
      const lines = p.text.split('\n').filter((l) => l.trim() && !/^\s*[\[#]/.test(l)).length;
      const date = new Date(p.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      return `<li data-id="${p.id}" class="${p.id === currentId ? 'active' : ''}">
        <span class="p-title">${escapeHTML(p.title || 'Sans titre')}</span>
        <span class="p-meta">
          ${p.bpm ? `<span class="tag bpm">${p.bpm} BPM</span>` : ''}
          ${p.key ? `<span class="tag key">${escapeHTML(p.key)}</span>` : ''}
          <span class="tag">${lines} l.</span>
          <span class="muted small">${date}</span>
        </span>
      </li>`;
    }).join('');
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

  return { renderProjects, renderTics };
}
