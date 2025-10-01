// File: ui/modals/vector-search-preview-modal.js
import { semanticSearch } from '../../api/corpus-vectors.js';
import { ResponsiveTable } from '../components/responsive-table.js';
import { ErrorModal } from './error-modal.js';
import { MessageModal } from './message-modal.js';

/**
 * Modal for previewing and testing S3 vector search results
 * Provides interface to query vector indexes and preview ranked document chunks
 * 
 * Usage:
 *   const modal = new VectorSearchPreviewModal();
 *   modal.show({
 *     corpus_id: 'rfp',
 *     index_name: 'cognaire___corpus_rfp__unit_wfe_index',
 *     filters: { domain: 'wfe', unit: 'edm-only' }
 *   });
 */
export class VectorSearchPreviewModal {
  constructor() {
    this.modalEl = null;
    this.overlayEl = null;
    this.eventListeners = [];

    // Initialize child modals with higher z-index to appear above this modal
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    // Override z-index values for child modals to ensure they appear above this modal (11501)
    this._configureChildModalZIndex();

    // State
    this.corpus_id = null;
    this.index_name = null;
    this.filters = {};
    this.query = '';
    this.searchResults = [];
    this.selectedResult = null;
    this.loading = false;

    // UI components
    this.resultsTable = null;

    // Search configuration
    this.searchConfig = {
      top_k: 10,
      min_similarity: 0.0,
      debounceMs: 300
    };

    // Debounced search function
    this.debouncedSearch = this.debounce(() => {
      this.performSearch();
    }, this.searchConfig.debounceMs);
  }

  _configureChildModalZIndex() {
    // Configure z-index for child modals to appear above VectorSearchPreviewModal (11501)
    this.childModalZIndex = {
      overlay: "12000",
      modal: "12001"
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
    this.overlayEl.style.zIndex = "11500";
    this.overlayEl.style.display = "none";

    // Create modal
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--large";
    this.modalEl.style.zIndex = "11501";
    this.modalEl.style.display = "none";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close modal">&times;</button>
      <h2 id="vectorSearchTitle">Vector Search Test</h2>
      
      <div class="modal__content">
        <!-- Index Information -->
        <div class="section">
          <h3>Index Information</h3>
          <div class="metadata-display">
            <div class="metadata-row">
              <span class="metadata-label">Corpus:</span>
              <span id="displayCorpus" class="metadata-value"></span>
            </div>
            <div class="metadata-row">
              <span class="metadata-label">Index:</span>
              <span id="displayIndexName" class="metadata-value"></span>
            </div>
          </div>
        </div>
        
        <!-- Query Input Section -->
        <div class="section">
          <h3>Search Query</h3>
          <div class="form-group">
            <label for="queryInput">Enter your search query (20-30 words recommended):</label>
            <textarea 
              id="queryInput" 
              class="doc-input" 
              rows="3" 
              placeholder="e.g., How do we handle data security and encryption requirements?"
              maxlength="500"
            ></textarea>
            <small class="form-help">Enter natural language queries to test semantic similarity search</small>
          </div>
          <div class="button-group">
            <button id="searchBtn" class="btn btn--primary">
              <i class="fas fa-search"></i> Search
            </button>
            <button id="clearBtn" class="btn btn--secondary">
              <i class="fas fa-times"></i> Clear
            </button>
          </div>
        </div>
        
        <!-- Search Results Section -->
        <div class="section">
          <h3 id="resultsHeader">Search Results</h3>
          <div id="resultsContainer" class="results-container">
            <div id="noResultsMessage" class="empty-state" style="display: none;">
              <p>No results found. Try a different query or check if the index has been vectorized.</p>
            </div>
            <div id="resultsTableContainer"></div>
          </div>
        </div>
        
        <!-- Selected Chunk Content Section -->
        <div class="section" id="selectedChunkSection" style="display: none;">
          <h3>Selected Chunk Content</h3>
          <div class="selected-chunk-info">
            <div class="chunk-metadata">
              <span class="metadata-label">Document:</span>
              <span id="selectedDocumentKey" class="metadata-value"></span>
            </div>
            <div class="chunk-metadata">
              <span class="metadata-label">Similarity Score:</span>
              <span id="selectedSimilarityScore" class="metadata-value" style="width:60px;"></span>
            </div>
          </div>
          <div id="selectedChunkContent" class="chunk-content-display">
            <!-- Selected chunk full content will be displayed here -->
          </div>
        </div>
        
        <!-- Loading Overlay -->
        <div id="modalLoadingOverlay" class="loading-overlay" style="display: none;">
          <div class="loading-spinner"></div>
          <p>Searching...</p>
        </div>
      </div>
      
      <div class="modal__footer">
        <button id="closeModal" class="btn btn--secondary">Close</button>
      </div>
    `;

    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.modalEl);

    this._attachEventListeners();
    this._initializeResultsTable();
  }

  _attachEventListeners() {
    const closeBtn = this.modalEl.querySelector(".modal__close");
    const closeBtnFooter = this.modalEl.querySelector("#closeModal");
    const searchBtn = this.modalEl.querySelector("#searchBtn");
    const clearBtn = this.modalEl.querySelector("#clearBtn");
    const queryInput = this.modalEl.querySelector("#queryInput");

    // Close handlers
    this.addListener(closeBtn, 'click', () => this.hide());
    this.addListener(closeBtnFooter, 'click', () => this.hide());
    this.addListener(this.overlayEl, 'click', () => this.hide());

    // Search handlers
    this.addListener(searchBtn, 'click', () => this.handleSearch());
    this.addListener(clearBtn, 'click', () => this.handleClear());

    // Query input handlers
    this.addListener(queryInput, 'input', (e) => {
      this.query = e.target.value;
      // Enable/disable search button based on query length
      const hasQuery = this.query.trim().length > 0;
      searchBtn.disabled = !hasQuery || this.loading;
    });

    // Enter key to search
    this.addListener(queryInput, 'keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey && this.query.trim()) {
        e.preventDefault();
        this.handleSearch();
      }
    });

    // Keyboard handler for modal
    this.addListener(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });
  }

  _initializeResultsTable() {
    const tableContainer = this.modalEl.querySelector('#resultsTableContainer');

    this.resultsTable = new ResponsiveTable({
      selectable: true,
      sortable: false, // Results are already sorted by similarity
      emptyMessage: 'No search results',
      className: 'responsive-table search-results-table',
      onRowClick: (data, index) => this.handleResultSelection(data, index)
    });

    // Define columns for search results
    const columns = [
      {
        key: 'similarity_score',
        label: 'Similarity',
        primary: true,
        type: 'number',
        render: (value) => {
          const percentage = (value * 100).toFixed(1);
          return `<span class="similarity-score">${percentage}%</span>`;
        }
      },
      {
        key: 'document_key',
        label: 'Document',
        secondary: false,
        className: 'document-key-field'
      },
      {
        key: 'source_text',
        label: 'Preview',
        secondary: true,
        className: 'chunk-preview-field',
        render: (value) => {
          if (!value) return '';
          const preview = value.length > 120 ? value.substring(0, 120) + '...' : value;
          return `<span class="chunk-preview" title="${this.escapeHtml(value)}">${this.escapeHtml(preview)}</span>`;
        }
      }
    ];

    this.resultsTable.setColumns(columns);
    this.resultsTable.attachToDOM(tableContainer);
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

  async show({ corpus_id, index_name, filters = {} }) {
    this.corpus_id = corpus_id;
    this.index_name = index_name;
    this.filters = filters || {};

    // Create modal if needed
    if (!this.modalEl) {
      this._buildDOM();
    }

    // Update display information
    this.updateIndexDisplay();

    // Reset state
    this.query = '';
    this.searchResults = [];
    this.selectedResult = null;

    // Reset UI
    this.modalEl.querySelector('#queryInput').value = '';
    this.modalEl.querySelector('#searchBtn').disabled = true;
    this.modalEl.querySelector('#selectedChunkSection').style.display = 'none';

    // Clear results table
    if (this.resultsTable) {
      this.resultsTable.setData([]);
    }

    // Show modal
    this.overlayEl.style.display = "block";
    this.modalEl.style.display = "block";

    // Focus on query input
    setTimeout(() => {
      this.modalEl.querySelector('#queryInput').focus();
    }, 100);
  }

  hide() {
    if (this.overlayEl) this.overlayEl.style.display = "none";
    if (this.modalEl) this.modalEl.style.display = "none";
  }

  isVisible() {
    return this.modalEl && this.modalEl.style.display !== "none";
  }

  updateIndexDisplay() {
    const corpusEl = this.modalEl.querySelector('#displayCorpus');
    const indexNameEl = this.modalEl.querySelector('#displayIndexName');

    if (corpusEl) corpusEl.textContent = this.corpus_id || 'Unknown';
    if (indexNameEl) {
      // Display a shortened version of the index name for better readability
      const shortName = this.index_name ? this.index_name.replace(/^[^_]+___/, '') : 'Unknown';
      indexNameEl.textContent = shortName;
      indexNameEl.title = this.index_name; // Full name in tooltip
    }
  }

  async handleSearch() {
    if (!this.query.trim()) {
      this._ensureChildModalZIndex(this.messageModal);
      this.messageModal.show({
        title: "Input Required",
        message: "Please enter a search query to test the vector search functionality."
      });
      return;
    }

    // Perform search immediately (no debounce for manual button click)
    await this.performSearch();
  }

  handleClear() {
    this.query = '';
    this.searchResults = [];
    this.selectedResult = null;

    // Reset UI
    this.modalEl.querySelector('#queryInput').value = '';
    this.modalEl.querySelector('#searchBtn').disabled = true;
    this.modalEl.querySelector('#selectedChunkSection').style.display = 'none';

    // Clear results
    if (this.resultsTable) {
      this.resultsTable.setData([]);
    }

    // Update results header
    this.modalEl.querySelector('#resultsHeader').textContent = 'Search Results';
  }

  async performSearch() {
    if (!this.query.trim() || !this.corpus_id || !this.index_name) {
      return;
    }

    try {
      this.setLoading(true);

      console.log('[VectorSearchPreviewModal] Performing search:', {
        query: this.query,
        corpus_id: this.corpus_id,
        index_name: this.index_name,
        filters: this.filters
      });

      const response = await semanticSearch({
        query: this.query.trim(),
        corpus_id: this.corpus_id,
        filters: this.filters,
        top_k: this.searchConfig.top_k,
        min_similarity: this.searchConfig.min_similarity,
        index_name: this.index_name
      });

      console.log('[VectorSearchPreviewModal] Search response:', response);

      this.searchResults = response.results || [];
      this.displaySearchResults();

    } catch (error) {
      console.error('[VectorSearchPreviewModal] Search error:', error);
      this._ensureChildModalZIndex(this.errorModal);
      this.errorModal.show({
        title: "Search Error",
        message: error.message || "Failed to perform vector search. Please try again.",
        details: error.stack
      });
    } finally {
      this.setLoading(false);
    }
  }

  displaySearchResults() {
    const resultsHeader = this.modalEl.querySelector('#resultsHeader');
    const noResultsMessage = this.modalEl.querySelector('#noResultsMessage');

    if (this.searchResults.length === 0) {
      resultsHeader.textContent = 'Search Results - No matches found';
      noResultsMessage.style.display = 'block';
      if (this.resultsTable) {
        this.resultsTable.setData([]);
      }
    } else {
      resultsHeader.textContent = `Search Results - ${this.searchResults.length} matches found`;
      noResultsMessage.style.display = 'none';

      // Update results table
      if (this.resultsTable) {
        this.resultsTable.setData(this.searchResults);
      }
    }

    // Hide selected chunk section when new results are displayed
    this.modalEl.querySelector('#selectedChunkSection').style.display = 'none';
    this.selectedResult = null;
  }

  handleResultSelection(result, index) {
    console.log('[VectorSearchPreviewModal] Result selected:', result);

    this.selectedResult = result;
    this.displaySelectedChunk(result);
  }

  displaySelectedChunk(result) {
    const section = this.modalEl.querySelector('#selectedChunkSection');
    const documentKeyEl = this.modalEl.querySelector('#selectedDocumentKey');
    const similarityScoreEl = this.modalEl.querySelector('#selectedSimilarityScore');
    const contentEl = this.modalEl.querySelector('#selectedChunkContent');

    // Update metadata
    documentKeyEl.textContent = result.document_key || 'Unknown';
    const percentage = (result.similarity_score * 100).toFixed(1);
    similarityScoreEl.textContent = `${percentage}%`;

    // Display full content
    contentEl.innerHTML = `
      <div class="chunk-content">
        <p>${this.escapeHtml(result.source_text || 'No content available')}</p>
      </div>
      ${result.metadata ? this.renderMetadata(result.metadata) : ''}
    `;

    // Show the section
    section.style.display = 'block';

    // Scroll to the selected chunk section
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return '';
    }

    const metadataItems = Object.entries(metadata)
      .filter(([key, value]) => value != null && value !== '')
      .map(([key, value]) => `
        <div class="metadata-item">
          <span class="metadata-key">${this.escapeHtml(key)}:</span>
          <span class="metadata-value">${this.escapeHtml(String(value))}</span>
        </div>
      `).join('');

    return metadataItems ? `
      <div class="chunk-metadata-section">
        <h4>Metadata</h4>
        <div class="metadata-grid">
          ${metadataItems}
        </div>
      </div>
    ` : '';
  }

  setLoading(loading) {
    this.loading = loading;
    const overlay = this.modalEl?.querySelector('#modalLoadingOverlay');
    const searchBtn = this.modalEl?.querySelector('#searchBtn');
    const queryInput = this.modalEl?.querySelector('#queryInput');

    if (overlay) {
      overlay.style.display = loading ? 'flex' : 'none';
    }

    if (searchBtn) {
      searchBtn.disabled = loading || !this.query.trim();
      searchBtn.innerHTML = loading ?
        '<i class="fas fa-spinner fa-spin"></i> Searching...' :
        '<i class="fas fa-search"></i> Search';
    }

    if (queryInput) {
      queryInput.disabled = loading;
    }
  }

  /**
   * Debounce utility function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    this.removeAllListeners();

    if (this.resultsTable) {
      this.resultsTable.destroy();
    }

    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }

    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }

    this.modalEl = null;
    this.overlayEl = null;
  }
}