import CONFIG from '../config';
import { buildCheckboxFilter } from './checkboxFilter';
import { createModal } from './modals';
import { formatDate } from './dateUtils';
import { emptyState, wireDropdown } from '../utils';

// Tracks the cleanup function returned by wireDropdown so we can tear down
// the document-level outside-click listener before re-wiring.
let _dropdownCleanup = null;

// ─── Filter button text ───────────────────────────────────────────────────

export function updateHandlingarFilterButtonText(state, elements) {
  const filterBtnText = elements.handlingarFilterBtnText
    ?? document.getElementById('handlingar-filter-btn-text');
  const filterBtn = elements.handlingarFilterDropdownBtn
    ?? document.getElementById('handlingar-filter-dropdown-btn');

  if (!filterBtnText || !filterBtn) return;

  const count = state.selectedBeteckningar.size;
  if (count === 0) {
    filterBtnText.textContent = 'Alla beteckningar';
    filterBtn.classList.remove('active');
  } else {
    filterBtnText.textContent =
      `${count} beteckning${count > 1 ? 'ar' : ''} vald${count > 1 ? 'a' : ''}`;
    filterBtn.classList.add('active');
  }
}

// ─── Dropdown population ──────────────────────────────────────────────────

export function populateBeteckningFilter(handlingar, state, elements = {}) {
  const filterMenu = elements.handlingarFilterDropdownMenu
    ?? document.getElementById('handlingar-filter-dropdown-menu');
  if (!filterMenu) return;

  const items = [...new Set(
    handlingar.map(h => h[CONFIG.HANDLING_ATTRS.label]).filter(Boolean)
  )].sort();

  buildCheckboxFilter({
    menuEl: filterMenu,
    items,
    cssPrefix: 'handlingar-filter',
    selectAllId: 'handlingar-filter-select-all',
    checkboxClass: 'handlingar-filter-checkbox',
    stateSet: state.selectedBeteckningar,
    onRender: () => renderHandlingarList(state, elements),
    updateBtnText: () => updateHandlingarFilterButtonText(state, elements)
  });

  const filterBtn = elements.handlingarFilterDropdownBtn
    ?? document.getElementById('handlingar-filter-dropdown-btn');

  if (filterBtn) {
    _dropdownCleanup?.cleanup();
    _dropdownCleanup = wireDropdown(filterBtn, filterMenu, (newBtn) => {
      if ('handlingarFilterDropdownBtn' in elements) {
        elements.handlingarFilterDropdownBtn = newBtn;
      }
    });
  }
}

// ─── Render ───────────────────────────────────────────────────────────────

export function renderHandlingarList(state, elements = {}) {
  const listContainer = elements.handlingarList
    ?? document.getElementById('handlingar-list');
  if (!listContainer) return;

  let filtered = state.allHandlingarData;

  if (state.selectedBeteckningar.size > 0) {
    filtered = filtered.filter(h =>
      state.selectedBeteckningar.has(h[CONFIG.HANDLING_ATTRS.label])
    );
  }

  if (state.currentSearchTerm) {
    filtered = filtered.filter(h => {
      const beskrivning = (h[CONFIG.HANDLING_ATTRS.description] || '').toLowerCase();
      const fastighet   = (h.arendeFastighet || '').toLowerCase();
      const diarie      = (h.arendeDiarie    || '').toLowerCase();
      return (
        beskrivning.includes(state.currentSearchTerm) ||
        fastighet.includes(state.currentSearchTerm)   ||
        diarie.includes(state.currentSearchTerm)
      );
    });
  }

  if (state.handlingarDateFrom || state.handlingarDateTo) {
    filtered = filtered.filter(h => {
      if (!h[CONFIG.HANDLING_ATTRS.registered]) return false;
      const handlingDate = new Date(h[CONFIG.HANDLING_ATTRS.registered]);
      if (state.handlingarDateFrom && handlingDate < new Date(state.handlingarDateFrom)) return false;
      if (state.handlingarDateTo) {
        const toDate = new Date(state.handlingarDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (handlingDate > toDate) return false;
      }
      return true;
    });
  }

  const handlingarCountSpan = elements.handlingarCount
    ?? document.getElementById('handlingar-count');
  if (handlingarCountSpan) {
    handlingarCountSpan.textContent = filtered.length > 0 ? `(${filtered.length})` : '';
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = emptyState('Inga handlingar hittades');
    return;
  }

  listContainer.innerHTML = `
    <div class="feature-section-title" style="margin-bottom: 12px;">
      Handlingar (${filtered.length})
    </div>
  ` + filtered.map(handling => `
    <div class="handling-item" data-handling-id="${handling[CONFIG.HANDLING_ATTRS.id]}">
      ${handling[CONFIG.HANDLING_ATTRS.label]
        ? `<div class="handling-item-beteckning">${handling[CONFIG.HANDLING_ATTRS.label]}</div>`
        : ''}
      <div class="handling-item-beskrivning">
        ${handling[CONFIG.HANDLING_ATTRS.description] || 'Ingen beskrivning'}
      </div>
      <div class="handling-item-beskrivning">
        Registrerad: ${formatDate(handling[CONFIG.HANDLING_ATTRS.registered]) || 'Saknar datum'}
      </div>
      ${handling.arendeDiarie    ? `<div class="handling-item-datum">Diarie: ${handling.arendeDiarie}</div>`                           : ''}
      ${handling.arendeRubrik    ? `<div class="handling-item-datum">Ärenderubrik: ${handling.arendeRubrik}</div>`                     : ''}
      ${handling.arendeFastighet ? `<div class="handling-item-datum">Objekt: ${handling.arendeFastighet}</div>`                        : ''}
      ${handling.arendeSkapad    ? `<div class="handling-item-datum">Ärende skapat: ${formatDate(handling.arendeSkapad)}</div>`        : ''}
    </div>
  `).join('');

  listContainer.querySelectorAll('.handling-item').forEach(item => {
    item.addEventListener('click', () => {
      const handlingId = item.dataset.handlingId;
      const handling = state.allHandlingarData.find(
        h => String(h[CONFIG.HANDLING_ATTRS.id]) === String(handlingId)
      );
      if (handling) showHandlingInIframe(handling);
    });
  });
}

// ─── Reset (called by closeFeaturesPanel) ────────────────────────────────

/**
 * Resets state and DOM owned by handlingarPanel.
 * Exported so closeFeaturesPanel can delegate without reaching into our DOM directly.
 */
export function resetHandlingarPanel(state, elements) {
  if (elements.handlingarSearchInput) {
    elements.handlingarSearchInput.value = '';
    state.currentSearchTerm = '';
  }
  if (elements.handlingarDateFrom) {
    elements.handlingarDateFrom.value = '';
    state.handlingarDateFrom = '';
  }
  if (elements.handlingarDateTo) {
    elements.handlingarDateTo.value = '';
    state.handlingarDateTo = '';
  }

  state.selectedBeteckningar.clear();
  updateHandlingarFilterButtonText(state, elements);

  document.querySelectorAll('.handlingar-filter-checkbox').forEach(cb => { cb.checked = false; });
  const selectAll = document.getElementById('handlingar-filter-select-all');
  if (selectAll) selectAll.checked = false;
}

// ─── Iframe modal ─────────────────────────────────────────────────────────

export function showHandlingInIframe(handling) {
  const title = handling[CONFIG.HANDLING_ATTRS.label] || 'Handling';
  const { body } = createModal(title, {
    extraClass: 'handling-modal',
    bodyStyle: 'padding: 0; overflow: hidden;'
  });

  const iframe = document.createElement('iframe');
  iframe.src       = `${CONFIG.LEX_HANDLING_BASE}${handling[CONFIG.HANDLING_ATTRS.id]}`;
  iframe.className = 'detail-modal-iframe';
  body.appendChild(iframe);

  // Attempt to hide the PDF viewer sidebar (fails silently on CORS).
  iframe.addEventListener('load', () => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const style = iframeDoc.createElement('style');
      style.textContent = `
        #toolbarSidebar, #sidebarContainer, .pdfViewer-sidebar, [class*="sidebar"] {
          display: none !important;
          width: 0 !important;
        }
        #viewerContainer { left: 0 !important; right: 0 !important; }
        #mainContainer   { left: 0 !important; }
      `;
      iframeDoc.head.appendChild(style);
    } catch (e) {
      console.log('Cannot access iframe content (CORS restriction)');
    }
  });
}