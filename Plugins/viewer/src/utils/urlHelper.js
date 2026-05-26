/**
 * URL Helper Utilities
 * Handles URL encoding and building
 */

/**
 * Properly encode a filename for URL usage
 * Handles spaces, parentheses, and special characters
 * @param {string} fileName - The filename to encode
 * @returns {string} URL-encoded filename
 */
export function encodeFileName(fileName) {
  if (!fileName) return '';
  return encodeURIComponent(fileName);
}

/**
 * Decode a URL-encoded filename
 * @param {string} encodedFileName - The encoded filename
 * @returns {string} Decoded filename
 */
export function decodeFileName(encodedFileName) {
  if (!encodedFileName) return '';
  return decodeURIComponent(encodedFileName);
}

/**
 * Build a query string from an object of parameters
 * @param {object} params - Key-value pairs for query parameters
 * @returns {string} Query string (without leading ?)
 */
export function buildQueryString(params) {
  if (!params || typeof params !== 'object') return '';
  
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Parse a query string into an object
 * @param {string} queryString - Query string (with or without leading ?)
 * @returns {object} Parsed parameters
 */
export function parseQueryString(queryString) {
  if (!queryString) return {};
  
  const cleanQuery = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  
  return cleanQuery.split('&').reduce((params, pair) => {
    const [key, value] = pair.split('=').map(decodeURIComponent);
    if (key) params[key] = value || '';
    return params;
  }, {});
}

/**
 * Build a complete URL from base, path, and parameters
 * @param {string} base - Base URL
 * @param {string} path - URL path
 * @param {object} params - Query parameters
 * @returns {string} Complete URL
 */
export function buildUrl(base, path, params = {}) {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const queryString = buildQueryString(params);
  
  return queryString 
    ? `${cleanBase}${cleanPath}?${queryString}`
    : `${cleanBase}${cleanPath}`;
}

/**
 * Extract file extension from filename
 * @param {string} fileName - Filename
 * @returns {string} File extension (lowercase, with dot)
 */
export function getFileExtension(fileName) {
  if (!fileName) return '';
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.slice(lastDot).toLowerCase();
}

/**
 * Get filename without extension
 * @param {string} fileName - Filename
 * @returns {string} Filename without extension
 */
export function getFileNameWithoutExtension(fileName) {
  if (!fileName) return '';
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return fileName;
  return fileName.slice(0, lastDot);
}

export default {
  encodeFileName,
  decodeFileName,
  buildQueryString,
  parseQueryString,
  buildUrl,
  getFileExtension,
  getFileNameWithoutExtension
};
