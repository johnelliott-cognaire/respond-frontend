// ui/stages/stage-form-security-initial-review.js

import { AnalysisLMFramework } from "../framework/analysis-lm-framework.js";
import { ErrorModal } from "../modals/error-modal.js";
import { FormStageHelper } from "../../utils/form-stage-helper.js";

/**
 * Security Initial Review Stage Form
 * 
 * A stage form component for AI-powered initial review of security questionnaire questions.
 * Focuses on risk assessment, non-standard security questions, and particularly tricky 
 * security questions - different from RFP workflow which focuses on win themes and product capabilities.
 */
export default class StageFormSecurityInitialReview {
  /**
   * Constructor
   * @param {object} docTaskInstance - The document task instance.
   * @param {object} jobController - The job controller.
   */
  constructor(docTaskInstance, jobController) {
    this.docTaskInstance = docTaskInstance;
    this.jobController = jobController;
    this.domContainer = null;
    this.analysisLMFramework = null;
    
    // Static process definition ID for this stage
    this.processDefId = 'process_def_security_initial_review';
    this.errorModal = new ErrorModal();
    
    // Get the current stageId
    const currentStageIndex = docTaskInstance.currentStageIndex || 0;
    this.currentStageId = docTaskInstance.stages?.[currentStageIndex]?.stageId || "security_stage_2_initial_review";
    
    // Initialize using shared helper
    FormStageHelper.initializeStageData(this.docTaskInstance, this.currentStageId);
  }

  /**
   * Render the stage form.
   * @param {HTMLElement} containerEl - The container element to render in.
   */
  async render(containerEl) {
    this.domContainer = containerEl;
    
    // Clear container and render header structure
    this.domContainer.innerHTML = `
      <div class="stage-form analysis-lm-stage">
        <div class="stage-header">
          <h3>Security Questionnaire Initial Review</h3>
          <p>This AI-powered tool analyzes security questionnaire questions to identify risks, non-standard security requirements, and particularly complex or tricky questions that require special attention during the response process.</p>
          <div class="stage-info">
            <div class="info-item">
              <i class="fas fa-exclamation-triangle"></i>
              <span>Risk Assessment & Compliance Gap Analysis</span>
            </div>
            <div class="info-item">
              <i class="fas fa-search"></i>
              <span>Non-Standard Security Question Detection</span>
            </div>
            <div class="info-item">
              <i class="fas fa-brain"></i>
              <span>Complex Question Identification</span>
            </div>
            <div class="info-item">
              <i class="fas fa-clipboard-check"></i>
              <span>Response Strategy Recommendations</span>
            </div>
          </div>
        </div>
        <div id="analysis-lm-container"></div>
      </div>
    `;

    // Check permissions using shared helper
    const permissionCheck = FormStageHelper.checkPermissions(this.processDefId);
    if (!permissionCheck.hasPermission) {
      this._displayPermissionError(permissionCheck.errorMessage);
      return;
    }

    // Initialize the AnalysisLM framework
    const store = window.store || { getItem: () => null, setItem: () => {} };
    this.analysisLMFramework = new AnalysisLMFramework(store, this.jobController, this.docTaskInstance);
    
    // Set up results callback
    this.analysisLMFramework.onResultsDisplayed = (results) => {
      this._handleResultsDisplayed(results);
    };
    
    const analysisLMContainer = this.domContainer.querySelector("#analysis-lm-container");
    if (analysisLMContainer) {
      await this.analysisLMFramework.initialize(analysisLMContainer, this.processDefId, this.currentStageId);
      
      // If we already have results, display them
      if (this.docTaskInstance.stageData[this.currentStageId]?.results) {
        this.analysisLMFramework.displayResults(this.docTaskInstance.stageData[this.currentStageId].results);
      }
    }
    
    // Ensure the stage status is reflected in the UI
    this._updateStageStatus();
  }

  /**
   * Update stage status based on stageData status
   * @private
   */
  _updateStageStatus() {
    if (this.docTaskInstance.stages && 
        this.docTaskInstance.stageData[this.currentStageId]?.status === "COMPLETED") {
      this.refreshDocUIIndicatorsAggregateStatus();
    }
  }

  /**
   * Handle when analysis results are displayed
   * @param {Object} results - Analysis results
   * @private
   */
  _handleResultsDisplayed(results) {
    // Update stage data
    FormStageHelper.updateStageResults(this.docTaskInstance, this.currentStageId, results);
    
    // Update UI indicators if method exists
    if (typeof this.refreshDocUIIndicatorsAggregateStatus === 'function') {
      this.refreshDocUIIndicatorsAggregateStatus();
    }
  }

  /**
   * Display permission error message
   * @param {string} errorMessage - Error message to display
   * @private
   */
  _displayPermissionError(errorMessage) {
    this.domContainer.innerHTML = `
      <div class="stage-form analysis-lm-stage">
        <div class="stage-header">
          <h3>Security Questionnaire Initial Review</h3>
        </div>
        <div class="permission-error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>${errorMessage}</span>
        </div>
      </div>
    `;
  }

  /**
   * Get save data for this stage
   * @returns {Object} - Stage data to save
   */
  getSaveData() {
    return this.docTaskInstance.stageData[this.currentStageId] || {};
  }

  /**
   * Load data for this stage
   * @param {Object} data - Data to load
   */
  loadData(data) {
    if (data) {
      this.docTaskInstance.stageData[this.currentStageId] = { ...data };
    }
  }

  /**
   * Check if stage can transition to next
   * @returns {boolean} - Whether transition is allowed
   */
  canTransitionToNextStage() {
    const stageData = this.docTaskInstance.stageData[this.currentStageId];
    return stageData?.status === "COMPLETED";
  }

  /**
   * Refresh document UI indicators and aggregate status
   */
  refreshDocUIIndicatorsAggregateStatus() {
    // Use shared helper for status refresh
    FormStageHelper.refreshDocumentStatus(this.docTaskInstance);
    
    // Also notify TabManager to update tab colors
    if (window.tabManager && typeof window.tabManager.updateDocStatus === 'function') {
      window.tabManager.updateDocStatus(this, this.docTaskInstance.status);
    }
  }

  /**
   * Cleanup when stage is destroyed
   */
  destroy() {
    if (this.analysisLMFramework) {
      // Clean up AnalysisLM framework if it has cleanup methods
      this.analysisLMFramework = null;
    }
  }
}