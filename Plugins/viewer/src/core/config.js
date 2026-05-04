/**
 * Configuration for the Three.js Viewer Plugin
 * Easily changeable API endpoints and settings
 */

const config = {
  // API Configuration - set via plugin options
  api: {
    baseUrl: '',
    endpoints: {
      viewer: '',
      download: ''
    }
  },

  // Test Parameters for development
  testParams: {
    projectID: '123123',
    fileName: 'L-30-V-C000_S (1)'
  },

  // Viewer Settings
  viewer: {
    backgroundColor: 0xf0f0f0,
    ambientLightColor: 0xffffff,
    ambientLightIntensity: 0.6,
    directionalLightColor: 0xffffff,
    directionalLightIntensity: 0.8,
    cameraFov: 45,
    cameraNear: 0.1,
    cameraFar: 10000,
    gridSize: 100,
    gridDivisions: 100,
    showGrid: true,
    showAxes: true
  },

  // File type settings
  fileTypes: {
    glb: ['.glb', '.gltf'],
    dxf: ['.dxf']
  },

  // Loading settings
  loading: {
    showSpinner: true,
    timeout: 60000 // 60 seconds
  }
};

/**
 * Build viewer API URL with parameters
 * @param {string} projectID - Project identifier
 * @param {string} fileName - Name of the file
 * @returns {string} Complete URL for viewer API
 */
export function buildViewerUrl(projectID, fileName) {
  const encodedFileName = encodeURIComponent(fileName);
  return `${config.api.baseUrl}${config.api.endpoints.viewer}?projectID=${projectID}&fileName=${encodedFileName}&view=true`;
}

/**
 * Build download API URL with parameters
 * @param {string} projectID - Project identifier
 * @param {string} fileName - Name of the file
 * @returns {string} Complete URL for download API
 */
export function buildDownloadUrl(projectID, fileName) {
  const encodedFileName = encodeURIComponent(fileName);
  return `${config.api.baseUrl}${config.api.endpoints.download}?projectID=${projectID}&fileName=${encodedFileName}`;
}

/**
 * Update API base URL
 * @param {string} newBaseUrl - New base URL
 */
export function setApiBaseUrl(newBaseUrl) {
  config.api.baseUrl = newBaseUrl;
}

/**
 * Get current configuration
 * @returns {object} Current configuration
 */
export function getConfig() {
  return { ...config };
}

/**
 * Update configuration (deep merge for nested objects)
 * @param {object} newConfig - Partial configuration to merge
 */
export function updateConfig(newConfig) {
  for (const key in newConfig) {
    if (newConfig[key] && typeof newConfig[key] === 'object' && !Array.isArray(newConfig[key])) {
      config[key] = { ...config[key], ...newConfig[key] };
      // Handle nested objects like api.endpoints
      if (newConfig[key].endpoints && config[key].endpoints) {
        config[key].endpoints = { ...config[key].endpoints, ...newConfig[key].endpoints };
      }
    } else {
      config[key] = newConfig[key];
    }
  }
}

export default config;
