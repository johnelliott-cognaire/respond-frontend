// File: ui/modals/vector-index-management-modal.js
import { ErrorModal } from './error-modal.js';
import { MessageModal } from './message-modal.js';
import { YesNoModal } from './yesno-modal.js';
import { TextPromptModal } from './text-prompt-modal.js';
import { VectorSearchPreviewModal } from './vector-search-preview-modal.js';
import {
  createVectorIndex,
  deleteVectorIndex,
  listVectorIndexes,
  getVectorIndexStatus,
  vectorizeCorpusSection,
  findMatchingIndex,
  getLiveDocumentCount,
  clearDocumentCountCache
} from '../../api/corpus-vectors.js';
import {
  getSubtenantAttributes,
  getLabelFriendlyName
} from '../../api/subtenants.js';
import formatHumanReadableDate from '../../utils/date-utils.js';
import tooltip from '../framework/tooltip.js';

/**
 * Modal for managing vector indexes in corpus sections
 * Supports creating, listing, deleting, and triggering vectorization of indexes
 * 
 * Usage:
 *   const modal = new VectorIndexManagementModal(store);
 *   modal.show({
 *     corpus_id: 'rfp',
 *     path: 'rfp/wfe/edm-only',
 *     onIndexChange: () => console.log('Indexes changed')
 *   });
 */
export class VectorIndexManagementModal {
  constructor(store) {
    this.store = store;
    this.modalEl = null;
    this.overlayEl = null;
    this.eventListeners = [];
    
    // Job status polling
    this.currentJobId = null;
    this.pollingInterval = null;
    this.pollingTimeout = null;
    
    // Initialize child modals with higher z-index to appear above VectorIndexManagementModal
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.confirmModal = new YesNoModal();
    this.textPromptModal = new TextPromptModal();
    this.vectorSearchPreviewModal = new VectorSearchPreviewModal();
    
    // Override z-index values for child modals to ensure they appear above this modal
    this._configureChildModalZIndex();
    
    // State
    this.corpus_id = null;
    this.path = null;
    this.filters = {};
    this.indexes = [];
    this.loading = false;
    this.onIndexChange = null;
    
    // Topic/Type filtering state
    this.corpusConfig = null;
    this.labelFriendlyNames = null;
    this.documentTopics = [];
    this.documentTypes = [];
    this.selectedTopics = [];
    this.selectedTypes = [];
    
    // UX Enhancement state
    this.documentCount = 0;
    this.hasCorpusEditorPermission = false;
    this.documentCountLoaded = false;
  }
  
  _configureChildModalZIndex() {
    // Configure z-index for child modals to appear above VectorIndexManagementModal (10500)
    // We'll set them in the show() method since the DOM elements might not exist yet
    this.childModalZIndex = {
      overlay: "11000",
      modal: "11001"
    };
  }
  
  _ensureChildModalZIndex(modal) {
    // Ensure child modal appears above this modal
    if (modal && modal.overlayEl) {
      modal.overlayEl.style.zIndex = this.childModalZIndex.overlay;
    }
    if (modal && modal.modalEl) {
      modal.modalEl.style.zIndex = this.childModalZIndex.modal;
    }
  }
  
  _buildDOM() {
    // Create overlay
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "overlay";
    this.overlayEl.style.zIndex = "10499";
    this.overlayEl.style.display = "none";
    
    // Create modal
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--large";
    this.modalEl.style.zIndex = "10500";
    this.modalEl.style.display = "none";
    
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close modal">&times;</button>
      <h2 id="vectorIndexTitle">Search Index Management</h2>
      
      <div class="modal__content">
        <!-- Path Information -->
        <div class="section">
          <h3>Corpus Section</h3>
          <div class="metadata-display">
            <div class="metadata-row">
              <span class="metadata-label">Corpus:</span>
              <span id="displayCorpus" class="metadata-value"></span>
            </div>
            <div class="metadata-row">
              <span class="metadata-label">Path:</span>
              <span id="displayPath" class="metadata-value"></span>
            </div>
            <div class="metadata-row">
              <span class="metadata-label">Scope:</span>
              <span id="displayGranularity" class="metadata-value"></span>
            </div>
            <div class="metadata-row">
              <span class="metadata-label">Documents:</span>
              <span id="documentCount" class="metadata-value">
                <span class="loading-text">Loading...</span>
              </span>
            </div>
          </div>
        </div>
        
        <!-- Actions Section -->
        <div class="section">
          <h3>Actions</h3>
          <div id="actionsSection" class="section-content">
            <div class="button-group">
              <button id="createIndexBtn" class="btn btn--primary">
                <i class="fas fa-filter"></i> Create Filter Index
              </button>
              <button id="refreshIndexesBtn" class="btn btn--secondary">
                <i class="fas fa-sync"></i> Refresh
              </button>
            </div>
            <div id="permissionWarning" class="permission-warning" style="display: none;">
              <i class="fas fa-lock"></i> CORPUS_EDITOR permissions required to manage search indexes
            </div>
          </div>
        </div>
        
        <!-- Existing Indexes Section -->
        <div class="section">
          <h3>Search Indexes</h3>
          <div id="indexesList" class="indexes-list">
            <!-- Indexes will be populated here -->
          </div>
        </div>
        
        <!-- Loading Overlay -->
        <div id="modalLoadingOverlay" class="loading-overlay" style="display: none;">
          <div class="loading-spinner"></div>
        </div>
      </div>
      
      <div class="modal__footer">
        <button id="closeModal" class="btn btn--secondary">Close</button>
      </div>
    `;
    
    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.modalEl);
    
    this._attachEventListeners();
  }
  
  _attachEventListeners() {
    const closeBtn = this.modalEl.querySelector(".modal__close");
    const closeBtnFooter = this.modalEl.querySelector("#closeModal");
    const createIndexBtn = this.modalEl.querySelector("#createIndexBtn");
    const refreshBtn = this.modalEl.querySelector("#refreshIndexesBtn");
    
    // Close handlers
    this.addListener(closeBtn, 'click', () => this.hide());
    this.addListener(closeBtnFooter, 'click', () => this.hide());
    this.addListener(this.overlayEl, 'click', () => this.hide());
    
    // Action handlers
    this.addListener(createIndexBtn, 'click', () => this.handleCreateIndex());
    this.addListener(refreshBtn, 'click', () => this.loadIndexes());
    
    // Keyboard handler
    this.addListener(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });
  }
  
  addListener(element, event, handler) {
    element.addEventListener(event, handler);
    this.eventListeners.push({ element, event, handler });
  }
  
  removeAllListeners() {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
  }
  
  async show({ corpus_id, path, onIndexChange }) {
    this.corpus_id = corpus_id;
    this.path = path;
    this.onIndexChange = onIndexChange || (() => {});
    
    // Parse path to determine granularity and filters
    this.parsePathInfo();
    
    // Create modal if needed
    if (!this.modalEl) {
      this._buildDOM();
    }
    
    // Update display
    this.updatePathDisplay();
    
    // Show modal
    this.overlayEl.style.display = "block";
    this.modalEl.style.display = "block";
    
    // Setup tooltips after modal is visible
    this._setupTooltips();
    
    // Enhanced UX: Check permissions and load document count in parallel
    await Promise.all([
      this.checkPermissions(),
      this.loadDocumentCount(),
      this.loadIndexes()
    ]);
  }
  
  hide() {
    // Stop any active job polling
    this.stopJobStatusPolling();
    
    // Clean up any namespace CSS classes from child modals
    if (this.messageModal && this.messageModal.modalEl) {
      this.messageModal.modalEl.classList.remove('vector-index-status-modal');
    }
    
    if (this.overlayEl) this.overlayEl.style.display = "none";
    if (this.modalEl) this.modalEl.style.display = "none";
  }
  
  isVisible() {
    return this.modalEl && this.modalEl.style.display !== "none";
  }
  
  parsePathInfo() {
    if (!this.path) {
      this.filters = {};
      this.granularity = 'corpus';
      return;
    }
    
    const pathParts = this.path.split('/').filter(Boolean);
    
    switch (pathParts.length) {
      case 1: // Corpus level
        this.granularity = 'corpus';
        this.filters = {};
        break;
      case 2: // Domain level
        this.granularity = 'domain';
        this.filters = { domain: pathParts[1] };
        break;
      case 3: // Unit level
        this.granularity = 'unit';
        this.filters = { 
          domain: pathParts[1], 
          unit: pathParts[2] 
        };
        break;
      default:
        this.granularity = 'custom';
        this.filters = {};
    }
  }
  
  buildCurrentFilters() {
    return this.filters;
  }
  
  updatePathDisplay() {
    const corpusEl = this.modalEl.querySelector('#displayCorpus');
    const pathEl = this.modalEl.querySelector('#displayPath');
    const granularityEl = this.modalEl.querySelector('#displayGranularity');
    
    if (corpusEl) corpusEl.textContent = this.corpus_id || 'Unknown';
    if (pathEl) pathEl.textContent = this.path || 'Root';
    if (granularityEl) granularityEl.textContent = this.granularity || 'Unknown';
  }
  
  async checkPermissions() {
    try {
      // Validate that store was provided in constructor
      if (!this.store) {
        throw new Error('Store not provided to VectorIndexManagementModal constructor');
      }
      
      // Import here to avoid circular dependencies
      const { getFreshSecurity } = await import('../../state/security.js');
      
      console.log(`[VectorIndexManagementModal] Store object:`, this.store);
      console.log(`[VectorIndexManagementModal] Store type:`, typeof this.store);
      console.log(`[VectorIndexManagementModal] Store getState:`, this.store?.getState ? 'exists' : 'missing');
      
      const security = getFreshSecurity(this.store);
      
      // CRITICAL FIX: Check corpus-specific permissions, not system permissions
      // User needs CORPUS_EDITOR permission for this specific corpus
      this.hasCorpusEditorPermission = security.hasCorpusPermission(this.corpus_id, 'CORPUS_EDITOR');
      
      console.log(`[VectorIndexManagementModal] Permission check for corpus ${this.corpus_id}:`, {
        corpus_id: this.corpus_id,
        hasCorpusEditorPermission: this.hasCorpusEditorPermission,
        corpusPermissions: security.permissions.corpus[this.corpus_id] || []
      });
      
      // Update UI based on permissions
      this.updatePermissionsUI();
      
    } catch (error) {
      console.error('[VectorIndexManagementModal] Permission check failed:', error);
      this.hasCorpusEditorPermission = false;
      this.updatePermissionsUI();
    }
  }
  
  updatePermissionsUI() {
    const createButton = this.modalEl.querySelector('#createIndexBtn');
    const permissionWarning = this.modalEl.querySelector('#permissionWarning');
    
    if (!this.hasCorpusEditorPermission) {
      if (createButton) {
        createButton.disabled = true;
        createButton.title = 'CORPUS_EDITOR permissions required';
        createButton.classList.add('btn--disabled');
      }
      if (permissionWarning) {
        permissionWarning.style.display = 'block';
      }
    } else {
      if (createButton) {
        createButton.disabled = false;
        createButton.title = '';
        createButton.classList.remove('btn--disabled');
      }
      if (permissionWarning) {
        permissionWarning.style.display = 'none';
      }
    }
  }
  
  async loadDocumentCount() {
    if (this.documentCountLoaded) return;
    
    try {
      const documentCountEl = this.modalEl.querySelector('#documentCount');
      if (!documentCountEl) {
        console.warn('[VectorIndexManagementModal] Document count element not found');
        return;
      }

      console.log(`[VectorIndexManagementModal] Loading document count for corpus: ${this.corpus_id}`, {
        corpus_id: this.corpus_id,
        path: this.path,
        filters: this.filters
      });
      
      // Show loading state
      documentCountEl.innerHTML = '<span class="loading-text">Loading...</span>';
      
      // Defensive check for corpus_id
      if (!this.corpus_id) {
        throw new Error('Corpus ID is not defined');
      }
      
      // Get document count for current filters
      const filters = this.buildCurrentFilters();
      console.log('[VectorIndexManagementModal] Calling getLiveDocumentCount with filters:', filters);
      
      const result = await getLiveDocumentCount({
        corpus_id: this.corpus_id,
        filters: filters
      });
      
      console.log('[VectorIndexManagementModal] Document count result:', result);
      
      this.documentCount = result.document_count || 0;
      
      // Update UI with formatted count
      const formattedCount = this.documentCount.toLocaleString();
      documentCountEl.innerHTML = `<span class="document-count-value">${formattedCount} available</span>`;
      
      this.documentCountLoaded = true;
      
    } catch (error) {
      console.error('[VectorIndexManagementModal] Document count loading failed:', {
        error: error.message,
        corpus_id: this.corpus_id,
        path: this.path,
        filters: this.filters,
        stack: error.stack
      });
      
      const documentCountEl = this.modalEl.querySelector('#documentCount');
      if (documentCountEl) {
        documentCountEl.innerHTML = `<span class="error-text">Error loading count: ${error.message}</span>`;
      }
    }
  }
  
  async loadIndexes() {
    try {
      this.setLoading(true);
      
      // Build hierarchical filter based on current path context
      const hierarchicalFilter = this._buildHierarchicalFilter();
      
      const response = await listVectorIndexes({
        corpus_id: this.corpus_id,
        hierarchical_filter: hierarchicalFilter
      });
      
      this.indexes = response.indexes || [];
      this.renderIndexesList();
      
    } catch (error) {
      console.error('[VectorIndexManagementModal] Error loading indexes:', error);
      this._ensureChildModalZIndex(this.errorModal);
      this.errorModal.show({
        title: "Error Loading Indexes",
        message: error.message || "Failed to load vector indexes"
      });
    } finally {
      this.setLoading(false);
    }
  }
  
  _buildHierarchicalFilter() {
    /**
     * Build hierarchical filter based on current granularity and path.
     * This ensures only indexes accessible at the current level are shown.
     * 
     * Hierarchical inheritance rules:
     * - Corpus level: sees all indexes (corpus, domain, unit)
     * - Domain level: sees corpus + domain + child unit indexes for that domain
     * - Unit level: sees corpus + parent domain + specific unit indexes
     */
    if (!this.granularity || this.granularity === 'corpus') {
      // At corpus level, no filtering needed - show all indexes
      return null;
    }
    
    const filter = {
      granularity: this.granularity
    };
    
    // Add domain filter for domain and unit levels
    if (this.granularity === 'domain' && this.filters.domain) {
      filter.domain = this.filters.domain;
    }
    
    // Add unit filter for unit level
    if (this.granularity === 'unit' && this.filters.domain && this.filters.unit) {
      filter.domain = this.filters.domain;
      filter.unit = this.filters.unit;
    }
    
    return filter;
  }
  
  renderIndexesList() {
    const listContainer = this.modalEl.querySelector('#indexesList');
    if (!listContainer) return;
    
    if (!this.indexes || this.indexes.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No vector indexes found for this corpus.</p>
          <p class="text-muted">Create an index to enable semantic search capabilities.</p>
        </div>
      `;
      return;
    }
    
    // Filter indexes that are relevant to current path
    const relevantIndexes = this.indexes.filter(index => {
      if (!index.filters || Object.keys(index.filters).length === 0) {
        return true; // Corpus-wide index is always relevant
      }
      
      // Check if index filters match current path filters
      return Object.entries(this.filters).every(([key, value]) => {
        return !index.filters[key] || index.filters[key] === value;
      });
    });
    
    const indexesHtml = relevantIndexes.map(index => this.renderIndexCard(index)).join('');
    
    listContainer.innerHTML = `
      <div class="indexes-grid">
        ${indexesHtml}
      </div>
      ${relevantIndexes.length !== this.indexes.length ? `
        <p class="text-muted">
          Showing ${relevantIndexes.length} of ${this.indexes.length} total indexes 
          (filtered for current path)
        </p>
      ` : ''}
    `;
    
    // Attach event listeners to index actions
    this.attachIndexEventListeners();
    
    // Setup tooltips for the dynamically rendered index cards
    this._setupIndexTooltips();
  }
  
  renderIndexCard(index) {
    const statusInfo = this.getEnhancedStatusInfo(index);
    const filterDisplay = this.formatFilters(index.filters);
    const actionButton = this.getSmartActionButton(index);
    const lastVectorized = this.formatLastVectorizedDate(index.last_vectorized_datetime);
    const needsRevectorization = this.checkRevectorizationNeeded(index.last_vectorized_datetime);
    
    return `
      <div class="index-card" data-index-name="${index.index_name}">
        <div class="index-header">
          <h4 class="index-name">${this.getDisplayIndexName(index)}</h4>
          <div class="status-badges">
            <span class="status-badge status-badge--${statusInfo.class}">${statusInfo.label}</span>
            ${needsRevectorization ? '<span class="status-badge status-badge--warning">Refresh Needed</span>' : ''}
          </div>
        </div>
        
        <div class="index-details">
          <div class="detail-row">
            <span class="detail-label">Scope:</span>
            <span class="detail-value">${this.formatGranularityForDisplay(index.granularity)}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">Filter:</span>
            <span class="detail-value">${filterDisplay}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">Documents:</span>
            <span class="detail-value">${this.getEnhancedDocumentDisplay(index)}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">Content Chunks:</span>
            <span class="detail-value">${this.getEnhancedChunkDisplay(index)}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">Last Updated:</span>
            <span class="detail-value">${lastVectorized}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">Created By:</span>
            <span class="detail-value">${index.created_by || 'System'}</span>
          </div>
        </div>
        
        <div class="index-actions">
          ${actionButton}
          ${this.shouldShowTestSearchButton(index) ? `
          <button class="btn btn--small btn--secondary test-search-btn" 
                  data-index-name="${index.index_name}">
            <i class="fas fa-search"></i> Test Search
          </button>
          ` : ''}
          <button class="btn btn--small btn--secondary status-btn" 
                  data-index-name="${index.index_name}">
            <i class="fas fa-info-circle"></i> Details
          </button>
          ${this.hasCorpusEditorPermission ? `
          <button class="btn btn--small btn--danger delete-btn" 
                  data-index-name="${index.index_name}">
            <i class="fas fa-trash"></i> Delete
          </button>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  attachIndexEventListeners() {
    // Vectorize buttons
    const vectorizeBtns = this.modalEl.querySelectorAll('.vectorize-btn');
    console.log('[VectorIndexManagementModal] Found vectorize buttons:', vectorizeBtns.length);
    vectorizeBtns.forEach((btn, index) => {
      console.log(`[VectorIndexManagementModal] Attaching listener to button ${index}:`, btn);
      this.addListener(btn, 'click', (e) => {
        console.log('[VectorIndexManagementModal] Vectorize button clicked - event:', e);
        console.log('[VectorIndexManagementModal] Target element:', e.target);
        console.log('[VectorIndexManagementModal] Current target:', e.currentTarget);
        
        const dataElement = e.target.closest('[data-index-name]');
        console.log('[VectorIndexManagementModal] Data element found:', dataElement);
        
        if (!dataElement) {
          console.error('[VectorIndexManagementModal] No data-index-name element found');
          return;
        }
        
        const indexName = dataElement.dataset.indexName;
        console.log('[VectorIndexManagementModal] Index name extracted:', indexName);
        
        this.handleVectorizeDocuments(indexName);
      });
    });
    
    // Status buttons
    const statusBtns = this.modalEl.querySelectorAll('.status-btn');
    statusBtns.forEach(btn => {
      this.addListener(btn, 'click', (e) => {
        const indexName = e.target.closest('[data-index-name]').dataset.indexName;
        this.handleViewStatus(indexName);
      });
    });
    
    // Test Search buttons
    const testSearchBtns = this.modalEl.querySelectorAll('.test-search-btn');
    testSearchBtns.forEach(btn => {
      this.addListener(btn, 'click', (e) => {
        const indexName = e.target.closest('[data-index-name]').dataset.indexName;
        this.handleTestSearch(indexName);
      });
    });
    
    // Delete buttons
    const deleteBtns = this.modalEl.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
      this.addListener(btn, 'click', (e) => {
        const indexName = e.target.closest('[data-index-name]').dataset.indexName;
        this.handleDeleteIndex(indexName);
      });
    });
  }
  
  async handleCreateIndex() {
    // Load corpus configuration if not already loaded
    if (!this.corpusConfig) {
      try {
        await this.loadCorpusConfiguration();
      } catch (error) {
        console.error('[VectorIndexManagementModal] Error loading corpus config:', error);
        this._ensureChildModalZIndex(this.errorModal);
        this.errorModal.show({
          title: "Error Loading Configuration",
          message: "Failed to load corpus configuration for topic/type selection"
        });
        return;
      }
    }
    
    // Show enhanced index creation modal
    this.showEnhancedIndexCreationModal();
  }
  
  async loadCorpusConfiguration() {
    try {
      const attrs = await getSubtenantAttributes([
        "corpus_config",
        "label_friendly_names"
      ]);
      
      this.corpusConfig = attrs.corpus_config || {};
      this.labelFriendlyNames = attrs.label_friendly_names || {};
      
      // Extract topics and types for the current corpus
      if (this.corpusConfig.corpora && this.corpusConfig.corpora[this.corpus_id]) {
        const corpusData = this.corpusConfig.corpora[this.corpus_id];
        this.documentTopics = corpusData.document_topics_choices || [];
        this.documentTypes = corpusData.document_types_choices || [];
      }
      
      console.log('[VectorIndexManagementModal] Loaded corpus config:', {
        topics: this.documentTopics.length,
        types: this.documentTypes.length
      });
      
    } catch (error) {
      console.error('[VectorIndexManagementModal] Error loading corpus configuration:', error);
      throw error;
    }
  }
  
  showEnhancedIndexCreationModal() {
    // Create enhanced modal for index creation with topic/type selection
    const enhancedModal = document.createElement("div");
    enhancedModal.className = "overlay";
    enhancedModal.style.zIndex = "11000";
    
    const modalContent = document.createElement("div");
    modalContent.className = "modal modal--form";
    modalContent.style.zIndex = "11001";
    modalContent.style.maxWidth = "600px";
    
    modalContent.innerHTML = `
      <button class="modal__close" aria-label="Close modal">&times;</button>
      <h2>Create Vector Index</h2>
      
      <form class="form">
        <div class="form-group">
          <label for="indexName">Index Name (optional)</label>
          <input type="text" id="indexName" class="doc-input" 
                 placeholder="Leave empty for auto-generated name">
        </div>
        
        <div class="form-group">
          <div class="label-with-tooltip">
            <label>Document Topics</label>
            <small class="form-help">Select specific topics to include in this index</small>
          </div>
          <div id="topicsContainer" class="checkbox-container"></div>
        </div>
        
        <div class="form-group">
          <div class="label-with-tooltip">
            <label>Document Types</label>
            <small class="form-help">Select specific document types to include in this index</small>
          </div>
          <div id="typesContainer" class="checkbox-container"></div>
        </div>
        
        <div class="form-group">
          <label for="indexDescription">Description (optional)</label>
          <textarea id="indexDescription" class="doc-input" rows="3" 
                    placeholder="Describe the purpose of this index..."></textarea>
        </div>
        
        <div class="button-group" style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn" id="cancelCreateBtn">Cancel</button>
          <button type="button" class="btn btn--primary" id="createBtn">Create Index</button>
        </div>
      </form>
    `;
    
    enhancedModal.appendChild(modalContent);
    document.body.appendChild(enhancedModal);
    
    // Setup event listeners
    const closeBtn = modalContent.querySelector('.modal__close');
    const cancelBtn = modalContent.querySelector('#cancelCreateBtn');
    const createBtn = modalContent.querySelector('#createBtn');
    const indexNameInput = modalContent.querySelector('#indexName');
    const indexDescInput = modalContent.querySelector('#indexDescription');
    const topicsContainer = modalContent.querySelector('#topicsContainer');
    const typesContainer = modalContent.querySelector('#typesContainer');
    
    // Reset selections
    this.selectedTopics = [];
    this.selectedTypes = [];
    
    // Populate checkboxes
    this.populateTopicsCheckboxes(topicsContainer);
    this.populateTypesCheckboxes(typesContainer);
    
    // Event handlers
    const closeModal = () => {
      document.body.removeChild(enhancedModal);
    };
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    enhancedModal.addEventListener('click', (e) => {
      if (e.target === enhancedModal) closeModal();
    });
    
    createBtn.addEventListener('click', async () => {
      try {
        // Validate selections
        if (this.selectedTopics.length === 0 && this.selectedTypes.length === 0) {
          this._ensureChildModalZIndex(this.errorModal);
          this.errorModal.show({
            title: "Validation Error",
            message: "Please select at least one document topic or document type for the index"
          });
          return;
        }
        
        createBtn.disabled = true;
        createBtn.textContent = "Creating...";
        
        // Prepare enhanced filters
        const enhancedFilters = { ...this.filters };
        if (this.selectedTopics.length > 0) {
          enhancedFilters.document_topics = this.selectedTopics;
        }
        if (this.selectedTypes.length > 0) {
          enhancedFilters.document_types = this.selectedTypes;
        }
        
        await createVectorIndex({
          corpus_id: this.corpus_id,
          granularity: this.granularity,
          filters: enhancedFilters,
          index_name: indexNameInput.value || null,
          description: indexDescInput.value || null
        });
        
        closeModal();
        
        this._ensureChildModalZIndex(this.messageModal);
        this.messageModal.show({
          title: "Success",
          message: "Vector index created successfully with topic/type filtering! You can now vectorize documents to enable semantic search."
        });
        
        // Reload indexes and notify parent
        await this.loadIndexes();
        this.onIndexChange();
        
      } catch (error) {
        console.error('[VectorIndexManagementModal] Error creating enhanced index:', error);
        this._ensureChildModalZIndex(this.errorModal);
        this.errorModal.show({
          title: "Error Creating Index",
          message: error.message || "Failed to create vector index"
        });
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = "Create Index";
      }
    });
    
    // Show modal
    enhancedModal.style.display = "block";
    modalContent.style.display = "block";
    
    // Add styles if not already present
    this.addEnhancedModalStyles();
  }
  
  async handleVectorizeDocuments(indexName) {
    console.log('[VectorIndexManagementModal] handleVectorizeDocuments CALLED with indexName:', indexName);
    console.log('[VectorIndexManagementModal] Available indexes:', this.indexes);
    console.log('[VectorIndexManagementModal] Current corpus_id:', this.corpus_id);
    
    const index = this.indexes.find(idx => idx.index_name === indexName);
    if (!index) {
      console.error('[VectorIndexManagementModal] Index not found:', indexName);
      return;
    }
    
    console.log('[VectorIndexManagementModal] Found index for vectorization:', {
      index_name: index.index_name,
      filters: index.filters,
      corpus_id: this.corpus_id
    });
    
    console.log('[VectorIndexManagementModal] About to show confirmation modal');
    console.log('[VectorIndexManagementModal] this.confirmModal:', this.confirmModal);
    console.log('[VectorIndexManagementModal] typeof this.confirmModal:', typeof this.confirmModal);
    
    try {
      this._ensureChildModalZIndex(this.confirmModal);
      console.log('[VectorIndexManagementModal] Z-index ensured, calling confirmModal.show()');
      
      const modalResult = this.confirmModal.show({
        title: "Vectorize Documents",
        message: `Start vectorizing documents for index "${indexName}"? This will process documents matching the index filters and may take some time.`,
        onYes: async () => {
        try {
          console.log('[VectorIndexManagementModal] User confirmed vectorization, starting API call...');
          this.setLoading(true);
          
          const requestParams = {
            corpus_id: this.corpus_id,
            index_name: indexName,
            filters: index.filters || {},
            batch_size: 10
          };
          
          console.log('[VectorIndexManagementModal] Calling vectorizeCorpusSection with params:', requestParams);
          
          const response = await vectorizeCorpusSection(requestParams);
          
          console.log('[VectorIndexManagementModal] Vectorization API response:', response);
          
          // Handle different response scenarios - CHECK JOB_STARTED FIRST!
          if (response.job_started === true) {
            // SUCCESS: Fargate job started successfully 
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: "Vectorization Started",
              message: `Batch vectorization job started successfully! Processing ${response.total_documents} documents via ECS Fargate. Job ID: ${response.job_id}. Check the index status for progress updates.`
            });
          } else if (response.processing_method === 'ecs_fargate') {
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: "Vectorization Started",
              message: `Large batch vectorization started via ECS. Processing ${response.document_count} documents. Check the index status for progress updates.`
            });
          } else if (response.status === 'NO_DOCUMENTS_TO_PROCESS' || response.job_started === false) {
            // No documents found needing vectorization
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: "No Documents to Vectorize",
              message: `${response.message || 'No documents found needing vectorization'}. ${response.reason || 'This typically means no documents match the specified filters.'}`
            });
          } else if (response.processed_count === 0 && response.total_documents === 0) {
            // No documents found to process
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: "No Documents Found",
              message: `No documents were found matching the index filters. This could mean:\n• No documents exist in this corpus section\n• Documents don't match the current filters (${this.formatFilters(index.filters)})\n• Documents may already be vectorized\n\nTry expanding your search criteria or check if documents exist in this corpus location.`
            });
          } else if (response.processed_count === 0 && response.total_documents > 0) {
            // Documents found but none processed - determine the actual cause
            let title = "No Documents Processed";
            let message = `Found ${response.total_documents} documents but none were processed.`;
            
            // Check for specific error indicators in the response
            if (response.error && response.error.includes('not found')) {
              title = "Vector Index Error";
              message = `Index lookup failed: ${response.error}. This may indicate a system configuration issue. Please try recreating the index or contact support.`;
            } else if (response.error && response.error.includes('Index')) {
              title = "Index Configuration Error";
              message = `Vector index error: ${response.error}. Please check the index configuration or try recreating it.`;
            } else if (response.reason) {
              // Backend provided specific reason
              message += ` Reason: ${response.reason}`;
            } else {
              // Default case - likely documents already vectorized
              message += ` This usually means the documents are already vectorized for this index, or there may be a configuration issue preventing processing.`;
            }
            
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: title,
              message: message
            });
          } else if (response.job_started === false && response.status === 'NO_DOCUMENTS_TO_PROCESS') {
            // No Fargate task started because no documents need processing
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: "No Documents to Vectorize",
              message: `${response.message || 'No documents found needing vectorization'}. ${response.reason || 'This typically means documents are already vectorized or no documents match the specified filters.'}`
            });
          } else if (response.job_started || response.status === 'STARTED') {
            // Job started successfully - show message and start polling
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: "Vectorization Started",
              message: `Vectorization job has been started successfully. Job ID: ${response.job_id || 'N/A'}. Status updates will appear automatically as the job progresses.`
            });
            
            // Start polling for job status updates
            if (response.job_id) {
              this.startJobStatusPolling(response.job_id);
            }
          } else {
            // Legacy/completion case (shouldn't happen with new flow)
            this._ensureChildModalZIndex(this.messageModal);
            this.messageModal.show({
              title: "Vectorization Complete",
              message: `Successfully processed ${response.processed_count || 0} of ${response.total_documents || 0} documents. ${(response.failed_count || 0) > 0 ? `${response.failed_count} documents failed processing.` : 'All documents processed successfully!'}`
            });
          }
          
          // Reload indexes to show updated status
          await this.loadIndexes();
          this.onIndexChange();
          
        } catch (error) {
          console.error('[VectorIndexManagementModal] Error vectorizing documents:', error);
          this._ensureChildModalZIndex(this.errorModal);
          
          // Provide more specific error messages based on error type
          let errorTitle = "Error Vectorizing Documents";
          let errorMessage = error.message || "Failed to start document vectorization";
          
          if (error.message && error.message.includes('not found')) {
            errorTitle = "Vector Index Not Found";
            errorMessage = "The vector index could not be found. This may be a configuration issue. Please try recreating the index or contact support.";
          } else if (error.message && error.message.includes('Index')) {
            errorTitle = "Vector Index Error";
            errorMessage = `Index error: ${error.message}. Please check the index configuration.`;
          }
          
          this.errorModal.show({
            title: errorTitle,
            message: errorMessage
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
    
    console.log('[VectorIndexManagementModal] confirmModal.show() returned:', modalResult);
    
  } catch (error) {
    console.error('[VectorIndexManagementModal] Error showing confirmation modal:', error);
    console.error('[VectorIndexManagementModal] Error stack:', error.stack);
    
    // Fallback: show error modal
    this._ensureChildModalZIndex(this.errorModal);
    this.errorModal.show({
      title: "Modal Error",
      message: `Failed to show confirmation dialog: ${error.message}`
    });
  }
  }
  
  async handleViewStatus(indexName) {
    try {
      this.setLoading(true);
      
      const response = await getVectorIndexStatus({
        corpus_id: this.corpus_id,
        index_name: indexName
      });
      
      const index = response.index_metadata;
      const statusHtml = `
        <div class="status-details">
          <h4>Index Status: ${index.index_name}</h4>
          <div class="status-grid">
            <div class="status-item">
              <span class="status-label">Status:</span>
              <span class="status-value status--${this.getStatusClass(index.status)}">${this.formatStatusForDisplay(index.status)}</span>
            </div>
            <div class="status-item">
              <span class="status-label">S3 Vectors Status:</span>
              <span class="status-value">${this.formatS3VectorsStatus(index.s3vectors_status)}</span>
            </div>
            <div class="status-item">
              <span class="status-label">Documents:</span>
              <span class="status-value">${this.getDocumentCountDisplay(index)}</span>
            </div>
            <div class="status-item">
              <span class="status-label">Chunks:</span>
              <span class="status-value">${this.getChunkCountDisplay(index)} / ${index.estimated_chunks || 0} estimated</span>
            </div>
            <div class="status-item">
              <span class="status-label">Embedding Model:</span>
              <span class="status-value">${index.embedding_model || 'Not specified'}</span>
            </div>
            <div class="status-item">
              <span class="status-label">Dimensions:</span>
              <span class="status-value">${index.embedding_dimensions || 'Not specified'}</span>
            </div>
            <div class="status-item">
              <span class="status-label">S3 Bucket:</span>
              <span class="status-value">${index.s3vectors_bucket || 'Not specified'}</span>
            </div>
          </div>
        </div>
      `;
      
      // Ensure styles are loaded for status modal
      this.addEnhancedModalStyles();
      
      this._ensureChildModalZIndex(this.messageModal);
      this.messageModal.show({
        title: "Vector Index Status",
        message: statusHtml
      });
      
      // Apply namespace CSS class for proper styling
      if (this.messageModal.modalEl) {
        this.messageModal.modalEl.classList.add('vector-index-status-modal');
        // Ensure the message content displays as HTML
        const messageEl = this.messageModal.modalEl.querySelector('#messageModalMessage');
        if (messageEl) {
          messageEl.innerHTML = statusHtml;
        }
      }
      
    } catch (error) {
      console.error('[VectorIndexManagementModal] Error getting index status:', error);
      this._ensureChildModalZIndex(this.errorModal);
      this.errorModal.show({
        title: "Error Getting Status",
        message: error.message || "Failed to retrieve index status"
      });
    } finally {
      this.setLoading(false);
    }
  }
  
  /**
   * VECTOR SEARCH PREVIEW MODAL ACCESS PATH DOCUMENTATION:
   * 
   * The VectorSearchPreviewModal is accessed through the following UI flow:
   * 1. User navigates to Corpus → [corpus] → Manage Vectors
   * 2. VectorIndexManagementModal opens showing available vector indexes
   * 3. For indexes with vectorized content, a "Test Search" button appears
   * 4. Button visibility determined by shouldShowTestSearchButton():
   *    - Index must have chunk_count > 0
   *    - Index status must be 'active', 'indexed', 'ready', or 'COMPLETED'
   * 5. Clicking "Test Search" calls handleTestSearch() which:
   *    - Validates index exists and is searchable
   *    - Opens VectorSearchPreviewModal with corpus_id, index_name, and filters
   * 
   * Backend Integration:
   * - Modal uses semanticSearch API from frontend/spa/api/corpus-vectors.js
   * - API routes to backend Lambda: backend/services/lambdas/corpus/vectors/search_vectors.py
   * - Lambda performs vector search using shared/vector_api.py VectorAPI
   * - Results include similarity scores, document chunks, and metadata
   * 
   * Features Available in VectorSearchPreviewModal:
   * - Natural language query input (20-30 words recommended)
   * - Real-time semantic search with configurable top_k and min_similarity
   * - Results table showing similarity scores, document keys, content preview
   * - Detailed chunk content display with full text and metadata
   * - Search powered by Amazon Titan Text Embeddings V2 (1024-dimensional)
   */
  handleTestSearch(indexName) {
    console.log('[VectorIndexManagementModal] handleTestSearch called with indexName:', indexName);
    
    // Find the index data
    const index = this.indexes.find(idx => idx.index_name === indexName);
    if (!index) {
      console.error('[VectorIndexManagementModal] Index not found:', indexName);
      this._ensureChildModalZIndex(this.errorModal);
      this.errorModal.show({
        title: "Error",
        message: "Index not found. Please refresh the index list and try again."
      });
      return;
    }
    
    // Check if index is searchable
    if (!this.shouldShowTestSearchButton(index)) {
      this._ensureChildModalZIndex(this.messageModal);
      this.messageModal.show({
        title: "Index Not Ready",
        message: "This index does not have any vectorized content yet. Please vectorize documents first before testing search functionality."
      });
      return;
    }
    
    console.log('[VectorIndexManagementModal] Opening vector search preview modal for:', {
      corpus_id: this.corpus_id,
      index_name: indexName,
      filters: index.filters || {}
    });
    
    // Launch the vector search preview modal
    this.vectorSearchPreviewModal.show({
      corpus_id: this.corpus_id,
      index_name: indexName,
      filters: index.filters || {}
    });
  }
  
  handleDeleteIndex(indexName) {
    this._ensureChildModalZIndex(this.confirmModal);
    this.confirmModal.show({
      title: "Delete Vector Index",
      message: `Are you sure you want to delete the vector index "${indexName}"? This will remove all vectorized content and cannot be undone.`,
      onYes: async () => {
        try {
          this.setLoading(true);
          
          await deleteVectorIndex({
            corpus_id: this.corpus_id,
            index_name: indexName
          });
          
          this._ensureChildModalZIndex(this.messageModal);
          this.messageModal.show({
            title: "Success",
            message: "Vector index deleted successfully."
          });
          
          // Reload indexes and notify parent
          await this.loadIndexes();
          this.onIndexChange();
          
        } catch (error) {
          console.error('[VectorIndexManagementModal] Error deleting index:', error);
          this._ensureChildModalZIndex(this.errorModal);
          this.errorModal.show({
            title: "Error Deleting Index",
            message: error.message || "Failed to delete vector index"
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
  }
  
  formatFilters(filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return 'All documents';
    }
    
    const filterParts = [];
    
    // Handle path-based filters
    if (filters.domain) {
      filterParts.push(`Domain: ${filters.domain}`);
    }
    if (filters.unit) {
      filterParts.push(`Unit: ${filters.unit}`);
    }
    
    // Handle topic filters
    if (filters.document_topics && Array.isArray(filters.document_topics)) {
      const topicNames = filters.document_topics.map(topic => 
        getLabelFriendlyName(this.labelFriendlyNames, topic) || topic
      );
      filterParts.push(`Topics: ${topicNames.join(', ')}`);
    }
    
    // Handle type filters
    if (filters.document_types && Array.isArray(filters.document_types)) {
      const typeNames = filters.document_types.map(type => 
        getLabelFriendlyName(this.labelFriendlyNames, type) || type
      );
      filterParts.push(`Types: ${typeNames.join(', ')}`);
    }
    
    // Handle other filters generically
    Object.entries(filters).forEach(([key, value]) => {
      if (!['domain', 'unit', 'document_topics', 'document_types'].includes(key)) {
        filterParts.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
      }
    });
    
    return filterParts.length > 0 ? filterParts.join(' | ') : 'All documents';
  }
  
  shouldShowTestSearchButton(index) {
    // Show test search button if index has chunks and is in a searchable state
    const hasChunks = (index.chunk_count && index.chunk_count > 0);
    const isSearchableStatus = ['active', 'indexed', 'ready', 'COMPLETED'].includes(index.status);
    return hasChunks && isSearchableStatus;
  }
  
  getChunkCountDisplay(index) {
    // Show appropriate chunk count based on index status
    if (index.status === 'creating' || index.status === 'indexing' || index.status === 'vectorizing') {
      if (index.chunk_count && index.chunk_count > 0) {
        return index.chunk_count; // Show actual count if available during processing
      }
      return '--'; // Show placeholder when count is unknown
    }
    
    // For other statuses, show actual count or 0
    return index.chunk_count || 0;
  }
  
  getDocumentCountDisplay(index) {
    // Show document count with clarification
    const count = index.document_count || 0;
    if (index.status === 'creating' && count > 0) {
      return `${count} eligible`;
    }
    return count;
  }
  
  getStatusClass(status) {
    switch (status) {
      case 'active':
      case 'indexed':
      case 'ready':
      case 'COMPLETED':
        return 'success';
      case 'creating':
      case 'indexing':
      case 'vectorizing':
      case 'PROCESSING':
      case 'DISCOVERING_DOCUMENTS':
        return 'pending';
      case 'COMPLETED_WITH_ERRORS':
        return 'warning';
      case 'error':
      case 'index_error':
      case 'FAILED':
        return 'error';
      default:
        return 'default';
    }
  }
  
  formatStatusForDisplay(status) {
    // Convert technical status to user-friendly labels
    switch (status) {
      case 'creating':
        return 'Ready to Vectorize';
      case 'DISCOVERING_DOCUMENTS':
        return 'Finding Documents';
      case 'vectorizing':
      case 'indexing':
      case 'PROCESSING':
        return 'Vectorizing Documents...';
      case 'active':
        return 'Vectorization Complete';
      case 'indexed':
      case 'COMPLETED':
      case 'ready':
        return 'Ready for Search';
      case 'COMPLETED_WITH_ERRORS':
        return 'Completed with Errors';
      case 'failed':
      case 'error':
      case 'index_error':
      case 'FAILED':
        return 'Vectorization Failed';
      default:
        return status || 'Unknown Status';
    }
  }
  
  formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
      return formatHumanReadableDate(dateString);
    } catch (e) {
      console.warn('[VectorIndexManagementModal] Date formatting error:', e);
      return dateString;
    }
  }
  
  formatS3VectorsStatus(s3Status) {
    if (!s3Status) return 'Unknown';
    
    // Handle string status
    if (typeof s3Status === 'string') {
      return s3Status;
    }
    
    // Handle object status - extract meaningful information
    if (typeof s3Status === 'object') {
      try {
        // Check if it has an index object (successful status response)
        if (s3Status.index) {
          const index = s3Status.index;
          const parts = [];
          
          // Add creation status
          if (index.indexArn) {
            parts.push('Active');
          }
          
          // Add creation time if available
          if (index.creationTime) {
            parts.push(`Created: ${formatHumanReadableDate(index.creationTime, true)}`);
          }
          
          // Add vector count if available
          if (index.vectorCount !== undefined) {
            parts.push(`Vectors: ${index.vectorCount}`);
          }
          
          return parts.length > 0 ? parts.join(' | ') : 'Active';
        }
        
        // Check if it has error information
        if (s3Status.error) {
          return `Error: ${s3Status.error}`;
        }
        
        // Check if it has a status field
        if (s3Status.status) {
          return s3Status.status;
        }
        
        // Fallback - try to extract any meaningful string value
        const keys = Object.keys(s3Status);
        if (keys.length > 0) {
          return 'Available';
        }
        
      } catch (error) {
        console.warn('[VectorIndexManagementModal] Error formatting S3 vectors status:', error);
        return 'Status Available';
      }
    }
    
    return 'Unknown';
  }
  
  setLoading(loading) {
    this.loading = loading;
    const overlay = this.modalEl?.querySelector('#modalLoadingOverlay');
    if (overlay) {
      overlay.style.display = loading ? 'flex' : 'none';
    }
  }
  
  populateTopicsCheckboxes(container) {
    container.innerHTML = "";
    
    if (this.documentTopics.length === 0) {
      container.innerHTML = '<p class="empty-message">No document topics available for this corpus</p>';
      return;
    }
    
    this.documentTopics.forEach(topic => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "checkbox-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `topic-${topic}`;
      checkbox.value = topic;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (!this.selectedTopics.includes(topic)) {
            this.selectedTopics.push(topic);
          }
        } else {
          this.selectedTopics = this.selectedTopics.filter(t => t !== topic);
        }
      });

      const label = document.createElement("label");
      label.htmlFor = `topic-${topic}`;
      label.textContent = getLabelFriendlyName(this.labelFriendlyNames, topic) || topic;

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(label);
      container.appendChild(itemDiv);
    });
  }
  
  populateTypesCheckboxes(container) {
    container.innerHTML = "";
    
    if (this.documentTypes.length === 0) {
      container.innerHTML = '<p class="empty-message">No document types available for this corpus</p>';
      return;
    }
    
    this.documentTypes.forEach(type => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "checkbox-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `type-${type}`;
      checkbox.value = type;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (!this.selectedTypes.includes(type)) {
            this.selectedTypes.push(type);
          }
        } else {
          this.selectedTypes = this.selectedTypes.filter(t => t !== type);
        }
      });

      const label = document.createElement("label");
      label.htmlFor = `type-${type}`;
      label.textContent = getLabelFriendlyName(this.labelFriendlyNames, type) || type;

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(label);
      container.appendChild(itemDiv);
    });
  }
  
  addEnhancedModalStyles() {
    if (!document.getElementById('vector-index-enhanced-styles')) {
      const style = document.createElement('style');
      style.id = 'vector-index-enhanced-styles';
      style.textContent = `
        /* Checkbox container styling similar to choose-content modal */
        .checkbox-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          grid-gap: 8px;
          margin-top: 5px;
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid var(--border-subtle, #ddd);
          padding: 12px;
          border-radius: 6px;
          background: var(--surface-default, #fff);
        }
        
        .checkbox-item {
          display: flex;
          align-items: center;
          padding: 4px 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          border-radius: 4px;
          transition: background-color 0.2s ease;
        }
        
        .checkbox-item:hover {
          background-color: var(--surface-hover, #f8f9fa);
        }
        
        .checkbox-item input[type="checkbox"] {
          width: auto !important;
          padding: 0 !important;
          margin: 0 8px 0 0 !important;
          box-sizing: border-box !important;
          border: none !important;
          flex-shrink: 0 !important;
          appearance: checkbox !important;
          -webkit-appearance: checkbox !important;
          box-shadow: none !important;
          transition: none !important;
          background-color: transparent !important;
        }
        
        .checkbox-item label {
          margin: 0 !important;
          font-size: 14px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          cursor: pointer !important;
          display: inline-block !important;
          max-width: calc(100% - 22px) !important;
          padding: 0 !important;
          color: var(--text-primary, #333) !important;
          line-height: 1.4 !important;
        }
        
        .empty-message {
          grid-column: 1 / -1;
          text-align: center;
          color: var(--text-secondary, #666);
          font-style: italic;
          padding: 20px;
          margin: 0;
        }
        
        .form-help {
          color: var(--text-secondary, #666);
          font-size: 12px;
          margin: 0 0 5px 0;
          display: block;
        }
        
        .label-with-tooltip {
          margin-bottom: 8px;
        }
        
        .label-with-tooltip label {
          margin: 0 0 4px 0 !important;
          font-weight: 500;
          color: var(--text-primary, #333);
        }
        
        /* Vector Index Status Modal - Enhanced Layout with Namespace */
        .vector-index-status-modal .status-details {
          padding: var(--spacing-4, 16px) !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          background: var(--surface-default, #fff) !important;
        }
        
        .vector-index-status-modal .status-details h4 {
          margin: 0 0 var(--spacing-4, 16px) 0 !important;
          color: var(--text-primary, #333) !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          border-bottom: 1px solid var(--border-subtle, #ddd) !important;
          padding-bottom: var(--spacing-2, 8px) !important;
        }
        
        .vector-index-status-modal .status-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: var(--spacing-3, 12px) !important;
          margin-top: var(--spacing-3, 12px) !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        
        @media (max-width: 600px) {
          .vector-index-status-modal .status-grid {
            grid-template-columns: 1fr !important;
          }
        }
        
        .vector-index-status-modal .status-item {
          display: flex !important;
          flex-direction: column !important;
          padding: var(--spacing-2, 8px) !important;
          background: var(--surface-subtle, #f8f9fa) !important;
          border-radius: 4px !important;
          border: 1px solid var(--border-subtle, #ddd) !important;
          box-sizing: border-box !important;
          min-height: 60px !important;
        }
        
        .vector-index-status-modal .status-label {
          font-size: 12px !important;
          font-weight: 500 !important;
          color: var(--text-secondary, #666) !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          margin-bottom: 4px !important;
          line-height: 1.2 !important;
        }
        
        .vector-index-status-modal .status-value {
          font-size: 14px !important;
          color: var(--text-primary, #333) !important;
          word-break: break-word !important;
          line-height: 1.4 !important;
          font-weight: 400 !important;
          flex-grow: 1 !important;
        }
        
        .vector-index-status-modal .status-value.status--success {
          color: var(--status-success, #28a745) !important;
          font-weight: 500 !important;
        }
        
        .vector-index-status-modal .status-value.status--pending {
          color: var(--status-warning, #ffc107) !important;
          font-weight: 500 !important;
        }
        
        .vector-index-status-modal .status-value.status--error {
          color: var(--status-error, #dc3545) !important;
          font-weight: 500 !important;
        }
        
        .vector-index-status-modal .status-value.status--warning {
          color: var(--status-warning, #ffc107) !important;
          font-weight: 500 !important;
        }
        
        /* Additional isolation to prevent conflicts */
        .vector-index-status-modal .modal {
          min-width: 500px !important;
        }
        
        .vector-index-status-modal .modal h2 {
          margin-bottom: var(--spacing-4, 16px) !important;
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  destroy() {
    this.removeAllListeners();
    
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
    
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    
    this.modalEl = null;
    this.overlayEl = null;
  }
  
  /**
   * Start polling for job status updates
   * @param {string} jobId - The job ID to poll for
   */
  startJobStatusPolling(jobId) {
    console.log(`[VectorIndexManagementModal] Starting status polling for job: ${jobId}`);
    
    // Clear any existing polling
    this.stopJobStatusPolling();
    
    this.currentJobId = jobId;
    
    // Poll immediately, then every 5 seconds
    this.pollJobStatus();
    this.pollingInterval = setInterval(() => {
      this.pollJobStatus();
    }, 5000); // Poll every 5 seconds
    
    // Stop polling after 30 minutes to prevent infinite polling
    this.pollingTimeout = setTimeout(() => {
      console.log('[VectorIndexManagementModal] Stopping polling due to timeout');
      this.stopJobStatusPolling();
    }, 30 * 60 * 1000); // 30 minutes
  }
  
  /**
   * Stop job status polling
   */
  stopJobStatusPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
    
    this.currentJobId = null;
  }
  
  /**
   * Poll for current job status
   */
  async pollJobStatus() {
    if (!this.currentJobId) {
      return;
    }
    
    try {
      const response = await vectorizeDocuments({
        operation: 'get_job_status',
        job_id: this.currentJobId
      });
      
      console.log(`[VectorIndexManagementModal] Job status: ${response.status}, Progress: ${response.progress_percentage}%`);
      
      // Update UI with status info
      this.updateJobStatusDisplay(response);
      
      // Check if job is complete
      const completedStatuses = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'NO_DOCUMENTS_TO_PROCESS'];
      if (completedStatuses.includes(response.status)) {
        console.log(`[VectorIndexManagementModal] Job completed with status: ${response.status}`);
        this.handleJobCompletion(response);
        this.stopJobStatusPolling();
      }
      
    } catch (error) {
      console.error('[VectorIndexManagementModal] Error polling job status:', error);
      // Continue polling - temporary errors shouldn't stop monitoring
    }
  }
  
  /**
   * Update the UI with job status information
   * @param {Object} jobStatus - The job status response
   */
  updateJobStatusDisplay(jobStatus) {
    // Find status display element if it exists
    const statusElement = this.modalEl?.querySelector('.job-status-display');
    if (statusElement) {
      const statusText = this.formatJobStatus(jobStatus);
      statusElement.innerHTML = statusText;
    }
    
    // Also update the index list to show progress
    this.loadIndexes();
  }
  
  /**
   * Format job status for display
   * @param {Object} jobStatus - The job status response
   * @returns {string} Formatted HTML
   */
  formatJobStatus(jobStatus) {
    const status = jobStatus.status || 'UNKNOWN';
    const progress = jobStatus.progress_percentage || 0;
    const processed = jobStatus.processed_documents || 0;
    const total = jobStatus.total_documents || 0;
    const failed = jobStatus.failed_documents || 0;
    
    let statusIcon = '⏳';
    let statusColor = '#007bff';
    
    if (status === 'COMPLETED') {
      statusIcon = '✅';
      statusColor = '#28a745';
    } else if (status === 'COMPLETED_WITH_ERRORS') {
      statusIcon = '⚠️';
      statusColor = '#ffc107';
    } else if (status === 'FAILED') {
      statusIcon = '❌';
      statusColor = '#dc3545';
    }
    
    return `
      <div style="color: ${statusColor}; padding: 8px; background: var(--surface-subtle); border-radius: 4px; margin: 8px 0;">
        ${statusIcon} <strong>Job Status:</strong> ${status}
        <br>
        <strong>Progress:</strong> ${processed}/${total} documents (${progress}%)
        ${failed > 0 ? `<br><strong>Failed:</strong> ${failed} documents` : ''}
      </div>
    `;
  }
  
  /**
   * Handle job completion
   * @param {Object} jobStatus - The final job status
   */
  handleJobCompletion(jobStatus) {
    const status = jobStatus.status;
    const processed = jobStatus.processed_documents || 0;
    const total = jobStatus.total_documents || 0;
    const failed = jobStatus.failed_documents || 0;
    
    let title = "Vectorization Complete";
    let message = `Successfully processed ${processed} of ${total} documents.`;
    
    if (status === 'FAILED') {
      title = "Vectorization Failed";
      message = jobStatus.error_message || "The vectorization job failed.";
    } else if (status === 'COMPLETED_WITH_ERRORS') {
      title = "Vectorization Completed with Errors";
      message = `Processed ${processed} of ${total} documents. ${failed} documents failed processing.`;
    } else if (status === 'NO_DOCUMENTS_TO_PROCESS') {
      title = "No Documents to Vectorize";
      message = "All documents are already vectorized or no documents match the filters.";
    } else if (failed > 0) {
      message += ` ${failed} documents failed processing.`;
    } else {
      message += " All documents processed successfully!";
    }
    
    this._ensureChildModalZIndex(this.messageModal);
    this.messageModal.show({
      title,
      message
    });
    
    // Reload indexes to show updated status
    this.loadIndexes();
  }
  
  // Enhanced UX Helper Methods
  
  getEnhancedStatusInfo(index) {
    const status = index.status;
    const chunkCount = index.chunk_count || 0;
    
    switch (status) {
      case 'active':
        return {
          class: 'success',
          label: chunkCount > 0 ? 'Ready for Search' : 'Index Created'
        };
      case 'creating':
        return {
          class: 'info',
          label: 'Awaiting Documents'
        };
      case 'vectorizing':
      case 'indexing':
      case 'PROCESSING':
        return {
          class: 'processing',
          label: 'Processing Documents'
        };
      case 'DISCOVERING_DOCUMENTS':
        return {
          class: 'processing',
          label: 'Finding Documents'
        };
      case 'COMPLETED':
        return {
          class: 'success',
          label: 'Search Ready'
        };
      case 'COMPLETED_WITH_ERRORS':
        return {
          class: 'warning',
          label: 'Partial Success'
        };
      case 'error':
      case 'index_error':
      case 'FAILED':
        return {
          class: 'error',
          label: 'Processing Failed'
        };
      case 'NO_DOCUMENTS_TO_PROCESS':
        return {
          class: 'warning',
          label: 'No Content Found'
        };
      default:
        return {
          class: 'default',
          label: status || 'Unknown Status'
        };
    }
  }
  
  getDisplayIndexName(index) {
    // Show user-friendly name, stripping subtenant prefixes
    const name = index.user_index_name || index.index_name || 'Unnamed Index';
    return name.replace(/^[^-]+-+/, ''); // Strip subtenant prefix if present
  }
  
  formatGranularityForDisplay(granularity) {
    switch (granularity) {
      case 'corpus': return 'Entire Corpus';
      case 'domain': return 'Domain Level';  
      case 'unit': return 'Unit Level';
      case 'topic': return 'Topic Level';
      case 'custom': return 'Custom Filter';
      default: return granularity || 'Unknown';
    }
  }
  
  getEnhancedDocumentDisplay(index) {
    const count = index.document_count || 0;
    const formattedCount = count.toLocaleString();
    
    if (index.status === 'creating') {
      return `${formattedCount} available`;
    }
    if (index.status === 'PROCESSING' || index.status === 'vectorizing') {
      return `${formattedCount} processing...`;
    }
    if (count === 0) {
      return 'No documents found';
    }
    
    return `${formattedCount} indexed`;
  }
  
  getEnhancedChunkDisplay(index) {
    const count = index.chunk_count || 0;
    const formattedCount = count.toLocaleString();
    
    if (count === 0) {
      if (index.status === 'creating') {
        return 'Awaiting vectorization';
      }
      return 'No content chunks';
    }
    
    return `${formattedCount} searchable chunks`;
  }
  
  formatLastVectorizedDate(dateString) {
    if (!dateString) {
      return 'Never';
    }
    
    try {
      return formatHumanReadableDate(dateString);
    } catch (e) {
      console.warn('[VectorIndexManagementModal] Last vectorized date formatting error:', e);
      return dateString;
    }
  }
  
  checkRevectorizationNeeded(lastVectorizedDate) {
    if (!lastVectorizedDate) return false;
    
    try {
      const lastDate = new Date(lastVectorizedDate);
      const now = new Date();
      const diffTime = now - lastDate;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      // User approved 30-day threshold (changed from 7 days)
      return diffDays > 30;
    } catch (e) {
      return false;
    }
  }
  
  getSmartActionButton(index) {
    const status = index.status;
    const chunkCount = index.chunk_count || 0;
    const needsRevectorization = this.checkRevectorizationNeeded(index.last_vectorized_datetime);
    
    // Check permissions first
    if (!this.hasCorpusEditorPermission) {
      return `
        <button class="btn btn--small btn--disabled" disabled title="CORPUS_EDITOR permissions required">
          <i class="fas fa-lock"></i> Permissions Required
        </button>
      `;
    }
    
    // Re-vectorization as default (user approved)
    if (needsRevectorization || (status === 'active' && chunkCount > 0)) {
      return `
        <button class="btn btn--small btn--primary vectorize-btn" 
                data-index-name="${index.index_name}"
                title="Update search index with latest documents">
          <i class="fas fa-sync"></i> Refresh Search Index
        </button>
      `;
    }
    
    // Initial vectorization
    if (status === 'creating' || chunkCount === 0) {
      return `
        <button class="btn btn--small btn--primary vectorize-btn" 
                data-index-name="${index.index_name}"
                title="Process documents for search">
          <i class="fas fa-cogs"></i> Process Documents
        </button>
      `;
    }
    
    // Processing states
    if (['vectorizing', 'indexing', 'PROCESSING', 'DISCOVERING_DOCUMENTS'].includes(status)) {
      return `
        <button class="btn btn--small btn--disabled" disabled>
          <i class="fas fa-spinner fa-spin"></i> Processing...
        </button>
      `;
    }
    
    // Error states
    if (['error', 'index_error', 'FAILED'].includes(status)) {
      return `
        <button class="btn btn--small btn--warning vectorize-btn" 
                data-index-name="${index.index_name}"
                title="Retry document processing">
          <i class="fas fa-redo"></i> Retry Processing
        </button>
      `;
    }
    
    // Default fallback
    return `
      <button class="btn btn--small btn--primary vectorize-btn" 
              data-index-name="${index.index_name}">
        <i class="fas fa-cogs"></i> Process Documents
      </button>
    `;
  }
  
  /**
   * Setup tooltips for UI elements using the framework tooltip system
   */
  _setupTooltips() {
    if (!this.modalEl) return;
    
    // Find and attach tooltips to static UI elements
    const headerEl = this.modalEl.querySelector("h2");
    if (headerEl) {
      tooltip.attach(headerEl, "Manage semantic search indexes for this corpus section. Search indexes enable AI-powered document retrieval and question answering.");
    }
    
    // Find the document count field for tooltips
    const documentCountField = this.modalEl.querySelector("#documentCount");
    if (documentCountField) {
      tooltip.attach(documentCountField, "Shows the number of documents available in this corpus section that can be included in search indexes.");
    }
    
    // Document count label
    const documentCountLabel = this.modalEl.querySelector("label[for='documentCount']");
    if (documentCountLabel) {
      tooltip.attach(documentCountLabel, "Document count for the current corpus path. This number determines how many documents will be processed during vectorization.");
    }
    
    // Path display
    const pathDisplay = this.modalEl.querySelector("#pathDisplay");
    if (pathDisplay) {
      tooltip.attach(pathDisplay, "Current corpus path being managed. Search indexes created here will include documents from this path and its filters.");
    }
    
    // Corpus display  
    const corpusDisplay = this.modalEl.querySelector("#corpusDisplay");
    if (corpusDisplay) {
      tooltip.attach(corpusDisplay, "The corpus being managed. All search indexes will be created within this corpus.");
    }
    
    // Create index button
    const createIndexBtn = this.modalEl.querySelector("#createIndexBtn");
    if (createIndexBtn) {
      tooltip.attach(createIndexBtn, "Create a new search index for this corpus section. You can specify filters to include only certain document types or topics.");
    }
    
    // Permission warning area
    const permissionWarning = this.modalEl.querySelector(".permission-warning");
    if (permissionWarning) {
      tooltip.attach(permissionWarning, "You need CORPUS_EDITOR permission for this corpus to manage search indexes. Contact your administrator to request this permission.");
    }
    
    // Setup tooltips for dynamic elements (indexes) - this will be called after index list is rendered
    this._setupIndexTooltips();
  }
  
  /**
   * Setup tooltips for dynamically generated index elements
   */
  _setupIndexTooltips() {
    if (!this.modalEl) return;
    
    // Setup tooltips for each index card
    const indexCards = this.modalEl.querySelectorAll(".index-card");
    indexCards.forEach((card, cardIndex) => {
      const indexName = card.dataset.indexName;
      const index = this.indexes?.find(idx => idx.index_name === indexName);
      
      if (!index) return;
      
      // Status badge tooltips
      const statusBadge = card.querySelector(".status-badge--success, .status-badge--processing, .status-badge--warning, .status-badge--error, .status-badge--info");
      if (statusBadge) {
        const statusInfo = this.getEnhancedStatusInfo(index);
        tooltip.attach(statusBadge, this.getStatusTooltip(statusInfo, index));
      }
      
      // Refresh needed badge
      const refreshBadge = card.querySelector(".status-badge--warning");
      if (refreshBadge && this.checkRevectorizationNeeded(index.last_vectorized_datetime)) {
        const lastVectorized = this.formatLastVectorizedDate(index.last_vectorized_datetime);
        tooltip.attach(refreshBadge, `This index was last updated ${lastVectorized}. Consider refreshing to include recent document changes.`);
      }
      
      // Detail labels
      const scopeLabel = card.querySelector(".detail-row:nth-child(1) .detail-label");
      if (scopeLabel) {
        tooltip.attach(scopeLabel, "The organizational level of this search index");
      }
      
      const filterLabel = card.querySelector(".detail-row:nth-child(2) .detail-label");
      if (filterLabel) {
        tooltip.attach(filterLabel, "Document filtering criteria applied to this index");
      }
      
      const filterValue = card.querySelector(".detail-row:nth-child(2) .detail-value");
      if (filterValue) {
        tooltip.attach(filterValue, this.getFilterTooltip(index.filters));
      }
      
      const documentsLabel = card.querySelector(".detail-row:nth-child(3) .detail-label");
      if (documentsLabel) {
        tooltip.attach(documentsLabel, "Number of corpus documents included in this search index");
      }
      
      const documentsValue = card.querySelector(".detail-row:nth-child(3) .detail-value");
      if (documentsValue) {
        tooltip.attach(documentsValue, this.getDocumentCountTooltip(index));
      }
      
      const chunksLabel = card.querySelector(".detail-row:nth-child(4) .detail-label");
      if (chunksLabel) {
        tooltip.attach(chunksLabel, "Text chunks available for semantic search (documents are split into chunks for better search results)");
      }
      
      const chunksValue = card.querySelector(".detail-row:nth-child(4) .detail-value");
      if (chunksValue) {
        tooltip.attach(chunksValue, this.getChunkCountTooltip(index));
      }
      
      const lastUpdatedLabel = card.querySelector(".detail-row:nth-child(5) .detail-label");
      if (lastUpdatedLabel) {
        tooltip.attach(lastUpdatedLabel, "When this search index was last updated with document content");
      }
      
      const lastUpdatedValue = card.querySelector(".detail-row:nth-child(5) .detail-value");
      if (lastUpdatedValue) {
        const lastVectorized = this.formatLastVectorizedDate(index.last_vectorized_datetime);
        tooltip.attach(lastUpdatedValue, `Last vectorization: ${lastVectorized}`);
      }
    });
  }
  
  /**
   * Generate tooltip text for status badges
   */
  getStatusTooltip(statusInfo, index) {
    switch (statusInfo.class) {
      case 'success':
        return `Search index is active and ready. Contains ${index.chunk_count || 0} searchable chunks from ${index.document_count || 0} documents.`;
      case 'processing':
        return 'Search index is currently being created or updated. Please wait for processing to complete.';
      case 'warning':
        return `Search index needs attention. Last updated: ${this.formatLastVectorizedDate(index.last_vectorized_datetime)}`;
      case 'error':
        return 'Search index creation failed or encountered errors. Click "Retry Processing" to try again.';
      case 'info':
        return 'Search index has been created but may need document processing to become searchable.';
      default:
        return 'Search index status information';
    }
  }
  
  /**
   * Generate tooltip text for filter display
   */
  getFilterTooltip(filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return 'No filters applied - includes all documents in scope';
    }
    
    const filterParts = [];
    if (filters.domain) filterParts.push(`Domain: ${filters.domain}`);
    if (filters.unit) filterParts.push(`Unit: ${filters.unit}`);
    if (filters.document_topics && filters.document_topics.length) {
      filterParts.push(`Topics: ${filters.document_topics.join(', ')}`);
    }
    if (filters.document_types && filters.document_types.length) {
      filterParts.push(`Types: ${filters.document_types.join(', ')}`);
    }
    
    return filterParts.join(' | ') || 'Custom filtering applied';
  }
  
  /**
   * Generate tooltip text for document count
   */
  getDocumentCountTooltip(index) {
    const count = index.document_count || 0;
    if (count === 0) {
      return 'No documents currently indexed. Run processing to include documents.';
    } else if (count === 1) {
      return '1 document is included in this search index.';
    } else {
      return `${count} documents are included in this search index.`;
    }
  }
  
  /**
   * Generate tooltip text for chunk count
   */
  getChunkCountTooltip(index) {
    const count = index.chunk_count || 0;
    if (count === 0) {
      return 'No text chunks available for search. Documents need to be processed and vectorized.';
    } else if (count === 1) {
      return '1 text chunk available for semantic search.';
    } else {
      return `${count} text chunks available for semantic search. Documents are automatically split into optimal chunks.`;
    }
  }
}