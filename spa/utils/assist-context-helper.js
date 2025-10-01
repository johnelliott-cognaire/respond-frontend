/**
 * Assist Context Helper - Main API for Assist Integration
 *
 * This module provides the primary interface for Assist to detect when it's running
 * inside Cognaire Respond and extract contextual information about the current
 * application state, router context, and active documents.
 *
 * Key Features:
 * - Fast detection of Respond environment without network calls
 * - Router context extraction from URL and router state
 * - Document workflow context including task types and stages
 * - Safe error handling with meaningful fallbacks
 */

import { getCurrentRoute, isRespondRouterURL, parseRouteContext, getModalContext } from './assist-router-context.js';
import { getActiveDocumentInfo, getDocumentTaskType, getCurrentStageInfo, getDocumentMetadata } from './assist-document-context.js';

/**
 * Context object structure returned by getRespondContext()
 * @typedef {Object} RespondContext
 * @property {boolean} isRunningInRespond - Whether Assist is running inside Respond
 * @property {string} domain - Current domain (e.g., 'dev1.cognairerespond.com')
 * @property {string} subtenant - Current subtenant from URL params
 * @property {Object} router - Router context information
 * @property {Object} document - Active document context (null if no document)
 * @property {Object} application - General application state
 * @property {string} timestamp - When context was captured
 */

/**
 * Fast detection if Assist is running inside Cognaire Respond
 * Uses synchronous checks to avoid network timeouts
 * @returns {boolean} True if running inside Respond
 */
export function isRunningInRespond() {
  try {
    // Check 1: Domain pattern
    const hostname = window.location.hostname;
    if (hostname.includes('cognairerespond.com') ||
        hostname.includes('localhost') ||
        hostname.includes('127.0.0.1')) {

      // Check 2: Respond-specific URL patterns
      if (isRespondRouterURL(window.location.pathname)) {
        return true;
      }

      // Check 3: Respond route config presence
      if (window.router && window.router.config) {
        return true;
      }

      // Check 4: Respond-specific DOM elements
      const respondElements = [
        'meta[name="application"][content*="respond"]',
        'script[src*="main.js"]',
        'link[href*="tokens.css"]'
      ];

      for (const selector of respondElements) {
        if (document.querySelector(selector)) {
          return true;
        }
      }

      // Check 5: Respond store presence
      if (window.store && typeof window.store.get === 'function') {
        console.log('[AssistContext] ✅ Running in Respond - store detected');
        return true;
      }
    }

    console.log('[AssistContext] ❌ Not running in Respond environment');
    return false;
  } catch (error) {
    console.warn('[AssistContext] Error detecting Respond environment:', error);
    return false;
  }
}

/**
 * Get current router context from Respond
 * @returns {Object} Router context information
 */
export function getCurrentRouterContext() {
  try {
    if (!isRunningInRespond()) {
      return { available: false, reason: 'Not running in Respond' };
    }

    const currentRoute = getCurrentRoute();
    const routeContext = parseRouteContext(window.location.pathname, window.location.search);
    const modalContext = getModalContext();

    return {
      available: true,
      currentRoute,
      routeContext,
      modalContext,
      url: window.location.href,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash
    };
  } catch (error) {
    console.error('[AssistContext] Error getting router context:', error);
    return {
      available: false,
      reason: 'Error accessing router context',
      error: error.message
    };
  }
}

/**
 * Get active document context from Respond
 * @returns {Object} Document context information or null
 */
export function getActiveDocumentContext() {
  try {
    if (!isRunningInRespond()) {
      return null;
    }

    const documentInfo = getActiveDocumentInfo();
    const taskType = getDocumentTaskType();
    const stageInfo = getCurrentStageInfo();
    const metadata = getDocumentMetadata();

    // Return null if no document is active
    if (!documentInfo.hasActiveDocument) {
      return null;
    }

    return {
      available: true,
      documentInfo,
      taskType,
      stageInfo,
      metadata,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AssistContext] Error getting document context:', error);
    return {
      available: false,
      reason: 'Error accessing document context',
      error: error.message
    };
  }
}

/**
 * Get general application state context
 * @returns {Object} Application state information
 */
export function getApplicationStateContext() {
  try {
    if (!isRunningInRespond()) {
      return { available: false, reason: 'Not running in Respond' };
    }

    const state = {};

    // Get store state if available
    if (window.store && typeof window.store.get === 'function') {
      try {
        state.user = window.store.get('user') || null;
        state.openTabs = window.store.get('openTabs') || [];
        state.activeTabIndex = window.store.get('activeTabIndex') || 0;
        state.permissions = window.store.get('permissions') || null;
      } catch (storeError) {
        console.warn('[AssistContext] Error accessing store:', storeError);
      }
    }

    // Get security context if available
    if (window.securityManager || window.SecurityManager) {
      try {
        const securityManager = window.securityManager ||
          (window.SecurityManager && window.SecurityManager.getInstance ?
           window.SecurityManager.getInstance(window.store) : null);

        if (securityManager && typeof securityManager.getSecurity === 'function') {
          const security = securityManager.getSecurity();
          state.security = {
            isAuthenticated: security.isAuthenticated(),
            username: security.getUsername(),
            permissions: security.getSystemPermissions ? security.getSystemPermissions() : null
          };
        }
      } catch (securityError) {
        console.warn('[AssistContext] Error accessing security context:', securityError);
      }
    }

    return {
      available: true,
      state,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AssistContext] Error getting application state:', error);
    return {
      available: false,
      reason: 'Error accessing application state',
      error: error.message
    };
  }
}

/**
 * Get comprehensive Respond context for Assist
 * This is the main function Assist should call to get all available context
 * @returns {RespondContext} Complete context object
 */
export function getRespondContext() {
  const isRunning = isRunningInRespond();

  if (!isRunning) {
    return {
      isRunningInRespond: false,
      domain: window.location.hostname,
      subtenant: null,
      router: { available: false, reason: 'Not running in Respond' },
      document: null,
      application: { available: false, reason: 'Not running in Respond' },
      timestamp: new Date().toISOString()
    };
  }

  // Extract subtenant from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const subtenant = urlParams.get('s') || null;

  const routerContext = getCurrentRouterContext();
  const documentContext = getActiveDocumentContext();
  const applicationContext = getApplicationStateContext();

  const context = {
    isRunningInRespond: true,
    domain: window.location.hostname,
    subtenant,
    router: routerContext,
    document: documentContext,
    application: applicationContext,
    timestamp: new Date().toISOString()
  };

  console.log('[AssistContext] ✅ Respond context collected successfully:', {
    hasRouter: routerContext?.available,
    hasDocument: documentContext?.available,
    hasApplication: applicationContext?.available,
    subtenant: subtenant
  });

  return context;
}

/**
 * Get a summary of the current context suitable for AI processing
 * Returns a simplified, string-based summary of the current state
 * @returns {string} Human-readable context summary
 */
export function getContextSummary() {
  try {
    const context = getRespondContext();

    if (!context.isRunningInRespond) {
      return "Assistant is not currently running within Cognaire Respond.";
    }

    let summary = `User is currently in Cognaire Respond (${context.domain})`;

    if (context.subtenant) {
      summary += ` for organization "${context.subtenant}"`;
    }

    // Add router context
    if (context.router.available && context.router.routeContext) {
      const route = context.router.routeContext;
      summary += `. Currently viewing: ${route.section || 'main application'}`;

      if (route.entityId) {
        summary += ` (${route.entityId})`;
      }
    }

    // Add document context
    if (context.document && context.document.available) {
      const doc = context.document;
      summary += `. Active document workflow: ${doc.taskType.displayName || doc.taskType.taskType}`;

      if (doc.documentInfo.documentId) {
        summary += ` - Document ID: ${doc.documentInfo.documentId}`;
      }

      if (doc.stageInfo.currentStageName) {
        summary += ` - Current stage: ${doc.stageInfo.currentStageName}`;

        if (doc.stageInfo.progress !== undefined) {
          summary += ` (${doc.stageInfo.progress}% complete)`;
        }
      }
    }

    summary += ".";

    return summary;
  } catch (error) {
    console.error('[AssistContext] Error generating context summary:', error);
    return "Unable to determine current context in Cognaire Respond.";
  }
}

/**
 * Validate that the context helper is working correctly
 * Useful for debugging integration issues
 * @returns {Object} Validation results
 */
export function validateContextHelper() {
  const results = {
    isRunningInRespond: false,
    routerAvailable: false,
    documentContextAvailable: false,
    storeAvailable: false,
    errors: []
  };

  try {
    // Test basic detection
    results.isRunningInRespond = isRunningInRespond();

    // Test router context
    try {
      const routerContext = getCurrentRouterContext();
      results.routerAvailable = routerContext.available;
    } catch (error) {
      results.errors.push(`Router context error: ${error.message}`);
    }

    // Test document context
    try {
      const documentContext = getActiveDocumentContext();
      results.documentContextAvailable = documentContext !== null;
    } catch (error) {
      results.errors.push(`Document context error: ${error.message}`);
    }

    // Test store availability
    results.storeAvailable = !!(window.store && typeof window.store.get === 'function');

    return results;
  } catch (error) {
    results.errors.push(`Validation error: ${error.message}`);
    return results;
  }
}

// Note: All functions are exported inline above
// No additional exports needed here