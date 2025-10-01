// ui/components/docitemimport/step-preview.js

import ImportConfig from '../../../config/import-config.js';
import ModalTabs from '../shared/modal-tabs.js';
import ReadOnlySheetGrid from '../shared/read-only-sheet-grid.js';

/**
 * Third step of the import wizard - preview the mapped data
 * Shows a read-only preview of how data will be imported
 */
export class StepPreview {
    /**
     * Create a new preview step
     * @param {Object} options - Configuration options
     * @param {Object} options.fileData - File data from first step
     * @param {Object} options.metadata - File metadata (worksheets, preview)
     * @param {Object} options.mappingConfig - Column mapping configuration
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     */
    constructor(options = {}) {
        this.parentModal = options.parentModal || 'default';
        this.fileData = options.fileData || {};
        this.metadata = options.metadata || { worksheets: [], preview: {} };
        this.mappingConfig = options.mappingConfig || { worksheets: [], mappingsBySheet: {} };
        this.onNext = options.onNext || (() => {});
        this.onError = options.onError || console.error;
        
        // Initialize tab data
        this.worksheetTabs = [];
        this.currentTabId = null;
        
        // UI components
        this.domContainer = null;
        this.tabsContainer = null;
        this.previewContainer = null;
        this.tabs = null;
        
        // Generate preview data
        this._generatePreviewData();
    }
    
    /**
     * Generate preview data from mappings
     */
    _generatePreviewData() {
        this.previewData = {};
        this.mappedHeaders = {};
        
        // Only process included worksheets
        this.worksheetTabs = this.mappingConfig.worksheets.map(sheetName => ({
            id: sheetName,
            name: sheetName
        }));
        
        // Set initial active tab
        if (this.worksheetTabs.length > 0) {
            this.currentTabId = this.worksheetTabs[0].id;
        }
        
        // Process each worksheet
        this.mappingConfig.worksheets.forEach(worksheetName => {
            const sheetConfig = this.mappingConfig.mappingsBySheet[worksheetName] || {};
            const sheetData = this.metadata.preview[worksheetName] || [];
            
            // Skip if no data or start row is beyond available data
            if (!sheetData.length || sheetConfig.startRow >= sheetData.length) {
                this.previewData[worksheetName] = [];
                this.mappedHeaders[worksheetName] = [];
                return;
            }
            
            // Get headers for target fields
            const mappedHeaders = [];
            const headersMap = {
                'question_id': 'ID',
                'question_text': 'Question',
                'question_prefix': 'Question Prefix',
                'guidance': 'Guidance',
                'notes': 'Notes',
                'module': 'Module',
                'owner_username': 'Owner'
            };
            
            // Sort mappings to ensure consistent column order
            const orderedMappings = [...(sheetConfig.mappings || [])].sort((a, b) => {
                const order = [
                    'question_id', 
                    'question_text', 
                    'question_prefix', 
                    'guidance', 
                    'notes', 
                    'module', 
                    'owner_username'
                ];
                return order.indexOf(a.destinationField) - order.indexOf(b.destinationField);
            });
            
            // Create headers row for display
            orderedMappings.forEach(mapping => {
                mappedHeaders.push(headersMap[mapping.destinationField] || mapping.destinationField);
            });
            
            this.mappedHeaders[worksheetName] = mappedHeaders;
            
            // Process data rows - DO NOT include the headers in the data
            const preview = [];
            
            // Get max number of preview rows
            const maxPreviewRows = Math.min(
                5, // Only show 5 rows max in preview
                sheetData.length - sheetConfig.startRow
            );
            
            // Process each data row starting from start row
            for (let i = 0; i < maxPreviewRows; i++) {
                const sourceRowIndex = sheetConfig.startRow + i;
                const sourceRow = sheetData[sourceRowIndex];
                
                if (!sourceRow) continue;
                
                const mappedRow = [];
                
                // Map source columns to destination fields
                orderedMappings.forEach(mapping => {
                    const sourceColIndex = mapping.sourceColumn;
                    let value = '';
                    
                    // Get value from source if column exists
                    if (sourceColIndex !== undefined && sourceColIndex !== null && 
                        sourceColIndex < sourceRow.length) {
                        value = sourceRow[sourceColIndex];
                    }
                    
                    // Special handling for question_text with question_prefix
                    if (mapping.destinationField === 'question_text') {
                        // Check if we have a question_prefix mapping
                        const prefixMapping = sheetConfig.mappings.find(m => 
                            m.destinationField === 'question_prefix'
                        );
                        
                        if (prefixMapping && prefixMapping.sourceColumn !== null && 
                            prefixMapping.sourceColumn < sourceRow.length) {
                            const prefix = sourceRow[prefixMapping.sourceColumn];
                            if (prefix && String(prefix).trim()) {
                                value = `${prefix}: ${value}`;
                            }
                        }
                    }
                    
                    mappedRow.push(value);
                });
                
                preview.push(mappedRow);
            }
            
            this.previewData[worksheetName] = preview;
        });
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
        stepContent.className = 'import-step import-step-preview';
        
        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Preview Mapped Data';
        stepContent.appendChild(titleEl);
        
        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Review how your data will look after import. Make sure all columns are mapped correctly before proceeding.';
        stepContent.appendChild(descriptionEl);
        
        // Check if we have any included worksheets
        if (this.worksheetTabs.length === 0) {
            const noSheetsMessage = document.createElement('div');
            noSheetsMessage.className = 'no-sheets-message';
            noSheetsMessage.textContent = 'No worksheets have been selected for import. Please go back and include at least one worksheet.';
            stepContent.appendChild(noSheetsMessage);
            
            container.appendChild(stepContent);
            return;
        }
        
        // Create worksheet tabs section
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'worksheet-tabs-container';
        stepContent.appendChild(this.tabsContainer);
        
        // Create preview container
        this.previewContainer = document.createElement('div');
        this.previewContainer.className = 'preview-container';
        stepContent.appendChild(this.previewContainer);
        
        // Summary info section
        const summarySection = document.createElement('div');
        summarySection.className = 'preview-summary-section';
        
        const summaryLabel = document.createElement('div');
        summaryLabel.className = 'preview-summary-label';
        summaryLabel.textContent = 'Import Summary:';
        summarySection.appendChild(summaryLabel);
        
        const summaryInfo = document.createElement('div');
        summaryInfo.className = 'preview-summary-info';
        
        // Count total questions
        let totalQuestions = 0;
        Object.keys(this.previewData).forEach(sheet => {
            const sheetData = this.previewData[sheet];
            // Subtract 1 for header row
            totalQuestions += Math.max(0, sheetData.length - 1);
        });
        
        summaryInfo.innerHTML = `
            <div><strong>File:</strong> ${this.fileData.name}</div>
            <div><strong>Worksheets:</strong> ${this.worksheetTabs.length}</div>
            <div><strong>Preview Questions:</strong> ${totalQuestions} (actual import may contain more rows)</div>
        `;
        
        summarySection.appendChild(summaryInfo);
        stepContent.appendChild(summarySection);
        
        container.appendChild(stepContent);
        
        // Initialize tabs
        this._initializeTabs();
        
        // Initialize with the current tab
        if (this.currentTabId) {
            this._loadWorksheetTab(this.currentTabId);
        }
    }
    
    /**
     * Initialize the tab component
     */
    _initializeTabs() {
        if (!this.tabsContainer || this.worksheetTabs.length === 0) return;
        
        // Setup tabs
        this.tabs = new ModalTabs({
            tabs: this.worksheetTabs,
            currentTabId: this.currentTabId,
            onTabSelected: (tabId) => {
                this.currentTabId = tabId;
                this._loadWorksheetTab(tabId);
            }
        });
        
        this.tabs.render(this.tabsContainer);
    }
    
    /**
     * Load worksheet tab content
     * @param {string} worksheetId - The worksheet ID
     */
    _loadWorksheetTab(worksheetId) {
        if (!this.previewContainer) return;
        
        this.previewContainer.innerHTML = '';
        
        const preview = this.previewData[worksheetId] || [];
        const headers = this.mappedHeaders[worksheetId] || [];
        
        // Show message if no preview data
        if (!preview.length) {
            const noDataMessage = document.createElement('div');
            noDataMessage.className = 'no-data-message';
            noDataMessage.textContent = 'No preview data available for this worksheet.';
            this.previewContainer.appendChild(noDataMessage);
            return;
        }
        
        // Create grid container
        const gridContainer = document.createElement('div');
        gridContainer.className = 'import-grid-container';
        this.previewContainer.appendChild(gridContainer);
        
        // Create a grid with the headers as the first row and actual data rows after
        // CRITICAL FIX: Don't include headers in the data array, but pass them separately
        const gridData = [...preview]; // Only include the actual data rows
        
        // Create a read-only grid with the preview data
        const grid = new ReadOnlySheetGrid({
            data: gridData,
            hasHeader: true,
            startRow: 0, // Not actually used when disableRowSelection is true
            maxVisibleRows: gridData.length,
            maxVisibleCols: gridData[0]?.length || 0,
            disableRowSelection: true, // Disable row selection in preview mode
            customHeaders: headers, // Pass headers separately to avoid duplication
            disableCellTooltips: true // Disable cell tooltips in preview mode
        });
        
        grid.render(gridContainer);
        
        // Add note about preview limitations
        const previewNote = document.createElement('div');
        previewNote.className = 'preview-note';
        previewNote.innerHTML = `
            <div class="note-icon"><i class="fas fa-info-circle"></i></div>
            <div class="note-text">
                This preview shows how your data will be structured after import.
                The actual import will process all rows from the selected start row.
            </div>
        `;
        this.previewContainer.appendChild(previewNote);

        this._notifyWizard();
    }
    
    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }
    
    canProceed(showErrors = false) {
        // Need at least one worksheet with data
        const hasWorksheets = this.worksheetTabs.length > 0;
        if (!hasWorksheets && showErrors) {
            this.onError('No worksheets selected for import. Please go back and include at least one worksheet.');
        }
        return hasWorksheets;
    }
    
    proceed() {
        if (!this.canProceed(true)) {
            return;
        }
        
        // Calculate total rows that will be imported
        let totalRows = 0;
        
        for (const worksheet of this.mappingConfig.worksheets) {
            const sheetConfig = this.mappingConfig.mappingsBySheet[worksheet] || {};
            const sheetData = this.metadata.preview[worksheet] || [];
            
            const startRow = sheetConfig.startRow || 0;
            const rowCount = Math.max(0, sheetData.length - startRow);
            
            totalRows += rowCount;
        }
        
        // Pass the preview data and total count to next step
        this.onNext({
            totalRows,
            previewData: this.previewData
        });
    }
    
    reset() {
        // Reset preview data
        this.previewData = {};
        this.mappedHeaders = {};
        
        // Reset UI components
        this.grid = null;
        
        // Regenerate preview data if we have mapping configuration and metadata
        if (this.mappingConfig && this.metadata) {
            this._generatePreviewData();
        }
        
        this._notifyWizard();
    }
}

export default StepPreview;