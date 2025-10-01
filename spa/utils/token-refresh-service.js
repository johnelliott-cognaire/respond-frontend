/**
 * utils/token-refresh-service.js
 * Manages periodic token refreshing to ensure continuous authentication
 * during long-running operations like job processing
 */

import { refreshAuthToken } from "../api/auth.js";

class TokenRefreshService {
  constructor() {
    this.refreshInterval = null;
    this.activeJobIds = new Set();
    this.isRefreshing = false;
    this.lastRefreshTime = 0;
    this.REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    this.MIN_REFRESH_DELAY_MS = 60 * 1000; // 1 minute minimum between refreshes
  }

  /**
   * Register a job to be monitored for token refreshing
   * @param {string} jobId - The ID of the job to monitor
   */
  registerJob(jobId) {
    if (!jobId) return;

    // Job registered for token refresh monitoring - no need to log routine registration
    this.activeJobIds.add(jobId);

    // Start the refresh interval if it's not already running
    this.startRefreshInterval();
  }

  /**
   * Unregister a job when it completes or fails
   * @param {string} jobId - The ID of the job to unregister
   */
  unregisterJob(jobId) {
    if (!jobId) return;

    // Job unregistered from token refresh monitoring - no need to log routine unregistration
    this.activeJobIds.delete(jobId);

    // If no more active jobs, stop the refresh interval
    if (this.activeJobIds.size === 0) {
      this.stopRefreshInterval();
    }
  }

  /**
   * Start the token refresh interval
   * @private
   */
  startRefreshInterval() {
    if (this.refreshInterval) {
      // Already running
      return;
    }

    // Starting token refresh interval - only log for debugging when needed

    // Immediately perform an initial refresh
    this.performTokenRefresh();

    // Set up periodic refreshing
    this.refreshInterval = setInterval(() => {
      this.performTokenRefresh();
    }, this.REFRESH_INTERVAL_MS);
  }

  /**
   * Stop the token refresh interval
   * @private
   */
  stopRefreshInterval() {
    if (!this.refreshInterval) {
      return;
    }

    // Stopping token refresh interval - only log for debugging when needed
    clearInterval(this.refreshInterval);
    this.refreshInterval = null;
  }

  /**
   * Perform the actual token refresh
   * @private
   */
  async performTokenRefresh() {
    // Prevent concurrent refreshes
    if (this.isRefreshing) {
      return;
    }

    // Check if minimum time between refreshes has passed
    const now = Date.now();
    if (now - this.lastRefreshTime < this.MIN_REFRESH_DELAY_MS) {
      return;
    }

    // No active jobs, no need to refresh
    if (this.activeJobIds.size === 0) {
      this.stopRefreshInterval();
      return;
    }

    try {
      this.isRefreshing = true;
      // Refreshing token - no need to log routine refresh operations

      await refreshAuthToken();

      this.lastRefreshTime = Date.now();
      // Token refresh successful - no need to log routine success
    } catch (error) {
      console.error("[TokenRefreshService] Token refresh failed:", error);

      // If token refresh fails, notify any listeners but don't stop monitoring
      // The next refresh attempt might succeed
      document.dispatchEvent(new CustomEvent('tokenRefreshFailed', {
        detail: { error: error.message }
      }));
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Force an immediate token refresh
   * @returns {Promise<boolean>} True if refresh was successful
   */
  async forceRefresh() {
    try {
      // Don't check timing constraints for forced refreshes
      this.isRefreshing = true;
      await refreshAuthToken();
      this.lastRefreshTime = Date.now();
      return true;
    } catch (error) {
      console.error("[TokenRefreshService] Forced token refresh failed:", error);
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get the number of active jobs being monitored
   * @returns {number} Count of active jobs
   */
  getActiveJobCount() {
    return this.activeJobIds.size;
  }

  /**
   * Reset the service state
   */
  reset() {
    this.stopRefreshInterval();
    this.activeJobIds.clear();
    this.isRefreshing = false;
  }
}

// Create a singleton instance
const tokenRefreshService = new TokenRefreshService();

export default tokenRefreshService;