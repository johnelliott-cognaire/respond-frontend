// file: stages/stage-form-rfp-initial-review.js
import { FormStageHelper } from "../../utils/form-stage-helper.js";
import { AnalysisLMFramework } from "../framework/analysis-lm-framework.js";
import { ErrorModal } from "../modals/error-modal.js";

/**
 * AnalysisLM Stage Form
 * 
 * A stage form component for the Multi-Stage Document Framework that integrates the AnalysisLM Framework.
 * This replaces the placeholder StageFormRfpPlaceholderStage1 for the rfp_question_list_new_framework task type.
 */
export default class StageFormAnalysisLMInitialReview {
  /**
   * Constructor
   * @param {object} docTaskInstance - The document task instance.
   * @param {object} jobController - The job controller.
   */
  constructor(docTaskInstance, jobController) {
    console.log("[StageFormAnalysisLMInitialReview] constructor called");
    this.docTaskInstance = docTaskInstance;
    this.jobController = jobController;
    this.domContainer = null;
    this.analysisLMFramework = null;

    // Static process definition ID for this stage
    this.processDefId = 'rfp_initial_review';
    this.errorModal = new ErrorModal();

    // Get the current stageId
    const currentStageIndex = docTaskInstance.currentStageIndex || 0;
    this.currentStageId = docTaskInstance.stages?.[currentStageIndex]?.stageId || "rfp_stage_2_initial_review";

    // Initialize using shared helper
    FormStageHelper.initializeStageData(this.docTaskInstance, this.currentStageId);

    console.log(`[StageFormAnalysisLMInitialReview] Initialized with stageId: ${this.currentStageId}`);
  }

  /**
   * Render the stage form.
   * @param {HTMLElement} containerEl - The container element to render in.
   */
  async render(containerEl) {
    console.log("[StageFormAnalysisLMInitialReview] render() called");
    this.domContainer = containerEl;

    // Clear container and render header structure
    this.domContainer.innerHTML = `
      <div class="stage-form analysis-lm-stage">
        <div class="stage-header">
          <h3>RFP Initial Review</h3>
          <p>This tool helps analyze RFP questions before answering them by identifying key requirements, evaluation criteria, and providing guidance on appropriate responses.</p>
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
        console.log(`[StageFormAnalysisLMInitialReview] Displaying cached results for stage ${this.currentStageId}`);
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
    const analysisContainer = this.domContainer.querySelector("#analysis-lm-container");
    if (analysisContainer) {
      FormStageHelper.displayPermissionError(analysisContainer, message);
    }
  }

  /**
   * Handle when results are displayed.
   * @param {object} results - The displayed results.
   * @private
   */
  _handleResultsDisplayed(results) {
    console.log(`[StageFormAnalysisLMInitialReview] Results displayed for stage ${this.currentStageId}:`, results);

    // Update docTaskInstance with the results using shared helper
    FormStageHelper.updateStageResults(this.docTaskInstance, this.currentStageId, results);

    // Update stage UI status
    this._updateStageStatus();

    // Refresh document status indicators
    this.refreshDocUIIndicatorsAggregateStatus();

    // Persist to tab manager
    if (window.tabManager) {
      window.tabManager.persistTabs();
      console.log(`[StageFormAnalysisLMInitialReview] Persisted results for stage ${this.currentStageId} to tab storage`);
    }
  }

  /**
   * Refresh document aggregate status - this is called by the framework when job status changes
   */
  refreshDocUIIndicatorsAggregateStatus() {
    //console.log("[StageFormAnalysisLMInitialReview] refreshDocUIIndicatorsAggregateStatus called");

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
    const canTransition = FormStageHelper.isStageCompleted(this.docTaskInstance, this.currentStageId);

    if (!canTransition) {
      this.errorModal.show({
        title: "Cannot Proceed",
        message: "You must complete the analysis before proceeding to the next stage."
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
      console.log(`[StageFormAnalysisLMInitialReview] Loaded data for stage ${this.currentStageId}`);
    }
  }
}