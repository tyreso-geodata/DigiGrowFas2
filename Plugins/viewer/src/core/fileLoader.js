/**
 * File Loader Module
 * Handles API fetching and file type detection
 */

import { buildViewerUrl, buildDownloadUrl, getConfig } from './config';
import { getFileExtension } from '../utils/urlHelper';

/**
 * File types enum
 */
export const FileType = {
  GLB: 'glb',
  GLTF: 'gltf',
  DXF: 'dxf',
  UNKNOWN: 'unknown'
};

/**
 * Detect file type from response headers or content
 * @param {Response} response - Fetch response
 * @param {string} fileName - Original filename
 * @returns {string} Detected file type
 */
export function detectFileType(response, fileName) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  // Try to get the real filename (with extension) from content-disposition header
  const contentDisposition = response.headers.get('content-disposition') || '';
  let cdFileName = '';
  const cdMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (cdMatch && cdMatch[1]) {
    cdFileName = cdMatch[1].replace(/['"]/g, '').trim();
  }

  // Prefer content-disposition filename if it has an extension, then fall back to passed fileName
  const effectiveName = (cdFileName && cdFileName.includes('.')) ? cdFileName : (fileName || '');
  const extension = getFileExtension(effectiveName);

  // --- Explicit MIME types (most reliable) ---

  // GLB / GLTF
  if (contentType.includes('model/gltf-binary')) return FileType.GLB;
  if (contentType.includes('model/gltf+json')) return FileType.GLTF;

  // DXF (many servers use different MIME types for the same format)
  if (
    contentType.includes('application/dxf') ||
    contentType.includes('image/vnd.dxf') ||
    contentType.includes('application/x-dxf') ||
    contentType.includes('application/vnd.dxf') ||
    contentType.includes('application/acad') ||
    contentType.includes('application/x-acad')
  ) {
    return FileType.DXF;
  }

  // --- Generic binary: use extension to disambiguate ---
  if (contentType.includes('application/octet-stream')) {
    if (extension === '.dxf') return FileType.DXF;
    if (extension === '.gltf') return FileType.GLTF;
    if (extension === '.glb' || extension === '') return FileType.GLB; // default binary → GLB
    return FileType.GLB;
  }

  // --- Text content: DXF is an ASCII format ---
  if (contentType.includes('text/plain') || contentType.includes('text/')) {
    if (extension === '.dxf') return FileType.DXF;
  }

  // --- Extension fallback (no useful content-type header) ---
  const config = getConfig();
  if (config.fileTypes.dxf.includes(extension)) return FileType.DXF;
  if (config.fileTypes.glb.includes(extension)) {
    return extension === '.gltf' ? FileType.GLTF : FileType.GLB;
  }

  return FileType.UNKNOWN;
}

/**
 * Extract geo-referencing headers from response
 * @param {Response} response - Fetch response
 * @returns {{epsg: string|null, translation: number[]|null, position: number[]|null}}
 */
function extractGeoHeaders(response) {
  // Log all available headers for debugging
  console.log('[GeoHeaders] Available headers:');
  response.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });
  
  // Headers.get() is case-insensitive
  const epsg = response.headers.get('x-epsg') || null;
  
  const translationStr = response.headers.get('x-translation') || '';
  let translation = null;
  if (translationStr) {
    const parts = translationStr.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && parts.every(n => !isNaN(n))) {
      translation = parts;
    }
  }
  
  const positionStr = response.headers.get('x-position') || '';
  console.log('[GeoHeaders] Raw position header:', positionStr, 'EPSG:', epsg, 'Translation:', translationStr);
  let position = null;
  if (positionStr) {
    console.log('[GeoHeaders] Parsing position string:', positionStr);
    const parts = positionStr.split(',').map(s => parseFloat(s.trim()));
    console.log('[GeoHeaders] Parsed parts:', parts);
    if (parts.length >= 2 && parts.every(n => !isNaN(n))) {
      position = parts;
    }
  }
  
  // Parse rotation heading (degrees)
  const rotHeadingStr = response.headers.get('x-rotheading') || '';
  let rotHeading = null;
  if (rotHeadingStr) {
    const parsed = parseFloat(rotHeadingStr.trim());
    if (!isNaN(parsed)) {
      rotHeading = parsed;
    }
  }

  const result = { epsg, translation, position, rotHeading };
  console.log('[GeoHeaders] Final result:', result);
  return result;
}

/**
 * Fetch file for viewing
 * @param {string} projectID - Project identifier
 * @param {string} fileName - File name
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{data: ArrayBuffer, fileType: string, fileName: string, geoHeaders: object}>}
 */
export async function fetchViewerFile(projectID, fileName, onProgress = null) {
  const url = buildViewerUrl(projectID, fileName);
  const config = getConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.loading.timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const fileType = detectFileType(response, fileName);
    const geoHeaders = extractGeoHeaders(response);
    
    // Handle progress if content-length is available
    const contentLength = response.headers.get('content-length');
    if (contentLength && onProgress) {
      const total = parseInt(contentLength, 10);
      let loaded = 0;
      
      const reader = response.body.getReader();
      const chunks = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        onProgress(Math.round((loaded / total) * 100));
      }
      
      // Combine chunks into ArrayBuffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      return {
        data: combined.buffer,
        fileType,
        fileName,
        geoHeaders
      };
    }

    // No progress tracking
    const data = await response.arrayBuffer();
    return {
      data,
      fileType,
      fileName,
      geoHeaders
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - file loading took too long');
    }
    
    throw error;
  }
}

/**
 * Download original file
 * @param {string} projectID - Project identifier
 * @param {string} fileName - File name
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<void>}
 */
export async function downloadOriginalFile(projectID, fileName, onProgress = null) {
  const url = buildDownloadUrl(projectID, fileName);
  const config = getConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.loading.timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get filename from content-disposition header if available
    const contentDisposition = response.headers.get('content-disposition');
    const responseContentType = response.headers.get('content-type') || '';
    let downloadFileName = fileName;
    
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        downloadFileName = filenameMatch[1].replace(/['"]/g, '');
      }
    }

    // If the filename already has a known extension, keep it — this is the original file
    const knownExtensions = ['.ifc', '.dwg', '.glb', '.gltf', '.dxf', '.rvt', '.nwd'];
    const hasKnownExt = knownExtensions.some(ext =>
      downloadFileName.toLowerCase().endsWith(ext)
    );

    if (!hasKnownExt) {
      // No recognized extension — derive one from content-type
      const contentTypeExtMap = {
        'model/gltf-binary': '.glb',
        'model/gltf+json': '.gltf',
        'application/dxf': '.dxf',
        'image/vnd.dxf': '.dxf',
        'application/ifc': '.ifc',
        'application/x-step': '.ifc',
        'model/step': '.ifc',
        'image/vnd.dwg': '.dwg',
        'application/acad': '.dwg',
        'application/x-autocad': '.dwg',
        'application/dwg': '.dwg',
      };
      const derivedExt = Object.entries(contentTypeExtMap).find(
        ([mime]) => responseContentType.includes(mime)
      )?.[1];

      if (derivedExt) {
        downloadFileName += derivedExt;
      }
      // If still no extension and truly unknown content-type, leave as-is —
      // better a file with no extension than a wrong one
    }

    // Handle progress
    const contentLength = response.headers.get('content-length');
    let blob;
    
    if (contentLength && onProgress) {
      const total = parseInt(contentLength, 10);
      let loaded = 0;
      
      const reader = response.body.getReader();
      const chunks = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        onProgress(Math.round((loaded / total) * 100));
      }
      
      blob = new Blob(chunks, { type: 'application/octet-stream' });
    } else {
      const rawBlob = await response.blob();
      // Force octet-stream so the browser saves as binary, not text
      blob = new Blob([rawBlob], { type: 'application/octet-stream' });
    }

    // Trigger download
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

    return { success: true, fileName: downloadFileName };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - download took too long');
    }
    
    throw error;
  }
}

export default {
  FileType,
  detectFileType,
  fetchViewerFile,
  downloadOriginalFile
};
