/**
 * Assist Router Context Module
 *
 * This module extracts router-specific context information from Cognaire Respond's
 * routing system. It can detect router URLs, parse route parameters, and extract
 * modal context for Assist integration.
 *
 * Key Features:
 * - Detection of Respond router URL patterns
 * - Route parameter extraction and parsing
 * - Modal context detection
 * - Integration with Respond's router configuration
 */

/**
 * Check if a URL path matches Respond router patterns
 * Based on the route-config.json structure
 * @param {string} pathname - URL pathname to check
 * @returns {boolean} True if matches Respond router patterns
 */
export function isRespondRouterURL(pathname) {
  if (!pathname || typeof pathname !== 'string') {
    return false;
  }

  // Known Respond route patterns from route-config.json
  const respondRoutePatterns = [
    /^\/docs(\/.*)?$/,           // Document workspace routes
    /^\/corpus(\/.*)?$/,         // Corpus management routes
    /^\/modals(\/.*)?$/,         // Modal routes
    /^\/admin(\/.*)?$/,          // Administration routes
    /^\/auth(\/.*)?$/,           // Authentication routes
    /^\/auth-modals(\/.*)?$/,    // Auth modal routes
    /^\/system-modals(\/.*)?$/,  // System modal routes
  ];

  return respondRoutePatterns.some(pattern => pattern.test(pathname));
}

/**
 * Get current route information from Respond router
 * @returns {Object} Current route information
 */
export function getCurrentRoute() {
  try {
    // Try to get route from global router instance
    if (window.router && typeof window.router.getCurrentRoute === 'function') {
      return window.router.getCurrentRoute();
    }

    // Fallback: parse from URL
    return parseBasicRouteFromURL();
  } catch (error) {
    console.warn('[AssistRouter] Error getting current route:', error);
    return parseBasicRouteFromURL();
  }
}

/**
 * Parse basic route information from current URL
 * @returns {Object} Basic route information
 */
function parseBasicRouteFromURL() {
  const pathname = window.location.pathname;
  const search = window.location.search;

  // Extract main section
  const pathParts = pathname.split('/').filter(part => part.length > 0);
  const section = pathParts[0] || 'docs'; // Default to docs

  return {
    id: section,
    path: section,
    pathname,
    search,
    pathParts,
    available: false,
    source: 'url-fallback'
  };
}

/**
 * Parse route context from pathname and search parameters
 * @param {string} pathname - URL pathname
 * @param {string} search - URL search parameters
 * @returns {Object} Parsed route context
 */
export function parseRouteContext(pathname, search) {
  try {
    const pathParts = pathname.split('/').filter(part => part.length > 0);
    const urlParams = new URLSearchParams(search);

    const context = {
      section: pathParts[0] || null,
      subsection: pathParts[1] || null,
      entityId: pathParts[2] || null,
      pathParts,
      urlParams: Object.fromEntries(urlParams.entries()),
      subtenant: urlParams.get('s') || null,
      key: urlParams.get('key') || null
    };

    // Enhanced parsing based on known route patterns
    switch (context.section) {
      case 'docs':
        context.sectionType = 'document-workspace';
        context.documentId = context.subsection || null;
        if (context.documentId && /^[A-Z]{3}-\d{3,6}$/.test(context.documentId)) {
          context.hasValidDocumentId = true;
        }
        break;

      case 'corpus':
        context.sectionType = 'corpus-management';
        context.corpusSubsection = context.subsection || 'browse';
        context.corpusPath = pathParts.slice(1).join('/') || null;
        break;

      case 'modals':
        context.sectionType = 'modal-route';
        context.modalType = context.subsection || null;
        context.modalEntityId = context.entityId || null;
        break;

      case 'admin':
        context.sectionType = 'administration';
        context.adminSubsection = context.subsection || null;
        break;

      case 'auth':
      case 'auth-modals':
        context.sectionType = 'authentication';
        break;

      case 'system-modals':
        context.sectionType = 'system-utilities';
        break;

      default:
        context.sectionType = 'unknown';
    }

    return context;
  } catch (error) {
    console.error('[AssistRouter] Error parsing route context:', error);
    return {
      section: null,
      sectionType: 'error',
      error: error.message
    };
  }
}

/**
 * Get current modal context if any modal is active
 * @returns {Object} Modal context information
 */
export function getModalContext() {
  try {
    const modalContext = {
      hasActiveModal: false,
      modalType: null,
      modalTitle: null,
      modalComponent: null,
      routerModal: false
    };

    // Check for router-based modals (URL contains /modals/)
    if (window.location.pathname.includes('/modals/')) {
      modalContext.routerModal = true;
      modalContext.hasActiveModal = true;

      const pathParts = window.location.pathname.split('/');
      const modalIndex = pathParts.indexOf('modals');
      if (modalIndex >= 0 && pathParts[modalIndex + 1]) {
        modalContext.modalType = pathParts[modalIndex + 1];
      }
    }

    // Check for active modal elements in DOM
    const modalElements = document.querySelectorAll('.modal.show, .modal-backdrop, .async-form-modal.show');
    if (modalElements.length > 0) {
      modalContext.hasActiveModal = true;

      // Try to find modal title
      const titleElement = document.querySelector('.modal.show .modal-title, .async-form-modal.show .modal-title');
      if (titleElement) {
        modalContext.modalTitle = titleElement.textContent.trim();
      }

      // Try to identify modal component class
      modalElements.forEach(element => {
        const classes = Array.from(element.classList);
        const componentClass = classes.find(cls =>
          cls.endsWith('-modal') && cls !== 'async-form-modal'
        );
        if (componentClass) {
          modalContext.modalComponent = componentClass;
        }
      });
    }

    // Check router integration for active modal tracking
    if (window.router && window.router.integration && window.router.integration.activeModal) {
      modalContext.hasActiveModal = true;
      modalContext.routerIntegrated = true;
    }

    return modalContext;
  } catch (error) {
    console.error('[AssistRouter] Error getting modal context:', error);
    return {
      hasActiveModal: false,
      error: error.message
    };
  }
}

/**
 * Get route configuration from Respond router if available
 * @returns {Object} Route configuration or null
 */
export function getRouteConfiguration() {
  try {
    // Try to get from router config
    if (window.router && window.router.config) {
      return {
        available: true,
        config: window.router.config,
        routes: window.router.config.routes || []
      };
    }

    // Try to access route config directly if loaded
    if (window.ROUTE_CONFIG) {
      return {
        available: true,
        config: window.ROUTE_CONFIG,
        routes: window.ROUTE_CONFIG.routes || []
      };
    }

    return {
      available: false,
      reason: 'Route configuration not accessible'
    };
  } catch (error) {
    console.error('[AssistRouter] Error getting route configuration:', error);
    return {
      available: false,
      reason: 'Error accessing route configuration',
      error: error.message
    };
  }
}

/**
 * Find route definition for current path
 * @param {string} pathname - URL pathname to find route for
 * @returns {Object} Route definition or null
 */
export function findRouteDefinition(pathname) {
  try {
    const routeConfig = getRouteConfiguration();
    if (!routeConfig.available) {
      return null;
    }

    const pathParts = pathname.split('/').filter(part => part.length > 0);
    const section = pathParts[0] || 'docs';

    // Find matching route
    const route = routeConfig.routes.find(r => r.id === section || r.path === section);
    if (!route) {
      return null;
    }

    // Check for child routes
    let activeRoute = route;
    if (pathParts[1] && route.children) {
      const childRoute = route.children.find(child =>
        child.id === pathParts[1] || child.path === pathParts[1]
      );
      if (childRoute) {
        activeRoute = { ...route, activeChild: childRoute };
      }
    }

    // Check for modal routes
    if (route.modals && pathParts[1]) {
      const modalRoute = route.modals.find(modal =>
        modal.id === pathParts[1]
      );
      if (modalRoute) {
        activeRoute = { ...route, activeModal: modalRoute };
      }
    }

    console.log('[AssistRouter] ✅ Route definition found:', {
      routeId: activeRoute.id,
      hasTitle: !!activeRoute.title,
      hasChildren: !!(activeRoute.children && activeRoute.children.length > 0),
      hasModal: !!activeRoute.activeModal,
      hasChild: !!activeRoute.activeChild
    });

    return activeRoute;
  } catch (error) {
    console.error('[AssistRouter] Error finding route definition:', error);
    return null;
  }
}

/**
 * Get navigation breadcrumbs for current route
 * @returns {Array} Breadcrumb array with {label, url} objects
 */
export function getNavigationBreadcrumbs() {
  try {
    const pathname = window.location.pathname;
    const search = window.location.search;
    const routeDefinition = findRouteDefinition(pathname);
    const routeContext = parseRouteContext(pathname, search);

    const breadcrumbs = [];

    // Add root/home
    breadcrumbs.push({
      label: 'Home',
      url: `/docs${search}`,
      isActive: false
    });

    if (routeDefinition) {
      // Add main section
      breadcrumbs.push({
        label: routeDefinition.title || routeDefinition.id,
        url: `/${routeDefinition.path}${search}`,
        isActive: !routeDefinition.activeChild && !routeDefinition.activeModal
      });

      // Add child section if present
      if (routeDefinition.activeChild) {
        breadcrumbs.push({
          label: routeDefinition.activeChild.title || routeDefinition.activeChild.id,
          url: `/${routeDefinition.path}/${routeDefinition.activeChild.path}${search}`,
          isActive: true
        });
      }

      // Add modal context if present
      if (routeDefinition.activeModal) {
        breadcrumbs.push({
          label: routeDefinition.activeModal.title || routeDefinition.activeModal.id,
          url: window.location.href,
          isActive: true,
          isModal: true
        });
      }
    }

    // Add document context if in docs section
    if (routeContext.section === 'docs' && routeContext.documentId) {
      breadcrumbs.push({
        label: routeContext.documentId,
        url: window.location.href,
        isActive: true,
        isDocument: true
      });
    }

    return breadcrumbs;
  } catch (error) {
    console.error('[AssistRouter] Error getting breadcrumbs:', error);
    return [];
  }
}

/**
 * Check if current route requires authentication
 * @returns {boolean} True if authentication is required
 */
export function currentRouteRequiresAuth() {
  try {
    const pathname = window.location.pathname;
    const routeDefinition = findRouteDefinition(pathname);

    if (routeDefinition && routeDefinition.access) {
      return routeDefinition.access.requiresAuth !== false;
    }

    // Default to requiring auth for most routes
    const publicRoutes = ['/auth', '/auth-modals'];
    return !publicRoutes.some(route => pathname.startsWith(route));
  } catch (error) {
    console.error('[AssistRouter] Error checking auth requirement:', error);
    return true; // Err on the side of requiring auth
  }
}