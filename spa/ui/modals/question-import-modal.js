// ui/modals/question-import-modal.js (NEW, REVISED)

import ImportConfig from '../../config/import-config.js';
import documentImportService from '../../api/document-import-service.js';
import * as importStageData from '../../utils/import-stage-data.js';
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { DOC_TASK_TYPE_DEFINITIONS } from "../framework/document-task-type-definitions.js";

// Import step components
import StepSelectMethod from '../components/docitemimport/step-select-method.js';
import StepSelectFile from '../components/docitemimport/step-select-file.js';
import StepPasteText from '../components/docitemimport/step-paste-text.js';
import StepMapColumns from '../components/docitemimport/step-map-columns.js';
import StepPreview from '../components/docitemimport/step-preview.js';
import StepConfirm from '../components/docitemimport/step-confirm.js';
import StepResults from '../components/docitemimport/step-results.js';

/**
 * Modal for importing questions from Excel/CSV files or text
 * Implements a multi-step wizard for method selection, file selection, column mapping, and import
 */
export class QuestionImportModal {

    static _instance = null;

    /**
     * Create a new import modal
     * @param {Object} options - Configuration options
     * @param {Object} options.docTaskInstance - Document task instance
     * @param {string} options.stageId - Stage ID
     * @param {Object} options.store - Application store
     */
    constructor(options = {}) {
        // If an instance already exists, clean it up before creating a new one
        if (QuestionImportModal._instance) {
            console.log('Found existing QuestionImportModal instance, cleaning up');
            QuestionImportModal._instance._cleanupModal();
        }

        // Register the new singleton instance
        QuestionImportModal._instance = this;

        this.docTaskInstance = options.docTaskInstance || {};
        this.stageId = options.stageId || '';
        this.store = options.store || {};

        // Determine the target stage ID for answer questions based on task type
        this.targetStageId = this._determineTargetStageId();

        // Add import method tracking
        this.importMethod = 'excel'; // Default to excel import

        // Modal elements
        this.overlayEl = null;
        this.modalEl = null;
        this.contentEl = null;
        this.footerEl = null;
        this.backButton = null;
        this.nextButton = null;
        this.cancelButton = null;
        this.closeButton = null;

        // Step management
        this.currentStep = 1;
        this.totalSteps = 5; // Default for Excel path without method selection
        this.steps = [];
        this.activeStepComponent = null;
        
        // For tracking path and step sequence
        this.excelPathSteps = [1, 2, 3, 4, 5]; // Default step indices (1-based) for Excel path
        this.textPathSteps = [1, 2, 3]; // Default step indices (1-based) for text path
        
        // Flag to see if we're using the method selection step
        this.useMethodSelection = true;

        // Data shared between steps
        this.wizardData = {
            fileData: null,
            metadata: null, // Excel worksheets / preview
            docMetadata: null, // form data (name, topic, …)
            mappingConfig: null,
            previewInfo: null,
            importResults: null,
            textContent: null,        // For text import
            extractionResult: null    // For text import
        };

        // Batch processing state
        this.importJobs = [];
        this.processingBatches = false;
        this.totalBatches = 0;
        this.completedBatches = 0;
        this.failedBatches = 0;
        this.successCount = 0;
        this.failureCount = 0;
        this.warningCount = 0;
        this.failureRows = [];
        this.warningRows = [];
        this.worksheetResults = {};

        // Modal services
        this.messageModal = options.messageModal || new MessageModal();
        this.errorModal = options.errorModal || new ErrorModal();
        this.yesNoModal = null;

        this.shownErrors = new Set(); // Track errors already shown
        this.errorDisplayTimeout = null; // Control error display timing

        this._initModal();
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
        titleEl.textContent = 'Import Questions';
        headerEl.appendChild(titleEl);

        this.closeButton = document.createElement('button');
        this.closeButton.className = 'modal__close';
        this.closeButton.innerHTML = '&times;';
        this.closeButton.setAttribute('aria-label', 'Close modal');

        // Use direct function instead of method reference to avoid 'this' binding issues
        this.closeButton.addEventListener('click', (e) => {
            console.log('Close button clicked (X)');
            e.preventDefault();
            this._forceCloseModal(); // Use the direct close method
        });

        headerEl.appendChild(this.closeButton);
        this.modalEl.appendChild(headerEl);

        // Create step indicator with placeholder steps (will be populated in show)
        const stepIndicator = document.createElement('div');
        stepIndicator.className = 'step-indicator';
        this.modalEl.appendChild(stepIndicator);

        // Create content area
        this.contentEl = document.createElement('div');
        this.contentEl.className = 'modal-content import-wizard-content';
        this.modalEl.appendChild(this.contentEl);

        // Create footer with buttons - at the end of the DOM order
        this.footerEl = document.createElement('div');
        this.footerEl.className = 'modal-footer';

        // Create cancel button OUTSIDE the button group
        this.cancelButton = document.createElement('button');
        this.cancelButton.className = 'btn btn-cancel';
        this.cancelButton.textContent = 'Cancel';

        // Use direct function instead of method reference
        this.cancelButton.addEventListener('click', (e) => {
            console.log('Cancel button clicked');
            e.preventDefault();
            this._forceCloseModal(); // Use direct close for reliability
        });

        this.footerEl.appendChild(this.cancelButton);

        // Create a button-group for back/next buttons only
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
        this.nextButton.style.display = 'block'; // Force display
        this.nextButton.style.visibility = 'visible'; // Ensure visibility
        this.nextButton.style.opacity = '1'; // Ensure opacity

        // Add important flag to override any conflicting CSS
        this.nextButton.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important; background-color: var(--interactive-primary) !important;');

        this.nextButton.addEventListener('click', () => this._goToNextStep());
        buttonGroup.appendChild(this.nextButton);

        // Add button group to footer AFTER cancel button
        this.footerEl.appendChild(buttonGroup);

        // Append footer to modal
        this.modalEl.appendChild(this.footerEl);

        // Append modal elements to body
        document.body.appendChild(this.overlayEl);
        document.body.appendChild(this.modalEl);

        // Initialize modal services
        this._initModalServices();

        // Initialize steps
        this._initSteps();
    }

    /**
     * Initialize modal service references
     */
    _initModalServices() {
        // Get references to global modal services
        if (window.MessageModal) {
            this.messageModal = new window.MessageModal();
        }

        if (window.ErrorModal) {
            this.errorModal = new window.ErrorModal();
        }

        if (window.YesNoModal) {
            this.yesNoModal = new window.YesNoModal();
        }
    }

    /**
     * Initialize step components
     */
    _initSteps() {
        this.steps = [];
        
        // Step 0: Method selection (new) - index 0
        this.steps.push(new StepSelectMethod({
            onNext: (data) => this._handleMethodSelected(data),
            onError: (message) => this._showError(message),
            messageModal: this.messageModal
        }));
        
        // Step 1: Select File (original first step) - index 1
        this.steps.push(new StepSelectFile({
            onNext: (data) => this._handleStepComplete(1, data),
            onError: (message) => this._showError(message),
            docTaskInstance: this.docTaskInstance,
            stageId: this.stageId
        }));
        
        // Step 2: Text Paste (new) - index 2
        this.steps.push(new StepPasteText({
            onNext: (data) => this._handleStepComplete(2, data),
            onError: (message) => this._showError(message),
            docTaskInstance: this.docTaskInstance,
            stageId: this.stageId,
            messageModal: this.messageModal
        }));
        
        // Step 3: Map Columns (original second step) - index 3
        this.steps.push(new StepMapColumns({
            onNext: (data) => this._handleStepComplete(3, data),
            onError: (message) => this._showError(message),
            parentModal: 'question' // Identify parent modal for shared component
        }));
        
        // Step 4: Preview (original third step) - index 4
        this.steps.push(new StepPreview({
            onNext: (data) => this._handleStepComplete(4, data),
            onError: (message) => this._showError(message),
            parentModal: 'question' // Identify parent modal for shared component
        }));
        
        // Step 5: Confirm (original fourth step) - index 5
        this.steps.push(new StepConfirm({
            onNext: (data) => this._handleStepComplete(5, data),
            onError: (message) => this._showError(message),
            showYesNoModal: (params) => this._showYesNoModal(params),
            parentModal: 'question' // Identify parent modal for shared component
        }));
        
        // Step 6: Results (original fifth step) - index 6
        this.steps.push(new StepResults({
            onComplete: (results) => this._handleImportComplete(results),
            docTaskInstance: this.docTaskInstance,
            stageId: this.stageId
        }));
        
        // Set up path step sequences (using indices into this.steps array)
        if (this.useMethodSelection) {
            // With method selection step:
            this.excelPathSteps = [0, 1, 3, 4, 5, 6]; // Method -> File -> Map -> Preview -> Confirm -> Results
            this.textPathSteps = [0, 2, 6];           // Method -> Text -> Results
        } else {
            // Traditional Excel-only flow (backward compatible):
            this.excelPathSteps = [1, 3, 4, 5, 6];    // File -> Map -> Preview -> Confirm -> Results
        }
    }

    /**
     * Handle method selection
     * @param {Object} data - Method selection data
     */
    _handleMethodSelected(data) {
        this.importMethod = data.method;
        console.log(`Import method selected: ${this.importMethod}`);
        
        // Update UI (step count, etc.) based on selected method
        if (this.importMethod === 'excel') {
            this.totalSteps = this.excelPathSteps.length;
            this.currentPath = this.excelPathSteps;
        } else if (this.importMethod === 'text') {
            this.totalSteps = this.textPathSteps.length;
            this.currentPath = this.textPathSteps;
        } else {
            this._showError('Unknown import method selected.');
            return;
        }
        
        // Update the step indicator
        this._updateStepIndicator();

        /* --------------------------------------------------------------
         * jump directly to the first real step after method selection
         * (index 2 in the wizard), otherwise calling “Next” will re‑enter
         * StepSelectMethod.proceed() and recurse forever.
         * -------------------------------------------------------------- */
        this.currentStep = 2;            // 1 = Select Method, 2 = File‑or‑Text step
        this._goToCurrentPathStep();     // render the correct component
    }

    /**
     * Show the modal
     * @param {Function} [onClose] - Optional callback when modal is closed
     */
    show(onClose) {
        this.onClose = onClose;

        // Make the instance accessible to the step components
        window.currentImportWizard = this;

        this.overlayEl.style.display = 'block';
        this.modalEl.style.display = 'flex';

        // Set initial path based on configuration
        if (this.useMethodSelection) {
            this.currentPath = this.excelPathSteps; // Start with excel path (will be updated on selection)
            this.totalSteps = this.excelPathSteps.length;
        } else {
            // Traditional flow - Excel only
            this.currentPath = this.excelPathSteps;
            this.totalSteps = this.excelPathSteps.length;
        }

        // Reset to first step
        this.currentStep = 1;
        this._updateStepIndicator();
        this._goToCurrentPathStep();
    }

    /**
     * Hide the modal
     */
    hide() {
        if (!this.overlayEl || !this.modalEl) return;
    
        /* existing visibility code … */
        this.overlayEl.style.display = 'none';
        this.modalEl.style.display = 'none';
    
        /* CLEAN‑UP */
        this._cleanupModal();
    
        /* fire onClose callback (unchanged) */
        if (typeof this.onClose === 'function') {
            this.onClose(this.wizardData.importResults);
        }
    }    

    /**
     * Handle step completion and data passing
     * @param {number} stepIndex - Index of the step in steps array
     * @param {Object} data - Data from the completed step
     */
    _handleStepComplete(stepIndex, data) {
        console.log(`Step ${stepIndex} completed with data:`, data);
    
        /* ---------- 1.  store what we got from the step ---------- */
        switch (stepIndex) {
            case 1:                                 // file picker
                this.wizardData.fileData  = data.file;
                this.wizardData.metadata  = data.metadata;
                break;
    
            case 2:                                 // paste text
                this.wizardData.textContent      = data.textContent;
                this.wizardData.extractionResult = data.extractionResult;
    
                // make the Results step aware that we’re on a text path
                if (this.steps[6]) {
                    this.steps[6].setImportMethod('text');
                    this.steps[6].setExtractionResult(data.extractionResult);
                }
                break;
    
            case 3:                                 // map columns
                this.wizardData.mappingConfig = data;
                break;
    
            case 4:                                 // preview
                this.wizardData.previewInfo   = data;
                break;
    
            case 5:                                 // confirm – kick off import and stop here
                this._startImport(data);
                return;
        }
    
        /* ---------- 2.  advance to the next wizard position ---------- */
        if (this.currentStep < this.totalSteps) {
            this.currentStep += 1;                 // move along our currentPath
            this._goToCurrentPathStep();           // render the next component
        }
    }

    _updateNextButtonState() {
        if (!this.nextButton || !this.activeStepComponent) return;
        const canGo = (typeof this.activeStepComponent.canProceed === 'function')
            ? this.activeStepComponent.canProceed()
            : true;
        this.nextButton.disabled = !canGo;
    }

    /**
     * Start the import process with improved error handling
     * @param {Object} data - Import configuration data
     */
    async _startImport(data) {
        console.log('Starting import process');

        // Reset batch processing state
        this.processingBatches = true;
        this.totalBatches = 0;
        this.completedBatches = 0;
        this.failedBatches = 0;
        this.successCount = 0;
        this.failureCount = 0;
        this.warningCount = 0;
        this.failureRows = [];
        this.warningRows = [];
        this.worksheetResults = {};
        this.worksheetEarlyStops = {};
        this.importStartTime = Date.now();

        try {
            // Set the import method on Results step
            if (this.steps[6]) {
                this.steps[6].setImportMethod('excel');
            }

            // Move to Results step (last step in the sequence)
            this.currentStep = this.totalSteps;
            this._goToCurrentPathStep();

            // Set StepResults to importing state
            if (this.steps[6]) {
                this.steps[6].setImportingState(true);
                this.contentEl.innerHTML = '';
                this.steps[6].render(this.contentEl);
            }

            // Update buttons for importing state
            this._updateButtonStatesForImporting();

            // Create initial batch configurations
            console.log('Creating batch configurations...');
            this.batchQueue = this._createBatchConfigurations();

            if (!this.batchQueue || this.batchQueue.length === 0) {
                throw new Error('No valid batches to process. Please check your column mappings and try again.');
            }

            this.totalBatches = this.batchQueue.length;
            console.log(`Initial batch count: ${this.totalBatches}`);

            // Update progress display with initial counts
            if (this.steps[6]) {
                this.steps[6].updateImportProgress({
                    totalBatches: this.totalBatches,
                    completedBatches: 0,
                    successCount: 0,
                    failureCount: 0,
                    warningCount: 0
                });
            }

            // Setup progress tracking with frequent updates
            const progressUpdateInterval = setInterval(() => {
                if (this.processingBatches) {
                    this._updateImportProgress();

                    // Update UI with current progress
                    if (this.steps[6]) {
                        this.steps[6].updateImportProgress({
                            totalBatches: this.totalBatches,
                            completedBatches: this.completedBatches,
                            successCount: this.successCount,
                            failureCount: this.failureCount,
                            warningCount: this.warningCount
                        });
                    }
                } else {
                    clearInterval(progressUpdateInterval);
                }
            }, 500); // Update every 500ms for smoother UI feedback

            // Get configured parallel batch count
            const parallelBatches = ImportConfig.parallelBatches || 2;
            console.log(`Starting import with ${parallelBatches} parallel batches`);

            // Process the queue
            await this._processQueue(parallelBatches);

            // Clear progress interval
            clearInterval(progressUpdateInterval);

            // Calculate import stats
            const totalTime = Math.round((Date.now() - this.importStartTime) / 1000);
            console.log(`Import completed in ${totalTime} seconds.`);
            console.log(`Results: ${this.successCount} successes, ${this.failureCount} failures, ${this.warningCount} warnings`);

            // Create import results object
            this.wizardData.importResults = {
                successCount: this.successCount,
                failureCount: this.failureCount,
                warningCount: this.warningCount,
                failureRows: this.failureRows,
                warningRows: this.warningRows,
                worksheetResults: this.worksheetResults,
                totalTimeSeconds: totalTime,
                completed: true
            };

            // Update the StepResults component with final results
            if (this.steps[6]) {
                this.steps[6].setImportingState(false);
                this.steps[6].importResults = this.wizardData.importResults;
                this.steps[6].fileData = this.wizardData.fileData;

                // Re-render with final results
                this.contentEl.innerHTML = '';
                this.activeStepComponent.render(this.contentEl);

                // Update button states for results
                this._updateButtonStatesForResults(this.successCount > 0);
            }

            // Show success toast for good UX
            if (this.successCount > 0) {
                this._showSuccess(`Import completed successfully. ${this.successCount} questions imported.`);
            }

        } catch (error) {
            console.error('Error processing import:', error);

            // Display error using the error modal
            this._showError('Import failed: ' + (error.message || 'Unknown error'));

            // Set import results with error
            this.wizardData.importResults = {
                successCount: this.successCount,
                failureCount: this.failureCount,
                warningCount: this.warningCount,
                failureRows: this.failureRows,
                warningRows: this.warningRows,
                worksheetResults: this.worksheetResults || {},
                error: error.message || 'Unknown error',
                completed: false
            };

            // Update the StepResults component with error state
            if (this.steps[6]) {
                this.steps[6].setImportingState(false);
                this.steps[6].importResults = this.wizardData.importResults;
                this.steps[6].fileData = this.wizardData.fileData;

                // Re-render with error state
                this.contentEl.innerHTML = '';
                this.activeStepComponent.render(this.contentEl);
            }
        } finally {
            // Always mark processing as complete
            this.processingBatches = false;
        }
    }

    /**
     * Navigate to the current step in the path
     * This handles the actual step rendering
     */
    _goToCurrentPathStep() {
        if (this.currentStep < 1 || this.currentStep > this.totalSteps) {
            console.warn(`Invalid step number: ${this.currentStep}, max: ${this.totalSteps}`);
            return;
        }
        
        // Get the step index from the current path array
        const pathIndex = this.currentStep - 1; // Convert 1-based to 0-based
        if (pathIndex >= this.currentPath.length) {
            console.warn('Step index out of path bounds');
            return;
        }
        
        // Get the actual step index from the current path
        const stepIndex = this.currentPath[pathIndex];
        const step = this.steps[stepIndex];
        
        if (!step) {
            console.error(`Step not found at index ${stepIndex}`);
            return;
        }
        
        console.log(`Going to step ${this.currentStep}/${this.totalSteps}: ${step.constructor.name}`);
        
        // Update step indicator
        this._updateStepIndicator();
        
        // Update button states
        this.backButton.disabled = this.currentStep === 1;
        
        // Update next button text based on current step
        if (this.currentStep === this.totalSteps) {
            this.nextButton.textContent = 'Finish';
        } else if (stepIndex === 5) { // Confirm step
            this.nextButton.textContent = 'Start Import';
        } else {
            this.nextButton.textContent = 'Next >';
        }
        
        // Set next button state based on canProceed
        this.nextButton.disabled = !step.canProceed?.();
        
        // Pass next button reference if step needs it
        if (typeof step.setNextButton === 'function') {
            step.setNextButton(this.nextButton);
        }
        
        // Store active step reference
        this.activeStepComponent = step;
        
        // Update step with data
        this._updateStepWithData(stepIndex);
        
        // Render the step
        this.contentEl.innerHTML = '';
        step.render(this.contentEl);
    }

    /**
     * Update the step indicator
     */
    _updateStepIndicator() {
        // Find step indicator
        const stepIndicator = this.modalEl.querySelector('.step-indicator');
        if (!stepIndicator) return;
        
        // Clear existing indicators
        stepIndicator.innerHTML = '';
        
        // Get step names based on current path
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
            
            stepIndicator.appendChild(step);
            
            // Add connector between steps (except after last step)
            if (index < stepNames.length - 1) {
                const connector = document.createElement('div');
                connector.className = 'step-connector';
                stepIndicator.appendChild(connector);
            }
        });
    }

    /**
     * Get step names based on current import path
     * @returns {Array} Array of step names
     */
    _getStepNames() {
        if (!this.useMethodSelection) {
            // Traditional Excel import path names
            return ['Choose File', 'Configure', 'Preview', 'Confirm', 'Results'];
        } else if (this.importMethod === 'excel') {
            // Excel import path with method selection
            return ['Select Method', 'Choose File', 'Configure', 'Preview', 'Confirm', 'Results'];
        } else if (this.importMethod === 'text') {
            // Text paste path
            return ['Select Method', 'Paste Text', 'Results'];
        } else {
            // Default fallback
            return ['Select Method', 'Next Step'];
        }
    }

    /**
     * Update step with data from previous steps
     * @param {number} stepIndex - Index of step in steps array
     */
    _updateStepWithData(stepIndex) {
        const step = this.steps[stepIndex];
        if (!step) return;
        
        switch (stepIndex) {
            case 0: // Select Method
                // No data needed
                break;
                
            case 1: // Select File
                // No data needed
                break;
                
            case 2: // Paste Text
                // No data needed
                break;
                
            case 3: // Map Columns
                console.log('UpdateStepWithData for Step 3 (Map Columns):', {
                    hasFileData: !!this.wizardData.fileData,
                    hasMetadata: !!this.wizardData.metadata,
                    metadataWorksheets: this.wizardData.metadata?.worksheets?.length || 0,
                    metadataPreviewKeys: Object.keys(this.wizardData.metadata?.preview || {}).length
                });

                if (step.fileData !== this.wizardData.fileData) {
                    step.fileData = this.wizardData.fileData;
                }

                // Use updateMetadata method if it exists
                if (this.wizardData.metadata && typeof step.updateMetadata === 'function') {
                    console.log('Calling updateMetadata on component');
                    step.updateMetadata(this.wizardData.metadata);
                } else if (step.metadata !== this.wizardData.metadata) {
                    console.log('Setting metadata directly on component');
                    step.metadata = this.wizardData.metadata;

                    // Try to force a re-process
                    if (typeof step._processMetadata === 'function') {
                        console.log('Calling _processMetadata directly');
                        step._processMetadata();
                    }
                }

                // If we have mapping config (when going back), preserve it
                if (this.wizardData.mappingConfig &&
                    typeof step.worksheetConfigs !== 'undefined') {
                    // Restore worksheet exclusion states
                    if (this.wizardData.mappingConfig.worksheets) {
                        step.worksheetTabs.forEach(tab => {
                            const isExcluded = !this.wizardData.mappingConfig.worksheets.includes(tab.id);
                            tab.excluded = isExcluded;
                        });

                        // If current tab is excluded in the tabs list, select first non-excluded tab
                        const currentTabIsExcluded = step.worksheetTabs.find(
                            tab => tab.id === step.currentTabId
                        )?.excluded;

                        if (currentTabIsExcluded) {
                            const firstNonExcludedTab = step.worksheetTabs.find(
                                tab => !tab.excluded
                            );
                            if (firstNonExcludedTab) {
                                step.currentTabId = firstNonExcludedTab.id;
                            }
                        }
                    }
                }
                break;
                
            case 4: // Preview
                step.fileData = this.wizardData.fileData;
                step.metadata = this.wizardData.metadata;
                step.mappingConfig = this.wizardData.mappingConfig;
                
                // Regenerate preview data if needed
                if (typeof step._generatePreviewData === 'function') {
                    step._generatePreviewData();
                }
                break;
                
            case 5: // Confirm
                step.fileData = this.wizardData.fileData;
                step.metadata = this.wizardData.metadata;
                step.mappingConfig = this.wizardData.mappingConfig;
                step.previewInfo = this.wizardData.previewInfo;
                break;
                
            case 6: // Results
                // Set import method
                step.setImportMethod(this.importMethod);
                
                // Update based on import method
                if (this.importMethod === 'text') {
                    step.setExtractionResult(this.wizardData.extractionResult);
                } else {
                    step.importResults = this.wizardData.importResults;
                }
                
                step.fileData = this.wizardData.fileData;
                break;
        }
    }

    /**
     * Go to the next step
     */
    _goToNextStep() {
        // Handle last step (Finish button)
        if (this.currentStep === this.totalSteps) {
            console.log('Finish button clicked');
            
            // This is the Finish button action
            if (this.activeStepComponent && typeof this.activeStepComponent.onComplete === 'function') {
                try {
                    console.log('Calling onComplete handler');
                    this.activeStepComponent.onComplete(this.wizardData.importResults || this.wizardData.extractionResult);
                } catch (error) {
                    console.error('Error in onComplete handler:', error);
                    // Fall back to force close
                    this._forceCloseModal();
                }
                return;
            } else {
                // Just force close the modal
                console.log('No onComplete handler, force closing modal');
                this._forceCloseModal();
                return;
            }
        }
        
        // Check if current step can proceed
        if (this.activeStepComponent && typeof this.activeStepComponent.canProceed === 'function') {
            if (!this.activeStepComponent.canProceed()) {
                return;
            }
            
            // If the step has a proceed method, call it
            if (typeof this.activeStepComponent.proceed === 'function') {
                this.activeStepComponent.proceed();
                return;
            }
        }
        
        // Go to next step
        this.currentStep++;
        this._goToCurrentPathStep();
    }

    /**
     * Go to the previous step
     */
    _goToPreviousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this._goToCurrentPathStep();
        }
    }

    /**
     * Handle cancel button or close
     */
    _handleCancel() {
        console.log('Cancel/Close button clicked');

        // If processing batches, show confirmation
        if (this.processingBatches) {
            // If YesNoModal component is available
            if (this.yesNoModal) {
                this.yesNoModal.show({
                    title: 'Cancel Import',
                    message: 'Import is in progress. Canceling now will stop the import process. Are you sure you want to cancel?',
                    onYes: () => {
                        console.log('User confirmed cancel during processing');
                        // Force stop processing
                        this.processingBatches = false;

                        // Force close the modal
                        this._forceCloseModal();
                    },
                    onNo: () => {
                        console.log('User canceled the cancel operation');
                    }
                });
            } else if (window.YesNoModal) {
                // Create a new instance if we don't have one yet
                this.yesNoModal = new window.YesNoModal();
                this.yesNoModal.show({
                    title: 'Cancel Import',
                    message: 'Import is in progress. Canceling now will stop the import process. Are you sure you want to cancel?',
                    onYes: () => {
                        console.log('User confirmed cancel during processing');
                        this.processingBatches = false;
                        this._forceCloseModal();
                    },
                    onNo: () => {
                        console.log('User canceled the cancel operation');
                    }
                });
            } else {
                // Fallback to simple confirm
                if (confirm('Import is in progress. Canceling now will stop the import process. Are you sure you want to cancel?')) {
                    console.log('User confirmed cancel (fallback method)');
                    this.processingBatches = false;
                    this._forceCloseModal();
                }
            }
        } else {
            // No processing, just close directly
            console.log('Closing modal directly (no active processing)');
            this._forceCloseModal();
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
            this.processingBatches = false;

            // As a failsafe, find and hide all modals and overlays that match our classes
            const allOverlays = document.querySelectorAll('.overlay');
            allOverlays.forEach(overlay => {
                overlay.style.display = 'none';
            });

            const allModals = document.querySelectorAll('.modal.import-wizard-modal');
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

            this._cleanupModal();

            console.log('Modal successfully closed');
        } catch (error) {
            console.error('Error force closing modal:', error);

            // Last resort fallback using alert to notify the user
            alert('There was an error closing the import wizard. Please refresh the page.');
        }
    }

    /**
     * Show error message using ErrorModal
     * @param {string} message - Error message
     */
    _showError(message) {
        console.error('Import Error:', message);

        // Create a clean, user-friendly message
        let userMessage = message;

        // Handle common error cases with clearer messages
        if (message.includes('Cannot read properties of undefined')) {
            userMessage = 'Internal Error: The system encountered a problem with the import configuration. Please try again.';
        } else if (message.includes('Failed to read batch')) {
            userMessage = 'The system encountered an error reading your file. The file may be corrupted or in an unsupported format.';
        } else if (message.includes('403') || message.includes('Forbidden')) {
            userMessage = 'Access denied to file in storage. Please try uploading the file again.';
        }

        // Import ErrorModal directly using the pattern from the cheat sheet
        try {
            // First try to use existing instance
            if (this.errorModal) {
                this.errorModal.show({
                    title: 'Import Error',
                    message: userMessage
                });
                return;
            }

            // Then try to use window.ErrorModal
            if (window.ErrorModal) {
                this.errorModal = new window.ErrorModal();
                this.errorModal.show({
                    title: 'Import Error',
                    message: userMessage
                });
                return;
            }

            // If that fails, try direct import
            import("../../ui/modals/error-modal.js").then(module => {
                const ErrorModal = module.ErrorModal;
                this.errorModal = new ErrorModal();
                this.errorModal.show({
                    title: 'Import Error',
                    message: userMessage
                });
            }).catch(importError => {
                console.error('Failed to import ErrorModal:', importError);
                alert('Error: ' + userMessage);
            });
        } catch (modalError) {
            console.error('Error showing error modal:', modalError);
            alert('Error: ' + userMessage);
        }
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    _showSuccess(message) {
        if (this.messageModal) {
            this.messageModal.show({
                title: 'Success',
                message: message
            });
        } else if (window.MessageModal) {
            // Create a new instance if we don't have one yet
            this.messageModal = new window.MessageModal();
            this.messageModal.show({
                title: 'Success',
                message: message
            });
        } else {
            // Just log to console - no alerts
            console.log('Success:', message);
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
                // Create a new instance if we don't have one yet
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
                // Fallback to console message - no confirms
                console.warn('No YesNoModal available. Defaulting to true');
                resolve(true);
            }
        });
    }

    /**
     * Update button states for importing
     */
    _updateButtonStatesForImporting() {
        // Disable next button during import
        if (this.nextButton) {
            this.nextButton.disabled = true;
            this.nextButton.textContent = 'Importing...';
        }

        // Keep cancel enabled (with confirmation dialog)
        if (this.cancelButton) {
            this.cancelButton.disabled = false;
        }
    }

    /**
     * Update button states for the Results step
     * @param {boolean} hasSuccessfulImport - Whether there was a successful import
     */
    _updateButtonStatesForResults(hasSuccessfulImport) {
        console.log('_updateButtonStatesForResults called with:', hasSuccessfulImport);

        // Update Next button to say "Finish"
        if (this.nextButton) {
            this.nextButton.textContent = 'Finish';
            this.nextButton.disabled = false;
            this.nextButton.style.display = 'block';
            this.nextButton.style.visibility = 'visible';
            this.nextButton.style.opacity = '1';

            // Add important flags
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

        // Disable Cancel button if there was a successful import
        if (this.cancelButton && hasSuccessfulImport) {
            console.log('Disabling Cancel button due to successful import');
            this.cancelButton.disabled = true;
            this.cancelButton.style.opacity = '0.5';
        } else if (!this.cancelButton) {
            console.error('Cancel button not found!');
        }
    }

    /**
     * Create batch configurations with row count awareness
     * @returns {Array} - Array of batch configurations
     */
    _createBatchConfigurations() {
        try {
            // Get project and document IDs
            const projectId = this.docTaskInstance.project_id || this.docTaskInstance.projectId;
            const documentId = this.docTaskInstance.document_id || this.docTaskInstance.documentId;

            if (!projectId || !documentId) {
                throw new Error('Missing project_id or document_id. Please save the document first.');
            }

            // Validate required data from previous steps
            if (!this.wizardData.fileData) {
                throw new Error('File data is missing. Please select a file in step 1.');
            }

            if (!this.wizardData.mappingConfig) {
                throw new Error('Mapping configuration is missing. Please configure column mappings in step 2.');
            }

            // Check if worksheets array exists
            if (!this.wizardData.mappingConfig.worksheets ||
                !Array.isArray(this.wizardData.mappingConfig.worksheets) ||
                this.wizardData.mappingConfig.worksheets.length === 0) {
                throw new Error('No worksheets selected for import. Please go back to step 2 and select at least one worksheet.');
            }

            // Ensure mappingsBySheet exists
            if (!this.wizardData.mappingConfig.mappingsBySheet) {
                throw new Error('Worksheet mappings are missing. Please configure column mappings in step 2.');
            }

            // Use the dynamically determined answer questions stage ID
            const targetStageId = this.targetStageId;
            console.log(`Using target stage ID: ${targetStageId}`);

            // Create batch configurations based on worksheet data
            const batchQueue = [];

            // Initialize worksheetResults if not already created
            this.worksheetResults = this.worksheetResults || {};

            // Check if we have row counts from metadata
            const hasRowCounts = !!(this.wizardData.metadata?.row_counts);
            console.log(`Row count metadata available: ${hasRowCounts}`);

            // For each worksheet, create initial batch
            this.wizardData.mappingConfig.worksheets.forEach(worksheetName => {
                if (!worksheetName) {
                    console.warn('Skipping undefined worksheet name');
                    return;
                }

                const sheetConfig = this.wizardData.mappingConfig.mappingsBySheet[worksheetName] || {};

                // Convert from 0-based (frontend) to 1-based (backend) indexing
                // Frontend: startRow = 0 means "start from first row" (index 0)
                // Backend: start_row = 1 means "start from first row"
                // So we need to add 1 to convert from 0-based to 1-based
                let startRow = (sheetConfig.startRow || 0) + 1;

                const mappings = sheetConfig.mappings || [];

                // Verify we have the required mappings
                if (!mappings.some(m => m.destinationField === 'question_id') ||
                    !mappings.some(m => m.destinationField === 'question_text')) {
                    console.warn(`Skipping worksheet ${worksheetName} - missing required mappings`);
                    return;
                }

                // Generate sanitized group ID from worksheet name
                const trimmedName = worksheetName.trim();
                const groupId = this._sanitizeGroupId(trimmedName);

                // Initialize worksheet results
                this.worksheetResults[worksheetName] = {
                    successCount: 0,
                    failureCount: 0,
                    warningCount: 0
                };

                // Create just one initial batch per worksheet
                // The rest will be created dynamically based on results
                const initialBatch = {
                    project_document_id: `${projectId}#${documentId}`,
                    document_id: documentId,
                    stage_id: targetStageId, // Always use the answer questions stage ID
                    group_id: groupId,
                    group_name: trimmedName,
                    s3_bucket: this.wizardData.fileData.s3_bucket,
                    s3_key: this.wizardData.fileData.s3_key,
                    sheet_name: worksheetName,
                    header_row: (sheetConfig.headerRow || 0) + 1, // Convert to 1-based for backend
                    start_row: startRow, // Start from row after header (already converted to 1-based)
                    batch_offset: 0,
                    batch_size: ImportConfig.rowsPerBatch || 20,
                    mappings: this._formatMappings(mappings),
                    check_existing_group: true
                };

                batchQueue.push(initialBatch);

                // Log row count info if available
                if (hasRowCounts && this.wizardData.metadata.row_counts[worksheetName]) {
                    const totalRows = this.wizardData.metadata.row_counts[worksheetName];
                    const effectiveRows = Math.max(0, totalRows - startRow);
                    const estimatedBatches = Math.ceil(effectiveRows / ImportConfig.rowsPerBatch);

                    console.log(`Worksheet "${worksheetName}": ${totalRows} total rows, ${effectiveRows} data rows starting at row ${startRow}, ~${estimatedBatches} batches`);
                } else {
                    console.log(`Worksheet "${worksheetName}": No row count available, starting at row ${startRow}`);
                }
            });

            if (batchQueue.length === 0) {
                throw new Error('No valid worksheets to import. Please check column mappings and try again.');
            }

            console.log(`Created ${batchQueue.length} initial batch configurations`);
            return batchQueue;
        } catch (error) {
            console.error('Error creating batch configurations:', error);
            throw error; // Re-throw to be caught by caller
        }
    }

    /**
     * Process the queue of batch operations with controlled parallelism
     * @param {number} parallelLimit - Maximum number of parallel batch processes
     * @returns {Promise} - Promise that resolves when all batches are processed
     */
    async _processQueue(parallelLimit) {
        console.log('Starting batch processing queue');

        if (!this.batchQueue || this.batchQueue.length === 0) {
            console.log('No batches to process');
            return;
        }

        // Create tracking data structure for each worksheet
        const worksheetTracking = {};

        // Initialize tracking for each worksheet in the initial queue
        this.batchQueue.forEach(batch => {
            const worksheetName = batch.sheet_name;
            if (!worksheetTracking[worksheetName]) {
                // Get the row count from metadata if available
                const rowCount = (this.wizardData.metadata?.row_counts?.[worksheetName]) || 1000;

                // Calculate max possible batches based on row count
                const estimatedMaxBatches = Math.ceil(rowCount / ImportConfig.rowsPerBatch);

                // Cap at a reasonable maximum
                const maxBatches = Math.min(
                    estimatedMaxBatches,
                    ImportConfig.maxBatchesPerWorksheet || 500
                );

                worksheetTracking[worksheetName] = {
                    currentOffset: 0,
                    isComplete: false,
                    batchesCreated: 1, // Initial batch is already in queue
                    batchesProcessed: 0,
                    maxBatches: maxBatches,
                    successfulRows: 0,
                    consecutiveEmptyResponses: 0,
                    maxConsecutiveEmptyResponses: ImportConfig.maxConsecutiveEmptyResponses || 3
                };

                console.log(`Worksheet "${worksheetName}": Row count = ${rowCount}, Max batches = ${maxBatches}`);
            }
        });

        // Track active workers and overall process state
        let activeWorkers = 0;
        let queuePosition = 0;
        const processedWorksheets = new Set();

        // Process batches until completion or safety limits reached
        const startTime = Date.now();
        const MAX_PROCESSING_TIME_MS = ImportConfig.maxProcessingTimeMs || 300000; // 5 minutes max

        while (this.processingBatches) {
            // TIME LIMIT SAFETY CHECK
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime > MAX_PROCESSING_TIME_MS) {
                console.warn(`Import processing time limit reached (${MAX_PROCESSING_TIME_MS}ms). Terminating.`);
                break;
            }

            // COMPLETION CHECK
            // Exit if queue is empty and no active workers
            if (queuePosition >= this.batchQueue.length && activeWorkers === 0) {
                console.log('All batches processed, queue exhausted');
                break;
            }

            // Launch new workers up to the parallel limit
            while (activeWorkers < parallelLimit &&
                queuePosition < this.batchQueue.length &&
                this.processingBatches) {

                const batchConfig = this.batchQueue[queuePosition];
                const worksheetName = batchConfig.sheet_name;
                const tracking = worksheetTracking[worksheetName];

                // Skip if this worksheet is already marked complete
                if (!tracking || tracking.isComplete) {
                    console.log(`Skipping batch for completed worksheet "${worksheetName}"`);
                    queuePosition++;
                    continue;
                }

                // BATCH COUNT SAFETY CHECK
                // Skip if we've reached the maximum batch count for this worksheet
                if (tracking.batchesProcessed >= tracking.maxBatches) {
                    console.warn(`Maximum batch count (${tracking.maxBatches}) reached for worksheet "${worksheetName}". Marking as complete.`);
                    tracking.isComplete = true;
                    this.worksheetEarlyStops[worksheetName] = true;
                    queuePosition++;
                    continue;
                }

                // Increment queue position before processing to avoid race conditions
                queuePosition++;

                // Process this batch
                activeWorkers++;
                tracking.batchesProcessed++;

                this._processBatch(batchConfig)
                    .then(result => {
                        // Track success/failure
                        if (result) {
                            const successCount = result.success_count || 0;
                            tracking.successfulRows += successCount;

                            // EMPTY RESPONSE SAFETY CHECK
                            // Track consecutive empty responses to detect completion
                            if (successCount === 0 && (!result.failure_rows || result.failure_rows.length === 0)) {
                                tracking.consecutiveEmptyResponses++;
                                console.log(`Worksheet "${worksheetName}": Empty response #${tracking.consecutiveEmptyResponses}`);

                                // Stop if we've received too many consecutive empty responses
                                if (tracking.consecutiveEmptyResponses >= tracking.maxConsecutiveEmptyResponses) {
                                    console.log(`Worksheet "${worksheetName}": Max consecutive empty responses reached. Marking as complete.`);
                                    tracking.isComplete = true;
                                    this.worksheetEarlyStops[worksheetName] = true;
                                    return;
                                }
                            } else {
                                // Reset counter if we got data
                                tracking.consecutiveEmptyResponses = 0;
                            }

                            // Handle early stop flag from server
                            if (result.early_stop) {
                                console.log(`Worksheet "${worksheetName}": Server signaled early stop`);
                                tracking.isComplete = true;
                                this.worksheetEarlyStops[worksheetName] = true;
                                return;
                            }

                            // Create next batch if not complete and queue isn't getting too large
                            if (!tracking.isComplete &&
                                this.batchQueue.length < ImportConfig.maxTotalBatchQueueSize) {

                                // Increment offset for next batch
                                tracking.currentOffset += batchConfig.batch_size;
                                tracking.batchesCreated++;

                                // Clone the batch config and update offset
                                const nextBatch = { ...batchConfig };
                                nextBatch.batch_offset = tracking.currentOffset;

                                // Add to queue
                                this.batchQueue.push(nextBatch);
                                this.totalBatches += 1;   
                                this._updateImportProgress();

                                // Update UI with current progress
                                this.steps[6].updateImportProgress({
                                    totalBatches: this.totalBatches,
                                    completedBatches: this.completedBatches,
                                    successCount: this.successCount,
                                    failureCount: this.failureCount,
                                    warningCount: this.warningCount
                                });
                                console.log(`Added batch #${tracking.batchesCreated} for "${worksheetName}" at offset ${tracking.currentOffset}`);
                            }
                        }
                    })
                    .catch(error => {
                        console.error(`Error processing batch for "${worksheetName}":`, error);

                        // Mark worksheet as complete after critical error
                        tracking.isComplete = true;
                        this.worksheetEarlyStops[worksheetName] = true;
                    })
                    .finally(() => {
                        activeWorkers--;

                        // Check if all worksheets are complete
                        const allComplete = Object.values(worksheetTracking).every(t => t.isComplete);
                        if (allComplete && activeWorkers === 0) {
                            console.log('All worksheets marked complete. Ending import process.');
                            this.processingBatches = false;
                        }
                    });

                // Small delay between launching workers to prevent rate limits
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Wait a bit before checking queue again
            await new Promise(resolve => setTimeout(resolve, 100));

            // Update progress
            this._updateImportProgress();
        }

        // Wait for any remaining active workers to complete
        let waitCount = 0;
        const MAX_WAIT_COUNT = 50; // 5 seconds max

        while (activeWorkers > 0 && waitCount < MAX_WAIT_COUNT) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }

        // Force termination if workers haven't completed
        if (activeWorkers > 0) {
            console.warn(`Forcing termination with ${activeWorkers} workers still active`);
        }

        console.log('Queue processing complete');

        // Log worksheet-specific stats
        Object.entries(worksheetTracking).forEach(([name, stats]) => {
            console.log(`Worksheet "${name}": ${stats.successfulRows} rows imported, ${stats.batchesProcessed}/${stats.maxBatches} batches processed`);
        });

        // Final progress update
        this._updateImportProgress();
    }

    /**
     * Process a single batch of data with improved error handling
     * @param {Object} config - Batch configuration
     * @returns {Promise} - Promise that resolves with the batch result
     */
    async _processBatch(config) {
        // Track retries
        let retries = 0;
        const maxRetries = ImportConfig.maxBatchRetries || 3;

        // Create batch identifier for logs
        const batchId = `${config.sheet_name}:${config.batch_offset}`;

        while (retries < maxRetries) {
            try {
                // Process the batch
                const result = await documentImportService.createBatch(config);

                // Log detailed results
                console.log(`Batch ${batchId} completed: success=${result.success_count || 0}, failures=${result.failure_rows?.length || 0}, early_stop=${!!result.early_stop}`);

                // Update global counters
                this.completedBatches++;
                this.successCount += result.success_count || 0;

                // Process failure rows
                if (result.failure_rows && result.failure_rows.length > 0) {
                    this.failureCount += result.failure_rows.length;

                    // Limit stored failures to prevent memory issues
                    const maxStoredFailures = ImportConfig.maxStoredFailures || 1000;
                    if (this.failureRows.length < maxStoredFailures) {
                        const enhancedFailures = result.failure_rows.map(failure => ({
                            ...failure,
                            worksheet: config.sheet_name,
                            batchOffset: config.batch_offset
                        }));
                        this.failureRows.push(...enhancedFailures);
                    }

                    // Update worksheet results
                    if (this.worksheetResults[config.sheet_name]) {
                        this.worksheetResults[config.sheet_name].failureCount += result.failure_rows.length;
                    }
                }

                // Process warning rows
                if (result.warning_rows && result.warning_rows.length > 0) {
                    this.warningCount += result.warning_rows.length;

                    // Limit stored warnings
                    const maxStoredWarnings = ImportConfig.maxStoredWarnings || 1000;
                    if (this.warningRows.length < maxStoredWarnings) {
                        const enhancedWarnings = result.warning_rows.map(warning => ({
                            ...warning,
                            worksheet: config.sheet_name,
                            batchOffset: config.batch_offset
                        }));
                        this.warningRows.push(...enhancedWarnings);
                    }

                    // Update worksheet results
                    if (this.worksheetResults[config.sheet_name]) {
                        this.worksheetResults[config.sheet_name].warningCount += result.warning_rows.length;
                    }
                }

                // Update worksheet success count
                if (this.worksheetResults[config.sheet_name]) {
                    this.worksheetResults[config.sheet_name].successCount += result.success_count || 0;
                }

                return result;
            } catch (error) {
                retries++;
                console.error(`Error processing batch ${batchId} (retry ${retries}/${maxRetries}):`, error);

                // Display error on first attempt
                if (retries === 1) {
                    this._showError(`Error processing worksheet "${config.sheet_name}": ${error.message || 'Unknown error'}`);
                }

                // If max retries reached, mark as failed
                if (retries >= maxRetries) {
                    this.failedBatches++;
                    this.completedBatches++;

                    // Add to failure details
                    const maxStoredFailures = ImportConfig.maxStoredFailures || 1000;
                    if (this.failureRows.length < maxStoredFailures) {
                        const failureInfo = {
                            row_index: config.batch_offset,
                            error: `Batch processing failed after ${maxRetries} attempts: ${error.message || 'Unknown error'}`,
                            row_preview: {
                                worksheet: config.sheet_name,
                                batch_offset: config.batch_offset,
                                batch_size: config.batch_size
                            },
                            worksheet: config.sheet_name
                        };
                        this.failureRows.push(failureInfo);
                    }

                    this.failureCount++;

                    // Update worksheet results
                    if (this.worksheetResults[config.sheet_name]) {
                        this.worksheetResults[config.sheet_name].failureCount++;
                    }

                    throw error;
                }

                // Exponential backoff for retries
                const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // This should never be reached due to the retry logic above
        throw new Error(`Unexpected state in _processBatch for ${batchId}`);
    }

    /**
     * Update import progress in docTaskInstance
     */
    _updateImportProgress() {
        try {
            // Calculate progress percentage
            const progress = this.totalBatches > 0 ?
                Math.floor((this.completedBatches / this.totalBatches) * 100) : 0;

            // Throttle persistence to localStorage - only update if:
            // 1. Progress has changed significantly (5% or more)
            // 2. Or it's been at least 3 seconds since last persistence
            const now = Date.now();
            const lastProgress = this._lastProgressPercent || 0;
            const lastPersistTime = this._lastPersistTime || 0;
            const progressDelta = Math.abs(progress - lastProgress);
            const timeDelta = now - lastPersistTime;

            const shouldPersist = progressDelta >= 5 || timeDelta >= 3000;

            // Update docTaskInstance
            importStageData.updateImportSummary(this.docTaskInstance, this.stageId, {
                lastImportDate: new Date().toISOString(),
                totalFiles: 1, // Current import is 1 file
                totalWorksheets: this.wizardData.mappingConfig.worksheets.length,
                totalQuestionsImported: this.successCount,
                totalFailures: this.failureCount,
                importProgress: progress
            });

            // Mark docTaskInstance as dirty to trigger save
            this.docTaskInstance.isDirty = true;

            // Update stage status if needed
            if (this.successCount > 0 && !this.isStageStarted()) {
                importStageData.updateStageStatus(this.docTaskInstance, this.stageId, 'IN_PROGRESS');
            }

            // Only persist to localStorage if needed
            if (shouldPersist && window.tabManager) {
                console.log(`Persisting progress update: ${progress}% (delta: ${progressDelta}%, time: ${timeDelta}ms)`);
                window.tabManager.persistTabs();

                // Update tracking
                this._lastProgressPercent = progress;
                this._lastPersistTime = now;
            }

        } catch (error) {
            console.error('Error updating import progress:', error);
        }
    }

    /**
     * Check if stage is already started
     * @returns {boolean} - Whether stage is started
     */
    isStageStarted() {
        const status = this.docTaskInstance.stageData?.[this.stageId]?.status;
        return status === 'IN_PROGRESS' || status === 'COMPLETED';
    }

    /**
     * Handle import completion
     * @param {Object} results - Import results
     */
    _handleImportComplete(results) {
        console.log('Handling import completion in QuestionImportModal');

        try {
            // Store uploaded file info in docTaskInstance
            if (this.wizardData.fileData) {
                // Store file data in docTaskInstance (using the import-stage-data util)
                importStageData.addUploadedFile(this.docTaskInstance, this.stageId, {
                    name: this.wizardData.fileData.name,
                    size: this.wizardData.fileData.size,
                    type: this.wizardData.fileData.type,
                    s3_bucket: this.wizardData.fileData.s3_bucket,
                    s3_key: this.wizardData.fileData.s3_key,
                    upload_datetime: new Date().toISOString(),
                    worksheets: this.wizardData.mappingConfig?.worksheets,
                    importOptions: this.wizardData.mappingConfig?.mappingsBySheet,
                    importResults: {
                        successCount: results.successCount,
                        failureCount: results.failureCount,
                        warningCount: results.warningCount
                    }
                });

                // Mark docTaskInstance as dirty to trigger save
                this.docTaskInstance.isDirty = true;

                // If window.tabManager exists, persist the changes to localStorage
                if (window.tabManager) {
                    window.tabManager.persistTabs();
                }
                
                // Trigger auto-save after successful import
                // Check if the document has an internal save hook (from MultiStageDocumentBase)
                if (this.docTaskInstance.__internalSaveHook && typeof this.docTaskInstance.__internalSaveHook === 'function') {
                    console.log('Triggering auto-save after import completion');
                    this.docTaskInstance.__internalSaveHook();
                }
            }
        } catch (error) {
            console.error('Error storing uploaded file info:', error);
        }

        // Force close the modal
        this._forceCloseModal();
    }

    /**
     * Clean up any running import jobs
     */
    _cleanupImportJobs() {
        this.processingBatches = false;
        this.importJobs = [];
    }

    /**
     * Format mappings for API request
     * @param {Array} mappings - Mappings from UI
     * @returns {Object} - Formatted mappings object
     */
    _formatMappings(mappings) {
        const result = {};

        mappings.forEach(mapping => {
            if (mapping.sourceColumn !== null && mapping.sourceColumn !== undefined) {
                // Use column name as key and source column as value
                result[mapping.destinationField] = mapping.sourceColumn;
            }
        });

        return result;
    }

    /**
     * Sanitize worksheet name for use as group ID
     * @param {string} worksheetName - Original worksheet name
     * @returns {string} - Sanitized group ID
     */
    _sanitizeGroupId(worksheetName) {
        if (!worksheetName) return 'group';

        // First trim the name
        const trimmedName = worksheetName.trim();

        // Convert to lowercase, replace spaces and special chars with underscore
        let sanitized = trimmedName.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w_]/g, '')
            .replace(/_{2,}/g, '_') // Replace multiple underscores with a single one
            .replace(/^_+|_+$/g, ''); // Remove leading and trailing underscores

        // Ensure it's not empty
        if (!sanitized) {
            sanitized = 'group';
        }

        return sanitized;
    }

    /**
     * Completely remove the modal, its DOM nodes, listeners, timers,
     * and singleton references. Called by hide() and _forceCloseModal().
     */
    _cleanupModal() {
        /* --- 1. stop any timers / intervals ----------------------- */
        if (this._progressIntervalId) clearInterval(this._progressIntervalId);

        /* --- 2. remove DOM nodes ---------------------------------- */
        if (this.overlayEl?.parentNode) this.overlayEl.parentNode.removeChild(this.overlayEl);
        if (this.modalEl?.parentNode)   this.modalEl.parentNode.removeChild(this.modalEl);

        /* --- 3. call per‑step clean‑ups if they exist ------------- */
        if (this.steps?.length) {
            this.steps.forEach(step => {
                if (typeof step.cleanup === 'function') step.cleanup();
            });
        }

        /* --- 4. clear global/window references -------------------- */
        if (window.currentImportWizard === this) window.currentImportWizard = null;

        /* --- 5. clear singleton reference ------------------------- */
        if (QuestionImportModal._instance === this) QuestionImportModal._instance = null;
    }

    /**
     * Determine the target stage ID for answer questions based on document task type
     * @returns {string} The stage ID where questions should be saved for answering
     * @private
     */
    _determineTargetStageId() {
        try {
            // Get the task type from the document task instance
            const taskType = this.docTaskInstance.taskType;
            
            if (!taskType) {
                console.warn('[QuestionImportModal] No task type found, using RFP default');
                return ImportConfig.answerStageId || 'rfp_stage_3_answer_questions';
            }

            // Find the task definition
            const taskDef = DOC_TASK_TYPE_DEFINITIONS.find(t => t.taskType === taskType);
            
            if (!taskDef) {
                console.warn(`[QuestionImportModal] Unknown task type: ${taskType}, using RFP default`);
                return ImportConfig.answerStageId || 'rfp_stage_3_answer_questions';
            }

            // Find the stage with dataSourceName "questions" or "security_questions"
            // This identifies the Answer Questions stage
            const answerStage = taskDef.stages.find(stage => 
                stage.dataSourceName === 'questions' || 
                stage.dataSourceName === 'security_questions'
            );

            if (answerStage) {
                console.log(`[QuestionImportModal] Using target stage ID: ${answerStage.stageId} for task type: ${taskType}`);
                return answerStage.stageId;
            }

            // Fallback: look for stage with "answer" in the name
            const fallbackStage = taskDef.stages.find(stage => 
                stage.stageName.toLowerCase().includes('answer')
            );

            if (fallbackStage) {
                console.log(`[QuestionImportModal] Using fallback stage ID: ${fallbackStage.stageId} for task type: ${taskType}`);
                return fallbackStage.stageId;
            }

            console.warn(`[QuestionImportModal] No answer stage found for task type: ${taskType}, using RFP default`);
            return ImportConfig.answerStageId || 'rfp_stage_3_answer_questions';

        } catch (error) {
            console.error('[QuestionImportModal] Error determining target stage ID:', error);
            return ImportConfig.answerStageId || 'rfp_stage_3_answer_questions';
        }
    }
}

export default QuestionImportModal;