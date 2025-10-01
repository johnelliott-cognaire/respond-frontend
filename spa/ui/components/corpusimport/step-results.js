// ui/components/corpusimport/step-results.js
import { ErrorModal } from "../../modals/error-modal.js";
import { MessageModal } from "../../modals/message-modal.js";

/**
 * Results step of the import wizard
 * Shows the import results and provides next steps
 */
export class StepResults {
    /**
     * Create a new results step
     * @param {Object} options - Configuration options
     * @param {Function} options.onComplete - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     */
    constructor(options = {}) {
        this.onComplete = options.onComplete || (() => {});
        this.onError = options.onError || console.error;
        
        this.domContainer = null;
        this.importResults = null;
        this.fileData = null;
        this.content = null;
        this.metadata = null;
        this.importMode = '';
        
        this.isImporting = false;
    }
    
    /**
     * Set importing state
     * @param {boolean} isImporting - Whether import is in progress
     */
    setImportingState(isImporting) {
        const wasImporting = this.isImporting;
        this.isImporting = isImporting;
        
        // If already rendered, update the UI
        if (this.domContainer) {
            this.render(this.domContainer);
        }

        this._notifyWizard();

        // If we just finished importing (was true, now false) and have results, update button states
        if (wasImporting && !isImporting && this.importResults) {
            setTimeout(() => {
                if (window.currentImportWizard && 
                    typeof window.currentImportWizard._updateButtonStatesForResults === 'function') {
                    const hasSuccessfulImport = this.importResults.success === true;
                    console.log('Corpus import setImportingState calling _updateButtonStatesForResults with:', hasSuccessfulImport);
                    window.currentImportWizard._updateButtonStatesForResults(hasSuccessfulImport);
                }
            }, 0);
        }
    }
    
    /**
     * Render the step
     * @param {HTMLElement} container - The container element
     */
    render(container) {
        this.domContainer = container;
        container.innerHTML = '';
        
        // Create step content
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-results';
        
        // Add step title
        const titleEl = document.createElement('h3');
        titleEl.textContent = this.isImporting ? 'Importing...' : 'Import Complete';
        stepContent.appendChild(titleEl);
        
        // Create results container
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'import-results-container';
        
        if (this.isImporting) {
            // Show importing state
            resultsContainer.innerHTML = `
                <div class="import-status-panel importing">
                    <div class="status-icon">
                        <i class="fas fa-spinner fa-spin"></i>
                    </div>
                    <div class="status-message">
                        <h4>Import in Progress</h4>
                        <p>Please wait while your file is being converted and imported...</p>
                    </div>
                </div>
                <div class="import-progress">
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: 0%"></div>
                    </div>
                    <div class="progress-text">0%</div>
                </div>
            `;
        } else if (this.importResults) {
            if (this.importResults.success) {
                // Excel import success with worksheets
                if (this.importResults.worksheets) {
                    this._renderExcelImportResults(resultsContainer);
                } else {
                    // Standard import success
                    this._renderStandardImportResults(resultsContainer);
                }
            } else {
                // Show error state
                this._renderErrorResults(resultsContainer);
            }
        } else {
            // Show loading state if no results yet
            resultsContainer.innerHTML = `
                <div class="import-status-panel loading">
                    <div class="status-icon">
                        <i class="fas fa-spinner fa-spin"></i>
                    </div>
                    <div class="status-message">
                        <h4>Preparing Results</h4>
                        <p>Please wait while we gather information about your import...</p>
                    </div>
                </div>
            `;
        }
        
        stepContent.appendChild(resultsContainer);
        container.appendChild(stepContent);

        // If we're showing final results (not importing state), notify parent modal to update button states
        if (!this.isImporting && this.importResults) {
            // Use setTimeout to ensure the DOM is fully updated before notifying wizard
            setTimeout(() => {
                if (window.currentImportWizard && 
                    typeof window.currentImportWizard._updateButtonStatesForResults === 'function') {
                    // Pass true if import was successful, false otherwise
                    const hasSuccessfulImport = this.importResults.success === true;
                    console.log('Corpus import step-results calling _updateButtonStatesForResults with:', hasSuccessfulImport);
                    window.currentImportWizard._updateButtonStatesForResults(hasSuccessfulImport);
                }
            }, 0);
        }
    }
    
    /**
     * Render standard import results (text or single file)
     * @param {HTMLElement} container - Container element
     */
    _renderStandardImportResults(container) {
        container.innerHTML = `
            <div class="import-status-panel success">
                <div class="status-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="status-message">
                    <h4>Document Successfully Imported</h4>
                    <p>Your document has been added to the corpus${this.importMode === 'submit' ? ' and submitted for approval' : ' as a draft'}.</p>
                </div>
            </div>
            
            <div class="document-details">
                <h4>Document Information</h4>
                <table class="details-table">
                    <tr>
                        <th>Filename:</th>
                        <td>${this._getFilename()}</td>
                    </tr>
                    <tr>
                        <th>Size:</th>
                        <td>${this._getFileSize()}</td>
                    </tr>
                    <tr>
                        <th>Location:</th>
                        <td>${this.importResults.path || 'root'}</td>
                    </tr>
                    <tr>
                        <th>Status:</th>
                        <td><span class="status-chip status-${this._getStatus()}">${this._getStatusText()}</span></td>
                    </tr>
                </table>
                
                <div class="action-buttons">
                    <button class="btn btn--primary import-another-btn">
                        <i class="fas fa-plus"></i> Import Another Document
                    </button>
                </div>
            </div>
        `;
        
        const importAnotherBtn = container.querySelector('.import-another-btn');
        if (importAnotherBtn) {
            importAnotherBtn.addEventListener('click', () => {
                this.onComplete({
                    success: true,
                    resetWizard: true
                });
            });
        }
    }
    
    /**
     * Render Excel import results with worksheets
     * @param {HTMLElement} container - Container element
     */
    _renderExcelImportResults(container) {
        const worksheets = this.importResults.worksheets || [];
        
        // Generate worksheet items HTML
        const worksheetItemsHtml = worksheets.map(worksheet => `
            <div class="worksheet-result-item">
                <div class="worksheet-result-header">
                    <div class="worksheet-result-name">${worksheet.name}</div>
                    <div class="worksheet-result-stats">
                        <span class="success-count">${worksheet.rowCount || 0} rows imported</span>
                    </div>
                </div>
                <div class="worksheet-result-file">
                    <strong>File:</strong> ${worksheet.documentKey.split('/').pop() || 'Unnamed document'}
                </div>
            </div>
        `).join('');
        
        container.innerHTML = `
            <div class="import-status-panel success">
                <div class="status-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="status-message">
                    <h4>Excel Workbook Imported</h4>
                    <p>Your Excel worksheets have been converted to CSV files and added to the corpus${this.importMode === 'submit' ? ' and submitted for approval' : ' as drafts'}.</p>
                </div>
            </div>
            
            <div class="worksheet-results-section">
                <h4>Imported Worksheets</h4>
                <div class="worksheet-results-list">
                    ${worksheetItemsHtml}
                </div>
                
                <div class="action-buttons">
                    <button class="btn btn--primary import-another-btn">
                        <i class="fas fa-plus"></i> Import Another Document
                    </button>
                </div>
            </div>
        `;
        
        const importAnotherBtn = container.querySelector('.import-another-btn');
        if (importAnotherBtn) {
            importAnotherBtn.addEventListener('click', () => {
                this.onComplete({
                    success: true,
                    resetWizard: true
                });
            });
        }
    }
    
    /**
     * Render error results
     * @param {HTMLElement} container - Container element
     */
    _renderErrorResults(container) {
        container.innerHTML = `
            <div class="import-status-panel error">
                <div class="status-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <div class="status-message">
                    <h4>Import Failed</h4>
                    <p>${this.importResults.error || 'An unknown error occurred during import.'}</p>
                </div>
            </div>
            
            <div class="error-details">
                <p>Please try again or contact support if the problem persists.</p>
                
                <div class="action-buttons">
                    <button class="btn btn--primary try-again-btn">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>
            </div>
        `;
        
        // Add event listener to try again button
        const tryAgainBtn = container.querySelector('.try-again-btn');
        if (tryAgainBtn) {
            tryAgainBtn.addEventListener('click', () => {
                this.onComplete({
                    success: false,
                    goToReview: true
                });
            });
        }
    }
    
    /**
     * Navigate to corpus view
     */
    _navigateToCorpus() {
        // This would typically navigate to the corpus view
        // For now, just close the modal with success status
        this.onComplete({
            success: true
        });
    }
    
    /**
     * Get filename from results or metadata
     * @returns {string} - Filename
     */
    _getFilename() {
        if (this.importResults && this.importResults.filename) {
            return this.importResults.filename;
        }
        
        if (this.fileData) {
            return this.fileData.name;
        }
        
        // Generate from metadata
        if (this.metadata) {
            const documentType = this.metadata.documentType || 'document';
            const documentName = this.metadata.documentName || 'unnamed';
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const extension = this._getExtension();
            
            return `${documentType}_${date}_${documentName}.${extension}`;
        }
        
        return 'document.txt';
    }
    
    /**
     * Get file extension based on content type or file data
     * @returns {string} - File extension
     */
    _getExtension() {
        if (this.fileData) {
            const fileName = this.fileData.name;
            const lastDotIndex = fileName.lastIndexOf('.');
            
            if (lastDotIndex !== -1) {
                return fileName.substring(lastDotIndex + 1);
            }
        }
        
        // Default based on content type
        if (this.content) {
            const format = this.metadata?.format || 'plaintext';
            
            switch (format) {
                case 'markdown': return 'md';
                case 'html': return 'html';
                default: return 'txt';
            }
        }
        
        return 'txt';
    }
    
    /**
     * Get file size from file data or content
     * @returns {string} - Formatted file size
     */
    _getFileSize() {
        if (this.fileData && this.fileData.size) {
            return this._formatFileSize(this.fileData.size);
        }
        
        if (this.content) {
            return this._formatFileSize(this.content.length);
        }
        
        return '0 KB';
    }
    
    /**
     * Format file size to a human-readable string
     * @param {number} bytes - The file size in bytes
     * @returns {string} - Formatted file size
     */
    _formatFileSize(bytes) {
        if (!bytes) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Get document status class
     * @returns {string} - Status class
     */
    _getStatus() {
        if (this.importResults && this.importResults.importMode === 'submit') {
            return 'pending_ai';
        }
        
        return 'draft';
    }
    
    /**
     * Get document status text
     * @returns {string} - Status text
     */
    _getStatusText() {
        if (this.importResults && this.importResults.importMode === 'submit') {
            return 'Pending AI Review';
        }
        
        return 'Draft';
    }

    /**
     * Update import progress in the UI
     * @param {number} percent - Progress percentage (0-100)
     */
    updateImportProgress(percent) {
        const progressBar = this.domContainer?.querySelector('.progress-bar');
        const progressText = this.domContainer?.querySelector('.progress-text');
        
        if (!progressBar || !progressText) return;
        
        // Ensure progress is between 0-100
        const validPercent = Math.min(100, Math.max(0, percent));
        
        // Update progress bar width
        progressBar.style.width = `${validPercent}%`;
        
        // Update progress text
        progressText.textContent = `${Math.round(validPercent)}%`;
        
        // Update the "importing" state if completed
        if (validPercent >= 100) {
            setTimeout(() => {
                this.isImporting = false;
            }, 500); // Small delay for visual feedback
        }
    }
    
    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }
    
    canProceed(showErrors = false) {
        // This step is always the last one, so canProceed is used for the Finish button
        return true;
    }
    
    proceed() {
        if (!this.canProceed(true)) return;
        
        // Call onComplete with success but do NOT include resetWizard flag
        // The resetWizard flag should only be set when "Import Another" is clicked
        this.onComplete({
            success: true
        });
    }
    
    reset() {
        this.importResults = null;
        this.isImporting = false;
        
        // Re-render if needed
        if (this.domContainer) {
            this.render(this.domContainer);
        }
        
        this._notifyWizard();
    }
}

export default StepResults;