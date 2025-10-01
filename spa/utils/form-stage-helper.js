// file: utils/form-stage-helper.js

/**
 * Shared utility functions for RFP workflow stage forms
 * Provides common functionality for AnalysisLM-based stages to reduce code duplication
 */
export class FormStageHelper {
  
  /**
   * Initialize stage data structure with stageId-based approach
   * @param {object} docTaskInstance - The document task instance
   * @param {string} currentStageId - The current stage ID
   */
  static initializeStageData(docTaskInstance, currentStageId) {
    // Initialize stageData with stageId-based structure
    if (!docTaskInstance.stageData) {
      docTaskInstance.stageData = {};
    }
    
    if (!docTaskInstance.stageData[currentStageId]) {
      docTaskInstance.stageData[currentStageId] = {
        results: null,
        status: "NOT_STARTED",
        uploadedFiles: {}
      };
    }

    // Ensure other stages' statuses don't get incorrectly set
    // This ensures each stage has its own independent status
    if (docTaskInstance.stages) {
      docTaskInstance.stages.forEach(stage => {
        // Skip the current stage - we already handled it above
        if (stage.stageId === currentStageId) return;
        
        // Make sure each stage has its own stageData entry
        if (!docTaskInstance.stageData[stage.stageId]) {
          docTaskInstance.stageData[stage.stageId] = {
            status: stage.status || "NOT_STARTED"
          };
        }
        
        // Ensure stage.status and stageData[stageId].status are in sync
        // This fixes issues where one might be COMPLETED but the other isn't
        if (docTaskInstance.stageData[stage.stageId].status !== stage.status) {
          // Prefer the stage status if they're different
          docTaskInstance.stageData[stage.stageId].status = stage.status || "NOT_STARTED";
        }
      });
    }

    // Store a reference to the parent document for status updates
    if (docTaskInstance) {
      docTaskInstance.__parent = this;
    }
  }

  /**
   * Check permissions for a given process definition
   * @param {string} processDefId - The process definition ID to check
   * @returns {object} - Object with hasPermission boolean and errorMessage if applicable
   */
  static checkPermissions(processDefId) {
    // Get the security instance from the global security manager
    const security = window.securityManager ? window.securityManager.getSecurity() : null;
    
    if (!security) {
      console.error("[RfpStageHelper] Security manager is not available. Access denied.");
      return {
        hasPermission: false,
        errorMessage: "Security manager unavailable. Please log out and log back in."
      };
    }
    
    // Log current docchain permissions for debugging
    console.log("[RfpStageHelper] Current docchain permissions:", security.permissions.docchain);
    console.log("[RfpStageHelper] Checking permission for process:", processDefId);
    
    if (!security.hasDocChainPermission(processDefId)) {
      console.warn("[RfpStageHelper] Permission check failed for process:", processDefId);
      return {
        hasPermission: false,
        errorMessage: `You do not have permission to run this process. Please contact your administrator for access to '${processDefId}'.`
      };
    }
    
    return { hasPermission: true };
  }

  /**
   * Update stage results and status
   * @param {object} docTaskInstance - The document task instance
   * @param {string} stageId - The stage ID
   * @param {object} results - The results to store
   */
  static updateStageResults(docTaskInstance, stageId, results) {
    // Update docTaskInstance with the results and completed status
    if (!docTaskInstance.stageData[stageId]) {
      docTaskInstance.stageData[stageId] = {};
    }
    
    docTaskInstance.stageData[stageId].results = results;
    docTaskInstance.stageData[stageId].status = "COMPLETED";
    docTaskInstance.isDirty = true;
  }

  /**
   * Refresh document status indicators
   * @param {object} docTaskInstance - The document task instance
   */
  static refreshDocumentStatus(docTaskInstance) {
    // If the document has a parent with refreshDocUIIndicatorsAggregateStatus method, call it
    if (docTaskInstance && 
        docTaskInstance.__document && 
        typeof docTaskInstance.__document.refreshDocUIIndicatorsAggregateStatus === 'function') {
      docTaskInstance.__document.refreshDocUIIndicatorsAggregateStatus();
    }
  }

  /**
   * Get stage completion status
   * @param {object} docTaskInstance - The document task instance
   * @param {string} stageId - The stage ID to check
   * @returns {boolean} - Whether the stage is completed
   */
  static isStageCompleted(docTaskInstance, stageId) {
    return docTaskInstance.stageData[stageId]?.status === "COMPLETED";
  }

  /**
   * Get stage results
   * @param {object} docTaskInstance - The document task instance
   * @param {string} stageId - The stage ID
   * @returns {object|null} - The stage results or null if not available
   */
  static getStageResults(docTaskInstance, stageId) {
    return docTaskInstance.stageData[stageId]?.results || null;
  }

  /**
   * Check if a stage has specific dependencies completed
   * @param {object} docTaskInstance - The document task instance
   * @param {Array<string>} dependencyStageIds - Array of stage IDs that must be completed
   * @returns {object} - Object with canProceed boolean and missing array of incomplete stages
   */
  static checkStageDependencies(docTaskInstance, dependencyStageIds) {
    const missing = dependencyStageIds.filter(stageId => 
      !this.isStageCompleted(docTaskInstance, stageId)
    );
    
    return {
      canProceed: missing.length === 0,
      missing: missing
    };
  }

  /**
   * Get a formatted dependency error message
   * @param {Array<string>} missingStageIds - Array of missing stage IDs
   * @returns {string} - Formatted error message
   */
  static getDependencyErrorMessage(missingStageIds) {
    const stageNames = {
      'rfp_stage_1_upload_question_lists': 'Upload Questions',
      'rfp_stage_2_initial_review': 'Initial Review', 
      'rfp_stage_3_answer_questions': 'Answer Questions',
      'rfp_stage_4_review_of_answers': 'Review of Answers'
    };
    
    const missingNames = missingStageIds.map(id => stageNames[id] || id);
    
    if (missingNames.length === 1) {
      return `You must complete the "${missingNames[0]}" stage before proceeding.`;
    } else {
      const lastStage = missingNames.pop();
      return `You must complete the "${missingNames.join('", "')}" and "${lastStage}" stages before proceeding.`;
    }
  }

  /**
   * Create a standard stage info display
   * @param {Array<object>} infoItems - Array of {icon, text} objects
   * @returns {string} - HTML string for the info display
   */
  static createStageInfoDisplay(infoItems) {
    const itemsHtml = infoItems.map(item => `
      <div class="info-item">
        <i class="${item.icon}"></i>
        <span>${item.text}</span>
      </div>
    `).join('');
    
    return `
      <div class="stage-info">
        ${itemsHtml}
      </div>
    `;
  }

  /**
   * Standard permission error display
   * @param {HTMLElement} container - Container element to display error in
   * @param {string} message - Error message to display
   */
  static displayPermissionError(container, message) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "permission-error";
    errorDiv.style.padding = "20px";
    errorDiv.style.border = "1px solid var(--status-error)";
    errorDiv.style.backgroundColor = "var(--theme-surface-alt)";
    errorDiv.style.color = "var(--status-error)";
    errorDiv.style.margin = "20px 0";
    errorDiv.textContent = message;
    
    container.innerHTML = "";
    container.appendChild(errorDiv);
  }

  /**
   * Log stage activity with consistent formatting
   * @param {string} stageName - Name of the stage
   * @param {string} action - Action being performed
   * @param {string} details - Additional details
   */
  static logStageActivity(stageName, action, details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${stageName}] ${action}${details ? ': ' + details : ''}`);
  }
}