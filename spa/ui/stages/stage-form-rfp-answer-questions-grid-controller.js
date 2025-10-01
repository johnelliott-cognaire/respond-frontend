import {
    updateDocumentItemAttribute,
    lockOrUnlockDocumentItem,
    bulkUnlockDocumentItems,
    createDocumentItem
} from "../../api/documents.js";
import { showUserError, showSuccessNotification } from "../../utils/error-handling-utils.js";
import { QuestionDetailModal } from "../../ui/modals/question-detail-modal.js";
import { getFreshSecurity } from "../../state/security.js";

/**
 * QuestionsGridController
 * Handles all logic, API integration, and data management for the QuestionsGrid
 */
export class QuestionsGridController {
    constructor({
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
    }) {
        this.projectDocumentId = projectDocumentId;
        this.stageId = stageId;
        this.groupId = groupId;
        this.currentUsername = currentUsername;
        this.errorModal = errorModal;
        this.messageModal = messageModal;
        this.onItemCountChanged = onItemCountChanged || (() => { });
        this.store = store;
        this.docMetadata = docMetadata || {};
        this.autoSaveManager = autoSaveManager;

        this.newRowCounter = 0;
        this.selectionDebounceTimer = null;

        // Initialize security
        this.security = getFreshSecurity(this.store);

        // Initialize the question detail modal
        this.questionDetailModal = new QuestionDetailModal();
    }

    /**
     * Generate a new row ID for temporary use
     */
    generateNewRowId() {
        this.newRowCounter++;
        return `NEW-${this.newRowCounter}`;
    }

    /**
     * Track DocumentItems save operation via AutoSaveManager
     * @private
     */
    _trackDocumentItemSave(operation, status, details = {}) {
        if (this.autoSaveManager && this.autoSaveManager.trackDocumentItemSave) {
            this.autoSaveManager.trackDocumentItemSave(operation, status, details);
        } else {
            console.log(`[GridController] DocumentItems ${operation} ${status}:`, details);
        }
    }

    /**
     * Validate question ID format
     */
    isValidQuestionId(id) {
        return /^[a-zA-Z0-9_-]+$/.test(id);
    }

    /**
     * Normalize percentage values
     */
    normalizePercentage(value) {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        if (isNaN(num)) return null;
        return Math.max(0, Math.min(100, num));
    }

    /**
     * Preprocess grid data for better performance and validation
     */
    preprocessGridData(items) {
        if (!Array.isArray(items)) return [];

        const seenIds = new Set();
        let duplicateCount = 0;
        let duplicateWarningCount = 0;
        const MAX_DUPLICATE_WARNINGS = 5; // Limit console spam

        return items.map((item, index) => {
            // Handle duplicate question IDs
            if (item.question_id && seenIds.has(item.question_id)) {
                if (duplicateWarningCount < MAX_DUPLICATE_WARNINGS) {
                    console.info(`[GridController] Duplicate question ID detected (expected behavior): ${item.question_id}`);
                    duplicateWarningCount++;
                } else if (duplicateWarningCount === MAX_DUPLICATE_WARNINGS) {
                    console.warn(`[GridController] Further duplicate question ID warnings suppressed (found ${duplicateCount + 1}+ duplicates)`);
                    duplicateWarningCount++;
                }
                item.question_id = `${item.question_id}_dup_${++duplicateCount}`;
            }

            if (item.question_id) {
                seenIds.add(item.question_id);
            }

            return {
                ...item,
                question_id: item.question_id || `AUTO_${Date.now()}_${index}`,
                question_text: item.question_text || '',
                guidance: item.guidance || '',
                answer_text: item.answer_text || '',
                ai_answer_text: item.ai_answer_text || item.original_answer || '',
                notes: item.notes || '',
                status: item.status || 'NEW',
                owner_username: item.owner_username || '',
                risk_rating: this.normalizePercentage(item.risk_rating),
                completeness: this.normalizePercentage(item.completeness || item.percentage_answer_complete),
                ai_answer_date: item.ai_answer_date || item.answer_generation_datetime || null,
                locked_by: item.locked_by || null
            };
        });
    }

    /**
     * Handle cell editing started event
     */
    async handleCellEditingStarted(params, gridApi) {
        const { data, colDef } = params;
        const fieldName = colDef.field;
        const rowId = data.project_document_stage_group_id_item_id || `row-${params.rowIndex}`;

        if (data.isNewRow) return;

        if (data.locked_by && data.locked_by !== this.currentUsername) {
            console.warn(`Row locked by ${data.locked_by}, cannot edit`);
            gridApi.stopEditing(true);
            return;
        }

        if (!data.locked_by) {
            try {
                if (typeof lockOrUnlockDocumentItem === 'function') {
                    const result = await lockOrUnlockDocumentItem(
                        this.projectDocumentId,
                        this.stageId,
                        this.groupId,
                        rowId,
                        true,
                        this.currentUsername
                    );

                    if (result) {
                        data.locked_by = this.currentUsername;
                        params.node.setData(data);
                    }
                } else {
                    console.warn("lockOrUnlockDocumentItem not available, using mock");
                    data.locked_by = this.currentUsername;
                    params.node.setData(data);
                }
            } catch (err) {
                console.error(`Error locking row ${rowId}:`, err);
                data.locked_by = this.currentUsername;
                params.node.setData(data);
            }
        }
    }

    /**
     * Handle cell editing stopped event
     */
    async handleCellEditingStopped(params, gridApi) {
        const { oldValue, newValue, data, colDef } = params;
        const fieldName = colDef.field;
        const rowId = data.project_document_stage_group_id_item_id || `row-${params.rowIndex}`;

        // PERMISSION VALIDATION - Check if user can edit this document
        const validation = this.security.validateDocumentOperation(
            this.projectDocumentId, 
            this.docMetadata, 
            'EDIT'
        );
        
        if (!validation.allowed) {
            console.warn(`[GridController] Permission denied for edit operation: ${validation.message}`);
            
            // Revert the change
            data[fieldName] = oldValue;
            params.node.setData(data);
            
            // Show enhanced error message using security framework
            this.security.showPermissionError(
                this.errorModal,
                'document_edit',
                this.docMetadata,
                validation.message
            );
            return;
        }

        // Check for duplicate ID if the ID field was changed
        if (fieldName === 'question_id' && oldValue !== newValue && newValue) {
            let hasDuplicate = false;
            let existingRowIndex = -1;

            gridApi.forEachNode((node, index) => {
                if (node.data === data) return;
                if (node.data.question_id === newValue) {
                    hasDuplicate = true;
                    existingRowIndex = index;
                }
            });

            if (hasDuplicate) {
                this.showValidationError(`The ID '${newValue}' is already used by another question at row ${existingRowIndex + 1}. Please use a unique ID.`);
                data.question_id = oldValue || this.generateNewRowId();
                params.node.setData(data);
                return;
            }
        }

        // Handle new row creation
        if (data.isNewRow && oldValue !== newValue) {
            data.isNewRow = false;

            if (!data.question_id) data.question_id = this.generateNewRowId();
            if (!data.question_text) data.question_text = '';
            if (!data.guidance) data.guidance = '';
            if (!data.answer_text) data.answer_text = '';
            if (!data.status) data.status = 'NEW';

            data.modified_by = this.currentUsername;
            data.modified_datetime = new Date().toISOString();

            try {
                if (typeof createDocumentItem === 'function') {
                    const effectiveGroupId = this.groupId;

                    if (!this.projectDocumentId || !this.stageId || !effectiveGroupId) {
                        this.showValidationError("Missing required project, stage, or group information. Please refresh and try again.");
                        return;
                    }

                    const createdItem = await createDocumentItem(
                        this.projectDocumentId,
                        this.stageId,
                        effectiveGroupId,
                        data
                    );

                    if (createdItem) {
                        // Update the data with the new item from backend
                        Object.assign(data, createdItem);
                        params.node.setData(data);
                        
                        // Track successful DocumentItems save
                        this._trackDocumentItemSave('create-item', 'success', {
                            itemId: createdItem.project_document_stage_group_id_item_id || data.question_id
                        });
                        
                        // Don't call onItemCountChanged here as it was already called in addNewRow
                        // and the count hasn't actually changed (just the item was persisted)
                    }
                } else {
                    console.log("Mock creating new row:", data);
                    data.project_document_stage_group_id_item_id = `STG#${this.stageId}#GRP#${this.groupId}#ITEM#${data.question_id}`;
                    params.node.setData(data);
                }
            } catch (err) {
                console.error("Error creating new row:", err);
                
                // Track failed DocumentItems save
                this._trackDocumentItemSave('create-item', 'error', {
                    error: err.message,
                    questionId: data.question_id
                });
                
                this.showValidationError(`Error creating new item: ${err.message || "Unknown error"}`);
            }

            return;
        }

        // Update existing row
        if (oldValue !== newValue && !data.isNewRow && newValue !== undefined) {
            try {
                if (typeof updateDocumentItemAttribute === 'function') {
                    const updatedItem = await updateDocumentItemAttribute(
                        this.projectDocumentId,
                        this.stageId,
                        this.groupId,
                        rowId,
                        fieldName,
                        newValue
                    );

                    if (updatedItem) {
                        data[fieldName] = updatedItem[fieldName];
                        data.modified_datetime = updatedItem.modified_datetime || new Date().toISOString();
                        data.modified_by = updatedItem.modified_by || this.currentUsername;
                        params.node.setData(data);
                        
                        // Track successful DocumentItems save
                        this._trackDocumentItemSave('grid-cell', 'success', {
                            fieldName,
                            rowId,
                            value: newValue
                        });
                    }
                } else {
                    console.warn("updateDocumentItemAttribute not available, using mock");
                    data[fieldName] = newValue;
                    data.modified_by = this.currentUsername;
                    data.modified_datetime = new Date().toISOString();
                    params.node.setData(data);
                }
            } catch (err) {
                console.error(`Error updating ${fieldName} for row ${rowId}:`, err);
                
                // Track failed DocumentItems save
                this._trackDocumentItemSave('grid-cell', 'error', {
                    fieldName,
                    rowId,
                    error: err.message
                });
                
                data[fieldName] = newValue;
                data.modified_by = this.currentUsername;
                data.modified_datetime = new Date().toISOString();
                params.node.setData(data);
            }
        }

        // Unlock the row
        if (data.locked_by === this.currentUsername && !data.isNewRow) {
            try {
                if (typeof lockOrUnlockDocumentItem === 'function') {
                    await lockOrUnlockDocumentItem(
                        this.projectDocumentId,
                        this.stageId,
                        this.groupId,
                        rowId,
                        false,
                        this.currentUsername
                    );

                    data.locked_by = null;
                    params.node.setData(data);
                } else {
                    console.warn("lockOrUnlockDocumentItem not available, using mock");
                    data.locked_by = null;
                    params.node.setData(data);
                }
            } catch (err) {
                console.error(`Error unlocking row ${rowId}:`, err);
                data.locked_by = null;
                params.node.setData(data);
            }
        }
    }

    /**
     * Handle cell value changed event
     */
    handleCellValueChanged(params) {
        const { data, colDef, newValue, oldValue } = params;

        if (colDef.field === 'question_id') {
            if (newValue && !this.isValidQuestionId(newValue)) {
                this.showValidationError('Question ID must be alphanumeric and may contain hyphens or underscores');
                setTimeout(() => {
                    data[colDef.field] = oldValue;
                    params.node.setData(data);
                }, 100);
                return;
            }
        }
    }

    /**
     * Handle selection changed with debouncing
     */
    handleSelectionChanged(gridApi, onSelectionChanged) {
        if (this.selectionDebounceTimer) {
            clearTimeout(this.selectionDebounceTimer);
        }

        this.selectionDebounceTimer = setTimeout(() => {
            const selectedRows = gridApi.getSelectedRows();
            if (onSelectionChanged) {
                onSelectionChanged(selectedRows);
            }
        }, 50);
    }

    /**
     * Update the group ID (called by parent when group changes)
     */
    setGroupId(groupId) {
        this.groupId = groupId;
    }

    /**
     * Add a new empty row to the grid
     */
    addNewRow(gridApi) {
        if (!gridApi) {
            this.showValidationError("The grid is not yet initialized. Please try again in a moment.");
            return;
        }

        // PERMISSION VALIDATION - Check if user can create new document items
        const validation = this.security.validateDocumentOperation(
            this.projectDocumentId, 
            this.docMetadata, 
            'EDIT'
        );
        
        if (!validation.allowed) {
            console.warn(`[GridController] Permission denied for add new row: ${validation.message}`);
            
            // Show enhanced error message using security framework
            this.security.showPermissionError(
                this.errorModal,
                'document_edit',
                this.docMetadata,
                validation.message
            );
            return;
        }

        // Get the current groupId from the parent (it might have changed)
        const currentGroupId = this.groupId;
        if (!currentGroupId) {
            this.showValidationError("No topic sheet is currently selected. Please select a topic sheet first.");
            return;
        }

        const newRow = {
            question_id: this.generateNewRowId(),
            question_text: '',
            guidance: '',
            answer_text: '',
            notes: '',
            owner_username: this.currentUsername,
            status: 'NEW',
            modified_by: this.currentUsername,
            modified_datetime: new Date().toISOString(),
            isNewRow: true
        };

        // Add row at the top (index 0)
        gridApi.applyTransaction({ add: [newRow], addIndex: 0 });

        const currentCount = gridApi.getDisplayedRowCount();
        if (this.onItemCountChanged && currentGroupId) {
            this.onItemCountChanged(currentGroupId, currentCount);
        }

        // Scroll to top and start editing the new row
        setTimeout(() => {
            // Scroll to top to ensure new row is visible
            gridApi.ensureIndexVisible(0, 'top');

            // Select the new row
            const firstNode = gridApi.getDisplayedRowAtIndex(0);
            if (firstNode) {
                firstNode.setSelected(true);

                // Start editing the question_text cell
                gridApi.startEditingCell({
                    rowIndex: 0,
                    colKey: 'question_text'
                });
            }
        }, 100);
    }

    /**
     * Remove rows from the grid by their sort keys
     */
    removeRows(gridApi, itemSortKeys) {
        if (!gridApi) {
            this.showValidationError("The grid is not yet initialized. Please try again in a moment.");
            return;
        }

        console.log('[GridController] removeRows called with keys:', itemSortKeys);
        
        // Since AG Grid is having trouble with row ID mappings for newly created rows,
        // let's refresh the entire grid data instead of using transactions
        console.log('[GridController] Refreshing grid data after delete operation');
        
        // Get all current data except the ones to be removed
        const allData = [];
        gridApi.forEachNode((node) => {
            const nodeId = node.data.project_document_stage_group_id_item_id;
            if (!itemSortKeys.includes(nodeId)) {
                allData.push(node.data);
            }
        });
        
        console.log('[GridController] Setting new grid data with', allData.length, 'rows');
        gridApi.setGridOption('rowData', allData);

        const currentCount = gridApi.getDisplayedRowCount();
        if (this.onItemCountChanged && this.groupId) {
            this.onItemCountChanged(this.groupId, currentCount);
        }
    }

    /**
     * Update rows in the grid
     */
    updateRows(gridApi, updatedItems) {
        if (!gridApi || !Array.isArray(updatedItems)) return;

        const processedItems = this.preprocessGridData(updatedItems);
        gridApi.applyTransaction({ update: processedItems });
    }

    /**
     * Unlock selected rows
     */
    async unlockSelectedRows(gridApi, selectedRows) {
        if (!selectedRows || selectedRows.length === 0) {
            console.warn("No rows selected for unlocking");
            return false;
        }

        if (!this.groupId) {
            this.showValidationError("No topic sheet is currently selected.");
            return false;
        }

        const itemIds = selectedRows.map(row =>
            row.project_document_stage_group_id_item_id || `row-${row.id}`
        );

        try {
            if (typeof bulkUnlockDocumentItems !== 'function') {
                console.warn("bulkUnlockDocumentItems not available, using mock");
                const updatedItems = selectedRows.map(row => ({
                    ...row,
                    locked_by: null
                }));
                this.updateRows(gridApi, updatedItems);
                return true;
            }

            const result = await bulkUnlockDocumentItems(
                this.projectDocumentId,
                this.stageId,
                this.groupId,
                itemIds,
                this.currentUsername
            );

            if (result && result.updatedItems) {
                this.updateRows(gridApi, result.updatedItems);

                // Track successful bulk operation
                this._trackDocumentItemSave('bulk-operation', 'success', {
                    operation: 'unlock',
                    itemCount: result.updatedItems.length
                });

                showSuccessNotification({
                    title: "Unlock Successful",
                    message: `Successfully unlocked ${result.updatedItems.length} item(s).`
                }, this.messageModal);

                return true;
            } else {
                const updatedItems = selectedRows.map(row => ({
                    ...row,
                    locked_by: null
                }));
                this.updateRows(gridApi, updatedItems);
                return true;
            }
        } catch (err) {
            console.error("Error unlocking rows:", err);
            
            // Track failed bulk operation
            this._trackDocumentItemSave('bulk-operation', 'error', {
                operation: 'unlock',
                error: err.message,
                itemCount: selectedRows.length
            });
            
            this.showValidationError(`Failed to unlock the selected items: ${err.message}`);
            return false;
        }
    }

    /**
     * Get context menu items
     */
    getContextMenuItems(params) {
        const isLocked = params.node?.data?.locked_by &&
            params.node.data.locked_by !== this.currentUsername;

        const items = [];

        if (!isLocked) {
            items.push({
                name: 'Copy Question Text',
                action: () => this.copyToClipboard(params.node.data.question_text)
            });

            if (params.node.data.ai_answer_text || params.node.data.original_answer) {
                items.push({
                    name: 'Copy AI Answer',
                    action: () => this.copyToClipboard(
                        params.node.data.ai_answer_text || params.node.data.original_answer
                    )
                });
            }
        }

        items.push('separator');
        items.push('copy', 'paste');

        return items;
    }

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showValidationError('Copied to clipboard');
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showValidationError('Copied to clipboard');
        }
    }

    /**
     * Show validation error message
     */
    showValidationError(message) {
        const toast = document.createElement('div');
        toast.className = 'validation-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '1', 100);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    /**
     * Apply filter to show all items
     */
    filterAll(gridApi) {
        if (!gridApi) return;

        // Clear all filters
        gridApi.setFilterModel(null);
    }

    /**
     * Apply filter to show items assigned to current user
     */
    filterAssignedToMe(gridApi) {
        if (!gridApi) return;

        const filterModel = {
            owner_username: {
                type: 'equals',
                filter: this.currentUsername
            }
        };

        gridApi.setFilterModel(filterModel);
    }

    /**
     * Apply filter to show unconfirmed items (pending review)
     */
    filterUnconfirmed(gridApi) {
        if (!gridApi) return;

        const filterModel = {
            status: {
                type: 'equals',
                filter: 'PENDING_REVIEW'
            }
        };

        gridApi.setFilterModel(filterModel);
    }

    /**
     * Open question detail modal
     */
    openQuestionDetail(questionData, gridApi) {
        if (!questionData) {
            this.showValidationError("No question data provided");
            return;
        }

        console.log("[QuestionsGridController] Opening question detail modal for:", questionData.question_id);

        this.questionDetailModal.show({
            question: questionData,
            projectDocumentId: this.projectDocumentId,
            stageId: this.stageId,
            groupId: this.groupId,
            currentUsername: this.currentUsername,
            onSave: (updatedQuestion) => {
                // ✅ NEW: Update the specific row in the grid
                if (gridApi && updatedQuestion) {
                    console.log("[QuestionsGridController] Updating grid row after modal save");

                    // Find the row node by ID
                    let targetNode = null;
                    gridApi.forEachNode((node) => {
                        if (node.data.project_document_stage_group_id_item_id === updatedQuestion.project_document_stage_group_id_item_id) {
                            targetNode = node;
                        }
                    });

                    if (targetNode) {
                        // Update the specific row data
                        targetNode.setData(updatedQuestion);
                        console.log("[QuestionsGridController] Grid row updated successfully");
                    } else {
                        console.warn("[QuestionsGridController] Could not find grid row to update");
                    }
                }
            }
        });
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.selectionDebounceTimer) {
            clearTimeout(this.selectionDebounceTimer);
            this.selectionDebounceTimer = null;
        }
    }
}