/** Colonne droite : inspecteur de la ligne courante, répétitions locales, boîte à rimes. */
import { escapeHTML, debounce } from '../utils/dom.js';
import { CLASS_LABEL, toIPA } from '../engine/phonetics.js';
import { findRhymes } from '../engine/rhymeDictionary.js';

const vowelChip = (cls) => `<span class="v" style="--vc: var(--v-${cls})">${CLASS_LABEL[cls] ?? cls}</span>`;

export function createInspector(els, { onInsert }) {
  const { line, lineNo, syl, signature, ipa, rhyme, reps, section, rhymeInput, rhymeResults } = els;
  let userTyped = false;
  let strict = false;

  rhymeInput.addEventListener('input', () => { userTyped = rhymeInput.value.trim() !== ''; searchRhymes(); });
  rhymeResults.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-w]');
    if (b) onInsert(b.dataset.w);
  });

  const searchRhymes = debounce(() => {
    const word = rhymeInput.value.trim().split(/\s+/).pop();
    if (!word) { rhymeResults.innerHTML = ''; return; }
    const r = findRhymes(word, { strict });
    const group = (title, words) => words.length
      ? `<div class="rhyme-group"><h3>${title} · ${words.length}</h3><div class="words">${
        words.map((w) => `<button data-w="${escapeHTML(w)}" title="Insérer au curseur">${escapeHTML(w)}</button>`).join('')}</div></div>`
      : '';
    const head = r.target.tonic
      ? `<div class="muted small">/${escapeHTML(r.target.ipa)}/ · tonique ${vowelChip(r.target.tonic)}</div>` : '';
    rhymeResults.innerHTML = head
      + (group('Rimes riches (multi)', r.riches) + group('Rimes', r.rimes) + group('Assonances', r.assonances)
        || '<p class="empty">Aucune rime dans l\'index pour l\'instant.</p>');
  }, 120);

  /**
   * @param {object} p { line, index, repeats: Map, sectionLabel, tics: Set<string>, strict }
   */
  function update({ line: l, index, repeats, sectionLabel, tics, strict: s }) {
    strict = s;
    lineNo.textContent = `L${index + 1}`;
    if (!l || l.isEmpty) {
      line.textContent = '—';
      syl.textContent = '0';
      signature.innerHTML = '<span class="empty">Ligne vide</span>';
      ipa.textContent = '';
      rhyme.textContent = '';
    } else if (l.isMeta) {
      line.textContent = l.text;
      syl.textContent = '—';
      signature.innerHTML = '<span class="empty">Titre de section</span>';
      ipa.textContent = '';
      rhyme.textContent = '';
    } else {
      line.textContent = l.text;
      syl.textContent = l.reference !== null ? `${l.syllables}  (réf. ${l.reference})` : String(l.syllables);
      // Signature : [a - i - an - é], mots séparés par un espace
      signature.innerHTML = '<span class="dash">[</span>' + l.words.filter((w) => w.vowels.length)
        .map((w) => w.vowels.map(vowelChip).join('<span class="dash">-</span>'))
        .join('<span class="wsep"></span>') + '<span class="dash">]</span>';
      ipa.textContent = '/' + l.words.map((w) => toIPA(w.phon)).join(' ') + '/';
      const last = l.words.at(-1);
      rhyme.innerHTML = last?.tonic ? `${vowelChip(last.tonic)} <span class="muted">${escapeHTML(toIPA(last.coda))}</span>` : '';
      if (!userTyped && last) { rhymeInput.value = last.text.split("'").pop(); searchRhymes(); }
    }

    section.textContent = sectionLabel;
    const entries = [...repeats.values()].sort((a, b) => b.count - a.count);
    reps.innerHTML = entries.length
      ? entries.map((e) => `<li><span>${escapeHTML(e.word)} <span class="muted">×${e.count}</span></span>${
        tics.has(e.word) || tics.has(e.lemma) ? '<span class="hot" title="Fait partie de ton Top Tics">TIC</span>' : ''}</li>`).join('')
      : '<li class="empty">Aucun mot plein répété dans cette section.</li>';
  }

  /** Réactive le remplissage automatique de la boîte à rimes. */
  function resetRhymeInput() { userTyped = false; }

  return { update, resetRhymeInput, refreshRhymes: () => searchRhymes() };
}
