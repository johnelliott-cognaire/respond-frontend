// ui/components/docitemimport/step-confirm.js

import ImportConfig from '../../../config/import-config.js';

/**
 * Fourth step of the import wizard - confirm import
 * Shows summary of what will be imported and allows user to proceed
 */
export class StepConfirm {
    /**
     * Create a new confirmation step
     * @param {Object} options - Configuration options
     * @param {Object} options.fileData - File data from first step
     * @param {Object} options.metadata - File metadata
     * @param {Object} options.mappingConfig - Column mapping configuration
     * @param {Object} options.previewInfo - Preview information from previous step
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     * @param {Function} options.showYesNoModal - Function to show yes/no confirmation modal
     */
    constructor(options = {}) {
        this.parentModal = options.parentModal || 'default';
        this.fileData = options.fileData || {};
        this.metadata = options.metadata || { worksheets: [], preview: {} };
        this.mappingConfig = options.mappingConfig || { worksheets: [], mappingsBySheet: {} };
        this.previewInfo = options.previewInfo || { totalRows: 0 };
        this.onNext = options.onNext || (() => {});
        this.onError = options.onError || console.error;
        this.showYesNoModal = options.showYesNoModal || (() => Promise.resolve(true));
        
        this.domContainer = null;
        this.startImportButton = null;
        this.isImporting = false;
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
        stepContent.className = 'import-step import-step-confirm';
        
        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Confirm Import';
        stepContent.appendChild(titleEl);
        
        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Review the import summary and proceed when ready. This will add the questions to your document.';
        stepContent.appendChild(descriptionEl);
        
        // Create summary panel
        const summaryPanel = document.createElement('div');
        summaryPanel.className = 'import-summary-panel';
        
        // File details section
        const fileSection = document.createElement('div');
        fileSection.className = 'summary-section';
        
        const fileTitle = document.createElement('h4');
        fileTitle.textContent = 'File Information';
        fileSection.appendChild(fileTitle);
        
        const fileDetails = document.createElement('div');
        fileDetails.className = 'summary-details';
        fileDetails.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">File Name:</span>
                <span class="summary-value">${this.fileData.name || 'N/A'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">File Size:</span>
                <span class="summary-value">${this._formatFileSize(this.fileData.size || 0)}</span>
            </div>
        `;
        fileSection.appendChild(fileDetails);
        summaryPanel.appendChild(fileSection);
        
        // Import details section
        const importSection = document.createElement('div');
        importSection.className = 'summary-section';
        
        const importTitle = document.createElement('h4');
        importTitle.textContent = 'Import Details';
        importSection.appendChild(importTitle);
        
        const importDetails = document.createElement('div');
        importDetails.className = 'summary-details';
        
        // Only show the worksheet count which is accurate
        const totalWorksheets = this.mappingConfig.worksheets.length;
        
        importDetails.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">Selected Worksheets:</span>
                <span class="summary-value">${totalWorksheets}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">File Type:</span>
                <span class="summary-value">${this._getFileTypeLabel(this.fileData.name || '')}</span>
            </div>
        `;
        importSection.appendChild(importDetails);
        summaryPanel.appendChild(importSection);
        
        // Worksheet details section
        const worksheetSection = document.createElement('div');
        worksheetSection.className = 'summary-section';
        
        const worksheetTitle = document.createElement('h4');
        worksheetTitle.textContent = 'Worksheet Details';
        worksheetSection.appendChild(worksheetTitle);
        
        const worksheetList = document.createElement('div');
        worksheetList.className = 'worksheet-list';
        
        // Add each worksheet's details
        this.mappingConfig.worksheets.forEach(worksheet => {
            const sheetConfig = this.mappingConfig.mappingsBySheet[worksheet] || {};
            const mappings = sheetConfig.mappings || [];
            
            const worksheetItem = document.createElement('div');
            worksheetItem.className = 'worksheet-item';
            
            const worksheetHeader = document.createElement('div');
            worksheetHeader.className = 'worksheet-header';
            worksheetHeader.innerHTML = `
                <div class="worksheet-name">${worksheet}</div>
                <div class="worksheet-mappings-count">${mappings.length} column(s) mapped</div>
            `;
            worksheetItem.appendChild(worksheetHeader);
            
            // Add mapping details
            const mappingsList = document.createElement('div');
            mappingsList.className = 'mappings-list';
            
            const fieldLabels = {
                'question_id': 'ID',
                'question_text': 'Question',
                'question_prefix': 'Question Prefix',
                'guidance': 'Guidance',
                'notes': 'Notes',
                'module': 'Module',
                'owner_username': 'Owner'
            };
            
            mappings.forEach(mapping => {
                const sourceColumn = this._indexToColumnLetter(mapping.sourceColumn);
                const fieldName = fieldLabels[mapping.destinationField] || mapping.destinationField;
                
                const mappingItem = document.createElement('div');
                mappingItem.className = 'mapping-item';
                mappingItem.innerHTML = `
                    <span class="mapping-source">Column ${sourceColumn}</span>
                    <i class="fas fa-arrow-right mapping-arrow"></i>
                    <span class="mapping-destination">${fieldName}</span>
                `;
                mappingsList.appendChild(mappingItem);
            });
            
            worksheetItem.appendChild(mappingsList);
            worksheetList.appendChild(worksheetItem);
        });
        
        worksheetSection.appendChild(worksheetList);
        summaryPanel.appendChild(worksheetSection);
        
        stepContent.appendChild(summaryPanel);
        
        // Add note about import process
        const importNote = document.createElement('div');
        importNote.className = 'import-note';

        // Check if we're in CorpusContentImportModal and have an Excel file
        const isCorpusExcelImport = this.parentModal === 'corpus' && this._isExcelFile();

        // Build note HTML with conditional Excel conversion message
        let noteHtml = `
            <div class="note-icon"><i class="fas fa-info-circle"></i></div>
            <div class="note-text">
                <p>When you click "${this.parentModal === 'corpus' && isCorpusExcelImport ? 'Start Import' : 'Next'}", the system will:</p>
                <ol>
        `;

        // Add steps based on modal type
        if (this.parentModal === 'question') {
            noteHtml += `
                    <li>Process all selected worksheets and import questions</li>
                    <li>Create question groups for each worksheet</li>
                    <li>Apply your column mappings to structure the data</li>
            `;
        } else {
            // Corpus import steps
            noteHtml += `
                    <li>Process your document and add it to the corpus</li>
            `;
            
            // Add Excel conversion message if applicable
            if (isCorpusExcelImport) {
                const worksheetCount = this.mappingConfig?.worksheets?.length || 0;
                noteHtml += `
                    <li>Convert your Excel file into ${worksheetCount} separate CSV files (one per worksheet)</li>
                    <li>Each worksheet will be added as a separate document in the corpus</li>
                `;
            }
        }

        noteHtml += `
                </ol>
                <p>This process may take a few minutes for large files.</p>
            </div>
        `;

        importNote.innerHTML = noteHtml;
        stepContent.appendChild(importNote);
        
        container.appendChild(stepContent);
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
     * Get file type label based on file name
     * @param {string} fileName - The file name
     * @returns {string} - File type label
     */
    _getFileTypeLabel(fileName) {
        if (!fileName) return 'Unknown';
        
        const extension = fileName.split('.').pop().toLowerCase();
        
        switch (extension) {
            case 'xlsx':
                return 'Excel Spreadsheet (.xlsx)';
            case 'csv':
                return 'CSV File (.csv)';
            default:
                return extension.toUpperCase() + ' File';
        }
    }
    
    /**
     * Get import size label based on total questions
     * @param {number} totalQuestions - Total number of questions
     * @returns {string} - Import size label
     */
    _getImportSizeLabel(totalQuestions) {
        if (totalQuestions === 0) {
            return 'No questions (empty)';
        } else if (totalQuestions <= 50) {
            return 'Small (less than 50 questions)';
        } else if (totalQuestions <= ImportConfig.largeImportThreshold) {
            return 'Medium (' + totalQuestions + ' questions)';
        } else {
            return 'Large (' + totalQuestions + ' questions)';
        }
    }
    
    /**
     * Convert column index to Excel-style column letter (A, B, C, ... Z, AA, AB, etc.)
     * @param {number} index - 0-based column index
     * @returns {string} - Excel-style column reference
     */
    _indexToColumnLetter(index) {
        let letter = '';
        index++;
        
        while (index > 0) {
            const remainder = (index - 1) % 26;
            letter = String.fromCharCode(65 + remainder) + letter;
            index = Math.floor((index - 1) / 26);
        }
        
        return letter;
    }
    
    /**
     * Start the import process
     */
    _startImport() {
        this.isImporting = true;
        
        // Update UI
        if (this.startImportButton) {
            this.startImportButton.disabled = true;
            this.startImportButton.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Preparing Import...
            `;
        }
        
        // Call next step with a slight delay to allow button state to update
        setTimeout(() => {
            this.onNext({
                fileData: this.fileData,
                mappingConfig: this.mappingConfig
            });
        }, 100);
    }

    /**
     * Check if the current file is an Excel file
     * @returns {boolean} - Whether file is Excel
     */
    _isExcelFile() {
        const fileName = this.fileData?.name?.toLowerCase() || '';
        return fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
    }
    
    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }
    
    canProceed(showErrors = false) {
        // This step can always proceed since it's just a confirmation
        return true;
    }
    
    proceed() {
        if (!this.canProceed(true)) return;
        
        // Show confirmation for large imports if needed
        this._confirmAndStartImport();
    }
    
    async _confirmAndStartImport() {
        if (this.isImporting) return;
        
        const totalQuestions = this.previewInfo.totalRows || 0;
        
        // Show warning for large imports
        if (totalQuestions > ImportConfig.largeImportThreshold) {
            const message = `You are about to import ${totalQuestions} questions, which is a large import. This might take some time to process. Do you want to continue?`;
            
            // Show Yes/No confirmation modal
            const confirmed = await this.showYesNoModal({
                title: 'Large Import Warning',
                message: message
            });
            
            if (!confirmed) return;
        }
        
        this._startImport();
    }
    
    reset() {
        // Reset the isImporting flag
        this.isImporting = false;
        
        this._notifyWizard();
    }
}

export default StepConfirm;