// ui/components/docitemimport/step-select-file.js

import ImportConfig from '../../../config/import-config.js';
import documentImportService from '../../../api/document-import-service.js';
import { getFileUploadLimits } from '../../../utils/config.js';

/**
 * First step of the import wizard - file selection
 * Allows the user to select a file via drag-drop or file picker
 */
export class StepSelectFile {
    /**
     * Create a new file selection step
     * @param {Object} options - Configuration options
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     * @param {Object} options.docTaskInstance - Document task instance
     * @param {String} options.stageId - Current stage ID
     */
    constructor(options = {}) {
        this.onNext = options.onNext || (() => {});
        this.onError = options.onError || console.error;
        this.docTaskInstance = options.docTaskInstance || {};
        this.stageId = options.stageId || '';
        
        this.selectedFile = null;
        this.isUploading = false;
        this.uploadProgress = 0;
        
        this.domContainer = null;
        this.dragDropArea = null;
        this.fileInputEl = null;
        this.selectedFileInfoEl = null;
        this.uploadButtonEl = null;
        this.progressBarEl = null;
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
        stepContent.className = 'import-step import-step-select-file';
        
        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Select File to Import';
        stepContent.appendChild(titleEl);
        
        const fileUploadLimits = getFileUploadLimits();
        const descriptionEl = document.createElement('p');
        descriptionEl.innerHTML = `Choose an Excel (*.xlsx) or CSV file containing questions to import. The file will be uploaded to our secure server for processing.<br><strong>Maximum file size: ${fileUploadLimits.MAX_FILE_SIZE_DISPLAY}</strong>`;
        stepContent.appendChild(descriptionEl);
        
        // Create drag-drop area
        this.dragDropArea = document.createElement('div');
        this.dragDropArea.className = 'drag-drop-area';
        this.dragDropArea.innerHTML = `
            <div class="drag-drop-icon">
                <i class="fas fa-file-excel"></i>
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
        this.fileInputEl.accept = '.xlsx,.csv';
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
        
        stepContent.appendChild(this.dragDropArea);
        
        // Create selected file info area (initially hidden)
        this.selectedFileInfoEl = document.createElement('div');
        this.selectedFileInfoEl.className = 'selected-file-info';
        this.selectedFileInfoEl.style.display = 'none';
        stepContent.appendChild(this.selectedFileInfoEl);
        
        // Create progress bar (initially hidden)
        this.progressBarEl = document.createElement('div');
        this.progressBarEl.className = 'import-upload-progress';
        this.progressBarEl.style.display = 'none';
        this.progressBarEl.innerHTML = `
            <div class="import-progress-container">
                <div class="import-progress-bar"></div>
            </div>
            <div class="import-progress-text">Uploading: 0%</div>
        `;
        stepContent.appendChild(this.progressBarEl);
        
        container.appendChild(stepContent);
    }
    
    /**
     * Set up drag and drop event listeners
     */
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
    
    /**
     * Handle file selection
     * @param {File} file - The selected file
     */
    _handleFileSelected(file) {
        // Check if file type is supported
        const isSupported = this._validateFileType(file);
        if (!isSupported) {
            this.onError('Unsupported file type. Please select an Excel (*.xlsx) or CSV file.');
            return;
        }
        
        // Check file size
        const fileUploadLimits = getFileUploadLimits();
        if (file.size > fileUploadLimits.MAX_FILE_SIZE_BYTES) {
            this.onError(`File too large. Maximum file size is ${fileUploadLimits.MAX_FILE_SIZE_DISPLAY}.`);
            return;
        }
        
        this.selectedFile = file;
        
        // Update UI to show selected file
        this.dragDropArea.style.display = 'none';
        this.selectedFileInfoEl.style.display = 'block';
        this.selectedFileInfoEl.innerHTML = `
            <div class="file-info">
                <div class="file-icon">
                    <i class="fas fa-file-excel"></i>
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
                File selected successfully. Click "Next" to continue with the upload.
            </div>
        `;
        
        // Setup change file button
        const changeFileBtn = this.selectedFileInfoEl.querySelector('.change-file-btn');
        changeFileBtn.addEventListener('click', () => {
            this.selectedFile = null;
            this.dragDropArea.style.display = 'flex';
            this.selectedFileInfoEl.style.display = 'none';
            this.fileInputEl.value = ''; // Clear file input
    
            // Notify the wizard that the file has been removed
            this._notifyWizard();
        });
    
        this._notifyWizard();
    }

    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }

    canProceed(showErrors = false) {
        if (!this.selectedFile) {
            if (showErrors) {
                this.onError('Please select a file to continue.');
            }
            return false;
        }
        return true;
    }
    
    async proceed() {
        if (!this.canProceed(true)) {
            return;
        }
        
        try {
            // Show upload progress
            this.progressBarEl.style.display = 'block';
            this.selectedFileInfoEl.style.display = 'none';
            this._updateProgressBar(0);
            
            const nextData = await this._uploadFile();

            // Notify wizard that this step is complete
            this.onNext(nextData);
        } catch (error) {
            this.onError(error.message || 'Failed to upload file. Please try again.');
            // Reset UI
            this.progressBarEl.style.display = 'none';
            this.selectedFileInfoEl.style.display = 'block';
        }
    }
    
    reset() {
        this.selectedFile = null;
        this.isUploading = false;
        this.uploadProgress = 0;
        
        // Reset UI if already rendered
        if (this.domContainer) {
            if (this.dragDropArea) this.dragDropArea.style.display = 'flex';
            if (this.selectedFileInfoEl) this.selectedFileInfoEl.style.display = 'none';
            if (this.progressBarEl) this.progressBarEl.style.display = 'none';
            if (this.fileInputEl) this.fileInputEl.value = '';
        }
        
        this._notifyWizard();
    }
    
    /**
     * Validate file type
     * @param {File} file - The file to validate
     * @returns {boolean} - Whether the file type is supported
     */
    _validateFileType(file) {
        const fileName = file.name.toLowerCase();
        const fileType = file.type;
        
        // Check MIME type if available
        if (fileType && ImportConfig.supportedFileTypes.includes(fileType)) {
            return true;
        }
        
        // Fallback to extension check
        return fileName.endsWith('.xlsx') || fileName.endsWith('.csv');
    }
    
    /**
     * Format file size to a human-readable string
     * @param {number} bytes - The file size in bytes
     * @returns {string} - Formatted file size
     */
    _formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Upload the selected file and return {file, metadata}
     */
    async _uploadFile() {
        if (!this.selectedFile || this.isUploading) {
            throw new Error('No file selected or upload already in progress');
        }
        
        this.isUploading = true;
        this.uploadProgress = 0;
        
        try {
            // Get project_id and document_id from docTaskInstance
            const projectId = this.docTaskInstance.project_id || this.docTaskInstance.projectId;
            const documentId = this.docTaskInstance.document_id || this.docTaskInstance.documentId;
            
            if (!projectId || !documentId) {
                throw new Error('Missing project_id or document_id. Please save the document first.');
            }
            
            // Step 1: Generate presigned URL
            console.log('Generating presigned URL...');
            const presignedUrlResponse = await documentImportService.generatePresignedUrl({
                project_id: projectId,
                document_id: documentId,
                filename: this.selectedFile.name,
                content_type: this.selectedFile.type,
                file_size: this.selectedFile.size
            });
            
            // Step 2: Upload file to S3
            console.log('Uploading file to S3...');
            this._updateProgressBar(20);
            await documentImportService.uploadFileToPresignedUrl(
                presignedUrlResponse.presigned_url,
                this.selectedFile,
                this.selectedFile.type
            );
            
            // Step 3: Parse file metadata
            console.log('Parsing file metadata...');
            this._updateProgressBar(70);
            const metadata = await documentImportService.parseFileMetadata({
                bucket: presignedUrlResponse.bucket,
                key: presignedUrlResponse.s3_key,
                preview_rows: ImportConfig.previewRows,
                preview_cols: ImportConfig.previewCols
            });
            
            this._updateProgressBar(100);
            
            // Prepare data to pass to the next step
            const nextData = {
                file: {
                    name: this.selectedFile.name,
                    size: this.selectedFile.size,
                    type: this.selectedFile.type,
                    s3_bucket: presignedUrlResponse.bucket,
                    s3_key: presignedUrlResponse.s3_key
                },
                metadata: metadata
            };
            
            this.isUploading = false;
            return nextData;
        } catch (error) {
            this.isUploading = false;
            console.error('Error uploading file:', error);
            throw error;
        }
    }
    
    /**
     * Update the progress bar
     * @param {number} percent - Progress percentage (0-100)
     */
    _updateProgressBar(percent) {
        if (!this.progressBarEl) return;
        
        const progressBar = this.progressBarEl.querySelector('.import-progress-bar');
        const progressText = this.progressBarEl.querySelector('.import-progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        
        if (progressText) {
            progressText.textContent = `Uploading: ${Math.round(percent)}%`;
        }
    }

    /**
     * Get the selected file
     * @returns {File|null} - The selected file
     */
    getSelectedFile() {
        return this.selectedFile;
    }
    
}

export default StepSelectFile;
