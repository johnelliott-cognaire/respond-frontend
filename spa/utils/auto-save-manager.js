// utils/auto-save-manager.js

/**
 * Centralized Auto-Save Manager
 * 
 * Handles automatic saving of document changes with:
 * - 5-second debounced saving (waits for user to stop making changes)
 * - Error handling with retry mechanism
 * - Save status tracking and events
 * - Queue management for offline scenarios
 * - Comprehensive feedback to users
 */

import { updateDocument, createDocument } from '../api/documents.js';
import { ErrorModal } from '../ui/modals/error-modal.js';

export class AutoSaveManager {
    constructor(docTaskInstance, getDocumentDataAsync) {
        this.docTaskInstance = docTaskInstance;
        this.getDocumentDataAsync = getDocumentDataAsync; // Function to get current document data (async)
        
        // Auto-save configuration
        this.autoSaveDelay = 2000; // 2 seconds
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds base delay
        this.maxRetryDelay = 30000; // Maximum 30 seconds between retries
        
        // State tracking
        this.saveTimeout = null;
        this.isSaving = false;
        this.saveQueue = [];
        this.lastSaveAttempt = null;
        this.retryCount = 0;
        this.isOnline = navigator.onLine;
        this.retryTimeouts = []; // Track retry timeouts for cleanup
        
        // Status tracking
        this.lastSuccessfulSave = docTaskInstance.lastSavedAt || null;
        this.currentStatus = this._determineInitialStatus(); // 'idle', 'pending', 'saving', 'saved', 'error'
        this.errorModal = new ErrorModal();
        
        // DocumentItems save tracking
        this.lastDocumentItemsSave = null;
        this.documentItemsSaveType = null; // 'grid', 'form', 'bulk'
        this.documentItemsSaveCount = 0;
        
        // Event listeners for status changes
        this.statusListeners = [];
        
        // Set up network monitoring
        this.setupNetworkMonitoring();
        
        // Set up periodic status updates for time-based messages
        this.setupPeriodicUpdates();
        
        console.log('[AutoSaveManager] Initialized for document:', this.docTaskInstance.documentId || 'new', 
                   'Initial status:', this.currentStatus, 'isDirty:', this.docTaskInstance.isDirty);
    }

    /**
     * Subscribe to save status changes
     * @param {Function} callback - Called with (status, details)
     */
    onStatusChange(callback) {
        this.statusListeners.push(callback);
        // Immediately call with current status
        callback(this.currentStatus, this.getStatusDetails());
    }

    /**
     * Remove status change listener
     * @param {Function} callback - The callback to remove
     */
    removeStatusListener(callback) {
        this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    }

    /**
     * Get detailed status information
     * @returns {Object} Status details
     */
    getStatusDetails() {
        return {
            status: this.currentStatus,
            lastSaved: this.lastSuccessfulSave,
            isSaving: this.isSaving,
            hasError: this.currentStatus === 'error',
            isNew: !this.docTaskInstance.documentId,
            retryCount: this.retryCount,
            lastDocumentItemsSave: this.lastDocumentItemsSave,
            documentItemsSaveType: this.documentItemsSaveType,
            documentItemsSaveCount: this.documentItemsSaveCount
        };
    }

    /**
     * Track DocumentItems save operation (separate from document_data saves)
     * @param {string} operation - Type of operation ('grid-cell', 'form-field', 'bulk-operation', 'create-item')
     * @param {string} status - Status ('success' or 'error')
     * @param {Object} details - Additional details about the operation
     */
    trackDocumentItemSave(operation, status, details = {}) {
        console.log(`[AutoSaveManager] DocumentItems ${operation} ${status}:`, details);
        
        if (status === 'success') {
            this.lastDocumentItemsSave = new Date().toISOString();
            this.documentItemsSaveType = operation;
            this.documentItemsSaveCount++;
            
            // Store the current status before changing to doc-items-saved
            const statusBeforeDocItems = this.currentStatus !== 'doc-items-saved' ? this.currentStatus : 'idle';
            
            // Temporarily update to DocumentItems saved status
            this.updateStatus('doc-items-saved');
            
            // Revert to Ready status after 10 seconds for DocumentItems saves
            setTimeout(() => {
                if (this.currentStatus === 'doc-items-saved') {
                    if (statusBeforeDocItems === 'pending' || statusBeforeDocItems === 'saving') {
                        // If we were in pending/saving state, stay there (document_data changes pending)
                        this.updateStatus(statusBeforeDocItems);
                    } else {
                        // For DocumentItems saves, just go back to Ready
                        this.updateStatus('idle');
                    }
                }
            }, 10000); // 10 seconds
            
        } else if (status === 'error') {
            // Store the current status before changing to doc-items-error
            const statusBeforeError = this.currentStatus !== 'doc-items-error' ? this.currentStatus : 'idle';
            
            // Show brief error status for DocumentItems saves
            this.updateStatus('doc-items-error');
            
            // Revert to previous status after 2 seconds
            setTimeout(() => {
                if (this.currentStatus === 'doc-items-error') {
                    // Revert to the status we had before the error
                    this.updateStatus(statusBeforeError);
                }
            }, 2000);
        }
    }

    /**
     * Update status and notify listeners
     * @param {string} status - New status
     */
    updateStatus(status) {
        const oldStatus = this.currentStatus;
        this.currentStatus = status;
        
        console.log(`[AutoSaveManager] Status change: ${oldStatus} -> ${status}`);
        
        // Notify all listeners
        const details = this.getStatusDetails();
        this.statusListeners.forEach(callback => {
            try {
                callback(status, details);
            } catch (error) {
                console.error('[AutoSaveManager] Error in status listener:', error);
            }
        });
    }

    /**
     * Trigger an auto-save (debounced)
     * This should be called whenever docTaskInstance is modified
     */
    triggerAutoSave() {
        // Mark document as dirty
        this.docTaskInstance.isDirty = true;
        
        // Clear existing timeout
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            console.log('[AutoSaveManager] Cleared existing save timeout');
        }
        
        // Update status to pending
        this.updateStatus('pending');
        
        // Set new timeout for auto-save
        this.saveTimeout = setTimeout(() => {
            console.log('[AutoSaveManager] Auto-save timeout fired, performing save');
            this.performSave();
        }, this.autoSaveDelay);
        
        console.log('[AutoSaveManager] Auto-save scheduled in', this.autoSaveDelay, 'ms for document:', this.docTaskInstance.documentId || 'new');
    }

    /**
     * Force immediate save (bypasses debounce)
     * @returns {Promise<boolean>} Success status
     */
    async forceSave() {
        // Clear any pending auto-save
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        
        return this.performSave();
    }

    /**
     * Perform the actual save operation
     * @returns {Promise<boolean>} Success status
     */
    async performSave() {
        // Don't save if already saving
        if (this.isSaving) {
            console.log('[AutoSaveManager] Save already in progress, skipping');
            return false;
        }

        // Don't save if no changes
        if (!this.docTaskInstance.isDirty) {
            console.log('[AutoSaveManager] No changes to save, updating status to saved');
            this.updateStatus('saved');
            return true;
        }

        const saveStartTime = performance.now();
        console.log('[AutoSaveManager] Starting save operation...');
        
        this.isSaving = true;
        this.updateStatus('saving');
        this.lastSaveAttempt = new Date().toISOString();

        try {
            console.log('[AutoSaveManager] Performing save for document:', this.docTaskInstance.documentId || 'new');
            
            // Get current document data (sanitized) - now async to prevent main thread blocking
            const documentData = await this.getDocumentDataAsync();
            
            if (!documentData) {
                throw new Error('Failed to get document data for saving');
            }
            
            // Validate required fields
            if (!documentData.projectId) {
                throw new Error('Project ID is required to save document');
            }

            // Extract project info
            const [accountId, plainProjectId] = documentData.projectId.split('#', 2);
            if (!accountId || !plainProjectId) {
                throw new Error(`Invalid project ID format: "${documentData.projectId}". Expected "accountId#projectId" format.`);
            }

            // Ensure we have a good title
            let docTitle = documentData.title;
            if (!docTitle || docTitle.includes('undefined')) {
                const taskType = documentData.taskType || 'Document';
                const projectName = documentData.projectName || plainProjectId || 'Project';
                const docId = documentData.documentId || Math.random().toString(36).slice(2, 5);
                docTitle = `${taskType} - ${projectName} - ${docId}`;
                this.docTaskInstance.title = docTitle;
                documentData.title = docTitle;
            }

            // Determine if creating or updating
            const hasValidDocumentId = documentData.documentId && 
                typeof documentData.documentId === 'string' && 
                documentData.documentId.trim() !== '';

            if (!hasValidDocumentId) {
                // Create new document
                console.log('[AutoSaveManager] Creating new document');
                const response = await createDocument({
                    taskType: documentData.taskType,
                    ownerUsername: documentData.ownerUsername,
                    projectId: documentData.projectId,
                    title: docTitle,
                    documentData: documentData
                });

                if (!response || !response.document_id) {
                    throw new Error('Server did not return a valid document_id');
                }

                // Store the new document ID
                this.docTaskInstance.documentId = response.document_id;
                console.log('[AutoSaveManager] Document created with ID:', response.document_id);

            } else {
                // Update existing document
                console.log('[AutoSaveManager] Updating existing document:', documentData.documentId);
                await updateDocument({
                    document_id: documentData.documentId,
                    project_id: documentData.projectId,
                    title: docTitle,
                    status: documentData.status,
                    percentage_complete: (documentData.status === "READY") ? 100 : 0,
                    modified_by: documentData.ownerUsername,
                    document_data: documentData
                });
            }

            // Mark as saved
            this.docTaskInstance.isSaved = true;
            this.docTaskInstance.isDirty = false;
            this.docTaskInstance.lastSavedAt = new Date().toISOString();
            this.lastSuccessfulSave = this.docTaskInstance.lastSavedAt;
            this.retryCount = 0;

            // Update status
            this.updateStatus('saved');

            // Persist in TabManager if available
            if (window.tabManager) {
                window.tabManager.persistTabs();
            }

            const saveEndTime = performance.now();
            const totalSaveTime = saveEndTime - saveStartTime;
            console.log(`[AutoSaveManager] Document saved successfully in ${totalSaveTime.toFixed(2)}ms`);
            
            // Warn if save operation took too long (could indicate main thread blocking)
            if (totalSaveTime > 100) {
                console.warn(`[AutoSaveManager] Save operation took ${totalSaveTime.toFixed(2)}ms - may affect UI responsiveness`);
            }
            
            return true;

        } catch (error) {
            console.error('[AutoSaveManager] Save failed:', error);
            
            // Check if this is a network-related error
            const isNetworkError = this.isNetworkError(error);
            
            if (isNetworkError && this.isLikelyOffline()) {
                // Queue save for when connection is restored
                console.log('[AutoSaveManager] Network offline, queueing save for later');
                // Note: For offline queue, we'll get data when connection is restored
                this.saveQueue.push({ timestamp: Date.now(), data: null });
                this.updateStatus('error');
                return false;
            }
            
            // Handle retry logic with exponential backoff
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                const retryDelay = this.calculateRetryDelay(this.retryCount - 1);
                console.log(`[AutoSaveManager] Scheduling retry ${this.retryCount}/${this.maxRetries} in ${retryDelay}ms`);
                
                const retryTimeout = setTimeout(() => {
                    this.performSave();
                }, retryDelay);
                
                this.retryTimeouts.push(retryTimeout);
                this.updateStatus('pending');
            } else {
                // Max retries exceeded, show error
                this.updateStatus('error');
                this.showSaveError(error, isNetworkError);
            }
            
            return false;
        } finally {
            this.isSaving = false;
        }
    }

    /**
     * Check if an error is network-related
     * @param {Error} error - The error to check
     * @returns {boolean}
     */
    isNetworkError(error) {
        if (!error) return false;
        
        const networkErrorKeywords = [
            'fetch', 'network', 'connection', 'timeout', 'offline', 'unreachable',
            'failed to fetch', 'networkerror', 'net::', 'cors'
        ];
        
        const errorMessage = error.message?.toLowerCase() || '';
        const errorName = error.name?.toLowerCase() || '';
        
        return networkErrorKeywords.some(keyword => 
            errorMessage.includes(keyword) || errorName.includes(keyword)
        ) || !navigator.onLine;
    }

    /**
     * Show save error to user with appropriate messaging
     * @param {Error} error - The error that occurred
     * @param {boolean} isNetworkError - Whether this is a network-related error
     */
    showSaveError(error, isNetworkError = false) {
        let title, message, details;
        
        if (isNetworkError || this.isLikelyOffline()) {
            title = 'Connection Issue';
            message = 'Unable to save due to network connection problems.';
            details = 'Your changes are preserved locally. They will be saved automatically when your connection is restored.';
        } else {
            title = 'Auto-Save Failed';
            message = `Failed to automatically save your document: ${error.message}`;
            details = 'Your changes are preserved locally. You can try refreshing the page or contact support if the problem persists.';
        }
        
        this.errorModal.show({
            title,
            message,
            details
        });
    }

    /**
     * Check if the document has unsaved changes
     * @returns {boolean}
     */
    hasUnsavedChanges() {
        return this.docTaskInstance.isDirty || this.currentStatus === 'pending' || this.isSaving;
    }

    /**
     * Determine the initial status based on document state
     * @returns {string} Initial status
     * @private
     */
    _determineInitialStatus() {
        // If document has never been saved
        if (!this.docTaskInstance.documentId && !this.docTaskInstance.lastSavedAt) {
            return 'idle'; // New document, ready to be saved when changes are made
        }
        
        // If document exists and has unsaved changes
        if (this.docTaskInstance.isDirty) {
            return 'idle'; // Has changes but not actively saving
        }
        
        // If document exists and is clean
        return 'saved';
    }

    /**
     * Set up periodic updates for time-based status messages
     * @private
     */
    setupPeriodicUpdates() {
        // Update status display every minute to keep time references current
        this.statusUpdateInterval = setInterval(() => {
            if (this.currentStatus === 'saved' && this.lastSuccessfulSave) {
                // Trigger UI update to refresh time display
                this.notifyStatusListeners();
            }
        }, 60000); // Update every minute
    }

    /**
     * Notify status listeners without changing the status
     * @private
     */
    notifyStatusListeners() {
        const details = this.getStatusDetails();
        this.statusListeners.forEach(callback => {
            try {
                callback(this.currentStatus, details);
            } catch (error) {
                console.error('[AutoSaveManager] Error in status listener:', error);
            }
        });
    }

    /**
     * Set up network monitoring for offline/online detection
     * @private
     */
    setupNetworkMonitoring() {
        // Bind event handlers for proper cleanup
        this.handleOnline = () => {
            console.log('[AutoSaveManager] Network connection restored');
            this.isOnline = true;
            this.processQueuedSaves();
        };
        
        this.handleOffline = () => {
            console.log('[AutoSaveManager] Network connection lost');
            this.isOnline = false;
            this.updateStatus('error');
        };
        
        // Listen for online/offline events
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
        
        // Periodically check connectivity if offline
        this.connectivityCheckInterval = setInterval(() => {
            if (!this.isOnline && navigator.onLine) {
                this.isOnline = true;
                this.processQueuedSaves();
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Process any queued saves when connection is restored
     * @private
     */
    async processQueuedSaves() {
        if (this.saveQueue.length > 0 && this.isOnline && !this.isSaving) {
            console.log('[AutoSaveManager] Processing queued saves');
            // Only process the most recent save attempt
            this.saveQueue = [];
            await this.performSave();
        }
    }

    /**
     * Check if we're likely offline or have connectivity issues
     * @returns {boolean}
     */
    isLikelyOffline() {
        return !navigator.onLine || !this.isOnline;
    }

    /**
     * Calculate exponential backoff delay
     * @param {number} attempt - The attempt number (0-based)
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt) {
        const exponentialDelay = this.retryDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        return Math.min(exponentialDelay + jitter, this.maxRetryDelay);
    }

    /**
     * Get a human-readable status message
     * @returns {string}
     */
    getStatusMessage() {
        switch (this.currentStatus) {
            case 'saving':
                return 'Saving...';
            case 'pending':
                return 'Pending save...';
            case 'saved':
                if (this.lastSuccessfulSave) {
                    const saveTime = new Date(this.lastSuccessfulSave);
                    const now = new Date();
                    const diffSeconds = Math.floor((now - saveTime) / 1000);
                    const diffMinutes = Math.floor(diffSeconds / 60);
                    const diffHours = Math.floor(diffMinutes / 60);
                    
                    if (diffSeconds < 30) {
                        return 'Saved just now';
                    } else if (diffSeconds < 60) {
                        return 'Saved < 1 min ago';
                    } else if (diffMinutes < 60) {
                        return `Saved ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
                    } else if (diffHours < 24) {
                        return `Saved ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                    } else {
                        return `Saved on ${saveTime.toLocaleDateString()}`;
                    }
                }
                return 'Saved';
            case 'error':
                return `Save failed (${this.retryCount}/${this.maxRetries} retries)`;
            case 'doc-items-saved':
                return this._getDocumentItemsSaveMessage();
            case 'doc-items-error':
                return 'Grid save failed';
            default:
                return 'Ready';
        }
    }

    /**
     * Get DocumentItems save message based on operation type
     * @returns {string}
     * @private
     */
    _getDocumentItemsSaveMessage() {
        switch (this.documentItemsSaveType) {
            case 'grid-cell':
                return 'Cell saved';
            case 'form-field':
                return 'Field saved';
            case 'bulk-operation':
                return 'Items saved';
            case 'create-item':
                return 'Item saved';
            default:
                return 'Data saved';
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        // Clear save timeout
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        // Clear retry timeouts
        this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
        this.retryTimeouts = [];
        
        // Clear connectivity check interval
        if (this.connectivityCheckInterval) {
            clearInterval(this.connectivityCheckInterval);
        }
        
        // Clear status update interval
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        
        // Remove network event listeners
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
        
        // Clear status listeners
        this.statusListeners = [];
        
        console.log('[AutoSaveManager] Destroyed');
    }
}

/**
 * Utility function to create a sanitized copy of docTaskInstance for storage
 * @param {Object} docTaskInstance - The document task instance
 * @returns {Object} Sanitized copy suitable for storage
 */
export function sanitizeDocTaskInstanceForStorage(docTaskInstance) {
    try {
        const sanitized = JSON.parse(JSON.stringify(docTaskInstance, (key, value) => {
            // Skip properties that cause circular references or are UI-specific
            if (key === '__parent' ||
                key === '__document' ||
                key === '__internalSaveHook' ||
                key === 'headerEl' ||
                key === 'footerEl' ||
                key === 'mainContentEl' ||
                key === 'formInstance' ||
                key === 'autoSaveManager') {
                return undefined;
            }
            return value;
        }));
        
        console.log('[AutoSaveManager] Sanitized document data for storage');
        return sanitized;
    } catch (error) {
        console.error('[AutoSaveManager] Error sanitizing document data:', error);
        throw new Error('Failed to sanitize document data for storage');
    }
}

/**
 * Async version of sanitizeDocTaskInstanceForStorage that yields to the browser
 * to prevent blocking the main thread on large documents
 * @param {Object} docTaskInstance - The document task instance
 * @returns {Promise<Object>} Sanitized copy suitable for storage
 */
export function sanitizeDocTaskInstanceForStorageAsync(docTaskInstance) {
    return new Promise((resolve, reject) => {
        console.log('[MAIN_THREAD_DEBUG] sanitizeDocTaskInstanceForStorageAsync called, scheduling async work');
        
        // Use setTimeout to yield control back to browser and prevent main thread blocking
        setTimeout(() => {
            try {
                const startTime = performance.now();
                console.log('[MAIN_THREAD_DEBUG] Starting document sanitization...');
                
                // Skip size check to avoid circular reference issues during debug
                console.log('[MAIN_THREAD_DEBUG] Starting JSON sanitization (skipping size check due to potential circular refs)');
                
                // Use a more robust circular reference replacer
                const getCircularReplacer = () => {
                    const seen = new WeakSet();
                    return (key, value) => {
                        // Skip known problematic properties first
                        if (key === '__parent' ||
                            key === '__document' ||
                            key === '__internalSaveHook' ||
                            key === 'headerEl' ||
                            key === 'footerEl' ||
                            key === 'mainContentEl' ||
                            key === 'formInstance' ||
                            key === 'autoSaveManager' ||
                            key === 'docTaskInstance' ||  // Added this to break the specific circular ref
                            key === 'framework' ||
                            key === 'jobController') {
                            return undefined;
                        }
                        
                        // Handle general circular references
                        if (typeof value === 'object' && value !== null) {
                            if (seen.has(value)) {
                                return '[Circular Reference]';
                            }
                            seen.add(value);
                        }
                        return value;
                    };
                };

                const sanitized = JSON.parse(JSON.stringify(docTaskInstance, getCircularReplacer()));
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                console.log(`[MAIN_THREAD_DEBUG] Document sanitization completed in ${duration.toFixed(2)}ms`);
                
                // If sanitization took longer than 10ms, warn about potential performance impact
                if (duration > 10) {
                    console.warn(`[MAIN_THREAD_DEBUG] Document sanitization took ${duration.toFixed(2)}ms - consider optimizing document size`);
                }
                
                // If it took longer than 100ms, it's definitely blocking the main thread
                if (duration > 100) {
                    console.error(`[MAIN_THREAD_DEBUG] CRITICAL: Document sanitization took ${duration.toFixed(2)}ms - this is blocking the main thread!`);
                }
                
                resolve(sanitized);
            } catch (error) {
                console.error('[MAIN_THREAD_DEBUG] Error sanitizing document data (async):', error);
                reject(new Error('Failed to sanitize document data for storage'));
            }
        }, 0);
    });
}