// ui/modals/corpus-content-import-modal.js

import corpusImportService from '../../api/corpus-import-service.js';
import * as corpusUtils from '../../utils/corpus-utils.js';
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";

// Import step components
import StepSelectMethod from '../components/corpusimport/step-select-method.js';
import StepTextEntry from '../components/corpusimport/step-text-entry.js';
import StepFileUpload from '../components/corpusimport/step-file-upload.js';
import StepMapColumns from '../components/docitemimport/step-map-columns.js';
import StepPreview from '../components/docitemimport/step-preview.js';
import StepConfirm from '../components/docitemimport/step-confirm.js';
import StepReview from '../components/corpusimport/step-review.js';
import StepResults from '../components/corpusimport/step-results.js';

/**
 * Modal for importing content to the corpus
 * Implements a multi-step wizard with branching paths based on import method and file type
 */
export class CorpusContentImportModal {

    // Static instance tracking for
    static _instance = null;

    /**
     * Create a new import modal
     * @param {Object} options - Configuration options
     * @param {Object} options.store - Application store
     * @param {string} options.currentPath - Current corpus path
     */
    constructor(options = {}) {
        // Check for existing instance
        if (CorpusContentImportModal._instance) {
            console.log("Found existing CorpusContentImportModal instance, cleaning up");
            CorpusContentImportModal._instance._cleanupModal();
        }
        
        // Store this instance
        CorpusContentImportModal._instance = this;

        this.store = options.store || {};
        this.currentPath = options.currentPath || '';
        this.corpusConfig = options.corpusConfig || {};

        // Extract corpus from path (first segment)
        const pathSegments = this.currentPath.split('/');
        this.corpus = pathSegments[0] || 'rfp';

        // Parse current path into domain, unit, topic components
        const pathComponents = corpusUtils.extractComponentsFromPath(this.currentPath, this.corpusConfig);
        this.currentDomain = pathComponents.domain || '';
        this.currentUnit = pathComponents.unit || '';
        this.currentTopic = pathComponents.topic || '';

        console.log(`CorpusContentImportModal initialized with path: ${this.currentPath}`);
        console.log(`Parsed components - Corpus: ${this.corpus}, Domain: ${this.currentDomain}, Unit: ${this.currentUnit}, Topic: ${this.currentTopic}`);

        // Add a flag to prevent recursive calls
        this._updatingNextButton = false;
        this._processingStepComplete = false;

        // Modal elements
        this.overlayEl = null;
        this.modalEl = null;
        this.contentEl = null;
        this.footerEl = null;
        this.backButton = null;
        this.nextButton = null;
        this.cancelButton = null;
        this.closeButton = null;

        // Initialize message modal
        this.messageModal = new MessageModal();
        this.errorModal = new ErrorModal();

        // Initialize modals
        this._initModalServices();

        // Step management
        this.currentStep = 1;
        this.totalSteps = 4; // Will be adjusted based on path
        this.steps = {};
        this.stepSequence = [];
        this.activeStepComponent = null;

        // Import path and branching state
        this.importMethod = null; // 'text', 'file', or 'ai'
        this.fileType = null; // 'excel', 'pdf', 'text', 'html'
        this.isExcelImport = false;

        // Data shared between steps
        this.wizardData = {
            content: null,
            metadata: null, // Excel worksheets / preview
            docMetadata: null, // form data (name, topic, …)
            fileData: null,
            mappingConfig: null,
            previewInfo: null,
            importResults: null
        };

        // Modal services
        this.messageModal = null;
        this.errorModal = null;
        this.yesNoModal = null;

        this._initModal();
    }

    _cleanupModal() {
        // Remove DOM elements
        if (this.overlayEl && this.overlayEl.parentNode) {
            this.overlayEl.parentNode.removeChild(this.overlayEl);
        }
        
        if (this.modalEl && this.modalEl.parentNode) {
            this.modalEl.parentNode.removeChild(this.modalEl);
        }
        
        // Clean up event listeners
        if (this.steps.fileUpload && typeof this.steps.fileUpload.cleanup === 'function') {
            this.steps.fileUpload.cleanup();
        }
        
        // Clear wizard reference
        if (window.currentImportWizard === this) {
            window.currentImportWizard = null;
        }
    }

    /**
     * Initialize modal elements
     */
    _initModal() {
        // Create overlay
        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'overlay';
        this.overlayEl.style.display = 'none';

        // Create modal container with flexbox layout
        this.modalEl = document.createElement('div');
        this.modalEl.className = 'modal modal--form modal--import-wizard';
        this.modalEl.style.display = 'none';

        // Create modal header
        const headerEl = document.createElement('div');
        headerEl.className = 'modal-header';

        const titleEl = document.createElement('h2');
        titleEl.textContent = 'Import Content to Corpus';
        headerEl.appendChild(titleEl);

        this.closeButton = document.createElement('button');
        this.closeButton.className = 'modal__close';
        this.closeButton.innerHTML = '&times;';
        this.closeButton.setAttribute('aria-label', 'Close modal');
        this.closeButton.addEventListener('click', (e) => {
            console.log('Close button clicked (X)');
            e.preventDefault();
            this._forceCloseModal(); // Use the direct close method
        });

        headerEl.appendChild(this.closeButton);
        this.modalEl.appendChild(headerEl);

        // Create step indicator (will be populated during show)
        const stepIndicator = document.createElement('div');
        stepIndicator.className = 'step-indicator';
        this.stepIndicator = stepIndicator;
        this.modalEl.appendChild(stepIndicator);

        // Create content area
        this.contentEl = document.createElement('div');
        this.contentEl.className = 'modal-content import-wizard-content';
        this.modalEl.appendChild(this.contentEl);

        // Create footer with buttons
        this.footerEl = document.createElement('div');
        this.footerEl.className = 'modal-footer';

        // Create cancel button
        this.cancelButton = document.createElement('button');
        this.cancelButton.className = 'btn btn-cancel';
        this.cancelButton.textContent = 'Cancel';
        this.cancelButton.addEventListener('click', () => this._handleCancel());
        this.footerEl.appendChild(this.cancelButton);

        // Create button group for back/next
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'button-group';

        this.backButton = document.createElement('button');
        this.backButton.className = 'btn btn-back';
        this.backButton.textContent = '< Back';
        this.backButton.addEventListener('click', () => this._goToPreviousStep());
        this.backButton.disabled = true; // Disabled on first step
        buttonGroup.appendChild(this.backButton);

        this.nextButton = document.createElement('button');
        this.nextButton.className = 'btn btn--primary';
        this.nextButton.textContent = 'Next >';
        this.nextButton.addEventListener('click', () => this._goToNextStep());

        // Set initial disabled state
        this.nextButton.disabled = true;

        buttonGroup.appendChild(this.nextButton);

        // Add event listener for enabling Next button
        this.contentEl.addEventListener('import-wizard:enable-next', (e) => {
            this.nextButton.disabled = !e.detail.enabled;
        });

        this.footerEl.appendChild(buttonGroup);
        this.modalEl.appendChild(this.footerEl);

        // Append modal elements to body
        document.body.appendChild(this.overlayEl);
        document.body.appendChild(this.modalEl);

        // Initialize modal services
        this._initModalServices();

        // Initialize step components
        this._initSteps();
    }

    /**
     * Initialize modal service references
     */
    _initModalServices() {
        try {
            // Get references to global modal services
            if (window.MessageModal) {
                this.messageModal = new window.MessageModal();
                console.log('MessageModal service initialized');
            } else {
                console.warn('MessageModal not available in window scope');
            }

            if (window.ErrorModal) {
                this.errorModal = new window.ErrorModal();
                console.log('ErrorModal service initialized');
            } else {
                console.warn('ErrorModal not available in window scope');
            }

            if (window.YesNoModal) {
                this.yesNoModal = new window.YesNoModal();
                console.log('YesNoModal service initialized');
            } else {
                console.warn('YesNoModal not available in window scope');
            }
        } catch (error) {
            console.error('Error initializing modal services:', error);
        }
    }

    /**
     * Initialize step components
     */
    _initSteps() {
        // Initialize base steps (common to all paths)
        this.steps = {
            selectMethod: new StepSelectMethod({
                onNext: (data) => this._handleMethodSelected(data),
                onError: (message) => this._showError(message),
                messageModal: this.messageModal
            }),
            textEntry: new StepTextEntry({
                onNext: (data) => this._handleStepComplete('textEntry', data),
                onError: (message) => this._showError(message),
                currentDomain: this.currentDomain,
                currentUnit: this.currentUnit,
                currentTopic: this.currentTopic,
                corpus: this.corpus,
                corpusConfig: this.corpusConfig,
                messageModal: this.messageModal
            }),
            fileUpload: new StepFileUpload({
                onNext: (data) => this._handleStepComplete('fileUpload', data),
                onError: (message) => this._showError(message),
                currentDomain: this.currentDomain,
                currentUnit: this.currentUnit,
                currentTopic: this.currentTopic,
                corpus: this.corpus,
                corpusConfig: this.corpusConfig,
                onUploadProgress: (percent) => this._handleUploadProgress(percent),
                messageModal: this.messageModal
            }),
            mapColumns: new StepMapColumns({
                onNext: (data) => this._handleStepComplete('mapColumns', data),
                onError: (message) => this._showError(message),
                parentModal: 'corpus'
            }),
            preview: new StepPreview({
                onNext: (data) => this._handleStepComplete('preview', data),
                onError: (message) => this._showError(message)
            }),
            confirm: new StepConfirm({
                onNext: (data) => this._handleStepComplete('confirm', data),
                onError: (message) => this._showError(message),
                showYesNoModal: (params) => this._showYesNoModal(params)
            }),
            review: new StepReview({
                onNext: (data) => this._handleStepComplete('review', data),
                onError: (message) => this._showError(message),
                currentDomain: this.currentDomain,
                currentUnit: this.currentUnit,
                currentTopic: this.currentTopic
            }),
            results: new StepResults({
                onComplete: (data) => this._handleComplete(data),
                onError: (message) => this._showError(message)
            })
        };

        // Current step sequence (will be updated based on path)
        this.stepSequence = ['selectMethod', 'textEntry', 'review', 'results'];
    }

    /**
     * Handle completion of the wizard
     * @param {Object} data - Completion data
     */
    _handleComplete(data) {
        console.log('Import wizard completed with data:', data);

        if (data && data.resetWizard) {
            // Reset and restart the wizard
            this.reset();
            this._goToStep(1);
        } else {
            // Close the modal
            this.hide();
        }
    }

    /**
     * Reset the wizard state
     */
    reset() {
        this.currentStep = 1;
        this.importMethod = null;
        this.fileType = null;
        this.isExcelImport = false;
        this.stepSequence = ['selectMethod', 'textEntry', 'review', 'results'];

        // Clear wizard data
        this.wizardData = {
            content: null,
            metadata: null, // Excel worksheets / preview
            docMetadata: null, // form data (name, topic, …)
            fileData: null,
            mappingConfig: null,
            previewInfo: null,
            importResults: null
        };

        // Reset each step component if it has a reset method
        Object.values(this.steps).forEach(step => {
            if (typeof step.reset === 'function') {
                step.reset();
            }
        });

        // Update step indicator
        this._updateStepIndicator();
    }

    /**
     * Update step indicator based on current path and step
     */
    _updateStepIndicator() {
        if (!this.stepIndicator) return;

        this.stepIndicator.innerHTML = '';

        // Get steps for current path
        const stepNames = this._getStepNames();

        // Create step indicators
        stepNames.forEach((name, index) => {
            const step = document.createElement('div');
            step.className = `step ${index + 1 === this.currentStep ? 'active' : ''}`;
            if (index + 1 < this.currentStep) {
                step.classList.add('status--completed');
            }
            step.dataset.step = index + 1;

            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = index + 1;
            step.appendChild(stepNumber);

            const stepName = document.createElement('div');
            stepName.className = 'step-name';
            stepName.textContent = name;
            step.appendChild(stepName);

            this.stepIndicator.appendChild(step);

            // Add connector between steps (except after last step)
            if (index < stepNames.length - 1) {
                const connector = document.createElement('div');
                connector.className = 'step-connector';
                this.stepIndicator.appendChild(connector);
            }
        });
    }

    /**
     * Get step names based on current import path
     * @returns {Array} Array of step names
     */
    _getStepNames() {
        if (this.isExcelImport) {
            return ['Choose Method', 'Upload File', 'Map Columns', 'Preview', 'Confirm', 'Results'];
        } else if (this.importMethod === 'text') {
            return ['Choose Method', 'Enter Text', 'Review', 'Results'];
        } else if (this.importMethod === 'file') {
            return ['Choose Method', 'Upload File', 'Review', 'Results'];
        } else {
            return ['Choose Method', 'Add Content', 'Review', 'Results'];
        }
    }

    /**
     * Show the modal
     * @param {Function} [onClose] - Optional callback when modal is closed
     */
    async show(onClose) {
        try {
            this.onClose = onClose;

            // Reset state
            this.reset();

            // Make the instance accessible to the step components - KEY ADDITION
            window.currentImportWizard = this;

            // Show modal
            this.overlayEl.style.display = 'block';
            this.modalEl.style.display = 'flex';

            // Update step indicator
            this._updateStepIndicator();

            // Go to first step
            this._goToStep(1);

            console.log('CorpusContentImportModal opened');
        } catch (err) {
            console.error('[CorpusContentImportModal] fatal:', err);
            throw err;
        }
    }

    /**
     * Hide the modal
     */
    hide() {
        // Cleanup any global event listeners
        if (this.steps.fileUpload && typeof this.steps.fileUpload.cleanup === 'function') {
            this.steps.fileUpload.cleanup();
        }
    
        // First hide elements (for smooth visual transition)
        this.overlayEl.style.display = 'none';
        this.modalEl.style.display = 'none';
    
        // Then actually remove them from DOM (after a short delay)
        setTimeout(() => {
            this._cleanupModal();
        }, 100);
    
        // Call onClose callback if provided
        if (typeof this.onClose === 'function') {
            this.onClose(this.wizardData.importResults);
        }
    
        console.log('CorpusContentImportModal closed and removed from DOM');
    }

    /**
     * Update the Next button state based on current step's canProceed method
     */
    _updateNextButtonState() {
        if (!this.nextButton || !this.activeStepComponent) return;
        
        // Prevent multiple concurrent updates
        if (this._updatingNextButton) {
            return;
        }
        
        this._updatingNextButton = true;
        
        try {
            const canGo = (typeof this.activeStepComponent.canProceed === 'function')
                ? this.activeStepComponent.canProceed(false) // Don't show errors during state checks
                : true;
            this.nextButton.disabled = !canGo;
        } catch (error) {
            console.error('Error updating next button state:', error);
            // In case of error, ensure button is enabled
            this.nextButton.disabled = false;
        } finally {
            this._updatingNextButton = false;
        }
    }

    /**
     * Handle method selection and update path
     * @param {Object} data - Method selection data
     */
    _handleMethodSelected(data) {
        this.importMethod = data.method;
        console.log(`Import method selected: ${this.importMethod}`);

        // Update step sequence based on selected method
        if (this.importMethod === 'text') {
            this.stepSequence = ['selectMethod', 'textEntry', 'review', 'results'];
            this.totalSteps = 4;
        } else if (this.importMethod === 'file') {
            this.stepSequence = ['selectMethod', 'fileUpload', 'review', 'results'];
            this.totalSteps = 4;
        } else {
            this._showError('Unknown import method selected.');
            return;
        }

        // Update step indicator
        this._updateStepIndicator();

        // Go directly to the next step (step 2) rather than using _goToNextStep
        // This is critical to ensure we go to the right step
        this._goToStep(2);
    }

    /**
     * Handle file selection and determine if Excel processing is needed
     * @param {Object} data - File data
     */
    _handleFileSelected(file) {
        console.log('File selected:', file.name, file.size, file.type);

        // Reset properties to prevent stack overflow
        this.selectedFile = null;
        this.s3Info = null;
        this.isUploading = false;
        this.uploadProgress = 0;

        // Validate file type
        const validTypes = [
            'application/pdf',
            'text/plain',
            'text/markdown',
            'text/html',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        const fileExt = file.name.split('.').pop().toLowerCase();
        const validExts = ['pdf', 'txt', 'md', 'html', 'csv', 'xls', 'xlsx'];

        if (!validTypes.includes(file.type) && !validExts.includes(fileExt)) {
            this._showError(`Unsupported file type: ${file.type || fileExt}. Please upload PDF, TXT, MD, HTML, CSV, or Excel files.`);
            return;
        }

        // Store the selected file
        this.selectedFile = file;

        // Update UI to show selected file
        this.dragDropArea.style.display = 'none';
        this.selectedFileInfoEl.style.display = 'block';
        this.selectedFileInfoEl.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="${this._getFileIcon(file.name)}"></i>
                </div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this._formatFileSize(file.size)}</div>
                </div>
                <button class="change-file-btn" title="Choose a different file">
                    <i class="fas fa-sync-alt"></i> Change
                </button>
            </div>
            <div class="file-instructions">
                File selected successfully. Please complete the document information below.
            </div>
        `;

        // Setup change file button
        const changeFileBtn = this.selectedFileInfoEl.querySelector('.change-file-btn');
        changeFileBtn.addEventListener('click', () => {
            this.selectedFile = null;
            this.dragDropArea.style.display = 'flex';
            this.selectedFileInfoEl.style.display = 'none';
            this.fileInputEl.value = ''; // Clear file input
            this.s3Info = null;
            this.isUploading = false;
        });

        // Pre-fill document name from filename
        const fileName = file.name;
        const nameWithoutExtension = fileName.substring(0, fileName.lastIndexOf('.'));
        const sanitizedName = nameWithoutExtension
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]/g, '');

        // Update document form with file info
        this.documentForm.updateData({
            documentName: sanitizedName
        });

        // Set file extension for preview
        this.documentForm.setFileExtension(fileExt);

        this.fileType = this._getFileType(data.file);

        if (this._isExcelFile(this.fileType)) {
            console.log('Excel file detected, setting up Excel processing path');
            this.isExcelImport = true;
            this.stepSequence = ['selectMethod', 'fileUpload', 'mapColumns', 'preview', 'confirm', 'results'];
            this.totalSteps = 6;
        } else {
            console.log(`Non-Excel file detected (${this.fileType}), setting up standard file path`);
            this.isExcelImport = false;
            this.stepSequence = ['selectMethod', 'fileUpload', 'review', 'results'];
            this.totalSteps = 4;
        }

        // Start uploading the file to get S3 metadata
        setTimeout(() => {
            this._startFileUpload();
        }, 100);
    }

    async _startFileUpload() {
        if (!this.selectedFile) {
            return { success: false, error: 'No file selected' };
        }

        try {
            this.isUploading = true;
            this.uploadProgress = 0;

            // Show upload progress
            this._updateUploadProgress(0);
            this.selectedFileInfoEl.style.display = 'none';
            this.progressBarEl.style.display = 'block';

            // Generate presigned URL
            console.log('Generating presigned URL for file upload');
            const presignedResp = await corpusImportService.generatePresignedUrl({
                corpus_id: this.corpus,
                filename: this.selectedFile.name,
                content_type: this.selectedFile.type || this._getMimeType(this.selectedFile.name)
            });

            // Upload file to S3
            console.log('Uploading file to S3');
            const uploadSuccess = await corpusImportService.uploadFileToPresignedUrl(
                presignedResp.presigned_url,
                this.selectedFile,
                this.selectedFile.type || this._getMimeType(this.selectedFile.name)
            );

            if (!uploadSuccess) {
                throw new Error('Failed to upload file to S3');
            }

            this.s3Info = {
                bucket: presignedResp.bucket,
                s3_key: presignedResp.s3_key
            };

            // For Excel files, fetch worksheet metadata
            let fileMetadata = { worksheets: [] };
            const isExcel = this._isExcelFile(this.selectedFile.name);

            if (isExcel) {
                console.log('Fetching Excel metadata');
                try {
                    fileMetadata = await corpusImportService.parseFileMetadata({
                        bucket: presignedResp.bucket,
                        key: presignedResp.s3_key,
                        preview_rows: 15,  // Explicitly set these values
                        preview_cols: 15
                    });

                    // Ensure metadata has required structure for StepMapColumns
                    if (!fileMetadata.worksheets) fileMetadata.worksheets = [];
                    if (!fileMetadata.preview) fileMetadata.preview = {};

                    console.log('Excel metadata received:', {
                        worksheets: fileMetadata.worksheets.length,
                        hasPreview: Object.keys(fileMetadata.preview).length > 0
                    });
                } catch (metadataError) {
                    console.error('Error fetching Excel metadata:', metadataError);
                    // Continue with empty metadata, don't fail the whole upload
                    fileMetadata = {
                        worksheets: [],
                        preview: {}
                    };
                }
            }

            // Update progress to 100%
            this._updateUploadProgress(100);

            // Hide progress, show file info
            setTimeout(() => {
                this.isUploading = false;
                this.progressBarEl.style.display = 'none';
                this.selectedFileInfoEl.style.display = 'block';
            }, 500);

            // Store metadata for next steps
            this.fileMetadata = fileMetadata;

            return {
                success: true,
                s3Info: this.s3Info,
                fileMetadata
            };
        } catch (error) {
            console.error('Error uploading file:', error);
            this.isUploading = false;
            this.progressBarEl.style.display = 'none';
            this.selectedFileInfoEl.style.display = 'block';

            // Show error message
            this.errorModal.show({
                title: "Upload Failed",
                message: `Failed to upload file: ${error.message}`
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle upload progress updates
     * @param {number} percent - Upload progress percentage
     */
    _handleUploadProgress(percent) {
        // Update UI to show upload progress
        if (this.steps.fileUpload) {
            this.steps.fileUpload.updateUploadProgress(percent);
        }
    }

    /**
     * Handle step completion and data passing
     * @param {string} stepId - ID of completed step
     * @param {Object} data - Data from the completed step
     */
    _handleStepComplete(stepId, data) {
        // Break recursive call pattern
        if (this._processingStepComplete) {
            console.warn(`Already processing step completion for ${stepId}, ignoring recursive call`);
            return;
        }

        // Set flag to prevent recursive calls
        this._processingStepComplete = true;

        try {

            // Add a guard against empty data to prevent infinite recursion
            if (!data || Object.keys(data).length === 0) {
                console.warn(`Received empty data for step ${stepId}, ignoring`);
                this._processingStepComplete = false;
                return;
            }

            console.log(`Step ${stepId} completed with data:`, data);

            // Store data based on step
            switch (stepId) {
                case 'textEntry':
                    this.wizardData.content = data.content;
                    this.wizardData.metadata = data.metadata;
                    this.wizardData.format = data.format;
                    break;

                case 'fileUpload':
                    this.wizardData.fileData = data.file;

                    /* 1. Excel worksheet/preview metadata → wizardData.metadata
                    * 2. Document‑info metadata           → wizardData.docMetadata */
                    if (data.metadata && data.metadata.worksheets) {
                        this.wizardData.metadata = data.metadata;       // Excel
                    } else if (this.fileMetadata && this.fileMetadata.worksheets) {
                        this.wizardData.metadata = this.fileMetadata;   // fallback
                    } else {
                        this.wizardData.metadata = {};
                    }

                    console.log('DEBUG: Storing docMetadata from fileUpload step:', data.docMetadata);
                    this.wizardData.docMetadata = data.docMetadata || {};

                    this.wizardData.s3Info = data.s3Info;

                    // If metadata isn't available in the step data but we have it stored, use that
                    if (!data.metadata && this.fileMetadata) {
                        data.metadata = this.fileMetadata;
                        console.log('Using stored fileMetadata:', {
                            worksheets: this.fileMetadata.worksheets?.length || 0,
                            hasPreview: Object.keys(this.fileMetadata.preview || {}).length > 0
                        });
                    }

                    // Move file type detection logic here
                    this.fileType = this._getFileType(data.file);

                    // Update Excel path based on file type
                    if (this._isExcelFile(this.fileType)) {
                        console.log('Excel file detected, setting up Excel processing path');
                        this.isExcelImport = true;
                        this.stepSequence = ['selectMethod', 'fileUpload', 'mapColumns', 'preview', 'confirm', 'results'];
                        this.totalSteps = 6;
                    } else {
                        console.log(`Non-Excel file detected (${this.fileType}), setting up standard file path`);
                        this.isExcelImport = false;
                        this.stepSequence = ['selectMethod', 'fileUpload', 'review', 'results'];
                        this.totalSteps = 4;
                    }

                    // Update step indicator
                    this._updateStepIndicator();
                    break;

                case 'mapColumns':
                    this.wizardData.mappingConfig = data;

                    // Update preview step with mapping config
                    if (this.steps.preview) {
                        this.steps.preview.fileData = this.wizardData.fileData;
                        this.steps.preview.metadata = this.wizardData.metadata;
                        this.steps.preview.mappingConfig = data.mappingConfig;
                    }
                    break;

                case 'preview':
                    this.wizardData.previewInfo = data;

                    // Update confirm step with preview info
                    if (this.steps.confirm) {
                        this.steps.confirm.previewInfo = data;
                    }
                    break;

                case 'confirm':
                    // For Excel imports, start the conversion process immediately
                    if (this.isExcelImport) {
                        console.log('Starting Excel-to-CSV conversion process');
                        
                        // Store import mode from confirm step
                        this.wizardData.importMode = data.importMode || 'draft';
                        
                        // Move to Results step with "importing" state
                        if (this.steps.results) {
                            this.steps.results.setImportingState(true);
                            this._goToStep(this.totalSteps); // Go directly to results step
                            
                            // Build path using utility function from corpus-utils.js
                            const path = corpusUtils.buildCorpusPath({
                                corpus: this.corpus,
                                domain: this.wizardData.docMetadata?.domain,
                                unit: this.wizardData.docMetadata?.unit,
                                topic: this.wizardData.docMetadata?.documentTopic
                            });
                            
                            // Process Excel conversion asynchronously
                            this._handleExcelImport({
                                importMode: this.wizardData.importMode,
                                path: path
                            }).then(result => {
                                // When complete, update results
                                this.wizardData.importResults = result;
                                if (this.steps.results) {
                                    this.steps.results.importResults = result;
                                    this.steps.results.setImportingState(false);
                                    this.steps.results.render(this.contentEl);
                                    
                                    // Update button states for results
                                    this._updateButtonStatesForResults(true);
                                }
                            }).catch(error => {
                                // Handle errors
                                console.error('Excel conversion failed:', error);
                                if (this.steps.results) {
                                    this.steps.results.setImportingState(false);
                                    this.steps.results.importResults = {
                                        success: false,
                                        error: error.message
                                    };
                                    this.steps.results.render(this.contentEl);
                                    
                                    // Update button states for results
                                    this._updateButtonStatesForResults(false);
                                }
                            });
                        }
                        return; // Skip to results, don't proceed to review
                    }
                    break;

                case 'review':
                    // Store import mode and options
                    this.wizardData.importMode = data.importMode;
                    this.wizardData.path = data.path;
                    this.wizardData.filename = data.filename;

                    // Start the import process
                    this._startImport(data);
                    this._processingStepComplete = false;
                    return; // Don't go to next step until import completes
            }

            // Go to next step in the sequence (excluding special case for review step)
            if (stepId !== 'review') {
                // Instead of _goToNextStep which calls proceed(), go to next step directly
                this._goToStep(this.currentStep + 1);
            }
        } finally {
            // Always clear the flag when done
            this._processingStepComplete = false;
        }
    }

    /**
     * Start the import process
     * @param {Object} data - Import data
     */
    async _startImport(data) {
        console.log('Starting import process with mode:', data.importMode);

        try {
            // Update the results step to show importing state
            if (this.steps.results) {
                this.steps.results.setImportingState(true);
                this._goToStep(this.totalSteps); // Go to results step with "importing" state
            }

            let result;

            // Choose the right import strategy based on available data
            if (this.importMethod === 'text' && this.wizardData.content) {
                // Text entry import process
                result = await this._handleTextImport(data);
            } else if (this.importMethod === 'file' && this.wizardData.fileData && this.wizardData.s3Info) {
                // Standard file import process
                result = await this._handleFileImport(data);
            } else if (this.isExcelImport && this.wizardData.fileData && this.wizardData.s3Info) {
                // Excel import process
                result = await this._handleExcelImport(data);
            } else {
                // Better error message based on what's missing
                let errorMsg = 'Invalid import data.';
                if (this.importMethod === 'text' && !this.wizardData.content) {
                    errorMsg = 'No content provided for text import.';
                } else if ((this.importMethod === 'file' || this.isExcelImport) &&
                    (!this.wizardData.fileData || !this.wizardData.s3Info)) {
                    errorMsg = 'File data or S3 information is missing.';
                }
                throw new Error(errorMsg);
            }

            // Store import results
            this.wizardData.importResults = result;

            // Update the results component with the data
            if (this.steps.results) {
                this.steps.results.importResults = result;
                this.steps.results.fileData = this.wizardData.fileData;
                this.steps.results.content = this.wizardData.content;
                this.steps.results.metadata = this.wizardData.metadata;
                this.steps.results.importMode = this.wizardData.importMode;
                this.steps.results.setImportingState(false);
                this.steps.results.render(this.contentEl); // Re-render with completed state
            }

            console.log('Import completed successfully:', result);
        } catch (error) {
            console.error('Import failed:', error);

            // Show error in results step
            if (this.steps.results) {
                this.steps.results.setImportingState(false);
                this.steps.results.importResults = {
                    success: false,
                    error: error.message || 'An unknown error occurred during import'
                };
                this.steps.results.render(this.contentEl);
            }
        }
    }

    /**
     * Handle Excel import process
     * @param {Object} data - Import data
     * @returns {Promise<Object>} Import result
     */
    async _handleExcelImport(data) {
        console.log('Processing Excel import with data:', data);

        try {
            // For Excel files, we need to convert to CSV
            if (!this.wizardData.fileData || !this.wizardData.s3Info) {
                throw new Error('File data or S3 information is missing');
            }

            // Show progress in UI - replaced with safe method
            this._updateImportProgress(20);

            console.log('Calling convertExcelToCorpusCSV with params:', {
                source_bucket: this.wizardData.s3Info.bucket,
                source_key: this.wizardData.s3Info.s3_key,
                mapping_config: this.wizardData.mappingConfig,
                destination_path: data.path || '',
                metadata: {
                    ...this.wizardData.docMetadata,
                    corpus: this.corpus
                }
            });

            // IMPORTANT: Use snake_case parameter names to match the Lambda expectations
            const excelResult = await corpusImportService.convertExcelToCorpusCSV({
                source_bucket: this.wizardData.s3Info.bucket,
                source_key: this.wizardData.s3Info.s3_key,
                mapping_config: this.wizardData.mappingConfig,
                destination_path: data.path || '',
                metadata: {
                    ...this.wizardData.docMetadata,
                    corpus: this.corpus
                }
            });

            console.log('Excel conversion successful:', excelResult);

            // Update progress
            this._updateImportProgress(70);

            // If the user selected submit, submit each worksheet document for approval
            if (data.importMode === 'submit') {
                console.log('Submitting worksheets for approval');
                // Sequentially submit each worksheet to avoid overwhelming the system
                for (const worksheet of excelResult.worksheets) {
                    await corpusImportService.submitCorpusDocumentForApproval({
                        documentKey: worksheet.documentKey,
                        versionId: worksheet.versionId
                    });
                }
            }

            // Final progress update
            this._updateImportProgress(100);

            return {
                success: true,
                worksheets: excelResult.worksheets,
                importMode: data.importMode,
                path: data.path
            };
        } catch (error) {
            console.error('Excel import failed:', error);
            throw error;
        }
    }

    /**
     * Handle text import process
     * @param {Object} data - Import data
     * @returns {Promise<Object>} Import result
     */
    async _handleTextImport(data) {
        console.log('Processing text import');

        try {
            // For text entry, we directly save to the corpus
            if (!this.wizardData.content) {
                throw new Error('No content to import');
            }

            // Determine file extension based on format
            let extension = 'txt';
            if (this.wizardData.format === 'markdown') {
                extension = 'md';
            } else if (this.wizardData.format === 'html') {
                extension = 'html';
            }

            // First save as draft
            const draftResult = await corpusImportService.saveCorpusDocumentDraft({
                content: this.wizardData.content,
                metadata: {
                    ...this.wizardData.metadata,
                    extension: extension,
                    path: data.path || ''
                }
            });

            // If the user selected submit, submit the document for approval
            if (data.importMode === 'submit') {
                await corpusImportService.submitCorpusDocumentForApproval({
                    documentKey: draftResult.documentKey,
                    versionId: draftResult.versionId
                });
            }

            return {
                success: true,
                documentKey: draftResult.documentKey,
                versionId: draftResult.versionId,
                filename: data.filename || `${this.wizardData.metadata.documentType}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${this.wizardData.metadata.documentName}.${extension}`,
                importMode: data.importMode,
                path: data.path
            };
        } catch (error) {
            console.error('Text import failed:', error);
            throw error;
        }
    }

    /**
     * Build the metadata object expected by move_file_to_corpus
     */
    _buildCorpusMetadata() {
        // `docMetadata` is collected in StepFileUpload / StepReview
        const md = this.wizardData.docMetadata || {};

        return {
            corpus: this.corpus,                 //   <-- NEW, always present
            documentTopic: md.documentTopic,            //   <-- NEW, mandatory
            documentType: md.documentType,             //   <-- NEW, mandatory
            /* optional but useful                     */
            documentName: md.documentName,
            domain: md.domain,
            unit: md.unit
        };
    }

    /**
     * Handle file import process
     * @param {Object} data - Import data
     * @returns {Promise<Object>} Import result
     */
    async _handleFileImport(data) {
        console.log('Processing file import');

        try {
            // For files, we need to move from temporary storage to corpus
            if (!this.wizardData.fileData || !this.wizardData.s3Info) {
                throw new Error('File data or S3 information is missing');
            }

            // Call the move file endpoint with snake_case parameters to match what the Lambda expects
            const moveResult = await corpusImportService.moveFileToCorpus({
                source_bucket: this.wizardData.s3Info.bucket,
                source_key: this.wizardData.s3Info.s3_key,
                destination_path: data.path || '',
                metadata: this._buildCorpusMetadata()
            });

            // If the user selected submit, submit the document for approval
            if (data.importMode === 'submit') {
                await corpusImportService.submitCorpusDocumentForApproval({
                    documentKey: moveResult.documentKey,
                    versionId: moveResult.versionId
                });
            }

            return {
                success: true,
                documentKey: moveResult.documentKey,
                versionId: moveResult.versionId,
                filename: data.filename || this.wizardData.fileData.name,
                importMode: data.importMode,
                path: data.path
            };
        } catch (error) {
            console.error('File import failed:', error);
            throw error;
        }
    }

    /**
     * Go to a specific step number
     * @param {number} stepNumber - Step number to go to
     */
    async _goToStep(stepNumber) {
        // Validate step number
        if (stepNumber < 1 || stepNumber > this.totalSteps) {
            console.warn(`Invalid step number: ${stepNumber}, current total steps: ${this.totalSteps}`);
            return;
        }
    
        // Update current step
        this.currentStep = stepNumber;
        console.log(`Going to step ${stepNumber}: ${this.stepSequence[stepNumber - 1]}`);
    
        // Update step indicator
        this._updateStepIndicator();
    
        // Update button states
        this.backButton.disabled = this.currentStep === 1;
    
        // Update next button text based on step position
        if (this.currentStep === this.totalSteps) {
            this.nextButton.textContent = 'Finish';
        } else {
            // Determine if we're on a special step that needs a custom button label
            const stepId = this.stepSequence[this.currentStep - 1];
            if (stepId === 'confirm' && this.isExcelImport) {
                this.nextButton.textContent = 'Start Import';
            } else {
                this.nextButton.textContent = 'Next >';
            }
        }
    
        // Get current step component
        const stepId = this.stepSequence[this.currentStep - 1];
        this.activeStepComponent = this.steps[stepId];
    
        if (!this.activeStepComponent) {
            console.error(`Step component not found for ID: ${stepId}`);
            return;
        }
    
        // Update step component with data from previous steps
        this._updateStepWithData();
    
        // Render the step
        this.contentEl.innerHTML = '';
        try {
            // Render the active step
            await this.activeStepComponent.render(this.contentEl);
            
            // After rendering, explicitly update button state
            setTimeout(() => {
                this._updateNextButtonState();
            }, 0);
        } catch (err) {
            console.error(`Error rendering step ${stepId}:`, err);
            throw err;
        }
    }

    /**
     * Update current step component with data from previous steps
     */
    _updateStepWithData() {
        if (!this.activeStepComponent) return;

        const stepId = this.stepSequence[this.currentStep - 1];

        // Add debug logging to check data being passed to steps
        console.log(`Updating step ${stepId} with data:`, {
            wizardData: this.wizardData,
            fileData: this.wizardData.fileData ? 'present' : 'missing',
            metadata: this.wizardData.metadata ? 'present' : 'missing',
            mappingConfig: this.wizardData.mappingConfig ? 'present' : 'missing',
            previewInfo: this.wizardData.previewInfo ? 'present' : 'missing'
        });

        switch (stepId) {
            case 'textEntry':
                // Pass current path components to text entry step
                this.activeStepComponent.currentDomain = this.currentDomain;
                this.activeStepComponent.currentUnit = this.currentUnit;
                this.activeStepComponent.currentTopic = this.currentTopic;
                break;

            case 'fileUpload':
                // Pass current path components to file upload step
                this.activeStepComponent.currentDomain = this.currentDomain;
                this.activeStepComponent.currentUnit = this.currentUnit;
                this.activeStepComponent.currentTopic = this.currentTopic;
                break;

            case 'mapColumns':
                // Update Excel-related components with file data and metadata
                this.activeStepComponent.fileData = this.wizardData.fileData;

                /* if the shared component exposes updateMetadata() (added
                 * in the newer version of StepMapColumns) use it so the
                 * component re‑parses the worksheets & preview data and
                 * builds the grid.  Fallback to direct assignment for
                 * backward compatibility. */
                if (this.wizardData.metadata &&
                    typeof this.activeStepComponent.updateMetadata === 'function') {
                    this.activeStepComponent.updateMetadata(this.wizardData.metadata);
                } else {
                    this.activeStepComponent.metadata = this.wizardData.metadata;
                }
                break;

            case 'preview':
                // Update preview with mapping configuration
                this.activeStepComponent.fileData = this.wizardData.fileData;
                this.activeStepComponent.metadata = this.wizardData.metadata;
                this.activeStepComponent.mappingConfig = this.wizardData.mappingConfig;

                // IMPORTANT: Force regenerate preview data
                if (typeof this.activeStepComponent._generatePreviewData === 'function') {
                    this.activeStepComponent._generatePreviewData();
                }
                break;

            case 'confirm':
                // Update confirm step with all relevant data
                this.activeStepComponent.fileData = this.wizardData.fileData;
                this.activeStepComponent.metadata = this.wizardData.metadata;
                this.activeStepComponent.mappingConfig = this.wizardData.mappingConfig;
                this.activeStepComponent.previewInfo = this.wizardData.previewInfo;
                break;

            case 'review':
                // Update review step with all available data
                console.log('DEBUG: Updating review step with data:', {
                    hasContent: !!this.wizardData.content,
                    hasFileData: !!this.wizardData.fileData,
                    hasDocMetadata: !!this.wizardData.docMetadata,
                    docMetadata: this.wizardData.docMetadata
                });

                // Pass all available data
                this.activeStepComponent.content = this.wizardData.content;
                this.activeStepComponent.format = this.wizardData.format;
                this.activeStepComponent.fileData = this.wizardData.fileData;
                this.activeStepComponent.metadata = this.wizardData.metadata;

                // CRITICAL: Pass document metadata properly
                this.activeStepComponent.docMetadata = this.wizardData.docMetadata;

                // Additional context
                this.activeStepComponent.corpus = this.corpus;
                this.activeStepComponent.currentDomain = this.currentDomain;
                this.activeStepComponent.currentUnit = this.currentUnit;
                this.activeStepComponent.currentTopic = this.currentTopic;
                this.activeStepComponent.s3Info = this.wizardData.s3Info;
                break;

            case 'results':
                // Update results step with import results
                this.activeStepComponent.importResults = this.wizardData.importResults;
                this.activeStepComponent.fileData = this.wizardData.fileData;
                this.activeStepComponent.content = this.wizardData.content;
                this.activeStepComponent.metadata = this.wizardData.metadata;
                break;
        }
    }

    /**
     * Go to the next step
     */
    _goToNextStep() {
        if (this.currentStep === this.totalSteps) {
            // This is the Finish button action
            if (this.activeStepComponent && typeof this.activeStepComponent.onComplete === 'function') {
                try {
                    console.log('Calling onComplete handler on final step');
                    this.activeStepComponent.onComplete(this.wizardData.importResults);
                } catch (error) {
                    console.error('Error in onComplete handler:', error);
                    // Fall back to direct hide
                    this.hide();
                }
            } else {
                // Just hide the modal
                console.log('No onComplete handler, hiding modal');
                this.hide();
            }
            return;
        }

        // Check if current step can proceed
        if (this.activeStepComponent && typeof this.activeStepComponent.canProceed === 'function') {
            if (!this.activeStepComponent.canProceed(true)) {  // KEY CHANGE: Pass true to show errors
                return;
            }

            // If the step has a proceed method, call it
            if (typeof this.activeStepComponent.proceed === 'function') {
                this.activeStepComponent.proceed();
                return;
            }
        }

        // Go to the next step
        this._goToStep(this.currentStep + 1);
    }

    /**
     * Go to the previous step
     */
    _goToPreviousStep() {
        if (this.currentStep > 1) {
            this._goToStep(this.currentStep - 1);
        }
    }

    /**
     * Handle cancel button or close
     */
    _handleCancel() {
        console.log('Cancel/Close button clicked');

        // If there's unsaved data, show confirmation
        if (this._hasUnsavedData()) {
            // Try to get or create YesNoModal
            if (this.yesNoModal) {
                this.yesNoModal.show({
                    title: 'Cancel Import',
                    message: 'You have unsaved changes. Are you sure you want to cancel?',
                    onYes: () => {
                        console.log('User confirmed cancel with unsaved changes');
                        this._forceCloseModal(); // Use the direct close method
                    },
                    onNo: () => { }
                });
            } else if (window.YesNoModal) {
                // Create a new instance if we don't have one
                this.yesNoModal = new window.YesNoModal();
                this.yesNoModal.show({
                    title: 'Cancel Import',
                    message: 'You have unsaved changes. Are you sure you want to cancel?',
                    onYes: () => {
                        console.log('User confirmed cancel with new modal instance');
                        this._forceCloseModal(); // Use the direct close method
                    },
                    onNo: () => { }
                });
            } else if (this.messageModal) {
                // Fallback to MessageModal if YesNoModal isn't available
                this.messageModal.show({
                    title: 'Cancel Import',
                    message: 'You have unsaved changes. Are you sure you want to cancel?',
                    buttons: [
                        {
                            text: 'Yes, Cancel',
                            onClick: () => {
                                console.log('User confirmed cancel with message modal');
                                this._forceCloseModal(); // Use the direct close method
                            }
                        },
                        {
                            text: 'No, Continue',
                            onClick: () => { }
                        }
                    ]
                });
            } else {
                // Last resort - just force close without confirmation
                console.log('No modal available, force closing directly');
                this._forceCloseModal(); // Use the direct close method
            }
        } else {
            // No unsaved data, just force close
            console.log('No unsaved data, force closing directly');
            this._forceCloseModal(); // Use the direct close method
        }
    }

    /**
     * Forcefully close the modal by directly manipulating DOM
     * This provides a failsafe way to close the modal
     */
    _forceCloseModal() {
        console.log('Force closing modal');
    
        try {
            // Try normal closure first
            if (this.overlayEl) {
                this.overlayEl.style.display = 'none';
            }
    
            if (this.modalEl) {
                this.modalEl.style.display = 'none';
            }
    
            // Stop any ongoing processing
            if (this.processingBatches) {
                this.processingBatches = false;
            }
    
            // As a failsafe, find and hide all modals and overlays that match our classes
            const allOverlays = document.querySelectorAll('.overlay');
            allOverlays.forEach(overlay => {
                overlay.style.display = 'none';
            });
    
            // Fix the class selector here to match the actual classes used
            const allModals = document.querySelectorAll('.modal.modal--form.modal--import-wizard');
            allModals.forEach(modal => {
                modal.style.display = 'none';
            });
    
            // Call onClose callback if provided
            if (typeof this.onClose === 'function') {
                this.onClose(this.wizardData.importResults);
            }
    
            // Clean up reference
            if (window.currentImportWizard === this) {
                window.currentImportWizard = null;
            }
    
            // Clear static instance reference
            if (CorpusContentImportModal._instance === this) {
                CorpusContentImportModal._instance = null;
            }
    
            console.log('Modal successfully closed');
        } catch (error) {
            console.error('Error force closing modal:', error);
            alert('There was an error closing the import wizard. Please refresh the page.');
        }
    }

    /**
     * Check if there's unsaved data
     * @returns {boolean} - Whether there's unsaved data
     */
    _hasUnsavedData() {
        return !!(this.wizardData.content ||
            this.wizardData.fileData ||
            (this.wizardData.metadata && Object.keys(this.wizardData.metadata).length > 0));
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
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

    /**
     * Show success message
     * @param {string} message - Success message
     */
    _showSuccess(message) {
        console.log('Import Success:', message);

        if (this.messageModal) {
            this.messageModal.show({
                title: 'Import Success',
                message: message
            });
        } else if (window.MessageModal) {
            this.messageModal = new window.MessageModal();
            this.messageModal.show({
                title: 'Import Success',
                message: message
            });
        } else {
            alert('Success: ' + message);
        }
    }

    /**
     * Show yes/no confirmation modal
     * @param {Object} params - Modal parameters
     * @returns {Promise<boolean>} - Promise that resolves to true if confirmed
     */
    _showYesNoModal(params) {
        return new Promise((resolve) => {
            if (this.yesNoModal) {
                const onYesOriginal = params.onYes;
                const onNoOriginal = params.onNo;

                params.onYes = () => {
                    if (onYesOriginal) onYesOriginal();
                    resolve(true);
                };

                params.onNo = () => {
                    if (onNoOriginal) onNoOriginal();
                    resolve(false);
                };

                this.yesNoModal.show(params);
            } else if (window.YesNoModal) {
                this.yesNoModal = new window.YesNoModal();

                const onYesOriginal = params.onYes;
                const onNoOriginal = params.onNo;

                params.onYes = () => {
                    if (onYesOriginal) onYesOriginal();
                    resolve(true);
                };

                params.onNo = () => {
                    if (onNoOriginal) onNoOriginal();
                    resolve(false);
                };

                this.yesNoModal.show(params);
            } else {
                // Fallback to confirm
                const confirmed = confirm(params.message);
                if (confirmed && params.onYes) {
                    params.onYes();
                } else if (!confirmed && params.onNo) {
                    params.onNo();
                }
                resolve(confirmed);
            }
        });
    }

    /**
     * Update button states for Results step
     * @param {boolean} hasSuccessfulImport - Whether import was successful
     */
    _updateButtonStatesForResults(hasSuccessfulImport) {
        console.log('Updating button states for Results step, hasSuccessfulImport:', hasSuccessfulImport);
    
        // Update Next button to say "Finish"
        if (this.nextButton) {
            this.nextButton.textContent = 'Finish';
            this.nextButton.disabled = false;
            
            // Force visibility with important flags
            this.nextButton.style.display = 'block';
            this.nextButton.style.visibility = 'visible';
            this.nextButton.style.opacity = '1';
            this.nextButton.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important; background-color: var(--interactive-primary) !important;');
        } else {
            console.error('Next button not found!');
        }

        // Disable Back button - user should not be able to return to previous steps after import
        if (this.backButton) {
            console.log('Disabling Back button on Results step');
            this.backButton.disabled = true;
            this.backButton.style.opacity = '0.5';
        } else {
            console.error('Back button not found!');
        }

        // Disable Close button - user should use Finish button to properly close
        if (this.closeButton) {
            console.log('Disabling Close button on Results step');
            this.closeButton.disabled = true;
            this.closeButton.style.opacity = '0.5';
            this.closeButton.style.pointerEvents = 'none';
        } else {
            console.error('Close button not found!');
        }
    
        // Disable Cancel button if import was successful
        if (this.cancelButton && hasSuccessfulImport) {
            console.log('Disabling Cancel button due to successful import');
            this.cancelButton.disabled = true;
            this.cancelButton.style.opacity = '0.5';
        } else if (!this.cancelButton) {
            console.error('Cancel button not found!');
        }
    }

    /**
     * Safely update import progress
     * @param {number} percent - Progress percentage
     */
    _updateImportProgress(percent) {
        // Safely check if the method exists before calling it
        if (this.steps.results && typeof this.steps.results.updateImportProgress === 'function') {
            this.steps.results.updateImportProgress(percent);
        } else {
            console.log(`Import progress: ${percent}%`);
        }
    }

    /**
     * Get file type from file
     * @param {Object} file - File object
     * @returns {string} - File type
     */
    _getFileType(file) {
        if (!file) return '';

        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
            return 'excel';
        } else if (fileName.endsWith('.pdf')) {
            return 'pdf';
        } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
            return 'text';
        } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
            return 'html';
        }

        return file.type || '';
    }

    /**
     * Check if file is Excel format
     * @param {string} fileType - File type
     * @returns {boolean} - Whether file is Excel format
     */
    _isExcelFile(fileType) {
        return fileType === 'excel';
    }
}

export default CorpusContentImportModal;