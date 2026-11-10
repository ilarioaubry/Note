/**
 * Vue « Idées » : banque de fragments. Import de ta note, classement par l'IA (sens, thèmes,
 * humeur), filtres, insertion dans le texte.
 */
import { escapeHTML, debounce } from '../utils/dom.js';
import { splitNote } from '../engine/ideas.js';
import { themesOfIdea } from '../engine/project.js';
import { stripAccents } from '../engine/lexicon.js';

export function createIdeasView(els, { onImport, onInsert, onDelete, onClassify, onOpenSettings }) {
  const { count, paste, importBtn, preview, details, search, filter, themes, list, ai } = els;
  const ui = { query: '', filter: 'all', theme: null, open: null };
  let data = { ideas: [], usage: new Map() };
  const themeCache = new Map();                  // idée → thèmes (le repérage local est coûteux)
  const themesOf = (idea) => {
    const k = idea.ai ? `ai:${idea.id}:${idea.ai.themes.join('|')}` : idea.text;
    if (!themeCache.has(k)) themeCache.set(k, themesOfIdea(idea));
    return themeCache.get(k);
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
    if (b) setFilter(b.dataset.f);
  });
  themes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    ui.theme = ui.theme === b.dataset.theme ? null : b.dataset.theme;
    render();
  });
  ai.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'classify') onClassify();
    if (b.dataset.act === 'settings') onOpenSettings();
  });

  function setFilter(f) {
    ui.filter = f;
    filter.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    render();
  }

  /* ----- Une idée : toucher la carte ouvre ses actions ----- */
  list.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const act = e.target.closest('button[data-act]')?.dataset.act;
    const idea = data.ideas.find((i) => i.id === id);
    if (!idea) return;
    if (act === 'insert') { onInsert(idea.text); return; }
    if (act === 'delete') { if (confirm('Supprimer cette idée de la banque ?')) onDelete(id); return; }
    ui.open = ui.open === id ? null : id;
    render();
  });

  /**
   * Bandeau IA : propose de classer les idées qui ne l'ont pas encore été.
   * @param {{state:'nokey'|'idle'|'loading'|'error', todo:number, done?:number, error?:string}} p
   */
  function renderAI({ state, todo, done = 0, error }) {
    if (!data.ideas.length || (!todo && state !== 'error')) { ai.innerHTML = ''; return; }
    if (state === 'nokey') {
      ai.innerHTML = `<div class="banner soft"><span>Active l'IA pour qu'elle comprenne et classe tes idées (sens, thèmes, humeur).</span><button class="btn btn-sm" data-act="settings" type="button">Activer</button></div>`;
    } else if (state === 'loading') {
      ai.innerHTML = `<div class="banner soft"><span><span class="spinner sm" aria-hidden="true"></span> L'IA lit tes idées… ${done} / ${todo}</span></div>`;
    } else if (state === 'error') {
      ai.innerHTML = `<div class="banner soft"><span>${escapeHTML(error ?? '')}</span><button class="btn btn-sm" data-act="classify" type="button">Réessayer</button></div>`;
    } else {
      ai.innerHTML = `<div class="banner soft"><span>${todo} idée${todo > 1 ? 's' : ''} pas encore lue${todo > 1 ? 's' : ''} par l'IA.</span><button class="btn btn-sm btn-accent" data-act="classify" type="button">✦ Classer</button></div>`;
    }
  }

  function render() {
    const { ideas, usage } = data;
    const usedCount = ideas.filter((i) => (usage.get(i.id) ?? []).length).length;
    count.textContent = ideas.length ? `${ideas.length} idée${ideas.length > 1 ? 's' : ''} · ${usedCount} dite${usedCount > 1 ? 's' : ''}` : '';

    // Thèmes présents dans la banque (filtre)
    const all = new Map();
    for (const i of ideas) for (const t of themesOf(i)) all.set(t.toLowerCase(), { label: t, n: (all.get(t.toLowerCase())?.n ?? 0) + 1 });
    themes.innerHTML = [...all].sort((a, b) => b[1].n - a[1].n).slice(0, 14)
      .map(([id, t]) => `<button class="${ui.theme === id ? 'on' : ''}" data-theme="${escapeHTML(id)}" type="button">${escapeHTML(t.label)} <b>${t.n}</b></button>`).join('');

    const shown = ideas.filter((i) => {
      const used = (usage.get(i.id) ?? []).length > 0;
      if (ui.filter === 'free' && used) return false;
      if (ui.filter === 'used' && !used) return false;
      if (ui.theme && !themesOf(i).some((t) => t.toLowerCase() === ui.theme)) return false;
      if (ui.query && !stripAccents(`${i.text} ${i.ai?.sens ?? ''}`.toLowerCase()).includes(ui.query)) return false;
      return true;
    });

    if (!ideas.length) {
      list.innerHTML = `<li class="card hero"><div class="hero-icon">✦</div><h2>Ta banque d'idées</h2>
        <p>Colle ta note de bouts de texte : chaque bloc séparé par une ligne vide devient une idée, classée et prête à ressortir quand tu écris.</p></li>`;
      return;
    }
    if (!shown.length) { list.innerHTML = '<li class="empty">Aucune idée ne correspond.</li>'; return; }

    list.innerHTML = shown.map((i) => {
      const used = usage.get(i.id) ?? [];
      const th = themesOf(i).slice(0, 2).map((t) => `<span class="pill theme">${escapeHTML(t)}</span>`).join('');
      const open = ui.open === i.id;
      return `<li class="idea${used.length ? ' used' : ''}${open ? ' open' : ''}" data-id="${i.id}">
        ${i.ai?.sens ? `<div class="idea-sens">${escapeHTML(i.ai.sens)}</div>` : ''}
        <div class="idea-text">${escapeHTML(i.text)}</div>
        <div class="pill-row">
          ${used.length ? `<span class="pill ok" title="Dite dans un son validé">✓ ${escapeHTML(used.map((u) => u.title).join(', '))}</span>` : ''}
          ${th}${i.ai?.mood ? `<span class="pill">${escapeHTML(i.ai.mood)}</span>` : ''}
        </div>
        ${open ? `<div class="idea-actions">
          <button class="btn btn-accent" data-act="insert" type="button">Insérer dans le texte</button>
          <button class="btn btn-danger" data-act="delete" type="button">Supprimer</button>
        </div>` : ''}
      </li>`;
    }).join('');
  }

  return {
    update(d) { data = d; render(); },
    renderAI,
    setFilter,
  };
}
