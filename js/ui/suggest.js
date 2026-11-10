/**
 * « Souffle-moi » : feuille qui monte du bas de l'écran avec des fins de ligne et des suites
 * proposées par l'IA. Chaque proposition est vérifiée par le moteur local (syllabes, rime).
 */
import { escapeHTML } from '../utils/dom.js';

export function createSuggestSheet({ sheet, backdrop, body, closeBtn }, { onRequest, onCancel, onUseEnding, onUseLine, onOpenSettings }) {
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };

  function open() { sheet.hidden = false; backdrop.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); }
  function close() {
    stop();
    onCancel();
    sheet.classList.remove('open');
    backdrop.hidden = true;
    sheet.hidden = true;
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-end], [data-line], [data-act]');
    if (!b) return;
    if (b.dataset.end !== undefined) { onUseEnding(b.dataset.end); close(); }
    else if (b.dataset.line !== undefined) { onUseLine(b.dataset.line); close(); }
    else if (b.dataset.act === 'again') onRequest();
    else if (b.dataset.act === 'settings') { close(); onOpenSettings(); }
  });

  /**
   * @param {object} p
   * @param {'nokey'|'loading'|'error'|'ready'} p.state
   * @param {string} [p.context]  rappel de la ligne en cours
   * @param {{fins:object[], suites:object[]}} [p.result]  propositions annotées ({ texte, syllables, fit, rhymes, fromIdea })
   */
  function render({ state, context = '', result, error }) {
    stop();
    const head = context ? `<p class="sheet-context">${escapeHTML(context)}</p>` : '';
    if (state === 'nokey') {
      body.innerHTML = `<div class="hero"><p>Pour te proposer des suites qui collent à ton texte et à ta façon d'écrire, active l'IA.</p>
        <button class="btn btn-accent btn-lg" data-act="settings" type="button">Ajouter ma clé API</button></div>`;
      return;
    }
    if (state === 'loading') {
      const start = Date.now();
      body.innerHTML = `${head}<div class="hero loading"><div class="spinner" aria-hidden="true"></div><p class="muted">Je cherche… <span id="sgElapsed">0</span> s</p></div>`;
      const el = body.querySelector('#sgElapsed');
      timer = setInterval(() => { el.textContent = String(Math.round((Date.now() - start) / 1000)); }, 1000);
      return;
    }
    if (state === 'error') {
      body.innerHTML = `${head}<div class="hero error"><p>${escapeHTML(error ?? '')}</p><button class="btn btn-accent" data-act="again" type="button">Réessayer</button></div>`;
      return;
    }
    const badge = (s) => `<span class="sg-meta">
        <span class="sg-syl${s.fit ? ' fit' : ''}" title="${s.fit ? 'Dans le rythme des lignes voisines' : 'Longueur différente des lignes voisines'}">${s.syllables} syl.</span>
        ${s.rhymes ? '<span class="sg-rime" title="Rime avec la ligne précédente">rime ✓</span>' : ''}
        ${s.fromIdea ? '<span class="sg-idea" title="Inspirée de ta banque d\'idées">✦ ton idée</span>' : ''}
        ${s.refName ? `<span class="sg-ref" title="Inspirée d'une de tes références">↗ ${escapeHTML(s.refName)}</span>` : ''}
      </span>`;
    body.innerHTML = `${head}
      ${result.fins.length ? `<h3>Finir la ligne</h3><div class="sg-list">${result.fins.map((f) => `<button class="sg-item" data-end="${escapeHTML(f.texte)}" type="button"><span class="sg-text">… ${escapeHTML(f.texte)}</span>${badge(f)}</button>`).join('')}</div>` : ''}
      ${result.suites.length ? `<h3>Pour la suite</h3><div class="sg-list">${result.suites.map((s) => `<button class="sg-item" data-line="${escapeHTML(s.texte)}" type="button"><span class="sg-text">${escapeHTML(s.texte)}</span>${badge(s)}</button>`).join('')}</div>` : ''}
      ${!result.fins.length && !result.suites.length ? '<p class="empty">Aucune proposition cette fois.</p>' : ''}
      <div class="sheet-foot"><button class="btn" data-act="again" type="button">D'autres propositions</button>
        <span class="muted small">Touche une proposition pour l'ajouter. Les syllabes et la rime sont vérifiées par l'app.</span></div>`;
  }

  return { open, close, render, isOpen: () => !sheet.hidden };
}
