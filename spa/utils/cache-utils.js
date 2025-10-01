// utils/cache-utils.js
const subtenantAttributesCache = {};

export function getCachedSubtenantAttribute(attrName) {
  return subtenantAttributesCache[attrName];
}

export function cacheSubtenantAttribute(attrName, value) {
  subtenantAttributesCache[attrName] = value;
  return value;
}

export function clearSubtenantAttributesCache() {
  Object.keys(subtenantAttributesCache).forEach(key => {
    delete subtenantAttributesCache[key];
  });
}

/**
 * Comprehensive function to clear all caches for specified attributes
 * Handles both in-memory cache and sessionStorage cache
 * 
 * @param {string|Array<string>} attrNames Single attribute name or array of attribute names
 */
export function clearAllCachesFor(attrNames) {
  console.log("[cache-utils] Clearing all caches for:", attrNames);
  
  // Handle both single string and array inputs
  const attributes = Array.isArray(attrNames) ? attrNames : [attrNames];
  
  // Clear in-memory cache
  attributes.forEach(attr => {
    if (subtenantAttributesCache[attr]) {
      delete subtenantAttributesCache[attr];
      console.log(`[cache-utils] Cleared in-memory cache for '${attr}'`);
    }
  });
  
  // Clear sessionStorage cache
  attributes.forEach(attr => {
    const cacheKey = `subtenant_attr_${attr}`;
    if (sessionStorage.getItem(cacheKey)) {
      sessionStorage.removeItem(cacheKey);
      console.log(`[cache-utils] Cleared sessionStorage cache for '${attr}'`);
    }
  });
}