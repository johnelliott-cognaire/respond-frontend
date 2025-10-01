// ui/modals/accounts-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { Security } from "../../state/security.js";
import { verifyPermission, getFreshSecurity, SecurityError, AuthenticationError, AuthorizationError, ValidationError } from "../../utils/security-utils.js";
import { fetchAccounts } from "../../api/projects-accounts.js";
import { AccountModal } from "./account-modal.js";
import { ProjectsModal } from "./projects-modal.js";
import { UsersModal } from "./users-modal.js";
import { LoginModal } from "./login-modal.js";
import tooltip from "../framework/tooltip.js";
import formatHumanReadableDate from "../../utils/date-utils.js";


/**
 * AccountsModal
 */
export class AccountsModal extends AsyncFormModal {
  constructor(store, options = {}) {
    super();
    this.store = store;
    this.security = null;

    this.selectionMode = options.selectionMode || false;
    // Always force single selection mode
    this.allowMultiple = false;
    this.onSelect = typeof options.onSelect === "function" ? options.onSelect : null;
    this.filterCallback = typeof options.filterCallback === "function" ? options.filterCallback : null;

    this.accounts = [];
    this.selectedAccounts = [];

    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    this.searchInput = null;
    this.ownerSelect = null;
    this.tableBody = null;


    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
      this.overlayEl.style.zIndex = "9000";
    }

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form accounts-modal";
    this.modalEl.style.display = "none";
    this.modalEl.style.zIndex = "9996";

    const titleText = this.selectionMode ? "Select Account" : "Accounts";

    let buttonRowHtml = "";
    if (this.selectionMode) {
      buttonRowHtml = `
        <div class="action-group action-group--right">
          <button type="button" class="btn" id="accountsCancelBtn">Cancel</button>
          <button type="button" class="btn btn--primary" id="accountsSelectBtn" disabled>Select</button>
        </div>
      `;
    } else {
      // ALWAYS include the New Account button in HTML - visibility will be controlled by _updateNewAccountButtonVisibility()
      buttonRowHtml = `
        <div class="action-group action-group--right">
          <button type="button" class="btn" id="accountsCancelBtn">Cancel</button>
          <button type="button" class="btn" id="manageUsersBtn" disabled>Manage Users</button>
          <button type="button" class="btn" id="viewProjectsBtn" disabled>View Projects</button>
          <button type="button" class="btn btn--primary" id="viewAccountBtn" disabled>View Account</button>
          <button type="button" class="btn btn--secondary" id="newAccountBtn" style="display: none;">New Account</button>
        </div>
      `;
    }

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close accounts modal">&times;</button>
      
      
      <h2>${titleText}</h2>
      
      <div class="modal-section">
        <div class="flex gap-md">
          <div class="form-group flex-1">
            <label for="accountsSearchInput">Search</label>
            <input type="text" id="accountsSearchInput" class="doc-input" placeholder="Search..." aria-label="Search accounts" />
          </div>
          <div class="form-group">
            <label for="accountsOwnerInput">Owner</label>
            <input type="text" id="accountsOwnerInput" class="doc-input" placeholder="Filter by owner (optional)" aria-label="Filter by owner" />
          </div>
          <div class="form-group" style="align-self: flex-end;">
            <button type="button" class="btn" id="accountsSearchBtn" aria-label="Apply search and filters">Search</button>
          </div>
        </div>
      </div>

      <div class="data-table-container">
        <table class="w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Owner</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody id="accountsTableBody"></tbody>
        </table>
      </div>

      ${buttonRowHtml}
    `;
    document.body.appendChild(this.modalEl);

    // Attach event handlers
    this.modalCloseBtn = this.modalEl.querySelector(".modal__close");
    this.modalCloseBtn.addEventListener("click", () => this.hide());

    this.searchInput = this.modalEl.querySelector("#accountsSearchInput");
    this.ownerSelect = this.modalEl.querySelector("#accountsOwnerInput");
    this.tableBody = this.modalEl.querySelector("#accountsTableBody");
    this.searchBtn = this.modalEl.querySelector("#accountsSearchBtn");
    this.cancelBtn = this.modalEl.querySelector("#accountsCancelBtn");


    if (this.searchBtn) {
      this.searchBtn.addEventListener("click", () => this.performSearch());
    }
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener("click", () => this.hide());
    }

    
    if (this.selectionMode) {
      this.selectBtn = this.modalEl.querySelector("#accountsSelectBtn");
      if (this.selectBtn) {
        this.selectBtn.addEventListener("click", () => this.handleSelect());
      }
    } else {
      this.manageUsersBtn = this.modalEl.querySelector("#manageUsersBtn");
      this.viewProjectsBtn = this.modalEl.querySelector("#viewProjectsBtn");
      this.viewAccountBtn = this.modalEl.querySelector("#viewAccountBtn");
      this.newAccountBtn = this.modalEl.querySelector("#newAccountBtn");

      if (this.manageUsersBtn) {
        this.manageUsersBtn.addEventListener("click", () => this.handleManageUsers());
      }
      if (this.viewProjectsBtn) {
        this.viewProjectsBtn.addEventListener("click", () => this.handleViewProjects());
      }
      if (this.viewAccountBtn) {
        this.viewAccountBtn.addEventListener("click", () => this.handleViewAccount());
      }
      
      // CRITICAL FIX: Always attach event handler, regardless of initial visibility
      if (this.newAccountBtn) {
        this.newAccountBtn.addEventListener("click", () => this.handleNewAccount());
        console.log("[AccountsModal] New Account button event handler attached");
      }
    }

    // CRITICAL: Add the missing table click handler
    this.tableBody.addEventListener("click", (evt) => {
      const row = evt.target.closest("tr[data-acct-id]");
      if (!row) return;
      const acctId = row.dataset.acctId;
      // Single selection logic
      this.selectedAccounts = [acctId];
      this.renderTableRows();
      this.updateButtonStates();
    });

    // Don't call _setupTooltips() here - it will be called from show() after security is initialized
    console.log("[AccountsModal] _buildDOM completed - tooltips will be setup in show()");
  }

  /**
   * Clean up existing tooltips to prevent duplicates
   * Called before setting up tooltips
   */
  _cleanupTooltips() {
    if (!this.modalEl) return;
    
    try {
      // Remove duplicate info icons that may have been created
      const existingInfoIcons = this.modalEl.querySelectorAll("#accountsPermissionInfo");
      if (existingInfoIcons.length > 1) {
        // Keep the first one, remove the rest
        for (let i = 1; i < existingInfoIcons.length; i++) {
          console.log("[AccountsModal] Removing duplicate tooltip info icon");
          existingInfoIcons[i].remove();
        }
      }
      
      // Clean up any orphaned tooltip elements that might exist
      const orphanedTooltips = document.querySelectorAll('[data-tooltip-for^="accounts"]');
      orphanedTooltips.forEach(tooltip => {
        const targetId = tooltip.getAttribute('data-tooltip-for');
        const target = document.getElementById(targetId);
        if (!target || !this.modalEl.contains(target)) {
          console.log("[AccountsModal] Removing orphaned tooltip element");
          tooltip.remove();
        }
      });
      
      console.log("[AccountsModal] Tooltip cleanup completed");
      
    } catch (error) {
      console.error("[AccountsModal] Error during tooltip cleanup:", error);
      // Don't throw - this is defensive cleanup
    }
  }

  _setupTooltips() {
    // SAFETY CHECK: Don't setup tooltips if security isn't initialized yet
    if (!this.security) {
      console.log("[AccountsModal] _setupTooltips called but security not initialized yet");
      return;
    }

    // CRITICAL FIX: Clean up existing tooltips to prevent duplicates
    this._cleanupTooltips();

    // Header tooltip
    const headerEl = this.modalEl.querySelector("h2");
    if (headerEl) {
      // Check if info icon already exists
      let infoIcon = headerEl.querySelector("#accountsPermissionInfo");
      if (!infoIcon) {
        // Create info icon only if it doesn't exist
        infoIcon = document.createElement("span");
        infoIcon.innerHTML = `<i class="fas fa-info-circle" style="margin-left: 8px; cursor: help;"></i>`;
        infoIcon.id = "accountsPermissionInfo";
        
        // Append it to the header
        headerEl.appendChild(infoIcon);
        console.log("[AccountsModal] Created new tooltip info icon");
      } else {
        console.log("[AccountsModal] Reusing existing tooltip info icon");
      }

      // Attach tooltip to the icon (tooltip framework should handle duplicates)
      tooltip.attach(infoIcon, `
        <strong>Account Access Rules:</strong><br>
        • SYSTEM_ADMIN or APP_ADMIN users can view all accounts<br>
        • Other users can only view accounts:<br>
        &nbsp;&nbsp;- Listed in their authorized_accounts permissions<br>
        &nbsp;&nbsp;- Where they are listed as the account owner<br>
        • Editing requires ACCOUNT_EDITOR permission and authorized access
      `);

      // Attach tooltip to header (tooltip framework should handle duplicates)
      tooltip.attach(headerEl, "Accounts are top-level organizational units that contain projects. " +
        (this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]) ?
          "As an administrator, you can see all accounts in the system." :
          "You can see accounts where you have been granted specific access permissions."));
    }

    // Search input tooltip - defensive attachment
    if (this.searchInput && !this.searchInput.hasAttribute('data-tooltip-attached')) {
      tooltip.attach(this.searchInput, "Search accounts by name. Enter text to filter the list of accounts.");
      this.searchInput.setAttribute('data-tooltip-attached', 'true');
    }

    // Owner filter tooltip - defensive attachment
    if (this.ownerSelect && !this.ownerSelect.hasAttribute('data-tooltip-attached')) {
      tooltip.attach(this.ownerSelect, "Filter accounts by owner username. Only accounts with the specified owner will be shown.");
      this.ownerSelect.setAttribute('data-tooltip-attached', 'true');
    }

    // Button tooltips - defensive attachments
    if (this.manageUsersBtn && !this.manageUsersBtn.hasAttribute('data-tooltip-attached')) {
      tooltip.attach(this.manageUsersBtn, "Manage which users have access to the selected account. Requires appropriate permissions.");
      this.manageUsersBtn.setAttribute('data-tooltip-attached', 'true');
    }

    if (this.viewProjectsBtn && !this.viewProjectsBtn.hasAttribute('data-tooltip-attached')) {
      tooltip.attach(this.viewProjectsBtn, "View all projects within the selected account that you have access to.");
      this.viewProjectsBtn.setAttribute('data-tooltip-attached', 'true');
    }

    if (this.viewAccountBtn && !this.viewAccountBtn.hasAttribute('data-tooltip-attached')) {
      tooltip.attach(this.viewAccountBtn, "View and edit the selected account's details. Editing requires ACCOUNT_EDITOR permission.");
      this.viewAccountBtn.setAttribute('data-tooltip-attached', 'true');
    }

    if (this.newAccountBtn && !this.newAccountBtn.hasAttribute('data-tooltip-attached')) {
      tooltip.attach(this.newAccountBtn, "Create a new account. Requires SYSTEM_ADMIN or APP_ADMIN permission.");
      this.newAccountBtn.setAttribute('data-tooltip-attached', 'true');
    }
    
    console.log("[AccountsModal] Tooltips setup completed successfully");
  }

  async show(options = {}) {
    try {
      // CRITICAL FIX: Initialize security EVERY time show() is called with fail-fast authentication
      this.security = getFreshSecurity(this.store);
      
      // Wait a tick to ensure security is fully loaded
      await new Promise(resolve => setTimeout(resolve, 0));
      
      
      // Make sure all action buttons start disabled
      this.disableRowActionButtons();
      
      console.log("[AccountsModal] show() => refreshed security permissions:", {
        "system_permissions": this.security.permissions.system_permissions,
        "authorized_accounts": this.security.permissions.authorized_accounts,
        "hasSystemAdmin": this.security.hasSystemPermission("SYSTEM_ADMIN"),
        "hasAppAdmin": this.security.hasSystemPermission("APP_ADMIN")
      });

      // Re-render the DOM to ensure New Account button visibility is correct
      this._updateNewAccountButtonVisibility();

      // NOW setup tooltips after security is initialized
      this._setupTooltips();

      super.show(options);
      await this.performSearch();
      
      // Register with router for URL navigation (if available)
      if (typeof window.registerModalWithRouter === 'function') {
        window.registerModalWithRouter('accounts', this, {
          routeId: 'admin', // Target route for accounts modal
          updateUrl: true,
          preserveQuery: true
        });
      }
      
    } catch (error) {
      console.error("[AccountsModal] show() failed:", error);
      
      // Handle authentication errors by redirecting to login
      if (error instanceof AuthenticationError || error instanceof SecurityError) {
        this.errorModal.show({
          title: "Authentication Required",
          message: error.message + "\n\nYou will be redirected to the login screen.",
          details: `Context: ${error.context || "AccountsModal.show"}\nTimestamp: ${error.timestamp || new Date().toISOString()}`
        });
        
        // Redirect to login after user acknowledges the error
        setTimeout(() => {
          this.hide();
          this._handleUnauthorized();
        }, 3000);
        return;
      }
      
      // Handle other errors
      this.errorModal.show({
        title: "Failed to Load Accounts",
        message: `An error occurred while initializing the accounts modal: ${error.message}`,
        details: error.stack || error.toString()
      });
      
      this.hide();
    }
  }

  _updateNewAccountButtonVisibility() {
    const newAccountBtn = this.modalEl.querySelector("#newAccountBtn");
    if (newAccountBtn) {
      const hasPermission = this.security && this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]);
      if (hasPermission) {
        newAccountBtn.style.display = "inline-block";
        console.log("[AccountsModal] New Account button made visible");
      } else {
        newAccountBtn.style.display = "none";
        console.log("[AccountsModal] New Account button hidden - insufficient permissions");
      }
    }
  }

  disableRowActionButtons() {
    console.log("[AccountsModal] Explicitly disabling all row action buttons");
    // Explicitly disable all buttons that operate on selected rows
    if (this.manageUsersBtn) this.manageUsersBtn.disabled = true;
    if (this.viewProjectsBtn) this.viewProjectsBtn.disabled = true;
    if (this.viewAccountBtn) this.viewAccountBtn.disabled = true;

    if (this.selectionMode && this.selectBtn) {
      this.selectBtn.disabled = true;
    }

    // Do NOT disable close/cancel buttons or search button
  }

  async performSearch() {
    try {
      this.lockFormFields();  // Only lock form fields, not buttons

      // Disable only search-related buttons during search
      if (this.searchBtn) this.searchBtn.disabled = true;
      if (this.cancelBtn) this.cancelBtn.disabled = true;

      // Add loading indicator
      const loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'accountsLoadingIndicator';
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.textContent = 'Loading accounts...';
      loadingIndicator.style.textAlign = 'center';
      loadingIndicator.style.padding = '1rem';
      this.tableBody.innerHTML = '';
      this.tableBody.appendChild(loadingIndicator);

      const filters = {};
      const ownerVal = this.ownerSelect?.value?.trim();
      if (ownerVal) {
        filters.owner = ownerVal;
      }
      const searchVal = this.searchInput?.value?.trim();
      if (searchVal) {
        filters.name = searchVal;
      }

      console.log("[AccountsModal] performSearch => filters:", filters);
      this.accounts = await fetchAccounts(filters);

      if (typeof this.filterCallback === "function") {
        this.accounts = this.accounts.filter(a => this.filterCallback(a));
      }

      // Clear any existing selection when performing a new search
      this.selectedAccounts = [];

      // Remove loading indicator
      const indicator = document.getElementById('accountsLoadingIndicator');
      if (indicator) {
        indicator.remove();
      }

      this.renderTableRows();

      // Important: Explicitly disable all row action buttons after loading data
      // since no row is selected initially
      this.disableRowActionButtons();
    } catch (err) {
      console.error("[AccountsModal] performSearch error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({
          title: "Error",
          message: "Failed to fetch accounts: " + err.message
        });
      }
    } finally {
      this.unlockFormFields();  // Unlock the form fields

      // Re-enable search-related buttons
      if (this.searchBtn) this.searchBtn.disabled = false;
      if (this.cancelBtn) this.cancelBtn.disabled = false;

      // Do NOT enable row action buttons - they should remain disabled until a row is selected
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

    for (const acct of this.accounts) {
      const acctId = acct.account_id || "";
      const acctName = acct.name || "(No Name)";
      const owner = acct.owner || "";
      
      // Use standard date format utility
      const created = formatHumanReadableDate(acct.created_datetime || "");

      const isSelected = this.selectedAccounts.includes(acctId);
      const row = document.createElement("tr");
      row.dataset.acctId = acctId;
      if (isSelected) row.classList.add("selected-row");

      // Add a cursor:pointer style to indicate clickable rows
      row.style.cursor = "pointer";

      row.innerHTML = `
        <td>${acctName}</td>
        <td>${acctId}</td>
        <td>${owner}</td>
        <td>${created}</td>
      `;

      this.tableBody.appendChild(row);
    }
  }

  updateButtonStates() {
    if (this.selectionMode && this.selectBtn) {
      this.selectBtn.disabled = (this.selectedAccounts.length === 0);
    } else {
      const exactlyOne = (this.selectedAccounts.length === 1);
      if (this.manageUsersBtn) {
        this.manageUsersBtn.disabled = !exactlyOne;
      }
      if (this.viewProjectsBtn) {
        this.viewProjectsBtn.disabled = !exactlyOne;
      }
      if (this.viewAccountBtn) {
        this.viewAccountBtn.disabled = !exactlyOne;
      }
    }

    console.log("[AccountsModal] updateButtonStates => buttons updated based on selection:",
      this.selectedAccounts.length > 0 ? "Row selected" : "No row selected");
  }

  handleSelect() {
    if (!this.onSelect) {
      console.warn("[AccountsModal] selectionMode but no onSelect callback provided.");
      return;
    }
    if (this.selectedAccounts.length === 0) {
      this.messageModal.show({
        title: "No Accounts Selected",
        message: "Please select at least one account."
      });
      return;
    }

    // Even though this.allowMultiple is false, still handle properly based on setting
    if (this.allowMultiple) {
      this.onSelect([...this.selectedAccounts]);
    } else {
      const sel = this.selectedAccounts[0] || null;
      this.onSelect(sel);
    }
    this.hide();
  }

  handleNewAccount() {
    console.log("[AccountsModal] handleNewAccount clicked");
    
    try {
      // CRITICAL: Validate authentication before allowing account creation
      if (!this.security) {
        throw new SecurityError("Security context not available for account creation", {
          context: "handleNewAccount"
        });
      }
      
      // Verify user is authenticated
      const user = this.store.get("user");
      if (!user || !user.username) {
        throw new AuthenticationError("Authentication required for account creation. User must be logged in.", {
          context: "handleNewAccount"
        });
      }
      
      // Verify user has permission to create accounts
      if (!this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
        throw new AuthorizationError("Account creation requires SYSTEM_ADMIN or APP_ADMIN permission.", {
          context: "handleNewAccount",
          username: user.username,
          requiredPermissions: ["SYSTEM_ADMIN", "APP_ADMIN"],
          userPermissions: this.security.permissions.system_permissions || []
        });
      }
      
      console.log("[AccountsModal] Account creation authorized for user:", user.username);
      
      // Use modal-to-modal navigation to preserve origin context
      const newAccountUrl = `/modals/account/new`;
      this.navigateToModal(newAccountUrl);
      
    } catch (error) {
      console.error("[AccountsModal] handleNewAccount failed:", error);
      
      // Handle authentication errors
      if (error instanceof AuthenticationError) {
        this.errorModal.show({
          title: "Authentication Required",
          message: error.message + "\n\nPlease log in to create accounts.",
          details: `Context: ${error.context}\nTimestamp: ${error.timestamp || new Date().toISOString()}`
        });
        
        // Redirect to login
        setTimeout(() => this._handleUnauthorized(), 2000);
        return;
      }
      
      // Handle authorization errors
      if (error instanceof AuthorizationError) {
        this.errorModal.show({
          title: "Permission Denied",
          message: error.message + "\n\nContact your administrator to request account creation permissions.",
          details: `Context: ${error.context}\nRequired: ${error.context.requiredPermissions?.join(", ") || "SYSTEM_ADMIN or APP_ADMIN"}\nUser has: ${error.context.userPermissions?.join(", ") || "none"}`
        });
        return;
      }
      
      // Handle other security errors
      if (error instanceof SecurityError) {
        this.errorModal.show({
          title: "Security Error",
          message: `A security error occurred: ${error.message}`,
          details: error.context ? JSON.stringify(error.context, null, 2) : error.stack
        });
        return;
      }
      
      // Handle unexpected errors
      this.errorModal.show({
        title: "Account Creation Failed",
        message: `Failed to initiate account creation: ${error.message}`,
        details: error.stack || error.toString()
      });
    }
  }

  handleManageUsers() {
    if (!this.selectedAccounts.length) return;
    const acctId = this.selectedAccounts[0];
    console.log("[AccountsModal] handleManageUsers => account=", acctId);
  
    // Check permission before proceeding
    if (!this.security.canGrantAccountAccess(acctId)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to manage users for account: ${acctId}`
      });
      return;
    }
  
    // Find the account in our accounts array to get the name
    const selectedAccount = this.accounts.find(a => a.account_id === acctId);
    const accountName = selectedAccount?.name || null;
  
    this.hide();
    const usersModal = new UsersModal(this.store, {
      contextType: "account",
      contextId: acctId,
      accountName: accountName
    });
    usersModal.show();
  }

  handleViewProjects() {
    if (!this.selectedAccounts.length) return;
    const acctId = this.selectedAccounts[0];
    console.log("[AccountsModal] handleViewProjects => account=", acctId);

    // Check permission before proceeding
    if (!this.security.canAccessAccount(acctId)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to view projects for account: ${acctId}`
      });
      return;
    }

    console.log("[AccountsModal] Navigating to projects modal with account context:", acctId);

    // Use modal-to-modal navigation to preserve origin context
    const projectsUrl = `/modals/projects/${acctId}`;
    this.navigateToModal(projectsUrl);
  }

  handleViewAccount() {
    if (!this.selectedAccounts.length) return;
    const acctId = this.selectedAccounts[0];
    console.log("[AccountsModal] handleViewAccount => account=", acctId);
  
    // Enhanced debugging for permission issues - NOW WITH SAFETY CHECKS
    console.log("[AccountsModal] Permission check details:", {
      "system_permissions": Array.isArray(this.security?.permissions?.system_permissions) 
        ? this.security.permissions.system_permissions 
        : "undefined or not array",
      "has_SYSTEM_ADMIN": this.security?.hasSystemPermission("SYSTEM_ADMIN") || false,
      "has_APP_ADMIN": this.security?.hasSystemPermission("APP_ADMIN") || false,
      "authorized_accounts": Array.isArray(this.security?.permissions?.authorized_accounts) 
        ? this.security.permissions.authorized_accounts 
        : "undefined or not array",
      "account_in_authorized_list": Array.isArray(this.security?.permissions?.authorized_accounts) 
        ? this.security.permissions.authorized_accounts.includes(acctId)
        : false
    });
  
    // Refresh security to make absolutely sure we have current data
    this.security = getFreshSecurity(this.store);
  
    // Check permission before proceeding
    if (!this.security.canAccessAccount(acctId)) {
      console.error(`[AccountsModal] Access denied to account ${acctId} - permissions check failed`);
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to view account: ${acctId}`
      });
      return;
    }
  
    console.log("[AccountsModal] Navigating to account detail modal for account:", acctId);

    // Use modal-to-modal navigation to preserve origin context
    const accountUrl = `/modals/account/${acctId}`;
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





  /**
   * Override hide method to clean up tooltips and prevent memory leaks
   * @param {Object} options - Hide options (passed to parent)
   */
  hide(options = {}) {
    console.log("[AccountsModal] 🔄 hide() called");
    console.log("[AccountsModal] 🔄   - Modal ID:", this.getModalId?.() || this.modalId);
    console.log("[AccountsModal] 🔄   - Has origin tracking:", this.hasOriginUrl?.() || 'method not available');

    try {
      // Clean up tooltips before hiding
      this._cleanupTooltips();

      // Reset tooltip attachment markers
      if (this.modalEl) {
        const elementsWithTooltips = this.modalEl.querySelectorAll('[data-tooltip-attached]');
        elementsWithTooltips.forEach(el => el.removeAttribute('data-tooltip-attached'));
      }

      console.log("[AccountsModal] Tooltip cleanup completed before hiding");
    } catch (error) {
      console.error("[AccountsModal] Error during tooltip cleanup on hide:", error);
      // Don't throw - modal should still hide
    }

    // Unregister from router (if available)
    if (typeof window.unregisterModalFromRouter === 'function') {
      window.unregisterModalFromRouter('accounts');
    }

    console.log("[AccountsModal] 🔄 About to call super.hide()");

    // Call parent hide method with options
    super.hide(options);

    console.log("[AccountsModal] 🔄 super.hide() completed");
  }
}