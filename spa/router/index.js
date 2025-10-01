// File: frontend/spa/router/index.js
/**
 * Cognaire Respond Router
 * 
 * Enterprise-grade client-side router with JSON-driven configuration,
 * History API integration, and hierarchical navigation support.
 */

import { RouterValidator, validateRouterConfig } from './validate.js';
import { RouterMatcher } from './matcher.js';

export class CognaireRouter {
    constructor() {
        this.config = null;
        this.matcher = null;
        this.validator = new RouterValidator();
        this.currentMatch = null;
        this.previousMatch = null;
        this.routeHistory = [];
        this.maxHistorySize = 10; // Keep last 10 routes for memory management
        this.eventListeners = [];
        this.routeChangeCallbacks = [];
        this.navigationGuards = [];
        this.isInitialized = false;
        this._isStarted = false;
        this.errorModal = null; // Will be set from application
        
        // Bind methods to maintain context
        this.handlePopState = this.handlePopState.bind(this);
        this.handleLinkClick = this.handleLinkClick.bind(this);
    }

    /**
     * Initialize router with configuration
     * @param {Object} config - Route configuration object
     * @param {Object} options - Router options
     * @returns {Promise<boolean>} Success status
     */
    async initialize(config, options = {}) {
        try {
            console.log('[CognaireRouter] Initializing router...');

            // Validate configuration
            const validation = validateRouterConfig(config);
            if (!validation.success) {
                console.error('[CognaireRouter] Configuration validation failed:');
                validation.errors.forEach(error => console.error('  -', error));
                
                if (options.onValidationError) {
                    options.onValidationError(validation);
                } else {
                    this.showValidationError(validation);
                }
                return false;
            }

            if (validation.warnings.length > 0) {
                console.warn('[CognaireRouter] Configuration warnings:');
                validation.warnings.forEach(warning => console.warn('  -', warning));
            }

            // Store configuration and create matcher
            this.config = config;
            this.matcher = new RouterMatcher(config);
            
            // Set up History API listener
            this.setupHistoryListener();
            
            // Set up link click handling
            this.setupLinkClickHandling();

            // Store options
            this.options = {
                autoStart: true,
                errorHandler: null,
                ...options
            };

            this.isInitialized = true;

            // Auto-start navigation if requested
            if (this.options.autoStart) {
                await this.start();
            }

            console.log('[CognaireRouter] Router initialized successfully');
            return true;

        } catch (error) {
            console.error('[CognaireRouter] Initialization error:', error);
            if (this.options?.onError) {
                this.options.onError(error);
            }
            return false;
        }
    }

    /**
     * Start the router and handle current URL
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('Router must be initialized before starting');
        }

        console.log('[CognaireRouter] Starting router navigation...');
        
        // Mark as started
        this._isStarted = true;
        
        // Handle the current URL
        const currentUrl = window.location.pathname + window.location.search;
        await this.handleNavigation(currentUrl, { replace: true, initial: true });
    }

    /**
     * Set up History API event listener
     */
    setupHistoryListener() {
        const listener = this.handlePopState;
        window.addEventListener('popstate', listener);
        this.eventListeners.push({ 
            element: window, 
            event: 'popstate', 
            handler: listener 
        });
    }

    /**
     * Set up automatic link click handling
     */
    setupLinkClickHandling() {
        const listener = this.handleLinkClick;
        document.addEventListener('click', listener);
        this.eventListeners.push({ 
            element: document, 
            event: 'click', 
            handler: listener 
        });
    }

    /**
     * Handle browser back/forward navigation
     */
    async handlePopState(event) {
        const beforeUrl = window.location.pathname + window.location.search;
        console.log('[CognaireRouter] 📊 POPSTATE EVENT - URL:', beforeUrl);
        await this.handleNavigation(beforeUrl, { replace: true, fromHistory: true });
    }

    /**
     * Handle link clicks for automatic navigation
     */
    async handleLinkClick(event) {
        // Only handle clicks on elements with data-link attribute or router links
        const link = event.target.closest('[data-link], [data-router-link]');
        if (!link) return;

        // Allow default behavior for external links
        const href = link.getAttribute('href') || link.getAttribute('data-href');
        if (!href) return;

        // Allow default behavior for external links
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
            return;
        }

        // Allow default behavior if modifiers are pressed
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            return;
        }

        // Allow default behavior for middle clicks
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        await this.navigate(href);
    }

    /**
     * Navigate to a URL
     * @param {string} url - URL to navigate to
     * @param {Object} options - Navigation options
     * @returns {Promise<Object>} Navigation result with success status
     */
    async navigate(url, options = {}) {
        if (!this.isInitialized) {
            console.error('[CognaireRouter] Router not initialized');
            return { success: false, error: 'Router not initialized' };
        }

        const currentUrl = window.location.pathname + window.location.search;
        console.log('[CognaireRouter] 🚀 NAVIGATE START - From:', currentUrl, 'To:', url, 'Options:', options);

        try {
            // Preserve query parameters for all navigation unless explicitly disabled
            if (!options.skipQueryPreservation) {
                const urlWithParams = this.preserveQueryParams(url);
                if (urlWithParams !== url) {
                    console.log('[CognaireRouter] 🔧 Query parameters preserved:', url, '→', urlWithParams);
                    url = urlWithParams;
                }
            }

            // Check navigation guards
            const guardResult = await this.runNavigationGuards(url, options);
            if (!guardResult.allowed) {
                console.log('[CognaireRouter] 🚫 Navigation blocked by guard:', guardResult.reason);
                if (guardResult.redirect) {
                    // Build redirect URL with preserved query parameters
                    const redirectUrl = this.buildRedirectUrl(guardResult.redirect, url);
                    console.log('[CognaireRouter] ↩️ Guard redirect to:', redirectUrl);
                    return this.navigate(redirectUrl, options);
                }
                return { success: false, error: guardResult.reason, blocked: true };
            }

            // Update browser history unless it's a replace
            if (!options.replace && !options.fromHistory) {
                console.log('[CognaireRouter] 📝 HISTORY.PUSHSTATE - Updating URL to:', url);
                console.log('[CognaireRouter] 📝 BEFORE PUSHSTATE - Current URL:', window.location.href);
                history.pushState({}, '', url);
                console.log('[CognaireRouter] 📝 AFTER PUSHSTATE - New URL:', window.location.href);
            } else if (options.replace) {
                console.log('[CognaireRouter] 🔄 HISTORY.REPLACESTATE - Replacing URL with:', url);
                console.log('[CognaireRouter] 🔄 BEFORE REPLACESTATE - Current URL:', window.location.href);
                history.replaceState({}, '', url);
                console.log('[CognaireRouter] 🔄 AFTER REPLACESTATE - New URL:', window.location.href);
            } else if (options.fromHistory) {
                console.log('[CognaireRouter] 👈 HISTORY NAVIGATION - No URL change needed, already at:', url);
            }

            // Handle the navigation
            console.log('[CognaireRouter] 🎯 Starting handleNavigation for URL:', url);
            const result = await this.handleNavigation(url, options);
            console.log('[CognaireRouter] ✅ Navigation completed successfully - Result:', result);
            return { success: result, error: result ? null : 'Navigation failed' };

        } catch (error) {
            console.error('[CognaireRouter] Navigation error:', error);
            this.handleNavigationError(error, url);
            return { success: false, error: error.message };
        }
    }

    /**
     * Core navigation handling
     */
    async handleNavigation(url, options = {}) {
        const startTime = performance.now();
        console.log('[CognaireRouter] 🔧 HANDLE_NAVIGATION START - URL:', url, 'Options:', options);
        
        try {
            // Match the URL against routes
            console.log('[CognaireRouter] 🎯 Matching URL against routes:', url);
            const match = this.matcher.match(url);
            console.log('[CognaireRouter] 🎯 Route match result:', match);

            if (!match.success) {
                console.log('[CognaireRouter] ❌ No route matched - delegating to failure handler');
                return this.handleNavigationFailure(match, url, options);
            }

            // Check access permissions
            console.log('[CognaireRouter] 🔐 Checking route access for:', match.route?.id);
            const accessCheck = await this.checkRouteAccess(match.route, match);
            console.log('[CognaireRouter] 🔐 Access check result:', accessCheck);
            
            if (!accessCheck.allowed) {
                console.log('[CognaireRouter] 🚫 Access denied - delegating to access denied handler');
                return this.handleAccessDenied(accessCheck, match, url, options);
            }

            // Add fullUrl to the match object for origin tracking
            match.fullUrl = url;

            // Store current match as previous before updating
            if (this.currentMatch) {
                this.previousMatch = { ...this.currentMatch };
                console.log('[CognaireRouter] 📝 Stored previous match:', this.previousMatch);
                console.log('[CognaireRouter] 📝 Previous match fullUrl:', this.previousMatch.fullUrl);
            }

            const previousMatch = this.currentMatch;
            console.log('[CognaireRouter] 📝 Storing route match - Previous:', previousMatch?.route?.id, 'New:', match?.route?.id);
            console.log('[CognaireRouter] 📝 New match fullUrl:', match.fullUrl);
            this.currentMatch = match;

            // Add to history for debugging
            this._addToHistory(this.currentMatch);

            // Execute navigation
            console.log('[CognaireRouter] 🎬 Executing navigation for route:', match.route?.id);
            const navigationResult = await this.executeNavigation(match, previousMatch, options);
            console.log('[CognaireRouter] 🎬 Navigation execution result:', navigationResult);

            if (navigationResult.success) {
                // Update page title
                console.log('[CognaireRouter] 📄 Updating page title');
                this.updatePageTitle(match);

                // Fire route change callbacks
                console.log('[CognaireRouter] 🔄 Firing route change callbacks');
                this.fireRouteChangeCallbacks(match, previousMatch, options);
                
                const endTime = performance.now();
                console.log('[CognaireRouter] ✅ HANDLE_NAVIGATION SUCCESS - Duration:', (endTime - startTime).toFixed(2), 'ms');
                return true;
            } else {
                console.error('[CognaireRouter] ❌ Navigation execution failed after', (performance.now() - startTime).toFixed(2), 'ms');
                return false;
            }

        } catch (error) {
            console.error('[CognaireRouter] 💥 Navigation handling error after', (performance.now() - startTime).toFixed(2), 'ms:', error);
            this.handleNavigationError(error, url);
            return false;
        }
    }

    /**
     * Handle navigation failure (no matching route)
     */
    async handleNavigationFailure(match, url, options) {
        console.warn('[CognaireRouter] No route matched:', url);

        // Create enhanced URL validation error
        const urlError = new Error('URL validation failed');
        urlError.type = 'URL_VALIDATION';
        urlError.code = 'INVALID_URL';
        urlError.originalUrl = url;
        urlError.validationDetails = {
            error: match.error,
            reasons: match.reasons || ['No matching route found'],
            invalidSegments: match.invalidSegments || [],
            suggestions: []
        };

        // If we found a partial match, navigate there and show error
        if (match.partial && match.route) {
            const partialUrl = this.matcher.buildUrl(match.route.id, {
                entityId: match.entityId,
                queryParams: match.queryParams
            });

            urlError.partialMatch = partialUrl;

            // Navigate to partial match
            if (partialUrl !== url) {
                await this.navigate(partialUrl, { replace: true });
            }

            // Add suggestions for partial match
            urlError.validationDetails.suggestions.push(
                'The full URL path was not valid',
                'You were redirected to the closest valid page'
            );

            // Get additional suggestions from matcher
            if (this.matcher.getSuggestions) {
                const matcherSuggestions = this.matcher.getSuggestions(match.invalidSegments || []);
                urlError.validationDetails.suggestions.push(...matcherSuggestions);
            }

            // Show enhanced validation error
            this.handleNavigationError(urlError, url);
            return true; // We handled it
        }

        // No partial match - navigate to error route or default
        const errorRouteId = this.config.globalSettings?.errorRoute;
        const defaultRouteId = this.config.globalSettings?.defaultRoute || 'docs';
        
        const fallbackRouteId = errorRouteId || defaultRouteId;
        const fallbackUrl = this.matcher.buildUrl(fallbackRouteId, {
            queryParams: match.queryParams
        });

        urlError.partialMatch = fallbackUrl;

        if (fallbackUrl !== url) {
            await this.navigate(fallbackUrl, { replace: true });
        }

        // Add fallback information
        urlError.validationDetails.suggestions.push(
            'No valid route found for the requested URL',
            `Redirected to default page: ${fallbackUrl}`
        );

        // Show enhanced validation error
        this.handleNavigationError(urlError, url);
        return true;
    }

    /**
     * Check route access permissions
     */
    async checkRouteAccess(route, match) {
        // Get security context (will be injected by application)
        const security = this.getSecurityContext();
        
        if (!security) {
            console.warn('[CognaireRouter] No security context available');
            // For routes requiring auth, redirect to login
            if (route.access?.requiresAuth !== false) {
                const currentUrl = window.location.pathname + window.location.search;
                const authRedirectUrl = this.buildRedirectUrl('/auth', currentUrl);
                return {
                    allowed: false,
                    reason: 'No security context available - authentication required',
                    redirect: authRedirectUrl
                };
            }
            return { allowed: true }; // Allow if no auth required
        }

        // Check authentication requirement
        const requiresAuth = route.access?.requiresAuth !== false; // Default to true
        
        if (requiresAuth && !security.isAuthenticated()) {
            // Build auth redirect URL with preserved query parameters
            const currentUrl = window.location.pathname + window.location.search;
            const authRedirectUrl = this.buildRedirectUrl('/auth', currentUrl);
            return {
                allowed: false,
                reason: 'Authentication required',
                redirect: authRedirectUrl
            };
        }

        // Check permissions using consolidated security.js method
        const enforcePermissions = route.access?.enforcePermissions === true;
        const permissions = route.access?.permissionsAnyOf || route.access?.permissionsAllOf;
        
        if (permissions && permissions.length > 0) {
            // Use consolidated security method for all permission checking
            const permissionResult = security.hasRouterPermission(permissions, enforcePermissions, route.id);
            
            if (!permissionResult.allowed) {
                return {
                    allowed: false,
                    reason: permissionResult.reason,
                    requiredPermissions: permissionResult.requiredPermissions
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Handle access denied scenarios
     */
    async handleAccessDenied(accessCheck, match, url, options) {
        console.log('[CognaireRouter] 🚫 ACCESS_DENIED START - URL:', url);
        console.log('[CognaireRouter] 🚫 Access check details:', accessCheck);
        console.log('[CognaireRouter] 🚫 Route match details:', match);

        if (accessCheck.redirect) {
            console.log('[CognaireRouter] ↩️ Access denied with redirect to:', accessCheck.redirect);
            return this.navigate(accessCheck.redirect, { replace: true });
        }

        // Show access denied error
        console.log('[CognaireRouter] 🚨 Showing access denied error modal');
        this.showAccessDeniedError({
            reason: accessCheck.reason,
            requiredPermissions: accessCheck.requiredPermissions,
            route: match.route
        });

        // Navigate to safe fallback
        const fallbackRouteId = this.config.globalSettings?.defaultRoute || 'docs';
        console.log('[CognaireRouter] 🏠 Building fallback URL for route:', fallbackRouteId);
        const fallbackUrl = this.matcher.buildUrl(fallbackRouteId, {
            queryParams: match.queryParams
        });
        console.log('[CognaireRouter] 🏠 Fallback URL constructed:', fallbackUrl);

        if (fallbackUrl !== url) {
            console.log('[CognaireRouter] ↩️ Redirecting to fallback URL (different from current):', fallbackUrl);
            return this.navigate(fallbackUrl, { replace: true });
        }

        console.log('[CognaireRouter] ⭕ Fallback URL same as current URL - not navigating');
        return false;
    }

    /**
     * Execute the actual navigation (render views, show modals, etc.)
     */
    async executeNavigation(match, previousMatch, options) {
        try {
            console.log('[CognaireRouter] 🎬 EXECUTE_NAVIGATION START - Match:', {
                routeId: match.route?.id,
                modalId: match.modalId,
                entityId: match.entityId,
                queryParams: match.queryParams
            });
            console.log('[CognaireRouter] 🎬 Previous match:', {
                routeId: previousMatch?.route?.id,
                modalId: previousMatch?.modalId
            });

            // If there's a modal to show
            if (match.modalId) {
                console.log('[CognaireRouter] 🎭 Showing modal:', match.modalId);
                const modalResult = await this.showModal(match);
                console.log('[CognaireRouter] 🎭 Modal show result:', modalResult);
                return modalResult;
            }

            // If there was a modal showing, hide it
            if (previousMatch?.modalId && !match.modalId) {
                console.log('[CognaireRouter] 🎭 Hiding previous modal:', previousMatch.modalId);
                this.hideCurrentModal();
            }

            // Render the route view
            console.log('[CognaireRouter] 🖼️ Rendering route view for:', match.route?.id);
            const renderResult = await this.renderRoute(match, options);
            console.log('[CognaireRouter] 🖼️ Route render result:', renderResult);
            return renderResult;

        } catch (error) {
            console.error('[CognaireRouter] 💥 Navigation execution error:', error);
            console.error('[CognaireRouter] 💥 Error stack:', error.stack);
            return { success: false, error };
        }
    }

    /**
     * Render a route view
     */
    async renderRoute(match, options) {
        console.log('[CognaireRouter] 🖼️ RENDER_ROUTE START - Route:', match.route?.id, 'Component:', match.route?.component?.factory);
        
        const viewFactory = this.getViewFactory();
        console.log('[CognaireRouter] 🖼️ View factory available:', !!viewFactory, 'Type:', typeof viewFactory);
        
        if (!viewFactory) {
            console.error('[CognaireRouter] ❌ No view factory available - cannot render route');
            return { success: false, error: 'No view factory' };
        }

        try {
            console.log('[CognaireRouter] 🖼️ Calling viewFactory.renderRoute with match:', {
                routeId: match.route?.id,
                componentType: match.route?.component?.type,
                componentFactory: match.route?.component?.factory
            });
            
            const renderResult = await viewFactory.renderRoute(match, options);
            console.log('[CognaireRouter] 🖼️ ViewFactory.renderRoute completed with result:', renderResult);
            
            return { success: true, result: renderResult };
        } catch (error) {
            console.error('[CognaireRouter] ❌ View rendering error:', error);
            console.error('[CognaireRouter] ❌ Error stack:', error.stack);
            return { success: false, error };
        }
    }

    /**
     * Show a modal
     */
    async showModal(match) {
        const modalFactory = this.getModalFactory();
        if (!modalFactory) {
            console.error('[CognaireRouter] No modal factory available');
            return { success: false, error: 'No modal factory' };
        }

        try {
            console.log(`[CognaireRouter] 🔍 Looking for modal: ${match.modalId}`);
            const modalInfo = this.matcher.getModal(match.modalId);
            console.log(`[CognaireRouter] 📦 Found modal info:`, modalInfo);
            
            if (!modalInfo) {
                console.error(`[CognaireRouter] ❌ Modal not found: ${match.modalId}`);
                return { success: false, error: `Modal not found: ${match.modalId}` };
            }
            
            console.log(`[CognaireRouter] 📞 Calling modal factory showModal...`);
            const showResult = await modalFactory.showModal(modalInfo, match);
            console.log(`[CognaireRouter] ✅ Modal show result:`, showResult);
            return { success: true, result: showResult };
        } catch (error) {
            console.error('[CognaireRouter] ❌ Modal show error:', error);
            return { success: false, error };
        }
    }

    /**
     * Hide current modal
     */
    hideCurrentModal() {
        const modalFactory = this.getModalFactory();
        if (modalFactory && modalFactory.hideCurrentModal) {
            modalFactory.hideCurrentModal();
        }
    }

    /**
     * Update page title based on route
     */
    updatePageTitle(match) {
        let title = 'Cognaire Respond'; // Default title

        if (match.route.meta?.pageTitle) {
            title = match.route.meta.pageTitle;
            
            // Replace variables in title template
            if (match.entityId && title.includes('{{entity')) {
                // This would be enhanced with actual entity data
                title = title.replace(/\{\{entity\.[^}]+\}\}/g, match.entityId);
            }
        } else if (match.route.title) {
            title = `${match.route.title} - Cognaire Respond`;
        }

        document.title = title;
    }

    /**
     * Run navigation guards
     */
    async runNavigationGuards(url, options) {
        for (const guard of this.navigationGuards) {
            try {
                const result = await guard(url, options, this.currentMatch);
                if (!result.allowed) {
                    return result;
                }
            } catch (error) {
                console.error('[CognaireRouter] Navigation guard error:', error);
                return {
                    allowed: false,
                    reason: 'Navigation guard error',
                    error
                };
            }
        }
        
        return { allowed: true };
    }

    /**
     * Fire route change callbacks
     */
    fireRouteChangeCallbacks(match, previousMatch, options) {
        this.routeChangeCallbacks.forEach(callback => {
            try {
                callback(match, previousMatch, options);
            } catch (error) {
                console.error('[CognaireRouter] Route change callback error:', error);
            }
        });
    }

    /**
     * Add route change callback
     */
    onRouteChange(callback) {
        this.routeChangeCallbacks.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = this.routeChangeCallbacks.indexOf(callback);
            if (index > -1) {
                this.routeChangeCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * Add navigation guard
     */
    addNavigationGuard(guard) {
        this.navigationGuards.push(guard);
        
        // Return remove function
        return () => {
            const index = this.navigationGuards.indexOf(guard);
            if (index > -1) {
                this.navigationGuards.splice(index, 1);
            }
        };
    }

    /**
     * Build redirect URL with preserved query parameters from original URL
     * @param {string} redirectPath - Target redirect path (e.g., '/auth')
     * @param {string} originalUrl - Original URL that triggered the redirect
     * @returns {string} Redirect URL with preserved query parameters
     */
    buildRedirectUrl(redirectPath, originalUrl) {
        try {
            // Extract query parameters from the original URL
            const originalUrlObj = new URL(originalUrl, window.location.origin);
            const queryParams = {};
            
            // Extract query params from original URL
            originalUrlObj.searchParams.forEach((value, key) => {
                queryParams[key] = value;
            });

            // Determine the target route ID from the redirect path
            let targetRouteId = 'auth'; // Default
            if (redirectPath === '/docs' || redirectPath === '/') {
                targetRouteId = 'docs';
            } else if (redirectPath === '/corpus') {
                targetRouteId = 'corpus';
            } else if (redirectPath === '/admin') {
                targetRouteId = 'admin';
            }

            // Use matcher's buildUrl to construct URL with preserved parameters
            return this.matcher.buildUrl(targetRouteId, { queryParams });
        } catch (error) {
            console.warn('[CognaireRouter] Failed to build redirect URL, using fallback:', error);
            // Fallback: append query string manually
            const originalUrlObj = new URL(originalUrl, window.location.origin);
            return redirectPath + originalUrlObj.search;
        }
    }

    /**
     * Get current route information
     */
    getCurrentRoute() {
        return this.currentMatch;
    }

    /**
     * Get current match (alias for getCurrentRoute for test compatibility)
     */
    getCurrentMatch() {
        return this.currentMatch;
    }

    /**
     * Match a route without navigating (for testing/validation)
     */
    matchRoute(url) {
        if (!this.matcher) {
            return {
                success: false,
                error: 'Router not initialized'
            };
        }
        return this.matcher.match(url);
    }

    /**
     * Stop the router
     */
    stop() {
        console.log('[CognaireRouter] Stopping router...');
        
        // Remove event listeners but keep configuration
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
        
        // Mark as stopped but keep initialized state for restart
        this._isStarted = false;
        
        console.log('[CognaireRouter] Router stopped');
        return true;
    }

    /**
     * Check if router is started (method for test compatibility)
     */
    isStarted() {
        return this._isStarted;
    }

    /**
     * Check if router is ready and initialized
     */
    isReady() {
        const ready = this._isStarted && this.matcher && this.config;
        console.log('[CognaireRouter] isReady() check - _isStarted:', this._isStarted, 'matcher:', !!this.matcher, 'config:', !!this.config, 'result:', ready);
        return ready;
    }

    /**
     * Get the router configuration
     * @returns {Object|null} The router configuration
     */
    getConfig() {
        return this.config;
    }

    /**
     * Check if route is currently active
     */
    isRouteActive(routeId, options = {}) {
        if (!this.currentMatch) return false;
        
        if (options.exact) {
            return this.currentMatch.route.id === routeId;
        }
        
        // Check if current route is descendant of specified route
        const targetRoute = this.matcher.getRoute(routeId);
        if (!targetRoute) return false;
        
        const currentPath = this.currentMatch.fullPath;
        const targetPath = targetRoute.fullPath;
        
        if (targetPath.length > currentPath.length) return false;
        
        return targetPath.every((segment, index) => segment === currentPath[index]);
    }

    /**
     * Build URL for route
     */
    buildUrl(routeId, options = {}) {
        return this.matcher.buildUrl(routeId, options);
    }

    /**
     * Error handling methods
     */
    showValidationError(validation) {
        if (this.errorModal) {
            this.errorModal.show({
                title: 'Router Configuration Error',
                message: 'The router configuration contains errors and cannot be loaded.',
                details: validation.errors.join('\n'),
                isBlocking: true
            });
        } else {
            console.error('[CognaireRouter] Configuration errors:', validation.errors);
        }
    }

    showInvalidUrlError(errorInfo) {
        if (this.errorModal) {
            this.errorModal.show({
                title: 'Invalid URL',
                message: 'The requested URL is not valid.',
                details: `Original URL: ${errorInfo.originalUrl}\nNavigated to: ${errorInfo.partialMatch}`,
                suggestions: errorInfo.suggestions
            });
        }
    }

    showNavigationError(errorInfo) {
        if (this.errorModal) {
            this.errorModal.show({
                title: 'Navigation Error',
                message: 'Unable to navigate to the requested page.',
                details: errorInfo.error || 'Unknown navigation error'
            });
        }
    }

    showAccessDeniedError(errorInfo) {
        if (this.errorModal) {
            this.errorModal.show({
                title: 'Access Denied',
                message: errorInfo.reason || 'You do not have permission to access this page.',
                details: errorInfo.requiredPermissions ? 
                    `Required permissions: ${errorInfo.requiredPermissions.join(', ')}` : null
            });
        }
    }

    handleNavigationError(error, url) {
        console.error('[CognaireRouter] Navigation error for URL', url, ':', error);
        
        if (this.options?.errorHandler) {
            this.options.errorHandler(error, url);
        } else if (this.errorModal) {
            this.errorModal.show({
                title: 'Navigation Error',
                message: 'An unexpected error occurred during navigation.',
                details: error.message || 'Unknown error'
            });
        }
    }

    /**
     * Build redirect URL with preserved query parameters
     * @param {string} targetUrl - Target URL to redirect to
     * @param {string} currentUrl - Current URL (optional, defaults to window.location)
     * @returns {string} URL with preserved query parameters
     */
    buildRedirectUrl(targetUrl, currentUrl = null) {
        const preservedParams = this.config.globalSettings?.preserveQueryParams || [];
        if (preservedParams.length === 0) {
            return targetUrl;
        }

        // Get current query parameters
        const currentParams = new URLSearchParams(currentUrl ? new URL(currentUrl, window.location.origin).search : window.location.search);
        
        // Parse target URL
        const targetUrlObj = new URL(targetUrl, window.location.origin);
        const targetParams = new URLSearchParams(targetUrlObj.search);

        // Preserve specified parameters from current URL
        preservedParams.forEach(param => {
            if (currentParams.has(param) && !targetParams.has(param)) {
                targetParams.set(param, currentParams.get(param));
                console.log(`[CognaireRouter] 🔧 Preserving query parameter: ${param}=${currentParams.get(param)}`);
            }
        });

        // Reconstruct URL
        const finalUrl = targetUrlObj.pathname + (targetParams.toString() ? '?' + targetParams.toString() : '');
        console.log(`[CognaireRouter] 🔗 Built redirect URL: ${targetUrl} → ${finalUrl}`);
        return finalUrl;
    }

    /**
     * Preserve query parameters during navigation
     * @param {string} url - Target URL
     * @returns {string} URL with preserved query parameters
     */
    preserveQueryParams(url) {
        return this.buildRedirectUrl(url, window.location.href);
    }

    /**
     * Integration points (to be set by application)
     */
    setErrorModal(errorModal) {
        this.errorModal = errorModal;
    }

    setSecurityContext(securityGetter) {
        this.getSecurityContext = securityGetter;
    }

    setViewFactory(viewFactory) {
        this.getViewFactory = () => viewFactory;
    }

    setModalFactory(modalFactory) {
        this.getModalFactory = () => modalFactory;
    }

    /**
     * Cleanup
     */
    destroy() {
        // Remove event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];

        // Clear callbacks
        this.routeChangeCallbacks = [];
        this.navigationGuards = [];

        // Clear state
        this.currentMatch = null;
        this.previousMatch = null;
        this.routeHistory = [];
        this.isInitialized = false;
        this._isStarted = false;

        console.log('[CognaireRouter] Router destroyed');
    }

    /**
     * Update the URL without triggering navigation (for modal origin restoration)
     * @param {string} url - The URL to set
     * @param {Object} options - Update options
     * @param {boolean} options.replace - Use replaceState instead of pushState
     * @param {boolean} options.skipNavigation - Skip triggering route handler
     */
    updateUrl(url, options = {}) {
        const { replace = false, skipNavigation = false } = options;

        console.log(`[CognaireRouter] updateUrl called:`, { url, replace, skipNavigation });

        if (replace) {
            window.history.replaceState({}, '', url);
        } else {
            window.history.pushState({}, '', url);
        }

        if (!skipNavigation) {
            this.handleNavigation(url);
        }

        console.log(`[CognaireRouter] URL updated to: ${url}`);
    }

    /**
     * Get the previous route information
     * @returns {Object|null} Previous route match info or null if none
     */
    getPreviousRoute() {
        console.log('[CognaireRouter] getPreviousRoute called');
        console.log('[CognaireRouter] Previous match:', this.previousMatch);
        return this.previousMatch;
    }

    /**
     * Get current route information
     * @returns {Object|null} Current route match info or null if none
     */
    getCurrentRoute() {
        return this.currentMatch;
    }

    /**
     * Add route match to history for debugging
     * @private
     */
    _addToHistory(match) {
        this.routeHistory.unshift({
            ...match,
            timestamp: Date.now()
        });

        // Keep only the last N routes to prevent memory leaks
        if (this.routeHistory.length > this.maxHistorySize) {
            this.routeHistory = this.routeHistory.slice(0, this.maxHistorySize);
        }
    }

    /**
     * Get route history for debugging
     * @returns {Array} Array of recent route matches
     */
    getRouteHistory() {
        return this.routeHistory;
    }
}

// Export convenience functions
export { validateRouterConfig } from './validate.js';
export { RouterMatcher } from './matcher.js';

/**
 * Create and initialize router instance
 */
export async function createRouter(config, options = {}) {
    const router = new CognaireRouter();
    const success = await router.initialize(config, options);
    
    if (!success) {
        throw new Error('Router initialization failed');
    }
    
    return router;
}