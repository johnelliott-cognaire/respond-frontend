// ui/stages/stage-form-security-question-import.js

import QuestionImportModal from '../modals/question-import-modal.js';
import * as importStageData from '../../utils/import-stage-data.js';
import { 
    createImportFormStructure, 
    createUploadSection,
    renderFilesList,
    addImportFormStyles,
    showImportMessage
} from '../../utils/questionnaire-import-utils.js';

/**
 * Stage form for Security Questionnaire question import (Stage 1)
 * Displays a list of uploaded files and allows importing new security questionnaire files
 */
export default class StageFormSecurityQuestionImport {
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
                           || "security_stage_1_upload_questions";
        
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
        
        // Create stage form structure using shared utility
        const formContainer = createImportFormStructure({
            title: 'Upload Security Questions',
            description: 'Import Excel or CSV files containing security questionnaire questions. Each file can contain multiple worksheets, and each worksheet will be imported as a separate group of security questions.',
            className: 'stage-form-security-question-import',
            isDocumentSaved: this.isDocumentSaved
        });
        
        // Create upload section using shared utility
        const uploadElements = createUploadSection({
            sectionTitle: 'Current Uploaded Security Questionnaires',
            buttonText: 'Import New Security Questionnaire',
            buttonIcon: 'fas fa-shield-alt',
            onImportClick: () => this._handleImportClick(),
            isDocumentSaved: this.isDocumentSaved
        });
        
        // Store references
        this.fileListContainer = uploadElements.fileListContainer;
        this.importButton = uploadElements.importButton;
        
        // Add upload section to form
        formContainer.appendChild(uploadElements.section);
        
        // Render files list
        this._renderFilesList();
        
        containerEl.appendChild(formContainer);
        
        // Add CSS styles using shared utility
        addImportFormStyles('stage-form-security-question-import-styles');
    }
    
    /**
     * Render the list of uploaded files using shared utility
     */
    _renderFilesList() {
        renderFilesList(this.fileListContainer, this.docTaskInstance, this.currentStageId);
    }
    
    /**
     * Handle import button click
     */
    _handleImportClick() {
        if (!this.isDocumentSaved) {
            showImportMessage('Please save the document before importing security questions.');
            return;
        }
        
        // Create import modal if not exists
        if (!this.importModal) {
            this.importModal = new QuestionImportModal({
                docTaskInstance: this.docTaskInstance,
                stageId: this.currentStageId,
                store: window.store
            });
        }
        
        // Show the modal
        this.importModal.show(() => {
            // Refresh the files list when modal is closed
            this._renderFilesList();
        });
    }
}