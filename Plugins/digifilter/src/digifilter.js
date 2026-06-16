import Origo from 'Origo';
import { initEditorFix } from './editorFix';
import CONFIG, { initConfig } from './config';
import {
  fetchExtentByProjektNr,
  queryAllLayersInExtent,
  fetchHandlingarForArenden,
  fetchFilerForProjekt
} from './wfsClient';
import {
  makeDraggable,
  fitToExtent,
  highlightFeatures,
  toggleKommentarLayer,
  waitForFeatureInSource
} from './mapControls';
import { renderProjects, setActiveProjectUI, updateProjectCardCounts } from './ui/projectPanel';
import {
  displayFeaturesPanel,
  renderFilteredFeatures,
  closeFeaturesPanel,
  resetFeaturesPanel
} from './ui/featuresPanel';
import { populateBeteckningFilter, renderHandlingarList, resetHandlingarPanel } from './ui/handlingarPanel';
import { populateFilerSkedFilter, renderFilerList, resetFilerPanel } from './ui/filerPanel';
import { showFeatureDetail } from './ui/modals';
import { initDrawLayer, startDrawSearch, cancelDrawSearch, clearDrawnLayer, resetDrawSearchBtn } from './ui/drawSearch';
import { debounce } from './utils';

// ─── Module-level refs ────────────────────────────────────────────────────

let viewer;
let source;
let _loadingInFlight = false;

const state = {
  activeProjectId: null,
  selectorVisible: false,
  isMobile: window.innerWidth <= 768,
  currentIntersectingFeatures: {},
  allFeaturesData: [],
  selectedArendetyper: new Set(),
  currentArendenSort: 'default',
  allHandlingarData: [],
  allFilerData: [],
  currentFilerSearchTerm: '',
  selectedFilerSkeden: new Set(),
  currentSearchTerm: '',
  selectedBeteckningar: new Set(),
  currentArendenSearchTerm: '',
  handlingarDateFrom: '',
  handlingarDateTo: '',
  cachedProjektNr: null,
  cachedProjektWKT: null,
  featureIndex: new Map(),
  drawSearch: {
    isDrawing: false,
    wkt: null,
    vectorLayer: null,
    drawInteraction: null
  }
};

// Populated in init() once the DOM is ready
const elements = {};

// Callbacks passed into child modules that need to trigger loading state
const loadingCallbacks = {
  showLoading: () => elements.loadingOverlay?.classList.add('visible'),
  hideLoading: () => elements.loadingOverlay?.classList.remove('visible')
};

// ─── Init ─────────────────────────────────────────────────────────────────

function init() {
  Object.assign(elements, {
    projectList:           document.getElementById('project-list'),
    projectSelector:       document.getElementById('project-selector'),
    headerToggleBtn:       document.getElementById('header-toggle-btn'),
    closeBtn:              document.getElementById('close-selector'),
    featuresPanel:         document.getElementById('features-panel'),
    featuresContent:       document.getElementById('features-content'),
    closeFeaturesBtn:      document.getElementById('close-features'),
    featuresHeader:        document.querySelector('.features-header'),
    featuresFilter:        document.getElementById('features-filter'),
    filterDropdownBtn:     document.getElementById('filter-dropdown-btn'),
    filterDropdownMenu:    document.getElementById('filter-dropdown-menu'),
    filterBtnText:         document.getElementById('filter-btn-text'),
    arendenSearchInput:    document.getElementById('arenden-search-input'),
    handlingarSearchInput: document.getElementById('handlingar-search-input'),
    handlingarList:        document.getElementById('handlingar-list'),
    handlingarDateFrom:    document.getElementById('handlingar-date-from'),
    handlingarDateTo:      document.getElementById('handlingar-date-to'),
    filerSearchInput:      document.getElementById('filer-search-input'),
    filerList:             document.getElementById('filer-list'),
    filerSkedDropdownBtn:  document.getElementById('filer-sked-dropdown-btn'),
    filerSkedDropdownMenu: document.getElementById('filer-sked-dropdown-menu'),
    filerSkedBtnText:      document.getElementById('filer-sked-btn-text'),
    drawSearchBtn:         document.getElementById('draw-search-btn')
  });

  createLoadingOverlay();
  renderProjects(elements.projectList, async (projektNr) => {
    setActiveProjectUI(projektNr);
    if (state.selectorVisible) toggleSelector();
    try { await zoomToProjektNr(projektNr); } catch (err) { console.error(err); }
  });
  setupEventListeners();
  initTabSwitching();
  makeDraggable(elements.featuresPanel, elements.featuresHeader);
  hideSidebar();
  initDrawLayer(viewer, state);
  initEditorFix(viewer);
}

function initMapLogic(viewerInstance) {
  viewer = viewerInstance;

  const layer = viewer.getLayer(CONFIG.LAYER_NAME);
  if (!layer) {
    console.warn('DigiFilter: layer not ready yet, waiting...', CONFIG.LAYER_NAME);
    viewer.on('layersloaded', () => {
      const retryLayer = viewer.getLayer(CONFIG.LAYER_NAME);
      if (retryLayer) { source = retryLayer.getSource(); init(); }
    });
  } else {
    source = layer.getSource();
    init();
  }

  document.querySelector('.o-footer.relative.flex.row')?.remove();
}

// ─── Loading overlay ──────────────────────────────────────────────────────

function createLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-overlay-content">
      <div class="loading-overlay-spinner"></div>
      <div class="loading-overlay-text">Hämtar ärenden och handlingar...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  elements.loadingOverlay = overlay;
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────

function waitForSidebar(timeoutMs = 5000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const sidebar = document.getElementById('o-sidebar');
      if (sidebar) return resolve(sidebar);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(check, 20);
    };
    check();
  });
}

async function hideSidebar() {
  const sidebar = await waitForSidebar();
  sidebar?.classList.remove('o-sidebar-show');
}

// ─── Zoom + data load ─────────────────────────────────────────────────────

async function zoomToProjektNr(projektNr) {
  if (_loadingInFlight) return;
  _loadingInFlight = true;
  loadingCallbacks.showLoading();

  try {
    source.setFilter(null);
    state.activeProjectId = projektNr;

    const extent = await fetchExtentByProjektNr(projektNr, state);
    if (!extent) {
      console.error('No feature returned for projekt_nr:', projektNr);
      return;
    }

    fitToExtent(extent, viewer, state.isMobile);

    const intersectingFeatures = await queryAllLayersInExtent(extent, projektNr, viewer, state);
    const featureCounts = Object.fromEntries(
      Object.entries(intersectingFeatures).map(([k, v]) => [k, v.length])
    );

    updateProjectCardCounts(projektNr, featureCounts);
    displayFeaturesPanel(intersectingFeatures, state, elements);

    const arendeFeatures = intersectingFeatures[CONFIG.ARENDE_LAYER] || [];
    state.allHandlingarData = [];
    state.selectedBeteckningar.clear();
    if (arendeFeatures.length > 0) {
      state.allHandlingarData = await fetchHandlingarForArenden(arendeFeatures);
    }
    populateBeteckningFilter(state.allHandlingarData, state, elements);
    renderHandlingarList(state, elements);

    state.allFilerData = await fetchFilerForProjekt(projektNr, state);
    populateFilerSkedFilter(state.allFilerData, state, elements);
    renderFilerList(state, elements);

    const realFeature = await waitForFeatureInSource(projektNr, source);
    if (realFeature) {
      viewer.getFeatureinfo().showInfo({ [CONFIG.LAYER_NAME]: [realFeature.getId()] });

      if (state.isMobile) {
        const sidebar = await waitForSidebar();
        if (sidebar) {
          sidebar.style.transform = 'translate(-50%, 0)';
          setTimeout(() => sidebar.classList.add('o-sidebar-show'), 150);
        }
      }
    }
  } catch (error) {
    console.error('Error in zoomToProjektNr:', error);
  } finally {
    _loadingInFlight = false;
    loadingCallbacks.hideLoading();
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────

function toggleSelector() {
  state.selectorVisible = !state.selectorVisible;
  elements.projectSelector.classList.toggle('collapsed', !state.selectorVisible);
  elements.headerToggleBtn.classList.toggle('active', state.selectorVisible);
}

function initTabSwitching() {
  const tabs        = document.querySelectorAll('.features-tab');
  const tabContents = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });
}

// ─── Event listeners ──────────────────────────────────────────────────────

function setupEventListeners() {
  const _closeFeaturesPanel = () =>
    closeFeaturesPanel(state, elements, viewer, {
      clearDrawnLayer:     () => clearDrawnLayer(state),
      resetDrawSearchBtn:  () => resetDrawSearchBtn(elements),
      resetFeaturesPanel:  () => resetFeaturesPanel(state, elements),
      resetHandlingarPanel: () => resetHandlingarPanel(state, elements),
      resetFilerPanel:     () => resetFilerPanel(state, elements)
    });

  elements.headerToggleBtn.addEventListener('click', () => {
    toggleSelector();
    if (state.selectorVisible) _closeFeaturesPanel();
  });

  elements.closeBtn.addEventListener('click', toggleSelector);
  elements.closeFeaturesBtn.addEventListener('click', _closeFeaturesPanel);

  elements.filterDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.filterDropdownMenu.classList.toggle('visible');
  });

  document.addEventListener('click', (e) => {
    if (!elements.filterDropdownMenu.contains(e.target) &&
        !elements.filterDropdownBtn.contains(e.target)) {
      elements.filterDropdownMenu.classList.remove('visible');
    }

    if (e.target.classList.contains('lex-trigger-link')) {
      e.preventDefault();
      const projektNr = e.target.dataset.projektnr;
      if (projektNr) zoomToProjektNr(projektNr);
    }

    if (e.target.classList.contains('comments-trigger-link')) {
      e.preventDefault();
      const projektNr = e.target.dataset.projektnr;
      if (projektNr) toggleKommentarLayer(projektNr, viewer);
    }
  });

  document.getElementById('arenden-sort-select')?.addEventListener('change', (e) => {
    state.currentArendenSort = e.target.value;
    renderFilteredFeatures(state, elements);
  });

  elements.featuresContent.addEventListener('click', (e) => {
    const item = e.target.closest('.feature-item');
    if (!item) return;
    const data = state.featureIndex.get(item.dataset.featureId);
    if (!data) return;
    showFeatureDetail(data.layerName, data.feature.properties, viewer);
    highlightFeatures([data.feature], viewer);
  });

  elements.arendenSearchInput?.addEventListener('input', debounce((e) => {
    state.currentArendenSearchTerm = e.target.value.toLowerCase();
    renderFilteredFeatures(state, elements);
  }, 150));

  elements.handlingarSearchInput?.addEventListener('input', debounce((e) => {
    state.currentSearchTerm = e.target.value.toLowerCase();
    renderHandlingarList(state, elements);
  }, 150));

  elements.handlingarDateFrom?.addEventListener('change', (e) => {
    state.handlingarDateFrom = e.target.value;
    renderHandlingarList(state, elements);
  });

  elements.handlingarDateTo?.addEventListener('change', (e) => {
    state.handlingarDateTo = e.target.value;
    renderHandlingarList(state, elements);
  });

  elements.filerSearchInput?.addEventListener('input', debounce((e) => {
    state.currentFilerSearchTerm = e.target.value.toLowerCase();
    renderFilerList(state, elements);
  }, 150));

  elements.drawSearchBtn?.addEventListener('click', () => {
    if (state.drawSearch.isDrawing) {
      cancelDrawSearch(viewer, state, elements);
    } else {
      startDrawSearch(viewer, state, elements, loadingCallbacks);
    }
  });

  viewer.getMap().on('click', function (e) {
    this.forEachFeatureAtPixel(
      e.pixel,
      (feature, layer) => {
        if (layer?.get('name') === CONFIG.LAYER_NAME) {
          const projektNr = feature.get(CONFIG.PROJEKT_ATTRS.projektNr);
          if (state.activeProjectId !== projektNr) {
            source.setFilter(null);
            setActiveProjectUI(projektNr);
            zoomToProjektNr(projektNr);
          }
        }
      },
      { hitTolerance: 7 }
    );
  });

  window.addEventListener('resize', () => { state.isMobile = window.innerWidth <= 768; });
}

// ─── Origo component ──────────────────────────────────────────────────────

export default function DigiFilter(options = {}) {
  return Origo.ui.Component({
    name: 'digifilter',

    onAdd(evt) {
      viewer = evt.viewer || evt.target || this.viewer || this;

      if (!viewer) {
        console.error('DigiFilter: could not resolve viewer instance', evt);
        return;
      }

      initConfig(options);
      initMapLogic(viewer);
    }
  });
}