import CONFIG from '../config';
import { buildCheckboxFilter } from './checkboxFilter';
import { createModal } from './modals';
import { buildWfsUrl } from '../wfsClient';
import { formatDate } from './dateUtils';
import { emptyState, wireDropdown } from '../utils';

// ─── Projektnummer lookup ─────────────────────────────────────────────────

/**
 * Given a projekt_id from the filer layer, fetches the matching row from
 * the "projekt" table and returns its projektnummer attribute.
 *
 * Two filter variants are tried (quoted string, then plain integer) because
 * GeoServer's CQL handling varies by field type. The first variant that
 * returns a valid JSON response with a feature wins; the second is only
 * fetched if the first response is non-JSON (e.g. a WFS exception document).
 * Each is a separate HTTP request — there is no body caching between attempts.
 *
 * Returns null if both lookups fail or the attribute is absent.
 */
async function fetchProjektnummer(projektId) {
  if (!projektId) return null;
  try {
    const filters  = [`id='${projektId}'`, `id=${projektId}`];
    const typeName = `${CONFIG.WFS_WORKSPACE}:projekt`;

    for (const cql of filters) {
      const url      = buildWfsUrl(typeName, cql);
      const response = await fetch(url);
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        const text = await response.text();
        console.warn('fetchProjektnummer: non-JSON response for filter', cql, text.slice(0, 300));
        continue; // consume body; fall through to next filter variant
      }

      const json  = await response.json();
      const value = json.features?.[0]?.properties?.projektnummer ?? null;
      if (value !== null) return String(value);
    }
  } catch (e) {
    console.error('fetchProjektnummer error:', e);
  }
  return null;
}

// Tracks the cleanup function from wireDropdown so we can remove the
// document-level outside-click listener before re-wiring.
let _dropdownCleanup = null;

// ─── Filter button text ───────────────────────────────────────────────────

export function updateFilerSkedFilterButtonText(state, elements) {
  const btnText = elements.filerSkedBtnText;
  const btn     = elements.filerSkedDropdownBtn;
  if (!btnText || !btn) return;

  const count = state.selectedFilerSkeden.size;
  if (count === 0) {
    btnText.textContent = 'Alla skeden';
    btn.classList.remove('active');
  } else {
    btnText.textContent = `${count} skede${count > 1 ? 'n' : ''} valt${count > 1 ? 'a' : ''}`;
    btn.classList.add('active');
  }
}

// ─── Dropdown population ──────────────────────────────────────────────────

export function populateFilerSkedFilter(filerFeatures, state, elements) {
  const filterMenu = elements.filerSkedDropdownMenu;
  if (!filterMenu) return;

  const attrs = CONFIG.FILER_ATTRS;
  const items = [...new Set(
    filerFeatures.map(f => f.properties?.[attrs.skede]).filter(Boolean)
  )].sort();

  buildCheckboxFilter({
    menuEl: filterMenu,
    items,
    cssPrefix: 'filer-sked',
    selectAllId: 'filer-sked-select-all',
    checkboxClass: 'filer-sked-checkbox',
    stateSet: state.selectedFilerSkeden,
    onRender: () => renderFilerList(state, elements),
    updateBtnText: () => updateFilerSkedFilterButtonText(state, elements)
  });

  const filterBtn = elements.filerSkedDropdownBtn;
  if (filterBtn) {
    _dropdownCleanup?.cleanup();
    _dropdownCleanup = wireDropdown(filterBtn, filterMenu, (newBtn) => {
      elements.filerSkedDropdownBtn = newBtn;
    });
  }
}

// ─── Render ───────────────────────────────────────────────────────────────

export function renderFilerList(state, elements) {
  const listContainer = elements.filerList;
  if (!listContainer) return;

  const attrs = CONFIG.FILER_ATTRS;
  let filtered = state.allFilerData;

  if (state.selectedFilerSkeden.size > 0) {
    filtered = filtered.filter(f =>
      state.selectedFilerSkeden.has(f.properties?.[attrs.skede])
    );
  }

  if (state.currentFilerSearchTerm) {
    const term = state.currentFilerSearchTerm;
    filtered = filtered.filter(f => {
      const p = f.properties || {};
      return (
        (p[attrs.filnamn]      || '').toLowerCase().includes(term) ||
        (p[attrs.skede]        || '').toLowerCase().includes(term) ||
        (p[attrs.projektetapp] || '').toLowerCase().includes(term) ||
        (p[attrs.disciplin]    || '').toLowerCase().includes(term)
      );
    });
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = emptyState('Inga filer hittades');
    return;
  }

  listContainer.innerHTML = `
    <div class="feature-section-title" style="margin-bottom: 12px;">
      Filer (${filtered.length})
    </div>
  ` + filtered.map((f, idx) => {
    const p          = f.properties || {};
    const filnamn      = p[attrs.filnamn]      || 'Okänt filnamn';
    const skede        = p[attrs.skede]        || '';
    const projektetapp = p[attrs.projektetapp] || '';
    const skapad       = formatDate(p[attrs.skapad_datum]) || '';

    return `
      <div class="handling-item filer-item" data-filer-idx="${idx}">
        <div class="handling-item-beteckning">${filnamn}</div>
        ${skede        ? `<div class="handling-item-datum">Skede: ${skede}</div>`               : ''}
        ${projektetapp ? `<div class="handling-item-datum">Projektetapp: ${projektetapp}</div>` : ''}
        ${skapad       ? `<div class="handling-item-datum">Skapad: ${skapad}</div>`             : ''}
      </div>
    `;
  }).join('');

  const filteredSnapshot = filtered;
  listContainer.querySelectorAll('.filer-item').forEach(item => {
    item.addEventListener('click', () => {
      const filerFeature = filteredSnapshot[parseInt(item.dataset.filerIdx, 10)];
      if (filerFeature) showFilerDetail(filerFeature.properties || {});
    });
  });
}

// ─── Reset (called by closeFeaturesPanel) ────────────────────────────────

/**
 * Resets state and DOM owned by filerPanel.
 * Exported so closeFeaturesPanel can delegate without reaching into our DOM.
 */
export function resetFilerPanel(state, elements) {
  if (elements.filerSearchInput) {
    elements.filerSearchInput.value = '';
    state.currentFilerSearchTerm    = '';
  }

  state.selectedFilerSkeden.clear();
  state.allFilerData = [];
  updateFilerSkedFilterButtonText(state, elements);

  document.querySelectorAll('.filer-sked-checkbox').forEach(cb => { cb.checked = false; });
  const selectAll = document.getElementById('filer-sked-select-all');
  if (selectAll) selectAll.checked = false;
}

// ─── Detail modal ─────────────────────────────────────────────────────────

export function showFilerDetail(props) {
  const attrs = CONFIG.FILER_ATTRS;
  const title = props[attrs.filnamn] || 'Fil';
  const { body } = createModal(title);

  const labelMap = {
    [attrs.filnamn]:      'Filnamn',
    [attrs.projektetapp]: 'Projektetapp',
    [attrs.skede]:        'Skede',
    [attrs.disciplin]:    'Disciplin',
    [attrs.filtyp]:       'Filtyp',
    [attrs.upprattat_av]: 'Upprättat av',
    [attrs.skapad_datum]: 'Skapad',
    [attrs.andrad_datum]: 'Ändrad',
    [attrs.fil_sokvag]:   'Filsökväg'
  };

  const displayOrder = [
    attrs.filnamn, attrs.projektetapp, attrs.skede, attrs.disciplin,
    attrs.filtyp, attrs.upprattat_av, attrs.skapad_datum, attrs.andrad_datum, attrs.fil_sokvag
  ].filter(Boolean);

  let html = '';
  displayOrder.forEach(key => {
    const value = props[key];
    if (value === null || value === undefined || value === '') return;

    const label = labelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (key === attrs.fil_sokvag) {
      html += `
        <div class="detail-field">
          <div class="detail-field-label">${label}</div>
          <div class="detail-field-value">
            <a href="${value}" target="_blank" rel="noopener noreferrer"
               style="color: var(--color-primary, #2563eb); word-break: break-all;">${value}</a>
          </div>
        </div>
      `;
    } else {
      const displayValue = (key === attrs.skapad_datum || key === attrs.andrad_datum)
        ? formatDate(value)
        : value;
      html += `
        <div class="detail-field">
          <div class="detail-field-label">${label}</div>
          <div class="detail-field-value">${displayValue}</div>
        </div>
      `;
    }
  });

  body.innerHTML = html || '<p style="color:#64748b;">Inga attribut att visa.</p>';

  // ── Viewer plugin buttons ────────────────────────────────────────────────
  if (window.viewerPlugin) {
    const projektId = props[attrs.projektid];
    const fileName  = props[attrs.filnamn];

    if (projektId && fileName) {
      const controls = document.createElement('div');
      controls.id = 'my-viewer-controls';
      controls.style.cssText = 'display:flex; gap:8px; margin-top:16px;';
      controls.innerHTML = `
        <button id="btn-view"     class="my-btn" disabled>Visa 3D</button>
        <button id="btn-newtab"   class="my-btn" disabled>Öppna i ny flik</button>
        <button id="btn-download" class="my-btn" disabled>Ladda ner</button>
      `;
      body.appendChild(controls);

      fetchProjektnummer(projektId).then(projektnummer => {
        if (!projektnummer) {
          console.warn('showFilerDetail: could not resolve projektnummer for projekt_id', projektId);
          controls.remove();
          return;
        }

        controls.querySelectorAll('.my-btn').forEach(btn => btn.disabled = false);

        controls.querySelector('#btn-view').addEventListener('click', () => {
          window.viewerPlugin.open(projektnummer, fileName);
        });
        controls.querySelector('#btn-newtab').addEventListener('click', () => {
          window.viewerPlugin.openInNewTab(projektnummer, fileName);
        });
        controls.querySelector('#btn-download').addEventListener('click', () => {
          window.viewerPlugin.downloadFile(projektnummer, fileName);
        });
      });
    }
  }
}