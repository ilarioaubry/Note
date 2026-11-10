/**
 * Onglet Textes → Projet et Profil.
 *  - Projet : avancement (jauge), thèmes abordés (barres classées), ce qui reste dans la banque,
 *    synthèse IA du projet.
 *  - Profil : portrait d'écriture (IA), vocabulaire hors dictionnaire.
 */
import { escapeHTML } from '../utils/dom.js';

export const ALL_ALBUMS = '__all__';

const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const firstLine = (text, max = 60) => {
  const l = text.split('\n')[0];
  return l.length > max ? `${l.slice(0, max)}…` : l;
};

export function createOverview({ select, body, synth, profile, jargon }, { onSelectAlbum, onShowIdeas, onShowGoals, onWord, onSynthesize, onProfile, onOpenSettings }) {
  select.addEventListener('change', () => onSelectAlbum(select.value));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ideas]');
    if (b) onShowIdeas(b.dataset.ideas);
    if (e.target.closest('[data-goals]')) onShowGoals();
  });
  synth.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'synth') onSynthesize();
    if (b.dataset.act === 'settings') onOpenSettings();
  });
  profile.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'profile') onProfile();
    if (b.dataset.act === 'settings') onOpenSettings();
  });
  jargon.addEventListener('click', (e) => {
    const b = e.target.closest('[data-word]');
    if (b) onWord(b.dataset.word);
  });

  /** Barres classées, une seule teinte : le thème le plus présent en premier. */
  function bars(list, value, caption) {
    if (!list.length) return '<p class="empty">Rien pour l\'instant.</p>';
    const max = Math.max(...list.map(value), 1);
    return `<ul class="bars">${list.map((t) => `<li title="${escapeHTML(caption(t))}">
        <span class="bar-name">${escapeHTML(t.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(6, Math.round((value(t) / max) * 100))}%"></span></span>
        <span class="bar-val">${value(t)}</span></li>`).join('')}</ul>`;
  }

  /**
   * @param {{albums:string[], selected:string, report:object}} p
   */
  function render({ albums, selected, report: r, goals = [] }) {
    select.innerHTML = [`<option value="${ALL_ALBUMS}">Tous les textes</option>`]
      .concat(albums.map((a) => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`)).join('');
    select.value = albums.includes(selected) ? selected : ALL_ALBUMS;

    const pct = r.total ? Math.round((r.validated / r.total) * 100) : 0;
    const ideasTotal = r.used + r.free;
    const ideasPct = ideasTotal ? Math.round((r.used / ideasTotal) * 100) : 0;
    body.innerHTML = `
      <div class="card">
        <div class="hero-figure"><b>${r.validated}</b><span>/ ${r.total} ${r.total > 1 ? 'sons validés' : 'son validé'}</span></div>
        <div class="meter" role="img" aria-label="${pct} % des sons validés"><span style="width:${pct}%"></span></div>
        ${r.validated ? '' : '<p class="hint">Quand un texte est fini, passe-le en « Validé » (crayon ✎) : ses thèmes et ses idées compteront comme dits.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Ta banque d'idées</h3><span class="muted small">${ideasTotal ? `${ideasPct} % dites` : ''}</span></div>
        <div class="meter" role="img" aria-label="${ideasPct} % des idées dites"><span style="width:${ideasPct}%"></span></div>
        <div class="split">
          <button class="split-btn" data-ideas="used" type="button"><b>${r.used}</b><span>${r.used > 1 ? 'idées dites' : 'idée dite'}</span></button>
          <button class="split-btn" data-ideas="free" type="button"><b>${r.free}</b><span>pas encore ${r.free > 1 ? 'dites' : 'dite'}</span></button>
        </div>
      </div>
      ${goals.length ? `<div class="card">
        <div class="card-head"><h3>À retrouver dans le projet</h3><button class="btn btn-sm" data-goals type="button">Voir</button></div>
        <div class="meter" role="img" aria-label="${goals.filter((g) => g.statut === 'fait').length} sur ${goals.length}"><span style="width:${Math.round((goals.filter((g) => g.statut === 'fait').length / goals.length) * 100)}%"></span></div>
        <ul class="goals compact">${goals.slice(0, 5).map((g) => `<li class="goal-mini ${g.statut}"><span class="dot"></span>${escapeHTML(g.text)}</li>`).join('')}</ul>
        ${goals.length > 5 ? `<p class="hint">et ${goals.length - 5} autre${goals.length - 5 > 1 ? 's' : ''}…</p>` : ''}
      </div>` : ''}
      <div class="card">
        <div class="card-head"><h3>Thèmes abordés</h3><span class="muted small">sons validés</span></div>
        ${bars(r.covered, (t) => t.songs.length, (t) => t.songs.join(', '))}
      </div>
      <div class="card">
        <div class="card-head"><h3>Pas encore abordé</h3><span class="muted small">dans tes idées</span></div>
        ${bars(r.waiting, (t) => t.ideas, (t) => plural(t.ideas, 'idée'))}
      </div>`;
  }

  /**
   * Synthèse IA du projet.
   * @param {{state:'nokey'|'idle'|'loading'|'error'|'ready', result?:object, error?:string, ideasById?:Map}} p
   */
  function renderSynthesis({ state, result, error, ideasById = new Map() }) {
    if (state === 'nokey') {
      synth.innerHTML = `<div class="card hero"><div class="hero-icon">✦</div><p>Avec l'IA, tu obtiens une vraie synthèse du projet : ce qu'il raconte, ce qui se répète, et les angles que tes idées permettent encore d'écrire.</p>
        <button class="btn btn-accent" data-act="settings" type="button">Activer l'IA</button></div>`;
      return;
    }
    if (state === 'loading') { synth.innerHTML = '<div class="card hero loading"><div class="spinner" aria-hidden="true"></div><p class="muted">Synthèse du projet en cours…</p></div>'; return; }
    if (state === 'error') { synth.innerHTML = `<div class="card hero error"><p>${escapeHTML(error ?? '')}</p><button class="btn btn-accent" data-act="synth" type="button">Réessayer</button></div>`; return; }
    if (state === 'idle' || !result) {
      synth.innerHTML = '<div class="card hero"><div class="hero-icon">✦</div><p>Demande une vue d\'ensemble du projet : ce qu\'il raconte déjà et ce qu\'il lui manque.</p><button class="btn btn-accent" data-act="synth" type="button">Faire la synthèse du projet</button></div>';
      return;
    }
    const d = result.data;
    synth.innerHTML = `
      <div class="card hero-read">
        <div class="card-head"><h3>✦ Vue d'ensemble</h3><button class="btn btn-sm" data-act="synth" type="button">Actualiser</button></div>
        <p class="read">${escapeHTML(d.vue)}</p>
      </div>
      ${d.a_explorer.length ? `<div class="card"><div class="card-head"><h3>À écrire ensuite</h3></div>${d.a_explorer.map((x) => `<div class="note next">
          <div class="note-head"><b>${escapeHTML(x.titre)}</b></div><p>${escapeHTML(x.pourquoi)}</p>
          ${x.ideaIds.map((id) => ideasById.get(id)).filter(Boolean).map((i) => `<p class="quote">« ${escapeHTML(firstLine(i.text))} »</p>`).join('')}
        </div>`).join('')}</div>` : ''}
      ${d.redites.length ? `<div class="card"><div class="card-head"><h3>Ça se répète</h3></div><ul class="plain">${d.redites.map((x) => `<li>${escapeHTML(x)}</li>`).join('')}</ul></div>` : ''}`;
  }

  /**
   * Profil d'écriture (IA).
   * @param {{state:'nokey'|'idle'|'loading'|'error'|'ready', result?:object, error?:string}} p
   */
  function renderProfile({ state, result, error }) {
    if (state === 'nokey') {
      profile.innerHTML = `<div class="card hero"><div class="hero-icon">✦</div><h2>Ton profil d'écriture</h2><p>L'IA lit tous tes textes et ta banque d'idées pour décrire ta voix : tes thèmes, tes mots, tes procédés. Elle s'en sert ensuite pour te proposer des suites qui te ressemblent.</p>
        <button class="btn btn-accent" data-act="settings" type="button">Activer l'IA</button></div>`;
      return;
    }
    if (state === 'loading') { profile.innerHTML = '<div class="card hero loading"><div class="spinner" aria-hidden="true"></div><p class="muted">Lecture de tous tes textes…</p></div>'; return; }
    if (state === 'error') { profile.innerHTML = `<div class="card hero error"><p>${escapeHTML(error ?? '')}</p><button class="btn btn-accent" data-act="profile" type="button">Réessayer</button></div>`; return; }
    if (state === 'idle' || !result) {
      profile.innerHTML = '<div class="card hero"><div class="hero-icon">✦</div><h2>Ton profil d\'écriture</h2><p>Fais lire tous tes textes à l\'IA pour qu\'elle décrive ta voix et s\'en serve dans ses propositions.</p><button class="btn btn-accent btn-lg" data-act="profile" type="button">Établir mon profil</button></div>';
      return;
    }
    const d = result.data;
    const pills = (list, cls = '') => list.map((x) => `<span class="pill ${cls}">${escapeHTML(x)}</span>`).join('');
    const block = (title, html) => (html ? `<h4>${title}</h4><div class="pill-row">${html}</div>` : '');
    const lines = (title, list) => (list.length ? `<h4>${title}</h4><ul class="plain">${list.map((x) => `<li>${escapeHTML(x)}</li>`).join('')}</ul>` : '');
    profile.innerHTML = `<div class="card hero-read">
        <div class="card-head"><h3>✦ Ta voix</h3><button class="btn btn-sm" data-act="profile" type="button">Actualiser</button></div>
        <p class="read">${escapeHTML(d.portrait)}</p>
        ${block('Tes thèmes', pills(d.themes, 'theme'))}
        ${block('Tes mots', pills(d.signatures))}
        ${lines('Tes procédés', d.procedes)}
        ${lines('Tes forces', d.forces)}
        ${lines('À explorer', d.angles_morts)}
      </div>`;
  }

  function renderJargon(words) {
    jargon.innerHTML = words.length
      ? words.map((w) => `<button class="chip-btn word${w.fixed ? ' fixed' : ''}" data-word="${escapeHTML(w.word)}" type="button" title="${w.fixed ? 'Prononciation corrigée' : 'Toucher pour corriger la prononciation'}">${escapeHTML(w.word)}${w.fixed ? ' ✓' : ''} <b>${w.count}</b></button>`).join('')
      : '<span class="empty">Aucun mot inconnu du dictionnaire pour l\'instant.</span>';
  }

  return { render, renderSynthesis, renderProfile, renderJargon };
}
