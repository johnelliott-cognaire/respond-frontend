// users-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { listUsers, addAccountAccess, addProjectAccess } from "../../api/users.js";
import { Security } from "../../state/security.js";
import { verifyPermission, getFreshSecurity } from "../../utils/security-utils.js";
import { UserModal } from "./user-modal.js";
import { LoginModal } from "./login-modal.js";
import { AccountModal } from "./account-modal.js"; // Added import for AccountModal

/**
 * UsersModal - lists users
 */
export class UsersModal extends AsyncFormModal {

  /**
   * @param {Store} store
   * @param {object} options
   *   contextType: "account" | "project" | null
   *   contextId: string
   *   accountId: string (for project context)
   *   accountName: string (optional account name)
   *   projectName: string (optional project name)
   */
  constructor(store, options = {}) {
    super();
    console.log("[UsersModal] constructor called");
    this.store = store;
    this.security = getFreshSecurity(store);

    this.contextType = options.contextType || null;
    this.contextId = options.contextId || null;
    this.accountId = options.accountId || null; // Add account ID for project context
    
    // Add name properties for better context display
    this.accountName = options.accountName || null;
    this.projectName = options.projectName || null;
    
    // Always use single selection mode
    this.allowMultiple = false;
    
    this.users = [];
    this.selectedUser = null;
    
    // Track if we're in "add user" mode
    this.isAddUserMode = false;
    
    // Map to track users who already have access to the context
    this.existingUsersMap = {};

    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.searchInput = null;
    this.tableBody = null;
    this.permissionFilterSelect = null;

    this._buildDOM();
  }

  _buildDOM() {
    console.log("[UsersModal] _buildDOM() called");
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form users-modal app-modal";
    this.modalEl.style.display = "none";

    let contextLabel = "";
    if (this.contextType && this.contextId) {
      if (this.contextType === "account") {
        // For account context
        const accountName = this.accountName ? 
          (this.accountName.length > 30 ? this.accountName.substring(0, 27) + '...' : this.accountName) : 
          "(Account)";
        
        contextLabel = `
          <div class="form-group">
            <label>Context: Account</label>
            <div style="font-size: 14px; padding: 6px; background-color: #f7f7f7; border-radius: 4px; margin-top: 4px;">
              <strong>${this.contextId}</strong> - ${accountName}
            </div>
          </div>
        `;
      } else if (this.contextType === "project") {
        // For project context with account information
        const projectName = this.projectName ? 
          (this.projectName.length > 50 ? this.projectName.substring(0, 47) + '...' : this.projectName) : 
          "(Project)";
          
        contextLabel = `
          <div class="form-group">
            <label>Context: Project</label>
            <div style="font-size: 14px; padding: 6px; background-color: #f7f7f7; border-radius: 4px; margin-top: 4px;">
              <strong>${this.accountId || 'Unknown'}</strong> - <strong>${this.contextId}</strong> ${projectName}
            </div>
          </div>
        `;
      }
    }

    // Add CSS for row selection
    const style = document.createElement('style');
    style.textContent = `
      .users-table tbody tr {
        cursor: pointer;
      }
      .users-table tbody tr:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
      .users-table tbody tr.selected-row {
        background-color: rgba(0, 123, 255, 0.1);
      }
    `;
    document.head.appendChild(style);

    // Determine if we should show "Add User to Context" button
    let addUserButton = "";
    if (this.contextType && this.contextId) {
      // Only show if we have context AND are using admin permissions
      if ((this.contextType === "account" && this.security.canGrantAccountAccess(this.contextId)) ||
          (this.contextType === "project" && this.security.canGrantProjectAccess(this.contextId))) {
        addUserButton = `<button type="button" class="btn btn--primary" id="addUserToContextBtn">Add User to ${this.contextType}</button>`;
      }
    }
    
    // Add "Back to Account" button if we're in an account context
    let backToAccountButton = "";
    if (this.contextType === "account" && this.contextId) {
      backToAccountButton = `<button type="button" class="btn" id="backToAccountBtn">Back to Account</button>`;
    }

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close Users Modal">&times;</button>
      <h2>Users</h2>

      ${contextLabel}

      <div class="form-group" style="display:flex; gap:0.5rem;">
        <input 
          type="text" 
          id="usersSearchInput" 
          class="doc-input" 
          placeholder="Search by username/email..."
          style="flex:1; min-width:0;"
        />
        <select id="permissionFilterSelect" class="doc-input" style="width:200px;">
          <option value="">All Permissions</option>
          <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
          <option value="APP_ADMIN">APP_ADMIN</option>
          <option value="ACCOUNT_EDITOR">ACCOUNT_EDITOR</option>
          <option value="ACCOUNT_VIEWER">ACCOUNT_VIEWER</option>
          <option value="PROJECT_EDITOR">PROJECT_EDITOR</option>
          <option value="PROJECT_VIEWER">PROJECT_VIEWER</option>
        </select>
        <button type="button" class="btn" id="usersSearchBtn">Search</button>
      </div>

      <div style="max-height: 300px; overflow-y: auto; border:1px solid var(--border-subtle); margin-top:1rem; padding:0.5rem;">
        <table class="users-table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width:25%">Username</th>
              <th style="width:25%">Email</th>
              <th style="width:50%">System Permissions</th>
            </tr>
          </thead>
          <tbody id="usersTableBody"></tbody>
        </table>
      </div>

      <div class="button-group" style="margin-top:1rem;">
        ${backToAccountButton}
        <button type="button" class="btn" id="managePermsBtn" disabled>Manage Permissions</button>
        ${addUserButton}
      </div>
    `;

    document.body.appendChild(this.modalEl);

    // Store reference to all buttons we'll need to manipulate
    this.modalCloseBtn = this.modalEl.querySelector(".modal__close");
    this.modalCloseBtn.addEventListener("click", () => this.hide());

    this.searchInput = this.modalEl.querySelector("#usersSearchInput");
    this.tableBody = this.modalEl.querySelector("#usersTableBody");
    this.permissionFilterSelect = this.modalEl.querySelector("#permissionFilterSelect");

    this.searchBtn = this.modalEl.querySelector("#usersSearchBtn");
    if (this.searchBtn) {
      this.searchBtn.addEventListener("click", () => this.performSearch());
    }

    
    // Set up Back to Account button handler
    this.backToAccountBtn = this.modalEl.querySelector("#backToAccountBtn");
    if (this.backToAccountBtn) {
      this.backToAccountBtn.addEventListener("click", () => this.handleBackToAccount());
    }

    this.managePermsBtn = this.modalEl.querySelector("#managePermsBtn");
    if (this.managePermsBtn) {
      this.managePermsBtn.addEventListener("click", () => this.handleManagePermissions());
    }

    this.addUserBtn = this.modalEl.querySelector("#addUserToContextBtn");
    if (this.addUserBtn) {
      this.addUserBtn.addEventListener("click", async () => {
        if (this.isAddUserMode) {
          // If in "add user" mode, add the selected user to the context
          await this.handleAddSelectedUserToContext();
        } else {
          // Otherwise, switch to "add user" mode
          await this.handleAddUserToContext();
        }
      });
    }

    this.tableBody.addEventListener("click", evt => {
      const row = evt.target.closest("tr[data-username]");
      if (!row) return;
      const username = row.dataset.username;
      
      // Toggle selection - single selection mode
      this.selectedUser = (this.selectedUser === username) ? null : username;
      
      this.renderTableRows();
      this.updateButtonStates();
    });
  }

  async show(options = {}) {
    console.log("[UsersModal] show() called");
    
    // Reset to normal mode if showing fresh
    this.isAddUserMode = false;
    
    // Reset existing users map
    this.existingUsersMap = {};
    
    // Ensure only row action buttons are disabled initially, not the Add User button
    if (this.managePermsBtn) {
      this.managePermsBtn.disabled = true;
    }
    
    // Make sure the Add User button is explicitly enabled in normal mode
    if (this.addUserBtn && !this.isAddUserMode) {
      this.addUserBtn.disabled = false;
    }

    // Refresh security object
    this.security = getFreshSecurity(this.store);
    
    super.show(options);
    await this.performSearch();
  }
  
  disableRowActionButtons() {
    console.log("[UsersModal] Explicitly disabling specific row action buttons");
    
    // Only disable the Manage Permissions button
    if (this.managePermsBtn) {
      this.managePermsBtn.disabled = true;
    }
    
    // Do NOT disable the Add User button in normal mode
    // Only disable it in add mode when no user is selected
    if (this.addUserBtn && this.isAddUserMode && !this.selectedUser) {
      this.addUserBtn.disabled = true;
    } else if (this.addUserBtn && !this.isAddUserMode) {
      // Explicitly enable it in normal mode
      this.addUserBtn.disabled = false;
    }
  }

  async performSearch(isAddUserMode = false) {
    console.log("[UsersModal] performSearch() called, isAddUserMode:", isAddUserMode);
    try {
      this.lockFormFields();  // Only lock form fields, not buttons
      
      // Disable search-related buttons during search
      if (this.searchBtn) this.searchBtn.disabled = true;
      if (this.cancelBtn) this.cancelBtn.disabled = true;
      if (this.addUserBtn) this.addUserBtn.disabled = true;

      // Add loading indicator
      const loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'usersLoadingIndicator';
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.textContent = 'Loading users...';
      loadingIndicator.style.textAlign = 'center';
      loadingIndicator.style.padding = '1rem';
      this.tableBody.innerHTML = '';
      this.tableBody.appendChild(loadingIndicator);

      const filter = {};
      const searchVal = this.searchInput?.value?.trim();
      if (searchVal) {
        filter.search_value = searchVal;
      }

      const permVal = this.permissionFilterSelect?.value;
      if (permVal) {
        filter.system_perm = permVal;
      }

      // Only apply context filters if we're NOT in "add user" mode
      if (!isAddUserMode && !this.isAddUserMode) {
        if (this.contextType === "account") {
          filter.account_id = this.contextId;
        } else if (this.contextType === "project") {
          filter.project_id = this.contextId;
          // Add account_id when in project context - this is critical for the Lambda to work
          if (this.accountId) {
            filter.account_id = this.accountId;
          }
        }
      }

      console.log("[UsersModal] Using filter =>", filter);
      const data = await listUsers(filter);
      console.log("[UsersModal] listUsers => response:", data);

      // If in Add User mode, filter out users who already have access to this context
      if (this.isAddUserMode && this.existingUsersMap) {
        const allUsers = data.users || [];
        this.users = allUsers.filter(user => {
          // Keep only users who don't already have access
          return !this.existingUsersMap[user.username];
        });
        console.log(`[UsersModal] Filtered out ${allUsers.length - this.users.length} users who already have access`);
      } else {
        this.users = data.users || [];
      }
      
      // Clear selection when doing a new search
      this.selectedUser = null;
      
      // Remove loading indicator
      const indicator = document.getElementById('usersLoadingIndicator');
      if (indicator) {
        indicator.remove();
      }
      
      this.renderTableRows();
      
      // Make sure row action buttons have proper states after loading data
      this.disableRowActionButtons();

    } catch (err) {
      console.error("[UsersModal] performSearch error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({ 
          title: "Failed to load users", 
          message: err.message 
        });
      }
    } finally {
      this.unlockFormFields();  // Unlock the form fields
      
      // Re-enable search-related buttons
      if (this.searchBtn) this.searchBtn.disabled = false;
      if (this.cancelBtn) this.cancelBtn.disabled = false;
      
      // Update button labels if in add mode
      if (this.isAddUserMode) {
        this.updateModalForAddUserMode();
      } else {
        // In normal mode, make sure the Add User button is enabled
        if (this.addUserBtn) {
          this.addUserBtn.disabled = false;
        }
      }
    }
  }
  
  // Lock only form fields, not buttons
  lockFormFields() {
    if (!this.modalEl) return;
    const inputs = this.modalEl.querySelectorAll("input, textarea, select");
    inputs.forEach(input => {
      input.disabled = true;
    });
  }
  
  // Unlock only form fields, not buttons
  unlockFormFields() {
    if (!this.modalEl) return;
    const inputs = this.modalEl.querySelectorAll("input, textarea, select");
    inputs.forEach(input => {
      input.disabled = false;
    });
  }

  renderTableRows() {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = "";

    for (const user of this.users) {
      const username = user.username || "";
      const email = user.email || "";

      let systemPerms = [];
      if (typeof user.permissions === "string") {
        try {
          const permsObj = JSON.parse(user.permissions);
          systemPerms = permsObj.system_permissions || [];
        } catch (parseErr) {
          console.warn("[UsersModal] Could not parse user.permissions string:", parseErr);
          systemPerms = [];
        }
      }

      const isSelected = (this.selectedUser === username);

      const row = document.createElement("tr");
      row.dataset.username = username;
      if (isSelected) row.classList.add("selected-row");

      row.innerHTML = `
        <td>${username}</td>
        <td>${email}</td>
        <td>${systemPerms.join(", ")}</td>
      `;

      this.tableBody.appendChild(row);
    }
  }

  updateButtonStates() {
    console.log("[UsersModal] updateButtonStates => selectedUser:", this.selectedUser);
    
    if (this.isAddUserMode) {
      // In "add user" mode, only enable the "Add Selected User" button when a user is selected
      if (this.addUserBtn) {
        this.addUserBtn.disabled = !this.selectedUser;
      }
      
      // Disable the "Manage Permissions" button in "add user" mode
      if (this.managePermsBtn) {
        this.managePermsBtn.disabled = true;
      }
    } else {
      // Normal mode
      if (this.managePermsBtn) {
        // Allow managing permissions if:
        // 1. A user is selected
        // 2. Current user is SYSTEM_ADMIN/APP_ADMIN OR
        // 3. Selected user is the current user (self-administration)
        const currentUser = this.store.get("user")?.username;
        const canManageUsers = this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]);
        const isSelfView = this.selectedUser === currentUser;
        
        this.managePermsBtn.disabled = !this.selectedUser || (!canManageUsers && !isSelfView);
      }
      
      // Always make sure the Add User button is enabled in normal mode
      if (this.addUserBtn) {
        this.addUserBtn.disabled = false;
      }
    }
  }

  // Update modal title and button text for "add user" mode
  updateModalForAddUserMode() {
    const modalTitle = this.modalEl.querySelector("h2");
    if (modalTitle) {
      modalTitle.textContent = this.isAddUserMode ? 
        `Add User to ${this.contextType === "account" ? "Account" : "Project"}` : 
        "Users";
    }
    
    if (this.addUserBtn) {
      this.addUserBtn.textContent = this.isAddUserMode ? 
        `Add Selected User to ${this.contextType === "account" ? "Account" : "Project"}` : 
        `Add User to ${this.contextType === "account" ? "Account" : "Project"}`;
      
      // Button state depends on mode
      if (this.isAddUserMode) {
        // In add mode, only enable when a user is selected
        this.addUserBtn.disabled = !this.selectedUser;
      } else {
        // In normal mode, always enabled
        this.addUserBtn.disabled = false;
      }
    }
  }

  handleManagePermissions() {
    if (!this.selectedUser) {
      console.warn("[UsersModal] No user selected for Manage Permissions");
      return;
    }
    console.log("[UsersModal] handleManagePermissions => selectedUser:", this.selectedUser);

    const currentUser = this.store.get("user")?.username;
    const canManageUsers = this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]);
    const isSelfView = this.selectedUser === currentUser;

    console.log("[UsersModal] Opening UserModal with settings:", {
      username: this.selectedUser,
      currentUser,
      canManageUsers,
      isSelfView,
    });

    // Use modal-to-modal navigation to preserve origin context
    // URL pattern: /modals/user_detail/username
    const userUrl = `/modals/user_detail/${encodeURIComponent(this.selectedUser)}`;
    console.log("[UsersModal] Navigating to user URL:", userUrl);

    this.navigateToModal(userUrl);
    console.log("[UsersModal] Modal navigation to user modal initiated successfully");
  }

  async handleAddUserToContext() {
    if (!this.contextType || !this.contextId) {
      console.warn("[UsersModal] No valid context for adding user");
      return;
    }
    
    // Check permission first
    if (this.contextType === "account" && !this.security.canGrantAccountAccess(this.contextId)) {
      this.errorModal.show({
        title: "Permission Denied",
        message: `You don't have permission to add users to account: ${this.contextId}`
      });
      return;
    } else if (this.contextType === "project" && !this.security.canGrantProjectAccess(this.contextId)) {
      this.errorModal.show({
        title: "Permission Denied",
        message: `You don't have permission to add users to project: ${this.contextId}`
      });
      return;
    }
    
    console.log("[UsersModal] handleAddUserToContext => switch to add user mode");
    
    // First, fetch the list of existing users for this context
    // We'll store this to filter out users who already have access
    try {
      this.lockButtons(); // Lock buttons during this fetch
      
      // Fetch the list of users who already have access to this context
      const contextFilter = {};
      if (this.contextType === "account") {
        contextFilter.account_id = this.contextId;
      } else if (this.contextType === "project") {
        contextFilter.project_id = this.contextId;
        // Include account_id for project context
        if (this.accountId) {
          contextFilter.account_id = this.accountId;
        }
      }
      
      const existingUsersData = await listUsers(contextFilter);
      this.existingUsersMap = {};
      
      // Create a lookup map for efficient filtering
      if (existingUsersData && existingUsersData.users) {
        existingUsersData.users.forEach(user => {
          if (user.username) {
            this.existingUsersMap[user.username] = true;
          }
        });
      }
      
      console.log("[UsersModal] Fetched existing users:", Object.keys(this.existingUsersMap).length);
      
      // Switch to "add user" mode
      this.isAddUserMode = true;
      
      // Update the modal title and button text
      this.updateModalForAddUserMode();
      
      // Clear current selection
      this.selectedUser = null;
      
      // Call users/list with no context filter to get all users (will be filtered in performSearch)
      await this.performSearch(true); // Pass true to indicate "add user" mode search
    } catch (error) {
      console.error("[UsersModal] Error fetching existing users:", error);
      this.errorModal.show({
        title: "Error",
        message: `Failed to prepare user list: ${error.message}`
      });
    } finally {
      this.unlockButtons();
    }
  }

  async handleAddSelectedUserToContext() {
    if (!this.isAddUserMode || !this.selectedUser || !this.contextType || !this.contextId) {
      console.warn("[UsersModal] Cannot add user: Invalid state or missing selection");
      return;
    }
    
    try {
      // Lock buttons while processing
      this.lockButtons();
      
      console.log("[UsersModal] Adding user to context:", {
        username: this.selectedUser,
        contextType: this.contextType,
        contextId: this.contextId
      });
      
      // Call the appropriate API based on context type
      if (this.contextType === "account") {
        await addAccountAccess(this.selectedUser, this.contextId);
      } else if (this.contextType === "project") {
        await addProjectAccess(this.selectedUser, this.contextId);
      }
      
      // Show success message
      this.messageModal.show({
        title: "User Added",
        message: `Successfully added user ${this.selectedUser} to ${this.contextType}: ${this.contextId}`
      });
      
      // Reset modal state after successful addition
      this.isAddUserMode = false;
      this.selectedUser = null;
      
      // Update UI (modal title, button text) back to normal mode
      this.updateModalForAddUserMode();
      
      // Refresh the user list with the context filter
      await this.performSearch();
      
    } catch (error) {
      console.error(`[UsersModal] Error adding user to ${this.contextType}:`, error);
      this.errorModal.show({
        title: "Error",
        message: `Failed to add user: ${error.message}`
      });
    } finally {
      this.unlockButtons();
    }
  }
  
  // Handle the Back to Account button click
  handleBackToAccount() {
    if (this.contextType !== "account" || !this.contextId) {
      console.warn("[UsersModal] handleBackToAccount called but no valid account context");
      return;
    }
    
    console.log("[UsersModal] Navigating back to account:", this.contextId);
    
    // Use modal-to-modal navigation to preserve origin context
    const accountUrl = `/modals/account/${this.contextId}`;
    this.navigateToModal(accountUrl);
  }

  _isUnauthorizedError(err) {
    if (!err || !err.message) return false;
    const msg = err.message.toLowerCase();
    return msg.includes("unauthorized") || msg.includes("invalid or expired token");
  }

  _handleUnauthorized() {
    this.hide();
    const lm = new LoginModal();
    lm.show();
  }
}