// File: ui/views/corpus-manager.js
import { YesNoModal } from "../modals/yesno-modal.js";
import { ErrorModal } from "../modals/error-modal.js";
import { getFreshSecurity } from "../../utils/security-utils.js";

// Import view components
import { CorpusBrowseView } from "./corpus/corpus-browse-view.js";
import { CorpusApprovalsView } from "./corpus/corpus-approvals-view.js";
import { CorpusDocumentTypesView } from "./corpus/corpus-document-types-view.js";
import { CorpusLabelsView } from "./corpus/corpus-labels-view.js";
import { CorpusDocumentTopicsView } from "./corpus/corpus-document-topics-view.js";
import { ManageUserGroupsView } from "./corpus/manage-user-groups-view.js";
import { getSubtenantAttributes } from "../../api/subtenants.js";

import CorpusContentImportModal from '../modals/corpus-content-import-modal.js';
import { CollapseNavButton } from "../components/corpus-collapse-nav-button.js";

export class CorpusManager {
  constructor(store, jobController, router = null) {
    console.log("[CorpusManager] Constructor called");
    this.store = store;
    this.jobController = jobController;
    this.router = router;
    this.corpusConfig = null;

    // Collapse button
    this.collapseNavButton = new CollapseNavButton(this.store);

    // Modal utilities
    this.confirmModal = new YesNoModal();
    this.errorModal = new ErrorModal();

    // DOM references
    this.mainContentEl = null;
    this.verticalNavEl = null;
    this.wrapperEl = null;
    this.titleBarEl = null;
    this.contentAreaEl = null;

    // Navigation state
    this.activeSection = this.store.get("corpus.activeSection") || "browse";

    // Define the vertical tab structure
    this.navigationSections = [
      {
        id: "browse",
        label: "Browse",
        subtext: "Browse and manage corpus documents",
        icon: "fas fa-folder",
        permissions: ["CORPUS_VIEWER", "CORPUS_EDITOR"],
        viewClass: CorpusBrowseView,
        actions: [
          {
            id: "import-content",
            label: "Import Content",
            icon: "fas fa-upload",
            buttonClass: "btn--primary",
            permissions: ["CORPUS_EDITOR"],
            handler: (view) => {
              // Delegate to view's handler if available
              if (view && typeof view.handleImportClick === 'function') {
                view.handleImportClick();
              } else {
                console.warn("View does not implement handleImportClick");
              }
            },
            visibleWhen: (view) => view.viewMode === 'corpus-contents'
          },
          {
            id: "new-corpus",
            label: "New Corpus",
            icon: "fas fa-plus-circle",
            buttonClass: "btn--primary",
            permissions: ["SYSTEM_ADMIN", "APP_ADMIN"],
            handler: (view) => {
              if (view && typeof view.handleNewCorpusClick === 'function') {
                view.handleNewCorpusClick();
              } else {
                console.warn("View does not implement handleNewCorpusClick");
              }
            },
            visibleWhen: (view) => view.viewMode === 'corpora'
          },
          {
            id: "add-domain",
            icon: "fas fa-folder-plus",
            buttonClass: "btn--icon",
            title: "Add Domain",
            permissions: ["SYSTEM_ADMIN", "APP_ADMIN"],
            handler: (view) => {
              if (view && typeof view.handleAddDomain === 'function') {
                view.handleAddDomain(view.selectedCorpus);
              } else {
                console.warn("View does not implement handleAddDomain");
              }
            },
            visibleWhen: (view) => 
              view.viewMode === 'corpus-contents' && 
              view.selectedPath === view.selectedCorpus // Only at corpus level
          },
          {
            id: "delete-corpus",
            icon: "fas fa-trash-alt",
            buttonClass: "btn--icon btn--danger",
            title: "Delete Corpus",
            permissions: ["SYSTEM_ADMIN", "APP_ADMIN"],
            handler: (view) => {
              if (view && typeof view.handleDeleteCorpus === 'function') {
                view.handleDeleteCorpus(view.selectedCorpus);
              } else {
                console.warn("View does not implement handleDeleteCorpus");
              }
            },
            visibleWhen: (view) => 
              view.viewMode === 'corpus-contents' && 
              view.selectedPath === view.selectedCorpus && // Only at corpus level
              view.folders.length === 0 // Only if no child domains
          },
          {
            id: "add-unit",
            icon: "fas fa-plus-square",
            buttonClass: "btn--icon",
            title: "Add Unit",
            permissions: ["SYSTEM_ADMIN", "APP_ADMIN"],
            handler: (view) => {
              if (view && typeof view.handleAddUnit === 'function') {
                // Extract corpusId and domainId from the selected path
                const pathParts = view.selectedPath.split('/');
                if (pathParts.length === 2) {
                  const corpusId = pathParts[0];
                  const domainId = pathParts[1];
                  view.handleAddUnit(corpusId, domainId);
                }
              } else {
                console.warn("View does not implement handleAddUnit");
              }
            },
            visibleWhen: (view) => 
              view.viewMode === 'corpus-contents' && 
              view.selectedPath.split('/').length === 2 // Only at domain level regardless of children
          },
          {
            id: "delete-domain",
            icon: "fas fa-trash-alt",
            buttonClass: "btn--icon btn--danger",
            title: "Delete Domain",
            permissions: ["SYSTEM_ADMIN", "APP_ADMIN"],
            handler: (view) => {
              if (view && typeof view.handleDeleteDomain === 'function') {
                // Extract corpusId and domainId from the selected path
                const pathParts = view.selectedPath.split('/');
                if (pathParts.length === 2) {
                  const corpusId = pathParts[0];
                  const domainId = pathParts[1];
                  view.handleDeleteDomain(corpusId, domainId);
                }
              } else {
                console.warn("View does not implement handleDeleteDomain");
              }
            },
            visibleWhen: (view) => 
              view.viewMode === 'corpus-contents' && 
              view.selectedPath.split('/').length === 2 && // Only at domain level
              view.folders.length === 0 // Only if no child units
          },
          {
            id: "delete-unit",
            icon: "fas fa-trash-alt",
            buttonClass: "btn--icon btn--danger",
            title: "Delete Unit",
            permissions: ["SYSTEM_ADMIN", "APP_ADMIN"],
            handler: (view) => {
              if (view && typeof view.handleDeleteUnit === 'function') {
                // Extract corpusId, domainId, and unitId from the selected path
                const pathParts = view.selectedPath.split('/');
                if (pathParts.length === 3) {
                  const corpusId = pathParts[0];
                  const domainId = pathParts[1];
                  const unitId = pathParts[2];
                  view.handleDeleteUnit(corpusId, domainId, unitId);
                }
              } else {
                console.warn("View does not implement handleDeleteUnit");
              }
            },
            visibleWhen: (view) => 
              view.viewMode === 'corpus-contents' && 
              view.selectedPath.split('/').length === 3 && // Only at unit level
              !view.hasActiveDocuments // Only if no active documents
          }
        ]
      },
      {
        id: "approvals",
        label: "Document Approvals",
        subtext: "Review and approve documents",
        icon: "fas fa-check-circle",
        permissions: ["DOCUMENT_APPROVER"],
        viewClass: CorpusApprovalsView
      },
      {
        id: "topics",
        label: "Document Topics",
        subtext: "Manage document topic settings",
        icon: "fas fa-tags",
        permissions: ["CORPUS_EDITOR", "DOCUMENT_APPROVER"],
        viewClass: CorpusDocumentTopicsView, // Add this line to register the view
        actions: [
          // Optional actions for the topics view if needed
        ]
      },
      {
        id: "types",
        label: "Document Types",
        subtext: "Configure allowed document types",
        icon: "fas fa-file-alt",
        permissions: ["CORPUS_EDITOR", "DOCUMENT_APPROVER"],
        viewClass: CorpusDocumentTypesView  // Add this line
      },
      {
        id: "labels",
        label: "Labels",
        subtext: "Manage document labels",
        icon: "fas fa-bookmark",
        permissions: ["CORPUS_EDITOR", "DOCUMENT_APPROVER"],
        viewClass: CorpusLabelsView  // Add this line
      },
      {
        id: "groups",
        label: "User Groups",
        subtext: "Configure approval groups",
        icon: "fas fa-users",
        permissions: ["CORPUS_EDITOR", "DOCUMENT_APPROVER"],
        viewClass: ManageUserGroupsView
      }
    ];

    // View instances map
    this.views = {};
    this.currentView = null;
  }

  attachToDOM({ mainContentEl }) {
    console.log("[CorpusManager] attachToDOM() => host assigned");
    this.mainContentEl = mainContentEl;

    // Initialize after DOM attachment
    this.initialize();
  }

  async initialize() {
    try {
      // Load corpus configuration
      await this.loadCorpusConfig();
      // Then render the UI
      this.render();
    } catch (error) {
      console.error("[CorpusManager] Initialization error:", error);
      this.errorModal.show({
        title: "Initialization Error",
        message: "Failed to initialize corpus manager. Please refresh the page."
      });
    }
  }

  async loadCorpusConfig() {
    try {
      console.log("[CorpusManager] Loading corpus configuration...");
      const attributes = await getSubtenantAttributes(['corpus_config']);
      this.corpusConfig = attributes.corpus_config || {};
      // Store in application store for global access
      this.store.set("corpus_config", this.corpusConfig);
      console.log("[CorpusManager] Corpus configuration loaded");
      return this.corpusConfig;
    } catch (error) {
      console.error("[CorpusManager] Failed to load corpus configuration:", error);
      this.corpusConfig = {};
      this.store.set("corpus_config", {});
      throw error;
    }
  }

  render() {
    if (!this.mainContentEl) {
      console.error("[CorpusManager] mainContentEl not assigned");
      return;
    }
  
    const currentCorpus = this.store.get("currentCorpus") || "--";
    const isNavCollapsed = this.store.get("corpus.navCollapsed") || false;
  
    // Create the corpus manager structure
    this.mainContentEl.innerHTML = `
    <div class="corpus-manager-container ${isNavCollapsed ? 'nav-collapsed' : ''}">
      <div id="nav-collapse-toggle-container"></div>

      <div class="vertical-nav-wrapper">
        <div class="corpus-nav">
          ${this.renderVerticalNav()}
        </div>
      </div>
      <div class="corpus-content-wrapper">
        <div class="corpus-title-bar">
          <h2 id="corpus-section-title">Corpus Management - ${this.getActiveSectionLabel()}</h2>
          <div class="corpus-action-buttons">
            ${this.renderActionButtons()}
          </div>
        </div>
        <div class="corpus-content-area">
          <!-- Content will be rendered by active view -->
        </div>
      </div>
    </div>
  `;
  
    // Store DOM references
    this.wrapperEl = this.mainContentEl.querySelector('.corpus-manager-container');
    this.verticalNavEl = this.mainContentEl.querySelector('.corpus-nav');
    this.titleBarEl = this.mainContentEl.querySelector('.corpus-title-bar');
    this.contentAreaEl = this.mainContentEl.querySelector('.corpus-content-area');
    
    // Render collapse button
    const toggleContainer = this.mainContentEl.querySelector('#nav-collapse-toggle-container');
    if (toggleContainer) {
      toggleContainer.appendChild(this.collapseNavButton.render());
    }
  
    // Wire up navigation event listeners
    this.attachEventListeners();
  
    // Show the active view
    this.showActiveView();
  }

  renderVerticalNav() {
    const security = getFreshSecurity(this.store);
  
    return this.navigationSections
      .filter(section => this.hasRequiredPermissions(security, section.permissions))
      .map(section => `
        <button 
          class="vertical-nav-item ${section.id === this.activeSection ? 'active' : ''}"
          data-section="${section.label}"
          data-section-id="${section.id}"
        >
          <div class="vertical-nav-icon">
            <i class="${section.icon}"></i>
          </div>
          <div class="vertical-nav-content">
            <div class="vertical-nav-label">${section.label}</div>
            <div class="vertical-nav-subtext">${section.subtext}</div>
          </div>
        </button>
      `).join('');
  }

  /**
   * Renders action buttons for the current view in the title bar
   */
  renderActionButtons() {
    const section = this.navigationSections.find(s => s.id === this.activeSection);
    if (!section || !section.actions || section.actions.length === 0) {
      return '';
    }
  
    const security = getFreshSecurity(this.store);
    const currentCorpus = this.store.get("currentCorpus") || "rfp";
  
    return section.actions
      .filter(action => {
        // Check permissions
        if (action.permissions && !action.permissions.some(p => {
          // Check both system and corpus permissions
          return security.hasSystemPermission(p) || security.hasCorpusPermission(currentCorpus, p);
        })) {
          return false;
        }
  
        // Check visibility condition if exists
        if (action.visibleWhen && this.currentView) {
          return action.visibleWhen(this.currentView);
        }
  
        return true;
      })
      .map(action => `
        <button 
          id="${action.id}" 
          class="btn ${action.buttonClass || 'btn--secondary'}"
          data-action="${action.id}"
          ${action.title ? `title="${action.title}"` : ''}
        >
          ${action.icon ? `<i class="${action.icon}"></i> ` : ''}
          ${action.label ? action.label : ''}
        </button>
      `)
      .join('');
  }

  getActiveSectionLabel() {
    const section = this.navigationSections.find(s => s.id === this.activeSection);
    return section ? section.label : "Unknown Section";
  }

  hasRequiredPermissions(security, requiredPermissions) {
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const currentCorpus = this.store.get("currentCorpus") || "rfp";

    return requiredPermissions.some(permission =>
      security.hasCorpusPermission(currentCorpus, permission)
    );
  }

  attachEventListeners() {
    // Handle vertical nav clicks - use event delegation for better performance
    if (this.verticalNavEl) {
      this.verticalNavEl.addEventListener('click', (e) => {
        const navItem = e.target.closest('.vertical-nav-item');
        if (!navItem) return;

        const section = navItem.dataset.sectionId;
        if (section && section !== this.activeSection) {
          this.changeSection(section);
        }
      });
    }

    // Listen for corpus config updates from views
    this.mainContentEl.addEventListener('corpus:config-updated', async (e) => {
      console.log('[CorpusManager] Received corpus config update event from:', e.detail?.source);
      
      try {
        // Reload corpus config from API to get fresh data
        await this.loadCorpusConfig();
        console.log('[CorpusManager] Reloaded corpus config after update event');
      } catch (error) {
        console.error('[CorpusManager] Failed to reload corpus config after update:', error);
      }
    });

    // Handle action button clicks
    const actionButtons = this.titleBarEl?.querySelectorAll('[data-action]');
    if (actionButtons) {
      actionButtons.forEach(button => {
        button.addEventListener('click', () => {
          const actionId = button.dataset.action;
          this.handleActionClick(actionId);
        });
      });
    }

    // Listen for view mode changes from views
    this.mainContentEl.addEventListener('corpus:view-mode-changed', (e) => {
      console.log('View mode changed:', e.detail);
      
      // Update the corpus if provided in the event
      if (e.detail.corpus) {
        this.store.set("currentCorpus", e.detail.corpus);
      }
      
      // Update the UI
      this.updateActionButtons();
      this.updateCorpusDisplay(); // Add this method to update just the corpus display
    });

    // Listen for corpus import modal event
    this.mainContentEl.addEventListener('corpus:open-import-modal', (e) => {
      console.log('Import modal event received:', e.detail);
      this._handleOpenImportModal(e.detail);
    });
  }

  updateCorpusDisplay() {
    // Corpus context info has been removed as requested
  }

  async _handleOpenImportModal(detail) {
    console.log('Opening import modal for path:', detail.path);

    try {
      // Check for existing modal instance in the DOM
      const existingModal = document.querySelector('.modal.modal--form.modal--import-wizard');
      if (existingModal) {
        console.log('Found existing modal in DOM, removing it first');
        existingModal.style.display = 'none';
        if (existingModal.parentNode) {
          existingModal.parentNode.removeChild(existingModal);
        }

        // Also remove any overlays
        const existingOverlay = document.querySelector('.overlay');
        if (existingOverlay) {
          existingOverlay.style.display = 'none';
          if (existingOverlay.parentNode) {
            existingOverlay.parentNode.removeChild(existingOverlay);
          }
        }
      }

      const modal = new CorpusContentImportModal({
        store: this.store,
        currentPath: detail.path ?? '',
        corpusConfig: this.corpusConfig
      });

      // show() can stay async; await it so errors bubble here
      await modal.show(() => {
        if (typeof detail.onImport === 'function') detail.onImport();
      });

    } catch (err) {
      console.error('[ImportModal] fatal:', err);
      this.errorModal?.show({
        title: 'Error',
        message: 'Failed to open the import wizard. Check the console.'
      });
    }
  }


  /**
   * Handles clicks on action buttons in the title bar
   */
  handleActionClick(actionId) {
    const section = this.navigationSections.find(s => s.id === this.activeSection);
    if (!section || !section.actions) return;

    const action = section.actions.find(a => a.id === actionId);
    if (action && action.handler) {
      action.handler(this.currentView);
    }
  }

  changeSection(sectionId) {
    console.log(`[CorpusManager] Changing to section: ${sectionId}`);

    // First, try to update the URL via router (if available)
    if (window.router && window.router.isReady()) {
      try {
        const currentMatch = window.router.getCurrentRoute();
        console.log(`[CorpusManager] Current route match:`, currentMatch);
        
        // Check if we're in any corpus-related route (corpus parent or its children)
        if (currentMatch && (currentMatch.route.id === 'corpus' || (currentMatch.fullPath && currentMatch.fullPath[0] === 'corpus'))) {
          // Build URL for corpus child route
          const newUrl = `/corpus/${sectionId}`;
          console.log(`[CorpusManager] Updating URL to: ${newUrl}`);
          
          // Navigate to new URL (this will update URL and trigger router handling)
          window.router.navigate(newUrl, { replace: false });
          
          // The router will call back to navigateToSection(), so return early to avoid double execution
          return;
        } else {
          console.warn(`[CorpusManager] Not in corpus route, current route: ${currentMatch?.route?.id}, proceeding with internal navigation`);
        }
      } catch (error) {
        console.warn('[CorpusManager] Router navigation failed, proceeding with internal navigation:', error);
      }
    } else {
      console.log('[CorpusManager] Router not available, proceeding with internal navigation');
    }

    // Internal section change (fallback or when called by router)
    this.performSectionChange(sectionId);
  }

  /**
   * Perform the actual section change (internal method)
   */
  performSectionChange(sectionId) {
    console.log(`[CorpusManager] Performing internal section change to: ${sectionId}`);
    console.log(`[CorpusManager] Previous section: ${this.activeSection}`);

    // Deactivate current view
    if (this.currentView) {
      console.log(`[CorpusManager] Deactivating current view: ${this.currentView.constructor?.name}`);
      this.currentView.onDeactivate();
    }

    // Update active section
    this.activeSection = sectionId;
    this.store.set("corpus.activeSection", sectionId);

    // Re-render to update active states and show the new view
    console.log(`[CorpusManager] Re-rendering for section: ${sectionId}`);
    this.render();
  }

  /**
   * Navigate to a specific corpus section (router integration method)
   * @param {string} sectionId - The section ID to navigate to (browse, approvals, etc.)
   */
  navigateToSection(sectionId) {
    console.log(`[CorpusManager] Router-initiated navigation to section: ${sectionId}`);
    console.log(`[CorpusManager] Current active section: ${this.activeSection}`);
    console.log(`[CorpusManager] Available sections:`, this.navigationSections.map(s => s.id));

    // Check if section exists
    const section = this.navigationSections.find(s => s.id === sectionId || s.path === sectionId);
    if (!section) {
      console.warn(`[CorpusManager] Unknown section: ${sectionId}`);
      console.warn(`[CorpusManager] Available sections: ${this.navigationSections.map(s => s.id).join(', ')}`);
      return false;
    }

    // Use the section's ID (handle case where we got path instead)
    const targetSectionId = section.id;
    console.log(`[CorpusManager] Target section ID: ${targetSectionId}`);

    // Only change if it's different from current section
    if (targetSectionId !== this.activeSection) {
      console.log(`[CorpusManager] Performing section change from ${this.activeSection} to ${targetSectionId}`);
      // Use internal method to avoid double URL updates since router already updated URL
      this.performSectionChange(targetSectionId);
    } else {
      console.log(`[CorpusManager] Already on target section ${targetSectionId}, no change needed`);
    }

    return true;
  }

  showActiveView() {
    const section = this.navigationSections.find(s => s.id === this.activeSection);
    if (!section || !section.viewClass) {
      this.renderPlaceholder();
      return;
    }

    // Create view instance if it doesn't exist
    if (!this.views[this.activeSection]) {
      this.views[this.activeSection] = new section.viewClass(this.store, this.jobController);
    }

    // Get the current view
    this.currentView = this.views[this.activeSection];

    // Render the view into the content area
    this.currentView.render(this.contentAreaEl);

    // Activate the view with router context if available
    let routerMatch = null;
    if (window.router && window.router.isReady()) {
      try {
        routerMatch = window.router.getCurrentRoute();
        console.log('[CorpusManager] 🚀 Retrieved router match for view activation:', routerMatch);
        if (routerMatch && routerMatch.entityId) {
          console.log('[CorpusManager] 🎯 Router match contains entityId for restoration:', routerMatch.entityId);
        } else {
          console.log('[CorpusManager] 🚀 No entityId in router match');
        }
      } catch (error) {
        console.warn('[CorpusManager] Failed to get current router match:', error);
      }
    } else {
      console.log('[CorpusManager] 🚀 Router not available or not ready');
    }
    
    console.log('[CorpusManager] 🚀 Calling onActivate on view:', this.currentView.constructor?.name);
    this.currentView.onActivate(routerMatch);

    // Update action buttons based on new view state
    this.updateActionButtons();
  }

  /**
   * Updates action button visibility based on view state changes
   */
  updateActionButtons() {
    const actionButtonsContainer = this.titleBarEl?.querySelector('.corpus-action-buttons');
    if (actionButtonsContainer) {
      actionButtonsContainer.innerHTML = this.renderActionButtons();

      // Reattach event listeners to new buttons
      const actionButtons = actionButtonsContainer.querySelectorAll('[data-action]');
      if (actionButtons) {
        actionButtons.forEach(button => {
          button.addEventListener('click', () => {
            const actionId = button.dataset.action;
            this.handleActionClick(actionId);
          });
        });
      }
    }
  }

  renderPlaceholder() {
    if (!this.contentAreaEl) return;

    this.contentAreaEl.innerHTML = `
      <div class="content-section">
        <p>This section is under construction.</p>
      </div>
    `;
  }

  async refresh() {
    // Refresh current section data
    console.log(`[CorpusManager] Refreshing section: ${this.activeSection}`);
    this.render();
  }

  destroy() {
    // Clean up all views
    Object.values(this.views).forEach(view => {
      if (view && view.destroy) {
        view.destroy();
      }
    });
    this.views = {};
    this.currentView = null;
    
    // Clean up collapse button
    if (this.collapseNavButton) {
      this.collapseNavButton.destroy();
    }
  }
}