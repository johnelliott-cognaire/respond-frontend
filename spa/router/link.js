// File: frontend/spa/router/link.js
/**
 * Router Link Utilities
 * 
 * Provides helper functions for creating navigation links, handling transitions,
 * and integrating with the existing DOM structure.
 */

/**
 * Router link utilities class
 */
export class RouterLinkUtils {
    constructor(router) {
        this.router = router;
    }

    /**
     * Create a navigation link element
     * @param {Object} options - Link options
     * @returns {HTMLElement} Link element
     */
    createLink(options) {
        const {
            routeId,
            entityId,
            modalId,
            queryParams,
            text,
            className,
            attributes = {},
            target
        } = options;

        // Build URL
        const url = this.router.buildUrl(routeId, { entityId, modalId, queryParams });
        
        // Create link element
        const link = document.createElement(target || 'a');
        
        // Set basic attributes
        if (target !== 'button') {
            link.href = url;
        }
        link.setAttribute('data-router-link', routeId);
        link.setAttribute('data-href', url);
        
        if (text) {
            link.textContent = text;
        }
        
        if (className) {
            link.className = className;
        }

        // Add additional attributes
        Object.entries(attributes).forEach(([key, value]) => {
            link.setAttribute(key, value);
        });

        // Add click handler for non-anchor elements
        if (target === 'button' || target === 'div') {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                this.router.navigate(url);
            });
        }

        return link;
    }

    /**
     * Update existing elements to be router-aware
     * @param {string|HTMLElement} selector - CSS selector or element
     * @param {Object} options - Link options
     */
    makeRouterLink(selector, options) {
        const elements = typeof selector === 'string' 
            ? document.querySelectorAll(selector)
            : [selector];

        elements.forEach(element => {
            const url = this.router.buildUrl(options.routeId, {
                entityId: options.entityId,
                modalId: options.modalId,
                queryParams: options.queryParams
            });

            element.setAttribute('data-router-link', options.routeId);
            element.setAttribute('data-href', url);

            if (element.tagName === 'A') {
                element.href = url;
            }
        });
    }

    /**
     * Update link active states based on current route
     */
    updateActiveStates() {
        const links = document.querySelectorAll('[data-router-link]');
        
        links.forEach(link => {
            const routeId = link.getAttribute('data-router-link');
            const isExact = link.hasAttribute('data-exact');
            const isActive = this.router.isRouteActive(routeId, { exact: isExact });
            
            link.classList.toggle('active', isActive);
            link.classList.toggle('router-active', isActive);
            
            // Update aria-current for accessibility
            if (isActive) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    /**
     * Generate breadcrumbs for current route
     * @returns {Array} Breadcrumb items
     */
    generateBreadcrumbs() {
        const currentMatch = this.router.getCurrentRoute();
        if (!currentMatch) return [];

        const breadcrumbs = [];
        const fullPath = currentMatch.fullPath;

        // Build breadcrumbs from path hierarchy
        for (let i = 0; i < fullPath.length; i++) {
            const pathSegments = fullPath.slice(0, i + 1);
            const routeData = this.findRouteByPath(pathSegments);
            
            if (routeData) {
                breadcrumbs.push({
                    title: routeData.route.title || routeData.route.id,
                    url: this.router.buildUrl(routeData.route.id),
                    routeId: routeData.route.id,
                    isLast: i === fullPath.length - 1
                });
            }
        }

        // Add entity information if present
        if (currentMatch.entityId) {
            breadcrumbs.push({
                title: currentMatch.entityId, // Could be enhanced with actual entity data
                url: window.location.pathname + window.location.search,
                isEntity: true,
                isLast: true
            });
        }

        return breadcrumbs;
    }

    /**
     * Find route by path segments
     */
    findRouteByPath(pathSegments) {
        const matcher = this.router.matcher;
        const pathKey = pathSegments.join('/');
        return matcher.pathIndex.get(pathKey);
    }

    /**
     * Create breadcrumb navigation element
     * @param {Object} options - Breadcrumb options
     * @returns {HTMLElement} Breadcrumb element
     */
    createBreadcrumbs(options = {}) {
        const {
            className = 'breadcrumbs',
            separator = '/',
            showHome = true,
            homeText = 'Home',
            homeRoute = 'docs'
        } = options;

        const breadcrumbs = this.generateBreadcrumbs();
        const container = document.createElement('nav');
        container.className = className;
        container.setAttribute('aria-label', 'Breadcrumb navigation');

        const list = document.createElement('ol');
        list.className = 'breadcrumb-list';

        // Add home breadcrumb if requested
        if (showHome && breadcrumbs.length > 0 && breadcrumbs[0].routeId !== homeRoute) {
            const homeItem = document.createElement('li');
            homeItem.className = 'breadcrumb-item';
            
            const homeLink = this.createLink({
                routeId: homeRoute,
                text: homeText,
                className: 'breadcrumb-link'
            });
            
            homeItem.appendChild(homeLink);
            list.appendChild(homeItem);

            if (breadcrumbs.length > 0) {
                const separatorSpan = document.createElement('span');
                separatorSpan.className = 'breadcrumb-separator';
                separatorSpan.textContent = separator;
                separatorSpan.setAttribute('aria-hidden', 'true');
                homeItem.appendChild(separatorSpan);
            }
        }

        // Add generated breadcrumbs
        breadcrumbs.forEach((crumb, index) => {
            const item = document.createElement('li');
            item.className = 'breadcrumb-item';
            
            if (crumb.isLast) {
                item.classList.add('active');
                const span = document.createElement('span');
                span.textContent = crumb.title;
                span.className = 'breadcrumb-current';
                span.setAttribute('aria-current', 'page');
                item.appendChild(span);
            } else {
                const link = document.createElement('a');
                link.href = crumb.url;
                link.textContent = crumb.title;
                link.className = 'breadcrumb-link';
                link.setAttribute('data-router-link', crumb.routeId);
                item.appendChild(link);

                // Add separator
                const separatorSpan = document.createElement('span');
                separatorSpan.className = 'breadcrumb-separator';
                separatorSpan.textContent = separator;
                separatorSpan.setAttribute('aria-hidden', 'true');
                item.appendChild(separatorSpan);
            }

            list.appendChild(item);
        });

        container.appendChild(list);
        return container;
    }

    /**
     * Create navigation menu from route configuration
     * @param {Object} options - Menu options
     * @returns {HTMLElement} Navigation menu element
     */
    createNavigationMenu(options = {}) {
        const {
            className = 'router-nav',
            showIcons = true,
            showBadges = true,
            filterFn = null,
            maxDepth = 2
        } = options;

        const routeTree = this.router.matcher.getRouteTree();
        const nav = document.createElement('nav');
        nav.className = className;
        nav.setAttribute('role', 'navigation');

        const buildMenuLevel = (routes, level = 0) => {
            if (level >= maxDepth) return null;

            const filteredRoutes = routes.filter(route => {
                // Filter out routes that shouldn't show in navigation
                if (route.navigation?.showInNavigation === false) return false;
                
                // Apply custom filter
                if (filterFn && !filterFn(route, level)) return false;
                
                // Check permissions (would need security context)
                // This would be implemented based on the actual security system
                
                return true;
            });

            if (filteredRoutes.length === 0) return null;

            const list = document.createElement('ul');
            list.className = `nav-level-${level}`;

            filteredRoutes.forEach(route => {
                const item = document.createElement('li');
                item.className = 'nav-item';
                item.setAttribute('data-route-id', route.id);

                // Create link
                const link = this.createLink({
                    routeId: route.id,
                    text: route.title || route.id,
                    className: 'nav-link'
                });

                // Add icon if configured
                if (showIcons && route.navigation?.icon) {
                    const icon = document.createElement('span');
                    icon.className = `nav-icon icon-${route.navigation.icon}`;
                    icon.setAttribute('aria-hidden', 'true');
                    link.insertBefore(icon, link.firstChild);
                }

                // Add badge if configured
                if (showBadges && route.navigation?.badge?.enabled) {
                    const badge = document.createElement('span');
                    badge.className = `nav-badge nav-badge-${route.navigation.badge.color || 'primary'}`;
                    badge.setAttribute('data-badge-source', route.navigation.badge.source);
                    // Badge count would be populated by the application based on the source
                    badge.textContent = '0';
                    link.appendChild(badge);
                }

                item.appendChild(link);

                // Add children if present
                if (route.children && route.children.length > 0) {
                    const childMenu = buildMenuLevel(route.children, level + 1);
                    if (childMenu) {
                        item.appendChild(childMenu);
                        item.classList.add('has-children');
                    }
                }

                list.appendChild(item);
            });

            return list;
        };

        const menu = buildMenuLevel(routeTree);
        if (menu) {
            nav.appendChild(menu);
        }

        return nav;
    }

    /**
     * Update navigation badges with current counts
     * @param {Object} badgeCounts - Object with badge source -> count mappings
     */
    updateNavigationBadges(badgeCounts) {
        const badges = document.querySelectorAll('[data-badge-source]');
        
        badges.forEach(badge => {
            const source = badge.getAttribute('data-badge-source');
            const count = badgeCounts[source] || 0;
            
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = count > 0 ? 'inline' : 'none';
        });
    }

    /**
     * Handle transition configurations from routes
     */
    setupTransitions() {
        const currentMatch = this.router.getCurrentRoute();
        if (!currentMatch || !currentMatch.route.transitions) {
            return;
        }

        Object.entries(currentMatch.route.transitions).forEach(([key, transition]) => {
            if (!transition.selector) return;

            const elements = document.querySelectorAll(transition.selector);
            elements.forEach(element => {
                const eventType = transition.trigger || 'click';
                
                const handler = (event) => {
                    // Check condition if specified
                    if (transition.condition) {
                        try {
                            // This would need to be evaluated in the proper context
                            // For now, we'll skip condition evaluation
                            console.log('[RouterLinkUtils] Transition condition check skipped');
                        } catch (error) {
                            console.warn('[RouterLinkUtils] Transition condition error:', error);
                            return;
                        }
                    }

                    event.preventDefault();

                    // Build target URL
                    const options = {};
                    if (transition.preserveEntity && currentMatch.entityId) {
                        options.entityId = currentMatch.entityId;
                    }

                    const targetUrl = this.router.buildUrl(transition.target, options);
                    this.router.navigate(targetUrl);
                };

                element.addEventListener(eventType, handler);
                
                // Store handler for cleanup
                element._routerTransitionHandler = handler;
            });
        });
    }

    /**
     * Clean up transition handlers
     */
    cleanupTransitions() {
        const elements = document.querySelectorAll('[data-router-transition]');
        elements.forEach(element => {
            if (element._routerTransitionHandler) {
                element.removeEventListener('click', element._routerTransitionHandler);
                delete element._routerTransitionHandler;
            }
        });
    }
}

/**
 * Standalone utility functions
 */

/**
 * Create a router link with the global router instance
 */
export function createRouterLink(options) {
    if (!window.router) {
        console.error('[RouterLink] Global router instance not found');
        return null;
    }
    
    const linkUtils = new RouterLinkUtils(window.router);
    return linkUtils.createLink(options);
}

/**
 * Make existing elements router-aware
 */
export function makeRouterLinks(selector, options) {
    if (!window.router) {
        console.error('[RouterLink] Global router instance not found');
        return;
    }
    
    const linkUtils = new RouterLinkUtils(window.router);
    linkUtils.makeRouterLink(selector, options);
}

/**
 * Update all router link active states
 */
export function updateRouterLinkStates() {
    if (!window.router) {
        return;
    }
    
    const linkUtils = new RouterLinkUtils(window.router);
    linkUtils.updateActiveStates();
}

/**
 * Generate breadcrumbs for current route
 */
export function generateBreadcrumbs() {
    if (!window.router) {
        return [];
    }
    
    const linkUtils = new RouterLinkUtils(window.router);
    return linkUtils.generateBreadcrumbs();
}

/**
 * Create breadcrumb navigation element
 */
export function createBreadcrumbNav(options) {
    if (!window.router) {
        return document.createElement('div');
    }
    
    const linkUtils = new RouterLinkUtils(window.router);
    return linkUtils.createBreadcrumbs(options);
}

/**
 * Simple link creation helper for common use cases
 */
export function link(routeId, text, options = {}) {
    if (!window.router) {
        const span = document.createElement('span');
        span.textContent = text;
        return span;
    }
    
    const linkUtils = new RouterLinkUtils(window.router);
    return linkUtils.createLink({
        routeId,
        text,
        ...options
    });
}

/**
 * Navigation menu creation helper
 */
export function createNavMenu(options) {
    if (!window.router) {
        return document.createElement('nav');
    }
    
    const linkUtils = new RouterLinkUtils(window.router);
    return linkUtils.createNavigationMenu(options);
}