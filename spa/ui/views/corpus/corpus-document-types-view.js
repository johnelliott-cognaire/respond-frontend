// ui/views/corpus/corpus-document-types-view.js
import { CorpusViewBase } from './corpus-view-base.js';
import { ErrorModal } from '../../modals/error-modal.js';
import { YesNoModal } from '../../modals/yesno-modal.js';
import { MessageModal } from '../../modals/message-modal.js';
import { getSubtenantAttributes } from '../../../api/subtenants.js';
import { createDocumentType, deleteDocumentType } from '../../../api/corpus-types-and-strings.js';

export class CorpusDocumentTypesView extends CorpusViewBase {
  constructor(store, jobController) {
    super(store, jobController);

    // Initialize modals
    this.errorModal = new ErrorModal();
    this.confirmModal = new YesNoModal();
    this.messageModal = new MessageModal();

    // State
    this.loading = false;
    this.corpusConfig = null;
    this.selectedCorpus = this.store.get("currentCorpus") || '';
    this.documentTypes = [];
    this.deleteInProgress = new Set();

    // DOM references
    this.typesList = null;
    this.corpusSelector = null;
    this.newTypeInput = null;
    this.addTypeBtn = null;
  }

  renderContent() {
    return `
      <div class="corpus-settings-container">
        <p>Manage document type options for each corpus. Types must be lowercase with hyphens instead of spaces.</p>
        
        <div class="form-group" style="max-width: 300px;">
          <label for="corpus-selector">Select Corpus:</label>
          <select id="corpus-selector" class="form-select">
            ${this.renderCorpusOptions()}
          </select>
        </div>
        
        <div class="corpus-types-content" ${!this.selectedCorpus ? 'style="display:none;"' : ''}>
          <div class="input-button-group" style="max-width: 600px;">
            <input type="text" id="new-type-input" placeholder="Enter new document type (e.g. policy-doc)" />
            <button id="add-type-btn" class="btn btn--primary">Add Type</button>
          </div>
          
          <div id="types-list" class="mt-4">
            <h4>Current Document Types</h4>
            <ul class="list-group">
              ${this.renderTypesList()}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  renderCorpusOptions() {
    if (!this.corpusConfig || !this.corpusConfig.corpora || Object.keys(this.corpusConfig.corpora).length === 0) {
      return '<option value="">No corpora available</option>';
    }

    return Object.entries(this.corpusConfig.corpora)
      .map(([id, config]) => {
        const name = config.name || id;
        return `<option value="${id}" ${id === this.selectedCorpus ? 'selected' : ''}>${name}</option>`;
      })
      .join('');
  }

  renderTypesList() {
    if (!this.selectedCorpus) {
      return '';
    }

    if (!this.documentTypes || this.documentTypes.length === 0) {
      return '<li class="text-muted" style="padding: 10px 0;">No document types defined</li>';
    }

    return this.documentTypes
      .map((type) => `
        <li class="flex items-center gap-md" style="margin-bottom: 10px;">
          <span style="margin-right: 10px;">•</span>
          <span class="flex-1">${type}</span>
          <button class="btn btn--icon delete-type ${this.deleteInProgress.has(type) ? 'loading' : ''}" 
              data-type="${type}" ${this.deleteInProgress.has(type) ? 'disabled' : ''}>
            ${this.deleteInProgress.has(type) ? 
              '<div class="loading-spinner" style="width: 16px; height: 16px;"></div>' : 
              '<i class="fas fa-trash-alt"></i>'}
          </button>
        </li>
      `)
      .join('');
  }

  attachEventListeners() {
    // Get DOM elements
    this.corpusSelector = this.containerEl.querySelector('#corpus-selector');
    this.newTypeInput = this.containerEl.querySelector('#new-type-input');
    this.typesList = this.containerEl.querySelector('#types-list');
    this.addTypeBtn = this.containerEl.querySelector('#add-type-btn');
    const typesContent = this.containerEl.querySelector('.corpus-types-content');
    
    // Corpus selection change
    if (this.corpusSelector) {
      this.addListener(this.corpusSelector, 'change', () => {
        this.changeSelectedCorpus(this.corpusSelector.value);
      });
    }

    // Add type button
    if (this.addTypeBtn) {
      this.addListener(this.addTypeBtn, 'click', () => {
        this.addDocumentType();
      });
    }

    // New type input - add on Enter key
    if (this.newTypeInput) {
      this.addListener(this.newTypeInput, 'keypress', (e) => {
        if (e.key === 'Enter') {
          this.addDocumentType();
        }
      });
    }

    // Delete type buttons - using event delegation
    if (this.typesList) {
      this.addListener(this.typesList, 'click', (e) => {
        const deleteBtn = e.target.closest('.delete-type');
        if (deleteBtn && !deleteBtn.disabled) {
          const type = deleteBtn.dataset.type;
          this.confirmDeleteType(type);
        }
      });
    }
  }

  async onActivate() {
    try {
      // Use corpus config from the store if available
      this.corpusConfig = this.store.get("corpus_config");

      // Only load if not already available
      if (!this.corpusConfig || Object.keys(this.corpusConfig).length === 0) {
        await this.loadCorpusConfig();
      }

      // Set selected corpus (use current corpus from store if available)
      const storeCorpus = this.store.get("currentCorpus");
      if (storeCorpus && this.corpusConfig?.corpora?.[storeCorpus]) {
        this.selectedCorpus = storeCorpus;
      } else if (this.corpusConfig?.default_corpus) {
        this.selectedCorpus = this.corpusConfig.default_corpus;
      } else if (this.corpusConfig?.corpora && Object.keys(this.corpusConfig.corpora).length > 0) {
        // Just pick the first corpus if nothing else
        this.selectedCorpus = Object.keys(this.corpusConfig.corpora)[0] || '';
      }

      // Load document types for selected corpus
      this.loadDocumentTypes();
    } catch (error) {
      console.error('[CorpusDocumentTypesView] Error activating view:', error);
      this.errorModal.show({
        title: "Error Loading View",
        message: "There was a problem loading the document types view. Please try again."
      });
    }
  }

  async loadCorpusConfig(forceRefresh = false) {
    try {
      this.setLoading(true);
  
      // If force refresh, set corpusConfig to null first
      if (forceRefresh) {
        this.corpusConfig = null;
        this.store.set("corpus_config", null);
      }
  
      // Check if already in memory
      if (!forceRefresh && this.corpusConfig) {
        return this.corpusConfig;
      }
  
      // Get corpus config from subtenant attributes with force refresh
      const attributes = await getSubtenantAttributes(['corpus_config']);
      this.corpusConfig = attributes.corpus_config || {};
  
      // Update the application store
      this.store.set("corpus_config", this.corpusConfig);
      
      // Also notify CorpusManager to refresh its copy
      this.containerEl.dispatchEvent(new CustomEvent('corpus:config-updated', {
        bubbles: true,
        detail: { corpus_config: this.corpusConfig }
      }));
      
      return this.corpusConfig;
    } catch (error) {
      console.error('[CorpusDocumentTypesView] Error loading corpus config:', error);
      this.errorModal.show({
        title: "Error Loading Configuration",
        message: error.message || "Failed to load corpus configuration"
      });
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  loadDocumentTypes() {
    if (!this.selectedCorpus || !this.corpusConfig?.corpora?.[this.selectedCorpus]) {
      this.documentTypes = [];
      this.updateUI();
      return;
    }

    const corpus = this.corpusConfig.corpora[this.selectedCorpus];
    this.documentTypes = corpus.document_types_choices ? [...corpus.document_types_choices] : [];
    this.updateUI();
    
    // Show corpus name in context
    this.containerEl.dispatchEvent(new CustomEvent('corpus:view-mode-changed', {
      bubbles: true,
      detail: { corpus: this.selectedCorpus }
    }));
  }

  updateUI() {
    // Update types list
    if (this.typesList) {
      const typesListContent = this.typesList.querySelector('ul');
      if (typesListContent) {
        typesListContent.innerHTML = this.renderTypesList();
      }
    }

    // Show/hide the types content based on whether a corpus is selected
    const typesContent = this.containerEl.querySelector('.corpus-types-content');
    if (typesContent) {
      typesContent.style.display = this.selectedCorpus ? 'block' : 'none';
    }

    // Update corpus selector
    if (this.corpusSelector) {
      const currentValue = this.corpusSelector.value;
      if (currentValue !== this.selectedCorpus) {
        this.corpusSelector.value = this.selectedCorpus;
      }
    }
  }

  async addDocumentType() {
    const newType = this.newTypeInput?.value?.trim();
    
    if (!newType) {
      this.errorModal.show({
        title: "Validation Error",
        message: "Please enter a document type"
      });
      return;
    }

    // Validate format (lowercase, no spaces, only letters, numbers, and hyphens)
    const typePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!typePattern.test(newType)) {
      this.errorModal.show({
        title: "Validation Error",
        message: "Document type must be lowercase, with no spaces. Only letters, numbers, and hyphens are allowed."
      });
      return;
    }

    // Check if type already exists
    if (this.documentTypes.includes(newType)) {
      this.errorModal.show({
        title: "Duplicate Type",
        message: `The document type "${newType}" already exists.`
      });
      return;
    }
    
    try {
      // Disable input and button
      if (this.newTypeInput) this.newTypeInput.disabled = true;
      if (this.addTypeBtn) {
        this.addTypeBtn.disabled = true;
        this.addTypeBtn.innerHTML = '<div class="loading-spinner" style="width: 16px; height: 16px;"></div> Adding...';
      }
      
      // Call API to add type
      await createDocumentType({
        corpus: this.selectedCorpus,
        name: newType
      });

      // Force reload from server by clearing in-memory corpusConfig
      this.corpusConfig = null;
      this.store.set("corpus_config", null);
      
      // Reload corpus config to get the updated data
      await this.loadCorpusConfig();
      
      // Reload document types
      this.loadDocumentTypes();
      
      // Clear input
      if (this.newTypeInput) {
        this.newTypeInput.value = '';
        this.newTypeInput.focus();
      }
      
    } catch (error) {
      console.error('[CorpusDocumentTypesView] Error adding document type:', error);
      this.errorModal.show({
        title: "Error Adding Type",
        message: error.message || "Failed to add document type"
      });
    } finally {
      // Re-enable input and button
      if (this.newTypeInput) this.newTypeInput.disabled = false;
      if (this.addTypeBtn) {
        this.addTypeBtn.disabled = false;
        this.addTypeBtn.innerHTML = 'Add Type';
      }
    }
  }

  confirmDeleteType(type) {
    this.confirmModal.show({
      title: "Delete Document Type",
      message: `Are you sure you want to delete the document type "${type}"?`,
      onYes: () => {
        this.deleteDocumentType(type);
      },
      onNo: () => {
        // Do nothing
      }
    });
  }

  async deleteDocumentType(type) {
    try {
      // Mark this type as being deleted
      this.deleteInProgress.add(type);
      this.updateUI();
      
      // Call API to delete type
      await deleteDocumentType({
        corpus: this.selectedCorpus,
        name: type
      });

      // Force reload from server by clearing in-memory corpusConfig
      this.corpusConfig = null;
      this.store.set("corpus_config", null);
      
      // Reload corpus config to get the updated data
      await this.loadCorpusConfig();
      
      // Reload document types
      this.loadDocumentTypes();
      
    } catch (error) {
      console.error('[CorpusDocumentTypesView] Error deleting document type:', error);
      this.errorModal.show({
        title: "Error Deleting Type",
        message: error.message || "Failed to delete document type"
      });
    } finally {
      // Remove from in-progress set
      this.deleteInProgress.delete(type);
      this.updateUI();
    }
  }

  changeSelectedCorpus(corpusId) {
    this.selectedCorpus = corpusId;
    this.store.set("currentCorpus", corpusId);
    this.loadDocumentTypes();
  }

  setLoading(loading) {
    this.loading = loading;
    
    // Remove any existing overlays
    const existingOverlays = this.containerEl?.querySelectorAll('.loading-overlay');
    existingOverlays?.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    
    // Add loading overlay if loading
    if (loading && this.containerEl) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loading-spinner"></div>';
      this.containerEl.appendChild(overlay);
    }
  }

  destroy() {
    super.destroy();
  }
}