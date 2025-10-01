// File: ui/stages/stage-form-rfp-placeholder-stage2.js
/**
 * Placeholder for RFP question list, stage 2
 */
export default class StageFormRfpPlaceholderStage2 {
  constructor(docTaskInstance, jobController) {
    console.log("[StageFormRfpPlaceholderStage2] constructor");
    this.docTaskInstance = docTaskInstance;
    this.jobController = jobController;
    this.domContainer = null;
  }

  render(containerEl) {
    console.log("[StageFormRfpPlaceholderStage2] render() called");
    this.domContainer = containerEl;
    containerEl.innerHTML = `
      <div class="doc-container" style="border:2px dashed #999;">
        <h3>RFP Stage Placeholder</h3>
        <p style="color:#ccc;">Document Title: ${this.docTaskInstance.title}</p>
        <p>Main Qn List (Placeholder). No real form here yet.</p>
      </div>
    `;
  }
}
