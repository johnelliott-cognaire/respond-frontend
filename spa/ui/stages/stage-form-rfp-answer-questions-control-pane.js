// File: ui/stages/stage-form-rfp-answer-questions-control-pane.js
import {
    getLabelFriendlyName,
    hasLimitBreached,
    processLicenseLimits
} from "../../api/subtenants.js";
import { getFreshSecurity } from "../../state/security.js";
import { ChooseContentForAIModal } from "../../ui/modals/choose-content-for-ai-modal.js";
import { ErrorModal } from "../../ui/modals/error-modal.js";
import { ExportModal } from "../../ui/modals/export-modal.js";
import { MessageModal } from "../../ui/modals/message-modal.js";
import { YesNoModal } from "../../ui/modals/yesno-modal.js";
import { fullScreenManager } from "../../utils/fullscreen-manager.js";

/**
 * ControlPane
 * Renders the top toolbar with Shoelace buttons for:
 *  - Filter: "All", "Assigned to Me", "Assigned & Unconfirmed", "Refresh"
 *  - Bulk Actions: Delete, Unlock, Assign Module, Assign Owner, Move to Sheet
 *  - AI Answer & History
 *  - "Add Row" button next to History button
 *
 * @optimized Performance improvements:
 * - Asynchronous loading of dropdown options
 * - Cached license check results
 * - Optimized button state updates
 * - Lazy loading of non-critical UI elements
 */
export class ControlPane {
    constructor({
        onAction,
        currentUsername,
        groups = [],
        currentGroupId = null,
        subtenantCache = {},
        corpusUsers = [],
        projectId,          // composite id  "account#project"
        documentId,         // document id for export context
        store,              // <— pass your global app store through
        docMetadata = {},   // document metadata for permission checking
        getProjectData = null  // function to get cached project data
    }) {
        this.onAction = onAction;
        this.currentUsername = currentUsername || "guest";
        this.groups = groups || [];
        this.currentGroupId = currentGroupId;
        this.corpusUsers = corpusUsers || [];
        this.projectId = projectId;
        this.documentId = documentId;
        this.store = store;
        this.docMetadata = docMetadata;
        this.getProjectData = getProjectData;
        this._projectCorpusCached = null;

        // Initialize security
        this.security = getFreshSecurity(this.store);

        //// console.log("[ControlPane] Constructor called with projectId:", projectId);

        //// console.log("[ControlPane] Constructor called with subtenantCache:",
        //    Object.keys(subtenantCache).join(", "));

        // Important: Make a deep copy of the subtenantCache to prevent reference issues
        this.subtenantCache = subtenantCache ? JSON.parse(JSON.stringify(subtenantCache)) : {};

        // Add event listeners for cache invalidation
        this.setupCacheEventListeners();

        // Store subscription IDs for cleanup
        this.storeSubscriptionIds = [];

        // Subscribe to store updates to keep subtenantCache in sync
        if (this.store) {
            // Subscribe to corpus_config changes
            const corpusConfigId = this.store.subscribe('corpus_config', (newCorpusConfig) => {
                // console.log("[ControlPane] Store corpus_config updated, syncing cache");
                if (newCorpusConfig) {
                    this.subtenantCache.corpus_config = JSON.parse(JSON.stringify(newCorpusConfig));
                    // Clear cached content options to force regeneration
                    this.contentOptionsCache = null;
                    // Update content dropdown if it's already rendered
                    if (document.querySelector('.content-menu')) {
                        this.updateContentDropdown();
                    }
                }
            });
            this.storeSubscriptionIds.push({ key: 'corpus_config', id: corpusConfigId });

            // Subscribe to label_friendly_names changes
            const labelNamesId = this.store.subscribe('label_friendly_names', (newLabels) => {
                // console.log("[ControlPane] Store label_friendly_names updated, syncing cache");
                if (newLabels) {
                    this.subtenantCache.label_friendly_names = JSON.parse(JSON.stringify(newLabels));
                    // Clear cached content options to force regeneration
                    this.contentOptionsCache = null;
                    // Update content dropdown if it's already rendered
                    if (document.querySelector('.content-menu')) {
                        this.updateContentDropdown();
                    }
                }
            });
            this.storeSubscriptionIds.push({ key: 'label_friendly_names', id: labelNamesId });

            // Subscribe to document_topics_type_preselection changes
            const preselectionId = this.store.subscribe('document_topics_type_preselection', (newPreselection) => {
                // console.log("[ControlPane] Store document_topics_type_preselection updated, syncing cache");
                if (newPreselection) {
                    this.subtenantCache.document_topics_type_preselection = JSON.parse(JSON.stringify(newPreselection));
                }
            });
            this.storeSubscriptionIds.push({ key: 'document_topics_type_preselection', id: preselectionId });

            // Initial sync with store if data exists
            const storeCorpusConfig = this.store.get('corpus_config');
            if (storeCorpusConfig && (!this.subtenantCache.corpus_config || Object.keys(this.subtenantCache.corpus_config).length === 0)) {
                // console.log("[ControlPane] Syncing with store corpus_config on initialization");
                this.subtenantCache.corpus_config = JSON.parse(JSON.stringify(storeCorpusConfig));
            }

            const storeLabelNames = this.store.get('label_friendly_names');
            if (storeLabelNames && (!this.subtenantCache.label_friendly_names || Object.keys(this.subtenantCache.label_friendly_names).length === 0)) {
                // console.log("[ControlPane] Syncing with store label_friendly_names on initialization");
                this.subtenantCache.label_friendly_names = JSON.parse(JSON.stringify(storeLabelNames));
            }

            const storePreselection = this.store.get('document_topics_type_preselection');
            if (storePreselection && (!this.subtenantCache.document_topics_type_preselection || Object.keys(this.subtenantCache.document_topics_type_preselection).length === 0)) {
                // console.log("[ControlPane] Syncing with store document_topics_type_preselection on initialization");
                this.subtenantCache.document_topics_type_preselection = JSON.parse(JSON.stringify(storePreselection));
            }
        }

        this.defaultCorpus = this._getDefaultCorpus();

        // Track selected row count for button enablement
        this.selectedCount = 0;
        this.anyRows = false;
        this.selectedRows = [];

        this.confirmModal = new YesNoModal();
        this.errorModal = new ErrorModal();
        this.messageModal = new MessageModal();
        this.exportModal = new ExportModal();

        // Initialize compact view state from localStorage or default to false
        this.isCompactView = this.loadCompactViewState();
        
        // Font size control state
        this.currentFontSize = 14; // Default font size in pixels
        this.minFontSize = 10;
        this.maxFontSize = 20;

        // Button configurations for centralized management
        this.buttonConfigs = {
            // Filter buttons
            "all": { selectionRequired: false, confirmAction: false },
            "me": { selectionRequired: false, confirmAction: false },
            "unconfirmed": { selectionRequired: false, confirmAction: false },
            "refresh": { selectionRequired: false, confirmAction: false },
            "compactView": { selectionRequired: false, confirmAction: false },
            "increaseFontSize": { selectionRequired: false, confirmAction: false },
            "decreaseFontSize": { selectionRequired: false, confirmAction: false },

            // Action buttons
            "delete": {
                selectionRequired: true,
                minSelection: 1,
                confirmAction: true,
                confirmMessage: (count) => `Are you sure you want to delete ${count} selected item(s)?`,
                confirmTitle: "Confirm Delete"
            },
            "unlock": {
                selectionRequired: true,
                minSelection: 1,
                confirmAction: true,
                confirmMessage: (count) => `Are you sure you want to unlock ${count} selected item(s)?`,
                confirmTitle: "Confirm Unlock"
            },
            "assignContent": { selectionRequired: true, minSelection: 1, confirmAction: false },
            "assignOwner": { selectionRequired: true, minSelection: 1, confirmAction: false },
            "moveSheet": {
                selectionRequired: true,
                minSelection: 1,
                confirmAction: false,
                requireMultipleGroups: true
            },

            // Answer/History buttons
            "addRow": { selectionRequired: false, confirmAction: false },
            "history": { selectionRequired: true, exactSelection: 1, confirmAction: false },
            "viewDetail": { selectionRequired: true, exactSelection: 1, confirmAction: false },
            "analytics": { selectionRequired: false, confirmAction: false },
            "fullScreen": { selectionRequired: false, confirmAction: false },
            "export": { selectionRequired: false, confirmAction: false }
        };

        // Add state for AI button
        this.aiButtonState = {
            standardEnabled: false,
            enhancedEnabled: false,
            licenseWarning: null
        };

        // Add flag to track if license check is in progress
        this.licenseCheckInProgress = false;

        // Cache for expensive operations
        this.contentOptionsCache = null;
        this.licenseCheckCache = null;
        this.licenseCheckTimestamp = 0;

        // Add loading state tracking
        this.loadingStates = {
            content: false,
            owner: false,
            license: false
        };

        // Reference to the job controller
        this.jobController = null;
        this.projectDocumentId = null;
        this.groupId = null;

        // Font size configuration
        this.currentFontSize = 14;
        this.minFontSize = 10;
        this.maxFontSize = 20;
    }

    /**
     * Set the job controller for AI jobs
     * @param {Object} controller The job controller instance
     */
    setJobController(controller) {
        this.jobController = controller;
    }

    /**
     * Set the document context IDs
     * @param {string} projectDocumentId The project document ID
     * @param {string} groupId The group/sheet ID
     */
    setDocumentContext(projectDocumentId, groupId) {
        this.projectDocumentId = projectDocumentId;
        this.groupId = groupId;
    }

    /**
     * Get the most up-to-date subtenant cache, ensuring it includes store data
     * @returns {Object} The current subtenant cache with store data merged
     */
    _getCurrentSubtenantCache() {
        // Start with the cached version
        let currentCache = { ...this.subtenantCache };

        // Ensure we have the latest store data
        if (this.store) {
            const storeCorpusConfig = this.store.get('corpus_config');
            if (storeCorpusConfig) {
                currentCache.corpus_config = JSON.parse(JSON.stringify(storeCorpusConfig));
            }

            const storeLabelNames = this.store.get('label_friendly_names');
            if (storeLabelNames) {
                currentCache.label_friendly_names = JSON.parse(JSON.stringify(storeLabelNames));
            }

            const storePreselection = this.store.get('document_topics_type_preselection');
            if (storePreselection) {
                currentCache.document_topics_type_preselection = JSON.parse(JSON.stringify(storePreselection));
            }
        }

        return currentCache;
    }
    _getDefaultCorpus() {
        // Check if the corpus_config exists and has a default_corpus
        if (this.subtenantCache &&
            this.subtenantCache.corpus_config &&
            this.subtenantCache.corpus_config.default_corpus) {

            const defaultCorpus = this.subtenantCache.corpus_config.default_corpus;

            // Check if it's a DynamoDB typed value
            if (typeof defaultCorpus === 'object' && 'S' in defaultCorpus) {
                return defaultCorpus.S;
            }

            // Otherwise return as is
            return defaultCorpus;
        }

        return "rfp"; // Default fallback
    }

    render(container) {
        container.innerHTML = `
    <div class="control-pane responsive-control-pane">
      <div class="sub-pane filter-pane">
        <!-- Filter Button Group -->
        <sl-button-group label="Filter">
          <sl-button size="small" data-action="all" data-filter="all" pill>
            <sl-icon name="list" slot="prefix"></sl-icon>
            <span>All</span>
          </sl-button>
          <sl-button size="small" data-action="me" data-filter="me" pill>
            <sl-icon name="person" slot="prefix"></sl-icon>
            <span>Assigned</span>
          </sl-button>
          <sl-button size="small" data-action="unconfirmed" data-filter="unconfirmed" pill>
            <sl-icon name="check2-square" slot="prefix"></sl-icon>
            <span>Unconfirmed</span>
          </sl-button>
        </sl-button-group>

        <sl-button size="small" data-action="refresh" class="refresh-btn circle" circle title="Refresh">
          <sl-icon name="arrow-clockwise"></sl-icon>
        </sl-button>
        
        <!-- Compact View Toggle (icon-only) -->
        <sl-button size="small" data-action="compactView" class="compact-view-btn circle" id="compactViewBtn" circle title="Toggle Compact View">
          <sl-icon name="layout-three-columns"></sl-icon>
        </sl-button>
        
        <!-- Full Screen Toggle (icon-only) -->
        <sl-button size="small" data-action="fullScreen" class="fullscreen-btn circle" id="fullScreenBtn" circle title="Enter Full Screen Mode">
          <sl-icon name="arrows-fullscreen"></sl-icon>
        </sl-button>
        
        <!-- Font Size Controls -->
        <sl-button-group label="Font Size">
          <sl-button size="small" data-action="decreaseFontSize" class="font-decrease-btn" title="Decrease font size">
            <sl-icon name="type" style="transform: scale(0.8);"></sl-icon>
          </sl-button>
          <sl-button size="small" data-action="increaseFontSize" class="font-increase-btn" title="Increase font size">
            <sl-icon name="type" style="transform: scale(1.2);"></sl-icon>
          </sl-button>
        </sl-button-group>
      </div>

      <div class="sub-pane actions-pane">
        <!-- Bulk actions - No text spans for icon-only buttons -->
        <sl-button size="small" data-action="delete" class="delete-btn" disabled title="Delete selected items">
          <sl-icon name="trash" slot="prefix"></sl-icon>
        </sl-button>

        <sl-button size="small" data-action="unlock" class="unlock-btn" disabled title="Unlock selected items">
          <sl-icon name="unlock" slot="prefix"></sl-icon>
        </sl-button>

        <sl-dropdown hoist class="assign-content-dropdown">
          <sl-button size="small" slot="trigger" data-action="assignContent" class="assign-content-btn" disabled>
            <sl-icon name="box" slot="prefix"></sl-icon>
            <span>Content</span>
            <sl-icon slot="suffix" name="chevron-down"></sl-icon>
          </sl-button>
          <sl-menu class="content-menu">
            <sl-menu-label class="content-loading-placeholder">Loading content options...</sl-menu-label>
          </sl-menu>
        </sl-dropdown>

        <sl-dropdown hoist class="assign-owner-dropdown">
          <sl-button size="small" slot="trigger" data-action="assignOwner" class="assign-owner-btn" disabled>
            <sl-icon name="people" slot="prefix"></sl-icon>
            <span>Owner</span>
            <sl-icon slot="suffix" name="chevron-down"></sl-icon>
          </sl-button>
          <sl-menu class="owner-menu">
            <sl-menu-label class="owner-loading-placeholder">Loading users...</sl-menu-label>
          </sl-menu>
        </sl-dropdown>

        <sl-dropdown hoist class="move-sheet-dropdown">
          <sl-button size="small" slot="trigger" data-action="moveSheet" class="move-sheet-btn" disabled>
            <sl-icon name="folder-plus" slot="prefix"></sl-icon>
            <span>Move</span>
            <sl-icon slot="suffix" name="chevron-down"></sl-icon>
          </sl-button>
          <sl-menu class="sheet-menu">
            <!-- Dynamically populated with available groups -->
            <sl-menu-label class="sheet-loading-placeholder">Loading sheets...</sl-menu-label>
          </sl-menu>
        </sl-dropdown>

      </div>

      <div class="sub-pane answer-pane">
        <!-- Answer pane -->
        <sl-button size="small" data-action="addRow" class="add-row-btn" title="Add new question">
          <sl-icon name="plus" slot="prefix"></sl-icon>
        </sl-button>
        
        <sl-button size="small" data-action="history" class="history-btn" disabled title="View item history">
          <sl-icon name="clock-history" slot="prefix"></sl-icon>
        </sl-button>
        
        <sl-button size="small" data-action="viewDetail" class="view-detail-btn" disabled>
          <sl-icon name="card-text" slot="prefix"></sl-icon>
          <span>Details</span>
        </sl-button>

        <!-- Analytics (icon-only) -->
        <sl-button size="small"
                   data-action="analytics"
                   class="analytics-btn circle"
                   circle
                   title="Analytics">
          <sl-icon name="bar-chart"></sl-icon>
        </sl-button>
        
        <!-- Export Button (icon-only) -->
        <sl-button size="small" data-action="export" class="export-btn circle" circle title="Export Data">
          <sl-icon name="download"></sl-icon>
        </sl-button>

        <sl-dropdown hoist class="ai-answer-dropdown">
            <sl-button size="small" slot="trigger" data-action="aiAnswer" class="ai-answer-btn" disabled>
                <sl-icon name="cpu" slot="prefix"></sl-icon>
                <span>Answer Using AI</span>
                <sl-icon slot="suffix" name="chevron-down"></sl-icon>
            </sl-button>
            <sl-menu class="ai-mode-menu">
                <!-- Standard Model Options -->
                <sl-menu-item value="standard-bulk" data-tier="standard" data-path="bulk">
                    <sl-icon slot="prefix" name="layers"></sl-icon>
                    Standard Model (Bulk)
                </sl-menu-item>

                <!-- Standard Quick - Hidden by default, shown for single row selection -->
                <sl-menu-item class="standard-quick-item" style="display: none;">
                    <sl-icon slot="prefix" name="lightning"></sl-icon>
                    Standard Model (Quick)
                    <sl-menu slot="submenu" class="vector-index-submenu standard-vector-submenu">
                        <sl-menu-label>Loading vector indexes...</sl-menu-label>
                    </sl-menu>
                </sl-menu-item>

                <sl-divider></sl-divider>

                <!-- Enhanced Model Options -->
                <sl-menu-item value="enhanced-bulk" data-tier="enhanced" data-path="bulk">
                    <sl-icon slot="prefix" name="layers"></sl-icon>
                    Enhanced Model (Bulk)
                </sl-menu-item>

                <!-- Enhanced Quick - Hidden by default, shown for single row selection -->
                <sl-menu-item class="enhanced-quick-item" style="display: none;">
                    <sl-icon slot="prefix" name="lightning"></sl-icon>
                    Enhanced Model (Quick)
                    <sl-menu slot="submenu" class="vector-index-submenu enhanced-vector-submenu">
                        <sl-menu-label>Loading vector indexes...</sl-menu-label>
                    </sl-menu>
                </sl-menu-item>
            </sl-menu>
        </sl-dropdown>
      </div>
    </div>
    `;

        // Attach events to all buttons using the centralized handler
        this.attachButtonEvents(container);

        // Set initial state for buttons
        this.updateSelectionState([]);

        // Initialize responsive label management AFTER DOM is ready
        this.initializeResponsiveLabels();

        // Asynchronously initialize dropdowns
        this.initializeDropdowns();
    }

    /**
     * Attach event handlers to all buttons using the centralized handler
     * @param {HTMLElement} container - The container element with buttons
     */
    attachButtonEvents(container) {
        // Find all buttons with data-action attributes
        const buttons = container.querySelectorAll('sl-button[data-action]');
        
        buttons.forEach(button => {
            // Skip buttons that already have event listeners attached
            if (button._controlPaneEventAttached) {
                return;
            }
            
            // Attach click handler
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // Call the centralized handler
                this.handleButtonAction(button);
            });
            
            // Mark as handled to prevent duplicate event listeners
            button._controlPaneEventAttached = true;
        });
        
        // Find filter buttons (special handling for data-filter attribute)
        const filterButtons = container.querySelectorAll('sl-button[data-filter]');
        
        filterButtons.forEach(button => {
            if (button._controlPaneFilterEventAttached) {
                return;
            }
            
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                const filterType = button.getAttribute('data-filter');
                this.handleFilterAction(filterType);
            });
            
            button._controlPaneFilterEventAttached = true;
        });
        
        console.log(`[ControlPane] Attached events to ${buttons.length} action buttons and ${filterButtons.length} filter buttons`);
        
        // Initialize compact view button state based on localStorage
        this.initializeCompactViewButton(container);
    }

    /**
     * Initialize the compact view button to match the saved state
     * @param {HTMLElement} container - The container element to search for the button
     */
    initializeCompactViewButton(container) {
        const compactViewButton = container.querySelector('sl-button[data-action="compactView"]');
        if (compactViewButton) {
            this.updateCompactViewButton(compactViewButton);
            
            // Also sync the initial state with the grid
            if (window.currentQuestionGrid && typeof window.currentQuestionGrid.setCompactMode === 'function') {
                window.currentQuestionGrid.setCompactMode(this.isCompactView);
            }
        }
    }

    /**
     * Asynchronously initialize all dropdowns
     * This allows the UI to render quickly while data loads in the background
     */
    async initializeDropdowns() {
        // Start all loading operations in parallel
        const initPromises = [
            this.updateMoveSheetDropdown(),
            this.updateOwnerDropdown(),
            this.updateContentDropdown()
            // TEMPORARILY DISABLED: this.updateComplianceDropdown()
        ];

        // Start license check in background (not critical for initial render)
        setTimeout(() => this.checkLicenseLimits(), 100);

        // Wait for all initialization to complete
        try {
            await Promise.all(initPromises);
            // console.log("[ControlPane] All dropdowns initialized");
        } catch (err) {
            console.error("[ControlPane] Error initializing dropdowns:", err);
        }
    }

    /**
     * Update the groups data and refresh the Move dropdown
     * @param {Array} groups Updated array of groups
     * @param {string} currentGroupId Currently selected group ID
     */
    updateGroups(groups, currentGroupId) {
        this.groups = groups || [];
        this.currentGroupId = currentGroupId;
        this.updateMoveSheetDropdown();
    }

    /**
     * Update the subtenant cache
     * @param {Object} subtenantCache Updated subtenant cache
     */
    updateSubtenantCache(subtenantCache) {
        if (!subtenantCache) return;

        // Make a deep copy to prevent reference issues
        this.subtenantCache = JSON.parse(JSON.stringify(subtenantCache));

        // Debug the structure to confirm we received it correctly
        // console.log("[ControlPane] updateSubtenantCache received:",
        //"Has corpus_config:", !!this.subtenantCache.corpus_config,
        //    "Has corpora:", !!(this.subtenantCache.corpus_config && this.subtenantCache.corpus_config.corpora));

        if (this.subtenantCache.corpus_config) {
            this.contentOptionsCache = null;  // Force regeneration of menu items
        }

        this.defaultCorpus = this._getDefaultCorpus();

        // Always update content dropdown after receiving new data
        this.updateContentDropdown();
    }

    /**
     * Setup event listeners for cache invalidation signals
     */
    setupCacheEventListeners() {
        // console.log("[ControlPane] Setting up cache event listeners");

        // Bind handlers to this instance for proper cleanup
        this.boundHandleCacheInvalidated = this.handleCacheInvalidated.bind(this);
        this.boundHandleFreshDataReceived = (event) => this.handleFreshDataReceived(event.detail.freshData);
        this.boundHandleFavoritesUpdated = (event) => this.handleFavoritesUpdated(event.detail);

        // Listen for cache invalidation events
        document.addEventListener('corpus-config-invalidated', this.boundHandleCacheInvalidated);

        // Listen for fresh data events
        document.addEventListener('corpus-config-refreshed', this.boundHandleFreshDataReceived);

        // Listen for favorites-updated events for real-time UI updates
        document.addEventListener('favorites-updated', this.boundHandleFavoritesUpdated);
    }

    /**
     * Handle cache invalidation by clearing local cache and refreshing
     */
    async handleCacheInvalidated() {
        // console.log("[ControlPane] Handling cache invalidation");

        // Clear local cache - FIXED: Clear content options cache too
        this.subtenantCache = {};
        this.contentOptionsCache = null;  // 🔧 CRITICAL FIX
        this.licenseCheckCache = null;
        this.usingCachedData = false;

        // Force refresh of data
        try {
            await this.refreshSubtenantData();
            // console.log("[ControlPane] Successfully refreshed data after cache invalidation");
        } catch (err) {
            console.error("[ControlPane] Error refreshing data after cache invalidation:", err);
        }
    }

    /**
     * Handle fresh data received event
     */
    handleFreshDataReceived(freshData) {
        // console.log("[ControlPane] Handling fresh data received");

        if (freshData && freshData.corpus_config) {
            // Update local cache with fresh data
            this.updateSubtenantCache(freshData);

            // Re-render the favorites dropdown with fresh data
            this.refreshFavoritesDropdown();
        }
    }

    /**
     * Handle favorites-updated event for real-time UI updates
     */
    handleFavoritesUpdated(eventDetail) {
        console.log("[ControlPane] Handling favorites-updated event:", eventDetail);

        try {
            // Clear content options cache to force regeneration
            this.contentOptionsCache = null;
            
            // Immediately refresh the Content dropdown to show new favorite
            console.log("[ControlPane] Refreshing Content dropdown for real-time update");
            this.updateContentDropdown();
            
            console.log("[ControlPane] Content dropdown updated successfully");
        } catch (err) {
            // Log as warning only, as specified in requirements
            console.warn("[ControlPane] Failed to refresh Content dropdown after favorites update:", err);
        }
    }

    /**
     * Force refresh of subtenant data from API
     */
    async refreshSubtenantData() {
        // console.log("[ControlPane] Force refreshing subtenant data");

        try {
            // Import the function dynamically to avoid circular dependencies
            const { getSubtenantAttributes } = await import("../../api/subtenants.js");

            // Get fresh data from API
            const freshData = await getSubtenantAttributes([
                "corpus_config",
                "label_friendly_names",
                "document_topics_type_preselection"
            ]);

            // console.log("[ControlPane] Received fresh subtenant data:", Object.keys(freshData));

            // Update cache
            this.updateSubtenantCache(freshData);

            // Update appStore if available
            if (window.appStore && freshData.corpus_config) {
                window.appStore.set('corpus_config', freshData.corpus_config);
            }
            if (window.appStore && freshData.label_friendly_names) {
                window.appStore.set('label_friendly_names', freshData.label_friendly_names);
            }

            return freshData;
        } catch (err) {
            console.error("[ControlPane] Error refreshing subtenant data:", err);
            throw err;
        }
    }

    /**
     * Refresh the favorites dropdown with current data
     */
    refreshFavoritesDropdown() {
        // console.log("[ControlPane] Refreshing favorites dropdown");

        try {
            // 🔧 CRITICAL: Clear content options cache first
            this.contentOptionsCache = null;

            // Force update the Content dropdown
            const contentMenu = document.querySelector('.content-menu');
            if (contentMenu) {
                // console.log("[ControlPane] Force updating content dropdown with fresh data");
                this.updateContentDropdown();
            } else {
                // console.log("[ControlPane] Content menu not found in DOM");
            }

        } catch (err) {
            console.error("[ControlPane] Error refreshing favorites dropdown:", err);
        }
    }

    /**
     * Determine the current corpus being used
     */
    determineCurrentCorpus() {
        // Try multiple sources to determine current corpus
        let corpus = null;

        // 1. Check if explicitly set
        if (this.corpus) {
            corpus = this.corpus;
            // console.log("[ControlPane] Using explicitly set corpus:", corpus);
        }

        // 2. Check subtenant cache default
        if (!corpus && this.subtenantCache && this.subtenantCache.corpus_config) {
            corpus = this.subtenantCache.corpus_config.default_corpus;
            // console.log("[ControlPane] Using default corpus from cache:", corpus);
        }

        // 3. Check global store
        if (!corpus && window.appStore) {
            const corpusConfig = window.appStore.get('corpus_config');
            if (corpusConfig) {
                corpus = corpusConfig.default_corpus;
                // console.log("[ControlPane] Using default corpus from store:", corpus);
            }
        }

        // 4. Check available corpora and use first one
        if (!corpus && this.subtenantCache && this.subtenantCache.corpus_config && this.subtenantCache.corpus_config.corpora) {
            const availableCorpora = Object.keys(this.subtenantCache.corpus_config.corpora);
            if (availableCorpora.length > 0) {
                corpus = availableCorpora[0];
                // console.log("[ControlPane] Using first available corpus:", corpus);
            }
        }

        // 5. Fallback to common defaults
        if (!corpus) {
            corpus = 'cognaire'; // Try cognaire first
            // console.log("[ControlPane] Using fallback corpus:", corpus);
        }

        return corpus;
    }

    /**
     * Get favorites for the current corpus
     */
    getFavoritesForCurrentCorpus() {
        const corpus = this.currentCorpus;

        if (!corpus || !this.subtenantCache || !this.subtenantCache.corpus_config) {
            console.warn("[ControlPane] Cannot get favorites - missing corpus or config");
            return [];
        }

        const corpusConfig = this.subtenantCache.corpus_config;

        if (!corpusConfig.corpora || !corpusConfig.corpora[corpus]) {
            console.warn(`[ControlPane] Corpus '${corpus}' not found in config`);
            return [];
        }

        const favoriteDomainUnits = corpusConfig.corpora[corpus].favorite_domain_units || {};

        // console.log(`[ControlPane] Raw favorites for corpus '${corpus}':`, favoriteDomainUnits);

        // Convert to array format
        const favorites = [];
        Object.entries(favoriteDomainUnits).forEach(([slotId, favoriteData]) => {
            if (favoriteData && favoriteData.name && favoriteData.domain && favoriteData.unit) {
                favorites.push({
                    ...favoriteData,
                    slotId: slotId
                });
            }
        });

        // console.log(`[ControlPane] Processed favorites for corpus '${corpus}':`, favorites);

        return favorites;
    }

    /**
     * Update the Content dropdown with fresh favorites
     */
    async updateContentDropdown() {
        // console.log("[ControlPane] updateContentDropdown() called");

        // Show loading state
        this.loadingStates.content = true;
        this.updateLoadingState("content", true);

        // Use cached options if available
        if (this.contentOptionsCache) {
            // console.log("[ControlPane] Using cached content options");
            const contentMenu = document.querySelector('.content-menu');
            if (contentMenu) {
                contentMenu.innerHTML = this.contentOptionsCache;
                this.addContentMenuEventListeners(contentMenu);
            }

            this.loadingStates.content = false;
            this.updateLoadingState("content", false);
            return;
        }

        try {
            // 🚨 CRITICAL FIX: Get the PROJECT corpus, not default corpus
            const projectCorpus = await this._getProjectCorpus();
            const activeCorpus = projectCorpus || this.defaultCorpus;

            // console.log("[ControlPane] 🎯 USING CORPUS:", activeCorpus, "(project:", projectCorpus, "default:", this.defaultCorpus, ")");

            // Get content menu
            const contentMenu = document.querySelector('.content-menu');
            if (!contentMenu) {
                console.warn("[ControlPane] Content menu element not found");
                return;
            }

            // Clear current options
            contentMenu.innerHTML = '<sl-menu-label class="content-loading-placeholder">Loading content options...</sl-menu-label>';

            // Get corpus config
            let corpusConfig = this.subtenantCache.corpus_config;
            let labelFriendlyNames = this.subtenantCache.label_friendly_names || {};

            // Fallback to store if needed
            if (!corpusConfig && window.appStore) {
                // console.log("[ControlPane] Falling back to appStore for corpus_config");
                corpusConfig = window.appStore.get('corpus_config');
                labelFriendlyNames = window.appStore.get('label_friendly_names') || {};
            }

            // console.log("[ControlPane] Using corpusConfig:", !!corpusConfig, "for corpus:", activeCorpus);

            // Generate menu content
            let menuContent = '';

            if (!corpusConfig || !corpusConfig.corpora) {
                console.warn("[ControlPane] No corpus config data available");
                menuContent = '<sl-menu-item value="customize">Customize...</sl-menu-item>';
            } else {
                // console.log(`[ControlPane] Looking for corpus '${activeCorpus}' in available corpora:`,
                // Object.keys(corpusConfig.corpora).join(", "));

                const corpus = corpusConfig.corpora[activeCorpus];
                if (!corpus) {
                    console.warn(`[ControlPane] Corpus '${activeCorpus}' not found in config`);
                    menuContent = '<sl-menu-item value="customize">Customize...</sl-menu-item>';
                } else {
                    // console.log("[ControlPane] ✅ Found corpus, checking for favorites:",
                    //!!corpus.favorite_domain_units);

                    // Process favorites for the CORRECT corpus
                    const favoriteOptions = [];

                    if (corpus.favorite_domain_units && typeof corpus.favorite_domain_units === 'object') {
                        Object.entries(corpus.favorite_domain_units).forEach(([slotId, favoriteData]) => {
                            // console.log(`[ControlPane] Processing favorite: slotId=${slotId}`, favoriteData);

                            let dataObj = favoriteData;
                            if (typeof favoriteData === 'string') {
                                try {
                                    dataObj = JSON.parse(favoriteData);
                                } catch (err) {
                                    console.warn(`[ControlPane] Invalid favorite JSON for ${slotId}:`, err);
                                    return;
                                }
                            }

                            // Skip empty slots
                            if (!dataObj || !dataObj.domain || !dataObj.unit) {
                                // console.log(`[ControlPane] Skipping empty favorite for ${slotId}`);
                                return;
                            }

                            favoriteOptions.push({
                                ...dataObj,
                                slotId
                            });
                        });

                        favoriteOptions.sort((a, b) => {
                            if (a.name && b.name) {
                                return a.name.localeCompare(b.name);
                            }
                            return a.slotId.localeCompare(b.slotId);
                        });
                    }

                    // console.log("[ControlPane] ✅ Found favorites for", activeCorpus, ":", favoriteOptions.length);

                    // Add favorites to menu
                    if (favoriteOptions.length > 0) {
                        favoriteOptions.forEach(option => {
                            try {
                                const contentConfig = {
                                    corpus: activeCorpus,
                                    domain: option.domain,
                                    unit: option.unit,
                                    document_topics: option.document_topics || [],
                                    document_types: option.document_types || [],
                                    language_rules: option.language_rules || ""
                                };

                                const configJson = JSON.stringify(contentConfig)
                                    .replace(/"/g, '&quot;');

                                let displayText;
                                if (option.name) {
                                    displayText = option.name;
                                } else {
                                    const domainLabel = getLabelFriendlyName(labelFriendlyNames, option.domain) || option.domain;
                                    const unitLabel = getLabelFriendlyName(labelFriendlyNames, option.unit) || option.unit;
                                    displayText = `${domainLabel}: ${unitLabel}`;
                                }

                                menuContent += `<sl-menu-item value="${configJson}">${displayText}</sl-menu-item>`;
                            } catch (err) {
                                console.error("[ControlPane] Error adding menu item for option:", option, err);
                            }
                        });

                        // console.log(`[ControlPane] ✅ Added ${favoriteOptions.length} favorite options from corpus '${activeCorpus}'`);
                    }

                    // Always add the Customize option
                    menuContent += '<sl-menu-item value="customize">Customize...</sl-menu-item>';
                }
            }

            // Update menu content
            contentMenu.innerHTML = menuContent;
            this.addContentMenuEventListeners(contentMenu, activeCorpus); // Pass activeCorpus

            // Cache the generated menu content
            this.contentOptionsCache = menuContent;

            // console.log("[ControlPane] ✅ Content dropdown updated successfully for corpus:", activeCorpus);

        } catch (err) {
            console.error("[ControlPane] Error updating content dropdown:", err);
            this.errorModal.show({
                title: "Error Loading Content Options",
                message: "Failed to load content selection options. " + err.message
            });

            const contentMenu = document.querySelector('.content-menu');
            if (contentMenu) {
                contentMenu.innerHTML = '<sl-menu-item value="customize">Customize...</sl-menu-item>';
                this.addContentMenuEventListeners(contentMenu);
            }
        } finally {
            this.loadingStates.content = false;
            this.updateLoadingState("content", false);
        }
    }

    /**
     * Debug method to log current state
     */
    debugCurrentState() {
        console.log("=== ControlPane Debug State ===");
        console.log("Current corpus:", this.currentCorpus);
        console.log("Using cached data:", this.usingCachedData);
        console.log("Subtenant cache keys:", this.subtenantCache ? Object.keys(this.subtenantCache) : 'null');

        if (this.subtenantCache && this.subtenantCache.corpus_config) {
            console.log("Available corpora:", Object.keys(this.subtenantCache.corpus_config.corpora || {}));
            console.log("Default corpus:", this.subtenantCache.corpus_config.default_corpus);

            if (this.currentCorpus && this.subtenantCache.corpus_config.corpora[this.currentCorpus]) {
                const favorites = this.subtenantCache.corpus_config.corpora[this.currentCorpus].favorite_domain_units;
                console.log(`Favorites for '${this.currentCorpus}':`, favorites);
            }
        }
        console.log("=== End Debug State ===");
    }

    /**
     * Add event listeners to content menu items
     */
    addContentMenuEventListeners(contentMenu, activeCorpus = null) {
        const oldListener = contentMenu._contentSelectListener;
        if (oldListener) {
            contentMenu.removeEventListener("sl-select", oldListener);
        }

        const listener = (ev) => {
            const selectedValue = ev.detail.item.value;
            // console.log("[ControlPane] Content option selected:", selectedValue);

            const btn = document.querySelector(".assign-content-btn");

            if (selectedValue === "customize") {
                (async () => {
                    try {
                        // 🚨 CRITICAL FIX: Use the correct corpus (project corpus)
                        const projectCorpus = await this._getProjectCorpus();
                        const corpusToUse = activeCorpus || projectCorpus || this.defaultCorpus;

                        // console.log("[ControlPane] 🎯 Opening ChooseContentForAIModal with corpus:", corpusToUse);

                        let currentCache = { ...this.subtenantCache };

                        if (!currentCache.corpus_config && window.appStore) {
                            const storeCorpusConfig = window.appStore.get('corpus_config');
                            const storeLabelNames = window.appStore.get('label_friendly_names');

                            if (storeCorpusConfig) {
                                currentCache.corpus_config = storeCorpusConfig;
                            }
                            if (storeLabelNames) {
                                currentCache.label_friendly_names = storeLabelNames;
                            }
                        }

                        const chooseContentModal = new ChooseContentForAIModal({
                            corpus: corpusToUse, // 🚨 Use correct corpus here!
                            subtenantCache: currentCache,
                            onSubmit: contentConfig =>
                                this.handleButtonAction(btn, null, { contentConfig })
                        });

                        chooseContentModal.show();
                    } catch (error) {
                        console.error("[ControlPane] Error creating ChooseContentForAIModal:", error);

                        const chooseContentModal = new ChooseContentForAIModal({
                            corpus: this.defaultCorpus,
                            subtenantCache: this.subtenantCache,
                            onSubmit: contentConfig =>
                                this.handleButtonAction(btn, null, { contentConfig })
                        });

                        chooseContentModal.show();
                    }
                })();
            } else {
                try {
                    const contentConfig = JSON.parse(selectedValue);
                    this.handleButtonAction(btn, null, { contentConfig });
                } catch (err) {
                    console.error("[ControlPane] Error parsing content option:", err);
                }
            }
        };

        contentMenu.addEventListener("sl-select", listener);
        contentMenu._contentSelectListener = listener;
    }

    /**
     * Update loading state for a specific dropdown
     */
    updateLoadingState(type, isLoading) {
        const placeholderSelector = `.${type}-loading-placeholder`;
        const placeholder = document.querySelector(placeholderSelector);

        if (!placeholder) return;

        if (isLoading) {
            placeholder.style.display = 'block';
        } else {
            placeholder.style.display = 'none';
        }
    }

    /**
     * Populate the Move dropdown with available groups
     * Excludes the current group since it doesn't make sense to move to the same group
     */
    async updateMoveSheetDropdown() {
        // Show loading state
        this.updateLoadingState("sheet", true);

        try {
            // Get the sheet menu
            const sheetMenu = document.querySelector('.move-sheet-dropdown .sheet-menu');
            if (!sheetMenu) return;

            // Clear current options
            sheetMenu.innerHTML = '<sl-menu-label class="sheet-loading-placeholder">Loading sheets...</sl-menu-label>';

            // Get available groups (exclude current group)
            const availableGroups = this.groups.filter(group => {
                const groupId = this._parseGroupIdFromFull(group.stage_group_id);
                return groupId !== this.currentGroupId;
            });

            // Check if we have available groups
            if (availableGroups.length === 0) {
                // If no other groups available, add a placeholder
                sheetMenu.innerHTML = '<sl-menu-label>No other sheets available</sl-menu-label>';

                // Make sure Move button is disabled (will be re-enabled based on selection when updateSelectionState is called)
                const moveButton = document.querySelector('.move-sheet-btn');
                if (moveButton) {
                    moveButton.disabled = true;
                }
            } else {
                // Generate menu content
                let menuContent = '';

                // Add each available group as an option
                availableGroups.forEach(group => {
                    const groupId = this._parseGroupIdFromFull(group.stage_group_id);
                    const groupName = group.group_name || groupId;

                    menuContent += `<sl-menu-item value="${groupId}">${groupName}</sl-menu-item>`;
                });

                sheetMenu.innerHTML = menuContent;

                // Add event listeners to menu items
                this.addMoveSheetMenuEventListeners(sheetMenu);
            }
        } catch (err) {
            console.error("[ControlPane] Error updating move sheet dropdown:", err);

            // Show error message in the dropdown
            const sheetMenu = document.querySelector('.move-sheet-dropdown .sheet-menu');
            if (sheetMenu) {
                sheetMenu.innerHTML = '<sl-menu-label>Error loading sheets</sl-menu-label>';
            }
        } finally {
            // Hide loading state
            this.updateLoadingState("sheet", false);
        }
    }

    /**
     * Add event listeners to move sheet menu items
     */
    addMoveSheetMenuEventListeners(sheetMenu) {
        // Remove any existing event listeners
        const oldListener = sheetMenu._moveSheetSelectListener;
        if (oldListener) {
            sheetMenu.removeEventListener("sl-select", oldListener);
        }

        // Add event listener for sheet selection
        const listener = (ev) => {
            const toGroupId = ev.detail.item.value;
            const toGroupName = ev.detail.item.textContent;
            // console.log("[ControlPane] Move sheet selected:", toGroupId);

            // For move sheet, show confirmation dialog first
            const count = this.selectedCount;
            const title = "Confirm Move";
            const message = `Are you sure you want to move ${count} item(s) to the topic '${toGroupName}'?`;

            this.confirmModal.show({
                title,
                message,
                onYes: () => {
                    // Call the action handler with the destination group
                    if (this.onAction) {
                        this.onAction("MOVE_SHEET", { toGroupId });
                    }
                },
                onNo: () => {
                    // console.log(`[ControlPane] User cancelled move to ${toGroupId}`);
                }
            });
        };

        sheetMenu.addEventListener("sl-select", listener);
        sheetMenu._moveSheetSelectListener = listener;
    }

    /**
     * Update the owner dropdown with the current user and corpus users
     */
    async updateOwnerDropdown() {
        // Show loading state
        this.loadingStates.owner = true;
        this.updateLoadingState("owner", true);

        try {
            // Get the owner menu
            const ownerMenu = document.querySelector('.owner-menu');
            if (!ownerMenu) return;

            // Clear current options
            ownerMenu.innerHTML = '<sl-menu-label class="owner-loading-placeholder">Loading users...</sl-menu-label>';

            // Generate menu content
            let menuContent = '';

            // Start with the "None" option to clear owner
            menuContent += `<sl-menu-item value="">None (Clear)</sl-menu-item>`;

            // Add current user
            menuContent += `<sl-menu-item value="${this.currentUsername}">${this.currentUsername} (me)</sl-menu-item>`;

            // Add other users with permissions
            if (this.corpusUsers && this.corpusUsers.length > 0) {
                const otherUsers = this.corpusUsers
                    .filter(user => user.username !== this.currentUsername) // Exclude current user
                    .map(user => {
                        const displayName = user.display_name || user.username;
                        return `<sl-menu-item value="${user.username}">${displayName}</sl-menu-item>`;
                    })
                    .join('');

                menuContent += otherUsers;
            }

            // Update menu content
            ownerMenu.innerHTML = menuContent;

            // Add event listeners to menu items
            this.addOwnerMenuEventListeners(ownerMenu);
        } catch (err) {
            console.error("[ControlPane] Error updating owner dropdown:", err);

            // Show error message in the dropdown
            const ownerMenu = document.querySelector('.owner-menu');
            if (ownerMenu) {
                ownerMenu.innerHTML = '<sl-menu-label>Error loading users</sl-menu-label>';
            }
        } finally {
            // Hide loading state
            this.loadingStates.owner = false;
            this.updateLoadingState("owner", false);
        }
    }


    /**
     * Add event listeners to owner menu items
     */
    addOwnerMenuEventListeners(ownerMenu) {
        // Remove any existing event listeners
        const oldListener = ownerMenu._ownerSelectListener;
        if (oldListener) {
            ownerMenu.removeEventListener("sl-select", oldListener);
        }

        // Add event listener for owner selection
        const listener = (ev) => {
            const newOwner = ev.detail.item.value;
            // console.log("[ControlPane] Owner selected:", newOwner);

            // Get the dropdown button
            const btn = document.querySelector(".assign-owner-btn");

            // Use the standardized handler
            this.handleButtonAction(btn, null, { owner: newOwner });
        };

        ownerMenu.addEventListener("sl-select", listener);
        ownerMenu._ownerSelectListener = listener;
    }

    /**
     * Extract the group ID from the full stage_group_id
     * @param {string} stageGroupId Full stage_group_id like "STG#stage_id#GRP#group_id"
     * @returns {string} Extracted group ID
     * @private
     */
    _parseGroupIdFromFull(stageGroupId) {
        if (!stageGroupId) return '';
        const parts = stageGroupId.split("#GRP#");
        return parts.length > 1 ? parts[1] : stageGroupId;
    }

    /**
     * Centralized button event handling
     */
    attachButtonEvents(container) {
        // Handle filter buttons
        const filterButtons = container.querySelectorAll("sl-button[data-filter]");
        filterButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                // Remove active styles from all filter buttons
                filterButtons.forEach(b => {
                    b.classList.remove("active-filter");
                    b.setAttribute("variant", "default"); // Reset to default style
                });

                // Add active class and set "primary" variant for the selected filter
                btn.classList.add("active-filter");
                btn.setAttribute("variant", "primary");

                const selectedFilter = btn.getAttribute("data-filter");
                // console.log("[ControlPane] Filter changed to:", selectedFilter);

                // Use the standardized handler for the filter action
                this.handleButtonAction(btn, [], { filter: selectedFilter });
            });
        });

        // Set the "All" filter as active by default
        const allFilterBtn = container.querySelector("sl-button[data-filter='all']");
        if (allFilterBtn) {
            allFilterBtn.classList.add("active-filter");
            allFilterBtn.setAttribute("variant", "primary");
        }

        // Handle direct action buttons (exclude dropdown buttons that have their own handlers)
        const actionButtons = container.querySelectorAll("sl-button[data-action]:not([data-filter])");
        actionButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const actionType = btn.getAttribute("data-action");

                // Skip if the button is disabled
                if (btn.disabled) return;

                // Skip dropdown buttons that have their own specialized handlers
                const dropdownActions = ['assignContent', 'assignOwner', 'moveSheet', 'aiAnswer'];
                if (dropdownActions.includes(actionType)) {
                    console.log("[ControlPane] Skipping generic handler for dropdown action:", actionType);
                    return;
                }

                // Use the standardized handler for direct action buttons only
                this.handleButtonAction(btn);
            });
        });

        // Handle dropdown menu for AI Answer with enhanced logic
        const aiModeDropdown = container.querySelector(".ai-answer-dropdown sl-menu");
        aiModeDropdown.addEventListener("sl-select", async (ev) => {
            // Prevent event bubbling to avoid conflicts with other dropdown handlers
            ev.stopPropagation();

            const item = ev.detail.item;
            const tier = item.getAttribute('data-tier');  // 'standard' or 'enhanced'
            const path = item.getAttribute('data-path');  // 'bulk' or 'quick'
            const indexName = item.getAttribute('data-index');  // Vector index name (if quick)

            console.log(`[ControlPane] AI Answer selected: tier=${tier}, path=${path}, index=${indexName}`);

            // Map to old format for compatibility with existing code
            const selectedMode = tier === 'enhanced' ? 'enhanced-model' : 'standard-model';

            // Store the execution path for later use
            this._lastAISelection = { tier, path, indexName };

            // Show confirmation modal with job analysis
            await this.showAIConfirmationModal(selectedMode);
        });

        // Make the default AI button trigger also work with dropdown
        const aiButton = container.querySelector(".ai-answer-btn");
        aiButton.addEventListener("click", () => {
            // No direct action on click - dropdown menu will handle selection
            // console.log("[ControlPane] AI Answer button clicked - showing dropdown");
        });
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
                console.warn('[ControlPane] Question missing content configuration:', question.question_id);
                continue;
            }

            let contentConfig;
            try {
                // Parse content if it's a string
                contentConfig = typeof question.content === 'string' ?
                    JSON.parse(question.content) : question.content;
            } catch (err) {
                console.error(`[ControlPane] Invalid content JSON for question ${question.question_id}:`, err);
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
            // Remove owner_username - backend will set this from authenticated user context
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
     * Show success message using MessageModal instead of toast
     * @param {string} message The success message
     */
    showSuccessMessage(message, details = null) {
        let fullMessage = message;

        if (details) {
            fullMessage += `\n\n${details}`;
        }

        // Use the existing MessageModal for consistent UI
        // ISSUE #8 FIX: Remove emojis from enterprise B2B messaging
        this.messageModal.show({
            title: "AI Processing Started",
            message: fullMessage,
            buttonText: "OK"
        });
    }

    /**
     * Show processing indicator
     * @param {string} message The message to display
     */
    showProcessingIndicator(message) {
        // console.log(`[ControlPane] showProcessingIndicator called with message: ${message}`);

        // If we have a loading modal, use it but make sure it's configured properly
        this.messageModal.show({
            title: "AI Question Answering",
            message: `<div style="text-align: center; padding: 20px;">
                <div style="
                    width: 40px; 
                    height: 40px; 
                    border: 4px solid #f3f3f3; 
                    border-top: 4px solid #3498db; 
                    border-radius: 50%; 
                    animation: spin 1s linear infinite;
                    margin: 0 auto 20px auto;
                "></div>
                <p style="margin: 0; font-size: 16px;">${message || "Processing..."}</p>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </div>`,
            buttonText: null, // No buttons
            allowClose: false, // Don't allow closing during processing
            autoHide: false
        });

        // console.log("[ControlPane] Processing modal should now be visible");
    }

    /**
     * Update processing indicator message
     * @param {string} message The updated message
     */
    updateProcessingIndicator(message) {
        // console.log(`[ControlPane] updateProcessingIndicator called with message: ${message}`);

        // Find the message element and update it
        const modalContent = document.querySelector(".message-modal .message-modal-content p");
        if (modalContent) {
            modalContent.textContent = message;
            // console.log("[ControlPane] Processing message updated successfully");
        } else {
            console.warn("[ControlPane] Could not find processing message element to update");
        }
    }

    /**
     * Hide processing indicator
     */
    hideProcessingIndicator() {
        // console.log("[ControlPane] hideProcessingIndicator called");

        if (this.messageModal && typeof this.messageModal.hide === 'function') {
            this.messageModal.hide();
            // console.log("[ControlPane] messageModal.hide() called");
        } else {
            console.warn("[ControlPane] messageModal.hide() not available");
        }
    }

    debugModalState() {
        console.log("=== Modal State Debug ===");
        console.log("MessageModal exists:", !!this.messageModal);
        console.log("ErrorModal exists:", !!this.errorModal);

        // Check if any modals are currently visible
        const visibleModals = document.querySelectorAll('.modal:not([style*="display: none"]), .message-modal:not([style*="display: none"])');
        console.log("Visible modals count:", visibleModals.length);

        visibleModals.forEach((modal, index) => {
            console.log(`Visible modal ${index + 1}:`, modal.className, modal.style.display);
        });

        console.log("========================");
    }

    /**
     * Centralized button action handler with confirmation logic
     * @param {HTMLElement} buttonElement - The button that was clicked
     * @param {Array} selectedRows - Optional override for the current selection
     * @param {Object} payload - Additional data for the action
     */
    async handleButtonAction(buttonElement, selectedRows = null, payload = {}) {
        // Get the action type from the button's data attribute
        const actionType = buttonElement.getAttribute("data-action");

        // If no action type, skip
        if (!actionType) return;

        // Handle compact view toggle
        if (actionType === "compactView") {
            this.toggleCompactView(buttonElement);
            return;
        }

        // Handle full screen toggle
        if (actionType === "fullScreen") {
            this.toggleFullScreen(buttonElement);
            return;
        }

        // Handle export action
        if (actionType === "export") {
            this.handleExport();
            return;
        }

        // Handle font size actions
        if (actionType === "increaseFontSize") {
            this.increaseFontSize();
            return;
        }

        if (actionType === "decreaseFontSize") {
            this.decreaseFontSize();
            return;
        }

        // Use the passed selection or the current selection
        const rows = selectedRows !== null ? selectedRows : this._getSelectedRows();
        console.log("[ControlPane] handleButtonAction for", actionType, "using", rows ? rows.length : 0, "rows");

        // Upper-case the action type for the event
        const eventActionType = actionType.toUpperCase();

        // Special handling for AI answer
        if (actionType === "aiAnswer") {
            // Don't do anything here - the dropdown menu event will handle it
            return;
        }

        // Handle view detail action - trigger modal directly
        if (actionType === "viewDetail") {
            if (rows.length === 1) {
                // Call the action handler to trigger the modal
                if (this.onAction) {
                    this.onAction("VIEW_DETAIL", { questionData: rows[0] });
                }
            }
            return;
        }

        // Add handling for assignContent action
        if (actionType === "assignContent") {
            const { contentConfig } = payload;

            if (!contentConfig) {
                console.warn("[ControlPane] No content configuration provided");
                return;
            }

            // Check if any rows are selected
            if (rows.length === 0) {
                // Show validation modal
                this.messageModal.show({
                    title: "⚠️ No Rows Selected",
                    message: "Please select at least one row using the checkboxes before proceeding. This selection is required to assign content properly."
                });
                return;
            }

            // Call the action handler with ASSIGN_CONTENT action
            if (this.onAction) {
                this.onAction("ASSIGN_CONTENT", { contentConfig });
            }
            return;
        }

        /* ────────────────────────────────────────────────────────────
        Analytics button – open read-only QuestionGridAnalyticsModal
        (no selection needed, no confirmation)
        ──────────────────────────────────────────────────────────── */
        if (actionType === "analytics") {
            // Import the modal component dynamically
            const { QuestionGridAnalyticsModal } = await import('../../ui/modals/question-grid-analytics-modal.js');

            // Extract document context from the control pane instance
            const projectDocumentId = this.projectDocumentId;
            const stageId = this.stageId || 'rfp_stage_3_answer_questions';
            const currentTab = this.groupId;

            // Validate required context
            if (!projectDocumentId || !currentTab) {
                this._showContextError(
                    'Unable to open analytics: missing document or group context');
                return;
            }

            console.log('[ControlPane] Opening analytics modal with context:', {
                projectDocumentId,
                stageId,
                currentTab,
                availableGroups: this.groups.length,
                availableUsers: this.corpusUsers.length
            });

            // Create and show the analytics modal with full context including groups and users
            const modal = new QuestionGridAnalyticsModal({
                projectDocumentId: projectDocumentId,
                stageId: stageId,
                defaultTab: currentTab,
                availableGroups: this.groups || [], // Pass the groups from parent component
                availableUsers: this.corpusUsers || [] // Pass the users for assignee dropdown
            });

            modal.show();
            return;
        }

        // Special handling for delete action
        if (actionType === "delete") {
            // Check if any selected rows have answers
            const rowsWithAnswers = rows.filter(row => row.answer_text && row.answer_text.trim() !== '');
            
            if (rowsWithAnswers.length > 0) {
                // Show message that questions with answers cannot be deleted
                this.messageModal.show({
                    title: "Cannot Delete Questions",
                    message: "Questions with answers cannot be deleted. Please clear the answers first before deleting."
                });
                return;
            }
            
            // All selected rows have no answers, show confirmation
            const count = rows.length;
            this.confirmModal.show({
                title: "Confirm Delete",
                message: `Are you sure you want to delete ${count} selected question${count > 1 ? 's' : ''}?`,
                onYes: () => {
                    // Call the action handler with the rows and payload
                    if (this.onAction) {
                        this.onAction(eventActionType, payload);
                    }
                },
                onNo: () => {
                    // console.log(`[ControlPane] User cancelled delete action`);
                }
            });
            return;
        }

        // Get the configuration for this button
        const config = this.buttonConfigs[actionType] || {};

        // Check if the button should be enabled
        if (!this._shouldButtonBeEnabled(config, rows)) {
            // console.log(`[ControlPane] Button ${actionType} is disabled`);
            return;
        }

        // If confirmation is required, show the confirmation dialog
        if (config.confirmAction) {
            // Get the confirmation message and title
            const count = rows.length;
            let message = "";

            if (typeof config.confirmMessage === "function") {
                message = config.confirmMessage(count, payload);
            } else {
                message = config.confirmMessage || `Are you sure you want to perform this action on ${count} selected item(s)?`;
            }

            const title = config.confirmTitle || "Confirm Action";

            // Show the confirmation dialog
            this.confirmModal.show({
                title,
                message,
                onYes: () => {
                    // Call the action handler with the rows and payload
                    if (this.onAction) {
                        this.onAction(eventActionType, payload);
                    }
                },
                onNo: () => {
                    // console.log(`[ControlPane] User cancelled ${actionType} action`);
                }
            });
        } else {
            // No confirmation needed, just call the action handler
            if (this.onAction) {
                this.onAction(eventActionType, payload);
            }
        }
    }

    /**
     * Show context error message
     * @private
     */
    _showContextError(message) {
        if (this.errorModal) {
            this.errorModal.show({
                title: "Analytics Unavailable",
                message: message
            });
        } else {
            console.error('[ControlPane]', message);
        }
    }

    /**
     * Load compact view state from localStorage
     * @returns {boolean} The saved compact view state, or false if not found
     */
    loadCompactViewState() {
        // ALWAYS START WITH COMPACT MODE OFF AFTER REFRESH
        return false;
    }

    /**
     * Save compact view state to localStorage
     * @param {boolean} isCompact - The compact view state to save
     */
    saveCompactViewState(isCompact) {
        try {
            localStorage.setItem('grid-compact-view', isCompact.toString());
        } catch (error) {
            console.warn('[ControlPane] Failed to save compact view state to localStorage:', error);
        }
    }

    /**
     * Update button appearance to match current compact view state
     * @param {HTMLElement} buttonElement - The compact view button element
     */
    updateCompactViewButton(buttonElement) {
        if (!buttonElement) return;

        if (this.isCompactView === true) {
            // COMPACT MODE ON = BLUE BUTTON
            console.log(`[ControlPane] Setting button to BLUE (compact ON)`);
            buttonElement.setAttribute("variant", "primary");
            buttonElement.title = "Switch to Expanded View";
            const icon = buttonElement.querySelector("sl-icon");
            if (icon) {
                icon.setAttribute("name", "grid-3x3");
            }
        } else {
            // COMPACT MODE OFF = WHITE BUTTON  
            console.log(`[ControlPane] Setting button to WHITE (compact OFF)`);
            buttonElement.setAttribute("variant", "default");
            buttonElement.title = "Switch to Compact View";
            const icon = buttonElement.querySelector("sl-icon");
            if (icon) {
                icon.setAttribute("name", "layout-three-columns");
            }
        }
    }

    toggleCompactView(buttonElement) {
        this.isCompactView = !this.isCompactView;
        console.log(`[ControlPane] Compact mode toggled to: ${this.isCompactView}`);

        // Save the new state to localStorage
        this.saveCompactViewState(this.isCompactView);

        // Update button appearance
        this.updateCompactViewButton(buttonElement);

        // Sync compact mode state with grid directly
        if (window.currentQuestionGrid && typeof window.currentQuestionGrid.setCompactMode === 'function') {
            window.currentQuestionGrid.setCompactMode(this.isCompactView);
        }

        // Call the action handler to notify the parent component
        if (this.onAction) {
            this.onAction("TOGGLE_COMPACT_VIEW", { isCompactView: this.isCompactView });
        }
    }

    /**
     * Handle full screen toggle button click
     * @param {HTMLElement} buttonElement - The full screen button element
     */
    toggleFullScreen(buttonElement) {
        console.log('[ControlPane] Full screen toggle clicked');

        const targetElement = document.querySelector('.doc-stage-content-wrapper');
        if (!targetElement) {
            console.error('[ControlPane] Could not find doc-stage-content-wrapper');
            this.errorModal.show({
                title: "Full Screen Error",
                message: "Could not find the content area to make full-screen."
            });
            return;
        }

        // Check if full-screen is available
        if (!fullScreenManager.isFullScreenAvailable()) {
            this.errorModal.show({
                title: "Full Screen Not Available",
                message: "Full screen mode is only available in Stage 3 of the RFP workflow."
            });
            return;
        }

        let success = false;

        if (fullScreenManager.isFullScreen) {
            success = fullScreenManager.exitFullScreen();
            if (success) {
                this.updateFullScreenButton(buttonElement, false);
            }
        } else {
            success = fullScreenManager.enterFullScreen(targetElement);
            if (success) {
                this.updateFullScreenButton(buttonElement, true);
            }
        }

        if (!success) {
            this.errorModal.show({
                title: "Full Screen Toggle Failed",
                message: "Could not toggle full screen mode. Please try again."
            });
        }
    }

    /**
     * Update the full screen button appearance
     * @param {HTMLElement} buttonElement - The full screen button element
     * @param {boolean} isFullScreen - Whether we're entering or exiting full screen
     */
    updateFullScreenButton(buttonElement, isFullScreen) {
        if (!buttonElement) return;

        buttonElement.setAttribute('data-fullscreen', isFullScreen.toString());

        if (isFullScreen) {
            buttonElement.setAttribute('variant', 'primary');
            buttonElement.title = 'Exit Full Screen Mode';

            // Keep the same icon - button color indicates state
            const icon = buttonElement.querySelector('sl-icon');
            if (icon) {
                icon.setAttribute('name', 'arrows-fullscreen');
            }

            console.log('[ControlPane] Entered full screen mode');
        } else {
            buttonElement.setAttribute('variant', 'default');
            buttonElement.title = 'Enter Full Screen Mode';

            // Update icon to show full screen
            const icon = buttonElement.querySelector('sl-icon');
            if (icon) {
                icon.setAttribute('name', 'arrows-fullscreen');
            }

            console.log('[ControlPane] Exited full screen mode');
        }
    }

    /**
     * Handle export button click
     */
    handleExport() {
        console.log('[ControlPane] Export button clicked');

        const selectedRows = this._getSelectedRows();
        // console.log(`[ControlPane] Export processing ${selectedRows.length} selected rows`);

        // Validate required context
        if (!this.documentId || !this.projectId) {
            this.errorModal.show({
                title: "Export Error",
                message: "Missing document or project context. Please refresh the page and try again."
            });
            return;
        }

        // Launch export modal with current document context
        this.exportModal.show({
            documentId: this.documentId,
            projectId: this.projectId,
            currentGroupId: this.currentGroupId,
            selectedRows: selectedRows
        });
    }

    /**
     * Determines if a button should be enabled based on its configuration, selection, and available groups
     * @param {Object} config - The button configuration
     * @param {Array} rows - The selected rows
     * @returns {boolean} - Whether the button should be enabled
     */
    _shouldButtonBeEnabled(config, rows) {
        // If selection is not required, always enable
        if (!config.selectionRequired) return true;

        // Get the selection count
        const count = rows.length;

        // Special case for moveSheet - need both selection and available destination groups
        if (config === this.buttonConfigs.moveSheet) {
            const availableGroupCount = this.groups.filter(group => {
                const groupId = this._parseGroupIdFromFull(group.stage_group_id);
                return groupId !== this.currentGroupId;
            }).length;

            // Only enable if there are rows selected AND there are other groups to move to
            return count > 0 && availableGroupCount > 0;
        }

        // Check if an exact selection count is required
        if (config.exactSelection !== undefined) {
            return count === config.exactSelection;
        }

        // Check if a minimum selection count is required
        if (config.minSelection !== undefined) {
            return count >= config.minSelection;
        }

        // Default: any selection is required
        return count > 0;
    }

    async checkLicenseLimits() {
        // Don't run if a check is already in progress
        if (this.licenseCheckInProgress) {
            // console.log("[ControlPane] License check already in progress, skipping");
            return;
        }

        // Use cached results if they're recent enough (last 5 minutes)
        const now = Date.now();
        const cacheAge = now - this.licenseCheckTimestamp;
        const cacheValidDuration = 5 * 60 * 1000; // 5 minutes in milliseconds

        if (this.licenseCheckCache && cacheAge < cacheValidDuration) {
            // console.log("[ControlPane] Using cached license check results");
            this.aiButtonState = this.licenseCheckCache;
            this.updateAiDropdown();
            return;
        }

        this.licenseCheckInProgress = true;
        this.loadingStates.license = true;

        try {
            // Get the license limits from the server
            const result = await hasLimitBreached(["Q_STD", "Q_ENH"]);

            // Process the result using the helper function
            this.aiButtonState = processLicenseLimits(result);

            // console.log("[ControlPane] License check complete. AI button state:", this.aiButtonState);

            // Update the cache
            this.licenseCheckCache = { ...this.aiButtonState };
            this.licenseCheckTimestamp = now;

            // Update the AI dropdown
            this.updateAiDropdown();
        } catch (err) {
            console.error("[ControlPane] Error checking license limits:", err);

            // Default to enabled for graceful degradation
            this.aiButtonState = {
                standardEnabled: true,
                enhancedEnabled: true,
                licenseWarning: null
            };

            // Update the AI dropdown
            this.updateAiDropdown();
        } finally {
            this.licenseCheckInProgress = false;
            this.loadingStates.license = false;
        }
    }

    // Update the AI dropdown based on license state
    updateAiDropdown() {
        const standardMenuItem = document.querySelector(".ai-mode-menu sl-menu-item[value='standard-model']");
        const enhancedMenuItem = document.querySelector(".ai-mode-menu sl-menu-item[value='enhanced-model']");

        if (standardMenuItem) {
            standardMenuItem.disabled = !this.aiButtonState.standardEnabled;
            if (!this.aiButtonState.standardEnabled) {
                standardMenuItem.title = "Standard Model is not available (license limit reached)";
            } else {
                standardMenuItem.title = "";
            }
        }

        if (enhancedMenuItem) {
            enhancedMenuItem.disabled = !this.aiButtonState.enhancedEnabled;
            if (!this.aiButtonState.enhancedEnabled) {
                enhancedMenuItem.title = "Enhanced Model is not available (license limit reached)";
            } else {
                enhancedMenuItem.title = "";
            }
        }
    }

    /**
     * Fetch the project once through api/projects-accounts.js and cache its corpus.
     */
    async _getProjectCorpus() {
        if (this._projectCorpusCached !== null) return this._projectCorpusCached;

        if (!this.projectId || !this.projectId.includes("#")) {
            console.warn("[ControlPane] projectId missing – falling back");
            return (this._projectCorpusCached = null);
        }

        try {
            // Import the getProject function dynamically
            const { getProject } = await import("../../api/projects-accounts.js");

            const [, projectIdPart] = this.projectId.split("#");
            const project = await getProject(projectIdPart, this.store);

            /* ──► accommodate either `{ corpus: "…" }`  or `{ project: { corpus: "…" } }` */
            this._projectCorpusCached =
                project?.corpus ??
                project?.project?.corpus ??
                null;

            // console.log("[ControlPane] Resolved project corpus →", this._projectCorpusCached);
            return this._projectCorpusCached;

        } catch (err) {
            console.error("[ControlPane] Failed to load project:", err);
            return (this._projectCorpusCached = null);
        }
    }

    /**
     * Gets the current selected rows
     * @returns {Array} - The selected rows
     * @private
     */
    _getSelectedRows() {
        const rows = this.selectedRows || [];
        console.log("[ControlPane] _getSelectedRows returning:", rows.length, "rows");
        console.log("[ControlPane] _getSelectedRows - this.selectedRows:", this.selectedRows);
        return rows;
    }

    /**
     * Gets the latest selected rows from the grid API
     * This ensures we have the most current data including any content assignments
     * @returns {Array} - The selected rows with latest data
     */
    getLatestSelectedRows() {
        // Try to get fresh data from grid API first
        let gridData = null;
        if (window.currentQuestionGrid && window.currentQuestionGrid.gridApi) {
            try {
                const gridApi = window.currentQuestionGrid.gridApi;
                const selectedNodes = gridApi.getSelectedNodes();
                gridData = selectedNodes.map(node => node.data);
                console.log("[ControlPane] Grid API selected rows:", gridData.length);
            } catch (error) {
                console.warn("[ControlPane] Error accessing grid API:", error);
            }
        }

        // Use stored selected rows as the reliable source (updated by onSelectionChanged)
        const storedRows = this.selectedRows || [];
        console.log("[ControlPane] Stored selected rows:", storedRows.length);
        
        // Prefer grid data if available and matches stored data count, otherwise use stored data
        // This handles cases where grid API is out of sync but stored data is reliable
        if (gridData && gridData.length > 0 && gridData.length === storedRows.length) {
            console.log("[ControlPane] Using fresh grid data (matches stored count)");
            return gridData;
        } else {
            console.log("[ControlPane] Using stored data (grid API unreliable or empty)");
            return storedRows;
        }
    }

    /**
     * Enable/Disable buttons based on selection count
     * Uses the centralized button configuration
     */
    updateSelectionState(selectedRows = []) {
        console.log("[ControlPane] updateSelectionState called with:", selectedRows.length, "rows");
        this.selectedCount = selectedRows.length;
        this.anyRows = selectedRows.length > 0;
        this.selectedRows = selectedRows;

        // Get all buttons with a data-action attribute
        const buttons = document.querySelectorAll("[data-action]");

        // Update each button's state
        buttons.forEach(btn => {
            const actionType = btn.getAttribute("data-action");
            const config = this.buttonConfigs[actionType] || {};

            // Determine if the button should be enabled
            const shouldBeEnabled = this._shouldButtonBeEnabled(config, selectedRows);

            // Update button state
            btn.disabled = !shouldBeEnabled;

            // Special case for filter buttons: make sure they're always enabled
            if (btn.hasAttribute("data-filter")) {
                btn.disabled = false;
            }

            // Special case for add row button: always enabled
            if (actionType === 'addRow') {
                btn.disabled = false;
            }

            // Special case for compact view button: always enabled
            if (actionType === 'compactView') {
                btn.disabled = false;
            }

            // Special case for full screen button: always enabled
            if (actionType === 'fullScreen') {
                btn.disabled = false;
            }

            // Special case for export button: always enabled
            if (actionType === 'export') {
                btn.disabled = false;
            }

            // Special case for font size buttons: conditionally enabled based on limits
            if (actionType === 'increaseFontSize') {
                btn.disabled = this.currentFontSize >= this.maxFontSize;
            }
            
            if (actionType === 'decreaseFontSize') {
                btn.disabled = this.currentFontSize <= this.minFontSize;
            }

            // Special case for view detail button: exactly one row selected
            if (actionType === 'viewDetail') {
                btn.disabled = selectedRows.length !== 1;
            }
        });

        // Update AI button state
        const aiButton = document.querySelector(".ai-answer-btn");
        if (aiButton) {
            aiButton.disabled = selectedRows.length === 0;
        }

        // Check license limits whenever selection changes
        if (selectedRows.length > 0) {
            this.checkLicenseLimits();
        }

        // Update AI Answer menu based on selection
        this.updateAiAnswerMenu(selectedRows.length);

        // Update font size button states
        this.updateFontSizeButtonStates();
    }

    /**
     * Update AI Answer menu based on row selection count
     * Shows/hides Quick options and populates vector index submenus
     * @param {number} selectedCount - Number of selected rows
     */
    updateAiAnswerMenu(selectedCount) {
        const standardQuickItem = document.querySelector('.standard-quick-item');
        const enhancedQuickItem = document.querySelector('.enhanced-quick-item');

        if (selectedCount === 1) {
            // Single row: Show quick options with vector index submenus
            if (standardQuickItem) {
                standardQuickItem.style.display = '';
                this.populateVectorIndexSubmenu(standardQuickItem, 'standard');
            }
            if (enhancedQuickItem) {
                enhancedQuickItem.style.display = '';
                this.populateVectorIndexSubmenu(enhancedQuickItem, 'enhanced');
            }
        } else {
            // Multiple rows or no rows: Hide quick options
            if (standardQuickItem) standardQuickItem.style.display = 'none';
            if (enhancedQuickItem) enhancedQuickItem.style.display = 'none';
        }
    }

    /**
     * Populate vector index submenu for a given tier
     * @param {HTMLElement} menuItem - The menu item containing the submenu
     * @param {string} tier - 'standard' or 'enhanced'
     */
    async populateVectorIndexSubmenu(menuItem, tier) {
        const submenu = menuItem.querySelector('sl-menu[slot="submenu"]');
        if (!submenu) return;

        // Check if already populated and not stale
        if (this._vectorIndexesCache && Date.now() - this._vectorIndexesCacheTime < 60000) {
            // Use cached data (< 1 minute old)
            this.renderVectorIndexSubmenu(submenu, this._vectorIndexesCache, tier);
            return;
        }

        try {
            // Show loading state
            submenu.innerHTML = '<sl-menu-label>Loading vector indexes...</sl-menu-label>';

            // Fetch vector indexes
            const indexes = await this.fetchVectorIndexes();

            // Cache the results
            this._vectorIndexesCache = indexes;
            this._vectorIndexesCacheTime = Date.now();

            // Render the submenu
            this.renderVectorIndexSubmenu(submenu, indexes, tier);

        } catch (err) {
            console.error('[ControlPane] Error populating vector index submenu:', err);
            submenu.innerHTML = '<sl-menu-label>Error loading indexes</sl-menu-label>';
        }
    }

    /**
     * Render vector index submenu items
     * @param {HTMLElement} submenu - The submenu element
     * @param {Array} indexes - Array of vector index objects
     * @param {string} tier - 'standard' or 'enhanced'
     */
    renderVectorIndexSubmenu(submenu, indexes, tier) {
        if (!indexes || indexes.length === 0) {
            submenu.innerHTML = '<sl-menu-label>No vector indexes available</sl-menu-label>';
            return;
        }

        // Build submenu HTML
        let submenuHTML = '<sl-menu-label>Select Vector Index</sl-menu-label>';
        indexes.forEach(idx => {
            const value = `${tier}-quick-${idx.index_name}`;
            submenuHTML += `
                <sl-menu-item value="${value}"
                              data-tier="${tier}"
                              data-path="quick"
                              data-index="${idx.index_name}">
                    <sl-icon slot="prefix" name="database"></sl-icon>
                    ${idx.index_name}
                    <span slot="suffix" style="font-size: 0.85em; color: var(--sl-color-neutral-500);">
                        ${idx.dimension}d, ${idx.metric}
                    </span>
                </sl-menu-item>
            `;
        });

        submenu.innerHTML = submenuHTML;
    }

    /**
     * Fetch available vector indexes from the API
     * @returns {Promise<Array>} Array of vector index objects
     */
    async fetchVectorIndexes() {
        try {
            const response = await fetch('/corpus/vectors/list-indexes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.security.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subtenant: this.security.subtenant,
                    corpus: this._getDefaultCorpus()
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch vector indexes: ${response.statusText}`);
            }

            const result = await response.json();
            return result.indexes || [];

        } catch (error) {
            console.error('[ControlPane] Error fetching vector indexes:', error);
            throw error;
        }
    }

    /**
     * Check usage limits for a given meter code
     * @param {string} meter - Meter code (Q_STD or Q_ENH)
     * @returns {Promise<Object>} Result object with {allowed, breaches, warnings}
     */
    async checkUsageLimits(meter) {
        try {
            const response = await fetch('/subtenant/has-limit-breached', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.security.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    meter_list: [meter],
                    mode: 'meter'
                })
            });

            if (!response.ok) {
                throw new Error(`Limit check failed: ${response.statusText}`);
            }

            const result = await response.json();

            // Check for hard blocks
            const blocked = result.breaches?.some(b => b.status === 'BREACH_BLOCKED');
            const warnings = result.warnings || [];

            return {
                allowed: !blocked,
                blocked: blocked,
                warnings: warnings,
                breaches: result.breaches || [],
                details: result
            };

        } catch (error) {
            console.error('[ControlPane] Error checking usage limits:', error);
            // Fail-open: Allow operation if limit check fails
            return {
                allowed: true,
                error: true,
                message: error.message
            };
        }
    }

    /**
     * Show error modal when usage limit is exceeded
     * @param {Object} limitCheck - Limit check result
     * @param {string} meter - Meter code that was checked
     */
    showLimitExceededError(limitCheck, meter) {
        const breach = limitCheck.breaches?.[0];
        const meterName = meter === 'Q_ENH' ? 'Enhanced Questions' : 'Standard Questions';

        let message = `Usage limit exceeded for ${meterName}.`;

        if (breach) {
            message += `\n\nCurrent usage: ${breach.usage}/${breach.limit} (${breach.warning_pct}%)`;
        }

        message += '\n\nPlease contact your administrator to upgrade your plan or adjust usage limits.';

        this.errorModal.show({
            title: 'Usage Limit Exceeded',
            message: message
        });
    }

    async validateQuestionsForContent(selectedRows, modelType) {
        // console.log(`[ControlPane] Validating ${selectedRows.length} questions for ${modelType} model`);

        const invalid = {
            missingContent: [],
            duplicateId: [],
            shortQuestion: [],
            missingId: []
        };

        // Track IDs to check for duplicates
        const ids = new Set();

        // Check each row
        selectedRows.forEach((row, index) => {
            // Check for content configuration
            let hasValidContent = false;
            try {
                if (row.content) {
                    const contentObj = typeof row.content === 'string' ?
                        JSON.parse(row.content) : row.content;

                    // Check if content has valid domain and unit
                    if (contentObj && contentObj.domain && contentObj.unit) {
                        hasValidContent = true;
                    }
                }
            } catch (err) {
                console.error(`[validateQuestionsForContent] Error parsing content for question ${row.question_id}:`, err);
            }

            if (!hasValidContent) {
                invalid.missingContent.push(row.question_id || `Row ${index + 1}`);
            }

            // Check for ID
            if (!row.question_id) {
                invalid.missingId.push(`Row ${index + 1}`);
            } else if (ids.has(row.question_id)) {
                invalid.duplicateId.push(row.question_id);
            } else {
                ids.add(row.question_id);
            }

            // Check question length
            if (!row.question_text || row.question_text.length < 10) {
                invalid.shortQuestion.push(row.question_id || `Row ${index + 1}`);
            }
        });

        // Check if any issues were found
        const hasIssues = Object.values(invalid).some(arr => arr.length > 0);

        if (hasIssues) {
            // Build validation message with proper HTML formatting
            let message = `
                <div style="line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                    <p style="margin: 0 0 16px 0; font-size: 16px; color: #dc3545; font-weight: 600;">
                        The following issues must be fixed before proceeding:
                    </p>`;

            // ISSUE #8 FIX: Truncate long lists of questions
            const MAX_ITEMS_TO_SHOW = 5;

            if (invalid.missingContent.length > 0) {
                const itemsToShow = invalid.missingContent.slice(0, MAX_ITEMS_TO_SHOW);
                const remainingCount = invalid.missingContent.length - MAX_ITEMS_TO_SHOW;

                message += `
                    <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; color: #721c24; font-weight: 600;">
                            Missing Corpus Content Assignment:
                        </p>
                        <p style="margin: 0 0 12px 0; color: #721c24; font-family: 'Monaco', 'Menlo', monospace; font-size: 14px;">
                            ${itemsToShow.join(", ")}${remainingCount > 0 ? ` and ${remainingCount} more` : ''}
                        </p>
                        <div style="background: #f1f1f1; border-left: 4px solid #007bff; padding: 12px; border-radius: 4px;">
                            <p style="margin: 0; color: #495057;">
                                <strong>How to fix</strong>: Select the affected questions and use the <strong>"Content"</strong> button in the toolbar to assign corpus content. You can assign content to multiple questions at once.
                            </p>
                        </div>
                    </div>`;
            }

            if (invalid.duplicateId.length > 0) {
                const itemsToShow = invalid.duplicateId.slice(0, MAX_ITEMS_TO_SHOW);
                const remainingCount = invalid.duplicateId.length - MAX_ITEMS_TO_SHOW;

                message += `
                    <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; color: #721c24; font-weight: 600;">
                            Duplicate Question IDs:
                        </p>
                        <p style="margin: 0; color: #721c24; font-family: 'Monaco', 'Menlo', monospace; font-size: 14px;">
                            ${itemsToShow.join(", ")}${remainingCount > 0 ? ` and ${remainingCount} more` : ''}
                        </p>
                    </div>`;
            }

            if (invalid.shortQuestion.length > 0) {
                const itemsToShow = invalid.shortQuestion.slice(0, MAX_ITEMS_TO_SHOW);
                const remainingCount = invalid.shortQuestion.length - MAX_ITEMS_TO_SHOW;

                message += `
                    <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; color: #856404; font-weight: 600;">
                            Question Text Too Short (minimum 10 characters):
                        </p>
                        <p style="margin: 0; color: #856404; font-family: 'Monaco', 'Menlo', monospace; font-size: 14px;">
                            ${itemsToShow.join(", ")}${remainingCount > 0 ? ` and ${remainingCount} more` : ''}
                        </p>
                    </div>`;
            }

            if (invalid.missingId.length > 0) {
                const itemsToShow = invalid.missingId.slice(0, MAX_ITEMS_TO_SHOW);
                const remainingCount = invalid.missingId.length - MAX_ITEMS_TO_SHOW;

                message += `
                    <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; color: #721c24; font-weight: 600;">
                            Missing Question ID:
                        </p>
                        <p style="margin: 0; color: #721c24; font-family: 'Monaco', 'Menlo', monospace; font-size: 14px;">
                            ${itemsToShow.join(", ")}${remainingCount > 0 ? ` and ${remainingCount} more` : ''}
                        </p>
                    </div>`;
            }

            // Close the main container
            message += `
                </div>`;

            // Show error message
            const messageModal = new MessageModal();
            messageModal.show({
                title: "Validation Failed",
                message: message,
                buttonText: "OK"
            });

            return false;
        }

        return true;
    }


    /**
     * Update corpus users list
     * @param {Array} corpusUsers Updated list of corpus users
     */
    updateCorpusUsers(corpusUsers) {
        if (!corpusUsers) return;

        this.corpusUsers = corpusUsers;

        // Update owner dropdown with new users
        this.updateOwnerDropdown();
    }

    /**
     * Initialize responsive button label management
     */
    initializeResponsiveLabels() {
        // Store original button labels for restoration
        this.originalLabels = new Map();

        // Define button priority and label configurations
        this.buttonConfigs = new Map([
            // High priority buttons (last to hide)
            ['assignContent', { priority: 'high', originalText: 'Content', shortText: 'Content' }],
            ['aiAnswer', {
                priority: 'high',
                originalText: 'Answer Using AI',
                shortText: 'Answer'
            }],

            // Medium priority buttons
            ['viewDetail', { priority: 'medium', originalText: 'Details', shortText: 'Details' }],
            ['assignOwner', { priority: 'medium', originalText: 'Owner', shortText: 'Owner' }],
            ['moveSheet', { priority: 'medium', originalText: 'Move', shortText: 'Move' }],

            // Low priority buttons (first to hide)
            ['all', { priority: 'low', originalText: 'All', shortText: 'All' }],
            ['me', { priority: 'low', originalText: 'Assigned', shortText: 'Assigned' }],
            ['unconfirmed', { priority: 'low', originalText: 'Unconfirmed', shortText: 'Unconfirmed' }],
            ['compactView', { priority: 'low', originalText: 'Compact', shortText: 'Compact' }]
        ]);

        // Store original text content from rendered buttons
        this.captureOriginalLabels();

        // Store current state
        this.currentBreakpoint = null;

        // Bind the resize handler
        this.handleResize = this.handleResize.bind(this);

        // Set up resize listener
        window.addEventListener('resize', this.handleResize);

        // Initial call to set up labels
        setTimeout(() => {
            this.updateButtonLabels();
        }, 100);

        // console.log("[ControlPane] Responsive label management initialized");
    }

    /**
     * Capture the original text content from buttons as rendered
     */
    captureOriginalLabels() {
        this.buttonConfigs.forEach((config, action) => {
            const button = document.querySelector(`sl-button[data-action="${action}"]`);
            if (!button) return;

            // Find the main text span (not icons)
            const textSpans = Array.from(button.querySelectorAll('span')).filter(span => {
                // Skip spans that contain icons or are empty
                return !span.querySelector('sl-icon') &&
                    !span.classList.contains('sr-only') &&
                    span.textContent.trim().length > 0;
            });

            if (textSpans.length > 0) {
                const originalText = textSpans[0].textContent.trim();
                this.originalLabels.set(action, {
                    element: textSpans[0],
                    originalText: originalText
                });

                // console.log(`[ControlPane] Captured original label for ${action}: "${originalText}"`);
            }
        });
    }

    /**
     * Handle window resize events with debouncing
     */
    handleResize() {
        // Debounce resize events
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }

        this.resizeTimeout = setTimeout(() => {
            this.updateButtonLabels();
        }, 100); // Reduced debounce time for more responsive feel
    }

    /**
     * Update button labels based on current viewport width
     */
    updateButtonLabels() {
        const viewportWidth = window.innerWidth;

        // Define breakpoints and what to show
        let newBreakpoint;
        let showLow = false;
        let showMedium = false;
        let showHigh = false;
        let useShortAI = false;

        if (viewportWidth >= 1200) {
            // Very wide - show everything including full AI text
            newBreakpoint = 'xl';
            showLow = true;
            showMedium = true;
            showHigh = true;
            useShortAI = false;
        } else if (viewportWidth >= 1000) {
            // Wide - hide low priority, show short AI text
            newBreakpoint = 'lg';
            showLow = false;
            showMedium = true;
            showHigh = true;
            useShortAI = true;
        } else if (viewportWidth >= 800) {
            // Medium - hide low and medium, keep high priority
            newBreakpoint = 'md';
            showLow = false;
            showMedium = false;
            showHigh = true;
            useShortAI = true;
        } else if (viewportWidth >= 600) {
            // Narrow - only critical labels
            newBreakpoint = 'sm';
            showLow = false;
            showMedium = false;
            showHigh = true;
            useShortAI = true;
        } else {
            // Very narrow - icons only
            newBreakpoint = 'xs';
            showLow = false;
            showMedium = false;
            showHigh = false;
            useShortAI = false;
        }

        // Only update if breakpoint changed
        if (newBreakpoint === this.currentBreakpoint) {
            return;
        }

        // console.log(`[ControlPane] Updating labels for breakpoint: ${newBreakpoint} (${viewportWidth}px)`);
        // console.log(`[ControlPane] Visibility: low=${showLow}, medium=${showMedium}, high=${showHigh}, shortAI=${useShortAI}`);

        this.currentBreakpoint = newBreakpoint;

        // Update each button based on its priority
        this.buttonConfigs.forEach((config, action) => {
            this.updateButtonLabel(action, config, showLow, showMedium, showHigh, useShortAI);
        });
    }

    /**
     * Update a specific button's label by changing text content directly
     */
    updateButtonLabel(action, config, showLow, showMedium, showHigh, useShortAI) {
        // Get the stored label element for this button
        const labelInfo = this.originalLabels.get(action);
        if (!labelInfo || !labelInfo.element) {
            console.warn(`[ControlPane] No label element found for action: ${action}`);
            return;
        }

        const labelElement = labelInfo.element;

        // Determine if this button should show its label
        let shouldShow = false;
        let textToShow = '';

        switch (config.priority) {
            case 'low':
                shouldShow = showLow;
                break;
            case 'medium':
                shouldShow = showMedium;
                break;
            case 'high':
                shouldShow = showHigh;
                break;
        }

        // Determine what text to show
        if (shouldShow) {
            if (action === 'aiAnswer') {
                // Special handling for AI button with short/long text
                textToShow = useShortAI ? config.shortText : config.originalText;
            } else {
                // Use the original text for this button
                textToShow = config.originalText;
            }
        } else {
            // Hide the label completely
            textToShow = '';
        }

        // Update the text content directly - this eliminates whitespace issues
        labelElement.textContent = textToShow;

        // console.log(`[ControlPane] Updated ${action}: "${labelElement.textContent}" (shouldShow: ${shouldShow})`);
    }

    /**
     * Debug method to check current label states
     */
    debugLabelStates() {
        console.log("=== Current Button Label States ===");
        this.originalLabels.forEach((labelInfo, action) => {
            const currentText = labelInfo.element.textContent;
            const config = this.buttonConfigs.get(action);
            console.log(`${action} (${config.priority}): "${currentText}"`);
        });
        console.log(`Current breakpoint: ${this.currentBreakpoint}`);
        console.log(`Viewport width: ${window.innerWidth}px`);
        console.log("==================================");
    }

    /**
     * Show enhanced AI confirmation modal with job analysis
     * @param {string} selectedMode - The AI model selected (standard-model or enhanced-model)
     */
    async showAIConfirmationModal(selectedMode) {
        // console.log("[ControlPane] Showing AI confirmation modal for mode:", selectedMode);

        try {
            // PERMISSION VALIDATION - Check document edit and corpus permissions before proceeding
            if (!this.projectDocumentId || !this.docMetadata) {
                console.warn("[ControlPane] Missing document ID or metadata for permission check");
                this.errorModal.show({
                    title: "Permission Check Failed",
                    message: "Unable to verify permissions. Please refresh and try again."
                });
                return;
            }

            // Check document edit permission
            const docValidation = this.security.validateDocumentOperation(
                this.projectDocumentId,
                this.docMetadata,
                'EDIT'
            );

            if (!docValidation.allowed) {
                console.warn(`[ControlPane] Document edit permission denied: ${docValidation.message}`);
                this.security.showPermissionError(
                    this.errorModal,
                    'document_edit',
                    this.docMetadata,
                    docValidation.message
                );
                return;
            }

            // Get selected questions to determine operation type and corpus
            const selectedQuestions = this.getLatestSelectedRows();
            const questionCount = selectedQuestions.length;

            if (questionCount === 0) {
                this.messageModal.show({
                    title: "No Questions Selected",
                    message: "Please select one or more questions to generate AI answers."
                });
                return;
            }

            // Determine AI operation type and required corpus permission
            const operationType = questionCount === 1 ? 'AI_SINGLE' : 'AI_BATCH';
            const corpusId = this.docMetadata.corpus_id || 'cognaire'; // Default corpus if not specified

            // Check corpus permission for AI operations
            const corpusValidation = this.security.validateDocumentOperation(
                this.projectDocumentId,
                this.docMetadata,
                operationType,
                corpusId
            );

            if (!corpusValidation.allowed) {
                console.warn(`[ControlPane] Corpus permission denied for ${operationType}: ${corpusValidation.message}`);
                this.security.showPermissionError(
                    this.errorModal,
                    'corpus_ai',
                    { corpusId, operationType },
                    corpusValidation.message
                );
                return;
            }

            // console.log(`[ControlPane] Permission validation passed for ${operationType} on ${questionCount} questions`);

            // Check if the selected model is available
            if ((selectedMode === "standard-model" && !this.aiButtonState.standardEnabled) ||
                (selectedMode === "enhanced-model" && !this.aiButtonState.enhancedEnabled)) {

                const modelName = selectedMode === "standard-model" ? "Standard" : "Enhanced";
                this.messageModal.show({
                    title: "Model Not Available",
                    message: `The ${modelName} Model is not available due to license restrictions.`
                });
                return;
            }

            // Continue with the existing selected questions from permission validation above

            // ISSUE #8 FIX: Perform validation BEFORE showing confirmation modal
            const validationResult = await this.validateQuestionsForContent(selectedQuestions, selectedMode);
            if (!validationResult) {
                // Validation failed and error was already shown
                return;
            }

            // Count unique corpus content configurations
            const uniqueContentConfigs = this.getUniqueContentConfigurations(selectedQuestions);
            const subJobCount = uniqueContentConfigs.size;

            // Check for active jobs
            const activeJobs = this.getActiveJobs();

            // Build confirmation message with proper HTML formatting
            const modelName = selectedMode === "standard-model" ? "Standard" : "Enhanced";
            
            let message = `
                <div style="line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">`;

            // Job warning if there are active jobs
            if (activeJobs.length > 0) {
                message += `
                    <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0; color: #856404; font-weight: 600;">
                            ⚠️ <strong>Warning</strong>: There ${activeJobs.length === 1 ? 'is' : 'are'} ${activeJobs.length} active job${activeJobs.length === 1 ? '' : 's'} currently running.
                        </p>
                    </div>`;
            }

            // Main job description
            message += `
                    <p style="margin: 0 0 16px 0; font-size: 16px; color: #212529;">
                        You are about to start an AI question-answer job using the <strong>${modelName} Model</strong>, which will answer <strong>${questionCount} question${questionCount === 1 ? '' : 's'}</strong> across <strong>${subJobCount} sub-job${subJobCount === 1 ? '' : 's'}</strong>.
                    </p>`;

            // Large job warning
            if (questionCount > 30) {
                message += `
                    <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0; color: #721c24; font-weight: 600;">
                            ⚠️ <strong>Large Job Warning</strong>: This is a large job with ${questionCount} questions and may take considerable time to complete.
                        </p>
                    </div>`;
            }

            // Sub-job explanation
            if (subJobCount > 1) {
                message += `
                    <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0; color: #0c5460;">
                            The questions will be processed in <strong>${subJobCount} separate batches</strong> based on their corpus content configurations.
                        </p>
                    </div>`;
            }

            message += `
                    <p style="margin: 16px 0 0 0; font-size: 16px; color: #212529; font-weight: 600;">
                        Do you want to continue?
                    </p>
                </div>`;

            // Show confirmation modal
            this.confirmModal.show({
                title: `Confirm AI Answer - ${modelName} Model`,
                message: message,
                isHtml: true,
                onYes: async () => {
                    // console.log("[ControlPane] User confirmed AI job, checking usage limits");

                    // Pre-flight limit check
                    const meter = selectedMode === 'enhanced-model' ? 'Q_ENH' : 'Q_STD';
                    const limitCheck = await this.checkUsageLimits(meter);

                    if (!limitCheck.allowed) {
                        this.showLimitExceededError(limitCheck, meter);
                        return;
                    }

                    // Call the action handler to start the job
                    // The parent component should receive:
                    // {
                    //   mode: 'standard-model' | 'enhanced-model',
                    //   tier: 'standard' | 'enhanced',
                    //   path: 'bulk' | 'quick',
                    //   indexName: string (only for quick path),
                    //   questionCount: number,
                    //   subJobCount: number
                    // }
                    //
                    // Parent should route to:
                    // - Bulk: POST /startquestionjob with { model_tier: tier }
                    // - Quick: POST /corpus/quick-answer with { model_tier: tier, index_name: indexName }
                    if (this.onAction) {
                        this.onAction("AI_ANSWER", {
                            mode: selectedMode,
                            questionCount: questionCount,
                            subJobCount: subJobCount,
                            ...this._lastAISelection  // Include tier, path, indexName
                        });
                    }
                },
                onNo: () => {
                    // console.log("[ControlPane] User cancelled AI job");
                }
            });

        } catch (err) {
            console.error("[ControlPane] Error showing AI confirmation modal:", err);
            this.errorModal.show({
                title: "Error",
                message: "Failed to analyze job requirements. Please try again."
            });
        }
    }

    /**
     * Get unique content configurations from selected questions
     * @param {Array} questions - Selected questions
     * @returns {Set} - Set of unique content configuration keys
     */
    getUniqueContentConfigurations(questions) {
        const uniqueConfigs = new Set();

        questions.forEach(question => {
            if (question.content) {
                try {
                    let contentConfig;
                    if (typeof question.content === 'string') {
                        contentConfig = JSON.parse(question.content);
                    } else {
                        contentConfig = question.content;
                    }

                    // Create a key based on corpus, domain, unit, and other relevant fields
                    const configKey = JSON.stringify({
                        corpus: contentConfig.corpus || '',
                        domain: contentConfig.domain || '',
                        unit: contentConfig.unit || '',
                        document_topics: (contentConfig.document_topics || []).sort(),
                        document_types: (contentConfig.document_types || []).sort()
                    });

                    uniqueConfigs.add(configKey);
                } catch (err) {
                    console.warn("[ControlPane] Could not parse content config for question:", question.question_id);
                    // Add a default config for questions with invalid content
                    uniqueConfigs.add('{"corpus":"","domain":"","unit":"","document_topics":[],"document_types":[]}');
                }
            } else {
                // Add a default config for questions without content
                uniqueConfigs.add('{"corpus":"","domain":"","unit":"","document_topics":[],"document_types":[]}');
            }
        });

        return uniqueConfigs;
    }

    /**
     * Get active jobs from job controller
     * @returns {Array} - List of active jobs
     */
    getActiveJobs() {
        if (!this.jobController || typeof this.jobController.getActiveJobs !== 'function') {
            return [];
        }

        try {
            return this.jobController.getActiveJobs() || [];
        } catch (err) {
            console.warn("[ControlPane] Error getting active jobs:", err);
            return [];
        }
    }

    // ============================
    // Phase 2: Enhanced AI Processing with Visual Feedback
    // ============================

    /**
     * Enhanced AI job initiation with immediate visual feedback
     * Called after user confirms the AI job modal
     */
    startAIJobWithVisualFeedback(selectedMode, selectedRows, jobResult) {
        try {
            // Show immediate processing feedback
            this.showJobInitiationFeedback(selectedRows, selectedMode);
            
            // Apply processing state to grid rows immediately
            this.applyProcessingStateToGrid(selectedRows, jobResult);
            
            // Update AI button state
            this.updateAIButtonProcessingState(true);
            
            console.log(`[ControlPane] Started AI job with immediate visual feedback for ${selectedRows.length} rows`);
        } catch (error) {
            console.error('[ControlPane] Error in startAIJobWithVisualFeedback:', error);
            this.handleAIJobError(selectedRows, error);
        }
    }

    /**
     * Show immediate feedback when AI job is initiated
     */
    showJobInitiationFeedback(selectedRows, selectedMode) {
        const modelName = this.getModelDisplayName(selectedMode);
        const rowCount = selectedRows.length;
        
        // Show processing indicator
        this.showProcessingIndicator(`Starting ${modelName} processing for ${rowCount} questions...`);
        
        // Brief visual highlighting of selected rows (if grid is accessible)
        this.highlightSelectedRowsBriefly(selectedRows);
        
        // Auto-hide processing indicator after a short delay (it will be managed by job controller)
        setTimeout(() => {
            this.hideProcessingIndicator();
        }, 2000);
    }

    /**
     * Apply processing state to grid rows immediately
     */
    applyProcessingStateToGrid(selectedRows, jobResult) {
        // Check if we have access to a grid instance with the new processing methods
        const grid = this.getQuestionsGridInstance();
        
        if (grid && typeof grid.markRowsAsProcessing === 'function') {
            const jobId = jobResult?.question_master_jid || `ai-job-${Date.now()}`;
            grid.markRowsAsProcessing(selectedRows, jobId);
            console.log(`[ControlPane] Applied processing state to ${selectedRows.length} rows for job ${jobId}`);
        } else {
            console.warn('[ControlPane] Grid instance not available or does not support processing state');
        }
    }

    /**
     * Get the questions grid instance from the parent component
     * This method needs to be customized based on how the grid is exposed
     */
    getQuestionsGridInstance() {
        // Try to find the grid instance through various methods
        
        // Method 1: Check if grid is attached to window (common pattern)
        if (window.questionsGrid) {
            return window.questionsGrid;
        }
        
        // Method 2: Check if grid is available through a parent component
        // This would need to be customized based on the actual component structure
        if (this.parentComponent && this.parentComponent.questionsGrid) {
            return this.parentComponent.questionsGrid;
        }
        
        // Method 3: Try to find grid through DOM traversal (last resort)
        const gridContainer = document.querySelector('.question-grid-container');
        if (gridContainer && gridContainer._gridInstance) {
            return gridContainer._gridInstance;
        }
        
        return null;
    }

    /**
     * Briefly highlight selected rows for visual feedback
     */
    highlightSelectedRowsBriefly(selectedRows) {
        // This is a placeholder - the actual implementation would depend on 
        // how we can access the grid to apply temporary styling
        console.log(`[ControlPane] Highlighting ${selectedRows.length} rows briefly`);
        
        // In a real implementation, this might involve:
        // 1. Adding a temporary CSS class to selected rows
        // 2. Removing the class after a brief animation
        // 3. This would integrate with the grid's visual feedback system
    }

    /**
     * Update AI button state during processing
     */
    updateAIButtonProcessingState(isProcessing) {
        const aiButton = document.querySelector('.ai-answer-btn');
        if (aiButton) {
            if (isProcessing) {
                aiButton.classList.add('processing');
                aiButton.disabled = true;
                
                // Update button text/icon to show processing state
                const originalContent = aiButton.innerHTML;
                aiButton.dataset.originalContent = originalContent;
                aiButton.innerHTML = `
                    <i class="fas fa-spinner fa-spin"></i>
                    Processing...
                `;
            } else {
                aiButton.classList.remove('processing');
                aiButton.disabled = false;
                
                // Restore original button content
                if (aiButton.dataset.originalContent) {
                    aiButton.innerHTML = aiButton.dataset.originalContent;
                    delete aiButton.dataset.originalContent;
                }
            }
        }
    }

    /**
     * Handle errors during AI job initiation
     */
    handleAIJobError(selectedRows, error) {
        console.error('[ControlPane] AI job initiation error:', error);
        
        // Clear processing state from grid
        const grid = this.getQuestionsGridInstance();
        if (grid && typeof grid.clearProcessingIndicators === 'function') {
            grid.clearProcessingIndicators(selectedRows);
        }
        
        // Update button state
        this.updateAIButtonProcessingState(false);
        
        // Hide processing indicator
        this.hideProcessingIndicator();
        
        // Show error modal
        this.errorModal.show({
            title: "AI Job Failed",
            message: `Failed to start AI processing: ${error.message || 'Unknown error'}`
        });
    }

    /**
     * Get display name for AI model
     */
    getModelDisplayName(selectedMode) {
        const modelNames = {
            'standard': 'Standard AI',
            'enhanced': 'Enhanced AI',
            'claude-sonnet': 'Claude Sonnet',
            'claude-haiku': 'Claude Haiku'
        };
        return modelNames[selectedMode] || selectedMode;
    }

    /**
     * Increase grid font size
     */
    increaseFontSize() {
        if (this.currentFontSize < this.maxFontSize) {
            this.currentFontSize += 1;
            this.updateGridFontSize();
            this.updateFontSizeButtonStates();
        }
    }

    /**
     * Decrease grid font size
     */
    decreaseFontSize() {
        if (this.currentFontSize > this.minFontSize) {
            this.currentFontSize -= 1;
            this.updateGridFontSize();
            this.updateFontSizeButtonStates();
        }
    }

    /**
     * Update font size button states based on current font size
     */
    updateFontSizeButtonStates() {
        const increaseBtn = document.querySelector('sl-button[data-action="increaseFontSize"]');
        const decreaseBtn = document.querySelector('sl-button[data-action="decreaseFontSize"]');

        if (increaseBtn) {
            increaseBtn.disabled = this.currentFontSize >= this.maxFontSize;
        }

        if (decreaseBtn) {
            decreaseBtn.disabled = this.currentFontSize <= this.minFontSize;
        }
    }


    /**
     * Handle filter actions
     */
    handleFilterAction(filterType) {
        console.log(`[ControlPane] Handling filter: ${filterType}`);
        
        const filterMap = {
            'all': 'FILTER_ALL',
            'me': 'FILTER_ME',
            'unconfirmed': 'FILTER_UNCONFIRMED'
        };

        const actionType = filterMap[filterType];
        if (actionType && this.onAction) {
            this.onAction(actionType, {});
        }
    }

    /**
     * Update the grid font size by modifying CSS custom property
     */
    updateGridFontSize() {
        const gridContainer = document.querySelector('.ag-theme-alpine');
        if (gridContainer) {
            gridContainer.style.setProperty('--grid-font-size', `${this.currentFontSize}px`);
            
            // Force AG Grid to refresh all cells to apply the new font size
            if (window.currentQuestionGrid && window.currentQuestionGrid.gridApi) {
                window.currentQuestionGrid.gridApi.refreshCells({ force: true });
                
                // Update the grid's font size tracking and recalculate row heights
                // Sync compact mode state with grid first
                if (typeof window.currentQuestionGrid.setCompactMode === 'function') {
                    window.currentQuestionGrid.setCompactMode(this.isCompactView);
                }
                
                if (typeof window.currentQuestionGrid.updateFontSize === 'function') {
                    window.currentQuestionGrid.updateFontSize(this.currentFontSize);
                } else {
                    // Fallback for compatibility
                    window.currentQuestionGrid.gridApi.resetRowHeights();
                }
            }
        }
    }


    /**
     * Enhanced version of the onYes handler in showAIConfirmationModal
     * This method can be called to replace or enhance the existing confirmation flow
     */
    handleAIJobConfirmation(selectedMode, questionCount, subJobCount, selectedRows) {
        try {
            console.log('[ControlPane] AI job confirmed, starting with enhanced feedback');
            
            // Call the original action handler
            if (this.onAction) {
                const actionResult = this.onAction("AI_ANSWER", {
                    mode: selectedMode,
                    questionCount: questionCount,
                    subJobCount: subJobCount
                });
                
                // If the action returns a promise (modern pattern), handle it
                if (actionResult && typeof actionResult.then === 'function') {
                    actionResult
                        .then((jobResult) => {
                            this.startAIJobWithVisualFeedback(selectedMode, selectedRows, jobResult);
                        })
                        .catch((error) => {
                            this.handleAIJobError(selectedRows, error);
                        });
                } else {
                    // For synchronous action handlers, apply feedback immediately
                    this.startAIJobWithVisualFeedback(selectedMode, selectedRows, actionResult);
                }
            }
        } catch (error) {
            this.handleAIJobError(selectedRows, error);
        }
    }

    /**
     * Clean up resources when component is destroyed
     */
    destroy() {
        // Remove resize listener
        if (this.handleResize) {
            window.removeEventListener('resize', this.handleResize);
        }

        // Clear resize timeout
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }

        // Clear stored references
        if (this.originalLabels) {
            this.originalLabels.clear();
        }

        // Remove event listeners
        if (this.boundHandleCacheInvalidated) {
            document.removeEventListener('corpus-config-invalidated', this.boundHandleCacheInvalidated);
        }
        if (this.boundHandleFreshDataReceived) {
            document.removeEventListener('corpus-config-refreshed', this.boundHandleFreshDataReceived);
        }
        if (this.boundHandleFavoritesUpdated) {
            document.removeEventListener('favorites-updated', this.boundHandleFavoritesUpdated);
        }

        // Clear cached data
        this.contentOptionsCache = null;
        this.licenseCheckCache = null;

        // Unsubscribe from store events
        if (this.store && this.storeSubscriptionIds && this.storeSubscriptionIds.length > 0) {
            // console.log(`[ControlPane] Unsubscribing from ${this.storeSubscriptionIds.length} store subscriptions`);
            this.storeSubscriptionIds.forEach(({ key, id }) => {
                try {
                    this.store.unsubscribe(key, id);
                } catch (error) {
                    console.warn(`[ControlPane] Error unsubscribing from ${key}:`, error);
                }
            });
            this.storeSubscriptionIds = [];
        }

        // console.log("[ControlPane] Resources cleaned up");
    }

    /**
     * Load compact view state from localStorage
     * Always returns false to ensure compact mode starts OFF after refresh
     * @returns {boolean} - Always false to start in normal mode
     */
    loadCompactViewState() {
        // ALWAYS START WITH COMPACT MODE OFF AFTER REFRESH
        return false;
    }

    /**
     * Save compact view state to localStorage
     * @param {boolean} isCompact - The compact mode state to save
     */
    saveCompactViewState(isCompact) {
        try {
            localStorage.setItem('compact-view-state', JSON.stringify(isCompact));
        } catch (error) {
            console.warn('[ControlPane] Failed to save compact view state:', error);
        }
    }
}