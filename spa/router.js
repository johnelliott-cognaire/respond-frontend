// File: router.js
/**
 * Fully Featured SPA Router
 *
 * Supports parameterized routes (e.g. "/document/:docId/modal/:modalId")
 * and query string parsing. It uses the History API so that back/forward buttons work.
 */
export class Router {
  constructor() {
    this.routes = [];
    this.notFoundHandler = null;
    this.currentMatch = null;
    this.previousMatch = null;
    this.routeHistory = [];
    this.maxHistorySize = 10; // Keep last 10 routes for memory management

    window.addEventListener("popstate", () => {
      this._handleRoute(window.location.pathname + window.location.search);
    });
  }

  /**
   * Adds a new route.
   * @param {string} pattern A route pattern (e.g. "/document/:docId/modal/:modalId")
   * @param {function} callback The function to be called when the route matches.
   *        It receives an object: { params, queryParams }.
   */
  addRoute(pattern, callback) {
    const { regex, paramNames } = this._compilePattern(pattern);
    this.routes.push({ pattern, regex, paramNames, callback });
    console.log(`[Router] Added route: "${pattern}"`);
  }

  /**
   * Sets the "not found" handler.
   * @param {function} callback A function receiving an object { path }.
   */
  setNotFoundHandler(callback) {
    this.notFoundHandler = callback;
  }

  /**
   * Navigates to a new path using the History API.
   * @param {string} path The new URL path (e.g. "/document/123?modal=login")
   */
  navigate(path) {
    console.log(`[Router] Navigating to: "${path}"`);
    history.pushState({}, "", path);
    this._handleRoute(path);
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

    console.log(`[Router] updateUrl called:`, { url, replace, skipNavigation });

    if (replace) {
      window.history.replaceState({}, '', url);
    } else {
      window.history.pushState({}, '', url);
    }

    if (!skipNavigation) {
      this._handleRoute(url);
    }

    console.log(`[Router] URL updated to: ${url}`);
  }

  /**
   * Get the previous route information
   * @returns {Object|null} Previous route match info or null if none
   */
  getPreviousRoute() {
    console.log('[Router] getPreviousRoute called');
    console.log('[Router] Previous match:', this.previousMatch);
    return this.previousMatch;
  }

  /**
   * Get current route information
   * @returns {Object|null} Current route match info or null if none
   */
  getCurrentRoute() {
    return this.currentMatch;
  }

  _handleRoute(path) {
    console.log(`[Router] Handling route: "${path}"`);

    // Store current match as previous before processing new route
    if (this.currentMatch) {
      this.previousMatch = { ...this.currentMatch };
      console.log('[Router] Stored previous match:', this.previousMatch);
    }

    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        const queryParams = this._parseQueryParams(window.location.search);

        // Store current match info
        this.currentMatch = {
          route: route,
          params: params,
          queryParams: queryParams,
          fullUrl: path,
          pattern: route.pattern,
          timestamp: Date.now()
        };

        console.log(`[Router] Matched route "${route.pattern}" with params:`, params, "and queryParams:", queryParams);
        console.log('[Router] Current match updated:', this.currentMatch);

        route.callback({ params, queryParams });

        // Add to history for debugging
        this._addToHistory(this.currentMatch);
        return;
      }
    }

    if (this.notFoundHandler) {
      console.warn("[Router] No route matched. Calling notFoundHandler for path:", path);
      this.notFoundHandler({ path });
    } else {
      console.error("[Router] No route matched and no notFoundHandler defined for path:", path);
    }
  }

  _compilePattern(pattern) {
    const paramNames = [];
    let regexStr = pattern.replace(/([.+*?=^!:${}()[\]|\/\\])/g, "\\$1");
    regexStr = regexStr.replace(/\\\/:([a-zA-Z0-9_]+)/g, (full, paramName) => {
      paramNames.push(paramName);
      return "\\/([^/]+)";
    });
    regexStr = "^" + regexStr + "\\/?$";
    return { regex: new RegExp(regexStr), paramNames };
  }

  _parseQueryParams(search) {
    const params = {};
    if (search.startsWith("?")) {
      const queryString = search.slice(1);
      const pairs = queryString.split("&");
      pairs.forEach(pair => {
        const [key, value] = pair.split("=");
        if (key) {
          params[decodeURIComponent(key)] = decodeURIComponent(value || "");
        }
      });
    }
    return params;
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
