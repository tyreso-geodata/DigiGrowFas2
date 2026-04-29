const CONFIG = {
  WFS_BASE: "https://kommunkarta.tyreso.se/geoserver/wfs",
  WFS_TYPENAME: "projekt_y",
  WFS_SRS: "EPSG:3011",
  QUERYABLE_LAYERS: ['shn_arende_y'],
  LAYER_NAME: 'projekt_y'
};

const state = {
  activeProjectId: null,
  selectorVisible: false,
  featuresPanelVisible: false,
  isMobile: window.innerWidth <= 768,
  currentIntersectingFeatures: {},
  allFeaturesData: [],
  selectedArendetyper: new Set(),
  allHandlingarData: [],
  currentSearchTerm: '',
  currentBeteckningFilter: 'all',
  selectedBeteckningar: new Set(),
  currentArendenSearchTerm: '',
  handlingarDateFrom: '',
  handlingarDateTo: ''
};

// Store references to document-level event listeners to prevent duplicates
const eventListeners = {
  handlingarFilterDocumentClick: null
};

const elements = {
  projectList: document.getElementById('project-list'),
  projectSelector: document.getElementById('project-selector'),
  headerToggleBtn: document.getElementById('header-toggle-btn'),
  closeBtn: document.getElementById('close-selector'),
  featuresPanel: document.getElementById('features-panel'),
  featuresContent: document.getElementById('features-content'),
  closeFeaturesBtn: document.getElementById('close-features'),
  featuresHeader: document.querySelector('.features-header'),
  featuresFilter: document.getElementById('features-filter'),
  filterDropdownBtn: document.getElementById('filter-dropdown-btn'),
  filterDropdownMenu: document.getElementById('filter-dropdown-menu'),
  filterBtnText: document.getElementById('filter-btn-text'),
  arendenSearchInput: document.getElementById('arenden-search-input'),
  handlingarSearchInput: document.getElementById('handlingar-search-input'),
  handlingarList: document.getElementById('handlingar-list'),
  handlingarDateFrom: document.getElementById('handlingar-date-from'),
  handlingarDateTo: document.getElementById('handlingar-date-to')
};

function initMapLogic(viewerInstance, origo) {
  viewer = viewerInstance;
  origoInstance = origo;
  source = origo.api().getLayer(CONFIG.LAYER_NAME).getSource();
  
  const footer = document.querySelector('.o-footer.relative.flex.row');
  if (footer) {
    footer.remove();
  }

  init();
}

function init() {
  createLoadingOverlay();
  setupEventListeners();
  renderProjects();
  initTabSwitching();
  makeDraggable(elements.featuresPanel, elements.featuresHeader);
  hideSidebar();
}

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

function showLoading() {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add('visible');
  }
}

function hideLoading() {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.remove('visible');
  }
}

function setupEventListeners() {
  elements.headerToggleBtn.addEventListener('click', () => {
    toggleSelector();
    // Stäng och nollställ ärenderutan när projektknappen klickas
    if (state.selectorVisible) {
      closeFeaturesPanel();
    }
  });
  
  elements.closeBtn.addEventListener('click', toggleSelector);
  elements.closeFeaturesBtn.addEventListener('click', closeFeaturesPanel);
  
  elements.filterDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.filterDropdownMenu.classList.toggle('visible');
  });
  
  document.addEventListener('click', (e) => {
    if (!elements.filterDropdownMenu.contains(e.target) && 
        !elements.filterDropdownBtn.contains(e.target)) {
      elements.filterDropdownMenu.classList.remove('visible');
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('lex-trigger-link')) {
      e.preventDefault();
      const projektNr = e.target.dataset.projektnr;
      if (projektNr) {
        zoomToProjektNr(projektNr);
      }
    }
  });
  
  if (elements.arendenSearchInput) {
    elements.arendenSearchInput.addEventListener('input', (e) => {
      state.currentArendenSearchTerm = e.target.value.toLowerCase();
      renderFilteredFeatures();
    });
  }
  
  if (elements.handlingarSearchInput) {
    elements.handlingarSearchInput.addEventListener('input', (e) => {
      state.currentSearchTerm = e.target.value.toLowerCase();
      renderHandlingarList();
    });
  }
  
  if (elements.handlingarDateFrom) {
    elements.handlingarDateFrom.addEventListener('change', (e) => {
      state.handlingarDateFrom = e.target.value;
      renderHandlingarList();
    });
  }
  
  if (elements.handlingarDateTo) {
    elements.handlingarDateTo.addEventListener('change', (e) => {
      state.handlingarDateTo = e.target.value;
      renderHandlingarList();
    });
  }
  
  origoInstance.api().getMap().on("click", function(e) {
    const hitTolerance = 7;
    this.forEachFeatureAtPixel(e.pixel, function(feature, layer) {
      if (layer && layer.get('name') === CONFIG.LAYER_NAME) {
        const projektNr = feature.get('projekt_nr');
        
        if (state.activeProjectId !== projektNr) {
          source.setFilter(null);
          state.activeProjectId = projektNr;
          setActiveProjectUI(projektNr);
         // zoomToFeatureExtent(feature);
          //zoomToProjektNr(projektNr); // 
        }
      }
    }, { hitTolerance });
  });
  
  window.addEventListener('resize', checkScreenSize);
}

// The sidebar element might not exist immediately upon init.
// Polling ensures we catch it once the DOM is fully constructed by Origo.
function waitForSidebar() {
  return new Promise(resolve => {
    const checkSidebar = () => {
      const sidebar = document.getElementById('o-sidebar');
      if (sidebar) {
        return resolve(sidebar);
      }
      setTimeout(checkSidebar, 20);
    };
    checkSidebar();
  });
}

async function hideSidebar() {
  const sidebar = await waitForSidebar();
  if (sidebar) {
    sidebar.classList.remove('o-sidebar-show');
  }
}

async function fetchExtentByProjektNr(projektNr) {
  const cql = `projekt_nr='${projektNr}'`;
  const url = `${CONFIG.WFS_BASE}?service=WFS&version=1.1.0&request=GetFeature` +
    `&typeName=${encodeURIComponent(CONFIG.WFS_TYPENAME)}` +
    `&outputFormat=application/json` +
    `&srsname=${encodeURIComponent(CONFIG.WFS_SRS)}` +
    `&CQL_FILTER=${encodeURIComponent(cql)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error("WFS request failed: " + response.status);
  }
  
  const json = await response.json();
  
  if (!json.features || json.features.length === 0) {
    return null;
  }
  
  return computeGeoJSONExtent(json.features[0].geometry);
}

// Recursively traverses coordinate arrays (Polygon/MultiPolygon)
// to determine the global bounding box [minX, minY, maxX, maxY].
// WFS response doesn't guarantee a top-level bbox property.
function computeGeoJSONExtent(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  function visitCoords(coords) {
    if (typeof coords[0] === 'number') {
      const x = coords[0];
      const y = coords[1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    } else {
      coords.forEach(visitCoords);
    }
  }
  
  visitCoords(geometry.coordinates);
  
  return [minX, minY, maxX, maxY];
}

async function fetchIntersectingFeatures(extent, layerName, projektNr) {
  try {
    const layer = origoInstance.api().getLayer(layerName);
    if (!layer) return [];

    if (layer.get('type') === 'WFS') {
      const projektGeometry = await fetchProjektGeometry(projektNr);
      if (!projektGeometry) return [];

      const wkt = geometryToWKT(projektGeometry);
      // Precision query: only touches the blue shape
      const intersectsFilter = `INTERSECTS(geom, ${wkt})`; 

      const url = `${CONFIG.WFS_BASE}?service=WFS&version=1.1.0&request=GetFeature` +
        `&typeName=${encodeURIComponent(layerName)}` +
        `&outputFormat=application/json` +
        `&srsname=${CONFIG.WFS_SRS}` +
        `&CQL_FILTER=${encodeURIComponent(intersectsFilter)}`;

      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        return json.features || [];
      }
    }
    
    // Fallback for local layers
    return layer.getSource().getFeatures().filter(f => 
      extentsIntersect(extent, f.getGeometry().getExtent())
    );
  } catch (error) {
    return [];
  }
}

async function queryAllLayersInExtent(extent, projektNr) {
  const results = {};
  for (const layerName of CONFIG.QUERYABLE_LAYERS) {
    const features = await fetchIntersectingFeatures(extent, layerName, projektNr);
    if (features.length > 0) {
      results[layerName] = features;
    }
  }
  return results;
}

async function fetchRelatedFeatures(layerName, featureProps) {
  let layerConfig = viewer.getLayer(layerName);
  
  if (!layerConfig) {
    console.warn('Layer not found for:', layerName);
    return [];
  }
  
  const layerValues = layerConfig.get ? 
    layerConfig.getProperties() : 
    layerConfig.values_ || layerConfig;
  
  if (!layerValues.relatedLayers) {
    return [];
  }
  
  const relatedData = [];
  
  for (const relatedConfig of layerValues.relatedLayers) {
    const relatedLayerName = relatedConfig.layerName;
    const fk = relatedConfig.FK;
    const pk = relatedConfig.PK;
    const foreignKeyValue = featureProps[pk];
    
    if (!foreignKeyValue) continue;
    
    try {
      const wfsUrl = 'https://kommunkarta.tyreso.se/geoserver/wfs';
      const typeName = `projektkarta:${relatedLayerName}`;
      const cql = `${fk}='${foreignKeyValue}'`;
      const url = `${wfsUrl}?service=WFS&version=1.1.0&request=GetFeature` +
        `&typeName=${encodeURIComponent(typeName)}` +
        `&outputFormat=application/json` +
        `&srsname=${CONFIG.WFS_SRS}` +
        `&CQL_FILTER=${encodeURIComponent(cql)}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('WFS request failed:', response.status, response.statusText);
        continue;
      }
      
      const json = await response.json();
      
      if (json.features && json.features.length > 0) {
        relatedData.push({
          layerName: relatedLayerName,
          config: relatedConfig,
          features: json.features
        });
      }
    } catch (error) {
      console.error(`Error fetching related features from ${relatedLayerName}:`, error);
    }
  }
  
  return relatedData;
}

async function fetchHandlingarForArenden(arendeFeatures) {
  if (!arendeFeatures.length) return [];
  
  const wfsUrl = 'https://kommunkarta.tyreso.se/geoserver/wfs';
  const typeName = 'projektkarta:shn_handling_y';
  
  // Collect all arende_ids
  const arendeIds = arendeFeatures
    .map(a => a.properties.arende_id)
    .filter(id => id);
  
  if (!arendeIds.length) return [];
  
  // Create a map of arende properties for quick lookup
  const arendeMap = new Map(
    arendeFeatures.map(a => [a.properties.arende_id, a.properties])
  );
  
  // Batch into groups of 20 to avoid URL length limits
  const batchSize = 20;
  const allHandlingar = [];
  
  for (let i = 0; i < arendeIds.length; i += batchSize) {
    const batch = arendeIds.slice(i, i + batchSize);
    const cql = batch.map(id => `arende_id='${id}'`).join(' OR ');
    
    try {
      const url = `${wfsUrl}?service=WFS&version=1.1.0&request=GetFeature` +
        `&typeName=${encodeURIComponent(typeName)}` +
        `&outputFormat=application/json` +
        `&srsname=${CONFIG.WFS_SRS}` +
        `&CQL_FILTER=${encodeURIComponent(cql)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Batch ${i / batchSize + 1} failed with status ${response.status}`);
        continue;
      }
      
      const json = await response.json();
      
      if (json.features?.length) {
        allHandlingar.push(
          ...json.features.map(f => ({
            ...f.properties,
            arendeDiarie: arendeMap.get(f.properties.arende_id)?.diarie_nummer,
            arendeSkapad: arendeMap.get(f.properties.arende_id)?.skapad,
            arendeFastighet: arendeMap.get(f.properties.arende_id)?.fastighet,
            arendeRubrik: arendeMap.get(f.properties.arende_id)?.rubrik,
            _parentProps: arendeMap.get(f.properties.arende_id)
          }))
        );
      }
    } catch (error) {
      console.error(`Error fetching batch ${i / batchSize + 1}:`, error);
    }
  }
  
  console.log(`Fetched ${allHandlingar.length} handlingar in ${Math.ceil(arendeIds.length / batchSize)} batches`);
  return allHandlingar;
}

function renderProjects() {
  // window.PROJECTS_CONFIG must be defined in the parent index.html
  const projects = window.PROJECTS_CONFIG || [];
  
  if (projects.length === 0) {
    console.warn('No projects configured. Please define window.PROJECTS_CONFIG in index.html');
    elements.projectList.innerHTML = '<p style="padding: 20px; text-align: center; color: #64748b;">Inga projekt konfigurerade</p>';
    return;
  }
  
  elements.projectList.innerHTML = projects.map(project => `
    <div class="project-item" data-id="${project.id}">
      <img src="${project.image}" 
           alt="${project.name}" 
           class="project-thumbnail"/>
      <div class="project-info">
        <div class="project-name">${project.name}</div>
        <div class="project-meta">
          <span>
            ${'Projektledare: ' + project.projectmanager}
          </span>
        </div>
      </div>
    </div>
  `).join('');
  
  document.querySelectorAll('.project-item').forEach(item => {
    item.addEventListener('click', async () => {
      const projektNr = parseInt(item.dataset.id);
      setActiveProjectUI(projektNr);
      
      if (state.selectorVisible) {
        toggleSelector();
      }
      
      try {
        await zoomToProjektNr(projektNr);
      } catch (err) {
        console.error(err);
      }
    });
  });
}

function updateProjectCardCounts(projektNr, featureCounts) {
  const projectCard = document.querySelector(`.project-item[data-id="${projektNr}"]`);
  if (!projectCard) return;
  
  const existingCounts = projectCard.querySelector('.feature-counts');
  if (existingCounts) {
    existingCounts.remove();
  }
  
  const total = Object.values(featureCounts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return;
  
  const countsDiv = document.createElement('div');
  countsDiv.className = 'feature-counts';
  countsDiv.innerHTML = `
    <span class="feature-count-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      ${total} Ärenden
    </span>
  `;
  
  const projectInfo = projectCard.querySelector('.project-info');
  projectInfo.appendChild(countsDiv);
}

function setActiveProjectUI(projektNr) {
  document.querySelectorAll('.project-item').forEach(item => {
    item.classList.toggle('active', parseInt(item.dataset.id) === parseInt(projektNr));
  });
}

// Polling workaround. The feature might exist in WFS data,but not yet be fully rendered/instantiated in the OpenLayers source.
// Bails out after timeoutMs to prevent infinite loops.
async function waitForFeatureInSource(projektNr, timeoutMs = 2500) {
  return new Promise(resolve => {
    const start = Date.now();
    const timer = setInterval(() => {
      const feature = source.getFeatures().find(
        ft => String(ft.get('projekt_nr')) === String(projektNr)
      );
      
      if (feature) {
        clearInterval(timer);
        resolve(feature);
        return;
      }
      
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 60);
  });
}

async function zoomToProjektNr(projektNr) {
  showLoading();
  
  try {
    source.setFilter(null);
    state.activeProjectId = projektNr;
    
    const extent = await fetchExtentByProjektNr(projektNr);
    
    if (!extent) {
      console.error("No feature returned for projekt_nr:", projektNr);
      hideLoading();
      return;
    }
    
    fitToExtent(extent);
    
    const intersectingFeatures = await queryAllLayersInExtent(extent, projektNr);
    const featureCounts = {};
    
    Object.entries(intersectingFeatures).forEach(([layerName, features]) => {
      featureCounts[layerName] = features.length;
    });
    
    updateProjectCardCounts(projektNr, featureCounts);
    displayFeaturesPanel(intersectingFeatures);
    
    const arendeFeatures = intersectingFeatures['shn_arende_y'] || [];
    if (arendeFeatures.length > 0) {
      state.allHandlingarData = await fetchHandlingarForArenden(arendeFeatures);
      populateBeteckningFilter(state.allHandlingarData);
      renderHandlingarList();
    }
    
    const realFeature = await waitForFeatureInSource(projektNr);
    
    if (realFeature) {
      origoInstance.api().getFeatureinfo().showInfo({
        [CONFIG.LAYER_NAME]: [realFeature.getId()]
      });
      
      if (state.isMobile) {
        const sidebar = await waitForSidebar();
        if (sidebar) {
          sidebar.style.transform = 'translate(-50%, 0)';
          setTimeout(() => {
            sidebar.classList.add('o-sidebar-show');
          }, 150);
        }
      }
    }
  } catch (error) {
    console.error("Error in zoomToProjektNr:", error);
  } finally {
    hideLoading();
  }
}

function fitToExtent(extent) {
  const view = origoInstance.api().getMap().getView();
  const padding = state.isMobile ? 
    [10, 10, 300, 10] : 
    [80, 380, 80, 80];
  
  view.fit(extent, {
    padding,
    duration: 750
  });
}

function zoomToFeatureExtent(feature) {
  const extent = feature.getGeometry().getExtent();
  const duration = 750;
  const view = origoInstance.api().getMap().getView();
  
  if (extent && extent[0] !== Infinity) {
    const padding = state.isMobile ? 
      [10, 10, 300, 10] : 
      [80, 380, 80, 80];
    
    view.fit(extent, { padding, duration });
  } else {
    console.error("Extent is empty or invalid.");
  }
}

function displayFeaturesPanel(features) {
  state.currentIntersectingFeatures = features;
  state.allFeaturesData = [];
  state.selectedArendetyper.clear();
  elements.featuresContent.innerHTML = '';
  
  const totalFeatures = Object.values(features).reduce(
    (sum, arr) => sum + arr.length, 
    0
  );
  
  if (totalFeatures === 0) {
    elements.featuresContent.innerHTML = 
      '<p class="no-features">Inga intressepunkter hittades i detta område.</p>';
    elements.featuresPanel.classList.add('visible');
    elements.featuresFilter.style.display = 'none';
    return;
  }
  
  Object.entries(features).forEach(([layerName, layerFeatures]) => {
    layerFeatures.forEach(feature => {
      state.allFeaturesData.push({
        layerName,
        feature
      });
    });
  });
  
  populateFilterDropdown();
  renderFilteredFeatures();
  
  elements.featuresPanel.classList.add('visible');
  elements.featuresFilter.style.display = 'block';
}

function populateFilterDropdown() {
  const arendetyper = new Set();
  
  state.allFeaturesData.forEach(({ feature }) => {
    const arendetyp = feature.properties.arendetyp;
    if (arendetyp) {
      arendetyper.add(arendetyp);
    }
  });
  
  const sortedTypes = Array.from(arendetyper).sort();
  elements.filterDropdownMenu.innerHTML = '';
  
  const selectAllDiv = document.createElement('div');
  selectAllDiv.className = 'filter-option select-all';
  selectAllDiv.innerHTML = `
    <input type="checkbox" id="filter-select-all"/>
    <label for="filter-select-all">Välj alla</label>
  `;
  elements.filterDropdownMenu.appendChild(selectAllDiv);
  
  sortedTypes.forEach(type => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'filter-option';
    const checkboxId = `filter-${type.replace(/\s+/g, '-')}`;
    optionDiv.innerHTML = `
      <input type="checkbox" 
             id="${checkboxId}" 
             value="${type}" 
             class="filter-checkbox"/>
      <label for="${checkboxId}">${type}</label>
    `;
    elements.filterDropdownMenu.appendChild(optionDiv);
  });
  
  addFilterListeners();
}

function addFilterListeners() {
  const selectAllCheckbox = document.getElementById('filter-select-all');
  const filterCheckboxes = document.querySelectorAll('.filter-checkbox');
  
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      
      filterCheckboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        
        if (isChecked) {
          state.selectedArendetyper.add(checkbox.value);
        } else {
          state.selectedArendetyper.delete(checkbox.value);
        }
      });
      
      updateFilterButtonText();
      renderFilteredFeatures();
    });
  }
  
  filterCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.selectedArendetyper.add(e.target.value);
      } else {
        state.selectedArendetyper.delete(e.target.value);
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = false;
        }
      }
      
      updateFilterButtonText();
      renderFilteredFeatures();
    });
  });
}

function updateFilterButtonText() {
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

/*
Filtering logic:
  - Filters by 'arendetyp'
  - Searches in 'rubrik, fastighet, diarie_nummer'
  - Displays 'rubrik', 'arendetyp', 'diarie_nummer'
  
  To customize:
  1. Change feature.properties.arendetyp to your category/type field
  2. Change feature.properties.rubrik to your title/name field
  3. Update the display fields in the feature item template
  4. Change the section title from "Ärenden" to your layer's display name
 */

function renderFilteredFeatures() {
  elements.featuresContent.innerHTML = '';
  let filteredData = state.allFeaturesData;

  if (state.selectedArendetyper.size > 0) {
    filteredData = state.allFeaturesData.filter(({ feature }) =>
      state.selectedArendetyper.has(feature.properties.arendetyp)
    );
  }

  if (state.currentArendenSearchTerm) {
    filteredData = filteredData.filter(({ feature }) => {
      const rubrik = (feature.properties.rubrik || '').toLowerCase();
      const fastighet = (feature.properties.fastighet || '').toLowerCase();
      const diarieNummer = (feature.properties.diarie_nummer || '').toLowerCase();
      return rubrik.includes(state.currentArendenSearchTerm) ||
             fastighet.includes(state.currentArendenSearchTerm) ||
             diarieNummer.includes(state.currentArendenSearchTerm);
    });
  }

  if (filteredData.length === 0) {
    elements.featuresContent.innerHTML =
      '<p class="no-features">Inga ärenden matchar filtret.</p>';
    return;
  }

  const groupedByLayer = {};
  filteredData.forEach(({ layerName, feature }) => {
    if (!groupedByLayer[layerName]) {
      groupedByLayer[layerName] = [];
    }
    groupedByLayer[layerName].push(feature);
  });


  Object.entries(groupedByLayer).forEach(([layerName, layerFeatures]) => {
    if (layerFeatures.length === 0) return;

    const section = document.createElement('div');
    section.className = 'feature-section';

    const layerDisplayName = layerName.includes('shn_arende') ?
      'Ärenden' :
      layerName.replace(/_/g, ' ');

    section.innerHTML = `
      <div class="feature-section-title">Ärenden (${layerFeatures.length})</div>
      <ul class="feature-list">
        ${layerFeatures.map(feature => {
          const props = feature.properties;
          let name = 'Okänd';
          let type = '';
          let diarie = '';

          if (props.rubrik) {
            name = props.rubrik;
            type = props.arendetyp || '';
            diarie = props.diarie_nummer || '';
          } else if (props.namn || props.name) {
            name = props.namn || props.name;
            type = props.typ || '';
          }

          return `
            <li class="feature-item"
                data-layer="${layerName}"
                data-feature='${JSON.stringify(props).replace(/'/g, "&apos;")}'
                data-full-feature='${JSON.stringify(feature).replace(/'/g, "&apos;")}'
                data-feature-id="${props.id || feature.id}">
              <div class="feature-item-name">${name}</div>
              <div class="feature-item-type">${type}</div>
              ${diarie ? `<div class="feature-item-diarie">${diarie}</div>` : ''}
            </li>
          `;
        }).join('')}
      </ul>
    `;

    elements.featuresContent.appendChild(section);
  });


  document.querySelectorAll('.feature-item').forEach(item => {
    item.addEventListener('click', () => {
      const layerName = item.dataset.layer;

      const featureProps = JSON.parse(item.dataset.feature); 

      const fullFeature = JSON.parse(item.dataset.fullFeature); 

      showFeatureDetail(layerName, featureProps);
      
      highlightFeatures([fullFeature]);
    });
  });

  const items = document.querySelectorAll('.feature-item');

  items.forEach(item => {
    item.addEventListener('click', () => {
      const fullFeature = JSON.parse(item.dataset.fullFeature);
      highlightFeatures([fullFeature]);
    });
  });
}

function populateBeteckningFilter(handlingar) {
  const beteckningar = new Set();
  handlingar.forEach(h => {
    if (h.beteckning) {
      beteckningar.add(h.beteckning);
    }
  });
  
  const sortedBeteckningar = Array.from(beteckningar).sort();
  const filterMenu = document.getElementById('handlingar-filter-dropdown-menu');
  if (!filterMenu) return;
  
  filterMenu.innerHTML = '';
  
  const selectAllDiv = document.createElement('div');
  selectAllDiv.className = 'handlingar-filter-option select-all';
  selectAllDiv.innerHTML = `
    <input type="checkbox" id="handlingar-filter-select-all"/>
    <label for="handlingar-filter-select-all">Välj alla</label>
  `;
  filterMenu.appendChild(selectAllDiv);
  
  sortedBeteckningar.forEach(bet => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'handlingar-filter-option';
    const checkboxId = `handlingar-filter-${bet.replace(/\s+/g, '-')}`;
    optionDiv.innerHTML = `
      <input type="checkbox" 
             id="${checkboxId}" 
             value="${bet}" 
             class="handlingar-filter-checkbox"/>
      <label for="${checkboxId}">${bet}</label>
    `;
    filterMenu.appendChild(optionDiv);
  });
  
  addHandlingarFilterListeners();
}

function addHandlingarFilterListeners() {
  const selectAllCheckbox = document.getElementById('handlingar-filter-select-all');
  const filterCheckboxes = document.querySelectorAll('.handlingar-filter-checkbox');
  const filterBtn = document.getElementById('handlingar-filter-dropdown-btn');
  const filterMenu = document.getElementById('handlingar-filter-dropdown-menu');
  const filterBtnText = document.getElementById('handlingar-filter-btn-text');
  
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      
      filterCheckboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        
        if (isChecked) {
          state.selectedBeteckningar.add(checkbox.value);
        } else {
          state.selectedBeteckningar.delete(checkbox.value);
        }
      });
      
      updateHandlingarFilterButtonText();
      renderHandlingarList();
    });
  }
  
  filterCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.selectedBeteckningar.add(e.target.value);
      } else {
        state.selectedBeteckningar.delete(e.target.value);
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = false;
        }
      }
      
      updateHandlingarFilterButtonText();
      renderHandlingarList();
    });
  });
  
  // FIXED: Remove old button click listener by cloning the button
  if (filterBtn) {
    const newFilterBtn = filterBtn.cloneNode(true);
    filterBtn.parentNode.replaceChild(newFilterBtn, filterBtn);
    
    newFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterMenu.classList.toggle('visible');
    });
  }
  
  // FIXED: Remove old document click listener before adding new one
  if (eventListeners.handlingarFilterDocumentClick) {
    document.removeEventListener('click', eventListeners.handlingarFilterDocumentClick);
  }
  
  // Create and store the new listener function
  eventListeners.handlingarFilterDocumentClick = (e) => {
    const currentFilterBtn = document.getElementById('handlingar-filter-dropdown-btn');
    if (filterMenu && currentFilterBtn && 
        !filterMenu.contains(e.target) && 
        !currentFilterBtn.contains(e.target)) {
      filterMenu.classList.remove('visible');
    }
  };
  
  document.addEventListener('click', eventListeners.handlingarFilterDocumentClick);
}

function updateHandlingarFilterButtonText() {
  const filterBtnText = document.getElementById('handlingar-filter-btn-text');
  const filterBtn = document.getElementById('handlingar-filter-dropdown-btn');
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

function renderHandlingarList() {
  const listContainer = elements.handlingarList;
  if (!listContainer) return;
  
  let filtered = state.allHandlingarData;
  
  if (state.selectedBeteckningar.size > 0) {
    filtered = filtered.filter(h => 
      state.selectedBeteckningar.has(h.beteckning)
    );
  }
  
  if (state.currentSearchTerm) {

      filtered = filtered.filter(h => {
        const beskrivning = (h.beskrivning || '').toLowerCase();
        const fastighet = (h.arendeFastighet || '').toLowerCase();
        
        // Look in both the mapped diarie name and the raw property
        const diarie = (h.arendeDiarie || h.diarie_nummer || '').toLowerCase();
        
        const match = beskrivning.includes(state.currentSearchTerm) || 
                      fastighet.includes(state.currentSearchTerm) ||
                      diarie.includes(state.currentSearchTerm);
                      
        return match;
      });
      
      console.log(`Filtering complete. Items remaining: ${filtered.length}`);
  }
  
  // Date filtering
  if (state.handlingarDateFrom || state.handlingarDateTo) {
    filtered = filtered.filter(h => {
      if (!h.registrerat) return false;
      
      const handlingDate = new Date(h.registrerat);
      
      if (state.handlingarDateFrom) {
        const fromDate = new Date(state.handlingarDateFrom);
        if (handlingDate < fromDate) return false;
      }
      
      if (state.handlingarDateTo) {
        const toDate = new Date(state.handlingarDateTo);
        // Set to end of day for inclusive comparison
        toDate.setHours(23, 59, 59, 999);
        if (handlingDate > toDate) return false;
      }
      
      return true;
    });
  }
  
  const handlingarCountSpan = document.getElementById('handlingar-count');
  if (handlingarCountSpan) {
    handlingarCountSpan.textContent = filtered.length > 0 ? 
      `(${filtered.length})` : 
      '';
  }
  
  if (filtered.length === 0) {
    listContainer.innerHTML = 
      '<div class="no-handlingar">Inga handlingar hittades</div>';
    return;
  }
  
  listContainer.innerHTML = `
    <div class="feature-section-title" style="margin-bottom: 12px;">
      Handlingar (${filtered.length})
    </div>
  ` + filtered.map(handling => `
    <div class="handling-item" data-handling-id="${handling.handling_id}">
      ${handling.beteckning ? 
        `<div class="handling-item-beteckning">${handling.beteckning}</div>` : 
        ''}
      <div class="handling-item-beskrivning">
        ${handling.beskrivning || 'Ingen beskrivning'}
      </div>
      <div class="handling-item-beskrivning">
        Registrerad: ${handling.registrerat || 'Saknar datum'}
      </div>
      ${handling.arendeDiarie ? 
        `<div class="handling-item-datum">Diarie: ${handling.arendeDiarie}</div>` : 
        ''}
      ${handling.arendeRubrik ? 
        `<div class="handling-item-datum">Ärenderubrik: ${handling.arendeRubrik}</div>` : 
        ''}
      ${handling.arendeFastighet ? 
        `<div class="handling-item-datum">Objekt: ${handling.arendeFastighet}</div>` : 
        ''}
      ${handling.arendeSkapad ? 
        `<div class="handling-item-datum">Ärende skapat: ${handling.arendeSkapad}</div>` : 
        ''}
    </div>
  `).join('');
  
  listContainer.querySelectorAll('.handling-item').forEach(item => {
    item.addEventListener('click', () => {
      const handlingId = item.dataset.handlingId;
      const handling = state.allHandlingarData.find(
        h => String(h.handling_id) === String(handlingId)
      );
      
      if (handling) {
        showHandlingInIframe(handling);
      }
    });
  });
}

function renderRelatedFeatureHTML(feature, config) {
  const props = feature.properties;
  
  if (config.promoteAttribs && config.promoteAttribs.length > 0) {
    const promoteConfig = config.promoteAttribs[0];
    
    if (promoteConfig.html) {
      let html = promoteConfig.html;
      
      Object.keys(props).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, props[key] || '');
      });
      
      return html;
    }
  }
  
  const featureTitle = config.featureTitle ? 
    props[config.featureTitle] : 
    '';
  
  return `
    <div style="padding:8px;background:#f5f5f5;border-radius:6px;margin-bottom:8px;">
      <strong>${featureTitle || 'Relaterad post'}</strong><br>
      ${Object.entries(props)
        .filter(([k, v]) => !k.includes('geom') && k !== 'geometry')
        .map(([k, v]) => `<small>${k}: ${v}</small>`)
        .join('<br>')}
    </div>
  `;
}

async function showFeatureDetail(layerName, featureProps) {
  // Stäng alla öppna modaler först
  closeAllModals();
  
  // Skapa en unik ID för denna modal
  const featureId = featureProps.id || featureProps.arende_id || Date.now();
  const modalId = `feature-modal-${featureId}-${Date.now()}`;
  
  const newModal = document.createElement('div');
  newModal.className = 'detail-modal visible';
  newModal.id = modalId;
  newModal.innerHTML = `
    <div class="detail-modal-content">
      <div class="detail-modal-header">
        <h2 class="detail-modal-title">Laddar...</h2>
        <button class="close-btn detail-close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="detail-modal-body">
        <div style="text-align:center;padding:40px;">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(newModal);
  
  const modalTitle = newModal.querySelector('.detail-modal-title');
  const modalBody = newModal.querySelector('.detail-modal-body');
  const closeBtn = newModal.querySelector('.detail-close-btn');
  const modalHeader = newModal.querySelector('.detail-modal-header');
  
  closeBtn.addEventListener('click', () => {
    newModal.remove();
  });
  
  makeDraggable(newModal, modalHeader);
  
  const name = featureProps.rubrik || 
               featureProps.namn || 
               featureProps.name || 
               'Detaljer';
  modalTitle.textContent = name;
  
  let html = '';
  const excludeFields = ['geom', 'geometry', 'the_geom', 'geom_wkt', 'arende_id'];
  
  const labelMap = {
  'arendetyp': 'Ärendetyp',
  'diarie_nummer': 'Diarienummer',
  'rubrik': 'Rubrik',
  'skapad': 'Skapad',
  };

  Object.entries(featureProps)
  .filter(([key]) => !excludeFields.includes(key.toLowerCase()))
  .forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      // Use mapped label if exists, otherwise format the key
      const label = labelMap[key.toLowerCase()] || 
                    key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      html += `
        <div class="detail-field">
          <div class="detail-field-label">${label}</div>
          <div class="detail-field-value">${value}</div>
        </div>
      `;
    }
  });
  
  const relatedFeatures = await fetchRelatedFeatures(layerName, featureProps);
  
  if (relatedFeatures.length > 0) {
    html += `<div class="detail-related-section">`;
    
    relatedFeatures.forEach(({ layerName: relLayerName, config, features }) => {
      const displayName = 'Handlingar';
      html += `
        <div class="detail-related-title">${displayName} (${features.length})</div>
        <div class="detail-related-items">
      `;
      
      features.forEach(feature => {
        html += renderRelatedFeatureHTML(feature, config);
      });
      
      html += `</div>`;
    });
    
    html += `</div>`;
  }
  
  modalBody.innerHTML = html;
}

function showHandlingInIframe(handling) {
  closeAllModals();
  
  const handlingId = handling.handling_id;
  const handlingUrl = `https://kommunkarta.tyreso.se/lex_handling/view/${handlingId}`;
  
  const modalId = `handling-modal-${handlingId}-${Date.now()}`;
  
  const newModal = document.createElement('div');
  newModal.className = 'detail-modal handling-modal visible';
  newModal.id = modalId;
  newModal.innerHTML = `
    <div class="detail-modal-content">
      <div class="detail-modal-header">
        <h2 class="detail-modal-title">${handling.beteckning || 'Handling'}</h2>
        <button class="close-btn detail-close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="detail-modal-body" style="padding: 0; overflow: hidden;">
        <iframe src="${handlingUrl}" class="detail-modal-iframe"></iframe>
      </div>
    </div>
  `;
  
  document.body.appendChild(newModal);
  
  const closeBtn = newModal.querySelector('.detail-close-btn');
  const modalHeader = newModal.querySelector('.detail-modal-header');
  const iframe = newModal.querySelector('.detail-modal-iframe');
  
  closeBtn.addEventListener('click', () => {
    newModal.remove();
  });
  
  makeDraggable(newModal, modalHeader);
  
  // Attempts to inject CSS into the PDF viewer iframe to hide its sidebar.
  iframe.addEventListener('load', () => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      
      const style = iframeDoc.createElement('style');
      style.textContent = `
        #toolbarSidebar,
        #sidebarContainer,
        .pdfViewer-sidebar,
        [class*="sidebar"] {
          display: none !important;
          width: 0 !important;
        }
        #viewerContainer {
          left: 0 !important;
          right: 0 !important;
        }
        #mainContainer {
          left: 0 !important;
        }
      `;
      iframeDoc.head.appendChild(style);
    } catch (e) {
      console.log('Cannot access iframe content (CORS restriction)');
    }
  });
}

function closeFeaturesPanel() {
  elements.featuresPanel.classList.remove('visible');
  
  const layer = viewer.getLayer('shn_arende_y');
  if (layer) {
    const baseStyle = layer.get('__baseStyle');
    layer.setStyle(baseStyle || layer.getStyle());
    layer.setVisible(false);
    layer.changed();        
  }

  // Nollställ sökfält
  if (elements.arendenSearchInput) {
    elements.arendenSearchInput.value = '';
    state.currentArendenSearchTerm = '';
  }
  
  if (elements.handlingarSearchInput) {
    elements.handlingarSearchInput.value = '';
    state.currentSearchTerm = '';
  }
  
  // Nollställ datumfilter
  if (elements.handlingarDateFrom) {
    elements.handlingarDateFrom.value = '';
    state.handlingarDateFrom = '';
  }
  
  if (elements.handlingarDateTo) {
    elements.handlingarDateTo.value = '';
    state.handlingarDateTo = '';
  }
  
  // Nollställ filter
  state.selectedArendetyper.clear();
  state.selectedBeteckningar.clear();
  updateFilterButtonText();
  updateHandlingarFilterButtonText();
  
  // Avmarkera alla checkboxes
  document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
  document.querySelectorAll('.handlingar-filter-checkbox').forEach(cb => cb.checked = false);
  const selectAllArenden = document.getElementById('filter-select-all');
  const selectAllHandlingar = document.getElementById('handlingar-filter-select-all');
  if (selectAllArenden) selectAllArenden.checked = false;
  if (selectAllHandlingar) selectAllHandlingar.checked = false;
}

function closeAllModals() {
  document.querySelectorAll('.detail-modal').forEach(modal => {
    modal.remove();
  });
}

function toggleSelector() {
  state.selectorVisible = !state.selectorVisible;
  elements.projectSelector.classList.toggle('collapsed', !state.selectorVisible);
  elements.headerToggleBtn.classList.toggle('active', state.selectorVisible);
}

function initTabSwitching() {
  const tabs = document.querySelectorAll('.features-tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });
}


const BASE_STYLE_KEY = '__baseStyle';

function highlightFeatures(features) {
  if (!features?.length) return;

  const target = features[0];
  const targetId =
    target.id ??
    target.properties?.id ??
    target.properties?.arende_id;

  const layer = viewer.getLayer('shn_arende_y');
  if (!layer || targetId == null) return;

  // Cache base style ONCE (before we ever override it)
  let baseStyle = layer.get(BASE_STYLE_KEY);
  if (!baseStyle) {
    baseStyle = layer.getStyle();
    layer.set(BASE_STYLE_KEY, baseStyle);
  }

  layer.setVisible(true);

  layer.setStyle((f, resolution) => {
    const fId = f.getId?.() ?? f.get?.('id') ?? f.get?.('arende_id');
    if (String(fId) === String(targetId)) {
      return typeof baseStyle === 'function' ? baseStyle(f, resolution) : baseStyle;
    }
    return null;
  });

  layer.changed();
}

function clearHighlight() {
  const layer = viewer.getLayer('shn_arende_y');
  if (!layer) return;
  const baseStyle = layer.get('__baseStyle');
  if (baseStyle) layer.setStyle(baseStyle);
  layer.changed();
}

function extentsIntersect(a, b) {
  return a[0] <= b[2] && 
         a[2] >= b[0] && 
         a[1] <= b[3] && 
         a[3] >= b[1];
}

function makeDraggable(element, handle) {
  let pos1 = 0;
  let pos2 = 0;
  let pos3 = 0;
  let pos4 = 0;
  
  handle.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    let newTop = element.offsetTop - pos2;
    let newLeft = element.offsetLeft - pos1;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const elementWidth = element.offsetWidth;
    const elementHeight = element.offsetHeight;
    
    const minTop = 20;
    const maxTop = viewportHeight - 100;
    const minLeft = -elementWidth + 100;
    const maxLeft = viewportWidth - 100;
    
    newTop = Math.max(minTop, Math.min(newTop, maxTop));
    newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
    
    element.style.top = newTop + "px";
    element.style.left = newLeft + "px";
    element.style.bottom = "auto";
    element.style.right = "auto";
  }
  
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function geometryToWKT(geometry) {
  if (!geometry) return null;
  // WFS 1.1.0 needs Y (North) then X (East)
  const formatCoord = c => `${c[1]} ${c[0]}`; 

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0].map(formatCoord).join(',');
    return `POLYGON((${coords}))`;
  } else if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates.map(poly => 
      `((${poly[0].map(formatCoord).join(',')}))`
    ).join(',');
    return `MULTIPOLYGON(${polys})`;
  }
  return null;
}

async function fetchProjektGeometry(projektNr) {
  if (!projektNr || projektNr === 'undefined') return null;
  const url = `${CONFIG.WFS_BASE}?service=WFS&version=1.1.0&request=GetFeature` +
    `&typeName=${encodeURIComponent(CONFIG.WFS_TYPENAME)}` +
    `&outputFormat=application/json` +
    `&srsname=${encodeURIComponent(CONFIG.WFS_SRS)}` +
    `&CQL_FILTER=${encodeURIComponent(`projekt_nr=${projektNr}`)}`;
  
  try {
    const response = await fetch(url);
    const json = await response.json();
    return json.features?.[0]?.geometry || null;
  } catch (e) { return null; }
}

function checkScreenSize() {
  state.isMobile = window.innerWidth <= 768;
}