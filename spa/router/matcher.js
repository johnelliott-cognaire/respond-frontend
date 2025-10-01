// File: frontend/spa/router/matcher.js
/**
 * Router Path Matcher
 * 
 * Handles path parsing, route matching, and hierarchical navigation resolution.
 * Supports entity IDs, modal identifiers, and complex path patterns.
 */

export class RouterMatcher {
    constructor(routeConfig) {
        this.routeConfig = routeConfig;
        this.routeIndex = new Map(); // Fast lookup by route ID
        this.pathIndex = new Map();  // Fast lookup by path
        this.modalIndex = new Map(); // Fast lookup for modals
        this.buildIndexes();
    }

    /**
     * Build internal indexes for fast route resolution
     */
    buildIndexes() {
        this.routeIndex.clear();
        this.pathIndex.clear();
        this.modalIndex.clear();

        if (!this.routeConfig?.routes) {
            return;
        }

        this.indexRoutes(this.routeConfig.routes, []);
    }

    /**
     * Recursively index all routes and their children
     */
    indexRoutes(routes, parentPath) {
        routes.forEach(route => {
            // Index by route ID
            this.routeIndex.set(route.id, {
                route,
                fullPath: [...parentPath, route.path],
                parentPath: [...parentPath]
            });

            // Index by path hierarchy
            const fullPathKey = [...parentPath, route.path].join('/');
            this.pathIndex.set(fullPathKey, {
                route,
                fullPath: [...parentPath, route.path],
                parentPath: [...parentPath]
            });

            // Index modals
            if (route.modals) {
                route.modals.forEach(modal => {
                    this.modalIndex.set(modal.id, {
                        modal,
                        parentRoute: route,
                        fullPath: [...parentPath, route.path]
                    });
                });
            }

            // Recursively index children
            if (route.children) {
                this.indexRoutes(route.children, [...parentPath, route.path]);
            }
        });
    }

    /**
     * Parse URL path into components
     * @param {string} url - URL to parse (including query string)
     * @returns {Object} Parsed path components
     */
    parsePath(url) {
        try {
            const urlObj = new URL(url, window.location.origin);
            const pathname = urlObj.pathname;
            const queryString = urlObj.search;
            const queryParams = this.parseQueryParams(queryString);

            // Split path and remove empty segments
            const segments = pathname.split('/').filter(segment => segment.length > 0);

            return {
                pathname,
                segments,
                queryString,
                queryParams,
                raw: url
            };
        } catch (error) {
            console.warn('[RouterMatcher] Invalid URL format:', url, error);
            return {
                pathname: '/',
                segments: [],
                queryString: '',
                queryParams: {},
                raw: url,
                error: error.message
            };
        }
    }

    /**
     * Parse query string into parameters object
     */
    parseQueryParams(queryString) {
        const params = {};
        if (!queryString) return params;

        const searchParams = new URLSearchParams(queryString);
        for (const [key, value] of searchParams.entries()) {
            params[key] = value;
        }
        return params;
    }

    /**
     * Match URL path against route configuration
     * @param {string} url - URL to match
     * @returns {Object} Match result with route information
     */
    match(url) {
        const parsed = this.parsePath(url);
        
        if (parsed.error) {
            return {
                success: false,
                error: 'Invalid URL format',
                details: parsed.error,
                queryParams: {}
            };
        }

        // Handle empty path - redirect to default route
        if (parsed.segments.length === 0) {
            return this.handleDefaultRoute(parsed.queryParams);
        }

        // Try to match against path hierarchy
        const matchResult = this.matchPathHierarchy(parsed.segments, parsed.queryParams);
        
        if (matchResult.success) {
            return matchResult;
        }

        // If no match found, return failure instead of falling back to descendant
        return {
            success: false,
            error: 'No matching route found',
            details: `Invalid route path: /${parsed.segments.join('/')}`,
            segments: parsed.segments,
            queryParams: parsed.queryParams
        };
    }

    /**
     * Handle default/empty route
     */
    handleDefaultRoute(queryParams) {
        const defaultRouteId = this.routeConfig.globalSettings?.defaultRoute || 'docs';
        const defaultRoute = this.routeIndex.get(defaultRouteId);

        if (!defaultRoute) {
            return {
                success: false,
                error: 'Default route not found',
                details: `Default route '${defaultRouteId}' does not exist`,
                queryParams
            };
        }

        return {
            success: true,
            route: defaultRoute.route,
            fullPath: defaultRoute.fullPath,
            entityId: null,
            modalId: null,
            queryParams,
            isDefault: true
        };
    }

    /**
     * Match URL segments against path hierarchy
     */
    matchPathHierarchy(segments, queryParams) {
        let currentPath = [];
        let entityId = null;
        let secondaryEntityId = null;
        let modalId = null;
        let matchedRoute = null;

        // Try to match as many path segments as possible
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const testPath = [...currentPath, segment];
            const pathKey = testPath.join('/');

            const pathMatch = this.pathIndex.get(pathKey);
            if (pathMatch) {
                // Found a valid path match
                matchedRoute = pathMatch;
                currentPath = testPath;
                continue;
            }

            // Check if this segment could be a modal ID or entity ID
            if (matchedRoute) {
                // Check if it's a modal ID first (higher priority)
                if (this.modalIndex.has(segment)) {
                    const modalData = this.modalIndex.get(segment);
                    // Verify the modal belongs to the current route context
                    if (this.isModalAccessibleFromRoute(modalData, matchedRoute.route)) {
                        modalId = segment;
                        console.log('[RouterMatcher] Detected modal ID:', segment, 'for route:', matchedRoute.route.id);
                        // Continue processing remaining segments for potential entity IDs
                        continue;
                    }
                }

                // Check if it's an entity ID (if we don't have a modal ID yet or if modal supports entities)
                if (matchedRoute.route.entitySupport?.enabled && !entityId) {
                    // Decode URL-encoded segment before validation
                    let decodedSegment;
                    try {
                        decodedSegment = decodeURIComponent(segment);
                        console.log('[RouterMatcher] Decoded segment for entity validation:', segment, '→', decodedSegment);
                    } catch (error) {
                        console.warn('[RouterMatcher] Failed to decode segment:', segment, error);
                        decodedSegment = segment; // Fall back to original if decode fails
                    }
                    
                    if (this.validateEntityId(decodedSegment, matchedRoute.route.entitySupport)) {
                        entityId = segment; // Keep original URL-encoded version as entityId
                        console.log('[RouterMatcher] Detected entity ID:', segment, '(decoded:', decodedSegment, ') for route:', matchedRoute.route.id);
                        // Continue processing remaining segments for potential child routes
                        continue;
                    }
                }

                // If we have a modal ID, check if this could be an entity for the modal
                if (modalId && matchedRoute.route.modals) {
                    const modalConfig = matchedRoute.route.modals.find(m => m.id === modalId);
                    if (modalConfig?.entitySupport?.enabled) {
                        if (this.validateEntityId(segment, modalConfig.entitySupport)) {
                            if (!entityId) {
                                // First parameter (primary entity)
                                entityId = segment;
                                console.log('[RouterMatcher] Detected primary entity ID for modal:', segment, 'modal:', modalId);
                                continue;
                            } else if (modalConfig.entitySupport.secondaryParam && !secondaryEntityId) {
                                // Second parameter (secondary entity)
                                secondaryEntityId = segment;
                                console.log('[RouterMatcher] Detected secondary entity ID for modal:', segment, 'modal:', modalId);
                                continue;
                            }
                        }
                    }
                }
            }

            // Unrecognized segment - no match
            break;
        }

        if (!matchedRoute) {
            return {
                success: false,
                error: 'No matching route found',
                segments,
                queryParams
            };
        }

        // Create params object based on route configuration
        const params = {};
        
        // Map entityId to the proper parameter name from route config
        if (entityId && matchedRoute.route.entitySupport?.enabled) {
            const paramName = matchedRoute.route.entitySupport.paramName || 'entityId';
            params[paramName] = entityId;
            console.log('[RouterMatcher] Mapped entityId to param:', paramName, '=', entityId);
        }
        
        // Map modal-specific parameters if this is a modal route
        if (modalId && matchedRoute.route.modals) {
            const modalConfig = matchedRoute.route.modals.find(m => m.id === modalId);
            if (modalConfig?.entitySupport?.enabled) {
                // Map primary parameter
                if (entityId) {
                    const modalParamName = modalConfig.entitySupport.paramName || 'entityId';
                    params[modalParamName] = entityId;
                    console.log('[RouterMatcher] Mapped entityId to modal param:', modalParamName, '=', entityId);
                }

                // Map secondary parameter
                if (secondaryEntityId && modalConfig.entitySupport.secondaryParam) {
                    const secondaryParamName = modalConfig.entitySupport.secondaryParam;
                    params[secondaryParamName] = secondaryEntityId;
                    console.log('[RouterMatcher] Mapped secondaryEntityId to modal param:', secondaryParamName, '=', secondaryEntityId);
                }
            }
        }

        // Build fullPath including entity parameters for proper URL reconstruction
        const fullPathWithEntities = [...matchedRoute.fullPath];
        if (modalId) fullPathWithEntities.push(modalId);
        if (entityId) fullPathWithEntities.push(entityId);
        if (secondaryEntityId) fullPathWithEntities.push(secondaryEntityId);

        return {
            success: true,
            route: matchedRoute.route,
            fullPath: fullPathWithEntities,
            entityId,
            secondaryEntityId,
            modalId,
            params,
            queryParams,
            matchedSegments: currentPath.length,
            totalSegments: segments.length
        };
    }

    /**
     * Find the last valid descendant when exact match fails
     */
    findLastValidDescendant(segments, queryParams) {
        let bestMatch = null;
        let bestMatchDepth = 0;

        // Try shorter and shorter path segments
        for (let depth = segments.length - 1; depth >= 0; depth--) {
            const testPath = segments.slice(0, depth + 1);
            const pathKey = testPath.join('/');
            const pathMatch = this.pathIndex.get(pathKey);

            if (pathMatch && depth >= bestMatchDepth) {
                bestMatch = pathMatch;
                bestMatchDepth = depth;
                break; // We found the deepest valid path
            }
        }

        if (!bestMatch) {
            // Fall back to default route
            return this.handleDefaultRoute(queryParams);
        }

        // Check if remaining segments could be entity ID
        let entityId = null;
        if (bestMatchDepth < segments.length - 1) {
            const potentialEntity = segments[bestMatchDepth + 1];
            if (bestMatch.route.entitySupport?.enabled) {
                if (this.validateEntityId(potentialEntity, bestMatch.route.entitySupport)) {
                    entityId = potentialEntity;
                }
            }
        }

        return {
            success: true,
            route: bestMatch.route,
            fullPath: bestMatch.fullPath,
            entityId,
            modalId: null,
            queryParams,
            partial: true,
            invalidSegments: segments.slice(bestMatchDepth + (entityId ? 2 : 1))
        };
    }

    /**
     * Validate entity ID against route configuration
     */
    validateEntityId(entityId, entitySupport) {
        if (!entitySupport || !entitySupport.enabled) {
            return false;
        }

        // Check against pattern if provided
        if (entitySupport.pattern) {
            try {
                const regex = new RegExp(entitySupport.pattern);
                return regex.test(entityId);
            } catch (error) {
                console.warn('[RouterMatcher] Invalid entity pattern:', entitySupport.pattern, error);
                return false;
            }
        }

        // Default validation - be more permissive for various entity types
        // This should handle corpus document paths with slashes and dots
        return /^[A-Za-z0-9_\-./]+$/.test(entityId);
    }

    /**
     * Check if modal is accessible from the given route context
     */
    isModalAccessibleFromRoute(modalData, currentRoute) {
        if (!modalData || !currentRoute) {
            return false;
        }

        // For the modals route, allow access to any modal since it's the consolidated modal route
        if (currentRoute.id === 'modals') {
            return true;
        }

        // Otherwise, modal must be defined in the current route or its ancestors
        return this.isRouteAncestorOf(modalData.parentRoute, currentRoute) || 
               modalData.parentRoute === currentRoute;
    }

    /**
     * Check if one route is an ancestor of another
     */
    isRouteAncestorOf(potentialAncestor, route) {
        const ancestorPath = this.routeIndex.get(potentialAncestor.id)?.fullPath || [];
        const routePath = this.routeIndex.get(route.id)?.fullPath || [];

        if (ancestorPath.length >= routePath.length) {
            return false;
        }

        // Check if ancestor path is a prefix of route path
        return ancestorPath.every((segment, index) => segment === routePath[index]);
    }

    /**
     * Build URL from route information
     * @param {string} routeId - Target route ID
     * @param {Object} options - URL building options
     * @returns {string} Built URL
     */
    buildUrl(routeId, options = {}) {
        const route = this.routeIndex.get(routeId);
        if (!route) {
            throw new Error(`Route '${routeId}' not found`);
        }

        let pathSegments = [...route.fullPath];

        // For modals route, add modal ID first, then entity ID
        if (routeId === 'modals') {
            // Add modal ID if provided
            if (options.modalId) {
                if (!route.route.modals?.some(modal => modal.id === options.modalId)) {
                    throw new Error(`Modal '${options.modalId}' not found in route '${routeId}'`);
                }
                pathSegments.push(options.modalId);
            }

            // Add entity ID if provided (after modal ID for modals route)
            if (options.entityId) {
                if (!route.route.entitySupport?.enabled) {
                    console.warn(`[RouterMatcher] Entity ID provided for route '${routeId}' but entitySupport is not enabled`);
                } else {
                    pathSegments.push(options.entityId);
                }
            }
        } else {
            // For other routes, add entity ID first, then modal ID
            // Add entity ID if provided
            if (options.entityId) {
                if (!route.route.entitySupport?.enabled) {
                    console.warn(`[RouterMatcher] Entity ID provided for route '${routeId}' but entitySupport is not enabled`);
                } else {
                    pathSegments.push(options.entityId);
                }
            }

            // Add modal ID if provided
            if (options.modalId) {
                if (!route.route.modals?.some(modal => modal.id === options.modalId)) {
                    throw new Error(`Modal '${options.modalId}' not found in route '${routeId}'`);
                }
                pathSegments.push(options.modalId);
            }
        }

        // Build path
        const pathname = '/' + pathSegments.join('/');

        // Build query string
        const queryParams = { ...options.queryParams };
        
        // Preserve configured query parameters
        const preserveParams = this.routeConfig.globalSettings?.preserveQueryParams || ['s', 'key'];
        const currentParams = this.parseQueryParams(window.location.search);
        
        preserveParams.forEach(param => {
            if (currentParams[param] && !(param in queryParams)) {
                queryParams[param] = currentParams[param];
            }
        });

        // Build query string
        const queryString = this.buildQueryString(queryParams);
        
        return pathname + (queryString ? '?' + queryString : '');
    }

    /**
     * Build query string from parameters object
     */
    buildQueryString(params) {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }

        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                searchParams.set(key, String(value));
            }
        });

        return searchParams.toString();
    }

    /**
     * Get route by ID
     */
    getRoute(routeId) {
        return this.routeIndex.get(routeId);
    }

    /**
     * Get modal by ID
     */
    getModal(modalId) {
        return this.modalIndex.get(modalId);
    }

    /**
     * Get all routes that match a filter function
     */
    findRoutes(filterFn) {
        const results = [];
        this.routeIndex.forEach((routeData, routeId) => {
            if (filterFn(routeData.route, routeId, routeData)) {
                results.push(routeData);
            }
        });
        return results;
    }

    /**
     * Get route hierarchy as tree structure
     */
    getRouteTree() {
        const buildTree = (routes, parentPath = []) => {
            return routes.map(route => {
                const currentPath = [...parentPath, route.path];
                return {
                    id: route.id,
                    path: route.path,
                    fullPath: currentPath,
                    title: route.title,
                    component: route.component,
                    access: route.access,
                    entitySupport: route.entitySupport,
                    modals: route.modals || [],
                    children: route.children ? buildTree(route.children, currentPath) : []
                };
            });
        };

        return buildTree(this.routeConfig.routes || []);
    }

    /**
     * Check if a path exists in the route configuration
     */
    pathExists(pathSegments) {
        const pathKey = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;
        return this.pathIndex.has(pathKey);
    }

    /**
     * Get suggestions for invalid paths (for error handling)
     */
    getSuggestions(invalidPath) {
        const suggestions = [];
        const invalidKey = Array.isArray(invalidPath) ? invalidPath.join('/') : invalidPath;
        
        // Find partial matches
        this.pathIndex.forEach((routeData, pathKey) => {
            if (pathKey.includes(invalidKey) || invalidKey.includes(pathKey)) {
                suggestions.push({
                    path: '/' + pathKey,
                    title: routeData.route.title || routeData.route.id,
                    description: routeData.route.description
                });
            }
        });

        // Limit suggestions and sort by relevance
        return suggestions
            .sort((a, b) => {
                // Prefer shorter paths (more likely to be what user wanted)
                return a.path.length - b.path.length;
            })
            .slice(0, 5);
    }
}