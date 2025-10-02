// File: api/auth.js - Enhanced with comprehensive security features and backend integration

import { getBaseUrl } from "../utils/config.js";

// Note: These are evaluated once at module load time
// For dynamic tenant switching, call getBaseUrl() directly in functions
const API_BASE_URL = getBaseUrl("main");
const API_PUBLIC_URL = getBaseUrl("public");

console.log("[auth.js] Module loaded - API_BASE_URL:", API_BASE_URL);
console.log("[auth.js] Module loaded - API_PUBLIC_URL:", API_PUBLIC_URL);

/**
 * Enhanced user registration with comprehensive validation
 * Lambda: backend/services/lambdas/auth/register_user.py
 */
export async function registerUser(username, password, email, apiKey) {
  const subtenant = localStorage.getItem('subtenant');

  if (!subtenant) {
    throw new Error('Organization context not available. Please refresh the page.');
  }

  try {
    const response = await fetch(`${API_PUBLIC_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
        email: email.trim().toLowerCase(),
        subtenant
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Registration failed');
      error.status = response.status;
      error.response = data;

      // Handle specific error codes from backend
      if (data.error_code) {
        error.errorCode = data.error_code;
      }

      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your connection and try again.');
    }
    throw error;
  }
}

/**
 * Enhanced user login with security features
 * Lambda: backend/services/lambdas/auth/auth_token_generate_extended.py
 */
export async function login(username, password) {
  const subtenant = localStorage.getItem('subtenant');

  if (!subtenant) {
    throw new Error('Organization context not available. Please refresh the page.');
  }

  try {
    const response = await fetch(`${API_PUBLIC_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
        subtenant
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Login failed');
      error.status = response.status;
      error.response = data;

      // Handle specific error codes from enhanced backend
      if (data.error_code) {
        error.errorCode = data.error_code;
        error.response.error_code = data.error_code;
      }

      // Handle rate limiting
      if (response.status === 429 && data.retry_after) {
        error.response.retry_after = data.retry_after;
      }

      throw error;
    }

    // Store authentication data with enhanced security info
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('currentUser', username);
    localStorage.setItem('permissions', data.permissions);
    localStorage.setItem('subtenant', data.subtenant);

    if (data.expiration) {
      // data.expiration is expected to be Unix-epoch seconds
      localStorage.setItem('tokenExpiration', data.expiration.toString());
    }

    if (data.authorized_projects) {
      localStorage.setItem('authorized_projects', JSON.stringify(data.authorized_projects));
    }

    if (data.authorized_accounts) {
      localStorage.setItem('authorized_accounts', JSON.stringify(data.authorized_accounts));
    }

    // Store user attributes
    if (data.attributes) {
      Object.keys(data.attributes).forEach(key => {
        if (data.attributes[key] !== null && data.attributes[key] !== undefined) {
          localStorage.setItem(key, data.attributes[key]);
        }
      });
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your connection and try again.');
    }
    throw error;
  }
}

/**
 * Logout user and clear all stored data
 * @param {string} reason Optional reason for logout (e.g., 'session_expired', 'user_action')
 * @param {boolean} showSessionModal Whether to show session expiration modal
 */
export function logout(reason = 'user_action', showSessionModal = false) {
  // Only log non-routine logout reasons
  if (reason !== 'user_action') {
    console.log("[auth] logout() called with reason:", reason);
  }

  // Get username before clearing
  const username = localStorage.getItem('currentUser') || 'unknown';

  // Clear authentication data
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('permissions');
  localStorage.removeItem('authorized_projects');
  localStorage.removeItem('authorized_accounts');
  localStorage.removeItem('tokenExpiration');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');

  // Clear user attributes
  localStorage.removeItem('preferred_primary_cqa');
  localStorage.removeItem('qa_instructions_saved');

  // Don't clear subtenant or access_key as they may be needed for re-authentication

  // Dispatch logout event with reason
  document.dispatchEvent(new CustomEvent('userLoggedOut', {
    detail: { username, reason }
  }));
}

/**
 * Enhanced token refresh with validation
 * Lambda: backend/services/lambdas/auth/auth_token_refresh.py
 */
export async function refreshAuthToken(extensionTime = 3600) {
  const currentToken = localStorage.getItem('authToken');

  if (!currentToken) {
    throw new Error('No token available to refresh');
  }

  try {
    const response = await fetch(`${API_PUBLIC_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: currentToken,
        extension_time: extensionTime
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Token refresh failed');
      error.status = response.status;
      error.response = data;

      // If token is expired or invalid, logout user
      if (response.status === 401) {
        logout();
      }

      throw error;
    }

    // Update stored token and any other returned data
    localStorage.setItem('authToken', data.token);

    // Update expiration if provided
    if (data.expiration) {
      localStorage.setItem('tokenExpiration', data.expiration.toString());
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error during token refresh.');
    }
    throw error;
  }
}

/**
 * Check and restore login state from stored token
 */
export async function checkAndRestoreLogin() {
  const token = localStorage.getItem('authToken');
  const currentUser = localStorage.getItem('currentUser');

  if (!token || !currentUser) {
    // Authentication check - no need to log routine absence
    return false;
  }

  try {
    // Try to refresh the token to verify it's still valid
    await refreshAuthToken(1800); // 30 minutes
    // Login restored successfully - no need to log routine restoration
    return true;
  } catch (error) {
    console.error("[auth] FAILED TO RESTORE LOGIN - THIS SHOULD NOT HAPPEN ON REFRESH:", error);
    
    // Don't silently logout! This causes terrible UX where users get logged out for no apparent reason
    // Instead, throw the error so the caller can decide what to do
    throw new Error(`Login restoration failed: ${error.message}. This may be due to network issues or server problems.`);
  }
}

/**
 * Verify subtenant with the server
 * Lambda: backend/services/lambdas/billing/subtenant/verify_subtenant.py
 */
export async function verifySubtenant(subtenant) {
  try {
    const response = await fetch(`${API_PUBLIC_URL}/auth/verify-subtenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subtenant: subtenant.trim()
      })
    });

    const isValid = await response.json();

    return {
      valid: response.ok && isValid === true,
      message: response.ok ? null : 'Invalid organization code'
    };
  } catch (error) {
    console.error('[auth] Subtenant verification error:', error);
    return {
      valid: false,
      message: 'Unable to verify organization code. Please try again.'
    };
  }
}

/**
 * Enhanced password reset functionality with multiple modes
 * Lambda: backend/services/lambdas/auth/reset_password.py
 */
export async function resetPassword(options) {
  const { type, ...resetData } = options;

  try {
    const headers = { 'Content-Type': 'application/json' };

    // Add authorization header for admin resets
    if (type === 'admin_reset') {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('Admin authentication required');
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add API key header for emergency resets
    if (type === 'emergency_reset' && resetData.apiKey) {
      headers['X-API-Key'] = resetData.apiKey;
      delete resetData.apiKey; // Remove from body
    }

    const response = await fetch(`${API_PUBLIC_URL}/auth/password-reset`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type,
        ...resetData
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Password reset failed');
      error.status = response.status;
      error.response = data;

      // Handle specific error codes
      if (data.error_code) {
        error.errorCode = data.error_code;
      }

      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error during password reset.');
    }
    throw error;
  }
}

/**
 * Get access key for admin operations (requires admin authentication)
 * Lambda: backend/services/lambdas/admin/get_access_key.py
 */
export async function getAccessKey() {
  const token = localStorage.getItem('authToken');

  if (!token) {
    throw new Error('Admin authentication required');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/access-key`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Failed to retrieve access key');
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return data.access_key;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error while retrieving access key.');
    }
    throw error;
  }
}

/**
 * Generate registration URL with subtenant and access key
 */
export async function generateRegistrationUrl(baseUrl) {
  const subtenant = localStorage.getItem('subtenant');

  if (!subtenant) {
    throw new Error('Organization context not available');
  }

  try {
    const accessKey = await getAccessKey();

    const url = new URL(baseUrl || window.location.origin);
    url.searchParams.set('s', subtenant);
    url.searchParams.set('key', accessKey);

    return url.toString();
  } catch (error) {
    console.error('[auth] Failed to generate registration URL:', error);
    throw error;
  }
}

/**
 * Generate password reset URL with subtenant and access key
 */
export async function generatePasswordResetUrl(username, baseUrl) {
  const subtenant = localStorage.getItem('subtenant');

  if (!subtenant || !username) {
    throw new Error('Organization context and username required');
  }

  try {
    const accessKey = await getAccessKey();

    const url = new URL(baseUrl || window.location.origin);
    url.searchParams.set('s', subtenant);
    url.searchParams.set('action', 'reset-password');
    url.searchParams.set('username', username);
    url.searchParams.set('key', accessKey);

    return url.toString();
  } catch (error) {
    console.error('[auth] Failed to generate password reset URL:', error);
    throw error;
  }
}

/**
 * Admin function to reset user password to temporary password
 */
export async function adminResetUserPassword(targetUsername, resetType = 'temporary') {
  const subtenant = localStorage.getItem('subtenant');

  if (!subtenant) {
    throw new Error('Organization context not available');
  }

  try {
    const result = await resetPassword({
      type: 'admin_reset',
      target_username: targetUsername,
      reset_type: resetType,
      subtenant: subtenant
    });

    return result;
  } catch (error) {
    console.error('[auth] Admin password reset failed:', error);
    throw error;
  }
}

/**
 * Admin function to unlock a locked user account
 * Lambda: backend/services/lambdas/admin/unlock_account.py
 */
export async function adminUnlockAccount(targetUsername) {
  const token = localStorage.getItem('authToken');
  const subtenant = localStorage.getItem('subtenant');

  if (!token) {
    throw new Error('Admin authentication required');
  }

  if (!subtenant) {
    throw new Error('Organization context not available');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/unlock-account`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_username: targetUsername,
        subtenant: subtenant
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Failed to unlock account');
      error.status = response.status;
      throw error;
    }

    console.log('[auth] Account unlocked successfully:', data);
    return data;
  } catch (error) {
    console.error('[auth] Account unlock failed:', error);
    throw error;
  }
}

/**
 * Enhanced auto-refresh token system
 */
let tokenRefreshTimer = null;

export function startTokenAutoRefresh() {
  const token = localStorage.getItem('authToken');
  if (!token) return;

  try {
    // Decode token to get expiration (simple base64 decode)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[auth] Token is not JWT format - skipping auto-refresh');
      // Don't clear the token, just skip auto-refresh
      // The token might be valid but in a different format
      return;
    }

    const payload = JSON.parse(atob(parts[1]));
    const expiration = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const refreshTime = expiration - (15 * 60 * 1000); // Refresh 15 minutes before expiry

    if (refreshTime > now) {
      const timeUntilRefresh = refreshTime - now;
      // Token refresh scheduled - no need to log routine scheduling

      tokenRefreshTimer = setTimeout(async () => {
        try {
          await refreshAuthToken();
          // Token auto-refreshed successfully - no need to log routine refresh
          startTokenAutoRefresh(); // Schedule next refresh
        } catch (error) {
          console.error('[auth] AUTO TOKEN REFRESH FAILED - NETWORK OR SERVER ISSUE:', error);
          
          // Don't automatically logout! This could be a temporary network issue
          // Instead, try again in a shorter interval and let the user know there's an issue
          console.warn('[auth] Will retry token refresh in 2 minutes instead of logging out');
          
          setTimeout(() => {
            try {
              startTokenAutoRefresh();
            } catch (retryError) {
              console.error('[auth] Token refresh retry also failed:', retryError);
              // Only logout after multiple failures and show user why
              showTokenRefreshError();
            }
          }, 2 * 60 * 1000); // Retry in 2 minutes
        }
      }, timeUntilRefresh);
    } else {
      console.warn('[auth] Token is already expired or expires too soon');
      logout();
    }
  } catch (error) {
    console.error('[auth] Failed to setup token auto-refresh:', error);
  }
}

/**
 * Show user-friendly error when token refresh fails repeatedly
 */
function showTokenRefreshError() {
  console.error('[auth] Token refresh failed multiple times - notifying user');
  
  // Dispatch an event that the UI can handle
  window.dispatchEvent(new CustomEvent('tokenRefreshFailed', {
    detail: {
      reason: 'multiple_failures',
      message: 'Unable to refresh your session. Please log in again.'
    }
  }));
}

export function stopTokenAutoRefresh() {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
    // Token auto-refresh stopped - no need to log routine stop
  }
}

/**
 * Get current user info from stored data
 */
export function getCurrentUser() {
  const username = localStorage.getItem('currentUser');
  const token = localStorage.getItem('authToken');
  const subtenant = localStorage.getItem('subtenant');

  if (!username || !token) {
    return null;
  }

  return {
    username,
    subtenant,
    isAuthenticated: true,
    token
  };
}

/**
 * Check if user has specific permission
 */
export function hasPermission(permissionType, permission, resourceId = null) {
  try {
    const permissionsBase64 = localStorage.getItem('permissions');
    if (!permissionsBase64) return false;

    const permissions = JSON.parse(atob(permissionsBase64));

    switch (permissionType) {
      case 'system':
        return permissions.system_permissions?.includes(permission) || false;

      case 'corpus':
        if (!resourceId) return false;
        return permissions.corpus_permissions?.[resourceId]?.includes(permission) || false;

      case 'docchain':
        return permissions.docchain_permissions?.includes(permission) || false;

      default:
        return false;
    }
  } catch (error) {
    console.error('[auth] Permission check failed:', error);
    return false;
  }
}

/**
 * Check if current user can perform admin operations
 */
export function canPerformAdminOperations() {
  return hasPermission('system', 'SYSTEM_ADMIN') || hasPermission('system', 'APP_ADMIN');
}

/**
 * List subtenants (requires SYSTEM_ADMIN)
 * Lambda: backend/services/lambdas/billing/subtenant/subtenants_list.py
 */
export async function listSubtenants() {
  const token = localStorage.getItem('authToken');

  if (!token) {
    throw new Error('Authentication required');
  }

  if (!hasPermission('system', 'SYSTEM_ADMIN')) {
    throw new Error('SYSTEM_ADMIN permission required');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/subtenants`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Failed to list subtenants');
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error while listing subtenants.');
    }
    throw error;
  }
}

/**
 * Returns standard Authorization header if token is present
 */
export function getAuthHeader() {
  const token = localStorage.getItem("authToken");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

/* ──────────────────────────────────────────────
   Validation: isTokenValid()
   Works with both opaque tokens and JWTs.
─────────────────────────────────────────────── */
export function isTokenValid() {
  const token = localStorage.getItem('authToken');
  if (!token) return false;

  // 1️⃣  Prefer explicit expiry provided by backend
  const storedExpiry = getStoredExpiry();
  if (storedExpiry) {
    const now = Math.floor(Date.now() / 1000);
    return storedExpiry > now;
  }

  // 2️⃣  If token looks like a JWT, decode it
  if (token.includes('.')) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      return payload.exp > now;
    } catch (err) {
      console.warn('[auth] JWT decode failed:', err);
    }
  }

  // 3️⃣  Opaque token with no expiry info – assume valid
  return true;
}

/**
 * Get token expiration time
 */
export function getTokenExpiration() {
  const token = localStorage.getItem('authToken');
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return new Date(payload.exp * 1000);
  } catch (error) {
    console.warn('[auth] Failed to get token expiration:', error);
    return null;
  }
}

/**
 * Check if token expires soon (within 5 minutes)
 */
export function tokenExpiresSoon() {
  const exp = getStoredExpiry();
  if (!exp) return false;
  const fiveMinutesFromNow = Math.floor(Date.now() / 1000) + 5 * 60;
  return exp < fiveMinutesFromNow;
}

// Start auto-refresh when module loads if user is authenticated and token is valid
if (localStorage.getItem('authToken') && isTokenValid()) {
  startTokenAutoRefresh();
}

// Listen for storage events from other tabs
window.addEventListener('storage', (event) => {
  if (event.key === 'authToken') {
    if (event.newValue === null) {
      // Token was removed in another tab, logout this tab too
      stopTokenAutoRefresh();
      document.dispatchEvent(new CustomEvent('userLoggedOut', {
        detail: { username: localStorage.getItem('currentUser') || 'unknown' }
      }));
    } else if (event.oldValue === null && isTokenValid()) {
      // Token was added in another tab, start auto-refresh
      startTokenAutoRefresh();
    }
  }
});

function getStoredExpiry() {
  const raw = localStorage.getItem('tokenExpiration');
  const exp = Number.parseInt(raw, 10);
  return Number.isFinite(exp) ? exp : null;
}

// Handle page visibility changes to manage token refresh
document.addEventListener('visibilitychange', () => {
  // Only act when tab becomes visible
  if (document.hidden) return;

  const tokenPresent = Boolean(localStorage.getItem('authToken'));
  if (!tokenPresent) return;

  // If we know the token has expired, log out immediately
  const exp = getStoredExpiry();
  const now = Math.floor(Date.now() / 1000);
  if (exp && exp <= now) {
    logout();
    return;
  }

  // If it expires in <5 min, try to refresh
  if (tokenExpiresSoon()) {
    refreshAuthToken().catch((error) => {
      console.error('[auth] FOCUS EVENT TOKEN REFRESH FAILED - NETWORK OR SERVER ISSUE:', error);
      // Don't silently logout on focus! This is terrible UX
      // The user just switched back to the tab and suddenly they're logged out
      console.warn('[auth] Token refresh failed on window focus - user will be prompted if they try to make a request');
    });
  }
});