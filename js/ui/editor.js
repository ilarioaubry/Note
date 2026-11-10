/**
 * Éditeur Matrix : textarea transparent superposé à un calque HTML
 * qui dessine les surlignages (assonances, rimes, multis, répétitions, grille).
 *
 * Le texte reste dans le textarea (caret, sélection, undo natifs) ;
 * le calque est une copie « fantôme » à métriques identiques (pas de retour à la ligne).
 */
import { escapeHTML } from '../utils/dom.js';
import { beatMarkers } from '../engine/analyzer.js';

export function createEditor(root, { onInput, onCaret }) {
  const ta = root.querySelector('.ed-input');
  const backdrop = root.querySelector('.ed-backdrop-inner');
  const gutter = root.querySelector('.ed-gutter-inner');
  const badges = root.querySelector('.ed-badges-inner');

  let current = -1;
  let lineEls = [];
  let gutterEls = [];

  const syncScroll = () => {
    backdrop.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
    badges.style.transform = `translateY(${-ta.scrollTop}px)`;
  };

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

  ta.addEventListener('input', () => { onInput?.(ta.value); updateCaret(); });
  ta.addEventListener('scroll', syncScroll, { passive: true });
  for (const ev of ['keyup', 'click', 'focus', 'select']) ta.addEventListener(ev, updateCaret);
  document.addEventListener('selectionchange', () => { if (document.activeElement === ta) updateCaret(); });

  function lineHTML(line, opts) {
    if (line.isMeta) return `<span class="meta-mark">${escapeHTML(line.text)}</span>`;
    if (!line.words.length) return escapeHTML(line.text) || '';
    const beats = opts.grid ? beatMarkers(line) : null;
    let html = '';
    let pos = 0;
    line.words.forEach((w, i) => {
      html += escapeHTML(line.text.slice(pos, w.start));
      if (beats?.has(i)) {
        for (const b of beats.get(i)) html += `<span class="beat${b % 2 === 0 ? ' snare' : ''}" data-b="${b}"></span>`;
      }
      const attrs = [];
      const cls = ['w'];
      if (opts.xray && w.hl) attrs.push(`data-v="${w.hl}"`);
      if (opts.xray && w.multi !== null) attrs.push(`data-m="${w.multi % 6}"`);
      if (w.rich) cls.push('rich');
      if (w.endRhyme) cls.push('end');
      if (w.rep) cls.push('rep');
      html += `<span class="${cls.join(' ')}" ${attrs.join(' ')}>${escapeHTML(w.text)}</span>`;
      pos = w.end;
    });
    html += escapeHTML(line.text.slice(pos));
    return html;
  }

  function render(analysis, opts) {
    const { lines } = analysis;
    backdrop.classList.toggle('xray', !!opts.xray);
    backdrop.classList.toggle('reps-on', !!opts.reps);

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
    syncScroll();
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
    ta.scrollTop = 0;
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
    currentLine: () => (current < 0 ? 0 : current),
    focus: () => ta.focus(),
  };
}
