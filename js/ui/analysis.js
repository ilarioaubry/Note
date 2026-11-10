/**
 * Onglet Analyse → Texte : lecture du texte par l'IA (résumé, intention, points forts,
 * passages à reprendre, figures, idées) et graphique de rythme (calculé localement).
 */
import { escapeHTML } from '../utils/dom.js';

const timeAgo = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
};
const money = (c) => (c < 0.01 ? '< 0,01 $' : `${c.toFixed(2).replace('.', ',')} $`);
const lineChip = (n) => `<button class="line-chip" data-goto="${n - 1}" type="button">L${n}</button>`;
const firstLine = (text, max = 70) => {
  const l = text.split('\n')[0];
  return l.length > max ? `${l.slice(0, max)}…` : l;
};

export function createAnalysisView({ root, chart, chartNote, badge }, { onAnalyze, onCancel, onGotoLine, onInsertIdea, onOpenSettings }) {
  let timer = null;

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-goto], [data-insert]');
    if (!t) return;
    if (t.dataset.goto !== undefined) onGotoLine(Number(t.dataset.goto));
    else if (t.dataset.insert) onInsertIdea(t.dataset.insert);
    else if (t.dataset.act === 'analyze') onAnalyze();
    else if (t.dataset.act === 'cancel') onCancel();
    else if (t.dataset.act === 'settings') onOpenSettings();
  });
  chart.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) onGotoLine(Number(b.dataset.goto));
  });
  chart.addEventListener('pointerover', (e) => {
    const b = e.target.closest('[data-tip]');
    if (b) chartNote.textContent = b.dataset.tip;
  });

  const stopTimer = () => { clearInterval(timer); timer = null; };

  /**
   * @param {object} p
   * @param {'nokey'|'empty'|'idle'|'loading'|'error'|'ready'} p.state
   * @param {object} [p.result]  analyse stockée ({ at, model, cost, data })
   * @param {boolean} [p.stale]  le texte a changé depuis l'analyse
   * @param {string} [p.error]
   * @param {Map<string,object>} [p.ideasById]
   */
  function render({ state, result, stale, error, ideasById = new Map() }) {
    stopTimer();
    if (state === 'nokey') {
      root.innerHTML = `<div class="card hero">
        <div class="hero-icon">✦</div>
        <h2>Fais lire ton texte à l'IA</h2>
        <p>Elle comprend ce que tu dis vraiment : le sens, l'intention, les images, ce qui marche et ce qui est à reprendre. Elle reconnaît aussi tes idées, même reformulées.</p>
        <button class="btn btn-accent btn-lg" data-act="settings" type="button">Ajouter ma clé API</button>
        <p class="hint">Sans clé, tu gardes le repérage rapide ci-dessous.</p>
      </div>`;
      return;
    }
    if (state === 'empty') {
      root.innerHTML = '<div class="card hero"><div class="hero-icon">✎</div><p>Écris quelques lignes : l\'analyse apparaîtra ici.</p></div>';
      return;
    }
    if (state === 'loading') {
      const start = Date.now();
      root.innerHTML = `<div class="card hero loading">
        <div class="spinner" aria-hidden="true"></div>
        <h2>Lecture de ton texte…</h2>
        <p class="muted"><span id="aiElapsed">0</span> s · en général 10 à 30 secondes</p>
        <button class="btn" data-act="cancel" type="button">Annuler</button>
      </div>`;
      const el = root.querySelector('#aiElapsed');
      timer = setInterval(() => { el.textContent = String(Math.round((Date.now() - start) / 1000)); }, 1000);
      return;
    }
    if (state === 'error') {
      root.innerHTML = `<div class="card hero error">
        <h2>L'analyse n'a pas abouti</h2>
        <p>${escapeHTML(error ?? '')}</p>
        <button class="btn btn-accent" data-act="analyze" type="button">Réessayer</button>
      </div>`;
      return;
    }
    if (state === 'idle' || !result) {
      root.innerHTML = `<div class="card hero">
        <div class="hero-icon">✦</div>
        <h2>Prêt à lire ton texte</h2>
        <button class="btn btn-accent btn-lg" data-act="analyze" type="button">Analyser ce texte</button>
      </div>`;
      return;
    }

    const d = result.data;
    const idea = (id) => ideasById.get(id);
    const section = (title, body, extra = '') => (body ? `<div class="card ${extra}"><div class="card-head"><h3>${title}</h3></div>${body}</div>` : '');

    const strong = d.points_forts.map((x) => `<div class="note good">
        <div class="note-head">${lineChip(x.ligne)}<q>${escapeHTML(x.extrait)}</q></div>
        <p>${escapeHTML(x.pourquoi)}</p></div>`).join('');
    const weak = d.a_retravailler.map((x) => `<div class="note warn">
        <div class="note-head">${lineChip(x.ligne)}<q>${escapeHTML(x.extrait)}</q></div>
        <p>${escapeHTML(x.probleme)}</p>
        <p class="lead"><b>Piste</b> ${escapeHTML(x.piste)}</p></div>`).join('');
    const figs = d.figures.map((f) => `<li>${lineChip(f.ligne)}<div><b>${escapeHTML(f.type)}</b> <q>${escapeHTML(f.extrait)}</q><p>${escapeHTML(f.effet)}</p></div></li>`).join('');
    const used = d.idees_utilisees.filter((x) => idea(x.id)).map((x) => `<li>${lineChip(x.ligne)}<div><span>${escapeHTML(firstLine(idea(x.id).text))}</span><p>${escapeHTML(x.comment)}</p></div></li>`).join('');
    const toPlace = d.idees_a_placer.filter((x) => idea(x.id)).map((x) => `<li><div><span>${escapeHTML(firstLine(idea(x.id).text))}</span><p>${escapeHTML(x.pourquoi)}</p></div>
        <button class="btn btn-sm" data-insert="${x.id}" type="button">Insérer</button></li>`).join('');

    root.innerHTML = `
      ${stale ? `<div class="banner"><span>Le texte a changé depuis cette analyse.</span><button class="btn btn-sm btn-accent" data-act="analyze" type="button">Relancer</button></div>` : ''}
      <div class="card hero-read">
        <div class="pill-row">
          ${d.mood ? `<span class="pill mood">${escapeHTML(d.mood)}</span>` : ''}
          ${d.intention ? `<span class="pill">${escapeHTML(d.intention)}</span>` : ''}
        </div>
        <p class="read">${escapeHTML(d.resume)}</p>
        ${d.fil ? `<p class="fil">${escapeHTML(d.fil)}</p>` : ''}
        <div class="pill-row themes">${d.themes.map((t) => `<button class="pill theme" ${t.lignes.length ? `data-goto="${t.lignes[0] - 1}"` : ''} type="button">${escapeHTML(t.nom)}</button>`).join('')}</div>
      </div>
      ${section('Ce qui marche', strong)}
      ${section('À reprendre', weak)}
      ${section('Figures de style', figs ? `<ul class="rows">${figs}</ul>` : '')}
      ${section('Tes idées dans ce texte', used ? `<ul class="rows">${used}</ul>` : '')}
      ${section('Idées à placer ici', toPlace ? `<ul class="rows actions">${toPlace}</ul>` : '')}
      <div class="ai-foot">
        <span class="muted small">Analysé ${timeAgo(result.at)} · ${money(result.cost ?? 0)}</span>
        <button class="btn btn-sm" data-act="analyze" type="button">Relancer</button>
      </div>`;
  }

  /**
   * Graphique de rythme : une colonne par ligne (hauteur = syllabes), lettre de rime dessous.
   * Les lignes qui s'écartent du rythme du bloc sont mises en avant (couleur d'alerte + légende).
   */
  function renderRhythm(lines) {
    const lyric = lines.filter((l) => !l.isMeta && !l.isEmpty && l.words.length);
    if (lyric.length < 2) { chart.innerHTML = '<span class="empty">Pas encore assez de lignes.</span>'; chartNote.textContent = ''; return; }
    const max = Math.max(...lyric.map((l) => l.syllables), 1);

    // Schéma de rimes par bloc : même fin de ligne → même lettre
    const letters = new Map();
    let keys = [];
    let html = '';
    let inBlock = false;
    for (const l of lines) {
      if (l.isMeta || l.isEmpty || !l.words.length) {
        if (inBlock) { html += '</div>'; inBlock = false; keys = []; }
        continue;
      }
      if (!inBlock) { html += '<div class="rh-block">'; inBlock = true; }
      const k = l.words.at(-1).rhymeKey ?? `_${l.index}`;
      if (!keys.includes(k)) keys.push(k);
      const letter = String.fromCharCode(65 + (keys.indexOf(k) % 26));
      letters.set(l.index, letter);
      const off = l.status === 'warn' || l.status === 'off';
      const tip = `L${l.index + 1} · ${l.syllables} syllabes${off ? ` (les voisines : ${l.reference})` : ''} · rime ${letter}`;
      html += `<button class="rh-col${off ? ' off' : ''}" data-goto="${l.index}" data-tip="${escapeHTML(tip)}" title="${escapeHTML(tip)}" type="button">
        <span class="rh-bar" style="height:${Math.max(8, Math.round((l.syllables / max) * 100))}%"></span>
        <span class="rh-letter">${letter}</span></button>`;
    }
    if (inBlock) html += '</div>';
    const offCount = lyric.filter((l) => l.status === 'warn' || l.status === 'off').length;
    chart.innerHTML = `<div class="rh-plot">${html}</div>
      <div class="rh-legend"><span><i class="sw"></i>dans le rythme</span><span><i class="sw off"></i>ligne plus courte ou plus longue${offCount ? ` (${offCount})` : ''}</span></div>`;
    chartNote.textContent = `${lyric.length} lignes · ${Math.round(lyric.reduce((a, l) => a + l.syllables, 0) / lyric.length)} syllabes en moyenne`;
  }

  function setBadge(text) { badge.textContent = text; }

  return { render, renderRhythm, setBadge };
}
