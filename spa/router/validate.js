// File: frontend/spa/router/validate.js
/**
 * Router Configuration Validator
 * 
 * Provides fail-fast validation for router JSON configuration against the schema.
 * Validates structural integrity, cross-references, and security constraints.
 */

export class RouterValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.routeMap = new Map(); // For cross-reference validation
        this.pathMap = new Map(); // For path uniqueness validation
    }

    /**
     * Validates complete router configuration
     * @param {Object} config - Router configuration object
     * @returns {Object} Validation result with success status and messages
     */
    validate(config) {
        this.reset();

        try {
            // Phase 1: Basic structure validation
            this.validateBasicStructure(config);
            
            // Phase 2: Schema compliance validation  
            this.validateSchema(config);
            
            // Phase 3: Route hierarchy validation
            this.validateRouteHierarchy(config.routes || []);
            
            // Phase 4: Cross-reference validation
            this.validateCrossReferences(config.routes || []);
            
            // Phase 5: Security validation
            this.validateSecurity(config.routes || []);

            return {
                success: this.errors.length === 0,
                errors: [...this.errors],
                warnings: [...this.warnings],
                summary: this.generateValidationSummary()
            };

        } catch (error) {
            this.errors.push(`Critical validation error: ${error.message}`);
            return {
                success: false,
                errors: [...this.errors],
                warnings: [...this.warnings],
                summary: 'Validation failed due to critical error'
            };
        }
    }

    /**
     * Reset validation state for new validation run
     */
    reset() {
        this.errors = [];
        this.warnings = [];
        this.routeMap.clear();
        this.pathMap.clear();
    }

    /**
     * Validate basic JSON structure and required fields
     */
    validateBasicStructure(config) {
        if (!config || typeof config !== 'object') {
            this.errors.push('Configuration must be a valid object');
            return;
        }

        // Required top-level fields
        const required = ['$schema', 'version', 'routes'];
        for (const field of required) {
            if (!(field in config)) {
                this.errors.push(`Missing required field: ${field}`);
            }
        }

        // Version format validation
        if (config.version && !/^\d+\.\d+\.\d+$/.test(config.version)) {
            this.errors.push(`Invalid version format: ${config.version}. Expected semantic version (e.g., "1.0.0")`);
        }

        // Routes must be array
        if (config.routes && !Array.isArray(config.routes)) {
            this.errors.push('Routes must be an array');
        }

        if (Array.isArray(config.routes) && config.routes.length === 0) {
            this.errors.push('Routes array cannot be empty');
        }
    }

    /**
     * Validate schema compliance for all configuration elements
     */
    validateSchema(config) {
        // Global settings validation
        if (config.globalSettings) {
            this.validateGlobalSettings(config.globalSettings);
        }

        // Validate each route
        if (Array.isArray(config.routes)) {
            config.routes.forEach((route, index) => {
                this.validateRoute(route, `routes[${index}]`, []);
            });
        }
    }

    /**
     * Validate global settings object
     */
    validateGlobalSettings(settings) {
        const allowedSettings = [
            'preserveQueryParams', 'defaultRoute', 'errorRoute', 'enableHistoryMode',
            'enableDeepLinking', 'maxHistoryDepth', 'routeTransitionDelay', 
            'enableAnalytics', 'urlValidation'
        ];
        
        Object.keys(settings).forEach(key => {
            if (!allowedSettings.includes(key)) {
                this.warnings.push(`Unknown global setting: ${key}`);
            }
        });

        // Validate preserveQueryParams
        if (settings.preserveQueryParams) {
            if (!Array.isArray(settings.preserveQueryParams)) {
                this.errors.push('preserveQueryParams must be an array');
            } else {
                settings.preserveQueryParams.forEach((param, idx) => {
                    if (typeof param !== 'string' || param.length === 0) {
                        this.errors.push(`Invalid query parameter at index ${idx}: must be non-empty string`);
                    }
                });
            }
        }

        // Validate boolean settings
        ['enableHistoryMode', 'enableDeepLinking', 'enableAnalytics'].forEach(setting => {
            if (setting in settings && typeof settings[setting] !== 'boolean') {
                this.errors.push(`${setting} must be a boolean value`);
            }
        });

        // Validate numeric settings
        if ('maxHistoryDepth' in settings) {
            if (!Number.isInteger(settings.maxHistoryDepth) || settings.maxHistoryDepth < 1) {
                this.errors.push('maxHistoryDepth must be a positive integer');
            }
        }

        if ('routeTransitionDelay' in settings) {
            if (typeof settings.routeTransitionDelay !== 'number' || settings.routeTransitionDelay < 0) {
                this.errors.push('routeTransitionDelay must be a non-negative number');
            }
        }

        // Validate urlValidation object
        if (settings.urlValidation) {
            if (typeof settings.urlValidation !== 'object') {
                this.errors.push('urlValidation must be an object');
            } else {
                this.validateURLValidationSettings(settings.urlValidation);
            }
        }
    }

    /**
     * Validate URL validation settings object
     */
    validateURLValidationSettings(urlValidation) {
        // Validate entityIdPatterns
        if (urlValidation.entityIdPatterns) {
            if (typeof urlValidation.entityIdPatterns !== 'object') {
                this.errors.push('urlValidation.entityIdPatterns must be an object');
            } else {
                Object.entries(urlValidation.entityIdPatterns).forEach(([key, pattern]) => {
                    if (typeof pattern !== 'string' || pattern.length === 0) {
                        this.errors.push(`urlValidation.entityIdPatterns.${key} must be a non-empty string`);
                    } else {
                        try {
                            new RegExp(pattern);
                        } catch (error) {
                            this.errors.push(`urlValidation.entityIdPatterns.${key} is not a valid regex: ${error.message}`);
                        }
                    }
                });
            }
        }

        // Validate boolean settings
        if ('strictValidation' in urlValidation && typeof urlValidation.strictValidation !== 'boolean') {
            this.errors.push('urlValidation.strictValidation must be a boolean');
        }

        if ('showValidationErrors' in urlValidation && typeof urlValidation.showValidationErrors !== 'boolean') {
            this.errors.push('urlValidation.showValidationErrors must be a boolean');
        }
    }

    /**
     * Validate individual route configuration
     */
    validateRoute(route, path, parentPath) {
        if (!route || typeof route !== 'object') {
            this.errors.push(`${path}: Route must be an object`);
            return;
        }

        // Required fields
        ['id', 'path'].forEach(field => {
            if (!(field in route)) {
                this.errors.push(`${path}: Missing required field '${field}'`);
            }
        });

        // Validate route ID
        if (route.id) {
            if (!/^[a-z][a-z0-9_]*$/.test(route.id)) {
                this.errors.push(`${path}: Route ID '${route.id}' must match pattern /^[a-z][a-z0-9_]*$/`);
            }

            // Check for duplicate IDs
            if (this.routeMap.has(route.id)) {
                this.errors.push(`${path}: Duplicate route ID '${route.id}' found`);
            } else {
                this.routeMap.set(route.id, { route, path, parentPath });
            }
        }

        // Validate route path
        if (route.path) {
            if (!/^[a-z][a-z0-9_-]*$/.test(route.path)) {
                this.errors.push(`${path}: Route path '${route.path}' must match pattern /^[a-z][a-z0-9_-]*$/`);
            }

            // Check for duplicate paths at same level
            const fullPath = [...parentPath, route.path].join('/');
            if (this.pathMap.has(fullPath)) {
                this.errors.push(`${path}: Duplicate path '${fullPath}' found`);
            } else {
                this.pathMap.set(fullPath, path);
            }
        }

        // Validate component configuration
        if (route.component) {
            this.validateComponent(route.component, `${path}.component`);
        }

        // Validate access configuration
        if (route.access) {
            this.validateAccess(route.access, `${path}.access`);
        }

        // Validate entity support
        if (route.entitySupport) {
            this.validateEntitySupport(route.entitySupport, `${path}.entitySupport`);
        }

        // Validate navigation settings
        if (route.navigation) {
            this.validateNavigation(route.navigation, `${path}.navigation`);
        }

        // Validate transitions
        if (route.transitions) {
            this.validateTransitions(route.transitions, `${path}.transitions`);
        }

        // Validate modals
        if (route.modals) {
            this.validateModals(route.modals, `${path}.modals`);
        }

        // Recursively validate children
        if (route.children) {
            if (!Array.isArray(route.children)) {
                this.errors.push(`${path}.children: Must be an array`);
            } else {
                const childPath = [...parentPath, route.path];
                route.children.forEach((child, index) => {
                    this.validateRoute(child, `${path}.children[${index}]`, childPath);
                });
            }
        }
    }

    /**
     * Validate component configuration
     */
    validateComponent(component, path) {
        if (!component.type) {
            this.errors.push(`${path}: Missing required field 'type'`);
        } else if (!['view', 'modal'].includes(component.type)) {
            this.errors.push(`${path}.type: Must be 'view' or 'modal'`);
        }

        // Factory is recommended but not always required
        if (!component.factory) {
            this.warnings.push(`${path}: No factory method specified`);
        }

        // Validate module path format
        if (component.module && !/^[a-zA-Z0-9_/-]+\.js$/.test(component.module)) {
            this.warnings.push(`${path}.module: Module path should end with .js`);
        }
    }

    /**
     * Validate access control configuration
     */
    validateAccess(access, path) {
        const validPermissions = [
            'SYSTEM_ADMIN', 'APP_ADMIN', 'APP_ACCESS', 'ACCOUNT_VIEWER', 'ACCOUNT_EDITOR',
            'PROJECT_VIEWER', 'PROJECT_EDITOR', 'CORPUS_VIEWER', 'CORPUS_EDITOR', 
            'CORPUS_APPROVER', 'CORPUS_ADMIN'
        ];

        // Validate requiresAuth
        if ('requiresAuth' in access && typeof access.requiresAuth !== 'boolean') {
            this.errors.push(`${path}.requiresAuth: Must be a boolean`);
        }

        // Validate permissionsAnyOf
        if (access.permissionsAnyOf) {
            if (!Array.isArray(access.permissionsAnyOf)) {
                this.errors.push(`${path}.permissionsAnyOf: Must be an array`);
            } else {
                access.permissionsAnyOf.forEach((permission, idx) => {
                    if (!validPermissions.includes(permission)) {
                        this.errors.push(`${path}.permissionsAnyOf[${idx}]: Invalid permission '${permission}'`);
                    }
                });
            }
        }

        // Validate permissionsAllOf
        if (access.permissionsAllOf) {
            if (!Array.isArray(access.permissionsAllOf)) {
                this.errors.push(`${path}.permissionsAllOf: Must be an array`);
            } else {
                access.permissionsAllOf.forEach((permission, idx) => {
                    if (!validPermissions.includes(permission)) {
                        this.errors.push(`${path}.permissionsAllOf[${idx}]: Invalid permission '${permission}'`);
                    }
                });
            }
        }

        // Warn if both permissionsAnyOf and permissionsAllOf are specified
        if (access.permissionsAnyOf && access.permissionsAllOf) {
            this.warnings.push(`${path}: Both permissionsAnyOf and permissionsAllOf specified. permissionsAllOf takes precedence.`);
        }
    }

    /**
     * Validate entity support configuration
     */
    validateEntitySupport(entitySupport, path) {
        if (typeof entitySupport.enabled !== 'boolean') {
            this.errors.push(`${path}.enabled: Must be a boolean`);
        }

        if (entitySupport.paramName && !/^[a-zA-Z][a-zA-Z0-9]*$/.test(entitySupport.paramName)) {
            this.errors.push(`${path}.paramName: Must match pattern /^[a-zA-Z][a-zA-Z0-9]*$/`);
        }

        if (entitySupport.pattern) {
            try {
                new RegExp(entitySupport.pattern);
            } catch (error) {
                this.errors.push(`${path}.pattern: Invalid regex pattern - ${error.message}`);
            }
        }

        if (entitySupport.validation) {
            if (entitySupport.validation.cacheTime !== undefined) {
                const cacheTime = entitySupport.validation.cacheTime;
                if (!Number.isInteger(cacheTime) || cacheTime < 0) {
                    this.errors.push(`${path}.validation.cacheTime: Must be a non-negative integer`);
                }
            }
        }
    }

    /**
     * Validate navigation configuration
     */
    validateNavigation(navigation, path) {
        if ('showInNavigation' in navigation && typeof navigation.showInNavigation !== 'boolean') {
            this.errors.push(`${path}.showInNavigation: Must be a boolean`);
        }

        if ('order' in navigation && !Number.isInteger(navigation.order)) {
            this.errors.push(`${path}.order: Must be an integer`);
        }

        if (navigation.badge) {
            if (typeof navigation.badge.enabled !== 'boolean') {
                this.errors.push(`${path}.badge.enabled: Must be a boolean`);
            }

            if (navigation.badge.color && !['primary', 'secondary', 'danger', 'warning', 'success'].includes(navigation.badge.color)) {
                this.errors.push(`${path}.badge.color: Invalid color value`);
            }
        }
    }

    /**
     * Validate transitions configuration
     */
    validateTransitions(transitions, path) {
        Object.keys(transitions).forEach(transitionKey => {
            if (!/^[a-z][a-z0-9_]*$/.test(transitionKey)) {
                this.errors.push(`${path}.${transitionKey}: Transition key must match pattern /^[a-z][a-z0-9_]*$/`);
            }

            const transition = transitions[transitionKey];
            if (!transition.target) {
                this.errors.push(`${path}.${transitionKey}: Missing required field 'target'`);
            }

            if (transition.trigger && !['click', 'doubleclick', 'contextmenu', 'custom'].includes(transition.trigger)) {
                this.errors.push(`${path}.${transitionKey}.trigger: Invalid trigger type`);
            }

            if ('preserveEntity' in transition && typeof transition.preserveEntity !== 'boolean') {
                this.errors.push(`${path}.${transitionKey}.preserveEntity: Must be a boolean`);
            }
        });
    }

    /**
     * Validate modals configuration
     */
    validateModals(modals, path) {
        if (!Array.isArray(modals)) {
            this.errors.push(`${path}: Must be an array`);
            return;
        }

        const modalIds = new Set();
        modals.forEach((modal, index) => {
            const modalPath = `${path}[${index}]`;
            
            if (!modal.id) {
                this.errors.push(`${modalPath}: Missing required field 'id'`);
            } else {
                if (!/^[a-z][a-z0-9_]*$/.test(modal.id)) {
                    this.errors.push(`${modalPath}.id: Must match pattern /^[a-z][a-z0-9_]*$/`);
                }

                if (modalIds.has(modal.id)) {
                    this.errors.push(`${modalPath}.id: Duplicate modal ID '${modal.id}'`);
                } else {
                    modalIds.add(modal.id);
                }
            }

            if (modal.component) {
                this.validateComponent(modal.component, `${modalPath}.component`);
            }

            if (modal.access) {
                this.validateAccess(modal.access, `${modalPath}.access`);
            }

            if (modal.meta && modal.meta.size) {
                if (!['small', 'medium', 'large', 'xlarge'].includes(modal.meta.size)) {
                    this.errors.push(`${modalPath}.meta.size: Invalid size value`);
                }
            }
        });
    }

    /**
     * Validate route hierarchy for logical consistency
     */
    validateRouteHierarchy(routes) {
        // Check for circular dependencies in transitions
        const visited = new Set();
        const recursionStack = new Set();

        const checkCircularDependency = (routeId, path = []) => {
            if (recursionStack.has(routeId)) {
                this.errors.push(`Circular transition dependency detected: ${path.concat(routeId).join(' -> ')}`);
                return;
            }

            if (visited.has(routeId)) {
                return;
            }

            visited.add(routeId);
            recursionStack.add(routeId);

            const routeData = this.routeMap.get(routeId);
            if (routeData && routeData.route.transitions) {
                Object.values(routeData.route.transitions).forEach(transition => {
                    if (transition.target) {
                        checkCircularDependency(transition.target, path.concat(routeId));
                    }
                });
            }

            recursionStack.delete(routeId);
        };

        // Check each route for circular dependencies
        this.routeMap.forEach((_, routeId) => {
            if (!visited.has(routeId)) {
                checkCircularDependency(routeId);
            }
        });
    }

    /**
     * Validate cross-references between routes
     */
    validateCrossReferences(routes) {
        // Validate transition targets exist
        this.routeMap.forEach(({ route, path }) => {
            if (route.transitions) {
                Object.entries(route.transitions).forEach(([key, transition]) => {
                    if (transition.target && !this.routeMap.has(transition.target)) {
                        this.errors.push(`${path}.transitions.${key}.target: Route '${transition.target}' does not exist`);
                    }
                });
            }
        });
    }

    /**
     * Validate security-related configurations
     */
    validateSecurity(routes) {
        let hasPublicRoute = false;
        let hasAuthenticatedRoute = false;

        this.routeMap.forEach(({ route, path }) => {
            // Handle missing access configuration
            if (!route.access) {
                // Routes without access configuration default to requiring auth
                hasAuthenticatedRoute = true;
                this.warnings.push(`${path}: No access configuration found. Defaulting to requiresAuth: true`);
                return;
            }

            // Handle explicit authentication requirement
            let requiresAuth;
            if (route.access.requiresAuth === undefined) {
                // If requiresAuth is not explicitly set, default to true for security
                requiresAuth = true;
                this.warnings.push(`${path}.access: requiresAuth not explicitly set. Defaulting to true for security`);
            } else {
                requiresAuth = route.access.requiresAuth;
            }
            
            if (requiresAuth) {
                hasAuthenticatedRoute = true;
                
                // For authenticated routes, check if they have proper permissions
                if (!route.access.permissionsAnyOf && !route.access.permissionsAllOf) {
                    this.warnings.push(`${path}: Authenticated route has no permission requirements. Consider adding permissionsAnyOf or permissionsAllOf`);
                }
            } else {
                hasPublicRoute = true;
            }

            // Error for routes with permissions but no auth requirement
            if (!requiresAuth && (route.access.permissionsAnyOf || route.access.permissionsAllOf)) {
                this.errors.push(`${path}: Route has permission requirements but requiresAuth is false. This is a security misconfiguration`);
            }

            // Validate that permission arrays are not empty
            if (route.access.permissionsAnyOf && Array.isArray(route.access.permissionsAnyOf) && route.access.permissionsAnyOf.length === 0) {
                this.errors.push(`${path}.access.permissionsAnyOf: Empty permission array. Remove the field or add valid permissions`);
            }

            if (route.access.permissionsAllOf && Array.isArray(route.access.permissionsAllOf) && route.access.permissionsAllOf.length === 0) {
                this.errors.push(`${path}.access.permissionsAllOf: Empty permission array. Remove the field or add valid permissions`);
            }
        });

        if (!hasPublicRoute) {
            this.warnings.push('No public routes found. Users may not be able to access the application when not authenticated.');
        }

        if (!hasAuthenticatedRoute) {
            this.warnings.push('No authenticated routes found. Application may not have protected areas.');
        }
    }

    /**
     * Generate validation summary
     */
    generateValidationSummary() {
        const routeCount = this.routeMap.size;
        const pathCount = this.pathMap.size;
        const errorCount = this.errors.length;
        const warningCount = this.warnings.length;

        return `Validation complete: ${routeCount} routes, ${pathCount} paths. ${errorCount} errors, ${warningCount} warnings.`;
    }

    /**
     * Get detailed validation report
     */
    getDetailedReport() {
        return {
            statistics: {
                totalRoutes: this.routeMap.size,
                totalPaths: this.pathMap.size,
                errorCount: this.errors.length,
                warningCount: this.warnings.length
            },
            routes: Array.from(this.routeMap.entries()).map(([id, data]) => ({
                id,
                path: data.path,
                parentPath: data.parentPath,
                hasChildren: !!data.route.children?.length,
                hasModals: !!data.route.modals?.length,
                requiresAuth: data.route.access?.requiresAuth !== false
            })),
            errors: [...this.errors],
            warnings: [...this.warnings]
        };
    }
}

/**
 * Convenience function for quick validation
 * @param {Object} config - Router configuration to validate
 * @returns {Object} Validation result
 */
export function validateRouterConfig(config) {
    const validator = new RouterValidator();
    return validator.validate(config);
}

/**
 * Convenience function for detailed validation report
 * @param {Object} config - Router configuration to validate
 * @returns {Object} Detailed validation report
 */
export function getValidationReport(config) {
    const validator = new RouterValidator();
    const result = validator.validate(config);
    
    return {
        ...result,
        details: validator.getDetailedReport()
    };
}

/**
 * Validates entity ID format according to defined patterns
 * @param {string} entityId - The entity ID to validate
 * @param {string} entityType - The type of entity (document, project, user, corpus_document)
 * @param {Object} patterns - Optional patterns object, uses default patterns if not provided
 * @returns {Object} Validation result with success status and details
 */
export function validateEntityId(entityId, entityType, patterns = null) {
    if (!entityId || typeof entityId !== 'string') {
        return {
            success: false,
            error: 'Entity ID must be a non-empty string',
            entityId,
            entityType
        };
    }

    if (!entityType || typeof entityType !== 'string') {
        return {
            success: false,
            error: 'Entity type must be a non-empty string',
            entityId,
            entityType
        };
    }

    // Default entity ID patterns matching globalSettings.urlValidation.entityIdPatterns
    const defaultPatterns = {
        'document': '^[A-Z]{3}-\\d{3,6}$',
        'project': '^proj_[a-z0-9]{8,16}$',
        'user': '^user_[a-z0-9]{8,12}$',
        'corpus_document': '^[a-z0-9_\\/.\\-]+$'
    };

    const entityPatterns = patterns || defaultPatterns;
    const pattern = entityPatterns[entityType];

    if (!pattern) {
        return {
            success: false,
            error: `Unknown entity type: ${entityType}`,
            entityId,
            entityType,
            supportedTypes: Object.keys(entityPatterns)
        };
    }

    try {
        const regex = new RegExp(pattern);
        const isValid = regex.test(entityId);

        return {
            success: isValid,
            error: isValid ? null : `Entity ID '${entityId}' does not match required pattern for type '${entityType}': ${pattern}`,
            entityId,
            entityType,
            pattern,
            examples: getEntityIdExamples(entityType)
        };
    } catch (error) {
        return {
            success: false,
            error: `Invalid regex pattern for entity type '${entityType}': ${error.message}`,
            entityId,
            entityType,
            pattern
        };
    }
}

/**
 * Validates modal ID format for routing
 * @param {string} modalId - The modal ID to validate
 * @returns {Object} Validation result with success status and details
 */
export function validateModalId(modalId) {
    if (!modalId || typeof modalId !== 'string') {
        return {
            success: false,
            error: 'Modal ID must be a non-empty string',
            modalId
        };
    }

    // Modal ID pattern: lowercase letters, numbers, and underscores, starting with lowercase letter
    const pattern = '^[a-z][a-z0-9_]*$';
    const regex = new RegExp(pattern);
    const isValid = regex.test(modalId);

    return {
        success: isValid,
        error: isValid ? null : `Modal ID '${modalId}' must match pattern ${pattern} (lowercase letters, numbers, underscores, starting with letter)`,
        modalId,
        pattern,
        examples: ['user_modal', 'document_edit', 'settings_dialog', 'project_create']
    };
}

/**
 * Get example entity IDs for a given entity type
 * @param {string} entityType - The entity type
 * @returns {Array<string>} Array of example entity IDs
 */
function getEntityIdExamples(entityType) {
    const examples = {
        'document': ['RFP-123', 'DOC-4567', 'QUE-891011'],
        'project': ['proj_a1b2c3d4', 'proj_9f8e7d6c5b4a'],
        'user': ['user_abc123def', 'user_xyz789'],
        'corpus_document': ['document.pdf', 'folder/file.docx', 'path_to/doc-v2.txt']
    };

    return examples[entityType] || [];
}