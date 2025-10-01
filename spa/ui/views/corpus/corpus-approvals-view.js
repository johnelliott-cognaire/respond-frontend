// ui/views/corpus/corpus-approvals-view.js
import { CorpusViewBase } from './corpus-view-base.js';
import { CorpusDocumentList } from '../../components/corpus-document-list.js';
import { ErrorModal } from '../../modals/error-modal.js';
import { YesNoModal } from '../../modals/yesno-modal.js';
import { OptionsModal } from '../../modals/options-modal.js';
import { MessageModal } from '../../modals/message-modal.js';
import { CorpusDocumentHistoryModal } from '../../modals/corpus-document-history-modal.js';
import { CorpusDocumentDetail } from '../../components/corpus-document-detail.js';
import { getFreshSecurity } from '../../../utils/security-utils.js';
import { 
  formatDate, 
  formatFileSize, 
  getFileIconClass, 
  escapeHtml, 
  extractRealFilename 
} from '../../../utils/corpus-utils.js';
import { listUserGroups } from '../../../api/usergroups.js';
import formatHumanReadableDate from '../../../utils/date-utils.js';

import {
  getCorpusApprovalQueue,
  getCorpusDocumentDetails,
  getCorpusDocumentDiff,
  claimCorpusDocument,
  releaseCorpusDocument,
  approveCorpusDocument,
  rejectCorpusDocument
} from '../../../api/corpus.js';

export class CorpusApprovalsView extends CorpusViewBase {
  constructor(store, jobController) {
    super(store, jobController);

    // Initialize state tracking
    this._loadingCounter = 0;

    // Initialize modals
    this.errorModal = new ErrorModal();
    this.confirmModal = new YesNoModal();
    this.messageModal = new MessageModal();

    // State
    this.loading = false;
    this.filters = {
      corpus: 'all',
      topic: 'all',
      type: 'all',
      status: 'waiting', // 'waiting', 'in-review', 'approved-today', 'rejected-today'
      dateRange: null
    };
    this.queue = [];
    this.selectedDocument = null;
    this.activeTab = 'preview'; // 'preview', 'changes', 'metrics'
    this.diffLoaded = false;
    this.diffContent = null;
    this.approverGroups = [];
    this.selectedApproverGroup = null;
    this.showDiffHighlights = true;
    this.availableCorpora = [];
    this.availableTopics = [];
    this.availableTypes = [];

    // Sorting
    this.sortField = 'submitted';
    this.sortDirection = 'desc';

    // UI references
    this.queueListContainer = null;
    this.filtersContainer = null;
    this.documentPreviewContainer = null;
    this.tabsContainer = null;
    this.metadataContainer = null;
    this.approvalActionsContainer = null;
  }

  renderHeader() {
    // Create a cleaner header without redundancies
    return `
      <div class="corpus-two-pane-header">
        <div class="corpus-header-content">
          <!-- Remove redundant title here -->
          <div class="corpus-approvals-controls">
            <div class="approver-group-selector">
              <label>Group:</label>
              <select id="approver-group-select" class="filter-select">
                ${this.renderApproverGroupOptions()}
              </select>
            </div>
            <button id="refresh-queue" class="btn btn--secondary">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
            <div class="queue-status-pills">
              <span class="status-pill status-waiting">Waiting: ${this.countByStatus('waiting')}</span>
              <span class="status-pill status-in-review">In Review: ${this.countByStatus('in-review')}</span>
              <span class="status-pill status-completed">Completed: ${this.countByStatus('completed')}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the main content with cleaner structure
   */
  renderContent() {
    return `
    <div class="corpus-two-pane-container">
      <!-- Two-pane layout -->
      <div class="corpus-two-pane-content">
        <!-- Left pane: Queue list -->
        <div id="queue-list-container" class="corpus-two-pane-left">
          <!-- Queue list will be rendered here with responsive table -->
          <div class="empty-state">
            <i class="fas fa-clipboard-check"></i>
            <p>Loading approval queue...</p>
          </div>
        </div>
        
        <!-- Right pane: Document preview and approval actions -->
        <div id="document-detail-container" class="corpus-two-pane-right">
          <!-- Document detail will be rendered here -->
          <div class="detail-pane-placeholder">
            <p>Select a document to review</p>
          </div>
        </div>
      </div>
    </div>
  `;
  }

  renderSortIndicator(field) {
    if (this.sortField !== field) {
      return '';
    }

    return this.sortDirection === 'asc'
      ? '<i class="fas fa-sort-up"></i>'
      : '<i class="fas fa-sort-down"></i>';
  }

  renderApproverGroupOptions() {
    if (this.approverGroups.length === 0) {
      return `<option value="">No groups available</option>`;
    }

    return this.approverGroups.map(group =>
      `<option value="${group.id}" ${group.id === this.selectedApproverGroup ? 'selected' : ''}>${group.name}</option>`
    ).join('');
  }

  countByStatus(status) {
    if (!this.queue || !this.queue.length) return 0;

    return this.queue.filter(doc => {
      switch (status) {
        case 'waiting':
          return doc.status === 'PENDING_HUMAN' && !doc.current_reviewer || doc.status === 'PENDING_HUMAN_IN_REVIEW' && !doc.current_reviewer;
        case 'in-review':
          return doc.status === 'PENDING_HUMAN' && doc.current_reviewer || doc.status === 'PENDING_HUMAN_IN_REVIEW' && doc.current_reviewer;
        case 'completed':
          return doc.status === 'APPROVED' || doc.status === 'REJECTED';
        default:
          return false;
      }
    }).length;
  }

/**
 * Initializes components for the approval view
 */
initializeApprovalComponents() {
  console.log('[CorpusApprovalsView] Initializing approval components');
  
  // Get references to container elements
  this.queueListContainer = this.containerEl?.querySelector('#queue-list-container');
  this.documentDetailContainer = this.containerEl?.querySelector('#document-detail-container');
  
  if (!this.queueListContainer || !this.documentDetailContainer) {
    console.error('[CorpusApprovalsView] Missing container elements');
    return;
  }
  
  // Initialize document list component
  this.documentList = new CorpusDocumentList({
    container: this.queueListContainer,
    onDocumentClick: (documentKey) => {
      console.log('[CorpusApprovalsView] Document clicked:', documentKey);
      // Find version ID from queue data
      const doc = this.queue.find(d => (d.documentKey || d.document_key) === documentKey);
      const versionId = doc ? (doc.s3VersionId || doc.s3_version_id) : null;
      
      // Select the document
      this.selectDocument(documentKey, versionId);
    },
    sortField: this.sortField,
    sortDirection: this.sortDirection,
    onSortChange: (field, direction) => {
      this.sortField = field;
      this.sortDirection = direction;
      this.sortQueue();
      this.renderQueueWithList();
    }
  });
  
  // Initialize document detail component
  this.documentDetail = new CorpusDocumentDetail({
    container: this.documentDetailContainer,
    viewMode: 'approvals-view',
    includeReviewerNote: true,
    onActionClick: (action, documentKey, versionId, note) => {
      console.log('[CorpusApprovalsView] Document action:', action, documentKey);
      this.handleDocumentAction(action, documentKey, versionId, note);
    },
    onTabChange: (tab) => {
      console.log('[CorpusApprovalsView] Tab changed to:', tab);
      if (tab === 'changes' && !this.diffLoaded && this.selectedDocument) {
        this.loadDiff();
      }
    }
  });
  
  console.log('[CorpusApprovalsView] Components initialized');
}

/**
 * Update the document list display using CorpusDocumentList component
 */
renderQueueWithList() {
  if (!this.documentList) {
    console.error('[CorpusApprovalsView] Document list component not initialized');
    return;
  }
  
  console.log('[CorpusApprovalsView] Rendering queue with CorpusDocumentList, items:', this.queue.length);
  
  // Transform queue data to be compatible with CorpusDocumentList
  const normalizedDocuments = this.queue.map(doc => this.normalizeDocumentForList(doc));
  
  // Use the component to render the list
  this.documentList.setData(
    [], // No folders in approval view
    normalizedDocuments, // Pass normalized documents
    null, // No selected folder
    this.selectedDocument?.documentKey // Currently selected document key
  );
}

/**
 * Simplified event listeners since document clicks are handled by CorpusDocumentList
 */
attachEventListeners() {
  // Initialize approval components first - will set up CorpusDocumentList
  this.initializeApprovalComponents();
  
  // Group selector
  const groupSelect = this.containerEl?.querySelector('#approver-group-select');
  if (groupSelect) {
    console.log('[CorpusApprovalsView] Attaching event to group selector');
    this.addListener(groupSelect, 'change', () => {
      console.log('[CorpusApprovalsView] Group changed to:', groupSelect.value);
      this.selectedApproverGroup = groupSelect.value;
      this.loadApprovalQueue();
    });
  }

  // Refresh button
  const refreshButton = this.containerEl?.querySelector('#refresh-queue');
  if (refreshButton) {
    console.log('[CorpusApprovalsView] Attaching event to refresh button');
    this.addListener(refreshButton, 'click', () => {
      console.log('[CorpusApprovalsView] Refresh button clicked');
      this.loadApprovalQueue(true); // Force refresh
    });
  }
}

async onActivate() {
  console.log('[CorpusApprovalsView] Activating');
  try {
    // Initialize components if not done yet
    if (!this.documentList || !this.documentDetail) {
      this.initializeApprovalComponents();
    }
    
    // FIX: Track if refresh is already set up
    if (!this.refreshSetupDone) {
      // Load approver groups the user belongs to
      await this.loadApproverGroups();

      // Load approval queue
      await this.loadApprovalQueue();

      // Set up periodic refresh
      this.setupPeriodicRefresh();

      // Mark as done to prevent duplicate setup
      this.refreshSetupDone = true;
    } else {
      // Just reload data if already activated before
      await this.loadApprovalQueue();
    }
  } catch (error) {
    console.error('[CorpusApprovalsView] Error during activation:', error);
    this.errorModal.show({
      title: 'Error',
      message: 'Failed to load approval queue. Please try again.'
    });
  }
}

  onDeactivate() {
    console.log('[CorpusApprovalsView] Deactivating');

    // Clear the periodic refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Release document if one is being reviewed
    if (this.selectedDocument && this.selectedDocument.current_reviewer === this.store.get('username')) {
      this.handleRelease().catch(err => {
        console.error('[CorpusApprovalsView] Error releasing document on deactivate:', err);
      });
    }
  }

  setupPeriodicRefresh() {
    // FIX: Cancel any existing interval to prevent duplicates
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Set up new interval (5 minutes = 300000 ms)
    this.refreshInterval = setInterval(() => {
      // Background refresh - don't show loading state and preserve selection
      this.loadApprovalQueue(false, true);
    }, 300000); // 5 minutes

    console.log('[CorpusApprovalsView] Periodic refresh set up');
  }

/**
 * Loads approver groups the user belongs to
 */
async loadApproverGroups() {
  try {
    console.log('[CorpusApprovalsView] Loading approver groups');
    
    // Use the API instead of hardcoded values
    const { groups } = await listUserGroups();
    
    if (!groups || groups.length === 0) {
      console.warn('[CorpusApprovalsView] No user groups found');
      this.approverGroups = [];
      return;
    }
    
    // Transform groups to expected format, but don't add prefix if it already exists
    this.approverGroups = groups.map(group => {
      const groupName = group.name;
      const groupId = groupName.startsWith('Group:') ? groupName : `Group:${groupName}`;
      
      return {
        id: groupId,
        name: groupName.replace(/^Group:/, '') // Remove prefix from display name if it exists
      };
    });
    
    console.log('[CorpusApprovalsView] Loaded groups:', this.approverGroups);
    
    // Select the first group by default if none is selected
    if (!this.selectedApproverGroup && this.approverGroups.length > 0) {
      this.selectedApproverGroup = this.approverGroups[0].id;
    }
    
    // Update the UI
    const groupSelect = this.containerEl?.querySelector('#approver-group-select');
    if (groupSelect) {
      groupSelect.innerHTML = this.renderApproverGroupOptions();
    }
  } catch (error) {
    console.error('[CorpusApprovalsView] Error loading approver groups:', error);
    // Fall back to hardcoded values if API call fails
    this.approverGroups = [
      { id: 'Group:SecurityTeam', name: 'Security Team' },
      { id: 'Group:ContentTeam', name: 'Content Team' }
    ];
    
    // Select the first group by default if none is selected
    if (!this.selectedApproverGroup && this.approverGroups.length > 0) {
      this.selectedApproverGroup = this.approverGroups[0].id;
    }
  }
}

/**
 * Loads the approval queue with proper filters
 */
async loadApprovalQueue(forceRefresh = false, backgroundRefresh = false) {
  try {
    // Save currently selected document key for preservation
    const currentDocKey = this.selectedDocument?.documentKey;
    
    if (!backgroundRefresh) {
      this.setLoading(true, '#queue-list-container');
    }
    
    // Prepare filters
    const apiFilters = { ...this.filters };
    
    // Add cache-busting parameter if forcing refresh
    if (forceRefresh) {
      apiFilters._timestamp = Date.now();
    }
    
    console.log('[CorpusApprovalsView] Using approver group:', this.selectedApproverGroup);
    
    // IMPORTANT: Check if the approverGroup already has the prefix to avoid duplication
    let approverGroup = this.selectedApproverGroup;
    
    // Make sure we don't have a duplicate "Group:" prefix
    if (approverGroup && approverGroup.startsWith('Group:Group:')) {
      approverGroup = approverGroup.replace('Group:Group:', 'Group:');
      console.log('[CorpusApprovalsView] Fixed duplicated prefix in approver group:', approverGroup);
    }
    
    // Call API to get queue
    const response = await getCorpusApprovalQueue({
      approverGroup,
      filters: apiFilters
    });
    
    console.log('[CorpusApprovalsView] Queue response:', response);
    
    // Update queue list with fresh data
    this.queue = response.documents || [];
    this.sortQueue();
    
    // Render the updated queue with our component
    this.renderQueueWithList();
    
    // Update counts on UI
    this.updateQueueCounts();
    
    // Extract available filter options
    this.updateFilterOptions();
    
    // If there was a selected document, try to find it in the updated queue
    if (currentDocKey) {
      const updatedDoc = this.queue.find(doc => 
        (doc.documentKey || doc.document_key) === currentDocKey
      );
      
      if (updatedDoc && this.documentList) {
        // Pass the selected document key to the list component
        this.documentList.setData(
          [],
          this.queue.map(this.normalizeDocumentForList.bind(this)),
          null,
          currentDocKey
        );
      } else if (!backgroundRefresh) {
        // Document no longer in queue and this isn't a background refresh
        this.selectedDocument = null;
        if (this.documentDetail) {
          this.documentDetail.clear();
        }
      }
    }
    
  } catch (error) {
    console.error('[CorpusApprovalsView] Error loading approval queue:', error);
    if (!backgroundRefresh) {
      this.errorModal.show({
        title: 'Error Loading Queue',
        message: error.message || 'Failed to load approval queue'
      });
    }
  } finally {
    if (!backgroundRefresh) {
      this.setLoading(false, '#queue-list-container');
    }
  }
}

/**
 * Normalizes document data for CorpusDocumentList to avoid the 'split' error
 */
normalizeDocumentForList(doc) {
  // Extract filename from document key if name is not available
  const documentKey = doc.documentKey || doc.document_key;
  let name = doc.documentName || doc.name;
  if (!name && documentKey) {
    // Extract filename from the document key path
    const keyParts = documentKey.split('/');
    name = keyParts[keyParts.length - 1] || 'Unnamed Document';
  }
  
  return {
    documentKey: documentKey,
    name: name, // This is the key field that was causing the error
    type: doc.documentType || doc.type || '',
    topic: doc.topic || '',
    lastModified: doc.modifiedDatetime || doc.modified_datetime || doc.submitted || '',
    size: doc.size || 0,
    status: doc.documentStatus || doc.status || 'UNKNOWN',
    author: doc.author || '',
    // Include these fields for approval status
    currentReviewer: doc.currentReviewer || doc.current_reviewer,
    corpus: doc.corpus,
    aiScore: doc.aiMetrics?.overall_score || doc.ai_metrics?.overall_score || 0,
    s3VersionId: doc.s3VersionId || doc.s3_version_id,
    // Store original data for reference
    _original: doc
  };
}

  sortQueue() {
    if (!this.queue?.length) return;

    this.queue.sort((a, b) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];

      // Handle undefined values
      if (valA === undefined) valA = '';
      if (valB === undefined) valB = '';

      // Special handling for dates
      if (['submitted', 'lastModified', 'created'].includes(this.sortField)) {
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
   * Renders the queue list with proper selectors for event handlers
   */
  renderQueueList() {
    const queueListBody = this.containerEl?.querySelector('.file-browser-body');
    if (!queueListBody) {
      console.error('[CorpusApprovalsView] Queue list body container not found');
      return;
    }

    if (!this.queue || this.queue.length === 0) {
      queueListBody.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard-check"></i>
        <p>No documents found in approval queue</p>
      </div>
    `;
      return;
    }

    console.log('[CorpusApprovalsView] Rendering queue list with items:', this.queue.length);
    let content = '';

    // Render queue items
    this.queue.forEach(doc => {
      // Handle field name differences between API and component
      const documentKey = doc.documentKey || doc.document_key;
      const documentName = doc.documentName || doc.name;
      const documentStatus = doc.documentStatus || doc.status;
      const currentReviewer = doc.currentReviewer || doc.current_reviewer;
      const aiMetrics = doc.aiMetrics || doc.ai_metrics;
      const contentType = doc.contentType || doc.content_type;
      const corpusValue = doc.corpus;
      const topicValue = doc.topic;
      const typeValue = doc.documentType || doc.type;
      const submitted = doc.modifiedDatetime || doc.modified_datetime || doc.submitted;
      const authorValue = doc.author;
      const versionId = doc.s3VersionId || doc.s3_version_id || '';

      // Get file extension from document name or file path
      const fileExtension = documentName
        ? documentName.split('.').pop() || ''
        : (doc.corpusDocumentKey || doc.corpus_document_key || '').split('.').pop() || '';

      // AI score from metadata
      const aiScore = aiMetrics ? aiMetrics.overall_score : (doc.ai_score || 0);

      // Determine selection state
      const isSelected = this.selectedDocument &&
        (this.selectedDocument.documentKey === documentKey);

      // Determine claim state
      const username = this.store.get('username');
      const isClaimed = currentReviewer !== null && currentReviewer !== undefined;
      const isClaimedByMe = currentReviewer === username;
      const formattedSubmitted = submitted ? formatHumanReadableDate(submitted, true) : '-';
      const status = this.formatStatus(documentStatus, currentReviewer);
      const aiScoreClass = this.getAIScoreClass(aiScore);

      // Special class for documents claimed by current user
      const claimClass = isClaimedByMe ? 'claimed-by-me' :
        (isClaimed ? 'is-claimed' : '');

      content += `
      <div class="file-browser-row queue-item ${isSelected ? 'selected' : ''} ${claimClass}" 
           data-document-key="${documentKey}"
           data-version-id="${versionId}">
        <div class="file-name">
          <span class="file-icon">
            <i class="fas ${getFileIconClass(fileExtension)}"></i>
          </span>
          <span class="file-name-text" title="${documentName || 'Unknown'}">${documentName || 'Unknown'}</span>
          ${isClaimedByMe ? '<span class="review-badge">In Review by Me</span>' : ''}
        </div>
        <div class="file-corpus" title="${corpusValue || '-'}">${corpusValue || '-'}</div>
        <div class="file-topic" title="${topicValue || '-'}">${topicValue || '-'}</div>
        <div class="file-type" title="${typeValue || '-'}">${typeValue || '-'}</div>
        <div class="file-submitted" title="${submitted ? formatHumanReadableDate(submitted, false) : '-'}">${formattedSubmitted}</div>
        <div class="file-author" title="${authorValue || '-'}">${authorValue || '-'}</div>
        <div class="file-ai-score ${aiScoreClass}" title="AI Review Score: ${aiScore}/100">${aiScore}</div>
        <div class="file-status">
          <span class="status-pill ${this.getStatusClass(documentStatus, currentReviewer)}">
            ${status}
          </span>
        </div>
      </div>
    `;
    });

    queueListBody.innerHTML = content;
  }

  updateQueueCounts() {
    const waitingCount = this.countByStatus('waiting');
    const inReviewCount = this.countByStatus('in-review');
    const completedCount = this.countByStatus('completed');

    const waitingPill = this.containerEl?.querySelector('.queue-status-pills .status-waiting');
    const inReviewPill = this.containerEl?.querySelector('.queue-status-pills .status-in-review');
    const completedPill = this.containerEl?.querySelector('.queue-status-pills .status-completed');

    if (waitingPill) waitingPill.textContent = `Waiting: ${waitingCount}`;
    if (inReviewPill) inReviewPill.textContent = `In Review: ${inReviewCount}`;
    if (completedPill) completedPill.textContent = `Completed: ${completedCount}`;
  }

  updateFilterOptions() {
    // Extract unique values for filter dropdowns
    this.availableCorpora = [...new Set(this.queue.map(doc => doc.corpus).filter(Boolean))];
    this.availableTopics = [...new Set(this.queue.map(doc => doc.topic).filter(Boolean))];
    this.availableTypes = [...new Set(this.queue.map(doc => doc.type).filter(Boolean))];

    // Update filter dropdowns if they exist
    // In a real implementation, this would update the filter component
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

    // Initialize document detail with approval mode
    this.documentDetail = new CorpusDocumentDetail({
      container: this.documentDetailContainer,
      viewMode: 'approvals-view',
      includeReviewerNote: true,
      onActionClick: (action, documentKey, versionId, note) => {
        this.handleDocumentAction(action, documentKey, versionId, note);
      },
      onTabChange: (tab) => {
        if (tab === 'changes' && !this.diffLoaded && this.selectedDocument) {
          this.loadDiff();
        }
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
   * Handles document action button clicks from CorpusDocumentDetail
   */
  handleDocumentAction(action, documentKey, versionId, note) {
    console.log(`[CorpusApprovalsView] Document action: ${action} for ${documentKey}, note: ${note}`);

    switch (action) {
      case 'approve':
        this.handleApprove(documentKey, versionId, note);
        break;
      case 'reject':
        this.handleReject(documentKey, versionId, note);
        break;
      case 'release':
        this.handleRelease(documentKey, versionId);
        break;
      case 'view-history':
        this.viewDocumentHistory(documentKey);
        break;
      case 'download':
        this.downloadDocument(documentKey);
        break;
      default:
        console.warn(`[CorpusApprovalsView] Unknown action: ${action}`);
    }
  }

/**
 * Update document selection to properly initialize the detail component
 */
async selectDocument(documentKey, versionId) {
  try {
    this.setLoading(true, '#document-detail-container');
    
    // Find the document in the queue
    const document = this.queue.find(doc => 
      (doc.documentKey || doc.document_key) === documentKey
    );
    
    if (!document) {
      console.error(`Document not found in queue: ${documentKey}`);
      this.errorModal.show({
        title: 'Error',
        message: 'The selected document was not found in the approval queue.'
      });
      return;
    }

    // Normalize document fields
    const normalizedDoc = this.normalizeDocumentFields(document);
    const username = this.store.get('username');
    const isClaimedByMe = normalizedDoc.currentReviewer === username;
    
    // Set as selected document immediately
    this.selectedDocument = normalizedDoc;
    
    // Get full document details
    const details = await getCorpusDocumentDetails({
      documentKey,
      versionId: normalizedDoc.s3VersionId || normalizedDoc.versionId || versionId
    });
    
    // Normalize details fields
    const normalizedDetails = this.normalizeDocumentFields(details);
    
    // Set document with temporary claiming status
    this.selectedDocument = { 
      ...normalizedDoc, 
      ...normalizedDetails,
      viewMode: 'approvals-view',
      currentReviewer: normalizedDoc.currentReviewer,
      status: normalizedDoc.status,
      _isClaimInProgress: false // Track claim state
    };
    
    // Set document in detail component right away
    if (this.documentDetail) {
      this.selectedDocument.store = this.store;
      const security = getFreshSecurity(this.store);
      this.documentDetail.setDocument(this.selectedDocument, security);
    } else {
      this.initializeApprovalComponents();
      
      if (this.documentDetail) {
        this.selectedDocument.store = this.store;
        const security = getFreshSecurity(this.store);
        this.documentDetail.setDocument(this.selectedDocument, security); 
      } else {
        console.error('[CorpusApprovalsView] Failed to initialize document detail component');
      }
    }
    
    this.diffLoaded = false;
    this.diffNeedsRefresh = true;
    
    // Reset loading state now that document is displayed
    this.setLoading(false, '#document-detail-container');

    // IMPORTANT: Start claiming process in the background
    if (normalizedDoc.status === 'PENDING_HUMAN' && !normalizedDoc.currentReviewer) {
      // Mark claiming in progress
      this.selectedDocument._isClaimInProgress = true;
      
      // Update buttons state to show claiming in progress
      this.updateButtonStates(true);
      
      try {
        console.log('[CorpusApprovalsView] Claiming document (background):', documentKey);
        
        const claimResponse = await claimCorpusDocument({
          documentKey,
          versionId: normalizedDoc.s3VersionId || normalizedDoc.versionId || versionId
        });
        
        console.log('[CorpusApprovalsView] Claim response:', claimResponse);
        
        // Update document with claimed status
        this.selectedDocument.currentReviewer = username;
        this.selectedDocument.status = 'PENDING_HUMAN_IN_REVIEW';
        this.selectedDocument._isClaimInProgress = false;
        
        // Update buttons to reflect claimed state
        this.updateButtonStates(false);
        
        // Refresh the document detail to show updated status
        if (this.documentDetail) {
          const security = getFreshSecurity(this.store);
          this.documentDetail.setDocument(this.selectedDocument, security);
        }
        
        // Refresh queue in background
        this.loadApprovalQueue(true, true);
      } catch (claimError) {
        console.error('[CorpusApprovalsView] Error claiming document:', claimError);
        this.selectedDocument._isClaimInProgress = false;
        this.updateButtonStates(false);
        
        // Show a message modal for claim conflicts (less disruptive than error modal)
        this.messageModal.show({
          title: 'Document Already Claimed',
          message: claimError.message || 'This document is already being reviewed by another user.'
        });
      }
    }

  } catch (error) {
    console.error('[CorpusApprovalsView] Error selecting document:', error);
    this.errorModal.show({
      title: 'Error Loading Document',
      message: error.message || 'Failed to load document details'
    });
    this.setLoading(false, '#document-detail-container');
  }
}

// Add this helper method for button state management
updateButtonStates(isClaimInProgress) {
  // Find the approve/reject buttons
  const approveButton = this.containerEl?.querySelector('[data-action="approve"]');
  const rejectButton = this.containerEl?.querySelector('[data-action="reject"]');
  
  if (approveButton) {
    if (isClaimInProgress) {
      approveButton.disabled = true;
      approveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Claiming...';
    } else {
      approveButton.disabled = false;
      approveButton.innerHTML = '<i class="fas fa-check"></i> Approve';
    }
  }
  
  if (rejectButton) {
    if (isClaimInProgress) {
      rejectButton.disabled = true;
      rejectButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Claiming...';
    } else {
      rejectButton.disabled = false;
      rejectButton.innerHTML = '<i class="fas fa-times"></i> Reject';
    }
  }
}

  /**
   * Normalizes document fields to handle different API response formats
   */
  normalizeDocumentFields(doc) {
    if (!doc) return {};

    return {
      // Basic metadata
      documentKey: doc.documentKey || doc.document_key,
      documentName: doc.documentName || doc.name || this.getFileNameFromKey(doc.documentKey || doc.document_key || ''),
      content: doc.content,

      // Version info
      s3VersionId: doc.s3VersionId || doc.s3_version_id || doc.versionId || doc.version_id,
      versionId: doc.versionId || doc.version_id || doc.s3VersionId || doc.s3_version_id,

      // Content metadata
      contentType: doc.contentType || doc.content_type,
      size: doc.size,

      // Status
      status: doc.status || doc.documentStatus || 'UNKNOWN',
      currentReviewer: doc.currentReviewer || doc.current_reviewer,

      // Classification
      corpus: doc.corpus,
      topic: doc.topic || doc.documentTopic,
      type: doc.type || doc.documentType,

      // Timestamps
      lastModified: doc.lastModified || doc.modified_datetime || doc.modifiedDatetime,
      created: doc.created || doc.created_datetime || doc.createdDatetime,

      // Author
      author: doc.author,

      // Approval info
      aiMetrics: doc.aiMetrics || doc.ai_metrics,
      approvalHistory: doc.approvalHistory || doc.approval_history || [],
      tokenChangeRatio: doc.tokenChangeRatio || doc.token_change_ratio,
      currentApproverGroup: doc.currentApproverGroup || doc.current_approver_group,

      // Original reference - keep for compatibility
      _original: doc
    };
  }

  renderDocumentDetail() {
    if (!this.selectedDocument) {
      this.clearDetail();
      return;
    }

    // Render tabs content
    this.renderPreviewTab();
    // Changes tab is rendered on demand when the tab is selected
    this.renderMetricsTab();

    // Render metadata
    this.renderMetadataPanel();

    // Render approval actions
    this.renderApprovalActions();
  }

  clearDetail() {
    // Clear preview tab
    const previewTab = this.containerEl?.querySelector('#preview-tab');
    if (previewTab) {
      previewTab.innerHTML = `
      <div class="detail-pane-placeholder">
        <p>Select a document to review</p>
      </div>
    `;
    }

    // Clear changes tab
    const changesTab = this.containerEl?.querySelector('#changes-tab');
    if (changesTab) {
      changesTab.innerHTML = '';
    }

    // Clear metrics tab
    const metricsTab = this.containerEl?.querySelector('#metrics-tab');
    if (metricsTab) {
      metricsTab.innerHTML = '';
    }

    // Clear metadata
    const metadataContainer = this.containerEl?.querySelector('#metadata-container');
    if (metadataContainer) {
      metadataContainer.innerHTML = '';
    }

    // Clear approval actions
    const actionsContainer = this.containerEl?.querySelector('#approval-actions-container');
    if (actionsContainer) {
      actionsContainer.innerHTML = `
      <div class="empty-state">
        <p>Select a document to review</p>
      </div>
    `;
    }
  }

  renderPreviewTab() {
    const previewTab = this.containerEl?.querySelector('#preview-tab');
    if (!previewTab || !this.selectedDocument) return;

    // Extract filename from documentKey if name is not available
    let fileExtension = '';
    const documentName = this.selectedDocument.name || this.selectedDocument.documentName;

    if (documentName) {
      fileExtension = documentName.split('.').pop().toLowerCase();
    } else {
      // Extract extension from documentKey
      const documentKey = this.selectedDocument.documentKey || '';
      const keyParts = documentKey.split('/');
      const fileName = keyParts[keyParts.length - 1] || '';
      fileExtension = fileName.split('.').pop().toLowerCase();
    }

    // Get the appropriate content
    const documentContent = this.selectedDocument.content;

    if (['txt', 'md', 'html', 'csv'].includes(fileExtension)) {
      if (documentContent) {
        if (fileExtension === 'md') {
          // Use Marked.js to render markdown
          try {
            const renderedMarkdown = marked.parse(documentContent);
            previewTab.innerHTML = `<div class="markdown-preview">${renderedMarkdown}</div>`;
          } catch (error) {
            console.error('Error rendering markdown:', error);
            previewTab.innerHTML = `<pre class="text-preview">${escapeHtml(documentContent)}</pre>`;
          }
        } else if (fileExtension === 'html') {
          previewTab.innerHTML = `<iframe srcdoc="${escapeHtml(documentContent)}" class="html-preview"></iframe>`;
        } else if (fileExtension === 'csv') {
          previewTab.innerHTML = this.formatCSV(documentContent);
        } else {
          previewTab.innerHTML = `<pre class="text-preview">${escapeHtml(documentContent)}</pre>`;
        }
      } else {
        previewTab.innerHTML = `<p>Content preview not available. Click Download to view the document.</p>`;
      }
    } else {
      // Extract displayName for binary files
      const displayName = documentName || this.getFileNameFromKey(this.selectedDocument.documentKey || '');

      // Binary files preview
      previewTab.innerHTML = `
        <div class="binary-preview">
          <div class="file-icon">
            <i class="fas ${getFileIconClass(fileExtension)} fa-5x"></i>
          </div>
          <p>${displayName}</p>
          <div class="file-size">${formatFileSize(this.selectedDocument.size)}</div>
        </div>
      `;
    }
  }

  // Helper to extract filename from document key
  getFileNameFromKey(documentKey) {
    if (!documentKey) return 'Unknown';
    const parts = documentKey.split('/');
    return parts[parts.length - 1] || 'Unknown';
  }

  async renderChangesTab() {
    const changesTab = this.containerEl?.querySelector('#changes-tab');
    if (!changesTab || !this.selectedDocument) return;

    // Check if this is the first version (no previous version to compare with)
    const isFirstVersion = this.selectedDocument.tokenChangeRatio === 1.0;

    if (isFirstVersion) {
      changesTab.innerHTML = `
        <div class="info-message">
          <i class="fas fa-info-circle"></i>
          <p>This is the first version of this document. No previous version exists for comparison.</p>
        </div>
      `;
      this.diffLoaded = true; // Mark as loaded to prevent further attempts
      return;
    }

    // Check if we need to load the diff
    if (!this.diffLoaded) {
      changesTab.innerHTML = `
      <div class="diff-toolbar">
        <button id="toggle-diff-highlights" class="btn btn--sm">
          <i class="fas fa-highlighter"></i> ${this.showDiffHighlights ? 'Hide' : 'Show'} Highlights
        </button>
        <div class="diff-version-selector">
          <label for="diff-version-selector">Compare with:</label>
          <select id="diff-version-selector">
            <option value="lastApproved" selected>Last Approved Version</option>
            <!-- Version options will be populated from API -->
            <option value="loading">Loading versions...</option>
          </select>
        </div>
        <a href="#" id="download-full-diff" class="diff-download-link">Download Full Diff</a>
      </div>
      <div class="diff-container">
        <div class="loading-state-corpus">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading diff...</div>
        </div>
      </div>
    `;

      try {
        // Load document versions for the selector
        await this.loadDocumentVersions();

        // Load the diff with the last approved version
        await this.loadDiff();
      } catch (error) {
        console.error('[CorpusApprovalsView] Error loading diff:', error);
        changesTab.querySelector('.diff-container').innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error loading document differences. ${error.message || ''}</p>
        </div>
      `;
      }
    }

    // Re-attach event listeners to diff controls
    const diffToggle = changesTab.querySelector('#toggle-diff-highlights');
    if (diffToggle) {
      this.addListener(diffToggle, 'click', () => {
        this.toggleDiffHighlights();
      });
    }

    const versionSelector = changesTab.querySelector('#diff-version-selector');
    if (versionSelector) {
      this.addListener(versionSelector, 'change', () => {
        const selectedVersionId = versionSelector.value;
        this.loadDiff(selectedVersionId);
      });
    }
  }

  async loadDocumentVersions() {
    if (!this.selectedDocument) return;

    // This would be a call to list document versions
    // For now, we'll use dummy data
    const versions = [
      { versionId: 'v1', timestamp: '2025-04-01T12:00:00Z', author: 'johne', status: 'APPROVED' },
      { versionId: 'v2', timestamp: '2025-04-15T14:30:00Z', author: 'johne', status: 'APPROVED' },
      { versionId: 'v3', timestamp: '2025-05-01T10:15:00Z', author: 'johne', status: 'APPROVED' }
    ];

    // Update the version selector
    const versionSelector = this.containerEl?.querySelector('#diff-version-selector');
    if (versionSelector) {
      versionSelector.innerHTML = `
      <option value="lastApproved" selected>Last Approved Version</option>
      ${versions.map(v => `
        <option value="${v.versionId}">
          ${formatHumanReadableDate(v.timestamp, false)} by ${v.author}
        </option>
      `).join('')}
    `;
    }
  }

  async loadDiff(compareWithVersionId = 'lastApproved') {
    if (!this.selectedDocument) return;

    try {
      // Check if this is the first version (no previous version to compare with)
      const isFirstVersion = this.selectedDocument.tokenChangeRatio === 1.0 || 
                            !this.selectedDocument.previousVersions || 
                            this.selectedDocument.previousVersions.length === 0;


      if (isFirstVersion) {
        // Display message instead of attempting to load diff
        if (this.documentDetail) {
          this.documentDetail.setDiffContent(`
            <div class="info-message">
              <i class="fas fa-info-circle"></i>
              <p>This is the first version of this document. No previous version exists for comparison.</p>
            </div>
          `);
        }
        this.diffLoaded = true;
        return;
      }

      // Call API to get diff
      const diffResponse = await getCorpusDocumentDiff({
        documentKey: this.selectedDocument.documentKey,
        newVersionId: this.selectedDocument.s3VersionId,
        oldVersionId: compareWithVersionId === 'lastApproved' ? null : compareWithVersionId,
        base: compareWithVersionId === 'lastApproved' ? 'lastApproved' : null
      });

      console.log('[CorpusApprovalsView] Diff response:', diffResponse);

      // Update diff content in document detail component
      if (this.documentDetail) {
        this.documentDetail.setDiffContent(diffResponse.htmlDiff, diffResponse.diffStats);
      }

      this.diffLoaded = true;

    } catch (error) {
      console.error('[CorpusApprovalsView] Error loading diff:', error);
      // Display error in detail component
      if (this.documentDetail && this.documentDetail.activeTab === 'changes') {
        this.documentDetail.setDiffContent(`
          <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error loading document differences. ${error.message || ''}</p>
          </div>
        `);
      }
    }
  }

  toggleDiffHighlights() {
    this.showDiffHighlights = !this.showDiffHighlights;

    // Update toggle button text
    const diffToggle = this.containerEl?.querySelector('#toggle-diff-highlights');
    if (diffToggle) {
      diffToggle.innerHTML = `<i class="fas fa-highlighter"></i> ${this.showDiffHighlights ? 'Hide' : 'Show'} Highlights`;
    }

    // Toggle class on diff content
    const diffContent = this.containerEl?.querySelector('.diff-content');
    if (diffContent) {
      diffContent.classList.toggle('hide-highlights', !this.showDiffHighlights);
    }
  }

  renderMetricsTab() {
    const metricsTab = this.containerEl?.querySelector('#metrics-tab');
    if (!metricsTab || !this.selectedDocument) return;

    if (!this.selectedDocument.ai_metrics) {
      metricsTab.innerHTML = `
      <div class="info-message">
        <i class="fas fa-info-circle"></i>
        <p>AI metrics not available for this document.</p>
      </div>
    `;
      return;
    }

    const metrics = this.selectedDocument.ai_metrics;

    metricsTab.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card ${this.getScoreClass(metrics.overall_score)}">
        <div class="metric-value">${metrics.overall_score}</div>
        <div class="metric-label">Overall Score</div>
      </div>
      <div class="metric-card ${this.getScoreClass(metrics.grammar_score)}">
        <div class="metric-value">${metrics.grammar_score}</div>
        <div class="metric-label">Grammar</div>
      </div>
      <div class="metric-card ${this.getScoreClass(metrics.spelling_score)}">
        <div class="metric-value">${metrics.spelling_score}</div>
        <div class="metric-label">Spelling</div>
      </div>
      <div class="metric-card ${this.getScoreClass(metrics.customer_centric_score)}">
        <div class="metric-value">${metrics.customer_centric_score}</div>
        <div class="metric-label">Customer-Centric</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${metrics.tone_balance_index}</div>
        <div class="metric-label">Tone Balance</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${(metrics.confidence * 100).toFixed(0)}</div>
        <div class="metric-label">Confidence</div>
      </div>
    </div>
    
    ${metrics.blocked ? `
      <div class="blocked-alert">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Document contains blocked subtopics</span>
      </div>
    ` : ''}
    
    ${metrics.subtopic_breakdown && Object.keys(metrics.subtopic_breakdown).length > 0 ? `
      <div class="subtopic-breakdown">
        <h5>Subtopic Breakdown</h5>
        <ul>
          ${Object.entries(metrics.subtopic_breakdown)
          .map(([topic, coverage]) =>
            `<li>${topic}: ${(coverage * 100).toFixed(0)}%</li>`)
          .join('')}
        </ul>
      </div>
    ` : ''}
  `;
  }

  getScoreClass(score) {
    if (score >= 90) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-average';
    return 'score-poor';
  }

  renderMetadataPanel() {
    const metadataContainer = this.containerEl?.querySelector('#metadata-container');
    if (!metadataContainer || !this.selectedDocument) return;

    // Determine token change ratio display
    const tokenChangeRatio = this.selectedDocument.token_change_ratio !== undefined
      ? `${(this.selectedDocument.token_change_ratio * 100).toFixed(2)}%`
      : 'N/A';

    // Extract the author - might be in different locations based on API
    const authorValue = this.selectedDocument.author ||
      (this.selectedDocument.metadata && this.selectedDocument.metadata.author) ||
      '-';

    metadataContainer.innerHTML = `
    <div class="document-metadata-grid">
      <div class="metadata-card">
        <div class="metadata-label">Topic</div>
        <div class="metadata-value">${this.selectedDocument.topic || '-'}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Type</div>
        <div class="metadata-value">${this.selectedDocument.type || '-'}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Size</div>
        <div class="metadata-value">${formatFileSize(this.selectedDocument.size)}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Submitted</div>
        <div class="metadata-value">${this.selectedDocument.submitted ? formatHumanReadableDate(this.selectedDocument.submitted, true) : '-'}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Author</div>
        <div class="metadata-value">${authorValue}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Token Δ</div>
        <div class="metadata-value">${tokenChangeRatio}</div>
      </div>
      ${this.selectedDocument.ai_metrics ? `
        <div class="metadata-card">
          <div class="metadata-label">AI Score</div>
          <div class="metadata-value">${this.selectedDocument.ai_metrics.overall_score}/100</div>
        </div>
      ` : ''}
      ${this.selectedDocument.current_reviewer ? `
        <div class="metadata-card">
          <div class="metadata-label">Current Reviewer</div>
          <div class="metadata-value">${this.selectedDocument.current_reviewer}</div>
        </div>
      ` : ''}
    </div>
  `;
  }

  renderApprovalActions() {
    const actionsContainer = this.containerEl?.querySelector('#approval-actions-container');
    if (!actionsContainer || !this.selectedDocument) return;

    // Check user permissions
    const security = getFreshSecurity(this.store);
    const canApprove = this.canApproveDocument(security);
    const username = this.store.get('username');
    const isClaimedByMe = this.selectedDocument.current_reviewer === username;
    const isPendingHuman = this.selectedDocument.status === 'PENDING_HUMAN' || this.selectedDocument.status === 'PENDING_HUMAN_IN_REVIEW';

    actionsContainer.innerHTML = `
    <div class="reviewer-note">
      <label for="reviewerNote">Reviewer note ${canApprove && isClaimedByMe ? '(required if rejecting)' : ''}</label>
      <div>
        <textarea id="reviewerNote" ${!canApprove || !isClaimedByMe ? 'disabled' : ''}></textarea>
      </div>
    </div>
    
    <div class="approval-actions">
      <div class="primary-actions">
        ${canApprove && isClaimedByMe && isPendingHuman ? `
          <button class="btn btn--success" data-action="approve">
            <i class="fas fa-check"></i> Approve
          </button>
          <button class="btn btn--danger" data-action="reject">
            <i class="fas fa-times"></i> Reject
          </button>
        ` : ''}
        
        ${isClaimedByMe && isPendingHuman ? `
          <button class="btn btn--secondary" data-action="release">
            <i class="fas fa-undo"></i> Return to Queue
          </button>
        ` : ''}
      </div>
      
      <div class="secondary-actions">
        <button class="btn btn--secondary" data-action="view-history">
          <i class="fas fa-history"></i> View History
        </button>
        <button class="btn btn--secondary" data-action="download">
          <i class="fas fa-download"></i> Download
        </button>
        ${this.selectedDocument.ai_metrics ? `
          <button class="btn btn--secondary" data-action="copy-metrics">
            <i class="fas fa-copy"></i> Copy AI Metrics
          </button>
        ` : ''}
      </div>
    </div>
  `;

    // Attach event listeners to action buttons
    const approveButton = actionsContainer.querySelector('[data-action="approve"]');
    if (approveButton) {
      this.addListener(approveButton, 'click', () => {
        this.handleApprove();
      });
    }

    const rejectButton = actionsContainer.querySelector('[data-action="reject"]');
    if (rejectButton) {
      this.addListener(rejectButton, 'click', () => {
        this.handleReject();
      });
    }

    const releaseButton = actionsContainer.querySelector('[data-action="release"]');
    if (releaseButton) {
      this.addListener(releaseButton, 'click', () => {
        this.handleRelease();
      });
    }

    const historyButton = actionsContainer.querySelector('[data-action="view-history"]');
    if (historyButton) {
      this.addListener(historyButton, 'click', () => {
        this.viewDocumentHistory();
      });
    }

    const downloadButton = actionsContainer.querySelector('[data-action="download"]');
    if (downloadButton) {
      this.addListener(downloadButton, 'click', () => {
        this.downloadDocument();
      });
    }
  }

  canApproveDocument(security) {
    if (!this.selectedDocument || !security) return false;

    // Check if the user has the DOCUMENT_APPROVER permission for this corpus
    const hasPermission = security.hasCorpusPermission(
      this.selectedDocument.corpus || 'rfp',
      'DOCUMENT_APPROVER'
    );

    // Document must be in PENDING_HUMAN status
    const isPending = this.selectedDocument.status === 'PENDING_HUMAN' || this.selectedDocument.status === 'PENDING_HUMAN_IN_REVIEW';

    return hasPermission && isPending;
  }

  /**
   * Handles document approval
   */
  async handleApprove(documentKey, versionId, note) {
    // Check if claiming is in progress
    if (this.selectedDocument && this.selectedDocument._isClaimInProgress) {
      this.messageModal.show({
        title: 'Please Wait',
        message: 'The document is still being claimed. Please wait a moment and try again.'
      });
      return;
    }

    if (!documentKey) {
      documentKey = this.selectedDocument?.documentKey;
      versionId = this.selectedDocument?.s3VersionId || this.selectedDocument?.versionId;
    }

    console.log('[CorpusApprovalsView] Approving document:', {
      documentKey, versionId, noteLength: note?.length
    });

    if (!documentKey) {
      console.error('[CorpusApprovalsView] No document selected for approval');
      return;
    }

    // If no note provided, try to get it from the reviewer note textarea
    if (!note) {
      const noteTextarea = this.containerEl?.querySelector('#reviewerNote');
      note = noteTextarea ? noteTextarea.value.trim() : '';
    }

    // Show confirmation dialog
    this.confirmModal.show({
      title: 'Approve Document',
      message: 'Are you sure you want to approve this document?',
      onYes: async () => {
        try {
          this.setLoading(true, '#document-detail-container');

          // Call API to approve document
          const response = await approveCorpusDocument({
            documentKey,
            versionId,
            note
          });

          console.log('[CorpusApprovalsView] Approve response:', response);

          this.messageModal.show({
            title: 'Success',
            message: 'Document approved successfully.'
          });

          // Refresh queue to update status
          await this.loadApprovalQueue(true);

          // Clear selection
          this.selectedDocument = null;
          if (this.documentDetail) {
            this.documentDetail.clear();
          }

        } catch (error) {
          console.error('[CorpusApprovalsView] Error approving document:', error);
          this.errorModal.show({
            title: 'Error',
            message: error.message || 'Failed to approve document.'
          });
        } finally {
          this.setLoading(false, '#document-detail-container');
        }
      }
    });
  }

  /**
   * Handles document rejection
   */
  async handleReject(documentKey, versionId, note) {
    // Check if claiming is in progress
    if (this.selectedDocument && this.selectedDocument._isClaimInProgress) {
      this.messageModal.show({
        title: 'Please Wait',
        message: 'The document is still being claimed. Please wait a moment and try again.'
      });
      return;
    }
    
    if (!documentKey) {
      documentKey = this.selectedDocument?.documentKey;
      versionId = this.selectedDocument?.s3VersionId || this.selectedDocument?.versionId;
    }

    console.log('[CorpusApprovalsView] Rejecting document:', {
      documentKey, versionId, noteLength: note?.length
    });

    if (!documentKey) {
      console.error('[CorpusApprovalsView] No document selected for rejection');
      return;
    }

    // If no note provided, try to get it from the reviewer note textarea
    if (!note) {
      const noteTextarea = this.containerEl?.querySelector('#reviewerNote');
      note = noteTextarea ? noteTextarea.value.trim() : '';
    }

    // Validate note - required for rejection
    if (!note) {
      this.errorModal.show({
        title: 'Note Required',
        message: 'Please provide a note explaining why the document is being rejected.'
      });
      return;
    }

    // Show confirmation dialog
    this.confirmModal.show({
      title: 'Reject Document',
      message: 'Are you sure you want to reject this document?',
      onYes: async () => {
        try {
          this.setLoading(true, '#document-detail-container');

          // Call API to reject document with all parameters logged for debugging
          console.log('[CorpusApprovalsView] Calling rejectCorpusDocument with:', {
            documentKey, versionId, noteLength: note?.length
          });

          // Call API to reject document
          const response = await rejectCorpusDocument({
            documentKey,
            versionId,
            note
          });

          console.log('[CorpusApprovalsView] Reject response:', response);

          this.messageModal.show({
            title: 'Success',
            message: 'Document rejected successfully.'
          });

          // Refresh queue to update status
          await this.loadApprovalQueue(true);

          // Clear selection
          this.selectedDocument = null;
          if (this.documentDetail) {
            this.documentDetail.clear();
          }

        } catch (error) {
          console.error('[CorpusApprovalsView] Error rejecting document:', error);
          this.errorModal.show({
            title: 'Error',
            message: error.message || 'Failed to reject document.'
          });
        } finally {
          this.setLoading(false, '#document-detail-container');
        }
      }
    });
  }

  /**
   * Handles releasing a document back to the queue
   */
  async handleRelease(documentKey, versionId) {
    if (!documentKey) {
      documentKey = this.selectedDocument?.documentKey;
      versionId = this.selectedDocument?.s3VersionId || this.selectedDocument?.versionId;
    }

    console.log('[CorpusApprovalsView] Releasing document:', {
      documentKey, versionId, noteLength: note?.length
    });

    if (!documentKey) {
      console.error('[CorpusApprovalsView] No document selected for release');
      return;
    }

    try {
      console.log(`[CorpusApprovalsView] Releasing document: ${documentKey}`);
      this.setLoading(true, '#document-detail-container');

      // Call API to release document
      const response = await releaseCorpusDocument({
        documentKey,
        versionId
      });

      console.log('[CorpusApprovalsView] Release response:', response);

      // Refresh queue to update status
      await this.loadApprovalQueue(true);

      // Clear selection
      this.selectedDocument = null;
      if (this.documentDetail) {
        this.documentDetail.clear();
      }

      this.messageModal.show({
        title: 'Success',
        message: 'Document returned to queue.'
      });

    } catch (error) {
      console.error('[CorpusApprovalsView] Error releasing document:', error);
      this.errorModal.show({
        title: 'Error',
        message: error.message || 'Failed to return document to queue.'
      });
    } finally {
      this.setLoading(false, '#document-detail-container');
    }
  }

  /**
   * Opens document version history modal
   */
  viewDocumentHistory(documentKey) {
    if (!documentKey) {
      documentKey = this.selectedDocument?.documentKey;
    }

    if (!documentKey) {
      console.error('[CorpusApprovalsView] No document selected for history view');
      return;
    }

    // Create and show the history modal
    const historyModal = new CorpusDocumentHistoryModal();
    historyModal.show({
      documentKey: documentKey,
      displayName: this.selectedDocument?.documentName || 'Document'
    });
  }

  /**
   * Downloads the current document
   */
  downloadDocument(documentKey) {
    if (!documentKey) {
      documentKey = this.selectedDocument?.documentKey;
    }

    if (!documentKey) {
      console.error('[CorpusApprovalsView] No document selected for download');
      return;
    }

    const corpus = this.selectedDocument?.corpus || 'rfp';

    const downloadUrl = `/api/corpus/documents/download?documentKey=${encodeURIComponent(documentKey)}&corpus=${encodeURIComponent(corpus)}`;

    console.log(`[CorpusApprovalsView] Downloading document: ${downloadUrl}`);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = this.selectedDocument?.documentName || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  switchTab(tab) {
    if (this.activeTab === tab) return;

    this.activeTab = tab;

    // Update tab buttons
    const tabButtons = this.containerEl?.querySelectorAll('.tab-button');
    if (tabButtons) {
      tabButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tab);
      });
    }

    // Update tab panes
    const tabPanes = this.containerEl?.querySelectorAll('.tab-pane');
    if (tabPanes) {
      tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tab}-tab`);
      });
    }

    // Load content for the tab if needed
    if (tab === 'changes' && this.selectedDocument && !this.diffLoaded) {
      this.renderChangesTab();
    }
  }

  getStatusClass(status, reviewer = null) {
    if (!status) return '';

    // Normalize status to uppercase for consistent comparison
    const normalizedStatus = status.toUpperCase();

    // Special handling for in-review state
    if (normalizedStatus === 'PENDING_HUMAN' && reviewer || normalizedStatus === 'PENDING_HUMAN_IN_REVIEW' && reviewer) {
      return 'status-in-review';
    }

    const statusMapping = {
      'DRAFT': 'status-draft',
      'PENDING_AI': 'status-pending_ai',
      'PENDING_HUMAN': 'status-pending_human',
      'PENDING_HUMAN_IN_REVIEW': 'status-pending_human',
      'APPROVED': 'status-approved',
      'REJECTED': 'status-rejected',
      'DELETED': 'status-deleted'
    };

    return statusMapping[normalizedStatus] || '';
  }

  formatStatus(status, reviewer = null) {
    if (!status) return 'Unknown';

    // Normalize status to uppercase for consistent comparison
    const normalizedStatus = status.toUpperCase();

    if (normalizedStatus === 'PENDING_HUMAN' || normalizedStatus === 'PENDING_HUMAN_IN_REVIEW') {
      return reviewer ? 'In Review' : 'Waiting';
    }

    const statusMap = {
      'DRAFT': 'Draft',
      'PENDING_AI': 'AI Review',
      'PENDING_HUMAN': 'Pending',
      'PENDING_HUMAN_IN_REVIEW': 'Pending',
      'APPROVED': 'Approved',
      'REJECTED': 'Rejected',
      'DELETED': 'Deleted',
      'UNKNOWN': 'Unknown'
    };

    return statusMap[normalizedStatus] || status || 'Unknown';
  }

  getAIScoreClass(score) {
    if (score >= 85) return 'ai-score-high';
    if (score <= 60) return 'ai-score-low';
    return '';
  }

  formatCSV(csvContent) {
    if (!csvContent) return '<p>Empty CSV file</p>';

    // Simple CSV parser
    const rows = csvContent.split('\n')
      .filter(row => row.trim().length > 0) // Remove empty rows
      .map(row => {
        // Handle quoted values with commas properly
        const result = [];
        let inQuotes = false;
        let currentValue = '';

        for (let i = 0; i < row.length; i++) {
          const char = row[i];

          if (char === '"' && (i === 0 || row[i - 1] !== '\\')) {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(currentValue);
            currentValue = '';
          } else {
            currentValue += char;
          }
        }

        // Add the last value
        result.push(currentValue);
        return result;
      });

    if (rows.length === 0) return '<p>Empty CSV file</p>';

    // Create HTML table
    let tableHtml = '<div class="csv-table-container"><table class="csv-table">';

    // Add header row
    tableHtml += '<thead><tr>';
    rows[0].forEach(cell => {
      tableHtml += `<th>${escapeHtml(cell)}</th>`;
    });
    tableHtml += '</tr></thead>';

    // Add data rows
    tableHtml += '<tbody>';
    for (let i = 1; i < Math.min(rows.length, 100); i++) { // Limit to 100 rows for performance
      tableHtml += '<tr>';
      rows[i].forEach((cell, j) => {
        // Ensure we don't exceed columns from header
        if (j < rows[0].length) {
          tableHtml += `<td>${escapeHtml(cell)}</td>`;
        }
      });
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table></div>';

    return tableHtml;
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
        // Default container based on current view
        targetContainer = this.containerEl?.querySelector('.corpus-two-pane-container');
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
   * Clean up component resources
   */
  destroy() {
    // Clear the periodic refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Call base class cleanup
    super.destroy();
  }
}