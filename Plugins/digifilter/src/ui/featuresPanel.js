import CONFIG from '../config';
import { clearHighlight } from '../mapControls';
import { buildCheckboxFilter } from './checkboxFilter';
import { emptyState } from '../utils';

// ─── Filter button text ───────────────────────────────────────────────────

export function updateFilterButtonText(state, elements) {
  const count = state.selectedArendetyper.size;
  if (count === 0) {
    elements.filterBtnText.textContent = 'Alla ärendetyper';
    elements.filterDropdownBtn.classList.remove('active');
  } else {
    elements.filterBtnText.textContent =
      `${count} ärendetyp${count > 1 ? 'er' : ''} vald${count > 1 ? 'a' : ''}`;
    elements.filterDropdownBtn.classList.add('active');
  }
}

// ─── Dropdown population ──────────────────────────────────────────────────

export function populateFilterDropdown(state, elements) {
  const items = [...new Set(
    state.allFeaturesData
      .map(({ feature }) => feature.properties[CONFIG.ARENDE_ATTRS.type])
      .filter(Boolean)
  )].sort();

  buildCheckboxFilter({
    menuEl: elements.filterDropdownMenu,
    items,
    cssPrefix: 'filter',
    selectAllId: 'filter-select-all',
    checkboxClass: 'filter-checkbox',
    stateSet: state.selectedArendetyper,
    onRender: () => renderFilteredFeatures(state, elements),
    updateBtnText: () => updateFilterButtonText(state, elements)
  });
}

// ─── Render ───────────────────────────────────────────────────────────────

export function renderFilteredFeatures(state, elements) {
  const container = elements.featuresContent;
  container.innerHTML = '';

  let filteredData = state.allFeaturesData;

  if (state.selectedArendetyper.size > 0) {
    filteredData = filteredData.filter(({ feature }) =>
      state.selectedArendetyper.has(feature.properties[CONFIG.ARENDE_ATTRS.type])
    );
  }

  if (state.currentArendenSearchTerm) {
    const search = state.currentArendenSearchTerm;
    filteredData = filteredData.filter(({ feature }) => {
      const rubrik    = (feature.properties[CONFIG.ARENDE_ATTRS.title]        || '').toLowerCase();
      const fastighet = (feature.properties[CONFIG.ARENDE_ATTRS.property]     || '').toLowerCase();
      const diarie    = (feature.properties[CONFIG.ARENDE_ATTRS.diarieNumber] || '').toLowerCase();
      return rubrik.includes(search) || fastighet.includes(search) || diarie.includes(search);
    });
  }

  // ── Sort ──────────────────────────────────────────────────────────────
  const sortVal = state.currentArendenSort || 'default';

  if (sortVal !== 'default') {
    filteredData = [...filteredData]; // avoid mutating the original array
    const { title, diarieNumber: diarie, created } = CONFIG.ARENDE_ATTRS;

    if (sortVal === 'alpha-asc') {
      filteredData.sort((a, b) =>
        (a.feature.properties[title] || '').localeCompare(b.feature.properties[title] || '', 'sv'));
    } else if (sortVal === 'alpha-desc') {
      filteredData.sort((a, b) =>
        (b.feature.properties[title] || '').localeCompare(a.feature.properties[title] || '', 'sv'));
    } else if (sortVal === 'date-desc' || sortVal === 'date-asc') {
      // Schwartzian transform: parse dates once, not inside the comparator (O(n log n) → O(n)).
      const decorated = filteredData.map(item => ({
        item,
        ts: new Date(item.feature.properties[created] || 0).getTime()
      }));
      decorated.sort((a, b) => sortVal === 'date-desc' ? b.ts - a.ts : a.ts - b.ts);
      filteredData = decorated.map(d => d.item);
    } else if (sortVal === 'diarie-asc') {
      filteredData.sort((a, b) =>
        (a.feature.properties[diarie] || '').localeCompare(b.feature.properties[diarie] || '', 'sv'));
    }
  }

  if (filteredData.length === 0) {
    container.innerHTML = emptyState('Inga ärenden matchar filtret');
    return;
  }

  const groupedByLayer = {};
  filteredData.forEach(({ layerName, feature }) => {
    (groupedByLayer[layerName] ??= []).push(feature);
  });

  const fragment = document.createDocumentFragment();

  Object.entries(groupedByLayer).forEach(([layerName, layerFeatures]) => {
    const section = document.createElement('div');
    section.className = 'feature-section';

    const titleEl = document.createElement('div');
    titleEl.className   = 'feature-section-title';
    titleEl.textContent = `Ärenden (${layerFeatures.length})`;

    const list = document.createElement('ul');
    list.className = 'feature-list';

    layerFeatures.forEach(feature => {
      const props = feature.properties;
      const id    = feature.id || props.id || props[CONFIG.ARENDE_ATTRS.id];

      let name     = 'Okänd';
      let type     = '';
      let diarieNr = '';

      if (props[CONFIG.ARENDE_ATTRS.title]) {
        name     = props[CONFIG.ARENDE_ATTRS.title];
        type     = props[CONFIG.ARENDE_ATTRS.type]         || '';
        diarieNr = props[CONFIG.ARENDE_ATTRS.diarieNumber] || '';
      } else if (props.namn || props.name) {
        name = props.namn || props.name;
        type = props.typ  || '';
      }

      const li = document.createElement('li');
      li.className         = 'feature-item';
      li.dataset.featureId = id;
      li.dataset.layer     = layerName;
      li.innerHTML = `
        <div class="feature-item-name">${name}</div>
        <div class="feature-item-type">${type}</div>
        ${diarieNr ? `<div class="feature-item-diarie">${diarieNr}</div>` : ''}
      `;
      list.appendChild(li);
    });

    section.appendChild(titleEl);
    section.appendChild(list);
    fragment.appendChild(section);
  });

  container.appendChild(fragment);
}

// ─── Display / close ──────────────────────────────────────────────────────

export function displayFeaturesPanel(features, state, elements) {
  state.currentIntersectingFeatures = features;
  state.allFeaturesData = [];
  state.featureIndex.clear();
  state.selectedArendetyper.clear();

  elements.featuresContent.innerHTML = '';

  const totalFeatures = Object.values(features).reduce((sum, arr) => sum + arr.length, 0);

  if (totalFeatures === 0) {
    elements.featuresContent.innerHTML = emptyState('Inga träffar i detta projektområde');
    elements.featuresPanel.classList.add('visible');
    elements.featuresFilter.style.display = 'none';
    return;
  }

  Object.entries(features).forEach(([layerName, layerFeatures]) => {
    layerFeatures.forEach(feature => {
      state.allFeaturesData.push({ layerName, feature });

      const id = String(
        feature.id ||
        feature.properties.id ||
        feature.properties[CONFIG.ARENDE_ATTRS.id]
      );
      if (id) state.featureIndex.set(id, { layerName, feature });
    });
  });

  populateFilterDropdown(state, elements);
  renderFilteredFeatures(state, elements);

  elements.featuresPanel.classList.add('visible');
  elements.featuresFilter.style.display = 'block';
}

/**
 * Resets only the state and DOM owned by featuresPanel.
 * Call this from closeFeaturesPanel; don't reach into other panels directly.
 */
export function resetFeaturesPanel(state, elements) {
  if (elements.arendenSearchInput) {
    elements.arendenSearchInput.value  = '';
    state.currentArendenSearchTerm     = '';
  }

  state.selectedArendetyper.clear();
  updateFilterButtonText(state, elements);

  document.querySelectorAll('.filter-checkbox').forEach(cb => { cb.checked = false; });
  const selectAll = document.getElementById('filter-select-all');
  if (selectAll) selectAll.checked = false;
}

export function closeFeaturesPanel(state, elements, viewer, { clearDrawnLayer, resetDrawSearchBtn, resetHandlingarPanel, resetFilerPanel }) {
  elements.featuresPanel.classList.remove('visible');

  clearDrawnLayer();
  resetDrawSearchBtn();
  clearHighlight(viewer);

  const layer = viewer.getLayer(CONFIG.ARENDE_LAYER);
  if (layer) {
    layer.setVisible(false);
    layer.changed();
  }

  // Each panel resets its own state — no cross-panel DOM reaching.
  resetFeaturesPanel(state, elements);
  resetHandlingarPanel(state, elements);
  resetFilerPanel(state, elements);
}