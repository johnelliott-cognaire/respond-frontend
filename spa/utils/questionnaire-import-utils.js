// utils/questionnaire-import-utils.js

/**
 * Shared utility functions for questionnaire import functionality
 * Used by both RFP and Security questionnaire workflows
 */

import * as importStageData from './import-stage-data.js';
import formatHumanReadableDate from './date-utils.js';

/**
 * Create the standard questionnaire import UI structure
 * @param {Object} options - Configuration options
 * @param {string} options.title - Stage title
 * @param {string} options.description - Stage description 
 * @param {string} options.className - CSS class name for the container
 * @param {boolean} options.isDocumentSaved - Whether document is saved
 * @returns {HTMLElement} - The constructed form container
 */
export function createImportFormStructure({ title, description, className, isDocumentSaved }) {
    // Create stage form container
    const formContainer = document.createElement('div');
    formContainer.className = `stage-form ${className}`;
    
    // Add stage title
    const titleEl = document.createElement('h2');
    titleEl.className = 'stage-title';
    titleEl.textContent = title;
    formContainer.appendChild(titleEl);
    
    // Add description
    const descriptionEl = document.createElement('p');
    descriptionEl.className = 'stage-description';
    descriptionEl.textContent = description;
    formContainer.appendChild(descriptionEl);
    
    // Add save reminder if document is not saved
    if (!isDocumentSaved) {
        const saveReminderEl = document.createElement('div');
        saveReminderEl.className = 'save-reminder';
        saveReminderEl.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>Please save the document before importing questions.</span>
        `;
        formContainer.appendChild(saveReminderEl);
    }
    
    return formContainer;
}

/**
 * Create the upload section with file list and import button
 * @param {Object} options - Configuration options
 * @param {string} options.sectionTitle - Title for the upload section
 * @param {string} options.buttonText - Text for import button
 * @param {string} options.buttonIcon - Icon class for import button
 * @param {Function} options.onImportClick - Click handler for import button
 * @param {boolean} options.isDocumentSaved - Whether document is saved
 * @returns {Object} - Object containing section element and file list container
 */
export function createUploadSection({ sectionTitle, buttonText, buttonIcon, onImportClick, isDocumentSaved }) {
    // Create upload section
    const uploadSection = document.createElement('div');
    uploadSection.className = 'upload-section';
    
    // Add section title
    const sectionTitleEl = document.createElement('h3');
    sectionTitleEl.textContent = sectionTitle;
    uploadSection.appendChild(sectionTitleEl);
    
    // Create files list container
    const fileListContainer = document.createElement('div');
    fileListContainer.className = 'files-list-container';
    uploadSection.appendChild(fileListContainer);
    
    // Add actions container
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'actions-container';
    
    // Add import button
    const importButton = document.createElement('button');
    importButton.className = 'btn btn--primary import-data-btn';
    importButton.innerHTML = `<i class="${buttonIcon}"></i> ${buttonText}`;
    importButton.disabled = !isDocumentSaved;
    importButton.addEventListener('click', onImportClick);
    actionsContainer.appendChild(importButton);
    
    uploadSection.appendChild(actionsContainer);
    
    return {
        section: uploadSection,
        fileListContainer,
        importButton
    };
}

/**
 * Render files list table for uploaded questionnaire files
 * @param {HTMLElement} container - Container element for the files list
 * @param {Object} docTaskInstance - Document task instance
 * @param {string} stageId - Current stage ID
 */
export function renderFilesList(container, docTaskInstance, stageId) {
    if (!container) return;
    
    // Get uploaded files
    const uploadedFiles = importStageData.getUploadedFilesArray(docTaskInstance, stageId);
    
    // Clear container
    container.innerHTML = '';
    
    // If no files, show message
    if (uploadedFiles.length === 0) {
        const noFilesMessage = document.createElement('div');
        noFilesMessage.className = 'no-files-message';
        noFilesMessage.textContent = 'No files uploaded yet.';
        container.appendChild(noFilesMessage);
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
    container.appendChild(table);
    
    // Add summary
    const summary = document.createElement('div');
    summary.className = 'files-summary';
    
    // Get summary info
    const summaryInfo = importStageData.getImportSummary(docTaskInstance, stageId);
    
    summary.innerHTML = `
        <div><strong>Total Files:</strong> ${uploadedFiles.length}</div>
        <div><strong>Total Questions:</strong> ${summaryInfo.totalQuestionsImported || 0}</div>
    `;
    
    container.appendChild(summary);
}

/**
 * Add shared CSS styles for questionnaire import forms
 * @param {string} styleId - Unique ID for the style element
 */
export function addImportFormStyles(styleId) {
    // Check if styles already exist
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .stage-form {
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
        
        .save-reminder {
            background-color: #fff3cd;
            color: #856404;
            padding: 10px 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
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
            overflow-x: auto;
        }
        
        .files-table {
            width: 100%;
            min-width: 600px;
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
            flex-wrap: wrap;
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
    `;
    
    document.head.appendChild(style);
}

/**
 * Show a message to the user using available modal system
 * @param {string} message - Message to display
 * @param {string} title - Optional title for the message
 */
export function showImportMessage(message, title = 'Import Questions') {
    // Use MessageModal if available
    if (window.MessageModal) {
        const messageModal = new window.MessageModal();
        messageModal.show({
            title: title,
            message: message
        });
    } else {
        // Fallback to alert
        alert(message);
    }
}