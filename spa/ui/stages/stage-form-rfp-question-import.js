// ui/stages/stage-form-rfp-question-import.js

import QuestionImportModal from '../modals/question-import-modal.js';
import * as importStageData from '../../utils/import-stage-data.js';
import formatHumanReadableDate from '../../utils/date-utils.js';

/**
 * Stage form for RFP question import (Stage 1)
 * Displays a list of uploaded files and allows importing new files
 */
export default class StageFormRfpQuestionImport {
    /**
     * Constructor
     * @param {Object} docTaskInstance - Document task instance
     * @param {Object} jobController - Job controller instance
     */
    constructor(docTaskInstance, jobController) {
        this.docTaskInstance = docTaskInstance;
        this.jobController = jobController;
        
        // Identify the current stage ID
        const currentStageIndex = docTaskInstance.currentStageIndex || 0;
        this.currentStageId = docTaskInstance.stages?.[currentStageIndex]?.stageId 
                           || "rfp_stage_1_upload_question_lists";
        
        // Initialize stage data if not present
        importStageData.initializeStageData(this.docTaskInstance, this.currentStageId);
        
        this.domContainer = null;
        this.fileListContainer = null;
        this.importButton = null;
        this.importModal = null;
        
        // Check if document is saved
        this.isDocumentSaved = docTaskInstance.isSaved || false;
    }
    
    /**
     * Render the stage form
     * @param {HTMLElement} containerEl - Container element
     */
    async render(containerEl) {
        this.domContainer = containerEl;
        containerEl.innerHTML = '';
        
        // Create stage form container
        const formContainer = document.createElement('div');
        formContainer.className = 'stage-form stage-form-rfp-question-import';
        
        // Add stage title
        const titleEl = document.createElement('h2');
        titleEl.className = 'stage-title';
        titleEl.textContent = 'Upload Questions';
        formContainer.appendChild(titleEl);
        
        // Add description
        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'stage-description';
        descriptionEl.textContent = 'Import Excel or CSV files containing RFP questions. Each file can contain multiple worksheets, and each worksheet will be imported as a separate group of questions.';
        formContainer.appendChild(descriptionEl);
        
        
        // Create upload section
        const uploadSection = document.createElement('div');
        uploadSection.className = 'upload-section';
        
        // Add section title
        const sectionTitleEl = document.createElement('h3');
        sectionTitleEl.textContent = 'Current Uploaded Spreadsheets';
        uploadSection.appendChild(sectionTitleEl);
        
        // Create files list container
        this.fileListContainer = document.createElement('div');
        this.fileListContainer.className = 'files-list-container';
        uploadSection.appendChild(this.fileListContainer);
        
        // Add actions container
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'actions-container';
        
        // Add import button
        this.importButton = document.createElement('button');
        this.importButton.className = 'btn btn--primary import-data-btn';
        this.importButton.innerHTML = '<i class="fas fa-file-import"></i> Import New Data';
        // Import button is always enabled as documents are auto-saved
        this.importButton.addEventListener('click', () => this._handleImportClick());
        actionsContainer.appendChild(this.importButton);
        
        uploadSection.appendChild(actionsContainer);
        formContainer.appendChild(uploadSection);
        
        // Render files list
        this._renderFilesList();
        
        containerEl.appendChild(formContainer);
        
        // Add CSS styles
        this._addStyles();
    }
    
    /**
     * Render the list of uploaded files
     */
    _renderFilesList() {
        if (!this.fileListContainer) return;
        
        // Get uploaded files
        const uploadedFiles = importStageData.getUploadedFilesArray(this.docTaskInstance, this.currentStageId);
        
        // Clear container
        this.fileListContainer.innerHTML = '';
        
        // If no files, show message
        if (uploadedFiles.length === 0) {
            const noFilesMessage = document.createElement('div');
            noFilesMessage.className = 'no-files-message';
            noFilesMessage.textContent = 'No spreadsheets uploaded yet.';
            this.fileListContainer.appendChild(noFilesMessage);
            return;
        }
        
        // Create files table
        const table = document.createElement('table');
        table.className = 'files-table';
        
        // Add table header
        const tableHeader = document.createElement('thead');
        tableHeader.innerHTML = `
            <tr>
                <th>Filename</th>
                <th># Sheets</th>
                <th># Questions</th>
                <th># Skipped</th>
                <th>Uploaded</th>
            </tr>
        `;
        table.appendChild(tableHeader);
        
        // Add table body
        const tableBody = document.createElement('tbody');
        
        // Add rows for each file
        uploadedFiles.forEach(file => {
            const row = document.createElement('tr');
            
            // File name
            const nameCell = document.createElement('td');
            nameCell.textContent = file.name || 'Unknown file';
            row.appendChild(nameCell);
            
            // Sheet count
            const sheetCountCell = document.createElement('td');
            sheetCountCell.textContent = (file.worksheets?.length || 0).toString();
            row.appendChild(sheetCountCell);
            
            // Question count
            const questionCountCell = document.createElement('td');
            questionCountCell.textContent = (file.importResults?.successCount || 0).toString();
            row.appendChild(questionCountCell);
            
            // Skipped count
            const skippedCell = document.createElement('td');
            skippedCell.textContent = (file.importResults?.failureCount || 0).toString();
            // Remove error styling - skipped rows are expected behavior
            row.appendChild(skippedCell);
            
            // Upload date
            const uploadDateCell = document.createElement('td');
            if (file.upload_datetime) {
                uploadDateCell.textContent = formatHumanReadableDate(file.upload_datetime, true);
            } else {
                uploadDateCell.textContent = 'Unknown';
            }
            row.appendChild(uploadDateCell);
            
            tableBody.appendChild(row);
        });
        
        table.appendChild(tableBody);
        this.fileListContainer.appendChild(table);
        
        // Add summary
        const summary = document.createElement('div');
        summary.className = 'files-summary';
        
        // Get summary info
        const summaryInfo = importStageData.getImportSummary(this.docTaskInstance, this.currentStageId);
        
        summary.innerHTML = `
            <div><strong>Total Files:</strong> ${uploadedFiles.length}</div>
            <div><strong>Total Questions:</strong> ${summaryInfo.totalQuestionsImported || 0}</div>
        `;
        
        this.fileListContainer.appendChild(summary);
    }
    
    /**
     * Handle import button click
     */
    _handleImportClick() {
        
        // Always create a new import modal instance to avoid singleton issues
        // The QuestionImportModal handles cleanup of any existing instance
        this.importModal = new QuestionImportModal({
            docTaskInstance: this.docTaskInstance,
            stageId: this.currentStageId,
            store: window.store
        });
        
        // Show the modal
        this.importModal.show(() => {
            // Refresh the files list when modal is closed
            this._renderFilesList();
            
            // Clear the modal reference to ensure a fresh instance next time
            this.importModal = null;
        });
    }
    
    /**
     * Show a message to the user
     * @param {string} message - Message to display
     */
    _showMessage(message) {
        // Use MessageModal if available
        if (window.MessageModal) {
            const messageModal = new window.MessageModal();
            messageModal.show({
                title: 'Import Questions',
                message: message
            });
        } else {
            // Fallback to alert
            alert(message);
        }
    }
    
    /**
     * Add CSS styles
     */
    _addStyles() {
        // Check if styles already exist
        if (document.getElementById('stage-form-rfp-question-import-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'stage-form-rfp-question-import-styles';
        style.textContent = `
            .stage-form-rfp-question-import {
                padding: 20px;
            }
            
            .stage-title {
                font-size: 24px;
                margin-bottom: 10px;
                color: #333;
            }
            
            .stage-description {
                margin-bottom: 20px;
                color: #666;
                line-height: 1.5;
            }
            
            .upload-section {
                background-color: #fff;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 20px;
                margin-bottom: 20px;
            }
            
            .upload-section h3 {
                font-size: 18px;
                margin-top: 0;
                margin-bottom: 20px;
                color: #333;
            }
            
            .files-list-container {
                margin-bottom: 20px;
                min-height: 100px;
                overflow-x: auto; /* Add horizontal scroll for narrow screens */
            }
            
            .files-table {
                width: 100%;
                min-width: 600px; /* Minimum width to prevent crushing */
                border-collapse: collapse;
                margin-bottom: 20px;
            }
            
            .files-table th,
            .files-table td {
                padding: 12px 15px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            
            .files-table th {
                background-color: #f5f5f5;
                font-weight: bold;
                color: #333;
            }
            
            .files-table tr:hover {
                background-color: #f9f9f9;
            }
            
            .has-skipped {
                color: #333;
                font-weight: normal;
            }
            
            .no-files-message {
                padding: 30px;
                text-align: center;
                color: #666;
                font-style: italic;
                background-color: #f9f9f9;
                border-radius: 4px;
            }
            
            .files-summary {
                display: flex;
                gap: 20px;
                padding: 10px 0;
                color: #555;
                flex-wrap: wrap; /* Allow wrapping on small screens */
            }
            
            /* Responsive design for mobile/narrow screens */
            @media (max-width: 768px) {
                .files-table th,
                .files-table td {
                    padding: 8px 10px;
                    font-size: 14px;
                }
                
                .files-summary {
                    flex-direction: column;
                    gap: 10px;
                }
            }
            
            .actions-container {
                display: flex;
                justify-content: flex-start;
                margin-top: 10px;
            }
            
            .import-data-btn {
                padding: 10px 20px;
                background-color: #4a90e2;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background-color 0.2s;
            }
            
            .import-data-btn:hover {
                background-color: #3a80d2;
            }
            
            .import-data-btn:disabled {
                background-color: #a5d6a7;
                cursor: not-allowed;
            }
        `;
        
        document.head.appendChild(style);
    }
}