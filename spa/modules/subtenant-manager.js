// File: modules/subtenant-manager.js
/**
 * Enhanced subtenant validation and management with access key support
 */
import { verifySubtenant } from "../api/auth.js";

export class SubtenantManager {
    constructor() {
        this.isValidated = false;
        this.validationError = null;
        this.STORAGE_KEY = 'subtenant';
        this.ACCESS_KEY_STORAGE_KEY = 'access_key';
    }

    /**
     * Get subtenant from URL querystring parameter 's'
     */
    getSubtenantFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('s')?.trim() || null;
    }

    /**
     * Get access key from URL querystring parameter 'key'
     */
    getAccessKeyFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('key')?.trim() || null;
    }

    /**
     * Get subtenant from localStorage
     */
    getSubtenantFromStorage() {
        return localStorage.getItem(this.STORAGE_KEY) || null;
    }

    /**
     * Get access key from localStorage
     */
    getAccessKeyFromStorage() {
        return localStorage.getItem(this.ACCESS_KEY_STORAGE_KEY) || null;
    }

    /**
     * Set subtenant in localStorage
     */
    setSubtenantInStorage(subtenant) {
        if (subtenant) {
            localStorage.setItem(this.STORAGE_KEY, subtenant);
        } else {
            localStorage.removeItem(this.STORAGE_KEY);
        }
    }

    /**
     * Set access key in localStorage
     */
    setAccessKeyInStorage(accessKey) {
        if (accessKey) {
            localStorage.setItem(this.ACCESS_KEY_STORAGE_KEY, accessKey);
        } else {
            localStorage.removeItem(this.ACCESS_KEY_STORAGE_KEY);
        }
    }

    /**
     * Generate registration URL with subtenant and access key
     */
    generateRegistrationUrl(baseUrl, subtenant, accessKey) {
        const url = new URL(baseUrl);
        url.searchParams.set('s', subtenant);
        if (accessKey) {
            url.searchParams.set('key', accessKey);
        }
        return url.toString();
    }

    /**
     * Generate password reset URL with subtenant and access key
     */
    generatePasswordResetUrl(baseUrl, subtenant, username, accessKey) {
        const url = new URL(baseUrl);
        url.searchParams.set('s', subtenant);
        url.searchParams.set('action', 'reset-password');
        url.searchParams.set('username', username);
        if (accessKey) {
            url.searchParams.set('key', accessKey);
        }
        return url.toString();
    }

    /**
     * Check if current URL contains a password reset request
     */
    isPasswordResetRequest() {
        const params = new URLSearchParams(window.location.search);
        return params.get('action') === 'reset-password';
    }

    /**
     * Get password reset parameters from URL
     */
    getPasswordResetParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            username: params.get('username'),
            subtenant: params.get('s'),
            accessKey: params.get('key')
        };
    }

    /**
     * Initialize and validate subtenant with enhanced features
     * Returns: { valid: boolean, subtenant: string|null, error: string|null, hasAccessKey: boolean }
     */
    async initialize() {
        console.log('[SubtenantManagerEnhanced] Initializing subtenant validation');

        try {
            // 1. Get subtenant and access key from URL
            const urlSubtenant = this.getSubtenantFromUrl();
            const urlAccessKey = this.getAccessKeyFromUrl();

            console.log('[SubtenantManagerEnhanced] URL subtenant:', urlSubtenant || 'NONE');
            console.log('[SubtenantManagerEnhanced] URL access key:', urlAccessKey ? 'PROVIDED' : 'NONE');

            if (!urlSubtenant) {
                this.validationError = 'No organization code found in URL. Please ensure your URL includes ?s=your-organization-code';
                this.isValidated = false;
                return {
                    valid: false,
                    subtenant: null,
                    error: this.validationError,
                    hasAccessKey: false
                };
            }

            // 2. Store access key if provided in URL
            if (urlAccessKey) {
                this.setAccessKeyInStorage(urlAccessKey);
                console.log('[SubtenantManagerEnhanced] Access key stored from URL');
            }

            // 3. Get stored values
            const storedSubtenant = this.getSubtenantFromStorage();
            console.log('[SubtenantManagerEnhanced] Stored subtenant:', storedSubtenant || 'NONE');

            // 4. If stored subtenant matches URL subtenant, we're good
            if (storedSubtenant === urlSubtenant) {
                console.log('[SubtenantManagerEnhanced] Subtenant already validated:', urlSubtenant);
                this.isValidated = true;
                return {
                    valid: true,
                    subtenant: urlSubtenant,
                    error: null,
                    hasAccessKey: !!this.getAccessKeyFromStorage()
                };
            }

            // 5. Stored subtenant is different or missing - validate with server
            console.log('[SubtenantManagerEnhanced] Validating subtenant with server:', urlSubtenant);

            const validationResult = await verifySubtenant(urlSubtenant);

            if (validationResult.valid) {
                // 6. Validation passed - store in localStorage
                console.log('[SubtenantManagerEnhanced] Subtenant validation successful');
                this.setSubtenantInStorage(urlSubtenant);
                this.isValidated = true;
                return {
                    valid: true,
                    subtenant: urlSubtenant,
                    error: null,
                    hasAccessKey: !!this.getAccessKeyFromStorage()
                };
            } else {
                // 7. Validation failed
                console.log('[SubtenantManagerEnhanced] Subtenant validation failed:', validationResult.message);
                this.validationError = validationResult.message || 'Invalid organization code';
                this.isValidated = false;
                return {
                    valid: false,
                    subtenant: null,
                    error: this.validationError,
                    hasAccessKey: false
                };
            }

        } catch (error) {
            console.error('[SubtenantManagerEnhanced] Error during subtenant validation:', error);
            this.validationError = 'Unable to validate organization code. Please try again.';
            this.isValidated = false;
            return {
                valid: false,
                subtenant: null,
                error: this.validationError,
                hasAccessKey: false
            };
        }
    }

    /**
     * Handle password reset request from URL
     */
    async handlePasswordResetRequest() {
        if (!this.isPasswordResetRequest()) {
            return null;
        }

        const params = this.getPasswordResetParams();

        if (!params.username || !params.subtenant) {
            console.error('[SubtenantManagerEnhanced] Invalid password reset parameters');
            return {
                error: 'Invalid password reset link. Missing required parameters.'
            };
        }

        // Validate subtenant for password reset
        const validation = await this.initialize();
        if (!validation.valid) {
            return {
                error: `Password reset failed: ${validation.error}`
            };
        }

        return {
            username: params.username,
            subtenant: params.subtenant,
            accessKey: params.accessKey,
            mode: 'url_reset'
        };
    }

    /**
     * Get current validated subtenant
     */
    getCurrentSubtenant() {
        if (!this.isValidated) {
            return null;
        }
        return this.getSubtenantFromStorage();
    }

    /**
     * Get stored access key
     */
    getCurrentAccessKey() {
        return this.getAccessKeyFromStorage();
    }

    /**
     * Check if subtenant is currently validated
     */
    isSubtenantValidated() {
        return this.isValidated && this.getCurrentSubtenant() !== null;
    }

    /**
     * Get validation error message
     */
    getValidationError() {
        return this.validationError;
    }

    /**
     * Reset validation state (useful for logout)
     */
    reset() {
        this.isValidated = false;
        this.validationError = null;
        this.setSubtenantInStorage(null);
        // Note: We don't clear access key on reset as it may be needed for re-registration
    }

    /**
     * Clear all stored data including access key
     */
    clearAll() {
        this.reset();
        this.setAccessKeyInStorage(null);
    }

    /**
     * Update URL to include subtenant parameter (useful for bookmarking)
     */
    updateUrlWithSubtenant() {
        const subtenant = this.getCurrentSubtenant();
        if (!subtenant) return;

        const url = new URL(window.location);
        url.searchParams.set('s', subtenant);

        // Update URL without page reload
        window.history.replaceState({}, '', url);
    }

    /**
     * Validate that current page context is secure for the subtenant
     */
    validatePageContext() {
        const urlSubtenant = this.getSubtenantFromUrl();
        const storedSubtenant = this.getCurrentSubtenant();

        if (urlSubtenant && storedSubtenant && urlSubtenant !== storedSubtenant) {
            console.warn('[SubtenantManagerEnhanced] Subtenant mismatch detected');
            return {
                valid: false,
                error: 'Organization context mismatch. Please refresh the page.',
                requiresRefresh: true
            };
        }

        return { valid: true };
    }
}