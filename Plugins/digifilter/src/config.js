const CONFIG = {
  WFS_BASE: '',
  WFS_SRS: '',
  WFS_TYPENAME: '',
  LAYER_NAME: '',
  WFS_WORKSPACE: '',
  ARENDE_LAYER: '',
  HANDLING_LAYER: '',
  KOMMENTAR_LAYER: '',
  FILER_LAYER: '',
  LEX_HANDLING_BASE: '',
  QUERYABLE_LAYERS: [],
  ARENDE_ATTRS: {},
  HANDLING_ATTRS: {},
  PROJEKT_ATTRS: {},
  FILER_ATTRS: {}
};

export function initConfig(options) {
  CONFIG.WFS_BASE          = options.wfsBase;
  CONFIG.WFS_SRS           = options.wfsSrs;
  CONFIG.WFS_TYPENAME      = options.wfsTypename;
  CONFIG.LAYER_NAME        = options.layerName;
  CONFIG.WFS_WORKSPACE     = options.wfsWorkspace;
  CONFIG.ARENDE_LAYER      = options.arendeLayer;
  CONFIG.HANDLING_LAYER    = options.handlingLayer;
  CONFIG.KOMMENTAR_LAYER   = options.kommentarLayer;
  CONFIG.FILER_LAYER       = options.filerLayer || 'filer';
  CONFIG.LEX_HANDLING_BASE = options.lexHandlingBase;
  CONFIG.QUERYABLE_LAYERS  = options.queryableLayers  || [];
  CONFIG.ARENDE_ATTRS      = options.arendeAttributes  || {};
  CONFIG.HANDLING_ATTRS    = options.handlingAttributes || {};
  CONFIG.PROJEKT_ATTRS     = options.projektAttributes  || {};
  CONFIG.FILER_ATTRS       = options.filerAttributes   || {};
}

export default CONFIG;