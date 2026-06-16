import Origo from 'Origo';
import CONFIG from '../config';
import { geometryToWKT, fetchFeaturesInPolygonWKT, fetchHandlingarForArenden } from '../wfsClient';
import { displayFeaturesPanel } from './featuresPanel';
import { populateBeteckningFilter, renderHandlingarList } from './handlingarPanel';
import { populateFilerSkedFilter, renderFilerList } from './filerPanel';

export function initDrawLayer(viewer, state) {
  const ol  = Origo.ol;
  const map = viewer.getMap();
  if (!map) return;

  const vectorSource = new ol.source.Vector();
  const vectorLayer  = new ol.layer.Vector({
    source: vectorSource,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: '#f59e0b', width: 2.5 }),
      fill:   new ol.style.Fill({ color: 'rgba(245, 158, 11, 0.15)' })
    }),
    zIndex: 500,
    properties: { title: 'Sökyta', group: 'none', queryable: false, visible: true }
  });

  map.addLayer(vectorLayer);
  state.drawSearch.vectorLayer = vectorLayer;
}

export function clearDrawnLayer(state) {
  if (state.drawSearch.vectorLayer) {
    state.drawSearch.vectorLayer.getSource().clear();
  }
  state.drawSearch.wkt = null;
}

export function resetDrawSearchBtn(elements) {
  if (!elements.drawSearchBtn) return;
  elements.drawSearchBtn.classList.remove('drawing', 'active');
  elements.drawSearchBtn.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
      n.textContent = ' Rita sökyta';
    }
  });
}

function showDrawHint(text) {
  let hint = document.getElementById('draw-search-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id        = 'draw-search-hint';
    hint.className = 'draw-search-hint';
    document.body.appendChild(hint);
  }
  hint.textContent   = text;
  hint.style.display = 'block';
}

function hideDrawHint() {
  const hint = document.getElementById('draw-search-hint');
  if (hint) hint.style.display = 'none';
}

export function cancelDrawSearch(viewer, state, elements) {
  const map = viewer.getMap();
  if (!map) return;

  if (state.drawSearch.drawInteraction) {
    map.removeInteraction(state.drawSearch.drawInteraction);
    state.drawSearch.drawInteraction = null;
  }

  state.drawSearch.isDrawing = false;
  resetDrawSearchBtn(elements);
  hideDrawHint();
  clearDrawnLayer(state);
}

export function startDrawSearch(viewer, state, elements, { showLoading, hideLoading }) {
  const map = viewer.getMap();
  if (!map) return;

  clearDrawnLayer(state);

  state.drawSearch.isDrawing = true;
  elements.drawSearchBtn.classList.add('drawing');
  elements.drawSearchBtn.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
      n.textContent = ' Avbryt ritning';
    }
  });

  showDrawHint('Börja klicka i kartan för att rita din polygon. Dubbelklicka för att avsluta din ritning.');

  const ol   = Origo.ol;
  const draw = new ol.interaction.Draw({
    source: state.drawSearch.vectorLayer.getSource(),
    type: 'Polygon',
    freehand: false
  });

  draw.on('drawend', async (evt) => {
    map.removeInteraction(draw);
    state.drawSearch.drawInteraction = null;
    state.drawSearch.isDrawing       = false;
    resetDrawSearchBtn(elements);
    hideDrawHint();

    const geoJsonFormat = new ol.format.GeoJSON();
    const geoJsonGeom   = JSON.parse(geoJsonFormat.writeGeometry(evt.feature.getGeometry()));
    const wkt           = geometryToWKT(geoJsonGeom);
    if (!wkt) return;

    state.drawSearch.wkt = wkt;
    await runDrawSearch(wkt, state, elements, viewer, { showLoading, hideLoading });
  });

  map.addInteraction(draw);
  state.drawSearch.drawInteraction = draw;
}

export async function runDrawSearch(wkt, state, elements, viewer, { showLoading, hideLoading }) {
  showLoading();

  try {
    const arendeTypeName = `${CONFIG.WFS_WORKSPACE}:${CONFIG.ARENDE_LAYER}`;
    const arendeFeatures = await fetchFeaturesInPolygonWKT(wkt, arendeTypeName, 'geom');
    const intersecting   = arendeFeatures.length > 0 ? { [CONFIG.ARENDE_LAYER]: arendeFeatures } : {};

    displayFeaturesPanel(intersecting, state, elements);

    if (arendeFeatures.length > 0) {
      state.allHandlingarData = await fetchHandlingarForArenden(arendeFeatures);
    } else {
      state.allHandlingarData = [];
    }
    // FIX: pass `elements` so both functions use the elements bag rather than
    // falling back to document.getElementById (which was the only codepath
    // remaining that bypassed the elements abstraction).
    populateBeteckningFilter(state.allHandlingarData, state, elements);
    renderHandlingarList(state, elements);

    const filerTypeName = `${CONFIG.WFS_WORKSPACE}:${CONFIG.FILER_LAYER}`;
    state.allFilerData  = await fetchFeaturesInPolygonWKT(wkt, filerTypeName, 'projektomrade');
    populateFilerSkedFilter(state.allFilerData, state, elements);
    renderFilerList(state, elements);

    elements.featuresPanel.classList.add('visible');
    if (elements.drawSearchBtn) elements.drawSearchBtn.classList.add('active');

  } catch (err) {
    console.error('Draw search error:', err);
  } finally {
    hideLoading();
  }
}