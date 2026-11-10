/** Sous-onglets : dans une vue, un seul panneau visible à la fois. */

/**
 * @param {HTMLElement} view élément qui contient `.subtabs` et les `[data-pane]`
 * @param {(tab:string)=>void} [onChange]
 * @returns {{ show:(tab:string)=>void, current:()=>string }}
 */
export function createSubtabs(view, onChange) {
  const tabs = [...view.querySelectorAll('.subtabs [data-tab]')];
  const panes = [...view.querySelectorAll('[data-pane]')];
  let active = tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.tab ?? tabs[0]?.dataset.tab;

  function show(tab, silent = false) {
    if (!tabs.some((t) => t.dataset.tab === tab)) return;
    active = tab;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    panes.forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    view.scrollTop = 0;
    if (!silent) onChange?.(tab);
  }

  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  show(active, true);
  return { show, current: () => active };
}
