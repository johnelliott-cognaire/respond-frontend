// File: router/url-validator.js
/**
 * Enhanced URL Validation Service
 * 
 * Provides comprehensive URL validation with pattern matching,
 * entity ID validation, and helpful error messages for users.
 */

export class URLValidator {
    constructor(routeConfig) {
        this.routeConfig = routeConfig;
        this.entityPatterns = this.buildEntityPatterns();
        this.modalRegistry = this.buildModalRegistry();
    }

    /**
     * Build entity ID patterns from route configuration
     */
    buildEntityPatterns() {
        const patterns = new Map();
        
        // Common entity patterns
        patterns.set('default', {
            regex: /^[A-Za-z0-9_-]+$/,
            description: 'Alphanumeric characters, hyphens, and underscores'
        });
        
        patterns.set('document', {
            regex: /^[A-Z]{3}-\d{3,6}$/,
            description: 'Document format: ABC-123 (3 letters, dash, 3-6 digits)',
            examples: ['RFP-123', 'DOC-4567']
        });
        
        patterns.set('project', {
            regex: /^proj_[a-z0-9]{8,16}$/,
            description: 'Project format: proj_xxxxxxxx (proj_ prefix + 8-16 lowercase alphanumeric)',
            examples: ['proj_abc12345', 'proj_xyz789abcdef']
        });
        
        patterns.set('user', {
            regex: /^user_[a-z0-9]{8,12}$/,
            description: 'User format: user_xxxxxxxx (user_ prefix + 8-12 lowercase alphanumeric)',
            examples: ['user_john123', 'user_alice456789']
        });
        
        patterns.set('corpus_document', {
            regex: /^[a-z0-9_\/.-]+$/,
            description: 'Corpus document path: lowercase letters, numbers, underscores, slashes, dots, hyphens',
            examples: ['policies/security.pdf', 'guides/user-manual.docx']
        });

        return patterns;
    }

    /**
     * Build modal registry from route configuration
     */
    buildModalRegistry() {
        const registry = new Map();
        
        const collectModals = (routes) => {
            routes.forEach(route => {
                if (route.modals) {
                    route.modals.forEach(modal => {
                        registry.set(modal.id, {
                            id: modal.id,
                            title: modal.title,
                            route: route.id,
                            // URLValidator only tracks modal existence for syntax validation
                            // Security is handled by main router
                        });
                    });
                }
                
                if (route.children) {
                    collectModals(route.children);
                }
            });
        };
        
        if (this.routeConfig?.routes) {
            collectModals(this.routeConfig.routes);
        }
        
        return registry;
    }

    /**
     * Validate a complete URL path
     * @param {string} url - URL path to validate
     * @param {Object} context - Validation context (user permissions, etc.)
     * @returns {Object} Validation result
     */
    validateURL(url, context = {}) {
        const result = {
            valid: true,
            warnings: [],
            errors: [],
            suggestions: [],
            partialMatch: null,
            entityValidation: null,
            modalValidation: null
        };

        try {
            // Parse URL components
            const urlParts = this.parseURL(url);
            
            // Validate path structure
            const pathValidation = this.validatePath(urlParts.path);
            if (!pathValidation.valid) {
                result.valid = false;
                result.errors.push(...pathValidation.errors);
                result.partialMatch = pathValidation.partialMatch;
            }

            // Validate entity ID if present
            if (urlParts.entityId) {
                const entityValidation = this.validateEntityID(urlParts.entityId, urlParts.route);
                result.entityValidation = entityValidation;
                
                if (!entityValidation.valid) {
                    result.valid = false;
                    result.errors.push(...entityValidation.errors);
                    result.suggestions.push(...entityValidation.suggestions);
                }
            }

            // Validate modal ID if present
            if (urlParts.modalId) {
                const modalValidation = this.validateModalID(urlParts.modalId, urlParts.route, context);
                result.modalValidation = modalValidation;
                
                if (!modalValidation.valid) {
                    result.valid = false;
                    result.errors.push(...modalValidation.errors);
                    result.suggestions.push(...modalValidation.suggestions);
                }
            }

            // Validate route-level security
            const securityValidation = this.validateRouteSecurity(urlParts.route, urlParts.modalId, context);
            if (!securityValidation.valid) {
                result.valid = false;
                result.errors.push(...securityValidation.errors);
                result.suggestions.push(...securityValidation.suggestions);
            }

            // Generate helpful suggestions
            if (!result.valid) {
                result.suggestions.push(...this.generateSuggestions(urlParts, result));
            }

        } catch (error) {
            result.valid = false;
            result.errors.push(`URL parsing error: ${error.message}`);
        }

        return result;
    }

    /**
     * Parse URL into components
     */
    parseURL(url) {
        const urlObj = new URL(url, window.location.origin);
        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        
        // Determine if last part is entity ID or modal ID
        let entityId = null;
        let modalId = null;
        let routeParts = [...pathParts];

        if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            
            // Check if it's a modal ID (modals typically don't contain certain characters)
            if (this.modalRegistry.has(lastPart)) {
                modalId = lastPart;
                routeParts = pathParts.slice(0, -1);
            } else if (this.looksLikeEntityID(lastPart)) {
                entityId = lastPart;
                routeParts = pathParts.slice(0, -1);
            }
        }

        return {
            original: url,
            path: urlObj.pathname,
            routeParts,
            entityId,
            modalId,
            queryParams: urlObj.search,
            route: routeParts.join('/')
        };
    }

    /**
     * Check if a string looks like an entity ID
     */
    looksLikeEntityID(str) {
        // Entity IDs typically contain dashes, underscores, or are alphanumeric
        // Modal IDs are typically simple words or snake_case
        return /[A-Z0-9-]|_[a-z0-9]/.test(str) && !str.includes('_wizard') && !str.includes('_modal');
    }

    /**
     * Validate URL path structure
     */
    validatePath(path) {
        const result = {
            valid: true,
            errors: [],
            partialMatch: null
        };

        // This would integrate with the existing router matcher
        // For now, provide basic validation
        const pathParts = path.split('/').filter(part => part.length > 0);
        
        if (pathParts.length === 0) {
            result.partialMatch = '/docs'; // Default route
            return result;
        }

        // Check for valid top-level routes
        const topLevel = pathParts[0];
        const validTopLevel = ['auth', 'docs', 'corpus'];
        
        if (!validTopLevel.includes(topLevel)) {
            result.valid = false;
            result.errors.push(`Unknown top-level route: '${topLevel}'`);
            result.partialMatch = '/docs';
        }

        return result;
    }

    /**
     * Validate entity ID format
     */
    validateEntityID(entityId, routeContext) {
        const result = {
            valid: true,
            errors: [],
            suggestions: [],
            pattern: null,
            examples: []
        };

        // Determine expected pattern based on route context
        let expectedPattern = 'default';
        
        if (routeContext.includes('docs') || routeContext.includes('document')) {
            expectedPattern = 'document';
        } else if (routeContext.includes('project')) {
            expectedPattern = 'project';
        } else if (routeContext.includes('user')) {
            expectedPattern = 'user';
        } else if (routeContext.includes('corpus')) {
            expectedPattern = 'corpus_document';
        }

        const pattern = this.entityPatterns.get(expectedPattern);
        result.pattern = pattern;

        if (pattern && !pattern.regex.test(entityId)) {
            result.valid = false;
            result.errors.push(`Invalid entity ID format: '${entityId}'`);
            result.suggestions.push(`Expected format: ${pattern.description}`);
            
            if (pattern.examples) {
                result.examples = pattern.examples;
                result.suggestions.push(`Examples: ${pattern.examples.join(', ')}`);
            }
        }

        return result;
    }

    /**
     * Validate modal ID existence and access
     */
    validateModalID(modalId, routeContext, context = {}) {
        const result = {
            valid: true,
            errors: [],
            suggestions: [],
            modal: null
        };

        const modal = this.modalRegistry.get(modalId);
        
        if (!modal) {
            result.valid = false;
            result.errors.push(`Unknown modal: '${modalId}'`);
            
            // Suggest similar modal names
            const similar = this.findSimilarModals(modalId);
            if (similar.length > 0) {
                result.suggestions.push(`Did you mean: ${similar.join(', ')}?`);
            }
            
            // Suggest available modals for this route
            const availableModals = this.getAvailableModalsForRoute(routeContext);
            if (availableModals.length > 0) {
                result.suggestions.push(`Available modals: ${availableModals.join(', ')}`);
            }
        } else {
            result.modal = modal;
            
            // Check if modal is accessible in this route context
            if (modal.route !== routeContext && !routeContext.startsWith(modal.route)) {
                result.valid = false;
                result.errors.push(`Modal '${modalId}' is not available in route '${routeContext}'`);
                result.suggestions.push(`This modal is available in: /${modal.route}`);
            }
            
            // Check permissions if provided
            if (context.userPermissions && modal.permissions.length > 0) {
                const hasPermission = modal.permissions.some(perm => 
                    context.userPermissions.includes(perm)
                );
                
                if (!hasPermission) {
                    result.valid = false;
                    result.errors.push(`Insufficient permissions to access modal '${modalId}'`);
                    result.suggestions.push(`Required permissions: ${modal.permissions.join(', ')}`);
                }
            }
        }

        return result;
    }

    /**
     * Find modals with similar names
     */
    findSimilarModals(modalId, maxDistance = 2) {
        const similar = [];
        
        for (const [id] of this.modalRegistry) {
            if (this.levenshteinDistance(modalId, id) <= maxDistance) {
                similar.push(id);
            }
        }
        
        return similar.slice(0, 3); // Limit to 3 suggestions
    }

    /**
     * Get available modals for a route
     */
    getAvailableModalsForRoute(routeContext) {
        const available = [];
        
        for (const [id, modal] of this.modalRegistry) {
            if (modal.route === routeContext || routeContext.startsWith(modal.route)) {
                available.push(id);
            }
        }
        
        return available.slice(0, 5); // Limit to 5 suggestions
    }

    /**
     * Generate helpful suggestions for invalid URLs
     */
    generateSuggestions(urlParts, validationResult) {
        const suggestions = [];
        
        // Suggest navigating to partial match
        if (validationResult.partialMatch) {
            suggestions.push(`Try navigating to: ${validationResult.partialMatch}`);
        }
        
        // Suggest fixing entity ID format
        if (validationResult.entityValidation && !validationResult.entityValidation.valid) {
            suggestions.push('Check the entity ID format in the URL');
        }
        
        // Suggest available routes
        if (urlParts.routeParts.length === 0) {
            suggestions.push('Available sections: /docs, /corpus, /auth');
        }
        
        return suggestions;
    }

    /**
     * Calculate Levenshtein distance for string similarity
     */
    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,     // deletion
                    matrix[j - 1][i] + 1,     // insertion
                    matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Validate route-level security (authentication and permissions)
     */
    validateRouteSecurity(routePath, modalId, context = {}) {
        const result = {
            valid: true,
            errors: [],
            suggestions: []
        };

        // Find the route configuration
        const route = this.findRouteConfig(routePath);
        
        if (!route) {
            // If route not found, assume it's valid (handled by path validation)
            return result;
        }

        // URLValidator focuses on syntax validation only
        // Security checking is handled by the main router using security.js
        console.log('[URLValidator] 📋 Syntax validation complete for route:', route.id || routePath, 
            modalId ? `modal: ${modalId}` : '(no modal)');

        return result;
    }

    /**
     * Find route configuration by path
     */
    findRouteConfig(routePath) {
        if (!this.routeConfig || !this.routeConfig.routes) {
            return null;
        }

        // Simple path matching for main routes
        const pathParts = routePath.split('/').filter(part => part.length > 0);
        if (pathParts.length === 0) {
            return null;
        }

        const topLevel = pathParts[0];
        
        // Find the route by ID matching the top-level path
        const route = this.routeConfig.routes.find(r => r.id === topLevel || r.path === topLevel);
        
        return route || null;
    }

    /**
     * Update patterns and registry when configuration changes
     */
    updateConfiguration(routeConfig) {
        this.routeConfig = routeConfig;
        this.entityPatterns = this.buildEntityPatterns();
        this.modalRegistry = this.buildModalRegistry();
    }

    /**
     * Validates entity ID format (test-compatible method with lowercase 'd')
     * @param {string} entityId - The entity ID to validate
     * @param {string} entityType - The type of entity (document, project, user, corpus_document)
     * @returns {Object} Validation result with success status and details
     */
    validateEntityId(entityId, entityType) {
        if (!entityId || typeof entityId !== 'string') {
            return {
                valid: false,
                success: false,
                error: 'Entity ID must be a non-empty string',
                entityId,
                entityType
            };
        }

        if (!entityType || typeof entityType !== 'string') {
            return {
                valid: false,
                success: false,
                error: 'Entity type must be a non-empty string',
                entityId,
                entityType
            };
        }

        const pattern = this.entityPatterns.get(entityType);
        if (!pattern) {
            return {
                valid: false,
                success: false,
                error: `Unknown entity type: ${entityType}`,
                entityId,
                entityType,
                supportedTypes: Array.from(this.entityPatterns.keys())
            };
        }

        try {
            const isValid = pattern.regex.test(entityId);
            return {
                valid: isValid,
                success: isValid,
                error: isValid ? null : `Entity ID '${entityId}' does not match required pattern for type '${entityType}': ${pattern.description}`,
                entityId,
                entityType,
                pattern: pattern.regex.source,
                examples: pattern.examples || []
            };
        } catch (error) {
            return {
                valid: false,
                success: false,
                error: `Invalid regex pattern for entity type '${entityType}': ${error.message}`,
                entityId,
                entityType
            };
        }
    }

    /**
     * Validates modal ID format and existence (test-compatible method with lowercase 'd')
     * @param {string} modalId - The modal ID to validate
     * @param {string} routeId - The route ID to check modal availability (optional)
     * @returns {Object} Validation result with success status and details
     */
    validateModalId(modalId, routeId) {
        if (!modalId || typeof modalId !== 'string') {
            return {
                valid: false,
                success: false,
                error: 'Modal ID must be a non-empty string',
                modalId
            };
        }

        // Modal ID pattern: lowercase letters, numbers, and underscores, starting with lowercase letter
        const pattern = /^[a-z][a-z0-9_]*$/;
        const isValid = pattern.test(modalId);

        if (!isValid) {
            return {
                valid: false,
                success: false,
                error: `Modal ID '${modalId}' must match pattern ${pattern.source} (lowercase letters, numbers, underscores, starting with letter)`,
                modalId,
                pattern: pattern.source,
                examples: ['user_modal', 'document_edit', 'settings_dialog', 'project_create']
            };
        }

        // If routeId is provided, check if modal exists in that route
        if (routeId) {
            const route = this.findRouteById(routeId);
            if (route) {
                const modalExists = route.modals && route.modals.some(modal => modal.id === modalId);
                if (!modalExists) {
                    return {
                        valid: false,
                        success: false,
                        error: `Modal '${modalId}' does not exist in route '${routeId}'`,
                        modalId,
                        routeId,
                        availableModals: route.modals ? route.modals.map(m => m.id) : []
                    };
                }
            } else {
                return {
                    valid: false,
                    success: false,
                    error: `Route '${routeId}' not found`,
                    modalId,
                    routeId
                };
            }
        }

        return {
            valid: true,
            success: true,
            error: null,
            modalId,
            routeId,
            pattern: pattern.source,
            examples: ['user_modal', 'document_edit', 'settings_dialog', 'project_create']
        };
    }

    /**
     * Find route by ID
     * @param {string} routeId - The route ID to find
     * @returns {Object|null} Route configuration or null if not found
     */
    findRouteById(routeId) {
        if (!this.routeConfig || !this.routeConfig.routes) {
            return null;
        }

        const findInRoutes = (routes) => {
            for (const route of routes) {
                if (route.id === routeId) {
                    return route;
                }
                if (route.children) {
                    const found = findInRoutes(route.children);
                    if (found) return found;
                }
            }
            return null;
        };

        return findInRoutes(this.routeConfig.routes);
    }
}

/**
 * Create URL validator instance
 */
export function createURLValidator(routeConfig) {
    return new URLValidator(routeConfig);
}