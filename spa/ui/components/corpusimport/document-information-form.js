// ui/components/corpusimport/document-information-form.js
import { ErrorModal } from "../../modals/error-modal.js";
import { MessageModal } from "../../modals/message-modal.js";
import { prettifyInputName } from "../../../utils/corpus-utils.js";

export class DocumentInformationForm {
    constructor(options = {}) {
        this.onUpdate = options.onUpdate || (() => {});
        this.onError = options.onError || console.error;
        this.messageModal = options.messageModal || new MessageModal();
        this.errorModal = options.messageModal || new ErrorModal();
        
        // Current state
        this.metadata = {
            documentType: options.documentType || '',
            documentName: options.documentName || '',
            documentTopic: options.documentTopic || '',
            domain: options.domain || '',
            unit: options.unit || '',
            corpus: options.corpus || 'rfp' // Default to 'rfp' if not provided
        };
        
        // File extension for preview - text entry will provide this
        this.fileExtension = options.fileExtension || '';
        
        // Store corpus config for dropdowns
        this.corpusConfig = options.corpusConfig || {};
        
        // DOM elements
        this.formContainer = null;
        this.pathPreviewEl = null;
        
        // Track available options based on corpus config
        this._updateAvailableOptions();
    }
    
    _updateAvailableOptions() {
        // Get corpus configuration
        const corpus = this._getCorpusConfig();
        
        // Set available document types and topics from corpus config
        this.documentTypes = corpus?.document_types_choices || [
            'marketing', 'case-study', 'policy-doc', 'product-doc', 'blog', 'contract'
        ];
        
        this.documentTopics = corpus?.document_topics_choices || [
            'security', 'commercial', 'functional', 'bau', 'ethics', 'data', 'ai'
        ];
        
        // Get domains and units from corpus config
        this.domains = this._getDomains();
        this.units = this._getUnits(this.metadata.domain);
    }
    
    _getCorpusConfig() {
        if (!this.corpusConfig || !this.metadata.corpus) return {};
        return this.corpusConfig.corpora?.[this.metadata.corpus] || {};
    }
    
    _getDomains() {
        const corpus = this._getCorpusConfig();
        if (!corpus.domain_hierarchy) return [];
        
        return Object.keys(corpus.domain_hierarchy || {});
    }
    
    _getUnits(domain) {
        const corpus = this._getCorpusConfig();
        if (!domain || !corpus.domain_hierarchy || !corpus.domain_hierarchy[domain]) return [];
        
        return corpus.domain_hierarchy[domain] || [];
    }
    
    render(container) {
        this.formContainer = container;
        
        const formEl = document.createElement('div');
        formEl.className = 'metadata-form';
        formEl.innerHTML = this._buildFormHTML();
        
        container.appendChild(formEl);
        
        // Setup event listeners
        this._setupEventListeners(formEl);
        
        // Store path preview element
        this.pathPreviewEl = formEl.querySelector('#pathPreview');
        
        // Initialize path preview
        this._updatePathPreview();
    }
    
    _buildFormHTML() {
        // Format options with proper case
        const docTypeOptions = this.documentTypes.map(type => 
            `<option value="${type}" ${type === this.metadata.documentType ? 'selected' : ''}>${prettifyInputName(type)}</option>`
        ).join('');
        
        const docTopicOptions = this.documentTopics.map(topic => 
            `<option value="${topic}" ${topic === this.metadata.documentTopic ? 'selected' : ''}>${prettifyInputName(topic)}</option>`
        ).join('');
        
        const domainOptions = this.domains.map(domain => 
            `<option value="${domain}" ${domain === this.metadata.domain ? 'selected' : ''}>${prettifyInputName(domain)}</option>`
        ).join('');
        
        const unitOptions = this.units.map(unit => 
            `<option value="${unit}" ${unit === this.metadata.unit ? 'selected' : ''}>${prettifyInputName(unit)}</option>`
        ).join('');
        
        return `
            <h4 class="form-section-title">Document Information</h4>
            
            <div class="form-group">
                <label for="docType" class="form-label">Document Type <span class="required">*</span></label>
                <select id="docType" class="form-select" required>
                    <option value="">-- Select Document Type --</option>
                    ${docTypeOptions}
                </select>
                <div class="form-hint">Type of document being imported</div>
            </div>
            
            <div class="form-group">
                <label for="docName" class="form-label">Document Name <span class="required">*</span></label>
                <input type="text" id="docName" class="form-input" value="${this.metadata.documentName}" required>
                <div class="form-hint">Will be used in filename (alphanumeric with hyphens, no spaces)</div>
            </div>
            
            <div class="form-group">
                <label for="docTopic" class="form-label">Document Topic <span class="required">*</span></label>
                <select id="docTopic" class="form-select" required>
                    <option value="">-- Select Document Topic --</option>
                    ${docTopicOptions}
                </select>
                <div class="form-hint">Topic category for the document</div>
            </div>
            
            <div class="form-group">
                <label for="docPath" class="form-label">Document Path</label>
                <div class="path-selector">
                    <select id="docDomain" class="form-select domain-select">
                        <option value="">No Domain (Root Level)</option>
                        ${domainOptions}
                    </select>
                    <select id="docUnit" class="form-select unit-select">
                        <option value="">No Unit</option>
                        ${unitOptions}
                    </select>
                </div>
                <div class="form-hint">Where to store in corpus hierarchy</div>
            </div>
            
            <div class="form-preview">
                <div class="form-preview-label">Generated Path & Filename:</div>
                <div class="form-preview-value" id="pathPreview"></div>
            </div>
        `;
    }
    
    _setupEventListeners(formEl) {
        const docTypeSelect = formEl.querySelector('#docType');
        docTypeSelect.addEventListener('change', (e) => {
            this.metadata.documentType = e.target.value;
            this._updatePathPreview();
            this._notifyUpdate();
        });
        
        const docNameInput = formEl.querySelector('#docName');
        docNameInput.addEventListener('input', (e) => {
            this.metadata.documentName = e.target.value;
            this._updatePathPreview();
            this._notifyUpdate();
        });
        
        const docTopicSelect = formEl.querySelector('#docTopic');
        docTopicSelect.addEventListener('change', (e) => {
            this.metadata.documentTopic = e.target.value;
            this._updatePathPreview();
            this._notifyUpdate();
        });
        
        const docDomainSelect = formEl.querySelector('#docDomain');
        docDomainSelect.addEventListener('change', (e) => {
            this.metadata.domain = e.target.value;
            
            // Update available units when domain changes
            this.units = this._getUnits(this.metadata.domain);
            
            // Update unit dropdown
            const docUnitSelect = formEl.querySelector('#docUnit');
            docUnitSelect.innerHTML = `
                <option value="">No Unit</option>
                ${this.units.map(unit => 
                    `<option value="${unit}">${this._formatOptionLabel(unit)}</option>`
                ).join('')}
            `;
            
            // Reset unit selection when domain changes
            this.metadata.unit = '';
            
            this._updatePathPreview();
            this._notifyUpdate();
        });
        
        const docUnitSelect = formEl.querySelector('#docUnit');
        docUnitSelect.addEventListener('change', (e) => {
            this.metadata.unit = e.target.value;
            this._updatePathPreview();
            this._notifyUpdate();
        });
    }
    
    _notifyUpdate() {
        this.onUpdate(this.metadata);
    }
    
    _formatOptionLabel(value) {
        if (!value) return '';
        
        // Split by hyphens and capitalize each word
        return value.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
    
    _generatePathPreview() {
        const parts = [];
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        // Add domain and unit if present
        if (this.metadata.domain) {
            parts.push(this.metadata.domain);
            
            if (this.metadata.unit) {
                parts.push(this.metadata.unit);
            }
        }
        
        // Add topic (required)
        if (this.metadata.documentTopic) {
            parts.push(this.metadata.documentTopic);
        }
        
        // Build path
        const path = parts.join('/');
        
        // Generate filename
        let filename = '';
        if (this.metadata.documentType && this.metadata.documentName) {
            // Use provided file extension if available
            const extension = this.fileExtension || 'txt';
            
            // Sanitize document name - don't mutate this.metadata.documentName directly here
            const sanitizedName = this.metadata.documentName.replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
            
            filename = `${this.metadata.documentType}_${date}_${sanitizedName}.${extension}`;
        }
        
        // Combine path and filename
        const fullPath = path + (path && filename ? '/' : '') + filename;
        
        // If not enough info, show placeholder
        if (!this.metadata.documentType || !this.metadata.documentName || !this.metadata.documentTopic) {
            return '<span class="path-placeholder">Complete required fields to see path</span>';
        }
        
        return `<span class="path-valid">${fullPath}</span>`;
    }
    
    _updatePathPreview() {
        if (this.pathPreviewEl) {
            this.pathPreviewEl.innerHTML = this._generatePathPreview();
        }
    }
    
    /**
     * Update form data with new values
     * @param {Object} data - Updated metadata
     */
    updateData(data) {
        // Update metadata with new values
        if (data) {
            this.metadata = { ...this.metadata, ...data };
        }
        
        // Re-render form if container exists
        if (this.formContainer) {
            this.formContainer.innerHTML = '';
            this.render(this.formContainer);
        }
    }
    
    setFileExtension(extension) {
        this.fileExtension = extension;
        this._updatePathPreview();
    }
    
    getData() {
        return { ...this.metadata };
    }
    
    /**
     * Validate form data
     * @returns {boolean} - Whether the form is valid
     */
    validate() {
        if (!this.metadata.documentType) {
            this.errorModal.show({
                title: "Missing Information",
                message: "Please select a document type."
            });
            return false;
        }
        
        if (!this.metadata.documentName) {
            this.errorModal.show({
                title: "Missing Information",
                message: "Please enter a document name."
            });
            return false;
        }
        
        if (!this.metadata.documentTopic) {
            this.errorModal.show({
                title: "Missing Information",
                message: "Please select a document topic."
            });
            return false;
        }
        
        // Safely validate name format with proper guards
        try {
            // Create a primitive string to avoid reference issues
            const nameStr = String(this.metadata.documentName || '');
            
            // Create a new string with sanitized content instead of modifying original
            const sanitizedStr = nameStr
                .split(' ').join('-')  // Replace spaces with hyphens
                .replace(/[^\w\-]/g, ''); // Remove non-word chars (except hyphens)
            
            // Compare using primitive equality
            if (sanitizedStr !== nameStr) {
                this.errorModal.show({
                    title: "Invalid Format",
                    message: "Document name contains invalid characters. Please use only letters, numbers, and hyphens."
                });
                return false;
            }
        } catch (error) {
            console.error('Error validating document name:', error);
            this.errorModal.show({
                title: "Validation Error",
                message: "There was an error validating the document name. Please try again with a simpler name."
            });
            return false;
        }
        
        return true;
    }
    
    _showError(message) {
        if (this.onError) {
          this.onError(message);
        } else {
          this.errorModal.show({
            title: "Error",
            message: message
          });
        }
      }
}