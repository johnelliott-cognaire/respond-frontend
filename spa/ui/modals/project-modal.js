// File: ui/modals/project-modal.js

import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { YesNoModal } from "./yesno-modal.js";
import { Security } from "../../state/security.js";
import { verifyPermission, getFreshSecurity } from "../../utils/security-utils.js";
import { getProject, updateProject } from "../../api/projects-accounts.js";
import { addProject } from "../../api/projects-add.js";
import { UsersModal } from "./users-modal.js";
import { DocumentsModal } from "./documents-modal.js";
import { AccountModal } from "./account-modal.js";
import { ProjectsModal } from "./projects-modal.js";
import {
  getSubtenantAttributes,
  getCorpora,
  getLabelFriendlyName
} from "../../api/subtenants.js";
import formatHumanReadableDate from "../../utils/date-utils.js";


export class ProjectModal extends AsyncFormModal {
  /**
   * @param {object} store - Application state store
   * @param {string} projectId - The project id (e.g. "LDM")
   * @param {string} accountId - The account id (e.g. "IAG")
   * @param {string} sourceModal - The source modal ('projects' if came from projects-modal)
   */
  constructor(store, projectId, accountId, sourceModal) {
    super();

    // DEBUG: Log exactly what parameters we receive
    console.log("[ProjectModal] Constructor called with:");
    console.log("  - projectId:", projectId);
    console.log("  - accountId:", accountId);
    console.log("  - sourceModal:", sourceModal);

    this.store = store;
    this.projectId = projectId;
    this.accountId = accountId;
    this.sourceModal = sourceModal;
    // Optionally, store the composite for internal use (handle null projectId for new mode):
    this.composite = projectId ? `${accountId}#${projectId}` : `${accountId}#new`;

    console.log("[ProjectModal] Computed composite:", this.composite);

    this.mode = "view"; // "view", "edit", or "new"
    this.dirty = false;
    this.projectData = null;
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.yesNoModal = new YesNoModal();
    this.security = getFreshSecurity(store);
    this.newProjectAccountId = null; // For new projects
    this.corpusConfig = null;
    this.labelFriendlyNames = null;
    this.defaultCorpus = "";
    this._buildDOM();
  }

  // Allow setting new mode with a known account
  setNewMode(isNew, accountId) {
    if (isNew) {
      this.mode = "new";
      if (accountId) {
        this.newProjectAccountId = accountId;
      }
    }
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--narrow project-modal";
    this.modalEl.style.display = "none";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close Project Modal">&times;</button>
      <h2 id="projectModalTitle">Project Details</h2>

      <form id="projectForm" class="async-form">
        <div class="form-group">
          <label for="projIdField">Project ID</label>
          <input type="text" id="projIdField" class="doc-input" disabled />
        </div>
        <div class="form-group">
          <label for="projNameField">Project Name</label>
          <input type="text" id="projNameField" class="doc-input" disabled />
        </div>
        <div class="form-group">
          <label for="projCodeField">Project Code</label>
          <input type="text" id="projCodeField" class="doc-input" disabled />
        </div>
        <div class="form-group">
          <label for="projAccountField">Account</label>
          <input type="text" id="projAccountField" class="doc-input" disabled />
        </div>
        <div class="form-group">
          <label for="projCorpusField">Corpus</label>
          <select id="projCorpusField" class="doc-input" disabled>
            <option value="">Loading…</option>
          </select>
        </div>
        <div class="form-group">
          <label for="projCreatedField">Created Date</label>
          <input type="text" id="projCreatedField" class="doc-input" disabled />
        </div>

        <div class="action-group action-group--right">
          <button type="button" class="btn" id="cancelBtn" disabled>Cancel</button>
          <button type="submit" class="btn btn--primary" id="saveBtn" disabled>Save Changes</button>
          <button type="button" class="btn btn--secondary" id="editModeBtn">Edit</button>
        </div>
      </form>

      <div class="action-group action-group--left">
        <button type="button" class="btn" id="manageUsersBtn">Manage Users</button>
        <button type="button" class="btn" id="viewDocsBtn">View Documents</button>
        <button type="button" class="btn" id="backToAccountBtn">Back to Account</button>
        <button type="button" class="btn" id="backToProjectsBtn" style="display: none;">Back to Projects</button>
      </div>
    `;
    document.body.appendChild(this.modalEl);

    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => this.hide());

    this.projectForm = this.modalEl.querySelector("#projectForm");
    this.editModeBtn = this.modalEl.querySelector("#editModeBtn");
    this.backToAccountBtn = this.modalEl.querySelector("#backToAccountBtn");
    this.backToProjectsBtn = this.modalEl.querySelector("#backToProjectsBtn");
    this.cancelBtn = this.modalEl.querySelector("#cancelBtn");
    this.saveBtn = this.modalEl.querySelector("#saveBtn");

    this.projIdField = this.modalEl.querySelector("#projIdField");
    this.projNameField = this.modalEl.querySelector("#projNameField");
    this.projCodeField = this.modalEl.querySelector("#projCodeField");
    this.projAccountField = this.modalEl.querySelector("#projAccountField");
    this.projCorpusField = this.modalEl.querySelector("#projCorpusField");
    this.projCorpusField.addEventListener("change", () => this.handleFieldChange());
    this.projCreatedField = this.modalEl.querySelector("#projCreatedField");

    this.manageUsersBtn = this.modalEl.querySelector("#manageUsersBtn");
    this.viewDocsBtn = this.modalEl.querySelector("#viewDocsBtn");

    this.editModeBtn.addEventListener("click", () => this.handleModeChange());
    this.backToAccountBtn.addEventListener("click", () => this.handleBackToAccount());
    this.backToProjectsBtn.addEventListener("click", () => this.handleBackToProjects());
    this.cancelBtn.addEventListener("click", () => this.handleCancel());
    this.projectForm.addEventListener("submit", (e) => this.handleSave(e));

    this.manageUsersBtn.addEventListener("click", () => this.handleManageUsers());
    this.viewDocsBtn.addEventListener("click", () => this.handleViewDocs());

    // Mark dirty on input
    this.projNameField.addEventListener("input", () => this.handleFieldChange());
    this.projCodeField.addEventListener("input", () => this.handleFieldChange());
  }

  async show(options = {}) {
    // In new mode, disable action buttons that don't make sense yet
    if (this.mode === "new") {
      if (this.manageUsersBtn) this.manageUsersBtn.disabled = true;
      if (this.viewDocsBtn) this.viewDocsBtn.disabled = true;
    }

    // Check permission before showing if we have a composite projectIdpr
    if (this.projectId && this.mode !== "new") {
      if (!this.security.canAccessProject(this.composite)) {
        this.errorModal.show({
          title: "Access Denied",
          message: `You do not have permission to view project: ${this.composite}`
        });
        return; // Don't call super.show() to prevent displaying the modal
      }
    }

    // Refresh security object
    this.security = getFreshSecurity(this.store);

    try {
      const attrs = await getSubtenantAttributes([
        "corpus_config",
        "label_friendly_names"
      ]);
      this.corpusConfig = attrs.corpus_config || {};
      this.labelFriendlyNames = attrs.label_friendly_names || {};
      this.defaultCorpus = this.corpusConfig.default_corpus || "";
    } catch (e) {
      console.warn("[ProjectModal] Unable to load corpus or labels:", e);
      this.corpusConfig = {};
      this.labelFriendlyNames = {};
    }

    super.show(options);

    if (this.projectId && this.mode !== "new") {
      try {
        await this.loadProjectData();
        this.renderProjectData();
        this.mode = "view";
      } catch (err) {
        // If we hit an error loading the project, don't show the modal
        console.error("[ProjectModal] Error loading project data:", err);
        this.hide();
        this.errorModal.show({
          title: "Error",
          message: "Failed to load project data: " + err.message
        });
        return;
      }
    } else if (this.mode === "new") {
      console.log("[ProjectModal] show() => new mode => prefill");
      
      const userObj = this.store.get("user") || {};
      const username = userObj.username || "guest";
      const resolvedAccountId = this.newProjectAccountId || this.accountId || "";
      
      this.projectData = {
        project_id: "",
        name: "",
        code: "",
        account_id: resolvedAccountId,
        composite: "",
        created_datetime: ""
      };
      this.renderProjectData();
      this.applyCorpusDefault();
    }
    this.updateUI();
  }

  /**
   * Loads project data from the back end.
   * Uses the provided accountId if available.
   */
  async loadProjectData() {
    try {
      this.lockFields();
      this.lockButtons();
      // Log both values
      console.log("[ProjectModal] Loading project data with projectId:", this.projectId, "accountId:", this.accountId);
      // Pass both projectId and accountId to getProject
      const response = await getProject(this.projectId, this.store, this.accountId);
      this.projectData = response.project || response;
      console.log("[ProjectModal] Loaded project data:", this.projectData);
      if (!this.projectData) {
        throw new Error("No project data returned from server");
      }
    } catch (err) {
      this.errorModal.show({ title: "Error Loading Project", message: err.message });
      throw err;
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }

  renderProjectData() {
    if (!this.projectData) return;

    this.projIdField.value = this.projectData.project_id || "";
    this.projNameField.value = this.projectData.name || "";
    this.projCodeField.value = this.projectData.code || this.projectData.project_code || "";
    this.projAccountField.value = this.projectData.account_id || "";

    // Format the date using our utility
    this.projCreatedField.value = formatHumanReadableDate(this.projectData.created_datetime || "");

    // Store the target corpus value
    const targetCorpus = this.projectData.corpus || "";
    console.log("[ProjectModal] renderProjectData - target corpus:", targetCorpus);

    // Populate dropdown first
    this.populateCorpusDropdown();

    // Set the corpus value after a brief delay to ensure options are populated
    setTimeout(() => {
      if (targetCorpus) {
        this.projCorpusField.value = targetCorpus;
        console.log("[ProjectModal] Set corpus to:", this.projCorpusField.value);

        // Verify it was set correctly
        if (this.projCorpusField.value !== targetCorpus) {
          console.warn("[ProjectModal] Corpus not set correctly! Expected:", targetCorpus, "Got:", this.projCorpusField.value);
          console.warn("[ProjectModal] Available options:");
          for (let i = 0; i < this.projCorpusField.options.length; i++) {
            console.warn(`  ${i}: "${this.projCorpusField.options[i].value}"`);
          }
        }
      }
    }, 10); // Small delay to ensure DOM is updated
  }

  populateCorpusDropdown() {
    const select = this.projCorpusField;
    const currentValue = select.value; // Preserve current selection

    select.innerHTML = ""; // clear old options

    const corpusIds = getCorpora(this.corpusConfig);
    console.log("[ProjectModal] populateCorpusDropdown - available corpora:", corpusIds);

    if (!corpusIds.length) {
      select.innerHTML = `<option value="">— no corpora available —</option>`;
      return;
    }

    // Add the mandatory selection prompt
    const defaultOption = new Option("— select corpus (required) —", "");
    defaultOption.disabled = true; // Make it unselectable after initial load
    select.appendChild(defaultOption);

    // Add corpus options
    corpusIds.forEach(id => {
      const label = getLabelFriendlyName(this.labelFriendlyNames, id);
      select.appendChild(new Option(label, id));
    });

    // Restore previous selection if it still exists
    if (currentValue && corpusIds.includes(currentValue)) {
      select.value = currentValue;
      console.log("[ProjectModal] Restored previous corpus selection:", currentValue);
    }
  }

  /**
   * Enhanced applyCorpusDefault - now only for editing existing projects
   */
  applyCorpusDefault() {
    // Only apply defaults when editing existing projects, not for new projects
    if (this.mode === "new") {
      console.log("[ProjectModal] New project mode - user must manually select corpus");
      return;
    }

    const ids = getCorpora(this.corpusConfig);
    console.log("[ProjectModal] applyCorpusDefault - available corpora:", ids);

    // Only set default if there's exactly one corpus available
    if (ids.length === 1) {
      this.projCorpusField.value = ids[0];
      console.log("[ProjectModal] Only one corpus available, auto-selected:", ids[0]);

      // Trigger change event to mark as dirty
      this.projCorpusField.dispatchEvent(new Event('change'));
    }
  }

  handleModeChange() {
    if (this.mode === "view") {
      // canEditProject - only check permissions if we have an existing project
      if (this.projectData && this.projectData.project_id) {
        if (!this.security.canEditProject(this.projectData.project_id)) {
          this.errorModal.show({
            title: "Permission Denied",
            message: `You do not have permission to edit project: ${this.projectData.project_id}`
          });
          return;
        }
      } else {
        console.warn("[ProjectModal] handleModeChange => no valid project data, ignoring");
        return;
      }
      this.mode = "edit";
      this.dirty = false;
    } else if (this.mode === "new") {
      // Allow transition from new to edit mode for new projects
      console.log("[ProjectModal] transitioning from new to edit mode for new project");
      this.mode = "edit";
      // For new projects, don't set dirty=false since user needs to enter data
      // this.dirty = false; // Removed - let user input drive dirty state
    } else {
      // Edit mode => switch back to view mode
      this.mode = "view";
      this.dirty = false;
    }
    this.updateUI();
  }

  handleBackToAccount() {
    // Get the account ID from the project data
    const accountId = this.projectData?.account_id || this.newProjectAccountId;

    if (!accountId) {
      console.warn("[ProjectModal] handleBackToAccount: No account ID available");
      return;
    }

    console.log("[ProjectModal] handleBackToAccount => accountId:", accountId);

    // Check if the user has permission to access the account
    if (!this.security.canAccessAccount(accountId)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to access account: ${accountId}`
      });
      return;
    }

    // Set programmatic navigation flag to prevent URL reversion
    this._programmaticNavigation = true;

    // Use modal-to-modal navigation to preserve origin context
    const accountUrl = `/modals/account/${accountId}`;
    this.navigateToModal(accountUrl);
  }

  handleBackToProjects() {
    // Get the account ID to show projects for that account
    const accountId = this.projectData?.account_id || this.newProjectAccountId;

    if (!accountId) {
      console.warn("[ProjectModal] handleBackToProjects: No account ID available");
      // If no account ID, show all projects (this shouldn't happen in normal flow)
      const projectsUrl = `/modals/projects`;
      this.navigateToModal(projectsUrl);
      return;
    }

    console.log("[ProjectModal] handleBackToProjects => accountId:", accountId);

    // Check if the user has permission to access the account
    if (!this.security.canAccessAccount(accountId)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to access projects for account: ${accountId}`
      });
      return;
    }

    // Use modal-to-modal navigation to preserve origin context
    const projectsUrl = `/modals/projects/${accountId}`;
    this.navigateToModal(projectsUrl);
  }

  handleFieldChange() {
    if (this.mode === "edit" || this.mode === "new") {
      this.dirty = true;
      this.saveBtn.disabled = false;

      // Remove corpus error styling when user selects a corpus
      if (this.projCorpusField.value && this.projCorpusField.value !== "— select —") {
        this.projCorpusField.style.borderColor = '';
        this.projCorpusField.style.boxShadow = '';
      }
    }
  }

  /**
   * Enhanced project code generation algorithm (client-side)
   * Similar to server-side project_id generation but for project codes
   */
  generateProjectCode(projectName) {
    if (!projectName || typeof projectName !== 'string') return '';

    const cleanName = projectName.trim();
    console.log("[ProjectModal] Generating code for:", cleanName);

    // Extract trailing number if present
    const trailingNumberMatch = cleanName.match(/^(.+?)\s*(\d+)$/);
    const baseName = trailingNumberMatch ? trailingNumberMatch[1].trim() : cleanName;
    const trailingNumber = trailingNumberMatch ? trailingNumberMatch[2] : null;

    console.log("[ProjectModal] Base name:", baseName, "Trailing number:", trailingNumber);

    // Split into words and clean them
    const words = baseName.split(/[^\w\d]+/).filter(word => word.trim().length > 0);
    if (words.length === 0) return 'PRJ';

    console.log("[ProjectModal] Words extracted:", words);

    // Generate base code using same algorithm as server-side project_id
    let baseCode = '';

    // Strategy 1: First letter of each word
    const firstLetters = words.map(word => word[0].toUpperCase()).join('');

    if (firstLetters.length >= 3) {
      // If we have 3+ letters, use first 3
      baseCode = firstLetters.substring(0, 3);
    } else {
      // If < 3 letters, pad with additional letters from words
      baseCode = firstLetters;

      // Add more letters from the words to reach 3 characters
      for (const word of words) {
        if (baseCode.length >= 3) break;

        // Add remaining letters from this word
        for (let i = 1; i < word.length; i++) {
          if (baseCode.length >= 3) break;
          const letter = word[i].toUpperCase();
          if (!baseCode.includes(letter)) { // Avoid duplicates
            baseCode += letter;
          }
        }
      }

      // If still < 3, pad with letters from first word
      if (baseCode.length < 3 && words[0]) {
        for (let i = 1; i < words[0].length; i++) {
          if (baseCode.length >= 3) break;
          baseCode += words[0][i].toUpperCase();
        }
      }
    }

    // Ensure at least 3 characters, pad with 'X' if necessary
    baseCode = baseCode.substring(0, 3).padEnd(3, 'X');

    // Add trailing number if present
    const finalCode = trailingNumber ? `${baseCode}${trailingNumber}` : baseCode;

    console.log("[ProjectModal] Generated project code:", finalCode);
    return finalCode;
  }

  async handleSave(e) {
    e.preventDefault();
    if (this.mode !== "edit" && this.mode !== "new") return;

    try {
      this.lockFields();
      this.lockButtons();

      const newName = this.projNameField.value.trim();
      let newCode = this.projCodeField.value.trim();
      
      const accountId = this.projectData?.account_id || this.newProjectAccountId || this.accountId;

      if (!accountId) {
        throw new Error("Account ID is required to save a project");
      }

      // MANDATORY: Validate project name
      if (!newName) {
        throw new Error("Project name is required");
      }

      // Handle project code generation/confirmation
      const codeNeedsGeneration = !newCode && newName;
      if (codeNeedsGeneration) {
        const autoGeneratedCode = this.generateProjectCode(newName);

        // Show user confirmation dialog for auto-generated code
        const userConfirmed = await this.confirmProjectCode(autoGeneratedCode, newName);
        if (!userConfirmed) {
          // User chose to enter their own code
          this.unlockFields();
          this.unlockButtons();
          this.projCodeField.focus();
          return;
        }

        // User confirmed, use the generated code
        newCode = autoGeneratedCode;
        this.projCodeField.value = newCode;
      }

      // SIMPLIFIED CORPUS VALIDATION - No complex default logic
      const chosen = this.projCorpusField.value;

      console.log("[ProjectModal] CORPUS VALIDATION (Simplified):");
      console.log("  Raw corpus value:", chosen);
      console.log("  Corpus type:", typeof chosen);
      console.log("  Selected index:", this.projCorpusField.selectedIndex);
      console.log("  Selected option:", this.projCorpusField.options[this.projCorpusField.selectedIndex]);

      // Simple validation - corpus is mandatory
      // Changed: Removed trimming and complex logic that might cause issues
      if (!chosen || chosen === "" || chosen === "— select —" || chosen === "— select corpus (required) —") {
        // Highlight the corpus field to draw attention
        this.projCorpusField.style.borderColor = '#dc3545';
        this.projCorpusField.style.boxShadow = '0 0 0 0.2rem rgba(220, 53, 69, 0.25)';

        throw new Error("Corpus selection is required. Please select a corpus from the dropdown before saving.");
      }

      // Remove any error styling
      this.projCorpusField.style.borderColor = '';
      this.projCorpusField.style.boxShadow = '';

      console.log("[ProjectModal] Validation passed - corpus:", chosen, "code:", newCode);

      if (!this.projectId || !this.projectData?.project_id) {
        // Creating a new project - Verify user has permission to create projects in this account
        if (!this.security.canEditAccount(accountId) &&
          !this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
          throw new Error(`You don't have permission to create projects in account ${accountId}`);
        }

        // SIMPLIFIED PAYLOAD - Direct mapping without complex logic
        const payload = {
          account_id: accountId,
          name: newName,
          code: newCode,
          corpus: chosen  // Direct assignment - no trimming or modification
        };

        console.log("[ProjectModal] Creating new project with simplified payload:", payload);
        console.log("[ProjectModal] Payload corpus value:", payload.corpus);
        console.log("[ProjectModal] Payload corpus type:", typeof payload.corpus);

        const result = await addProject(payload, this.store);

        console.log("[ProjectModal] new project created =>", result);
        this.projectData = result.project || result;
        this.projectId = this.projectData.project_id;

        // Sync the new project with the user's permissions
        if (this.projectData.project_id && this.projectData.account_id) {
          await import("../../state/local-permissions.js").then(module => {
            module.syncAfterProjectCreation(this.store, this.projectData);
          });
        }

        this.mode = "view";
        this.dirty = false;
        this.renderProjectData();

      } else {
        // Update existing project
        if (!this.security.canEditProject(this.projectId)) {
          throw new Error(`You don't have permission to edit project ${this.projectId}`);
        }

        const payload = {
          project_id: this.projectId,
          name: newName,
          code: newCode,
          corpus: chosen,  // Direct assignment
          account_id: this.projectData.account_id || this.accountId
        };

        await updateProject(payload, this.store);
        console.log("[ProjectModal] project updated successfully");
        await this.loadProjectData();
        this.renderProjectData();
        this.mode = "view";
        this.dirty = false;
      }

      this.messageModal.show({
        title: "Success",
        message: "Project saved successfully!"
      });

    } catch (err) {
      console.error("[ProjectModal] Save error:", err);
      this.errorModal.show({
        title: "Error Saving Project",
        message: err.message
      });
    } finally {
      this.unlockFields();
      this.unlockButtons();
      this.updateUI();
    }
  }

  /**
   * Show user confirmation dialog for auto-generated project code
   */
  async confirmProjectCode(generatedCode, projectName) {
    return new Promise((resolve) => {
      this.yesNoModal.show({
        title: "Confirm Project Code",
        message: `
          <p>Based on your project name "<strong>${projectName}</strong>", we've generated the project code:</p>
          <p style="text-align: center; font-size: 1.2em; font-weight: bold; color: #007bff; margin: 1em 0;">
            ${generatedCode}
          </p>
          <p>Would you like to use this code, or would you prefer to enter your own?</p>
          <p><small><em>Note: Project codes can be changed later, but project IDs cannot.</em></small></p>
        `,
        isHtml: true,
        yesText: "Use Generated Code",
        noText: "Enter My Own",
        onYes: () => {
          console.log("[ProjectModal] User confirmed generated code:", generatedCode);
          resolve(true);
        },
        onNo: () => {
          console.log("[ProjectModal] User rejected generated code, will enter their own");
          resolve(false);
        }
      });
    });
  }

  handleCancel() {
    if (this.mode === "edit") {
      this.mode = "view";
      this.dirty = false;
      if (this.projectData) {
        this.renderProjectData();
      }
    } else if (this.mode === "new") {
      this.hide();
    }
    this.updateUI();
  }

  updateUI() {
    // Update modal title based on mode
    const titleElement = this.modalEl.querySelector("#projectModalTitle");
    if (titleElement) {
      if (this.mode === "new") {
        titleElement.textContent = "New Project";
      } else if (this.mode === "edit") {
        titleElement.textContent = this.projectData?.project_id 
          ? `Edit Project: ${this.projectData.project_id}`
          : "Edit Project";
      } else {
        titleElement.textContent = this.projectData?.project_id 
          ? `Project: ${this.projectData.project_id}`
          : "Project Details";
      }
    }

    // First, update Back to Account button visibility
    const hasAccount = this.projectData?.account_id || this.newProjectAccountId;
    if (this.backToAccountBtn) {
      this.backToAccountBtn.disabled = !hasAccount;
    }

    // Always make sure created date is disabled
    this.projCreatedField.disabled = true;

    // Clear all field state classes first
    const allFields = [this.projIdField, this.projNameField, this.projCodeField, this.projAccountField, this.projCorpusField, this.projCreatedField];
    allFields.forEach(field => {
      if (field) {
        field.classList.remove('field-readonly', 'field-editable', 'field-locked');
      }
    });

    if (this.mode === "view") {
      // Show Edit button in view mode
      this.editModeBtn.style.display = "inline-flex";
      this.editModeBtn.textContent = "Edit";
      
      this.projIdField.disabled = true;
      this.projNameField.disabled = true;
      this.projCodeField.disabled = true;
      this.projAccountField.disabled = true;
      this.projCorpusField.disabled = true;
      
      // Apply field state classes for view mode
      this.projIdField.classList.add('field-readonly');     // Always read-only
      this.projNameField.classList.add('field-locked');     // Editable but locked in view mode
      this.projCodeField.classList.add('field-locked');     // Editable but locked in view mode
      this.projAccountField.classList.add('field-readonly'); // Always read-only
      this.projCorpusField.classList.add('field-locked');   // Editable but locked in view mode
      this.projCreatedField.classList.add('field-readonly'); // Always read-only
      
      // Show Cancel button or Back to Projects button based on source
      if (this.sourceModal === 'projects') {
        this.cancelBtn.style.display = "none";
        this.backToProjectsBtn.style.display = "inline-flex";
        this.backToProjectsBtn.disabled = false;
      } else {
        this.cancelBtn.style.display = "inline-flex";
        this.cancelBtn.disabled = true;
        this.backToProjectsBtn.style.display = "none";
      }
      
      this.saveBtn.disabled = true;

      // Enable action buttons only if we have a valid project ID (not in new mode)
      const hasValidProject = this.projectData && this.projectData.project_id;
      if (this.manageUsersBtn) {
        this.manageUsersBtn.disabled = !hasValidProject;
      }
      if (this.viewDocsBtn) {
        this.viewDocsBtn.disabled = !hasValidProject;
      }

    } else if (this.mode === "edit") {
      // Show Edit button in edit mode (shows as "View")
      this.editModeBtn.style.display = "inline-flex";
      this.editModeBtn.textContent = "View";
      
      this.projIdField.disabled = true; // always

      // Enable name and code fields based on mode and permissions
      let canEdit = false;
      
      if (this.projectData && this.projectData.project_id) {
        // Existing project - check edit permissions
        canEdit = this.security.canEditProject(this.projectData.project_id);
      } else if (this.newProjectAccountId) {
        // New project - check if user can create projects in this account
        canEdit = this.security.canEditAccount(this.newProjectAccountId) ||
                  this.security.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN', 'PROJECT_EDITOR']);
      } else {
        // Fallback - check general project creation permissions
        canEdit = this.security.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN', 'PROJECT_EDITOR']);
      }

      this.projNameField.disabled = !canEdit;
      this.projCodeField.disabled = !canEdit;
      this.projCorpusField.disabled = !canEdit;
      this.projAccountField.disabled = true; // read-only

      // Apply field state classes for edit mode
      this.projIdField.classList.add('field-readonly');                           // Always read-only
      this.projNameField.classList.add(canEdit ? 'field-editable' : 'field-locked'); // Editable if has permission
      this.projCodeField.classList.add(canEdit ? 'field-editable' : 'field-locked'); // Editable if has permission
      this.projAccountField.classList.add('field-readonly');                      // Always read-only
      this.projCorpusField.classList.add(canEdit ? 'field-editable' : 'field-locked'); // Editable if has permission
      this.projCreatedField.classList.add('field-readonly');                      // Always read-only

      // Show Cancel button in edit mode, but handle navigation buttons based on whether it's a new project
      this.cancelBtn.style.display = "inline-flex";
      this.cancelBtn.disabled = false;
      
      // For new projects, keep Back to Projects button visible; for existing projects, hide it
      if (!this.projectId || !this.projectData?.project_id) {
        // New project - keep Back to Projects button (user came from projects modal)
        this.backToProjectsBtn.style.display = "inline-flex";
        this.backToProjectsBtn.disabled = false;
      } else {
        // Existing project - hide Back to Projects button in edit mode
        this.backToProjectsBtn.style.display = "none";
      }
      
      // For new projects in edit mode, enable save button if user can edit
      // For existing projects, only enable if dirty
      if (this.projectData && this.projectData.project_id) {
        this.saveBtn.disabled = !this.dirty;  // Existing project - require changes
      } else {
        this.saveBtn.disabled = !canEdit;     // New project - enable if user can create projects
      }

      // Disable action buttons in edit mode
      if (this.manageUsersBtn) this.manageUsersBtn.disabled = true;
      if (this.viewDocsBtn) this.viewDocsBtn.disabled = true;

    } else if (this.mode === "new") {
      // Show Edit button in new mode to allow user to start editing
      this.editModeBtn.style.display = "inline-flex";
      this.editModeBtn.textContent = "Edit";
      
      this.projIdField.disabled = true;
      this.projNameField.disabled = true;
      this.projCodeField.disabled = true;
      this.projCorpusField.disabled = true;
      this.projAccountField.disabled = true; // read-only
      
      // Apply field state classes for new mode (locked until Edit is clicked)
      this.projIdField.classList.add('field-readonly');     // ID not assigned yet - read-only
      this.projNameField.classList.add('field-locked');     // Locked until Edit is clicked
      this.projCodeField.classList.add('field-locked');     // Locked until Edit is clicked
      this.projAccountField.classList.add('field-readonly'); // Account is pre-selected - read-only
      this.projCorpusField.classList.add('field-locked');   // Locked until Edit is clicked
      this.projCreatedField.classList.add('field-readonly'); // Not created yet - read-only
      
      // Show "Back to Projects" button instead of Cancel button in new mode
      this.cancelBtn.style.display = "none";
      this.backToProjectsBtn.style.display = "inline-flex";
      this.backToProjectsBtn.disabled = false;
      
      this.saveBtn.disabled = true; // Disabled until they click Edit and make changes

      // Disable action buttons for new projects
      if (this.manageUsersBtn) this.manageUsersBtn.disabled = true;
      if (this.viewDocsBtn) this.viewDocsBtn.disabled = true;
    }
  }

  handleManageUsers() {
    if (!this.projectData || !this.projectData.project_id) {
      console.warn("[ProjectModal] handleManageUsers: No valid project data");
      return;
    }

    // Verify permission
    if (!this.security.canGrantProjectAccess(this.projectData.composite)) {
      this.errorModal.show({
        title: "Permission Denied",
        message: `You don't have permission to manage users for project: ${this.projectData.project_id}`
      });
      return;
    }

    console.log("[ProjectModal] handleManageUsers => project=", this.projectData.project_id);

    const usersModal = new UsersModal(this.store, {
      contextType: "project",
      contextId: this.projectData.project_id,
      accountId: this.projectData.account_id,
      projectName: this.projectData.name || null // Pass the project name
    });
    this.navigateToModal('/modals/users');
  }

  handleViewDocs() {
    if (!this.projectData || !this.projectData.project_id) {
      console.warn("[ProjectModal] handleViewDocs: No valid project data");
      return;
    }

    // Verify permission
    if (!this.security.canAccessProject(this.projectData.composite)) {
      this.errorModal.show({
        title: "Permission Denied",
        message: `You don't have permission to view documents for project: ${this.projectData.project_id}`
      });
      return;
    }

    console.log("[ProjectModal] handleViewDocs => project=", this.projectData.project_id);

    // Open DocumentsModal for this project
    // Pass composite format (accountId#projectId) as expected by DocumentsModal
    const compositeId = this.composite || `${this.accountId}#${this.projectId}`;
    this.navigateToModal('/modals/documents');
  }
}