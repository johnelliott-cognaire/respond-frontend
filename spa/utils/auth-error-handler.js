// File: utils/auth-error-handler.js
/**
 * Centralized authentication error handling utility.
 * Intercepts 401 responses and shows user-friendly session expiration messages.
 */

import { OptionsModal } from '../ui/modals/options-modal.js';

// Singleton instance of options modal for session expiration
let sessionExpirationModal = null;
let isShowingSessionModal = false;

/**
 * Initialize the session expiration modal
 */
function initSessionModal() {
  if (!sessionExpirationModal) {
    sessionExpirationModal = new OptionsModal();
  }
  return sessionExpirationModal;
}

/**
 * Handle authentication errors globally
 * @param {Error} error The error to handle
 * @param {Response} response Optional response object
 * @returns {boolean} True if handled as auth error, false otherwise
 */
export function handleAuthError(error, response = null) {
  // Check if it's a 401 error
  const is401 = response?.status === 401 || error.status === 401;

  if (!is401) {
    return false;
  }

  console.log("[auth-error-handler] Handling 401 authentication error");

  // Prevent multiple modals
  if (isShowingSessionModal) {
    return true;
  }

  // Check if the error message indicates token expiration
  const errorMessage = error.message?.toLowerCase() || '';
  const errorResponse = error.response || response;
  const responseMessage = errorResponse?.error?.toLowerCase() || errorResponse?.message?.toLowerCase() || '';

  const isTokenError =
    errorMessage.includes('token') ||
    errorMessage.includes('expired') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('unauthorized') ||
    responseMessage.includes('token') ||
    responseMessage.includes('expired') ||
    responseMessage.includes('invalid');

  if (isTokenError) {
    showSessionExpirationModal();
    return true;
  }

  return false;
}

/**
 * Show the session expiration modal
 * @param {object} options Modal options
 */
export function showSessionExpirationModal(options = {}) {
  if (isShowingSessionModal) {
    return;
  }

  isShowingSessionModal = true;

  // Check if there might be unsaved data
  const hasUnsavedData = checkForUnsavedData();
  const returnUrl = options.returnUrl || window.location.href;

  // Build the message content with consistent styling
  let messageContent = `
    <p style="margin-bottom: 1rem;">Your session has expired for security reasons. Please log in again to continue working.</p>
  `;

  if (hasUnsavedData) {
    messageContent += `
      <p style="color: var(--status-error); font-weight: bold; margin-bottom: 1rem;">
        Warning: Any unsaved changes will be lost.
      </p>
    `;
  }

  messageContent += `
    <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 1rem; margin-bottom: 0;">
      You'll be redirected back to this page after logging in.
    </p>
  `;

  const modal = initSessionModal();
  modal.show({
    title: 'Session Expired',
    message: messageContent,
    isHtml: true,
    options: [
      {
        text: 'Log In Again',
        btnClass: 'btn--primary',
        onClick: () => {
          console.log("[auth-error-handler] Redirecting to login with return URL:", returnUrl);

          // Store the return URL in sessionStorage for post-login redirect
          if (returnUrl) {
            sessionStorage.setItem("postLoginRedirect", returnUrl);
          }

          // Clear auth data before redirecting
          localStorage.removeItem("authToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("userData");
          localStorage.removeItem("tokenExpiration");

          // Dispatch logout event
          window.dispatchEvent(new CustomEvent("userLoggedOut", {
            detail: { reason: "session_expired" }
          }));

          // Reset the flag
          isShowingSessionModal = false;

          // Redirect to login (the router will handle showing the login modal)
          window.location.href = "/#/login";
        }
      },
      {
        text: 'Cancel',
        btnClass: 'btn--secondary',
        onClick: () => {
          console.log("[auth-error-handler] User cancelled session expiration dialog");

          // Still need to clear auth data and logout
          localStorage.removeItem("authToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("userData");
          localStorage.removeItem("tokenExpiration");

          // Dispatch logout event
          window.dispatchEvent(new CustomEvent("userLoggedOut", {
            detail: { reason: "session_expired_cancelled" }
          }));

          // Reset the flag
          isShowingSessionModal = false;

          // Redirect to home/login
          window.location.href = "/";
        }
      }
    ],
    onCancel: () => {
      // Treat closing the modal (X button or overlay click) same as Cancel
      console.log("[auth-error-handler] Session expiration modal closed");

      // Clear auth data
      localStorage.removeItem("authToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("userData");
      localStorage.removeItem("tokenExpiration");

      // Dispatch logout event
      window.dispatchEvent(new CustomEvent("userLoggedOut", {
        detail: { reason: "session_expired_closed" }
      }));

      // Reset the flag
      isShowingSessionModal = false;

      // Redirect to home/login
      window.location.href = "/";
    }
  });
}

/**
 * Check if there might be unsaved data in forms or text areas
 * @returns {boolean} True if unsaved data detected
 */
function checkForUnsavedData() {
  // Check for any form elements with values
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], textarea, select');
    for (const input of inputs) {
      if (input.value && input.value.trim() !== '' && !input.readOnly && !input.disabled) {
        return true;
      }
    }
  }

  // Check for any content editable elements
  const editables = document.querySelectorAll('[contenteditable="true"]');
  for (const editable of editables) {
    if (editable.textContent && editable.textContent.trim() !== '') {
      return true;
    }
  }

  // Check for specific app states that might indicate unsaved work
  // This can be extended based on the application's specific needs
  const isDirty = document.body.dataset.hasUnsavedChanges === 'true';

  return isDirty;
}

/**
 * Wrap fetch to automatically handle 401 responses
 * @param {string} url The URL to fetch
 * @param {object} options Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export async function fetchWithAuthHandling(url, options = {}) {
  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      // Try to parse the response to get error details
      let errorData = {};
      try {
        errorData = await response.json();
      } catch {
        // Response might not be JSON
      }

      const error = new Error(errorData.error || errorData.message || 'Authentication failed');
      error.status = 401;
      error.response = errorData;

      if (handleAuthError(error, response)) {
        // Don't throw if we handled the auth error
        throw error; // Still throw but it's been handled visually
      }
    }

    return response;
  } catch (error) {
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your connection and try again.');
    }
    throw error;
  }
}

/**
 * Handle login button click from session expiration modal
 */
function handleLogin() {
  console.log("[auth-error-handler] Redirecting to login");

  // Clear auth data first to prevent duplicate modals
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userData");
  localStorage.removeItem("tokenExpiration");

  // Dispatch logout event
  window.dispatchEvent(new CustomEvent("userLoggedOut", {
    detail: { reason: "session_expired" }
  }));

  // Reset flag
  isShowingSessionModal = false;

  // Get current URL and check for query parameters
  const currentUrl = new URL(window.location.href);

  // If we have query parameters (like s=cognaire), redirect to base URL with those params
  // Otherwise, redirect to login page
  if (currentUrl.search) {
    // Preserve query string and go to base URL
    window.location.href = currentUrl.origin + currentUrl.search;
  } else {
    // No query parameters, go to base URL
    window.location.href = currentUrl.origin;
  }
}

/**
 * Handle cancel button click from session expiration modal
 */
function handleCancel() {
  console.log("[auth-error-handler] User cancelled session expiration dialog");

  // Still need to clear auth data and logout
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userData");
  localStorage.removeItem("tokenExpiration");

  // Dispatch logout event
  window.dispatchEvent(new CustomEvent("userLoggedOut", {
    detail: { reason: "session_expired_cancelled" }
  }));

  // Reset flag
  isShowingSessionModal = false;

  // Redirect to base URL, preserving any query parameters
  const currentUrl = new URL(window.location.href);
  window.location.href = currentUrl.origin + currentUrl.search;
}

/**
 * Listen for token refresh failures
 */
window.addEventListener('tokenRefreshFailed', (event) => {
  console.log("[auth-error-handler] Token refresh failed event received");
  showSessionExpirationModal();
});