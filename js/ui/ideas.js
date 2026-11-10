/** Vue « Idées » : banque de fragments (import de ta note, filtres, insertion dans le texte). */
import { escapeHTML, debounce } from '../utils/dom.js';
import { splitNote } from '../engine/ideas.js';
import { detectThemes } from '../engine/themes.js';
import { stripAccents } from '../engine/lexicon.js';

export function createIdeasView(els, { onImport, onInsert, onDelete }) {
  const { count, paste, importBtn, preview, details, search, filter, themes, list } = els;
  const ui = { query: '', filter: 'all', theme: null };
  let data = { ideas: [], usage: new Map() };
  const themeCache = new Map();                  // texte d'idée → thèmes (calcul coûteux, on garde)
  const themesOf = (idea) => {
    if (!themeCache.has(idea.text)) themeCache.set(idea.text, detectThemes(idea.text));
    return themeCache.get(idea.text);
  };

  /* ----- Import ----- */
  const updatePreview = () => {
    const n = splitNote(paste.value).length;
    preview.textContent = paste.value.trim() ? `${n} idée${n > 1 ? 's' : ''} détectée${n > 1 ? 's' : ''}` : '';
  };
  paste.addEventListener('input', debounce(updatePreview, 150));
  importBtn.addEventListener('click', () => {
    const frags = splitNote(paste.value);
    if (!frags.length) return;
    const added = onImport(frags);
    paste.value = '';
    preview.textContent = `${added} idée${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} ✓`;
    details.open = false;
  });

  /* ----- Filtres ----- */
  search.addEventListener('input', debounce(() => { ui.query = stripAccents(search.value.trim().toLowerCase()); render(); }, 120));
  filter.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    setFilter(b.dataset.f);
  });
  themes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    ui.theme = ui.theme === b.dataset.theme ? null : b.dataset.theme;
    render();
  });

  function setFilter(f) {
    ui.filter = f;
    filter.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    render();
  }

  /* ----- Actions sur une idée ----- */
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    const idea = data.ideas.find((i) => i.id === id);
    if (!idea) return;
    if (b.dataset.act === 'insert') onInsert(idea.text);
    if (b.dataset.act === 'delete' && confirm('Supprimer cette idée de la banque ?')) onDelete(id);
  });

  function render() {
    const { ideas, usage } = data;
    const usedCount = ideas.filter((i) => (usage.get(i.id) ?? []).length).length;
    count.textContent = ideas.length ? `${ideas.length} idée${ideas.length > 1 ? 's' : ''} · ${usedCount} dite${usedCount > 1 ? 's' : ''}` : '';

    // Thèmes présents dans la banque (filtre)
    const all = new Map();
    for (const i of ideas) for (const t of themesOf(i)) all.set(t.id, { label: t.label, n: (all.get(t.id)?.n ?? 0) + 1 });
    themes.innerHTML = [...all].sort((a, b) => b[1].n - a[1].n)
      .map(([id, t]) => `<button class="chip-btn${ui.theme === id ? ' on' : ''}" data-theme="${id}">${escapeHTML(t.label)} <b>${t.n}</b></button>`).join('');

    const shown = ideas.filter((i) => {
      const used = (usage.get(i.id) ?? []).length > 0;
      if (ui.filter === 'free' && used) return false;
      if (ui.filter === 'used' && !used) return false;
      if (ui.theme && !themesOf(i).some((t) => t.id === ui.theme)) return false;
      if (ui.query && !stripAccents(i.text.toLowerCase()).includes(ui.query)) return false;
      return true;
    });

    if (!ideas.length) {
      list.innerHTML = '<li class="empty idea-empty">Ta banque est vide. Touche « Coller ma note » et colle ta note d\'idées : chaque bloc séparé par une ligne vide devient une idée.</li>';
      return;
    }
    if (!shown.length) { list.innerHTML = '<li class="empty idea-empty">Aucune idée ne correspond.</li>'; return; }

    list.innerHTML = shown.map((i) => {
      const used = usage.get(i.id) ?? [];
      const th = themesOf(i).slice(0, 3).map((t) => `<span class="tag">${escapeHTML(t.label)}</span>`).join('');
      const status = used.length
        ? `<span class="tag ok" title="Dite dans un son validé">✓ dite · ${escapeHTML(used.map((u) => u.title).join(', '))}</span>`
        : '<span class="tag">pas encore dite</span>';
      return `<li class="idea${used.length ? ' used' : ''}" data-id="${i.id}">
        <div class="idea-text">${escapeHTML(i.text)}</div>
        <div class="idea-meta">${status}${th}</div>
        <div class="idea-actions">
          <button class="btn btn-sm" data-act="insert" type="button">Insérer dans le texte</button>
          <button class="btn btn-sm btn-danger" data-act="delete" type="button">Supprimer</button>
        </div>
      </li>`;
    }).join('');
  }

  return {
    update(d) { data = d; render(); },
    setFilter,
    clearThemeCache: () => themeCache.clear(),
  };
}
