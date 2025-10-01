// File: ui/modals/account-modal.js

import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { getAccount, updateAccount } from "../../api/projects-accounts.js";
import { Security } from "../../state/security.js";
import { verifyPermission, getFreshSecurity } from "../../utils/security-utils.js";
import { addAccount } from "../../api/accounts-add.js"; 
import { ProjectModal } from "./project-modal.js"; 
import { UsersModal } from "./users-modal.js";
import { ProjectsModal } from "./projects-modal.js";
import { AccountsModal } from "./accounts-modal.js";
import formatHumanReadableDate from "../../utils/date-utils.js";

export class AccountModal extends AsyncFormModal {
  constructor(store, accountId) {
    super();
    this.store = store;
    this.accountId = accountId;
    this.mode = "view"; // "view", "edit", or "new"
    this.dirty = false;

    this.accountData = null;

    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.security = getFreshSecurity(store);

    this._buildDOM();
  }

  // Helper to set new mode
  setNewMode(isNew) {
    if (isNew) {
      this.mode = "new";
    }
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--narrow modal--form";
    this.modalEl.style.display = "none";
  
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close Account Modal">&times;</button>
      <h2 id="accountModalTitle">Account Details</h2>

      <div class="modal-section">
        <form id="accountForm" class="async-form">
          <div class="form-group">
            <label for="acctIdField">Account ID</label>
            <input type="text" id="acctIdField" class="doc-input" disabled />
          </div>
          <div class="form-group">
            <label for="acctNameField">Account Name</label>
            <input type="text" id="acctNameField" class="doc-input" disabled />
          </div>
          <div class="form-group">
            <label for="ownerField">Owner</label>
            <input type="text" id="ownerField" class="doc-input" disabled />
          </div>
          <div class="form-group">
            <label for="createdField">Created Date</label>
            <input type="text" id="createdField" class="doc-input" disabled />
          </div>
        </form>
      </div>

      <!-- Primary actions -->
      <div class="modal-section">
        <div class="action-group action-group--split">
          <div class="flex gap-sm">
            <button type="button" class="btn" id="cancelBtn" disabled>Cancel</button>
            <button type="button" class="btn btn--primary" id="saveBtn" disabled>Save Changes</button>
          </div>
          <div class="flex gap-sm">
            <button type="button" class="btn btn--secondary" id="editModeBtn">Edit</button>
            <button type="button" class="btn btn--secondary" id="newProjectBtn" disabled>New Project</button>
          </div>
        </div>
      </div>

      <!-- Secondary actions -->
      <div class="modal-section">
        <div class="action-group action-group--left">
          <button type="button" class="btn" id="manageUsersBtn" aria-label="Manage users for this account">Manage Users</button>
          <button type="button" class="btn" id="viewProjectsBtn" aria-label="View projects in this account">View Projects</button>
          <button type="button" class="btn" id="backToAccountsBtn" aria-label="Back to accounts list">Back to Accounts</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);

    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => this.hide());

    this.accountForm = this.modalEl.querySelector("#accountForm");
    this.acctIdField = this.modalEl.querySelector("#acctIdField");
    this.acctNameField = this.modalEl.querySelector("#acctNameField");
    this.ownerField = this.modalEl.querySelector("#ownerField");
    this.createdField = this.modalEl.querySelector("#createdField");

    this.editModeBtn = this.modalEl.querySelector("#editModeBtn");
    this.cancelBtn = this.modalEl.querySelector("#cancelBtn");
    this.saveBtn = this.modalEl.querySelector("#saveBtn");
    this.newProjectBtn = this.modalEl.querySelector("#newProjectBtn");

    this.manageUsersBtn = this.modalEl.querySelector("#manageUsersBtn");
    this.viewProjectsBtn = this.modalEl.querySelector("#viewProjectsBtn");
    this.backToAccountsBtn = this.modalEl.querySelector("#backToAccountsBtn");

    // CRITICAL FIX: Attach event handlers properly
    this.editModeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("[AccountModal] Edit mode button clicked");
      this.handleModeChange();
    });
    
    this.cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("[AccountModal] Cancel button clicked");
      this.handleCancel();
    });

    // FIX: Changed from form submit to direct button click
    // The issue was that the Save button is type="button" not type="submit"
    // so the form submit event never fires when clicking the button
    this.saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("[AccountModal] Save button clicked - calling handleSave");
      this.handleSave(e);
    });

    // ALSO keep the form submit handler as backup
    this.accountForm.addEventListener("submit", (e) => {
      e.preventDefault();
      console.log("[AccountModal] Form submitted - calling handleSave");
      this.handleSave(e);
    });

    this.manageUsersBtn.addEventListener("click", () => this.handleManageUsers());
    this.viewProjectsBtn.addEventListener("click", () => this.handleViewProjects());
    this.backToAccountsBtn.addEventListener("click", () => this.handleBackToAccounts());

    // "New Project" button
    if (this.newProjectBtn) {
      this.newProjectBtn.addEventListener("click", () => this.handleNewProject());
    }

    // In edit or new mode, track changes on relevant fields
    this.acctNameField.addEventListener("input", () => {
      console.log("[AccountModal] Name field changed");
      this.handleFieldChange();
    });
    this.ownerField.addEventListener("input", () => {
      console.log("[AccountModal] Owner field changed"); 
      this.handleFieldChange();
    });

    console.log("[AccountModal] All event handlers attached successfully");
  }

  async show(options = {}) {
    // Always disable manage users and view projects buttons for new account
    if (this.mode === "new") {
      if (this.manageUsersBtn) this.manageUsersBtn.disabled = true;
      if (this.viewProjectsBtn) this.viewProjectsBtn.disabled = true;
    }
    
    super.show(options);

    // If mode is "new", skip load
    if (this.accountId && this.mode !== "new") {
      await this.loadAccountData();
      this.renderAccountData();
      this.mode = "view";
    } else if (this.mode === "new") {
      console.log("[AccountModal] show() => new mode => prefill fields");
      // Auto-assign owner to current user
      const userObj = this.store.get("user") || {};
      const username = userObj.username || "guest";

      // For new mode, no accountId; fields are editable except ID is empty
      this.accountData = {
        account_id: "",      // Not assigned yet
        name: "",
        owner: username,    // Auto-assign owner to current user
        created_datetime: ""
      };
      this.renderAccountData();
    }
    // Refresh security object
    this.security = getFreshSecurity(this.store);
  
    this.updateUI();
  }

  async loadAccountData() {
    try {
      this.lockFields();
      this.lockButtons();
      const response = await getAccount(this.accountId, this.store);
      
      // The endpoint returns { account: {...} } not just the account data directly
      // So we need to extract the account property from the response
      this.accountData = response.account || response;
      
      console.log("[AccountModal] Loaded account data:", this.accountData);
      
      if (!this.accountData) {
        throw new Error("No account data returned from server");
      }
    } catch (err) {
      this.errorModal.show({ title: "Error", message: err.message });
      throw err;
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }

  renderAccountData() {
    if (!this.accountData) return;
    this.acctIdField.value = this.accountData.account_id || "";
    this.acctNameField.value = this.accountData.name || "";
    this.ownerField.value = this.accountData.owner || "";
    this.createdField.value = formatHumanReadableDate(this.accountData.created_datetime || "");
  }

  handleModeChange() {
    if (this.mode === "view") {
      // check permission
      if (!this.accountData || !this.accountData.account_id) {
        // Possibly new mode or no data
        if (this.mode !== "new") {
          console.warn("[AccountModal] handleModeChange => no valid account_data. Doing nothing.");
          return;
        }
      } else {
        if (!this.security.canEditAccount(this.accountData.account_id)) {
          this.errorModal.show({
            title: "Permission Denied",
            message: "You do not have permission to edit this account."
          });
          return;
        }
      }
      this.mode = (this.mode === "new") ? "new" : "edit";
      this.dirty = false;

    } else {
      // user toggled back to view
      if (this.mode === "new") {
        // In new mode => no "view" if not yet saved
        console.log("[AccountModal] new mode => cannot switch to view until saved");
        return;
      }
      this.mode = "view";
      this.dirty = false;
    }
    this.updateUI();
  }

  handleFieldChange() {
    console.log("[AccountModal] Field changed, mode:", this.mode, "dirty:", this.dirty);
    if (this.mode === "edit" || this.mode === "new") {
      this.dirty = true;
      this.saveBtn.disabled = false;
      console.log("[AccountModal] Save button enabled due to field change");
    }
  }

  async handleSave(e) {
    console.log("[AccountModal] handleSave called, mode:", this.mode);
    e.preventDefault();
    
    if (this.mode !== "edit" && this.mode !== "new") {
      console.log("[AccountModal] Save called but not in edit/new mode, ignoring");
      return;
    }
  
    try {
      console.log("[AccountModal] Starting save process...");
      this.lockFields();
      this.lockButtons();
  
      const newName = this.acctNameField.value.trim();
      const newOwner = this.ownerField.value.trim();
  
      console.log("[AccountModal] Form data:", { newName, newOwner, mode: this.mode });

      // Basic validation
      if (!newName) {
        throw new Error("Account name is required");
      }

      if (this.mode === "new") {
        console.log("[AccountModal] Saving new account => name=", newName, "owner=", newOwner);
        
        // Import the addAccount function
        const { addAccount } = await import("../../api/accounts-add.js");
        
        const result = await addAccount({
          name: newName,
          owner: newOwner
        }, this.store);
  
        console.log("[AccountModal] new account created =>", result);
        this.accountData = result.account || result;
        this.accountId = this.accountData.account_id;
        
        // Sync the new account with the user's permissions in localStorage and store
        if (this.accountData.account_id) {
          try {
            const localPermissionsModule = await import("../../state/local-permissions.js");
            localPermissionsModule.syncAfterAccountCreation(this.store, this.accountData);
          } catch (err) {
            console.warn("[AccountModal] Could not sync local permissions:", err);
          }
        }
        
        this.mode = "view";
        this.dirty = false;
        this.renderAccountData();
  
      } else {
        // normal update => /accounts/update
        console.log("[AccountModal] Updating existing account =>", this.accountId);
        
        const { updateAccount } = await import("../../api/projects-accounts.js");
        
        const payload = {
          account_id: this.accountId,
          name: newName,
          owner: newOwner
        };
        
        await updateAccount(payload, this.store);
        console.log("[AccountModal] account updated successfully");
        
        // Reload
        await this.loadAccountData();
        this.renderAccountData();
        this.mode = "view";
        this.dirty = false;
      }
  
      this.messageModal.show({ 
        title: "Success", 
        message: "Account saved successfully!" 
      });
      
    } catch (err) {
      console.error("[AccountModal] Save error:", err);
      this.errorModal.show({ 
        title: "Error Saving", 
        message: err.message || "An unexpected error occurred while saving the account"
      });
    } finally {
      this.unlockFields();
      this.unlockButtons();
      this.updateUI();
      console.log("[AccountModal] Save process completed");
    }
  }

  handleCancel() {
    if (this.mode === "edit") {
      // revert
      this.mode = "view";
      this.dirty = false;
      if (this.accountData) {
        this.renderAccountData();
      }
    } else if (this.mode === "new") {
      // discard entirely
      this.hide();
    }
    this.updateUI();
  }

  updateUI() {
    // Always make sure Created Date is disabled
    this.createdField.disabled = true;
    
    // Clear all field state classes first
    const allFields = [this.acctIdField, this.acctNameField, this.ownerField, this.createdField];
    allFields.forEach(field => {
      if (field) {
        field.classList.remove('field-readonly', 'field-editable', 'field-locked');
      }
    });
    
    // Enable/disable fields based on mode
    if (this.mode === "view") {
      this.editModeBtn.textContent = "Edit";
      this.acctIdField.disabled = true;
      this.acctNameField.disabled = true;
      this.ownerField.disabled = true;
      this.cancelBtn.disabled = true;
      this.saveBtn.disabled = true;

      // Apply field state classes for view mode
      this.acctIdField.classList.add('field-readonly');    // Always read-only
      this.acctNameField.classList.add('field-locked');    // Editable but locked in view mode
      this.ownerField.classList.add('field-locked');       // Editable but locked in view mode  
      this.createdField.classList.add('field-readonly');   // Always read-only

      // "New Project" button enabled if user is ACCOUNT_EDITOR + we have a saved account
      const canEdit = this.accountData && this.accountData.account_id
                   && this.security.canEditAccount(this.accountData.account_id);
      if (this.newProjectBtn) {
        this.newProjectBtn.disabled = !canEdit;
      }
      
      // Enable action buttons only if we have a valid account
      const hasValidAccount = this.accountData && this.accountData.account_id;
      if (this.manageUsersBtn) {
        this.manageUsersBtn.disabled = !hasValidAccount;
      }
      if (this.viewProjectsBtn) {
        this.viewProjectsBtn.disabled = !hasValidAccount;
      }

    } else if (this.mode === "edit") {
      this.editModeBtn.textContent = "View";
      // Typically account_id is always disabled
      this.acctIdField.disabled = true;
      
      // Only enable name and owner fields if user has ACCOUNT_EDITOR or higher permissions
      const canEdit = this.accountData && this.accountData.account_id
                   && this.security.canEditAccount(this.accountData.account_id);
      
      this.acctNameField.disabled = !canEdit;
      // Always disable Owner field in Edit mode
      this.ownerField.disabled = true;
      
      // Apply field state classes for edit mode
      this.acctIdField.classList.add('field-readonly');                        // Always read-only
      this.acctNameField.classList.add(canEdit ? 'field-editable' : 'field-locked'); // Editable if has permission
      this.ownerField.classList.add('field-locked');                          // Locked in edit mode
      this.createdField.classList.add('field-readonly');                      // Always read-only
      
      this.cancelBtn.disabled = false;
      this.saveBtn.disabled = !this.dirty;
      if (this.newProjectBtn) {
        this.newProjectBtn.disabled = true; 
      }
      
      // Disable action buttons in edit mode
      if (this.manageUsersBtn) {
        this.manageUsersBtn.disabled = true;
      }
      if (this.viewProjectsBtn) {
        this.viewProjectsBtn.disabled = true;
      }

    } else if (this.mode === "new") {
      this.editModeBtn.textContent = "View"; 
      this.acctIdField.disabled = true;
      this.acctNameField.disabled = false; // new account => allow naming
      // Owner field should be disabled in new mode too, already prefilled with current user
      this.ownerField.disabled = true;
      
      // Apply field state classes for new mode
      this.acctIdField.classList.add('field-readonly');    // ID not assigned yet - read-only
      this.acctNameField.classList.add('field-editable');  // User can edit name for new account
      this.ownerField.classList.add('field-locked');       // Pre-filled with current user but locked
      this.createdField.classList.add('field-readonly');   // Not created yet - read-only
      
      this.cancelBtn.disabled = false;
      this.saveBtn.disabled = !this.dirty;
      if (this.newProjectBtn) {
        this.newProjectBtn.disabled = true; 
      }
      
      // Always disable these buttons in new mode
      if (this.manageUsersBtn) {
        this.manageUsersBtn.disabled = true;
      }
      if (this.viewProjectsBtn) {
        this.viewProjectsBtn.disabled = true;
      }
    }
  }

  handleManageUsers() {
    if (!this.accountData || !this.accountData.account_id) return;
    
    // Check permission before proceeding
    if (!this.security.canGrantAccountAccess(this.accountData.account_id)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to manage users for account: ${this.accountData.account_id}`
      });
      return;
    }
    
    console.log("[AccountModal] handleManageUsers => account=", this.accountData.account_id);

    // Open UsersModal with the account context and name
    const usersModal = new UsersModal(this.store, {
      contextType: "account",
      contextId: this.accountData.account_id,
      accountName: this.accountData.name // Pass the account name
    });
    this.navigateToModal('/modals/users');
  }

  handleViewProjects() {
    if (!this.accountData || !this.accountData.account_id) return;
    
    // Check permission before proceeding
    if (!this.security.canAccessAccount(this.accountData.account_id)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to view projects for account: ${this.accountData.account_id}`
      });
      return;
    }
    
    console.log("[AccountModal] handleViewProjects => account=", this.accountData.account_id);

    // Use modal-to-modal navigation to preserve origin context
    const projectsUrl = `/modals/projects/${this.accountData.account_id}`;
    this.navigateToModal(projectsUrl);
  }

  // [PHASE 9 UPDATE] => "New Project" flow
  handleNewProject() {
    if (!this.accountData || !this.accountData.account_id) {
      console.warn("[AccountModal] handleNewProject => no valid account to attach project");
      return;
    }
    
    // Check permission before proceeding
    if (!this.security.canEditAccount(this.accountData.account_id)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to create projects for account: ${this.accountData.account_id}`
      });
      return;
    }
    
    console.log("[AccountModal] handleNewProject => opening ProjectModal in new mode");

    // Use modal-to-modal navigation to preserve origin context
    const newProjectUrl = `/modals/project/new/${this.accountData.account_id}`;
    this.navigateToModal(newProjectUrl);
  }

  handleBackToAccounts() {
    console.log("[AccountModal] handleBackToAccounts => navigating to accounts list");

    // Use modal-to-modal navigation to preserve origin context
    const accountsUrl = `/modals/accounts`;
    this.navigateToModal(accountsUrl);
  }
}