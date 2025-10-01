// File: ui/modals/async-form-modal.js
import { ModalOriginTracker } from '../../utils/modal-origin-tracker.js';
import { getModalURLValidator } from '../../router/modal-url-validator.js';

/**
 * AsyncFormModal is a base class for modals that contain forms with asynchronous actions.
 * It provides methods to lock and unlock form fields and buttons, plus origin tracking
 * for URL restoration when modals are closed.
 */
export class AsyncFormModal {
  constructor() {
    this.modalEl = null;    // The modal container element
    this.overlayEl = null;  // The overlay element

    // Origin tracking for URL restoration
    this.modalId = ModalOriginTracker.generateModalId();
    this.hasOriginTracking = false;
  }

  /**
   * Locks all input fields (and similar elements) in the modal.
   */
  lockFields() {
    if (!this.modalEl) return;
    console.log("[AsyncFormModal] Locking fields");
    const inputs = this.modalEl.querySelectorAll("input, textarea, select");
    inputs.forEach(input => {
      input.disabled = true;
    });
  }

  /**
   * Unlocks all input fields in the modal.
   */
  unlockFields() {
    if (!this.modalEl) return;
    console.log("[AsyncFormModal] Unlocking fields");
    const inputs = this.modalEl.querySelectorAll("input, textarea, select");
    inputs.forEach(input => {
      input.disabled = false;
    });
  }

  /**
   * Locks all buttons in the modal.
   */
  lockButtons() {
    if (!this.modalEl) return;
    console.log("[AsyncFormModal] Locking buttons");
    const buttons = this.modalEl.querySelectorAll("button");
    buttons.forEach(btn => {
      btn.disabled = true;
    });
  }

  /**
   * Unlocks all buttons in the modal.
   */
  unlockButtons() {
    if (!this.modalEl) return;
    console.log("[AsyncFormModal] Unlocking buttons");
    const buttons = this.modalEl.querySelectorAll("button");
    buttons.forEach(btn => {
      btn.disabled = false;
    });
  }

  /**
   * Shows the modal (and overlay).
   * @param {Object} options - Show options
   * @param {string} options.originUrl - URL to return to when modal closes (for router integration)
   */
  show(options = {}) {
    console.log("[AsyncFormModal] 📋 show() called");
    console.log("[AsyncFormModal] 📋   - Modal ID:", this.modalId);
    console.log("[AsyncFormModal] 📋   - Options:", options);
    console.log("[AsyncFormModal] 📋   - Has originUrl:", !!options.originUrl);

    // Hide the new tab menu before showing the modal
    this.hideNewTabMenu();

    // Handle origin tracking for router-based modals
    if (options.originUrl) {
      console.log("[AsyncFormModal] 📋 Using provided originUrl:", options.originUrl);
      this.captureOrigin(options.originUrl);
    } else {
      console.log("[AsyncFormModal] 📋 No originUrl provided - auto-capturing previous route");
      // Auto-capture current URL if not provided (for backwards compatibility)
      this.autoCapturePreviousRoute();
    }

    if (this.overlayEl) {
      this.overlayEl.style.display = "block";
    }
    if (this.modalEl) {
      this.modalEl.style.display = "block";
    }

    console.log("[AsyncFormModal] 📋 show() completed - hasOriginTracking:", this.hasOriginTracking);
  }


  /**
   * Hide new tab menu and its sub-menus
   */
  hideNewTabMenu() {
    // Find the new tab menu and any visible sub-menus
    const newTabMenuEl = document.getElementById("newTabMenu");
    if (!newTabMenuEl) return;
    
    console.log("[AsyncFormModal] Hiding new tab menu");
    
    // Hide the main menu if visible
    const mainMenuEl = newTabMenuEl.querySelector(".new-tab-menu.visible");
    if (mainMenuEl) {
      mainMenuEl.classList.remove("visible");
    }
    
    // Hide project menu if visible
    const projectMenuEl = newTabMenuEl.querySelector(".project-menu.visible");
    if (projectMenuEl) {
      projectMenuEl.classList.remove("visible");
    }
    
    // Hide any other sub-menus that might be visible
    const otherVisibleMenus = newTabMenuEl.querySelectorAll(".visible");
    otherVisibleMenus.forEach(menu => {
      if (menu !== mainMenuEl && menu !== projectMenuEl) {
        menu.classList.remove("visible");
      }
    });
  }

  /**
   * Hides the modal (and overlay).
   * @param {Object} options - Hide options
   * @param {boolean} options.isModalNavigation - True if hiding for modal-to-modal navigation
   */
  hide(options = {}) {
    const { isModalNavigation = false } = options;

    console.log("[AsyncFormModal] 🔄 hide() called");
    console.log("[AsyncFormModal] 🔄   - Modal ID:", this.modalId);
    console.log("[AsyncFormModal] 🔄   - Has origin tracking:", this.hasOriginTracking);
    console.log("[AsyncFormModal] 🔄   - Is modal navigation:", isModalNavigation);

    // Handle origin URL restoration only if NOT modal-to-modal navigation
    if (!isModalNavigation) {
      console.log("[AsyncFormModal] 🔄   - Proceeding with URL restoration (user closed modal)");
      this.restoreOriginUrl();
    } else {
      console.log("[AsyncFormModal] 🔄   - Skipping URL restoration (modal-to-modal navigation)");
    }

    // Original hide logic
    if (this.overlayEl) {
      this.overlayEl.style.display = "none";
    }
    if (this.modalEl) {
      this.modalEl.style.display = "none";
    }

    console.log("[AsyncFormModal] 🔄 hide() completed");
  }

  /**
   * Builds a basic overlay element if one does not exist.
   */
  _buildOverlay() {
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "overlay";
    this.overlayEl.style.display = "none";
    document.body.appendChild(this.overlayEl);
  }

  /**
   * Refreshes the security object to ensure it has the latest permissions.
   * Call this in show() methods of modal classes that use Security for permission checks.
   */
  refreshSecurity() {
    if (this.store && this.security) {
      console.log("[AsyncFormModal] Refreshing security object");
      this.security.loadPermissionsFromStore();

      // Verify refresh worked
      console.log("[AsyncFormModal] Security refresh complete:", {
        "system_permissions": this.security.permissions.system_permissions.length,
        "authorized_accounts": this.security.permissions.authorized_accounts.length,
        "authorized_projects": this.security.permissions.authorized_projects.length
      });
    }
  }

  /**
   * Capture origin URL for restoration when modal closes
   * @param {string} originUrl - The URL to return to
   */
  captureOrigin(originUrl) {
    if (!originUrl) return;

    ModalOriginTracker.pushOrigin(this.modalId, originUrl);
    this.hasOriginTracking = true;

    console.log(`[AsyncFormModal] 📌 Captured origin for modal ${this.modalId}: ${originUrl}`);
  }

  /**
   * Auto-capture previous route as origin (for backward compatibility)
   */
  autoCapturePreviousRoute() {
    // Try to get previous route from router
    if (window.router && typeof window.router.getPreviousRoute === 'function') {
      const previousRoute = window.router.getPreviousRoute();
      if (previousRoute && previousRoute.fullUrl) {
        this.captureOrigin(previousRoute.fullUrl);
        return;
      }
    }

    // Fallback: capture current URL (excluding any modal paths)
    if (window.location && window.location.pathname) {
      const currentUrl = window.location.pathname + window.location.search;

      // Only capture if it's not already a modal URL
      if (!currentUrl.includes('/modals/')) {
        this.captureOrigin(currentUrl);
      }
    }
  }

  /**
   * Restore origin URL when modal closes
   */
  restoreOriginUrl() {
    console.log("[AsyncFormModal] 🔙 restoreOriginUrl() called");
    console.log("[AsyncFormModal] 🔙   - Modal ID:", this.modalId);
    console.log("[AsyncFormModal] 🔙   - Has origin tracking:", this.hasOriginTracking);

    if (!this.hasOriginTracking) {
      console.log("[AsyncFormModal] 🔙 ❌ No origin tracking - skipping URL restoration");
      return;
    }

    // FAIL FAST: Check if we're in a modal-to-modal navigation using router-based validation
    // If the current URL already shows a different modal, don't restore the origin
    const currentUrl = window.location.pathname + window.location.search;
    console.log("[AsyncFormModal] 🔙 Current URL check:", currentUrl);

    // Use router-based validation instead of fragile regex patterns
    let shouldAllowRestoration = true;

    try {
      if (window.modalURLValidator) {
        shouldAllowRestoration = window.modalURLValidator.shouldAllowOriginRestoration(currentUrl);
        console.log("[AsyncFormModal] 🔙 🔍 Router-based validation result:");
        console.log("[AsyncFormModal] 🔙 🔍   - Current URL:", currentUrl);
        console.log("[AsyncFormModal] 🔙 🔍   - Should allow restoration:", shouldAllowRestoration);
      } else {
        console.warn("[AsyncFormModal] 🔙 ⚠️ Modal URL validator not available - allowing restoration");
        // FAIL FAST: If validator not available, log error but allow restoration
        // This prevents silent failures during development
        console.warn("[AsyncFormModal] 🔙 ⚠️ This indicates the router integration may not be properly initialized");
      }
    } catch (error) {
      console.error("[AsyncFormModal] 🔙 ❌ FAIL FAST: URL validation error:", error);
      // FAIL FAST: On validation error, allow restoration to prevent hanging state
      shouldAllowRestoration = true;
    }

    if (currentUrl.includes('/modals/') && !shouldAllowRestoration) {
      console.log("[AsyncFormModal] 🔙 ❌ FAIL FAST: Modal-to-modal navigation detected - not restoring origin URL");
      console.log("[AsyncFormModal] 🔙   Current URL indicates navigation to another modal:", currentUrl);

      // Clear the origin tracking but don't restore URL
      ModalOriginTracker.popOrigin(this.modalId);
      this.hasOriginTracking = false;
      return;
    }

    console.log("[AsyncFormModal] 🔙 Attempting to pop origin from ModalOriginTracker...");
    const originUrl = ModalOriginTracker.popOrigin(this.modalId);
    console.log("[AsyncFormModal] 🔙   - Popped origin URL:", originUrl);
    console.log("[AsyncFormModal] 🔙   - Router available:", !!window.router);
    console.log("[AsyncFormModal] 🔙   - Router updateUrl available:", typeof window.router?.updateUrl);

    if (originUrl && window.router && typeof window.router.updateUrl === 'function') {
      // Update URL without triggering router navigation
      console.log(`[AsyncFormModal] 🔙 ✅ Restoring origin URL: ${originUrl}`);

      try {
        window.router.updateUrl(originUrl, {
          replace: true,
          skipNavigation: true
        });
        console.log(`[AsyncFormModal] 🔙 ✅ Successfully restored origin URL via router`);
      } catch (error) {
        console.warn('[AsyncFormModal] Failed to restore origin URL via router:', error);

        // Fallback: use history API directly
        try {
          window.history.replaceState({}, '', originUrl);
          console.log(`[AsyncFormModal] 🔙 ✅ Successfully restored origin URL via history API fallback`);
        } catch (historyError) {
          console.warn('[AsyncFormModal] History API fallback also failed:', historyError);
        }
      }
    } else {
      console.log("[AsyncFormModal] 🔙 ❌ Cannot restore origin URL:");
      console.log("[AsyncFormModal] 🔙   - Origin URL exists:", !!originUrl);
      console.log("[AsyncFormModal] 🔙   - Router exists:", !!window.router);
      console.log("[AsyncFormModal] 🔙   - updateUrl function exists:", typeof window.router?.updateUrl);
    }

    this.hasOriginTracking = false;
    console.log("[AsyncFormModal] 🔙 restoreOriginUrl() completed");
  }

  /**
   * Get the unique modal ID for this instance
   * @returns {string} The modal ID
   */
  getModalId() {
    return this.modalId;
  }

  /**
   * Check if this modal has origin tracking active
   * @returns {boolean} True if origin is being tracked
   */
  hasOriginUrl() {
    return this.hasOriginTracking && ModalOriginTracker.hasOrigin(this.modalId);
  }

  /**
   * Navigate to another modal while preserving the original origin context
   * This method should be used instead of direct window.router.navigate() calls
   * when navigating between modals to maintain proper origin tracking
   * @param {string} modalUrl - The modal URL to navigate to (e.g., '/modals/projects/QS')
   * @param {Object} options - Navigation options
   */
  navigateToModal(modalUrl, options = {}) {
    console.log(`[AsyncFormModal] 🔗 Modal-to-modal navigation: ${modalUrl}`);
    console.log(`[AsyncFormModal] 🔗   - Current modal ID: ${this.modalId}`);
    console.log(`[AsyncFormModal] 🔗   - Has origin tracking: ${this.hasOriginTracking}`);

    // Don't call this.hide() - let the router handle the modal transition
    // This preserves the modal origin tracking context

    // Navigate using router
    if (window.router && typeof window.router.navigate === 'function') {
      const defaultOptions = { replace: false, ...options };
      console.log(`[AsyncFormModal] 🔗 Navigating to: ${modalUrl} with options:`, defaultOptions);
      window.router.navigate(modalUrl, defaultOptions);
    } else {
      console.error('[AsyncFormModal] 🔗 ❌ Router not available for modal navigation');
      // Fallback to direct URL change (not recommended)
      window.location.href = modalUrl;
    }
  }
}
