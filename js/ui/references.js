/**
 * Onglet Idées → Références et À retrouver.
 *  - Références : artistes et références culturelles qui nourrissent l'écriture (et les suggestions IA).
 *  - À retrouver : ce que l'auteur veut dans son projet final ; l'état de chaque objectif est
 *    déduit des lectures IA des textes et de la synthèse, ou coché à la main.
 */
import { escapeHTML } from '../utils/dom.js';

const KIND = { artiste: 'Artiste', reference: 'Référence' };
const STATUS = {
  fait: { label: 'Fait', cls: 'ok' },
  partiel: { label: 'En cours', cls: 'partial' },
  manquant: { label: 'À faire', cls: '' },
};

export function createReferencesView(els, { onAdd, onRemove, onToggleGoal, onNote, onSuggest, onOpenSettings }) {
  const { refForm, refsList, refsAI, goalForm, goalsList, goalsMeter } = els;
  let kind = 'artiste';
  let openId = null;
  let data = { refs: [], statusOf: () => STATUS.manquant, aiState: 'idle', suggestions: [], error: '' };

  /* ----- Ajouter une référence ----- */
  refForm.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    kind = b.dataset.kind;
    refForm.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.kind === kind)));
    refForm.querySelector('#refText').placeholder = kind === 'artiste'
      ? 'Un artiste : Nekfeu, Kendrick, Brel…'
      : 'Une référence : La Haine, One Piece, Zidane, Rimbaud…';
  });
  refForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = refForm.querySelector('#refText').value.trim();
    if (!text) return;
    onAdd(kind, text, refForm.querySelector('#refNote').value.trim());
    refForm.reset();
    refForm.querySelector('#refText').focus();
  });

  /* ----- Ajouter un objectif ----- */
  goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = goalForm.querySelector('#goalText');
    const text = input.value.trim();
    if (!text) return;
    onAdd('objectif', text, '');
    input.value = '';
    input.focus();
  });

  /* ----- Actions ----- */
  const act = (e) => {
    const b = e.target.closest('[data-act]');
    const card = e.target.closest('[data-id]');
    if (!b && card && !e.target.closest('input')) { openId = openId === card.dataset.id ? null : card.dataset.id; render(); return; }
    if (!b) return;
    const id = b.closest('[data-id]')?.dataset.id;
    switch (b.dataset.act) {
      case 'remove': if (confirm('Retirer de la liste ?')) onRemove(id); break;
      case 'toggle': onToggleGoal(id); break;
      case 'note': {
        const v = prompt('Ce que tu en retiens (pour guider les suggestions) :', data.refs.find((r) => r.id === id)?.note ?? '');
        if (v !== null) onNote(id, v.trim());
        break;
      }
      case 'suggest': onSuggest(); break;
      case 'settings': onOpenSettings(); break;
      case 'adopt': {
        const s = data.suggestions[Number(b.dataset.i)];
        if (s) onAdd(s.kind, s.nom, s.pourquoi);
        break;
      }
      default:
    }
  };
  refsList.addEventListener('click', act);
  refsAI.addEventListener('click', act);
  goalsList.addEventListener('click', act);

  function renderRefs() {
    const list = data.refs.filter((r) => r.kind !== 'objectif');
    const group = (k) => list.filter((r) => r.kind === k);
    const item = (r) => `<li class="ref${openId === r.id ? ' open' : ''}" data-id="${r.id}">
        <div class="ref-main"><span class="ref-name">${escapeHTML(r.text)}</span>${r.note ? `<span class="ref-note">${escapeHTML(r.note)}</span>` : ''}</div>
        ${openId === r.id ? `<div class="ref-actions"><button class="btn btn-sm" data-act="note" type="button">${r.note ? 'Modifier la note' : 'Ajouter une note'}</button>
          <button class="btn btn-sm btn-danger" data-act="remove" type="button">Retirer</button></div>` : ''}
      </li>`;
    const section = (k, title) => (group(k).length ? `<h4>${title} <span class="muted">${group(k).length}</span></h4><ul class="refs">${group(k).map(item).join('')}</ul>` : '');
    refsList.innerHTML = list.length
      ? `<div class="card">${section('artiste', 'Artistes')}${section('reference', 'Références')}</div>`
      : `<div class="card hero"><div class="hero-icon">✦</div><h2>Tes influences</h2>
          <p>Ajoute les artistes et les références (films, livres, mangas, sportifs, moments…) qui t'inspirent. L'IA s'en sert pour te proposer des images et des allusions qui te ressemblent, et les repère dans tes textes.</p></div>`;

    // Suggestions IA
    const { aiState, suggestions, error } = data;
    if (aiState === 'nokey') {
      refsAI.innerHTML = '<div class="banner soft"><span>Active l\'IA pour qu\'elle te propose des références à explorer.</span><button class="btn btn-sm" data-act="settings" type="button">Activer</button></div>';
    } else if (aiState === 'loading') {
      refsAI.innerHTML = '<div class="banner soft"><span><span class="spinner sm" aria-hidden="true"></span> L\'IA cherche des références pour toi…</span></div>';
    } else if (aiState === 'error') {
      refsAI.innerHTML = `<div class="banner soft"><span>${escapeHTML(error)}</span><button class="btn btn-sm" data-act="suggest" type="button">Réessayer</button></div>`;
    } else if (suggestions.length) {
      refsAI.innerHTML = `<div class="card"><div class="card-head"><h3>✦ À explorer</h3><button class="btn btn-sm" data-act="suggest" type="button">D'autres</button></div>
        <ul class="rows actions">${suggestions.map((s, i) => `<li><div><span><b>${escapeHTML(s.nom)}</b> <span class="pill">${KIND[s.kind]}</span></span><p>${escapeHTML(s.pourquoi)}</p></div>
          <button class="btn btn-sm btn-accent" data-act="adopt" data-i="${i}" type="button">＋</button></li>`).join('')}</ul></div>`;
    } else {
      refsAI.innerHTML = '<button class="btn wide-btn" data-act="suggest" type="button">✦ Me suggérer des références</button>';
    }
  }

  function renderGoals() {
    const goals = data.refs.filter((r) => r.kind === 'objectif');
    const st = goals.map((g) => ({ g, s: data.statusOf(g) }));
    const done = st.filter((x) => x.s.statut === 'fait').length;
    const partial = st.filter((x) => x.s.statut === 'partiel').length;
    goalsMeter.innerHTML = goals.length ? `<div class="card">
        <div class="hero-figure"><b>${done}</b><span>/ ${goals.length} réalisé${goals.length > 1 ? 's' : ''}${partial ? ` · ${partial} en cours` : ''}</span></div>
        <div class="meter" role="img" aria-label="${done} objectifs réalisés sur ${goals.length}"><span style="width:${Math.round((done / goals.length) * 100)}%"></span></div>
      </div>` : '';
    goalsList.innerHTML = goals.length
      ? `<ul class="goals">${st.map(({ g, s }) => `<li class="goal ${STATUS[s.statut].cls}" data-id="${g.id}">
          <button class="check${g.done ? ' on' : ''}" data-act="toggle" type="button" aria-label="${g.done ? 'Décocher' : 'Cocher comme fait'}" aria-pressed="${g.done}">${s.statut === 'fait' ? '✓' : ''}</button>
          <div class="goal-main"><span>${escapeHTML(g.text)}</span>
            <span class="goal-status"><span class="pill ${STATUS[s.statut].cls}">${STATUS[s.statut].label}</span>${s.ou && s.source !== 'main' ? ` ${escapeHTML(s.ou)}` : ''}</span></div>
          ${openId === g.id ? '<button class="btn btn-sm btn-danger" data-act="remove" type="button">Retirer</button>' : ''}
        </li>`).join('')}</ul>`
      : `<div class="card hero"><div class="hero-icon">◎</div><h2>Ce que tu veux dans ton projet</h2>
          <p>Note ce que tu veux retrouver dans le projet final : un son sur ton père, une référence à La Haine, un refrain chanté, une ambiance… L'IA repère dans tes textes ce qui est fait et ce qui manque, et en tient compte dans ses suggestions.</p></div>`;
  }

  function render() { renderRefs(); renderGoals(); }

  return {
    update(d) { data = { ...data, ...d }; render(); },
  };
}
