import { QuestionsGridController } from "./stage-form-rfp-answer-questions-grid-controller.js";
import { QuestionsGridFormatting } from "./stage-form-rfp-answer-questions-grid-formatting.js";

/**
 * ThrottledGridUpdater
 * Handles efficient batched updates to AG-Grid to prevent performance issues
 * during real-time job processing updates
 */
class ThrottledGridUpdater {
    constructor(gridApi, updateInterval = 1500) {
        this.gridApi = gridApi;
        this.pendingUpdates = new Map();
        this.updateInterval = updateInterval;
        this.isUpdating = false;
        this.timeoutId = null;
    }
    
    scheduleRowUpdate(itemId, updateData) {
        // Store the update data, merging with any existing pending update
        const existing = this.pendingUpdates.get(itemId) || {};
        this.pendingUpdates.set(itemId, { ...existing, ...updateData });
        
        // Schedule batch processing if not already scheduled
        if (!this.isUpdating) {
            this.isUpdating = true;
            this.timeoutId = setTimeout(() => this.processPendingUpdates(), this.updateInterval);
        }
    }
    
    processPendingUpdates() {
        if (this.pendingUpdates.size === 0) {
            this.isUpdating = false;
            return;
        }
        
        try {
            // Convert map to array of update objects for AG-Grid transaction
            const updates = Array.from(this.pendingUpdates.values());
            
            console.log(`[ThrottledGridUpdater] 🔍 DIAGNOSTIC: About to apply ${updates.length} updates:`, updates);
            
            // Log each update in detail
            updates.forEach((update, i) => {
                console.log(`[ThrottledGridUpdater] 🔍 DIAGNOSTIC: Update ${i}:`, {
                    item_id: update.project_document_stage_group_id_item_id,
                    answer_text: update.answer_text?.slice(0, 50) + '...',
                    status: update.status,
                    _justCompleted: update._justCompleted,
                    _isProcessing: update._isProcessing
                });
            });
            
            // Use AG-Grid's efficient transaction API
            const result = this.gridApi.applyTransaction({ update: updates });
            
            // IMPORTANT: Force AG-Grid to re-evaluate row classes after data update
            // This ensures visual styling (greyed out effects, completion highlights) are properly updated
            console.log(`[ThrottledGridUpdater] 🔄 DIAGNOSTIC: About to call refreshCells to update row classes for ${updates.length} rows`);
            this.gridApi.refreshCells({ 
                force: true,  // Force refresh even if data hasn't changed
                volatile: true // Refresh volatile (computed) data like row classes
            });
            console.log(`[ThrottledGridUpdater] 🔄 DIAGNOSTIC: refreshCells completed`);
            
            // BACKUP: Also try redrawRows as a more aggressive refresh approach
            // This forces complete row re-rendering including class re-evaluation
            console.log(`[ThrottledGridUpdater] 🔄 DIAGNOSTIC: Also calling redrawRows as backup to force class update`);
            const updatedRowNodes = updates.map(update => {
                const rowNode = this.gridApi.getRowNode(update.project_document_stage_group_id_item_id);
                return rowNode;
            }).filter(node => node !== null);
            
            if (updatedRowNodes.length > 0) {
                this.gridApi.redrawRows({ rowNodes: updatedRowNodes });
                console.log(`[ThrottledGridUpdater] 🔄 DIAGNOSTIC: redrawRows completed for ${updatedRowNodes.length} rows`);
            }
            
            console.log(`[ThrottledGridUpdater] ✅ DIAGNOSTIC: Applied ${updates.length} row updates and refreshed row classes`);
            console.log(`[ThrottledGridUpdater] ✅ DIAGNOSTIC: Transaction result:`, result);
        } catch (error) {
            console.error('[ThrottledGridUpdater] ❌ DIAGNOSTIC: Error applying updates:', error);
        } finally {
            this.pendingUpdates.clear();
            this.isUpdating = false;
            this.timeoutId = null;
        }
    }
    
    forceUpdate() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.processPendingUpdates();
    }
    
    destroy() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.pendingUpdates.clear();
        this.isUpdating = false;
    }
}

export class QuestionsGrid {
    constructor({
        projectDocumentId,
        stageId,
        groupId,
        onSelectionChanged,
        currentUsername,
        errorModal,
        messageModal,
        onItemCountChanged,
        store,
        docMetadata,
        autoSaveManager
    }) {
        this.projectDocumentId = projectDocumentId;
        this.stageId = stageId;
        this._groupId = groupId; // Use private property for getter/setter
        this.currentUsername = currentUsername;
        this.onSelectionChanged = onSelectionChanged || (() => {});
        this.gridApi = null;
        
        // Backwards compatibility properties
        this.errorModal = errorModal;
        this.messageModal = messageModal;
        this.onItemCountChanged = onItemCountChanged || (() => {});
        
        // Compact mode state
        this.isCompactMode = false;

        // Initialize controller and formatting modules
        this.controller = new QuestionsGridController({
            projectDocumentId,
            stageId,
            groupId,
            currentUsername,
            errorModal,
            messageModal,
            onItemCountChanged,
            store,
            docMetadata,
            autoSaveManager
        });

        this.formatting = new QuestionsGridFormatting({
            currentUsername,
            isCompactMode: this.isCompactMode
        });

        // Add formatting styles
        this.formatting.addFormattingStyles();
        
        // Loading state tracking
        this.isLoading = false;
        this.loadingOverlayElement = null;
        
        // Phase 2: Real-time processing state management
        this.gridUpdater = null; // Will be initialized when grid is ready
        this.processingJobId = null;
        this.jobEventListeners = []; // Track event listeners for cleanup
        
        // Font size tracking for compact mode row height
        this.currentFontSize = 14; // Default font size - will be updated by ControlPane
    }

    render(container) {
        container.innerHTML = "";
        
        const gridDiv = document.createElement("div");
        gridDiv.classList.add("question-grid-container", "ag-theme-alpine");
        container.appendChild(gridDiv);

        const gridOptions = {
            rowData: [],
            columnDefs: this.formatting.getColumnDefs(),
            rowSelection: "multiple",
            rowHeight: null,
            getRowHeight: this.getRowHeight.bind(this),
            icons: this.formatting.icons,

            getRowId: (params) => {
                // Use the unique project_document_stage_group_id_item_id as the row ID
                return params.data.project_document_stage_group_id_item_id || 
                    params.data.question_id || 
                    `row-${params.rowIndex}`;
            },
            
            // Default column settings
            defaultColDef: {
                resizable: true,
                sortable: true,
                filter: true,
                suppressKeyboardEvent: (params) => {
                    const { event, editing } = params;
                    
                    // Handle Ctrl+Enter or F4 to open detail modal
                    if (!editing && ((event.ctrlKey && event.key === 'Enter') || event.key === 'F4')) {
                        const focusedCell = this.gridApi.getFocusedCell();
                        if (focusedCell) {
                            const rowNode = this.gridApi.getDisplayedRowAtIndex(focusedCell.rowIndex);
                            if (rowNode && rowNode.data) {
                                this.openQuestionDetail(rowNode.data);
                            }
                        }
                        return true; // Prevent default
                    }
                    
                    if (editing) return false;
                    if (event.key === 'F2' || event.key === 'Enter') return false;
                    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End', 'PageUp', 'PageDown'];
                    if (navigationKeys.includes(event.key)) return false;
                    return true;
                }
            },

            // Performance settings
            suppressPropertyNamesCheck: true,
            suppressColumnVirtualisation: false,
            suppressRowVirtualisation: false,
            rowBuffer: 5,
            suppressCellFlash: true,
            suppressScrollOnNewData: true,
            animateRows: false,
            
            // Editing settings
            singleClickEdit: false,
            stopEditingWhenCellsLoseFocus: true,
            
            // Row styling from formatting module
            getRowStyle: (params) => this.formatting.getRowStyle(params),
            getRowClass: (params) => this.formatting.getRowClass(params),
            
            // Navigation enhancement from formatting module
            navigateToNextCell: (params) => this.formatting.navigateToNextCell(params, this.currentUsername),

            // Event handlers - delegate to controller
            onGridReady: (params) => {
                this.gridApi = params.api;
                
                // Phase 2: Initialize ThrottledGridUpdater for real-time updates
                this.gridUpdater = new ThrottledGridUpdater(this.gridApi, 1500);
                
                // Subscribe to job completion events from AdaptiveJobController
                this.subscribeToJobEvents();
            },

            onSelectionChanged: () => {
                if (this.gridApi) {
                    this.controller.handleSelectionChanged(this.gridApi, this.onSelectionChanged);
                }
            },

            onCellEditingStarted: async (params) => {
                await this.controller.handleCellEditingStarted(params, this.gridApi);
            },

            onCellEditingStopped: async (params) => {
                await this.controller.handleCellEditingStopped(params, this.gridApi);
            },

            onCellValueChanged: (params) => {
                this.controller.handleCellValueChanged(params);
            },

            // REMOVED: Double-click should NOT open detail modal
            // Instead, double-click should trigger standard AG Grid editing behavior
            // The detail modal is now only accessible via the Details button in ControlPane
            
            // Allow standard AG Grid double-click editing behavior
            onCellDoubleClicked: null  // Let AG Grid handle this naturally

            // Removed getContextMenuItems - requires Enterprise license
        };

        agGrid.createGrid(gridDiv, gridOptions);
    }

    setData(items) {
        if (!this.gridApi || !Array.isArray(items)) return;
        
        // Use controller to preprocess data
        const processedItems = this.controller.preprocessGridData(items);
        
        // Clean and format data for display
        const cleanItems = processedItems.map(item => ({
            project_document_stage_group_id_item_id: item.project_document_stage_group_id_item_id || '',
            question_id: item.question_id || '',
            question_text: item.question_text || '',
            guidance: item.guidance || '',
            answer_text: item.answer_text || '',
            ai_answer_text: item.ai_answer_text || item.original_answer || '',
            risk_rating: item.risk_rating || '',
            completeness: item.completeness || item.percentage_answer_complete || '',
            ai_answer_date: item.ai_answer_date || item.answer_generation_datetime || '',
            content: item.content || '',
            owner_username: item.owner_username || '',
            status: item.status || 'NEW',
            locked_by: item.locked_by || '',
            modified_by: item.modified_by || '',
            modified_datetime: item.modified_datetime || '',
            notes: item.notes || '',
            answer_complies: item.answer_complies || ''
        }));
        
        this.gridApi.setGridOption('rowData', cleanItems);
    }

    /**
     * Update the group ID when parent component changes it
     * This handles both direct property assignment and method calls
     */
    setGroupId(groupId) {
        this.groupId = groupId;
        if (this.controller) {
            this.controller.setGroupId(groupId);
        }
    }

    /**
     * Getter/setter for groupId to catch direct assignments
     */
    set groupId(value) {
        this._groupId = value;
        if (this.controller) {
            this.controller.setGroupId(value);
        }
    }

    get groupId() {
        return this._groupId;
    }

    getSelectedRows() {
        if (!this.gridApi) return [];
        return this.gridApi.getSelectedRows();
    }

    // Delegate to controller methods
    addNewRow() {
        if (this.controller) {
            this.controller.addNewRow(this.gridApi);
        }
    }

    removeRows(itemSortKeys) {
        if (this.controller) {
            this.controller.removeRows(this.gridApi, itemSortKeys);
        }
    }

    updateRows(updatedItems) {
        if (this.controller) {
            this.controller.updateRows(this.gridApi, updatedItems);
        }
    }

    unlockSelectedRows(selectedRows) {
        if (this.controller) {
            return this.controller.unlockSelectedRows(this.gridApi, selectedRows);
        }
        return false;
    }

    // Placeholder methods for backwards compatibility
    showLoadingOverlay(message = "Loading...") {
        this.isLoading = true;
        
        if (this.loadingOverlayElement) {
            this.hideLoadingOverlay();
        }
        
        const gridContainer = document.querySelector('.question-grid-container');
        if (!gridContainer) return;
        
        this.loadingOverlayElement = document.createElement('div');
        this.loadingOverlayElement.className = 'grid-loading-overlay';
        this.loadingOverlayElement.innerHTML = `
            <div class="grid-loading-spinner"></div>
            <div class="grid-loading-text">${message}</div>
        `;
        
        gridContainer.appendChild(this.loadingOverlayElement);
    }

    hideLoadingOverlay() {
        this.isLoading = false;
        
        if (this.loadingOverlayElement && this.loadingOverlayElement.parentNode) {
            this.loadingOverlayElement.parentNode.removeChild(this.loadingOverlayElement);
            this.loadingOverlayElement = null;
        }
        
        // Show appropriate message if no data
        if (this.gridApi) {
            setTimeout(() => {
                const rowCount = this.gridApi.getDisplayedRowCount();
                if (rowCount === 0 && !this.isLoading) {
                    this.showNoRowsOverlay();
                }
            }, 100);
        }
    }

    showNoRowsOverlay(message = "No rows to display") {
        if (!this.gridApi || this.isLoading) return;
        
        // Use AG Grid's built-in no rows overlay
        this.gridApi.showNoRowsOverlay();
    }

    toggleCompactView() {
        this.isCompactMode = !this.isCompactMode;
        
        if (this.formatting) {
            this.formatting.setCompactMode(this.isCompactMode);
        }
        
        if (this.gridApi) {
            // Update column definitions to reflect compact mode
            this.gridApi.setGridOption('columnDefs', this.formatting.getColumnDefs());
            
            // Force refresh of all cells to apply new styling (especially ellipsis changes)
            this.gridApi.refreshCells({ force: true });
            
            // Force grid to recalculate row heights
            this.gridApi.resetRowHeights();
        }
    }

    /**
     * Calculate row height based on compact mode and font size
     * @param {Object} params - AG Grid row params
     * @returns {number|null} - Row height in pixels, or null for auto height
     */
    getRowHeight(params) {
        if (this.isCompactMode) {
            const fontSize = this.currentFontSize;
            const lineHeight = 1.1;
            const padding = 4;
            const calculatedHeight = Math.max(24, fontSize * lineHeight + padding + 4);
            return calculatedHeight;
        }
        return null;
    }

    /**
     * Update the font size and recalculate row heights for compact mode
     * @param {number} fontSize - The new font size in pixels
     */
    updateFontSize(fontSize) {
        this.currentFontSize = fontSize;
        
        if (this.gridApi) {
            if (this.isCompactMode) {
                const calculatedHeight = Math.max(24, fontSize * 1.1 + 8);
                this.gridApi.setGridOption('getRowHeight', null);
                this.gridApi.setGridOption('rowHeight', calculatedHeight);
            } else {
                this.gridApi.setGridOption('getRowHeight', null);
                this.gridApi.setGridOption('rowHeight', null);
            }
        }
    }

    /**
     * Set compact mode state and update font size if needed
     * @param {boolean} isCompact - Whether compact mode is enabled
     */
    setCompactMode(isCompact) {
        this.isCompactMode = isCompact;
        
        if (this.formatting) {
            this.formatting.setCompactMode(this.isCompactMode);
        }
        
        if (this.gridApi) {
            // Update column definitions to reflect compact mode
            this.gridApi.setGridOption('columnDefs', this.formatting.getColumnDefs());
            
            // Update row height calculation function
            this.gridApi.setGridOption('getRowHeight', this.getRowHeight.bind(this));
            
            // Force refresh of all cells to apply new styling
            this.gridApi.refreshCells({ force: true });
            
            // Do NOT call resetRowHeights() as it conflicts with auto-height configuration
            // The getRowHeight function will handle dynamic heights based on compact mode
        }
    }



    openQuestionDetail(questionData) {
        if (this.controller) {
            this.controller.openQuestionDetail(questionData, this.gridApi);
        }
    }

    refreshGridData() {
        // Placeholder - do nothing in minimal version
    }

    // Filter methods for control pane integration
    filterAll() {
        if (this.controller && this.gridApi) {
            this.controller.filterAll(this.gridApi);
        }
    }

    filterAssignedToMe() {
        if (this.controller && this.gridApi) {
            this.controller.filterAssignedToMe(this.gridApi);
        }
    }

    filterUnconfirmed() {
        if (this.controller && this.gridApi) {
            this.controller.filterUnconfirmed(this.gridApi);
        }
    }

    // ============================
    // Phase 2: Processing State Management
    // ============================

    /**
     * Subscribe to job completion events from AdaptiveJobController
     */
    subscribeToJobEvents() {
        console.log('[QuestionsGrid] Setting up event listeners');
        
        // Subscribe to question completion events
        const questionCompletionHandler = (event) => {
            this.handleQuestionCompletion(event.detail);
        };
        
        document.addEventListener('questionCompletion', questionCompletionHandler);
        this.jobEventListeners.push({
            element: document,
            event: 'questionCompletion',
            handler: questionCompletionHandler
        });

        // Subscribe to job state changes
        const jobStateChangeHandler = (event) => {
            this.handleJobStateChange(event.detail);
        };
        
        document.addEventListener('jobStateChange', jobStateChangeHandler);
        this.jobEventListeners.push({
            element: document,
            event: 'jobStateChange',
            handler: jobStateChangeHandler
        });
    }

    /**
     * Mark specific rows as processing
     */
    markRowsAsProcessing(selectedRows, jobId) {
        if (!this.gridApi || !this.gridUpdater) return;

        console.log(`[QuestionsGrid] Marking ${selectedRows.length} rows as processing for job ${jobId}`);
        
        this.processingJobId = jobId;

        selectedRows.forEach(row => {
            const itemId = row.project_document_stage_group_id_item_id;
            if (itemId) {
                // Update row data with processing state
                const updateData = {
                    ...row,
                    _isProcessing: true,
                    _processingJob: jobId,
                    _processingStartTime: Date.now(),
                    _justCompleted: false,
                    _processingError: null
                };

                this.gridUpdater.scheduleRowUpdate(itemId, updateData);
            }
        });

        // Force immediate update for processing state
        this.gridUpdater.forceUpdate();
    }

    /**
     * Clear processing indicators from all rows
     */
    clearProcessingIndicators(selectedRows) {
        if (!this.gridApi || !this.gridUpdater) return;

        console.log('[QuestionsGrid] Clearing processing indicators');

        if (selectedRows) {
            // Clear specific rows
            selectedRows.forEach(row => {
                const itemId = row.project_document_stage_group_id_item_id;
                if (itemId) {
                    const updateData = {
                        ...row,
                        _isProcessing: false,
                        _processingJob: null,
                        _processingStartTime: null,
                        _processingError: null
                    };
                    this.gridUpdater.scheduleRowUpdate(itemId, updateData);
                }
            });
        } else {
            // Clear all processing rows (fallback)
            this.gridApi.forEachNode((node) => {
                if (node.data && node.data._isProcessing) {
                    const updateData = {
                        ...node.data,
                        _isProcessing: false,
                        _processingJob: null,
                        _processingStartTime: null,
                        _processingError: null
                    };
                    this.gridUpdater.scheduleRowUpdate(
                        node.data.project_document_stage_group_id_item_id,
                        updateData
                    );
                }
            });
        }

        this.processingJobId = null;
    }

    /**
     * Handle individual question completion events
     */
    handleQuestionCompletion(completionData) {
        const { jobId, completion } = completionData;
        
        // Only handle completions for the current processing job
        if (jobId !== this.processingJobId) {
            console.log(`[QuestionsGrid] Ignoring completion for job ${jobId} (current processing job: ${this.processingJobId})`);
            return;
        }

        if (!this.gridApi || !this.gridUpdater) {
            console.error(`[QuestionsGrid] Missing critical components for completion handling`);
            return;
        }
        
        // Find the row that matches this completion
        let targetRowData = null;
        
        this.gridApi.forEachNode((node) => {
            if (node.data) {
                const fullSortKey = node.data.project_document_stage_group_id_item_id;
                // Extract item ID from sort key: STG#...#GRP#...#ITEM#item_abc123 -> item_abc123
                const extractedItemId = fullSortKey.includes('#ITEM#') ? fullSortKey.split('#ITEM#')[1] : fullSortKey;
                
                if (extractedItemId === completion.item_id) {
                    targetRowData = node.data;
                }
            }
        });

        if (targetRowData) {
            console.log(`[QuestionsGrid] Processing completion for item ${completion.item_id}`);
            
            // Update the row with the completed answer
            const updateData = {
                ...targetRowData,
                answer_text: completion.answer.answer_text,
                ai_answer_text: completion.answer.answer_text,
                ai_answer_date: completion.answer.generated_datetime,
                status: 'ANSWER_GENERATED',
                _isProcessing: false,
                _justCompleted: true,
                _processingJob: null,
                _completionTime: Date.now()
            };

            this.gridUpdater.scheduleRowUpdate(completion.item_id, updateData);
            
            // Force immediate update to clear processing styles
            this.gridUpdater.forceUpdate();
            
            // Clear processing CSS classes directly
            setTimeout(() => {
                try {
                    const rowElements = document.querySelectorAll(`[row-id="${completion.item_id}"]`);
                    rowElements.forEach(rowEl => {
                        rowEl.classList.remove('question-processing');
                    });
                } catch (error) {
                    console.error(`[QuestionsGrid] Failed to clear processing CSS class:`, error);
                }
            }, 100);

            // Clear the completion highlight after animation
            setTimeout(() => {
                const finalUpdateData = {
                    ...updateData,
                    _justCompleted: false
                };
                this.gridUpdater.scheduleRowUpdate(completion.item_id, finalUpdateData);
            }, 2000);
        } else {
            console.warn(`[QuestionsGrid] No matching row found for completion: ${completion.item_id}`);
        }
    }

    /**
     * Handle job state changes
     */
    handleJobStateChange(stateChangeData) {
        const { jobId, eventType, jobData } = stateChangeData;

        // Only handle events for the current processing job
        if (jobId !== this.processingJobId) return;

        console.log(`[QuestionsGrid] Job state change: ${eventType} for job ${jobId}`);

        switch (eventType) {
            case 'COMPLETED':
                // Clear any remaining processing indicators
                this.clearProcessingIndicators();
                break;

            case 'FAILED':
                // Mark any remaining processing rows as failed
                this.markProcessingRowsAsError(jobId);
                break;

            case 'CANCELLED':
                // Clear processing indicators
                this.clearProcessingIndicators();
                break;
        }
    }

    /**
     * Mark any remaining processing rows as having errors
     */
    markProcessingRowsAsError(jobId) {
        if (!this.gridApi || !this.gridUpdater) return;

        this.gridApi.forEachNode((node) => {
            if (node.data && node.data._isProcessing && node.data._processingJob === jobId) {
                const updateData = {
                    ...node.data,
                    _isProcessing: false,
                    _processingError: 'Job failed',
                    _processingJob: null
                };
                this.gridUpdater.scheduleRowUpdate(
                    node.data.project_document_stage_group_id_item_id,
                    updateData
                );
            }
        });
    }

    /**
     * Clean up event listeners for job events
     */
    unsubscribeFromJobEvents() {
        this.jobEventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.jobEventListeners = [];
        console.log('[QuestionsGrid] Unsubscribed from job events');
    }

    destroy() {
        // Phase 2: Clean up real-time processing resources
        this.unsubscribeFromJobEvents();
        
        if (this.gridUpdater) {
            this.gridUpdater.destroy();
            this.gridUpdater = null;
        }
        
        if (this.controller) {
            this.controller.destroy();
        }
        
        if (this.formatting) {
            this.formatting.destroy();
        }
        
        if (this.gridApi) {
            this.gridApi.destroy();
            this.gridApi = null;
        }
    }
}