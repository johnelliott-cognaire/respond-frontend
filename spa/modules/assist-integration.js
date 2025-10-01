// modules/assist-integration.js - Cognaire Assist Integration for Respond
// Provides floating help button and sliding panel for embedded Assist functionality

import { getCurrentUser } from "../api/auth.js";
import { getAuthHeader } from "../api/auth.js";
import { getConfig, getCurrentTenant } from "../utils/config.js";

export class AssistIntegration {
    constructor() {
        this.isOpen = false;
        this.isLoading = false;
        this.assistApp = null;
        this.panel = null;
        this.button = null;
        this.overlay = null;
        this.isLoggedIn = false;
        
        // Bind methods for event handling
        this.toggleAssist = this.toggleAssist.bind(this);
        this.closeAssist = this.closeAssist.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleUserLogin = this.handleUserLogin.bind(this);
        this.handleUserLogout = this.handleUserLogout.bind(this);
        
        this.init();
    }

    init() {
        console.log('[AssistIntegration] Initializing Cognaire Assist integration');
        
        // Create and inject CSS styles
        this.injectStyles();
        
        // Create floating help button (initially hidden)
        this.createFloatingButton();
        
        // Check initial authentication state
        this.checkAuthenticationState();
        
        // Add global event listeners
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('userLoggedIn', this.handleUserLogin);
        document.addEventListener('userLoggedOut', this.handleUserLogout);
        
        console.log('[AssistIntegration] Integration ready');
    }

    injectStyles() {
        const styleId = 'assist-integration-styles';
        if (document.getElementById(styleId)) {
            return; // Already injected
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Floating Help Button */
            .assist-floating-button {
                position: fixed;
                right: 24px;
                bottom: 24px;
                width: 56px;
                height: 56px;
                background: var(--interactive-primary);
                border: none;
                border-radius: 50%;
                color: white;
                font-size: 20px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                transition: all 0.3s ease;
                z-index: 1000;
                display: none; /* Hidden by default until user logs in */
                align-items: center;
                justify-content: center;
            }
            
            .assist-floating-button.visible {
                display: flex;
            }
            
            .assist-floating-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
                background: var(--interactive-primary-hover, #0056b3);
            }
            
            .assist-floating-button:active {
                transform: translateY(0);
            }
            
            .assist-floating-button.loading {
                background: var(--surface-muted);
                cursor: not-allowed;
            }
            
            .assist-floating-button.loading i {
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            /* Sliding Panel */
            .assist-panel-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1100;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .assist-panel-overlay.open {
                opacity: 1;
                visibility: visible;
            }

            .assist-panel {
                position: fixed;
                top: 0;
                right: -420px;
                width: 420px;
                height: 100vh;
                background: white;
                box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
                transition: right 0.3s ease;
                z-index: 1200;
                display: flex;
                flex-direction: column;
            }
            
            .assist-panel.open {
                right: 0;
            }

            .assist-panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 20px;
                border-bottom: 1px solid var(--border-subtle);
                background: var(--surface-subtle);
            }
            
            .assist-panel-title {
                font-size: 18px;
                font-weight: 600;
                color: var(--text-primary);
                margin: 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .assist-panel-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: var(--text-secondary);
                padding: 4px 8px;
                border-radius: 4px;
                transition: background-color 0.2s ease;
            }
            
            .assist-panel-close:hover {
                background: var(--surface-hover);
                color: var(--text-primary);
            }

            .assist-panel-content {
                flex: 1;
                overflow: hidden;
                position: relative;
            }
            
            .assist-panel-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                flex-direction: column;
                gap: 16px;
                color: var(--text-secondary);
            }
            
            .assist-panel-loading i {
                font-size: 32px;
                animation: spin 1s linear infinite;
            }

            .assist-app-container {
                height: 100%;
                width: 100%;
                display: none;
            }
            
            .assist-app-container.loaded {
                display: block;
            }


            /* Mobile responsiveness */
            @media (max-width: 768px) {
                .assist-panel {
                    width: 100vw;
                    right: -100vw;
                }
                
                .assist-floating-button {
                    right: 16px;
                    bottom: 16px;
                    width: 48px;
                    height: 48px;
                    font-size: 18px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    createFloatingButton() {
        this.button = document.createElement('button');
        this.button.className = 'assist-floating-button';
        this.button.innerHTML = '<i class="fas fa-question-circle"></i>';
        this.button.title = 'Get Help with Cognaire Assist';
        this.button.setAttribute('aria-label', 'Open Cognaire Assist help panel');
        
        this.button.addEventListener('click', this.toggleAssist);
        
        document.body.appendChild(this.button);
    }

    createPanel() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'assist-panel-overlay';
        this.overlay.addEventListener('click', this.closeAssist);
        
        // Create panel
        this.panel = document.createElement('div');
        this.panel.className = 'assist-panel';
        
        this.panel.innerHTML = `
            <div class="assist-panel-header">
                <h3 class="assist-panel-title">
                    <img src="/assist/assets/cognaire-assist-logo.png" alt="Cognaire Assist" height="32" style="margin-right: 4px;">
                </h3>
                <button class="assist-panel-close" aria-label="Close Assist panel">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="assist-panel-content">
                <div class="assist-panel-loading">
                    <i class="fas fa-spinner"></i>
                    <span>Loading Cognaire Assist...</span>
                </div>
                <div class="assist-app-container"></div>
            </div>
        `;
        
        // Add event listener to close button
        const closeBtn = this.panel.querySelector('.assist-panel-close');
        closeBtn.addEventListener('click', this.closeAssist);
        
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
    }

    async toggleAssist() {
        if (this.isLoading) return;
        
        // Check authentication before allowing toggle
        if (!this.isLoggedIn) {
            console.warn('[AssistIntegration] User not logged in - ignoring toggle request');
            return;
        }
        
        if (this.isOpen) {
            this.closeAssist();
        } else {
            await this.openAssist();
        }
    }

    async openAssist() {
        if (this.isLoading) return;
        
        console.log('[AssistIntegration] Opening Assist panel');
        this.isLoading = true;
        this.updateButtonState();
        
        try {
            // Create panel if it doesn't exist
            if (!this.panel) {
                this.createPanel();
            }
            
            // Update status to loading
            this.updateStatus('Loading...', 'loading');
            
            // Check if user is authenticated in Respond
            const currentUser = getCurrentUser();
            const authToken = localStorage.getItem('authToken');
            
            if (!currentUser || !authToken) {
                throw new Error('Please log in to Respond before using Assist');
            }
            
            // Load Assist application
            await this.loadAssistApp(currentUser, authToken);
            
            // Show panel with animation
            this.overlay.classList.add('open');
            this.panel.classList.add('open');
            this.isOpen = true;
            
            // Update status to ready
            this.updateStatus('Ready', 'ready');
            
            // Focus management for accessibility
            const firstFocusable = this.panel.querySelector('button, input, select, textarea, [tabindex]');
            if (firstFocusable) {
                firstFocusable.focus();
            }
            
            console.log('[AssistIntegration] Assist panel opened successfully');
            
        } catch (error) {
            console.error('[AssistIntegration] Failed to open Assist:', error);
            this.updateStatus('Error', 'error');
            this.showError(error.message);
        } finally {
            this.isLoading = false;
            this.updateButtonState();
        }
    }

    closeAssist() {
        if (!this.isOpen) return;
        
        console.log('[AssistIntegration] Closing Assist panel');
        
        this.overlay.classList.remove('open');
        this.panel.classList.remove('open');
        this.isOpen = false;
        
        // Update button state to show question mark icon
        this.updateButtonState();
        
        // Return focus to the floating button
        this.button.focus();
    }

    async loadAssistApp(user, authToken) {
        const container = this.panel.querySelector('.assist-app-container');
        const loadingDiv = this.panel.querySelector('.assist-panel-loading');
        
        try {
            console.log('[AssistIntegration] Loading Assist application for user:', user.username);
            
            // Get Respond's API configuration for the current environment
            const config = getConfig();
            const currentTenant = getCurrentTenant();
            const assistApiUrl = config.currentApiUrls.assist;
            
            // Add deployment context for cross-application authentication (Method 3)
            const deploymentContext = {
                application: 'respond',
                tenant: currentTenant,
                region: 'us-east-1',
                parameterStorePath: `/cognaire/respond/${currentTenant}/auth_secrets`
            };

            console.log('[AssistIntegration] Passing API configuration and deployment context to embedded Assist:', {
                currentTenant,
                assistApiUrl,
                deploymentContext
            });
            
            // Dynamically import the Assist integration module
            const { default: AssistApp } = await import('../assist/respond-integration.js');
            
            // Initialize Assist with Respond's authentication, API configuration, and deployment context
            this.assistApp = new AssistApp({
                container: container,
                user: user,
                authToken: authToken,
                subtenant: user.subtenant || localStorage.getItem('subtenant'),
                parentApp: 'respond',
                apiConfig: {
                    tenant: currentTenant,
                    assistApiUrl: assistApiUrl
                },
                deploymentContext: deploymentContext,
                onError: (error) => this.showError(error.message),
                onStatusChange: (status) => this.updateStatus(status, 'ready')
            });
            
            await this.assistApp.initialize();
            
            // Hide loading, show app
            loadingDiv.style.display = 'none';
            container.classList.add('loaded');
            
            // Debug: Check container dimensions and content
            console.log('[AssistIntegration] Assist application loaded successfully');
            console.log('[AssistIntegration] Container dimensions:', {
                width: container.offsetWidth,
                height: container.offsetHeight,
                display: getComputedStyle(container).display,
                visibility: getComputedStyle(container).visibility
            });
            console.log('[AssistIntegration] Container innerHTML length:', container.innerHTML.length);
            
        } catch (error) {
            console.error('[AssistIntegration] Failed to load Assist app:', error);
            
            // Show error in the loading area
            loadingDiv.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: var(--status-error);"></i>
                <span>Failed to load Assist</span>
                <small style="margin-top: 8px; opacity: 0.8;">${error.message}</small>
                <button onclick="this.closest('.assist-panel-overlay').click()" 
                        style="margin-top: 12px; padding: 6px 12px; border: 1px solid var(--border-subtle); background: white; border-radius: 4px; cursor: pointer;">
                    Close
                </button>
            `;
            
            throw error;
        }
    }

    showError(message) {
        // Could integrate with Respond's existing error modal system
        console.error('[AssistIntegration] Error:', message);
        
        // For now, use a simple alert (could be replaced with proper modal)
        alert(`Assist Error: ${message}`);
    }

    checkAuthenticationState() {
        const currentUser = getCurrentUser();
        const authToken = localStorage.getItem('authToken');
        
        this.isLoggedIn = !!(currentUser && authToken);
        this.updateButtonVisibility();
        
        console.log('[AssistIntegration] Authentication state checked:', {
            isLoggedIn: this.isLoggedIn,
            hasUser: !!currentUser,
            hasToken: !!authToken
        });
    }

    handleUserLogin() {
        console.log('[AssistIntegration] User logged in - showing Assist button');
        this.isLoggedIn = true;
        this.updateButtonVisibility();
    }

    handleUserLogout() {
        console.log('[AssistIntegration] User logged out - hiding Assist button');
        this.isLoggedIn = false;
        
        // Close panel if it's open
        if (this.isOpen) {
            this.closeAssist();
        }
        
        this.updateButtonVisibility();
    }

    updateButtonVisibility() {
        if (!this.button) return;
        
        if (this.isLoggedIn) {
            this.button.classList.add('visible');
        } else {
            this.button.classList.remove('visible');
        }
    }

    updateButtonState() {
        if (!this.button) return;

        // Preserve the visibility state
        const isVisible = this.button.classList.contains('visible');

        if (this.isLoading) {
            this.button.className = 'assist-floating-button loading';
            this.button.innerHTML = '<i class="fas fa-spinner"></i>';
            this.button.disabled = true;
        } else if (this.isOpen) {
            this.button.className = 'assist-floating-button';
            this.button.innerHTML = '<i class="fas fa-times"></i>';
            this.button.disabled = false;
        } else {
            this.button.className = 'assist-floating-button';
            this.button.innerHTML = '<i class="fas fa-question-circle"></i>';
            this.button.disabled = false;
        }

        // Restore visibility state if user is logged in
        if (isVisible && this.isLoggedIn) {
            this.button.classList.add('visible');
        }
    }

    updateStatus(status, type = 'ready') {
        // Status updates now handled within the embedded Assist application itself
        // The status indicator is part of Assist's chat-input-footer
        console.log('[AssistIntegration] Status update:', status, type);
    }

    handleKeyDown(event) {
        // Close panel on Escape key
        if (event.key === 'Escape' && this.isOpen) {
            this.closeAssist();
            event.preventDefault();
        }
    }

    destroy() {
        console.log('[AssistIntegration] Destroying Assist integration');
        
        // Clean up Assist app
        if (this.assistApp && this.assistApp.destroy) {
            this.assistApp.destroy();
        }
        
        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('userLoggedIn', this.handleUserLogin);
        document.removeEventListener('userLoggedOut', this.handleUserLogout);
        
        // Remove DOM elements
        if (this.button && this.button.parentNode) {
            this.button.parentNode.removeChild(this.button);
        }
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        
        // Remove styles
        const styleElement = document.getElementById('assist-integration-styles');
        if (styleElement && styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
        
        // Reset state
        this.isOpen = false;
        this.isLoading = false;
        this.assistApp = null;
        this.panel = null;
        this.button = null;
        this.overlay = null;
    }
}

// Export for use in main.js
export default AssistIntegration;