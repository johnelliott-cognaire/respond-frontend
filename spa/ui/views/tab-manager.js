// ui/views/tab-manager.js
import { YesNoModal } from "../modals/yesno-modal.js";
import { ErrorModal } from "../modals/error-modal.js";
import { DocumentTaskFramework } from "../framework/document-task-framework.js";
import { computeAggregateStatus, JOB_STATUS } from "../../utils/job-status-utils.js";
import { getStorageLimits } from "../../utils/config.js";
import { TabLimitExceededError, createTabLimitError, isUserFriendlyStorageError } from "../../utils/storage-errors.js";
import { checkStorageLimits } from "../../utils/storage-monitor.js";

export class TabManager {
  constructor(store, jobController) {
    this.store = store;
    this.jobController = jobController;
    this.tabs = [];
    this.activeTabIndex = -1;
    this.confirmModal = new YesNoModal();
    this.errorModal = new ErrorModal();

    this.tabsRootEl = null;
    this.mainContentEl = null;
    this.scrollLeftBtn = null;
    this.scrollRightBtn = null;

    this.framework = new DocumentTaskFramework(this.store, jobController);
    
    // Add debounced persistence to prevent excessive localStorage writes
    this.persistTimeout = null;
    this.persistDelay = 500; // 500ms delay
    this.isDirty = false;
    
    // Get storage limits configuration
    this.storageLimits = getStorageLimits();
  }

  attachToDOM({ tabsRootEl, mainContentEl, scrollLeftBtn, scrollRightBtn }) {
    this.tabsRootEl = tabsRootEl;
    this.mainContentEl = mainContentEl;
    this.scrollLeftBtn = scrollLeftBtn;
    this.scrollRightBtn = scrollRightBtn;
  }

  /**
   * Modified updateDocStatus to only update icon color, not document status
   * This method is called to update the tab UI based on job status,
   * but should NOT modify the actual document status
   */
  updateDocStatus(docInstance, newStatus) {
    
    // Find the tab that holds this docInstance
    const tabIndex = this.tabs.findIndex(t => t.newFrameworkDoc === docInstance);
    if (tabIndex < 0) {
      console.warn("[TabManager] updateDocStatus => no matching tab found, ignoring...");
      return;
    }
    
    // We store the job status on the tab object for UI purposes
    // but DO NOT modify the actual document status
    this.tabs[tabIndex].docStatus = newStatus;

    // Calculate tab-level aggregated status for visual indication only
    const docStatuses = this.tabs.filter(t => t.id === this.tabs[tabIndex].id).map(t => t.docStatus);
    const tabAggregatedStatus = computeAggregateStatus(docStatuses);

    // Store on tab for UI purposes, but don't modify document status
    this.tabs[tabIndex].aggregatedStatus = tabAggregatedStatus;

    // Re-render to update the icon color only
    this.render();
  }

  render() {
    const token = localStorage.getItem("authToken");
    const tabBarWrapper = document.querySelector(".tab-bar-wrapper");
  
    if (!token) {
      if (tabBarWrapper) {
        tabBarWrapper.style.display = "none";
      }
      if (this.mainContentEl) {
        this.mainContentEl.innerHTML = `
          <div class='access-denied' style='padding:2rem; text-align:center;'>
            You must log-in to access the application.
          </div>
        `;
      }
      return;
    } else {
      if (tabBarWrapper) {
        tabBarWrapper.style.display = "flex";
      }
    }
  
    if (!this.tabsRootEl) {
      console.error("[TabManager] no tabsRootEl => can't render tabs");
      return;
    }
  
    // 1) Either find the existing .tabs-container/.tabs-scroller or create them once
    let container = this.tabsRootEl.querySelector(".tabs-container");
    if (!container) {
      container = document.createElement("div");
      container.classList.add("tabs-container");
  
      const scrollerDiv = document.createElement("div");
      scrollerDiv.classList.add("tabs-scroller");
  
      container.appendChild(scrollerDiv);
      this.tabsRootEl.appendChild(container);
    }
  
    // 2) Now grab the one and only .tabs-scroller
    const scrollerEl = container.querySelector(".tabs-scroller");
    if (!scrollerEl) {
      console.error("[TabManager] Cannot find or create .tabs-scroller");
      return;
    }
  
    // 3) Clear any previous tab markup inside .tabs-scroller
    scrollerEl.innerHTML = "";
  
    // 4) Rebuild the HTML for each tab
    let html = "";
    this.tabs.forEach((tObj, idx) => {
      const isActive = (idx === this.activeTabIndex);
      const tabClasses = "tab" + (isActive ? " active" : "");
  
      // Create status class for the icon
      let iconStatusClass = "";
      if (tObj.aggregatedStatus) {
        const lower = tObj.aggregatedStatus.toLowerCase();
        iconStatusClass = ` icon-status--${lower}`;
      }
  
      html += `
        <div class="${tabClasses}" data-tab-idx="${idx}">
          <i class="${tObj.iconClass || "fas fa-question-circle"}${iconStatusClass}"></i>
          <span class="tab-label">${tObj.title}</span>
          <button class="tab-close" data-tab-index="${idx}">✕</button>
        </div>
      `;
    });
  
    // 5) Insert the new tabs into the scroller
    scrollerEl.innerHTML = html;
  
    // 6) Attach click listeners for close buttons, etc.
    this.attachCloseListeners();
  }
  
  attachCloseListeners() {
    const closeBtns = this.tabsRootEl.querySelectorAll(".tab-close");
    closeBtns.forEach(btn => {
      btn.addEventListener("click", evt => {
        evt.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-tab-index"));
        this.closeTab(idx);
      });
    });
    const tabItems = this.tabsRootEl.querySelectorAll(".tab:not(.tab-close)");
    tabItems.forEach(item => {
      item.addEventListener("click", evt => {
        const idx = parseInt(item.getAttribute("data-tab-idx"));
        this.setActiveTab(idx);
      });
    });
  }

  addEventListeners() {
    if (this.tabsRootEl) {
      this.tabsRootEl.addEventListener("click", evt => {
        // Container click handler
      }, true);
    }
  }

  showActiveTabContent() {
    if (!this.mainContentEl) return;
    
    // Check if user is logged in - if not, don't touch mainContent (render() handles it)
    const token = localStorage.getItem("authToken");
    if (!token) {
      return;
    }
    
    this.mainContentEl.innerHTML = "";

    if (this.tabs.length === 0) {
      this.mainContentEl.innerHTML = `
        <div style="padding: 2rem; text-align: center;">
          <h2>No Documents Open</h2>
          <p>Use the <strong>+</strong> button in the tab bar to create a new document.</p>
        </div>
      `;
      return;
    }

    if (this.activeTabIndex < 0 || this.activeTabIndex >= this.tabs.length) {
      return;
    }

    const activeTab = this.tabs[this.activeTabIndex];

    if (activeTab.newFrameworkDoc) {
      this.framework.loadStage(
        activeTab.newFrameworkDoc,
        activeTab.newFrameworkDoc.currentStageIndex || 0,
        this.mainContentEl
      );
      return;
    }
    console.warn("[TabManager] No doc instance => empty content");
  }

  closeTab(idx) {
    if (idx < 0 || idx >= this.tabs.length) return;
    const closingTab = this.tabs[idx];

    if (closingTab.newFrameworkDoc && closingTab.newFrameworkDoc.docTaskInstance && !closingTab.newFrameworkDoc.docTaskInstance.isSaved) {
      this.confirmModal.show({
        title: "Unsaved Changes",
        message: "You have unsaved changes in your document. Save before closing?",
        onYes: async () => {
          try {
            await this.framework.saveDocumentTask(closingTab.newFrameworkDoc);
            closingTab.newFrameworkDoc.docTaskInstance.isSaved = true;
            this._reallyCloseTab(idx);
          } catch (err) {
            console.error("[TabManager] error saving =>", err);
            // do not close
          }
        },
        onNo: () => {
          this._reallyCloseTab(idx);
        }
      });
      return;
    }

    this._reallyCloseTab(idx);
  }

  _reallyCloseTab(idx) {
    const removedTab = this.tabs[idx];
    const doc = removedTab?.newFrameworkDoc;
    console.log("[TabManager] Closing tab:", removedTab?.title || "Untitled");

    // Clean up the tab's data from store before removing
    this._cleanupTabData(removedTab);

    this.tabs.splice(idx, 1);
    if (this.activeTabIndex >= this.tabs.length) {
      this.activeTabIndex = this.tabs.length - 1;
    }
    this.persistTabsImmediate(); // Critical: user closed tab
    this.render();
    this.showActiveTabContent();
  }
  
  /**
   * Clean up tab data to free memory and storage
   * @param {Object} tab - The tab being closed
   */
  _cleanupTabData(tab) {
    try {
      if (tab?.newFrameworkDoc?.docTaskInstance) {
        const docInstance = tab.newFrameworkDoc.docTaskInstance;
        
        // Clear large data structures
        if (docInstance.stageData) {
          // Keep essential data but clear large objects
          Object.keys(docInstance.stageData).forEach(stageId => {
            const stageData = docInstance.stageData[stageId];
            if (stageData && typeof stageData === 'object') {
              // Clear job history for closed tabs (keep only last 5 entries per stage)
              if (stageData.jobHistory) {
                const jobKeys = Object.keys(stageData.jobHistory);
                if (jobKeys.length > 5) {
                  const sortedKeys = jobKeys.sort((a, b) => {
                    const jobA = stageData.jobHistory[a];
                    const jobB = stageData.jobHistory[b];
                    return (jobB.updated || 0) - (jobA.updated || 0);
                  });
                  
                  // Keep only the 5 most recent
                  const keysToKeep = sortedKeys.slice(0, 5);
                  const cleanedJobHistory = {};
                  keysToKeep.forEach(key => {
                    cleanedJobHistory[key] = stageData.jobHistory[key];
                  });
                  stageData.jobHistory = cleanedJobHistory;
                }
              }
            }
          });
        }
        
        // Clear any cached data or large arrays
        if (docInstance.cachedResults) {
          delete docInstance.cachedResults;
        }
      }
      
      console.log(`[TabManager] Cleaned up data for closed tab: ${tab.title}`);
    } catch (error) {
      console.warn('[TabManager] Error cleaning up tab data:', error);
    }
  }

  /**
   * Schedule a debounced persistence to prevent excessive localStorage writes
   */
  persistTabs() {
    this.isDirty = true;
    
    // Clear existing timeout
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
    }
    
    // Schedule debounced persistence
    this.persistTimeout = setTimeout(() => {
      this.performPersistence();
      this.persistTimeout = null;
    }, this.persistDelay);
  }
  
  /**
   * Force immediate persistence (for critical operations)
   */
  persistTabsImmediate() {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
      this.persistTimeout = null;
    }
    this.performPersistence();
  }

  /**
   * We ONLY store docTaskInstance for each doc (not the entire class).
   */
  performPersistence() {
    if (!this.isDirty) return;
    
    const tabData = this.tabs.map(t => {
      const baseTabData = {
        id: t.id,
        title: t.title,
        iconClass: t.iconClass,
        color: t.color,
        docStatus: t.docStatus,
        aggregatedStatus: t.aggregatedStatus,
        isFrameworkDoc: !!(t.newFrameworkDoc && t.newFrameworkDoc.docTaskInstance),
        activeStageId: t.activeStageId || null,
        createdAt: t.createdAt || Date.now(),
        lastAccessed: t.lastAccessed || Date.now()
      };
      
      if (t.newFrameworkDoc && t.newFrameworkDoc.docTaskInstance) {
        return {
          ...baseTabData,
          // Store the docTaskInstance - the store class will handle circular references
          docTaskInstance: t.newFrameworkDoc.docTaskInstance
        };
      } else {
        return baseTabData;
      }
    });

    // Save to store
    this.store.set("openTabs", tabData);
    this.isDirty = false;
  }

  async restoreFromStore() {
    try {
      const saved = this.store.get("openTabs");
      
      const savedCount = saved?.length || 0;
      if (savedCount > 0) {
        console.log(`[TabManager] Restoring ${savedCount} tabs from storage`);
      }
    
    // Clean up old tabs before restoration
    if (saved && Array.isArray(saved)) {
      const maxAgeMs = this.storageLimits.MAX_TAB_AGE_DAYS * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const validTabs = saved.filter(item => {
        const lastAccessed = item.lastAccessed || item.createdAt || 0;
        const age = now - lastAccessed;
        if (age > maxAgeMs) {
          console.log(`[TabManager] Skipping restoration of old tab: ${item.title}`);
          return false;
        }
        return true;
      });
      
      // Limit to maximum allowed tabs
      const tabsToRestore = validTabs.slice(0, this.storageLimits.MAX_TABS);
      if (tabsToRestore.length < validTabs.length) {
        console.log(`[TabManager] Limited restoration to ${this.storageLimits.MAX_TABS} tabs (had ${validTabs.length})`);
      }
      
      // Update the saved array with filtered tabs
      if (tabsToRestore.length !== saved.length) {
        this.store.set("openTabs", tabsToRestore);
      }
      
      // Continue with the limited set
      saved.splice(0, saved.length, ...tabsToRestore);
    }
  
    if (!saved || !Array.isArray(saved) || saved.length === 0) {
      return;
    }
  
    // Create a map to track unique documents by ID+project for deduplication
    const uniqueDocMap = new Map();
    const newTabs = [];
    let duplicateCount = 0;
  
    // First attempt to restore all tabs with deduplication
    for (let i = 0; i < saved.length; i++) {
      const item = saved[i];
      try {
        if (item.isFrameworkDoc && item.docTaskInstance) {
          // Check for duplicates by document ID and project ID
          const docId = item.docTaskInstance.documentId;
          const projectId = item.docTaskInstance.projectId;
          
          if (docId && projectId) {
            const uniqueKey = `${docId}:${projectId}`;
            
            // Skip if we've already processed this document
            if (uniqueDocMap.has(uniqueKey)) {
              duplicateCount++;
              continue;
            }
            
            // Mark this document as processed
            uniqueDocMap.set(uniqueKey, true);
          }
          
          // Restoring document task instance
  
          // Restore the document instance
          const restoredDoc = await this.framework.restoreDocumentTask(item.docTaskInstance);
  
          if (restoredDoc) {
            newTabs.push({
              id: item.id,
              title: item.title || "Untitled Document",
              iconClass: item.iconClass || "fas fa-file",
              color: item.color || "default-color",
              docStatus: item.docStatus,
              aggregatedStatus: item.aggregatedStatus,
              activeStageId: item.activeStageId || null,
              newFrameworkDoc: restoredDoc,
              createdAt: item.createdAt || Date.now(),
              lastAccessed: item.lastAccessed || Date.now()
            });
          } else {
            console.warn(`[TabManager] Failed to restore document for tab ${i}`);
            this.errorModal.show({
              title: "Tab Restoration Error",
              message: `Could not restore the document for tab "${item.title}". The tab will be removed.`
            });
          }
        } else {
          // Non-framework doc tab (rare case)
          newTabs.push({
            id: item.id,
            title: item.title,
            iconClass: item.iconClass,
            color: item.color,
            docStatus: item.docStatus,
            aggregatedStatus: item.aggregatedStatus,
            activeStageId: item.activeStageId || null,
            createdAt: item.createdAt || Date.now(),
            lastAccessed: item.lastAccessed || Date.now()
          });
        }
      } catch (error) {
        console.error(`[TabManager] Error restoring tab ${i}:`, error);
        this.errorModal.show({
          title: "Tab Restoration Error",
          message: `An error occurred while restoring tab "${item.title}". The tab will be removed.`
        });
      }
    }
  
    // Report deduplication results
    if (duplicateCount > 0) {
      console.log(`[TabManager] Removed ${duplicateCount} duplicate tabs during restoration`);
    }
  
    // Update our tabs with the deduplicated list
    this.tabs = newTabs;
    this.activeTabIndex = (this.tabs.length > 0) ? 0 : -1;
    
    console.log(`[TabManager] Successfully restored ${this.tabs.length} tabs`);
  
    // Save the deduplicated tabs back to storage ONLY if we found and removed duplicates
    if (duplicateCount > 0) {
      console.log(`[TabManager] Removed ${duplicateCount} duplicate tabs, saving clean state`);
      this.persistTabs();
    }
    
    // Always render after restoration to ensure UI is updated
    this.render();
    this.showActiveTabContent();
    } catch (error) {
      console.error('[TabManager] Error during tab restoration:', error);
      // Clear problematic tab data and start fresh
      this.store.set("openTabs", []);
      this.tabs = [];
      this.activeTabIndex = -1;
      this.render();
    }
  }
  

  setActiveTab(idx) {
    if (idx < 0 || idx >= this.tabs.length) return;
    this.activeTabIndex = idx;
    
    // Update the access time for the tab being activated
    this.updateTabAccessTime(idx);
    
    this.render();
    this.showActiveTabContent();
  }

  /**
   * Validate tab limits before creating new tabs
   * @throws {TabLimitExceededError} If tab limit would be exceeded
   */
  validateTabLimits() {
    const currentTabCount = this.tabs.length;
    const maxTabs = this.storageLimits.MAX_TABS;
    
    if (currentTabCount >= maxTabs) {
      throw createTabLimitError(currentTabCount, maxTabs);
    }
    
    // Also check storage limits
    try {
      checkStorageLimits();
    } catch (storageError) {
      // Only throw hard storage errors, warnings are handled elsewhere
      if (!storageError.isWarning || !storageError.isWarning()) {
        throw storageError;
      }
    }
  }
  
  /**
   * Clean up old tabs that haven't been accessed recently
   * @returns {number} Number of tabs cleaned up
   */
  cleanupOldTabs() {
    const maxAgeMs = this.storageLimits.MAX_TAB_AGE_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleanedCount = 0;
    
    // Filter out old tabs (working backwards to avoid index issues)
    for (let i = this.tabs.length - 1; i >= 0; i--) {
      const tab = this.tabs[i];
      const lastAccessed = tab.lastAccessed || tab.createdAt || 0;
      const age = now - lastAccessed;
      
      if (age > maxAgeMs) {
        console.log(`[TabManager] Removing old tab: ${tab.title} (age: ${Math.round(age / (24 * 60 * 60 * 1000))} days)`);
        this._reallyCloseTab(i);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[TabManager] Cleaned up ${cleanedCount} old tabs`);
    }
    
    return cleanedCount;
  }
  
  /**
   * Update tab access time
   * @param {number} tabIndex - Index of the tab being accessed
   */
  updateTabAccessTime(tabIndex) {
    if (tabIndex >= 0 && tabIndex < this.tabs.length) {
      this.tabs[tabIndex].lastAccessed = Date.now();
      // Mark as dirty for persistence
      this.isDirty = true;
    }
  }

  /**
   * Creates a tab for an existing document, returns the new tab index
   * @param {Object} docTaskInstance - The document task instance
   * @param {string} iconClass - Optional icon class
   * @returns {number} - The index of the newly created tab
   * @throws {TabLimitExceededError|StorageLimitExceededError} If limits are exceeded
   */
  createDocumentTab(document, iconClass = "fas fa-file-alt") {
    if (!document) return -1;
    
    // Validate limits before creating tab
    this.validateTabLimits();
    
    // 1) Check if we have an existing tab for the same doc with enhanced checks
    const docTaskInstance = document.docTaskInstance;
    
    // Exit early if missing critical identifiers
    if (!docTaskInstance?.documentId || !docTaskInstance?.projectId) {
      console.warn("[TabManager] Document missing ID or project ID, cannot check for duplicates");
      // Continue with tab creation, as this is likely a new unsaved document
    } else {
      // Check for existing tab with the same document
      const existingTabIndex = this.findTabIndexByDocumentIdentifiers(
        docTaskInstance.documentId, 
        docTaskInstance.projectId
      );
      
      if (existingTabIndex >= 0) {
        // Just make that existing tab active
        this.setActiveTab(existingTabIndex);
        return existingTabIndex;
      }
    }
  
    // 2) Otherwise, proceed with creating the new tab
    const now = Date.now();
    const newTab = {
      id: "tab_" + Math.random().toString(36).slice(2),
      title: docTaskInstance?.title || "Untitled",
      iconClass,
      color: "default-color",
      newFrameworkDoc: document,
      createdAt: now,
      lastAccessed: now
    };
  
    this.tabs.push(newTab);
    const newIndex = this.tabs.length - 1;
    this.activeTabIndex = newIndex;
    
    this.persistTabsImmediate(); // Critical: new tab created
    this.render();
    this.showActiveTabContent();
    return newIndex;
  }

  /**
   * Loads a document from the server and creates a tab for it
   * @param {string} documentId - The document ID
   * @param {string} projectId - The project ID (in composite format accountId#projectId)
   * @returns {Promise<number>} - The index of the newly created tab, or -1 if failed
   */
  async loadDocument(documentId, projectId) {
    console.log(`[TabManager] Loading document: ${documentId}`);
  
    if (!documentId || !projectId) {
      console.error("[TabManager] loadDocument() => missing documentId or projectId");
      return -1;
    }
  
    try {
      // Check if document is already open in a tab
      const existingTabIndex = this.findTabIndexByDocumentIdentifiers(documentId, projectId);
      
      if (existingTabIndex >= 0) {
        this.setActiveTab(existingTabIndex);
        return existingTabIndex;
      }
  
      // Validate limits before creating new tab
      this.validateTabLimits();
  
      // Import dynamically if needed
      let getDocument;
      try {
        getDocument = (await import("../../api/documents.js")).getDocument;
      } catch (err) {
        console.error("[TabManager] Error importing getDocument from documents.js:", err);
        throw new Error("Could not load document API module");
      }
  
      // Fetch the document
      const docResult = await getDocument({
        document_id: documentId,
        project_id: projectId
      });
  
      if (!docResult) {
        throw new Error("Failed to load document from server");
      }
  
      // Document fetched successfully
  
      // Convert to docTaskInstance and create document
      const docTaskInstance = this._convertToDocTaskInstance(docResult, projectId);
      const document = this.framework.restoreDocumentTask(docTaskInstance);
  
      if (!document) {
        throw new Error("Failed to create document instance");
      }
  
      // Double-check again for duplicate tabs before creating (extra safety)
      const checkAgain = this.findTabIndexByDocumentIdentifiers(documentId, projectId);
      if (checkAgain >= 0) {
        this.setActiveTab(checkAgain);
        return checkAgain;
      }
  
      // Determine the icon class from the task type
      const taskType = document.docTaskInstance?.taskType;
      let iconClass = "fas fa-file-alt"; // default fallback
      
      if (taskType) {
        const taskDefinition = this.framework.getTaskDefinition(taskType);
        if (taskDefinition && taskDefinition.iconClass) {
          iconClass = taskDefinition.iconClass;
        }
      }

      // Create a tab for the document with the proper icon
      return this.createDocumentTab(document, iconClass);
  
    } catch (error) {
      console.error("[TabManager] Error loading document:", error);
  
      // Show error via ErrorModal if available
      if (this.errorModal) {
        this.errorModal.show({
          title: "Error Loading Document",
          message: error.message || "Failed to load document"
        });
      }
  
      return -1;
    }
  }

  /**
   * Converts a backend document to docTaskInstance format
   * @param {Object} document - The document from the backend
   * @param {string} projectId - The composite project ID
   * @returns {Object} - A document task instance object
   * @private
   */
  _convertToDocTaskInstance(document, projectId) {

    try {
      // First check if document_data is already a complete docTaskInstance
      if (document.document_data) {
        let docTaskInstance;

        // Parse document_data if it's a string
        if (typeof document.document_data === 'string') {
          try {
            docTaskInstance = JSON.parse(document.document_data);
          } catch (e) {
            console.warn("[TabManager] Could not parse document_data as JSON:", e);
          }
        } else {
          docTaskInstance = document.document_data;
        }

        // If we have a valid docTaskInstance with expected properties, use it directly
        if (docTaskInstance && docTaskInstance.taskType && docTaskInstance.stageData) {

          // Ensure core properties are set/updated
          docTaskInstance.documentId = document.document_id;
          docTaskInstance.isSaved = true;
          docTaskInstance.isDirty = false;
          docTaskInstance.lastSavedAt = document.modified_datetime || document.created_datetime;
          
          // Preserve the document status from the backend
          if (document.status) {
            docTaskInstance.status = document.status;
          }

          // Make sure projectId is set correctly (might be different from what's in stored docTaskInstance)
          if (projectId) {
            docTaskInstance.projectId = projectId;
            // Extract account and plain project ID from composite ID
            const [accountId, plainProjectId] = projectId.split('#', 2);
            docTaskInstance.accountId = accountId;
            docTaskInstance.plainProjectId = plainProjectId;
          }

          return docTaskInstance;
        }
      }

      // Convert document to docTaskInstance format

      // Extract the plain project ID from composite ID
      const [accountId, plainProjectId] = projectId.split('#', 2);

      // Parse the document data
      let documentData = {};
      try {
        if (typeof document.document_data === 'string') {
          documentData = JSON.parse(document.document_data);
        } else {
          documentData = document.document_data || {};
        }
      } catch (e) {
        console.warn("[TabManager] Could not parse document_data:", e);
      }

      // Parse job history if available
      let jobHistory = {};
      try {
        if (document.job_history_summary && typeof document.job_history_summary === 'string') {
          jobHistory = JSON.parse(document.job_history_summary);
        } else if (document.job_history_summary) {
          jobHistory = document.job_history_summary;
        }
      } catch (e) {
        console.warn("[TabManager] Could not parse job_history_summary:", e);
      }

      // Get task definition from framework
      const taskType = document.task_type || "single_question_new_framework";
      const taskDefinition = this.framework.getTaskDefinition(taskType);

      if (!taskDefinition) {
        console.error(`[TabManager] No task definition found for type: ${taskType}`);
        throw new Error(`Unknown document type: ${taskType}`);
      }

      // Creating docTaskInstance

      // Initialize stage data with proper structure
      const stageData = {};

      // Add any other document-specific data
      Object.keys(documentData).forEach(key => {
        if (key !== 'analysisLM') {
          // Check if key matches a stageId
          const matchingStage = taskDefinition.stages?.find(s => s.stageId === key);
          if (matchingStage) {
            stageData[key] = documentData[key];
          } else if (!stageData[key]) {
            // For any non-stage data, store at top level
            stageData[key] = documentData[key];
          }
        }
      });

      // Process job history and integrate into stageData
      if (jobHistory && Object.keys(jobHistory).length > 0) {

        // For each stage that has job history entries
        Object.entries(jobHistory).forEach(([stageId, stageJobs]) => {
          // Make sure the stage data container exists
          if (!stageData[stageId]) {
            stageData[stageId] = {};
          }

          // Create jobHistory container for the stage
          if (!stageData[stageId].jobHistory) {
            stageData[stageId].jobHistory = {};
          }

          // Process each job in the stage
          Object.entries(stageJobs).forEach(([jobId, jobInfo]) => {
            // Create a key using the root_ prefix
            const jobKey = `root_${jobId}`;

            // Convert the job info format
            stageData[stageId].jobHistory[jobKey] = {
              jobId: jobId,
              jobType: jobInfo.jobType || "docchain",
              status: jobInfo.status || "UNKNOWN",
              progress: jobInfo.progress || 0,
              created: jobInfo.metadata?.created_datetime || jobInfo.timestamp,
              updated: jobInfo.timestamp,
              process_def_id: jobInfo.metadata?.process_def_id,
              metadata: jobInfo.metadata || {}
            };

            // Job converted to new format
          });
        });
      }


      // Create a docTaskInstance object
      return {
        taskType,
        projectId,         // Composite project ID
        accountId,         // Account ID component
        plainProjectId,    // Project ID component 
        projectName: document.project_name || plainProjectId,
        ownerUsername: document.owner_username || "guest",
        documentId: document.document_id,
        title: document.name || document.title || `${taskDefinition.displayLabel} - ${plainProjectId}`,
        status: document.status || "NEW",
        createdAt: document.created_datetime,
        lastSavedAt: document.modified_datetime || document.created_datetime,
        isSaved: true,     // Document from server is considered saved
        isDirty: false,    // Not dirty initially
        stages: taskDefinition.stages?.map(stage => {
          // Look for stage status in job history
          let stageStatus = "NOT_STARTED";

          // First check job history
          if (jobHistory && jobHistory[stage.stageId]) {
            const stageJobs = jobHistory[stage.stageId];
            // If there are any completed jobs for this stage, mark it completed
            if (Object.values(stageJobs).some(job => job.status === "COMPLETED")) {
              stageStatus = "COMPLETED";
            }
          }

          // Also check stageData for status
          if (stageData[stage.stageId]?.status === "COMPLETED") {
            stageStatus = "COMPLETED";
          }

          return { ...stage, status: stageStatus };
        }) || [],
        currentStageIndex: 0,
        stageData,
        jobReferences: {},
        compositeId: projectId
      };
    } catch (error) {
      console.error("[TabManager] Error converting document to docTaskInstance:", error);
      throw error;
    }
  }

  /**
   * Finds tab index by document identifiers to prevent duplicates
   * @param {string} documentId - The document ID
   * @param {string} projectId - The project ID
   * @returns {number} - The index of the tab if found, -1 otherwise
   */
  findTabIndexByDocumentIdentifiers(documentId, projectId) {
    if (!documentId || !projectId) return -1;
    return this.tabs.findIndex(t => {
      const doc = t.newFrameworkDoc?.docTaskInstance;
      if (!doc) return false;
      return (
        doc.documentId === documentId &&
        doc.projectId === projectId
      );
    });
  }

  /**
   * Enhanced method to check if a document is already in tabs by IDs
   * @param {string} documentId - The document ID
   * @param {string} projectId - The project ID (composite format)
   * @param {string} [accountId] - Optional account ID for additional verification
   * @returns {boolean} - True if document exists in tabs, false otherwise
   */
  isDocumentInTabs(documentId, projectId, accountId = null) {
    // Skip check if we don't have document ID or project ID
    if (!documentId || !projectId) return false;
    
    // Check each tab for matching document
    return this.tabs.some(tab => {
      const docInstance = tab.newFrameworkDoc?.docTaskInstance;
      if (!docInstance) return false;
      
      // Match on document ID and project ID
      const isMatchingDoc = docInstance.documentId === documentId;
      const isMatchingProject = docInstance.projectId === projectId;
      
      // If account ID provided, check that too for extra verification
      const isMatchingAccount = !accountId || docInstance.accountId === accountId;
      
      return isMatchingDoc && isMatchingProject && isMatchingAccount;
    });
  }

  /**
   * Get the currently active tab
   * @returns {Object|null} - The active tab object or null if no active tab
   */
  getActiveTab() {
    if (this.activeTabIndex >= 0 && this.activeTabIndex < this.tabs.length) {
      return this.tabs[this.activeTabIndex];
    }
    return null;
  }
}