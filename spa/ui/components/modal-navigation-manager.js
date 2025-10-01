// File: ui/components/modal-navigation-manager.js
/**
 * Modal Navigation Manager
 * 
 * Manages navigation states and integrates with the router framework
 * for seamless modal and view transitions.
 */

/**
 * Modal Navigation Manager Class
 * Handles router integration for modal and view navigation
 */
export class ModalNavigationManager {
    constructor(router, store) {
        this.router = router;
        this.store = store;
        this.activeModal = null;
        this.previousRoute = null;
        
        this.setupRouterIntegration();
    }

    /**
     * Set up router event handlers
     */
    setupRouterIntegration() {
        if (!this.router) return;

        // Listen for route changes
        this.router.onRouteChange((currentMatch, previousMatch) => {
            this.handleRouteChange(currentMatch, previousMatch);
        });

        // Modal route requests are handled via the navigateWithModal global function
        // and direct modal registration rather than router events
    }

    /**
     * Handle route changes
     */
    handleRouteChange(currentMatch, previousMatch) {
        this.previousRoute = previousMatch;
        
        // Close any open modals if we're navigating to a different route
        if (previousMatch && currentMatch && 
            previousMatch.route.id !== currentMatch.route.id) {
            this.closeActiveModal();
        }

        // Update navigation states
        this.updateNavigationStates(currentMatch);
    }

    /**
     * Handle modal requests from router
     */
    async handleModalRequest(modalInfo, routeMatch) {
        try {
            const modal = modalInfo.modal;
            const modalId = modal.id;
            
            console.log(`[ModalNavigationManager] Opening modal: ${modalId}`);
            
            // Close any existing modal first
            if (this.activeModal) {
                await this.closeActiveModal();
            }

            // Create and show the requested modal
            const modalInstance = await this.createModal(modal, routeMatch);
            if (modalInstance) {
                this.activeModal = {
                    instance: modalInstance,
                    info: modalInfo,
                    route: routeMatch
                };
                
                await modalInstance.show();
                
                // Update URL to include modal identifier
                const currentRoute = this.router.getCurrentRoute();
                const newUrl = this.router.buildUrl(routeMatch.route.id, {
                    entityId: routeMatch.entityId,
                    modalId: modalId,
                    queryParams: currentRoute?.queryParams || {}
                });
                
                this.router.updateUrl(newUrl, { 
                    replace: true,
                    skipNavigation: true 
                });
            }
            
        } catch (error) {
            console.error('[ModalNavigationManager] Modal request failed:', error);
            this.showModalError(error);
        }
    }

    /**
     * Create modal instance based on configuration
     */
    async createModal(modalConfig, routeMatch) {
        const factory = modalConfig.component?.factory;
        if (!factory) {
            throw new Error(`No factory specified for modal: ${modalConfig.id}`);
        }

        // Import the modal module dynamically
        const modulePath = modalConfig.component?.module;
        if (modulePath) {
            try {
                const module = await import(`../../${modulePath}`);
                const ModalClass = module[factory] || module.default;
                
                if (ModalClass) {
                    return new ModalClass(this.store, {
                        modalId: modalConfig.id,
                        routeMatch,
                        navigationManager: this
                    });
                }
            } catch (importError) {
                console.error('[ModalNavigationManager] Modal import failed:', importError);
            }
        }

        // Fallback to global factory functions
        if (typeof window[factory] === 'function') {
            return window[factory](this.store, {
                modalId: modalConfig.id,
                routeMatch,
                navigationManager: this
            });
        }

        throw new Error(`Modal factory not found: ${factory}`);
    }

    /**
     * Close the currently active modal
     */
    async closeActiveModal() {
        if (!this.activeModal) return;

        try {
            const { instance, route } = this.activeModal;
            
            if (instance && typeof instance.hide === 'function') {
                await instance.hide();
            }
            
            // Update URL to remove modal identifier
            const currentRoute = this.router.getCurrentRoute();
            const newUrl = this.router.buildUrl(route.route.id, {
                entityId: route.entityId,
                queryParams: currentRoute?.queryParams || {}
            });
            
            this.router.updateUrl(newUrl, { 
                replace: true,
                skipNavigation: true 
            });
            
        } catch (error) {
            console.error('[ModalNavigationManager] Modal close failed:', error);
        } finally {
            this.activeModal = null;
        }
    }

    /**
     * Update navigation states (breadcrumbs, active links, etc.)
     */
    updateNavigationStates(currentMatch) {
        if (!currentMatch) return;

        // Update breadcrumbs if enabled for this route
        if (currentMatch.route.meta?.breadcrumbs) {
            this.updateBreadcrumbs(currentMatch);
        }

        // Update page title
        if (currentMatch.route.meta?.pageTitle) {
            this.updatePageTitle(currentMatch);
        }

        // Update navigation active states
        this.updateActiveNavigationItems(currentMatch);
    }

    /**
     * Update breadcrumbs based on current route
     */
    updateBreadcrumbs(currentMatch) {
        const breadcrumbContainer = document.querySelector('.breadcrumbs-container');
        if (!breadcrumbContainer) return;

        // Import link utilities to generate breadcrumbs
        import('../../router/link.js').then(({ generateBreadcrumbs, createBreadcrumbNav }) => {
            const breadcrumbs = generateBreadcrumbs();
            const breadcrumbNav = createBreadcrumbNav();
            
            breadcrumbContainer.innerHTML = '';
            breadcrumbContainer.appendChild(breadcrumbNav);
        }).catch(error => {
            console.error('[ModalNavigationManager] Breadcrumb generation failed:', error);
        });
    }

    /**
     * Update page title based on route configuration
     */
    updatePageTitle(currentMatch) {
        const titleTemplate = currentMatch.route.meta?.pageTitle;
        if (!titleTemplate) return;

        // Process title template (support for {{entity.name}} etc.)
        let title = titleTemplate;
        
        if (currentMatch.entityId) {
            // Replace entity placeholders - this would need actual entity data
            title = title.replace(/\{\{entity\.name\}\}/g, currentMatch.entityId);
        }

        document.title = title;
    }

    /**
     * Update active navigation items
     */
    updateActiveNavigationItems(currentMatch) {
        // Update router links
        if (typeof window.updateRouterLinkStates === 'function') {
            window.updateRouterLinkStates();
        }

        // Update top bar navigation
        if (window.topBar && typeof window.topBar.updateRouterLinkStates === 'function') {
            window.topBar.updateRouterLinkStates();
        }
    }

    /**
     * Show modal error
     */
    showModalError(error) {
        const errorModal = this.store.get('errorModal');
        if (errorModal) {
            errorModal.show({
                title: 'Modal Navigation Error',
                message: 'Failed to open the requested modal.',
                details: error.message
            });
        } else {
            console.error('[ModalNavigationManager] Modal error (no error modal available):', error);
        }
    }

    /**
     * Get current modal information
     */
    getCurrentModal() {
        return this.activeModal;
    }

    /**
     * Check if a modal is currently open
     */
    hasActiveModal() {
        return !!this.activeModal;
    }

    /**
     * Navigate to a route with optional modal
     */
    async navigateToRoute(routeId, options = {}) {
        if (!this.router) {
            console.warn('[ModalNavigationManager] Router not available');
            return;
        }

        // Map modal-specific parameters to router's expected entityId
        const routerOptions = { ...options };
        
        // Handle account ID mapping for modals route
        if (routeId === 'modals' && options.accountId && !options.entityId) {
            console.log('[ModalNavigationManager] Mapping accountId to entityId:', options.accountId);
            routerOptions.entityId = options.accountId;
            delete routerOptions.accountId; // Remove the original parameter
        }
        
        // Handle project ID mapping for modals route  
        if (routeId === 'modals' && options.projectId && !options.entityId) {
            console.log('[ModalNavigationManager] Mapping projectId to entityId:', options.projectId);
            routerOptions.entityId = options.projectId;
            delete routerOptions.projectId; // Remove the original parameter
        }

        console.log('[ModalNavigationManager] Building URL for route:', routeId, 'with options:', routerOptions);
        const url = this.router.buildUrl(routeId, routerOptions);
        console.log('[ModalNavigationManager] Generated URL:', url);
        return this.router.navigate(url);
    }

    /**
     * Show a modal by ID for the current route
     */
    async showModal(modalId, entityId = null) {
        if (!this.router) {
            console.warn('[ModalNavigationManager] Router not available');
            return;
        }

        const currentMatch = this.router.getCurrentRoute();
        if (!currentMatch) {
            console.warn('[ModalNavigationManager] No current route');
            return;
        }

        const url = this.router.buildUrl(currentMatch.route.id, {
            entityId: entityId || currentMatch.entityId,
            modalId,
            queryParams: currentMatch.queryParams || {}
        });

        return this.router.navigate(url);
    }

    /**
     * Hide the current modal
     */
    async hideCurrentModal() {
        return this.closeActiveModal();
    }

    /**
     * Register a modal for router integration (for existing modals)
     * This allows existing modals to integrate with routing without major changes
     * @param {string} modalId - Unique identifier for the modal
     * @param {Object} modalInstance - The modal instance
     * @param {Object} options - Configuration options
     */
    registerModal(modalId, modalInstance, options = {}) {
        console.log(`[ModalNavigationManager] 🔗 Registering modal for router integration: ${modalId}`);
        
        if (!this.router) {
            console.warn(`[ModalNavigationManager] ⚠️ Cannot register modal ${modalId} - router not available`);
            return;
        }

        const config = {
            modalId,
            instance: modalInstance,
            routeId: options.routeId || this.router.getCurrentRoute()?.route?.id,
            entityId: options.entityId,
            updateUrl: options.updateUrl !== false, // Default to true
            preserveQuery: options.preserveQuery !== false // Default to true
        };

        // Store the modal registration
        if (!this.modalRegistrations) {
            this.modalRegistrations = new Map();
        }
        this.modalRegistrations.set(modalId, config);

        // Update URL if requested - disabled for now as router doesn't support URL-only updates
        // if (config.updateUrl && config.routeId) {
        //     this.updateURLForModal(modalId, config);
        // }

        console.log(`[ModalNavigationManager] ✅ Modal ${modalId} registered successfully`);
    }

    /**
     * Unregister a modal from router integration
     * @param {string} modalId - Modal identifier to unregister
     */
    unregisterModal(modalId) {
        console.log(`[ModalNavigationManager] 🔌 Unregistering modal: ${modalId}`);
        
        if (!this.modalRegistrations) return;
        
        const config = this.modalRegistrations.get(modalId);
        // URL cleanup disabled for now - router doesn't support URL-only updates
        // if (config && config.updateUrl && this.router) {
        //     // Remove modal parameter from URL
        //     this.removeModalFromURL(modalId, config);
        // }

        this.modalRegistrations.delete(modalId);
        console.log(`[ModalNavigationManager] ✅ Modal ${modalId} unregistered successfully`);
    }

    /**
     * Update URL to include modal parameter
     * @private
     */
    updateURLForModal(modalId, config) {
        if (!this.router) return;

        try {
            const currentMatch = this.router.getCurrentRoute();
            if (!currentMatch) return;

            const currentRoute = this.router.getCurrentRoute();
            const currentParams = currentRoute?.queryParams || {};
            
            // Preserve existing query parameters
            const preservedParams = config.preserveQuery ? { ...currentParams } : {};
            
            // Add modal parameter  
            preservedParams.modal = modalId;
            
            // Add entity parameter if provided
            if (config.entityId) {
                preservedParams.entity = config.entityId;
            }

            // Build new URL
            const newUrl = this.router.buildUrl(config.routeId, {
                entityId: currentMatch.entityId,
                queryParams: preservedParams
            });

            console.log(`[ModalNavigationManager] 🔗 Updating URL for modal ${modalId}: ${newUrl}`);
            
            // Update URL without triggering navigation
            this.router.navigate(newUrl, { 
                replace: true,
                skipNavigation: true 
            });
            
        } catch (error) {
            console.error(`[ModalNavigationManager] Failed to update URL for modal ${modalId}:`, error);
        }
    }

    /**
     * Remove modal parameter from URL
     * @private  
     */
    removeModalFromURL(modalId, config) {
        if (!this.router) return;

        try {
            const currentMatch = this.router.getCurrentRoute();
            if (!currentMatch) return;

            const currentRoute = this.router.getCurrentRoute();
            const currentParams = currentRoute?.queryParams || {};
            
            // Remove modal-related parameters
            const cleanedParams = { ...currentParams };
            delete cleanedParams.modal;
            delete cleanedParams.entity;

            // Build clean URL
            const newUrl = this.router.buildUrl(config.routeId, {
                entityId: currentMatch.entityId,
                queryParams: cleanedParams
            });

            console.log(`[ModalNavigationManager] 🧹 Cleaning URL after modal ${modalId} close: ${newUrl}`);
            
            // Update URL without triggering navigation
            this.router.navigate(newUrl, { 
                replace: true,
                skipNavigation: true 
            });
            
        } catch (error) {
            console.error(`[ModalNavigationManager] Failed to clean URL after modal ${modalId}:`, error);
        }
    }

    /**
     * Get registered modal by ID
     * @param {string} modalId - Modal identifier
     * @returns {Object|null} Modal configuration
     */
    getRegisteredModal(modalId) {
        if (!this.modalRegistrations) return null;
        return this.modalRegistrations.get(modalId) || null;
    }

    /**
     * Check if a modal is registered
     * @param {string} modalId - Modal identifier
     * @returns {boolean} True if modal is registered
     */
    isModalRegistered(modalId) {
        return this.getRegisteredModal(modalId) !== null;
    }

    /**
     * Destroy the navigation manager
     */
    destroy() {
        if (this.activeModal) {
            this.closeActiveModal();
        }
        
        // Clean up modal registrations
        if (this.modalRegistrations) {
            this.modalRegistrations.clear();
            this.modalRegistrations = null;
        }
        
        this.router = null;
        this.store = null;
        this.activeModal = null;
        this.previousRoute = null;
    }
}

/**
 * Global utility functions for modal router integration
 * These functions provide easy access for existing modals
 */

/**
 * Register a modal with router integration (globally available utility)
 * @param {string} modalId - Unique identifier for the modal
 * @param {Object} modalInstance - The modal instance 
 * @param {Object} options - Configuration options
 */
window.registerModalWithRouter = function(modalId, modalInstance, options = {}) {
    if (window.modalNavigationManager) {
        window.modalNavigationManager.registerModal(modalId, modalInstance, options);
    } else {
        console.warn(`[ModalRouter] Modal navigation manager not available for ${modalId}`);
    }
};

/**
 * Unregister a modal from router integration (globally available utility)
 * @param {string} modalId - Modal identifier
 */
window.unregisterModalFromRouter = function(modalId) {
    if (window.modalNavigationManager) {
        window.modalNavigationManager.unregisterModal(modalId);
    } else {
        console.warn(`[ModalRouter] Modal navigation manager not available for ${modalId}`);
    }
};

/**
 * Navigate to a route and show a modal (globally available utility)
 * @param {string} routeId - Route to navigate to
 * @param {string} modalId - Modal to show
 * @param {Object} options - Navigation options
 */
window.navigateWithModal = async function(routeId, modalId, options = {}) {
    if (window.modalNavigationManager) {
        return await window.modalNavigationManager.navigateToRoute(routeId, {
            ...options,
            modalId
        });
    } else {
        console.warn(`[ModalRouter] Modal navigation manager not available`);
    }
};

/**
 * Create and initialize modal navigation manager
 */
export async function createModalNavigationManager(router, store) {
    try {
        console.log('[ModalNavigationManager] Creating modal navigation manager instance');
        const manager = new ModalNavigationManager(router, store);
        
        // Make globally available for other components
        window.modalNavigationManager = manager;
        console.log('[ModalNavigationManager] Successfully assigned to window.modalNavigationManager');
        
        return manager;
    } catch (error) {
        console.error('[ModalNavigationManager] Error creating modal navigation manager:', error);
        throw error;
    }
}

/**
 * Initialize modal navigation integration for main.js
 * This function sets up the modal navigation system with router integration
 */
export async function initializeModalNavigation(router, store) {
    console.log('[ModalNavigationManager] Initializing modal navigation system');
    
    try {
        const manager = await createModalNavigationManager(router, store);
        
        // Set up global event handlers for modal navigation
        document.addEventListener('modal-request', async (event) => {
            const { modalId, entityId, routeMatch } = event.detail;
            await manager.handleModalRequest({ modal: { id: modalId } }, routeMatch);
        });
        
        console.log('[ModalNavigationManager] Modal navigation system initialized successfully');
        return manager;
    } catch (error) {
        console.error('[ModalNavigationManager] Failed to initialize modal navigation:', error);
        throw error;
    }
}