// file: stages/stage-form-rfp-review-of-answers.js
import { FormStageHelper } from "../../utils/form-stage-helper.js";
import { AnalysisLMFramework } from "../framework/analysis-lm-framework.js";
import { ErrorModal } from "../modals/error-modal.js";

/**
 * RFP Review of Answers Stage Form
 * 
 * A stage form component for comprehensive AI-powered quality assurance and review
 * of RFP answers with risk analysis and improvement recommendations.
 */
export default class StageFormRfpReviewOfAnswers {
  /**
   * Constructor
   * @param {object} docTaskInstance - The document task instance.
   * @param {object} jobController - The job controller.
   */
  constructor(docTaskInstance, jobController) {
    console.log("[StageFormRfpReviewOfAnswers] constructor called");
    this.docTaskInstance = docTaskInstance;
    this.jobController = jobController;
    this.domContainer = null;
    this.analysisLMFramework = null;

    // Static process definition ID for this stage
    this.processDefId = 'rfp_review_of_answers';
    this.errorModal = new ErrorModal();

    // Get the current stageId
    const currentStageIndex = docTaskInstance.currentStageIndex || 0;
    this.currentStageId = docTaskInstance.stages?.[currentStageIndex]?.stageId || "rfp_stage_4_review_of_answers";

    // Initialize using shared helper
    FormStageHelper.initializeStageData(this.docTaskInstance, this.currentStageId);

    console.log(`[StageFormRfpReviewOfAnswers] Initialized with stageId: ${this.currentStageId}`);
  }

  /**
   * Render the stage form.
   * @param {HTMLElement} containerEl - The container element to render in.
   */
  async render(containerEl) {
    console.log("[StageFormRfpReviewOfAnswers] render() called");
    this.domContainer = containerEl;

    // Clear container and render header structure
    this.domContainer.innerHTML = `
      <div class="stage-form analysis-lm-stage">
        <div class="stage-header">
          <h3>Review of Answers</h3>
          <p>This AI-powered tool comprehensively reviews all RFP answers for quality, consistency, risk assessment, and provides prioritized improvement recommendations to maximize win probability.</p>
          <div class="stage-info">
            <div class="info-item">
              <i class="fas fa-shield-alt"></i>
              <span>Risk Analysis & Compliance Checking</span>
            </div>
            <div class="info-item">
              <i class="fas fa-chart-line"></i>
              <span>Win Theme Adherence Validation</span>
            </div>
            <div class="info-item">
              <i class="fas fa-spell-check"></i>
              <span>Language Quality & Professional Standards</span>
            </div>
            <div class="info-item">
              <i class="fas fa-tasks"></i>
              <span>Prioritized Improvement Recommendations</span>
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
    const store = window.store || { getItem: () => null, setItem: () => { } };
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
        console.log(`[StageFormRfpReviewOfAnswers] Displaying cached results for stage ${this.currentStageId}`);
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
   * Display a permission error message and disable further actions.
   * @param {string} message - The error message to display.
   * @private
   */
  _displayPermissionError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "permission-error";
    errorDiv.style.padding = "20px";
    errorDiv.style.border = "1px solid var(--status-error)";
    errorDiv.style.backgroundColor = "var(--theme-surface-alt)";
    errorDiv.style.color = "var(--status-error)";
    errorDiv.style.margin = "20px 0";
    errorDiv.textContent = message;

    const analysisContainer = this.domContainer.querySelector("#analysis-lm-container");
    if (analysisContainer) {
      analysisContainer.innerHTML = "";
      analysisContainer.appendChild(errorDiv);
    }
  }

  /**
   * Handle when results are displayed.
   * @param {object} results - The displayed results.
   * @private
   */
  _handleResultsDisplayed(results) {
    console.log(`[StageFormRfpReviewOfAnswers] Results displayed for stage ${this.currentStageId}:`, results);

    // Update docTaskInstance with the results using shared helper
    FormStageHelper.updateStageResults(this.docTaskInstance, this.currentStageId, results);

    // Update stage UI status
    this._updateStageStatus();

    // Refresh document status indicators
    this.refreshDocUIIndicatorsAggregateStatus();

    // Persist to tab manager
    if (window.tabManager) {
      window.tabManager.persistTabs();
      console.log(`[StageFormRfpReviewOfAnswers] Persisted results for stage ${this.currentStageId} to tab storage`);
    }
  }

  /**
   * Refresh document aggregate status - this is called by the framework when job status changes
   */
  refreshDocUIIndicatorsAggregateStatus() {
    //console.log("[StageFormRfpReviewOfAnswers] refreshDocUIIndicatorsAggregateStatus called");

    // Use shared helper for status refresh
    FormStageHelper.refreshDocumentStatus(this.docTaskInstance);

    // Also notify TabManager to update tab colors
    if (window.tabManager && typeof window.tabManager.updateDocStatus === 'function') {
      window.tabManager.updateDocStatus(this, this.docTaskInstance.status);
    }
  }

  /**
   * Handle transition to the next stage.
   * @returns {boolean} - Whether the transition is allowed.
   */
  canTransitionToNextStage() {
    const canTransition = this.docTaskInstance.stageData[this.currentStageId]?.status === "COMPLETED";

    if (!canTransition) {
      this.errorModal.show({
        title: "Cannot Proceed",
        message: "You must complete the comprehensive answer review and quality assurance analysis before proceeding to the final stage."
      });
    }

    return canTransition;
  }

  /**
   * Get stage data for saving.
   * @returns {object} - The stage data.
   */
  getSaveData() {
    return { [this.currentStageId]: this.docTaskInstance.stageData[this.currentStageId] };
  }

  /**
   * Load data into the stage.
   * @param {object} data - The data to load.
   */
  loadData(data) {
    if (data && data[this.currentStageId]) {
      this.docTaskInstance.stageData[this.currentStageId] = data[this.currentStageId];
      console.log(`[StageFormRfpReviewOfAnswers] Loaded data for stage ${this.currentStageId}`);
    }
  }
}