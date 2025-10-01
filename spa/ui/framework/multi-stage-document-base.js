// ui/framework/multi-stage-document-base.js
import { AutoSaveManager, sanitizeDocTaskInstanceForStorageAsync } from "../../utils/auto-save-manager.js";
import formatHumanReadableDate from "../../utils/date-utils.js";
import { Tooltip } from "../framework/tooltip.js";
import { DocumentBase } from "../views/document.js";
import { DOC_TASK_TYPE_DEFINITIONS } from "./document-task-type-definitions.js";


/**
 * MultiStageDocumentBase
 * 
 * Centralizes:
 *  - Title, status, timestamps
 *  - Save logic (dirty, isSaved)
 *  - docTaskInstance for multi-stage workflows
 *  - NO DOM references or jobController references inside docTaskInstance
 */
export class MultiStageDocumentBase extends DocumentBase {
  constructor(docTaskInstance, jobController) {
    super();
    // The data object only => no UI references
    this.docTaskInstance = docTaskInstance || {
      status: "NEW",
      createdAt: new Date().toISOString(),
      lastSavedAt: null,
      isSaved: false,
      isDirty: true,
      stageData: {}
    };

    // We store the jobController on "this", not in docTaskInstance
    this.jobController = jobController || null;

    this.tooltipInstance = new Tooltip();

    // Store UI references on the class instance (not docTaskInstance):
    this.headerEl = null;
    this.footerEl = null;
    this.saveStatusEl = null; // Replace saveBtnEl with status indicator
    this.customActionBtnEl = null;
    this.inputFields = []; // For lock/unlock

    // Initialize auto-save manager
    this.autoSaveManager = new AutoSaveManager(
      this.docTaskInstance,
      () => sanitizeDocTaskInstanceForStorageAsync(this.docTaskInstance)
    );

    // Set up auto-save status listener
    this.autoSaveManager.onStatusChange((status, details) => {
      this.updateSaveStatusUI(status, details);
    });

    // Auto-save only truly new documents that have content and have never been saved
    if (this.docTaskInstance.isDirty &&
      !this.docTaskInstance.documentId &&
      !this.docTaskInstance.lastSavedAt &&
      this._hasActualContent()) {
      setTimeout(() => {
        this.autoSaveManager.triggerAutoSave();
      }, 1000); // Give UI time to initialize
    } else if (!this.docTaskInstance.documentId && !this.docTaskInstance.lastSavedAt) {
    }

    // If we want an internal save hook, we do it here (now triggers auto-save)
    if (typeof this.docTaskInstance.__internalSaveHook !== "function") {
      this.docTaskInstance.__internalSaveHook = this.triggerAutoSave.bind(this);
    }
  }

  renderContent() {
    if (!this.domContainer) return;

    // First check if we already have footer elements and remove them to prevent duplicates
    const existingFooters = this.domContainer.querySelectorAll(".doc-footer");
    if (existingFooters.length > 0) {
      existingFooters.forEach(footer => footer.remove());
    }

    // Clear the footerEl reference to ensure we create a fresh one
    this.footerEl = null;

    // If there are no children at all, completely clear the container
    // Otherwise, preserve the header and only clear content area
    if (this.domContainer.children.length === 0) {
      // Clear existing DOM if empty
      this.domContainer.innerHTML = "";

      // Render header
      this.renderHeader();
    } else {
      // If we already have header, keep it and remove any other content
      const headerEl = this.domContainer.querySelector(".doc-header");
      const breadcrumbEl = this.domContainer.querySelector(".doc-stage-breadcrumb");

      if (headerEl && breadcrumbEl) {
        // Keep header and breadcrumb, remove everything else
        const elementsToRemove = [];
        for (let i = 0; i < this.domContainer.children.length; i++) {
          const child = this.domContainer.children[i];
          if (child !== headerEl && child !== breadcrumbEl) {
            elementsToRemove.push(child);
          }
        }
        elementsToRemove.forEach(el => el.remove());
      }
    }

    // Create a specific container for main content if it doesn't exist
    let mainContentEl = this.domContainer.querySelector(".doc-main-content");
    if (!mainContentEl) {
      mainContentEl = document.createElement("div");
      mainContentEl.className = "doc-main-content";
      this.domContainer.appendChild(mainContentEl);
    }

    // Store reference to main content container
    this.mainContentEl = mainContentEl;

    // Render main content (subclass override or default implementation)
    this.renderMainContent();

    // Render footer - guarantee that we only have one
    this.renderFooter();

  }

  /**
   * Render the document header with status dropdown
   */
  renderHeader() {
    // Use standardized date format for consistency
    const createdDate = this.docTaskInstance.createdAt
      ? formatHumanReadableDate(this.docTaskInstance.createdAt)
      : "";
    const lastSavedDate = this.docTaskInstance.lastSavedAt
      ? formatHumanReadableDate(this.docTaskInstance.lastSavedAt)
      : "Never";

    // Status options remain the same
    const statusOptions = [
      { value: "NEW", label: "New" },
      { value: "IN_PROGRESS", label: "In Progress" },
      { value: "READY", label: "Ready" },
      { value: "SUBMITTED", label: "Submitted" },
      { value: "CANCELLED", label: "Cancelled" }
    ];

    // Only set default status for truly new documents (no documentId)
    if (!this.docTaskInstance.documentId && !this.docTaskInstance.status) {
      this.docTaskInstance.status = "NEW";
    }

    // Validate status is one of the allowed values
    if (!statusOptions.find(opt => opt.value === this.docTaskInstance.status)) {
      this.docTaskInstance.status = "NEW";
    }

    const currentStatus = statusOptions.find(opt => opt.value === this.docTaskInstance.status) || statusOptions[0];
    const statusClass = `status--${currentStatus.value.toLowerCase()}`;

    // Compact header HTML with info icon for metadata
    const headerHtml = `
    <div class="doc-header doc-header--compact">
      <div class="doc-title-container">
        <h2 class="doc-title doc-title--compact">
          ${this.docTaskInstance.title || "(Untitled)"}
          <i class="fas fa-edit edit-title-icon" title="Edit title" aria-label="Edit document title"></i>
        </h2>
        <i class="fas fa-info-circle doc-info-icon" id="doc-info-tooltip" aria-label="Show document details"></i>
      </div>
      <div class="doc-status-container">
        <div class="status-dropdown-wrapper">
          <div class="status ${statusClass}" id="selected-status" aria-haspopup="listbox" aria-expanded="false" aria-label="Document status">
            <span id="docStatus">${currentStatus.label}</span>
            <i class="fas fa-caret-down" aria-hidden="true"></i>
          </div>
          <div class="status-dropdown-options" id="status-dropdown-options" role="listbox">
            ${statusOptions.map(option => `
              <div class="status-option ${option.value === currentStatus.value ? 'selected' : ''}" 
                   data-value="${option.value}" 
                   role="option" 
                   aria-selected="${option.value === currentStatus.value ? 'true' : 'false'}">
                ${option.label}
              </div>
            `).join('')}
          </div>
        </div>
        <div id="saveStatusIndicator" class="save-status-indicator" 
          aria-label="Document save status"
          title="Document save status">
          <i class="fas fa-circle save-status-icon" aria-hidden="true"></i>
          <span class="save-status-text">Ready</span>
        </div>
      </div>
    </div>
  `;

    this.domContainer.insertAdjacentHTML("beforeend", headerHtml);
    this.headerEl = this.domContainer.querySelector(".doc-header");

    // Setup save status indicator reference
    this.saveStatusEl = this.domContainer.querySelector("#saveStatusIndicator");

    // Initialize status indicator
    if (this.saveStatusEl) {
      // Set initial status based on current auto-save manager status
      const currentStatus = this.autoSaveManager.currentStatus;
      this.updateSaveStatusUI(currentStatus, this.autoSaveManager.getStatusDetails());
    }

    // Setup tooltips with document metadata
    this.setupDocumentTooltips(createdDate, lastSavedDate);

    // "Edit Title" icon
    const editIcon = this.domContainer.querySelector(".edit-title-icon");
    if (editIcon) {
      editIcon.addEventListener("click", () => {
        this.promptForTitle("Enter a name for the document", this.docTaskInstance.title || "(Untitled)");
      });
    }

    // Set up status dropdown behavior (existing code remains the same)
    const statusDropdownWrapper = this.domContainer.querySelector(".status-dropdown-wrapper");
    const selectedStatus = this.domContainer.querySelector("#selected-status");
    const dropdownOptions = this.domContainer.querySelector("#status-dropdown-options");

    if (selectedStatus && dropdownOptions) {
      // ... existing status dropdown code remains unchanged ...
      selectedStatus.addEventListener("click", (e) => {
        e.stopPropagation();
        const isExpanded = statusDropdownWrapper.classList.toggle("open");
        selectedStatus.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      });

      document.addEventListener("click", () => {
        statusDropdownWrapper.classList.remove("open");
        selectedStatus.setAttribute("aria-expanded", "false");
      });

      dropdownOptions.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      const statusOptionsElements = dropdownOptions.querySelectorAll(".status-option");
      statusOptionsElements.forEach(option => {
        option.addEventListener("click", () => {
          const newStatus = option.getAttribute("data-value");
          const newLabel = option.textContent.trim();

          const docStatusEl = selectedStatus.querySelector("#docStatus");
          if (docStatusEl) {
            docStatusEl.textContent = newLabel;
          }

          statusOptionsElements.forEach(opt => {
            opt.setAttribute("aria-selected", "false");
          });
          option.setAttribute("aria-selected", "true");

          selectedStatus.className = 'status';
          selectedStatus.classList.add(`status--${newStatus.toLowerCase()}`);

          statusOptionsElements.forEach(opt => opt.classList.remove("selected"));
          option.classList.add("selected");

          this.docTaskInstance.status = newStatus;
          this.docTaskInstance.isDirty = true;
          this.triggerAutoSave();

          statusDropdownWrapper.classList.remove("open");
          selectedStatus.setAttribute("aria-expanded", "false");

        });
      });
    }
  }


  renderMainContent() {
    // Subclasses should override this
    if (this.mainContentEl) {
      const placeholder = document.createElement("div");
      placeholder.innerHTML = `<p style="color:#ccc;">No main content. Subclasses should override renderMainContent().</p>`;
      this.mainContentEl.appendChild(placeholder);
    }
  }

  renderFooter() {
    // Remove any existing footer first (extra safety check)
    const existingFooters = this.domContainer.querySelectorAll(".doc-footer");
    existingFooters.forEach(footer => footer.remove());

    const footer = document.createElement("div");
    footer.className = "doc-footer";

    footer.innerHTML = `
      <div class="button-group">
        <button id="customActionBtn" class="btn btn--primary" style="display:none;">
          Custom Action
        </button>
      </div>
    `;
    this.domContainer.appendChild(footer);
    this.footerEl = footer;

    this.customActionBtnEl = footer.querySelector("#customActionBtn");
  }

  // Add this new method for setting up tooltips:
  setupDocumentTooltips(createdDate, lastSavedDate) {
    // Get task description from definitions
    const taskDescription = this.getTaskDescription();

    // Define enhanced tooltip content with task description
    const tooltipHtml = `
        <div style="width: 320px; line-height: 1.6; padding: 2px 0;">
            ${taskDescription ? `
                <div>
                    <strong>Task Type:</strong> ${taskDescription}
                </div>
            ` : ''}
            
            <div style="font-size: 12px; color: #e0e0e0; ${taskDescription ? 'border-top: 1px solid rgba(255, 255, 255, 0.2); padding-top: 8px; margin-top: 4px;' : ''}">
                <div style="margin-bottom: 4px;"><strong>Created:</strong> ${createdDate || 'Unknown'}</div>
                <div style="margin-bottom: 4px;"><strong>Last Saved:</strong> ${lastSavedDate || 'Never'}</div>
                <div style="margin-bottom: 4px;"><strong>Document ID:</strong></div>
                <div style="margin-bottom: 4px; margin-left: 8px; font-family: monospace; font-size: 11px; word-break: break-all;">${this.docTaskInstance.documentId || 'Not saved'}</div>
                <div><strong>Status:</strong> ${this.docTaskInstance.status || 'NEW'}</div>
            </div>
        </div>
    `;

    // Attach tooltip to the info icon with retry logic
    this._attachTooltipWithRetry("#doc-info-tooltip", tooltipHtml, 3);
  }

  getTaskDescription() {
    if (!this.docTaskInstance.taskType) {
      return null;
    }

    try {
      // Find the matching task definition
      const taskDef = DOC_TASK_TYPE_DEFINITIONS.find(
        def => def.taskType === this.docTaskInstance.taskType
      );

      if (taskDef) {
        // Return both display label and description if available
        let description = taskDef.displayLabel || taskDef.taskType;
        if (taskDef.description && taskDef.description !== taskDef.displayLabel) {
          description += ` - ${taskDef.description}`;
        }
        return description;
      }

      // Fallback to task type if no definition found
      return this.docTaskInstance.taskType.replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

    } catch (err) {
      console.warn("[MultiStageDocumentBase] Error getting task description:", err);
      return this.docTaskInstance.taskType || null;
    }
  }

  // Add retry logic for tooltip attachment
  _attachTooltipWithRetry(selector, tooltipHtml, maxRetries = 3, currentRetry = 0) {
    setTimeout(() => {
      const element = this.domContainer?.querySelector(selector) || document.querySelector(selector);

      if (element) {
        this._attachTooltipBySelector(selector, tooltipHtml);
      } else if (currentRetry < maxRetries) {
        this._attachTooltipWithRetry(selector, tooltipHtml, maxRetries, currentRetry + 1);
      } else {
        console.warn(`[MultiStageDocumentBase] Failed to attach tooltip to ${selector} after ${maxRetries} attempts`);
      }
    }, 100 * (currentRetry + 1)); // Increasing delay for each retry
  }

  // Add this helper method for tooltip attachment:
  _attachTooltipBySelector(selector, tooltipHtml) {

    let element = this.domContainer?.querySelector(selector);

    if (!element) {
      element = document.querySelector(selector);
    }

    if (element) {

      if (!element.classList.contains('tooltip-icon') && !element.classList.contains('info-icon')) {
        element.classList.add('tooltip-icon');
      }

      try {
        // Attach tooltip with HTML content
        this.tooltipInstance.attach(element, tooltipHtml);
      } catch (error) {
        console.error(`[MultiStageDocumentBase] Error attaching tooltip to ${selector}:`, error);
      }
    } else {
      console.warn(`[MultiStageDocumentBase] Element ${selector} not found for tooltip`);
    }
  }

  showCustomActionButton(label, onClickHandler) {
    if (!this.customActionBtnEl) return;
    this.customActionBtnEl.style.display = "inline-block";
    this.customActionBtnEl.textContent = label;
    this.customActionBtnEl.onclick = () => {
      if (typeof onClickHandler === "function") onClickHandler();
    };
  }

  /**
   * Update the docTaskInstance.title, set isDirty, and update the UI.
   */
  updateTitle(newTitle) {
    this.docTaskInstance.title = newTitle;
    this.docTaskInstance.isDirty = true;
    this.triggerAutoSave();

    // Update the DOM
    if (this.domContainer) {
      const titleEl = this.domContainer.querySelector(".doc-title");
      if (titleEl) {
        titleEl.innerHTML = `${newTitle} <i class="fas fa-edit edit-title-icon" title="Edit title"></i>`;
        // Rewire the click
        const editIcon = titleEl.querySelector(".edit-title-icon");
        if (editIcon) {
          editIcon.addEventListener("click", () => {
            this.promptForTitle("Enter a name for the document", this.docTaskInstance.title);
          });
        }
      }
    }

    // Also update the open Tab's title
    this._updateTabTitleInTabManager(newTitle);
  }

  /**
   * Let the TabManager know the doc's title changed, so it can re-render the tab label, etc.
   */
  _updateTabTitleInTabManager(newTitle) {
    if (window.tabManager) {
      // find the tab whose .newFrameworkDoc is THIS instance
      const foundTab = window.tabManager.tabs.find(t => t.newFrameworkDoc === this);
      if (foundTab) {
        foundTab.title = newTitle;
        // Also update the docTaskInstance in that tab if we want
        if (foundTab.newFrameworkDoc && foundTab.newFrameworkDoc.docTaskInstance) {
          foundTab.newFrameworkDoc.docTaskInstance.title = newTitle;
        }
        // Re-render tab bar & persist
        window.tabManager.render();
        window.tabManager.persistTabs();
      }
    }
  }

  lockWhileSaving(shouldLock) {
    if (shouldLock) {
      if (this.customActionBtnEl) this.customActionBtnEl.disabled = true;
      this.lockInputFields();
    } else {
      this.unlockInputFields();
      if (this.customActionBtnEl) this.customActionBtnEl.disabled = false;
      // Note: No save button to enable/disable anymore
    }
  }

  lockInputFields() {
    this.inputFields.forEach(el => {
      if (el) el.disabled = true;
    });
  }
  unlockInputFields() {
    this.inputFields.forEach(el => {
      if (el) el.disabled = false;
    });
  }



  /**
   * Legacy save document method - now delegates to auto-save manager
   * This maintains compatibility with existing code that calls handleSaveDocument
   */
  async handleSaveDocument() {

    // Delegate to auto-save manager for immediate save
    if (this.autoSaveManager) {
      const success = await this.autoSaveManager.forceSave();

      // Notify any active form generators about the save
      if (success) {
        this._notifyDocumentSaved();
      }

      return success;
    }

    console.warn("[MultiStageDocumentBase] Auto-save manager not available");
    return false;
  }

  /**
   * Creates a sanitized copy of the docTaskInstance for storage
   * @returns {object} A clean version of docTaskInstance suitable for storage
   * @private
   */
  _sanitizeDocTaskInstanceForStorage() {
    // Delegate to utility function (async version for performance)
    return sanitizeDocTaskInstanceForStorageAsync(this.docTaskInstance);
  }

  /**
   * Notify any form generators that the document has been saved
   * @private
   */
  _notifyDocumentSaved() {
    // If we have a current stage with an active form generator, notify it
    if (
      this.docTaskInstance.currentStageIndex !== undefined &&
      this.docTaskInstance.stages &&
      this.docTaskInstance.stages.length > this.docTaskInstance.currentStageIndex
    ) {
      // Path 1: see if current stage form has formGenerator
      let formGenerator = null;
      const currentStage = this.docTaskInstance.stages[this.docTaskInstance.currentStageIndex];
      if (currentStage && currentStage.formInstance && currentStage.formInstance.formGenerator) {
        formGenerator = currentStage.formInstance.formGenerator;
      }

      // Path 2: see if the doc parent has an analysisLMFramework with formGenerator
      if (!formGenerator && this.docTaskInstance.__parent) {
        if (this.docTaskInstance.__parent.analysisLMFramework?.formGenerator) {
          formGenerator = this.docTaskInstance.__parent.analysisLMFramework.formGenerator;
        }
      }

      // If found, notify it
      if (formGenerator && typeof formGenerator.handleDocumentSaved === 'function') {
        formGenerator.handleDocumentSaved();
      }
    }

    // Also update any globally visible "Run Analysis" buttons
    const runButtons = document.querySelectorAll('#run-analysis-btn');
    if (runButtons.length > 0) {
      runButtons.forEach(btn => {
        if (
          btn.disabled &&
          btn.closest('.disabled-reason')?.textContent?.includes('Save document')
        ) {
          btn.disabled = false;
          const reasonEl = btn.closest('form').querySelector('.disabled-reason');
          if (reasonEl) {
            reasonEl.style.display = 'none';
          }
        }
      });
    }
  }

  /**
   * Optionally set doc status (RUNNING, COMPLETED, etc.)
   */
  setDocStatus(newStatus) {
    if (this.docTaskInstance) {
      this.docTaskInstance.status = newStatus;
      this.docTaskInstance.isDirty = true;
      this.triggerAutoSave();
    }
    const docStatusEl = this.domContainer?.querySelector("#docStatus");
    if (docStatusEl) {
      docStatusEl.textContent = newStatus;
    }
  }

  /**
   * _rebuildIdsAfterSave()
   * Called right after we successfully create a new document ID.
   * This ensures that if we had placeholder IDs (like "unsavedDoc"),
   * we re-render the doc so that stage/breadcrumb IDs incorporate
   * the new doc ID.
   * 
   * If your multi-stage orchestrator has special ID references,
   * they will be re-initialized here.
   */
  _rebuildIdsAfterSave() {
    // A simple approach is to call renderContent() again:
    this.renderContent();
  }

  /**
   * Trigger auto-save when docTaskInstance is modified
   * This should be called whenever any field in docTaskInstance changes
   */
  triggerAutoSave() {
    if (this.autoSaveManager) {
      // For truly new documents, only trigger auto-save if there's actual content
      if (!this.docTaskInstance.documentId && !this.docTaskInstance.lastSavedAt) {
        if (this._hasActualContent()) {
          this.autoSaveManager.triggerAutoSave();
        } else {
        }
      } else {
        // For existing documents, always trigger auto-save
        this.autoSaveManager.triggerAutoSave();
      }
    }
  }

  /**
   * Force immediate save (for special cases)
   * @returns {Promise<boolean>} Success status
   */
  async forceSave() {
    if (this.autoSaveManager) {
      return this.autoSaveManager.forceSave();
    }
    return false;
  }

  /**
   * Update the save status UI based on auto-save manager status
   * @param {string} status - Current save status
   * @param {Object} details - Additional status details
   */
  updateSaveStatusUI(status, details) {
    if (!this.saveStatusEl) return;

    const iconEl = this.saveStatusEl.querySelector('.save-status-icon');
    const textEl = this.saveStatusEl.querySelector('.save-status-text');

    if (!iconEl || !textEl) return;

    // Remove existing status classes
    iconEl.className = 'fas save-status-icon';
    this.saveStatusEl.className = 'save-status-indicator';

    // Update based on status
    switch (status) {
      case 'saving':
        iconEl.classList.add('fa-spinner', 'fa-spin');
        this.saveStatusEl.classList.add('save-status--saving');
        textEl.textContent = 'Saving...';
        break;

      case 'pending':
        iconEl.classList.add('fa-clock');
        this.saveStatusEl.classList.add('save-status--pending');
        textEl.textContent = 'Pending...';
        break;

      case 'saved':
        iconEl.classList.add('fa-check-circle');
        this.saveStatusEl.classList.add('save-status--saved');
        textEl.textContent = this.autoSaveManager.getStatusMessage();
        break;

      case 'error':
        iconEl.classList.add('fa-exclamation-triangle');
        this.saveStatusEl.classList.add('save-status--error');
        textEl.textContent = 'Save failed';
        break;

      case 'doc-items-saved':
        iconEl.classList.add('fa-check-circle');
        this.saveStatusEl.classList.add('save-status--doc-items-saved');
        textEl.textContent = this.autoSaveManager.getStatusMessage();
        break;

      case 'doc-items-error':
        iconEl.classList.add('fa-exclamation-triangle');
        this.saveStatusEl.classList.add('save-status--doc-items-error');
        textEl.textContent = 'Grid save failed';
        break;

      default:
        iconEl.classList.add('fa-circle');
        this.saveStatusEl.classList.add('save-status--idle');
        textEl.textContent = 'Ready';
    }

    // Update tooltip with comprehensive information
    this.updateSaveStatusTooltip(details);
  }

  /**
   * Update the save status tooltip with detailed information
   * @param {Object} details - Status details from AutoSaveManager
   */
  updateSaveStatusTooltip(details) {
    if (!this.saveStatusEl || !details) return;

    let tooltipContent = `<div style="max-width: 300px; line-height: 1.6;">`;

    // Status information
    tooltipContent += `<div style="font-weight: bold; margin-bottom: 8px; color: #fff;">Document Status</div>`;

    // Last saved information
    if (details.lastSaved) {
      const saveTime = new Date(details.lastSaved);
      tooltipContent += `<div style="margin-bottom: 4px;"><strong>Last saved:</strong> ${saveTime.toLocaleString()}</div>`;
    } else if (details.isNew) {
      tooltipContent += `<div style="margin-bottom: 4px;"><strong>Status:</strong> New document (will auto-save)</div>`;
    }

    // Current status
    tooltipContent += `<div style="margin-bottom: 4px;"><strong>Current status:</strong> ${this.autoSaveManager.getStatusMessage()}</div>`;

    // DocumentItems save information if available
    if (details.lastDocumentItemsSave) {
      const itemsSaveTime = new Date(details.lastDocumentItemsSave);
      tooltipContent += `<div style="margin-bottom: 4px;"><strong>Last grid save:</strong> ${itemsSaveTime.toLocaleString()}</div>`;
      if (details.documentItemsSaveCount > 0) {
        tooltipContent += `<div style="margin-bottom: 4px;"><strong>Grid saves:</strong> ${details.documentItemsSaveCount}</div>`;
      }
    }

    // Document items information (for reassurance)
    tooltipContent += `<div style="font-size: 12px; color: #ccc; border-top: 1px solid rgba(255, 255, 255, 0.2); padding-top: 6px; margin-top: 8px;">`;
    tooltipContent += `<div>📋 Grid changes save automatically</div>`;
    tooltipContent += `<div>📄 Form changes auto-save after 5 seconds</div>`;
    if (details.hasError) {
      tooltipContent += `<div style="color: #ff6b6b;">⚠️ Auto-save failed - data preserved locally</div>`;
    }
    tooltipContent += `</div></div>`;

    // Update tooltip
    this.saveStatusEl.setAttribute('title', ''); // Clear simple title

    // Use tooltip system if available
    if (this.tooltipInstance) {
      this.tooltipInstance.attach(this.saveStatusEl, tooltipContent);
    } else {
      // Fallback to simple title
      this.saveStatusEl.setAttribute('title', this.autoSaveManager.getStatusMessage());
    }
  }

  /**
   * Override setDocStatus to trigger auto-save
   */
  setDocStatus(newStatus) {
    if (this.docTaskInstance) {
      this.docTaskInstance.status = newStatus;
      this.docTaskInstance.isDirty = true;
      this.triggerAutoSave(); // Replace enableSaveButton with triggerAutoSave
    }
    const docStatusEl = this.domContainer?.querySelector("#docStatus");
    if (docStatusEl) {
      docStatusEl.textContent = newStatus;
    }
  }

  /**
   * Override updateTitle to trigger auto-save
   */
  updateTitle(newTitle) {
    this.docTaskInstance.title = newTitle;
    this.docTaskInstance.isDirty = true;
    this.triggerAutoSave(); // Replace enableSaveButton with triggerAutoSave

    // Update the DOM
    if (this.domContainer) {
      const titleEl = this.domContainer.querySelector(".doc-title");
      if (titleEl) {
        titleEl.innerHTML = `${newTitle} <i class="fas fa-edit edit-title-icon" title="Edit title"></i>`;
        // Rewire the click
        const editIcon = titleEl.querySelector(".edit-title-icon");
        if (editIcon) {
          editIcon.addEventListener("click", () => {
            this.promptForTitle("Enter a name for the document", this.docTaskInstance.title);
          });
        }
      }
    }

    // Also update the open Tab's title
    this._updateTabTitleInTabManager(newTitle);
  }

  /**
   * Check if the document has actual content worth saving
   * @returns {boolean}
   * @private
   */
  _hasActualContent() {
    try {
      // Check if there's meaningful content in stageData
      if (this.docTaskInstance.stageData) {
        for (const [stageId, stageData] of Object.entries(this.docTaskInstance.stageData)) {
          // Check for external inputs (user-entered data)
          if (stageData.external_inputs && Object.keys(stageData.external_inputs).length > 0) {
            const hasNonEmptyInputs = Object.values(stageData.external_inputs).some(value =>
              value && typeof value === 'string' && value.trim().length > 0
            );
            if (hasNonEmptyInputs) {
              return true;
            }
          }

          // Check for uploaded files
          if (stageData.uploadedFiles && Object.keys(stageData.uploadedFiles).length > 0) {
            return true;
          }

          // Check for results (but not just empty objects)
          if (stageData.results && typeof stageData.results === 'object' && Object.keys(stageData.results).length > 0) {
            return true;
          }
        }
      }

      // Check if document has a meaningful title (not auto-generated)
      if (this.docTaskInstance.title &&
        this.docTaskInstance.title.trim() &&
        !this.docTaskInstance.title.includes('undefined') &&
        !this.docTaskInstance.title.match(/^(Document|RFP|Security) - .+ - \w+$/)) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('[MultiStageDocumentBase] Error checking content:', error);
      return false;
    }
  }

  /**
   * Clean up auto-save manager when document is destroyed
   */
  destroy() {
    if (this.autoSaveManager) {
      this.autoSaveManager.destroy();
    }
    super.destroy?.();
  }
}
