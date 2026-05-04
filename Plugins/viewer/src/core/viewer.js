/**
 * Three.js Viewer Core
 * Main 3D viewer implementation
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import DxfParser from 'dxf-parser';
import { getConfig } from './config';
import { FileType } from './fileLoader';

/**
 * ThreeViewer class - manages the 3D scene
 */
export class ThreeViewer {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' 
      ? document.getElementById(container) 
      : container;
    
    if (!this.container) {
      throw new Error('Viewer container not found');
    }

    const config = getConfig();
    this.options = { ...config.viewer, ...options };
    
    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.loadedModel = null;
    this.grid = null;
    this.axes = null;

    // View mode: '3d' | '2d'
    this.viewMode = '3d';
    
    // Loaders
    this.gltfLoader = null;
    this.dracoLoader = null;
    
    // Animation
    this.animationId = null;
    this.isAnimating = false;
    
    // Event callbacks
    this.onLoadSuccess = null;
    this.onLoadError = null;
    this.onLoadProgress = null;
    
    this.init();
  }

  /**
   * Initialize the Three.js scene
   */
  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();
    this.setupLights();
    this.setupHelpers();
    this.setupLoaders();
    this.setupResizeHandler();
    this.startAnimation();
  }

  /**
   * Setup the scene
   */
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);
  }

  /**
   * Setup the camera
   */
  setupCamera() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(
      this.options.cameraFov,
      w / h,
      this.options.cameraNear,
      this.options.cameraFar
    );
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);

    // Orthographic camera (shared, swapped in for 2D mode)
    this.cameraOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 1e6);
    this.cameraOrtho.position.set(0, 0, 100);
    this.cameraOrtho.lookAt(0, 0, 0);
  }

  /**
   * Setup the renderer
   */
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true
    });
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * Setup orbit controls
   */
  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1000;
    this.controls.maxPolarAngle = Math.PI;
  }
  /**
   * Switch between '2d' (orthographic, top-down, no rotation) and '3d' (perspective, full orbit).
   * @param {'2d'|'3d'} mode
   */
  setViewMode(mode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;

    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);

    if (mode === '2d') {
      // Sync ortho frustum to current perspective view distance
      const box = this.loadedModel
        ? new THREE.Box3().setFromObject(this.loadedModel)
        : new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10));
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const halfW = Math.max(size.x, size.y * (w / h)) / 2;
      const halfH = halfW / (w / h);
      this.cameraOrtho.left = -halfW;
      this.cameraOrtho.right = halfW;
      this.cameraOrtho.top = halfH;
      this.cameraOrtho.bottom = -halfH;
      this.cameraOrtho.near = -size.z * 100 - 1000;
      this.cameraOrtho.far = size.z * 100 + 1000;
      this.cameraOrtho.position.set(center.x, center.y, 1000);
      this.cameraOrtho.lookAt(center.x, center.y, 0);
      this.cameraOrtho.updateProjectionMatrix();

      // Swap controls to ortho camera
      this.controls.object = this.cameraOrtho;
      this.controls.target.set(center.x, center.y, 0);
      this.controls.enableRotate = false;
      this.controls.screenSpacePanning = true;
      this.controls.update();

      this.camera = this.cameraOrtho;
    } else {
      // Restore perspective camera
      const perspCamera = new THREE.PerspectiveCamera(
        this.options.cameraFov, w / h,
        this.options.cameraNear, this.options.cameraFar
      );
      // Position it so the model is visible
      if (this.loadedModel) {
        const box = new THREE.Box3().setFromObject(this.loadedModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        perspCamera.position.copy(center).add(
          new THREE.Vector3(maxDim * 1.2, maxDim * 0.8, maxDim * 1.2)
        );
        perspCamera.lookAt(center);
        perspCamera.near = maxDim * 0.001;
        perspCamera.far = maxDim * 200;
        perspCamera.updateProjectionMatrix();
        this.controls.target.copy(center);
      } else {
        perspCamera.position.set(10, 10, 10);
        perspCamera.lookAt(0, 0, 0);
      }

      this.controls.object = perspCamera;
      this.controls.enableRotate = true;
      this.controls.maxPolarAngle = Math.PI;
      this.controls.update();

      this.camera = perspCamera;
    }

    if (this.onViewModeChange) this.onViewModeChange(this.viewMode);
  }

  /**
   * Toggle between 2D and 3D mode
   */
  toggleViewMode() {
    this.setViewMode(this.viewMode === '3d' ? '2d' : '3d');
  }

  /**
   * Point the orthographic camera at a named direction.
   * Switches to 2D mode if needed.
   * @param {'top'|'bottom'|'front'|'back'|'left'|'right'} direction
   */
  setOrthoView(direction) {
    // Make sure we are in 2D mode (switch if needed; skip early-return if already 2D)
    if (this.viewMode !== '2d') {
      this.setViewMode('2d');
    }

    // For DXF files use stored header extents — Box3.setFromObject is unreliable due to outlier geometry
    if (this._dxfExtentSize) {
      const { x: sizeX, y: sizeY } = this._dxfExtentSize;
      const w = Math.max(this.container.clientWidth, 1);
      const h = Math.max(this.container.clientHeight, 1);
      const aspect = w / h;
      const dist = Math.max(sizeX, sizeY) * 10 + 1000;

      // DXF is flat in the XY plane — d1/d2 are the two dimensions that fill the viewport
      // for each view direction (Z extent is ~0 so top/bottom/left/right use the plan dimensions)
      const dxfPresets = {
        front:  { pos: [0, 0,  dist], up: [0,  1, 0], d1: sizeX, d2: sizeY },
        back:   { pos: [0, 0, -dist], up: [0,  1, 0], d1: sizeX, d2: sizeY },
        top:    { pos: [0,  dist, 0], up: [0,  0,-1], d1: sizeX, d2: sizeX },
        bottom: { pos: [0, -dist, 0], up: [0,  0, 1], d1: sizeX, d2: sizeX },
        right:  { pos: [ dist, 0, 0], up: [0,  1, 0], d1: sizeY, d2: sizeY },
        left:   { pos: [-dist, 0, 0], up: [0,  1, 0], d1: sizeY, d2: sizeY },
      };
      const p = dxfPresets[direction] || dxfPresets.front;
      const halfH = (Math.max(p.d1 / aspect, p.d2) / 2 || 10) * 1.15;
      const halfW = halfH * aspect;

      this.cameraOrtho.left   = -halfW;
      this.cameraOrtho.right  =  halfW;
      this.cameraOrtho.top    =  halfH;
      this.cameraOrtho.bottom = -halfH;
      this.cameraOrtho.near   = -dist * 2;
      this.cameraOrtho.far    =  dist * 2;
      this.cameraOrtho.up.set(...p.up);
      this.cameraOrtho.position.set(...p.pos);
      this.cameraOrtho.lookAt(0, 0, 0);
      this.cameraOrtho.updateProjectionMatrix();
      this.camera = this.cameraOrtho;
      this.controls.object = this.cameraOrtho;
      this.controls.target.set(0, 0, 0);
      this.controls.enableRotate = false;
      this.controls.screenSpacePanning = true;
      this.controls.update();
      return;
    }

    const box = this.loadedModel
      ? new THREE.Box3().setFromObject(this.loadedModel)
      : new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    const aspect = w / h;
    const dist = Math.max(size.x, size.y, size.z) * 100 + 1000;

    // Each preset: camera position, camera up-vector, and the two dimensions that fill the viewport
    const presets = {
      top:    { pos: [center.x, center.y + dist, center.z], up: [0, 0, -1], d1: size.x, d2: size.z },
      bottom: { pos: [center.x, center.y - dist, center.z], up: [0, 0,  1], d1: size.x, d2: size.z },
      front:  { pos: [center.x, center.y, center.z + dist], up: [0, 1,  0], d1: size.x, d2: size.y },
      back:   { pos: [center.x, center.y, center.z - dist], up: [0, 1,  0], d1: size.x, d2: size.y },
      right:  { pos: [center.x + dist, center.y, center.z], up: [0, 1,  0], d1: size.z, d2: size.y },
      left:   { pos: [center.x - dist, center.y, center.z], up: [0, 1,  0], d1: size.z, d2: size.y },
    };

    const p = presets[direction];
    if (!p) return;

    const halfH = (Math.max(p.d1 / aspect, p.d2) / 2 || 10) * 1.15;
    const halfW = halfH * aspect;

    this.cameraOrtho.left   = -halfW;
    this.cameraOrtho.right  =  halfW;
    this.cameraOrtho.top    =  halfH;
    this.cameraOrtho.bottom = -halfH;
    this.cameraOrtho.near   = -dist * 2;
    this.cameraOrtho.far    =  dist * 2;
    this.cameraOrtho.up.set(...p.up);
    this.cameraOrtho.position.set(...p.pos);
    this.cameraOrtho.lookAt(center);
    this.cameraOrtho.updateProjectionMatrix();

    this.camera = this.cameraOrtho;
    this.controls.object = this.cameraOrtho;
    this.controls.target.copy(center);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = true;
    this.controls.update();
  }

  /**
   * Setup lights
   */
  setupLights() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(
      this.options.ambientLightColor,
      this.options.ambientLightIntensity
    );
    this.scene.add(ambientLight);

    // Main directional light
    const directionalLight = new THREE.DirectionalLight(
      this.options.directionalLightColor,
      this.options.directionalLightIntensity
    );
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);

    // Hemisphere light for natural lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);
  }

  /**
   * Setup helpers (grid, axes)
   */
  setupHelpers() {
    if (this.options.showGrid) {
      this.grid = new THREE.GridHelper(
        this.options.gridSize,
        this.options.gridDivisions,
        0x888888,
        0xcccccc
      );
      this.scene.add(this.grid);
    }

    if (this.options.showAxes) {
      this.axes = new THREE.AxesHelper(5);
      this.scene.add(this.axes);
    }
  }

  /**
   * Setup file loaders
   */
  setupLoaders() {
    // DRACO decoder for compressed GLB
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    
    // GLTF/GLB loader
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  /**
   * Setup resize handler
   */
  setupResizeHandler() {
    const doResize = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;

      if (this.viewMode === '2d' && this.camera.isOrthographicCamera) {
        const aspect = width / height;
        const halfH = (this.camera.top - this.camera.bottom) / 2;
        const halfW = halfH * aspect;
        this.camera.left = -halfW;
        this.camera.right = halfW;
      } else {
        this.camera.aspect = width / height;
      }
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    this.resizeHandler = () => {
      requestAnimationFrame(doResize);
    };

    window.addEventListener('resize', this.resizeHandler);
    
    // Also use ResizeObserver for container changes
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(this.container);
    }
  }

  /**
   * Force renderer and camera to match current container size.
   * Call this after the container becomes visible or is resized programmatically.
   */
  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    if (this.viewMode === '2d' && this.camera.isOrthographicCamera) {
      const aspect = width / height;
      const halfH = (this.camera.top - this.camera.bottom) / 2 || 10;
      const halfW = halfH * aspect;
      this.camera.left = -halfW;
      this.camera.right = halfW;
    } else {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    return width > 1;
  }

  /**
   * Start animation loop
   */
  startAnimation() {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    const animate = () => {
      if (!this.isAnimating) return;
      
      this.animationId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  /**
   * Stop animation loop
   */
  stopAnimation() {
    this.isAnimating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Load a model from ArrayBuffer
   * @param {ArrayBuffer} data - File data
   * @param {string} fileType - Type of file (glb, dxf)
   * @returns {Promise<THREE.Object3D>}
   */
  async loadModel(data, fileType) {
    // Clear existing model
    this.clearModel();

    switch (fileType) {
      case FileType.GLB:
      case FileType.GLTF:
        this.setViewMode('3d');
        return this.loadGLB(data);
      case FileType.DXF:
        this.setViewMode('2d');
        return this.loadDXF(data);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Load GLB/GLTF model
   * @param {ArrayBuffer} data - GLB file data
   * @returns {Promise<THREE.Object3D>}
   */
  loadGLB(data) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        data,
        '',
        (gltf) => {
          this.loadedModel = gltf.scene;
          
          // Process model
          this.loadedModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Ensure proper material rendering
              if (child.material) {
                child.material.side = THREE.DoubleSide;
              }
            }
          });

          // Center model at origin so camera fitting works regardless of source coordinates
          const boundingBox = new THREE.Box3().setFromObject(this.loadedModel);
          const modelCenter = boundingBox.getCenter(new THREE.Vector3());
          this.loadedModel.position.sub(modelCenter);
          // Force matrix update so fitCameraToModel uses correct world positions
          this.loadedModel.updateMatrixWorld(true);

          this.scene.add(this.loadedModel);
          this.fitCameraToModel(this.loadedModel);
          
          if (this.onLoadSuccess) {
            this.onLoadSuccess(this.loadedModel);
          }
          
          resolve(this.loadedModel);
        },
        (error) => {
          console.error('Error loading GLB:', error);
          if (this.onLoadError) {
            this.onLoadError(error);
          }
          reject(error);
        }
      );
    });
  }

  /**
   * Load DXF file
   * @param {ArrayBuffer} data - DXF file data
   * @returns {Promise<THREE.Object3D>}
   */
  async loadDXF(data) {
    const decoder = new TextDecoder('utf-8');
    const dxfText = decoder.decode(data);

    const parser = new DxfParser();
    let dxf;
    try {
      dxf = parser.parseSync(dxfText);
    } catch (e) {
      throw new Error(`DXF parse error: ${e.message}`);
    }

    const group = new THREE.Group();

    // Build a layer → color map from the TABLES section
    const layerColors = {};
    if (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) {
      for (const [name, layer] of Object.entries(dxf.tables.layer.layers)) {
        layerColors[name] = this._dxfAciToHex(layer.color);
      }
    }

    // Log entity types to help diagnose missing geometry
    const _types = [...new Set((dxf.entities || []).map(e => e.type))].sort();
    console.log('[DXF] Entity types in model space:', _types.join(', '));

    this._processDxfEntities(dxf.entities || [], dxf.blocks || {}, group, layerColors);
    // Parse HATCH fill entities from raw text (dxf-parser does not support HATCH)
    this._parseAndRenderHatch(dxfText, layerColors, group);

    if (group.children.length === 0) {
      console.warn('[DXF] No geometry produced');
    }

    // Use DXF header $EXTMIN/$EXTMAX for robust centering — avoids outlier geometry
    // (Box3.setFromObject is unreliable when a single bad entity is 100+ km off-screen)
    const ext = this._parseDxfExtents(dxfText);
    if (ext) {
      const cx = (ext.min.x + ext.max.x) / 2;
      const cy = (ext.min.y + ext.max.y) / 2;
      group.position.set(-cx, -cy, 0);
      // Store so fitCameraToModel / resetCamera use same bounds instead of Box3
      this._dxfExtentSize = { x: ext.max.x - ext.min.x, y: ext.max.y - ext.min.y };
    } else {
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      group.position.sub(center);
      this._dxfExtentSize = null;
    }
    group.updateMatrixWorld(true);

    this.loadedModel = group;
    this.scene.add(this.loadedModel);
    this.fitCameraToModel(this.loadedModel);

    if (this.onLoadSuccess) this.onLoadSuccess(this.loadedModel);
    return this.loadedModel;
  }

  _processDxfEntities(entities, blocks, group, layerColors, layerOverride = null, depth = 0) {
    if (depth > 8) return;
    const ARC_SEGS = 64;

    const getMat = (entity) => {
      const layer = (entity.layer === '0' && layerOverride) ? layerOverride : entity.layer;
      return new THREE.LineBasicMaterial({ color: layerColors[layer] ?? 0x222222 });
    };

    for (const entity of entities) {
      try {
        switch (entity.type) {

          case 'LINE': {
            // dxf-parser stores LINE geometry in vertices[0] and vertices[1]
            const vv = entity.vertices || [];
            const s = vv[0] || {};
            const e = vv[1] || {};
            if (isNaN(s.x) || isNaN(s.y) || isNaN(e.x) || isNaN(e.y)) break;
            group.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(s.x, s.y, s.z || 0),
                new THREE.Vector3(e.x, e.y, e.z || 0)
              ]), getMat(entity)));
            break;
          }

          case 'POLYLINE':
          case 'LWPOLYLINE': {
            const verts = entity.vertices || [];
            if (verts.length < 2) break;
            const pts = [];
            for (let i = 0; i < verts.length; i++) {
              const v = verts[i];
              if (isNaN(v.x) || isNaN(v.y)) continue;
              const vNext = verts[(i + 1) % verts.length];
              pts.push(new THREE.Vector3(v.x, v.y, v.z || 0));
              const bulge = v.bulge;
              if (bulge && Math.abs(bulge) > 0.01 && i < verts.length - 1 && !isNaN(vNext.x) && !isNaN(vNext.y)) {
                pts.push(...this._bulgeToArcPoints(v.x, v.y, vNext.x, vNext.y, bulge, ARC_SEGS)
                  .filter(p => !isNaN(p.x) && !isNaN(p.y)));
              }
            }
            if (pts.length < 2) break;
            if (entity.closed || entity.shape) pts.push(pts[0].clone());
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), getMat(entity)));
            break;
          }

          case 'ARC': {
            const c = entity.center || {};
            const r = entity.radius;
            if (!r || isNaN(r) || isNaN(c.x) || isNaN(c.y)) break;
            const { x = 0, y = 0, z = 0 } = c;
            const pts = [];
            // dxf-parser pre-converts angles to radians — do NOT multiply by π/180
            let start = entity.startAngle ?? 0;
            let end = entity.endAngle ?? (Math.PI * 2);
            // ARCs always go CCW; if end < start wrap around
            if (end <= start) end += Math.PI * 2;
            for (let i = 0; i <= ARC_SEGS; i++) {
              const a = start + (end - start) * (i / ARC_SEGS);
              pts.push(new THREE.Vector3(x + r * Math.cos(a), y + r * Math.sin(a), z));
            }
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), getMat(entity)));
            break;
          }

          case 'CIRCLE': {
            const c = entity.center || {};
            const r = entity.radius;
            if (!r || isNaN(r) || isNaN(c.x) || isNaN(c.y)) break;
            const { x = 0, y = 0, z = 0 } = c;
            const pts = [];
            for (let i = 0; i <= ARC_SEGS; i++) {
              const a = (i / ARC_SEGS) * Math.PI * 2;
              pts.push(new THREE.Vector3(x + r * Math.cos(a), y + r * Math.sin(a), z));
            }
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), getMat(entity)));
            break;
          }

          case 'ELLIPSE': {
            const ec = entity.center || {};
            const em = entity.majorAxisEndPoint || {};
            const cx = ec.x ?? 0, cy = ec.y ?? 0, cz = ec.z || 0;
            const mx = em.x ?? 0, my = em.y ?? 0;
            if (isNaN(cx) || isNaN(cy) || isNaN(mx) || isNaN(my)) break;
            const a = Math.sqrt(mx * mx + my * my);
            const b = a * (entity.axisRatio || 1);
            if (!a || isNaN(a)) break;
            const rot = Math.atan2(my, mx);
            const s = entity.startAngle || 0;
            const e = entity.endAngle || Math.PI * 2;
            const pts = [];
            for (let i = 0; i <= ARC_SEGS; i++) {
              const t = s + (e - s) * (i / ARC_SEGS);
              const lx = a * Math.cos(t), ly = b * Math.sin(t);
              pts.push(new THREE.Vector3(
                cx + lx * Math.cos(rot) - ly * Math.sin(rot),
                cy + lx * Math.sin(rot) + ly * Math.cos(rot),
                cz
              ));
            }
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), getMat(entity)));
            break;
          }

          case 'SPLINE': {
            if (entity.controlPoints && entity.controlPoints.length >= 2) {
              const validPts = entity.controlPoints
                .map(p => new THREE.Vector3(p.x, p.y, p.z || 0))
                .filter(p => !isNaN(p.x) && !isNaN(p.y));
              if (validPts.length < 2) break;
              const pts = new THREE.CatmullRomCurve3(validPts).getPoints(ARC_SEGS * validPts.length);
              group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), getMat(entity)));
            }
            break;
          }

          case 'TEXT': {
            const p = entity.startPoint || {};
            if (isNaN(p.x) || isNaN(p.y)) break;
            const content = entity.text || '';
            if (!content.trim()) break;
            const h = entity.textHeight || 1;
            const rot = (entity.rotation || 0) * Math.PI / 180;

            // Resolve color: entity ACI overrides layer color
            const aci = entity.colorIndex;
            let color = layerColors[entity.layer] ?? 0x222222;
            if (aci && aci !== 256) color = this._dxfAciToHex(aci);

            // Draw text to canvas, use as texture
            const PX = 64;
            const cvs = document.createElement('canvas');
            const ctx = cvs.getContext('2d');
            ctx.font = `${PX}px sans-serif`;
            const tw = ctx.measureText(content).width;
            cvs.width = Math.ceil(tw) + 4;
            cvs.height = PX + 4;
            ctx.font = `${PX}px sans-serif`; // reset after resize
            const cr = (color >> 16) & 0xff, cg = (color >> 8) & 0xff, cb = color & 0xff;
            ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
            ctx.fillText(content, 2, PX);

            const tex = new THREE.CanvasTexture(cvs);
            const W = h * (cvs.width / cvs.height);
            const H = h;
            const mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(W, H),
              new THREE.MeshBasicMaterial({
                map: tex, transparent: true, alphaTest: 0.01,
                side: THREE.DoubleSide, depthTest: false
              })
            );
            // Shift plane center so startPoint aligns with bottom-left of text
            mesh.position.set(
              p.x + (W / 2) * Math.cos(rot) - (H / 2) * Math.sin(rot),
              p.y + (W / 2) * Math.sin(rot) + (H / 2) * Math.cos(rot),
              (p.z || 0) + 0.01
            );
            mesh.rotation.z = rot;
            group.add(mesh);
            break;
          }

          case 'POINT': {
            const p = entity.position || {};
            if (isNaN(p.x) || isNaN(p.y)) break;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, p.z || 0], 3));
            group.add(new THREE.Points(geo, new THREE.PointsMaterial({
              color: getMat(entity).color, size: 4, sizeAttenuation: false
            })));
            break;
          }

          case 'SOLID':
          case '3DFACE': {
            const corners = entity.vertices || entity.corners;
            if (!corners || corners.length < 3) break;
            const validPts = corners
              .filter(p => p && !isNaN(p.x) && !isNaN(p.y))
              .map(p => new THREE.Vector3(p.x, p.y, p.z || 0));
            if (validPts.length < 3) break;
            // DXF SOLID stores vertices in Z-order — swap last two to get correct winding
            if (entity.type === 'SOLID' && validPts.length === 4) {
              [validPts[2], validPts[3]] = [validPts[3], validPts[2]];
            }
            validPts.push(validPts[0].clone());
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(validPts), getMat(entity)));
            break;
          }

          case 'INSERT': {
            const blockName = entity.name;
            // Skip special AutoCAD model/paper space pseudo-blocks
            if (!blockName || blockName.startsWith('*')) break;
            const block = blocks[blockName];
            if (!block) break;

            // Build content group; offset by negative base point so block origin = (0,0,0)
            const contentGroup = new THREE.Group();
            const bp = block.basePoint || {};
            contentGroup.position.set(-(bp.x || 0), -(bp.y || 0), -(bp.z || 0));
            // Layer "0" entities in a block inherit the INSERT entity's layer
            this._processDxfEntities(
              block.entities || [], blocks, contentGroup, layerColors,
              entity.layer || layerOverride, depth + 1
            );

            const blockGroup = new THREE.Group();
            blockGroup.add(contentGroup);
            const pos = entity.position || {};
            blockGroup.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
            blockGroup.scale.set(entity.xScale ?? 1, entity.yScale ?? 1, entity.zScale ?? 1);
            if (entity.rotation) blockGroup.rotation.z = entity.rotation * Math.PI / 180;

            // Handle array (MINSERT) repetitions
            const cols = entity.columnCount || 1;
            const rows = entity.rowCount || 1;
            if (cols > 1 || rows > 1) {
              const colSpacing = entity.columnSpacing || 0;
              const rowSpacing = entity.rowSpacing || 0;
              for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                  const inst = (row === 0 && col === 0) ? blockGroup : blockGroup.clone();
                  inst.position.x = blockGroup.position.x + col * colSpacing;
                  inst.position.y = blockGroup.position.y + row * rowSpacing;
                  group.add(inst);
                }
              }
            } else {
              group.add(blockGroup);
            }
            break;
          }

          default:
            break;
        }
      } catch (entityErr) {
        console.warn('[DXF] Skipped entity', entity.type, entityErr.message);
      }
    }
  }

  /**
   * Parse HATCH entities from raw DXF text and render as filled meshes.
   * dxf-parser silently discards HATCH — this reads them directly.
   */
  _parseAndRenderHatch(rawText, layerColors, parentGroup) {
    // Build flat [code, value] pair array from alternating DXF lines
    const lines = rawText.split(/\r?\n/);
    const grps = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const c = parseInt(lines[i].trim(), 10);
      if (!isNaN(c)) grps.push([c, lines[i + 1].trim()]);
    }
    const ng = grps.length;
    let gi = 0;

    // Skip to ENTITIES section
    while (gi < ng && !(grps[gi][0] === 0 && grps[gi][1] === 'SECTION')) gi++;
    while (gi < ng && !(grps[gi][0] === 2 && grps[gi][1] === 'ENTITIES')) gi++;
    gi++;

    while (gi < ng) {
      if (grps[gi][0] !== 0) { gi++; continue; }
      if (grps[gi][1] === 'ENDSEC') break;
      if (grps[gi][1] !== 'HATCH') { gi++; continue; }
      gi++; // consume "0 HATCH"

      let layer = '0', aci = 256;
      const boundaries = [];

      // Read header fields until code 91 (number of boundary paths)
      while (gi < ng && grps[gi][0] !== 0 && grps[gi][0] !== 91) {
        if (grps[gi][0] === 8)  layer = grps[gi][1];
        if (grps[gi][0] === 62) aci = parseInt(grps[gi][1], 10);
        gi++;
      }
      if (gi >= ng || grps[gi][0] !== 91) continue;

      const numPaths = parseInt(grps[gi][1], 10);
      gi++; // consume code 91

      for (let b = 0; b < numPaths; b++) {
        // Read boundary header: codes 92 (typeFlag), 72 (hasBulge), 73 (isClosed), until 93 (numVerts)
        let typeFlag = 0, hasBulge = false, isClosed = true;
        while (gi < ng && grps[gi][0] !== 93 && grps[gi][0] !== 0) {
          if (grps[gi][0] === 92) typeFlag  = parseInt(grps[gi][1], 10);
          if (grps[gi][0] === 72) hasBulge  = grps[gi][1].trim() === '1';
          if (grps[gi][0] === 73) isClosed  = grps[gi][1].trim() !== '0';
          gi++;
        }
        if (gi >= ng || grps[gi][0] !== 93) break;
        const numVerts = parseInt(grps[gi][1], 10);
        gi++; // consume code 93

        // Only handle polyline boundaries (bit 1 of typeFlag) or edge-type boundaries
        if (!(typeFlag & 2)) {
          // Edge-type boundary: numVerts = number of edges
          // Each edge starts with code 72 (edge type: 1=LINE, 2=ARC, 3=ELLIPSE, 4=SPLINE)
          const pts = [];
          for (let e = 0; e < numVerts; e++) {
            if (gi >= ng || grps[gi][0] !== 72) break;
            const edgeType = parseInt(grps[gi][1], 10); gi++;
            if (edgeType === 1) {
              // LINE: 10=x1, 20=y1, 11=x2, 21=y2
              let ex1=0,ey1=0,ex2=0,ey2=0;
              while (gi < ng && grps[gi][0] !== 72 && grps[gi][0] !== 97 && grps[gi][0] !== 92 && grps[gi][0] !== 0) {
                if (grps[gi][0] === 10) ex1 = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 20) ey1 = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 11) ex2 = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 21) ey2 = parseFloat(grps[gi][1]);
                gi++;
              }
              if (e === 0) pts.push(new THREE.Vector2(ex1, ey1));
              pts.push(new THREE.Vector2(ex2, ey2));
            } else if (edgeType === 2) {
              // ARC: 10=cx, 20=cy, 40=radius, 50=startAngleDeg, 51=endAngleDeg, 73=ccw
              let acx=0,acy=0,ar=0,sa=0,ea=Math.PI*2,ccw=1;
              while (gi < ng && grps[gi][0] !== 72 && grps[gi][0] !== 97 && grps[gi][0] !== 92 && grps[gi][0] !== 0) {
                if (grps[gi][0] === 10) acx = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 20) acy = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 40) ar  = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 50) sa  = parseFloat(grps[gi][1]) * Math.PI / 180;
                else if (grps[gi][0] === 51) ea  = parseFloat(grps[gi][1]) * Math.PI / 180;
                else if (grps[gi][0] === 73) ccw = parseInt(grps[gi][1], 10);
                gi++;
              }
              let sweep = ccw ? ea - sa : sa - ea;
              if (sweep <= 0) sweep += Math.PI * 2;
              const aSegs = Math.max(3, Math.ceil(sweep / (Math.PI / 2) * 16));
              const startA = ccw ? sa : ea;
              const dir = ccw ? 1 : -1;
              for (let i = 0; i <= aSegs; i++) {
                const a = startA + dir * sweep * (i / aSegs);
                pts.push(new THREE.Vector2(acx + ar * Math.cos(a), acy + ar * Math.sin(a)));
              }
            } else if (edgeType === 3) {
              // ELLIPSE ARC: 10=cx, 20=cy, 11=majorX, 21=majorY, 40=axisRatio, 50=startParam, 51=endParam, 73=ccw
              let ecx=0,ecy=0,emx=1,emy=0,ratio=1,ep0=0,ep1=Math.PI*2,eccw=1;
              while (gi < ng && grps[gi][0] !== 72 && grps[gi][0] !== 97 && grps[gi][0] !== 92 && grps[gi][0] !== 0) {
                if (grps[gi][0] === 10) ecx   = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 20) ecy   = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 11) emx   = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 21) emy   = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 40) ratio = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 50) ep0   = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 51) ep1   = parseFloat(grps[gi][1]);
                else if (grps[gi][0] === 73) eccw  = parseInt(grps[gi][1], 10);
                gi++;
              }
              const eMajor = Math.sqrt(emx * emx + emy * emy);
              const eRot = Math.atan2(emy, emx);
              let eSweep = eccw ? ep1 - ep0 : ep0 - ep1;
              if (eSweep <= 0) eSweep += Math.PI * 2;
              const eSegs = Math.max(3, Math.ceil(eSweep / (Math.PI / 2) * 16));
              const eStart = eccw ? ep0 : ep1;
              const eDir = eccw ? 1 : -1;
              for (let i = 0; i <= eSegs; i++) {
                const t = eStart + eDir * eSweep * (i / eSegs);
                const lx = eMajor * Math.cos(t), ly = eMajor * ratio * Math.sin(t);
                pts.push(new THREE.Vector2(
                  ecx + lx * Math.cos(eRot) - ly * Math.sin(eRot),
                  ecy + lx * Math.sin(eRot) + ly * Math.cos(eRot)
                ));
              }
            } else {
              // SPLINE (edgeType === 4) or unknown — skip to next edge
              while (gi < ng && grps[gi][0] !== 72 && grps[gi][0] !== 97 && grps[gi][0] !== 92 && grps[gi][0] !== 0) gi++;
            }
          }
          // Consume source boundary handles
          if (gi < ng && grps[gi][0] === 97) {
            const cnt = parseInt(grps[gi][1], 10); gi++;
            for (let k = 0; k < cnt; k++) { if (gi < ng && grps[gi][0] === 330) gi++; }
          }
          if (pts.length >= 3) boundaries.push(pts);
          continue;
        }

        // Read vertex data (code 10 = x, 20 = y, optionally 42 = bulge)
        const rawVerts = [];
        for (let v = 0; v < numVerts; v++) {
          let x = 0, y = 0, bulge = 0;
          if (gi < ng && grps[gi][0] === 10) { x = parseFloat(grps[gi][1]); gi++; }
          if (gi < ng && grps[gi][0] === 20) { y = parseFloat(grps[gi][1]); gi++; }
          if (hasBulge && gi < ng && grps[gi][0] === 42) { bulge = parseFloat(grps[gi][1]); gi++; }
          rawVerts.push({ x, y, bulge });
        }

        // Skip source boundary object handles (code 97 + N × code 330)
        if (gi < ng && grps[gi][0] === 97) {
          const cnt = parseInt(grps[gi][1], 10); gi++;
          for (let k = 0; k < cnt; k++) { if (gi < ng && grps[gi][0] === 330) gi++; }
        }

        // Expand bulge segments into arc points.
        // Rule: push the vertex, then if it has a bulge expand intermediate arc
        // points (excluding the endpoint — the next iteration will push that vertex).
        // Handle closing bulge (last vert → first vert) specially.
        const pts = [];
        for (let v = 0; v < rawVerts.length; v++) {
          const rv = rawVerts[v];
          if (!isNaN(rv.x) && !isNaN(rv.y)) pts.push(new THREE.Vector2(rv.x, rv.y));
          if (Math.abs(rv.bulge) > 0.01) {
            // For closing bulge (last vert), the target is the first vert
            const rn = (v < rawVerts.length - 1) ? rawVerts[v + 1] : rawVerts[0];
            const sweep = Math.abs(4 * Math.atan(rv.bulge));
            const segs = Math.max(3, Math.ceil(sweep / (Math.PI / 2) * 16));
            // Get intermediate arc points ONLY (exclude final point — handled by next vert push)
            const arcPts = this._bulgeToArcPoints(rv.x, rv.y, rn.x, rn.y, rv.bulge, segs);
            // arcPts already ends at rn; omit the last point to avoid duplication
            arcPts.slice(0, -1)
              .filter(p => !isNaN(p.x) && !isNaN(p.y))
              .forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
          }
        }
        // THREE.Shape closes itself — do NOT push a closing duplicate
        if (pts.length >= 3) boundaries.push(pts);
      }

      // Skip remaining HATCH data (pattern lines, seed points) to next entity
      while (gi < ng && grps[gi][0] !== 0) gi++;

      if (boundaries.length === 0 || boundaries[0].length < 3) continue;

      const color = (aci > 0 && aci < 256)
        ? this._dxfAciToHex(aci)
        : (layerColors[layer] ?? 0x999999);

      // Compute 2D signed area (shoelace) — positive = CCW, negative = CW.
      // Must include the closing edge (last → first) via modulo.
      const signedArea2D = (pts) => {
        let a = 0;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
        }
        return a / 2;
      };

      try {
        // Normalise coordinates — earcut loses precision with large absolute values
        // (SWEREF99 TM ~162000, 6569000). Translate to first-vertex-relative coords
        // and restore with mesh.position so the mesh lands in the right world position.
        const ox = boundaries[0][0].x, oy = boundaries[0][0].y;
        for (const b of boundaries) {
          for (const p of b) { p.x -= ox; p.y -= oy; }
        }

        // THREE.Shape outer boundary must be CCW (positive area) — reverse if CW
        if (signedArea2D(boundaries[0]) < 0) boundaries[0].reverse();
        const shape = new THREE.Shape(boundaries[0]);
        for (let h = 1; h < boundaries.length; h++) {
          if (boundaries[h].length < 3) continue;
          // Holes must be CW (negative area) — reverse if CCW
          if (signedArea2D(boundaries[h]) > 0) boundaries[h].reverse();
          shape.holes.push(new THREE.Path(boundaries[h]));
        }
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshBasicMaterial({
            color, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthTest: false
          })
        );
        mesh.position.set(ox, oy, 0.01);
        mesh.renderOrder = -1; // draw behind line geometry
        parentGroup.add(mesh);
      } catch (err) {
        console.warn('[DXF HATCH] Shape failed:', err.message);
      }
    }
  }

  /**
   * Parse $EXTMIN/$EXTMAX from raw DXF header text.
   * Returns { min: {x,y}, max: {x,y} } or null.
   */
  _parseDxfExtents(rawText) {
    const lines = rawText.split(/\r?\n/);
    let min = null, max = null;
    for (let i = 0; i + 4 < lines.length; i++) {
      const code = lines[i].trim();
      const val  = lines[i + 1]?.trim();
      if (code === '9' && (val === '$EXTMIN' || val === '$EXTMAX')) {
        // Next pairs should be code 10 (x), code 20 (y)
        const c1 = lines[i + 2]?.trim(), v1 = lines[i + 3]?.trim();
        const c2 = lines[i + 4]?.trim(), v2 = lines[i + 5]?.trim();
        if (c1 === '10' && c2 === '20') {
          const x = parseFloat(v1), y = parseFloat(v2);
          if (!isNaN(x) && !isNaN(y)) {
            if (val === '$EXTMIN') min = { x, y };
            else max = { x, y };
          }
        }
      }
      if (min && max) break;
    }
    return (min && max) ? { min, max } : null;
  }

  /** Convert DXF ACI color index to Three.js hex color */
  _dxfAciToHex(aci) {
    if (aci === 7 || aci == null || aci === 256) return 0x222222;
    // Grayscale range (ACI 250-255)
    if (aci >= 250) {
      const gray = [0x080808, 0x363636, 0x636363, 0x909090, 0xbebebe, 0xe5e5e5];
      return gray[aci - 250];
    }
    // Standard ACI palette (0-9)
    const palette = [
      0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff,
      0x0000ff, 0xff00ff, 0xffffff, 0x414141, 0x808080
    ];
    if (aci < palette.length) return palette[aci];
    return 0x444444;
  }

  /** Convert a LWPOLYLINE bulge segment to arc points */
  _bulgeToArcPoints(x1, y1, x2, y2, bulge, segs) {
    const dx = x2 - x1, dy = y2 - y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-10) return [];
    const r = d * (bulge * bulge + 1) / (4 * Math.abs(bulge));
    const s = Math.sign(bulge);
    // Arc center = midpoint of chord + signed offset along left-perpendicular.
    // Left-perpendicular unit vector of chord (dx,dy) is (-dy,dx)/d.
    // For CCW arc (bulge>0) center is to the left; for CW (bulge<0) to the right.
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
    const cx = mx + s * (-dy / d) * h;
    const cy = my + s * (dx / d) * h;
    const startA = Math.atan2(y1 - cy, x1 - cx);
    // sweep = 4*atan(bulge) — exact DXF definition, signed for direction
    const sweep = 4 * Math.atan(bulge);
    const pts = [];
    for (let i = 1; i <= segs; i++) {
      const a = startA + sweep * (i / segs);
      pts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), 0));
    }
    return pts;
  }

  /**
   * Fit camera to show entire model
   * @param {THREE.Object3D} object - Object to fit
   */
  fitCameraToModel(object) {
    // For DXF: use header extents stored at load time — Box3.setFromObject is unreliable
    // when outlier geometry (e.g. a bad ARC 100+ km off-screen) inflates the bounds.
    if (this._dxfExtentSize && this.camera.isOrthographicCamera) {
      const { x: sizeX, y: sizeY } = this._dxfExtentSize;
      const w = Math.max(this.container.clientWidth, 1);
      const h = Math.max(this.container.clientHeight, 1);
      const aspect = w / h;
      const halfH = Math.max(sizeX / aspect, sizeY) / 2 * 1.1;
      const halfW = halfH * aspect;
      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
      this.camera.near = -100000;
      this.camera.far = 100000;
      this.camera.position.set(0, 0, 1000);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      return;
    }

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const isFlat = size.z < maxDim * 0.01;

    if (this.camera.isOrthographicCamera) {
      // Orthographic (2D mode): fit frustum to model bounds
      const w = Math.max(this.container.clientWidth, 1);
      const h = Math.max(this.container.clientHeight, 1);
      const aspect = w / h;
      const halfH = Math.max(size.x / aspect, size.y) / 2 * 1.1;
      const halfW = halfH * aspect;
      this.camera.left = center.x - halfW;
      this.camera.right = center.x + halfW;
      this.camera.top = center.y + halfH;
      this.camera.bottom = center.y - halfH;
      this.camera.near = -size.z * 100 - 1000;
      this.camera.far = size.z * 100 + 1000;
      this.camera.position.set(center.x, center.y, 1000);
      this.camera.lookAt(center.x, center.y, 0);
      this.camera.updateProjectionMatrix();

      this.controls.target.set(center.x, center.y, 0);
      this.controls.update();
    } else {
      // Perspective (3D mode): fov-based distance
      const fov = this.camera.fov * (Math.PI / 180);
      const cameraDistance = Math.max(maxDim / (2 * Math.tan(fov / 2)), 0.1);

      const direction = isFlat
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0.5, 1).normalize();

      this.camera.position.copy(center).add(direction.multiplyScalar(cameraDistance * 1.5));
      this.camera.lookAt(center);

      this.controls.target.copy(center);
      this.controls.update();

      this.camera.near = cameraDistance / 100;
      this.camera.far = cameraDistance * 100;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Clear loaded model from scene
   */
  clearModel() {
    if (this.loadedModel) {
      this.loadedModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.loadedModel);
      this.loadedModel = null;
      this._dxfExtentSize = null;
    }
  }

  /**
   * Reset camera to default position
   */
  resetCamera() {
    if (this.loadedModel) {
      this.fitCameraToModel(this.loadedModel);
    } else if (!this.camera.isOrthographicCamera) {
      this.camera.position.set(10, 10, 10);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  /**
   * Toggle grid visibility
   */
  toggleGrid() {
    if (this.grid) {
      this.grid.visible = !this.grid.visible;
    }
  }

  /**
   * Toggle axes visibility
   */
  toggleAxes() {
    if (this.axes) {
      this.axes.visible = !this.axes.visible;
    }
  }

  /**
   * Set background color
   * @param {number|string} color - Color value
   */
  setBackgroundColor(color) {
    this.scene.background = new THREE.Color(color);
  }

  /**
   * Take screenshot
   * @returns {string} Data URL of screenshot
   */
  takeScreenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /**
   * Get current camera position
   * @returns {THREE.Vector3}
   */
  getCameraPosition() {
    return this.camera.position.clone();
  }

  /**
   * Set camera position
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   */
  setCameraPosition(x, y, z) {
    this.camera.position.set(x, y, z);
    this.controls.update();
  }

  /**
   * Dispose of viewer and clean up resources
   */
  dispose() {
    this.stopAnimation();
    
    // Remove event listeners
    window.removeEventListener('resize', this.resizeHandler);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    // Clear model
    this.clearModel();
    
    // Dispose of helpers
    if (this.grid) {
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    if (this.axes) {
      this.axes.dispose();
    }
    
    // Dispose of controls
    this.controls.dispose();
    
    // Dispose of renderer
    this.renderer.dispose();
    
    // Remove canvas
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    
    // Dispose of loaders
    this.dracoLoader.dispose();
    
    // Clear references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
  }
}

export default ThreeViewer;
