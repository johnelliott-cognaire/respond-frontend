// File: ui/modals/user-modal.js

import {
  addAccountAccess,
  addProjectAccess,
  getUser,
  updateUserPermissions,
} from "../../api/users.js";
import { getFreshSecurity } from "../../utils/security-utils.js";
import tooltip from "../framework/tooltip.js";
import { AccountsModal } from "./accounts-modal.js";
import { AddCorpusPermissionModal } from "./add-corpus-permission-modal.js";
import { AddDocchainPermissionModal } from "./add-docchain-permission-modal.js";
import { AsyncFormEntityModal } from "./async-form-entity-modal.js";
import { DuplicatePermissionsModal } from "./duplicate-permissions-modal.js";
import { ErrorModal } from "./error-modal.js";
import { LoginModal } from "./login-modal.js";
import { MessageModal } from "./message-modal.js";
import { ProjectsModal } from "./projects-modal.js";
import { YesNoModal } from "./yesno-modal.js";

/**
 * UserModal
 * 
 * Shows user details and allows editing of permissions.
 * Key behaviors:
 * - Supports both admin view and 'self-view' modes
 * - Email field is always editable in edit mode
 * - System permissions only editable by SYSTEM_ADMIN and not in self-view
 * - Add/remove permission buttons only available in admin view
 */
export class UserModal extends AsyncFormEntityModal {
  /**
   * @param {object} store - Application state store
   * @param {object} options - Configuration options
   * @param {string} options.username - The user being viewed
   * @param {boolean} options.isNewUser - If true, creating a new user
   * @param {string} options.contextType - "account" | "project" | null
   * @param {string} options.contextId - Relevant ID for context
   * @param {boolean} options.forceEditMode - Start in edit mode
   */
  constructor(store, options = {}) {
    super({
      store,
      isNewEntity: !!options.isNewUser,
      // Only force edit mode for new entities by default
      forceEditMode: !!options.isNewUser || !!options.forceEditMode
    });

    // Log initialization state for debugging
    console.log("[UserModal] constructor => options:", {
      username: options.username || "",
      isNewUser: !!options.isNewUser,
      forceEditMode: !!options.forceEditMode,
      resultingEditMode: this.editMode
    });

    this.username = options.username || "";
    this.contextType = options.contextType || null;
    this.contextId = options.contextId || null;
    this.isSelfView = false; // Will be determined during load

    // Standard system perms
    this.systemPermissions = [
      "APP_ACCESS",
      "SYSTEM_ADMIN",
      "APP_ADMIN",
      "ACCOUNT_EDITOR",
      "ACCOUNT_VIEWER",
      "PROJECT_EDITOR",
      "PROJECT_VIEWER",
    ];

    // Tooltip content for system permissions
    this.systemPermTooltips = {
      "APP_ACCESS": "Basic permission required to access the application. All users must have this permission to log in and use any features of the system.",
      "SYSTEM_ADMIN": "Highest-level permission with unrestricted access to all features, accounts, and projects. Can assign any permission level to any user, including SYSTEM_ADMIN itself.",
      "APP_ADMIN": "Can create and manage all accounts without needing explicit authorization. Can assign most permissions (except SYSTEM_ADMIN) and manage corpus/AnalysisLM permissions. Still needs explicit project authorization.",
      "ACCOUNT_EDITOR": "Can edit details of accounts in your authorized_accounts list and create projects under them. Can assign PROJECT_EDITOR/VIEWER permissions but not account-level permissions.",
      "ACCOUNT_VIEWER": "View-only access to accounts in your authorized_accounts list. Cannot edit accounts, create projects, or assign permissions.",
      "PROJECT_EDITOR": "Can edit details of projects in your authorized_projects list and grant others access to those projects. Can edit documents in these projects.",
      "PROJECT_VIEWER": "View-only access to projects in your authorized_projects list. Can view (but not edit) documents in these projects. Cannot edit projects or manage project access."
    };

    // Tooltip content for section labels
    this.sectionTooltips = {
      "systemPerms": "System permissions define your role and overall capabilities in the application. These work alongside your account and project authorizations to determine what you can access and modify.",
      "accountPerms": "Account permissions determine which specific accounts you can access. Your system permissions determine what actions you can perform on these accounts.",
      "projectPerms": "Project permissions determine which specific projects you can access. Your system permissions determine what actions you can perform on these projects.",
      "corpusPerms": "Corpus permissions control what operations you can perform on specific document collections (corpora), such as running queries or managing corpus contents.",
      "docchainPerms": "AnalysisLM permissions control which specific workflow processes you can execute. Each entry represents a single type of workflow you can initiate."
    };

    // Dialog services
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.yesNoModal = new YesNoModal();

    // Security service
    this.security = getFreshSecurity(store);

    // Build the DOM
    this._buildDOM();

    // Register UI components
    this._registerComponents();
  }

  /**
   * Returns initial empty user data structure
   */
  getEmptyDataModel() {
    return {
      username: "",
      email: "",
      permissions: {
        system_permissions: [],
        corpus_permissions: {},
        docchain_permissions: []
      },
      authorized_accounts: [],
      authorized_projects: []
    };
  }

  /**
   * Determines the access level for this entity based on user permissions
   */
  determineAccessLevel() {
    // If viewing self, limit to BASIC access regardless of permissions
    if (this.isSelfView) {
      return this.accessLevels.BASIC;
    }

    // Check for admin permissions
    if (this.security.hasSystemPermission('SYSTEM_ADMIN')) {
      return this.accessLevels.ADMIN;
    }

    if (this.security.hasSystemPermission('APP_ADMIN')) {
      return this.accessLevels.EXTENDED;
    }

    return this.accessLevels.BASIC;
  }

  /**
   * Checks if current user can edit the target user
   */
  canEditUser() {
    const hasAdminPerms = this.security.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN']);
    const isSelfAndExisting = this.isSelfView && !this.isNewEntity;
    return hasAdminPerms || isSelfAndExisting;
  }

  /**
   * Helper function to determine account access level based on system permissions
   * @returns {Object} Access level info with type and style
   */
  _getAccountAccessLevel() {
    const permissions = this.currentData?.permissions?.system_permissions || [];

    if (permissions.includes('SYSTEM_ADMIN') || permissions.includes('APP_ADMIN')) {
      return {
        text: "Edit and View",
        type: "full-access",
        style: "color: #28a745;" // Green color
      };
    } else if (permissions.includes('ACCOUNT_EDITOR')) {
      return {
        text: "Edit and View",
        type: "edit-access",
        style: "color: #28a745;" // Green color
      };
    } else if (permissions.includes('ACCOUNT_VIEWER')) {
      return {
        text: "View only",
        type: "view-access",
        style: "color: #28a745;" // Green color
      };
    } else {
      return {
        text: "Warning: No system permission configured",
        type: "no-access",
        style: "color: #dc3545; font-weight: 500;" // Red color, slightly bold
      };
    }
  }

  /**
   * Helper function to determine project access level based on system permissions
   * @returns {Object} Access level info with type and style
   */
  _getProjectAccessLevel() {
    const permissions = this.currentData?.permissions?.system_permissions || [];

    if (permissions.includes('SYSTEM_ADMIN') || permissions.includes('APP_ADMIN')) {
      return {
        text: "Edit and View",
        type: "full-access",
        style: "color: #28a745;" // Green color
      };
    } else if (permissions.includes('PROJECT_EDITOR')) {
      return {
        text: "Edit and View",
        type: "edit-access",
        style: "color: #28a745;" // Green color
      };
    } else if (permissions.includes('PROJECT_VIEWER')) {
      return {
        text: "View only",
        type: "view-access",
        style: "color: #28a745;" // Green color
      };
    } else {
      return {
        text: "Warning: No system permission configured",
        type: "no-access",
        style: "color: #dc3545; font-weight: 500;" // Red color, slightly bold
      };
    }
  }

  /**
   * Create all DOM elements for the modal
   */
  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form user-modal";
    this.modalEl.style.display = "none";

    // For scrolling of tall content
    this.modalEl.style.maxHeight = "80vh";
    this.modalEl.style.overflowY = "auto";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close User Modal" id="closeUserModalBtn">&times;</button>
      <h2 id="umTitleH2">User Details</h2>

      <div class="form-group">
        <label>Username</label>
        <input type="text" id="umUsernameField" class="doc-input" />
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="text" id="umEmailField" class="doc-input" />
      </div>

      <div class="form-group" id="umSystemPermsWrapper">
        <label>
          System Permissions
          <span class="info-icon" id="systemPermsInfo">ⓘ</span>
        </label>
        <div id="umSystemPermsContainer" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
      </div>

      <div class="form-group">
        <label>
          Account Permissions
          <span class="info-icon" id="accountPermsInfo">ⓘ</span>
          <span id="accountAccessLevel" style="margin-left: 10px; font-size: 0.9em;"></span>
        </label>
        <div id="umAccountsList"
            style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:100px; overflow-y:auto;"></div>
        <button type="button" class="btn btn--secondary" id="umAddAccountBtn" style="margin-top:0.5rem;">
          Add Account Permission
        </button>
      </div>

      <div class="form-group">
        <label>
          Project Permissions
          <span class="info-icon" id="projectPermsInfo">ⓘ</span>
          <span id="projectAccessLevel" style="margin-left: 10px; font-size: 0.9em;"></span>
        </label>
        <div id="umProjectsList"
            style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:100px; overflow-y:auto;"></div>
        <button type="button" class="btn btn--secondary" id="umAddProjectBtn" style="margin-top:0.5rem;">
          Add Project Permission
        </button>
      </div>

      <div class="form-group">
        <label>
          Corpus Permissions
          <span class="info-icon" id="corpusPermsInfo">ⓘ</span>
        </label>
        <div id="umCorpusPermsList"
            style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:150px; overflow-y:auto; font-size:0.9rem;"></div>
        <button type="button" class="btn btn--secondary" id="umAddCorpusBtn" style="margin-top:0.5rem;">
          Add Corpus Permission
        </button>
      </div>

      <div class="form-group">
        <label>
          AnalysisLM Permissions
          <span class="info-icon" id="docchainPermsInfo">ⓘ</span>
        </label>
        <div id="umDocChainPermsList"
            style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:100px; overflow-y:auto; font-size:0.9rem;"></div>
        <button type="button" class="btn btn--secondary" id="umAddDocChainBtn" style="margin-top:0.5rem;">
          Add AnalysisLM Permission
        </button>
      </div>

      <div class="button-group" style="margin-top:1rem;">
        <button type="button" class="btn btn--secondary" id="umBackToUsersBtn">
          <i class="fas fa-arrow-left"></i> Back to Users
        </button>
        <button type="button" class="btn" id="umEditBtn">Edit</button>
        <button type="button" class="btn btn--primary" id="umSaveChangesBtn">Save Changes</button>
        <button type="button" class="btn btn--secondary" id="umDuplicatePermsBtn" style="margin-left:auto;">
          Duplicate Permissions
        </button>
      </div>
    `;

    // Create admin actions section
    const adminActionsSection = document.createElement("div");
    adminActionsSection.className = "modal-section";
    adminActionsSection.id = "umAdminActionsSection";
    adminActionsSection.innerHTML = `
      <h3>Admin Actions</h3>
      <div class="admin-actions-grid">
        <button type="button" class="btn btn--secondary" id="umGenerateRegUrlBtn">
          <i class="fas fa-user-plus"></i> Generate Registration URL
        </button>
        <button type="button" class="btn btn--secondary" id="umGenerateResetUrlBtn">
          <i class="fas fa-key"></i> Generate Password Reset URL
        </button>
        <button type="button" class="btn btn--secondary" id="umUnlockAccountBtn">
          <i class="fas fa-unlock"></i> Unlock Account
        </button>
      </div>
    `;

    // Insert before the existing button group
    const existingButtonGroup = this.modalEl.querySelector(".button-group");
    existingButtonGroup.parentNode.insertBefore(adminActionsSection, existingButtonGroup);

    // Store references to new buttons
    this.generateRegUrlBtn = adminActionsSection.querySelector("#umGenerateRegUrlBtn");
    this.generateResetUrlBtn = adminActionsSection.querySelector("#umGenerateResetUrlBtn");
    this.unlockAccountBtn = adminActionsSection.querySelector("#umUnlockAccountBtn");
    this.adminActionsSection = adminActionsSection;

    document.body.appendChild(this.modalEl);

    // Store references to elements
    this.titleH2 = this.modalEl.querySelector("#umTitleH2");
    this.usernameField = this.modalEl.querySelector("#umUsernameField");
    this.emailField = this.modalEl.querySelector("#umEmailField");
    this.systemPermsContainer = this.modalEl.querySelector("#umSystemPermsContainer");
    this.systemPermsWrapper = this.modalEl.querySelector("#umSystemPermsWrapper");
    this.accountsList = this.modalEl.querySelector("#umAccountsList");
    this.projectsList = this.modalEl.querySelector("#umProjectsList");
    this.corpusPermsList = this.modalEl.querySelector("#umCorpusPermsList");
    this.docChainPermsList = this.modalEl.querySelector("#umDocChainPermsList");

    // Access level indicators
    this.accountAccessLevel = this.modalEl.querySelector("#accountAccessLevel");
    this.projectAccessLevel = this.modalEl.querySelector("#projectAccessLevel");

    // Info icons
    this.systemPermsInfo = this.modalEl.querySelector("#systemPermsInfo");
    this.accountPermsInfo = this.modalEl.querySelector("#accountPermsInfo");
    this.projectPermsInfo = this.modalEl.querySelector("#projectPermsInfo");
    this.corpusPermsInfo = this.modalEl.querySelector("#corpusPermsInfo");
    this.docchainPermsInfo = this.modalEl.querySelector("#docchainPermsInfo");

    // Buttons
    this.addAccountBtn = this.modalEl.querySelector("#umAddAccountBtn");
    this.addProjectBtn = this.modalEl.querySelector("#umAddProjectBtn");
    this.addCorpusBtn = this.modalEl.querySelector("#umAddCorpusBtn");
    this.addDocChainBtn = this.modalEl.querySelector("#umAddDocChainBtn");
    this.editBtn = this.modalEl.querySelector("#umEditBtn");
    this.saveBtn = this.modalEl.querySelector("#umSaveChangesBtn");
    this.duplicateBtn = this.modalEl.querySelector("#umDuplicatePermsBtn");
    this.backToUsersBtn = this.modalEl.querySelector("#umBackToUsersBtn");

    // Close button
    this.closeBtn = this.modalEl.querySelector("#closeUserModalBtn");
    this.closeBtn.addEventListener("click", () => {
      if (this.editMode && this.formDirty) {
        // If in edit mode with changes, ask for confirmation
        this.dialogService.confirm(
          'Discard Changes',
          'You have unsaved changes. Are you sure you want to discard them?',
          () => this.hide(),
          null
        );
      } else {
        // Otherwise just close
        this.hide();
      }
    });

    // Initialize tooltips
    this._setupTooltips();
  }

  /**
   * Setup tooltips for all info icons and system permissions
   */
  _setupTooltips() {
    // Section info icons
    tooltip.attach(this.systemPermsInfo, this.sectionTooltips.systemPerms);
    tooltip.attach(this.accountPermsInfo, this.sectionTooltips.accountPerms);
    tooltip.attach(this.projectPermsInfo, this.sectionTooltips.projectPerms);
    tooltip.attach(this.corpusPermsInfo, this.sectionTooltips.corpusPerms);
    tooltip.attach(this.docchainPermsInfo, this.sectionTooltips.docchainPerms);
  }

  /**
   * Register form components with their access rules
   */
  _registerComponents() {
    // Register fields
    this.registerField('username', this.usernameField, {
      editableInViewMode: false,
      editableInEditMode: this.isNewEntity, // Only editable for new users
      onChange: () => this.markDirty()
    });

    this.registerField('email', this.emailField, {
      editableInViewMode: false,
      editableInEditMode: true, // Always editable in edit mode
      onChange: () => this.markDirty()
    });

    // Register system permissions section
    this.registerSection('systemPerms', this.systemPermsWrapper, {
      requiredAccessLevel: this.accessLevels.BASIC // Always visible, but controls inside will be restricted
    });

    // Register buttons with their access rules and handlers

    // Edit button (only enabled if user can edit the target user)
    this.registerButton('edit', this.editBtn, {
      visibleInViewMode: true,
      visibleInEditMode: true,
      enabledInViewMode: () => this.canEditUser(),
      enabledInEditMode: true,
      onClick: () => this.handleToggleEditMode()
    });

    // Save button (only visible in edit mode)
    this.registerButton('save', this.saveBtn, {
      visibleInViewMode: false,
      visibleInEditMode: true,
      enabledInEditMode: () => this.formDirty,
      onClick: () => this.handleSave()
    });

    // Duplicate Permissions button (only for admins in view mode)
    this.registerButton('duplicate', this.duplicateBtn, {
      requiredAccessLevel: this.accessLevels.EXTENDED,
      visibleInViewMode: true,
      visibleInEditMode: false,
      enabledInViewMode: () => !this.isSelfView && !!this.currentData?.username,
      onClick: () => this.handleDuplicatePermissions()
    });

    // Back to Users button (always visible and enabled)
    this.registerButton('backToUsers', this.backToUsersBtn, {
      visibleInViewMode: true,
      visibleInEditMode: true,
      enabledInViewMode: true,
      enabledInEditMode: true,
      onClick: () => this.handleBackToUsers()
    });

    // Admin action buttons (only visible in view mode for admins)
    [
      { id: 'addAccount', element: this.addAccountBtn, handler: () => this.handleAddAccountPermission() },
      { id: 'addProject', element: this.addProjectBtn, handler: () => this.handleAddProjectPermission() },
      { id: 'addCorpus', element: this.addCorpusBtn, handler: () => this.handleAddCorpusPermission() },
      { id: 'addDocChain', element: this.addDocChainBtn, handler: () => this.handleAddDocchainPermission() }
    ].forEach(btn => {
      this.registerButton(btn.id, btn.element, {
        requiredAccessLevel: this.accessLevels.EXTENDED,
        visibleInViewMode: () => !this.isSelfView, // Only shown for admins viewing other users
        visibleInEditMode: false,
        enabledInViewMode: true,
        onClick: btn.handler
      });
    });

    // Register admin actions section first
    this.registerSection('adminActions', this.adminActionsSection, {
      requiredAccessLevel: this.accessLevels.EXTENDED,
      visibleInViewMode: () => !this.isSelfView,
      visibleInEditMode: false
    });

    // Register admin action buttons (only visible for admins viewing other users)
    this.registerButton('generateRegUrl', this.generateRegUrlBtn, {
      requiredAccessLevel: this.accessLevels.EXTENDED,
      visibleInViewMode: () => !this.isSelfView,
      visibleInEditMode: false,
      enabledInViewMode: () => !!this.currentData?.username,
      onClick: () => this.handleGenerateRegistrationUrl()
    });

    this.registerButton('generateResetUrl', this.generateResetUrlBtn, {
      requiredAccessLevel: this.accessLevels.EXTENDED,
      visibleInViewMode: () => !this.isSelfView,
      visibleInEditMode: false,
      enabledInViewMode: () => !!this.currentData?.username,
      onClick: () => this.handleGeneratePasswordResetUrl()
    });


    this.registerButton('unlockAccount', this.unlockAccountBtn, {
      requiredAccessLevel: this.accessLevels.EXTENDED,
      visibleInViewMode: () => !this.isSelfView,
      visibleInEditMode: false,
      enabledInViewMode: () => !!this.currentData?.username && this.currentData?.account_status === 'LOCKED',
      onClick: () => this.handleUnlockAccount()
    });
  }

  /**
   * Update the access level indicators based on current system permissions
   */
  _updateAccessLevelIndicators() {
    // Update account access level indicator
    const accountAccess = this._getAccountAccessLevel();
    if (this.accountAccessLevel) {
      this.accountAccessLevel.textContent = `[${accountAccess.text}]`;
      this.accountAccessLevel.style = accountAccess.style;
      this.accountAccessLevel.dataset.accessType = accountAccess.type;
    }

    // Update project access level indicator
    const projectAccess = this._getProjectAccessLevel();
    if (this.projectAccessLevel) {
      this.projectAccessLevel.textContent = `[${projectAccess.text}]`;
      this.projectAccessLevel.style = projectAccess.style;
      this.projectAccessLevel.dataset.accessType = projectAccess.type;
    }
  }

  /**
   * Register system permission checkboxes after they're created
   * and attach change handlers for access level indicators
   */
  _registerSystemPermissionCheckboxes() {
    const checkboxes = this.systemPermsContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      this.registerField(`sysperm_${checkbox.dataset.perm}`, checkbox, {
        requiredAccessLevel: this.accessLevels.ADMIN,
        editableInViewMode: false,
        // System permissions can only be edited by SYSTEM_ADMIN and never in self-view
        editableInEditMode: () => !this.isSelfView && this.security.hasSystemPermission('SYSTEM_ADMIN'),
        onChange: () => {
          // Mark the form as dirty
          this.markDirty();

          // Update the visible permissions in currentData
          this.collectFormData();

          // Update the access level indicators to reflect the new system permissions
          this._updateAccessLevelIndicators();
        }
      });
    });
  }

  /**
   * Load user data from API
   */
  async loadEntityData() {
    try {
      const data = await getUser(this.username);

      // Check if this is self-view
      const currentUsername = this.store.get("user")?.username || "guest";
      this.isSelfView = (data.username === currentUsername);
      console.log("[UserModal] loadEntityData => isSelfView:", this.isSelfView,
        "username:", data.username, "currentUsername:", currentUsername);

      return this.normalizeUserData(data);
    } catch (error) {
      console.error("[UserModal] loadEntityData error:", error);
      throw error;
    }
  }

  /**
   * Save user data back to API
   */
  async saveEntityData() {
    try {
      const payload = this.prepareUserDataForSave();

      // Log what we're saving
      console.log("[UserModal] Saving entity data with payload:", payload);

      await updateUserPermissions(this.currentData.username, payload);

      // Return the updated data
      if (this.isNewEntity) {
        // For new entities, might need a different endpoint or handling
        return this.currentData;
      } else {
        // For existing entities, get fresh data
        const updatedData = await getUser(this.currentData.username);
        return this.normalizeUserData(updatedData);
      }
    } catch (error) {
      console.error("[UserModal] saveEntityData error:", error);
      throw error;
    }
  }

  /**
   * Prepare the user data for API submission
   */
  prepareUserDataForSave() {
    if (!this.currentData) {
      console.error("[UserModal] prepareUserDataForSave: No current data available");
      return {};
    }

    // Create a deep copy of permissions to avoid any reference issues
    const permissions = this.currentData.permissions || {};

    // Debug log for troubleshooting
    console.log("[UserModal] Preparing user data for save:", {
      username: this.currentData.username,
      email: this.currentData.email,
      permissions: {
        system_permissions: permissions.system_permissions || [],
        corpus_permissions: permissions.corpus_permissions || {},
        docchain_permissions: permissions.docchain_permissions || []
      },
      authorized_accounts: this.currentData.authorized_accounts || [],
      authorized_projects: this.currentData.authorized_projects || []
    });

    return {
      username: this.currentData.username,
      email: this.currentData.email,
      system_permissions: permissions.system_permissions || [],
      corpus_permissions: permissions.corpus_permissions || {},
      docchain_permissions: permissions.docchain_permissions || [],
      authorized_accounts: this.currentData.authorized_accounts || [],
      authorized_projects: this.currentData.authorized_projects || []
    };
  }

  /**
   * Normalize user data to ensure consistent structure
   */
  normalizeUserData(data) {
    // Ensure we have proper data structure even if fields are missing
    const normalized = {
      ...this.getEmptyDataModel(),
      ...data
    };

    // Handle permissions if it's a string
    if (typeof normalized.permissions === 'string') {
      try {
        normalized.permissions = JSON.parse(normalized.permissions);
      } catch (e) {
        console.warn("[UserModal] Could not parse permissions => using empty");
        normalized.permissions = {
          system_permissions: [],
          corpus_permissions: {},
          docchain_permissions: []
        };
      }
    }

    // Ensure all permission arrays exist
    if (!normalized.permissions) {
      normalized.permissions = {};
    }

    if (!Array.isArray(normalized.permissions.system_permissions)) {
      normalized.permissions.system_permissions = [];
    }

    if (!normalized.permissions.corpus_permissions) {
      normalized.permissions.corpus_permissions = {};
    }

    if (!Array.isArray(normalized.permissions.docchain_permissions)) {
      normalized.permissions.docchain_permissions = [];
    }

    // Ensure authorized arrays exist
    if (!Array.isArray(normalized.authorized_accounts)) {
      normalized.authorized_accounts = [];
    }

    if (!Array.isArray(normalized.authorized_projects)) {
      normalized.authorized_projects = [];
    }

    return normalized;
  }

  /**
   * Render user data to the form
   */
  renderData() {
    if (!this.currentData) return;

    // Update title based on mode
    if (this.isSelfView) {
      this.titleH2.textContent = `My Profile: ${this.currentData.username}`;
    } else {
      this.titleH2.textContent = "User Details";
    }

    // Basic fields
    this.usernameField.value = this.currentData.username || "";
    this.emailField.value = this.currentData.email || "";

    // System permissions
    const userSystemPerms = this.currentData.permissions.system_permissions || [];
    this._renderSystemPermissions(userSystemPerms);

    // Update access level indicators
    this._updateAccessLevelIndicators();

    // Other permissions
    this._renderAccountList(this.currentData.authorized_accounts || []);
    this._renderProjectList(this.currentData.authorized_projects || []);
    this._renderCorpusPerms(this.currentData.permissions.corpus_permissions || {});
    this._renderDocChainPerms(this.currentData.permissions.docchain_permissions || []);

    // Update button text based on mode
    this.editBtn.textContent = this.editMode ? 'Cancel Changes' : 'Edit';
  }


  /**
   * Render system permissions as checkboxes
   */
  _renderSystemPermissions(userSystemPerms) {
    this.systemPermsContainer.innerHTML = "";

    for (const sp of this.systemPermissions) {
      const isChecked = userSystemPerms.includes(sp);
      const wrapper = document.createElement("label");
      wrapper.className = "system-perm-label";
      wrapper.style.display = "inline-flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "4px";
      wrapper.style.marginRight = "8px";
      wrapper.style.cursor = "pointer";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = isChecked;
      input.dataset.perm = sp;

      wrapper.appendChild(input);
      wrapper.appendChild(document.createTextNode(sp));
      this.systemPermsContainer.appendChild(wrapper);

      // Add tooltip to the system permission
      tooltip.attach(wrapper, this.systemPermTooltips[sp]);
    }

    // Now that checkboxes exist in the DOM, register them
    this._registerSystemPermissionCheckboxes();
  }

  /**
   * Render account permissions list
   */
  _renderAccountList(acctArr) {
    this.accountsList.innerHTML = "";

    if (!acctArr.length) {
      this.accountsList.textContent = "(No account permissions)";
      return;
    }

    for (const aId of acctArr) {
      const row = document.createElement("div");
      row.className = "perm-item";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = aId;
      row.appendChild(labelSpan);

      // Add delete button - not shown in self-view mode
      if (!this.isSelfView) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "perm-delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.title = "Remove Permission";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.confirmDeletePermission("account", aId);
        });
        row.appendChild(deleteBtn);
      }

      this.accountsList.appendChild(row);
    }
  }

  /**
   * Render project permissions list
   */
  _renderProjectList(projArr) {
    this.projectsList.innerHTML = "";

    if (!projArr.length) {
      this.projectsList.textContent = "(No project permissions)";
      return;
    }

    for (const pId of projArr) {
      const row = document.createElement("div");
      row.className = "perm-item";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = pId;
      row.appendChild(labelSpan);

      // Add delete button - not shown in self-view mode
      if (!this.isSelfView) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "perm-delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.title = "Remove Permission";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.confirmDeletePermission("project", pId);
        });
        row.appendChild(deleteBtn);
      }

      this.projectsList.appendChild(row);
    }
  }

  /**
   * Render corpus permissions
   */
  _renderCorpusPerms(corpusObj) {
    this.corpusPermsList.innerHTML = "";

    const corpusKeys = Object.keys(corpusObj);
    if (!corpusKeys.length) {
      this.corpusPermsList.textContent = "(No corpus permissions)";
      return;
    }

    for (const corpusId of corpusKeys) {
      const permsForCorpus = corpusObj[corpusId] || [];
      const row = document.createElement("div");
      row.className = "perm-item";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = `${corpusId}: ${permsForCorpus.join(", ")}`;
      row.appendChild(labelSpan);

      // Add delete button - not shown in self-view mode
      if (!this.isSelfView) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "perm-delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.title = "Remove Permission";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.confirmDeletePermission("corpus", corpusId);
        });
        row.appendChild(deleteBtn);
      }

      this.corpusPermsList.appendChild(row);
    }
  }

  /**
   * Render AnalysisLM permissions
   */
  _renderDocChainPerms(docchainArr) {
    this.docChainPermsList.innerHTML = "";

    if (!docchainArr.length) {
      this.docChainPermsList.textContent = "(No AnalysisLM permissions)";
      return;
    }

    for (const docPerm of docchainArr) {
      const row = document.createElement("div");
      row.className = "perm-item";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = docPerm;
      row.appendChild(labelSpan);

      // Add delete button - not shown in self-view mode
      if (!this.isSelfView) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "perm-delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.title = "Remove Permission";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.confirmDeletePermission("docchain", docPerm);
        });
        row.appendChild(deleteBtn);
      }

      this.docChainPermsList.appendChild(row);
    }
  }

  /**
   * Confirm deletion of a permission
   * @param {string} type - The permission type: "account", "project", "corpus", or "docchain"
   * @param {string} id - The ID of the permission to delete
   */
  confirmDeletePermission(type, id) {
    // Only admins should be able to delete permissions - ignore if self-view
    if (this.isSelfView) return;

    // Build confirmation message based on permission type
    let title, message;

    switch (type) {
      case "account":
        title = "Remove Account Permission";
        message = `Are you sure you want to remove access to account: ${id}?`;
        break;
      case "project":
        title = "Remove Project Permission";
        message = `Are you sure you want to remove access to project: ${id}?`;
        break;
      case "corpus":
        title = "Remove Corpus Permission";
        message = `Are you sure you want to remove all permissions for corpus: ${id}?`;
        break;
      case "docchain":
        title = "Remove AnalysisLM Permission";
        message = `Are you sure you want to remove AnalysisLM permission: ${id}?`;
        break;
    }

    // Show confirmation dialog
    this.yesNoModal.show({
      title,
      message,
      onYes: async () => {
        await this.deletePermission(type, id);
      }
    });
  }

  /**
   * Delete a permission after confirmation
   * @param {string} type - The permission type: "account", "project", "corpus", or "docchain"
   * @param {string} id - The ID of the permission to delete
   */
  async deletePermission(type, id) {
    try {
      // Lock UI while processing
      this.lockButtons();

      if (!this.currentData) {
        throw new Error("User data is not available");
      }

      // Create a deep copy of the current data to work with
      const updatedUser = this.cloneData(this.currentData);

      // Perform permission deletion based on type
      switch (type) {
        case "account":
          // Remove account permission
          updatedUser.authorized_accounts = (updatedUser.authorized_accounts || [])
            .filter(acctId => acctId !== id);
          break;

        case "project":
          // Remove project permission
          updatedUser.authorized_projects = (updatedUser.authorized_projects || [])
            .filter(projId => projId !== id);
          break;

        case "corpus":
          // Remove corpus permission
          if (updatedUser.permissions && updatedUser.permissions.corpus_permissions) {
            delete updatedUser.permissions.corpus_permissions[id];
          }
          break;

        case "docchain":
          // Remove docchain permission
          if (updatedUser.permissions && Array.isArray(updatedUser.permissions.docchain_permissions)) {
            updatedUser.permissions.docchain_permissions = updatedUser.permissions.docchain_permissions
              .filter(perm => perm !== id);
          }
          break;
      }

      // Create payload for API
      const payload = {
        username: updatedUser.username,
        email: updatedUser.email,
        system_permissions: updatedUser.permissions.system_permissions || [],
        corpus_permissions: updatedUser.permissions.corpus_permissions || {},
        docchain_permissions: updatedUser.permissions.docchain_permissions || [],
        authorized_accounts: updatedUser.authorized_accounts || [],
        authorized_projects: updatedUser.authorized_projects || []
      };

      // Log what we're about to send
      console.log(`[UserModal] Deleting ${type} permission:`, id);
      console.log("[UserModal] Sending payload:", JSON.stringify(payload));

      // Update the user on the server
      await updateUserPermissions(updatedUser.username, payload);

      // Update our local data
      this.currentData = updatedUser;

      // Refresh data from server to ensure we have the latest state
      await this.refreshData();

      // Show success message
      let successMessage;
      switch (type) {
        case "account":
          successMessage = `Successfully removed access to account: ${id}`;
          break;
        case "project":
          successMessage = `Successfully removed access to project: ${id}`;
          break;
        case "corpus":
          successMessage = `Successfully removed permissions for corpus: ${id}`;
          break;
        case "docchain":
          successMessage = `Successfully removed AnalysisLM permission: ${id}`;
          break;
      }

      this.messageModal.show({
        title: "Permission Removed",
        message: successMessage
      });

    } catch (error) {
      console.error(`[UserModal] Error removing ${type} permission:`, error);
      this.handleError(error);
    } finally {
      this.unlockButtons();
    }
  }

  /**
   * Collect form data from UI
   */
  collectFormData() {
    if (!this.currentData) {
      console.error("[UserModal] collectFormData: No current data available");
      return;
    }

    // Basic fields
    if (this.isNewEntity) {
      this.currentData.username = this.usernameField.value.trim();
    }

    this.currentData.email = this.emailField.value.trim();

    // System permissions (only if not self-view)
    if (!this.isSelfView) {
      const sysPerms = this._gatherSystemPermsFromUI();
      this.currentData.permissions.system_permissions = sysPerms;
      console.log("[UserModal] collectFormData: Updated system_permissions:", sysPerms);
    }

    // Note: account/project/corpus/docchain permissions are modified directly 
    // in their respective handler methods
  }

  /**
   * Gather system permissions from checkboxes
   */
  _gatherSystemPermsFromUI() {
    const checkboxes = this.systemPermsContainer.querySelectorAll("input[type='checkbox']");
    const perms = [];

    checkboxes.forEach((cb) => {
      if (cb.checked) {
        perms.push(cb.dataset.perm);
      }
    });

    return perms;
  }

  /**
   * Toggle between view and edit modes
   */
  handleToggleEditMode() {
    if (this.editMode) {
      // We're currently in edit mode, switching to view mode
      if (this.formDirty) {
        this.dialogService.confirm(
          'Discard Changes',
          'You have unsaved changes. Are you sure you want to discard them?',
          () => {
            this.exitEditMode(true);
            // Update button text after exiting edit mode
            this.editBtn.textContent = 'Edit';
          },
          null
        );
      } else {
        // No changes to discard
        this.exitEditMode(true);
        // Update button text after exiting edit mode
        this.editBtn.textContent = 'Edit';
      }
    } else {
      // We're in view mode, switching to edit mode
      this.enterEditMode();
      // Update button text after entering edit mode
      this.editBtn.textContent = 'Cancel Changes';
    }
  }

  /**
   * Handle duplicate permissions button
   */
  handleDuplicatePermissions() {
    if (!this.currentData?.username) {
      console.warn("[UserModal] No valid user data => cannot duplicate permissions");
      return;
    }

    const dupPermsModal = new DuplicatePermissionsModal({
      sourceUsername: this.currentData.username,
      onSuccess: async () => {
        this.messageModal.show({
          title: "Permissions Duplicated",
          message: "Successfully duplicated user permissions."
        });

        // Refresh the data
        await this.refreshData();
      }
    });

    dupPermsModal.show();
  }

  async handleGenerateRegistrationUrl() {
    if (this.isSelfView) return;

    try {
      this.lockButtons();

      const { generateRegistrationUrl } = await import('../../api/auth.js');
      const registrationUrl = await generateRegistrationUrl();

      this.messageModal.show({
        title: "Registration URL Generated",
        message: `
        <div class="url-result">
          <p>Share this URL to allow new user registration:</p>
          <div class="url-display">
            <input type="text" readonly value="${registrationUrl}" id="regUrlInput" style="margin-bottom: 10px;" />
            <button type="button" class="btn btn--secondary" onclick="
              document.getElementById('regUrlInput').select();
              navigator.clipboard.writeText('${registrationUrl}').then(() => {
                this.textContent = 'Copied!';
                setTimeout(() => this.textContent = 'Copy URL', 2000);
              });
            ">
              <i class="fas fa-copy"></i> Copy URL
            </button>
          </div>
          <p class="field-help">This URL includes the organization code and access key for secure registration.</p>
        </div>
      `
      });

    } catch (error) {
      console.error("[UserModal] Failed to generate registration URL:", error);
      this.errorModal.show({
        title: "URL Generation Failed",
        message: `Failed to generate registration URL: ${error.message}`
      });
    } finally {
      this.unlockButtons();
    }
  }

  async handleGeneratePasswordResetUrl() {
    if (this.isSelfView || !this.currentData?.username) return;

    try {
      this.lockButtons();

      const { generatePasswordResetUrl } = await import('../../api/auth.js');
      const resetUrl = await generatePasswordResetUrl(this.currentData.username);

      this.messageModal.show({
        title: "Password Reset URL Generated",
        message: `
        <div class="url-result">
          <p>Share this URL with <strong>${this.currentData.username}</strong> to reset their password:</p>
          <div class="url-display">
            <input type="text" readonly value="${resetUrl}" id="resetUrlInput" style="margin-bottom: 10px;" />
            <button type="button" class="btn btn--secondary" onclick="
              document.getElementById('resetUrlInput').select();
              navigator.clipboard.writeText('${resetUrl}').then(() => {
                this.textContent = 'Copied!';
                setTimeout(() => this.textContent = 'Copy URL', 2000);
              });
            ">
              <i class="fas fa-copy"></i> Copy URL
            </button>
          </div>
          <p class="field-help">This URL includes the username, organization code, and access key for secure password reset.</p>
        </div>
      `
      });

    } catch (error) {
      console.error("[UserModal] Failed to generate password reset URL:", error);
      this.errorModal.show({
        title: "URL Generation Failed",
        message: `Failed to generate password reset URL: ${error.message}`
      });
    } finally {
      this.unlockButtons();
    }
  }


  async handleUnlockAccount() {
    if (this.isSelfView || !this.currentData?.username) return;

    const currentStatus = this.currentData.account_status || 'ACTIVE';

    if (currentStatus !== 'LOCKED') {
      this.messageModal.show({
        title: "Account Not Locked",
        message: `The account for ${this.currentData.username} is currently ${currentStatus} and does not need to be unlocked.`
      });
      return;
    }

    this.yesNoModal.show({
      title: "Unlock User Account",
      message: `
      <div>
        <p>This will unlock the account for <strong>${this.currentData.username}</strong>.</p>
        <p>The user will be able to attempt login again, and their failed login attempts counter will be reset.</p>
        <p>Are you sure you want to proceed?</p>
      </div>
    `,
      onYes: async () => {
        try {
          this.lockButtons();

          const { adminUnlockAccount } = await import('../../api/auth.js');
          await adminUnlockAccount(this.currentData.username);

          this.messageModal.show({
            title: "Account Unlocked",
            message: `Successfully unlocked the account for ${this.currentData.username}. The user can now attempt to login again.`
          });

          await this.refreshData();

        } catch (error) {
          console.error("[UserModal] Account unlock failed:", error);
          this.errorModal.show({
            title: "Account Unlock Failed",
            message: `Failed to unlock account: ${error.message}`
          });
        } finally {
          this.unlockButtons();
        }
      }
    });
  }

  /**
   * Refresh entity data from the server
   */
  async refreshData() {
    try {
      const data = await this.loadEntityData();
      this.originalData = data;
      this.currentData = this.cloneData(data);
      this.renderData();
      this.updateUIState();
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Update UI states after events like rendering or mode changes
   */
  updateUIState() {
    super.updateUIState();

    // Always make sure the close button is enabled
    if (this.closeBtn) {
      this.closeBtn.disabled = false;
    }

    // Apply field state classes
    this._applyFieldStateClasses();

    // Log access level for debugging
    console.log(`[UserModal] Access level: ${this.currentAccessLevel}, isSelfView: ${this.isSelfView}, editMode: ${this.editMode}`);
  }

  /**
   * Apply field state classes based on current mode and permissions
   */
  _applyFieldStateClasses() {
    // Clear all field state classes first
    const allFields = [this.usernameField, this.emailField];
    allFields.forEach(field => {
      if (field) {
        field.classList.remove('field-readonly', 'field-editable', 'field-locked');
      }
    });

    // Determine if user can edit based on permissions
    const canEdit = this.canEditUser();

    // Apply field state classes based on mode and editability
    if (this.mode === "view") {
      // Username: Always read-only in view mode
      if (this.usernameField) {
        this.usernameField.classList.add('field-readonly');
      }
      
      // Email: Locked in view mode (editable but currently locked)
      if (this.emailField) {
        this.emailField.classList.add('field-locked');
      }
    } else if (this.mode === "edit") {
      // Username: Read-only for existing users, editable for new users
      if (this.usernameField) {
        this.usernameField.classList.add(this.isNewEntity ? 'field-editable' : 'field-readonly');
      }
      
      // Email: Editable if can edit, locked if cannot
      if (this.emailField) {
        this.emailField.classList.add(canEdit ? 'field-editable' : 'field-locked');
      }
    }
  }

  /**
   * Handle adding account permission
   */
  handleAddAccountPermission() {
    // Only admins should be able to add account permissions - ignore if self-view
    if (this.isSelfView) return;

    const modal = new AccountsModal(this.store, {
      selectionMode: true,
      allowMultiple: false,
      onSelect: async (acctId) => {
        if (!acctId) return;

        try {
          // Lock UI while processing
          this.lockButtons();

          console.log("[UserModal] Adding account permission:", {
            username: this.currentData.username,
            accountId: acctId
          });

          await addAccountAccess(this.currentData.username, acctId);
          await this.refreshData();

          // Show success message
          this.messageModal.show({
            title: "Permission Added",
            message: `Successfully added access to account: ${acctId}`
          });

        } catch (error) {
          console.error("[UserModal] Error adding account permission:", error);
          this.handleError(error);
        } finally {
          this.unlockButtons();
          modal.hide();
        }
      }
    });

    modal.show();
  }

  /**
   * Handle adding project permission
   */
  handleAddProjectPermission() {
    // Only admins should be able to add project permissions - ignore if self-view
    if (this.isSelfView) return;

    const modal = new ProjectsModal(this.store, {
      selectionMode: true,
      allowMultiple: false,
      onSelect: async (composite) => {
        if (!composite) return;

        try {
          // Lock UI while processing
          this.lockButtons();

          console.log("[UserModal] Adding project permission:", {
            username: this.currentData.username,
            projectCompositeId: composite
          });

          // Pass the composite identifier directly to the API
          await addProjectAccess(this.currentData.username, composite);
          await this.refreshData();

          // Show success message
          this.messageModal.show({
            title: "Permission Added",
            message: `Successfully added access to project: ${composite}`
          });

        } catch (error) {
          console.error("[UserModal] Error adding project permission:", error);
          this.handleError(error);
        } finally {
          this.unlockButtons();
          modal.hide();
        }
      }
    });

    modal.show();
  }

  /**
   * Handle adding corpus permission
   */
  handleAddCorpusPermission() {
    // Only admins should be able to add corpus permissions - ignore if self-view
    if (this.isSelfView) return;

    const modal = new AddCorpusPermissionModal({
      onSubmit: async (corpusId, selectedPerms) => {
        try {
          // Lock UI while processing
          this.lockButtons();

          if (!this.currentData) {
            throw new Error("User data is not available");
          }

          // Important: Create a deep copy of the current data to work with
          const updatedUser = this.cloneData(this.currentData);

          // Ensure permissions object exists
          if (!updatedUser.permissions) {
            updatedUser.permissions = {};
          }

          // Ensure corpus_permissions exists
          if (!updatedUser.permissions.corpus_permissions) {
            updatedUser.permissions.corpus_permissions = {};
          }

          // Add the selected permissions for this corpus
          updatedUser.permissions.corpus_permissions[corpusId] = selectedPerms;

          // Debug log for troubleshooting
          console.log("[UserModal] Adding corpus permission:", {
            corpusId,
            selectedPerms,
            updatedPermissions: {
              system_permissions: updatedUser.permissions.system_permissions || [],
              corpus_permissions: updatedUser.permissions.corpus_permissions || {},
              docchain_permissions: updatedUser.permissions.docchain_permissions || []
            }
          });

          // Create properly structured payload for API
          const payload = {
            username: updatedUser.username,
            system_permissions: updatedUser.permissions.system_permissions || [],
            corpus_permissions: updatedUser.permissions.corpus_permissions || {},
            docchain_permissions: updatedUser.permissions.docchain_permissions || [],
            authorized_accounts: updatedUser.authorized_accounts || [],
            authorized_projects: updatedUser.authorized_projects || []
          };

          // Save changes
          console.log("[UserModal] Sending payload to API:", payload);
          await updateUserPermissions(updatedUser.username, payload);

          // Log after sending to API
          console.log("[UserModal] Corpus permission added successfully, refreshing data");

          // Update our current data
          this.currentData = updatedUser;

          // Refresh data from server to ensure we have the latest state
          await this.refreshData();

          // Show success message
          this.messageModal.show({
            title: "Permission Added",
            message: `Successfully added ${selectedPerms.join(", ")} permissions for corpus: ${corpusId}`
          });

        } catch (error) {
          console.error("[UserModal] Error adding corpus permission:", error);
          this.handleError(error);
        } finally {
          this.unlockButtons();
          modal.hide();
        }
      }
    });

    modal.show();
  }

  /**
   * Handle adding AnalysisLM permission
   */
  handleAddDocchainPermission() {
    // Only admins should be able to add AnalysisLM permissions - ignore if self-view
    if (this.isSelfView) return;

    // Get current user's existing AnalysisLM permissions
    const existingPermissions = this.currentData?.permissions?.docchain_permissions || [];

    const modal = new AddDocchainPermissionModal({
      existingPermissions: existingPermissions,
      onSubmit: async (docPerm) => {
        try {
          // Lock UI while processing
          this.lockButtons();

          if (!this.currentData) {
            throw new Error("User data is not available");
          }

          // Create a deep copy of the current data to work with
          const updatedUser = this.cloneData(this.currentData);

          // Ensure permissions object exists
          if (!updatedUser.permissions) {
            updatedUser.permissions = {};
          }

          // Ensure docchain_permissions array exists
          if (!Array.isArray(updatedUser.permissions.docchain_permissions)) {
            updatedUser.permissions.docchain_permissions = [];
          }

          // Only add if not already present
          if (!updatedUser.permissions.docchain_permissions.includes(docPerm)) {
            updatedUser.permissions.docchain_permissions.push(docPerm);
          }

          // Create properly structured payload for API
          const payload = {
            username: updatedUser.username,
            system_permissions: updatedUser.permissions.system_permissions || [],
            corpus_permissions: updatedUser.permissions.corpus_permissions || {},
            docchain_permissions: updatedUser.permissions.docchain_permissions || [],
            authorized_accounts: updatedUser.authorized_accounts || [],
            authorized_projects: updatedUser.authorized_projects || []
          };

          console.log("[UserModal] Adding AnalysisLM permission:", {
            docPerm,
            payload: payload
          });

          // Save changes - pass the full permissions object to prevent
          // overwriting other permissions
          await updateUserPermissions(updatedUser.username, payload);

          // Update our current data
          this.currentData = updatedUser;

          // Refresh data from server
          await this.refreshData();

          // Show success message
          this.messageModal.show({
            title: "Permission Added",
            message: `Successfully added AnalysisLM permission: ${docPerm}`
          });

        } catch (error) {
          console.error("[UserModal] Error adding AnalysisLM permission:", error);
          this.handleError(error);
        } finally {
          this.unlockButtons();
          modal.hide();
        }
      }
    });

    modal.show();
  }

  /**
   * Validate form data before saving
   */
  validateFormData() {
    const errors = {};

    // Username validation (only for new entities)
    if (this.isNewEntity) {
      if (!this.currentData.username || this.currentData.username.trim() === '') {
        errors.username = 'Username is required';
      }
    }

    // Email validation
    if (!this.currentData.email || this.currentData.email.trim() === '') {
      errors.email = 'Email is required';
    } else if (!this._isValidEmail(this.currentData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Simple email validation
   */
  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Override dialog implementations with modals
   */
  _confirmDialog(title, message, onConfirm, onCancel) {
    this.yesNoModal.show({
      title,
      message,
      onYes: onConfirm,
      onNo: onCancel
    });
  }

  _alertDialog(title, message) {
    this.messageModal.show({
      title,
      message
    });
  }

  _errorDialog(title, message) {
    this.errorModal.show({
      title,
      message
    });
  }

  /**
   * Check if an error is authentication related
   */
  isAuthenticationError(error) {
    if (!error || !error.message) return false;
    const msg = error.message.toLowerCase();
    return msg.includes("unauthorized") || msg.includes("invalid or expired token");
  }

  /**
   * Handle authentication errors
   */
  handleAuthenticationError() {
    this.hide();
    const loginModal = new LoginModal();
    loginModal.show();
  }

  /**
   * Handle Back to Users button click
   */
  handleBackToUsers() {
    if (this.editMode && this.formDirty) {
      // If in edit mode with changes, ask for confirmation
      this.dialogService.confirm(
        'Discard Changes',
        'You have unsaved changes. Are you sure you want to discard them?',
        () => {
          this.hide();
          this.showUsersModal();
        }
      );
    } else {
      this.hide();
      this.showUsersModal();
    }
  }

  /**
   * Show the Users modal
   */
  showUsersModal() {
    // Import UsersModal dynamically to avoid circular dependencies
    import('./users-modal.js').then(({ UsersModal }) => {
      const usersModal = new UsersModal(this.store);
      usersModal.show();
    });
  }
}