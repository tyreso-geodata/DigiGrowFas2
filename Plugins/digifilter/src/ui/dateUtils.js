/**
 * Formats a date string from WFS/GeoServer for display.
 * Strips the trailing Z (UTC marker) that GeoServer appends to date-only fields,
 * and returns a clean Swedish-style date (YYYY-MM-DD).
 * Returns an empty string for null/undefined/empty values.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) return '';
  // Remove trailing Z, then take only the date part (first 10 chars: YYYY-MM-DD)
  return String(value).replace(/Z$/i, '').slice(0, 10);
}