/** Réglages de l'IA : clé API (gardée sur l'appareil), modèle, analyse automatique, dépense estimée. */
import { escapeHTML } from '../utils/dom.js';
import { MODELS, loadAIConfig, saveAIConfig, hasKey, testKey } from '../ai/client.js';

export function createAISettings(root, { onChange }) {
  function render(message = '') {
    const cfg = loadAIConfig();
    const active = hasKey(cfg);
    root.innerHTML = `
      <div class="ai-status ${active ? 'on' : ''}">
        <span class="dot"></span>
        <span>${active ? 'IA activée' : 'IA non activée'}</span>
      </div>
      ${active ? '' : `<p class="hint">Pour comprendre tes textes (sens, intention, idées reformulées) et te souffler des suites, l'app utilise Claude avec <b>ta propre clé</b>.
        Crée-la sur <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> (compte séparé de l'app Claude, facturé à l'usage), puis colle-la ici.</p>`}
      <label class="field wide"><span>Clé API Anthropic</span>
        <input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${escapeHTML(cfg.key ?? '')}">
      </label>
      <div class="edit-row">
        <button class="btn btn-accent" data-ai="save" type="button">${active ? 'Mettre à jour' : 'Activer'}</button>
        ${active ? '<button class="btn" data-ai="test" type="button">Tester</button><button class="btn btn-danger" data-ai="forget" type="button">Oublier la clé</button>' : ''}
      </div>
      <p class="ai-msg" id="aiMsg">${escapeHTML(message)}</p>
      <label class="field wide"><span>Modèle</span>
        <select id="aiModel">${MODELS.map((m) => `<option value="${m.id}" ${m.id === cfg.model ? 'selected' : ''}>${m.label} · ${m.hint}</option>`).join('')}</select>
      </label>
      <button class="tgl wide" id="aiAuto" aria-pressed="${cfg.auto}" type="button">Analyser automatiquement quand j'ouvre l'onglet Analyse</button>
      ${active ? `<div class="spend"><b>${(cfg.spent ?? 0).toFixed(2).replace('.', ',')} $</b><span>dépensés (estimation) · ${cfg.calls ?? 0} demande${(cfg.calls ?? 0) > 1 ? 's' : ''}</span></div>` : ''}
      <p class="hint">Ta clé reste sur cet appareil. Ton texte, ta banque d'idées et ton profil ne sont envoyés à Anthropic qu'au moment d'une demande IA.
        D'après leurs conditions pour l'API, ces données ne servent pas à entraîner leurs modèles.</p>`;
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ai], #aiAuto');
    if (!b) return;
    const cfg = loadAIConfig();
    if (b.id === 'aiAuto') { saveAIConfig({ ...cfg, auto: !cfg.auto }); render(); onChange(); return; }
    const act = b.dataset.ai;
    if (act === 'save') {
      const key = root.querySelector('#aiKey').value.trim();
      saveAIConfig({ ...cfg, key });
      render(key ? 'Clé enregistrée sur cet appareil.' : '');
      onChange();
    } else if (act === 'forget') {
      if (!confirm('Oublier la clé API sur cet appareil ?')) return;
      saveAIConfig({ ...cfg, key: '' });
      render('Clé oubliée.');
      onChange();
    } else if (act === 'test') {
      const msg = root.querySelector('#aiMsg');
      msg.textContent = 'Test en cours…';
      try {
        await testKey();
        render('✓ La clé fonctionne.');
      } catch (err) {
        render(`✗ ${err.message}`);
      }
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id !== 'aiModel') return;
    saveAIConfig({ ...loadAIConfig(), model: e.target.value });
    render();
    onChange();
  });

  render();
  return { render };
}
