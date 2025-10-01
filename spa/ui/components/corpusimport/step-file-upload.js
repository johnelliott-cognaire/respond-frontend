// ui/components/corpusimport/step-file-upload.js

import corpusImportService from '../../../api/corpus-import-service.js';
import * as corpusUtils from '../../../utils/corpus-utils.js';
import { DocumentInformationForm } from './document-information-form.js';
import { ErrorModal } from "../../modals/error-modal.js";
import { MessageModal } from "../../modals/message-modal.js";
import { getFileUploadLimits } from '../../../utils/config.js';

/**
 * File upload step of the import wizard
 * Allows the user to upload a file and enter metadata
 */
export class StepFileUpload {
    /**
     * Create a new file upload step
     * @param {Object} options - Configuration options
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     * @param {string} options.currentDomain - Current corpus domain
     * @param {string} options.currentUnit - Current corpus unit
     * @param {string} options.currentTopic - Current corpus topic
     * @param {Function} options.onUploadProgress - Callback for upload progress
     */
    constructor(options = {}) {
        this.onNext = options.onNext || (() => { });
        this.onError = options.onError || console.error;
        this.onUploadProgress = options.onUploadProgress || (() => { });
        this.messageModal = options.messageModal || new MessageModal();
        this.errorModal = options.messageModal || new ErrorModal();

        this._isUpdatingProgress = false;
        this._progressUpdateOrigin = null;

        this.fileMetadata = {};
        this.docMetadata = {}; 

        // Current path components for pre-filling form
        this.currentDomain = options.currentDomain || '';
        this.currentUnit = options.currentUnit || '';
        this.currentTopic = options.currentTopic || '';
        this.corpusConfig = options.corpusConfig || {};
        this.corpus = options.corpus || 'rfp';

        this.domContainer = null;
        this.dragDropArea = null;
        this.fileInputEl = null;
        this.selectedFileInfoEl = null;
        this.progressBarEl = null;
        this.progressBarValueEl = null;
        this.progressTextEl = null;

        this.selectedFile = null;
        this.isUploading = false;
        this.uploadProgress = 0;
        this.s3Info = null;

        // Shared document information form
        this.documentForm = new DocumentInformationForm({
            documentTopic: this.currentTopic,
            domain: this.currentDomain,
            unit: this.currentUnit,
            corpus: this.corpus,
            corpusConfig: this.corpusConfig,
            onUpdate: (metadata) => {
                this.metadata = metadata;
            },
            onError: this.onError,
            messageModal: this.messageModal
        });

        // Add global event listener for upload progress
        this._uploadProgressHandler = (event) => {
            if (event.detail && typeof event.detail.percent === 'number') {
                this.updateUploadProgress(event.detail.percent);
            }
        };
        
        // Add event listener
        window.addEventListener('import-upload-progress', this._uploadProgressHandler);
    }

    cleanup() {
        // Remove global event listener to prevent memory leaks
        window.removeEventListener('import-upload-progress', this._uploadProgressHandler);
    }

    reset() {
        this.selectedFile = null;
        this.fileMetadata = {};
        this.docMetadata  = {};
        this.isUploading = false;
        this.uploadProgress = 0;
        this.s3Info = null;

        // Reset document form
        this.documentForm.updateData({
            documentType: '',
            documentName: '',
            documentTopic: this.currentTopic || '',
            domain: this.currentDomain || '',
            unit: this.currentUnit || ''
        });

        // Reset UI elements if they exist
        if (this.domContainer) {
            if (this.dragDropArea) this.dragDropArea.style.display = 'flex';
            if (this.selectedFileInfoEl) this.selectedFileInfoEl.style.display = 'none';
            if (this.progressBarEl) this.progressBarEl.style.display = 'none';
            if (this.fileInputEl) this.fileInputEl.value = '';
        }
    }

    render(container) {
        this.domContainer = container;
        container.innerHTML = '';

        // Create step content
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-file-upload';

        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Upload Document';
        stepContent.appendChild(titleEl);

        const fileUploadLimits = getFileUploadLimits();
        const descriptionEl = document.createElement('p');
        descriptionEl.innerHTML = `Choose a file to upload to the corpus. Supported formats: PDF, TXT, MD, HTML, CSV, XLSX.<br><strong>Maximum file size: ${fileUploadLimits.MAX_FILE_SIZE_DISPLAY}</strong>`;
        stepContent.appendChild(descriptionEl);

        // Create upload container
        const uploadContainer = document.createElement('div');
        uploadContainer.className = 'upload-container';

        // Drag drop area
        this.dragDropArea = document.createElement('div');
        this.dragDropArea.className = 'drag-drop-area';
        this.dragDropArea.id = 'dropZone';
        this.dragDropArea.innerHTML = `
            <div class="drag-drop-icon">
                <i class="fas fa-file-upload"></i>
            </div>
            <div class="drag-drop-text">
                <p>Drag and drop a file here</p>
                <p>or</p>
                <label for="file-input" class="file-input-label">Browse for file</label>
            </div>
        `;

        // Add file input (hidden, triggered by the label above)
        this.fileInputEl = document.createElement('input');
        this.fileInputEl.type = 'file';
        this.fileInputEl.id = 'file-input';
        this.fileInputEl.accept = '.pdf,.txt,.md,.html,.csv,.xlsx,.xls';
        this.fileInputEl.style.display = 'none';
        this.dragDropArea.appendChild(this.fileInputEl);

        // Setup drag-drop event listeners
        this._setupDragDropEvents();

        // Setup file input change listener
        this.fileInputEl.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                this._handleFileSelected(e.target.files[0]);
            }
        });

        uploadContainer.appendChild(this.dragDropArea);

        // Selected file info area (initially hidden)
        this.selectedFileInfoEl = document.createElement('div');
        this.selectedFileInfoEl.className = 'selected-file-info';
        this.selectedFileInfoEl.style.display = 'none';
        uploadContainer.appendChild(this.selectedFileInfoEl);

        // Progress bar (initially hidden)
        this.progressBarEl = document.createElement('div');
        this.progressBarEl.className = 'import-upload-progress';
        this.progressBarEl.style.display = 'none';
        this.progressBarEl.innerHTML = `
            <div class="import-progress-label">Uploading file:</div>
            <div class="import-progress-container">
                <div class="import-progress-bar" style="width: 0%"></div>
            </div>
            <div class="import-progress-text">0%</div>
        `;

        this.progressBarValueEl = this.progressBarEl.querySelector('.import-progress-bar');
        this.progressTextEl = this.progressBarEl.querySelector('.import-progress-text');

        uploadContainer.appendChild(this.progressBarEl);

        // Document form container
        const formContainer = document.createElement('div');
        formContainer.className = 'document-form-container';

        // Render document form
        this.documentForm.render(formContainer);

        uploadContainer.appendChild(formContainer);
        stepContent.appendChild(uploadContainer);
        container.appendChild(stepContent);
    }

    _setupDragDropEvents() {
        if (!this.dragDropArea) return;

        // Prevent default to allow drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dragDropArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Highlight drop area when drag enters
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dragDropArea.addEventListener(eventName, () => {
                this.dragDropArea.classList.add('dragover');
            }, false);
        });

        // Remove highlight when drag leaves
        ['dragleave', 'drop'].forEach(eventName => {
            this.dragDropArea.addEventListener(eventName, () => {
                this.dragDropArea.classList.remove('dragover');
            }, false);
        });

        // Handle file drop
        this.dragDropArea.addEventListener('drop', (e) => {
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this._handleFileSelected(e.dataTransfer.files[0]);
            }
        }, false);
    }

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

        // Check file size
        const fileUploadLimits = getFileUploadLimits();
        if (file.size > fileUploadLimits.MAX_FILE_SIZE_BYTES) {
            this._showError(`File too large. Maximum file size is ${fileUploadLimits.MAX_FILE_SIZE_DISPLAY}.`);
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
                    <div class="file-size">${this._formatFileSize(file.size)} (Max: ${fileUploadLimits.MAX_FILE_SIZE_DISPLAY})</div>
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

        // Start uploading the file to get S3 metadata with fixed debounce
        setTimeout(() => {
            this._startFileUpload();
        }, 100);

        this._notifyWizard();
    }

    async _startFileUpload() {
        if (!this.selectedFile) {
            return { success: false, error: 'No file selected' };
        }

        try {
            console.log('DEBUG: Starting file upload');
            this.isUploading = true;
            this.uploadProgress = 0;
    
            // Show upload progress
            this._updateUploadProgress(0);
            this.selectedFileInfoEl.style.display = 'none';
            this.progressBarEl.style.display = 'block';
    
            // Generate presigned URL
            console.log('Generating presigned URL for file upload');
    
            // IMPORTANT: Use consistent variable name (presignedResp)
            const presignedResp = await corpusImportService.generatePresignedUrl({
                corpus_id: this.corpus,
                filename: this.selectedFile.name,
                content_type: this.selectedFile.type || this._getMimeType(this.selectedFile.name),
                file_size: this.selectedFile.size
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
    
            // Use presignedResp here instead of presignedUrlResponse
            this.s3Info = {
                bucket: presignedResp.bucket,
                s3_key: presignedResp.s3_key
            };
            console.log('DEBUG: S3 info set:', this.s3Info);
    
            // For Excel files, fetch worksheet metadata
            let fileMetadata = { worksheets: [] };
            if (this._isExcelFile(this.selectedFile.name)) {
                console.log('Fetching Excel metadata');
                
                fileMetadata = await corpusImportService.parseFileMetadata({
                    bucket: presignedResp.bucket,
                    key: presignedResp.s3_key
                });
            }

            this.fileMetadata = fileMetadata;
    
            // Update progress to 100%
            this._updateUploadProgress(100);
    
            // Hide progress, show file info
            setTimeout(() => {
                this.isUploading = false;
                this.progressBarEl.style.display = 'none';
                this.selectedFileInfoEl.style.display = 'block';
            }, 500);

            this.isUploading = false;
            console.log('DEBUG: Upload complete, isUploading=false');
            this._notifyWizard();
    
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

    updateUploadProgress(percent) {
        this._progressUpdateOrigin = 'parent';
        this._updateUploadProgress(percent);
        this._notifyWizard();
    }

    _updateUploadProgress(percent) {
        // Guard against recursive calls
        if (this._isUpdatingProgress) return;
        this._isUpdatingProgress = true;

        try {
            if (!this.progressBarEl || !this.progressBarValueEl || !this.progressTextEl) return;

            // Ensure progress is between 0-100
            const validPercent = Math.min(100, Math.max(0, percent));

            // Update progress bar width
            this.progressBarValueEl.style.width = `${validPercent}%`;

            // Update progress text
            this.progressTextEl.textContent = `${Math.round(validPercent)}%`;

            // Notify parent but don't create a loop
            if (this.onUploadProgress && typeof this.onUploadProgress === 'function' &&
                this._progressUpdateOrigin !== 'parent') {
                this._progressUpdateOrigin = 'self';
                this.onUploadProgress(validPercent);
            }
        } finally {
            this._isUpdatingProgress = false;
            this._progressUpdateOrigin = null;
        }
    }

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

    _formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    _getMimeType(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();

        const mimeTypes = {
            'pdf': 'application/pdf',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'html': 'text/html',
            'htm': 'text/html',
            'csv': 'text/csv',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };

        return mimeTypes[ext] || 'application/octet-stream';
    }

    _isExcelFile(fileName) {
        const lowerName = fileName.toLowerCase();
        return lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv');
    }

    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }
    
    canProceed(showErrors = false) {

        console.log('DEBUG: FileUpload.canProceed() called with showErrors=', showErrors);
        console.log('DEBUG: State:', {
            hasFile: !!this.selectedFile,
            fileName: this.selectedFile?.name,
            hasS3Info: !!this.s3Info,
            isUploading: this.isUploading,
            uploadProgress: this.uploadProgress
        });

        // Check required fields
        if (!this.selectedFile) {
            if (showErrors) {
                this.errorModal.show({
                    title: "Missing File",
                    message: "Please select a file to upload."
                });
            }
            return false;
        }

        // Validate document form - only when showErrors is true
        if (showErrors && !this.documentForm.validate()) {
            return false;
        }

        // Ensure file is uploaded to S3
        if (!this.s3Info) {
            if (showErrors) {
                this.errorModal.show({
                    title: "Upload Incomplete",
                    message: "Please wait for the file to finish uploading."
                });
            }
            return false;
        }

        // Don't proceed if still uploading
        if (this.isUploading) {
            if (showErrors) {
                this.errorModal.show({
                    title: "Upload in Progress",
                    message: "Please wait for the file upload to complete."
                });
            }
            return false;
        }

        return true;
    }
    
    proceed() {
        if (!this.canProceed(true)) return;
    
        try {
            // Get metadata from form - adding debug
            const docMetadata = this.documentForm.getData();
            console.log('DEBUG: StepFileUpload.proceed() - docMetadata from form:', docMetadata);
    
            // Make sure we have sanitized document name
            if (docMetadata.documentName) {
                docMetadata.documentName = docMetadata.documentName
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]/g, '');
            }
    
            this.docMetadata = docMetadata;
    
            // Return file data, metadata, and S3 info
            this.onNext({
                file: this.selectedFile,
                metadata: this.fileMetadata || {},    // Excel worksheets+preview
                docMetadata: this.docMetadata,        // form metadata for later
                s3Info: this.s3Info
            });
        } catch (error) {
            console.error('Error proceeding to next step:', error);
            this._showError(`Error proceeding: ${error.message}`);
        }
    }
    
    reset() {
        this.selectedFile = null;
        this.fileMetadata = {};
        this.docMetadata = {};
        this.isUploading = false;
        this.uploadProgress = 0;
        this.s3Info = null;

        // Reset document form
        this.documentForm.updateData({
            documentType: '',
            documentName: '',
            documentTopic: this.currentTopic || '',
            domain: this.currentDomain || '',
            unit: this.currentUnit || ''
        });

        // Reset UI elements if they exist
        if (this.domContainer) {
            if (this.dragDropArea) this.dragDropArea.style.display = 'flex';
            if (this.selectedFileInfoEl) this.selectedFileInfoEl.style.display = 'none';
            if (this.progressBarEl) this.progressBarEl.style.display = 'none';
            if (this.fileInputEl) this.fileInputEl.value = '';
        }
        
        this._notifyWizard();
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

export default StepFileUpload;