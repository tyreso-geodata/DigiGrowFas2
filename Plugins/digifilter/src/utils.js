/**
 * ui/utils.js
 * ─────────────────────────────────────────────────────────────────────────
 * Shared helpers used across the ui/* panel modules.
 *
 * Previously these patterns were copy-pasted in featuresPanel, handlingarPanel
 * and filerPanel. Centralising them here means:
 *   - One SVG / one HTML structure for the empty state.
 *   - One dropdown-wiring implementation.
 *   - One debounce utility.
 */

// ─── Empty state ──────────────────────────────────────────────────────────

const EMPTY_STATE_SVG = `
<svg width="32" height="32" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="1.5">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="12" y1="11" x2="12" y2="17"/>
  <line x1="9"  y1="14" x2="15" y2="14"/>
</svg>`.trim();

/**
 * Returns the HTML string for a standardised "no results" empty state.
 * @param {string} text  – Human-readable message, e.g. "Inga handlingar hittades"
 * @returns {string}
 */
export function emptyState(text) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${EMPTY_STATE_SVG}</div>
      <div class="empty-state-text">${text}</div>
    </div>
  `;
}

// ─── Dropdown wiring ──────────────────────────────────────────────────────

/**
 * Wires up a filter dropdown button + its outside-click close handler.
 *
 * Both handlingarPanel and filerPanel previously duplicated this exact
 * pattern (clone-button → replace → add click → remove old doc listener →
 * add new doc listener).
 *
 * @param {HTMLElement}   btnEl       - The toggle button element.
 * @param {HTMLElement}   menuEl      - The dropdown menu element.
 * @param {Function}      onNewBtn    - Called with the replacement button
 *                                      so the caller can update its ref
 *                                      (e.g. elements.filerSkedDropdownBtn = newBtn).
 * @returns {{ cleanup: Function }}   - Call cleanup() to remove the document listener.
 */
export function wireDropdown(btnEl, menuEl, onNewBtn) {
  // Clone to strip any previously attached listeners from the old button.
  const newBtn = btnEl.cloneNode(true);
  btnEl.replaceWith(newBtn);

  newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuEl.classList.toggle('visible');
  });

  if (onNewBtn) onNewBtn(newBtn);

  // Outside-click handler — close the menu when clicking elsewhere.
  const outsideClick = (e) => {
    if (!menuEl.contains(e.target) && !newBtn.contains(e.target)) {
      menuEl.classList.remove('visible');
    }
  };
  document.addEventListener('click', outsideClick);

  return {
    cleanup() {
      document.removeEventListener('click', outsideClick);
    }
  };
}

// ─── Debounce ─────────────────────────────────────────────────────────────

/**
 * Returns a debounced version of `fn` that delays invocation until `waitMs`
 * milliseconds have elapsed since the last call.
 *
 * @param {Function} fn
 * @param {number}   waitMs
 * @returns {Function}
 */
export function debounce(fn, waitMs) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), waitMs);
  };
}