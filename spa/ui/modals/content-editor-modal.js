// ui/modals/content-editor-modal.js
import { AsyncFormModal } from './async-form-modal.js';
import { TextEditor } from '../components/text-editor.js';

export class ContentEditorModal extends AsyncFormModal {
  /**
   * @param {Object} options Configuration options
   * @param {string} options.documentKey Document key/path
   * @param {string} options.documentName Document display name
   * @param {string} options.content Initial content
   * @param {Object} options.metadata Document metadata
   * @param {Function} options.onSave Callback when document is saved
   */
  constructor(options = {}) {
    super();
    
    this.documentKey = options.documentKey || '';
    this.documentName = options.documentName || '';
    this.content = options.content || '';
    this.metadata = options.metadata || {};
    this.onSave = options.onSave || (() => {});
    this.documentType = this.getDocumentType();
    
    this.editor = null;
    this.isDirty = false;
    
    this._buildDOM();
  }
  
  getDocumentType() {
    if (!this.documentName) return 'txt';
    const extension = this.documentName.split('.').pop().toLowerCase();
    return extension || 'txt';
  }
  
  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal modal--form content-editor-modal';
    this.modalEl.style.display = 'none';
    this.modalEl.style.width = '80%';
    this.modalEl.style.maxWidth = '1200px';
    this.modalEl.style.height = '80%';
    this.modalEl.style.maxHeight = '800px';
    
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close editor">&times;</button>
      <h2>Edit Document: ${this.documentName}</h2>
      
      <div class="editor-wrapper" style="height: calc(100% - 120px); position: relative; overflow: hidden;">
        <div class="editor-container" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: auto;"></div>
      </div>
      
      <div class="button-group" style="margin-top: 20px;">
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="button" class="btn btn--secondary" id="saveDraftBtn">Save Draft</button>
        <button type="button" class="btn btn--primary" id="submitBtn">Submit for Approval</button>
      </div>
    `;
    
    document.body.appendChild(this.modalEl);
    
    // Get editor container
    const editorContainer = this.modalEl.querySelector('.editor-container');
    
    // Initialize editor
    this.editor = new TextEditor({
      container: editorContainer,
      documentType: this.documentType,
      content: this.content,
      onChange: (content) => {
        this.isDirty = true;
        // Enable buttons when content changes
        this.modalEl.querySelector('#saveDraftBtn').disabled = false;
        this.modalEl.querySelector('#submitBtn').disabled = false;
      }
    });
    
    // Add event listeners
    const closeBtn = this.modalEl.querySelector('.modal__close');
    closeBtn.addEventListener('click', this.handleCancel.bind(this));
    
    const cancelBtn = this.modalEl.querySelector('#cancelBtn');
    cancelBtn.addEventListener('click', this.handleCancel.bind(this));
    
    const saveDraftBtn = this.modalEl.querySelector('#saveDraftBtn');
    saveDraftBtn.addEventListener('click', this.handleSaveDraft.bind(this));
    saveDraftBtn.disabled = !this.isDirty;
    
    const submitBtn = this.modalEl.querySelector('#submitBtn');
    submitBtn.addEventListener('click', this.handleSubmit.bind(this));
    submitBtn.disabled = !this.isDirty;
  }
  
  show(options = {}) {
    super.show();
    
    // If options provided, update properties
    if (options.documentKey) this.documentKey = options.documentKey;
    if (options.documentName) {
      this.documentName = options.documentName;
      this.documentType = this.getDocumentType();
      
      // Update title
      const titleEl = this.modalEl.querySelector('h2');
      if (titleEl) {
        titleEl.textContent = `Edit Document: ${this.documentName}`;
      }
    }
    if (options.content) {
      this.content = options.content;
      if (this.editor) {
        this.editor.setValue(this.content);
      }
    }
    if (options.metadata) this.metadata = options.metadata;
    if (options.onSave) this.onSave = options.onSave;
    
    // Initialize editor if not already done
    if (!this.editor && this.modalEl) {
      const editorContainer = this.modalEl.querySelector('.editor-container');
      this.editor = new TextEditor({
        container: editorContainer,
        documentType: this.documentType,
        content: this.content,
        onChange: () => {
          this.isDirty = true;
          // Enable buttons when content changes
          this.modalEl.querySelector('#saveDraftBtn').disabled = false;
          this.modalEl.querySelector('#submitBtn').disabled = false;
        }
      });
    }
    
    // Reset dirty state
    this.isDirty = false;
    
    // Disable buttons initially
    const saveDraftBtn = this.modalEl.querySelector('#saveDraftBtn');
    if (saveDraftBtn) saveDraftBtn.disabled = true;
    
    const submitBtn = this.modalEl.querySelector('#submitBtn');
    if (submitBtn) submitBtn.disabled = true;
    
    // Focus editor
    if (this.editor) {
      setTimeout(() => {
        this.editor.focus();
      }, 100);
    }
  }
  
  hide() {
    super.hide();
    
    // Clean up editor
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  }
  
  handleCancel() {
    if (this.isDirty) {
      // Show confirmation before closing
      const confirmClose = window.confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmClose) return;
    }
    
    this.hide();
  }
  
  async handleSaveDraft() {
    try {
      this.lockButtons();
      
      const content = this.editor.getValue();
      await this.onSave(this.documentKey, content, this.metadata, 'draft');
      
      this.isDirty = false;
      this.hide();
    } catch (error) {
      console.error('[ContentEditorModal] Error saving draft:', error);
      this.errorModal.show({
        title: "Save Failed",
        message: `Error saving draft: ${error.message || 'Unknown error'}`
      });
    } finally {
      this.unlockButtons();
    }
  }
  
  async handleSubmit() {
    try {
      this.lockButtons();
      
      const content = this.editor.getValue();
      await this.onSave(this.documentKey, content, this.metadata, 'submit');
      
      this.isDirty = false;
      this.hide();
    } catch (error) {
      console.error('[ContentEditorModal] Error submitting document:', error);
      this.errorModal.show({
        title: "Submission Failed",
        message: `Error submitting document: ${error.message || 'Unknown error'}`
      });
    } finally {
      this.unlockButtons();
    }
  }
  
  lockButtons() {
    const buttons = this.modalEl.querySelectorAll('button');
    buttons.forEach(button => {
      button.disabled = true;
    });
  }
  
  unlockButtons() {
    const cancelBtn = this.modalEl.querySelector('#cancelBtn');
    if (cancelBtn) cancelBtn.disabled = false;
    
    const saveDraftBtn = this.modalEl.querySelector('#saveDraftBtn');
    if (saveDraftBtn) saveDraftBtn.disabled = !this.isDirty;
    
    const submitBtn = this.modalEl.querySelector('#submitBtn');
    if (submitBtn) submitBtn.disabled = !this.isDirty;
  }
}