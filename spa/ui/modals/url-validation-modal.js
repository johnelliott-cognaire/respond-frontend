// File: ui/modals/url-validation-modal.js
/**
 * URL Validation Modal
 * 
 * Specialized modal for displaying URL validation errors with helpful
 * recovery options and detailed explanations for users.
 */

import { AsyncFormModal } from "./async-form-modal.js";

export class URLValidationModal extends AsyncFormModal {
    constructor(store, router = null) {
        super(store);
        this.router = router;
        this.validationResult = null;
        this.originalUrl = null;
        
        this.title = "URL Validation Error";
        this.width = "600px";
    }

    /**
     * Show URL validation error with detailed information
     * @param {Object} errorInfo - Error information object
     */
    showURLError(errorInfo) {
        this.validationResult = errorInfo.validation;
        this.originalUrl = errorInfo.originalUrl;
        this.partialMatch = errorInfo.partialMatch;
        this.suggestions = errorInfo.suggestions || [];
        
        this.show();
    }

    /**
     * Build modal content with detailed error information
     */
    buildModalContent() {
        if (!this.validationResult) {
            return '<div class="url-error-placeholder">Loading validation information...</div>';
        }

        const { errors, warnings, entityValidation, modalValidation } = this.validationResult;

        return `
            <div class="url-validation-modal">
                <div class="url-error-header">
                    <i class="fas fa-exclamation-triangle url-error-icon"></i>
                    <div class="url-error-info">
                        <h3>The requested URL could not be accessed</h3>
                        <div class="url-error-url">
                            <strong>URL:</strong> 
                            <code class="url-code">${this.originalUrl}</code>
                        </div>
                    </div>
                </div>

                ${this.buildErrorsSection(errors)}
                ${this.buildEntityValidationSection(entityValidation)}
                ${this.buildModalValidationSection(modalValidation)}
                ${this.buildSuggestionsSection()}
                ${this.buildRecoveryOptionsSection()}
                
                <div class="url-error-actions">
                    ${this.buildActionButtons()}
                </div>
            </div>
        `;
    }

    /**
     * Build errors section
     */
    buildErrorsSection(errors) {
        if (!errors || errors.length === 0) {
            return '';
        }

        const errorItems = errors.map(error => `
            <li class="url-error-item">
                <i class="fas fa-times-circle"></i>
                <span>${error}</span>
            </li>
        `).join('');

        return `
            <div class="url-error-section">
                <h4><i class="fas fa-exclamation-circle"></i> Issues Found</h4>
                <ul class="url-error-list">
                    ${errorItems}
                </ul>
            </div>
        `;
    }

    /**
     * Build entity validation section
     */
    buildEntityValidationSection(entityValidation) {
        if (!entityValidation || entityValidation.valid) {
            return '';
        }

        const { errors, pattern, examples } = entityValidation;

        return `
            <div class="url-error-section url-entity-section">
                <h4><i class="fas fa-id-card"></i> Entity ID Format Issues</h4>
                <div class="url-error-details">
                    ${errors.map(error => `<p class="url-error-detail">${error}</p>`).join('')}
                </div>
                
                ${pattern ? `
                    <div class="url-format-help">
                        <h5>Expected Format:</h5>
                        <p class="url-format-description">${pattern.description}</p>
                        
                        ${examples && examples.length > 0 ? `
                            <div class="url-format-examples">
                                <h6>Examples:</h6>
                                <ul class="url-example-list">
                                    ${examples.map(example => `
                                        <li class="url-example">
                                            <code>${example}</code>
                                            <button class="btn btn--small url-example-btn" 
                                                    data-example="${example}">
                                                Use This Format
                                            </button>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Build modal validation section
     */
    buildModalValidationSection(modalValidation) {
        if (!modalValidation || modalValidation.valid) {
            return '';
        }

        const { errors, suggestions, modal } = modalValidation;

        return `
            <div class="url-error-section url-modal-section">
                <h4><i class="fas fa-window-maximize"></i> Modal Access Issues</h4>
                <div class="url-error-details">
                    ${errors.map(error => `<p class="url-error-detail">${error}</p>`).join('')}
                </div>
                
                ${modal ? `
                    <div class="url-modal-info">
                        <p><strong>Modal:</strong> ${modal.title || modal.id}</p>
                        <p><strong>Available in:</strong> /${modal.route}</p>
                    </div>
                ` : ''}
                
                ${suggestions && suggestions.length > 0 ? `
                    <div class="url-modal-suggestions">
                        <h6>Suggestions:</h6>
                        <ul class="url-suggestion-list">
                            ${suggestions.map(suggestion => `
                                <li class="url-suggestion">${suggestion}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Build suggestions section
     */
    buildSuggestionsSection() {
        if (!this.suggestions || this.suggestions.length === 0) {
            return '';
        }

        return `
            <div class="url-error-section url-suggestions-section">
                <h4><i class="fas fa-lightbulb"></i> Helpful Suggestions</h4>
                <ul class="url-suggestion-list">
                    ${this.suggestions.map(suggestion => `
                        <li class="url-suggestion">
                            <i class="fas fa-arrow-right"></i>
                            <span>${suggestion}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * Build recovery options section
     */
    buildRecoveryOptionsSection() {
        const hasPartialMatch = this.partialMatch && this.partialMatch !== this.originalUrl;
        const hasRouterAvailable = !!this.router;

        if (!hasPartialMatch && !hasRouterAvailable) {
            return '';
        }

        return `
            <div class="url-error-section url-recovery-section">
                <h4><i class="fas fa-tools"></i> Recovery Options</h4>
                <div class="url-recovery-options">
                    ${hasPartialMatch ? `
                        <div class="url-recovery-option">
                            <p>We found a partial match for your request:</p>
                            <div class="url-partial-match">
                                <code>${this.partialMatch}</code>
                                <button class="btn btn--primary url-recovery-btn" 
                                        data-action="navigate" 
                                        data-url="${this.partialMatch}">
                                    <i class="fas fa-external-link-alt"></i>
                                    Go to Valid Page
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="url-recovery-option">
                        <p>Alternative actions:</p>
                        <div class="url-recovery-buttons">
                            <button class="btn btn--secondary url-recovery-btn" 
                                    data-action="home">
                                <i class="fas fa-home"></i>
                                Go to Home
                            </button>
                            
                            <button class="btn btn--secondary url-recovery-btn" 
                                    data-action="docs">
                                <i class="fas fa-file-alt"></i>
                                Go to Documents
                            </button>
                            
                            <button class="btn btn--secondary url-recovery-btn" 
                                    data-action="corpus">
                                <i class="fas fa-book-open"></i>
                                Go to Corpus
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Build action buttons
     */
    buildActionButtons() {
        return `
            <button type="button" class="btn btn--secondary" data-action="close">
                <i class="fas fa-times"></i>
                Close
            </button>
            
            <button type="button" class="btn btn--secondary" data-action="copy">
                <i class="fas fa-copy"></i>
                Copy Error Details
            </button>
            
            <button type="button" class="btn btn--secondary" data-action="reload">
                <i class="fas fa-redo"></i>
                Try Again
            </button>
        `;
    }

    /**
     * Add event listeners for modal interactions
     */
    addEventListeners() {
        super.addEventListeners();

        // Recovery action buttons
        this.modal.querySelectorAll('.url-recovery-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.getAttribute('data-action');
                const url = e.target.getAttribute('data-url');
                this.handleRecoveryAction(action, url);
            });
        });

        // Example format buttons
        this.modal.querySelectorAll('.url-example-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const example = e.target.getAttribute('data-example');
                this.handleExampleSelection(example);
            });
        });

        // Action buttons
        this.modal.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.getAttribute('data-action');
                this.handleAction(action);
            });
        });
    }

    /**
     * Handle recovery actions
     */
    async handleRecoveryAction(action, url) {
        if (!this.router) {
            console.warn('[URLValidationModal] No router available for navigation');
            return;
        }

        try {
            switch (action) {
                case 'navigate':
                    if (url) {
                        await this.router.navigate(url);
                        this.hide();
                    }
                    break;
                case 'home':
                    await this.router.navigate('/');
                    this.hide();
                    break;
                case 'docs':
                    await this.router.navigate('/docs');
                    this.hide();
                    break;
                case 'corpus':
                    await this.router.navigate('/corpus');
                    this.hide();
                    break;
            }
        } catch (error) {
            console.error('[URLValidationModal] Recovery navigation failed:', error);
            this.showError('Navigation failed: ' + error.message);
        }
    }

    /**
     * Handle example format selection
     */
    handleExampleSelection(example) {
        // Copy example to clipboard
        navigator.clipboard.writeText(example).then(() => {
            this.showSuccess(`Format example "${example}" copied to clipboard`);
        }).catch(() => {
            console.warn('[URLValidationModal] Could not copy to clipboard');
        });
    }

    /**
     * Handle general actions
     */
    async handleAction(action) {
        switch (action) {
            case 'close':
                this.hide();
                break;
                
            case 'copy':
                await this.copyErrorDetails();
                break;
                
            case 'reload':
                window.location.reload();
                break;
        }
    }

    /**
     * Copy error details to clipboard
     */
    async copyErrorDetails() {
        const details = {
            originalUrl: this.originalUrl,
            errors: this.validationResult?.errors || [],
            partialMatch: this.partialMatch,
            timestamp: new Date().toISOString()
        };

        const text = `URL Validation Error Report
        
Original URL: ${details.originalUrl}
Timestamp: ${details.timestamp}

Errors:
${details.errors.map(error => `- ${error}`).join('\n')}

${details.partialMatch ? `Partial Match: ${details.partialMatch}` : ''}
        `;

        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess('Error details copied to clipboard');
        } catch (error) {
            console.error('[URLValidationModal] Failed to copy error details:', error);
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        // Create temporary success notification
        const notification = document.createElement('div');
        notification.className = 'url-validation-notification url-validation-success';
        notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        `;
        
        this.modal.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    /**
     * Show error message
     */
    showError(message) {
        // Create temporary error notification
        const notification = document.createElement('div');
        notification.className = 'url-validation-notification url-validation-error';
        notification.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        `;
        
        this.modal.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

/**
 * Create URL validation modal instance
 */
export function createURLValidationModal(store, router) {
    return new URLValidationModal(store, router);
}