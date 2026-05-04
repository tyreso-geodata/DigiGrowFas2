/**
 * Test UI Module
 * Development test interface with buttons for testing viewer functionality
 */

import config, { buildViewerUrl, buildDownloadUrl } from './config';
import { fetchViewerFile, downloadOriginalFile } from './fileLoader';
import { ThreeViewer } from './viewer';

/**
 * Create test UI for development
 */
export class TestUI {
  constructor(containerId, viewerContainerId) {
    this.container = document.getElementById(containerId);
    this.viewerContainer = document.getElementById(viewerContainerId);
    this.viewer = null;
    this.statusElement = null;
    
    if (!this.container) {
      console.warn(`Test UI container "${containerId}" not found`);
      return;
    }
    
    this.init();
  }

  /**
   * Initialize test UI
   */
  init() {
    this.render();
    this.setupEventListeners();
  }

  /**
   * Render test UI HTML
   */
  render() {
    this.container.innerHTML = `
      <div class="test-ui">
        <h3>Development Test Controls</h3>
        
        <div class="test-ui-params">
          <div class="param-group">
            <label for="test-project-id">Project ID:</label>
            <input type="text" id="test-project-id" value="${config.testParams.projectID}">
          </div>
          <div class="param-group">
            <label for="test-file-name">File Name:</label>
            <input type="text" id="test-file-name" value="${config.testParams.fileName}">
          </div>
        </div>
        
        <div class="test-ui-buttons">
          <button id="btn-open-viewer" class="test-btn primary">
            <span class="icon">👁️</span> Open Viewer
          </button>
          <button id="btn-download" class="test-btn secondary">
            <span class="icon">⬇️</span> Download Original
          </button>
        </div>
        
        <div class="test-ui-utils">
          <button id="btn-reset-camera" class="test-btn small">Reset Camera</button>
          <button id="btn-toggle-grid" class="test-btn small">Toggle Grid</button>
          <button id="btn-toggle-axes" class="test-btn small">Toggle Axes</button>
          <button id="btn-screenshot" class="test-btn small">Screenshot</button>
          <button id="btn-clear" class="test-btn small danger">Clear Viewer</button>
        </div>
        
        <div class="test-ui-urls">
          <p><strong>Viewer URL:</strong> <code id="viewer-url"></code></p>
          <p><strong>Download URL:</strong> <code id="download-url"></code></p>
        </div>
        
        <div class="test-ui-status">
          <div id="status" class="status"></div>
          <div id="progress-bar" class="progress-bar" style="display:none;">
            <div id="progress-fill" class="progress-fill"></div>
          </div>
        </div>
      </div>
    `;
    
    this.statusElement = document.getElementById('status');
    this.updateUrls();
  }

  /**
   * Setup event listeners for buttons
   */
  setupEventListeners() {
    // Input change listeners
    document.getElementById('test-project-id')?.addEventListener('input', () => this.updateUrls());
    document.getElementById('test-file-name')?.addEventListener('input', () => this.updateUrls());
    
    // Button listeners
    document.getElementById('btn-open-viewer')?.addEventListener('click', () => this.openViewer());
    document.getElementById('btn-download')?.addEventListener('click', () => this.downloadFile());
    document.getElementById('btn-reset-camera')?.addEventListener('click', () => this.resetCamera());
    document.getElementById('btn-toggle-grid')?.addEventListener('click', () => this.toggleGrid());
    document.getElementById('btn-toggle-axes')?.addEventListener('click', () => this.toggleAxes());
    document.getElementById('btn-screenshot')?.addEventListener('click', () => this.takeScreenshot());
    document.getElementById('btn-clear')?.addEventListener('click', () => this.clearViewer());
  }

  /**
   * Get current test parameters
   */
  getParams() {
    return {
      projectID: document.getElementById('test-project-id')?.value || config.testParams.projectID,
      fileName: document.getElementById('test-file-name')?.value || config.testParams.fileName
    };
  }

  /**
   * Update URL displays
   */
  updateUrls() {
    const params = this.getParams();
    document.getElementById('viewer-url').textContent = buildViewerUrl(params.projectID, params.fileName);
    document.getElementById('download-url').textContent = buildDownloadUrl(params.projectID, params.fileName);
  }

  /**
   * Set status message
   */
  setStatus(message, type = 'info') {
    if (this.statusElement) {
      this.statusElement.textContent = message;
      this.statusElement.className = `status status-${type}`;
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  /**
   * Show/update progress bar
   */
  setProgress(percent) {
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    
    if (progressBar && progressFill) {
      progressBar.style.display = percent > 0 ? 'block' : 'none';
      progressFill.style.width = `${percent}%`;
    }
  }

  /**
   * Initialize viewer if not exists
   */
  ensureViewer() {
    if (!this.viewer && this.viewerContainer) {
      this.viewer = new ThreeViewer(this.viewerContainer);
      this.viewer.onLoadSuccess = (model) => {
        this.setStatus('Model loaded successfully!', 'success');
        this.setProgress(0);
      };
      this.viewer.onLoadError = (error) => {
        this.setStatus(`Load error: ${error.message}`, 'error');
        this.setProgress(0);
      };
    }
    return this.viewer;
  }

  /**
   * Open viewer with test parameters
   */
  async openViewer() {
    const params = this.getParams();
    
    this.setStatus(`Loading file: ${params.fileName}...`, 'info');
    this.setProgress(10);
    
    try {
      const viewer = this.ensureViewer();
      if (!viewer) {
        throw new Error('Could not initialize viewer');
      }
      
      // Fetch file
      const result = await fetchViewerFile(
        params.projectID, 
        params.fileName,
        (progress) => this.setProgress(10 + progress * 0.7)
      );
      
      this.setProgress(80);
      this.setStatus(`Loading ${result.fileType.toUpperCase()} into viewer...`, 'info');
      
      // Load into viewer
      await viewer.loadModel(result.data, result.fileType);
      
      this.setProgress(100);
      // Success status set by onLoadSuccess callback
      
    } catch (error) {
      this.setStatus(`Error: ${error.message}`, 'error');
      this.setProgress(0);
      console.error('Viewer error:', error);
    }
  }

  /**
   * Download original file
   */
  async downloadFile() {
    const params = this.getParams();
    
    this.setStatus(`Downloading: ${params.fileName}...`, 'info');
    this.setProgress(10);
    
    try {
      await downloadOriginalFile(
        params.projectID, 
        params.fileName,
        (progress) => this.setProgress(10 + progress * 0.9)
      );
      
      this.setProgress(100);
      this.setStatus('Download complete!', 'success');
      
      setTimeout(() => this.setProgress(0), 1000);
      
    } catch (error) {
      this.setStatus(`Download error: ${error.message}`, 'error');
      this.setProgress(0);
      console.error('Download error:', error);
    }
  }

  /**
   * Reset camera
   */
  resetCamera() {
    if (this.viewer) {
      this.viewer.resetCamera();
      this.setStatus('Camera reset', 'info');
    }
  }

  /**
   * Toggle grid
   */
  toggleGrid() {
    if (this.viewer) {
      this.viewer.toggleGrid();
      this.setStatus('Grid toggled', 'info');
    }
  }

  /**
   * Toggle axes
   */
  toggleAxes() {
    if (this.viewer) {
      this.viewer.toggleAxes();
      this.setStatus('Axes toggled', 'info');
    }
  }

  /**
   * Take screenshot
   */
  takeScreenshot() {
    if (this.viewer) {
      const dataUrl = this.viewer.takeScreenshot();
      
      // Create download link
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'viewer-screenshot.png';
      link.click();
      
      this.setStatus('Screenshot saved!', 'success');
    }
  }

  /**
   * Clear viewer
   */
  clearViewer() {
    if (this.viewer) {
      this.viewer.clearModel();
      this.setStatus('Viewer cleared', 'info');
    }
  }

  /**
   * Dispose test UI
   */
  dispose() {
    if (this.viewer) {
      this.viewer.dispose();
      this.viewer = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

export default TestUI;
