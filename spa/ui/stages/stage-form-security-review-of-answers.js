// ui/stages/stage-form-security-review-of-answers.js

import { AnalysisLMFramework } from "../framework/analysis-lm-framework.js";
import { ErrorModal } from "../modals/error-modal.js";
import { FormStageHelper } from "../../utils/form-stage-helper.js";

/**
 * Security Review of Answers Stage Form
 * 
 * A stage form component for comprehensive AI-powered quality assurance and review
 * of security questionnaire answers with focus on accuracy, compliance, and risk assessment.
 * Different from RFP workflow - focuses on technical accuracy and regulatory compliance
 * rather than win themes and competitive positioning.
 */
export default class StageFormSecurityReviewOfAnswers {
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
    this.processDefId = 'process_def_security_review_of_answers';
    this.errorModal = new ErrorModal();
    
    // Get the current stageId
    const currentStageIndex = docTaskInstance.currentStageIndex || 0;
    this.currentStageId = docTaskInstance.stages?.[currentStageIndex]?.stageId || "security_stage_4_review_of_answers";
    
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
          <h3>Security Questionnaire Review of Answers</h3>
          <p>This AI-powered tool comprehensively reviews all security questionnaire answers for accuracy, compliance, risk assessment, and provides prioritized improvement recommendations to ensure submission readiness.</p>
          <div class="stage-info">
            <div class="info-item">
              <i class="fas fa-shield-check"></i>
              <span>Accuracy & Factual Verification</span>
            </div>
            <div class="info-item">
              <i class="fas fa-balance-scale"></i>
              <span>Compliance & Regulatory Alignment</span>
            </div>
            <div class="info-item">
              <i class="fas fa-exclamation-triangle"></i>
              <span>Risk Assessment & Mitigation</span>
            </div>
            <div class="info-item">
              <i class="fas fa-tasks"></i>
              <span>Technical Gap Analysis</span>
            </div>
            <div class="info-item">
              <i class="fas fa-clipboard-check"></i>
              <span>Submission Readiness Evaluation</span>
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
    
    // Update stage UI status
    this._updateStageStatus();
    
    // Refresh document status indicators
    this.refreshDocUIIndicatorsAggregateStatus();
    
    // Persist to tab manager
    if (window.tabManager) {
      window.tabManager.persistTabs();
    }
  }

  /**
   * Refresh document aggregate status - this is called by the framework when job status changes
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
   * Display permission error message
   * @param {string} errorMessage - Error message to display
   * @private
   */
  _displayPermissionError(errorMessage) {
    this.domContainer.innerHTML = `
      <div class="stage-form analysis-lm-stage">
        <div class="stage-header">
          <h3>Security Questionnaire Review of Answers</h3>
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
   * Cleanup when stage is destroyed
   */
  destroy() {
    if (this.analysisLMFramework) {
      // Clean up AnalysisLM framework if it has cleanup methods
      this.analysisLMFramework = null;
    }
  }
}