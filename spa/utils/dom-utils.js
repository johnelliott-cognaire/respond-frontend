// utils/dom-utils.js
// Utility: DOM Helpers
export function $(selector) {
  return document.querySelector(selector);
}

/**
 * Creates a safe ID for DOM elements by processing segments and joining them with dashes.
 * Handles special characters, spaces, and ensures unique consistent IDs.
 * 
 * @param {...string} segments - One or more string segments to combine into an ID
 * @returns {string} - A safe ID string for DOM use
 */
export function makeSafeId(...segments) {
  return segments
    .map(segment => {
      if (segment === undefined || segment === null) return 'null';
      
      return String(segment)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_') // Replace special chars with underscore
        .replace(/_{2,}/g, '_')          // Replace multiple underscores with single
        .toLowerCase();                  // Lowercase for consistency
    })
    .filter(segment => segment.length > 0)
    .join('-');
}