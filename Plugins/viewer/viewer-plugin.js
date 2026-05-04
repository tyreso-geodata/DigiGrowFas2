/**
 * ThreeJS Viewer Plugin for Origo
 * Displays 3D models (GLB) and technical drawings (DXF) from a backend API
 */

import Origo from 'Origo';
import './scss/viewer-plugin.scss';

import config, { 
  setApiBaseUrl, 
  getConfig, 
  updateConfig,
  buildViewerUrl,
  buildDownloadUrl 
} from './src/core/config';
import { ThreeViewer } from './src/core/viewer';
import { fetchViewerFile, downloadOriginalFile, FileType } from './src/core/fileLoader';
import { TestUI } from './src/core/testUI';

/**
 * ViewerPlugin - Origo plugin for 3D model viewing
 */
const ViewerPlugin = function ViewerPlugin(options = {}) {
  const {
    // API Configuration (required)
    apiBaseUrl,
    viewerEndpoint = '/api/relationshandling/fetch',
    downloadEndpoint = '/api/relationshandling/fetch',
    
    // UI Options
    buttonText = '3D-visare',
    tooltipText = 'Öppna 3D-visare',
    icon = '#fa-cube',
    
    // Viewer Options
    viewerWidth = '100%',
    viewerHeight = '600px',
    showTestUI = false,
    showButton = true,
    
    // Globe/3D Map Integration
    globeActive = false,
    
    // Initial file (optional)
    projectID = null,
    fileName = null,
    
    // Callbacks
    onViewerReady = null,
    onLoadSuccess = null,
    onLoadError = null,
    onClose = null,

    // Parameter Panel Options
    showParameterPanel = false,
    parameterPanelIcon = '#fa-search',
    parameterPanelTitle = 'Ladda 3D-fil'
  } = options;

  // Validate required API configuration
  if (!apiBaseUrl) {
    console.error('[ViewerPlugin] apiBaseUrl is required');
  }

  // Set API configuration
  updateConfig({
    api: {
      baseUrl: apiBaseUrl || '',
      endpoints: {
        viewer: viewerEndpoint,
        download: downloadEndpoint
      }
    }
  });

  // Plugin state
  let viewer = null;
  let origoViewer = null;
  let modal = null;
  let viewerButton = null;
  let threeViewer = null;
  let testUI = null;
  let viewerContainer = null;
  let isOpen = false;
  let self = null; // reference to the Origo component
  let paramButton = null;
  let paramPanelEl = null;
  let isPanelVisible = false;

  /**
   * Make a DOM element draggable by its header (id="{elm.id}-draggable") or itself
   */
  function makeElementDraggable(elm) {
    const elmnt = elm;
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;
    let pos4 = 0;

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      elmnt.style.top = `${elmnt.offsetTop - pos2}px`;
      elmnt.style.left = `${elmnt.offsetLeft - pos1}px`;
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    const handleEl = document.getElementById(`${elmnt.id}-draggable`);
    if (handleEl) {
      handleEl.onmousedown = dragMouseDown;
    } else {
      elmnt.onmousedown = dragMouseDown;
    }
  }

  /**
   * Show or hide the parameter panel
   */
  function setParamPanelVisible(state) {
    isPanelVisible = state;
    if (paramPanelEl) {
      if (isPanelVisible) {
        paramPanelEl.classList.remove('hidden');
      } else {
        paramPanelEl.classList.add('hidden');
      }
    }
  }

  /**
   * Build and append the parameter panel to the map container
   */
  function createParameterPanel(targetId) {
    paramPanelEl = document.createElement('div');
    paramPanelEl.className = 'viewer-param-panel hidden';
    paramPanelEl.id = 'viewerParamPanel';

    const header = document.createElement('div');
    header.className = 'viewer-param-panel-header';
    header.id = 'viewerParamPanel-draggable';
    header.innerHTML = `<span>${parameterPanelTitle}</span>`;

    const closeBtn = document.createElement('div');
    closeBtn.className = 'viewer-param-panel-close';
    closeBtn.addEventListener('click', () => setParamPanelVisible(false));
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'viewer-param-panel-body';
    body.innerHTML = `
      <div class="viewer-param-group">
        <label>Projekt-ID</label>
        <input type="text" id="viewer-param-projectid" placeholder="Projekt-ID" value="${projectID || ''}" />
      </div>
      <div class="viewer-param-group">
        <label>Filnamn</label>
        <input type="text" id="viewer-param-filename" placeholder="Filnamn" value="${fileName || ''}" />
      </div>
      <div class="viewer-param-group">
        <label>API-URL</label>
        <input type="text" id="viewer-param-apiurl" placeholder="http://localhost:8080" value="${apiBaseUrl}" />
      </div>
      <div class="viewer-param-actions">
        <button class="viewer-param-btn primary" id="viewer-param-load">Öppna</button>
        <button class="viewer-param-btn secondary" id="viewer-param-newtab">Öppna i ny flik</button>
        <button class="viewer-param-btn secondary" id="viewer-param-download">Ladda ner</button>
        ${globeActive ? '<button class="viewer-param-btn secondary" id="viewer-param-showinmap">Visa i kartan</button>' : ''}
      </div>
      <div class="viewer-param-download-progress" id="viewer-param-dl-wrap" style="display:none;">
        <div class="viewer-param-download-bar" id="viewer-param-dl-bar"></div>
        <span class="viewer-param-download-label" id="viewer-param-dl-label">0%</span>
      </div>
    `;

    paramPanelEl.appendChild(header);
    paramPanelEl.appendChild(body);
    document.getElementById(targetId).appendChild(paramPanelEl);

    makeElementDraggable(paramPanelEl);

    document.getElementById('viewer-param-load').addEventListener('click', () => {
      const projID = document.getElementById('viewer-param-projectid').value.trim();
      const fName = document.getElementById('viewer-param-filename').value.trim();
      const apiUrl = document.getElementById('viewer-param-apiurl').value.trim();
      if (apiUrl) setApiBaseUrl(apiUrl);
      if (projID && fName) {
        if (!isOpen) {
          openViewer(projID, fName);
        } else {
          loadFile(projID, fName);
        }
      }
    });

    document.getElementById('viewer-param-newtab').addEventListener('click', () => {
      const projID = document.getElementById('viewer-param-projectid').value.trim();
      const fName = document.getElementById('viewer-param-filename').value.trim();
      const apiUrl = document.getElementById('viewer-param-apiurl').value.trim();
      if (apiUrl) setApiBaseUrl(apiUrl);
      if (projID && fName) openInNewTab(projID, fName);
    });

    document.getElementById('viewer-param-download').addEventListener('click', () => {
      const projID = document.getElementById('viewer-param-projectid').value.trim();
      const fName = document.getElementById('viewer-param-filename').value.trim();
      const apiUrl = document.getElementById('viewer-param-apiurl').value.trim();
      if (apiUrl) setApiBaseUrl(apiUrl);
      if (!projID || !fName) return;

      const wrap = document.getElementById('viewer-param-dl-wrap');
      const bar = document.getElementById('viewer-param-dl-bar');
      const label = document.getElementById('viewer-param-dl-label');

      wrap.style.display = 'block';
      bar.style.width = '0%';
      label.textContent = '0%';

      downloadOriginalFile(projID, fName, (pct) => {
        bar.style.width = pct + '%';
        label.textContent = pct + '%';
      }).then(() => {
        bar.style.width = '100%';
        label.textContent = 'Klar!';
        setTimeout(() => { wrap.style.display = 'none'; }, 2000);
      }).catch((err) => {
        label.textContent = 'Fel: ' + err.message;
        setTimeout(() => { wrap.style.display = 'none'; }, 3000);
      });
    });

    // Show in map button (only if globeActive)
    const showInMapBtn = document.getElementById('viewer-param-showinmap');
    if (showInMapBtn) {
      showInMapBtn.addEventListener('click', async () => {
        const projID = document.getElementById('viewer-param-projectid').value.trim();
        const fName = document.getElementById('viewer-param-filename').value.trim();
        const apiUrl = document.getElementById('viewer-param-apiurl').value.trim();
        if (apiUrl) setApiBaseUrl(apiUrl);
        if (!projID || !fName) {
          alert('Ange projekt-ID och filnamn.');
          return;
        }
        
        // Directly show in map without opening the viewer
        await showInMapDirect(projID, fName);
      });
    }
  }

  /**
   * Directly show a model in the map without using the viewer panel
   * Fetches geo headers and loads model into Cesium
   */
  async function showInMapDirect(projID, fName) {
    // Check if it's a DXF file
    if (fName && fName.toLowerCase().endsWith('.dxf')) {
      alert('DXF-filer kan inte visas i 3D-kartan. Endast GLB-modeller stöds.');
      return;
    }

    // Check if globe is available
    const oGlobe = window.oGlobe;
    if (!oGlobe) {
      alert('Globe/3D-läge är inte aktiverat. Aktivera 3D-läget först.');
      return;
    }

    // If globe is in 2D mode, switch to 3D mode
    if (!oGlobe.getEnabled()) {
      oGlobe.setEnabled(true);
      // Give Cesium a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const scene = oGlobe.getCesiumScene ? oGlobe.getCesiumScene() : null;
    if (!scene) {
      alert('Kunde inte komma åt Cesium-scenen.');
      return;
    }

    const Cesium = window.Cesium;
    if (!Cesium) {
      alert('Cesium är inte laddat.');
      return;
    }

    // Fetch geo headers with a HEAD or GET request
    const modelUrl = buildViewerUrl(projID, fName);

    try {
      // Fetch to get headers (server doesn't support HEAD)
      const response = await fetch(modelUrl, { method: 'GET' });
      
      if (!response.ok) {
        alert(`Kunde inte hämta fil: HTTP ${response.status}`);
        return;
      }

      // Extract geo headers
      const positionStr = response.headers.get('x-position') || '';
      const translationStr = response.headers.get('x-translation') || '';
      const rotHeadingStr = response.headers.get('x-rotheading') || '';
      
      console.log('[ViewerPlugin] Direct showInMap - headers:', { positionStr, translationStr, rotHeadingStr });

      if (!positionStr) {
        alert('Position saknas i svaret från servern.');
        return;
      }

      const posParts = positionStr.split(',').map(s => parseFloat(s.trim()));
      if (posParts.length < 2 || posParts.some(isNaN)) {
        alert('Ogiltig positionsdata.');
        return;
      }

      const longitude = posParts[0];
      const latitude = posParts[1];

      if (longitude === 0 && latitude === 0) {
        alert('Modellen är inte georeferenserad (position är 0,0).');
        return;
      }

      // Parse translation for height
      let height = 0;
      if (translationStr) {
        const transParts = translationStr.split(',').map(s => parseFloat(s.trim()));
        if (transParts.length > 2 && !isNaN(transParts[2])) {
          height = transParts[2];
        }
      }

      // Parse rotation heading (degrees to radians)
      // Add 180° (Math.PI) because IFC/GLB models often have Y-axis pointing south
      let headingRadians = Math.PI; // Start with 180° offset
      if (rotHeadingStr) {
        const headingDegrees = parseFloat(rotHeadingStr.trim());
        if (!isNaN(headingDegrees)) {
          headingRadians = Cesium.Math.toRadians(headingDegrees) + Math.PI;
        }
      }

      console.log('[ViewerPlugin] Loading model at:', { longitude, latitude, height, headingDegrees: rotHeadingStr, headingRadians, url: modelUrl });

      // Load the model into Cesium using standard ENU frame
      const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
      const hpr = new Cesium.HeadingPitchRoll(headingRadians, 0, 0);
      const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);

      const model = await Cesium.Model.fromGltfAsync({
        url: modelUrl,
        modelMatrix: modelMatrix,
        heightReference: Cesium.HeightReference.NONE,
        scene: scene,
        minimumPixelSize: 1
      });

      scene.primitives.add(model);
      scene.requestRender();

      console.log('[ViewerPlugin] Model added to globe successfully');

      // Fly to the model location
      flyToPosition(longitude, latitude, height);

    } catch (error) {
      console.error('[ViewerPlugin] Error in showInMapDirect:', error);
      alert(`Fel vid laddning: ${error.message}`);
    }
  }

  /**
   * Create viewer modal content
   */
  function createViewerContent() {
    const content = document.createElement('div');
    content.className = 'viewer-plugin-content';
    content.innerHTML = `
      <div class="viewer-toolbar">
        <div class="viewer-toolbar-left">
          <button class="viewer-btn" id="viewer-btn-reset" title="Återställ vy">
            <span>⟲</span>
          </button>
          <button class="viewer-btn" id="viewer-btn-grid" title="Växla rutnät">
            <span>▦</span>
          </button>
          <button class="viewer-btn" id="viewer-btn-axes" title="Växla axlar">
            <span>⊕</span>
          </button>
          <button class="viewer-btn viewer-btn-mode" id="viewer-btn-mode" title="Växla 2D/3D-läge">
            <span id="viewer-btn-mode-label">3D</span>
          </button>
        </div>
        <div class="viewer-toolbar-right">
          ${globeActive ? '<button class="viewer-btn" id="viewer-btn-showinmap" title="Visa modellen i 3D-kartan (Globe)"><span>Visa i kartan</span></button>' : ''}
          <button class="viewer-btn" id="viewer-btn-newtab" title="Öppna i ny flik (fullskärm utan karta)">
            <span>Ny flik ↗</span>
          </button>
          <button class="viewer-btn" id="viewer-btn-screenshot" title="Skärmklipp">
            <span>Skärmklipp</span>
          </button>
        </div>
      </div>
      <div class="viewer-toolbar-views hidden" id="viewer-views-row">
        <span class="viewer-views-label">Vy:</span>
        <button class="viewer-btn viewer-btn-view" data-view="top"    title="Uppifrån">Topp</button>
        <button class="viewer-btn viewer-btn-view" data-view="front"  title="Framsida">Fram</button>
        <button class="viewer-btn viewer-btn-view" data-view="back"   title="Baksida">Bak</button>
        <button class="viewer-btn viewer-btn-view" data-view="left"   title="Vänster sida">Vänster</button>
        <button class="viewer-btn viewer-btn-view" data-view="right"  title="Höger sida">Höger</button>
        <button class="viewer-btn viewer-btn-view" data-view="bottom" title="Undersida">Botten</button>
      </div>
      <div class="viewer-container" id="threejs-viewer-container"></div>
      <div class="viewer-status">
        <div class="viewer-status-text" id="viewer-status-text"></div>
        <div class="viewer-progress" id="viewer-progress" style="display:none;">
          <div class="viewer-progress-bar" id="viewer-progress-bar"></div>
        </div>
      </div>
      ${showTestUI ? '<div id="viewer-test-ui" class="viewer-test-ui"></div>' : ''}
    `;
    return content;
  }

  /**
   * Initialize Three.js viewer
   */
  function initThreeViewer() {
    viewerContainer = document.getElementById('threejs-viewer-container');
    if (!viewerContainer) {
      console.error('Viewer container not found');
      return;
    }

    console.log('[ViewerPlugin] Container dims at init:', viewerContainer.clientWidth, 'x', viewerContainer.clientHeight);
    threeViewer = new ThreeViewer(viewerContainer, getConfig().viewer);

    // Force correct dimensions after the modal has fully painted.
    // waitForSize polls until the container has real dimensions, then fits the camera.
    function waitForSize(attempts) {
      if (!threeViewer) return;
      const ready = threeViewer.resize();
      if (ready) {
        if (threeViewer.loadedModel) threeViewer.resetCamera();
      } else if (attempts > 0) {
        requestAnimationFrame(() => waitForSize(attempts - 1));
      }
    }
    requestAnimationFrame(() => waitForSize(20));

    threeViewer.onLoadSuccess = (model) => {
      // Ensure correct size then fit camera
      const doFit = (attempts) => {
        if (!threeViewer) return;
        threeViewer.resize();
        if (threeViewer.container.clientWidth > 1) {
          threeViewer.resetCamera();
        } else if (attempts > 0) {
          requestAnimationFrame(() => doFit(attempts - 1));
        }
      };
      requestAnimationFrame(() => doFit(20));
      setViewerStatus('Modell laddad', 'success');
      hideProgress();
      // Sync mode button label + views row
      const modeLabel = document.getElementById('viewer-btn-mode-label');
      if (modeLabel) modeLabel.textContent = threeViewer.viewMode.toUpperCase();
      const viewsRow = document.getElementById('viewer-views-row');
      if (viewsRow) viewsRow.classList.toggle('hidden', threeViewer.viewMode !== '2d');
      if (onLoadSuccess) onLoadSuccess(model);
    };
    
    threeViewer.onViewModeChange = (mode) => {
      const modeLabel = document.getElementById('viewer-btn-mode-label');
      if (modeLabel) modeLabel.textContent = mode.toUpperCase();
      const viewsRow = document.getElementById('viewer-views-row');
      if (viewsRow) viewsRow.classList.toggle('hidden', mode !== '2d');
    };
    
    threeViewer.onLoadError = (error) => {
      setViewerStatus(`Fel: ${error.message}`, 'error');
      hideProgress();
      if (onLoadError) onLoadError(error);
    };

    // Setup toolbar buttons
    setupToolbarButtons();

    // Initialize test UI if enabled
    if (showTestUI) {
      testUI = new TestUI('viewer-test-ui', 'threejs-viewer-container');
    }

    if (onViewerReady) onViewerReady(threeViewer);

    // Load initial file if provided
    if (projectID && fileName) {
      loadFile(projectID, fileName);
    }
  }

  /**
   * Setup toolbar button event listeners
   */
  function setupToolbarButtons() {
    document.getElementById('viewer-btn-reset')?.addEventListener('click', () => {
      threeViewer?.resetCamera();
    });
    
    document.getElementById('viewer-btn-grid')?.addEventListener('click', () => {
      threeViewer?.toggleGrid();
    });
    
    document.getElementById('viewer-btn-axes')?.addEventListener('click', () => {
      threeViewer?.toggleAxes();
    });

    document.getElementById('viewer-btn-mode')?.addEventListener('click', () => {
      if (threeViewer) {
        threeViewer.toggleViewMode();
        const label = document.getElementById('viewer-btn-mode-label');
        if (label) label.textContent = threeViewer.viewMode.toUpperCase();
      }
    });

    document.querySelectorAll('.viewer-btn-view').forEach(btn => {
      btn.addEventListener('click', () => {
        if (threeViewer) threeViewer.setOrthoView(btn.dataset.view);
      });
    });

    document.getElementById('viewer-btn-screenshot')?.addEventListener('click', () => {
      if (threeViewer) {
        const dataUrl = threeViewer.takeScreenshot();
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'model-screenshot.png';
        link.click();
      }
    });
    
    document.getElementById('viewer-btn-newtab')?.addEventListener('click', () => {
      openInNewTab();
    });

    document.getElementById('viewer-btn-download')?.addEventListener('click', () => {
      if (currentProjectID && currentFileName) {
        downloadFile(currentProjectID, currentFileName);
      }
    });

    // Show in map button (only if globeActive)
    document.getElementById('viewer-btn-showinmap')?.addEventListener('click', () => {
      showInMap();
    });
  }

  /**
   * Show the current model in the 3D map (Globe/Cesium)
   */
  async function showInMap() {
    // Check if we have a loaded file
    if (!currentProjectID || !currentFileName) {
      setViewerStatus('Ingen fil laddad — öppna en fil först.', 'error');
      return;
    }

    // Check if it's a DXF file
    if (currentFileType === 'dxf' || (currentFileName && currentFileName.toLowerCase().endsWith('.dxf'))) {
      setViewerStatus('DXF-filer kan inte visas i 3D-kartan. Endast GLB-modeller stöds.', 'error');
      return;
    }

    // Check if we have geo headers - if null, file is still loading
    console.log('[ViewerPlugin] showInMap - currentGeoHeaders:', currentGeoHeaders);
    if (!currentGeoHeaders) {
      setViewerStatus('Filen laddas fortfarande. Vänta tills modellen är laddad.', 'info');
      return;
    }

    // Check if position exists
    const pos = currentGeoHeaders.position;
    console.log('[ViewerPlugin] showInMap - position:', pos);
    if (!pos) {
      setViewerStatus('Position saknas i svaret från servern. Kontrollera att X-Position header skickas och exponeras via CORS.', 'error');
      return;
    }
    if (pos[0] === 0 && pos[1] === 0) {
      setViewerStatus('Modellen är inte georeferenserad (position är 0,0).', 'error');
      return;
    }

    // Check if globe (OLCesium) is available via window.oGlobe
    const oGlobe = window.oGlobe;
    if (!oGlobe) {
      setViewerStatus('Globe/3D-läge är inte aktiverat. Aktivera 3D-läget först.', 'error');
      return;
    }

    // If globe is in 2D mode, switch to 3D mode
    if (!oGlobe.getEnabled()) {
      oGlobe.setEnabled(true);
      // Give Cesium a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Get Cesium scene
    const scene = oGlobe.getCesiumScene ? oGlobe.getCesiumScene() : null;
    if (!scene) {
      setViewerStatus('Kunde inte komma åt Cesium-scenen.', 'error');
      return;
    }

    // Check if Cesium is available
    const Cesium = window.Cesium;
    if (!Cesium) {
      setViewerStatus('Cesium är inte laddat.', 'error');
      return;
    }

    // Build the URL for the GLB model
    const modelUrl = buildViewerUrl(currentProjectID, currentFileName);

    // Extract position data - pos is [longitude, latitude] in WGS84
    const longitude = pos[0];
    const latitude = pos[1];
    const translation = currentGeoHeaders.translation || [0, 0, 0];
    // translation[2] is the height offset if provided
    const height = translation.length > 2 ? translation[2] : 0;
    
    // Get rotation heading (degrees to radians)
    // Add 180° (Math.PI) because IFC/GLB models often have Y-axis pointing south
    const rotHeading = currentGeoHeaders.rotHeading || 0;
    const headingRadians = Cesium.Math.toRadians(rotHeading) + Math.PI;

    console.log('[ViewerPlugin] Adding model to globe:', {
      url: modelUrl,
      longitude,
      latitude,
      height,
      rotHeading,
      headingRadians,
      translation
    });

    try {
      // Create position in Cesium coordinates using standard ENU frame
      const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
      const hpr = new Cesium.HeadingPitchRoll(headingRadians, 0, 0);
      const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);

      // Load the model asynchronously
      setViewerStatus(`Laddar modell i 3D-kartan...`, 'info');

      Cesium.Model.fromGltfAsync({
        url: modelUrl,
        modelMatrix: modelMatrix,
        heightReference: Cesium.HeightReference.NONE,
        scene: scene,
        minimumPixelSize: 1
      }).then((model) => {
        scene.primitives.add(model);
        scene.requestRender();

        setViewerStatus(`Modellen "${currentFileName}" har lagts till i 3D-kartan.`, 'success');
        console.log('[ViewerPlugin] Model added to globe successfully');

        // Fly to the model location
        flyToPosition(longitude, latitude, height);
      }).catch((error) => {
        console.error('[ViewerPlugin] Error loading model:', error);
        setViewerStatus(`Kunde inte ladda modellen: ${error.message}`, 'error');
      });

    } catch (error) {
      console.error('[ViewerPlugin] Error adding model to globe:', error);
      setViewerStatus(`Kunde inte lägga till modellen i kartan: ${error.message}`, 'error');
    }
  }

  /**
   * Fly the camera to a position
   */
  function flyToPosition(longitude, latitude, height = 0) {
    const oGlobe = window.oGlobe;
    const Cesium = window.Cesium;
    
    if (!oGlobe || !Cesium) return;

    const scene = oGlobe.getCesiumScene();
    if (!scene || !scene.camera) return;

    // Calculate a reasonable viewing distance based on model size
    // Default to 500m if no specific size known
    const viewingDistance = 500;

    scene.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height + viewingDistance),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45), // Look down at 45 degrees
        roll: 0
      },
      duration: 2 // seconds
    });
  }

  /**
   * Open the current model in a new browser tab, fullscreen, no map.
   * Uses document.write on about:blank so the new tab inherits the same origin
   * — API fetches work without any CORS changes.
   */
  function openInNewTab(projID = null, fName = null) {
    const pid = projID || currentProjectID;
    const fn = fName || currentFileName;
    if (!pid || !fn) {
      setViewerStatus('Ingen fil laddad — öppna en fil innan du använder Ny flik.', 'error');
      return;
    }
    const cfg = getConfig();
    const viewerUrl = `${cfg.api.baseUrl}${cfg.api.endpoints.viewer}?projectID=${encodeURIComponent(pid)}&fileName=${encodeURIComponent(fn)}&view=true`;
    const downloadUrl = `${cfg.api.baseUrl}${cfg.api.endpoints.download}?projectID=${encodeURIComponent(pid)}&fileName=${encodeURIComponent(fn)}`;
    const title = fn || '3D Viewer';
    const isDxf = fn && fn.toLowerCase().endsWith('.dxf');

    const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Viewer</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: ${isDxf ? '#f5f5f5' : '#1c1c1c'}; color: ${isDxf ? '#111' : '#fff'}; font-family: Arial, sans-serif; overflow: hidden; }
    #c { display: block; width: 100vw; height: 100vh; }
    #toolbar {
      position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
      display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; z-index: 10;
      background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 6px;
    }
    .tb { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25);
          color: #fff; padding: 5px 12px; border-radius: 4px; cursor: pointer;
          font-size: 13px; white-space: nowrap; }
    .tb:hover { background: rgba(255,255,255,0.22); }
    .tb.active { background: rgba(255,255,255,0.30); border-color: #4caf50; }
    #views-row { display: ${isDxf ? 'contents' : 'none'}; }
    #status {
      position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.65); padding: 6px 16px; border-radius: 4px;
      font-size: 13px; pointer-events: none; transition: opacity 0.4s;
    }
    #status.hidden { opacity: 0; }
    #progress { position: fixed; top: 0; left: 0; height: 3px; background: #4caf50; width: 0; z-index: 20; transition: width 0.2s; }
  </style>
</head>
<body>
  <div id="progress"></div>
  <div id="toolbar">
    <button class="tb" id="btn-reset">⟲ Återställ</button>
    <button class="tb" id="btn-grid">▦ Grid</button>
    <button class="tb" id="btn-mode">3D</button>
    <span id="views-row">
      <button class="tb btn-view" data-view="top">Topp</button>
      <button class="tb btn-view" data-view="front">Fram</button>
      <button class="tb btn-view" data-view="back">Bak</button>
      <button class="tb btn-view" data-view="left">Vänster</button>
      <button class="tb btn-view" data-view="right">Höger</button>
      <button class="tb btn-view" data-view="bottom">Botten</button>
    </span>
    <button class="tb" id="btn-dl">⬇ Ladda ner</button>
  </div>
  <canvas id="c"></canvas>
  <div id="status">Laddar...</div>
</body>
</html>`;

    const mainScript = `(function() {
    const canvas = document.getElementById('c');
    const statusEl = document.getElementById('status');
    const progressEl = document.getElementById('progress');
    const modeBtn = document.getElementById('btn-mode');
    const viewsRow = document.getElementById('views-row');
    let isDxf = ${isDxf ? 'true' : 'false'}; // hint from filename; confirmed by magic bytes after fetch
    console.log('[NewTab] isDxf hint=' + isDxf + ' fn=${fn}');

    let statusTimer;
    function setStatus(msg, autohide = false) {
      clearTimeout(statusTimer);
      statusEl.textContent = msg;
      statusEl.classList.remove('hidden');
      if (autohide) statusTimer = setTimeout(() => statusEl.classList.add('hidden'), 2500);
    }
    function setProgress(pct) { progressEl.style.width = pct + '%'; }

    // --- Scene + Renderer ---
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDxf ? 0xf5f5f5 : 0x1c1c1c);

    // --- Cameras ---
    const perspCam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 1e6);
    perspCam.position.set(10, 8, 15);
    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);

    let camera = isDxf ? orthoCam : perspCam;
    let viewMode = isDxf ? '2d' : '3d';

    // --- Controls ---
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableRotate = !isDxf;
    controls.screenSpacePanning = true;

    // --- Lights ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // --- Grid ---
    let grid = new THREE.GridHelper(100, 100, 0x444444, 0x333333);
    scene.add(grid);
    let gridVisible = true;
    document.getElementById('btn-grid').addEventListener('click', () => {
      gridVisible = !gridVisible; grid.visible = gridVisible;
    });

    // --- Camera helpers ---
    let loadedModel = null;
    let dxfExtentSx = 0, dxfExtentSy = 0; // stored from $EXTMIN/$EXTMAX on load

    function fitPerspective(model) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      perspCam.near = maxDim * 0.001; perspCam.far = maxDim * 200;
      perspCam.position.copy(center).add(new THREE.Vector3(maxDim*1.2, maxDim*0.8, maxDim*1.2));
      perspCam.lookAt(center); perspCam.updateProjectionMatrix();
      controls.target.copy(center); controls.update();
    }

    function fitOrtho(model, dir = isDxf ? 'front' : 'top') {
      // For DXF, always use the header extents — bounding box has outlier geometry (km-scale)
      if (isDxf && dxfExtentSx > 0) {
        const aspect = innerWidth / innerHeight;
        const dist = Math.max(dxfExtentSx, dxfExtentSy) * 10 + 1000;
        const dxfPresets = {
          front:  { pos: [0, 0,  dist], up: [0,  1, 0], d1: dxfExtentSx, d2: dxfExtentSy },
          back:   { pos: [0, 0, -dist], up: [0,  1, 0], d1: dxfExtentSx, d2: dxfExtentSy },
          top:    { pos: [0,  dist, 0], up: [0,  0,-1], d1: dxfExtentSx, d2: dxfExtentSx },
          bottom: { pos: [0, -dist, 0], up: [0,  0, 1], d1: dxfExtentSx, d2: dxfExtentSx },
          right:  { pos: [ dist, 0, 0], up: [0,  1, 0], d1: dxfExtentSy, d2: dxfExtentSy },
          left:   { pos: [-dist, 0, 0], up: [0,  1, 0], d1: dxfExtentSy, d2: dxfExtentSy },
        };
        const p = dxfPresets[dir] || dxfPresets.front;
        const halfH = (Math.max(p.d1 / aspect, p.d2) / 2 || 10) * 1.15;
        const halfW = halfH * aspect;
        orthoCam.left=-halfW; orthoCam.right=halfW; orthoCam.top=halfH; orthoCam.bottom=-halfH;
        orthoCam.near=-dist*2; orthoCam.far=dist*2;
        orthoCam.up.set(...p.up); orthoCam.position.set(...p.pos); orthoCam.lookAt(0, 0, 0);
        orthoCam.updateProjectionMatrix();
        controls.target.set(0, 0, 0); controls.update();
        return;
      }
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const dist = Math.max(size.x, size.y, size.z) * 100 + 1000;
      const aspect = innerWidth / innerHeight;
      const presets = {
        top:    { pos: [center.x, center.y+dist, center.z], up:[0,0,-1], d1:size.x, d2:size.z },
        bottom: { pos: [center.x, center.y-dist, center.z], up:[0,0, 1], d1:size.x, d2:size.z },
        front:  { pos: [center.x, center.y, center.z+dist], up:[0,1, 0], d1:size.x, d2:size.y },
        back:   { pos: [center.x, center.y, center.z-dist], up:[0,1, 0], d1:size.x, d2:size.y },
        right:  { pos: [center.x+dist, center.y, center.z], up:[0,1, 0], d1:size.z, d2:size.y },
        left:   { pos: [center.x-dist, center.y, center.z], up:[0,1, 0], d1:size.z, d2:size.y },
      };
      const p = presets[dir] || presets.top;
      const halfH = (Math.max(p.d1/aspect, p.d2)/2 || 10) * 1.15;
      const halfW = halfH * aspect;
      orthoCam.left=-halfW; orthoCam.right=halfW; orthoCam.top=halfH; orthoCam.bottom=-halfH;
      orthoCam.near=-dist*2; orthoCam.far=dist*2;
      orthoCam.up.set(...p.up); orthoCam.position.set(...p.pos); orthoCam.lookAt(center);
      orthoCam.updateProjectionMatrix();
      controls.target.copy(center); controls.update();
    }

    // --- 2D/3D toggle ---
    function setViewMode(mode) {
      viewMode = mode;
      modeBtn.textContent = mode.toUpperCase();
      viewsRow.style.display = mode === '2d' ? 'contents' : 'none';
      if (mode === '2d') {
        camera = orthoCam;
        controls.object = orthoCam;
        controls.enableRotate = false;
        if (loadedModel) fitOrtho(loadedModel);
      } else {
        camera = perspCam;
        controls.object = perspCam;
        controls.enableRotate = true;
        if (loadedModel) fitPerspective(loadedModel);
      }
      controls.update();
    }
    modeBtn.addEventListener('click', () => setViewMode(viewMode === '3d' ? '2d' : '3d'));

    document.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', () => {
        if (viewMode !== '2d') setViewMode('2d');
        // DXF is flat in XY — all view presets except 'front' look at it edge-on.
        // Always use 'front' (camera at Z+, up=Y) so the plan view is preserved.
        if (loadedModel) fitOrtho(loadedModel, btn.dataset.view);
      });
    });

    // --- Reset ---
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!loadedModel) return;
      if (viewMode === '2d') fitOrtho(loadedModel);
      else fitPerspective(loadedModel);
    });

    // --- Download ---
    document.getElementById('btn-dl').addEventListener('click', async () => {
      setStatus('Laddar ner...');
      const resp = await fetch('${downloadUrl}');
      if (!resp.ok) { setStatus('Fel: ' + resp.status); return; }
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${fn}';
      a.click();
      setStatus('Nedladdning klar!', true);
    });

    // --- DXF helpers ---
    function dxfAciToHex(aci) {
      if (aci === 7 || aci == null || aci === 256) return 0x222222;
      if (aci >= 250) { const g=[0x080808,0x363636,0x636363,0x909090,0xbebebe,0xe5e5e5]; return g[aci-250]; }
      const p = [0x000000,0xff0000,0xffff00,0x00ff00,0x00ffff,0x0000ff,0xff00ff,0xffffff,0x414141,0x808080];
      return aci < p.length ? p[aci] : 0x444444;
    }
    function parseHatch(rawText, layerColors, group) {
      const lines = rawText.split('\\n');
      const grps = [];
      for (let i = 0; i + 1 < lines.length; i += 2) {
        const c = parseInt(lines[i].trim(), 10);
        if (!isNaN(c)) grps.push([c, lines[i+1].trim()]);
      }
      const ng = grps.length; let gi = 0;
      while (gi < ng && !(grps[gi][0]===0 && grps[gi][1]==='SECTION')) gi++;
      while (gi < ng && !(grps[gi][0]===2 && grps[gi][1]==='ENTITIES')) gi++;
      gi++;
      while (gi < ng) {
        if (grps[gi][0] !== 0) { gi++; continue; }
        if (grps[gi][1] === 'ENDSEC') break;
        if (grps[gi][1] !== 'HATCH') { gi++; continue; }
        gi++;
        let layer='0', aci=256;
        const boundaries=[];
        while (gi < ng && grps[gi][0]!==0 && grps[gi][0]!==91) {
          if (grps[gi][0]===8) layer=grps[gi][1];
          if (grps[gi][0]===62) aci=parseInt(grps[gi][1],10);
          gi++;
        }
        if (gi>=ng || grps[gi][0]!==91) continue;
        const numPaths=parseInt(grps[gi][1],10); gi++;
        for (let b=0;b<numPaths;b++) {
          let typeFlag=0,hasBulge=false,isClosed=true;
          while (gi<ng && grps[gi][0]!==93 && grps[gi][0]!==0) {
            if(grps[gi][0]===92) typeFlag=parseInt(grps[gi][1],10);
            if(grps[gi][0]===72) hasBulge=grps[gi][1].trim()==='1';
            if(grps[gi][0]===73) isClosed=grps[gi][1].trim()!=='0';
            gi++;
          }
          if (gi>=ng || grps[gi][0]!==93) break;
          const numVerts=parseInt(grps[gi][1],10); gi++;
          if(!(typeFlag&2)){
            // Edge-type boundary: numVerts edges, each preceded by code 72 (edge type)
            const pts=[];
            for(let e=0;e<numVerts;e++){
              if(gi>=ng||grps[gi][0]!==72)break;
              const et=parseInt(grps[gi][1],10);gi++;
              if(et===1){
                // LINE: 10=x1,20=y1,11=x2,21=y2
                let ex1=0,ey1=0,ex2=0,ey2=0;
                while(gi<ng&&grps[gi][0]!==72&&grps[gi][0]!==97&&grps[gi][0]!==92&&grps[gi][0]!==0){
                  if(grps[gi][0]===10)ex1=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===20)ey1=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===11)ex2=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===21)ey2=parseFloat(grps[gi][1]);
                  gi++;
                }
                if(e===0)pts.push(new THREE.Vector2(ex1,ey1));
                pts.push(new THREE.Vector2(ex2,ey2));
              } else if(et===2){
                // ARC: 10=cx,20=cy,40=r,50=startDeg,51=endDeg,73=ccw
                let acx=0,acy=0,ar=0,sa=0,ea=Math.PI*2,ccw=1;
                while(gi<ng&&grps[gi][0]!==72&&grps[gi][0]!==97&&grps[gi][0]!==92&&grps[gi][0]!==0){
                  if(grps[gi][0]===10)acx=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===20)acy=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===40)ar=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===50)sa=parseFloat(grps[gi][1])*Math.PI/180;
                  else if(grps[gi][0]===51)ea=parseFloat(grps[gi][1])*Math.PI/180;
                  else if(grps[gi][0]===73)ccw=parseInt(grps[gi][1],10);
                  gi++;
                }
                let sw=ccw?ea-sa:sa-ea;if(sw<=0)sw+=Math.PI*2;
                const aSegs=Math.max(3,Math.ceil(sw/(Math.PI/2)*16));
                const aStart=ccw?sa:ea,aDir=ccw?1:-1;
                for(let i=0;i<=aSegs;i++){const a=aStart+aDir*sw*(i/aSegs);pts.push(new THREE.Vector2(acx+ar*Math.cos(a),acy+ar*Math.sin(a)));}
              } else if(et===3){
                // ELLIPSE: 10=cx,20=cy,11=majorX,21=majorY,40=ratio,50=p0,51=p1,73=ccw
                let ecx=0,ecy=0,emx=1,emy=0,ratio=1,ep0=0,ep1=Math.PI*2,eccw=1;
                while(gi<ng&&grps[gi][0]!==72&&grps[gi][0]!==97&&grps[gi][0]!==92&&grps[gi][0]!==0){
                  if(grps[gi][0]===10)ecx=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===20)ecy=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===11)emx=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===21)emy=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===40)ratio=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===50)ep0=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===51)ep1=parseFloat(grps[gi][1]);
                  else if(grps[gi][0]===73)eccw=parseInt(grps[gi][1],10);
                  gi++;
                }
                const eMaj=Math.sqrt(emx*emx+emy*emy),eRot=Math.atan2(emy,emx);
                let esw=eccw?ep1-ep0:ep0-ep1;if(esw<=0)esw+=Math.PI*2;
                const eSegs=Math.max(3,Math.ceil(esw/(Math.PI/2)*16));
                const eStart=eccw?ep0:ep1,eDir=eccw?1:-1;
                for(let i=0;i<=eSegs;i++){
                  const t=eStart+eDir*esw*(i/eSegs);
                  const lx=eMaj*Math.cos(t),ly=eMaj*ratio*Math.sin(t);
                  pts.push(new THREE.Vector2(ecx+lx*Math.cos(eRot)-ly*Math.sin(eRot),ecy+lx*Math.sin(eRot)+ly*Math.cos(eRot)));
                }
              } else {
                // SPLINE or unknown — skip to next edge
                while(gi<ng&&grps[gi][0]!==72&&grps[gi][0]!==97&&grps[gi][0]!==92&&grps[gi][0]!==0)gi++;
              }
            }
            if(gi<ng&&grps[gi][0]===97){const cnt=parseInt(grps[gi][1],10);gi++;for(let k=0;k<cnt;k++){if(gi<ng&&grps[gi][0]===330)gi++;}}
            if(pts.length>=3)boundaries.push(pts);
            continue;
          }
          const rv=[];
          for(let v=0;v<numVerts;v++){
            let x=0,y=0,bulge=0;
            if(gi<ng&&grps[gi][0]===10){x=parseFloat(grps[gi][1]);gi++;}
            if(gi<ng&&grps[gi][0]===20){y=parseFloat(grps[gi][1]);gi++;}
            if(hasBulge&&gi<ng&&grps[gi][0]===42){bulge=parseFloat(grps[gi][1]);gi++;}
            rv.push({x,y,bulge});
          }
          if(gi<ng&&grps[gi][0]===97){const cnt=parseInt(grps[gi][1],10);gi++;for(let k=0;k<cnt;k++){if(gi<ng&&grps[gi][0]===330)gi++;}}
          const pts=[];
          for(let v=0;v<rv.length;v++){
            if(!isNaN(rv[v].x))pts.push(new THREE.Vector2(rv[v].x,rv[v].y));
            if(Math.abs(rv[v].bulge)>0.01){
              const rn=v<rv.length-1?rv[v+1]:rv[0];
              const sweep=Math.abs(4*Math.atan(rv[v].bulge));
              const segs=Math.max(3,Math.ceil(sweep/(Math.PI/2)*16));
              // Omit last arc point (it equals rn, pushed on next iteration)
              bulgeToArc(rv[v].x,rv[v].y,rn.x,rn.y,rv[v].bulge,segs)
                .slice(0,-1).filter(p=>!isNaN(p.x)).forEach(p=>pts.push(new THREE.Vector2(p.x,p.y)));
            }
          }
          // THREE.Shape closes itself — do NOT push closing duplicate
          if(pts.length>=3)boundaries.push(pts);
        }
        while(gi<ng&&grps[gi][0]!==0)gi++;
        if(!boundaries.length||boundaries[0].length<3)continue;
        const color=(aci>0&&aci<256)?dxfAciToHex(aci):(layerColors[layer]??0x999999);
        const sa2d=pts=>{let a=0;const n=pts.length;for(let i=0;i<n;i++){const j=(i+1)%n;a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y;}return a/2;};
        try{
          const ox=boundaries[0][0].x,oy=boundaries[0][0].y;
          for(const b of boundaries)for(const p of b){p.x-=ox;p.y-=oy;}
          if(sa2d(boundaries[0])<0)boundaries[0].reverse();
          const shape=new THREE.Shape(boundaries[0]);
          for(let h=1;h<boundaries.length;h++){if(boundaries[h].length>=3){if(sa2d(boundaries[h])>0)boundaries[h].reverse();shape.holes.push(new THREE.Path(boundaries[h]));}}
          const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:0.65,depthTest:false}));
          mesh.position.set(ox,oy,0.01);mesh.renderOrder=-1;group.add(mesh);
        }catch(e){console.warn('[HATCH]',e.message);}
      }
    }
    function bulgeToArc(x1,y1,x2,y2,b,segs) {
      const dx=x2-x1,dy=y2-y1,d=Math.sqrt(dx*dx+dy*dy);
      if(d<1e-10)return[];
      const r=d*(b*b+1)/(4*Math.abs(b)),s=Math.sign(b);
      // Center = midpoint + signed offset along left-perpendicular of chord
      const mx=(x1+x2)/2,my=(y1+y2)/2;
      const h=Math.sqrt(Math.max(0,r*r-d*d/4));
      const cx=mx+s*(-dy/d)*h,cy=my+s*(dx/d)*h;
      const sa=Math.atan2(y1-cy,x1-cx);
      // 4*atan(b) is exact DXF definition — signed for sweep direction
      const sw=4*Math.atan(b);
      const pts=[];
      for(let i=1;i<=segs;i++){const a=sa+sw*(i/segs);pts.push(new THREE.Vector3(cx+r*Math.cos(a),cy+r*Math.sin(a),0));}
      return pts;
    }
    function processDxfEntities(entities, blocks, group, layerColors, layerOverride=null, depth=0) {
      if(depth>8)return;
      const S=64;
      const mat=e=>{const l=(e.layer==='0'&&layerOverride)?layerOverride:e.layer;return new THREE.LineBasicMaterial({color:layerColors[l]??0x222222});};
      const line=(pts,e)=>{if(pts.length<2)return;group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat(e)));};
      for(const e of entities){
        try{
          switch(e.type){
            case 'LINE':{
              const vv=e.vertices||[];const s=vv[0]||{},en=vv[1]||{};
              if(isNaN(s.x)||isNaN(en.x))break;
              line([new THREE.Vector3(s.x,s.y,s.z||0),new THREE.Vector3(en.x,en.y,en.z||0)],e);break;
            }
            case 'POLYLINE':case 'LWPOLYLINE':{
              const v=e.vertices||[];if(v.length<2)break;
              const pts=[];
              for(let i=0;i<v.length;i++){
                const vi=v[i];if(isNaN(vi.x))continue;
                const vn=v[(i+1)%v.length];
                pts.push(new THREE.Vector3(vi.x,vi.y,vi.z||0));
                if(vi.bulge&&Math.abs(vi.bulge)>0.01&&i<v.length-1&&!isNaN(vn.x))
                  pts.push(...bulgeToArc(vi.x,vi.y,vn.x,vn.y,vi.bulge,S).filter(p=>!isNaN(p.x)));
              }
              if(e.closed||e.shape)pts.push(pts[0].clone());
              line(pts,e);break;
            }
            case 'ARC':{
              const c=e.center||{},r=e.radius;
              if(!r||isNaN(r)||isNaN(c.x))break;
              const pts=[];let a0=e.startAngle??0,a1=e.endAngle??(Math.PI*2);
              if(a1<=a0)a1+=Math.PI*2;
              for(let i=0;i<=S;i++){const a=a0+(a1-a0)*(i/S);pts.push(new THREE.Vector3(c.x+r*Math.cos(a),c.y+r*Math.sin(a),c.z||0));}
              line(pts,e);break;
            }
            case 'CIRCLE':{
              const c=e.center||{},r=e.radius;
              if(!r||isNaN(r)||isNaN(c.x))break;
              const pts=[];
              for(let i=0;i<=S;i++){const a=(i/S)*Math.PI*2;pts.push(new THREE.Vector3(c.x+r*Math.cos(a),c.y+r*Math.sin(a),c.z||0));}
              line(pts,e);break;
            }
            case 'ELLIPSE':{
              const c=e.center||{},m=e.majorAxisEndPoint||{};
              if(isNaN(c.x)||isNaN(m.x))break;
              const a=Math.sqrt(m.x*m.x+m.y*m.y),b=a*(e.axisRatio||1);
              if(!a||isNaN(a))break;
              const rot=Math.atan2(m.y,m.x),s0=e.startAngle||0,e0=e.endAngle||Math.PI*2;
              const pts=[];
              for(let i=0;i<=S;i++){const t=s0+(e0-s0)*(i/S),lx=a*Math.cos(t),ly=b*Math.sin(t);pts.push(new THREE.Vector3(c.x+lx*Math.cos(rot)-ly*Math.sin(rot),c.y+lx*Math.sin(rot)+ly*Math.cos(rot),c.z||0));}
              line(pts,e);break;
            }
            case 'SPLINE':{
              if(e.controlPoints&&e.controlPoints.length>=2){
                const vp=e.controlPoints.map(p=>new THREE.Vector3(p.x,p.y,p.z||0)).filter(p=>!isNaN(p.x));
                if(vp.length>=2)line(new THREE.CatmullRomCurve3(vp).getPoints(S*vp.length),e);
              }break;
            }
            case 'TEXT':{
              const p=e.startPoint||{};if(isNaN(p.x)||isNaN(p.y))break;
              const content=e.text||'';if(!content.trim())break;
              const h=e.textHeight||1;
              const rot=(e.rotation||0)*Math.PI/180;
              const aci=e.colorIndex;
              let clr=layerColors[e.layer]??0x222222;
              if(aci&&aci!==256)clr=dxfAciToHex(aci);
              const PX=64;
              const cvs=document.createElement('canvas');
              const c2=cvs.getContext('2d');
              c2.font=PX+'px sans-serif';
              const tw=c2.measureText(content).width;
              cvs.width=Math.ceil(tw)+4;cvs.height=PX+4;
              c2.font=PX+'px sans-serif';
              const cr2=(clr>>16)&0xff,cg2=(clr>>8)&0xff,cb2=clr&0xff;
              c2.fillStyle='rgb('+cr2+','+cg2+','+cb2+')';
              c2.fillText(content,2,PX);
              const tex=new THREE.CanvasTexture(cvs);
              const W=h*(cvs.width/cvs.height),H=h;
              const m=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:0.01,side:THREE.DoubleSide,depthTest:false}));
              m.position.set(p.x+(W/2)*Math.cos(rot)-(H/2)*Math.sin(rot),p.y+(W/2)*Math.sin(rot)+(H/2)*Math.cos(rot),(p.z||0)+0.01);
              m.rotation.z=rot;group.add(m);break;
            }
            case 'INSERT':{
              if(!e.name||e.name.startsWith('*'))break;
              const blk=blocks[e.name];if(!blk)break;
              const cg=new THREE.Group(),bp=blk.basePoint||{};
              cg.position.set(-(bp.x||0),-(bp.y||0),-(bp.z||0));
              processDxfEntities(blk.entities||[],blocks,cg,layerColors,e.layer||layerOverride,depth+1);
              const bg=new THREE.Group();
              bg.add(cg);
              const pos=e.position||{};
              bg.position.set(pos.x||0,pos.y||0,pos.z||0);
              bg.scale.set(e.xScale??1,e.yScale??1,e.zScale??1);
              if(e.rotation)bg.rotation.z=e.rotation*Math.PI/180;
              group.add(bg);break;
            }
          }
        }catch(err){console.warn('[DXF]',e.type,err.message);}
      }
    }

    // --- Load (auto-detect GLB vs DXF by magic bytes) ---
    async function loadFile() {
      setStatus('Hämtar fil...');
      setProgress(10);
      const resp = await fetch('${viewerUrl}');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const total = parseInt(resp.headers.get('content-length') || '0', 10);
      let loaded = 0; const reader = resp.body.getReader(); const chunks = [];
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        chunks.push(value); loaded += value.length;
        if (total) setProgress(10 + (loaded / total) * 70);
      }
      setProgress(80);

      // Detect type by magic bytes: GLB always starts with "glTF" (0x67 0x6C 0x54 0x46)
      const firstBytes = chunks[0] || new Uint8Array(0);
      const detectedGlb = firstBytes.length >= 4 &&
        firstBytes[0] === 0x67 && firstBytes[1] === 0x6C &&
        firstBytes[2] === 0x54 && firstBytes[3] === 0x46;
      isDxf = !detectedGlb;
      console.log('[NewTab] detected isDxf=' + isDxf + ' (magic bytes)');

      // Update scene/camera/UI for detected type
      scene.background = new THREE.Color(isDxf ? 0xf5f5f5 : 0x1c1c1c);
      viewMode = isDxf ? '2d' : '3d';
      modeBtn.textContent = viewMode.toUpperCase();
      viewsRow.style.display = isDxf ? 'contents' : 'none';
      camera = isDxf ? orthoCam : perspCam;
      controls.object = camera;
      controls.enableRotate = !isDxf;
      controls.update();

      if (isDxf) {
        setStatus('Parsar DXF...');
        const _dxfLen = chunks.reduce((s, c) => s + c.length, 0);
        const _dxfBuf = new Uint8Array(_dxfLen);
        let _dxfOff = 0; for (const ch of chunks) { _dxfBuf.set(ch, _dxfOff); _dxfOff += ch.length; }
        let text = new TextDecoder('utf-8').decode(_dxfBuf);
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip UTF-8 BOM
        const DxfParser = window.DxfParser;
        if (!DxfParser) throw new Error('dxf-parser saknas (CDN)');
        const dxf = new DxfParser().parseSync(text);
        const layerColors = {};
        if (dxf.tables?.layer?.layers) {
          for (const [n, l] of Object.entries(dxf.tables.layer.layers))
            layerColors[n] = dxfAciToHex(l.color);
        }
        const group = new THREE.Group();
        processDxfEntities(dxf.entities || [], dxf.blocks || {}, group, layerColors);
        parseHatch(text, layerColors, group);
        // Use $EXTMIN/$EXTMAX from DXF header for robust centering (avoids outlier geometry)
        function parseDxfExtents(raw) {
          const ls=raw.split('\\n'); let mn=null,mx=null;
          for(let i=0;i+4<ls.length;i++){
            const c=ls[i].trim(),v=ls[i+1]?.trim();
            if(c==='9'&&(v==='$EXTMIN'||v==='$EXTMAX')){
              const c1=ls[i+2]?.trim(),v1=ls[i+3]?.trim(),c2=ls[i+4]?.trim(),v2=ls[i+5]?.trim();
              if(c1==='10'&&c2==='20'){const x=parseFloat(v1),y=parseFloat(v2);if(!isNaN(x)&&!isNaN(y)){if(v==='$EXTMIN')mn={x,y};else mx={x,y};}}
            }
            if(mn&&mx)break;
          }
          return(mn&&mx)?{min:mn,max:mx}:null;
        }
        const ext=parseDxfExtents(text);
        if(ext){
          const cx=(ext.min.x+ext.max.x)/2,cy=(ext.min.y+ext.max.y)/2;
          group.position.set(-cx,-cy,0);group.updateMatrixWorld(true);
          scene.add(group);loadedModel=group;
          const sx=ext.max.x-ext.min.x,sy=ext.max.y-ext.min.y;
          dxfExtentSx = sx; dxfExtentSy = sy; // store for reset/view buttons
          const aspect=innerWidth/innerHeight;
          const halfH=Math.max(sx/aspect,sy)/2*1.15,halfW=halfH*aspect;
          orthoCam.left=-halfW;orthoCam.right=halfW;orthoCam.top=halfH;orthoCam.bottom=-halfH;
          orthoCam.near=-100000;orthoCam.far=100000;
          orthoCam.position.set(0,0,1000);orthoCam.lookAt(0,0,0);
          orthoCam.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();
        } else {
          const box=new THREE.Box3().setFromObject(group);
          const center=box.getCenter(new THREE.Vector3());
          group.position.sub(center);group.updateMatrixWorld(true);
          scene.add(group);loadedModel=group;
          fitOrtho(group,'front');
        }
        setProgress(100); setStatus('Klar', true);
        setTimeout(() => setProgress(0), 600);
      } else {
        setStatus('Renderar...');
        const buffer = await new Blob(chunks).arrayBuffer();
        const dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/gltf/');
        const loader = new THREE.GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        if (window.MeshoptDecoder) {
          await MeshoptDecoder.ready;
          loader.setMeshoptDecoder(MeshoptDecoder);
        }
        loader.parse(buffer, '', (gltf) => {
          loadedModel = gltf.scene;
          const box = new THREE.Box3().setFromObject(loadedModel);
          loadedModel.position.sub(box.getCenter(new THREE.Vector3()));
          loadedModel.updateMatrixWorld(true);
          scene.add(loadedModel); fitPerspective(loadedModel);
          setProgress(100); setStatus('Klar', true);
          setTimeout(() => setProgress(0), 600);
        }, undefined, err => { setStatus('Fel: ' + (err.message||err)); });
      }
    }

    // --- Resize ---
    window.addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      if (viewMode === '2d') {
        const a = innerWidth / innerHeight;
        const hh = (orthoCam.top - orthoCam.bottom) / 2;
        orthoCam.left = -hh * a; orthoCam.right = hh * a;
        orthoCam.updateProjectionMatrix();
      } else {
        perspCam.aspect = innerWidth / innerHeight;
        perspCam.updateProjectionMatrix();
      }
    });

    // --- Animate ---
    (function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();

    // --- Start ---
    loadFile().catch(err => setStatus('Fel: ' + err.message));
  })();`;

    const newWin = window.open('about:blank', '_blank');
    if (!newWin) {
      setViewerStatus('Popup blockerad — tillåt popups för den här sidan.', 'error');
      return;
    }
    newWin.document.open();
    newWin.document.write(html);
    newWin.document.close();

    const cdnScripts = [
      'https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
      'https://cdn.jsdelivr.net/npm/meshoptimizer@0.18.1/meshopt_decoder.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js',
    ];
    function loadNext(i) {
      if (i >= cdnScripts.length) {
        const s = newWin.document.createElement('script');
        s.textContent = mainScript;
        newWin.document.body.appendChild(s);
        return;
      }
      const s = newWin.document.createElement('script');
      s.src = cdnScripts[i];
      s.onload = () => loadNext(i + 1);
      s.onerror = () => loadNext(i + 1);
      newWin.document.head.appendChild(s);
    }
    loadNext(0);
  }

  // Current file tracking
  let currentProjectID = projectID;
  let currentFileName = fileName;
  let currentFileType = null;
  let currentGeoHeaders = null;

  /**
   * Set viewer status message
   */
  function setViewerStatus(message, type = 'info') {
    const statusEl = document.getElementById('viewer-status-text');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `viewer-status-text status-${type}`;
    }
  }

  /**
   * Show progress bar
   */
  function showProgress(percent) {
    const progressEl = document.getElementById('viewer-progress');
    const barEl = document.getElementById('viewer-progress-bar');
    if (progressEl && barEl) {
      progressEl.style.display = 'block';
      barEl.style.width = `${percent}%`;
    }
  }

  /**
   * Hide progress bar
   */
  function hideProgress() {
    const progressEl = document.getElementById('viewer-progress');
    if (progressEl) {
      progressEl.style.display = 'none';
    }
  }

  /**
   * Load a file into the viewer
   */
  async function loadFile(projID, fName) {
    if (!threeViewer) {
      console.error('Viewer not initialized');
      return;
    }

    currentProjectID = projID;
    currentFileName = fName;
    currentFileType = null;
    currentGeoHeaders = null;

    setViewerStatus(`Laddar: ${fName}...`, 'info');
    showProgress(10);

    try {
      const result = await fetchViewerFile(projID, fName, (progress) => {
        showProgress(10 + progress * 0.7);
      });

      // Store file type and geo headers for showInMap feature
      currentFileType = result.fileType;
      currentGeoHeaders = result.geoHeaders || null;

      showProgress(80);
      setViewerStatus(`Renderar ${result.fileType.toUpperCase()}...`, 'info');

      await threeViewer.loadModel(result.data, result.fileType);
      showProgress(100);

    } catch (error) {
      setViewerStatus(`Laddningsfel: ${error.message}`, 'error');
      hideProgress();
      console.error('File load error:', error);
      if (onLoadError) onLoadError(error);
    }
  }

  /**
   * Download original file
   */
  async function downloadFile(projID, fName) {
    setViewerStatus(`Laddar ner: ${fName}...`, 'info');
    showProgress(10);

    try {
      await downloadOriginalFile(projID, fName, (progress) => {
        showProgress(10 + progress * 0.9);
      });
      
      showProgress(100);
      setViewerStatus('Nedladdning klar!', 'success');
      setTimeout(hideProgress, 1000);

    } catch (error) {
      setViewerStatus(`Nedladdningsfel: ${error.message}`, 'error');
      hideProgress();
      console.error('Download error:', error);
    }
  }

  /**
   * Open the viewer as a floating panel (no overlay)
   */
  function openViewer(projID = null, fName = null) {
    if (projID) currentProjectID = projID;
    if (fName) currentFileName = fName;

    const content = createViewerContent();

    // Build panel
    modal = document.createElement('div');
    modal.className = 'viewer-float-panel';
    modal.innerHTML = `
      <div class="viewer-float-header" id="viewer-float-header">
        <span class="viewer-float-title">${buttonText}</span>
        <button class="viewer-float-close" id="viewer-float-close" aria-label="Stäng">✕</button>
      </div>
    `;
    modal.appendChild(content);

    // Resize handle (bottom-right)
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'viewer-resize-handle';
    modal.appendChild(resizeHandle);

    // Append to map container
    const mapContainer = document.getElementById(origoViewer.getId());
    mapContainer.appendChild(modal);

    // Close button
    document.getElementById('viewer-float-close').addEventListener('click', () => closeViewer());

    // Drag by header
    const header = document.getElementById('viewer-float-header');
    makePanelDraggable(modal, header);

    // Resize handle logic
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = modal.offsetWidth;
      const startH = modal.offsetHeight;
      function onMove(ev) {
        modal.style.width = Math.max(300, startW + (ev.clientX - startX)) + 'px';
        modal.style.height = Math.max(200, startH + (ev.clientY - startY)) + 'px';
        if (threeViewer) threeViewer.resize();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (threeViewer) threeViewer.resize();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    isOpen = true;

    // Poll until container has real width then init
    function tryInit(attempts) {
      const container = document.getElementById('threejs-viewer-container');
      if (container && container.clientWidth > 10) {
        initThreeViewer();
        if (currentProjectID && currentFileName) {
          loadFile(currentProjectID, currentFileName);
        }
      } else if (attempts > 0) {
        requestAnimationFrame(() => tryInit(attempts - 1));
      } else {
        console.warn('[ViewerPlugin] Container width still 0 after polling, initialising anyway');
        initThreeViewer();
        if (currentProjectID && currentFileName) {
          loadFile(currentProjectID, currentFileName);
        }
      }
    }
    requestAnimationFrame(() => tryInit(60));
  }

  function makePanelDraggable(panel, handle) {
    let ox = 0, oy = 0, sx = 0, sy = 0;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      sx = e.clientX; sy = e.clientY;
      function onMove(ev) {
        ox = sx - ev.clientX; oy = sy - ev.clientY;
        sx = ev.clientX; sy = ev.clientY;
        panel.style.top = (panel.offsetTop - oy) + 'px';
        panel.style.left = (panel.offsetLeft - ox) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /**
   * Close the viewer panel
   */
  function closeViewer() {
    if (threeViewer) {
      threeViewer.dispose();
      threeViewer = null;
    }
    if (testUI) {
      testUI.dispose();
      testUI = null;
    }
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
      modal = null;
    }
    isOpen = false;
    if (onClose) onClose();
  }

  // Return Origo component
  return Origo.ui.Component({
    name: 'viewerPlugin',
    
    onInit() {
      if (showButton) {
        viewerButton = Origo.ui.Button({
          cls: 'o-viewer-plugin padding-small icon-smaller round light box-shadow',
          click() {
            if (isOpen) {
              closeViewer();
            } else {
              openViewer();
            }
          },
          icon,
          tooltipText,
          tooltipPlacement: 'east'
        });
      }

      if (showParameterPanel) {
        paramButton = Origo.ui.Button({
          cls: 'o-viewer-param-panel padding-small icon-smaller round light box-shadow',
          click() {
            setParamPanelVisible(!isPanelVisible);
          },
          icon: parameterPanelIcon,
          tooltipText: parameterPanelTitle,
          tooltipPlacement: 'east'
        });
      }
    },
    
    onAdd(evt) {
      origoViewer = evt.target;
      self = this;
      const components = [];
      if (showButton) components.push(viewerButton);
      if (showParameterPanel) components.push(paramButton);
      this.addComponents(components);
      this.render();
    },
    
    render() {
      const navId = origoViewer.getMain().getNavigation().getId();

      if (showButton) {
        const el = Origo.ui.dom.html(viewerButton.render());
        document.getElementById(navId).appendChild(el);
      }

      if (showParameterPanel) {
        const paramEl = Origo.ui.dom.html(paramButton.render());
        document.getElementById(navId).appendChild(paramEl);
        createParameterPanel(origoViewer.getMain().getId());
      }

      this.dispatch('render');
    },

    // Public API for external integration
    
    /**
     * Load a file into the viewer (from external search tool)
     * @param {string} projID - Project ID
     * @param {string} fName - File name
     */
    loadFile(projID, fName) {
      if (!isOpen) {
        openViewer(projID, fName);
      } else {
        loadFile(projID, fName);
      }
    },

    /**
     * Download original file
     * @param {string} projID - Project ID
     * @param {string} fName - File name
     */
    downloadFile(projID, fName) {
      downloadFile(projID, fName);
    },

    /**
     * Open the viewer
     * @param {string} projID - Optional project ID
     * @param {string} fName - Optional file name
     */
    open(projID = null, fName = null) {
      openViewer(projID, fName);
    },

    /**
     * Open current model in a new fullscreen tab (no map)
     * @param {string} projID - Optional project ID
     * @param {string} fName - Optional file name
     */
    openInNewTab(projID = null, fName = null) {
      openInNewTab(projID, fName);
    },

    /**
     * Show the current model in the 3D map (Globe/Cesium)
     * Requires globeActive option to be true
     */
    showInMap() {
      if (!globeActive) {
        console.warn('[ViewerPlugin] showInMap requires globeActive option to be true');
        return;
      }
      showInMap();
    },

    /**
     * Get current geo headers from the loaded file
     * @returns {{epsg: string|null, translation: number[]|null, position: number[]|null}|null}
     */
    getGeoHeaders() {
      return currentGeoHeaders;
    },

    /**
     * Close the viewer
     */
    close() {
      closeViewer();
    },

    /**
     * Check if viewer is open
     * @returns {boolean}
     */
    isOpen() {
      return isOpen;
    },

    /**
     * Get the Three.js viewer instance
     * @returns {ThreeViewer|null}
     */
    getViewer() {
      return threeViewer;
    },

    /**
     * Update configuration
     * @param {object} newConfig - Configuration to merge
     */
    updateConfig(newConfig) {
      updateConfig(newConfig);
    },

    /**
     * Set API base URL
     * @param {string} url - New base URL
     */
    setApiBaseUrl(url) {
      setApiBaseUrl(url);
    }
  });
};

// Export utilities for direct usage
export { 
  ThreeViewer, 
  TestUI, 
  fetchViewerFile, 
  downloadOriginalFile,
  FileType,
  buildViewerUrl,
  buildDownloadUrl,
  setApiBaseUrl,
  getConfig,
  updateConfig
};

export default ViewerPlugin;
