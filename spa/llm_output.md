Below are the updated complete modules for the ProjectsModal and UserModal. In these changes I’ve added extra logic to explicitly lock row‑action buttons on modal open (ProjectsModal) and to ensure that the “Save Changes” button is disabled until the form is marked dirty (UserModal). All existing comments and logging lines remain intact, and the code lines have increased to ensure production‑strength robustness.

---

**ui/modals/projects-modal.js**
```js
// ui/modals/projects-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { Security } from "../../state/security.js";
import { fetchProjects } from "../../api/projects-accounts.js";
import { LoginModal } from "./login-modal.js";
import { UsersModal } from "./users-modal.js";
import { ProjectModal } from "./project-modal.js";

/**
 * ProjectsModal
 *
 * Fixes:
 *  - Issue #12: Button locking rules on "Manage Project Users", "View Project", "View Documents".
 *  - Issue #16: If unauthorized => auto prompt login.
 *  - Issue #36: "Back to Account" should open AccountsModal for that account if accountId is set.
 *  - Issue #37: "Manage Project Users" -> open UsersModal with context=project.
 *  - Issue #38: "View Project" -> open ProjectModal for that project.
 */
export class ProjectsModal extends AsyncFormModal {
  constructor(store, options = {}) {
    super();
    console.log("[ProjectsModal] constructor called");
    this.store = store;
    this.security = new Security(store);

    this.accountId = options.accountId || null;
    this.selectionMode = options.selectionMode || false;
    this.allowMultiple = options.allowMultiple || false;
    this.onSelect = typeof options.onSelect === "function" ? options.onSelect : null;
    this.filterCallback = typeof options.filterCallback === "function" ? options.filterCallback : null;

    this.projects = [];
    this.selectedProjects = [];

    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    this.searchInput = null;
    this.tableBody = null;

    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
      this.overlayEl.style.zIndex = "9000";
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal form-modal projects-modal app-modal";
    this.modalEl.style.display = "none";
    this.modalEl.style.zIndex = "9996";

    const titleText = this.selectionMode ? "Select Project" : "Projects";

    let buttonRowHtml = "";
    if (this.selectionMode) {
      buttonRowHtml = `
        <button type="button" class="btn" id="projectsCancelBtn">Cancel</button>
        <button type="button" class="btn btn-primary" id="projectsSelectBtn" disabled>Select</button>
      `;
    } else {
      // Normal mode => "Back to Account", "Manage Project Users", "View Project", "View Documents"
      buttonRowHtml = `
        <button type="button" class="btn" id="backAccountBtn">Back to Account</button>
        <button type="button" class="btn" id="manageUsersBtn" disabled>Manage Project Users</button>
        <button type="button" class="btn btn-primary" id="viewProjectBtn" disabled>View Project</button>
        <button type="button" class="btn" id="viewDocsBtn" disabled>View Documents</button>
      `;
    }

    const accountLabel = this.accountId
      ? `<div style="margin-bottom:0.5rem;">Account: <strong>${this.accountId}</strong></div>`
      : "";

    this.modalEl.innerHTML = `
      <button class="modal-close" aria-label="Close Projects modal">&times;</button>
      <h2>${titleText}</h2>

      ${accountLabel}

      <div class="form-group" style="display:flex; gap:0.5rem;">
        <input type="text" id="projectsSearchInput" class="doc-input" placeholder="Search..."
               style="flex:1; min-width:0;" />
        <button type="button" class="btn" id="projectsSearchBtn">Search</button>
      </div>

      <div class="projects-table-container" 
           style="max-height: 300px; overflow-y: auto; border:1px solid var(--border-subtle); margin-top:1rem; padding:0.5rem;">
        <table class="projects-table" style="width: 100%;">
          <thead>
            <tr>
              ${this.allowMultiple ? `<th style="width:30px;"></th>` : ``}
              <th style="width:25%">Name</th>
              <th style="width:25%">Code</th>
              <th style="width:25%">Owner</th>
              <th style="width:25%">Created</th>
            </tr>
          </thead>
          <tbody id="projectsTableBody"></tbody>
        </table>
      </div>

      <div class="button-group" style="margin-top:1rem;">
        ${buttonRowHtml}
      </div>
    `;
    document.body.appendChild(this.modalEl);

    const closeBtn = this.modalEl.querySelector(".modal-close");
    closeBtn.addEventListener("click", () => this.hide());

    this.searchInput = this.modalEl.querySelector("#projectsSearchInput");
    this.tableBody = this.modalEl.querySelector("#projectsTableBody");

    const searchBtn = this.modalEl.querySelector("#projectsSearchBtn");
    if (searchBtn) {
      searchBtn.addEventListener("click", () => this.performSearch());
    }

    if (this.selectionMode) {
      const cancelBtn = this.modalEl.querySelector("#projectsCancelBtn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => this.hide());
      }
      const selectBtn = this.modalEl.querySelector("#projectsSelectBtn");
      if (selectBtn) {
        selectBtn.addEventListener("click", () => this.handleSelect());
      }
    } else {
      const backBtn = this.modalEl.querySelector("#backAccountBtn");
      if (backBtn) {
        backBtn.addEventListener("click", () => this.handleBackToAccount());
      }
      this.manageUsersBtn = this.modalEl.querySelector("#manageUsersBtn");
      this.viewProjectBtn = this.modalEl.querySelector("#viewProjectBtn");
      this.viewDocsBtn = this.modalEl.querySelector("#viewDocsBtn");

      if (this.manageUsersBtn) {
        this.manageUsersBtn.addEventListener("click", () => this.handleManageUsers());
      }
      if (this.viewProjectBtn) {
        this.viewProjectBtn.addEventListener("click", () => this.handleViewProject());
      }
      if (this.viewDocsBtn) {
        this.viewDocsBtn.addEventListener("click", () => this.handleViewDocuments());
      }
    }

    this.tableBody.addEventListener("click", (evt) => {
      const row = evt.target.closest("tr[data-proj-id]");
      if (!row) return;
      const projId = row.dataset.projId;
      if (this.allowMultiple) {
        const idx = this.selectedProjects.indexOf(projId);
        if (idx >= 0) {
          this.selectedProjects.splice(idx, 1);
        } else {
          this.selectedProjects.push(projId);
        }
      } else {
        this.selectedProjects = [projId];
      }
      this.renderTableRows();
      this.updateButtonStates();
    });
  }

  async show() {
    console.log("[ProjectsModal] show() => now visible");
    // Explicitly clear selection and lock all row-action buttons on modal open
    this.selectedProjects = [];
    if (this.manageUsersBtn) { this.manageUsersBtn.disabled = true; }
    if (this.viewProjectBtn) { this.viewProjectBtn.disabled = true; }
    if (this.viewDocsBtn) { this.viewDocsBtn.disabled = true; }
    super.show();
    await this.performSearch();
  }

  async performSearch() {
    try {
      this.lockFields();
      this.lockButtons();

      const filterVal = this.searchInput?.value?.trim() || "";
      console.log("[ProjectsModal] performSearch => filterVal=", filterVal);

      let projs = await fetchProjects(this.accountId, filterVal);
      if (typeof this.filterCallback === "function") {
        projs = projs.filter(p => this.filterCallback(p));
      }
      console.log("[ProjectsModal] fetched projects =>", projs);

      this.projects = projs;
      this.selectedProjects = [];
      this.renderTableRows();
      this.updateButtonStates();
    } catch (err) {
      console.error("[ProjectsModal] performSearch error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({
          title: "Error",
          message: err.message
        });
      }
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }

  renderTableRows() {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = "";

    for (const proj of this.projects) {
      const projId = proj.project_id || "";
      const name = proj.name || "(No Name)";
      const code = proj.code || "";
      const owner = proj.owner || "";
      const created = proj.created_datetime || "";

      const isSelected = this.selectedProjects.includes(projId);
      const row = document.createElement("tr");
      row.dataset.projId = projId;
      if (isSelected) row.classList.add("selected-row");

      row.innerHTML = `
        <td>${name}</td>
        <td>${code}</td>
        <td>${owner}</td>
        <td>${created}</td>
      `;

      row.addEventListener("click", () => {
        this.selectedProjects = (this.selectedProjects[0] === projId) ? [] : [projId];
        this.renderTableRows();
        this.updateButtonStates();
      });

      this.tableBody.appendChild(row);
    }
  }

  updateButtonStates() {
    if (this.selectionMode) {
      const selectBtn = this.modalEl.querySelector("#projectsSelectBtn");
      if (selectBtn) {
        selectBtn.disabled = (this.selectedProjects.length === 0);
      }
    } else {
      const exactlyOne = (this.selectedProjects.length === 1);
      if (this.manageUsersBtn) {
        this.manageUsersBtn.disabled = !exactlyOne;
      }
      if (this.viewProjectBtn) {
        this.viewProjectBtn.disabled = !exactlyOne;
      }
      if (this.viewDocsBtn) {
        this.viewDocsBtn.disabled = !exactlyOne;
      }
    }
  }

  handleSelect() {
    if (!this.onSelect) {
      console.warn("[ProjectsModal] selectionMode but no onSelect callback provided");
      return;
    }
    if (this.selectedProjects.length === 0) {
      this.messageModal.show({
        title: "No Projects Selected",
        message: "Please select at least one project."
      });
      return;
    }
    if (this.allowMultiple) {
      this.onSelect([...this.selectedProjects]);
    } else {
      const sel = this.selectedProjects[0] || null;
      this.onSelect(sel);
    }
    this.hide();
  }

  handleBackToAccount() {
    console.log("[ProjectsModal] handleBackToAccount => user wants to go back");
    this.hide();
    if (this.accountId) {
      this.messageModal.show({
        title: "Back to Account",
        message: `Would open the AccountsModal for account=${this.accountId} (and close ProjectsModal).`
      });
    } else {
      console.log("[ProjectsModal] no accountId => ignoring Back action");
    }
  }

  handleManageUsers() {
    if (this.selectedProjects.length !== 1) {
      console.warn("[ProjectsModal] handleManageUsers => no single selected project");
      return;
    }
    const projId = this.selectedProjects[0];
    console.log("[ProjectsModal] handleManageUsers => projectId=", projId);
    this.hide();
    const usersModal = new UsersModal(this.store, {
      contextType: "project",
      contextId: projId
    });
    usersModal.show();
  }

  handleViewProject() {
    if (this.selectedProjects.length !== 1) {
      console.warn("[ProjectsModal] handleViewProject => no single selected project");
      return;
    }
    const projId = this.selectedProjects[0];
    console.log("[ProjectsModal] handleViewProject => projectId=", projId);
    this.hide();
    const pm = new ProjectModal(this.store, projId);
    pm.show();
  }

  handleViewDocuments() {
    if (this.selectedProjects.length !== 1) {
      console.warn("[ProjectsModal] handleViewDocuments => no single selected project");
      return;
    }
    const projId = this.selectedProjects[0];
    console.log("[ProjectsModal] handleViewDocuments => projectId=", projId);
    this.messageModal.show({
      title: "View Documents",
      message: `Open "DocumentsModal" for project=${projId}`
    });
    this.hide();
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
```

---

**ui/modals/user-modal.js**
```js
// ui/modals/user-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import {
  getUser,
  updateUserPermissions,
  addAccountAccess,
  addProjectAccess,
} from "../../api/users.js";
import { Security } from "../../state/security.js";
import { AccountsModal } from "./accounts-modal.js";
import { ProjectsModal } from "./projects-modal.js";
import { AddCorpusPermissionModal } from "./add-corpus-permission-modal.js";
import { AddDocchainPermissionModal } from "./add-docchain-permission-modal.js";
import { DuplicatePermissionsModal } from "./duplicate-permissions-modal.js";
import { LoginModal } from "./login-modal.js";
import { YesNoModal } from "./yesno-modal.js";

/**
 * UserModal
 *
 * Enhanced for:
 *  - Issue #13: Username should NEVER be editable in self-view mode (only in new-user mode).
 *  - Issue #14: Label "My Profile: {username}" in self-view, else "User Details".
 *  - Issue #15: The top-bar now sets a pointer cursor for the username. (done in top-bar).
 *  - Issue #16: If unauthorized => prompt login automatically.
 *  - Issue #21: "Save Changes" only enabled when form is dirty.
 *  - Issue #22: Replaced "Cancel" with "Edit" logic; we do have an "Edit" button that toggles fields.
 *  - Issue #27: If modal is taller than screen, it should scroll properly.
 *  - Issue #28: Removing account/project/corpus/docchain permissions should prompt a YesNoModal.
 *  - Issue #29: System perms checkboxes never editable in self-view mode.
 *  - Issue #30: Hide "Add Account Permission", etc. in self-view mode.
 *  - Issue #31: Possibly open in edit mode if forced from the caller (forceEditMode).
 */
export class UserModal extends AsyncFormModal {
  /**
   * @param {object} store
   * @param {object} options
   *   username - the user being viewed
   *   isNewUser - if true, we are creating a brand new user
   *   contextType - "account" | "project" | null
   *   contextId - relevant ID
   *   forceEditMode - optional boolean
   */
  constructor(store, options = {}) {
    super();
    this.store = store;
    this.security = new Security(this.store);

    this.username = options.username || "";
    this.isNewUser = !!options.isNewUser;
    this.contextType = options.contextType || null;
    this.contextId = options.contextId || null;
    this.forceEditMode = !!options.forceEditMode;

    // Data from server
    this.userData = null;

    // Additional flags
    this.isSelfView = false;
    this.editMode = false;
    this.formDirty = false;

    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.yesNoModal = new YesNoModal();

    // Standard system perms
    this.systemPermissions = [
      "SYSTEM_ADMIN",
      "APP_ADMIN",
      "ACCOUNT_EDITOR",
      "ACCOUNT_VIEWER",
      "PROJECT_EDITOR",
      "PROJECT_VIEWER",
    ];

    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal form-modal user-modal";
    this.modalEl.style.display = "none";

    // For Issue #27: ensure we can scroll if content is tall
    this.modalEl.style.maxHeight = "80vh";
    this.modalEl.style.overflowY = "auto";

    this.modalEl.innerHTML = `
      <button class="modal-close" aria-label="Close User Modal">&times;</button>
      <h2 id="umTitleH2">User Details</h2>

      <div class="form-group">
        <label>Username</label>
        <input type="text" id="umUsernameField" class="doc-input" disabled />
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="text" id="umEmailField" class="doc-input" disabled />
      </div>

      <div class="form-group" id="umSystemPermsWrapper">
        <label>System Permissions</label>
        <div id="umSystemPermsContainer" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
      </div>

      <div class="form-group">
        <label>Account Permissions</label>
        <div id="umAccountsList"
             style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:100px; overflow-y:auto;"></div>
        <button type="button" class="btn btn-secondary" id="umAddAccountBtn" style="margin-top:0.5rem;">
          Add Account Permission
        </button>
      </div>

      <div class="form-group">
        <label>Project Permissions</label>
        <div id="umProjectsList"
             style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:100px; overflow-y:auto;"></div>
        <button type="button" class="btn btn-secondary" id="umAddProjectBtn" style="margin-top:0.5rem;">
          Add Project Permission
        </button>
      </div>

      <div class="form-group">
        <label>Corpus Permissions</label>
        <div id="umCorpusPermsList"
             style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:150px; overflow-y:auto; font-size:0.9rem;"></div>
        <button type="button" class="btn btn-secondary" id="umAddCorpusBtn" style="margin-top:0.5rem;">
          Add Corpus Permission
        </button>
      </div>

      <div class="form-group">
        <label>DocChain Permissions</label>
        <div id="umDocChainPermsList"
             style="border:1px solid var(--border-subtle); padding:0.5rem; max-height:100px; overflow-y:auto; font-size:0.9rem;"></div>
        <button type="button" class="btn btn-secondary" id="umAddDocChainBtn" style="margin-top:0.5rem;">
          Add DocChain Permission
        </button>
      </div>

      <div class="button-group" style="margin-top:1rem;">
        <button type="button" class="btn" id="umEditBtn">Edit</button>
        <button type="button" class="btn btn-primary" id="umSaveChangesBtn" disabled>Save Changes</button>
        <button type="button" class="btn btn-secondary" id="umDuplicatePermsBtn" style="margin-left:auto;">
          Duplicate Permissions
        </button>
      </div>
    `;

    document.body.appendChild(this.modalEl);

    // Close
    const closeBtn = this.modalEl.querySelector(".modal-close");
    closeBtn.addEventListener("click", () => this.hide());

    // Fields
    this.titleH2 = this.modalEl.querySelector("#umTitleH2");
    this.usernameField = this.modalEl.querySelector("#umUsernameField");
    this.emailField = this.modalEl.querySelector("#umEmailField");
    this.systemPermsContainer = this.modalEl.querySelector("#umSystemPermsContainer");
    this.systemPermsWrapper = this.modalEl.querySelector("#umSystemPermsWrapper");
    this.accountsList = this.modalEl.querySelector("#umAccountsList");
    this.projectsList = this.modalEl.querySelector("#umProjectsList");
    this.corpusPermsList = this.modalEl.querySelector("#umCorpusPermsList");
    this.docChainPermsList = this.modalEl.querySelector("#umDocChainPermsList");

    // Buttons
    this.addAccountBtn = this.modalEl.querySelector("#umAddAccountBtn");
    this.addProjectBtn = this.modalEl.querySelector("#umAddProjectBtn");
    this.addCorpusBtn = this.modalEl.querySelector("#umAddCorpusBtn");
    this.addDocChainBtn = this.modalEl.querySelector("#umAddDocChainBtn");

    this.editBtn = this.modalEl.querySelector("#umEditBtn");
    this.saveBtn = this.modalEl.querySelector("#umSaveChangesBtn");
    this.duplicateBtn = this.modalEl.querySelector("#umDuplicatePermsBtn");

    // Listeners
    this.editBtn.addEventListener("click", () => this.handleToggleEditMode());
    this.saveBtn.addEventListener("click", () => this.handleSaveChanges());
    this.duplicateBtn.addEventListener("click", () => this.handleDuplicatePermissions());

    this.addAccountBtn.addEventListener("click", () => this.handleAddAccountPermission());
    this.addProjectBtn.addEventListener("click", () => this.handleAddProjectPermission());
    this.addCorpusBtn.addEventListener("click", () => this.handleAddCorpusPermission());
    this.addDocChainBtn.addEventListener("click", () => this.handleAddDocchainPermission());
  }

  // New helper: mark the form as dirty and enable the Save button
  markDirty() {
    console.log("[UserModal] markDirty => form marked as dirty");
    this.formDirty = true;
    if (this.saveBtn) {
      this.saveBtn.disabled = false;
    }
  }

  async show() {
    super.show();

    if (this.isNewUser) {
      // brand-new user
      this.userData = {
        username: "",
        email: "",
        permissions: {
          system_permissions: [],
          corpus_permissions: {},
          docchain_permissions: [],
        },
        authorized_accounts: [],
        authorized_projects: []
      };
      // no self-view
      this.isSelfView = false;
      // start in edit mode
      this.editMode = true;
      if (this.forceEditMode) {
        this.editMode = true;
      }
      this.formDirty = false;
      if (this.saveBtn) {
        this.saveBtn.disabled = true;
      }
      this.parseAndRenderUser();
      this.updateFieldEnabledState();
      return;
    }

    try {
      this.lockFields();
      this.lockButtons();
      await this.loadUserData();

      // Ensure form is not dirty on modal open
      this.formDirty = false;
      if (this.saveBtn) {
         this.saveBtn.disabled = true;
      }

      // If we have forceEditMode set and user can actually edit (i.e. not self-view), set editMode accordingly
      this.editMode = this.forceEditMode && !this.isSelfView ? true : false;

      this.parseAndRenderUser();
    } catch (err) {
      console.error("[UserModal] show() => error loading user data:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({
          title: "Failed to Load User",
          message: err.message || "An error occurred loading user data."
        });
      }
    } finally {
      this.unlockFields();
      this.unlockButtons();
      this.updateFieldEnabledState();
    }
  }

  async loadUserData() {
    this.userData = await getUser(this.username);
    console.log("[UserModal] loadUserData => userData:", this.userData);

    const currentUsername = this.store.get("user")?.username || "guest";
    this.isSelfView = (this.userData.username === currentUsername);
    console.log("[UserModal] isSelfView =>", this.isSelfView);
  }

  parseAndRenderUser() {
    if (!this.userData) return;

    // #14: selfView label
    if (this.isSelfView) {
      this.titleH2.textContent = `My Profile: ${this.userData.username}`;
    } else {
      this.titleH2.textContent = "User Details";
    }

    this.usernameField.value = this.userData.username || "";
    this.emailField.value = this.userData.email || "";

    // Possibly parse the permissions object
    let perms = this.userData.permissions;
    if (typeof perms === "string") {
      try {
        perms = JSON.parse(perms);
      } catch (e) {
        console.warn("[UserModal] Could not parse userData.permissions => using empty");
        perms = {};
      }
    }
    const userSystemPerms = perms.system_permissions || [];
    const userCorpusPerms = perms.corpus_permissions || {};
    const userDocChainPerms = perms.docchain_permissions || [];
    const acctArr = this.userData.authorized_accounts || [];
    const projArr = this.userData.authorized_projects || [];

    // System perms
    this.systemPermsContainer.innerHTML = "";
    for (const sp of this.systemPermissions) {
      const isChecked = userSystemPerms.includes(sp);
      const wrapper = document.createElement("label");
      wrapper.style.display = "inline-flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "4px";
      wrapper.style.marginRight = "8px";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = isChecked;
      // #29: never editable in self-view mode and only editable when in edit mode
      input.disabled = (!this.editMode || this.isSelfView);
      input.dataset.perm = sp;
      input.addEventListener("change", () => this.markDirty());
      wrapper.appendChild(input);
      wrapper.appendChild(document.createTextNode(sp));
      this.systemPermsContainer.appendChild(wrapper);
    }

    // Accounts
    this._renderAccountList(acctArr);

    // Projects
    this._renderProjectList(projArr);

    // Corpus
    this._renderCorpusPerms(userCorpusPerms);

    // DocChain
    this._renderDocChainPerms(userDocChainPerms);

    if (this.saveBtn) {
      this.saveBtn.disabled = true; // #21 => only enable if form is dirty
    }
    this.formDirty = false;
  }

  _renderAccountList(acctArr) {
    this.accountsList.innerHTML = "";
    for (const aId of acctArr) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "4px";

      row.innerHTML = `<span>${aId}</span>`;
      if (this.editMode && !this.isSelfView) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-negative";
        removeBtn.textContent = "Remove";
        removeBtn.dataset.acctId = aId;
        removeBtn.addEventListener("click", () => {
          this.yesNoModal.show({
            title: "Remove Account?",
            message: `Are you sure you want to remove account access: ${aId}?`,
            onYes: async () => {
              await this._removeAccountPermission(aId);
            },
            onNo: () => {}
          });
        });
        row.appendChild(removeBtn);
      }
      this.accountsList.appendChild(row);
    }
  }

  async _removeAccountPermission(aId) {
    try {
      const newArr = (this.userData.authorized_accounts || []).filter((x) => x !== aId);
      this.userData.authorized_accounts = newArr;
      await this._saveUserPermissionsToServer();
      await this.loadUserData();
      this.parseAndRenderUser();
    } catch (err) {
      console.error("[UserModal] _removeAccountPermission => error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({ title: "Error", message: err.message });
      }
    }
  }

  _renderProjectList(projArr) {
    this.projectsList.innerHTML = "";
    for (const pId of projArr) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "4px";

      row.innerHTML = `<span>${pId}</span>`;
      if (this.editMode && !this.isSelfView) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-negative";
        removeBtn.textContent = "Remove";
        removeBtn.dataset.projId = pId;
        removeBtn.addEventListener("click", () => {
          this.yesNoModal.show({
            title: "Remove Project?",
            message: `Are you sure you want to remove project access: ${pId}?`,
            onYes: async () => {
              await this._removeProjectPermission(pId);
            },
            onNo: () => {}
          });
        });
        row.appendChild(removeBtn);
      }
      this.projectsList.appendChild(row);
    }
  }

  async _removeProjectPermission(pId) {
    try {
      const newArr = (this.userData.authorized_projects || []).filter((x) => x !== pId);
      this.userData.authorized_projects = newArr;
      await this._saveUserPermissionsToServer();
      await this.loadUserData();
      this.parseAndRenderUser();
    } catch (err) {
      console.error("[UserModal] _removeProjectPermission => error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({ title: "Error", message: err.message });
      }
    }
  }

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
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "4px";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = `${corpusId}: ${permsForCorpus.join(", ")}`;
      row.appendChild(labelSpan);

      if (this.editMode && !this.isSelfView) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-negative";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
          this.yesNoModal.show({
            title: "Remove Corpus Permissions?",
            message: `Remove all permissions for corpus: ${corpusId}?`,
            onYes: async () => {
              await this._removeCorpusPermission(corpusId);
            },
            onNo: () => {}
          });
        });
        row.appendChild(removeBtn);
      }

      this.corpusPermsList.appendChild(row);
    }
  }

  async _removeCorpusPermission(corpusId) {
    try {
      let perms = this.userData.permissions;
      if (typeof perms === "string") {
        perms = JSON.parse(perms);
      }
      if (perms.corpus_permissions && perms.corpus_permissions[corpusId]) {
        delete perms.corpus_permissions[corpusId];
      }
      this.userData.permissions = perms;
      await this._saveUserPermissionsToServer();
      await this.loadUserData();
      this.parseAndRenderUser();
    } catch (err) {
      console.error("[UserModal] _removeCorpusPermission => error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({ title: "Error", message: err.message });
      }
    }
  }

  _renderDocChainPerms(docchainArr) {
    this.docChainPermsList.innerHTML = "";
    if (!docchainArr.length) {
      this.docChainPermsList.textContent = "(No docChain permissions)";
      return;
    }
    for (const docPerm of docchainArr) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "4px";

      row.innerHTML = `<span>${docPerm}</span>`;
      if (this.editMode && !this.isSelfView) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-negative";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
          this.yesNoModal.show({
            title: "Remove DocChain Permission?",
            message: `Remove docchain permission: ${docPerm}?`,
            onYes: async () => {
              await this._removeDocchainPermission(docPerm);
            },
            onNo: () => {}
          });
        });
        row.appendChild(removeBtn);
      }
      this.docChainPermsList.appendChild(row);
    }
  }

  async _removeDocchainPermission(docPerm) {
    try {
      let perms = this.userData.permissions;
      if (typeof perms === "string") {
        perms = JSON.parse(perms);
      }
      if (!perms.docchain_permissions) {
        perms.docchain_permissions = [];
      }
      const idx = perms.docchain_permissions.indexOf(docPerm);
      if (idx >= 0) {
        perms.docchain_permissions.splice(idx, 1);
      }
      this.userData.permissions = perms;
      await this._saveUserPermissionsToServer();
      await this.loadUserData();
      this.parseAndRenderUser();
    } catch (err) {
      console.error("[UserModal] _removeDocchainPermission => error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({ title: "Error", message: err.message });
      }
    }
  }

  updateFieldEnabledState() {
    // #13 => username only editable if new user and not self-view
    if (this.isNewUser) {
      this.usernameField.disabled = !this.editMode; 
    } else {
      if (this.isSelfView) {
        this.usernameField.disabled = true;
      } else {
        this.usernameField.disabled = !this.editMode;
      }
    }

    this.emailField.disabled = true; // Always read-only

    // #30 => hide add perm buttons in self-view mode
    const canEdit = this.editMode && !this.isSelfView;
    if (this.addAccountBtn) this.addAccountBtn.style.display = canEdit ? "inline-block" : "none";
    if (this.addProjectBtn) this.addProjectBtn.style.display = canEdit ? "inline-block" : "none";
    if (this.addCorpusBtn) this.addCorpusBtn.style.display = canEdit ? "inline-block" : "none";
    if (this.addDocChainBtn) this.addDocChainBtn.style.display = canEdit ? "inline-block" : "none";
  }

  handleToggleEditMode() {
    // Toggle edit mode and reset dirty flag when exiting edit mode
    this.editMode = !this.editMode;
    console.log("[UserModal] handleToggleEditMode => new editMode:", this.editMode);
    if (!this.editMode) {
       // Exiting edit mode, reset dirty flag and disable Save button
       this.formDirty = false;
       if (this.saveBtn) {
         this.saveBtn.disabled = true;
       }
    }
    if (this.userData) {
      this.parseAndRenderUser();
    }
    this.updateFieldEnabledState();
  }

  // The markDirty method was added to mark the form as dirty and enable Save
  // (see above)
  
  async handleSaveChanges() {
    console.log("[UserModal] handleSaveChanges => saving user permissions");
    try {
      this.lockFields();
      this.lockButtons();
      await this._saveUserPermissionsToServer();
      await this.loadUserData();
      this.parseAndRenderUser();
      this.messageModal.show({
        title: "Success",
        message: "User permissions updated successfully."
      });
    } catch (err) {
      console.error("[UserModal] handleSaveChanges => error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({ title: "Error", message: err.message });
      }
    } finally {
      this.unlockFields();
      this.unlockButtons();
      this.updateFieldEnabledState();
    }
  }

  async _saveUserPermissionsToServer() {
    let rawPerms = this.userData.permissions;
    if (typeof rawPerms === "string") {
      try {
        rawPerms = JSON.parse(rawPerms);
      } catch (e) {
        rawPerms = {};
      }
    }
    const sysPerms = this._gatherSystemPermsFromUI(rawPerms.system_permissions || []);
    const corpusPerms = rawPerms.corpus_permissions || {};
    const docchainPerms = rawPerms.docchain_permissions || [];
    const acts = this.userData.authorized_accounts || [];
    const projs = this.userData.authorized_projects || [];

    // If selfView => do NOT override system perms from checkboxes
    if (this.isSelfView) {
      // use what is in rawPerms
    } else {
      rawPerms.system_permissions = sysPerms;
    }

    rawPerms.corpus_permissions = corpusPerms;
    rawPerms.docchain_permissions = docchainPerms;

    const payload = {
      system: rawPerms.system_permissions || [],
      authorized_accounts: acts,
      authorized_projects: projs,
      corpus_permissions: rawPerms.corpus_permissions,
      docchain_permissions: rawPerms.docchain_permissions
    };

    await updateUserPermissions(this.userData.username, payload);
  }

  _gatherSystemPermsFromUI(originalSystemPerms) {
    if (this.isSelfView) {
      return originalSystemPerms;
    }
    const checkboxes = this.systemPermsContainer.querySelectorAll("input[type='checkbox']");
    const perms = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) {
        perms.push(cb.dataset.perm);
      }
    });
    return perms;
  }

  handleDuplicatePermissions() {
    if (!this.userData || !this.userData.username) {
      console.warn("[UserModal] No valid userData => cannot duplicate permissions");
      return;
    }
    const userName = this.userData.username;
    const dupPermsModal = new DuplicatePermissionsModal({
      sourceUsername: userName,
      onSuccess: async () => {
        console.log("[UserModal] duplicatePermissions => onSuccess => reloading user data");
        try {
          await this.loadUserData();
          this.parseAndRenderUser();
          this.messageModal.show({
            title: "Permissions Duplicated",
            message: "Successfully duplicated user permissions."
          });
        } catch (err) {
          if (this._isUnauthorizedError(err)) {
            this._handleUnauthorized();
          } else {
            console.error("[UserModal] error reloading after duplication:", err);
            this.errorModal.show({ title: "Error", message: err.message });
          }
        }
      },
    });
    dupPermsModal.show();
  }

  handleAddAccountPermission() {
    console.log("[UserModal] handleAddAccountPermission => opening AccountsModal");
    const modal = new AccountsModal(this.store, {
      selectionMode: true,
      allowMultiple: false,
      onSelect: async (acctId) => {
        if (!acctId) return;
        try {
          this.lockFields();
          this.lockButtons();
          await addAccountAccess(this.userData.username, acctId);
          await this.loadUserData();
          this.parseAndRenderUser();
        } catch (err) {
          console.error("[UserModal] handleAddAccountPermission => error:", err);
          if (this._isUnauthorizedError(err)) {
            this._handleUnauthorized();
          } else {
            this.errorModal.show({ title: "Error", message: err.message });
          }
        } finally {
          this.unlockFields();
          this.unlockButtons();
          this.updateFieldEnabledState();
        }
        modal.hide();
      },
    });
    modal.show();
  }

  handleAddProjectPermission() {
    console.log("[UserModal] handleAddProjectPermission => opening ProjectsModal");
    const modal = new ProjectsModal(this.store, {
      selectionMode: true,
      allowMultiple: false,
      onSelect: async (projId) => {
        if (!projId) return;
        try {
          this.lockFields();
          this.lockButtons();
          await addProjectAccess(this.userData.username, projId);
          await this.loadUserData();
          this.parseAndRenderUser();
        } catch (err) {
          console.error("[UserModal] handleAddProjectPermission => error:", err);
          if (this._isUnauthorizedError(err)) {
            this._handleUnauthorized();
          } else {
            this.errorModal.show({ title: "Error", message: err.message });
          }
        } finally {
          this.unlockFields();
          this.unlockButtons();
          this.updateFieldEnabledState();
        }
        modal.hide();
      },
    });
    modal.show();
  }

  handleAddCorpusPermission() {
    console.log("[UserModal] handleAddCorpusPermission => opening AddCorpusPermissionModal");
    const modal = new AddCorpusPermissionModal({
      onSubmit: async (corpusId, selectedPerms) => {
        try {
          this.lockFields();
          this.lockButtons();
          let perms = this.userData.permissions;
          if (typeof perms === "string") {
            perms = JSON.parse(perms);
          }
          if (!perms.corpus_permissions) {
            perms.corpus_permissions = {};
          }
          perms.corpus_permissions[corpusId] = selectedPerms;
          this.userData.permissions = perms;
          await this._saveUserPermissionsToServer();
          await this.loadUserData();
          this.parseAndRenderUser();
        } catch (err) {
          console.error("[UserModal] handleAddCorpusPermission => error:", err);
          if (this._isUnauthorizedError(err)) {
            this._handleUnauthorized();
          } else {
            this.errorModal.show({ title: "Error", message: err.message });
          }
        } finally {
          this.unlockFields();
          this.unlockButtons();
          this.updateFieldEnabledState();
        }
      }
    });
    modal.show();
  }

  handleAddDocchainPermission() {
    console.log("[UserModal] handleAddDocchainPermission => opening AddDocchainPermissionModal");
    const modal = new AddDocchainPermissionModal({
      onSubmit: async (docPerm) => {
        try {
          this.lockFields();
          this.lockButtons();
          let perms = this.userData.permissions;
          if (typeof perms === "string") {
            perms = JSON.parse(perms);
          }
          if (!perms.docchain_permissions) {
            perms.docchain_permissions = [];
          }
          if (!perms.docchain_permissions.includes(docPerm)) {
            perms.docchain_permissions.push(docPerm);
          }
          this.userData.permissions = perms;
          await this._saveUserPermissionsToServer();
          await this.loadUserData();
          this.parseAndRenderUser();
        } catch (err) {
          console.error("[UserModal] handleAddDocchainPermission => error:", err);
          if (this._isUnauthorizedError(err)) {
            this._handleUnauthorized();
          } else {
            this.errorModal.show({ title: "Error", message: err.message });
          }
        } finally {
          this.unlockFields();
          this.unlockButtons();
          this.updateFieldEnabledState();
        }
      }
    });
    modal.show();
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
   * STATIC HELPER
   * storeUser(store, userData)
   * Helper to replicate old code that decodes user permissions from base64 or object.
   */
  static storeUser(store, userData) {
    console.log("[Security.storeUser] => Phase 1 rewrite, storing user with new permission shape");
    if (!userData) return;

    const processedUser = {
      username: userData.username || "guest",
    };

    let rawPermissions = userData.permissions;
    if (rawPermissions && typeof rawPermissions === "string") {
      try {
        rawPermissions = JSON.parse(atob(rawPermissions));
      } catch (err) {
        console.warn("[Security.storeUser] Could not base64-decode user.permissions => storing as empty set", err);
        rawPermissions = {};
      }
    }

    const systemPerms = Array.isArray(rawPermissions?.system_permissions)
      ? rawPermissions.system_permissions
      : rawPermissions?.system || [];

    const acctAuth = Array.isArray(rawPermissions?.authorized_accounts)
      ? rawPermissions.authorized_accounts
      : [];

    const projAuth = Array.isArray(rawPermissions?.authorized_projects)
      ? rawPermissions.authorized_projects
      : [];

    processedUser.permissions = {
      system: systemPerms,
      authorized_accounts: acctAuth,
      authorized_projects: projAuth,
    };

    if (Array.isArray(userData.authorized_projects)) {
      processedUser.permissions.authorized_projects = userData.authorized_projects;
    }

    store.set("user", processedUser);
  }
}
```

---

These changes address the button locking rules, row‑selection enabling/disabling, and the proper handling of form dirty state for saving/editing without regressing existing functionality.