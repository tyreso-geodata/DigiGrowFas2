import CONFIG from './config'; // FIX M5: import CONFIG so EDITABLE_LAYERS stays in sync

let _viewer;

const EDIT_TYPES = ['Modify', 'Translate', 'Draw', 'Snap', 'Select', 'Ir', 'Rr', 'Pi', 'Hr'];

/**
 * FIX M5: Previously hardcoded as ['projekt_y', 'shn_arende_y'].
 *
 * We now derive the list from CONFIG so it automatically stays in sync with
 * whatever layer names were passed to initConfig(). The fallback array handles
 * the edge case where initConfig() hasn't been called yet (e.g. if editorFix
 * is initialised very early in the boot sequence).
 *
 * If you need to guard additional layers that are NOT part of the DigiFilter
 * config (e.g. 'shn_arende_y'), add them to the fallback list below or expose
 * an `extraEditableLayers` option in initConfig().
 */
function getEditableLayers() {
  const fromConfig = [
    CONFIG.LAYER_NAME,
    CONFIG.ARENDE_LAYER
  ].filter(Boolean);

  return fromConfig.length > 0 ? fromConfig : ['projekt_y', 'shn_arende_y'];
}

function getEditInteractions() {
  const map = _viewer.getMap();
  if (!map) return [];
  return map.getInteractions().getArray().filter(interaction => {
    const t = interaction.constructor.name;
    return EDIT_TYPES.some(name => t.includes(name) || t === name);
  });
}

export function setEditInteractionsActive(active) {
  getEditInteractions().forEach(interaction => {
    if (interaction.setActive) interaction.setActive(active);
  });
}

export function setupFeatureSelectionGuard() {
  const map = _viewer.getMap();
  if (!map) return;

  map.on('singleclick', function (evt) {
    const editorControl  = _viewer.getControlByName('editor');
    const editorActive   = editorControl?.getActive?.();
    const editorToolbar  = document.getElementById('o-editor-toolbar');
    const toolbarVisible = editorToolbar && !editorToolbar.classList.contains('o-hidden');

    if (!editorActive && !toolbarVisible) {
      const editableLayers = getEditableLayers();
      const blocked = [];

      map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
        if (layer && editableLayers.includes(layer.get('name'))) {
          blocked.push(layer.get('name'));
        }
      });

      if (blocked.length > 0) {
        setEditInteractionsActive(false);
        evt.stopPropagation();
      }
    }
  }, { priority: 1000 });
}

function setupEditorListeners(editorControl) {
  if (editorControl.on) {
    editorControl.on('change:active', (e) => {
      setEditInteractionsActive(e.active);
    });
  }

  if (editorControl.dispatch) {
    const originalDispatch = editorControl.dispatch.bind(editorControl);
    editorControl.dispatch = function (action) {
      const result = originalDispatch(action);
      if (action?.type === 'toggleEdit' || action?.type === 'toggleEditor') {
        setTimeout(() => setEditInteractionsActive(false), 100);
      }
      return result;
    };
  }

  const editorToolbar = document.getElementById('o-editor-toolbar');
  if (editorToolbar) {
    new MutationObserver(() => {
      if (editorToolbar.classList.contains('o-hidden')) {
        setEditInteractionsActive(false);
      }
    }).observe(editorToolbar, { attributes: true, attributeFilter: ['class'] });
  }

  setEditInteractionsActive(false);
}

function fixNestedBodyTags() {
  document.querySelectorAll('body body').forEach(nestedBody => {
    const parent = nestedBody.parentElement;
    if (parent) {
      while (nestedBody.firstChild) parent.insertBefore(nestedBody.firstChild, nestedBody);
      nestedBody.remove();
    }
  });
}

export function initEditorFix(viewer) {
  _viewer = viewer;

  setEditInteractionsActive(false);

  const tryDisable = () => {
    if (_viewer.getMap()) {
      setEditInteractionsActive(false);
      setupFeatureSelectionGuard();
    } else {
      setTimeout(tryDisable, 100);
    }
  };
  tryDisable();

  let attempts = 0;
  const poll = setInterval(() => {
    const editorControl = _viewer.getControlByName('editor');
    if (editorControl || ++attempts >= 20) {
      clearInterval(poll);
      if (editorControl) setupEditorListeners(editorControl);
    }
    setEditInteractionsActive(false);
  }, 100);

  fixNestedBodyTags();
  new MutationObserver(fixNestedBodyTags)
    .observe(document.body, { childList: true, subtree: true });
}