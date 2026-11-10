/** Colonne « Textes » : panneau Projet (ce qui est dit / reste à dire) et « Ton vocabulaire ». */
import { escapeHTML } from '../utils/dom.js';

export const ALL_ALBUMS = '__all__';

export function createOverview({ select, body, jargon }, { onSelectAlbum, onShowIdeas, onWord }) {
  select.addEventListener('change', () => onSelectAlbum(select.value));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ideas]');
    if (b) onShowIdeas(b.dataset.ideas);
  });
  jargon.addEventListener('click', (e) => {
    const b = e.target.closest('[data-word]');
    if (b) onWord(b.dataset.word);
  });

  /**
   * @param {{albums:string[], selected:string, report:object}} p
   */
  function render({ albums, selected, report: r }) {
    select.innerHTML = [`<option value="${ALL_ALBUMS}">Tous les textes</option>`]
      .concat(albums.map((a) => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`)).join('');
    select.value = albums.includes(selected) ? selected : ALL_ALBUMS;

    const chips = (list, fmt) => list.length ? list.map(fmt).join('') : '<span class="empty">—</span>';
    body.innerHTML = `
      <div class="album-stats">
        <div><b>${r.validated}</b><span>son${r.validated > 1 ? 's' : ''} validé${r.validated > 1 ? 's' : ''} / ${r.total}</span></div>
        <button class="stat-btn" data-ideas="used" type="button"><b>${r.used}</b><span>idée${r.used > 1 ? 's' : ''} dite${r.used > 1 ? 's' : ''}</span></button>
        <button class="stat-btn" data-ideas="free" type="button"><b>${r.free}</b><span>pas encore dite${r.free > 1 ? 's' : ''}</span></button>
      </div>
      <div class="ins-label muted">Thèmes abordés dans les sons validés</div>
      <div class="chips">${chips(r.covered, (t) => `<span class="tag theme" title="${escapeHTML(t.songs.join(', '))}">${escapeHTML(t.label)} <b>${t.songs.length}</b></span>`)}</div>
      <div class="ins-label muted">Dans tes idées, pas encore abordé</div>
      <div class="chips">${chips(r.waiting, (t) => `<span class="tag waiting">${escapeHTML(t.label)} <b>${t.ideas}</b></span>`)}</div>
      ${r.validated ? '' : '<p class="muted small hint">Valide un texte (crayon ✎ → Statut : Validé) pour que ses thèmes et ses idées comptent comme dits.</p>'}`;
  }

  function renderJargon(words) {
    jargon.innerHTML = words.length
      ? words.map((w) => `<button class="chip-btn word${w.fixed ? ' fixed' : ''}" data-word="${escapeHTML(w.word)}" type="button" title="${w.fixed ? 'Prononciation corrigée' : 'Toucher pour corriger la prononciation'}">${escapeHTML(w.word)}${w.fixed ? ' ✓' : ''} <b>${w.count}</b></button>`).join('')
      : '<span class="empty">Aucun mot inconnu du dictionnaire pour l\'instant.</span>';
  }

  return { render, renderJargon };
}
