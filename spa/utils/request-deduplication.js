// File: utils/request-deduplication.js
/**
 * Request Deduplication Utility
 * 
 * Prevents duplicate API calls by caching in-flight requests.
 * Multiple simultaneous identical calls will share the same Promise.
 */

const activeRequests = new Map();

/**
 * Generate a cache key from request parameters
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Request parameters
 * @returns {string} Cache key
 */
function generateCacheKey(endpoint, params = {}) {
    const sortedParams = Object.keys(params)
        .sort()
        .reduce((result, key) => {
            result[key] = params[key];
            return result;
        }, {});
    
    return `${endpoint}:${JSON.stringify(sortedParams)}`;
}

/**
 * Deduplicate API requests
 * @param {string} endpoint - API endpoint identifier
 * @param {Object} params - Request parameters
 * @param {Function} requestFunction - Function that makes the actual API call
 * @param {number} cacheDuration - How long to cache in milliseconds (default: 0 = no caching, just deduplication)
 * @returns {Promise} The API response
 */
export async function deduplicateRequest(endpoint, params, requestFunction, cacheDuration = 0) {
    const cacheKey = generateCacheKey(endpoint, params);
    
    console.log(`[RequestDeduplication] Request for ${endpoint}:`, params);
    
    // Check if there's already a request in flight
    if (activeRequests.has(cacheKey)) {
        console.log(`[RequestDeduplication] ⚡ Using existing request for ${endpoint}`);
        return activeRequests.get(cacheKey);
    }
    
    console.log(`[RequestDeduplication] 🆕 Making new request for ${endpoint}`);
    
    // Create the request promise
    const requestPromise = requestFunction()
        .then(result => {
            console.log(`[RequestDeduplication] ✅ Request completed for ${endpoint}`);
            
            // If caching is enabled, keep the result for the specified duration
            if (cacheDuration > 0) {
                setTimeout(() => {
                    activeRequests.delete(cacheKey);
                    console.log(`[RequestDeduplication] 🗑️ Cache expired for ${endpoint}`);
                }, cacheDuration);
            } else {
                // Remove immediately if no caching
                activeRequests.delete(cacheKey);
            }
            
            return result;
        })
        .catch(error => {
            console.error(`[RequestDeduplication] ❌ Request failed for ${endpoint}:`, error);
            // Always remove failed requests immediately
            activeRequests.delete(cacheKey);
            throw error;
        });
    
    // Store the promise
    activeRequests.set(cacheKey, requestPromise);
    
    return requestPromise;
}

/**
 * Clear all cached requests (useful for testing or forced refresh)
 */
export function clearRequestCache() {
    const count = activeRequests.size;
    activeRequests.clear();
    console.log(`[RequestDeduplication] 🧹 Cleared ${count} cached requests`);
}

/**
 * Get statistics about active requests
 */
export function getRequestStats() {
    return {
        activeRequests: activeRequests.size,
        endpoints: Array.from(activeRequests.keys())
    };
}

/**
 * Invalidate cached requests by endpoint pattern
 * @param {string|RegExp} pattern - Endpoint pattern to match (string or regex)
 * @param {Object} partialParams - Optional partial parameters to match
 * @returns {number} Number of cache entries invalidated
 */
export function invalidateCache(pattern, partialParams = {}) {
    let invalidatedCount = 0;
    const keysToDelete = [];
    
    for (const [cacheKey] of activeRequests) {
        const [endpoint, paramsJson] = cacheKey.split(':', 2);
        
        // Check if endpoint matches pattern
        let endpointMatches = false;
        if (pattern instanceof RegExp) {
            endpointMatches = pattern.test(endpoint);
        } else {
            endpointMatches = endpoint === pattern || endpoint.includes(pattern);
        }
        
        if (endpointMatches) {
            // If partial parameters provided, check if they match
            if (Object.keys(partialParams).length > 0) {
                try {
                    const params = JSON.parse(paramsJson);
                    const paramsMatch = Object.entries(partialParams).every(([key, value]) => {
                        return params[key] === value;
                    });
                    
                    if (paramsMatch) {
                        keysToDelete.push(cacheKey);
                    }
                } catch (e) {
                    // If JSON parse fails, skip this entry
                    console.warn(`[RequestDeduplication] Failed to parse cache key params: ${paramsJson}`);
                }
            } else {
                keysToDelete.push(cacheKey);
            }
        }
    }
    
    // Delete matched entries
    keysToDelete.forEach(key => {
        activeRequests.delete(key);
        invalidatedCount++;
    });
    
    if (invalidatedCount > 0) {
        console.log(`[RequestDeduplication] 🧽 Invalidated ${invalidatedCount} cache entries for pattern: ${pattern}`);
    }
    
    return invalidatedCount;
}

/**
 * Invalidate document-related caches when document items are modified
 * @param {string} projectDocumentId - The project document ID
 * @param {string} stageId - The stage ID
 */
export function invalidateDocumentItemsCache(projectDocumentId, stageId) {
    console.log(`[RequestDeduplication] Invalidating document items cache for project: ${projectDocumentId}, stage: ${stageId}`);
    
    // Invalidate all fetchDocumentItems calls for this project/stage
    return invalidateCache('fetchDocumentItems', {
        project_document_id: projectDocumentId,
        stage_id: stageId
    });
}

/**
 * Invalidate license-related caches (useful when user actions might affect limits)
 */
export function invalidateLicenseCache() {
    console.log(`[RequestDeduplication] Invalidating license limit caches`);
    return invalidateCache('hasLimitBreached');
}

/**
 * Invalidate job-related caches when job status changes
 */
export function invalidateJobsCache() {
    console.log(`[RequestDeduplication] Invalidating job caches`);
    return invalidateCache('fetchJobs');
}

/**
 * Invalidate notification caches when notifications are read or new ones arrive
 */
export function invalidateNotificationsCache() {
    console.log(`[RequestDeduplication] Invalidating notification caches`);
    return invalidateCache('fetchNotifications');
}