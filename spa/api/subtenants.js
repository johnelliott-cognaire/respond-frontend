// File: api/subtenants.js
import { cacheSubtenantAttribute, getCachedSubtenantAttribute } from '../utils/cache-utils.js';
import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader, logout } from "./auth.js";


/**
 * Invalidates specific subtenant attribute(s) in the cache
 * ----------------------------------------------------------------
 * This function removes cached subtenant attributes, forcing the next
 * call to getSubtenantAttributes to fetch fresh data from the server.
 * 
 * @param {string|Array<string>} attr_names Single attribute name or array of attribute names to invalidate
 */
export function invalidateSubtenantAttributeCache(attr_names) {
    console.log("[subtenants.js] Invalidating cache for attributes:", attr_names);

    // Handle both single string and array inputs
    const attributes = Array.isArray(attr_names) ? attr_names : [attr_names];

    // Invalidate each attribute in the cache
    attributes.forEach(attr => {
        // Remove from sessionStorage cache
        const cacheKey = `subtenant_attr_${attr}`;
        sessionStorage.removeItem(cacheKey);

        console.log(`[subtenants.js] Invalidated cache for '${attr}'`);
    });
}

/**
 * Comprehensive cache invalidation function to clear ALL cache sources
 * This should be called after saving a favorite to ensure all components get fresh data
 */
function _invalidateAllCorpusConfigCaches() {
    console.log("[subtenants.js] Performing comprehensive cache invalidation");

    // 1. Invalidate individual subtenant attribute cache
    invalidateSubtenantAttributeCache('corpus_config');

    // 2. Clear sessionStorage caches
    try {
        sessionStorage.removeItem('subtenantCache');
        sessionStorage.removeItem('subtenant_attr_corpus_config');
        sessionStorage.removeItem('corpusUsers'); // Also clear corpus users cache
        console.log("[subtenants.js] Cleared sessionStorage caches");
    } catch (storageErr) {
        console.warn("[subtenants.js] Failed to clear sessionStorage:", storageErr);
    }

    // 3. Clear localStorage via global store if available
    try {
        if (window.appStore && typeof window.appStore.remove === 'function') {
            window.appStore.remove('corpus_config');
            console.log("[subtenants.js] Cleared appStore corpus_config");
        }
    } catch (storeErr) {
        console.warn("[subtenants.js] Failed to clear appStore:", storeErr);
    }

    // 4. Clear any component-level caches
    try {
        // Signal to all components that they should refresh their data
        const event = new CustomEvent('corpus-config-invalidated', {
            detail: { timestamp: Date.now() }
        });
        document.dispatchEvent(event);
        console.log("[subtenants.js] Dispatched cache invalidation event");
    } catch (eventErr) {
        console.warn("[subtenants.js] Failed to dispatch invalidation event:", eventErr);
    }

    // 5. Force refresh of any known component caches
    try {
        // Clear the stage form cache if it exists
        if (window.currentStageForm && window.currentStageForm.subtenantCache) {
            window.currentStageForm.subtenantCache = {};
            console.log("[subtenants.js] Cleared stage form cache");
        }

        // Clear control pane cache if it exists
        if (window.currentControlPane && window.currentControlPane.subtenantCache) {
            window.currentControlPane.subtenantCache = {};
            console.log("[subtenants.js] Cleared control pane cache");
        }
    } catch (componentErr) {
        console.warn("[subtenants.js] Failed to clear component caches:", componentErr);
    }
}

function _invalidateCorpusSpecificCaches() {

    // Also clear any corpus-specific caches if we can determine the current corpus
    try {
        // Force refresh of commonly cached data
        const attributesToRefresh = ['corpus_config', 'label_friendly_names'];

        // Schedule a delayed refresh to ensure all components get fresh data
        setTimeout(async () => {
            try {
                console.log("[subtenants.js] Performing delayed cache refresh");
                const freshData = await getSubtenantAttributes(attributesToRefresh);
                console.log("[subtenants.js] Fresh data loaded:", Object.keys(freshData));

                // Update global store if available
                if (window.appStore && freshData.corpus_config) {
                    window.appStore.set('corpus_config', freshData.corpus_config);
                }

                // Dispatch event with fresh data
                const refreshEvent = new CustomEvent('corpus-config-refreshed', {
                    detail: {
                        freshData: freshData,
                        timestamp: Date.now()
                    }
                });
                document.dispatchEvent(refreshEvent);

            } catch (refreshErr) {
                console.warn("[subtenants.js] Error during delayed refresh:", refreshErr);
            }
        }, 100); // 100ms delay to ensure save operation is complete

    } catch (refreshErr) {
        console.warn("[subtenants.js] Error setting up delayed refresh:", refreshErr);
    }
}

/**
 * Process the result from hasLimitBreached to determine model availability
 * and generate appropriate warning messages.
 * 
 * @param {Object} result The result from hasLimitBreached
 * @returns {Object} Object with standardEnabled, enhancedEnabled, and licenseWarning
 */
export function processLicenseLimits(result) {
    const state = {
        standardEnabled: true,  // Default to enabled
        enhancedEnabled: true,  // Default to enabled
        licenseWarning: null
    };

    // Check for breaches
    if (result && result.breaches && result.breaches.length > 0) {
        for (const breach of result.breaches) {
            if (breach.meter === "Q_STD") {
                if (breach.status === "BREACH_BLOCKED") {
                    state.standardEnabled = false;
                } else if (breach.status === "BREACH_ALLOWED") {
                    state.licenseWarning = `Warning: You have exceeded your Standard Model (${breach.meter}) license limit. Overage charges will apply.`;
                }
            }

            if (breach.meter === "Q_ENH") {
                if (breach.status === "BREACH_BLOCKED") {
                    state.enhancedEnabled = false;
                } else if (breach.status === "BREACH_ALLOWED") {
                    state.licenseWarning = `Warning: You have exceeded your Enhanced Model (${breach.meter}) license limit. Overage charges will apply.`;
                }
            }
        }
    }

    // Check for warnings
    if (result && result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
            if (!state.licenseWarning) {
                state.licenseWarning = `Warning: You are approaching your ${warning.meter === "Q_STD" ? "Standard" : "Enhanced"} Model license limit (${warning.warning_pct}%).`;
            }
        }
    }

    return state;
}

/**
 * Retrieves specific attributes of a subtenant.
 * Lambda: backend/services/lambdas/billing/subtenant/get_subtenant_attributes.py
 * ----------------------------------------------------------------
 * Status: Integrated (Real)
 * Front-End: Used for fetching module options and configuration settings
 * 
 * @param {string} subtenant_id The subtenant identifier
 * @param {Array<string>} attr_names List of attribute names to retrieve
 * @returns {Promise<Object>} The requested attributes
 */
export async function getSubtenantAttributes(attr_names) {
    console.log("[subtenants.js] getSubtenantAttributes() called with attr_names:", attr_names);

    // Validation
    if (!attr_names || !Array.isArray(attr_names) || attr_names.length === 0) {
        console.warn("[subtenants.js] attr_names must be a non-empty array");
        return {};
    }

    // Check cache first for all requested attributes
    const allCached = attr_names.every(attr => getCachedSubtenantAttribute(attr) !== undefined);
    if (allCached) {
        console.log("[subtenants.js] Using cached attributes");
        return attr_names.reduce((result, attr) => {
            result[attr] = getCachedSubtenantAttribute(attr);
            return result;
        }, {});
    }

    const baseUrl = getBaseUrl("main");
    const url = `${baseUrl}/subtenant/get-attributes`;

    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeader()
            },
            body: JSON.stringify({
                attr_names
            })
        });

        if (resp.status === 401) {
            logout();
            console.error("[subtenants.js] Unauthorized /subtenant/get-attributes => token invalid");
            return {};
        }

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            console.error("[subtenants.js] Error fetching subtenant attributes:", errData.error || resp.status);
            return {};
        }

        const data = await resp.json();
        console.log("[subtenants.js] Subtenant attributes fetched successfully:", data);

        // Cache the results
        Object.keys(data).forEach(attr => {
            if (attr_names.includes(attr)) {
                cacheSubtenantAttribute(attr, data[attr]);
            }
        });

        return data;
    } catch (err) {
        console.error("[subtenants.js] Error in getSubtenantAttributes:", err);
        return {};
    }
}

/**
 * Checks if subtenant has breached usage limits for specified meters.
 * Lambda: backend/services/lambdas/billing/subtenant/has_limit_breached.py
 * ----------------------------------------------------------------
 * Status: Integrated (Real)
 * Front-End: Used for checking license limits before AI operations
 * 
 * @param {string} subtenant_id The subtenant identifier
 * @param {Array<string>} meter_list List of meter codes to check (e.g., ["Q_STD", "Q_ENH"])
 * @returns {Promise<Object>} Object containing breach and warning information
 */
export async function hasLimitBreached(meter_list) {
    console.log("[subtenants.js] hasLimitBreached() called with meter_list:", meter_list);

    // Default response for graceful degradation
    const defaultResponse = {
        breaches: [],
        warnings: []
    };

    // Validation
    if (!meter_list || !Array.isArray(meter_list) || meter_list.length === 0) {
        console.warn("[subtenants.js] meter_list must be a non-empty array");
        return defaultResponse;
    }

    // Use deduplication to prevent multiple identical calls
    const { deduplicateRequest } = await import("../utils/request-deduplication.js");
    
    return deduplicateRequest(
        'hasLimitBreached',
        { meter_list, mode: "meter" },
        async () => {
            const baseUrl = getBaseUrl("main");
            const url = `${baseUrl}/subtenant/has-limit-breached`;

            try {
                const resp = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeader()
                    },
                    body: JSON.stringify({
                        meter_list,
                        mode: "meter"  // Use meter mode
                    })
                });

                if (resp.status === 401) {
                    logout();
                    console.error("[subtenants.js] Unauthorized /subtenant/has-limit-breached => token invalid");
                    return defaultResponse;
                }

                if (!resp.ok) {
                    // Check for specific errors
                    const errData = await resp.json().catch(() => ({}));
                    console.error("[subtenants.js] Error checking license limits:", errData.error || resp.status);

                    // Log specific error messages for debugging
                    if (errData.error && errData.error.includes("reserved keyword: plan")) {
                        console.error("[subtenants.js] DynamoDB error with reserved keyword 'plan'. This needs to be fixed on the backend.");
                    }

                    return defaultResponse;
                }

                const data = await resp.json();
                console.log("[subtenants.js] License limit check completed successfully:", data);
                return data;
            } catch (err) {
                console.error("[subtenants.js] Error in hasLimitBreached:", err);
                return defaultResponse;
            }
        },
        60000 // Cache for 60 seconds since license limits change infrequently
    );
}

/**
 * Returns a user‑friendly label for a given key.
 *
 * @param {Object} labelFriendlyNames  Map of raw keys → friendly labels
 * @param {string} name                The raw label key (e.g. "annual-and-financial-reports")
 * @returns {string}                   The friendly name, e.g. "Annual and Financial Reports"
 */
export function getLabelFriendlyName(labelFriendlyNames, name) {

    if (!name) return '';

    // 1) If there’s an explicit mapping, use it:
    if (labelFriendlyNames && labelFriendlyNames[name]) {
        return labelFriendlyNames[name];
    }

    // 2) Otherwise fall back to smart-casing:
    const lowercaseShortWords = ['the', 'and', 'of', 'in', 'to', 'for', 'on', 'at', 'by', 'from', 'up'];
    const capitalizedShortWords = ['win'];  // if you ever need exceptions

    return name
        .replace(/[_-]/g, ' ')      // underscores/dashes → spaces
        .split(' ')
        .map(word => {
            const lw = word.toLowerCase();
            if (lowercaseShortWords.includes(lw)) {
                return lw;               // keep it lowercase
            }
            if (capitalizedShortWords.includes(lw)) {
                return lw.charAt(0).toUpperCase() + lw.slice(1);
            }
            if (word.length <= 3) {
                return lw.toUpperCase(); // acronyms
            }
            // default: Title Case
            return lw.charAt(0).toUpperCase() + lw.slice(1);
        })
        .join(' ');
}



/**
 * Extracts units from a specific domain in a corpus.
 *
 * @param {Object} corpus_config The corpus configuration object (plain JSON)
 * @param {string} corpus_id     The corpus ID (e.g. "rfp")
 * @param {string} domain        The domain key (e.g. "wfe")
 * @returns {string[]}           List of unit identifiers
 */
export function getUnits(corpus_config, corpus_id, domain) {
    console.log("[subtenants.js] getUnits() called with:", corpus_id, domain);

    if (!corpus_config || typeof corpus_config !== "object") {
        console.warn("[subtenants.js] Invalid corpus_config:", corpus_config);
        return [];
    }

    const corpora = corpus_config.corpora;
    if (!corpora || typeof corpora !== "object") {
        console.warn("[subtenants.js] No corpora map in config");
        return [];
    }

    const corpus = corpora[corpus_id];
    if (!corpus) {
        console.warn(`[subtenants.js] Corpus '${corpus_id}' not found`);
        return [];
    }

    const domainHierarchy = corpus.domain_hierarchy;
    if (!domainHierarchy || typeof domainHierarchy !== "object") {
        console.warn(`[subtenants.js] No domain_hierarchy for corpus '${corpus_id}'`);
        return [];
    }

    const units = domainHierarchy[domain];
    if (!Array.isArray(units)) {
        console.warn(`[subtenants.js] Domain '${domain}' not found or not an array`);
        return [];
    }

    return units; // array of string unit IDs
}

/**
 * Extracts all domain keys for a given corpus.
 *
 * @param {Object} corpus_config The corpus configuration object (plain JSON)
 * @param {string} corpus_id     The corpus ID (e.g. "rfp")
 * @returns {string[]}           List of domain keys
 */
export function getDomains(corpus_config, corpus_id) {
    console.log("[subtenants.js] getDomains() called with:", corpus_id);

    if (!corpus_config?.corpora) {
        console.warn("[subtenants.js] No corpora map in config");
        return [];
    }

    const corpus = corpus_config.corpora[corpus_id];
    if (!corpus) {
        console.warn(`[subtenants.js] Corpus '${corpus_id}' not found`);
        return [];
    }

    const domainHierarchy = corpus.domain_hierarchy;
    if (!domainHierarchy || typeof domainHierarchy !== "object") {
        console.warn(`[subtenants.js] No domain_hierarchy for corpus '${corpus_id}'`);
        return [];
    }

    return Object.keys(domainHierarchy);
}

/**
 * Extracts all corpus IDs from the configuration.
 *
 * @param {Object} corpus_config The corpus configuration object (plain JSON)
 * @returns {string[]}           List of corpus IDs
 */
export function getCorpora(corpus_config) {
    console.log("[subtenants.js] getCorpora() called");

    const corpora = corpus_config?.corpora;
    if (!corpora || typeof corpora !== "object") {
        console.warn("[subtenants.js] No corpora map in config");
        return [];
    }

    return Object.keys(corpora);
}

/**
 * Saves a favorite domain unit configuration to a specific slot.
 * Lambda: backend/services/lambdas/billing/subtenant/save_favorite_domain_unit.py
 * ----------------------------------------------------------------
 * Status: New (Integrated)
 * Front-End: Used for saving favorite content configurations
 * 
 * @param {string} corpusId The corpus ID
 * @param {string} slotId The slot ID (e.g., "slot1", "slot2", etc.)
 * @param {Object} favoriteData The favorite domain unit data
 * @returns {Promise<Object>} The updated favorite_domain_units structure
 */
export async function saveFavoriteDomainUnit(corpusId, slotId, favoriteData) {
    console.log("[subtenants.js] saveFavoriteDomainUnit() called with corpusId:", corpusId, "slotId:", slotId);

    // Validation
    if (!corpusId || !slotId || !favoriteData) {
        console.warn("[subtenants.js] corpusId, slotId, and favoriteData are required");
        throw new Error("Required parameters missing");
    }

    const baseUrl = getBaseUrl("main");
    const url = `${baseUrl}/subtenant/save-favorite-domain-unit`;

    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeader()
            },
            body: JSON.stringify({
                corpus_id: corpusId,
                slot_id: slotId,
                favorite_data: favoriteData
            })
        });

        if (resp.status === 401) {
            logout();
            console.error("[subtenants.js] Unauthorized /subtenant/save-favorite-domain-unit => token invalid");
            throw new Error("Unauthorized - Please log in again");
        }

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            console.error("[subtenants.js] Error saving favorite domain unit:", errData.error || resp.status);
            throw new Error(errData.error || `Server error: ${resp.status}`);
        }

        const data = await resp.json();
        console.log("[subtenants.js] Favorite domain unit saved successfully:", data);

        console.log("[subtenants.js] Performing comprehensive cache invalidation after save");
        _invalidateAllCorpusConfigCaches();
        _invalidateCorpusSpecificCaches();

        return data;
    } catch (err) {
        console.error("[subtenants.js] Error in saveFavoriteDomainUnit:", err);
        throw err;
    }
}


/**
 * Extract favorite domain-units from corpus config.
 * Returns array of favorite configurations in order.
 * 
 * @param {Object} corpusConfig The corpus configuration
 * @param {string} corpusId The corpus ID (e.g., "rfp")
 * @param {number} limit Maximum number of favorites to return
 * @returns {Array} Array of favorite configurations
 */
export function getFavoriteDomainUnits(corpusConfig, corpusId, limit = 5) {
    try {
        console.log("[getFavoriteDomainUnits] Called with corpusId:", corpusId);

        // Defensive checks
        if (!corpusConfig || !corpusConfig.corpora || !corpusId) {
            console.warn("[getFavoriteDomainUnits] Missing corpus config or corpus ID");
            return [];
        }

        // Get the corpus
        const corpus = corpusConfig.corpora[corpusId];
        if (!corpus) {
            console.warn(`[getFavoriteDomainUnits] Corpus ${corpusId} not found in config`);
            return [];
        }

        // Check for favorite_domain_units
        if (!corpus.favorite_domain_units || typeof corpus.favorite_domain_units !== 'object') {
            console.warn(`[getFavoriteDomainUnits] No favorite_domain_units in corpus ${corpusId}`);
            return [];
        }

        // Extract favorites
        const favorites = [];

        // Process each slot
        Object.entries(corpus.favorite_domain_units).forEach(([slotId, favoriteData]) => {
            // Skip empty slots
            if (!favoriteData || !favoriteData.domain || !favoriteData.unit) {
                return;
            }

            // Add to favorites array
            favorites.push({
                ...favoriteData,
                slotId
            });
        });

        // Sort by name (if available) or slot ID
        favorites.sort((a, b) => {
            if (a.name && b.name) {
                return a.name.localeCompare(b.name);
            }
            return a.slotId.localeCompare(b.slotId);
        });

        // Apply limit
        const result = favorites.slice(0, limit);
        console.log(`[getFavoriteDomainUnits] Found ${result.length} favorites:`, result);

        return result;
    } catch (err) {
        console.error("[getFavoriteDomainUnits] Error extracting favorites:", err);
        return [];
    }
}