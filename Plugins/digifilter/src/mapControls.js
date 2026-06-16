import CONFIG from './config';

const BASE_STYLE_KEY = '__baseStyle';

export function makeDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  let dragMaxTop, dragMaxLeft, dragMinLeft;

  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Cache bounds once per drag to avoid reflow on every mousemove
    dragMaxTop  = window.innerHeight - 100;
    dragMinLeft = -element.offsetWidth + 100;
    dragMaxLeft = window.innerWidth - 100;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    const newTop  = Math.max(20,          Math.min(element.offsetTop  - pos2, dragMaxTop));
    const newLeft = Math.max(dragMinLeft, Math.min(element.offsetLeft - pos1, dragMaxLeft));

    element.style.top    = newTop + 'px';
    element.style.left   = newLeft + 'px';
    element.style.bottom = 'auto';
    element.style.right  = 'auto';
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

export function fitToExtent(extent, viewer, isMobile) {
  const view = viewer.getMap().getView();
  const padding = isMobile ? [10, 10, 300, 10] : [120, 440, 120, 120];
  view.fit(extent, { padding, duration: 750, maxZoom: 11 });
}

export function highlightFeatures(features, viewer) {
  if (!features?.length) return;

  const target = features[0];
  const targetId =
    target.id ??
    target.properties?.id ??
    target.properties?.arende_id;

  const layer = viewer.getLayer(CONFIG.ARENDE_LAYER);
  if (!layer || targetId == null) return;

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

export function clearHighlight(viewer) {
  const layer = viewer.getLayer(CONFIG.ARENDE_LAYER);
  if (!layer) return;
  const baseStyle = layer.get(BASE_STYLE_KEY);
  if (baseStyle) layer.setStyle(baseStyle);
  layer.changed();
}

export function toggleKommentarLayer(projektNr, viewer) {
  const layer = viewer.getLayer(CONFIG.KOMMENTAR_LAYER);

  if (!layer) {
    console.warn('Layer not found:', CONFIG.KOMMENTAR_LAYER);
    return;
  }

  const isCurrentlyVisible = layer.getVisible();
  const layerSource = layer.getSource();

  if (isCurrentlyVisible && layer.get('_activeProjectNr') === String(projektNr)) {
    layer.setVisible(false);
    if (layerSource?.setFilter) {
      layerSource.setFilter(null);
      layerSource.refresh();
    }
    layer.set('_activeProjectNr', null);
    return;
  }

  const cqlFilter = `projekt_nr=${projektNr}`;
  if (layerSource?.setFilter) {
    layerSource.setFilter(cqlFilter);
    layerSource.refresh();
  }

  layer.setVisible(true);
  layer.set('_activeProjectNr', String(projektNr));
}

// Polling workaround — feature may exist in WFS but not yet be rendered in the OL source.
export async function waitForFeatureInSource(projektNr, source, timeoutMs = 2500) {
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