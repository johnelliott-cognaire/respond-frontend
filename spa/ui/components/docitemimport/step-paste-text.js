// ui/components/docitemimport/step-paste-text.js

import documentImportService from '../../../api/document-import-service.js';
import { ErrorModal } from "../../modals/error-modal.js";
import { MessageModal } from "../../modals/message-modal.js";

/**
 * Paste Text step of the question import wizard
 * Allows users to paste a block of text containing questions to be extracted
 */
export class StepPasteText {
    /**
     * Create a new paste text step
     * @param {Object} options - Configuration options
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     * @param {Object} options.docTaskInstance - Document task instance
     * @param {string} options.stageId - Stage ID
     */
    constructor(options = {}) {
        this.onNext = options.onNext || (() => { });
        this.onError = options.onError || console.error;
        this.docTaskInstance = options.docTaskInstance || {};
        this.stageId = options.stageId || '';

        this.messageModal = options.messageModal || new MessageModal();
        this.errorModal = options.errorModal || new ErrorModal();

        this.domContainer = null;
        this.editor = null;
        this.content = '';
        this.charCountEl = null;
        this.charLimit = 15000;
        this.isProcessing = false;
    }

    /**
     * Reset step state
     */
    reset() {
        this.content = '';
        this.isProcessing = false;

        // Reset UI if already rendered
        if (this.editor) {
            if (typeof this.editor.value === 'function') {
                this.editor.value('');
            } else {
                this.editor.value = '';
            }
        }

        if (this.charCountEl) {
            this.charCountEl.textContent = `0/${this.charLimit} characters`;
            this.charCountEl.classList.remove('over-limit');
        }
        
        this._notifyWizard();
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
        stepContent.className = 'import-step import-step-paste-text';

        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Paste Text Content';
        stepContent.appendChild(titleEl);

        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Paste a block of text containing questions. Our AI will automatically extract and format the questions for import.';
        stepContent.appendChild(descriptionEl);

        // Create text editor container
        const editorContainer = document.createElement('div');
        editorContainer.className = 'paste-text-editor-container';

        // Check if EasyMDE is available
        if (window.EasyMDE) {
            try {
                // Create textarea for EasyMDE
                const textarea = document.createElement('textarea');
                textarea.placeholder = 'Paste your text here...';
                editorContainer.appendChild(textarea);

                // Initialize EasyMDE with simplified toolbar
                this.editor = new window.EasyMDE({
                    element: textarea,
                    spellChecker: true,
                    autofocus: true,
                    placeholder: 'Paste your text here...',
                    toolbar: ['bold', 'italic', '|', 'unordered-list', 'ordered-list', '|', 'guide'],
                    status: ['words', 'lines'],
                    maxHeight: '300px',
                    minHeight: '200px'
                });

                // Set up change event listener
                this.editor.codemirror.on('change', () => {
                    this.content = this.editor.value();
                    this._updateCharCount();
                });
            } catch (error) {
                console.error('Error initializing EasyMDE:', error);
                this._createSimpleTextarea(editorContainer);
            }
        } else {
            // Fallback to simple textarea
            this._createSimpleTextarea(editorContainer);
        }

        stepContent.appendChild(editorContainer);

        // Character count container
        const charCountContainer = document.createElement('div');
        charCountContainer.className = 'char-count-container';

        this.charCountEl = document.createElement('div');
        this.charCountEl.className = 'char-count';
        this.charCountEl.textContent = `0/${this.charLimit} characters`;

        charCountContainer.appendChild(this.charCountEl);
        stepContent.appendChild(charCountContainer);

        // Create note about extraction
        const noteContainer = document.createElement('div');
        noteContainer.className = 'import-note';
        noteContainer.innerHTML = `
            <div class="note-icon"><i class="fas fa-info-circle"></i></div>
            <div class="note-text">
                <p>The AI will extract questions from your text. This works best with:</p>
                <ul>
                    <li>Clear question formatting (numbered lists, question marks, etc.)</li>
                    <li>Text copied directly from documents or emails</li>
                    <li>Up to ${this.charLimit} characters for optimal processing</li>
                </ul>
            </div>
        `;
        stepContent.appendChild(noteContainer);

        container.appendChild(stepContent);

        // Initialize character count
        this._updateCharCount();
    }

    /**
     * Create a simple textarea when EasyMDE is not available
     * @param {HTMLElement} container - Container element
     */
    _createSimpleTextarea(container) {
        const textarea = document.createElement('textarea');
        textarea.className = 'paste-text-simple-textarea';
        textarea.placeholder = 'Paste your text here...';
        textarea.rows = 10;

        // Add event listener for input
        textarea.addEventListener('input', (e) => {
            this.content = e.target.value;
            this._updateCharCount();
        });

        container.appendChild(textarea);
        this.editor = textarea;
    }

    /**
     * Update the live character counter and notify the wizard
     * so it can enable/disable the Next button in real time.
     */
    _updateCharCount() {
        if (!this.charCountEl) return;

        const count = (this.content || '').length;
        this.charCountEl.textContent = `${count}/${this.charLimit} characters`;

        if (count > this.charLimit) {
            this.charCountEl.classList.add('over-limit');
        } else {
            this.charCountEl.classList.remove('over-limit');
        }

        // Notify wizard of state change
        this._notifyWizard();
    }

    _notifyWizard() {
        if (window.currentImportWizard &&
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }

    canProceed(showErrors = false) {
        if (this.isProcessing) {
            return false;
        }

        if (!this.content || this.content.trim().length === 0) {
            if (showErrors) {
                this.onError('Please paste some text before continuing.');
            }
            return false;
        }

        if (this.content.length > this.charLimit) {
            if (showErrors) {
                this.onError(
                    `Text exceeds the ${this.charLimit} character limit. ` +
                    'Please reduce the content length.'
                );
            }
            return false;
        }

        return true;
    }

    async proceed() {
        if (!this.canProceed(true)) return;

        this.isProcessing = true;

        try {
            // disable Next while we call the API
            if (this.nextButton) {
                this.nextButton.disabled = true;
                this.nextButton.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }

            const projectId = this.docTaskInstance.project_id || this.docTaskInstance.projectId;
            const documentId = this.docTaskInstance.document_id || this.docTaskInstance.documentId;

            if (!projectId || !documentId) {
                throw new Error('Missing project_id or document_id. Please save the document first.');
            }

            const result = await documentImportService.extractQuestionsFromText({
                project_id: projectId,
                document_id: documentId,
                stage_id: this.stageId,
                text_content: this.content
            });

            this.onNext({
                textContent: this.content,
                extractionResult: result
            });

        } catch (error) {
            console.error('Error extracting questions:', error);
            this.onError(`Failed to extract questions: ${error.message}`);
            this.isProcessing = false;

            if (this.nextButton) {
                this.nextButton.disabled = false;
                this.nextButton.textContent = 'Next >';
            }
        }
    }


    /**
     * Set reference to next button for updating during processing
     * @param {HTMLElement} button - The next button element
     */
    setNextButton(button) {
        this.nextButton = button;
    }
}

export default StepPasteText;