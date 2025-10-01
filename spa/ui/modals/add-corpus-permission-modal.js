// File: ui/modals/add-corpus-permission-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { getSubtenantAttributes, getCorpora } from "../../api/subtenants.js";

/**
 * AddCorpusPermissionModal
 * Allows selecting a corpus ID and one or more permissions to assign for that corpus.
 * The parent (UserModal) passes an onSubmit callback that receives (corpusId, permsArray).
 * 
 * UPDATED: Now dynamically fetches available corpora from SubtenantAttributes instead of hardcoded list
 */
export class AddCorpusPermissionModal extends AsyncFormModal {
  /**
   * @param {object} options
   *   onSubmit(corpusId, selectedPerms)
   *   subtenantCache (optional) - pre-populated cache to avoid API calls
   */
  constructor(options = {}) {
    super();
    this.onSubmit = options.onSubmit || (() => {});
    this.subtenantCache = options.subtenantCache || null;
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    // REMOVED: Hardcoded corpus list
    // this.availableCorpusIds = ["rfp", "rfplite", "sales", "internal", "partners"];
    
    // ADDED: Dynamic corpus data
    this.corpusConfig = null;
    this.availableCorpusIds = [];
    
    // Available corpus-level permissions
    this.availableCorpusPermissions = [
      "AD_HOC",
      "EMAIL",
      "BATCH",
      "ANSWER_SCORER",
      "CORPUS_VIEWER",
      "CORPUS_EDITOR",
      "CORPUS_VIEW_DOC"
    ];

    this._buildDOM();
  }

  /**
   * ADDED: Load subtenant data to get available corpora
   */
  async _loadSubtenantData() {
    try {
      console.log("[AddCorpusPermissionModal] _loadSubtenantData() called");
      
      // If we have a pre-populated cache, use it instead of making an API call
      if (this.subtenantCache) {
        console.log("[AddCorpusPermissionModal] Using pre-populated subtenant cache");
        this.corpusConfig = this.subtenantCache.corpus_config || {};
      } else {
        // Fallback to API call if no cache was provided
        console.log("[AddCorpusPermissionModal] No pre-populated cache, fetching from API");
        
        // Fetch corpus config
        const attrs = await getSubtenantAttributes(["corpus_config"]);
        this.corpusConfig = attrs.corpus_config || {};
      }
      
      console.log("[AddCorpusPermissionModal] Loaded corpus config:", this.corpusConfig);
      
      // Extract available corpus IDs
      this.availableCorpusIds = getCorpora(this.corpusConfig);
      console.log(`[AddCorpusPermissionModal] Found ${this.availableCorpusIds.length} available corpora:`, this.availableCorpusIds);
      
      // Populate the corpus dropdown
      this._populateCorpusDropdown();
      
    } catch (err) {
      console.error("[AddCorpusPermissionModal] Error loading subtenant data:", err);
      this.errorModal.show({
        title: "Error",
        message: "Failed to load available corpora: " + err.message
      });
    }
  }

  /**
   * ADDED: Populate corpus dropdown with dynamic data
   */
  _populateCorpusDropdown() {
    console.log("[AddCorpusPermissionModal] _populateCorpusDropdown() called");
    
    // Clear previous options
    this.corpusSelect.innerHTML = "";
    
    // Add empty default option
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "-- Select Corpus --";
    this.corpusSelect.appendChild(emptyOption);
    
    // Add corpus options
    this.availableCorpusIds.forEach((corpusId) => {
      const opt = document.createElement("option");
      opt.value = corpusId;
      
      // Use corpus name if available, otherwise use the ID
      if (this.corpusConfig && 
          this.corpusConfig.corpora && 
          this.corpusConfig.corpora[corpusId] && 
          this.corpusConfig.corpora[corpusId].name) {
        opt.textContent = `${this.corpusConfig.corpora[corpusId].name} (${corpusId})`;
      } else {
        opt.textContent = corpusId;
      }
      
      this.corpusSelect.appendChild(opt);
    });
    
    console.log(`[AddCorpusPermissionModal] Populated dropdown with ${this.availableCorpusIds.length} corpus options`);
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form add-corpus-permission-modal";
    this.modalEl.style.display = "none";
  
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close Add Corpus Permission">&times;</button>
      <h2>Add Corpus Permission</h2>
  
      <div class="form-group">
        <label>Select Corpus</label>
        <select id="acpCorpusSelect" class="doc-input">
          <option value="">Loading corpora...</option>
        </select>
      </div>
  
      <div class="form-group">
        <label>Select Permissions</label>
        <div id="acpPermsContainer" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
      </div>
  
      <div id="acpErrorMessage" class="error-message" style="color: red; margin-top: 10px; display: none;"></div>
  
      <!-- Wrap these two in a button-group -->
      <div class="button-group" style="margin-top:1rem;">
        <button type="button" class="btn" id="acpCancelBtn">Cancel</button>
        <button type="button" class="btn btn--primary" id="acpSubmitBtn">Add</button>
      </div>
    `;
  
    document.body.appendChild(this.modalEl);
  
    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => this.hide());
  
    this.corpusSelect = this.modalEl.querySelector("#acpCorpusSelect");
    this.permsContainer = this.modalEl.querySelector("#acpPermsContainer");
    this.errorMessage = this.modalEl.querySelector("#acpErrorMessage");
  
    // REMOVED: Static corpus population
    // fill corpus select dropdown
    // this.availableCorpusIds.forEach((cid) => { ... });
  
    // fill permissions checkboxes
    this.availableCorpusPermissions.forEach((perm) => {
      const label = document.createElement("label");
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "4px";
      label.style.marginRight = "8px";
  
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.perm = perm;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(perm));
      this.permsContainer.appendChild(label);
    });
  
    const cancelBtn = this.modalEl.querySelector("#acpCancelBtn");
    cancelBtn.addEventListener("click", () => this.hide());
    
    const submitBtn = this.modalEl.querySelector("#acpSubmitBtn");
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  /**
   * UPDATED: Enhanced show method to load corpus data
   */
  async show() {
    super.show();
    
    // Reset form state
    this.corpusSelect.value = "";
    this.permsContainer.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.checked = false;
    });
    this.showError("");
    
    // Lock UI while loading data
    this.lockButtons();
    
    try {
      // Load corpus data
      await this._loadSubtenantData();
    } finally {
      // Unlock UI
      this.unlockButtons();
    }
  }

  /**
   * Handle submission of corpus permission
   */
  handleSubmit() {
    try {
      // Clear any previous error messages
      this.showError("");
      
      const corpusId = this.corpusSelect.value;
      if (!corpusId) {
        this.showError("Please select a corpus");
        return;
      }
      
      // Get selected permissions
      const selectedPerms = [];
      this.permsContainer.querySelectorAll("input[type='checkbox']").forEach((cb) => {
        if (cb.checked) {
          selectedPerms.push(cb.dataset.perm);
        }
      });
      
      // Validate at least one permission is selected
      if (selectedPerms.length === 0) {
        this.showError("Please select at least one permission");
        return;
      }
      
      console.log("[AddCorpusPermissionModal] Submitting with corpusId:", corpusId, 
                  "selectedPerms:", selectedPerms);
      
      // Lock UI during submission
      this.lockButtons();
      
      // Call the onSubmit callback provided by parent component
      if (this.onSubmit) {
        this.onSubmit(corpusId, selectedPerms);
      }
      
    } catch (error) {
      console.error("[AddCorpusPermissionModal] Error in handleSubmit:", error);
      this.showError(error.message || "An error occurred while adding corpus permission");
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