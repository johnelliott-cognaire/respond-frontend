// File: frontend/spa/router/integration.js
/**
 * Router Integration Helper
 * 
 * Provides integration utilities to add router support to existing codebase
 * while preserving all current functionality.
 */

import { createRouter, validateRouterConfig } from './index.js';
import { updateRouterLinkStates } from './link.js';
import { createURLValidator } from './url-validator.js';
import { createURLValidationModal } from '../ui/modals/url-validation-modal.js';
import { getFreshSecurity } from '../utils/security-utils.js';
import { ModalOriginTracker } from '../utils/modal-origin-tracker.js';
import { initializeModalURLValidator } from './modal-url-validator.js';

/**
 * Router Integration Manager
 * Handles the integration between the new router and existing application architecture
 */
export class RouterIntegration {
    constructor() {
        this.router = null;
        this.config = null;
        this.viewFactory = null;
        this.modalFactory = null;
        this.urlValidator = null;
        this.urlValidationModal = null;
        this.isInitialized = false;
        
        // Store references to existing components
        this.existingComponents = {
            store: null,
            security: null,
            tabManager: null,
            corpusManager: null,
            errorModal: null
        };
    }

    /**
     * Initialize router integration
     * @param {Object} config - Router configuration
     * @param {Object} components - Existing application components
     * @returns {Promise<boolean>} Success status
     */
    async initialize(config, components) {
        try {
            console.log('[RouterIntegration] Initializing router integration...');

            // Store component references
            this.existingComponents = { ...components };
            this.config = config;
            
            // Create URL validator
            this.urlValidator = createURLValidator(config);
            
            // Create view and modal factories
            this.viewFactory = new ViewFactory(components);
            this.modalFactory = new ModalFactory(components);

            // Create router instance
            this.router = await createRouter(config, {
                autoStart: false, // We'll start it manually
                onValidationError: this.handleValidationError.bind(this),
                onError: this.handleRouterError.bind(this)
            });

            // Set up router integration points
            this.setupIntegrationPoints();

            // Set up route change handlers
            this.setupRouteChangeHandlers();

            // Create URL validation modal with router reference
            this.urlValidationModal = createURLValidationModal(components.store, this.router);

            this.isInitialized = true;
            
            // Start the router
            await this.router.start();

            console.log('[RouterIntegration] Router integration completed successfully');
            return true;

        } catch (error) {
            console.error('[RouterIntegration] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Set up integration points between router and existing components
     */
    setupIntegrationPoints() {
        // Set error modal for router error handling
        if (this.existingComponents.errorModal) {
            this.router.setErrorModal(this.existingComponents.errorModal);
        }

        // Set security context getter - Use SecurityManager via store
        this.router.setSecurityContext(() => {
            // Get Security instance from SecurityManager via store
            const store = this.existingComponents.store;
            if (!store) return null;
            
            try {
                // Try multiple ways to get security context for maximum compatibility
                let security = null;
                
                // Method 1: Use global securityManager instance (primary method)
                if (window.securityManager?.store) {
                    console.log(`[RouterIntegration] Using window.securityManager.getSecurity()`);
                    security = window.securityManager.getSecurity();
                } 
                // Method 2: Try uppercase SecurityManager if available (fallback)
                else if (window.SecurityManager) {
                    console.log(`[RouterIntegration] Using window.SecurityManager.getInstance()`);
                    security = window.SecurityManager.getInstance(store);
                }
                // Method 3: Use getFreshSecurity utility (last resort)
                else {
                    console.log(`[RouterIntegration] Using getFreshSecurity utility`);
                    try {
                        security = getFreshSecurity(store);
                    } catch (error) {
                        console.error(`[RouterIntegration] Error using getFreshSecurity:`, error);
                        return null;
                    }
                }
                
                if (!security) {
                    console.warn(`[RouterIntegration] ❌ No security context available from any method`);
                    console.warn(`[RouterIntegration] ❌ window.securityManager:`, !!window.securityManager);
                    console.warn(`[RouterIntegration] ❌ window.SecurityManager:`, !!window.SecurityManager);
                    console.warn(`[RouterIntegration] ❌ store:`, !!store);
                    return null;
                }
                
                console.log(`[RouterIntegration] ✅ Security context obtained successfully`);
                console.log(`[RouterIntegration] ✅ User authenticated:`, !!localStorage.getItem('authToken'));
                console.log(`[RouterIntegration] ✅ Security permissions available:`, !!security.permissions);
                
                return {
                    isAuthenticated: () => !!localStorage.getItem('authToken'),
                    hasAnyPermission: (permissions) => security.hasAnyPermission(permissions),
                    hasAllPermissions: (permissions) => security.hasAllPermissions(permissions),
                    hasRouterPermission: (permissions, enforcePermissions, routeId) => 
                        security.hasRouterPermission(permissions, enforcePermissions, routeId)
                };
            } catch (error) {
                console.error(`[RouterIntegration] ❌ Error getting Security instance:`, error);
                return null;
            }
        });

        // Set view and modal factories
        this.router.setViewFactory(this.viewFactory);
        this.router.setModalFactory(this.modalFactory);

        // Add navigation guards
        this.router.addNavigationGuard(this.createSubtenantGuard());
        this.router.addNavigationGuard(this.createAuthenticationGuard());
    }

    /**
     * Set up route change handlers
     */
    setupRouteChangeHandlers() {
        // Update link active states on route changes
        this.router.onRouteChange(() => {
            updateRouterLinkStates();
            
            // Update top-bar router link states if available
            if (window.topBar && typeof window.topBar.updateRouterLinkStates === 'function') {
                window.topBar.updateRouterLinkStates();
            }
        });

        // Handle view transitions
        this.router.onRouteChange((currentMatch, previousMatch) => {
            this.handleViewTransition(currentMatch, previousMatch);
        });
    }

    /**
     * Handle view transitions between different application areas
     */
    handleViewTransition(currentMatch, previousMatch) {
        if (!currentMatch?.route) return;

        const currentViewType = this.getViewType(currentMatch.route.id);
        const previousViewType = previousMatch ? this.getViewType(previousMatch.route.id) : null;

        // Only transition if view type changed
        if (currentViewType === previousViewType) return;

        console.log(`[RouterIntegration] View transition: ${previousViewType} -> ${currentViewType}`);

        // Handle the transition
        switch (currentViewType) {
            case 'docs':
                this.transitionToDocuments();
                break;
            case 'corpus':
                this.transitionToCorpus();
                break;
            case 'auth':
                this.transitionToAuth();
                break;
            case 'modals':
                this.transitionToModals();
                break;
            default:
                console.warn('[RouterIntegration] Unknown view type:', currentViewType);
        }
    }

    /**
     * Determine view type from route ID
     */
    getViewType(routeId) {
        if (routeId.startsWith('docs')) return 'docs';
        if (routeId.startsWith('corpus')) return 'corpus';
        if (routeId === 'auth') return 'auth';
        if (routeId === 'modals') return 'modals';
        return 'unknown';
    }

    /**
     * Transition to documents view
     */
    transitionToDocuments() {
        if (window.showMainApp) {
            window.showMainApp();
        }
    }

    /**
     * Transition to corpus view
     */
    transitionToCorpus() {
        if (window.showCorpusManagement) {
            window.showCorpusManagement();
        }
    }

    /**
     * Transition to auth view (handled by existing auth modals)
     */
    transitionToAuth() {
        // Auth is handled by modals, so ensure we're in main view
        if (window.showMainApp) {
            window.showMainApp();
        }
    }

    /**
     * Transition to modals view (modal-only routes)
     */
    transitionToModals() {
        // Modals are handled by the modal factory, don't change the underlying view
        // Just ensure we're in main view context for modal overlay
        console.log('[RouterIntegration] Transition to modals - maintaining current view context');
        
        // Don't call showMainApp() or showCorpusManagement() here
        // The modals should overlay on whatever view is currently active
        // The modal factory will handle showing the appropriate modal
    }

    /**
     * Create subtenant validation guard
     */
    createSubtenantGuard() {
        return (url, options, currentMatch) => {
            // Check if subtenant is valid (existing SubtenantManager handles this)
            const subtenantManager = window.subtenantManager;
            if (subtenantManager && !subtenantManager.isSubtenantValidated()) {
                return {
                    allowed: false,
                    reason: 'Subtenant validation required'
                };
            }
            return { allowed: true };
        };
    }

    /**
     * Create authentication guard
     */
    createAuthenticationGuard() {
        return (url, options, currentMatch) => {
            // Skip guard for auth routes
            if (url.includes('/auth')) {
                return { allowed: true };
            }

            // Check authentication for protected routes
            const token = localStorage.getItem('authToken');
            if (!token) {
                // Note: The main router will handle building the redirect URL with preserved query parameters
                return {
                    allowed: false,
                    reason: 'Authentication required',
                    redirect: '/auth'
                };
            }

            return { allowed: true };
        };
    }

    /**
     * Handle router validation errors
     */
    handleValidationError(validation) {
        console.error('[RouterIntegration] Router configuration validation failed:', validation.errors);
        
        // Show error to user via existing error modal
        if (this.existingComponents.errorModal) {
            this.existingComponents.errorModal.show({
                title: 'Router Configuration Error',
                message: 'The application routing configuration contains errors.',
                details: validation.errors.join('\n')
            });
        }
    }

    /**
     * Handle router runtime errors
     */
    handleRouterError(error, url) {
        console.error('[RouterIntegration] Router error:', error);
        
        // If it's a URL validation error, use enhanced validation modal
        if (error.type === 'URL_VALIDATION' || error.code === 'INVALID_URL') {
            this.handleURLValidationError(error, url);
            return;
        }
        
        // Show generic error to user
        if (this.existingComponents.errorModal) {
            this.existingComponents.errorModal.show({
                title: 'Navigation Error',
                message: 'An error occurred during navigation.',
                details: `URL: ${url}\nError: ${error.message}`
            });
        }
    }

    /**
     * Handle URL validation errors with enhanced UX
     */
    handleURLValidationError(error, url) {
        if (!this.urlValidator || !this.urlValidationModal) {
            console.warn('[RouterIntegration] URL validation components not available');
            return;
        }

        try {
            // Get user context for validation
            const userContext = {
                userPermissions: this.getUserPermissions(),
                isAuthenticated: !!localStorage.getItem('authToken')
            };

            // Perform detailed URL validation
            const validation = this.urlValidator.validateURL(url, userContext);
            
            // Show enhanced validation modal
            this.urlValidationModal.showURLError({
                originalUrl: url,
                validation,
                partialMatch: error.partialMatch || validation.partialMatch,
                suggestions: validation.suggestions || []
            });

        } catch (validationError) {
            console.error('[RouterIntegration] URL validation error handling failed:', validationError);
            
            // Fallback to basic error modal
            if (this.existingComponents.errorModal) {
                this.existingComponents.errorModal.show({
                    title: 'Invalid URL',
                    message: 'The requested URL is not valid.',
                    details: `URL: ${url}\nError: ${error.message}`
                });
            }
        }
    }

    /**
     * Get current user permissions for validation context
     */
    getUserPermissions() {
        const security = this.existingComponents.security;
        if (!security) return [];

        // Get common permissions that might affect URL access
        const permissions = [];
        const commonPermissions = [
            'CORPUS_VIEWER', 'CORPUS_EDITOR', 'CORPUS_ADMIN',
            'DOCUMENT_VIEWER', 'DOCUMENT_EDITOR', 'DOCUMENT_ADMIN',
            'PROJECT_VIEWER', 'PROJECT_EDITOR', 'PROJECT_ADMIN',
            'USER_ADMIN'
        ];

        commonPermissions.forEach(permission => {
            if (security.hasSystemPermission([permission])) {
                permissions.push(permission);
            }
        });

        return permissions;
    }

    /**
     * Get router instance
     */
    getRouter() {
        return this.router;
    }

    /**
     * Check if integration is ready
     */
    isReady() {
        return this.isInitialized && this.router;
    }
}

/**
 * View Factory
 * Handles creation and management of view components
 */
class ViewFactory {
    constructor(components) {
        this.components = components;
        this.activeViews = new Map();
    }

    /**
     * Render a route view
     * @param {Object} match - Route match information
     * @param {Object} options - Rendering options
     */
    async renderRoute(match, options = {}) {
        console.log('[ViewFactory] 🖼️ RENDER_ROUTE START - Route:', match.route?.id);
        console.log('[ViewFactory] 🖼️ Match details:', {
            routeId: match.route?.id,
            entityId: match.entityId,
            modalId: match.modalId,
            queryParams: match.queryParams
        });

        try {
            const route = match.route;
            const factory = route.component?.factory;

            console.log('[ViewFactory] 🖼️ Route component factory:', factory);

            if (!factory) {
                console.warn('[ViewFactory] ❌ No factory method specified for route:', route.id);
                return null;
            }

            console.log('[ViewFactory] 🖼️ Determining view type for route:', route.id);

            console.log('[ViewFactory] 🎯 Route ID to handle:', route.id);
            console.log('[ViewFactory] 🎯 Available route handlers:', ['docs', 'corpus', 'auth', 'admin', 'system_modals', 'auth_modals']);

            // Handle different view types
            switch (route.id) {
                case 'docs':
                case 'overview':
                case 'compare':
                    console.log('[ViewFactory] 🖼️ Rendering document view for route:', route.id);
                    return this.renderDocumentView(match, options);
                    
                case 'corpus':
                case 'browse':
                case 'approvals':
                case 'types':
                case 'topics':
                case 'labels':
                case 'groups':
                    console.log('[ViewFactory] 🖼️ Rendering corpus view for route:', route.id);
                    return this.renderCorpusView(match, options);
                    
                case 'auth':
                    console.log('[ViewFactory] 🖼️ Rendering auth view for route:', route.id);
                    return this.renderAuthView(match, options);
                    
                case 'modals':
                    console.log('[ViewFactory] 🖼️ ✅ MODALS ROUTE MATCHED - Rendering modals for route:', route.id);
                    return this.renderModalRoute(match, options);
                    
                case 'admin':
                    console.log('[ViewFactory] 🖼️ ✅ ADMIN ROUTE MATCHED - Rendering admin modal for route:', route.id);
                    return this.renderAdminModals(match, options);
                    
                case 'system_modals':
                    console.log('[ViewFactory] 🖼️ ✅ SYSTEM_MODALS ROUTE MATCHED - Rendering system modal for route:', route.id);
                    return this.renderSystemModals(match, options);
                    
                case 'auth_modals':
                    console.log('[ViewFactory] 🖼️ ✅ AUTH_MODALS ROUTE MATCHED - Rendering auth modal for route:', route.id);
                    return this.renderAuthModals(match, options);
                    
                default:
                    console.error('[ViewFactory] ❌ UNKNOWN ROUTE - No handler for route ID:', route.id);
                    console.error('[ViewFactory] ❌ Available route handlers:', ['docs', 'corpus', 'auth', 'admin', 'system_modals', 'auth_modals']);
                    console.error('[ViewFactory] ❌ This route will not be handled properly!');
                    return null;
            }

        } catch (error) {
            console.error('[ViewFactory] ❌ Route rendering error:', error);
            console.error('[ViewFactory] ❌ Error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Render document workspace view
     */
    renderDocumentView(match, options) {
        console.log('[ViewFactory] 📄 RENDER_DOCUMENT_VIEW START');
        console.log('[ViewFactory] 📄 window.showMainApp available:', typeof window.showMainApp);

        // Delegate to existing view transition
        if (window.showMainApp) {
            console.log('[ViewFactory] 📄 Calling window.showMainApp()');
            window.showMainApp();
        } else {
            console.warn('[ViewFactory] 📄 window.showMainApp not available');
        }

        // Handle entity ID (document ID) if present
        if (match.entityId && this.components.tabManager) {
            // This would need to be implemented to open specific document
            console.log('[ViewFactory] 📄 Document entity ID:', match.entityId);
        }

        console.log('[ViewFactory] 📄 Document view render completed');
        return { success: true, view: 'documents' };
    }

    /**
     * Render corpus management view
     */
    renderCorpusView(match, options) {
        console.log('[ViewFactory] 🗂️ RENDER_CORPUS_VIEW START');
        console.log('[ViewFactory] 🗂️ window.showCorpusManagement available:', typeof window.showCorpusManagement);

        // Delegate to existing view transition
        if (window.showCorpusManagement) {
            console.log('[ViewFactory] 🗂️ Calling window.showCorpusManagement()');
            window.showCorpusManagement();
        } else {
            console.warn('[ViewFactory] 🗂️ window.showCorpusManagement not available');
        }

        // Handle specific corpus section if it's a child route
        if (match.fullPath && match.fullPath.length >= 2 && match.fullPath[0] === 'corpus' && match.route.id !== 'corpus') {
            const section = match.route.id; // browse, approvals, topics, types, labels, groups
            console.log('[ViewFactory] 🗂️ Navigating to specific corpus section:', section);
            
            // Navigate to specific section after corpus management loads with retry mechanism
            const navigateToCorpusSection = (attempts = 0, maxAttempts = 10) => {
                const corpusManager = this.components.corpusManager || window.corpusManager;
                if (corpusManager && typeof corpusManager.navigateToSection === 'function') {
                    console.log('[ViewFactory] 🗂️ Setting corpus manager active section to:', section);
                    console.log('[ViewFactory] 🗂️ Using corpusManager from:', this.components.corpusManager ? 'components' : 'window');
                    corpusManager.navigateToSection(section);
                } else if (attempts < maxAttempts) {
                    // Retry with exponential backoff
                    const delay = Math.min(50 + (attempts * 25), 300); // 50ms, 75ms, 100ms... up to 300ms
                    console.log(`[ViewFactory] 🗂️ CorpusManager not ready, retrying in ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`);
                    setTimeout(() => navigateToCorpusSection(attempts + 1, maxAttempts), delay);
                } else {
                    console.warn('[ViewFactory] 🗂️ CorpusManager not available after maximum attempts');
                    console.warn('[ViewFactory] 🗂️ this.components.corpusManager:', !!this.components.corpusManager);
                    console.warn('[ViewFactory] 🗂️ window.corpusManager:', !!window.corpusManager);
                }
            };
            navigateToCorpusSection();
        }

        console.log('[ViewFactory] 🗂️ Corpus view render completed');
        return { success: true, view: 'corpus' };
    }

    /**
     * Render authentication view
     */
    renderAuthView(match, options) {
        console.log('[ViewFactory] 🔐 RENDER_AUTH_VIEW START');
        console.log('[ViewFactory] 🔐 window.showMainApp available:', typeof window.showMainApp);

        // Auth is handled by modals in the existing system
        // Ensure we're in main view and let auth modals handle the flow
        if (window.showMainApp) {
            console.log('[ViewFactory] 🔐 Calling window.showMainApp()');
            window.showMainApp();
        } else {
            console.warn('[ViewFactory] 🔐 window.showMainApp not available');
        }

        console.log('[ViewFactory] 🔐 Auth view render completed');
        return { success: true, view: 'auth' };
    }

    /**
     * Render consolidated modals route (/modals/*)
     * Handles entity-specific routing for users, accounts, projects, documents, jobs
     */
    async renderModalRoute(match, options) {
        console.log('[ViewFactory] 🎯 RENDER_MODAL_ROUTE START');
        console.log('[ViewFactory] 🎯 Full match object:', match);
        console.log('[ViewFactory] 🎯 Modal ID:', match.modalId);
        console.log('[ViewFactory] 🎯 Entity ID:', match.params?.accountId || match.params?.projectId || match.params?.ownerUsername);
        console.log('[ViewFactory] 🎯 Route ID:', match.route?.id);
        
        if (match.modalId) {
            // Use ModalFactory to show the specific modal
            const modalFactory = new ModalFactory(this.components);
            
            // Find modal configuration from route
            const route = match.route;
            const modalConfig = route?.modals?.find(m => m.id === match.modalId);
            
            if (!modalConfig) {
                console.error('[ViewFactory] 🎯 Modal configuration not found for:', match.modalId);
                return { success: false, error: 'Modal configuration not found' };
            }
            
            console.log('[ViewFactory] 🎯 Modal config found:', modalConfig);
            console.log('[ViewFactory] 🎯 Entity support:', modalConfig.entitySupport);
            
            try {
                console.log('[ViewFactory] 🎯 About to call modalFactory.showModal...');
                const result = await modalFactory.showModal(modalConfig, match);
                console.log('[ViewFactory] 🎯 Modal factory result:', result);
                return result;
            } catch (error) {
                console.error('[ViewFactory] 🎯 Modal factory error:', error);
                return { success: false, error: error.message };
            }
        } else {
            console.warn('[ViewFactory] 🎯 No modal ID specified in match');
            return { success: false, error: 'No modal specified' };
        }
    }

    /**
     * Render admin modals (users, accounts, projects, jobs)
     */
    async renderAdminModals(match, options) {
        console.log('[ViewFactory] 👤 RENDER_ADMIN_MODALS START');
        console.log('[ViewFactory] 👤 Full match object:', match);
        console.log('[ViewFactory] 👤 Modal ID:', match.modalId);
        console.log('[ViewFactory] 👤 Route ID:', match.route?.id);
        console.log('[ViewFactory] 👤 Available components:', Object.keys(this.components || {}));
        
        if (match.modalId) {
            // Use ModalFactory to show the specific modal
            const modalFactory = new ModalFactory(this.components);
            const factoryName = this.getFactoryForModal(match.modalId);
            const modalInfo = {
                modal: {
                    id: match.modalId,
                    component: { factory: factoryName }
                }
            };
            
            console.log('[ViewFactory] 👤 Modal info prepared:', modalInfo);
            console.log('[ViewFactory] 👤 Factory name for modal:', factoryName);
            
            try {
                console.log('[ViewFactory] 👤 About to call modalFactory.showModal...');
                const result = await modalFactory.showModal(modalInfo, match);
                console.log('[ViewFactory] 👤 Admin modal show result:', result);
                return result;
            } catch (error) {
                console.error('[ViewFactory] 👤 Failed to show admin modal:', error);
                console.error('[ViewFactory] 👤 Error stack:', error.stack);
                return { success: false, error: error.message };
            }
        } else {
            console.warn('[ViewFactory] 👤 No modal ID specified for admin route');
            return { success: false, error: 'No modal ID specified' };
        }
    }

    /**
     * Render system modals (documents_management, export, options)
     */
    async renderSystemModals(match, options) {
        console.log('[ViewFactory] ⚙️ RENDER_SYSTEM_MODALS START');
        console.log('[ViewFactory] ⚙️ Full match object:', match);
        console.log('[ViewFactory] ⚙️ Modal ID:', match.modalId);
        console.log('[ViewFactory] ⚙️ Route ID:', match.route?.id);
        console.log('[ViewFactory] ⚙️ Available components:', Object.keys(this.components || {}));
        
        if (match.modalId) {
            // Use ModalFactory to show the specific modal
            const modalFactory = new ModalFactory(this.components);
            const factoryName = this.getFactoryForModal(match.modalId);
            const modalInfo = {
                modal: {
                    id: match.modalId,
                    component: { factory: factoryName }
                }
            };
            
            console.log('[ViewFactory] ⚙️ Modal info prepared:', modalInfo);
            console.log('[ViewFactory] ⚙️ Factory name for modal:', factoryName);
            
            try {
                console.log('[ViewFactory] ⚙️ About to call modalFactory.showModal...');
                const result = await modalFactory.showModal(modalInfo, match);
                console.log('[ViewFactory] ⚙️ System modal show result:', result);
                return result;
            } catch (error) {
                console.error('[ViewFactory] ⚙️ Failed to show system modal:', error);
                console.error('[ViewFactory] ⚙️ Error stack:', error.stack);
                return { success: false, error: error.message };
            }
        } else {
            console.warn('[ViewFactory] ⚙️ No modal ID specified for system_modals route');
            return { success: false, error: 'No modal ID specified' };
        }
    }

    /**
     * Render auth modals (login, register, password_reset)
     */
    async renderAuthModals(match, options) {
        console.log('[ViewFactory] 🔐 RENDER_AUTH_MODALS START');
        console.log('[ViewFactory] 🔐 Modal ID:', match.modalId);
        
        if (match.modalId) {
            // Use ModalFactory to show the specific modal
            const modalFactory = new ModalFactory(this.components);
            const modalInfo = {
                modal: {
                    id: match.modalId,
                    component: { factory: this.getFactoryForModal(match.modalId) }
                }
            };
            
            try {
                const result = await modalFactory.showModal(modalInfo, match);
                console.log('[ViewFactory] 🔐 Auth modal show result:', result);
                return result;
            } catch (error) {
                console.error('[ViewFactory] 🔐 Failed to show auth modal:', error);
                return { success: false, error: error.message };
            }
        } else {
            console.warn('[ViewFactory] 🔐 No modal ID specified for auth-modals route');
            return { success: false, error: 'No modal ID specified' };
        }
    }

    /**
     * Get the factory name for a given modal ID
     */
    getFactoryForModal(modalId) {
        const factoryMap = {
            // Admin modals
            'users': 'UsersModal',
            'accounts': 'AccountsModal', 
            'projects': 'ProjectsModal',
            'jobs': 'JobsModal',
            'user_detail': 'UserModal',
            
            // System modals
            'documents_management': 'DocumentsModal',
            'export': 'ExportModal',
            'options': 'OptionsModal',
            
            // Auth modals
            'login': 'LoginModal',
            'register': 'RegisterModal', 
            'password_reset': 'PasswordResetModal'
        };
        
        return factoryMap[modalId] || modalId;
    }
}

/**
 * Modal Factory
 * Handles creation and management of modal components
 */
class ModalFactory {
    constructor(components) {
        this.components = components;
        this.activeModal = null;
        this.lastActiveModal = null; // Track last modal for cleanup
        this.previousRoute = null; // Track route before modal navigation
        this.modalNavigationStarted = false; // Flag to track if we're in modal navigation
        
        // Modal instance registry for proper lifecycle management
        this.modalInstances = new Map(); // Key: modalType_entityId, Value: modal instance
        this.modalHistory = []; // Track modal navigation history for proper back navigation
    }

    /**
     * Show a modal
     * @param {Object} modalInfo - Modal information from router
     * @param {Object} match - Route match information
     */
    async showModal(modalInfo, match) {
        try {
            const modal = modalInfo.modal;
            const factory = modal.component?.factory;
            
            console.log(`[ModalFactory] 🚀 ATTEMPTING TO SHOW MODAL: ${modal.id}`);
            
            // Capture origin URL for modal origin tracking
            let originUrl = null;
            if (window.router && window.router.isReady()) {
                try {
                    const currentMatch = window.router.getCurrentRoute();
                    // Only store routes that are not modal-related (modals, auth_modals, etc.)
                    const isModalRoute = currentMatch && (
                        currentMatch.route.id === 'modals' ||
                        currentMatch.route.id === 'auth_modals' ||
                        currentMatch.route.id.endsWith('_modals')
                    );

                    if (currentMatch && !isModalRoute) {
                        // Fresh modal navigation - capture current non-modal route as origin
                        originUrl = window.location.pathname + window.location.search;
                        this.previousRoute = {
                            url: originUrl,
                            routeId: currentMatch.route.id,
                            entityId: currentMatch.entityId,
                            queryParams: currentMatch.queryParams
                        };
                        this.modalNavigationStarted = true;
                        console.log('[ModalFactory] 📍 Captured origin URL for new modal navigation:', originUrl);
                    } else if (currentMatch && isModalRoute) {
                        // We're currently in a modal route - need to find the real origin
                        const previousMatch = window.router.getPreviousRoute?.() || null;
                        const isPreviousModalRoute = previousMatch && (
                            previousMatch.route.id === 'modals' ||
                            previousMatch.route.id === 'auth_modals' ||
                            previousMatch.route.id.endsWith('_modals')
                        );

                        console.log('[ModalFactory] 🔍 Modal route detected - analyzing previous route:');
                        console.log('[ModalFactory] 🔍   - Previous match:', previousMatch?.route?.id, previousMatch?.fullUrl);
                        console.log('[ModalFactory] 🔍   - Is previous modal route:', isPreviousModalRoute);

                        // 1. PRIORITY: Use router's previous route if it's not a modal
                        if (previousMatch && !isPreviousModalRoute && previousMatch.fullUrl) {
                            originUrl = previousMatch.fullUrl;
                            console.log('[ModalFactory] 📍 ✅ Using router previous route as origin:', originUrl);
                        }
                        // 2. Check if we have a recent ModalOriginTracker origin
                        else {
                            const lastOrigin = ModalOriginTracker.getLatestOrigin();
                            if (lastOrigin) {
                                originUrl = lastOrigin;
                                console.log('[ModalFactory] 📍 ✅ Using ModalOriginTracker latest origin for modal-to-modal:', originUrl);
                            }
                            // 3. Fall back to stored previousRoute
                            else if (this.previousRoute && this.previousRoute.url) {
                                originUrl = this.previousRoute.url;
                                console.log('[ModalFactory] 📍 ⚠️ Using stored previous route as fallback origin:', originUrl);
                            }
                            // 4. FAIL FAST - No fallback, throw error
                            else {
                                const error = new Error(`MODAL ORIGIN TRACKING FAILED: No valid origin URL could be determined for modal ${modal.id}`);
                                console.error('[ModalFactory] 💥 FAIL FAST ERROR:', error.message);
                                console.error('[ModalFactory] 💥 Debug info:', {
                                    modalId: modal.id,
                                    currentMatch,
                                    previousMatch,
                                    isPreviousModalRoute,
                                    routerHasPrevious: !!window.router?.getPreviousRoute(),
                                    storedPreviousRoute: this.previousRoute
                                });
                                throw error;
                            }
                        }

                        // Store for future modal navigations
                        this.previousRoute = {
                            url: originUrl,
                            routeId: previousMatch?.route?.id || 'docs',
                            entityId: previousMatch?.entityId || null,
                            queryParams: currentMatch.queryParams
                        };
                        this.modalNavigationStarted = true;
                    }
                } catch (error) {
                    console.warn('[ModalFactory] Failed to capture origin URL:', error);
                    // Fallback to current URL
                    originUrl = window.location.pathname + window.location.search;
                }
            }
            
            // Hide any currently active modal before showing new one
            if (this.activeModal) {
                console.log(`[ModalFactory] 🚪 Hiding current modal before showing new one: ${modal.id}`);
                await this.hideCurrentModal();
                
                // Add a small delay to ensure the modal is fully hidden
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log(`[ModalFactory] 📋 Modal info:`, modalInfo);
            console.log(`[ModalFactory] 🎯 Route match:`, match);
            console.log(`[ModalFactory] ⚙️ Modal config:`, modal);
            console.log(`[ModalFactory] 🏭 Factory:`, factory);
            console.log(`[ModalFactory] 🏗️ Available components:`, Object.keys(this.components || {}));
            console.log(`[ModalFactory] 🏗️ Components details:`, {
                store: !!this.components?.store,
                topBar: !!this.components?.topBar,
                corpusManager: !!this.components?.corpusManager,
                errorModal: !!this.components?.errorModal
            });

            if (!factory) {
                console.warn('[ModalFactory] ❌ No factory method specified for modal:', modal.id);
                return { success: false, error: 'No factory method specified' };
            }

            console.log(`[ModalFactory] 🔀 About to enter switch statement for modal ID: ${modal.id}`);

            // Handle different modal types
            switch (modal.id) {
                case 'import_wizard':
                    console.log('[ModalFactory] 📥 Handling import_wizard modal');
                    return this.showImportWizard(modal, match);
                    
                case 'document_history':
                    console.log('[ModalFactory] 📄 Handling document_history modal');
                    return this.showDocumentHistory(modal, match);
                    
                case 'topic_assignment':
                    console.log('[ModalFactory] 🏷️ Handling topic_assignment modal');
                    return this.showTopicAssignment(modal, match);
                    
                case 'accounts':
                    console.log('[ModalFactory] 🏦 Handling accounts modal');
                    return this.showAccountsModal(modal, match, originUrl);

                case 'users':
                    console.log('[ModalFactory] 👥 Handling users modal');
                    return this.showUsersModal(modal, match, originUrl);

                case 'projects':
                    console.log('[ModalFactory] 📁 Handling projects modal');
                    return this.showProjectsModal(modal, match, originUrl);

                case 'jobs':
                    console.log('[ModalFactory] ⚙️ Handling jobs modal');
                    return this.showJobsModal(modal, match, originUrl);

                case 'documents_management':
                    console.log('[ModalFactory] 📂 Handling documents_management modal');
                    return this.showDocumentsModal(modal, match, originUrl);

                case 'login':
                    console.log('[ModalFactory] 🔐 Handling login modal');
                    return this.showLoginModal(modal, match, originUrl);

                case 'register':
                    console.log('[ModalFactory] 📝 Handling register modal');
                    return this.showRegisterModal(modal, match, originUrl);

                case 'password_reset':
                    console.log('[ModalFactory] 🔄 Handling password_reset modal');
                    return this.showPasswordResetModal(modal, match, originUrl);

                // Entity-specific modal handlers for new /modals route
                case 'account':
                    console.log('[ModalFactory] 🏦 Handling account modal (singular)');
                    return this.showAccountModal(modal, match, originUrl);

                case 'project':
                    console.log('[ModalFactory] 📁 Handling project modal (singular)');
                    return this.showProjectModal(modal, match, originUrl);
                    
                // Generic modal handlers using reusable pattern
                case 'content_editor':
                case 'choose_content_for_ai':
                case 'corpus_filter':
                case 'question_detail':
                case 'question_import':
                case 'document_item_history':
                case 'vector_index_management':
                case 'vector_search_preview':
                case 'question_grid_analytics':
                case 'user_groups':
                case 'manage_user_groups':
                case 'user_group_add':
                case 'add_corpus_permission':
                case 'add_docchain_permission':
                case 'user_detail':
                    console.log('[ModalFactory] 👤 Handling user detail modal');
                    return this.showUserModal(modal, match, originUrl);
                    
                case 'duplicate_permissions':
                case 'yesno_confirmation':
                case 'text_prompt':
                case 'modal_selection':
                    console.log(`[ModalFactory] 🔧 Handling generic modal: ${modal.id}`);
                    return this.showGenericModal(modal, match);
                    
                default:
                    console.warn('[ModalFactory] ❌ Unknown modal for showing:', modal.id);
                    console.warn('[ModalFactory] ❌ Available modal handlers:', ['import_wizard', 'document_history', 'topic_assignment', 'accounts', 'users', 'projects', 'jobs', 'documents_management', 'login', 'register', 'password_reset', 'content_editor', 'choose_content_for_ai', 'corpus_filter', 'question_detail', 'question_import', 'document_item_history', 'vector_index_management', 'vector_search_preview', 'question_grid_analytics', 'user_groups', 'manage_user_groups', 'user_group_add', 'add_corpus_permission', 'add_docchain_permission', 'duplicate_permissions', 'yesno_confirmation', 'text_prompt', 'modal_selection']);
                    return { success: false, error: `Unknown modal ID: ${modal.id}` };
            }

        } catch (error) {
            console.error('[ModalFactory] Modal show error:', error);
            throw error;
        }
    }

    /**
     * Show import content wizard
     */
    showImportWizard(modal, match) {
        // This would integrate with existing import wizard modal
        console.log('[ModalFactory] Showing import wizard modal');
        
        // For now, delegate to existing implementation
        // In a full implementation, this would create and show the modal
        
        return { success: true, modal: 'import_wizard' };
    }

    /**
     * Show document history modal
     */
    showDocumentHistory(modal, match) {
        console.log('[ModalFactory] Showing document history modal');
        return { success: true, modal: 'document_history' };
    }

    /**
     * Show topic assignment modal
     */
    showTopicAssignment(modal, match) {
        console.log('[ModalFactory] Showing topic assignment modal');
        return { success: true, modal: 'topic_assignment' };
    }

    /**
     * Show accounts modal
     */
    async showAccountsModal(modal, match, originUrl) {
        console.log('[ModalFactory] 🏦 SHOW_ACCOUNTS_MODAL START');
        console.log('[ModalFactory] 🏦 Match params:', match.params);
        
        // Extract entity parameters from route match
        const entityId = match.params?.accountId;
        console.log('[ModalFactory] 🏦 Entity ID (accountId):', entityId);
        
        if (this.components.topBar) {
            console.log('[ModalFactory] 🏦 this.components.topBar.accountsModal available:', !!this.components.topBar.accountsModal);
            console.log('[ModalFactory] 🏦 this.components.topBar.accountsModal type:', typeof this.components.topBar.accountsModal);
        }
        
        try {
            // If we have an accountId, show specific account modal (AccountModal)
            if (entityId) {
                console.log('[ModalFactory] 🏦 Entity-specific route - showing AccountModal for ID:', entityId);
                
                // Import and show AccountModal for specific account
                try {
                    const { AccountModal } = await import('../ui/modals/account-modal.js');
                    console.log('[ModalFactory] 🏦 AccountModal imported successfully');
                    
                    const accountModal = new AccountModal(this.components.store);
                    console.log('[ModalFactory] 🏦 New AccountModal instance created for account:', entityId);
                    
                    accountModal.show({ accountId: entityId, originUrl });
                    console.log('[ModalFactory] 🏦 AccountModal show() called with entity ID:', entityId, 'and originUrl:', originUrl);

                    // Track the active modal
                    this.activeModal = accountModal;
                    console.log('[ModalFactory] 🏦 Tracking AccountModal instance as active modal');

                    return { success: true, modal: 'account_detail', entityId: entityId };
                } catch (importError) {
                    console.error('[ModalFactory] 🏦 ❌ Failed to import/create AccountModal:', importError);
                    return { success: false, error: 'Failed to create AccountModal: ' + importError.message };
                }
            } else {
                // No entity ID - show AccountsModal (list view)
                console.log('[ModalFactory] 🏦 List route - showing AccountsModal');
                
                // Use existing TopBar modal instance if available
                if (this.components.topBar && this.components.topBar.accountsModal) {
                    console.log('[ModalFactory] 🏦 Found TopBar accounts modal - calling show()');
                    this.components.topBar.accountsModal.show({ originUrl });
                    console.log('[ModalFactory] 🏦 TopBar accounts modal show() called successfully');
                    
                    // Track the active modal
                    this.activeModal = this.components.topBar.accountsModal;
                    console.log('[ModalFactory] 🏦 Tracking TopBar AccountsModal as active modal');
                    
                    // Set up close event listener
                    this.setupModalCloseListener(this.activeModal);
                    
                    return { success: true, modal: 'accounts' };
                } else {
                    console.error('[ModalFactory] 🏦 ❌ TopBar accounts modal not available');
                    console.error('[ModalFactory] 🏦 ❌ Will try to create new AccountsModal instance');
                    
                    // Fallback: create new AccountsModal instance
                    try {
                        const { AccountsModal } = await import('../ui/modals/accounts-modal.js');
                        console.log('[ModalFactory] 🏦 AccountsModal imported successfully');
                        
                        const accountsModal = new AccountsModal(this.components.store);
                        console.log('[ModalFactory] 🏦 New AccountsModal instance created');
                        
                        accountsModal.show({ originUrl });
                        console.log('[ModalFactory] 🏦 New AccountsModal show() called successfully');
                        
                        // Track the active modal
                        this.activeModal = accountsModal;
                        console.log('[ModalFactory] 🏦 Tracking new AccountsModal instance as active modal');
                        
                        // Set up close event listener
                        this.setupModalCloseListener(this.activeModal);
                        
                        return { success: true, modal: 'accounts' };
                    } catch (importError) {
                        console.error('[ModalFactory] 🏦 ❌ Failed to import/create AccountsModal:', importError);
                        return { success: false, error: 'Failed to create AccountsModal: ' + importError.message };
                    }
                }
            }
        } catch (error) {
            console.error('[ModalFactory] Failed to show accounts modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Show users modal
     */
    async showUsersModal(modal, match, originUrl) {
        console.log('[ModalFactory] 👥 SHOW_USERS_MODAL START');
        console.log('[ModalFactory] 👥 Match params:', match.params);
        
        // Extract entity parameters from route match
        const accountId = match.params?.accountId;
        console.log('[ModalFactory] 👥 Account ID filter:', accountId);
        
        try {
            // Use existing TopBar modal instance if available
            if (this.components.topBar && this.components.topBar.usersModal) {
                console.log('[ModalFactory] 👥 Found TopBar users modal - calling show()');
                console.log('[ModalFactory] 👥 Origin URL:', originUrl);

                // Pass account context and originUrl if provided
                const options = accountId ? { accountId: accountId, originUrl } : { originUrl };
                this.components.topBar.usersModal.show(options);
                console.log('[ModalFactory] 👥 TopBar users modal show() called with options:', options);
                
                return { success: true, modal: 'users', accountId: accountId };
            } else {
                console.error('[ModalFactory] 👥 ❌ TopBar users modal not available');
                
                // Fallback: create new UsersModal instance
                try {
                    const { UsersModal } = await import('../ui/modals/users-modal.js');
                    console.log('[ModalFactory] 👥 UsersModal imported successfully');
                    
                    const options = accountId ? { accountId: accountId } : {};
                    const usersModal = new UsersModal(this.components.store, options);
                    console.log('[ModalFactory] 👥 New UsersModal instance created with options:', options);
                    
                    usersModal.show({ originUrl });
                    console.log('[ModalFactory] 👥 New UsersModal show() called successfully');
                    
                    return { success: true, modal: 'users', accountId: accountId };
                } catch (importError) {
                    console.error('[ModalFactory] 👥 ❌ Failed to import/create UsersModal:', importError);
                    return { success: false, error: 'Failed to create UsersModal: ' + importError.message };
                }
            }
        } catch (error) {
            console.error('[ModalFactory] Failed to show users modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Show individual user modal for user management
     * URL: /modals/user_detail/username
     */
    async showUserModal(modal, match, originUrl) {
        console.log('[ModalFactory] 👤 Showing user detail modal');
        console.log('[ModalFactory] 👤 Route match params:', match.params);
        console.log('[ModalFactory] 👤 Route match entityId:', match.entityId);
        
        try {
            // Extract username from URL
            let username = null;
            
            if (match.entityId) {
                username = match.entityId;
                console.log('[ModalFactory] 👤 Username extracted from entityId:', username);
            } else if (match.params?.username) {
                username = match.params.username;
                console.log('[ModalFactory] 👤 Username extracted from params:', username);
            }
            
            if (!username) {
                console.error('[ModalFactory] 👤 Username is required for user modal');
                return { success: false, error: 'Username is required for user modal' };
            }
            
            // Import UserModal class
            const { UserModal } = await import('../ui/modals/user-modal.js');
            console.log('[ModalFactory] 👤 UserModal imported successfully');
            
            // Get or create UserModal instance using proper instance management
            const instanceKey = username;
            const userModal = this.getOrCreateModalInstance('user_detail', instanceKey, () => {
                return new UserModal(this.components.store, {
                    username: username,
                    forceEditMode: false // Start in view mode, user can click Edit
                });
            });
            
            console.log('[ModalFactory] 👤 UserModal instance ready for user:', username);
            
            userModal.show({ originUrl });
            console.log('[ModalFactory] 👤 UserModal show() called successfully');
            
            return { success: true, modal: 'user_detail', username: username };
            
        } catch (error) {
            console.error('[ModalFactory] 👤 Failed to show user modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Show projects modal
     */
    async showProjectsModal(modal, match, originUrl) {
        console.log('[ModalFactory] 📁 SHOW_PROJECTS_MODAL START');
        console.log('[ModalFactory] 📁 Match params:', match.params);
        
        // Extract entity parameters from route match
        const accountId = match.params?.accountId;
        const projectId = match.params?.projectId;
        console.log('[ModalFactory] 📁 Account ID:', accountId, 'Project ID:', projectId);
        
        try {
            // If we have a projectId, show specific project modal (ProjectModal)
            if (projectId && accountId) {
                console.log('[ModalFactory] 📁 Entity-specific route - showing ProjectModal for Project:', projectId, 'Account:', accountId);
                
                // Import and show ProjectModal for specific project
                try {
                    const { ProjectModal } = await import('../ui/modals/project-modal.js');
                    console.log('[ModalFactory] 📁 ProjectModal imported successfully');
                    
                    const projectModal = new ProjectModal(this.components.store);
                    console.log('[ModalFactory] 📁 New ProjectModal instance created');
                    
                    projectModal.show({ projectId: projectId, accountId: accountId, originUrl });
                    console.log('[ModalFactory] 📁 ProjectModal show() called with IDs:', { projectId, accountId }, 'and originUrl:', originUrl);

                    // Track the active modal
                    this.activeModal = projectModal;
                    console.log('[ModalFactory] 📁 Tracking ProjectModal instance as active modal');

                    return { success: true, modal: 'project_detail', entityId: projectId, accountId: accountId };
                } catch (importError) {
                    console.error('[ModalFactory] 📁 ❌ Failed to import/create ProjectModal:', importError);
                    return { success: false, error: 'Failed to create ProjectModal: ' + importError.message };
                }
            } else {
                // No project ID - show ProjectsModal (list view), optionally filtered by account
                console.log('[ModalFactory] 📁 List route - showing ProjectsModal', accountId ? `filtered by account: ${accountId}` : '');
                
                // Always create new ProjectsModal instance for proper account filtering
                // The existing TopBar modal instance can't be dynamically configured with account filter
                console.log('[ModalFactory] 📁 Creating new ProjectsModal instance for account filtering');
                
                try {
                    const { ProjectsModal } = await import('../ui/modals/projects-modal.js');
                    console.log('[ModalFactory] 📁 ProjectsModal imported successfully');
                    
                    const options = accountId ? { accountId: accountId } : {};
                    const projectsModal = new ProjectsModal(this.components.store, options);
                    console.log('[ModalFactory] 📁 New ProjectsModal instance created with options:', options);
                    
                    await projectsModal.show({ originUrl });
                    console.log('[ModalFactory] 📁 ProjectsModal show() called successfully with originUrl:', originUrl);
                    
                    // Track the active modal
                    this.activeModal = projectsModal;
                    console.log('[ModalFactory] 📁 Tracking ProjectsModal instance as active modal');
                    
                    // Set up close event listener
                    this.setupModalCloseListener(this.activeModal);
                    
                    return { success: true, modal: 'projects', accountId: accountId };
                } catch (importError) {
                    console.error('[ModalFactory] 📁 ❌ Failed to import/create ProjectsModal:', importError);
                    return { success: false, error: 'Failed to create ProjectsModal: ' + importError.message };
                }
            }
        } catch (error) {
            console.error('[ModalFactory] Failed to show projects modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Show jobs modal
     */
    async showJobsModal(modal, match, originUrl) {
        console.log('[ModalFactory] Showing jobs modal');
        
        try {
            // Use existing TopBar modal instance if available
            if (this.components.topBar && this.components.topBar.jobsModal) {
                this.components.topBar.jobsModal.show({ originUrl });
                return { success: true, modal: 'jobs' };
            } else {
                console.error('[ModalFactory] TopBar jobs modal not available - creating new instance');
                
                // Fallback: create new JobsModal instance
                try {
                    const { JobsModal } = await import('../ui/modals/jobs-modal.js');
                    console.log('[ModalFactory] JobsModal imported successfully');
                    
                    const jobsModal = new JobsModal(this.components.store, this.components.jobController);
                    console.log('[ModalFactory] New JobsModal instance created');
                    
                    jobsModal.show({ originUrl });
                    console.log('[ModalFactory] New JobsModal show() called successfully with originUrl:', originUrl);
                    
                    return { success: true, modal: 'jobs' };
                } catch (importError) {
                    console.error('[ModalFactory] Failed to import/create JobsModal:', importError);
                    return { success: false, error: 'Failed to create JobsModal: ' + importError.message };
                }
            }
        } catch (error) {
            console.error('[ModalFactory] Failed to show jobs modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Show documents management modal
     * URL: /modals/documents_management or /modals/documents_management/compositeProjectId
     */
    async showDocumentsModal(modal, match, originUrl) {
        console.log('[ModalFactory] 📄 Showing documents management modal');
        console.log('[ModalFactory] 📄 Route match params:', match.params);
        console.log('[ModalFactory] 📄 Route match entityId:', match.entityId);
        console.log('[ModalFactory] 📄 Route match fullPath:', match.fullPath);
        
        try {
            // Extract project context if provided in the URL
            let projectOptions = {};
            
            // Check for composite project ID from URL (accountId#projectId format)
            if (match.entityId && match.entityId.includes('#')) {
                const composite = match.entityId;
                const [accountId, projectId] = composite.split('#');
                projectOptions = {
                    projectId: composite,
                    accountId: accountId,
                    plainProjectId: projectId
                };
                console.log('[ModalFactory] 📄 Project context extracted from entityId:', projectOptions);
            } else if (match.fullPath && Array.isArray(match.fullPath) && match.fullPath.length >= 3) {
                // Try to parse from fullPath segments - /modals/documents_management/accountId/projectId
                const accountId = match.fullPath[2];
                const projectId = match.fullPath[3];
                if (accountId && projectId) {
                    const composite = `${accountId}#${projectId}`;
                    projectOptions = {
                        projectId: composite,
                        accountId: accountId,
                        plainProjectId: projectId
                    };
                    console.log('[ModalFactory] 📄 Project context extracted from fullPath:', projectOptions);
                }
            }
            
            // Always create a new DocumentsModal instance with the project context
            const { DocumentsModal } = await import('../ui/modals/documents-modal.js');
            console.log('[ModalFactory] 📄 DocumentsModal imported successfully');
            
            // Get or create DocumentsModal instance using proper instance management
            const instanceKey = projectOptions.projectId || 'general';
            const documentsModal = this.getOrCreateModalInstance('documents_management', instanceKey, () => {
                return new DocumentsModal(this.components.store, projectOptions);
            });
            
            console.log('[ModalFactory] 📄 DocumentsModal instance ready with options:', projectOptions);
            
            documentsModal.show({ originUrl });
            console.log('[ModalFactory] 📄 DocumentsModal show() called successfully with originUrl:', originUrl);
            
            return { success: true, modal: 'documents_management', projectId: projectOptions.projectId };
            
        } catch (error) {
            console.error('[ModalFactory] 📄 Failed to show documents modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get or create modal instance with proper lifecycle management
     */
    getOrCreateModalInstance(modalType, entityId = null, factoryFunction) {
        const instanceKey = entityId ? `${modalType}_${entityId}` : modalType;
        
        // Check if we already have an instance
        if (this.modalInstances.has(instanceKey)) {
            const existingInstance = this.modalInstances.get(instanceKey);
            console.log('[ModalFactory] 🔄 Reusing existing modal instance:', instanceKey);
            return existingInstance;
        }
        
        // Create new instance
        console.log('[ModalFactory] 🆕 Creating new modal instance:', instanceKey);
        const newInstance = factoryFunction();
        
        // Add destroy handler to clean up from registry when modal is destroyed
        if (newInstance && typeof newInstance.destroy === 'function') {
            const originalDestroy = newInstance.destroy;
            newInstance.destroy = (...args) => {
                console.log('[ModalFactory] 🧹 Modal instance being destroyed, removing from registry:', instanceKey);
                this.modalInstances.delete(instanceKey);
                return originalDestroy.apply(newInstance, args);
            };
        }
        
        // Store in registry
        this.modalInstances.set(instanceKey, newInstance);
        return newInstance;
    }

    /**
     * Clean up modal instance from registry
     */
    cleanupModalInstance(modalType, entityId = null) {
        const instanceKey = entityId ? `${modalType}_${entityId}` : modalType;
        
        if (this.modalInstances.has(instanceKey)) {
            const instance = this.modalInstances.get(instanceKey);
            
            // Call destroy if it exists
            if (instance && typeof instance.destroy === 'function') {
                instance.destroy();
            }
            
            // Remove from registry
            this.modalInstances.delete(instanceKey);
            console.log('[ModalFactory] 🧹 Cleaned up modal instance:', instanceKey);
        }
    }

    /**
     * Show login modal
     */
    async showLoginModal(modal, match, originUrl) {
        console.log('[ModalFactory] 🔐 Showing login modal');
        
        try {
            // Import LoginModal class
            const { LoginModal } = await import('../ui/modals/login-modal.js');
            console.log('[ModalFactory] 🔐 LoginModal imported successfully');
            
            // Get or create LoginModal instance using proper instance management
            const loginModal = this.getOrCreateModalInstance('login', null, () => {
                return new LoginModal(this.components.store);
            });
            
            loginModal.show({ originUrl });
            console.log('[ModalFactory] 🔐 LoginModal show() called successfully');
            
            return { success: true, modal: 'login' };
        } catch (error) {
            console.error('[ModalFactory] 🔐 Failed to import/create LoginModal:', error);
            return { success: false, error: 'Failed to create LoginModal: ' + error.message };
        }
    }

    /**
     * Show register modal
     */
    async showRegisterModal(modal, match, originUrl) {
        console.log('[ModalFactory] 📝 Showing register modal');
        
        try {
            // Import RegisterModal class
            const { RegisterModal } = await import('../ui/modals/register-modal.js');
            console.log('[ModalFactory] 📝 RegisterModal imported successfully');
            
            // Get or create RegisterModal instance using proper instance management
            const registerModal = this.getOrCreateModalInstance('register', null, () => {
                return new RegisterModal(this.components.store);
            });
            
            registerModal.show({ originUrl });
            console.log('[ModalFactory] 📝 RegisterModal show() called successfully with originUrl:', originUrl);
            
            return { success: true, modal: 'register' };
        } catch (error) {
            console.error('[ModalFactory] 📝 Failed to import/create RegisterModal:', error);
            return { success: false, error: 'Failed to create RegisterModal: ' + error.message };
        }
    }

    /**
     * Show password reset modal
     */
    async showPasswordResetModal(modal, match, originUrl) {
        console.log('[ModalFactory] 🔄 Showing password reset modal');
        
        try {
            // Import PasswordResetModal class
            const { PasswordResetModal } = await import('../ui/modals/password-reset-modal.js');
            console.log('[ModalFactory] 🔄 PasswordResetModal imported successfully');
            
            // Get or create PasswordResetModal instance using proper instance management
            const passwordResetModal = this.getOrCreateModalInstance('password_reset', null, () => {
                return new PasswordResetModal(this.components.store);
            });
            
            passwordResetModal.show({ originUrl });
            console.log('[ModalFactory] 🔄 PasswordResetModal show() called successfully with originUrl:', originUrl);
            
            return { success: true, modal: 'password_reset' };
        } catch (error) {
            console.error('[ModalFactory] 🔄 Failed to import/create PasswordResetModal:', error);
            return { success: false, error: 'Failed to create PasswordResetModal: ' + error.message };
        }
    }

    /**
     * Show account modal (singular) - specific account details
     * URL: /modals/account/QS
     */
    async showAccountModal(modal, match, originUrl) {
        console.log('[ModalFactory] 🏦 Showing account modal (singular)');
        console.log('[ModalFactory] 🏦 Account ID:', match.params?.accountId);
        
        try {
            const accountId = match.params?.accountId;
            if (!accountId) {
                console.error('[ModalFactory] 🏦 Account ID is required but not provided');
                return { success: false, error: 'Account ID is required' };
            }

            // Determine if this is "new" mode or editing existing account
            const isNewMode = accountId === 'new';
            const actualAccountId = isNewMode ? null : accountId;

            console.log('[ModalFactory] 🏦 Processed parameters:');
            console.log('  - isNewMode:', isNewMode);
            console.log('  - actualAccountId:', actualAccountId);

            // Import AccountModal class
            const { AccountModal } = await import('../ui/modals/account-modal.js');
            console.log('[ModalFactory] 🏦 AccountModal imported successfully');

            // Get or create AccountModal instance using proper instance management
            const instanceKey = isNewMode ? 'new' : accountId;
            const accountModal = this.getOrCreateModalInstance('account', instanceKey, () => {
                return new AccountModal(this.components.store, actualAccountId);
            });

            // Set new mode if needed
            if (isNewMode) {
                // Check if AccountModal has a setNewMode method
                if (typeof accountModal.setNewMode === 'function') {
                    accountModal.setNewMode(true);
                    console.log('[ModalFactory] 🏦 AccountModal configured for new mode');
                } else {
                    // If no setNewMode method, set mode directly
                    accountModal.mode = "new";
                    console.log('[ModalFactory] 🏦 AccountModal mode set to new directly');
                }
            }

            accountModal.show({ originUrl });
            console.log('[ModalFactory] 🏦 AccountModal show() called successfully');

            // Track the active modal
            this.activeModal = accountModal;
            console.log('[ModalFactory] 🏦 Tracking AccountModal instance as active modal');

            return {
                success: true,
                modal: 'account',
                accountId: actualAccountId,
                isNewMode: isNewMode
            };
        } catch (error) {
            console.error('[ModalFactory] 🏦 Failed to import/create AccountModal:', error);
            return { success: false, error: 'Failed to create AccountModal: ' + error.message };
        }
    }

    /**
     * Show project modal (singular) - specific project details
     * URL: /modals/project/projectId
     */
    async showProjectModal(modal, match, originUrl) {
        console.log('[ModalFactory] 📁 FAIL FAST DEBUGGING - Showing project modal (singular)');
        console.log('[ModalFactory] 📁 Route match:', match);
        console.log('[ModalFactory] 📁 Route match params:', match.params);
        console.log('[ModalFactory] 📁 Route match fullPath:', match.fullPath);
        console.log('[ModalFactory] 📁 Route match entityId:', match.entityId);
        console.log('[ModalFactory] 📁 Current URL:', window.location.href);

        try {
            // Updated parameter extraction for new route config (projectMode, accountId)
            const projectMode = match.params?.projectMode;
            const accountId = match.params?.accountId;

            console.log('[ModalFactory] 📁 Router-parsed parameters:');
            console.log('  - projectMode:', projectMode);
            console.log('  - accountId:', accountId);
            console.log('  - match.params:', match.params);
            console.log('  - match.fullPath:', match.fullPath);

            // FAIL FAST: Validate required parameters exist
            if (!projectMode || !accountId) {
                const error = `FAIL FAST: Missing required parameters from router. projectMode: "${projectMode}", accountId: "${accountId}". Router params: ${JSON.stringify(match.params)}`;
                console.error('[ModalFactory] 📁', error);
                throw new Error(error);
            }

            // Determine if this is "new" mode or editing existing project
            const isNewMode = projectMode === 'new';
            const projectId = isNewMode ? null : projectMode; // If not "new", then projectMode is the actual project ID

            console.log('[ModalFactory] 📁 Processed parameters:');
            console.log('  - isNewMode:', isNewMode);
            console.log('  - projectId:', projectId);
            console.log('  - accountId:', accountId);
            
            // Import ProjectModal class
            const { ProjectModal } = await import('../ui/modals/project-modal.js');
            console.log('[ModalFactory] 📁 ProjectModal imported successfully');
            
            // Get or create ProjectModal instance using proper instance management
            const instanceKey = isNewMode ? `new_${accountId}` : `${accountId}_${projectId}`;
            const projectModal = this.getOrCreateModalInstance('project', instanceKey, () => {
                return new ProjectModal(this.components.store, projectId, accountId, 'projects');
            });

            // Set new mode if needed
            if (isNewMode) {
                projectModal.setNewMode(true, accountId);
                console.log('[ModalFactory] 📁 ProjectModal configured for new mode with accountId:', accountId);
            }

            projectModal.show({ originUrl });
            console.log('[ModalFactory] 📁 ProjectModal show() called successfully with originUrl:', originUrl);

            // Track the active modal
            this.activeModal = projectModal;
            console.log('[ModalFactory] 📁 Tracking ProjectModal instance as active modal');

            return {
                success: true,
                modal: 'project',
                accountId: accountId,
                projectId: projectId,
                isNewMode: isNewMode
            };
        } catch (error) {
            console.error('[ModalFactory] 📁 Failed to import/create ProjectModal:', error);
            return { success: false, error: 'Failed to create ProjectModal: ' + error.message };
        }
    }

    /**
     * Enhanced accounts modal with entity filtering
     * URL: /modals/accounts or /modals/accounts/demo-user
     */
    async showAccountsModal(modal, match, originUrl) {
        console.log('[ModalFactory] 🏦 Showing accounts modal with filtering');
        console.log('[ModalFactory] 🏦 Owner filter:', match.params?.ownerUsername);
        console.log('[ModalFactory] 🏦 Origin URL:', originUrl);

        try {
            // Use existing TopBar modal instance if available
            if (this.components.topBar && this.components.topBar.accountsModal) {
                const ownerFilter = match.params?.ownerUsername;
                if (ownerFilter) {
                    this.components.topBar.accountsModal.setOwnerFilter(ownerFilter);
                }
                console.log('[ModalFactory] 🏦 Found TopBar accounts modal - calling show() with originUrl');
                this.components.topBar.accountsModal.show({ originUrl });
                console.log('[ModalFactory] 🏦 TopBar accounts modal show() called successfully');

                // Track the active modal
                this.activeModal = this.components.topBar.accountsModal;
                console.log('[ModalFactory] 🏦 Tracking TopBar AccountsModal as active modal');

                return { success: true, modal: 'accounts', ownerFilter: ownerFilter };
            } else {
                console.error('[ModalFactory] 🏦 TopBar accounts modal not available - creating new instance');

                const { AccountsModal } = await import('../ui/modals/accounts-modal.js');
                console.log('[ModalFactory] 🏦 AccountsModal imported successfully');

                const accountsModal = new AccountsModal(this.components.store);
                console.log('[ModalFactory] 🏦 New AccountsModal instance created');

                const ownerFilter = match.params?.ownerUsername;
                if (ownerFilter) {
                    accountsModal.setOwnerFilter(ownerFilter);
                }

                accountsModal.show({ originUrl });
                console.log('[ModalFactory] 🏦 New AccountsModal show() called successfully');

                // Track the active modal
                this.activeModal = accountsModal;
                console.log('[ModalFactory] 🏦 Tracking new AccountsModal instance as active modal');

                return { success: true, modal: 'accounts', ownerFilter: ownerFilter };
            }
        } catch (error) {
            console.error('[ModalFactory] 🏦 Failed to show accounts modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Enhanced projects modal with account context
     * URL: /modals/projects/QS
     */
    async showProjectsModal(modal, match, originUrl) {
        console.log('[ModalFactory] 📁 Showing projects modal with account context');
        console.log('[ModalFactory] 📁 Account ID:', match.params?.accountId);

        // FAIL FAST: Hide any currently active modal before showing new one
        if (this.activeModal) {
            console.log(`[ModalFactory] 🚪 Hiding current modal before showing projects modal`);
            await this.hideCurrentModal();

            // Add a small delay to ensure the modal is fully hidden
            await new Promise(resolve => setTimeout(resolve, 100));
        } else {
            console.log(`[ModalFactory] ℹ️ No active modal to hide when showing projects modal - proceeding`);
        }

        try {
            const accountId = match.params?.accountId;
            if (!accountId) {
                console.error('[ModalFactory] 📁 Account ID is required but not provided');
                return { success: false, error: 'Account ID is required for projects modal' };
            }
            
            // Always create new ProjectsModal instance with accountId filter
            // because existing TopBar modal doesn't support setting account filter after creation
            console.log('[ModalFactory] 📁 Creating new ProjectsModal instance with account filter:', accountId);
            
            const { ProjectsModal } = await import('../ui/modals/projects-modal.js');
            console.log('[ModalFactory] 📁 ProjectsModal imported successfully');
            
            // Create new instance with accountId in options
            const projectsModal = new ProjectsModal(this.components.store, { accountId: accountId });
            console.log('[ModalFactory] 📁 ProjectsModal created with accountId options:', accountId);
            
            await projectsModal.show({ originUrl });
            console.log('[ModalFactory] 📁 ProjectsModal show() completed successfully with originUrl:', originUrl);
            
            // Track the active modal
            this.activeModal = projectsModal;
            console.log('[ModalFactory] 📁 Tracking ProjectsModal instance as active modal (enhanced method)');
            
            // Set up close event listener
            this.setupModalCloseListener(this.activeModal);
            
            return { success: true, modal: 'projects', accountId: accountId };
        } catch (error) {
            console.error('[ModalFactory] 📁 Failed to show projects modal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Show generic modal using reusable pattern
     * This function handles modals that don't require specific implementation
     * @param {Object} modal - Modal configuration
     * @param {Object} match - Route match information  
     * @returns {Object} Result object with success status
     */
    showGenericModal(modal, match) {
        console.log(`[ModalFactory] 🔧 Showing generic modal: ${modal.id}`);
        console.log(`[ModalFactory] 🔧 Modal config:`, modal);
        console.log(`[ModalFactory] 🔧 Route match:`, match);
        
        // For generic modals, we return success but indicate they need implementation
        // In a full implementation, this would:
        // 1. Dynamically import the modal class based on modal.component.factory
        // 2. Instantiate the modal with appropriate parameters
        // 3. Call show() method
        // 4. Handle entity parameters from match if needed
        
        const entityId = match.params?.accountId || match.params?.projectId;
        if (entityId) {
            console.log(`[ModalFactory] 🔧 Entity context for ${modal.id}:`, entityId);
        }
        
        // Log the intended implementation path
        if (modal.component) {
            console.log(`[ModalFactory] 🔧 Modal component factory: ${modal.component.factory}`);
            console.log(`[ModalFactory] 🔧 Modal component module: ${modal.component.module}`);
        }
        
        return { 
            success: true, 
            modal: modal.id,
            type: 'generic',
            message: `Generic handler called for ${modal.id} - implementation pending`,
            entityId: entityId
        };
    }

    /**
     * Hide current modal
     */
    async hideCurrentModal() {
        if (this.activeModal) {
            console.log('[ModalFactory] 🚪 hideCurrentModal - Found active modal:', this.activeModal.constructor?.name);
            console.log('[ModalFactory] 🚪 hideCurrentModal - Modal has hide method:', typeof this.activeModal.hide === 'function');
            
            // Hide the active modal
            if (this.activeModal.hide) {
                console.log('[ModalFactory] 🚪 hideCurrentModal - Calling hide() on modal');
                try {
                    // Pass isModalNavigation flag to prevent URL restoration during modal-to-modal navigation
                    this.activeModal.hide({ isModalNavigation: true });
                    console.log('[ModalFactory] 🚪 hideCurrentModal - Modal hide() completed successfully');
                } catch (error) {
                    console.error('[ModalFactory] 🚪 hideCurrentModal - Error calling hide():', error);
                }
            } else {
                console.warn('[ModalFactory] 🚪 hideCurrentModal - Modal does not have hide() method');
            }
            
            this.lastActiveModal = this.activeModal;
            this.activeModal = null;
            console.log('[ModalFactory] 🚪 hideCurrentModal - Active modal cleared');
        } else {
            console.log('[ModalFactory] 🚪 hideCurrentModal - No active modal to hide');
        }
    }

    /**
     * Set up close event listener for a modal instance
     */
    setupModalCloseListener(modalInstance) {
        if (!modalInstance) return;
        
        console.log('[ModalFactory] 🎧 Setting up close event listener for modal:', modalInstance.constructor?.name);
        
        // Try to detect modal close events through various methods
        try {
            // Method 1: If modal has an onClose or onHide callback mechanism
            const originalHide = modalInstance.hide;
            if (typeof originalHide === 'function') {
                modalInstance.hide = (...args) => {
                    console.log('[ModalFactory] 🎧 Modal hide() intercepted');
                    const result = originalHide.apply(modalInstance, args);
                    
                    // Check if this is programmatic navigation (modal-to-modal) vs user-initiated close
                    const isProgrammaticNavigation = modalInstance._programmaticNavigation;
                    if (isProgrammaticNavigation) {
                        console.log('[ModalFactory] 🎧 Programmatic navigation detected - skipping URL reversion');
                        modalInstance._programmaticNavigation = false; // Reset flag
                    }
                    
                    // Handle modal close after hide completes
                    setTimeout(() => {
                        if (this.activeModal === modalInstance) {
                            this.lastActiveModal = this.activeModal;
                            this.activeModal = null;
                            console.log('[ModalFactory] 🎧 Active modal cleared via hide() interception');
                        }
                        // Only trigger handleModalClose for user-initiated closes, not programmatic navigation
                        if (!isProgrammaticNavigation) {
                            this.handleModalClose();
                        }
                    }, 50);
                    
                    return result;
                };
                console.log('[ModalFactory] 🎧 Successfully set up hide() interception');
            }
            
            // Method 2: Set up DOM event listeners for common close mechanisms
            let modalElement = modalInstance.element || modalInstance.modalElement || modalInstance.modalEl;
            
            // If still no element found, try to find it in the DOM
            if (!modalElement && modalInstance.constructor?.name) {
                const modalClass = modalInstance.constructor.name.toLowerCase().replace('modal', '');
                modalElement = document.querySelector(`.${modalClass}-modal, .modal.${modalClass}-modal, .modal--${modalClass}`);
                console.log('[ModalFactory] 🎧 Found modal element via class search:', modalClass, !!modalElement);
            }
            
            if (modalElement) {
                
                // Listen for ESC key
                const escListener = (event) => {
                    if (event.key === 'Escape' && this.activeModal === modalInstance) {
                        console.log('[ModalFactory] 🎧 ESC key detected - modal closing');

                        // Check if the modal has origin tracking - if so, let AsyncFormModal.hide() handle URL restoration
                        const modalId = modalInstance.getModalId?.() || modalInstance.modalId;
                        const hasOriginTracking = modalId && ModalOriginTracker.hasOrigin(modalId);

                        if (hasOriginTracking) {
                            console.log('[ModalFactory] 🎧 ✋ Modal has origin tracking - letting AsyncFormModal.hide() handle URL restoration');
                            // Just clean up the router integration state, but don't call handleModalClose()
                            setTimeout(() => {
                                if (this.activeModal === modalInstance) {
                                    this.lastActiveModal = this.activeModal;
                                    this.activeModal = null;
                                    console.log('[ModalFactory] 🎧 Active modal cleared (origin tracking mode - ESC)');
                                }
                                // Don't call handleModalClose() - let the modal's hide() method handle URL restoration
                            }, 50);
                        } else {
                            console.log('[ModalFactory] 🎧 📎 No origin tracking - using router integration fallback');
                            setTimeout(() => {
                                if (this.activeModal === modalInstance) {
                                    this.lastActiveModal = this.activeModal;
                                    this.activeModal = null;
                                    console.log('[ModalFactory] 🎧 Active modal cleared via ESC key (fallback mode)');
                                }
                                this.handleModalClose();
                            }, 50);
                        }
                    }
                };
                
                // Listen for close button clicks
                const closeButtonListener = (event) => {
                    const target = event.target;
                    
                    // Check for various close button patterns
                    const isCloseButton = (
                        target.classList.contains('modal__close') ||
                        target.classList.contains('modal-close') || 
                        target.classList.contains('close-modal') ||
                        target.innerHTML === '&times;' ||
                        target.innerHTML === '✕' ||
                        target.textContent === '×' ||
                        target.id === 'accountsCancelBtn' ||
                        target.id === 'projectsCancelBtn' ||
                        target.id === 'usersCancelBtn' ||
                        target.id === 'documentsCancelBtn' ||
                        target.classList.contains('btn') && target.textContent.includes('Cancel')
                    );
                    
                    if (isCloseButton) {
                        console.log('[ModalFactory] 🎧 Close/Cancel button clicked:', target.className, target.textContent);

                        // Check if the modal has origin tracking - if so, let AsyncFormModal.hide() handle URL restoration
                        const modalId = modalInstance.getModalId?.() || modalInstance.modalId;
                        const hasOriginTracking = modalId && ModalOriginTracker.hasOrigin(modalId);

                        if (hasOriginTracking) {
                            console.log('[ModalFactory] 🎧 ✋ Modal has origin tracking - letting AsyncFormModal.hide() handle URL restoration');
                            // Just clean up the router integration state, but don't call handleModalClose()
                            setTimeout(() => {
                                if (this.activeModal === modalInstance) {
                                    this.lastActiveModal = this.activeModal;
                                    this.activeModal = null;
                                    console.log('[ModalFactory] 🎧 Active modal cleared (origin tracking mode)');
                                }
                                // Don't call handleModalClose() - let the modal's hide() method handle URL restoration
                            }, 50);
                        } else {
                            console.log('[ModalFactory] 🎧 📎 No origin tracking - using router integration fallback');
                            setTimeout(() => {
                                if (this.activeModal === modalInstance) {
                                    this.lastActiveModal = this.activeModal;
                                    this.activeModal = null;
                                    console.log('[ModalFactory] 🎧 Active modal cleared via close/cancel button (fallback mode)');
                                }
                                this.handleModalClose();
                            }, 50);
                        }
                    }
                };
                
                // Listen for overlay clicks (clicking outside modal)
                const overlayClickListener = (event) => {
                    if (event.target.classList.contains('modal-overlay') && this.activeModal === modalInstance) {
                        console.log('[ModalFactory] 🎧 Modal overlay clicked - closing modal');

                        // Check if the modal has origin tracking - if so, let AsyncFormModal.hide() handle URL restoration
                        const modalId = modalInstance.getModalId?.() || modalInstance.modalId;
                        const hasOriginTracking = modalId && ModalOriginTracker.hasOrigin(modalId);

                        if (hasOriginTracking) {
                            console.log('[ModalFactory] 🎧 ✋ Modal has origin tracking - letting AsyncFormModal.hide() handle URL restoration');
                            // Just clean up the router integration state, but don't call handleModalClose()
                            setTimeout(() => {
                                if (this.activeModal === modalInstance) {
                                    this.lastActiveModal = this.activeModal;
                                    this.activeModal = null;
                                    console.log('[ModalFactory] 🎧 Active modal cleared (origin tracking mode - overlay)');
                                }
                                // Don't call handleModalClose() - let the modal's hide() method handle URL restoration
                            }, 50);
                        } else {
                            console.log('[ModalFactory] 🎧 📎 No origin tracking - using router integration fallback');
                            setTimeout(() => {
                                if (this.activeModal === modalInstance) {
                                    this.lastActiveModal = this.activeModal;
                                    this.activeModal = null;
                                    console.log('[ModalFactory] 🎧 Active modal cleared via overlay click (fallback mode)');
                                }
                                this.handleModalClose();
                            }, 50);
                        }
                    }
                };
                
                document.addEventListener('keydown', escListener);
                modalElement.addEventListener('click', closeButtonListener);
                document.addEventListener('click', overlayClickListener);
                
                // Store listeners for cleanup
                modalInstance._closeListeners = { escListener, closeButtonListener, overlayClickListener };
                
                console.log('[ModalFactory] 🎧 Successfully set up DOM event listeners');
            }
            
        } catch (error) {
            console.warn('[ModalFactory] 🎧 Failed to set up modal close listener:', error);
        }
    }

    /**
     * Clean up event listeners for a modal
     */
    cleanupModalListeners(modalInstance) {
        if (!modalInstance || !modalInstance._closeListeners) return;

        const { escListener, closeButtonListener, overlayClickListener } = modalInstance._closeListeners;

        try {
            if (escListener) {
                document.removeEventListener('keydown', escListener);
            }
            if (overlayClickListener) {
                document.removeEventListener('click', overlayClickListener);
            }
            if (closeButtonListener && modalInstance.element) {
                modalInstance.element.removeEventListener('click', closeButtonListener);
            }
            
            delete modalInstance._closeListeners;
            console.log('[ModalFactory] 🧹 Cleaned up modal event listeners');
        } catch (error) {
            console.warn('[ModalFactory] 🧹 Error cleaning up modal listeners:', error);
        }
    }

    /**
     * Handle modal close event - check if we should revert to previous route
     * Uses ModalOriginTracker for coordinated URL restoration
     */
    handleModalClose() {
        console.log('[ModalFactory] 🔄 handleModalClose - Modal closed, checking if should revert URL');
        console.log('[ModalFactory] 🔄 Current state:');
        console.log('[ModalFactory] 🔄   - activeModal:', !!this.activeModal, this.activeModal?.constructor?.name);
        console.log('[ModalFactory] 🔄   - modalNavigationStarted:', this.modalNavigationStarted);
        console.log('[ModalFactory] 🔄   - current URL:', window.location.pathname + window.location.search);

        // Small delay to ensure modal is fully closed before checking
        setTimeout(() => {
            console.log('[ModalFactory] 🔄 After delay - checking reversion conditions');

            // Clean up any remaining modal listeners
            if (this.lastActiveModal) {
                this.cleanupModalListeners(this.lastActiveModal);

                // Check if the closed modal has origin tracking
                const modalId = this.lastActiveModal.getModalId?.() || this.lastActiveModal.modalId;

                // FAIL FAST: Only restore origin URL if NOT in modal navigation
                if (modalId && ModalOriginTracker.hasOrigin(modalId) && !this.modalNavigationStarted) {
                    console.log('[ModalFactory] 🔄 ✅ Found origin tracking for modal (user closed):', modalId);

                    // Get the origin URL using ModalOriginTracker
                    const originUrl = ModalOriginTracker.popOrigin(modalId);
                    if (originUrl && window.router && window.router.isReady()) {
                        try {
                            console.log('[ModalFactory] 🔄 🎯 Restoring origin URL via ModalOriginTracker:', originUrl);

                            // Use router to navigate back to origin with URL update only
                            window.router.updateUrl(originUrl, {
                                replace: true,
                                skipNavigation: true
                            });

                            console.log('[ModalFactory] 🔄 ✅ Successfully restored origin URL via ModalOriginTracker');
                        } catch (error) {
                            console.error('[ModalFactory] 🔄 ❌ Failed to restore origin URL via ModalOriginTracker:', error);

                            // Fallback: use history API directly
                            try {
                                window.history.replaceState({}, '', originUrl);
                                console.log('[ModalFactory] 🔄 ✅ Fallback: Used history API to restore origin URL');
                            } catch (historyError) {
                                console.error('[ModalFactory] 🔄 ❌ History API fallback also failed:', historyError);
                            }
                        }
                    } else {
                        console.warn('[ModalFactory] 🔄 ❌ Cannot restore origin URL - router not available or no origin URL');
                        console.log('[ModalFactory] 🔄   - originUrl:', originUrl);
                        console.log('[ModalFactory] 🔄   - window.router:', !!window.router);
                        console.log('[ModalFactory] 🔄   - router.isReady():', window.router?.isReady());
                    }
                } else if (modalId && ModalOriginTracker.hasOrigin(modalId) && this.modalNavigationStarted) {
                    // Modal has origin tracking but we're in modal navigation - don't restore URL
                    console.log('[ModalFactory] 🔄 ⏭️ Skipping URL restoration during modal-to-modal navigation');
                    console.log('[ModalFactory] 🔄   - Modal ID:', modalId);
                    console.log('[ModalFactory] 🔄   - Has origin tracking: true');
                    console.log('[ModalFactory] 🔄   - Modal navigation in progress: true');
                    console.log('[ModalFactory] 🔄   - URL restoration will be handled by final modal close');
                } else if (!this.activeModal && this.modalNavigationStarted && this.previousRoute) {
                    // DISABLED FALLBACK - AsyncFormModal origin tracking handles all URL restoration
                    console.log('[ModalFactory] 🔄 📎 FALLBACK DISABLED - AsyncFormModal origin tracking handles URL restoration');
                    console.log('[ModalFactory] 🔄   - Current URL:', window.location.pathname + window.location.search);
                    console.log('[ModalFactory] 🔄   - Previous route URL:', this.previousRoute.url);
                    console.log('[ModalFactory] 🔄   - Modal navigation started:', this.modalNavigationStarted);
                    console.log('[ModalFactory] 🔄   - No fallback action taken');
                } else {
                    console.log('[ModalFactory] 🔄 ❌ No URL reversion needed - no origin tracking or previous route');
                    console.log('[ModalFactory] 🔄   - modalId:', modalId);
                    console.log('[ModalFactory] 🔄   - hasOrigin:', modalId ? ModalOriginTracker.hasOrigin(modalId) : false);
                    console.log('[ModalFactory] 🔄   - modalNavigationStarted:', this.modalNavigationStarted);
                    console.log('[ModalFactory] 🔄   - previousRoute:', !!this.previousRoute);
                }

                this.lastActiveModal = null;
            }

            // Clean up modal navigation state
            if (!this.activeModal) {
                console.log('[ModalFactory] 🔄 Cleaning up modal navigation state');
                this.modalNavigationStarted = false;
                this.previousRoute = null;
            }
        }, 150); // Small delay to ensure modal DOM cleanup is complete
    }
}

/**
 * Convenience function to initialize router integration
 * @param {Object} config - Router configuration
 * @param {Object} components - Existing application components
 * @returns {Promise<RouterIntegration>} Router integration instance
 */
export async function initializeRouterIntegration(config, components) {
    const integration = new RouterIntegration();
    const success = await integration.initialize(config, components);
    
    if (!success) {
        throw new Error('Router integration initialization failed');
    }
    
    // Make router globally available
    window.router = integration.getRouter();
    window.routerIntegration = integration;

    // Initialize ModalURLValidator for FAIL FAST URL validation
    try {
        console.log('[RouterIntegration] 🔧 Initializing ModalURLValidator...');
        await initializeModalURLValidator(window.router);
        console.log('[RouterIntegration] ✅ ModalURLValidator initialized successfully');
    } catch (error) {
        console.error('[RouterIntegration] ❌ FAIL FAST: ModalURLValidator initialization failed:', error);
        // Don't throw - allow app to continue but log the failure
        console.warn('[RouterIntegration] ⚠️ Modal URL validation will not be available');
    }

    return integration;
}