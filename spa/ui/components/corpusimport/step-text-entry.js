// ui/components/corpusimport/step-text-entry.js

import { DocumentInformationForm } from './document-information-form.js';
import { ErrorModal } from "../../modals/error-modal.js";
import { MessageModal } from "../../modals/message-modal.js";

// Define constant event names
const EVENTS = {
    ENABLE_NEXT: 'import-wizard:enable-next',
    UPLOAD_PROGRESS: 'import-wizard:upload-progress',
    IMPORT_COMPLETE: 'import-wizard:import-complete'
};

/**
 * Text entry step of the import wizard
 * Allows the user to enter text content and metadata
 */
export class StepTextEntry {
    /**
     * Create a new text entry step
     * @param {Object} options - Configuration options
     * @param {Function} options.onNext - Callback when step is completed
     * @param {Function} options.onError - Callback to display errors
     * @param {string} options.currentDomain - Current corpus domain
     * @param {string} options.currentUnit - Current corpus unit
     * @param {string} options.currentTopic - Current corpus topic
     */
    constructor(options = {}) {
        this.onNext = options.onNext || (() => {});
        this.onError = options.onError || console.error;
        this.messageModal = options.messageModal || new MessageModal();
        this.errorModal = options.messageModal || new ErrorModal();
        
        // Current path components for pre-filling form
        this.currentDomain = options.currentDomain || '';
        this.currentUnit = options.currentUnit || '';
        this.currentTopic = options.currentTopic || '';
        this.corpusConfig = options.corpusConfig || {};
        this.corpus = options.corpus || 'rfp';
        
        this.domContainer = null;
        this.editor = null;
        this.editorContainer = null;
        this.formatButtonGroup = null;
        this.previewContainer = null;
        this.showingPreview = false;
        
        // Form data
        this.content = '';
        this.format = 'markdown'; // Only markdown and plaintext now
        this.documentForm = new DocumentInformationForm({
            documentTopic: this.currentTopic,
            domain: this.currentDomain,
            unit: this.currentUnit,
            corpus: this.corpus,
            corpusConfig: this.corpusConfig,
            fileExtension: 'md', // Default to markdown
            onUpdate: (metadata) => {
                this.metadata = metadata;
            },
            onError: this.onError,
            messageModal: this.messageModal
        });
    }
    
    reset() {
        this.content = '';
        this.format = 'markdown';
        this.showingPreview = false;
        
        // Reset document form
        this.documentForm.updateData({
            documentType: '',
            documentName: '',
            documentTopic: this.currentTopic || '',
            domain: this.currentDomain || '',
            unit: this.currentUnit || ''
        });
        
        // Reset format buttons
        if (this.formatButtonGroup) {
            const buttons = this.formatButtonGroup.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.dataset.format === 'markdown') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        
        // Reset editor content
        if (this.editor && typeof this.editor.value === 'function') {
            this.editor.value('');
        } else if (this.editor) {
            this.editor.value = '';
        }
        
        // Hide preview if showing
        if (this.previewContainer) {
            this.previewContainer.style.display = 'none';
        }
        
        // Show editor
        if (this.editorContainer) {
            this.editorContainer.style.display = 'block';
        }
    }
    
    render(container) {
        this.domContainer = container;
        container.innerHTML = '';
        
        // Create step content
        const stepContent = document.createElement('div');
        stepContent.className = 'import-step import-step-text-entry';
        
        // Add step title and description
        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Enter Text Content';
        stepContent.appendChild(titleEl);
        
        const descriptionEl = document.createElement('p');
        descriptionEl.textContent = 'Write or paste your content below. You can use Markdown formatting for rich text.';
        stepContent.appendChild(descriptionEl);
        
        // Create text entry container
        const textEntryContainer = document.createElement('div');
        textEntryContainer.className = 'text-entry-container';
        
        // Format selector - create with appropriate CSS
        const formatSelector = document.createElement('div');
        formatSelector.className = 'format-selector';
        formatSelector.style.display = 'flex';
        formatSelector.style.justifyContent = 'space-between';
        formatSelector.style.alignItems = 'center';
        
        // Create elements separately for better control
        const formatLabelContainer = document.createElement('div');
        formatLabelContainer.style.display = 'flex';
        formatLabelContainer.style.alignItems = 'center';
        
        const formatLabel = document.createElement('label');
        formatLabel.textContent = 'Format:';
        formatLabel.style.marginRight = '10px';
        formatLabelContainer.appendChild(formatLabel);
        
        const formatButtons = document.createElement('div');
        formatButtons.className = 'button-group format-buttons';
        
        const markdownBtn = document.createElement('button');
        markdownBtn.className = 'btn format-btn active';
        markdownBtn.dataset.format = 'markdown';
        markdownBtn.textContent = 'Markdown';
        
        const plaintextBtn = document.createElement('button');
        plaintextBtn.className = 'btn format-btn';
        plaintextBtn.dataset.format = 'plaintext';
        plaintextBtn.textContent = 'Plain Text';
        
        formatButtons.appendChild(markdownBtn);
        formatButtons.appendChild(plaintextBtn);
        formatLabelContainer.appendChild(formatButtons);
        
        const editorActions = document.createElement('div');
        editorActions.className = 'editor-actions';
        editorActions.style.display = 'flex';
        editorActions.style.gap = '8px';
        
        const togglePreviewBtn = document.createElement('button');
        togglePreviewBtn.className = 'btn btn--secondary';
        togglePreviewBtn.id = 'togglePreviewBtn';
        togglePreviewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
        
        const cleanHtmlBtn = document.createElement('button');
        cleanHtmlBtn.className = 'btn btn--secondary';
        cleanHtmlBtn.id = 'cleanHtmlBtn';
        cleanHtmlBtn.innerHTML = '<i class="fas fa-broom"></i> Clean HTML';
        
        editorActions.appendChild(togglePreviewBtn);
        editorActions.appendChild(cleanHtmlBtn);
        
        formatSelector.appendChild(formatLabelContainer);
        formatSelector.appendChild(editorActions);
        
        // Store references for later use
        this.formatButtonGroup = formatButtons;
        this.cleanHtmlBtn = cleanHtmlBtn;
        
        // Add event listeners
        markdownBtn.addEventListener('click', () => {
            // Update format buttons
            markdownBtn.classList.add('active');
            plaintextBtn.classList.remove('active');
            
            // Update format
            this.format = 'markdown';
            
            // Update file extension
            this.documentForm.setFileExtension('md');
            
            // Show Clean HTML button
            cleanHtmlBtn.style.display = 'inline-block';
            
            // Update editor mode
            this._updateEditorMode('markdown');
            
            // Hide preview if showing
            if (this.showingPreview) {
                this._togglePreview();
            }
        });
        
        plaintextBtn.addEventListener('click', () => {
            // Update format buttons
            markdownBtn.classList.remove('active');
            plaintextBtn.classList.add('active');
            
            // Update format
            this.format = 'plaintext';
            
            // Update file extension
            this.documentForm.setFileExtension('txt');
            
            // Hide Clean HTML button
            cleanHtmlBtn.style.display = 'none';
            
            // Update editor mode
            this._updateEditorMode('plaintext');
            
            // Hide preview if showing
            if (this.showingPreview) {
                this._togglePreview();
            }
        });
        
        // Add event listeners for Preview and Clean HTML buttons
        togglePreviewBtn.addEventListener('click', () => this._togglePreview());
        cleanHtmlBtn.addEventListener('click', () => this._cleanHtmlContent());
        
        // Initially hide Clean HTML button if not in markdown mode
        if (this.format !== 'markdown') {
            cleanHtmlBtn.style.display = 'none';
        }
        
        textEntryContainer.appendChild(formatSelector);
        
        // Text editor container
        this.editorContainer = document.createElement('div');
        this.editorContainer.className = 'editor-container';
        this.editorContainer.id = 'textEditor';
        
        // Preview container (initially hidden)
        this.previewContainer = document.createElement('div');
        this.previewContainer.className = 'preview-container';
        this.previewContainer.style.display = 'none';
        
        // Check if EasyMDE is available
        if (window.EasyMDE) {
            // Create textarea for EasyMDE
            const textarea = document.createElement('textarea');
            textarea.placeholder = 'Enter your content here...';
            this.editorContainer.appendChild(textarea);
            
            // Initialize EasyMDE
            this._initializeEditor(textarea);
        } else {
            // Fallback to plain textarea
            this.editorContainer.innerHTML = '<textarea placeholder="Enter your content here..."></textarea>';
            
            // Store reference to textarea
            this.editor = this.editorContainer.querySelector('textarea');
            this.editor.className = 'plain-textarea';
            this.editor.addEventListener('input', (e) => {
                this.content = e.target.value;
            });
        }
        
        textEntryContainer.appendChild(this.editorContainer);
        textEntryContainer.appendChild(this.previewContainer);
        
        // Document form container
        const formContainer = document.createElement('div');
        formContainer.className = 'document-form-container';
        
        // Render document form
        this.documentForm.render(formContainer);
        
        textEntryContainer.appendChild(formContainer);
        stepContent.appendChild(textEntryContainer);
        container.appendChild(stepContent);
    }
    
    _initializeEditor(textarea) {
        try {
            // Initialize EasyMDE with options
            this.editor = new window.EasyMDE({
                element: textarea,
                spellChecker: true,
                autofocus: true,
                placeholder: 'Enter your content here...',
                toolbar: [
                    'bold', 'italic', 'heading', '|',
                    'quote', 'unordered-list', 'ordered-list', '|',
                    'link', 'image', 'table', '|',
                    'preview', 'side-by-side', 'fullscreen', '|',
                    'guide'
                ],
                status: ['autosave', 'lines', 'words', 'cursor']
            });
            
            // Set up change event listener with debounce to prevent stack overflow
            let timeout;
            this.editor.codemirror.on('change', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.content = this.editor.value();
                    
                    // Update Next button state based on content
                    const enableNextEvent = new CustomEvent('import-wizard:enable-next', { 
                        bubbles: true,
                        detail: { enabled: !!this.content && this.content.trim().length > 0 }
                    });
                    this.domContainer.dispatchEvent(enableNextEvent);
                }, 300);
            });
            
            console.log('EasyMDE editor initialized');
        } catch (error) {
            console.error('Error initializing EasyMDE:', error);
            
            // Fallback to plain textarea
            const plainTextarea = document.createElement('textarea');
            plainTextarea.placeholder = 'Enter your content here...';
            plainTextarea.className = 'plain-textarea';
            plainTextarea.addEventListener('input', (e) => {
                this.content = e.target.value;
            });
            
            // Replace the element
            textarea.parentNode.replaceChild(plainTextarea, textarea);
            this.editor = plainTextarea;
        }
    }
    
    _updateEditorMode(format) {
        // If using EasyMDE, toggle visibility and mode based on format
        if (this.editor && this.editor.codemirror) {
            if (format === 'markdown') {
                // Show EasyMDE with markdown mode
                this.editor.codemirror.setOption('mode', 'markdown');
            } else {
                // Plain text mode
                this.editor.codemirror.setOption('mode', 'text');
            }
        }
    }
    
    _togglePreview() {
        if (!this.previewContainer || !this.editorContainer) return;
        
        // Toggle preview state
        this.showingPreview = !this.showingPreview;
        
        if (this.showingPreview) {
            // Show preview
            this.previewContainer.style.display = 'block';
            this.editorContainer.style.display = 'none';
            
            // Update preview content
            this._updatePreview();
            
            // Update button text
            const previewBtn = this.domContainer.querySelector('#togglePreviewBtn');
            if (previewBtn) {
                previewBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
            }
        } else {
            // Hide preview, show editor
            this.previewContainer.style.display = 'none';
            this.editorContainer.style.display = 'block';
            
            // Update button text
            const previewBtn = this.domContainer.querySelector('#togglePreviewBtn');
            if (previewBtn) {
                previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
            }
        }
    }
    
    _updatePreview() {
        if (!this.previewContainer) return;
        
        // Only render preview for markdown
        if (this.format === 'markdown' && this.content) {
            // Check if marked.js is available
            if (window.marked) {
                try {
                    // Convert markdown to HTML
                    const html = window.marked.parse(this.content);
                    this.previewContainer.innerHTML = `
                        <div class="markdown-preview">
                            ${html}
                        </div>
                    `;
                } catch (error) {
                    console.error('Error rendering markdown:', error);
                    this.previewContainer.innerHTML = `
                        <div class="preview-error">
                            <p>Error rendering preview: ${error.message}</p>
                            <pre>${this.content}</pre>
                        </div>
                    `;
                }
            } else {
                // Fallback to simple preview
                this.previewContainer.innerHTML = `
                    <div class="markdown-preview-unavailable">
                        <p>Markdown preview requires the marked.js library.</p>
                        <pre>${this.content}</pre>
                    </div>
                `;
            }
        } else {
            // For plain text, just show as preformatted text
            this.previewContainer.innerHTML = `
                <div class="plaintext-preview">
                    <pre>${this.content}</pre>
                </div>
            `;
        }
    }
    
    _cleanHtmlContent() {
        // Check if content looks like HTML
        const hasHtmlTags = /<[a-z][\s\S]*>/i.test(this.content);
        
        if (!hasHtmlTags) {
            this.messageModal.show({
                title: "Not HTML Content",
                message: "The current content doesn't appear to contain HTML. No cleaning necessary."
            });
            return;
        }
        
        try {
            // Create a temporary DOM element to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.content;
            
            // Remove head tag and its contents if present
            const headTag = tempDiv.querySelector('head');
            if (headTag) {
                headTag.remove();
            }
            
            // Remove script tags
            const scriptTags = tempDiv.querySelectorAll('script');
            scriptTags.forEach(tag => tag.remove());
            
            // Remove style tags
            const styleTags = tempDiv.querySelectorAll('style');
            styleTags.forEach(tag => tag.remove());
            
            // Get cleaned HTML
            const cleanedHTML = tempDiv.innerHTML;
            
            // Use TurndownService to convert HTML to markdown
            const turndownService = new TurndownService();
            const markdown = turndownService.turndown(cleanedHTML);
            
            // Set the content and update the editor
            this.content = markdown;
            
            // Update editor content
            if (this.editor && typeof this.editor.value === 'function') {
                this.editor.value(markdown);
            } else if (this.editor) {
                this.editor.value = markdown;
            }
            
            // Switch to markdown format
            const markdownBtn = this.formatButtonGroup.querySelector('[data-format="markdown"]');
            if (markdownBtn) {
                markdownBtn.click();
            }
            
            // Show success message
            this.messageModal.show({
                title: "HTML Cleaned",
                message: "HTML content has been successfully converted to Markdown."
            });
        } catch (error) {
            console.error('Error cleaning HTML:', error);
            
            // Show error message
            this.errorModal.show({
                title: "Error Cleaning HTML",
                message: `Failed to clean HTML content: ${error.message}`
            });
        }
    }
    
    _notifyWizard() {
        if (window.currentImportWizard && 
            typeof window.currentImportWizard._updateNextButtonState === 'function') {
            window.currentImportWizard._updateNextButtonState();
        }
    }
    
    canProceed(showErrors = false) {
        // Check for content
        if (!this.content || !this.content.trim()) {
            if (showErrors) {
                this.errorModal.show({
                    title: "Missing Content",
                    message: "Please enter some content."
                });
            }
            return false;
        }
        
        // Validate document form - only when showErrors is true
        if (showErrors && !this.documentForm.validate()) {
            return false;
        }
        
        return true;
    }
    
    proceed() {
        if (!this.canProceed(true)) {
            return;
        }
        
        // Get metadata from form
        const metadata = this.documentForm.getData();
        
        // Make sure we have sanitized document name
        const docName = String(metadata.documentName || '');
        metadata.documentName = docName
            .split(' ').join('-')
            .replace(/[^\w\-]/g, '');
        
        // Call onNext with collected data
        this.onNext({
            content: this.content,
            format: this.format,
            metadata
        });
    }
    
    reset() {
        this.content = '';
        this.format = 'markdown';
        this.showingPreview = false;
        
        // Reset document form
        this.documentForm.updateData({
            documentType: '',
            documentName: '',
            documentTopic: this.currentTopic || '',
            domain: this.currentDomain || '',
            unit: this.currentUnit || ''
        });
        
        // Reset format buttons
        if (this.formatButtonGroup) {
            const buttons = this.formatButtonGroup.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.dataset.format === 'markdown') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        
        // Reset editor content
        if (this.editor && typeof this.editor.value === 'function') {
            this.editor.value('');
        } else if (this.editor) {
            this.editor.value = '';
        }
        
        // Reset UI elements
        if (this.previewContainer) {
            this.previewContainer.style.display = 'none';
        }
        
        if (this.editorContainer) {
            this.editorContainer.style.display = 'block';
        }
        
        this._notifyWizard();
    }
    
    _showError(message) {
        if (this.onError) {
          this.onError(message);
        } else {
          this.errorModal.show({
            title: "Error",
            message: message
          });
        }
      }
}

export default StepTextEntry;