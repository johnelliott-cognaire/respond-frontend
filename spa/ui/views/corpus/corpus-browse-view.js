// ui/views/corpus/corpus-browse-view.js
import { CorpusViewBase } from './corpus-view-base.js';
import { getFreshSecurity } from '../../../utils/security-utils.js';
import { ErrorModal } from '../../modals/error-modal.js';
import { YesNoModal } from '../../modals/yesno-modal.js';
import { MessageModal } from '../../modals/message-modal.js';
import { TextPromptModal } from '../../modals/text-prompt-modal.js';
import { createCorpus } from '../../../api/corpus.js';
import {
  listCorpusDocuments,
  getCorpusDocumentDetails,
  submitCorpusDocumentForApproval,
  deleteCorpusDocument,
  saveCorpusDocumentDraft,
  createCorpusFolder,
  deleteCorpusFolder 
} from '../../../api/corpus.js';
import { getSubtenantAttributes } from '../../../api/subtenants.js';
// Removed listVectorIndexes import - now using in-memory corpus_config data instead

// Import utility functions
import {
  getCorpus,
  getCorpusNavigator,
  getEntityDetails,
  formatDate,
  prettifyInputName
} from '../../../utils/corpus-utils.js';
import { clearAllCachesFor } from '../../../utils/cache-utils.js';

// Import components
import { CorpusDocumentList } from '../../components/corpus-document-list.js';
import { CorpusFilters } from '../../components/corpus-filters.js';
import { CorpusDocumentDetail } from '../../components/corpus-document-detail.js';
import { CorpusBreadcrumb } from '../../components/corpus-breadcrumb.js';
import { ContentEditorModal } from '../../modals/content-editor-modal.js';
import { CorpusDocumentHistoryModal } from '../../modals/corpus-document-history-modal.js';
import { OptionsModal } from '../../modals/options-modal.js';
import { VectorIndexManagementModal } from '../../modals/vector-index-management-modal.js';

export class CorpusBrowseView extends CorpusViewBase {
  constructor(store, jobController) {
    super(store, jobController);

    this._loadingCounter = 0;

    // Initialize modals
    this.errorModal = new ErrorModal();
    this.confirmModal = new YesNoModal();
    this.messageModal = new MessageModal();
    this.textPromptModal = new TextPromptModal();
    this.contentEditorModal = new ContentEditorModal();
    this.vectorIndexModal = new VectorIndexManagementModal(store);

    this.hasActiveDocuments = false;

    // State
    this.loading = false;
    this.corpusConfig = null;
    this.viewMode = 'corpora'; // 'corpora' or 'corpus-contents'
    this.selectedCorpus = null;
    this.selectedPath = '';
    this.selectedDocument = null;
    this.breadcrumbPath = [];
    this.currentFolder = null;
    this.documents = [];
    this.folders = [];
    this.filters = {
      topic: '',
      type: '',
      status: '',
      myDrafts: false
    };
    this.sortField = 'name';
    this.sortDirection = 'asc';

    // Component instances
    this.documentList = null;
    this.filtersComponent = null;
    this.documentDetail = null;
    this.breadcrumbComponent = null;

    // UI references
    this.documentListContainer = null;
    this.filtersContainer = null;
    this.documentDetailContainer = null;
    this.breadcrumbContainer = null;
  }


  /**
   * Load contents of a specific folder (internal method)
   * @param {string} folderPath - The folder path to load
   * @param {string} corpus - The corpus ID (optional)
   */
  async loadFolderContents(folderPath, corpus = null) {
    console.log('[CorpusBrowseView] Loading folder contents for:', folderPath);
    
    try {
      this.setLoading(true);
      
      // Update breadcrumb path
      this.updateBreadcrumbPath(folderPath);
      
      // Load folder contents via API (this would need to be implemented)
      // await this.refreshDocumentsList();
      
    } catch (error) {
      console.error('[CorpusBrowseView] Failed to load folder contents:', error);
      this.errorModal.show({
        title: 'Error Loading Folder',
        message: 'Failed to load folder contents: ' + error.message
      });
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Update breadcrumb path based on current folder path
   * @param {string} folderPath - The current folder path
   */
  updateBreadcrumbPath(folderPath) {
    if (!folderPath) {
      this.breadcrumbPath = [];
      return;
    }
    
    const pathParts = folderPath.split('/').filter(part => part.trim());
    this.breadcrumbPath = pathParts.map((part, index) => ({
      name: part,
      path: pathParts.slice(0, index + 1).join('/'),
      isLast: index === pathParts.length - 1
    }));
    
    console.log('[CorpusBrowseView] Updated breadcrumb path:', this.breadcrumbPath);
  }

  /**
   * IMPORTANT: This method is now intentionally empty
   * The header is managed entirely by corpus-manager.js
   */
  renderHeader() {
    // No header content here - handled by corpus-manager.js
    return '';
  }

  /**
   * Main render method - creates either corpora or corpus contents view
   */
  renderContent() {
    return this.viewMode === 'corpora'
      ? this.renderCorporaView()
      : this.renderCorpusContentsView();
  }

  /**
   * Renders the corpora selection view (top level)
   */
  renderCorporaView() {
    return `
      <div class="corpus-browse-container">
        <div class="corpus-file-browser" id="corpora-list-container">
          <!-- Corpora list will be rendered here -->
        </div>
        
        <div class="corpus-detail-panel" id="corpus-details">
          ${this.selectedCorpus ? '' : `
            <p class="placeholder-text">Select a corpus to view details</p>
          `}
        </div>
      </div>
    `;
  }

  /**
   * Renders the folder/document browser view (inside a corpus)
   */
  renderCorpusContentsView() {
    return `
      <div>
        <!-- Breadcrumb Navigation -->
        <div id="breadcrumb-container">
          <!-- Breadcrumb will be rendered here -->
        </div>
        
        <!-- Filter Bar -->
        <div id="filters-container">
          <!-- Filters will be rendered here -->
        </div>
        
        <!-- Main Content with Two Panes -->
        <div class="corpus-browse-container">
          <div class="corpus-file-browser">
            <div id="document-list-container">
              <!-- Document list will be rendered here -->
            </div>
          </div>
          
          <div class="corpus-detail-panel" id="document-detail-container">
            <!-- Document details will be rendered here -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Handles Import Content button click (called from corpus-manager.js)
   */
  handleImportClick() {
    // Dispatch event for CorpusManager to handle
    this.containerEl.dispatchEvent(new CustomEvent('corpus:open-import-modal', {
      bubbles: true,
      detail: {
        corpus: this.selectedCorpus,
        path: this.selectedPath,
        onImport: () => this.loadDocuments()
      }
    }));
  }

  /**
   * Handles New Corpus button click
   */
  handleNewCorpusClick() {
    console.log("New Corpus button clicked");

    this.textPromptModal.show({
      title: "Create New Corpus",
      message: "Enter a name for the new corpus (lowercase letters, numbers, and hyphens only).",
      fieldLabel: "Corpus name:",
      defaultValue: "",
      onOk: async (name) => {
        try {
          // Validate input
          const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
          if (!namePattern.test(name)) {
            this.errorModal.show({
              title: "Validation Error",
              message: "Corpus name must contain only lowercase letters, numbers, and hyphens. It cannot start or end with a hyphen."
            });
            return;
          }

          // Show loading state
          this.setLoading(true);

          // Call API to create corpus
          await createCorpusFolder({
            entityType: 'corpus',
            name: name,
            corpusPath: '' // No parent path for a corpus
          });

          // Clear all related caches
          clearAllCachesFor('corpus_config');
          
          // Also clear local instance cache
          this.corpusConfig = null;

          // Success message
          this.messageModal.show({
            title: "Success",
            message: `Corpus "${name}" has been created successfully.`
          });

          // Reload corpus config to get updated data
          await this.loadCorpusConfig();

          // Refresh the view
          this.render();
          this.initializeCorporaView();

        } catch (error) {
          console.error('[CorpusBrowseView] Error creating corpus:', error);
          this.errorModal.show({
            title: "Error Creating Corpus",
            message: error.message || "Failed to create corpus"
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
  }

  /**
   * Handles adding a new domain to a corpus
   */
  handleAddDomain(corpusId) {
    console.log(`Adding domain to corpus: ${corpusId}`);

    this.textPromptModal.show({
      title: "Create New Domain",
      message: "Enter a name for the new domain (lowercase letters, numbers, and hyphens only).",
      fieldLabel: "Domain name:",
      defaultValue: "",
      onOk: async (name) => {
        try {
          // Validate input
          const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
          if (!namePattern.test(name)) {
            this.errorModal.show({
              title: "Validation Error",
              message: "Domain name must contain only lowercase letters, numbers, and hyphens. It cannot start or end with a hyphen."
            });
            return;
          }

          this.setLoading(true);

          // Call API to create domain
          await createCorpusFolder({
            entityType: 'domain',
            corpusPath: corpusId, // Corpus ID as the parent path 
            name: name
          });

          // Clear all related caches
          clearAllCachesFor('corpus_config');
          
          // Also clear local instance cache
          this.corpusConfig = null;

          this.messageModal.show({
            title: "Success",
            message: `Domain "${name}" has been created successfully.`
          });

          // Reload corpus config to get updated data
          await this.loadCorpusConfig();

          // Refresh the current view
          await this.loadFolders();

        } catch (error) {
          console.error('[CorpusBrowseView] Error creating domain:', error);
          this.errorModal.show({
            title: "Error Creating Domain",
            message: error.message || "Failed to create domain"
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
  }

  /**
   * Handles deleting a corpus
   */
  handleDeleteCorpus(corpusId) {
    this.confirmModal.show({
      title: "Delete Corpus",
      message: `Are you sure you want to delete the corpus "${corpusId}"? This action cannot be undone.`,
      onYes: async () => {
        try {
          this.setLoading(true);

          // Call API to delete corpus
          await deleteCorpusFolder({
            entityType: 'corpus',
            corpusPath: corpusId
          });

          // Clear all related caches
          clearAllCachesFor('corpus_config');
          
          // Also clear local instance cache
          this.corpusConfig = null;

          this.messageModal.show({
            title: "Success",
            message: `Corpus "${corpusId}" has been deleted successfully.`
          });

          // Go back to corpora view
          this.backToCorpora();

          // Reload corpus config to get updated data
          await this.loadCorpusConfig();

          // Refresh the view
          this.render();
          this.initializeCorporaView();

        } catch (error) {
          console.error('[CorpusBrowseView] Error deleting corpus:', error);
          this.errorModal.show({
            title: "Error Deleting Corpus",
            message: error.message || "Failed to delete corpus"
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
  }

  /**
   * Handles adding a new unit to a domain
   */
  handleAddUnit(corpusId, domainId) {
    console.log(`Adding unit to domain: ${domainId} in corpus: ${corpusId}`);

    this.textPromptModal.show({
      title: "Create New Unit",
      message: "Enter a name for the new unit (lowercase letters, numbers, and hyphens only).",
      fieldLabel: "Unit name:",
      defaultValue: "",
      onOk: async (name) => {
        try {
          // Validate input
          const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
          if (!namePattern.test(name)) {
            this.errorModal.show({
              title: "Validation Error",
              message: "Unit name must contain only lowercase letters, numbers, and hyphens. It cannot start or end with a hyphen."
            });
            return;
          }

          this.setLoading(true);

          // Call API to create unit - convert path format to API format with ->
          const apiPath = `${corpusId}->${domainId}`;
          await createCorpusFolder({
            entityType: 'unit',
            corpusPath: apiPath,
            name: name
          });

          // Clear all related caches
          clearAllCachesFor('corpus_config');
          
          // Also clear local instance cache
          this.corpusConfig = null;

          this.messageModal.show({
            title: "Success",
            message: `Unit "${name}" has been created successfully.`
          });

          // Reload corpus config and refresh view
          await this.loadCorpusConfig();
          await this.loadFolders();

        } catch (error) {
          console.error('[CorpusBrowseView] Error creating unit:', error);
          this.errorModal.show({
            title: "Error Creating Unit",
            message: error.message || "Failed to create unit"
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
  }

  /**
   * Handles deleting a domain
   */
  handleDeleteDomain(corpusId, domainId) {
    console.log(`Deleting domain: ${domainId} from corpus: ${corpusId}`);

    this.confirmModal.show({
      title: "Delete Domain",
      message: `Are you sure you want to delete the domain "${domainId}"? This action cannot be undone.`,
      onYes: async () => {
        try {
          this.setLoading(true);

          // Convert path format from UI to API
          const apiPath = `${corpusId}->${domainId}`;
          await deleteCorpusFolder({
            entityType: 'domain',
            corpusPath: apiPath
          });

          // Clear all related caches
          clearAllCachesFor('corpus_config');
          
          // Also clear local instance cache
          this.corpusConfig = null;

          this.messageModal.show({
            title: "Success",
            message: `Domain "${domainId}" has been deleted successfully.`
          });

          // Update the current path to the parent corpus before reloading config
          // This prevents trying to load the deleted domain path
          this.selectedPath = corpusId;
          
          // Reload corpus config and go back to corpus level
          await this.loadCorpusConfig();
          
          // Navigate back to parent level (corpus) after successful deletion
          // Wait a bit for the config to fully update
          setTimeout(() => {
            try {
              this.navigateToBreadcrumb(corpusId);
            } catch (navError) {
              console.warn('[CorpusBrowseView] Navigation failed after domain deletion, falling back to corpora view:', navError);
              // Fallback: navigate to the corpora list view
              this.selectedPath = '';
              this.selectedCorpus = '';
              this.viewMode = 'corpora';
              this.render();
            }
          }, 100);

        } catch (error) {
          console.error('[CorpusBrowseView] Error deleting domain:', error);
          this.errorModal.show({
            title: "Error Deleting Domain",
            message: error.message || "Failed to delete domain"
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
  }

  /**
   * Handles deleting a unit
   */
  handleDeleteUnit(corpusId, domainId, unitId) {
    console.log(`Deleting unit: ${unitId} from domain: ${domainId} in corpus: ${corpusId}`);

    this.confirmModal.show({
      title: "Delete Unit",
      message: `Are you sure you want to delete the unit "${unitId}"? This action cannot be undone.`,
      onYes: async () => {
        try {
          this.setLoading(true);

          // Convert path format from UI to API
          const apiPath = `${corpusId}->${domainId}->${unitId}`;
          await deleteCorpusFolder({
            entityType: 'unit',
            corpusPath: apiPath
          });

          // Clear all related caches
          clearAllCachesFor('corpus_config');
          
          // Also clear local instance cache
          this.corpusConfig = null;

          this.messageModal.show({
            title: "Success",
            message: `Unit "${unitId}" has been deleted successfully.`
          });

          // Update the current path to the parent domain before reloading config
          // This prevents trying to load the deleted unit path
          const domainPath = `${corpusId}/${domainId}`;
          console.log(`[CorpusBrowseView] BEFORE setting selectedPath: ${this.selectedPath}`);
          this.selectedPath = domainPath;
          console.log(`[CorpusBrowseView] AFTER setting selectedPath: ${this.selectedPath}`);
          
          // Reload corpus config and navigate back to domain level
          await this.loadCorpusConfig();
          
          // Navigate back to parent level (domain) after successful deletion
          // Wait a bit for the config to fully update
          setTimeout(() => {
            try {
              const domainPath = `${corpusId}/${domainId}`;
              this.navigateToBreadcrumb(domainPath);
            } catch (navError) {
              console.warn('[CorpusBrowseView] Navigation failed after unit deletion, falling back to corpus view:', navError);
              // Fallback: navigate to the corpus level
              try {
                this.navigateToBreadcrumb(corpusId);
              } catch (fallbackError) {
                console.warn('[CorpusBrowseView] Corpus navigation also failed, falling back to corpora view:', fallbackError);
                // Ultimate fallback: navigate to the corpora list view
                this.selectedPath = '';
                this.selectedCorpus = '';
                this.viewMode = 'corpora';
                this.render();
              }
            }
          }, 100);

        } catch (error) {
          console.error('[CorpusBrowseView] Error deleting unit:', error);
          this.errorModal.show({
            title: "Error Deleting Unit",
            message: error.message || "Failed to delete unit"
          });
        } finally {
          this.setLoading(false);
        }
      }
    });
  }

/**
 * Checks if there are active documents for the current path
 * This method should be called when navigating to update the hasActiveDocuments flag
 */
async checkActiveDocuments() {
  try {
    // Only perform check at unit level (path with 3 segments)
    if (this.selectedPath.split('/').length === 3) {
      this.setLoading(true);
      
      // Call API to check for active documents
      const response = await listCorpusDocuments({
        folderPath: this.selectedPath,
        filters: {
          // Filter to exclude DRAFT and DELETED status
          status: ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL', 'PENDING_AI', 'PENDING_HUMAN']
        }
      });
        
      this.hasActiveDocuments = response.documents && response.documents.length > 0;
      console.log(`Unit has ${response.documents ? response.documents.length : 0} active documents`);
    } else {
      // Reset flag for non-unit levels
      this.hasActiveDocuments = false;
    }

    // Notify CorpusManager to update action buttons based on new state
    this.containerEl.dispatchEvent(new CustomEvent('corpus:view-mode-changed', {
      bubbles: true,
      detail: {
        viewMode: this.viewMode,
        corpus: this.selectedCorpus
      }
    }));

  } catch (error) {
    console.error('[CorpusBrowseView] Error checking for active documents:', error);
    // Default to true as a safety measure if check fails
    this.hasActiveDocuments = true;
  } finally {
    this.setLoading(false);
  }
}

  /**
   * Builds UI components after rendering
   */
  attachEventListeners() {
    if (this.viewMode === 'corpora') {
      this.initializeCorporaView();
    } else {
      this.initializeCorpusContentsView();
    }
  }

  /**
   * Initializes components for corpora view
   */
  initializeCorporaView() {
    const corporaListContainer = this.containerEl?.querySelector('#corpora-list-container');
    const detailsContainer = this.containerEl?.querySelector('#corpus-details');

    if (!corporaListContainer) return;

    // Initialize corpora list
    this.documentList = new CorpusDocumentList({
      container: corporaListContainer,
      onFolderClick: (corpusId) => {
        this.selectCorpus(corpusId);
      },
      onFolderDoubleClick: (corpusId) => {
        this.browseCorpus(corpusId);
      },
      sortField: this.sortField,
      sortDirection: this.sortDirection,
      onSortChange: (field, direction) => {
        this.sortField = field;
        this.sortDirection = direction;
        this.renderCorporaList();
      }
    });

    // Render corpora list
    this.renderCorporaList();

    // Render corpus details if one is selected
    if (this.selectedCorpus && detailsContainer) {
      detailsContainer.innerHTML = this.renderEntityDetails(this.selectedCorpus);

      // Attach event listeners to details
      const browseButton = detailsContainer.querySelector('#browse-corpus');
      if (browseButton) {
        this.addListener(browseButton, 'click', () => {
          this.browseCorpus(browseButton.dataset.corpus);
        });
      }
      
      // Attach vector index management listener
      this.attachVectorIndexListener(detailsContainer);
      
      // Load search index summary for the selected corpus
      this.loadSearchIndexSummary(this.selectedCorpus);
    }
  }

  /**
   * Initializes components for corpus contents view
   */
  initializeCorpusContentsView() {
    this.documentListContainer = this.containerEl?.querySelector('#document-list-container');
    this.filtersContainer = this.containerEl?.querySelector('#filters-container');
    this.documentDetailContainer = this.containerEl?.querySelector('#document-detail-container');
    this.breadcrumbContainer = this.containerEl?.querySelector('#breadcrumb-container');

    if (!this.documentListContainer || !this.filtersContainer ||
      !this.documentDetailContainer || !this.breadcrumbContainer) {
      console.error('Missing container elements');
      return;
    }

    // Initialize breadcrumb
    this.breadcrumbComponent = new CorpusBreadcrumb({
      container: this.breadcrumbContainer,
      breadcrumb: this.breadcrumbPath,
      onHomeClick: () => {
        this.backToCorpora();
      },
      onBreadcrumbClick: (path) => {
        this.navigateToBreadcrumb(path);
      }
    });
    this.breadcrumbComponent.render();

    // Initialize filters
    const corpus = getCorpus(this.corpusConfig, this.selectedCorpus);
    this.filtersComponent = new CorpusFilters({
      container: this.filtersContainer,
      corpus: corpus,
      filters: this.filters,
      onFilterChange: (filters) => {
        this.filters = filters;
        this.loadDocuments();
      },
      onResetFilters: () => {
        this.resetFilters();
      },
      onRefresh: () => {
        console.log("Refresh requested - forcing cache reload");
        this.loadDocuments(true); // Pass true to force refresh
      }
    });
    this.filtersComponent.render();

    // Initialize document list
    this.documentList = new CorpusDocumentList({
      container: this.documentListContainer,
      onFolderClick: (path, type) => {
        this.selectFolder(path, type);
      },
      onFolderDoubleClick: (path, type) => {
        this.navigateToFolder(path, type);
      },
      onDocumentClick: (documentKey) => {
        this.selectDocument(documentKey);
      },
      sortField: this.sortField,
      sortDirection: this.sortDirection,
      onSortChange: (field, direction) => {
        this.sortField = field;
        this.sortDirection = direction;
        this.sortDocuments();
        this.renderContentsBrowser();
      }
    });

    // Initialize document detail
    this.documentDetail = new CorpusDocumentDetail({
      container: this.documentDetailContainer,
      viewMode: 'browse-view',
      onActionClick: (action, documentKey) => {
        this.handleDocumentAction(action, documentKey);
      }
    });

    // Refresh button event listener
    const refreshButton = this.containerEl?.querySelector('#refresh-documents');
    if (refreshButton) {
      this.addListener(refreshButton, 'click', () => {
        this.loadDocuments();
      });
    }

    // Load data
    this.loadFolders();
  }

  /**
   * Renders the corpora list
   */
  renderCorporaList() {
    if (!this.documentList) return;

    console.log('Rendering corpora with config:', this.corpusConfig);

    if (!this.corpusConfig) {
      this.loading = true;
      return;
    }

    const corpora = this.corpusConfig.corpora || {};
    console.log('Corpora available:', Object.keys(corpora));

    // Convert corpora to "folders" for the document list
    const corporaFolders = Object.entries(corpora).map(([id, config]) => ({
      name: prettifyInputName(id),
      path: id,
      type: 'folder',
      folderType: 'corpus'
    }));

    this.documentList.setData(corporaFolders, [], this.selectedCorpus, null);
  }

  /**
   * Renders entity details based on entity type
   */
  renderEntityDetails(path) {
    if (!path || !this.corpusConfig) return '<p>No details available</p>';

    // For corpus-level entities, the path is just the corpus ID
    const entityDetails = getEntityDetails(this.corpusConfig, path);
    if (!entityDetails) return '<p>Entity details not available</p>';

    switch (entityDetails.type) {
      case 'corpus':
        return this.renderCorpusDetails(entityDetails);
      case 'domain':
        return this.renderDomainDetails(entityDetails);
      case 'unit':
        return this.renderUnitDetails(entityDetails);
      default:
        return '<p>Unknown entity type</p>';
    }
  }

  /**
   * Determines if search index summary should be shown (only at corpus root level)
   */
  shouldShowSearchIndexSummary() {
    return this.selectedCorpus && !this.selectedPath;
  }

  /**
   * Renders corpus details panel
   */
  renderCorpusDetails(details) {
    if (!details) return '<p>Corpus details not available</p>';

    return `
      <div class="corpus-info">
        <h3><i class="fas fa-database"></i> Corpus: ${details.name}</h3>
        
        <table class="metadata-table">
          <tbody>
            <tr>
              <th>Name:</th>
              <td>${details.name}</td>
            </tr>
            <tr>
              <th>Domains:</th>
              <td>${details.domains}</td>
            </tr>
            <tr>
              <th>Document Topics:</th>
              <td>${details.topics}</td>
            </tr>
            <tr>
              <th>Document Types:</th>
              <td>${details.types}</td>
            </tr>
            ${details.source ? `
              <tr>
                <th>Source Location:</th>
                <td>${details.source}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        
        <!-- Search Index Summary Section - Only show at corpus root level -->
        ${this.shouldShowSearchIndexSummary() ? `
        <div class="search-index-summary">
          <h4><i class="fas fa-search"></i> Search Index Summary</h4>
          <div id="searchIndexSummary-${this.selectedCorpus || 'corpus'}" class="search-index-content">
            <div class="search-index-loading">
              <span class="spinner"></span>
              <span>Loading search index information...</span>
            </div>
          </div>
        </div>
        ` : ''}
        
        <div class="entity-actions">
          <button id="manageVectorIndexes" class="btn btn--secondary" data-corpus="${this.selectedCorpus || 'unknown'}" data-path="${this.selectedPath || this.selectedCorpus || 'unknown'}">
            <i class="fas fa-vector-square"></i> Manage Vector Indexes
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Loads and displays search index summary for a corpus
   * @param {string} corpusId - The corpus ID
   */
  async loadSearchIndexSummary(corpusId) {
    const summaryContainer = this.containerEl?.querySelector(`#searchIndexSummary-${corpusId}`);
    if (!summaryContainer) {
      console.warn(`[CorpusBrowseView] Search index summary container not found for corpus: ${corpusId}`);
      return;
    }

    console.log(`[CorpusBrowseView] Loading search index summary for corpus: ${corpusId}`);

    try {
      // EFFICIENCY FIX: Use already-loaded corpus_config instead of making unnecessary API call
      const vectorConfig = this.corpusConfig?.corpora?.[corpusId]?.vector_configuration || {};
      const indexes = vectorConfig.indexes || [];
      
      // Use cached document counts from existing vector indexes (already in memory)
      const totalDocuments = indexes.reduce((sum, idx) => sum + (idx.document_count || 0), 0);

      if (indexes.length === 0) {
        // No search indexes available
        summaryContainer.innerHTML = `
          <div class="search-index-empty">
            <p><i class="fas fa-info-circle"></i> No search indexes configured for this corpus.</p>
            <p class="help-text">Create search indexes to enable fast semantic search across <span class="document-count-value">${totalDocuments.toLocaleString()}</span> documents.</p>
          </div>
        `;
        return;
      }

      // Group indexes by status
      const statusGroups = {
        active: indexes.filter(idx => idx.status === 'active'),
        creating: indexes.filter(idx => idx.status === 'creating'),
        failed: indexes.filter(idx => idx.status === 'failed')
      };

      // Calculate total chunks across all active indexes (avoid double counting)
      const totalChunks = statusGroups.active.reduce((sum, idx) => sum + (idx.chunk_count || 0), 0);

      // Render summary
      summaryContainer.innerHTML = `
        <div class="search-index-overview">
          <div class="search-stats">
            <div class="stat-item">
              <span class="stat-label">Search Indexes:</span>
              <span class="stat-value">${indexes.length}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Documents:</span>
              <span class="stat-value">${totalDocuments.toLocaleString()}</span>
            </div>
            ${totalChunks > 0 ? `
              <div class="stat-item">
                <span class="stat-label">Searchable Chunks:</span>
                <span class="stat-value">${totalChunks.toLocaleString()}</span>
              </div>
            ` : ''}
          </div>
          
          ${statusGroups.active.length > 0 ? `
            <div class="index-status-group">
              <h5><i class="fas fa-check-circle" style="color: var(--status-success);"></i> Active Indexes (${statusGroups.active.length})</h5>
              <div class="index-list">
                ${statusGroups.active.map(idx => `
                  <div class="index-item">
                    <span class="index-name">${idx.user_index_name || idx.index_name}</span>
                    <span class="index-chunks">${(idx.chunk_count || 0).toLocaleString()} chunks</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          ${statusGroups.creating.length > 0 ? `
            <div class="index-status-group">
              <h5><i class="fas fa-clock" style="color: var(--status-warning);"></i> Creating (${statusGroups.creating.length})</h5>
              <div class="index-list">
                ${statusGroups.creating.map(idx => `
                  <div class="index-item">
                    <span class="index-name">${idx.user_index_name || idx.index_name}</span>
                    <span class="index-status">Processing...</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          ${statusGroups.failed.length > 0 ? `
            <div class="index-status-group">
              <h5><i class="fas fa-exclamation-triangle" style="color: var(--status-error);"></i> Failed (${statusGroups.failed.length})</h5>
              <div class="index-list">
                ${statusGroups.failed.map(idx => `
                  <div class="index-item">
                    <span class="index-name">${idx.user_index_name || idx.index_name}</span>
                    <span class="index-status">Failed</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;

    } catch (error) {
      console.error('[CorpusBrowseView] Failed to load search index summary:', error);
      summaryContainer.innerHTML = `
        <div class="search-index-error">
          <p><i class="fas fa-exclamation-circle"></i> Unable to load search index information.</p>
          <p class="error-details">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * Renders domain details panel
   */
  renderDomainDetails(details) {
    if (!details) return '<p>Domain details not available</p>';

    return `
      <div class="domain-info">
        <h3><i class="fas fa-sitemap"></i> Domain: ${details.name}</h3>
        
        <table class="metadata-table">
          <tbody>
            <tr>
              <th>Name:</th>
              <td>${details.name}</td>
            </tr>
            <tr>
              <th>Parent Corpus:</th>
              <td>${details.parent}</td>
            </tr>
            <tr>
              <th>Units:</th>
              <td>${details.units}</td>
            </tr>
            <tr>
              <th>Available Topics:</th>
              <td>${details.topics}</td>
            </tr>
            <tr>
              <th>Available Types:</th>
              <td>${details.types}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="entity-actions">
          <button id="manageVectorIndexes" class="btn btn--secondary" data-corpus="${this.selectedCorpus || 'unknown'}" data-path="${this.selectedPath || 'unknown'}">
            <i class="fas fa-vector-square"></i> Manage Vector Indexes
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Renders unit details panel
   */
  renderUnitDetails(details) {
    if (!details) return '<p>Unit details not available</p>';

    return `
      <div class="unit-info">
        <h3><i class="fas fa-cube"></i> Unit: ${details.name}</h3>
        
        <table class="metadata-table">
          <tbody>
            <tr>
              <th>Name:</th>
              <td>${details.name}</td>
            </tr>
            <tr>
              <th>Parent Domain:</th>
              <td>${details.parent}</td>
            </tr>
            <tr>
              <th>Available Topics:</th>
              <td>${details.topics}</td>
            </tr>
            <tr>
              <th>Available Types:</th>
              <td>${details.types}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="entity-actions">
          <button id="manageVectorIndexes" class="btn btn--secondary" data-corpus="${this.selectedCorpus || 'unknown'}" data-path="${this.selectedPath || 'unknown'}">
            <i class="fas fa-vector-square"></i> Manage Vector Indexes
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Renders the folder and document list
   */
  renderContentsBrowser() {
    if (!this.documentList) return;

    this.documentList.setData(
      this.folders,
      this.documents,
      this.selectedPath,
      this.selectedDocument
    );

    // If we have a selected folder, update the detail panel
    if (this.selectedPath && !this.selectedDocument && this.documentDetailContainer) {
      this.documentDetailContainer.innerHTML = this.renderEntityDetails(this.selectedPath);
      
      // Re-attach event listener to vector index management button
      this.attachVectorIndexListener(this.documentDetailContainer);
    }
  }

  /**
   * Called when the view becomes active
   * @param {Object} routerMatch - Optional router match information for URL restoration
   */
  async onActivate(routerMatch) {
    console.log('[CorpusBrowseView] 🚀 onActivate called with routerMatch:', routerMatch);
    console.log('[CorpusBrowseView] 🚀 Current URL:', window.location.href);
    console.log('[CorpusBrowseView] 🚀 Current viewMode:', this.viewMode);
    console.log('[CorpusBrowseView] 🚀 Current selectedCorpus:', this.selectedCorpus);
    
    try {
      // Use corpus config from the store instead of loading it again
      this.corpusConfig = this.store.get("corpus_config");
      console.log('[CorpusBrowseView] 🚀 Corpus config loaded, available corpuses:', Object.keys(this.corpusConfig || {}));

      // Only load if not already available
      if (!this.corpusConfig || Object.keys(this.corpusConfig).length === 0) {
        console.log('[CorpusBrowseView] 🚀 No corpus config found, loading...');
        await this.loadCorpusConfig();
      }

      // Check for router entity ID to restore specific folder view
      if (routerMatch && routerMatch.entityId) {
        console.log('[CorpusBrowseView] 🎯 Router entityId detected for restoration:', routerMatch.entityId);
        
        try {
          // Decode the URL-encoded entity ID (folder path)
          const decodedPath = decodeURIComponent(routerMatch.entityId);
          console.log('[CorpusBrowseView] 🔄 Decoded folder path:', decodedPath);
          console.log('[CorpusBrowseView] 🔄 Available corpus config keys:', Object.keys(this.corpusConfig || {}));
          
          // Check if this path represents a specific corpus folder
          console.log('[CorpusBrowseView] 🔄 Calling getCorpusNavigator with path:', decodedPath);
          const corpusNavigator = getCorpusNavigator(this.corpusConfig, decodedPath);
          console.log('[CorpusBrowseView] 🔄 CorpusNavigator result:', corpusNavigator);
          
          if (corpusNavigator) {
            console.log('[CorpusBrowseView] ✅ Valid corpus path found, proceeding with restoration to:', decodedPath);
            
            // Extract corpus ID from path if it's a corpus-level path  
            const pathParts = decodedPath.split('/');
            const corpusId = pathParts[0];
            console.log('[CorpusBrowseView] 🔄 Extracted corpus ID from path:', corpusId);
            console.log('[CorpusBrowseView] 🔄 Checking if corpus exists in config.corpora:', !!this.corpusConfig.corpora?.[corpusId]);
            
            // Set the corpus and navigate to the specific folder
            if (corpusId && this.corpusConfig.corpora?.[corpusId]) {
              console.log('[CorpusBrowseView] 🔄 Setting view state for restoration:');
              console.log('[CorpusBrowseView] 🔄 - selectedCorpus:', corpusId);
              console.log('[CorpusBrowseView] 🔄 - viewMode: corpus-contents');
              
              this.selectedCorpus = corpusId;
              this.viewMode = 'corpus-contents';
              
              // Navigate to the specific folder path
              console.log('[CorpusBrowseView] 🔄 Calling navigateToFolder with:', decodedPath);
              this.navigateToFolder(decodedPath, 'folder');
              
              // Load folders and render
              console.log('[CorpusBrowseView] 🔄 Loading folders for corpus:', corpusId);
              await this.loadFolders();
              
              console.log('[CorpusBrowseView] ✅ Successfully restored view to folder:', decodedPath);
              return; // Exit early since we've handled the router restoration
            } else {
              console.error('[CorpusBrowseView] ❌ Corpus ID not found in config.corpora:', corpusId);
              console.error('[CorpusBrowseView] ❌ Available corpora:', Object.keys(this.corpusConfig.corpora || {}));
            }
          } else {
            console.warn('[CorpusBrowseView] ❌ Invalid corpus path in URL (getCorpusNavigator returned null):', decodedPath);
          }
        } catch (decodeError) {
          console.error('[CorpusBrowseView] ❌ Error decoding entity ID from URL:', decodeError);
        }
      }

      // Standard activation logic (when no router entity ID or restoration failed)
      if (this.viewMode === 'corpus-contents' && this.selectedCorpus) {
        await this.loadFolders();
      } else if (this.viewMode === 'corpora') {
        // Force a re-render for the corpora view to fix the refresh issue
        this.render(this.containerEl);
        // Also initialize the corpora view components after render
        if (this.containerEl) {
          this.initializeCorporaView();
        }
      }
    } catch (error) {
      console.error('[CorpusBrowseView] Error activating view:', error);
      this.errorModal.show({
        title: "Error Loading View",
        message: "There was a problem loading the corpus management view. Please try again."
      });
    }
  }

  /**
   * Loads corpus configuration from subtenant attributes
   */
  async loadCorpusConfig() {
    try {
      this.setLoading(true);

      // Get corpus config from subtenant attributes
      console.log('Fetching corpus_config from subtenant attributes...');
      const subtenant = await getSubtenantAttributes(['corpus_config']);
      console.log('Received subtenant data:', subtenant);

      this.corpusConfig = subtenant.corpus_config || {};
      console.log('Parsed corpus config:', this.corpusConfig);

      // Check if corpus config has corpora
      if (!this.corpusConfig.corpora || Object.keys(this.corpusConfig.corpora).length === 0) {
        console.warn('No corpora found in corpus_config');
      }

      // Set default selected corpus if available
      if (!this.selectedCorpus) {
        if (this.corpusConfig.default_corpus && this.corpusConfig.corpora?.[this.corpusConfig.default_corpus]) {
          this.selectedCorpus = this.corpusConfig.default_corpus;
          console.log(`Selected default corpus: ${this.selectedCorpus}`);
        } else {
          console.warn('No default corpus found or default corpus not in corpora list');
        }
      }

      // Only render if we have a container element
      if (this.containerEl) {
        this.render();
      } else {
        console.warn('No container element available for rendering');
      }

    } catch (error) {
      console.error('[CorpusBrowseView] Error loading corpus config:', error);
      this.errorModal.show({
        title: "Error Loading Corpus Configuration",
        message: `Failed to load corpus configuration: ${error.message || "Unknown error"}`
      });
      throw error; // Rethrow so onActivate can handle it
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Selects a corpus for display in the details panel
   */
  selectCorpus(corpusId) {
    console.log(`Selecting corpus: ${corpusId}`);
    if (this.selectedCorpus === corpusId) return;

    this.selectedCorpus = corpusId;

    // Update corpus details
    const detailsContainer = this.containerEl?.querySelector('#corpus-details');
    if (detailsContainer) {
      detailsContainer.innerHTML = this.renderEntityDetails(corpusId);

      // Re-attach event listener to browse button
      const browseButton = detailsContainer.querySelector('#browse-corpus');
      if (browseButton) {
        this.addListener(browseButton, 'click', () => {
          this.browseCorpus(browseButton.dataset.corpus);
        });
      }
      
      // Re-attach event listener to vector index management button
      this.attachVectorIndexListener(detailsContainer);
      
      // Load search index summary for the corpus
      this.loadSearchIndexSummary(corpusId);
    }

    // Update corpora list selection
    if (this.documentList) {
      this.documentList.setData(
        this.documentList.folders,
        this.documentList.documents,
        corpusId,
        null
      );
    }
  }

  /**
   * Switches to browse view for a corpus
   */
  browseCorpus(corpusId) {
    console.log(`Browsing corpus: ${corpusId}`);

    // Don't set loading here - we'll do it in loadFolders
    this.selectedCorpus = corpusId;
    this.viewMode = 'corpus-contents';
    this.selectedPath = corpusId;
    this.breadcrumbPath = [
      { name: prettifyInputName(corpusId), path: corpusId, type: 'corpus' }
    ];

    // Update URL when navigating to corpus
    this.navigateToFolder(corpusId, corpusId);
    this.selectedDocument = null;

    // Store the current corpus in the global store
    this.store.set("currentCorpus", corpusId);

    // Re-render the view
    this.render();

    // Notify corpus-manager
    this.containerEl.dispatchEvent(new CustomEvent('corpus:view-mode-changed', {
      bubbles: true,
      detail: {
        viewMode: this.viewMode,
        corpus: corpusId  // Add the corpus ID to the event detail
      }
    }));

    // Now set loading and load the data after the view has rendered
    this.loadFolders();
  }

  /**
   * Returns to the corpora selection view
   */
  backToCorpora() {
    console.log('Returning to corpora view');
    this.viewMode = 'corpora';
    this.selectedPath = '';
    this.breadcrumbPath = [];
    this.folders = [];
    this.documents = [];
    this.selectedDocument = null;
    this.selectedCorpus = null; // Clear selected corpus

    // Re-render the view
    this.render();

    // Immediately initialize the corpora view (no timeout needed)
    this.initializeCorporaView();

    // Notify corpus-manager to update action buttons
    this.containerEl.dispatchEvent(new CustomEvent('corpus:view-mode-changed', {
      bubbles: true,
      detail: { viewMode: this.viewMode }
    }));
  }

  /**
   * Handles breadcrumb navigation with URL updates
   */
  navigateToBreadcrumb(path) {
    console.log(`Navigating to breadcrumb: ${path}`);

    // Use the corpus navigator to get the correct breadcrumb
    const navigator = getCorpusNavigator(this.corpusConfig, path);
    if (!navigator) {
      console.error(`Invalid path: ${path}`);
      return;
    }

    // Update local state
    this.selectedPath = path;
    this.breadcrumbPath = navigator.breadcrumb;
    this.selectedDocument = null;

    // Update URL via router if available
    if (window.router && window.router.isReady()) {
      try {
        const currentMatch = window.router.getCurrentRoute();
        console.log('[CorpusBrowseView] Current route match for breadcrumb:', currentMatch);
        
        // Check if we're in the corpus route
        if (currentMatch && currentMatch.route.id === 'corpus') {
          let newUrl = '/corpus';
          
          // Add folder path as entity ID if provided
          if (path) {
            newUrl += '/' + encodeURIComponent(path);
          }
          
          // Preserve query parameters (like ?s=cognaire)
          const currentParams = currentMatch.queryParams || {};
          if (Object.keys(currentParams).length > 0) {
            const queryString = new URLSearchParams(currentParams).toString();
            newUrl += '?' + queryString;
          }
          
          console.log('[CorpusBrowseView] Updating URL to:', newUrl);
          
          // Use pushState for breadcrumb navigation (user might want to go back)
          window.router.navigate(newUrl, { replace: false });
        }
      } catch (error) {
        console.warn('[CorpusBrowseView] Router navigation failed for breadcrumb:', error);
      }
    } else {
      console.log('[CorpusBrowseView] Router not available for URL updates');
    }

    // Update the breadcrumb component
    if (this.breadcrumbComponent) {
      this.breadcrumbComponent.setBreadcrumb(this.breadcrumbPath);
    }

    // Reload folders and documents for this path
    this.loadFolders();
  }

  /**
   * Loads folders and documents for the current path
   */
  async loadFolders() {
    try {
      // Ensure loading state is set
      this.setLoading(true);

      console.log(`[CorpusBrowseView] Loading folders for path: ${this.selectedPath}`);

      // Use the corpus navigator to determine what should be shown
      const navigator = getCorpusNavigator(this.corpusConfig, this.selectedPath);

      if (!navigator) {
        console.warn(`[CorpusBrowseView] Invalid path: ${this.selectedPath}, attempting to navigate to parent or fallback`);
        
        // Try to navigate to a parent path if the current path is invalid
        const pathParts = this.selectedPath.split('/').filter(Boolean);
        
        if (pathParts.length > 1) {
          // Try navigating to parent (remove last segment)
          const parentPath = pathParts.slice(0, -1).join('/');
          console.log(`[CorpusBrowseView] Trying parent path: ${parentPath}`);
          
          const parentNavigator = getCorpusNavigator(this.corpusConfig, parentPath);
          if (parentNavigator) {
            console.log(`[CorpusBrowseView] Successfully navigated to parent path: ${parentPath}`);
            this.selectedPath = parentPath;
            this.navigateToBreadcrumb(parentPath);
            return; // Exit early, navigateToBreadcrumb will trigger a new loadFolders call
          }
        }
        
        if (pathParts.length > 0) {
          // Try navigating to just the corpus level
          const corpusPath = pathParts[0];
          console.log(`[CorpusBrowseView] Trying corpus path: ${corpusPath}`);
          
          const corpusNavigator = getCorpusNavigator(this.corpusConfig, corpusPath);
          if (corpusNavigator) {
            console.log(`[CorpusBrowseView] Successfully navigated to corpus path: ${corpusPath}`);
            this.selectedPath = corpusPath;
            this.navigateToBreadcrumb(corpusPath);
            return; // Exit early, navigateToBreadcrumb will trigger a new loadFolders call
          }
        }
        
        // If all else fails, go back to corpora view
        console.log(`[CorpusBrowseView] All navigation attempts failed, falling back to corpora view`);
        this.selectedPath = '';
        this.selectedCorpus = '';
        this.viewMode = 'corpora';
        this.render();
        return;
      }

      console.log('Navigator:', navigator);

      // Set the folders from the navigator
      this.folders = navigator.childFolders;
      this.breadcrumbPath = navigator.breadcrumb;

      // Update breadcrumb component
      if (this.breadcrumbComponent) {
        this.breadcrumbComponent.setBreadcrumb(this.breadcrumbPath);
      }

      // If there is a selected entity (folder), show its details
      if (this.selectedPath && !this.selectedDocument && this.documentDetailContainer) {
        this.documentDetailContainer.innerHTML = this.renderEntityDetails(this.selectedPath);
        
        // Re-attach event listeners for vector index management
        this.attachVectorIndexListener(this.documentDetailContainer);
      }

      // Now load documents at this location
      await this.loadDocuments();

      // Check for active documents after loading folders
      // This will update the hasActiveDocuments flag and notify CorpusManager
      await this.checkActiveDocuments();

    } catch (error) {
      console.error('[CorpusBrowseView] Error loading folders:', error);
      this.errorModal.show({
        title: "Error Loading Folders",
        message: error.message || "Failed to load folder structure"
      });
    } finally {
      // Clear loading state when done
      this.setLoading(false);
    }
  }

  /**
   * Loads documents for the current path with filters
   */
  async loadDocuments(forceRefresh = false) {
    try {
      this.setLoading(true, '#document-list-container');

      console.log(`[ZERO_DOCS_DEBUG] Loading documents for path: ${this.selectedPath} with filters:`, this.filters);

      // Create a fresh copy of filters to avoid reference issues
      let apiFilters = JSON.parse(JSON.stringify(this.filters || {}));

      // Handle "My Drafts" filter
      if (apiFilters.myDrafts) {
        apiFilters.author = this.store.get('username');
        apiFilters.status = 'DRAFT';
        delete apiFilters.myDrafts; // API doesn't need this
      }

      // Add cache-busting parameter if forcing refresh
      if (forceRefresh) {
        apiFilters._timestamp = Date.now();
      }

      console.log(`[ZERO_DOCS_DEBUG] About to call listCorpusDocuments with:`, {
        folderPath: this.selectedPath,
        filters: apiFilters,
        selectedCorpus: this.selectedCorpus,
        currentUser: this.store.get('username')
      });

      // Call API to get documents
      const response = await listCorpusDocuments({
        folderPath: this.selectedPath,
        filters: apiFilters
      });

      console.log('[ZERO_DOCS_DEBUG] listCorpusDocuments response:', {
        totalCount: response.totalCount,
        documentsCount: response.documents?.length || 0,
        folderPath: response.folderPath,
        fullResponse: response
      });

      // Update documents list with fresh data
      this.documents = response.documents || [];
      this.sortDocuments();

      // Update document list component
      this.renderContentsBrowser();

      // Handle selected document if it's no longer in the list
      if (this.selectedDocument && !this.documents.some(d => d.documentKey === this.selectedDocument)) {
        this.selectedDocument = null;
        if (this.documentDetail) {
          this.documentDetail.clear();
        }
      }

    } catch (error) {
      console.error('[CorpusBrowseView] Error loading documents:', error);
      this.errorModal.show({
        title: "Error Loading Documents",
        message: error.message || "Failed to load documents"
      });
    } finally {
      this.setLoading(false, '#document-list-container');
    }
  }

  /**
   * Handles selecting a folder (but not navigating into it)
   */
  selectFolder(path, type) {
    console.log(`Selecting folder: ${path} (${type})`);
    this.selectedPath = path;
    this.selectedDocument = null;

    // Update document list selection
    if (this.documentList) {
      this.documentList.setData(
        this.folders,
        this.documents,
        path,
        null
      );
    }

    // Show entity details in the detail pane
    if (this.documentDetailContainer) {
      this.documentDetailContainer.innerHTML = this.renderEntityDetails(path);
      
      // Re-attach event listeners for vector index management
      this.attachVectorIndexListener(this.documentDetailContainer);
    }
  }

  /**
   * Handles navigation into a folder with URL updates
   */
  navigateToFolder(path, type) {
    console.log(`Navigating to folder: ${path} (${type})`);

    // Use the corpus navigator to determine what should be shown
    const navigator = getCorpusNavigator(this.corpusConfig, path);

    if (!navigator) {
      console.error(`Invalid path: ${path}`);
      this.errorModal.show({
        title: "Navigation Error",
        message: "Unable to navigate to the selected folder."
      });
      return;
    }

    // Update local state
    this.selectedPath = path;
    this.breadcrumbPath = navigator.breadcrumb;
    this.selectedDocument = null;

    // Update URL via router if available
    if (window.router && window.router.isReady()) {
      try {
        const currentMatch = window.router.getCurrentRoute();
        console.log('[CorpusBrowseView] Current route match:', currentMatch);
        
        // Check if we're in the corpus route
        if (currentMatch && currentMatch.route.id === 'corpus') {
          let newUrl = '/corpus';
          
          // Add folder path as entity ID if provided
          if (path) {
            newUrl += '/' + encodeURIComponent(path);
          }
          
          // Preserve query parameters (like ?s=cognaire)
          const currentParams = currentMatch.queryParams || {};
          if (Object.keys(currentParams).length > 0) {
            const queryString = new URLSearchParams(currentParams).toString();
            newUrl += '?' + queryString;
          }
          
          console.log('[CorpusBrowseView] Updating URL to:', newUrl);
          
          // Use replace to avoid creating too many history entries for folder navigation
          window.router.navigate(newUrl, { replace: true });
        }
      } catch (error) {
        console.warn('[CorpusBrowseView] Router navigation failed:', error);
      }
    } else {
      console.log('[CorpusBrowseView] Router not available for URL updates');
    }

    // Update breadcrumb component
    if (this.breadcrumbComponent) {
      this.breadcrumbComponent.setBreadcrumb(this.breadcrumbPath);
    }

    // Reload folders and documents for this path
    this.loadFolders();
  }

  /**
   * Handles selecting a document
   */
  async selectDocument(documentKey) {
    // Skip if already selected
    if (this.selectedDocument === documentKey) return;

    // Store document list scroll position
    const documentListScrollPos = this.documentListContainer?.scrollTop || 0;

    this.selectedDocument = documentKey;

    // Update document list selection
    if (this.documentList) {
      this.documentList.setData(
        this.folders,
        this.documents,
        this.selectedPath,
        documentKey
      );

      // Document detail will be set after loading full document details
      // Remove premature setDocument call that passes string instead of object
    }

    // Find document in the current list
    const document = this.documents.find(d => d.documentKey === documentKey);

    if (document) {
      try {
        // Set a loading state in document detail while fetching full details
        if (this.documentDetail) {
          this.documentDetail.clear();
          this.documentDetail.container.innerHTML = `
            <div class="detail-pane-placeholder">
              <div class="loading-spinner"></div>
              <p>Loading document details...</p>
            </div>
          `;
        }

        // Only apply loading to the document detail container
        this.setLoading(true, '#document-detail-container');

        // Get full document details
        const details = await getCorpusDocumentDetails({
          documentKey
        });

        // Create base merged document
        const fullDocument = { ...document, ...details };

        // Extract and flatten metadata fields if they exist
        if (details.metadata && Object.keys(details.metadata).length > 0) {
          Object.entries(details.metadata).forEach(([key, value]) => {
            if (fullDocument[key] === undefined || fullDocument[key] === null || fullDocument[key] === '') {
              fullDocument[key] = value;
            }
          });
        }

        // Update document detail component
        if (this.documentDetail) {
          const security = getFreshSecurity(this.store);
          this.documentDetail.setDocument(fullDocument, security);
        }

      } catch (error) {
        console.error('[CorpusBrowseView] Error loading document details:', error);
        this.errorModal.show({
          title: "Error Loading Document",
          message: error.message || "Failed to load document details"
        });
      } finally {
        this.setLoading(false, '#document-detail-container');
      }
    } else {
      // Document not found in current list
      console.warn(`[CorpusBrowseView] Document not found in current list: ${documentKey}`);
      if (this.documentDetail) {
        this.documentDetail.clear();
        this.documentDetail.container.innerHTML = `
          <div class="detail-pane-placeholder">
            <p>Document not found in current folder</p>
            <p class="text-muted">The document may have been moved or deleted.</p>
          </div>
        `;
      }
    }

    // Restore scroll position at the end
    if (this.documentListContainer) {
      this.documentListContainer.scrollTop = documentListScrollPos;
    }
  }

  /**
   * Handles document action button clicks
   */
  handleDocumentAction(action, documentKey) {
    console.log(`Document action: ${action} for ${documentKey}`);

    switch (action) {
      case 'edit':
        this.editDocument(documentKey);
        break;
      case 'delete':
        this.deleteDocument(documentKey);
        break;
      case 'download':
        this.downloadDocument(documentKey);
        break;
      case 'view-history':
        this.viewDocumentHistory(documentKey);
        break;
      case 'submit-for-approval':
        this.confirmSubmitForApproval(documentKey);
        break;
    }
  }

  /**
   * Opens document editor modal
   */
  editDocument(documentKey) {
    // Find document in current list
    const document = this.documents.find(d => d.documentKey === documentKey);

    if (!document) {
      console.error(`Document not found: ${documentKey}`);
      this.errorModal.show({
        title: "Error",
        message: "Document not found"
      });
      return;
    }

    // Get full document details
    this.setLoading(true);

    getCorpusDocumentDetails({ documentKey })
      .then(details => {
        // Show editor modal
        this.contentEditorModal.show({
          documentKey,
          documentName: document.name,
          content: details.content || '',
          metadata: {
            topic: document.topic,
            type: document.type
          },
          onSave: async (docKey, content, metadata, saveType) => {
            try {
              if (saveType === 'draft') {
                // Save as draft
                await saveCorpusDocumentDraft({
                  documentKey: docKey,
                  content,
                  metadata
                });

                this.messageModal.show({
                  title: "Success",
                  message: "Document saved as draft."
                });
              } else {
                // Submit for approval
                await saveCorpusDocumentDraft({
                  documentKey: docKey,
                  content,
                  metadata
                });

                await submitCorpusDocumentForApproval({
                  documentKey: docKey
                });

                this.messageModal.show({
                  title: "Success",
                  message: "Document submitted for approval."
                });
              }

              // Refresh document list
              await this.loadDocuments();

              // Re-select document
              this.selectDocument(docKey);
            } catch (error) {
              console.error('[CorpusBrowseView] Error saving document:', error);
              this.errorModal.show({
                title: "Error",
                message: error.message || "Failed to save document"
              });
              throw error; // Re-throw to let modal handle it
            }
          }
        });
      })
      .catch(error => {
        console.error('[CorpusBrowseView] Error loading document for edit:', error);
        this.errorModal.show({
          title: "Error Loading Document",
          message: error.message || "Failed to load document for editing"
        });
      })
      .finally(() => {
        this.setLoading(false);
      });
  }

  /**
   * Handles save action from editor modal
   */
  async handleSaveEdit(documentKey, content, metadata) {
    try {
      this.setLoading(true);

      const response = await saveCorpusDocumentDraft({
        documentKey,
        content,
        metadata
      });

      // Refresh document list and details
      await this.loadDocuments();

      // Select the document again (in case it moved in the list due to sorting)
      this.selectDocument(documentKey);

      this.messageModal.show({
        title: "Success",
        message: "Document saved successfully."
      });

    } catch (error) {
      console.error('[CorpusBrowseView] Error saving document:', error);
      this.errorModal.show({
        title: "Error Saving Document",
        message: error.message || "Failed to save document"
      });
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Shows delete confirmation and handles document deletion
   */
  deleteDocument(documentKey) {
    // Find document in current list
    const document = this.documents.find(d => d.documentKey === documentKey);

    if (!document) {
      console.error(`Document not found: ${documentKey}`);
      this.errorModal.show({
        title: "Error",
        message: "Document not found"
      });
      return;
    }

    // Check if document is a draft
    const isDraft = document.status === 'DRAFT' || document.status === 'REJECTED';

    // Check if user is an admin
    const security = getFreshSecurity(this.store);
    const isAdmin = security.hasSystemPermission('SYSTEM_ADMIN') ||
      security.hasSystemPermission('APP_ADMIN');

    if (isDraft) {
      // Draft documents can be permanently deleted
      this.confirmModal.show({
        title: "Delete Draft",
        message: "Are you sure you want to permanently delete this draft? This action cannot be undone.",
        onYes: () => this.performDelete(documentKey, true), // true = permanent delete
        onNo: () => { }
      });
    } else if (isAdmin) {
      // Admins get to choose delete type for non-draft documents
      this.showDeleteOptionsModal(documentKey);
    } else {
      // Regular users can only soft-delete non-draft documents
      this.confirmModal.show({
        title: "Soft Delete Document",
        message: "Are you sure you want to archive this document? It will be marked as deleted but can be restored by an administrator.",
        onYes: () => this.performDelete(documentKey, false), // false = soft delete
        onNo: () => { }
      });
    }
  }

  showDeleteOptionsModal(documentKey) {
    // Use options modal to provide delete choices for admins
    const optionsModal = new OptionsModal();
    optionsModal.show({
      title: "Delete Document",
      message: "How would you like to delete this document?",
      options: [
        {
          text: "Permanently Delete",
          btnClass: "btn--danger",
          onClick: () => {
            this.confirmPermanentDelete(documentKey);
          }
        },
        {
          text: "Soft Delete",
          btnClass: "btn--secondary",
          onClick: () => {
            this.confirmSoftDelete(documentKey);
          }
        }
      ],
      onCancel: () => { } // Do nothing on cancel
    });
  }

  confirmPermanentDelete(documentKey) {
    this.confirmModal.show({
      title: "Permanent Delete",
      message: "WARNING: This will permanently delete the document and all its history. This action cannot be undone. Are you sure?",
      yesText: "Permanently Delete",
      noText: "Cancel",
      onYes: () => this.performDelete(documentKey, true),
      onNo: () => { }
    });
  }

  confirmSoftDelete(documentKey) {
    this.confirmModal.show({
      title: "Soft Delete",
      message: "The document will be marked as deleted but can be restored later if needed. Continue?",
      onYes: () => this.performDelete(documentKey, false),
      onNo: () => { }
    });
  }

  performDelete(documentKey, isPermanent) {
    try {
      this.setLoading(true, '#document-detail-container');

      // Call API with the delete type
      deleteCorpusDocument({
        documentKey,
        deleteType: isPermanent ? 'permanent' : 'soft'
      }).then(() => {
        // Refresh document list
        this.loadDocuments().then(() => {
          // Clear selection if the deleted document was selected
          if (this.selectedDocument === documentKey) {
            this.selectedDocument = null;
            if (this.documentDetail) {
              this.documentDetail.clear();
            }
          }
        });

        this.messageModal.show({
          title: "Success",
          message: isPermanent ?
            "Document permanently deleted." :
            "Document soft-deleted successfully."
        });
      }).catch(error => {
        console.error('[CorpusBrowseView] Error deleting document:', error);
        this.errorModal.show({
          title: "Error Deleting Document",
          message: error.message || "Failed to delete document"
        });
      }).finally(() => {
        this.setLoading(false);
      });
    } catch (error) {
      console.error('[CorpusBrowseView] Error in delete operation:', error);
      this.setLoading(false);
      this.errorModal.show({
        title: "Error",
        message: "An unexpected error occurred during delete operation."
      });
    }
  }

  /**
   * Initiates document download
   */
  downloadDocument(documentKey) {
    const downloadUrl = `/api/corpus/documents/download?documentKey=${encodeURIComponent(documentKey)}&corpus=${encodeURIComponent(this.selectedCorpus)}`;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = documentKey.split('/').pop() || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Opens document version history modal
   */
  viewDocumentHistory(documentKey) {
    // Find document in current list
    const document = this.documents.find(d => d.documentKey === documentKey);

    if (!document) {
      console.error(`Document not found: ${documentKey}`);
      this.errorModal.show({
        title: "Error",
        message: "Document not found"
      });
      return;
    }

    // Create and show the history modal
    const historyModal = new CorpusDocumentHistoryModal();
    historyModal.show({
      documentKey,
      displayName: document.name
    });
  }

  confirmSubmitForApproval(documentKey) {
    this.confirmModal.show({
      title: "Submit for Approval",
      message: "Are you sure you want to submit this document for approval? This will start the review process.",
      onYes: () => this.submitDocumentForApproval(documentKey),
      onNo: () => { }
    });
  }

  /**
   * Submits document for approval workflow
   */
  submitDocumentForApproval(documentKey) {
    try {
      this.setLoading(true, '#document-detail-container');

      submitCorpusDocumentForApproval({
        documentKey
      }).then(() => {
        // Refresh document list to show updated status
        this.loadDocuments().then(() => {
          // Re-select the document with updated status
          if (this.selectedDocument === documentKey) {
            this.selectDocument(documentKey);
          }
        });

        this.messageModal.show({
          title: "Success",
          message: "Document submitted for approval successfully."
        });
      }).catch(error => {
        console.error('[CorpusBrowseView] Error submitting document:', error);
        this.errorModal.show({
          title: "Error Submitting Document",
          message: error.message || "Failed to submit document for approval"
        });
      }).finally(() => {
        this.setLoading(false);
      });
    } catch (error) {
      console.error('[CorpusBrowseView] Error in submit operation:', error);
      this.setLoading(false);
      this.errorModal.show({
        title: "Error",
        message: "An unexpected error occurred during submit operation."
      });
    }
  }

  /**
   * Resets all document filters
   */
  resetFilters() {
    this.filters = {
      topic: '',
      type: '',
      status: '',
      myDrafts: false
    };

    // Update filter component
    if (this.filtersComponent) {
      this.filtersComponent.setFilters(this.filters);
    }

    // Reload documents with reset filters
    this.loadDocuments();
  }

  /**
   * Sorts the documents array based on sort field and direction
   */
  sortDocuments() {
    if (!this.documents?.length) return;

    this.documents.sort((a, b) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];

      // Handle undefined values
      if (valA === undefined) valA = '';
      if (valB === undefined) valB = '';

      // Special handling for dates
      if (['lastModified', 'created'].includes(this.sortField)) {
        valA = new Date(valA).getTime() || 0;
        valB = new Date(valB).getTime() || 0;
      }

      // String comparison should be case-insensitive
      if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      // Compare based on sort direction
      if (this.sortDirection === 'asc') {
        return valA < valB ? -1 : valA > valB ? 1 : 0;
      } else {
        return valA > valB ? -1 : valA < valB ? 1 : 0;
      }
    });
  }

  /**
   * Shows/hides loading indicator
   */
  setLoading(loading, containerSelector = null) {
    if (loading) {
      this._loadingCounter++;
    } else {
      this._loadingCounter = Math.max(0, this._loadingCounter - 1);
    }

    this.loading = this._loadingCounter > 0;

    // Remove all existing loading overlays
    const existingOverlays = this.containerEl?.querySelectorAll('.loading-overlay, .loading-indicator');
    existingOverlays?.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });

    // If still loading, add a single overlay in the appropriate place
    if (this.loading) {
      let targetContainer;

      if (containerSelector) {
        // Specific container requested
        targetContainer = this.containerEl?.querySelector(containerSelector);
      } else {
        // Default container based on view mode
        const selector = this.viewMode === 'corpora' ? '#corpora-list-container' : '#document-list-container';
        targetContainer = this.containerEl?.querySelector(selector);
      }

      if (targetContainer) {
        // Position the container relatively if not already
        if (getComputedStyle(targetContainer).position === 'static') {
          targetContainer.style.position = 'relative';
        }

        // Create a single, consistent overlay
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="loading-spinner"></div>';
        targetContainer.appendChild(overlay);
      }
    }
  }

  /**
   * Attaches event listeners to vector index management button in a container
   */
  attachVectorIndexListener(container) {
    if (!container) return;
    
    const vectorButton = container.querySelector('#manageVectorIndexes');
    if (vectorButton) {
      console.log('[CorpusBrowseView] Attaching vector index listener:', {
        corpus: vectorButton.dataset.corpus,
        path: vectorButton.dataset.path
      });
      
      this.addListener(vectorButton, 'click', () => {
        this.handleVectorIndexManagement(vectorButton.dataset.corpus, vectorButton.dataset.path);
      });
    }
  }

  /**
   * Handles vector index management button click
   */
  handleVectorIndexManagement(corpusId, path) {
    console.log(`[CorpusBrowseView] Opening vector index management - corpusId: "${corpusId}", path: "${path}"`);
    
    // Enhanced defensive checks with detailed logging
    if (!corpusId || corpusId === 'unknown') {
      console.error('[CorpusBrowseView] Cannot open vector index management:', {
        corpusId,
        path,
        selectedCorpus: this.selectedCorpus,
        selectedPath: this.selectedPath
      });
      this.errorModal.show({
        title: "Vector Index Management Error",
        message: "Cannot open vector index management: corpus ID not found. Please ensure you have selected a valid corpus."
      });
      return;
    }
    
    // Use selectedCorpus as fallback if corpusId is somehow still invalid
    const finalCorpusId = corpusId || this.selectedCorpus;
    const finalPath = path || this.selectedPath || finalCorpusId;
    
    console.log(`[CorpusBrowseView] Final parameters for modal - corpusId: "${finalCorpusId}", path: "${finalPath}"`);
    
    this.vectorIndexModal.show({
      corpus_id: finalCorpusId,
      path: finalPath,
      onIndexChange: () => {
        // Refresh search index summary when indexes change
        console.log('[CorpusBrowseView] Vector indexes changed - refreshing search index summary');
        this.loadSearchIndexSummary(finalCorpusId);
      }
    });
  }

  /**
   * Clean up component resources
   */
  destroy() {
    // Call base class cleanup
    super.destroy();

    // Clean up component instances
    this.documentList = null;
    this.filtersComponent = null;
    this.documentDetail = null;
    this.breadcrumbComponent = null;
    
    // Clean up modals
    if (this.vectorIndexModal) {
      this.vectorIndexModal.destroy();
      this.vectorIndexModal = null;
    }
  }
}

/**
 * Helper function to convert UI path format (/) to API path format (->)
 */
function convertToApiPath(uiPath) {
  return uiPath.replace(/\//g, '->');
}