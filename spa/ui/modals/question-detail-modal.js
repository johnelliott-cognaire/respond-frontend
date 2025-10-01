// File: ui/modals/question-detail-modal.js
import { lockOrUnlockDocumentItem, updateDocumentItemAttribute } from "../../api/documents.js";
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";

/**
 * QuestionDetailModal
 * 
 * A modal for viewing and editing question details in a focused, well-formatted interface.
 * Handles large text content, markdown rendering, and provides a better editing experience
 * than inline grid editing for complex content.
 */
export class QuestionDetailModal extends AsyncFormModal {
    constructor() {
        super();

        // Modal references
        this.errorModal = new ErrorModal();
        this.messageModal = new MessageModal();

        // State
        this.currentQuestion = null;
        this.originalData = null;
        this.isModified = false;
        this.projectDocumentId = null;
        this.stageId = null;
        this.groupId = null;
        this.currentUsername = null;
        this.onSave = null;
        this.editMode = false;

        // Track field changes
        this.fieldChanges = {};

        this._buildDOM();
    }

    _buildDOM() {
        super._buildOverlay();

        this.modalEl = document.createElement("div");
        this.modalEl.className = "modal modal--form question-detail-modal";
        this.modalEl.style.display = "none";

        this.modalEl.innerHTML = `
            <button class="modal__close" aria-label="Close question detail modal">&times;</button>
            <div class="question-detail-header">
                <h2>Question Details</h2>
                <div class="question-detail-badges">
                    <span class="question-id-badge" id="questionIdBadge"></span>
                    <span class="question-status-badge" id="questionStatusBadge"></span>
                    <button type="button" class="btn btn--secondary btn--small" id="editModeBtn" title="Edit question details">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button type="button" class="btn btn--secondary btn--small copy-ids-btn" id="copyIdsBtn" title="Copy IDs for debugging">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
            
            <!-- Tabbed Interface -->
            <div class="question-tabs-container">
                <div class="question-tabs">
                    <button class="tab-button active" data-tab="overview">
                        <i class="fas fa-info-circle"></i> Overview
                    </button>
                    <button class="tab-button" data-tab="ai-details">
                        <i class="fas fa-robot"></i> AI Details
                    </button>
                    <button class="tab-button" data-tab="history">
                        <i class="fas fa-history"></i> History & Notes
                    </button>
                </div>
                
                <div class="modal-content question-detail-content">
                    <!-- Overview Tab -->
                    <div id="overview-tab" class="tab-pane active">
                        <div class="question-detail-grid">
                            <!-- Question Section -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>Question</h3>
                                </div>
                                <div class="form-row">
                                    <div class="form-group form-group--narrow">
                                        <label for="questionIdField">Question ID</label>
                                        <input type="text" id="questionIdField" class="doc-input">
                                    </div>
                                    <div class="form-group form-group--narrow">
                                        <label for="statusField">Status</label>
                                        <select id="statusField" class="doc-input">
                                            <option value="NEW">New</option>
                                            <option value="ANSWER_GENERATED">Answer Generated</option>
                                            <option value="IN_PROGRESS">In Progress</option>
                                            <option value="PENDING_REVIEW">Pending Review</option>
                                            <option value="NEEDS_REVISION">Needs Revision</option>
                                            <option value="READY">Ready</option>
                                            <option value="APPROVED">Approved</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="questionTextField">Question Text</label>
                                    <textarea id="questionTextField" class="doc-input" rows="4"></textarea>
                                </div>
                                <div class="form-group">
                                    <label for="guidanceField">Guidance</label>
                                    <textarea id="guidanceField" class="doc-input" rows="3"></textarea>
                                </div>
                            </div>
                            
                            <!-- Answer Section -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>Answer</h3>
                                </div>
                                <div class="form-group">
                                    <textarea id="answerField" class="doc-input" rows="8"></textarea>
                                </div>
                            </div>
                            
                            <!-- Metadata Grid -->
                            <div class="modal-section modal-section--full modal-section--metadata">
                                <div class="modal-section-header">
                                    <h3>Metrics</h3>
                                </div>
                                <div class="detail-metadata-grid">
                                    <div class="form-group">
                                        <label for="ownerField">Owner</label>
                                        <input type="text" id="ownerField" class="doc-input">
                                    </div>
                                    <div class="form-group">
                                        <label for="riskRatingField">Risk Rating</label>
                                        <input type="text" id="riskRatingField" class="doc-input" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="completenessField">Completeness</label>
                                        <input type="text" id="completenessField" class="doc-input" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="complianceField">Compliance</label>
                                        <input type="text" id="complianceField" class="doc-input" readonly>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- AI Details Tab -->
                    <div id="ai-details-tab" class="tab-pane">
                        <div class="question-detail-grid">
                            <!-- AI Answer Section -->
                            <div class="modal-section modal-section--full" id="aiAnswerSection">
                                <div class="modal-section-header">
                                    <h3>AI Generated Answer (Clean)</h3>
                                    <span class="ai-answer-date" id="aiAnswerDate"></span>
                                </div>
                                <div class="form-group">
                                    <textarea id="aiAnswerField" class="doc-input" readonly rows="8"></textarea>
                                </div>
                            </div>
                            
                            <!-- AI Raw Answer (Expandable) -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>
                                        <button type="button" class="expand-toggle" id="rawAnswerToggle">
                                            <i class="fas fa-chevron-right"></i>
                                        </button>
                                        AI Generated Answer (Raw)
                                    </h3>
                                </div>
                                <div class="form-group expandable-content" id="rawAnswerContent" style="display: none;">
                                    <div class="detail-text-display" id="rawAnswerDisplay"></div>
                                </div>
                            </div>
                            
                            <!-- AI Feedback -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>AI Feedback</h3>
                                </div>
                                <div class="form-group">
                                    <div class="detail-text-display" id="aiFeedbackDisplay"></div>
                                </div>
                            </div>
                            
                            <!-- AI Sources -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>AI Sources</h3>
                                </div>
                                <div class="form-group">
                                    <div class="ai-sources-list" id="aiSourcesList"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- History Tab -->
                    <div id="history-tab" class="tab-pane">
                        <div class="question-detail-grid">
                            <!-- History Information -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>History Information</h3>
                                </div>
                                <div class="detail-metadata-grid">
                                    <div class="form-group">
                                        <label for="modifiedByField">Modified By</label>
                                        <input type="text" id="modifiedByField" class="doc-input" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="modifiedDateField">Modified Date</label>
                                        <input type="text" id="modifiedDateField" class="doc-input" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="createdDateField">Created Date</label>
                                        <input type="text" id="createdDateField" class="doc-input" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="generatedByField">Answer Generated By</label>
                                        <input type="text" id="generatedByField" class="doc-input" readonly>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Notes Section -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>Notes</h3>
                                </div>
                                <div class="form-group">
                                    <textarea id="notesField" class="doc-input" rows="4"></textarea>
                                </div>
                            </div>
                            
                            <!-- Additional Metadata -->
                            <div class="modal-section modal-section--full">
                                <div class="modal-section-header">
                                    <h3>Additional Information</h3>
                                </div>
                                <div class="detail-metadata-grid">
                                    <div class="form-group">
                                        <label for="contentField">Corpus Content</label>
                                        <textarea id="contentField" class="doc-input" readonly rows="3"></textarea>
                                    </div>
                                    <div class="form-group">
                                        <label for="lockedByField">Locked By</label>
                                        <input type="text" id="lockedByField" class="doc-input" readonly>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal-footer">
                <div class="modal-error" id="detailError" style="display: none;"></div>
                <div class="action-group action-group--right">
                    <button type="button" class="btn" id="cancelBtn" disabled>Cancel</button>
                    <button type="button" class="btn btn--primary" id="saveBtn" disabled>Save Changes</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalEl);

        // Get field references
        this.questionIdField = this.modalEl.querySelector("#questionIdField");
        this.questionTextField = this.modalEl.querySelector("#questionTextField");
        this.guidanceField = this.modalEl.querySelector("#guidanceField");
        this.answerField = this.modalEl.querySelector("#answerField");
        this.notesField = this.modalEl.querySelector("#notesField");
        this.ownerField = this.modalEl.querySelector("#ownerField");
        this.statusField = this.modalEl.querySelector("#statusField");
        this.riskRatingField = this.modalEl.querySelector("#riskRatingField");
        this.completenessField = this.modalEl.querySelector("#completenessField");
        this.complianceField = this.modalEl.querySelector("#complianceField");
        this.modifiedByField = this.modalEl.querySelector("#modifiedByField");
        this.modifiedDateField = this.modalEl.querySelector("#modifiedDateField");
        
        // New field references
        this.rawAnswerDisplay = this.modalEl.querySelector("#rawAnswerDisplay");
        this.aiFeedbackDisplay = this.modalEl.querySelector("#aiFeedbackDisplay");
        this.aiSourcesList = this.modalEl.querySelector("#aiSourcesList");
        this.createdDateField = this.modalEl.querySelector("#createdDateField");
        this.generatedByField = this.modalEl.querySelector("#generatedByField");
        this.copyIdsBtn = this.modalEl.querySelector("#copyIdsBtn");
        this.rawAnswerToggle = this.modalEl.querySelector("#rawAnswerToggle");
        this.rawAnswerContent = this.modalEl.querySelector("#rawAnswerContent");
        
        // Additional fields to match grid
        this.contentField = this.modalEl.querySelector("#contentField");
        this.lockedByField = this.modalEl.querySelector("#lockedByField");
        this.aiAnswerField = this.modalEl.querySelector("#aiAnswerField");

        this.saveBtn = this.modalEl.querySelector("#saveBtn");
        this.cancelBtn = this.modalEl.querySelector("#cancelBtn");
        this.errorEl = this.modalEl.querySelector("#detailError");

        // Edit mode button
        this.editModeBtn = this.modalEl.querySelector("#editModeBtn");

        // AI answer elements
        this.aiAnswerSection = this.modalEl.querySelector("#aiAnswerSection");
        this.aiAnswerDate = this.modalEl.querySelector("#aiAnswerDate");

        // Badge elements
        this.questionIdBadge = this.modalEl.querySelector("#questionIdBadge");
        this.questionStatusBadge = this.modalEl.querySelector("#questionStatusBadge");

        // Tab references
        this.tabButtons = this.modalEl.querySelectorAll(".tab-button");
        this.tabPanes = this.modalEl.querySelectorAll(".tab-pane");
        this.activeTab = 'overview';
        
        // Attach event listeners
        this.attachEventListeners();

        // Add styles
        this.addStyles();
    }

    attachEventListeners() {
        // Close button
        this.modalEl.querySelector(".modal__close").addEventListener("click", () => this.hide());
        
        // Edit mode button
        this.editModeBtn.addEventListener("click", () => this.toggleEditMode());
        
        // Cancel button
        this.cancelBtn.addEventListener("click", () => this.handleCancel());

        // Save button
        this.saveBtn.addEventListener("click", () => this.handleSave());

        // Field change tracking - Use correct database field names
        this.questionIdField.addEventListener("input", () => this.trackFieldChange('question_id', this.questionIdField.value));
        this.questionTextField.addEventListener("input", () => this.trackFieldChange('question_text', this.questionTextField.value));
        this.guidanceField.addEventListener("input", () => this.trackFieldChange('guidance', this.guidanceField.value));
        this.answerField.addEventListener("input", () => this.trackFieldChange('answer_text', this.answerField.value));
        this.notesField.addEventListener("input", () => this.trackFieldChange('notes', this.notesField.value));
        this.statusField.addEventListener("change", () => this.trackFieldChange('status', this.statusField.value));
        this.ownerField.addEventListener("input", () => this.trackFieldChange('owner_username', this.ownerField.value));

        // Tab switching
        this.tabButtons.forEach(button => {
            button.addEventListener("click", (e) => {
                const targetTab = e.currentTarget.getAttribute("data-tab");
                this.switchTab(targetTab);
            });
        });
        
        // Copy IDs button
        this.copyIdsBtn.addEventListener("click", () => this.copyDebugIds());
        
        // Raw answer toggle
        this.rawAnswerToggle.addEventListener("click", () => this.toggleRawAnswer());
        
        // Escape key to close
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.modalEl.style.display !== "none") {
                if (this.editMode && this.isModified) {
                    // Don't close if in edit mode with unsaved changes
                    return;
                }
                this.hide();
            }
        });
    }

    /**
     * Show the modal with question data
     * @param {Object} options - Configuration options
     * @param {Object} options.question - Question data object
     * @param {string} options.projectDocumentId - Project document ID
     * @param {string} options.stageId - Stage ID
     * @param {string} options.groupId - Group ID
     * @param {string} options.currentUsername - Current username
     * @param {Function} options.onSave - Callback when data is saved
     */
    show(options = {}) {
        const { question, projectDocumentId, stageId, groupId, onSave, currentUsername } = options;

        if (!question) {
            console.error("[QuestionDetailModal] No question data provided");
            return;
        }

        console.log("[QuestionDetailModal] Showing modal with question data:", question);

        this.currentQuestion = question;
        this.originalData = JSON.parse(JSON.stringify(question)); // Deep copy
        this.projectDocumentId = projectDocumentId;
        this.stageId = stageId;
        this.groupId = groupId;
        this.onSave = onSave;
        this.currentUsername = currentUsername || 'unknown';
        this.isModified = false;
        this.fieldChanges = {};
        this.editMode = false;

        // Populate the modal with question data
        this.populateData();

        // Set initial edit mode based on lock status
        this.updateEditMode();

        // Show the modal
        super.show();
    }

    populateData() {
        const q = this.currentQuestion;

        console.log("[QuestionDetailModal] Populating data:", q);

        // Header badges
        this.questionIdBadge.textContent = q.question_id || "No ID";
        this.questionStatusBadge.textContent = q.status || "NEW";
        this.questionStatusBadge.className = `question-status-badge status-${(q.status || 'NEW').toLowerCase().replace('_', '-')}`;

        // Editable fields
        this.questionIdField.value = q.question_id || "";
        this.questionTextField.value = q.question_text || "";
        this.guidanceField.value = q.guidance || "";
        this.answerField.value = q.answer_text || "";
        this.notesField.value = q.notes || "";
        this.ownerField.value = q.owner_username || "";
        this.statusField.value = q.status || "NEW";

        // Read-only fields
        this.riskRatingField.value = this.formatPercentageValue(q.risk_rating);
        this.completenessField.value = this.formatPercentageValue(q.percentage_answer_complete || q.completeness);
        this.complianceField.value = q.answer_complies || "N/A";
        this.modifiedByField.value = q.modified_by || "";
        this.modifiedDateField.value = q.modified_datetime ? this.formatDate(q.modified_datetime) : "";
        this.lockedByField.value = q.locked_by || "";
        
        // Corpus content field
        if (this.contentField) {
            this.contentField.value = q.content || "";
        }

        // AI Answer section (Clean version)
        if (q.ai_answer_text) {
            this.aiAnswerSection.style.display = "block";
            this.aiAnswerField.value = q.ai_answer_text || "";

            // Set AI answer date
            if (q.ai_answer_date || q.answer_generation_datetime) {
                this.aiAnswerDate.textContent = `Generated: ${this.formatDate(q.ai_answer_date || q.answer_generation_datetime)}`;
            } else {
                this.aiAnswerDate.textContent = "";
            }
        } else {
            this.aiAnswerSection.style.display = "none";
        }
        
        // AI Raw Answer (Expandable)
        if (q.original_answer) {
            this.rawAnswerDisplay.innerHTML = this.formatPlainText(q.original_answer);
        } else {
            this.rawAnswerDisplay.innerHTML = '<span class="empty-field">No raw answer available</span>';
        }
        
        // AI Feedback (other_information)
        if (q.other_information) {
            this.aiFeedbackDisplay.innerHTML = this.formatPlainText(q.other_information);
        } else {
            this.aiFeedbackDisplay.innerHTML = '<span class="empty-field">No AI feedback available</span>';
        }
        
        // AI Sources
        if (q.sources) {
            try {
                const sources = typeof q.sources === 'string' ? JSON.parse(q.sources) : q.sources;
                if (Array.isArray(sources) && sources.length > 0) {
                    this.aiSourcesList.innerHTML = '<ul class="ai-sources-items">' + 
                        sources.map(source => `<li>${this.escapeHtml(source)}</li>`).join('') + 
                        '</ul>';
                } else {
                    this.aiSourcesList.innerHTML = '<span class="empty-field">No sources available</span>';
                }
            } catch (e) {
                console.error('[QuestionDetailModal] Error parsing sources:', e);
                this.aiSourcesList.innerHTML = '<span class="empty-field">Error loading sources</span>';
            }
        } else {
            this.aiSourcesList.innerHTML = '<span class="empty-field">No sources available</span>';
        }
        
        // Additional history fields
        this.createdDateField.value = q.created_datetime ? this.formatDate(q.created_datetime) : "";
        this.generatedByField.value = q.answer_generated_by || "";

        // Reset save button state
        this.updateSaveButton();
    }

    formatPercentageValue(value) {
        // Handle null, undefined, empty string, and NaN values
        if (value === null || value === undefined || value === '' || isNaN(value)) {
            return '';
        }

        // Convert to number and check if it's a valid number
        const numValue = Number(value);
        if (isNaN(numValue)) {
            return '';
        }

        return `${numValue}%`;
    }

    updateEditMode() {
        const canEdit = this.canEditQuestion();
        const isLocked = !canEdit;
        
        // Update edit mode button
        if (this.editModeBtn) {
            if (!canEdit) {
                this.editModeBtn.disabled = true;
                this.editModeBtn.innerHTML = '<i class="fas fa-lock"></i> Locked';
                this.editModeBtn.title = `Locked by ${this.currentQuestion.locked_by}`;
            } else if (this.editMode) {
                this.editModeBtn.disabled = false;
                this.editModeBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';
                this.editModeBtn.title = 'Cancel editing';
            } else {
                this.editModeBtn.disabled = false;
                this.editModeBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
                this.editModeBtn.title = 'Edit question details';
            }
        }
        
        // Update fields based on edit mode
        const editableFields = [
            this.questionIdField,
            this.questionTextField,
            this.guidanceField,
            this.answerField,
            this.notesField,
            this.ownerField,
            this.statusField
        ];
        
        const alwaysReadOnlyFields = [
            this.riskRatingField,
            this.completenessField,
            this.modifiedByField,
            this.modifiedDateField,
            this.createdDateField,
            this.generatedByField,
            this.lockedByField,
            this.contentField,
            this.aiAnswerField
        ];
        
        // Set editable fields based on mode
        editableFields.forEach(field => {
            if (field) {
                field.disabled = !this.editMode || isLocked;
                if (field.disabled) {
                    field.classList.add('field-disabled');
                } else {
                    field.classList.remove('field-disabled');
                }
            }
        });
        
        // Always disable read-only fields
        alwaysReadOnlyFields.forEach(field => {
            if (field) {
                field.disabled = true;
                field.classList.add('field-disabled', 'field-readonly');
            }
        });
        
        // Update save/cancel buttons
        this.updateSaveButton();
        this.cancelBtn.disabled = !this.editMode;
        
        // Update header lock indicator
        this.updateHeaderLockIndicator();
    }

    async toggleEditMode() {
        if (this.editMode) {
            // Switch to view mode
            this.editMode = false;
            this.updateEditMode();
        } else {
            // Check if we can edit
            if (!this.canEditQuestion()) {
                const lockedBy = this.currentQuestion.locked_by;
                this.showError(`This question is locked by ${lockedBy}. Cannot edit.`);
                return;
            }
            
            // Lock the row before editing (only if not already locked)
            if (!this.currentQuestion.locked_by || this.currentQuestion.locked_by !== this.currentUsername) {
                const lockSuccess = await this.lockRowForEditing();

                if (!lockSuccess) {
                    console.warn("[QuestionDetailModal] Could not lock row for editing");
                    return;
                }
            }

            // Switch to edit mode
            this.editMode = true;
            this.updateEditMode();

            // Focus the first field
            setTimeout(() => {
                this.questionTextField.focus();
            }, 100);
        }
    }

    /**
     * Lock the row for editing (similar to grid behavior)
     */
    async lockRowForEditing() {
        if (!this.currentQuestion || !this.projectDocumentId || !this.stageId || !this.groupId) {
            console.warn("[QuestionDetailModal] Missing required data for locking");
            return false;
        }

        // If already locked by current user, no need to lock again
        if (this.currentQuestion.locked_by === this.currentUsername) {
            return true;
        }

        // If locked by another user, don't allow editing
        if (this.currentQuestion.locked_by && this.currentQuestion.locked_by !== this.currentUsername) {
            this.showError(`This question is locked by ${this.currentQuestion.locked_by}. Cannot edit.`);
            return false;
        }

        try {
            const rowId = this.currentQuestion.project_document_stage_group_id_item_id;

            if (typeof lockOrUnlockDocumentItem === 'function') {
                const result = await lockOrUnlockDocumentItem(
                    this.projectDocumentId,
                    this.stageId,
                    this.groupId,
                    rowId,
                    true, // lock = true
                    this.currentUsername
                );

                if (result) {
                    this.currentQuestion.locked_by = this.currentUsername;
                    this.updateFieldLockIndicators();
                    console.log("[QuestionDetailModal] Successfully locked row for editing");
                    return true;
                }
            } else {
                console.warn("[QuestionDetailModal] lockOrUnlockDocumentItem not available, using mock");
                this.currentQuestion.locked_by = this.currentUsername;
                this.updateFieldLockIndicators();
                return true;
            }
        } catch (err) {
            console.error("[QuestionDetailModal] Error locking row:", err);
            this.showError("Could not lock question for editing. Please try again.");
            return false;
        }

        return false;
    }

    /**
     * Unlock the row if we locked it
     */
    async unlockRowIfNeeded() {
        if (!this.currentQuestion || this.currentQuestion.locked_by !== this.currentUsername) {
            return; // Not locked by us, don't unlock
        }

        try {
            const rowId = this.currentQuestion.project_document_stage_group_id_item_id;

            if (typeof lockOrUnlockDocumentItem === 'function') {
                await lockOrUnlockDocumentItem(
                    this.projectDocumentId,
                    this.stageId,
                    this.groupId,
                    rowId,
                    false, // lock = false
                    this.currentUsername
                );

                this.currentQuestion.locked_by = null;
                this.updateFieldLockIndicators();
                console.log("[QuestionDetailModal] Successfully unlocked row");
            } else {
                console.warn("[QuestionDetailModal] lockOrUnlockDocumentItem not available, using mock");
                this.currentQuestion.locked_by = null;
                this.updateFieldLockIndicators();
            }
        } catch (err) {
            console.error("[QuestionDetailModal] Error unlocking row:", err);
            // Don't show error to user for unlock failures
        }
    }

    trackFieldChange(fieldName, newValue) {
        const originalValue = this.originalData[fieldName] || "";

        if (newValue !== originalValue) {
            this.fieldChanges[fieldName] = newValue;
            this.isModified = true;
        } else {
            delete this.fieldChanges[fieldName];
            this.isModified = Object.keys(this.fieldChanges).length > 0;
        }

        this.updateSaveButton();
    }

    updateSaveButton() {
        this.saveBtn.disabled = !this.editMode || !this.isModified;
        this.saveBtn.textContent = this.isModified ? "Save Changes" : "No Changes";
    }

    async handleSave() {
        if (!this.isModified || Object.keys(this.fieldChanges).length === 0) {
            return;
        }

        this.lockButtons();
        this.errorEl.style.display = "none";

        try {
            const itemKey = this.currentQuestion.project_document_stage_group_id_item_id;

            if (!itemKey) {
                throw new Error("Missing item key for saving changes");
            }

            // Save each changed field
            const savePromises = Object.entries(this.fieldChanges).map(async ([fieldName, newValue]) => {
                try {
                    const updatedItem = await updateDocumentItemAttribute(
                        this.projectDocumentId,
                        this.stageId,
                        this.groupId,
                        itemKey,
                        fieldName,
                        newValue
                    );

                    // Update the current question data with the response
                    if (updatedItem) {
                        Object.assign(this.currentQuestion, updatedItem);
                    } else {
                        // Fallback: update with the new value
                        this.currentQuestion[fieldName] = newValue;
                    }

                    return { fieldName, success: true, updatedItem };
                } catch (err) {
                    console.error(`[QuestionDetailModal] Error updating ${fieldName}:`, err);
                    return { fieldName, success: false, error: err.message };
                }
            });

            const results = await Promise.all(savePromises);

            // Check for any failures
            const failures = results.filter(r => !r.success);

            if (failures.length > 0) {
                const errorMessage = failures.map(f => `${f.fieldName}: ${f.error}`).join('\n');
                throw new Error(`Some fields failed to save:\n${errorMessage}`);
            }

            // Update the modification metadata
            this.currentQuestion.modified_datetime = new Date().toISOString();
            this.currentQuestion.modified_by = this.currentUsername;

            // Reset the state
            this.originalData = JSON.parse(JSON.stringify(this.currentQuestion));
            this.fieldChanges = {};
            this.isModified = false;
            this.editMode = false;

            // Update the display
            this.populateData();
            this.updateEditMode();

            // Notify parent component with updated data
            if (this.onSave) {
                this.onSave(this.currentQuestion);
            }

            // Show success message
            this.messageModal.show({
                title: "Changes Saved",
                message: "Question details have been updated successfully."
            });

        } catch (err) {
            console.error("[QuestionDetailModal] Error saving changes:", err);
            this.showError(err.message || "Failed to save changes. Please try again.");
        } finally {
            this.unlockButtons();
            // Don't unlock the row yet - it will be unlocked when modal closes
        }
    }

    handleCancel() {
        if (this.isModified) {
            // Revert changes
            this.currentQuestion = JSON.parse(JSON.stringify(this.originalData));
            this.fieldChanges = {};
            this.isModified = false;
        }
        
        this.editMode = false;
        this.populateData();
        this.updateEditMode();
    }
    
    async hide() {
        // If we have unsaved changes in edit mode, confirm before closing
        if (this.editMode && this.isModified) {
            if (!confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
                return;
            }
        }
        
        // Unlock the row if we have it locked
        await this.unlockRowIfNeeded();

        // Call parent hide method
        super.hide();
    }

    showError(message) {
        this.errorEl.textContent = message;
        this.errorEl.style.display = "block";
    }

    formatDate(dateString) {
        if (!dateString) return "";

        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + " " +
                date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (err) {
            return dateString;
        }
    }

    formatPlainText(text) {
        if (!text) return "";

        // Convert newlines to <br> tags and escape HTML
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')
            .replace(/\r/g, '');
    }

    isMarkdown(text) {
        if (!text) return false;

        // Simple heuristics to detect markdown
        const markdownPatterns = [
            /^#{1,6}\s+.+$/m,           // Headers
            /\*\*[^*]+\*\*/,            // Bold
            /\*[^*]+\*/,                // Italic
            /^[-*+]\s+.+$/m,            // Lists
            /\[.+\]\(.+\)/,             // Links
            /```[\s\S]*```/,            // Code blocks
            /`[^`]+`/                   // Inline code
        ];

        return markdownPatterns.some(pattern => pattern.test(text));
    }

    renderMarkdown(text) {
        if (!text) return "";

        // Check if marked library is available
        if (typeof marked !== 'undefined') {
            try {
                return marked.parse(text);
            } catch (err) {
                console.warn("[QuestionDetailModal] Error rendering markdown:", err);
                return this.formatPlainText(text);
            }
        }

        // Fallback to plain text formatting
        return this.formatPlainText(text);
    }

    /**
     * Check if the current user can edit this question
     */
    canEditQuestion() {
        const q = this.currentQuestion;
        const currentUser = this.getCurrentUsername();

        // Can edit if not locked or locked by current user
        return !q.locked_by || q.locked_by === currentUser;
    }

    /**
     * Get current username
     */
    getCurrentUsername() {
        return this.currentUsername || window.currentUsername || 'unknown';
    }

    /**
     * Update field lock indicators - DEPRECATED (now handled by updateEditMode)
     */
    updateFieldLockIndicators() {
        // This method is kept for backward compatibility but functionality moved to updateEditMode
        this.updateEditMode();
    }

    /**
     * Add lock indicator to modal header
     */
    updateHeaderLockIndicator() {
        const q = this.currentQuestion;
        const header = this.modalEl.querySelector('.question-detail-header');

        // Remove existing lock indicator
        const existingIndicator = header.querySelector('.lock-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Add lock indicator if locked by someone else
        if (q.locked_by && q.locked_by !== this.getCurrentUsername()) {
            const lockIndicator = document.createElement('div');
            lockIndicator.className = 'lock-indicator';
            lockIndicator.innerHTML = `
                <i class="fas fa-lock" style="color: #dc3545;"></i>
                <span style="color: #dc3545; font-size: 12px; margin-left: 4px;">
                    Locked by ${q.locked_by}
                </span>
            `;

            const badges = header.querySelector('.question-detail-badges');
            badges.appendChild(lockIndicator);
        }
    }

    /**
     * Switch between tabs
     */
    switchTab(targetTab) {
        // Update active tab button
        this.tabButtons.forEach(button => {
            if (button.getAttribute('data-tab') === targetTab) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        
        // Update active tab pane
        this.tabPanes.forEach(pane => {
            if (pane.id === `${targetTab}-tab`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
        
        this.activeTab = targetTab;
    }
    
    /**
     * Copy debug IDs to clipboard
     */
    async copyDebugIds() {
        const q = this.currentQuestion;
        const debugInfo = [
            `Project Document ID: ${this.projectDocumentId || 'N/A'}`,
            `Stage Group Item ID: ${q.project_document_stage_group_id_item_id || 'N/A'}`,
            `Question ID: ${q.question_id || 'N/A'}`,
            `Item ID: ${q.item_id || 'N/A'}`
        ].join('\n');
        
        try {
            await navigator.clipboard.writeText(debugInfo);
            
            // Show success feedback
            const originalHtml = this.copyIdsBtn.innerHTML;
            this.copyIdsBtn.innerHTML = '<i class="fas fa-check"></i>';
            this.copyIdsBtn.classList.add('copy-success');
            
            setTimeout(() => {
                this.copyIdsBtn.innerHTML = originalHtml;
                this.copyIdsBtn.classList.remove('copy-success');
            }, 2000);
        } catch (err) {
            console.error('[QuestionDetailModal] Failed to copy IDs:', err);
            this.showError('Failed to copy IDs to clipboard');
        }
    }
    
    /**
     * Toggle raw answer visibility
     */
    toggleRawAnswer() {
        const isExpanded = this.rawAnswerContent.style.display !== 'none';
        
        if (isExpanded) {
            this.rawAnswerContent.style.display = 'none';
            this.rawAnswerToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
        } else {
            this.rawAnswerContent.style.display = 'block';
            this.rawAnswerToggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
        }
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addStyles() {
        if (document.getElementById('question-detail-modal-styles')) return;

        const style = document.createElement('style');
        style.id = 'question-detail-modal-styles';
        style.textContent = `
            .question-detail-modal {
                max-width: 1200px;
                width: 90vw;
                max-height: 90vh;
            }
            
            .question-detail-modal .question-detail-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .question-detail-modal .question-detail-header h2 {
                margin: 0;
                color: #333;
            }
            
            .question-detail-modal .question-detail-badges {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            .question-detail-modal .question-id-badge {
                background: #f0f0f0;
                color: #666;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
            }
            
            .question-detail-modal .question-status-badge {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                color: white;
            }
            
            .question-detail-modal .status-new { background: #6c757d; }
            .question-detail-modal .status-in-progress { background: #17a2b8; }
            .question-detail-modal .status-pending-review { background: #ffc107; color: #333; }
            .question-detail-modal .status-needs-revision { background: #fd7e14; }
            .question-detail-modal .status-ready { background: #20c997; }
            .question-detail-modal .status-approved { background: #28a745; }
            
            .question-detail-modal .question-detail-content {
                max-height: calc(90vh - 200px);
                overflow-y: auto;
                padding: 0;
            }
            
            /* Tab Navigation */
            .question-detail-modal .question-tabs-container {
                display: flex;
                flex-direction: column;
                height: 100%;
            }
            
            .question-detail-modal .question-tabs {
                display: flex;
                border-bottom: 1px solid #e0e0e0;
                margin-bottom: 0;
                background-color: #f5f5f5;
                padding: 0 20px;
            }
            
            .question-detail-modal .tab-button {
                padding: 12px 20px;
                border: none;
                background: none;
                cursor: pointer;
                font-size: 14px;
                color: #666;
                border-bottom: 3px solid transparent;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .question-detail-modal .tab-button:hover {
                color: #333;
                background-color: rgba(0, 0, 0, 0.05);
            }
            
            .question-detail-modal .tab-button.active {
                color: #0e3048;
                border-bottom-color: #0e3048;
                background-color: white;
                font-weight: 600;
            }
            
            .question-detail-modal .tab-button i {
                font-size: 16px;
            }
            
            .question-detail-modal .tab-pane {
                display: none;
                padding: 20px;
            }
            
            .question-detail-modal .tab-pane.active {
                display: block;
            }
            
            /* Responsive Grid Layout */
            .question-detail-modal .question-detail-grid {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            
            @media (min-width: 1024px) {
                .question-detail-modal .question-detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                }
                
                .question-detail-modal .modal-section--full {
                    grid-column: 1 / -1;
                }
            }
            
            .question-detail-modal .modal-section {
                margin-bottom: 30px;
                padding: 20px;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                background: #fafafa;
            }
            
            .question-detail-modal .modal-section--metadata {
                background: #f8f9fa;
            }
            
            .question-detail-modal .modal-section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }
            
            .question-detail-modal .modal-section-header h3 {
                margin: 0;
                color: #495057;
                font-size: 16px;
            }
            
            .question-detail-modal .ai-answer-date {
                font-size: 12px;
                color: #6c757d;
                font-style: italic;
            }
            
            .question-detail-modal .detail-text-display {
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                padding: 12px;
                min-height: 60px;
                line-height: 1.6;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            
            .question-detail-modal .detail-text-display:empty::before {
                content: "No content";
                color: #6c757d;
                font-style: italic;
            }
            
            .question-detail-modal .empty-field {
                color: #6c757d;
                font-style: italic;
            }
            
            .question-detail-modal .ai-answer-content {
                background: #e3f2fd;
                border: 1px solid #bbdefb;
                border-radius: 4px;
                padding: 16px;
                line-height: 1.6;
            }
            
            .question-detail-modal .ai-answer-content h1,
            .question-detail-modal .ai-answer-content h2,
            .question-detail-modal .ai-answer-content h3 {
                margin-top: 0;
                margin-bottom: 12px;
            }
            
            .question-detail-modal .ai-answer-content ul,
            .question-detail-modal .ai-answer-content ol {
                margin: 12px 0;
                padding-left: 24px;
            }
            
            .question-detail-modal .ai-answer-content li {
                margin-bottom: 4px;
            }
            
            .question-detail-modal .ai-answer-content code {
                background: rgba(0, 0, 0, 0.1);
                padding: 2px 4px;
                border-radius: 3px;
                font-family: 'Courier New', monospace;
            }
            
            .question-detail-modal .detail-metadata-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
            }
            
            /* Form Row for inline fields */
            .question-detail-modal .form-row {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
            }
            
            .question-detail-modal .form-row .form-group {
                flex: 1;
                min-width: 200px;
            }
            
            .question-detail-modal .form-group--narrow {
                max-width: 250px;
            }
            
            /* Copy IDs Button */
            .question-detail-modal .copy-ids-btn {
                padding: 4px 8px !important;
                font-size: 12px !important;
                transition: all 0.2s ease;
            }
            
            .question-detail-modal .copy-ids-btn.copy-success {
                background-color: #28a745 !important;
                color: white !important;
            }
            
            /* Expandable Content */
            .question-detail-modal .expand-toggle {
                background: none;
                border: none;
                padding: 0;
                margin-right: 8px;
                cursor: pointer;
                color: #666;
                transition: transform 0.2s ease;
            }
            
            .question-detail-modal .expand-toggle:hover {
                color: #333;
            }
            
            .question-detail-modal .expandable-content {
                transition: all 0.3s ease;
            }
            
            /* AI Sources List */
            .question-detail-modal .ai-sources-list {
                background: #f8f9fa;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                padding: 12px;
            }
            
            .question-detail-modal .ai-sources-items {
                margin: 0;
                padding-left: 20px;
                list-style-type: disc;
            }
            
            .question-detail-modal .ai-sources-items li {
                margin-bottom: 8px;
                font-size: 13px;
                line-height: 1.6;
                word-break: break-word;
            }
            
            @media (max-width: 1024px) {
                .question-detail-modal {
                    width: 95vw;
                    max-width: 1000px;
                }
                
                .question-detail-modal .question-tabs {
                    padding: 0 16px;
                }
                
                .question-detail-modal .tab-button {
                    padding: 10px 16px;
                    font-size: 13px;
                }
                
                .question-detail-modal .tab-button i {
                    font-size: 14px;
                }
            }
            
            @media (max-width: 768px) {
                .question-detail-modal .detail-metadata-grid {
                    grid-template-columns: 1fr;
                }
                
                .question-detail-modal {
                    width: 100vw;
                    max-width: 100vw;
                    height: 100vh;
                    max-height: 100vh;
                    border-radius: 0;
                    margin: 0;
                }
                
                .question-detail-modal .question-tabs {
                    flex-wrap: wrap;
                    padding: 0 12px;
                }
                
                .question-detail-modal .tab-button {
                    padding: 8px 12px;
                    font-size: 12px;
                    flex: 1;
                    min-width: 0;
                    justify-content: center;
                }
                
                .question-detail-modal .tab-button i {
                    display: none;
                }
                
                .question-detail-modal .form-row {
                    flex-direction: column;
                }
                
                .question-detail-modal .form-row .form-group {
                    min-width: 100%;
                }
                
                .question-detail-modal .modal-section {
                    padding: 16px;
                }
                
                .question-detail-modal .tab-pane {
                    padding: 16px;
                }
            }
            
            .question-detail-modal .modal-error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 16px;
                font-size: 14px;
            }

            /* Lock indicator styles */
            .question-detail-modal .lock-indicator {
                display: flex;
                align-items: center;
                padding: 4px 8px;
                background: rgba(220, 53, 69, 0.1);
                border: 1px solid rgba(220, 53, 69, 0.3);
                border-radius: 4px;
                font-size: 12px;
            }
            
            /* Disabled field styles */
            .question-detail-modal .field-disabled,
            .question-detail-modal .form-group input:disabled,
            .question-detail-modal .form-group select:disabled,
            .question-detail-modal .form-group textarea:disabled {
                background-color: var(--input-disabled-bg, #e9ecef) !important;
                color: var(--input-disabled-text, #6c757d) !important;
                cursor: not-allowed !important;
            }
            
            /* Additional styling for read-only fields that are always disabled */
            .question-detail-modal .field-readonly {
                background-color: #f8f9fa !important;
                border-color: #dee2e6 !important;
                font-style: italic;
            }
            
            /* Edit mode button states */
            .question-detail-modal #editModeBtn:disabled {
                background-color: #f8f9fa !important;
                color: #6c757d !important;
                cursor: not-allowed !important;
                border-color: #dee2e6 !important;
            }
            
            .question-detail-modal #editModeBtn:disabled i {
                color: #6c757d !important;
            }
            
            /* Cancel button when disabled */
            .question-detail-modal #cancelBtn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;

        document.head.appendChild(style);
    }
}