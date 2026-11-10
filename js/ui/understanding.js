/**
 * Onglet Analyse, partie « compréhension » (sans IA) :
 *  - mots de la ligne + correction de prononciation (dictionnaire perso)
 *  - « Ça sonne avec… » : lignes de ta banque d'idées qui riment avec la ligne en cours
 *  - « Ce texte » : en bref, thèmes, humeur, figures de style, idées de la banque présentes
 */
import { escapeHTML } from '../utils/dom.js';
import { toIPA, analyzeWord } from '../engine/phonetics.js';

export function createUnderstanding(els, { onPronounce, onUnpronounce, onUseLine, onGotoLine }) {
  const { words, editor, sounds, summary } = els;
  let editing = null;          // mot en cours de correction
  let userLex = {};

  /* ----- Mots de la ligne & correction de prononciation ----- */
  words.addEventListener('click', (e) => {
    const b = e.target.closest('[data-word]');
    if (b) editWord(b.dataset.word);
  });

  function editWord(word) {
    editing = word.toLowerCase();
    const cur = userLex[editing];
    editor.hidden = false;
    editor.innerHTML = `
      <div class="pron-head">« <b>${escapeHTML(editing)}</b> » se lit actuellement <span class="mono">/${escapeHTML(toIPA(analyzeWord(editing).phon))}/</span></div>
      <label class="field wide"><span>Se prononce comme</span>
        <input id="pronAs" type="text" autocomplete="off" spellcheck="false" placeholder="écris-le comme il se dit : ouèche, wèch…" value="${escapeHTML(cur?.as ?? '')}">
      </label>
      <div class="pron-preview mono" id="pronPreview"></div>
      <div class="edit-row">
        <button class="btn btn-accent" data-pron="save" type="button">Enregistrer</button>
        ${cur ? '<button class="btn" data-pron="remove" type="button">Retirer ma correction</button>' : ''}
        <button class="btn" data-pron="cancel" type="button">Annuler</button>
      </div>`;
    const input = editor.querySelector('#pronAs');
    const prev = editor.querySelector('#pronPreview');
    const show = () => {
      const v = input.value.trim();
      prev.textContent = v ? `→ /${toIPA(analyzeWord(v).phon)}/ · ${analyzeWord(v).syllables} syllabe${analyzeWord(v).syllables > 1 ? 's' : ''}` : '';
    };
    input.addEventListener('input', show);
    show();
    editor.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    input.focus();
  }

  editor.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pron]');
    if (!b || !editing) return;
    const act = b.dataset.pron;
    if (act === 'save') {
      const as = editor.querySelector('#pronAs').value.trim();
      if (as) onPronounce(editing, as);
    } else if (act === 'remove') onUnpronounce(editing);
    editing = null;
    editor.hidden = true;
    editor.innerHTML = '';
  });

  function renderWords(line, lex) {
    userLex = lex;
    if (!line || line.isMeta || !line.words.length) { words.innerHTML = '<span class="empty">—</span>'; return; }
    const seen = new Set();
    words.innerHTML = line.words.filter((w) => !seen.has(w.text.toLowerCase()) && seen.add(w.text.toLowerCase()))
      .map((w) => {
        const fixed = lex[w.text.toLowerCase()] ? ' fixed' : '';
        return `<button class="chip-btn word${fixed}" data-word="${escapeHTML(w.text)}" type="button">${escapeHTML(w.text)} <span class="mono">${w.syllables}</span></button>`;
      }).join('');
  }

  /* ----- Ça sonne avec… ----- */
  sounds.addEventListener('click', (e) => {
    const b = e.target.closest('[data-line]');
    if (b) onUseLine(b.dataset.line);
  });

  function renderSounds(list, hasIdeas) {
    if (!hasIdeas) { sounds.innerHTML = '<li class="empty">Ajoute ta note dans l\'onglet Idées : les vieilles lignes qui riment avec ce que tu écris apparaîtront ici.</li>'; return; }
    sounds.innerHTML = list.length
      ? list.map((s) => `<li><button class="sound" data-line="${escapeHTML(s.text)}" type="button" title="Ajouter sous la ligne en cours">
          <span>${escapeHTML(s.text)}</span><span class="tag">${s.kind}</span></button></li>`).join('')
      : '<li class="empty">Rien dans ta banque ne rime avec cette ligne.</li>';
  }

  /* ----- Ce texte ----- */
  summary.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) onGotoLine(Number(b.dataset.goto));
  });

  /**
   * @param {{themes:object[], mood:object[], keywords:string[], figures:object[], ideas:object[]}} s
   */
  function renderSummary({ themes, mood, keywords, figures, ideas }) {
    const topThemes = themes.slice(0, 3).map((t) => t.label.toLowerCase());
    const topMood = mood.filter((m) => m.share >= 0.25).slice(0, 2).map((m) => m.label);
    const brief = [
      topThemes.length ? `Thèmes dominants : <b>${escapeHTML(topThemes.join(', '))}</b>.` : 'Pas assez de vocabulaire marqué pour dégager un thème.',
      topMood.length ? `Humeur ${escapeHTML(topMood.join(' et '))}.` : '',
    ].filter(Boolean).join(' ');

    // Figures regroupées par type
    const byType = new Map();
    for (const f of figures) {
      if (!byType.has(f.type)) byType.set(f.type, { label: f.label, items: [] });
      byType.get(f.type).items.push(f);
    }
    const figHTML = byType.size
      ? [...byType.values()].map((g) => `<details class="fig"><summary>${escapeHTML(g.label)} <b>×${g.items.length}</b></summary><ul>${
        g.items.map((f) => `<li><button class="fig-line" data-goto="${f.lines[0]}" type="button">L${f.lines.map((i) => i + 1).join('–')}</button> ${escapeHTML(f.detail)}</li>`).join('')
      }</ul></details>`).join('')
      : '<span class="empty">Aucune figure repérée.</span>';

    summary.innerHTML = `<div class="card">
      <div class="card-head"><h3>Repérage rapide</h3><span class="muted small">sans IA</span></div>
      <p class="brief">${brief}</p>
      <h4>Mots forts</h4>
      <div class="pill-row">${keywords.length ? keywords.map((k) => `<span class="pill">${escapeHTML(k)}</span>`).join('') : '<span class="empty">—</span>'}</div>
      <h4>Figures repérées</h4>
      <div class="figs">${figHTML}</div>
      ${ideas.length ? `<h4>Idées de ta banque présentes ici</h4><div class="pill-row">${ideas.map((i) => `<span class="pill ok" title="${escapeHTML(i.text)}">${escapeHTML(i.text.split('\n')[0].slice(0, 40))}${i.text.length > 40 ? '…' : ''}</span>`).join('')}</div>` : ''}
      <p class="hint">Par listes de mots et règles : repère ce qui est dit explicitement, pas le second degré.</p>
    </div>`;
  }

  /** Masque le repérage local quand la lecture par l'IA est affichée. */
  function showSummary(visible) { summary.hidden = !visible; }

  return { renderWords, renderSounds, renderSummary, showSummary, editWord };
}
