// File: ui/stages/stage-form-single-question.js
import { ErrorModal } from "../../ui/modals/error-modal.js";
import { MessageModal } from "../../ui/modals/message-modal.js";
import { updateDocument } from "../../api/documents.js";

/**
 * A single-question "stage form" that implements a simple `render(containerEl)` 
 * method. This fits into the MultiStageDocumentWithBreadcrumbOrchestrator dynamic import approach.
 */
export default class StageFormSingleQuestion {
  constructor(docTaskInstance, jobController) {
    console.log("[StageFormSingleQuestion] constructor called");
    this.docTaskInstance = docTaskInstance;
    this.jobController = jobController;

    // We'll store ephemeral UI state locally:
    this.question = this.docTaskInstance?.stageData?.question || "";
    this.guidance = this.docTaskInstance?.stageData?.guidance || "";
    this.selectedModule = this.docTaskInstance?.stageData?.selectedModule || null;

    this.categoriesList = []; // For Tagify example
    this.resourcesList = [];
    this.tagifyCategories = null;
    this.tagifyResources = null;
    this.domContainer = null;
  }

  /**
   * Called by MultiStageDocumentWithBreadcrumbOrchestrator with a <div> containerEl to render into.
   */
  render(containerEl) {
    this.domContainer = containerEl;

    // Build the HTML
    containerEl.innerHTML = `
      <div class="single-question-stage" style="padding:1rem; border:1px solid #999;">
        <h3>Single Question (Stage Form)</h3>
        <p style="color:#ccc;">Document Title: ${this.docTaskInstance.title}</p>

        <div class="form-group">
          <label>Question</label>
          <textarea id="questionField" rows="3"
                    placeholder="Type your question..."></textarea>
        </div>

        <button id="btnSubmitQuestion" class="btn btn--primary">
          Submit Question
        </button>

        <button id="btnToggleAdvanced" class="btn btn--secondary">Show Advanced</button>
        <div id="advancedSection" style="display:none; margin-top:10px;">
          <label for="guidanceInput">Guidance</label>
          <textarea id="guidanceInput" rows="2"
                    placeholder="Add additional guidance..."></textarea>

          <div style="margin:10px 0;">
            <label>Categories</label>
            <input id="categoriesInput" placeholder="Pick categories..."/>
          </div>
          <div style="margin:10px 0;">
            <label>Resource Types</label>
            <input id="resourcesInput" placeholder="Pick resource types..."/>
          </div>
        </div>

        <div id="answerContainer" style="display:none; margin-top:1rem;">
          <h4>Answer</h4>
          <div id="answerText" style="white-space: pre-wrap;"></div>
        </div>
      </div>
    `;

    // Hook up references
    const questionEl = containerEl.querySelector("#questionField");
    const guidanceEl = containerEl.querySelector("#guidanceInput");
    const btnSubmit = containerEl.querySelector("#btnSubmitQuestion");
    const btnToggleAdv = containerEl.querySelector("#btnToggleAdvanced");
    const advSection = containerEl.querySelector("#advancedSection");

    if (questionEl) {
      questionEl.value = this.question;
      questionEl.addEventListener("input", () => {
        this.question = questionEl.value;
        this.markDirty();
      });
    }
    if (guidanceEl) {
      guidanceEl.value = this.guidance;
      guidanceEl.addEventListener("input", () => {
        this.guidance = guidanceEl.value;
        this.markDirty();
      });
    }
    if (btnToggleAdv && advSection) {
      btnToggleAdv.addEventListener("click", () => {
        const show = (advSection.style.display === "none");
        advSection.style.display = show ? "block" : "none";
        btnToggleAdv.textContent = show ? "Hide Advanced" : "Show Advanced";
      });
    }
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => this.handleSubmitQuestion());
    }

    // Initialize Tagify if needed
    this.tagifyCategories = this.initTagify("#categoriesInput", this.categoriesList, containerEl);
    this.tagifyResources = this.initTagify("#resourcesInput", this.resourcesList, containerEl);

    // Pre-load tags from docTaskInstance.stageData
    if (this.tagifyCategories && Array.isArray(this.docTaskInstance.stageData?.categories)) {
      this.tagifyCategories.addTags(this.docTaskInstance.stageData.categories);
    }
    if (this.tagifyResources && Array.isArray(this.docTaskInstance.stageData?.resource_types)) {
      this.tagifyResources.addTags(this.docTaskInstance.stageData.resource_types);
    }
  }

  markDirty() {
    // Mark doc as dirty => so user can Save in the main doc’s header
    this.docTaskInstance.isDirty = true;
    this.updateStageData();
    
    // Trigger auto-save for stage data changes
    this._triggerAutoSave();

    // If you want to re-enable the "Save" button in the main doc header:
    // Because the main doc is a MultiStageDocumentBase (MultiStageDocumentWithBreadcrumbOrchestrator) 
    // we can do this safely:
    if (typeof this.docTaskInstance.__internalSaveHook === "function") {
      // This makes the header's "Save" button become enabled
      // (but doesn't actually save anything yet).
      this.docTaskInstance.__internalSaveHook("markDirtyOnly");
    }
  }

  updateStageData() {
    const docData = this.buildDocPayload();
    this.docTaskInstance.stageData = docData;

    // Also store into localStorage via tabManager
    window.tabManager?.persistTabs();
  }

  buildDocPayload() {
    const categories = this.tagifyCategories?.value?.map(o => o.value) || [];
    const resources = this.tagifyResources?.value?.map(o => o.value) || [];
    return {
      question: this.question,
      guidance: this.guidance,
      selectedModule: this.selectedModule,
      categories,
      resource_types: resources
    };
  }

  initTagify(selector, whitelist, containerEl) {
    if (typeof Tagify === "undefined") return null;
    const el = containerEl.querySelector(selector);
    if (!el) return null;
    const t = new Tagify(el, {
      whitelist,
      dropdown: { enabled: 0, maxItems: 999, closeOnSelect: false }
    });
    t.on("change", () => {
      this.markDirty();
    });
    return t;
  }

  async handleSubmitQuestion() {
    try {
      if (this.docTaskInstance.status === "RUNNING") {
        console.warn("[StageFormSingleQuestion] Already RUNNING, ignoring submit.");
        return;
      }
      // Possibly ensure doc is saved
      if (!this.docTaskInstance.isSaved) {
        // The main doc's save routine is docTaskInstance.__internalSaveHook
        if (typeof this.docTaskInstance.__internalSaveHook === "function") {
          await this.docTaskInstance.__internalSaveHook();
        }
      }
      // Mark status as running
      this.docTaskInstance.status = "RUNNING";
      window.tabManager?.persistTabs();

      // Example: start a job
      const payload = { request_type: "ad-hoc-question", ...this.buildDocPayload() };
      const jobResp = await this.jobController?.startJob(payload);
      if (jobResp?.answer) {
        this.showAnswer(jobResp.answer);
        this.docTaskInstance.status = "COMPLETED";
        window.tabManager?.persistTabs();

        // Possibly call updateDocument if needed
        if (this.docTaskInstance.documentId) {
          await updateDocument({
            document_id: this.docTaskInstance.documentId,
            status: "COMPLETED",
            percentage_complete: 100,
            modified_by: this.docTaskInstance.ownerUsername
          });
        }
      }
    } catch (err) {
      console.error("[StageFormSingleQuestion] handleSubmitQuestion => error:", err);
      this.docTaskInstance.status = "FAILED";
      window.tabManager?.persistTabs();
      new ErrorModal().show({
        title: "Submission Failed",
        message: err.message || "An error occurred"
      });
    }
  }

  showAnswer(answer) {
    const answerContainer = this.domContainer?.querySelector("#answerContainer");
    const answerText = this.domContainer?.querySelector("#answerText");
    if (answerContainer && answerText) {
      answerText.textContent = answer;
      answerContainer.style.display = "block";
    }
  }

  /**
   * Trigger auto-save for stage data changes
   * Delegates to the document's auto-save system if available
   * @private
   */
  _triggerAutoSave() {
    try {
      // Look for auto-save capability in the document parent
      if (this.docTaskInstance.__parent && typeof this.docTaskInstance.__parent.triggerAutoSave === 'function') {
        console.log("[StageFormSingleQuestion] Triggering auto-save via document parent");
        this.docTaskInstance.__parent.triggerAutoSave();
      } else if (this.docTaskInstance.__document && typeof this.docTaskInstance.__document.triggerAutoSave === 'function') {
        console.log("[StageFormSingleQuestion] Triggering auto-save via document reference");
        this.docTaskInstance.__document.triggerAutoSave();
      } else {
        console.log("[StageFormSingleQuestion] No auto-save method found - changes will be saved manually");
      }
    } catch (error) {
      console.error("[StageFormSingleQuestion] Error triggering auto-save:", error);
    }
  }
}
