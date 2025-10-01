// File: ui/stages/stage-form-rfp-answer-questions.js
import {
  bulkAssignContent,
  bulkAssignOwner,
  bulkDeleteDocumentItems,
  bulkMoveToSheet,
  bulkUnlockDocumentItems,
  createDocumentItemGroup,
  deleteDocumentItemGroup,
  fetchDocumentItemGroups,
  fetchDocumentItems
} from "../../api/documents.js";
import {
  getLabelFriendlyName,
  getSubtenantAttributes,
} from "../../api/subtenants.js";
import {
  listUsersWithCorpusPermissions
} from "../../api/users.js";
import { DocumentItemHistoryModal } from "../../ui/modals/document-item-history-modal.js";
import { ErrorModal } from "../../ui/modals/error-modal.js";
import { MessageModal } from "../../ui/modals/message-modal.js";
import { TextPromptModal } from "../../ui/modals/text-prompt-modal.js";
import { YesNoModal } from "../../ui/modals/yesno-modal.js";
import { handleBulkOperationResults } from "../../utils/api-utils.js";
import { showUserError } from "../../utils/error-handling-utils.js";
import { ControlPane } from "./stage-form-rfp-answer-questions-control-pane.js";
import { QuestionsGrid } from "./stage-form-rfp-answer-questions-grid.js";
import { TopicTabs } from "./stage-form-rfp-answer-questions-topic-tabs.js";
import { fullScreenManager } from "../../utils/fullscreen-manager.js";

/**
 * Shows the history modal for an item with proper error handling
 * @param {Object} item - The document item to show history for
 * @param {Object} errorModal - Error modal instance for showing errors
 */
function showHistoryModal(item, errorModal) {
  try {
    // Validate required fields
    if (!item || !item.project_document_stage_group_id_item_id) {
      console.error("[showHistoryModal] Missing required item data:", item);
      if (errorModal) {
        errorModal.show({
          title: "Error Opening History",
          message: "Cannot show history: Missing required item information. Please try refreshing the page."
        });
      }
      return;
    }

    const modal = new DocumentItemHistoryModal();

    // Get a display name for the item
    const itemDisplayName = item.question_text
      ? `Question: ${item.question_text.slice(0, 30)}${item.question_text.length > 30 ? '...' : ''}`
      : `Item ${item.item_id || item.question_id || 'Unknown'}`;

    // Extract the project document ID from the composite key
    // The composite key format is: {projectDocumentId}#STG#{stageId}#GRP#{groupId}#ITM#{itemId}
    let projectDocumentId = null;
    if (item.project_document_stage_group_id_item_id) {
      const parts = item.project_document_stage_group_id_item_id.split('#STG#');
      if (parts.length > 0) {
        projectDocumentId = parts[0];
      }
    }

    // Validate extracted project document ID
    if (!projectDocumentId) {
      console.error("[showHistoryModal] Could not extract project document ID from:", item.project_document_stage_group_id_item_id);
      if (errorModal) {
        errorModal.show({
          title: "Error Opening History",
          message: "Cannot show history: Invalid item reference. Please contact support if this persists."
        });
      }
      return;
    }

    // Show the modal with the item details
    modal.show({
      projectDocumentId: projectDocumentId,
      stageGroupItemId: item.project_document_stage_group_id_item_id,
      itemDisplayName: itemDisplayName
    });
  } catch (error) {
    console.error("[showHistoryModal] Unexpected error:", error);
    if (errorModal) {
      errorModal.show({
        title: "Error Opening History",
        message: "An unexpected error occurred while opening the history. Please try again.",
        details: error.message
      });
    }
  }
}

/**
 * StageFormRfpAnswerQuestions
 * The main exported class that the multi-stage orchestrator will instantiate.
 * 
 * @optimized Performance improvements:
 * - Parallel loading of data using Promise.all()
 * - Early UI rendering with loading states
 * - Caching of expensive API results
 * - Improved error handling for partial failures
 * - Fixed overlapping loading indicators
 */
export default class StageFormRfpAnswerQuestions {
  constructor(docTaskInstance, jobController, autoSaveManager = null) {
    console.log("[StageFormRfpAnswerQuestions] Initializing answer questions stage");
    this.docTaskInstance = docTaskInstance;
    this.jobController = jobController;
    this.autoSaveManager = autoSaveManager;
    this.domContainer = null;
    this.confirmModal = new YesNoModal();
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    const idx = docTaskInstance.currentStageIndex || 0;
    this.currentStageId =
      docTaskInstance.stages?.[idx]?.stageId || "rfp_stage_3_answer_questions";

    // Ensure stageData is present
    if (!this.docTaskInstance.stageData) {
      this.docTaskInstance.stageData = {};
    }
    if (!this.docTaskInstance.stageData[this.currentStageId]) {
      this.docTaskInstance.stageData[this.currentStageId] = {};
    }

    // We might store the last selected group (topic) or default
    this.currentGroupId = this.getStoredGroupId();
    
    // Shared project data cache to prevent excessive API calls
    this.projectDataCache = null;
    this.selectedRows = [];

    // For convenience, read from docTaskInstance
    this.projectDocumentId = this.docTaskInstance?.documentId
      ? `${this.docTaskInstance.projectId}#${this.docTaskInstance.documentId}`
      : this.docTaskInstance.projectId; // or fallback
    
    // Store original format for API calls and compositeId for job controller
    this.compositeDocumentId = this.docTaskInstance?.compositeId || this.projectDocumentId;

    this.corpusUsers = []; // Store users with corpus permissions
    this.currentUsername = this.docTaskInstance.ownerUsername || "guest";

    // Child components
    this.controlPane = null;
    this.questionsGrid = null;
    this.topicTabs = null;

    // We'll store fetched groups here
    this.groups = [];

    // Centralized subtenant attributes cache
    this.subtenantCache = {};

    // Track loading state
    this.loadingStates = {
      subtenantAttributes: false,
      corpusUsers: false,
      groups: false,
      currentGroupItems: false
    };

    // Add loading styles to the document
    this.addLoadingStyles();
    
    // Phase 2: Setup global functions for job controller integration
    this.setupGlobalJobCallbacks();
    
    // Initialize full-screen manager
    fullScreenManager.resetOnRefresh();
  }

  /**
   * Add CSS styles for loading indicators and error messages
   */
  addLoadingStyles() {
    if (document.getElementById('rfp-loading-styles')) return;

    const style = document.createElement('style');
    style.id = 'rfp-loading-styles';
    style.textContent = `
      .rfp-loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      
      .rfp-loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      .rfp-loading-text {
        margin-top: 10px;
        font-size: 14px;
        color: #333;
      }
      
      .rfp-loading-indicator {
        padding: 8px;
        text-align: center;
        color: #666;
        font-size: 14px;
      }
      
      .rfp-tabs-loading {
        padding: 8px 16px;
        color: #666;
        font-style: italic;
      }
      
      .rfp-error-message {
        background-color: #fff3f3;
        border-left: 4px solid #ff5757;
        padding: 12px 15px;
        margin: 15px 0;
        display: flex;
        align-items: flex-start;
      }
      
      .rfp-error-icon {
        font-size: 24px;
        margin-right: 15px;
      }
      
      .rfp-error-content h3 {
        margin: 0 0 8px 0;
        color: #d32f2f;
      }
      
      .rfp-error-content p {
        margin: 0 0 5px 0;
      }
      
      .rfp-error-details {
        font-family: monospace;
        background: #f8f8f8;
        padding: 5px;
        margin-top: 8px;
        overflow-wrap: break-word;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Phase 2: Setup global callback functions for job controller integration
   */
  setupGlobalJobCallbacks() {
    console.log("[StageFormRfpAnswerQuestions] Setting up job refresh callbacks");
    
    // Global function called by job controller when a question-answering job completes
    window.refreshDocumentItemsGrid = (docId, groupId) => {
      // Check if this callback is for the current document and group - match against both formats
      if ((docId === this.projectDocumentId || docId === this.compositeDocumentId) && groupId === this.currentGroupId) {
        console.log("[StageFormRfpAnswerQuestions] Refreshing grid after job completion");
        
        // Phase 2: Clear processing indicators before refresh
        if (this.questionsGrid && typeof this.questionsGrid.clearProcessingIndicators === 'function') {
          try {
            this.questionsGrid.clearProcessingIndicators();
          } catch (error) {
            console.error("[StageFormRfpAnswerQuestions] Error clearing processing indicators:", error);
          }
        }
        
        // Refresh the grid data
        this.handleControlAction({ action: 'REFRESH' });
      }
    };
    
    // Store reference to this instance for cleanup
    window.refreshDocumentItemsGrid._stageInstance = this;
  }

  /**
   * Cleanup global callbacks when component is destroyed
   */
  cleanupGlobalJobCallbacks() {
    if (window.refreshDocumentItemsGrid && window.refreshDocumentItemsGrid._stageInstance === this) {
      delete window.refreshDocumentItemsGrid;
      console.log("[StageFormRfpAnswerQuestions] Cleaned up global job callbacks");
    }
  }

  /**
   * Render the UI skeleton immediately, then load data in parallel
   */
  async render(containerEl) {
    console.log("[StageFormRfpAnswerQuestions] Rendering stage");
    this.domContainer = containerEl;
    containerEl.innerHTML = ""; // Clear existing

    try {
      // Immediately render the UI skeleton with loading states
      const wrapperEl = this.buildUIStructure();
      containerEl.appendChild(wrapperEl);

      // Get references to the containers
      const controlPaneContainer = wrapperEl.querySelector('.control-pane-container');
      const gridContainer = wrapperEl.querySelector('.grid-container');
      const tabsContainer = wrapperEl.querySelector('.grid-tabs-container');

      // Start loading essential data in parallel - immediately return promises
      const pureProjectDocId = this._extractPureProjectDocId(this.projectDocumentId);

      // Set loading states
      this.loadingStates.subtenantAttributes = true;
      this.loadingStates.groups = true;

      const subtenantPromise = this.loadSubtenantAttributes().catch(err => {
        console.error("[StageFormRfpAnswerQuestions] Error loading subtenant attributes:", err);
        this.loadingStates.subtenantAttributes = false;
        return {}; // Return empty object on error
      });

      const groupsPromise = this.fetchGroupsWithErrorHandling(pureProjectDocId).catch(err => {
        console.error("[StageFormRfpAnswerQuestions] Error fetching groups:", err);
        this.loadingStates.groups = false;
        return []; // Return empty array on error
      });

      // Start loading corpus users in the background
      this.loadingStates.corpusUsers = true;
      const corpusUsersPromise = this.loadCorpusUsers().catch(err => {
        console.error("[StageFormRfpAnswerQuestions] Error loading corpus users:", err);
        this.loadingStates.corpusUsers = false;
        return []; // Return empty array on error
      });

      // Initialize components with loading states - must be after promises are started
      this.initializeComponentsWithLoadingState(controlPaneContainer, gridContainer, tabsContainer);

      // Wait for subtenant attributes
      const subtenantCache = await subtenantPromise;
      this.loadingStates.subtenantAttributes = false;

      // Update control pane with subtenant attributes as soon as they're available
      this.updateControlPane(controlPaneContainer, subtenantCache, []);

      // Wait for groups
      const groups = await groupsPromise;
      this.loadingStates.groups = false;

      // Now update control pane and initialize topic tabs with the loaded groups
      this.updateControlPane(controlPaneContainer, subtenantCache, groups);
      this.initializeTopicTabs(tabsContainer, groups);

      // If we have groups, try to select a default one and load its items
      if (groups && groups.length > 0) {
        const targetGroupId = this.determineDefaultGroupId(groups);
        console.log("[StageFormRfpAnswerQuestions] Loading topic sheet:", targetGroupId);

        // Load the group data
        this.syncGroupIdAcrossComponents(targetGroupId);
        await this.loadGroup(targetGroupId);
      } else {
        // No groups available, show empty state
        this.questionsGrid.hideLoadingOverlay();
        this.questionsGrid.showNoRowsOverlay("No topic sheets available. Click the '+' button to create one.");
      }

      // Wait for corpus users to load and update the control pane (non-blocking)
      const corpusUsers = await corpusUsersPromise;
      this.loadingStates.corpusUsers = false;
      this.updateCorpusUsersInControlPane(corpusUsers);

      // Make the stage element available to full-screen manager
      // The containerEl should be .doc-stage-content-wrapper from the parent framework
      if (containerEl) {
        containerEl.setAttribute('data-fullscreen-target', 'true');
      }

    } catch (err) {
      // Reset all loading states in case of error
      Object.keys(this.loadingStates).forEach(key => {
        this.loadingStates[key] = false;
      });

      console.error("[StageFormRfpAnswerQuestions] Error in render():", err);
      this.showRenderError(containerEl, err);
    }
  }

  /**
   * Create the basic UI structure with loading placeholders
   */
  buildUIStructure() {
    const wrapperEl = document.createElement("div");
    wrapperEl.classList.add("rfp-answer-questions-stage");

    // 1) Control Pane area (fixed height)
    const controlPaneContainer = document.createElement("div");
    controlPaneContainer.classList.add("control-pane-container");
    controlPaneContainer.innerHTML = '<div class="rfp-loading-indicator">Loading control panel...</div>';
    wrapperEl.appendChild(controlPaneContainer);

    // 2) Main grid area (flexible height)
    const gridContainer = document.createElement("div");
    gridContainer.classList.add("grid-container");
    gridContainer.style.position = "relative"; // Ensure relative positioning for loading overlay
    wrapperEl.appendChild(gridContainer);

    // 3) Bottom tabs area (fixed height, Excel-style)
    const tabsContainer = document.createElement("div");
    tabsContainer.classList.add("grid-tabs-container");
    tabsContainer.style.borderTop = "1px solid #ddd";
    tabsContainer.style.marginTop = "0";
    tabsContainer.style.position = "sticky";
    tabsContainer.style.bottom = "0";
    tabsContainer.style.left = "0";
    tabsContainer.style.width = "100%";
    tabsContainer.innerHTML = '<div class="rfp-tabs-loading">Loading topic sheets...</div>';
    wrapperEl.appendChild(tabsContainer);

    return wrapperEl;
  }

  /**
   * Initialize components with loading states
   */
  initializeComponentsWithLoadingState(controlPaneContainer, gridContainer, tabsContainer) {
    this.controlPane = new ControlPane({
      onAction: (actionType, payload) => this.handleControlAction(actionType, payload),
      currentUsername: this.currentUsername,
      groups: [],
      currentGroupId: null,
      subtenantCache: {},
      corpusUsers: [],
      projectId: this.docTaskInstance.projectId,  // 🚨 CRITICAL: Pass project ID
      documentId: this.docTaskInstance.documentId, // 🚨 CRITICAL: Pass document ID for export
      store: window.appStore,                     // 🚨 CRITICAL: Pass store reference
      docMetadata: this.docTaskInstance           // 🚨 CRITICAL: Pass document metadata for permissions
    });
    this.controlPane.render(controlPaneContainer);
    this.controlPane.setJobController(this.jobController);
    this.controlPane.setDocumentContext(this.projectDocumentId, this.currentGroupId);


    // Initialize grid with loading state
    this.questionsGrid = new QuestionsGrid({
      projectDocumentId: this.projectDocumentId,
      stageId: this.currentStageId,
      groupId: this.currentGroupId,
      currentUsername: this.currentUsername,
      errorModal: this.errorModal,
      messageModal: this.messageModal,
      store: window.appStore, // Pass the global store for security
      docMetadata: this.docTaskInstance, // Pass document metadata for permission checking
      autoSaveManager: this.autoSaveManager, // Pass autoSaveManager for DocumentItems save tracking
      onSelectionChanged: (rows) => {
        this.selectedRows = rows;
        this.controlPane.updateSelectionState(rows);
      },
      onItemCountChanged: (groupId, count) => {
        if (this.topicTabs && groupId === this.currentGroupId) {
          console.log(`[StageFormRfpAnswerQuestions] Item count changed for group ${groupId}: ${count}`);
          this.topicTabs.notifyGroupItemCountChanged(groupId, count);
        }
      }
    });
    this.questionsGrid.render(gridContainer);
    
    // ISSUE #9 FIX: Set global reference for control pane to access fresh grid data
    window.currentQuestionGrid = this.questionsGrid;

    // Only show loading overlay here - do not show it again when loading items
    // This fixes the overlapping loading indicators issue
    this.questionsGrid.showLoadingOverlay("Initializing questions grid...");
  }

  /**
   * Fetch groups with error handling
   */
  async fetchGroupsWithErrorHandling(projectDocumentId) {
    try {
      const groups = await fetchDocumentItemGroups(projectDocumentId, this.currentStageId);
      console.log("[StageFormRfpAnswerQuestions] Loaded", groups.length, "topic sheets");

      // Store the groups
      this.groups = groups;

      return groups;
    } catch (err) {
      console.error("Error fetching groups for Stage 3:", err);

      // Show error to user
      showUserError({
        title: "Error Loading Topic Sheets",
        message: "Failed to load topic sheets for Answer Questions stage. Some functionality may be limited.",
        details: err.message
      }, this.errorModal);

      // Return empty array so the UI can still function
      this.groups = [];
      return [];
    }
  }

  /**
   * Update the control pane with loaded data
   */
  updateControlPane(controlPaneContainer, subtenantCache, groups) {
    // Update the control pane with the loaded data
    this.controlPane.updateSubtenantCache(subtenantCache);
    this.controlPane.updateGroups(groups, this.currentGroupId);
  }

  /**
   * Update corpus users in the control pane (can be done asynchronously)
   */
  updateCorpusUsersInControlPane(corpusUsers) {
    if (this.controlPane) {
      this.controlPane.updateCorpusUsers(corpusUsers);
    }
  }

  /**
   * Initialize the topic tabs with the loaded groups
   */
  initializeTopicTabs(tabsContainer, groups) {
    this.topicTabs = new TopicTabs({
      groups: groups,
      currentGroupId: this.currentGroupId,
      onTabSelected: (groupId) => this.loadGroup(groupId),
      onAddNewTopic: () => this.promptForNewTopic(),
      onDeleteTopic: (groupId, tabName) => this.handleDeleteTopic(groupId, tabName),
      projectDocumentId: this._extractPureProjectDocId(this.projectDocumentId),
      stageId: this.currentStageId,
      errorModal: this.errorModal
    });

    this.topicTabs.render(tabsContainer);
  }

  /**
   * Determine the default group ID to select
   */
  determineDefaultGroupId(groups) {
    // Try to use the stored group ID first, then fall back to previous or first
    let targetGroupId = this.currentGroupId;

    // If we have a stored ID, verify it exists in the fetched groups
    if (targetGroupId && !groups.some(g => this._parseGroupIdFromFull(g.stage_group_id) === targetGroupId)) {
      console.warn(
        "[StageFormRfpAnswerQuestions] Stored group",
        targetGroupId,
        "not found in fetched groups."
      );
      targetGroupId = null;
    }

    // If no valid stored ID, try the one in stageData
    if (!targetGroupId) {
      let previousGroup = this.docTaskInstance.stageData[this.currentStageId].currentGroupId;
      if (
        previousGroup &&
        !groups.some((g) => this._parseGroupIdFromFull(g.stage_group_id) === previousGroup)
      ) {
        console.warn(
          "[StageFormRfpAnswerQuestions] Saved group",
          previousGroup,
          "not found in fetched groups. Using the first group instead."
        );
        previousGroup = null;
      }

      targetGroupId = previousGroup;
    }

    // If still no valid ID, use the first group
    if (!targetGroupId && groups.length > 0) {
      targetGroupId = this._parseGroupIdFromFull(groups[0].stage_group_id);
    }

    return targetGroupId;
  }

  /**
   * Show an error message while keeping the UI functional
   */
  showRenderError(containerEl, err) {
    const errorEl = document.createElement("div");
    errorEl.className = "rfp-error-message";
    errorEl.innerHTML = `
      <div class="rfp-error-icon">⚠️</div>
      <div class="rfp-error-content">
        <h3>Error Initializing Questions View</h3>
        <p>There was an error loading some components. Basic functionality may still be available.</p>
        <p class="rfp-error-details">${err.message}</p>
      </div>
    `;

    // Add to the container but don't clear existing content
    containerEl.appendChild(errorEl);

    // Also show in the error modal
    showUserError({
      title: "Error Initializing Questions View",
      message: "An error occurred while setting up the questions view. Some functionality may be limited.",
      details: err.message
    }, this.errorModal);
  }

  /**
   * Load required subtenant attributes in a single API call with caching
   * This centralizes all attribute fetching needed by child components
   */
  async loadSubtenantAttributes() {
    // Check if we already have data in the cache
    if (Object.keys(this.subtenantCache).length > 0) {
      return this.subtenantCache;
    }

    // Try to load from sessionStorage first
    try {
      const cachedData = sessionStorage.getItem('subtenantCache');
      if (cachedData) {
        this.subtenantCache = JSON.parse(cachedData);
        return this.subtenantCache;
      }
    } catch (storageErr) {
      console.warn("[StageFormRfpAnswerQuestions] Failed to load subtenant cache from sessionStorage:", storageErr);
    }

    try {
      // Get all attributes needed by child components in a single call
      const attributes = await getSubtenantAttributes([
        "corpus_config",
        "label_friendly_names",
        "document_topics_type_preselection"
      ]);

      console.log("[StageFormRfpAnswerQuestions] Loaded configuration attributes");

      // Make a deep copy to ensure we don't have reference issues
      this.subtenantCache = JSON.parse(JSON.stringify(attributes));

      // Store in sessionStorage for future use
      try {
        sessionStorage.setItem('subtenantCache', JSON.stringify(this.subtenantCache));
      } catch (storageErr) {
        console.warn("[StageFormRfpAnswerQuestions] Failed to save subtenant cache to sessionStorage:", storageErr);
      }

      return this.subtenantCache;
    } catch (err) {
      console.error("[StageFormRfpAnswerQuestions] Error loading subtenant attributes:", err);

      // Show error to user
      showUserError({
        title: "Error Loading Configuration",
        message: "Failed to load application configuration. Some features may not work correctly.",
        details: err.message
      }, this.errorModal);

      // Return empty object as fallback
      this.subtenantCache = {};
      return {};
    }
  }

  /**
   * Load corpus users with caching - UPDATED to also load project users
   */
  async loadCorpusUsers() {
    // Check if we already have users cached
    if (this.corpusUsers && this.corpusUsers.length > 0) {
      return this.corpusUsers;
    }

    // Try to load from sessionStorage first
    try {
      const cachedUsers = sessionStorage.getItem('corpusUsers');
      if (cachedUsers) {
        this.corpusUsers = JSON.parse(cachedUsers);
        return this.corpusUsers;
      }
    } catch (storageErr) {
      console.warn("[StageFormRfpAnswerQuestions] Failed to load corpus users from sessionStorage:", storageErr);
    }

    try {
      // Extract account and project IDs
      const { accountId, projectId } = this._extractAccountAndProjectIds();

      // Load both corpus users and project users in parallel
      const [corpusUsersResult, projectUsersResult] = await Promise.allSettled([
        this._loadCorpusUsersFromAPI(accountId, projectId),
        this._loadProjectUsersFromAPI(accountId, projectId)
      ]);

      // Combine the results
      let allUsers = [];

      // Add corpus users
      if (corpusUsersResult.status === 'fulfilled' && corpusUsersResult.value) {
        allUsers.push(...corpusUsersResult.value);
      }

      // Add project users (merge with corpus users, avoiding duplicates)
      if (projectUsersResult.status === 'fulfilled' && projectUsersResult.value) {
        const existingUsernames = new Set(allUsers.map(u => u.username || u));
        const projectUsers = projectUsersResult.value.filter(user => {
          const username = user.username || user;
          return !existingUsernames.has(username);
        });
        allUsers.push(...projectUsers);
      }

      console.log(`[StageFormRfpAnswerQuestions] Loaded ${allUsers.length} users for assignment`);

      // Cache the users
      this.corpusUsers = allUsers;

      // Store in sessionStorage for future use
      try {
        sessionStorage.setItem('corpusUsers', JSON.stringify(allUsers));
      } catch (storageErr) {
        console.warn("[StageFormRfpAnswerQuestions] Failed to save users to sessionStorage:", storageErr);
      }

      return allUsers;
    } catch (err) {
      console.error("[StageFormRfpAnswerQuestions] Error loading users:", err);
      return [];
    }
  }

  /**
   * Load corpus users from API
   * @private
   */
  async _loadCorpusUsersFromAPI(accountId, projectId) {
    try {
      // Get corpus from cache or use default
      const corpusId = this.subtenantCache?.corpus_config?.default_corpus || "rfp";

      // Fetch users with corpus permissions
      const users = await listUsersWithCorpusPermissions({
        accountId,
        projectId,
        corpusId,
        filterType: 'MANUAL'
      });

      return users;
    } catch (err) {
      console.error("[StageFormRfpAnswerQuestions] Error loading corpus users:", err);
      return [];
    }
  }

  /**
   * Get cached project data or load from API
   * @param {string} accountId - The account ID  
   * @param {string} projectId - The project ID
   * @returns {Promise<Object>} The project data
   */
  async getCachedProjectData(accountId, projectId) {
    // Return cached data if available
    if (this.projectDataCache) {
      console.log('[StageFormRfpAnswerQuestions] Using cached project data');
      return this.projectDataCache;
    }

    console.log('[StageFormRfpAnswerQuestions] Loading project data from API');
    
    try {
      // Import getProject function
      const { getProject } = await import("../../api/projects-accounts.js");

      // Get project details with authorized users
      const response = await getProject(projectId, this.store || window.appStore, accountId);
      const projectData = response.project || response;

      // Cache the project data
      this.projectDataCache = projectData;
      console.log('[StageFormRfpAnswerQuestions] Cached project data for future use');
      
      return projectData;
    } catch (error) {
      console.error('[StageFormRfpAnswerQuestions] Error loading project data:', error);
      throw error;
    }
  }

  /**
   * Load project users from API (using cached project data)
   * @private
   */
  async _loadProjectUsersFromAPI(accountId, projectId) {
    try {
      // Use cached project data
      const projectData = await this.getCachedProjectData(accountId, projectId);

      if (!projectData || !projectData.authorized_users) {
        return [];
      }

      // Convert authorized_users StringSet to array of user objects
      let authorizedUsers = [];

      if (Array.isArray(projectData.authorized_users)) {
        // Already an array
        authorizedUsers = projectData.authorized_users;
      } else if (projectData.authorized_users.values) {
        // DynamoDB StringSet format
        authorizedUsers = projectData.authorized_users.values;
      } else if (typeof projectData.authorized_users === 'object') {
        // Object with usernames as keys
        authorizedUsers = Object.keys(projectData.authorized_users);
      }

      // Convert to consistent format
      const projectUsers = authorizedUsers.map(username => {
        if (typeof username === 'string') {
          return { username: username };
        } else if (username.username) {
          return username;
        } else {
          return { username: String(username) };
        }
      });

      return projectUsers;
    } catch (err) {
      console.error("[StageFormRfpAnswerQuestions] Error loading project users:", err);
      return [];
    }
  }

  /**
   * Prompt the user to create a new topic sheet
   */
  promptForNewTopic() {
    const promptModal = new TextPromptModal({
      fieldLabel: "Enter Topic Sheet Name",
      defaultValue: "",
      onOk: async (userInput) => {
        const sheetName = userInput.trim();
        if (!sheetName) {
          console.warn("[StageFormRfpAnswerQuestions] User provided empty topic name => ignoring");
          return;
        }

        try {
          await this._createNewTopicSheet(sheetName);
        } catch (err) {
          console.error("Error creating new topic sheet:", err);
          showUserError({
            title: "Error Creating Topic Sheet",
            message: err.message || "Could not create the new topic sheet.",
            details: err.stack
          }, this.errorModal);
        }
      },
      onCancel: () => {
        console.log("[StageFormRfpAnswerQuestions] User canceled new topic creation");
      }
    });
    promptModal.show();
  }

  /**
   * Create a new topic sheet and switch to it
   * @param {string} topicName - The name of the new topic
   */
  async _createNewTopicSheet(topicName) {
    const pureProjectDocId = this._extractPureProjectDocId(this.projectDocumentId);

    console.log(`[StageFormRfpAnswerQuestions] Creating topic sheet: ${topicName}`);

    try {
      // Call API to create a new group
      let newGroup;

      if (typeof createDocumentItemGroup === 'function') {
        newGroup = await createDocumentItemGroup(
          pureProjectDocId,
          this.currentStageId,
          topicName
        );
      } else {
        // Mock implementation
        const groupId = topicName.toLowerCase().replace(/\s+/g, '_');
        newGroup = {
          stage_group_id: `STG#${this.currentStageId}#GRP#${groupId}`,
          group_name: topicName,
          date_modified: new Date().toISOString(),
          modified_by: this.currentUsername,
          metadata: JSON.stringify({ rowCount: 0 })
        };
      }

      console.log("[StageFormRfpAnswerQuestions] Topic sheet created successfully");

      // Add the new group to our groups array
      this.groups.push(newGroup);

      // Update the control pane's Move dropdown
      this.controlPane.updateGroups(this.groups, this.currentGroupId);

      // Add the new tab to the UI
      const newGroupId = this._parseGroupIdFromFull(newGroup.stage_group_id);
      this.topicTabs.addNewTab(newGroup);

      // Switch to the new tab
      await this.loadGroup(newGroupId);

      return newGroup;
    } catch (err) {
      console.error("Error creating new topic sheet:", err);
      throw err;
    }
  }

  /**
   * Handle the deletion of a topic sheet (document item group)
   * @param {string} groupId The ID of the group to delete
   * @param {string} tabName The display name of the tab
   */
  async handleDeleteTopic(groupId, tabName) {
    console.log(`[StageFormRfpAnswerQuestions] Deleting topic sheet ${groupId} (${tabName})`);

    try {
      const pureProjectDocId = this._extractPureProjectDocId(this.projectDocumentId);

      // Call the API to delete the group
      await deleteDocumentItemGroup(
        pureProjectDocId,
        this.currentStageId,
        groupId
      );

      console.log(`[StageFormRfpAnswerQuestions] Successfully deleted group ${groupId}`);

      // Remove from local array
      const groupIndex = this.groups.findIndex(
        g => this._parseGroupIdFromFull(g.stage_group_id) === groupId
      );

      if (groupIndex >= 0) {
        this.groups.splice(groupIndex, 1);
      }

      // Update the control pane's Move dropdown
      this.controlPane.updateGroups(this.groups, this.currentGroupId);

      // Re-render the tabs
      const tabsContainer = document.querySelector('.grid-tabs-container');
      if (tabsContainer && this.topicTabs) {
        this.topicTabs.render(tabsContainer);
      }

      // If we just deleted the current group, switch to another one
      if (this.currentGroupId === groupId) {
        if (this.groups.length > 0) {
          const newGroupId = this._parseGroupIdFromFull(this.groups[0].stage_group_id);
          await this.loadGroup(newGroupId);
        } else {
          // No groups left, clear the grid
          this.currentGroupId = null;
          this.questionsGrid.setData([]);
        }
      }
    } catch (err) {
      console.error(`[StageFormRfpAnswerQuestions] Error deleting group ${groupId}:`, err);
      this.errorModal.show({
        title: "Error Deleting Topic Sheet",
        message: err.message || "An error occurred while deleting the topic sheet.",
        details: err.stack
      });
    }
  }

  /**
   * Store current group ID in sessionStorage for persistence
   */
  storeGroupId(groupId) {
    if (!groupId) return;

    try {
      const storageKey = `rfp-questions-${this.projectDocumentId}-${this.currentStageId}-groupId`;
      sessionStorage.setItem(storageKey, groupId);
      console.log(`[StageFormRfpAnswerQuestions] Stored groupId ${groupId} in sessionStorage`);
    } catch (err) {
      console.warn("[StageFormRfpAnswerQuestions] Failed to store groupId in sessionStorage:", err);
    }
  }

  /**
   * Retrieve stored group ID from sessionStorage
   */
  getStoredGroupId() {
    try {
      const storageKey = `rfp-questions-${this.projectDocumentId}-${this.currentStageId}-groupId`;
      const storedGroupId = sessionStorage.getItem(storageKey);
      return storedGroupId;
    } catch (err) {
      console.warn("[StageFormRfpAnswerQuestions] Failed to retrieve groupId from sessionStorage:", err);
      return null;
    }
  }

  /**
   * Synchronize group ID across all child components
   * This ensures consistent state throughout the application
   */
  syncGroupIdAcrossComponents(groupId) {
    this.currentGroupId = groupId;

    // Update in stageData for persistence
    this.docTaskInstance.stageData[this.currentStageId].currentGroupId = groupId;

    // Store in sessionStorage
    this.storeGroupId(groupId);

    // Update each component with the new group ID
    if (this.controlPane) {
      this.controlPane.updateGroups(this.groups, groupId);
      this.controlPane.setDocumentContext(this.projectDocumentId, groupId);
    }

    if (this.questionsGrid) {
      this.questionsGrid.groupId = groupId;
    }

    if (this.topicTabs) {
      this.topicTabs.setCurrentGroupId(groupId);
    }
  }

  /**
   * Loads items for the given groupId, sets them in the grid
   * Optimized with loading indicators and error handling
   */
  async loadGroup(groupId) {
    if (!groupId) {
      console.warn("[StageFormRfpAnswerQuestions] loadGroup called with null/empty groupId");
      // Don't proceed further without a valid groupId
      return;
    }

    // Only show loading overlay if we don't already have the grid initialized
    // This prevents multiple overlapping loading indicators
    if (!this.loadingStates.currentGroupItems) {
      const labelFriendlyNames = this.subtenantCache.label_friendly_names || {};
      const displayGroupName = getLabelFriendlyName(labelFriendlyNames, (groupId || "question sheet")) || "question sheet";
      this.questionsGrid.showLoadingOverlay(`Loading items for ${displayGroupName}...`);
    }

    // Set loading state
    this.loadingStates.currentGroupItems = true;

    // Synchronize this group ID across all components
    this.syncGroupIdAcrossComponents(groupId);

    const pureProjectDocId = this._extractPureProjectDocId(this.projectDocumentId);

    let items = [];
    try {
      items = await fetchDocumentItems(pureProjectDocId, this.currentStageId, groupId);
      console.log(`[StageFormRfpAnswerQuestions] Loaded ${items.length} items for group ${groupId}`);

      // Update the item count in the TopicTabs component
      if (this.topicTabs) {
        this.topicTabs.notifyGroupItemCountChanged(groupId, items.length);
      }
    } catch (err) {
      console.error("Error fetching document items:", err);

      // Show error to user
      showUserError({
        title: "Error Loading Items",
        message: `Could not load items for topic sheet "${groupId}".`,
        details: err.message
      }, this.errorModal);

      items = [];
    } finally {
      // Reset loading state
      this.loadingStates.currentGroupItems = false;

      // Hide loading overlay
      this.questionsGrid.hideLoadingOverlay();
    }

    // Update the grid
    if (this.questionsGrid) {
      this.questionsGrid.groupId = groupId;
      this.questionsGrid.setData(items);
      // Clear selection
      this.selectedRows = [];
      if (this.controlPane) {
        this.controlPane.updateSelectionState([]);
      }
    }
  }

  /**
   * Central dispatcher for the ControlPane's actions
   */
  async handleControlAction(actionType, payload) {
    const pureProjectDocId = this._extractPureProjectDocId(this.projectDocumentId);

    // Remember scroll position before action
    let scrollPosition = null;
    if (this.questionsGrid && this.questionsGrid.gridApi) {
      const gridBodyElement = document.querySelector('.ag-body-viewport');
      if (gridBodyElement) {
        scrollPosition = {
          top: gridBodyElement.scrollTop,
          left: gridBodyElement.scrollLeft
        };
      }
    }

    try {
      // Handle compact view toggle
      if (actionType === "TOGGLE_COMPACT_VIEW") {
        const { isCompactView } = payload;
        console.log(`[StageFormRfpAnswerQuestions] Setting compact view to: ${isCompactView}`);

        // ControlPane already handles the toggle and calls setCompactMode directly
        // Do NOT call toggleCompactView() here as it would cause double toggle
        // The grid state is already set by ControlPane via setCompactMode()
        return;
      }

      // Handle font size controls
      if (actionType === "INCREASE_FONT_SIZE") {
        if (this.controlPane) {
          this.controlPane.increaseFontSize();
        }
        return;
      }

      if (actionType === "DECREASE_FONT_SIZE") {
        if (this.controlPane) {
          this.controlPane.decreaseFontSize();
        }
        return;
      }

      // Handle view detail action
      if (actionType === "VIEW_DETAIL") {
        const { questionData } = payload;
        if (questionData && this.questionsGrid) {
          this.questionsGrid.openQuestionDetail(questionData);
        }
        return;
      }

      // Enhanced AI answer handling with proper model parameter
      if (actionType === "AI_ANSWER") {
        const mode = payload.mode || 'standard-model';
        const questionCount = payload.questionCount || 0;
        const subJobCount = payload.subJobCount || 1;
        const path = payload.path || 'bulk'; // Default to bulk if not specified
        const tier = payload.tier || 'standard'; // Extract tier ('standard' or 'enhanced')
        const indexName = payload.indexName || 'main-index'; // Extract index name

        console.log(`[StageFormRfpAnswerQuestions] AI Answer requested: path=${path}, tier=${tier}, mode=${mode}, questions=${questionCount}`);

        // Route based on path parameter
        if (path === 'quick') {
          // Quick path: Single question, immediate synchronous response
          console.log(`[StageFormRfpAnswerQuestions] Routing to quick answer path`);
          await this._handleQuickAnswer(tier, indexName);
        } else {
          // Bulk path: Multiple questions, asynchronous job
          console.log(`[StageFormRfpAnswerQuestions] Routing to bulk answer path`);
          await this._handleEnhancedAiAnswer(mode, questionCount, subJobCount);
        }
        return;
      }

      switch (actionType) {
        case "ADDROW": {
          if (this.questionsGrid && typeof this.questionsGrid.addNewRow === 'function') {
            this.questionsGrid.addNewRow();
          } else {
            console.warn("[StageFormRfpAnswerQuestions] QuestionsGrid is not ready or doesn't support addNewRow");
          }
          break;
        }
        case "FILTER_ALL": {
          this.questionsGrid.showLoadingOverlay("Loading all items...");
          try {
            const items = await fetchDocumentItems(pureProjectDocId, this.currentStageId, this.currentGroupId);
            this.questionsGrid.setData(items);
          } finally {
            this.questionsGrid.hideLoadingOverlay();
          }
          break;
        }
        case "FILTER_ME": {
          this.questionsGrid.showLoadingOverlay("Loading your assigned items...");
          try {
            const items = await fetchDocumentItems(pureProjectDocId, this.currentStageId, this.currentGroupId, {
              owner: this.currentUsername
            });
            this.questionsGrid.setData(items);
          } finally {
            this.questionsGrid.hideLoadingOverlay();
          }
          break;
        }
        case "FILTER_UNCONFIRMED": {
          this.questionsGrid.showLoadingOverlay("Loading unconfirmed items...");
          try {
            const items = await fetchDocumentItems(pureProjectDocId, this.currentStageId, this.currentGroupId, {
              status: "PENDING_REVIEW"
            });
            this.questionsGrid.setData(items);
          } finally {
            this.questionsGrid.hideLoadingOverlay();
          }
          break;
        }
        case "REFRESH": {
          try {
            // Phase 2: Clear any processing indicators before refresh
            if (this.questionsGrid && typeof this.questionsGrid.clearProcessingIndicators === 'function') {
              this.questionsGrid.clearProcessingIndicators();
            }

            this.questionsGrid.showLoadingOverlay("Refreshing data...");

            const freshItems = await fetchDocumentItems(
              pureProjectDocId,
              this.currentStageId,
              this.currentGroupId
            );
            this.questionsGrid.setData(freshItems);

          } catch (err) {
            console.error("Error refreshing data:", err);
            showUserError({
              title: "Error Refreshing Data",
              message: err.message || "Could not refresh data. Please try again.",
              details: err.stack
            }, this.errorModal);
          } finally {
            this.questionsGrid.hideLoadingOverlay();
          }
          break;
        }
        case "DELETE": {
          if (this.selectedRows.length < 1) return;
          
          // Get fresh data from the grid to ensure we have up-to-date IDs
          const selectedNodes = this.questionsGrid.gridApi.getSelectedNodes();
          const itemSortKeys = selectedNodes.map(node => node.data.project_document_stage_group_id_item_id);
          
          console.log('[StageFormRfpAnswerQuestions] DELETE - selected nodes:', selectedNodes.length, 'itemSortKeys:', itemSortKeys);
          
          try {
            const resp = await bulkDeleteDocumentItems(
              pureProjectDocId,
              this.currentStageId,
              this.currentGroupId,
              itemSortKeys
            );
            console.log("bulkDeleteDocumentItems =>", resp);

            await handleBulkOperationResults(
              resp,
              null,
              (keys) => this._removeRowsFromGrid(keys),
              "Delete",
              { autoRemove: true },
              { errorModal: this.errorModal, messageModal: this.messageModal }
            );

            if (this.questionsGrid && this.questionsGrid.gridApi) {
              const remainingCount = this.questionsGrid.gridApi.getDisplayedRowCount();
              if (this.topicTabs) {
                this.topicTabs.notifyGroupItemCountChanged(this.currentGroupId, remainingCount);
              }
            }
          } catch (err) {
            console.error("Error in bulkDeleteDocumentItems:", err);
            showUserError({
              title: "Error Deleting Items",
              message: err.message || "Could not delete the selected items. Please try again.",
              details: err.stack
            }, this.errorModal);
          }
          break;
        }
        case "UNLOCK": {
          if (this.selectedRows.length < 1) return;
          const itemSortKeys = this.selectedRows.map(r => r.project_document_stage_group_id_item_id);
          try {
            const resp = await bulkUnlockDocumentItems(
              pureProjectDocId,
              this.currentStageId,
              this.currentGroupId,
              itemSortKeys,
              this.currentUsername
            );
            console.log("bulkUnlockDocumentItems =>", resp);

            // First use the new grid update method
            if (resp.updatedItems && resp.updatedItems.length > 0) {
              this.updateGridRowsAfterBulkOperation(
                resp.updatedItems,
                this.questionsGrid.gridApi,
                true // Refresh after update for reliable updates
              );
            }

            // Then use handleBulkOperationResults for messaging but pass a no-op function for updates
            await handleBulkOperationResults(
              resp,
              () => { }, // No-op function since we already handled updates
              null,  // No removals for unlock
              "Unlock",
              { autoRemove: false },
              { errorModal: this.errorModal, messageModal: this.messageModal }
            );
          } catch (err) {
            console.error("Error in bulkUnlockDocumentItems:", err);

            // Show error to user
            showUserError({
              title: "Error Unlocking Items",
              message: err.message || "Could not unlock the selected items. Please try again.",
              details: err.stack
            }, this.errorModal);
          }
          break;
        }
        case "ASSIGN_CONTENT":
        case "ASSIGNCONTENT": {
          if (this.selectedRows.length < 1) return;
          const { contentConfig } = payload;
          if (!contentConfig) {
            console.warn("[StageFormRfpAnswerQuestions] No content configuration provided");
            return;
          }

          const itemSortKeys = this.selectedRows.map(r => r.project_document_stage_group_id_item_id);
          try {
            console.log("[StageFormRfpAnswerQuestions] Assigning content to items:", contentConfig);
            const resp = await bulkAssignContent(
              pureProjectDocId,
              this.currentStageId,
              this.currentGroupId,
              itemSortKeys,
              contentConfig
            );
            console.log("bulkAssignContent =>", resp);

            // First use the new grid update method with reliable refresh
            if (resp.updatedItems && resp.updatedItems.length > 0) {
              this.updateGridRowsAfterBulkOperation(
                resp.updatedItems,
                this.questionsGrid.gridApi,
                true // Force a refresh after to ensure content column updates properly
              );
              
              // ISSUE #9 FIX: Force selection state update to refresh cached data in control pane
              // This ensures getLatestSelectedRows() will have the updated content
              setTimeout(() => {
                const selectedNodes = this.questionsGrid.gridApi.getSelectedNodes();
                const selectedData = selectedNodes.map(node => node.data);
                this.selectedRows = selectedData;
                this.controlPane.updateSelectionState(selectedData);
              }, 200);
            }

            // Then use handleBulkOperationResults for messaging only
            await handleBulkOperationResults(
              resp,
              () => { }, // No-op function since we already handled updates
              null,  // No removals for content assignment
              "Content assignment",
              { autoRemove: false },
              { errorModal: this.errorModal, messageModal: this.messageModal }
            );
          } catch (err) {
            console.error("Error in bulkAssignContent:", err);

            // Show error to user
            showUserError({
              title: "Error Assigning Content",
              message: err.message || "Could not assign the selected content. Please try again.",
              details: err.stack
            }, this.errorModal);
          }
          break;
        }
        case "ASSIGN_OWNER":
        case "ASSIGNOWNER": {
          if (this.selectedRows.length < 1) return;
          const { owner } = payload;
          if (!owner && owner !== "") {
            console.warn("[StageFormRfpAnswerQuestions] No owner value provided");
            return;
          }

          const itemSortKeys = this.selectedRows.map(r => r.project_document_stage_group_id_item_id);
          try {
            const resp = await bulkAssignOwner(
              pureProjectDocId,
              this.currentStageId,
              this.currentGroupId,
              itemSortKeys,
              owner
            );
            console.log("bulkAssignOwner =>", resp);

            // First use the new grid update method
            if (resp.updatedItems && resp.updatedItems.length > 0) {
              this.updateGridRowsAfterBulkOperation(
                resp.updatedItems,
                this.questionsGrid.gridApi,
                true // Refresh as fallback
              );
            }

            // Then use handleBulkOperationResults for messaging only
            await handleBulkOperationResults(
              resp,
              () => { }, // No-op function since we already handled updates
              null,  // No removals for owner assignment
              "Owner assignment",
              { autoRemove: false },
              { errorModal: this.errorModal, messageModal: this.messageModal }
            );
          } catch (err) {
            console.error("Error in bulkAssignOwner:", err);

            // Show error to user
            showUserError({
              title: "Error Assigning Owner",
              message: err.message || "Could not assign the selected owner. Please try again.",
              details: err.stack
            }, this.errorModal);
          }
          break;
        }
        case "MOVE_SHEET": {
          if (this.selectedRows.length < 1) return;
          const { toGroupId } = payload;
          if (!toGroupId) {
            console.warn("[StageFormRfpAnswerQuestions] No target group ID provided");
            return;
          }

          // Find the target group name for better logs/messages
          const targetGroup = this.groups.find(g => this._parseGroupIdFromFull(g.stage_group_id) === toGroupId);
          const toGroupName = targetGroup ? targetGroup.group_name || toGroupId : toGroupId;

          // Store the selected rows that will be moved
          const rowsToMove = [...this.selectedRows];
          const itemSortKeys = rowsToMove.map(r => r.project_document_stage_group_id_item_id);

          try {
            // First, optimistically remove the rows from the current grid
            // to provide immediate visual feedback
            this._removeRowsFromGrid(itemSortKeys);

            // Update item counts on tabs
            const targetCount = (this.topicTabs.groupItemCounts[toGroupId] || 0) + rowsToMove.length;
            const sourceCount = (this.topicTabs.groupItemCounts[this.currentGroupId] || rowsToMove.length) - rowsToMove.length;

            // Update the tab counts for a snappy UI experience
            if (this.topicTabs) {
              this.topicTabs.notifyGroupItemCountChanged(this.currentGroupId, sourceCount);
              this.topicTabs.notifyGroupItemCountChanged(toGroupId, targetCount);
            }

            // Make the API call to perform the actual move server-side
            const resp = await bulkMoveToSheet(
              pureProjectDocId,
              this.currentStageId,
              this.currentGroupId,
              this.currentStageId,
              toGroupId,
              itemSortKeys
            );

            console.log(`bulkMoveToSheet => Moved ${resp.movedCount} items to ${toGroupName}`, resp);

            // Handle success/error message
            if (resp.movedCount === itemSortKeys.length) {
              // All items moved successfully
              this.messageModal.show({
                title: "Move Successful",
                message: `Successfully moved ${resp.movedCount} item(s) to "${toGroupName}".`
              });
            } else {
              // Some items failed to move - handle partial success
              // We need to put back the items that failed to move
              const failedItems = [];

              // Extract information about items that weren't moved (failed, locked, not found)
              if (resp.results && resp.results.failed) {
                failedItems.push(...resp.results.failed.map(item => item.sortKey));
              }

              if (resp.results && resp.results.locked) {
                failedItems.push(...resp.results.locked.map(item => item.sortKey));
              }

              // Special handling for items that failed to move
              if (failedItems.length > 0) {
                // Re-fetch the items that failed to move to ensure we have fresh data
                try {
                  const retainedItems = await fetchDocumentItems(
                    pureProjectDocId,
                    this.currentStageId,
                    this.currentGroupId,
                    {
                      sortKeys: failedItems
                    }
                  );

                  // Re-add the failed items to the grid using our improved method
                  if (retainedItems.length > 0) {
                    this.updateGridRowsAfterBulkOperation(
                      retainedItems,
                      this.questionsGrid.gridApi,
                      true // Use refresh as failsafe
                    );
                  }

                  // Update the counts again for accuracy
                  if (this.topicTabs) {
                    const actualSourceCount = this.questionsGrid.gridApi.getDisplayedRowCount();
                    this.topicTabs.notifyGroupItemCountChanged(this.currentGroupId, actualSourceCount);

                    // Update target tab count - need to subtract failed items
                    const actualTargetCount = targetCount - failedItems.length;
                    this.topicTabs.notifyGroupItemCountChanged(toGroupId, actualTargetCount);
                  }
                } catch (fetchErr) {
                  console.error("Error re-fetching retained items:", fetchErr);
                }
              }

              // Show message about the partial move
              this.messageModal.show({
                title: "Move Partially Successful",
                message: `Moved ${resp.movedCount} of ${itemSortKeys.length} item(s) to "${toGroupName}". ${failedItems.length} items could not be moved.`
              });
            }
          } catch (err) {
            console.error("Error in bulkMoveToSheet:", err);

            // Show error to user
            showUserError({
              title: "Error Moving Items",
              message: err.message || "Could not move the selected items. Please try again.",
              details: err.stack
            }, this.errorModal);

            // Fetch and restore the original items since the move failed
            try {
              // Show loading state while we restore the data
              this.questionsGrid.showLoadingOverlay("Restoring data...");

              const originalItems = await fetchDocumentItems(
                pureProjectDocId,
                this.currentStageId,
                this.currentGroupId
              );

              // Restore the grid with fresh data using our improved method
              if (originalItems.length > 0) {
                this.questionsGrid.setData(originalItems);
              }

              // Update the tab count with accurate data
              if (this.topicTabs) {
                this.topicTabs.notifyGroupItemCountChanged(this.currentGroupId, originalItems.length);
              }

              // Hide loading state
              this.questionsGrid.hideLoadingOverlay();
            } catch (fetchErr) {
              console.error("Error restoring original items after move failure:", fetchErr);
              // Hide loading state even if there's an error
              this.questionsGrid.hideLoadingOverlay();
            }
          }
          break;
        }
        case "HISTORY": {
          if (this.selectedRows.length === 1) {
            const row = this.selectedRows[0];
            console.log("[StageFormRfpAnswerQuestions] HISTORY action - showing modal for row:", row);
            
            // Pass the errorModal for proper error handling
            showHistoryModal(row, this.errorModal);
          } else {
            console.warn("[StageFormRfpAnswerQuestions] HISTORY action requires exactly 1 selected row, but found:", this.selectedRows.length);
            this.errorModal.show({
              title: "Select One Item",
              message: "Please select exactly one item to view its history."
            });
          }
          break;
        }
        case "ALL":
        case "ME":
        case "UNCONFIRMED": {
          // These were already handled via the FILTER_ events
          break;
        }
        default:
          console.warn("Unknown actionType:", actionType);
      }
    } finally {
      // Restore scroll position after action completes
      if (scrollPosition && this.questionsGrid && this.questionsGrid.gridApi) {
        setTimeout(() => {
          const gridBodyElement = document.querySelector('.ag-body-viewport');
          if (gridBodyElement) {
            gridBodyElement.scrollTop = scrollPosition.top;
            gridBodyElement.scrollLeft = scrollPosition.left;
          }
        }, 100);
      }
    }
  }

  /**
   * Helper: remove rows from the grid by item sortKey
   */
  _removeRowsFromGrid(itemSortKeys) {
    if (!this.questionsGrid) return;

    // Use the enhanced removeRows method that notifies about count changes
    this.questionsGrid.removeRows(itemSortKeys);
  }

  _extractAccountAndProjectIds() {
    const projectId = this.docTaskInstance.projectId;
    const parts = projectId.split('#');

    if (parts.length >= 2) {
      return {
        accountId: parts[0],
        projectId: parts[1]
      };
    }

    console.warn("[StageFormRfpAnswerQuestions] Could not extract account ID from project ID");
    return {
      accountId: 'unknown',
      projectId: projectId
    };
  }

  /**
   * Because your doc might store ID like "acme___IAG#SM2#doc_abc" or "acme___IAG#SM2#doc_abc123"
   * we just want "acme___IAG#SM2#doc_abc123" as the project_document_id for the stubs.
   * If you already have it, just return it.
   */
  _extractPureProjectDocId(str) {
    return str;
  }

  _parseGroupIdFromFull(stageGroupId) {
    return stageGroupId.split("#GRP#")[1];
  }

  /**
   * Quick answer handler for single-question fast answering
   * @param {string} tier - The model tier ('standard' or 'enhanced')
   * @param {string} indexName - The S3 Vectors index name
   */
  async _handleQuickAnswer(tier, indexName) {
    console.log(`[StageFormRfpAnswerQuestions] Quick answer: tier=${tier}, index=${indexName}`);

    // Dynamically import the quickAnswerQuestion API
    const { quickAnswerQuestion } = await import("../../api/corpus.js");

    // Show loading indicator
    this.messageModal.show({
      title: "Processing Question",
      message: "Getting quick answer from AI...",
      buttonText: null, // No button, modal will auto-close
      allowClose: false
    });

    try {
      // Get the first selected question (control pane already validates single selection)
      let itemToProcess = null;
      if (this.questionsGrid && this.questionsGrid.gridApi) {
        const selectedNodes = this.questionsGrid.gridApi.getSelectedNodes();
        if (selectedNodes.length === 0) {
          throw new Error("No question selected");
        }
        itemToProcess = selectedNodes[0].data;
      } else if (this.selectedRows && this.selectedRows.length > 0) {
        itemToProcess = this.selectedRows[0];
      } else {
        throw new Error("No question selected");
      }

      // Extract question text
      const questionText = itemToProcess.question_text;
      if (!questionText || questionText.trim().length === 0) {
        throw new Error("Question text is empty");
      }

      // Extract content configuration to determine corpus
      let contentConfig = null;
      let corpus = 'cognaire'; // Default corpus

      if (itemToProcess.content) {
        try {
          contentConfig = typeof itemToProcess.content === 'string' ?
            JSON.parse(itemToProcess.content) : itemToProcess.content;

          if (contentConfig.corpus) {
            corpus = contentConfig.corpus;
          }
        } catch (err) {
          console.warn("[_handleQuickAnswer] Could not parse content configuration:", err);
          // Continue with default corpus
        }
      }

      console.log(`[_handleQuickAnswer] Calling quick answer API: question="${questionText.substring(0, 50)}...", corpus=${corpus}, tier=${tier}, index=${indexName}`);

      // Call the quick answer API
      const result = await quickAnswerQuestion({
        question: questionText,
        corpus: corpus,
        model_tier: tier,
        index_name: indexName,
        max_chunks: 5,
        min_similarity: 0.7
      });

      // Hide loading modal
      this.messageModal.hide();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Format sources for display
      let sourcesHtml = '';
      if (result.sources && result.sources.length > 0) {
        sourcesHtml = '<div style="margin-top: 16px;"><strong>Sources:</strong><ul style="margin-top: 8px;">';
        result.sources.forEach((source, idx) => {
          const similarity = (source.similarity * 100).toFixed(1);
          const chunkId = source.chunk_id || 'Unknown';
          sourcesHtml += `<li style="margin-bottom: 4px;">Source ${idx + 1}: ${chunkId} (${similarity}% match)</li>`;
        });
        sourcesHtml += '</ul></div>';
      }

      // Format cost and tokens
      const costHtml = `
        <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-top: 16px;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #495057;">Processing Details:</p>
          <ul style="margin: 0; padding-left: 20px; color: #6c757d; font-size: 13px;">
            <li><strong>Model:</strong> ${result.model_used}</li>
            <li><strong>Tier:</strong> ${result.model_tier}</li>
            <li><strong>Index:</strong> ${result.index_used}</li>
            <li><strong>Cost:</strong> $${result.cost.toFixed(4)}</li>
            <li><strong>Tokens:</strong> ${result.tokens.input} input, ${result.tokens.output} output (${result.tokens.total} total)</li>
          </ul>
        </div>
      `;

      // Show the answer in a modal
      this.messageModal.show({
        title: "Quick Answer Result",
        message: `
          <div style="line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
            <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 12px; border-radius: 4px; margin-bottom: 16px;">
              <strong>Answer:</strong>
              <div style="margin-top: 8px; color: #155724; white-space: pre-wrap;">${result.answer}</div>
            </div>
            ${sourcesHtml}
            ${costHtml}
          </div>
        `,
        buttonText: "Got it!",
        allowClose: true,
        autoHide: false
      });

      console.log(`[_handleQuickAnswer] Successfully displayed answer`);

    } catch (error) {
      console.error('[_handleQuickAnswer] Quick answer failed:', error);

      // Hide loading modal
      this.messageModal.hide();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Show error modal
      this.errorModal.show({
        title: "Quick Answer Failed",
        message: error.message || "An unexpected error occurred while getting the quick answer.",
        details: error.stack
      });
    }
  }

  /**
   * Enhanced AI answer handler with proper model parameter support
   * @param {string} mode - The AI model mode ('standard-model' or 'enhanced-model')
   * @param {number} questionCount - Number of questions to process
   * @param {number} subJobCount - Number of sub-jobs that will be created
   */
  async _handleEnhancedAiAnswer(mode, questionCount, subJobCount) {
    // Import utilities dynamically to avoid circular dependencies
    const { validateItemsForAI, processDocumentItemsForAI } = await import("../../api/questions-jobs.js");

    // Show progress indicator
    const progressEl = document.createElement('div');
    progressEl.style.position = 'fixed';
    progressEl.style.top = '0';
    progressEl.style.left = '0';
    progressEl.style.width = '100%';
    progressEl.style.height = '4px';
    progressEl.style.backgroundColor = '#f0f0f0';
    progressEl.style.zIndex = '9999';

    const progressBar = document.createElement('div');
    progressBar.style.width = '0%';
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = '#4CAF50';
    progressBar.style.transition = 'width 0.3s';
    progressEl.appendChild(progressBar);

    document.body.appendChild(progressEl);

    // Simulate progress movement
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 1;
      if (progress > 95) {
        clearInterval(progressInterval);
      }
      progressBar.style.width = `${Math.min(progress, 95)}%`;
    }, 100);

    const cleanupProgress = () => {
      clearInterval(progressInterval);
      if (document.body.contains(progressEl)) {
        document.body.removeChild(progressEl);
      }
    };

    try {
      // ISSUE #9 FIX: Get fresh selected items from grid API to ensure we have latest content assignments
      let itemsToProcess = [];
      if (this.questionsGrid && this.questionsGrid.gridApi) {
        const selectedNodes = this.questionsGrid.gridApi.getSelectedNodes();
        itemsToProcess = selectedNodes.map(node => node.data);
      } else {
        // Fallback to cached selectedRows if grid API not available
        itemsToProcess = [...this.selectedRows];
      }

      if (itemsToProcess.length === 0) {
        cleanupProgress();
        this.messageModal.show({
          title: "No Questions Selected",
          message: "Please select questions to answer with AI."
        });
        return;
      }

      // ISSUE #8 FIX: Validation is now done in control pane BEFORE confirmation modal
      // Just validate the data is not empty here as a safety check
      if (itemsToProcess.length === 0) {
        cleanupProgress();
        this.messageModal.show({
          title: "No Questions Selected",
          message: "Please select questions to answer with AI."
        });
        return;
      }

      // Transform all selected rows to question format
      const questions = itemsToProcess.map((row, index) => this.transformRowToQuestion(row, index));

      // Validate content configurations
      const contentValidationErrors = [];
      for (const question of questions) {
        if (question.content) {
          try {
            const contentConfig = typeof question.content === 'string' ?
              JSON.parse(question.content) : question.content;

            const validation = this.validateContentConfiguration(contentConfig);
            if (!validation.valid) {
              contentValidationErrors.push(`Question ${question.question_id}: ${validation.errors.join(', ')}`);
            }
          } catch (err) {
            contentValidationErrors.push(`Question ${question.question_id}: Invalid content JSON`);
          }
        }
      }

      if (contentValidationErrors.length > 0) {
        cleanupProgress();

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 100));

        this.errorModal.show({
          title: "Content Validation Failed",
          message: `The following content validation errors must be fixed:\n\n${contentValidationErrors.join('\n')}`
        });
        return;
      }

      // Group questions by content configuration
      const questionsByContent = this.groupQuestionsByContent(questions);

      // Map the mode to the correct service name for the API
      let primaryCqaService;
      if (mode === 'standard-model') {
        primaryCqaService = 'standard-model';
      } else if (mode === 'enhanced-model') {
        primaryCqaService = 'enhanced-model';
      } else {
        // Fallback for any other values
        primaryCqaService = 'standard-model';
      }

      // Build the payload structure with correct service names
      const payload = {
        questions_by_content: questionsByContent,
        primary_cqa_service: primaryCqaService,
        fallback_cqa_service: 'standard-model',
        qa_instructions: '',
        extra_instruction: ''
      };

      console.log(`[StageFormRfpAnswerQuestions] AI job configured: ${primaryCqaService} service, ${Object.keys(questionsByContent).length} content groups`);

      // Check if we have the job controller
      if (!this.jobController) {
        throw new Error("Job controller not initialized. Please try again.");
      }

      // Update processing indicator
      this.updateProcessingIndicator("Starting job...");

      // Add stage metadata to payload for job tracking
      payload.stageId = this.currentStageId;
      payload.groupId = this.groupId;

      // Get the current group/topic name for enhanced job display
      let currentGroupName = "Unknown Topic";
      if (this.groups && this.currentGroupId) {
        const currentGroup = this.groups.find(g => {
          // Extract the group ID from the full stage_group_id
          const parts = g.stage_group_id.split('#');
          const groupId = parts[parts.length - 1];
          return groupId === this.currentGroupId;
        });
        if (currentGroup) {
          currentGroupName = currentGroup.friendly_name || currentGroup.name || this.currentGroupId;
        }
      }

      // Add enhanced metadata for job display
      payload.processName = "RFP Workflow";
      payload.topicName = currentGroupName;
      payload.questionCount = itemsToProcess.length;
      
      // Add human-readable job description for TopBar display
      const questionText = itemsToProcess.length === 1 ? 'question' : 'questions';
      payload.description = `${payload.processName} - ${currentGroupName} (${itemsToProcess.length} ${questionText})`;

      console.log(`[StageFormRfpAnswerQuestions] Job payload prepared: ${payload.description}`);

      // Make the API call via JobController - use compositeId for job tracking
      const result = await this.jobController.startQuestionJob(
        payload,
        this.compositeDocumentId,
        this.groupId
      );

      // Check for master job ID
      if (!result.question_master_jid) {
        throw new Error("Invalid response from server. No master job ID received.");
      }

      // Hide processing modal BEFORE showing success modal
      cleanupProgress();

      // Add explicit delay to ensure processing modal is fully hidden
      await new Promise(resolve => setTimeout(resolve, 200));

      // Handle success - Show detailed success message
      console.log("[StageFormRfpAnswerQuestions] AI job started successfully with ID:", result.question_master_jid);

      // Create detailed success message
      const totalQuestions = itemsToProcess.length;
      const contentGroupCount = Object.keys(questionsByContent).length;
      const subJobCountFromResult = result.question_sub_job_count || 1;
      const jobId = result.question_master_jid;
      const modelName = mode === 'enhanced-model' ? 'Enhanced' : 'Standard';

      // ISSUE #8 FIX: Remove emojis from enterprise B2B messaging  
      let successMessage = `
        <div style="line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
            <p style="margin: 0 0 16px 0; font-size: 16px; color: #28a745;">
                <strong>Successfully started AI question answering job!</strong>
            </p>
            
            <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 16px 0;">
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #495057;">Job Details:</p>
                <ul style="margin: 0; padding-left: 20px; color: #6c757d;">
                    <li><strong>Job ID:</strong> <code style="background: #e9ecef; padding: 2px 4px; border-radius: 3px; font-size: 12px;">${jobId}</code></li>
                    <li><strong>Model:</strong> ${modelName} Model</li>
                    <li><strong>Total Questions:</strong> ${totalQuestions}</li>
                    <li><strong>Content Groups:</strong> ${contentGroupCount}</li>
                    <li><strong>Processing Batches:</strong> ${subJobCountFromResult}</li>
                </ul>
            </div>
            
            <p style="margin: 16px 0 0 0; padding: 12px; background: #d4edda; border-left: 4px solid #28a745; border-radius: 4px; color: #155724;">
                <strong>The job is now processing in the background.</strong><br>
                You'll see results appear in the grid as they complete.
            </p>
        </div>`;

      // Ensure any existing modals are closed first
      if (this.messageModal && typeof this.messageModal.hide === 'function') {
        this.messageModal.hide();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // ISSUE #8 FIX: Remove emojis from enterprise B2B messaging
      this.messageModal.show({
        title: "AI Job Started Successfully",
        message: successMessage,
        buttonText: "Got it!",
        allowClose: true,
        autoHide: false
      });

      // Also log a summary for debugging
      console.log(`[StageFormRfpAnswerQuestions] Job Summary: ${totalQuestions} questions, ${subJobCountFromResult} batches, ${contentGroupCount} content groups, Model: ${modelName}, Job ID: ${jobId}`);

      // Phase 2: Apply visual processing indicators to selected rows
      if (this.questionsGrid && typeof this.questionsGrid.markRowsAsProcessing === 'function') {
        try {
          this.questionsGrid.markRowsAsProcessing(itemsToProcess, jobId);
        } catch (error) {
          console.error('[StageFormRfpAnswerQuestions] Error applying visual processing indicators:', error);
        }
      }

    } catch (error) {
      console.error('[StageFormRfpAnswerQuestions] Error in _handleEnhancedAiAnswer:', error);

      // Ensure processing modal is hidden on error
      cleanupProgress();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Show error modal
      this.errorModal.show({
        title: "Error Starting AI Processing",
        message: `Failed to process questions: ${error.message || "Unknown error"}`
      });
    }
  }

  /**
 * Update processing indicator message
 * @param {string} message The updated message
 */
  updateProcessingIndicator(message) {
    console.log(`[StageFormRfpAnswerQuestions] updateProcessingIndicator called with message: ${message}`);

    // Find the message element and update it
    const modalContent = document.querySelector(".message-modal .message-modal-content p");
    if (modalContent) {
      modalContent.textContent = message;
      console.log("[StageFormRfpAnswerQuestions] Processing message updated successfully");
    } else {
      console.warn("[StageFormRfpAnswerQuestions] Could not find processing message element to update");
    }
  }

  /**
   * Build a content key from a content configuration object
   * @param {Object} contentConfig - Content configuration object
   * @returns {string} - JSON string key for grouping
   */
  buildContentKey(contentConfig) {
    // Ensure consistent key ordering for grouping
    const orderedConfig = {
      corpus: contentConfig.corpus,
      ...(contentConfig.domain && { domain: contentConfig.domain }),
      ...(contentConfig.unit && { unit: contentConfig.unit }),
      document_topics: contentConfig.document_topics || [],
      document_types: contentConfig.document_types || [],
      ...(contentConfig.language_rules && { language_rules: contentConfig.language_rules })
    };

    return JSON.stringify(orderedConfig);
  }

  /**
   * Group questions by their content configuration
   * @param {Array} questions - Array of question objects with content property
   * @returns {Object} - Questions grouped by content key
   */
  groupQuestionsByContent(questions) {
    const grouped = {};

    for (const question of questions) {
      if (!question.content) {
        console.warn('[StageFormRfpAnswerQuestions] Question missing content configuration:', question.question_id);
        continue;
      }

      let contentConfig;
      try {
        // Parse content if it's a string
        contentConfig = typeof question.content === 'string' ?
          JSON.parse(question.content) : question.content;
      } catch (err) {
        console.error(`[StageFormRfpAnswerQuestions] Invalid content JSON for question ${question.question_id}:`, err);
        continue;
      }

      const contentKey = this.buildContentKey(contentConfig);

      if (!grouped[contentKey]) {
        grouped[contentKey] = [];
      }

      // Remove content from question object since it's now the key
      const { content, ...questionWithoutContent } = question;
      grouped[contentKey].push(questionWithoutContent);
    }

    return grouped;
  }

  /**
   * Transform grid row to question format expected by Lambda
   * @param {Object} row - Grid row data
   * @param {number} index - Row index for display_order
   * @returns {Object} - Formatted question object
   */
  transformRowToQuestion(row, index) {
    // Extract project_document_id from the stage_group_item_id or use context
    let projectDocumentId = this.projectDocumentId;

    // If stage_group_item_id contains the project document ID, extract it
    if (row.project_document_stage_group_id_item_id) {
      const parts = row.project_document_stage_group_id_item_id.split('#');
      if (parts.length > 6) {
        projectDocumentId = parts.slice(0, -6).join('#');
      }
    }

    // Create item_data from available fields (no username needed - backend gets it from token)
    const itemData = {
      notes: row.notes || '',
      modified_by: row.modified_by || '',
      modified_datetime: row.modified_datetime || '',
      locked_by: row.locked_by || null
    };

    return {
      project_document_id: projectDocumentId,
      stage_group_item_id: row.project_document_stage_group_id_item_id,
      question_id: row.question_id || '',
      question_text: row.question_text || '',
      guidance: row.guidance || '',
      answer_text: row.answer_text || '',
      status: row.status || 'PENDING_REVIEW',
      display_order: row.display_order || index,
      item_data: JSON.stringify(itemData),
      content: row.content // Keep for grouping
    };
  }

  /**
   * Validate content configuration against corpus rules
   * @param {Object} contentConfig - Content configuration to validate
   * @returns {Object} - {valid: boolean, errors: string[]}
   */
  validateContentConfiguration(contentConfig) {
    const errors = [];

    // Check required fields
    const requiredFields = ['corpus', 'document_topics', 'document_types'];
    for (const field of requiredFields) {
      if (!contentConfig[field]) {
        errors.push(`Missing required field: ${field}`);
      } else if (Array.isArray(contentConfig[field]) && contentConfig[field].length === 0) {
        errors.push(`Required field '${field}' cannot be empty`);
      }
    }

    // Validate against corpus config if available
    const corpusConfig = this.subtenantCache?.corpus_config;
    if (corpusConfig && contentConfig.corpus) {
      const corpus = corpusConfig.corpora?.[contentConfig.corpus];
      if (!corpus) {
        errors.push(`Invalid corpus: '${contentConfig.corpus}'`);
      } else {
        // Validate document_topics
        const validTopics = corpus.document_topics_choices || [];
        const topics = contentConfig.document_topics || [];
        for (const topic of topics) {
          if (!validTopics.includes(topic)) {
            errors.push(`Invalid document_topic: '${topic}'`);
          }
        }

        // Validate document_types
        const validTypes = corpus.document_types_choices || [];
        const types = contentConfig.document_types || [];
        for (const type of types) {
          if (!validTypes.includes(type)) {
            errors.push(`Invalid document_type: '${type}'`);
          }
        }

        // Validate domain/unit hierarchy
        const domainHierarchy = corpus.domain_hierarchy || {};
        if (contentConfig.domain && !domainHierarchy[contentConfig.domain]) {
          errors.push(`Invalid domain: '${contentConfig.domain}'`);
        } else if (contentConfig.domain && contentConfig.unit) {
          const validUnits = domainHierarchy[contentConfig.domain] || [];
          if (!validUnits.includes(contentConfig.unit)) {
            errors.push(`Invalid unit: '${contentConfig.unit}' for domain '${contentConfig.domain}'`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Centralized utility function for updating grid rows after bulk operations
   * @param {Array} updatedItems - Array of updated items from API response
   * @param {Object} gridApi - AG Grid API instance
   * @param {boolean} refreshAfterUpdate - Whether to refresh the entire grid after update
   * @returns {boolean} Success indicator
   */
  updateGridRowsAfterBulkOperation(updatedItems, gridApi, refreshAfterUpdate = false) {
    if (!gridApi || !updatedItems || updatedItems.length === 0) {
      console.warn("[updateGridRowsAfterBulkOperation] Invalid parameters");
      return false;
    }

    try {

      // Create sanitized copies of items with subtenant prefixes stripped
      const sanitizedItems = updatedItems.map(item => {
        // Create a deep copy to avoid modifying the original
        const newItem = { ...item };

        // Strip subtenant prefix from owner_username
        if (newItem.owner_username && typeof newItem.owner_username === 'string') {
          const prefixMatch = newItem.owner_username.match(/^[^_]+___(.+)$/);
          if (prefixMatch && prefixMatch[1]) {
            newItem.owner_username = prefixMatch[1];
          }
        }

        // Strip subtenant prefix from owner_stage_doc_key
        if (newItem.owner_stage_doc_key && typeof newItem.owner_stage_doc_key === 'string') {
          const parts = newItem.owner_stage_doc_key.split('#');
          if (parts.length > 0 && parts[0].includes('___')) {
            const prefixMatch = parts[0].match(/^[^_]+___(.+)$/);
            if (prefixMatch && prefixMatch[1]) {
              parts[0] = prefixMatch[1];
              newItem.owner_stage_doc_key = parts.join('#');
            }
          }
        }

        // Strip subtenant prefix from project_document_id if needed
        if (newItem.project_document_id && typeof newItem.project_document_id === 'string') {
          const prefixMatch = newItem.project_document_id.match(/^[^_]+___(.+)$/);
          if (prefixMatch && prefixMatch[1]) {
            newItem.project_document_id = prefixMatch[1];
          }
        }

        return newItem;
      });

      // Option 1: Apply transaction with sanitized data
      gridApi.applyTransaction({
        update: sanitizedItems
      });

      // Option 2: If Transaction fails or refresh is requested, force refresh entire grid data
      if (refreshAfterUpdate) {
        setTimeout(() => {
          // Get current data
          const currentData = [];
          gridApi.forEachNode(node => {
            if (node.data) currentData.push(node.data);
          });

          // Map updates to current data
          const updatedIds = sanitizedItems.map(item => item.project_document_stage_group_id_item_id);
          const newData = currentData.map(row => {
            const matchingUpdate = sanitizedItems.find(
              item => item.project_document_stage_group_id_item_id === row.project_document_stage_group_id_item_id
            );
            return matchingUpdate || row;
          });

          // Set all data at once
          gridApi.setGridOption('rowData', newData);
        }, 100);
      }

      // Ensure cell heights adjust for content
      setTimeout(() => {
        gridApi.resetRowHeights();
      }, 200);

      return true;
    } catch (err) {
      console.error("[updateGridRowsAfterBulkOperation] Error updating grid:", err);
      return false;
    }
  }

  /**
   * Called when stage is being exited - cleanup resources
   */
  onExit() {
    console.log("[StageFormRfpAnswerQuestions] Cleaning up stage resources");
    
    // Phase 2: Cleanup global job callbacks
    this.cleanupGlobalJobCallbacks();
    
    // Cleanup grid resources
    if (this.questionsGrid && typeof this.questionsGrid.destroy === 'function') {
      this.questionsGrid.destroy();
    }
    
    // Cleanup control pane resources
    if (this.controlPane && typeof this.controlPane.destroy === 'function') {
      this.controlPane.destroy();
    }
  }

}