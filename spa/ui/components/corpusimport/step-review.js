// ui/components/corpusimport/step-review.js

import * as corpusUtils from '../../../utils/corpus-utils.js';
import { ErrorModal } from "../../modals/error-modal.js";
import { MessageModal } from "../../modals/message-modal.js";

/**
 * Review step of the import wizard
 * Shows a preview of the content and metadata before import
 */
export class StepReview {
    /**
     * Create a new review step
     * @param {Object} options - Configuration options
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     * @param {string} options.currentDomain - Current corpus domain
     * @param {string} options.currentUnit - Current corpus unit
     * @param {string} options.currentTopic - Current corpus topic
     */
    constructor(options = {}) {
        this.onNext = options.onNext || (() => {});
        this.onError = options.onError || console.error;
        
        // Current path components
        this.currentDomain = options.currentDomain || '';
        this.currentUnit = options.currentUnit || '';
        this.currentTopic = options.currentTopic || '';
        
        this.domContainer = null;
        this.content = null;
        this.format = null;
        this.fileData = null;
        this.metadata = null;
        this.s3Info = null;
        
        this.importMode = 'draft'; // 'draft' or 'submit'
    }
    
    /**
     * Reset the step state
     */
    reset() {
        this.importMode = 'draft';
        
        // Reset UI if already rendered
        if (this.domContainer) {
            const draftRadio = this.domContainer.querySelector('input[value="draft"]');
            const submitRadio = this.domContainer.querySelector('input[value="submit"]');
            
            if (draftRadio) draftRadio.checked = true;
            if (submitRadio) submitRadio.checked = false;
        }
    }
    
    /**
     * Render the step
     * @param {HTMLElement} container - The container element
     */
    render(container) {
        this.domContainer = container;
        container.innerHTML = '';

        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-review';

        // Log available data for debugging
        console.log('DEBUG: StepReview render - available data:', {
            fileData: this.fileData,
            docMetadata: this.docMetadata,
            metadata: this.metadata
        });

        // Title and description
        stepContent.innerHTML = `
            <h3>Review Content</h3>
            <p>Please review the document content and details before continuing.</p>

            <div class="ciw-review-container">
                <div class="ciw-review-content-preview-section">
                    <h4 class="ciw-review-section-title">Content Preview</h4>
                    <div class="ciw-review-content-preview">${this._formatContentPreview()}</div>
                </div>

                <div class="ciw-review-document-details-section">
                    <h4 class="ciw-review-section-title">Document Details</h4>
                    <table class="metadata-table">
                        <tr>
                            <th>Document Type:</th>
                            <td>${this.docMetadata?.documentType || this.metadata?.documentType || ''}</td>
                        </tr>
                        <tr>
                            <th>Document Name:</th>
                            <td>${this.docMetadata?.documentName || this.metadata?.documentName || ''}</td>
                        </tr>
                        <tr>
                            <th>Document Topic:</th>
                            <td>${this.docMetadata?.documentTopic || this.metadata?.documentTopic || ''}</td>
                        </tr>
                        <tr>
                            <th>Path:</th>
                            <td>${this._buildPathString()}</td>
                        </tr>
                        <tr>
                            <th>Generated Filename:</th>
                            <td class="ciw-review-generated-filename">${this._generateFilename()}</td>
                        </tr>
                    </table>
                </div>

                <div class="ciw-review-import-options-section">
                    <div class="ciw-review-import-options-header">
                        <h4 class="ciw-review-section-title">Import Options</h4>
                        <div class="ciw-review-info-icon" title="Documents in the corpus go through an approval process">
                            <i class="fas fa-info-circle"></i>
                        </div>
                    </div>

                    <div class="ciw-review-approval-workflow">
                        <h5>Approval Workflow:</h5>
                        <p>Documents in the corpus go through an approval process. You can either save as a draft or submit directly for approval.</p>
                        <ul>
                            <li><strong>Draft:</strong> The document will be saved but not visible in the corpus until approved.</li>
                            <li><strong>Submit for Approval:</strong> The document will go through AI review and may be auto-approved for minor edits, or sent to a human reviewer.</li>
                        </ul>
                    </div>

                    <div class="ciw-review-import-mode-buttons">
                        <button class="btn ciw-review-mode-btn active" data-mode="draft">
                            <i class="fas fa-save"></i> Save as Draft
                        </button>
                        <button class="btn ciw-review-mode-btn" data-mode="submit">
                            <i class="fas fa-paper-plane"></i> Submit for Approval
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners for mode buttons
        const modeButtons = stepContent.querySelectorAll('.ciw-review-mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Toggle active state
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update import mode
                this.importMode = btn.dataset.mode;

                this._notifyWizard();
            });
        });

        container.appendChild(stepContent);
    }

    /**
     * Helper to get document value from available sources
     * @param {string} key - The document property name
     * @returns {string} - The document value or empty string if not found
     */
    _getDocValue(key) {
        // Check all possible sources
        // 1. Look in docMetadata (primary source)
        // 2. Fall back to metadata
        // 3. Fall back to extracted filename if applicable
        if (this.docMetadata && this.docMetadata[key]) {
            return this.docMetadata[key];
        }
        
        if (this.metadata && this.metadata[key]) {
            return this.metadata[key];
        }
        
        // Special case for documentName - try to extract from filename
        if (key === 'documentName' && this.fileData && this.fileData.name) {
            const fileName = this.fileData.name;
            const lastDotIndex = fileName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                return fileName.substring(0, lastDotIndex);
            }
            return fileName;
        }
        
        return '';
    }
    
    _formatContentPreview() {
        if (this.content) {
            if (this.format === 'markdown' && window.marked) {
                try {
                    return window.marked.parse(this.content);
                } catch (error) {
                    return `<pre>${this.content}</pre>`;
                }
            } else {
                return `<pre>${this.content}</pre>`;
            }
        } else if (this.fileData) {
            const fileExt = this.fileData.name.split('.').pop().toLowerCase();
            const iconClass = this._getFileIconClass(fileExt);

            return `<div class="ciw-review-file-preview">
                <i class="${iconClass} ciw-review-file-preview-icon"></i>
                <p class="file-preview-note">File preview not available</p>
                <p class="ciw-review-file-name">${this.fileData.name}</p>
            </div>`;
        } else {
            return '<p>No content to preview</p>';
        }
    }
    
    _getFileIconClass(ext) {
        switch (ext) {
            case 'pdf': return 'fas fa-file-pdf';
            case 'xlsx': 
            case 'xls': 
            case 'csv': return 'fas fa-file-excel';
            case 'txt':
            case 'md': return 'fas fa-file-alt';
            case 'html': return 'fas fa-file-code';
            default: return 'fas fa-file';
        }
    }
    
    _buildPathString() {
        return corpusUtils.buildCorpusPath({
            corpus: this.corpus || '',
            domain: this._getDocValue('domain'),
            unit: this._getDocValue('unit'),
            topic: this._getDocValue('documentTopic')
        }) || 'root';
    }
    
    _generateFilename() {
        if (this.fileData) {
            return this.fileData.name;
        }
        
        return corpusUtils.generateCorpusFilename({
            documentType: this._getDocValue('documentType'),
            documentName: this._getDocValue('documentName'),
            extension: this.format === 'markdown' ? 'md' : 'txt'
        });
    }

    /**
     * Generate content preview based on available data
     * @returns {string} - Content preview HTML
     */
    _generateContentPreview() {
        if (this.content) {
            // Text content preview (for text entry path)
            return `<pre class="content-preview-text">${this._escapeHtml(this.content.substring(0, 1000))}${this.content.length > 1000 ? '...' : ''}</pre>`;
        } else if (this.fileData) {
            // File content preview (for file upload path)
            return `
                <div class="file-preview">
                    <div class="file-icon">
                        <i class="${this._getFileIcon(this.fileData.name)}"></i>
                    </div>
                    <div class="file-details">
                        <div class="file-name">${this.fileData.name}</div>
                        <div class="file-size">${this._formatFileSize(this.fileData.size)}</div>
                        <div class="file-type">${this._getFileType(this.fileData.name)}</div>
                    </div>
                </div>
            `;
        }
        
        return '<div class="no-preview">No content to preview</div>';
    }
    
    /**
     * Format a value for display
     * @param {*} value - Value to format
     * @returns {string} - Formatted value
     */
    _formatValue(value) {
        if (value === undefined || value === null || value === '') {
            return '<span class="no-value">Not specified</span>';
        }
        
        // Format document type and topics as readable labels
        return value.split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    /**
     * Generate full path based on metadata
     * @returns {string} - Full path
     */
    _getFullPath() {
        const parts = [];
        
        if (this.metadata?.domain) {
            parts.push(this.metadata.domain);
            
            if (this.metadata.unit) {
                parts.push(this.metadata.unit);
            }
        }
        
        if (this.metadata?.documentTopic) {
            parts.push(this.metadata.documentTopic);
        }
        
        return parts.length > 0 ? parts.join('/') : 'root';
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
        
        // Default extensions based on content format
        if (this.content) {
            // Handle different text formats
            switch (this.format) {
                case 'markdown': return 'md';
                case 'html': return 'html';
                default: return 'txt';
            }
        }
        
        return 'txt';
    }
    
    /**
     * Get appropriate icon class for file type
     * @param {string} fileName - File name
     * @returns {string} - Icon class
     */
    _getFileIcon(fileName) {
        const lowerName = fileName.toLowerCase();
        
        if (lowerName.endsWith('.pdf')) {
            return 'fas fa-file-pdf';
        } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
            return 'fas fa-file-excel';
        } else if (lowerName.endsWith('.txt')) {
            return 'fas fa-file-alt';
        } else if (lowerName.endsWith('.md')) {
            return 'fas fa-file-code';
        } else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
            return 'fas fa-file-code';
        }
        
        return 'fas fa-file';
    }
    
    /**
     * Get file type label
     * @param {string} fileName - File name
     * @returns {string} - File type label
     */
    _getFileType(fileName) {
        const lowerName = fileName.toLowerCase();
        
        if (lowerName.endsWith('.pdf')) {
            return 'PDF Document';
        } else if (lowerName.endsWith('.xlsx')) {
            return 'Excel Spreadsheet';
        } else if (lowerName.endsWith('.xls')) {
            return 'Excel Spreadsheet (Legacy)';
        } else if (lowerName.endsWith('.csv')) {
            return 'CSV File';
        } else if (lowerName.endsWith('.txt')) {
            return 'Plain Text';
        } else if (lowerName.endsWith('.md')) {
            return 'Markdown Document';
        } else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
            return 'HTML Document';
        }
        
        return 'Document';
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
     * Escape HTML special characters
     * @param {string} html - HTML string to escape
     * @returns {string} - Escaped HTML
     */
    _escapeHtml(html) {
        if (!html) return '';
        
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }
    
    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }
    
    canProceed(showErrors = false) {
        // This step can always proceed if we have valid content or file data
        if (!this.content && !this.fileData) {
            if (showErrors) {
                this.onError('No content or file to import');
            }
            return false;
        }
        
        return true;
    }
    
    proceed() {
        if (!this.canProceed(true)) return;
        
        // Calculate full path
        const path = this._getFullPath();
        
        // Generate filename
        const filename = this._generateFilename();
        
        // Call onNext with import mode, path, and filename
        this.onNext({
            importMode: this.importMode,
            path: path,
            filename: filename
        });
    }
    
    reset() {
        this.importMode = 'draft';
        
        // Reset UI if already rendered
        if (this.domContainer) {
            const modeButtons = this.domContainer.querySelectorAll('.ciw-review-mode-btn');
            modeButtons.forEach(btn => {
                if (btn.dataset.mode === 'draft') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        
        this._notifyWizard();
    }
}

export default StepReview;