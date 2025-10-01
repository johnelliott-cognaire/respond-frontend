// File: ui/framework/multi-stage-document-with-breadcrumb.js
import { makeSafeId } from "../../utils/dom-utils.js";
import { JOB_STATUS } from "../../utils/job-status-utils.js";
import { MultiStageDocumentBase } from "./multi-stage-document-base.js";

/**
 * MultiStageDocumentWithBreadcrumbOrchestrator
 * 
 * Dynamically loads each stage form from the "stages" array in DOC_TASK_TYPE_DEFINITIONS,
 * with a simple breadcrumb UI so the user can skip around stages.
 *
 * Extended to query the JobController for doc-level job statuses,
 * plus gather item-level statuses from stageData (if present).
 * Then we set the doc-level color accordingly for the tab, etc.
 */
export class MultiStageDocumentWithBreadcrumbOrchestrator extends MultiStageDocumentBase {
  constructor(docTaskInstance, jobController, taskDefinition) {
    super(docTaskInstance, jobController);
    this.taskDefinition = taskDefinition; // e.g. the object from DOC_TASK_TYPE_DEFINITIONS
    // We keep references for jobController as well
  }

  /**
   * Overriding the entire "renderContent()" from MultiStageDocumentBase,
   * so we can insert our breadcrumb in between the header and the stage form.
   */
  async renderContent() {
    // 1) Clear container
    if (!this.domContainer) return;
    this.domContainer.innerHTML = "";

    // 2) Render the standard header
    this.renderHeader();

    // 3) Render the breadcrumb UI (the stage links)
    this.renderBreadcrumbNavigation();

    // 3.5) NEW: Initialize breadcrumbs to correct status
    // This helps ensure we don't have leftover status classes
    this.cleanupStageBreadcrumbs();

    // 4) Render the "main" stage form area
    await this.renderStageForm();

    // 5) Render the standard footer
    this.renderFooter();

    // 6) After rendering, refresh doc-level aggregated status 
    // This will update tab color but not modify breadcrumb status
    this.refreshDocUIIndicatorsAggregateStatus();
  }

  /**
   * Renders a row of clickable stage links so the user can jump
   * to any stage. For advanced usage, you might disable future stages
   * if earlier ones are incomplete, etc.
   */
  renderBreadcrumbNavigation() {
    // If no stages, we can skip
    if (!this.taskDefinition?.stages?.length) {
      return;
    }

    // We'll build a small container for the breadcrumb
    const breadcrumbEl = document.createElement("div");
    breadcrumbEl.className = "doc-stage-breadcrumb";
    breadcrumbEl.setAttribute("role", "navigation");
    breadcrumbEl.setAttribute("aria-label", "Document stages");

    // A label: "Stages:"
    const labelEl = document.createElement("span");
    labelEl.className = "breadcrumb-label";
    labelEl.textContent = "Stages:";
    breadcrumbEl.appendChild(labelEl);

    // Now loop over each stage in the definition
    this.taskDefinition.stages.forEach((stageDef, i) => {
      const isActive = (i === (this.docTaskInstance.currentStageIndex || 0));
      const stageId = stageDef.stageId || `stage_${i + 1}`;

      // Get status for this stage from both the stages array and stageData
      // This ensures we're using the most accurate status
      let stageStatus = this.docTaskInstance.stages?.[i]?.status || "NOT_STARTED";
      const stageDataStatus = this.docTaskInstance.stageData?.[stageId]?.status;

      // If stageData has a status, prefer that one (it's more likely to be up-to-date)
      if (stageDataStatus) {
        if (stageStatus !== stageDataStatus) {
          // Also update the stages array to keep them in sync
          if (this.docTaskInstance.stages?.[i]) {
            this.docTaskInstance.stages[i].status = stageDataStatus;
          }
          stageStatus = stageDataStatus;
        }
      }

      // Check for dynamic completion based on stage-specific criteria
      // Stage 1 (Upload Questions): Check if questions have been imported
      if (stageId === "rfp_stage_1_upload_question_lists") {
        const importSummary = this.docTaskInstance.stageData?.[stageId]?.importSummary;
        if (importSummary?.totalQuestionsImported > 0) {
          stageStatus = "COMPLETED";
          // Persist the completion status to both data structures
          if (this.docTaskInstance.stages?.[i]) {
            this.docTaskInstance.stages[i].status = "COMPLETED";
          }
          if (this.docTaskInstance.stageData?.[stageId]) {
            this.docTaskInstance.stageData[stageId].status = "COMPLETED";
          }
          // Persist to tab manager
          if (window.tabManager) {
            window.tabManager.persistTabs();
          }
        }
      }
      
      // Stage 5 (Submission/Metadata): Check if any form values have been saved
      // This is determined by the presence of isDirty flag or saved items
      if (stageId === "rfp_stage_5_metadata") {
        const hasFormData = this.docTaskInstance.stageData?.[stageId]?.hasData;
        if (hasFormData) {
          stageStatus = "COMPLETED";
          // Persist the completion status to both data structures
          if (this.docTaskInstance.stages?.[i]) {
            this.docTaskInstance.stages[i].status = "COMPLETED";
          }
          if (this.docTaskInstance.stageData?.[stageId]) {
            this.docTaskInstance.stageData[stageId].status = "COMPLETED";
          }
          // Persist to tab manager
          if (window.tabManager) {
            window.tabManager.persistTabs();
          }
        }
      }

      const isCompleted = stageStatus === "COMPLETED";
      const isRunning = stageStatus === "RUNNING";
      const isFailed = stageStatus === "FAILED";

      // For display, create a clean label - strip any redundant text in parentheses
      let stageLabel = stageDef.stageName || `Stage ${i + 1}`;
      // Optionally simplify label by removing (Placeholder) or similar
      stageLabel = stageLabel.replace(/\s*\([^)]*\)/g, '');

      // Create the stage link with a unique ID based on stageId
      const linkEl = document.createElement("a");
      const docId = this.getDocId();

      // Create the stage link with a more specific ID
      linkEl.id = makeSafeId("stage-link", docId, stageId);
      linkEl.className = `stage-link ${isActive ? 'active' : ''}`;
      linkEl.setAttribute('data-stage-id', stageId);
      linkEl.setAttribute('data-stage-index', i);
      linkEl.setAttribute('role', 'button');
      linkEl.setAttribute('aria-current', isActive ? 'step' : 'false');

      linkEl.href = "#";  // We'll prevent default

      // Create stage number element
      const stageNumberEl = document.createElement("span");
      stageNumberEl.id = makeSafeId("stage-number", docId, stageId);
      stageNumberEl.className = "stage-number";

      // IMPORTANT: Add status classes to the stage number element ONLY
      if (isCompleted) stageNumberEl.classList.add('status--completed');
      if (isRunning) stageNumberEl.classList.add('status--running');
      if (isFailed) stageNumberEl.classList.add('status--failed');

      stageNumberEl.textContent = i + 1;
      linkEl.appendChild(stageNumberEl);

      // Add the stage name
      const stageLabelEl = document.createElement("span");
      stageLabelEl.textContent = stageLabel;
      linkEl.appendChild(stageLabelEl);

      // Stage status for screen readers
      let statusDescription = "";
      if (isCompleted) statusDescription = "completed";
      else if (isRunning) statusDescription = "in progress";
      else if (isFailed) statusDescription = "failed";
      else statusDescription = "not started";

      linkEl.setAttribute('aria-label', `Stage ${i + 1}: ${stageLabel}, status: ${statusDescription}`);

      linkEl.addEventListener("click", (e) => {
        e.preventDefault();

        // Only do work if we're actually changing stages
        if (i !== this.docTaskInstance.currentStageIndex) {
          // On click, set the docTaskInstance.currentStageIndex => i
          this.docTaskInstance.currentStageIndex = i;

          // Update ARIA attributes
          const allLinks = this.domContainer.querySelectorAll('.stage-link');
          allLinks.forEach(link => link.setAttribute('aria-current', 'false'));
          linkEl.setAttribute('aria-current', 'step');

          // Save the activeStageId to the tab object for persistence
          try {
            if (window.tabManager) {
              // Find which tab contains this document instance
              const tabIndex = window.tabManager.tabs.findIndex(tab =>
                tab.newFrameworkDoc === this
              );

              if (tabIndex >= 0) {
                // Store the stageId (not just the index) for better resilience
                window.tabManager.tabs[tabIndex].activeStageId = stageDef.stageId;

                // Persist tabs to save this information
                window.tabManager.persistTabs();
              }
            }
          } catch (err) {
            // Don't let errors here prevent stage navigation
            console.warn("[MultiStageDocumentWithBreadcrumbOrchestrator] Error saving activeStageId:", err);
          }

          // Re-render the entire doc content so we jump to that stage
          this.renderContent();
        }
      });

      breadcrumbEl.appendChild(linkEl);

      // Add separator if not the last item
      if (i < this.taskDefinition.stages.length - 1) {
        const separator = document.createElement("span");
        separator.className = "stage-separator";
        separator.setAttribute('aria-hidden', 'true');
        separator.innerHTML = "&#8250;"; // › character
        breadcrumbEl.appendChild(separator);
      }
    });

    this.domContainer.appendChild(breadcrumbEl);
  }

  /**
   * Updates ONLY the specified stage's status in the UI
   * This method directly targets elements by their stage-specific ID
   * @param {string} stageId - The ID of the stage to update
   * @param {string} status - The status to apply (RUNNING, COMPLETED, FAILED, etc.)
   */
  updateStageBreadcrumbStatus(stageId, status) {
    if (!stageId || !status) return;
    const docId = this.getDocId();

    // 1) Grab the <span id="stage-number-{docId}-{stageId}">
    // Use makeSafeId for consistent ID formatting
    const stageNumberElId = makeSafeId("stage-number", docId, stageId);
    const stageNumberEl = document.getElementById(stageNumberElId);
    if (!stageNumberEl) {
      console.log(`[MultiStageDocumentWithBreadcrumbOrchestrator] Stage number span not found for ${stageId}`);
      return;
    }

    // 2) Remove any existing status classes
    ['running', 'completed', 'failed', 'cancelled'].forEach(cls => {
      stageNumberEl.classList.remove(cls);
    });

    // 3) Apply the appropriate status class
    const statusClass = status.toLowerCase();
    if (['running', 'completed', 'failed', 'cancelled'].includes(statusClass)) {
      stageNumberEl.classList.add(statusClass);
    }
  }

  /**
   * Actually load the current stage form module and render it in the doc container.
   */
  async renderStageForm() {
    if (!this.taskDefinition?.stages?.length) {
      const errMsg = `No "stages" array found in definition for taskType=${this.docTaskInstance.taskType}`;
      console.error("[MultiStageDocumentWithBreadcrumbOrchestrator] " + errMsg);
      const errorDiv = document.createElement("div");
      errorDiv.style.color = "red";
      errorDiv.textContent = errMsg;
      this.domContainer.appendChild(errorDiv);
      return;
    }

    const { currentStageIndex = 0 } = this.docTaskInstance;
    const stageInfo = this.taskDefinition.stages[currentStageIndex];
    if (!stageInfo) {
      const errMsg = `Invalid stage index=${currentStageIndex} for taskType=${this.docTaskInstance.taskType}`;
      console.error("[MultiStageDocumentWithBreadcrumbOrchestrator] " + errMsg);
      const errorDiv = document.createElement("div");
      errorDiv.style.color = "red";
      errorDiv.textContent = errMsg;
      this.domContainer.appendChild(errorDiv);
      return;
    }

    // Make a child container for the stage form itself
    const stageContainer = document.createElement("div");
    // Add a slight top margin so it doesn't crowd the breadcrumb
    stageContainer.className = "doc-stage-content-wrapper";
    this.domContainer.appendChild(stageContainer);

    try {
      const modulePath = "../stages/" + stageInfo.formModule;
      const importedStageForm = await import(modulePath);
      const StageFormClass = importedStageForm.default;

      // Instantiate that stage
      const stageFormInstance = new StageFormClass(
        this.docTaskInstance,
        this.jobController,
        this.autoSaveManager // Pass autoSaveManager for DocumentItems save tracking
      );
      stageFormInstance.render(stageContainer);

      // Store a reference to the document so the stage form can access it
      if (this.docTaskInstance) {
        this.docTaskInstance.__document = this;
      }

    } catch (err) {
      console.error("[MultiStageDocumentWithBreadcrumbOrchestrator] Failed to load stage form:", err);
      const errorDiv = document.createElement("div");
      errorDiv.style.color = "red";
      errorDiv.innerHTML = `Error loading stage form "<strong>${stageInfo?.formModule}</strong>": ${err.message}`;
      stageContainer.appendChild(errorDiv);
    }
  }

  // Add diagnostic function to detect and fix breadcrumb status issues
  async cleanupStageBreadcrumbs() {

    const { makeSafeId } = await import("../../utils/dom-utils.js");

    if (!this.docTaskInstance || !this.docTaskInstance.stages) {
      console.log("[MultiStageDocumentWithBreadcrumbOrchestrator] No stages to check");
      return;
    }

    // Get all stage links by their IDs
    this.docTaskInstance.stages.forEach(stage => {
      if (!stage || !stage.stageId) return;

      const stageId = stage.stageId;
      const docId = this.getDocId();

      // Use makeSafeId for consistent ID generation
      const stageNumberElId = makeSafeId("stage-number", docId, stageId);
      const stageNumberEl = document.getElementById(stageNumberElId);

      // Also check the link element for legacy class handling
      const stageLinkElId = makeSafeId("stage-link", docId, stageId);
      const stageLinkEl = document.getElementById(stageLinkElId);

      if (!stageNumberEl) {
        return;
      }

      // Stage's actual status
      const stageStatus = stage.status || "NOT_STARTED";

      // Remove any status classes from the link element - they should ONLY be on the number
      if (stageLinkEl) {
        ['running', 'completed', 'failed', 'cancelled'].forEach(cls => {
          if (stageLinkEl.classList.contains(cls)) {
            stageLinkEl.classList.remove(cls);
          }
        });
      }

      // Check for mismatches on number element
      const hasRunningClass = stageNumberEl.classList.contains('status--running');
      const hasCompletedClass = stageNumberEl.classList.contains('status--completed');
      const hasFailedClass = stageNumberEl.classList.contains('status--failed');

      // Fix mismatches
      if (stageStatus === "RUNNING" && !hasRunningClass) {
        stageNumberEl.classList.add('status--running');
      } else if (stageStatus !== "RUNNING" && hasRunningClass) {
        stageNumberEl.classList.remove('status--running');
      }

      if (stageStatus === "COMPLETED" && !hasCompletedClass) {
        stageNumberEl.classList.add('status--completed');
      } else if (stageStatus !== "COMPLETED" && hasCompletedClass) {
        stageNumberEl.classList.remove('status--completed');
      }

      if (stageStatus === "FAILED" && !hasFailedClass) {
        stageNumberEl.classList.add('status--failed');
      } else if (stageStatus !== "FAILED" && hasFailedClass) {
        stageNumberEl.classList.remove('status--failed');
      }
    });
  }


  /**
   * Update all stage breadcrumbs based on their individual statuses
   * This replaces the old _updateBreadcrumbStatus method with a more targeted approach
   */
  refreshStageBreadcrumbs() {
    // First run the diagnostic and cleanup
    this.cleanupStageBreadcrumbs();

    // Only proceed if we have stages
    if (!this.docTaskInstance || !this.docTaskInstance.stages) return;

    // Update each stage individually based on its own status
    this.docTaskInstance.stages.forEach(stage => {
      if (stage && stage.stageId && stage.status) {
        this.updateStageBreadcrumbStatus(stage.stageId, stage.status);
      }
    });
  }

  /**
   * Refreshes document UI indicators based on stage statuses
   * Modified to use the new direct stage update approach
   */
  refreshDocUIIndicatorsAggregateStatus() {
    this.synchronizeStageStatuses();

    if (!this.jobController) return;
    const docId = this.getDocId();

    // Gather item statuses from docTaskInstance.stageData
    const itemStatuses = this._collectItemStatusesFromStageData() || [];

    // Gather job statuses from jobController
    const docJobs = this.jobController.getJobsForDocument(docId);
    const jobStatuses = docJobs.map(j => j.status);

    // Calculate aggregate status for UI purposes only (not to change document status)
    const hasRunningJob = jobStatuses.includes(JOB_STATUS.RUNNING);
    let displayStatus;

    if (hasRunningJob) {
      // If any job is running, use RUNNING for UI display
      displayStatus = JOB_STATUS.RUNNING;
    } else {
      // Get aggregate status from jobs and items for UI display only
      displayStatus = this.jobController.getDocumentAggregatedStatus(docId, itemStatuses);
      console.log("[MultiStageDocumentWithBreadcrumbOrchestrator] Document display status:", displayStatus);
    }

    // Update each stage breadcrumb directly based on its own status
    this.refreshStageBreadcrumbs();

    // Update tab visual indicator only, not document status
    if (window.tabManager && typeof window.tabManager.updateDocStatus === "function") {
      window.tabManager.updateDocStatus(this, displayStatus);
    }

    // Persist the tabs to save any changes to stage statuses
    if (window.tabManager) {
      window.tabManager.persistTabs();
    }
  }

  /**
   * Update breadcrumb status indicators based on stage statuses
   * @param {string} docStatus - The document-level status
   * @private
   */
  _updateBreadcrumbStatus() {
    const docId = this.getDocId();

    // FIXED: Update status for each stage based on its individual status ONLY
    if (this.docTaskInstance && this.docTaskInstance.stages) {
      this.docTaskInstance.stages.forEach((stage, index) => {
        if (!stage || !stage.stageId) return;

        const stageId = stage.stageId;
        const stageNumberElId = makeSafeId("stage-number", docId, stageId);
        const stageNumberEl = document.getElementById(stageNumberElId);

        if (!stageNumberEl) {
          return;
        }

        // Remove any existing status classes
        ['running', 'completed', 'failed', 'cancelled'].forEach(cls => {
          stageNumberEl.classList.remove(cls);
        });

        // Apply appropriate status class based on stage status ONLY
        if (stage.status === "RUNNING") {
          stageNumberEl.classList.add('status--running');
        }
        else if (stage.status === "COMPLETED") {
          stageNumberEl.classList.add('status--completed');
        }
        else if (stage.status === "FAILED") {
          stageNumberEl.classList.add('status--failed');
        }
      });
    }
  }

  /**
   * Update the status display in the DOM
   * @private
   */
  _updateStatusInDOM() {
    const status = this.docTaskInstance.status;

    // Update status text in header
    const docStatusEl = this.domContainer?.querySelector("#docStatus");
    if (docStatusEl) {
      docStatusEl.textContent = status;

      // Find the selected-status element and update its class
      const selectedStatus = this.domContainer?.querySelector(".status");
      if (selectedStatus) {
        // Remove existing status classes
        const statusClasses = Array.from(selectedStatus.classList)
          .filter(cls => cls.startsWith('status--'));
        statusClasses.forEach(cls => selectedStatus.classList.remove(cls));

        // Add new status class
        selectedStatus.classList.add(`status--${status.toLowerCase()}`);
      }
    }

    // Update selected option in dropdown if it exists
    const statusOptions = this.domContainer?.querySelectorAll(".status-option");
    if (statusOptions) {
      statusOptions.forEach(opt => {
        const optValue = opt.getAttribute("data-value");
        if (optValue === status) {
          opt.classList.add("selected");
        } else {
          opt.classList.remove("selected");
        }
      });
    }

    // If we're in a running state, ensure the last saved date is visible
    this._updateLastSavedDate();
  }

  /**
   * Make sure the last saved date is displayed correctly
   * @private
   */
  _updateLastSavedDate() {
    const lastSavedEl = this.domContainer?.querySelector("#docLastSaved");
    if (lastSavedEl && this.docTaskInstance.lastSavedAt) {
      lastSavedEl.textContent = new Date(this.docTaskInstance.lastSavedAt).toLocaleString();
    }
  }

  /**
   * Example: gather sub-items each might have a 'status' field
   * FIXED: Now properly collects status from all stages based on stageId
   * @private
   */
  _collectItemStatusesFromStageData() {
    if (!this.docTaskInstance.stageData) {
      return [];
    }

    const statuses = [];

    // IMPORTANT: Only collect statuses from each stage separately, never propagate
    if (this.docTaskInstance.stages) {
      this.docTaskInstance.stages.forEach(stage => {
        if (!stage || !stage.stageId) return;

        const stageId = stage.stageId;
        const stageData = this.docTaskInstance.stageData[stageId];

        if (stageData && stageData.status) {
          // Only add status if this stage actually has a valid status
          // This prevents propagation of status between stages
          statuses.push({
            stageId,
            status: stageData.status
          });
        }
      });
    }

    // Return only the status values for aggregation
    return statuses.map(s => s.status);
  }

  /**
   * Synchronize stage status between docTaskInstance.stages array and stageData
   * This ensures both places have the same status information
   */
  synchronizeStageStatuses() {
    if (!this.docTaskInstance || !this.docTaskInstance.stages || !this.docTaskInstance.stageData) {
      return;
    }

    // Create a map of which stages have legitimate evidence for their status
    const stageStatusEvidence = new Map();

    // First pass: gather evidence for each stage's status from job history
    this.docTaskInstance.stages.forEach(stage => {
      if (!stage || !stage.stageId) return;

      const stageId = stage.stageId;
      const stageData = this.docTaskInstance.stageData[stageId];

      if (!stageData) {
        stageStatusEvidence.set(stageId, {
          hasEvidence: false,
          validStatus: "NOT_STARTED"
        });
        return;
      }

      // Look for evidence in job history
      const jobHistory = stageData.jobHistory || {};
      const stageJobs = Object.values(jobHistory).filter(job =>
        job.stageId === stageId || // Explicit stage association 
        (job.metadata && job.metadata.stageId === stageId) // Stage ID in metadata
      );

      // Check for dynamic completion criteria first
      let hasDynamicCompletion = false;
      let dynamicStatus = "NOT_STARTED";
      
      // Stage 1: Check if questions have been imported
      if (stageId === "rfp_stage_1_upload_question_lists") {
        const importSummary = stageData?.importSummary;
        if (importSummary?.totalQuestionsImported > 0) {
          hasDynamicCompletion = true;
          dynamicStatus = "COMPLETED";
        }
      }
      
      // Stage 5: Check if form data has been saved
      if (stageId === "rfp_stage_5_metadata") {
        const hasFormData = stageData?.hasData;
        if (hasFormData) {
          hasDynamicCompletion = true;
          dynamicStatus = "COMPLETED";
        }
      }
      
      // If stage has dynamic completion, use that status
      if (hasDynamicCompletion) {
        stageStatusEvidence.set(stageId, {
          hasEvidence: true,
          validStatus: dynamicStatus
        });
      } else if (stageJobs.length === 0) {
        // No jobs for this stage - should be NOT_STARTED
        stageStatusEvidence.set(stageId, {
          hasEvidence: false,
          validStatus: "NOT_STARTED"
        });
      } else {
        // Determine valid status based on job history
        const completedJobs = stageJobs.filter(job => job.status === "COMPLETED");
        const runningJobs = stageJobs.filter(job => job.status === "RUNNING");
        const failedJobs = stageJobs.filter(job => job.status === "FAILED");

        let validStatus = "NOT_STARTED";
        let hasEvidence = true;

        if (completedJobs.length > 0) {
          // If any job completed, stage is COMPLETED
          validStatus = "COMPLETED";
        } else if (runningJobs.length > 0) {
          // If any job still running, stage is RUNNING
          validStatus = "RUNNING";
        } else if (failedJobs.length > 0) {
          // If any job failed and none completed or running, stage is FAILED
          validStatus = "FAILED";
        } else {
          // Strange case - jobs exist but none have these statuses
          hasEvidence = false;
        }

        stageStatusEvidence.set(stageId, { hasEvidence, validStatus });
      }
    });

    // Evidence map calculated for validation

    // Second pass: fix any incorrect statuses
    this.docTaskInstance.stages.forEach(stage => {
      if (!stage || !stage.stageId) return;

      const stageId = stage.stageId;
      const evidence = stageStatusEvidence.get(stageId);

      if (!evidence) {
        // This should not happen if our previous loop was comprehensive
        console.warn(`[MultiStageDocumentWithBreadcrumbOrchestrator] No evidence data for stage ${stageId}, skipping validation`);
        return;
      }

      // Check if current status differs from the validated status
      if (evidence.hasEvidence && stage.status !== evidence.validStatus) {
        console.log(`[MultiStageDocumentWithBreadcrumbOrchestrator] Stage ${stageId} status corrected: ${stage.status} => ${evidence.validStatus}`);
        stage.status = evidence.validStatus;

        // Also update stageData
        if (this.docTaskInstance.stageData[stageId]) {
          this.docTaskInstance.stageData[stageId].status = evidence.validStatus;
        } else {
          this.docTaskInstance.stageData[stageId] = {
            status: evidence.validStatus
          };
        }
      }
      // Also check for stages with statuses like COMPLETED but no evidence
      else if (!evidence.hasEvidence && stage.status !== "NOT_STARTED" &&
        ["COMPLETED", "RUNNING", "FAILED"].includes(stage.status)) {
        console.log(`[MultiStageDocumentWithBreadcrumbOrchestrator] Stage ${stageId} reset: ${stage.status} => NOT_STARTED (no evidence)`);
        stage.status = "NOT_STARTED";

        // Also update stageData
        if (this.docTaskInstance.stageData[stageId]) {
          this.docTaskInstance.stageData[stageId].status = "NOT_STARTED";
        } else {
          this.docTaskInstance.stageData[stageId] = {
            status: "NOT_STARTED"
          };
        }
      }
      // For completeness, create stageData entry if it doesn't exist
      else if (!this.docTaskInstance.stageData[stageId]) {
        this.docTaskInstance.stageData[stageId] = {
          status: stage.status
        };
      }
    });

    // Apply the current status to the DOM
    this._updateBreadcrumbStatus();
  }

  /**
   * getDocId
   * Return a stable doc identifier, e.g. from docTaskInstance.documentId or .compositeId
   */
  getDocId() {
    return this.docTaskInstance.documentId || this.docTaskInstance.compositeId;
  }


}

// Add these debugging tools to help you track down the issue:

// Browser console debug function to monitor stage number element changes:
function monitorStageNumberChanges() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' &&
        mutation.attributeName === 'class' &&
        mutation.target.classList.contains('stage-number')) {
        console.log('Stage number class changed:', {
          element: mutation.target,
          oldValue: mutation.oldValue,
          newValue: mutation.target.className,
          stack: new Error().stack
        });
      }
    });
  });

  // Observe all current and future stage-number elements
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class']
  });

  console.log("Now monitoring stage number element class changes");
  return observer; // Return so you can disconnect later if needed
}