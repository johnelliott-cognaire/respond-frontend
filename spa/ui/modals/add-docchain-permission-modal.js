// File: ui/modals/add-docchain-permission-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { fetchProcessDefinitions } from "../../api/analysis-lm.js";

/**
 * AddAnalysisLMPermissionModal
 * Allows selecting a single AnalysisLM permission to assign.
 * The parent (UserModal) passes onSubmit(docPerm) and existingPermissions array.
 */
export class AddDocchainPermissionModal extends AsyncFormModal {
  /**
   * @param {object} options
   *   onSubmit(docPerm)
   *   existingPermissions - Array of process IDs already assigned to the user
   */
  constructor(options = {}) {
    super();
    this.onSubmit = options.onSubmit || (() => {});
    this.existingPermissions = options.existingPermissions || [];
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    // Will be populated from API
    this.availableProcessDefinitions = [];
    this.isLoading = false;

    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form add-docchain-permission-modal";
    this.modalEl.style.display = "none";
  
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close Add AnalysisLM Permission">&times;</button>
      <h2>Add AnalysisLM Permission</h2>
  
      <div class="form-group">
        <label>Select AnalysisLM Process</label>
        <select id="adpDocchainSelect" class="doc-input">
          <option value="">Loading process definitions...</option>
        </select>
      </div>
  
      <div id="adpErrorMessage" class="error-message" style="color: red; margin-top: 10px; display: none;"></div>
  
      <!-- Wrap these two buttons in a button-group -->
      <div class="button-group">
        <button type="button" class="btn" id="adpCancelBtn">Cancel</button>
        <button type="button" class="btn btn--primary" id="adpSubmitBtn" disabled>Add</button>
      </div>
    `;
  
    document.body.appendChild(this.modalEl);
  
    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => this.hide());
  
    this.docchainSelect = this.modalEl.querySelector("#adpDocchainSelect");
    this.errorMessage = this.modalEl.querySelector("#adpErrorMessage");
    this.submitBtn = this.modalEl.querySelector("#adpSubmitBtn");
  
    // Load process definitions from API when modal is created
    this.loadProcessDefinitions();
  
    const cancelBtn = this.modalEl.querySelector("#adpCancelBtn");
    cancelBtn.addEventListener("click", () => this.hide());
    const submitBtn = this.modalEl.querySelector("#adpSubmitBtn");
    submitBtn.addEventListener("click", () => this.handleSubmit());

    // Enable submit button when a selection is made
    this.docchainSelect.addEventListener("change", () => {
      this.submitBtn.disabled = !this.docchainSelect.value;
    });
  }

  /**
   * Load process definitions from the API and populate the select dropdown
   */
  async loadProcessDefinitions() {
    try {
      this.isLoading = true;
      this.showError(""); // Clear any previous errors
      
      // Update UI to show loading state
      this.docchainSelect.innerHTML = '<option value="">Loading process definitions...</option>';
      this.submitBtn.disabled = true;
      
      console.log("[AddAnalysisLMPermissionModal] Loading process definitions from API");
      
      // Fetch process definitions from the API (latest versions only)
      this.availableProcessDefinitions = await fetchProcessDefinitions(false);
      
      console.log("[AddAnalysisLMPermissionModal] Loaded process definitions:", this.availableProcessDefinitions);
      
      // Clear the select and add default option
      this.docchainSelect.innerHTML = '<option value="">Select an AnalysisLM process...</option>';
      
      // Filter out already assigned permissions
      const unassignedProcessDefinitions = this.availableProcessDefinitions.filter(
        processDef => !this.existingPermissions.includes(processDef.process_def_id)
      );
      
      console.log("[AddAnalysisLMPermissionModal] Filtered process definitions:", {
        total: this.availableProcessDefinitions.length,
        existing: this.existingPermissions,
        available: unassignedProcessDefinitions.length
      });
      
      // Populate with filtered process definitions
      if (unassignedProcessDefinitions.length === 0) {
        this.docchainSelect.innerHTML = '<option value="">No unassigned process definitions available</option>';
        this.showError(this.availableProcessDefinitions.length === 0 
          ? "No AnalysisLM process definitions are available for your account."
          : "All available AnalysisLM process definitions are already assigned to this user.");
      } else {
        unassignedProcessDefinitions.forEach((processDef) => {
          const opt = document.createElement("option");
          opt.value = processDef.process_def_id;
          
          // Show both ID and description if available
          const displayText = processDef.description && processDef.description.trim()
            ? `${processDef.process_def_id} - ${processDef.description}`
            : processDef.process_def_id;
          
          opt.textContent = displayText;
          this.docchainSelect.appendChild(opt);
        });
      }
      
    } catch (error) {
      console.error("[AddAnalysisLMPermissionModal] Failed to load process definitions:", error);
      this.docchainSelect.innerHTML = '<option value="">Failed to load process definitions</option>';
      this.showError(`Failed to load AnalysisLM process definitions: ${error.message}`);
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Handle form submission
   */
  handleSubmit() {
    try {
      // Clear any previous error
      this.showError("");
      
      const docPerm = this.docchainSelect.value;
      if (!docPerm) {
        this.showError("Please select an AnalysisLM process");
        return;
      }
      
      console.log("[AddAnalysisLMPermissionModal] Submitting with docPerm:", docPerm);
      
      // Lock UI during submission
      this.lockButtons();
      
      // Call the onSubmit callback provided by parent component
      if (this.onSubmit) {
        this.onSubmit(docPerm);
      }
      
    } catch (error) {
      console.error("[AddAnalysisLMPermissionModal] Error in handleSubmit:", error);
      this.showError(error.message || "An error occurred while adding AnalysisLM permission");
      this.unlockButtons();
      // Don't hide the modal in case of error
    }
  }
  
  /**
   * Show an error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    if (!this.errorMessage) return;
    
    if (message && message.trim() !== "") {
      this.errorMessage.textContent = message;
      this.errorMessage.style.display = "block";
    } else {
      this.errorMessage.textContent = "";
      this.errorMessage.style.display = "none";
    }
  }
  
  /**
   * Lock all buttons in the modal during processing
   */
  lockButtons() {
    const buttons = this.modalEl.querySelectorAll("button");
    buttons.forEach(btn => {
      btn.disabled = true;
    });
  }
  
  /**
   * Unlock all buttons in the modal after processing
   */
  unlockButtons() {
    const buttons = this.modalEl.querySelectorAll("button");
    buttons.forEach(btn => {
      btn.disabled = false;
    });
  }
}