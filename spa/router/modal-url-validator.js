// File: router/modal-url-validator.js

/**
 * ModalURLValidator - FAIL FAST URL validation using router configuration
 *
 * This component uses the router's own matching logic to determine if URLs are valid
 * instead of relying on fragile regex patterns. It integrates directly with the
 * route configuration to provide authoritative URL validation.
 */
export class ModalURLValidator {
    constructor(router) {
        this.router = router;
        this.routeConfig = null;
        this.modalRouteConfig = null;
        this.initialized = false;
    }

    /**
     * Initialize the validator with route configuration
     */
    async initialize() {
        if (!this.router || !this.router.isReady()) {
            throw new Error('[ModalURLValidator] FAIL FAST: Router not available or not ready');
        }

        try {
            this.routeConfig = this.router.getConfig();
            this.modalRouteConfig = this.findModalRoute();
            this.initialized = true;

            console.log('[ModalURLValidator] ✅ Initialized with route configuration');
            console.log('[ModalURLValidator] 📋 Modal route config:', this.modalRouteConfig?.id);
        } catch (error) {
            console.error('[ModalURLValidator] ❌ FAIL FAST: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Find the modal route configuration in the route config
     */
    findModalRoute() {
        if (!this.routeConfig?.routes) {
            throw new Error('[ModalURLValidator] FAIL FAST: No routes configuration found');
        }

        const modalRoute = this.routeConfig.routes.find(route => route.id === 'modals');
        if (!modalRoute) {
            throw new Error('[ModalURLValidator] FAIL FAST: No "modals" route found in configuration');
        }

        return modalRoute;
    }

    /**
     * Validate if a URL represents a valid modal route
     * @param {string} url - The URL to validate (e.g., "/modals/projects/QS?s=cognaire")
     * @returns {Object} - Validation result with isValid and details
     */
    validateModalURL(url) {
        if (!this.initialized) {
            throw new Error('[ModalURLValidator] FAIL FAST: Validator not initialized');
        }

        console.log('[ModalURLValidator] 🔍 Validating URL:', url);

        try {
            // Use router's own matcher to validate the URL
            const match = this.router.matcher.matchURL(url);

            console.log('[ModalURLValidator] 🔍 Router match result:', {
                success: match?.success,
                routeId: match?.route?.id,
                modalId: match?.modalId,
                entityId: match?.entityId,
                secondaryEntityId: match?.secondaryEntityId
            });

            // URL is valid if router can match it and it's a modal route
            const isValid = match?.success && match?.route?.id === 'modals' && match?.modalId;

            if (isValid) {
                // Additional validation: check if the modal ID exists in configuration
                const modalExists = this.modalRouteConfig.modals?.some(modal => modal.id === match.modalId);

                if (!modalExists) {
                    console.warn('[ModalURLValidator] ⚠️ Modal ID not found in configuration:', match.modalId);
                    return {
                        isValid: false,
                        reason: 'MODAL_NOT_CONFIGURED',
                        modalId: match.modalId,
                        availableModals: this.modalRouteConfig.modals?.map(m => m.id) || []
                    };
                }

                console.log('[ModalURLValidator] ✅ URL is valid modal route');
                return {
                    isValid: true,
                    modalId: match.modalId,
                    entityId: match.entityId,
                    secondaryEntityId: match.secondaryEntityId,
                    routeMatch: match
                };
            } else {
                console.log('[ModalURLValidator] ❌ URL is not a valid modal route');
                return {
                    isValid: false,
                    reason: 'INVALID_MODAL_ROUTE',
                    routerMatch: match
                };
            }
        } catch (error) {
            console.error('[ModalURLValidator] ❌ FAIL FAST: Validation error:', error);
            return {
                isValid: false,
                reason: 'VALIDATION_ERROR',
                error: error.message
            };
        }
    }

    /**
     * Check if a URL should allow origin restoration during modal close
     * @param {string} currentUrl - Current URL when modal is being closed
     * @returns {boolean} - True if origin restoration should be allowed
     */
    shouldAllowOriginRestoration(currentUrl) {
        if (!this.initialized) {
            throw new Error('[ModalURLValidator] FAIL FAST: Validator not initialized');
        }

        console.log('[ModalURLValidator] 🔄 Checking origin restoration for URL:', currentUrl);

        // If current URL is not a modal URL, allow restoration
        if (!currentUrl.includes('/modals/')) {
            console.log('[ModalURLValidator] ✅ Non-modal URL - allow restoration');
            return true;
        }

        // Use router-based validation instead of regex
        const validation = this.validateModalURL(currentUrl);

        if (validation.isValid) {
            console.log('[ModalURLValidator] ✅ Valid modal URL - allow restoration');
            console.log('[ModalURLValidator] 📋 Modal details:', {
                modalId: validation.modalId,
                entityId: validation.entityId,
                secondaryEntityId: validation.secondaryEntityId
            });
            return true;
        } else {
            console.log('[ModalURLValidator] ❌ Invalid modal URL - block restoration');
            console.log('[ModalURLValidator] 📋 Validation failure:', validation.reason);
            return false;
        }
    }

    /**
     * Get all configured modal IDs
     * @returns {string[]} - Array of configured modal IDs
     */
    getConfiguredModalIds() {
        if (!this.initialized) {
            throw new Error('[ModalURLValidator] FAIL FAST: Validator not initialized');
        }

        return this.modalRouteConfig.modals?.map(modal => modal.id) || [];
    }

    /**
     * Get modal configuration by ID
     * @param {string} modalId - Modal ID to look up
     * @returns {Object|null} - Modal configuration or null if not found
     */
    getModalConfig(modalId) {
        if (!this.initialized) {
            throw new Error('[ModalURLValidator] FAIL FAST: Validator not initialized');
        }

        return this.modalRouteConfig.modals?.find(modal => modal.id === modalId) || null;
    }

    /**
     * Generate valid URL patterns for debugging
     * @returns {string[]} - Array of valid URL pattern examples
     */
    getValidURLPatterns() {
        if (!this.initialized) {
            return ['[Validator not initialized]'];
        }

        const patterns = [];

        // Base modal patterns
        this.modalRouteConfig.modals?.forEach(modal => {
            patterns.push(`/modals/${modal.id}`);

            // Add entity patterns if modal supports entities
            if (modal.entitySupport?.enabled) {
                const exampleEntity = modal.entitySupport.examples?.[0] || 'ENTITY';
                patterns.push(`/modals/${modal.id}/${exampleEntity}`);

                // Add secondary entity patterns if supported
                if (modal.entitySupport.secondaryParam) {
                    const exampleSecondary = 'SECONDARY';
                    patterns.push(`/modals/${modal.id}/${exampleEntity}/${exampleSecondary}`);
                }
            }
        });

        return patterns;
    }
}

// Singleton instance for global access
let modalURLValidatorInstance = null;

/**
 * Get or create the global ModalURLValidator instance
 * @param {Object} router - Router instance (required for initialization)
 * @returns {ModalURLValidator} - Validator instance
 */
export function getModalURLValidator(router = null) {
    if (!modalURLValidatorInstance && router) {
        modalURLValidatorInstance = new ModalURLValidator(router);
    }

    if (!modalURLValidatorInstance) {
        throw new Error('[ModalURLValidator] FAIL FAST: No validator instance and no router provided');
    }

    return modalURLValidatorInstance;
}

/**
 * Initialize the global validator instance
 * @param {Object} router - Router instance
 */
export async function initializeModalURLValidator(router) {
    try {
        const validator = getModalURLValidator(router);
        await validator.initialize();

        // Make available globally for debugging
        if (typeof window !== 'undefined') {
            window.modalURLValidator = validator;
        }

        console.log('[ModalURLValidator] 🌐 Global validator initialized and available as window.modalURLValidator');
        return validator;
    } catch (error) {
        console.error('[ModalURLValidator] ❌ FAIL FAST: Global initialization failed:', error);
        throw error;
    }
}