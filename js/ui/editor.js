/**
 * Éditeur Matrix : textarea transparent superposé à un calque HTML
 * qui dessine les surlignages (assonances, rimes, multis, répétitions, grille).
 *
 * Le texte reste dans le textarea (caret, sélection, undo natifs) ;
 * le calque est une copie « fantôme » à métriques identiques (pas de retour à la ligne).
 */
import { escapeHTML } from '../utils/dom.js';
import { beatMarkers } from '../engine/analyzer.js';
import { FAMILY } from '../engine/consonance.js';

export function createEditor(root, { onInput, onCaret }) {
  const scroller = root;                       // .editor : SEUL élément qui défile (textarea, calque, gouttière et badges bougent ensemble, sans JS)
  const ta = root.querySelector('.ed-input');
  const backdrop = root.querySelector('.ed-backdrop-inner');
  const gutter = root.querySelector('.ed-gutter-inner');
  const badges = root.querySelector('.ed-badges-inner');

  let current = -1;
  let lineEls = [];
  let gutterEls = [];
  let badgeEls = [];

  const caretLine = () => ta.value.slice(0, ta.selectionStart).split('\n').length - 1;

  const updateCaret = () => {
    const l = caretLine();
    if (l === current) return;
    lineEls[current]?.classList.remove('current');
    gutterEls[current]?.classList.remove('current');
    current = l;
    lineEls[current]?.classList.add('current');
    gutterEls[current]?.classList.add('current');
    onCaret?.(current);
  };

  /**
   * Le textarea ne défile plus (il a la hauteur de tout son contenu) : on garde la ligne du curseur visible
   * en faisant défiler le conteneur, au cas où le navigateur ne le ferait pas lui-même.
   */
  function revealCaret() {
    const el = lineEls[current];
    if (!el) return;
    const margin = 48;
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    const view = scroller.clientHeight;
    if (bottom > scroller.scrollTop + view - margin) scroller.scrollTop = bottom - view + margin;
    else if (top < scroller.scrollTop + margin) scroller.scrollTop = Math.max(0, top - margin);
  }

  ta.addEventListener('input', () => { onInput?.(ta.value); updateCaret(); revealCaret(); });
  for (const ev of ['keyup', 'click', 'focus', 'select']) ta.addEventListener(ev, updateCaret);
  document.addEventListener('selectionchange', () => { if (document.activeElement === ta) updateCaret(); });

  /** Mode « Consonnes » : seules les lettres des sons consonnes retenus sont colorées. */
  function consonantHTML(w) {
    const spans = [];
    for (const c of w.cons) {
      if (!c.hl) continue;
      const last = spans.at(-1);
      if (last && last.s === c.s && last.e === c.e) continue;               // « x » = deux sons sur les mêmes lettres
      spans.push({ s: c.s, e: c.e, ph: c.ph });
    }
    spans.sort((a, b) => a.s - b.s);
    let html = '';
    let pos = 0;
    for (const sp of spans) {
      if (sp.s < pos) continue;
      html += escapeHTML(w.text.slice(pos, sp.s))
        + `<span class="c" data-c="${FAMILY[sp.ph] ?? 'k'}">${escapeHTML(w.text.slice(sp.s, sp.e))}</span>`;
      pos = sp.e;
    }
    return html + escapeHTML(w.text.slice(pos));
  }

  /** Un mot = <span.w> contenant une <span.s> par syllabe (c'est la syllabe qui porte la couleur des voyelles). */
  function wordHTML(w, opts, beats) {
    let html = '';
    // Repères de grille : positionnés en absolu dans le mot, ils ne changent jamais les retours à la ligne
    if (beats) beats.forEach((b, k) => { html += `<i class="beat${b % 2 === 0 ? ' snare' : ''}" data-b="${b}" data-k="${k}"></i>`; });
    if (opts.mode === 'consonnes') return html + (opts.xray ? consonantHTML(w) : escapeHTML(w.text));
    if (!w.syls.length) return html + escapeHTML(w.text);
    for (const sy of w.syls) {
      const attrs = [];
      const cls = ['s'];
      if (opts.xray && sy.hl) attrs.push(`data-v="${sy.hl}"`);
      if (opts.xray && sy.rich) cls.push('rich');
      if (opts.xray && sy.endRhyme) cls.push('end');
      html += `<span class="${cls.join(' ')}" ${attrs.join(' ')}>${escapeHTML(w.text.slice(sy.start, sy.end))}</span>`;
    }
    return html;
  }

  function lineHTML(line, opts) {
    if (line.isMeta) return `<span class="meta-mark">${escapeHTML(line.text)}</span>`;
    if (!line.words.length) return escapeHTML(line.text) || '';
    const beats = opts.grid ? beatMarkers(line) : null;
    let html = '';
    let pos = 0;
    line.words.forEach((w, i) => {
      html += escapeHTML(line.text.slice(pos, w.start));
      html += `<span class="w">${wordHTML(w, opts, beats?.get(i))}</span>`;
      pos = w.end;
    });
    html += escapeHTML(line.text.slice(pos));
    return html;
  }

  /**
   * Avec le retour à la ligne, une ligne de texte occupe plusieurs rangées :
   * on recopie la hauteur réelle de chaque ligne du calque sur la gouttière et les badges.
   */
  function matchHeights() {
    const hs = lineEls.map((el) => el.offsetHeight);          // une seule lecture de layout
    hs.forEach((h, i) => {
      if (gutterEls[i]) gutterEls[i].style.height = `${h}px`;
      if (badgeEls[i]) badgeEls[i].style.height = `${h}px`;
    });
  }
  new ResizeObserver(() => matchHeights()).observe(root.querySelector('.ed-main'));

  function render(analysis, opts) {
    const { lines } = analysis;
    backdrop.classList.toggle('xray', !!opts.xray);

    backdrop.innerHTML = lines.map((l, i) =>
      `<div class="ln${l.isMeta ? ' meta' : ''}${i === current ? ' current' : ''}">${lineHTML(l, opts)}</div>`).join('');
    gutter.innerHTML = lines.map((_, i) => `<div${i === current ? ' class="current"' : ''}>${i + 1}</div>`).join('');
    badges.innerHTML = lines.map((l) => {
      if (l.isMeta || l.isEmpty || !l.words.length) return '<div></div>';
      const tip = l.reference !== null ? `Réf. ${l.reference} syllabes` : 'Première ligne du bloc';
      return `<div><span class="badge ${l.status}" title="${tip}">${l.syllables}</span></div>`;
    }).join('');

    lineEls = [...backdrop.children];
    gutterEls = [...gutter.children];
    badgeEls = [...badges.children];
    matchHeights();
  }

  /** Insère du texte au curseur en conservant l'historique d'annulation si possible. */
  function insertAtCursor(str) {
    ta.focus();
    const ok = document.execCommand?.('insertText', false, str);
    if (!ok) {
      ta.setRangeText(str, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function setText(text) {
    ta.value = text;
    scroller.scrollTop = 0;
    ta.setSelectionRange(0, 0);
    current = -1;
    updateCaret();
  }

  return {
    textarea: ta,
    getText: () => ta.value,
    setText,
    render,
    insertAtCursor,
    scroller,
    currentLine: () => (current < 0 ? 0 : current),
    focus: () => ta.focus(),
  };
}
