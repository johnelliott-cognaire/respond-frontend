// File: ui/modals/projects-modal.js

import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { Security } from "../../state/security.js";
import { verifyPermission, getFreshSecurity } from "../../utils/security-utils.js";
import { fetchProjects, getAccount } from "../../api/projects-accounts.js";
import { LoginModal } from "./login-modal.js";
import { UsersModal } from "./users-modal.js";
import { ProjectModal } from "./project-modal.js";
import { AccountModal } from "./account-modal.js";
import { DocumentsModal } from "./documents-modal.js";
import tooltip from "../framework/tooltip.js";
import formatHumanReadableDate from "../../utils/date-utils.js";
import { createModalNavigationManager } from "../components/modal-navigation-manager.js";

/**
 * ProjectsModal
 *
 * Requirement Fix:
 *  - The "Back to Account" button is only enabled if the user has selected a project.
 */
export class ProjectsModal extends AsyncFormModal {
  constructor(store, options = {}) {
    super();
    console.log("[ProjectsModal] constructor called");
    this.store = store;
    this.security = getFreshSecurity(store);

    this.accountId = options.accountId || null;
    this.accountName = null; // Will be populated when filtering by account
    this.selectionMode = options.selectionMode || false;
    // Always enforce single selection
    this.allowMultiple = false;
    this.onSelect = typeof options.onSelect === "function" ? options.onSelect : null;
    this.filterCallback = typeof options.filterCallback === "function" ? options.filterCallback : null;

    this.projects = [];
    this.selectedProjects = [];

    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    this.searchInput = null;
    this.tableBody = null;

    // Navigation management
    this.navigationManager = window.modalNavigationManager;
    this.isNavigationRoot = options.isNavigationRoot !== false; // Default to true unless explicitly set false

    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form projects-modal";
    this.modalEl.style.display = "none";
  
    const titleText = this.selectionMode ? "Select Project" : "Projects";
    
    // Account context visual indicator (when filtering by specific account)
    let accountContextLabel = "";
    if (this.accountId) {
      const accountName = this.accountName ? 
        (this.accountName.length > 40 ? this.accountName.substring(0, 37) + '...' : this.accountName) : 
        "(Loading...)";
      
      accountContextLabel = `
        <div class="form-group">
          <label>Account Context</label>
          <div style="font-size: 14px; padding: 6px; background-color: #f7f7f7; border-radius: 4px; margin-top: 4px;">
            <strong>${this.accountId}</strong> - ${accountName}
          </div>
        </div>
      `;
    }

    let buttonRowHtml = "";
    if (this.selectionMode) {
      buttonRowHtml = `
        <div class="action-group action-group--right">
          <button type="button" class="btn" id="projectsCancelBtn">Cancel</button>
          <button type="button" class="btn btn--primary" id="projectsSelectBtn" disabled>Select</button>
        </div>
      `;
    } else {
      buttonRowHtml = `
        <div class="action-group action-group--right">
          <button type="button" class="btn" id="backAccountBtn">Back to Account</button>
          <button type="button" class="btn btn--primary" id="viewProjectBtn" disabled>View Project</button>
          <button type="button" class="btn" id="viewDocsBtn" disabled>View Documents</button>
          <button type="button" class="btn btn--secondary" id="newProjectBtn" style="display: none;">New Project</button>
        </div>
      `;
    }
  
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close Projects modal">&times;</button>
      
      <!-- Navigation Header -->
      <div class="modal-navigation-header" id="projectsNavigationHeader" style="display: none; margin-bottom: 1rem;">
        <div class="flex gap-md align-items-center">
          <div class="navigation-breadcrumbs" id="projectsBreadcrumbs" aria-label="Navigation breadcrumbs"></div>
        </div>
      </div>
      
      <h2>${titleText}</h2>
      
      ${accountContextLabel}
      
      <div class="input-button-group">
        <input type="text" id="projectsSearchInput" class="doc-input" placeholder="Search..." aria-label="Search projects" />
        <button type="button" class="btn" id="projectsSearchBtn" aria-label="Search projects">Search</button>
      </div>
      
      <div class="data-table-container">
        <table class="w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Owner</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody id="projectsTableBody"></tbody>
        </table>
      </div>
      
      ${buttonRowHtml}
    `;
    document.body.appendChild(this.modalEl);
  
    // Store references to key elements.
    this.modalCloseBtn = this.modalEl.querySelector(".modal__close");
    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener("click", () => this.hide());
    }
    this.searchInput = this.modalEl.querySelector("#projectsSearchInput");
    this.tableBody = this.modalEl.querySelector("#projectsTableBody");
    this.searchBtn = this.modalEl.querySelector("#projectsSearchBtn");
    this.cancelBtn = this.modalEl.querySelector("#projectsCancelBtn");
  
    if (this.searchBtn) {
      this.searchBtn.addEventListener("click", () => this.performSearch());
    }
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener("click", () => this.hide());
    }
  
    if (this.selectionMode) {
      this.selectBtn = this.modalEl.querySelector("#projectsSelectBtn");
      if (this.selectBtn) {
        this.selectBtn.addEventListener("click", () => this.handleSelect());
      }
    } else {
      this.backAccountBtn = this.modalEl.querySelector("#backAccountBtn");
      this.viewProjectBtn = this.modalEl.querySelector("#viewProjectBtn");
      this.viewDocsBtn = this.modalEl.querySelector("#viewDocsBtn");
      this.newProjectBtn = this.modalEl.querySelector("#newProjectBtn");
      
      // Navigation elements
      this.navigationHeader = this.modalEl.querySelector("#projectsNavigationHeader");
      this.breadcrumbsContainer = this.modalEl.querySelector("#projectsBreadcrumbs");
  
      if (this.backAccountBtn) {
        this.backAccountBtn.addEventListener("click", () => this.handleBackToAccount());
      }
      if (this.viewProjectBtn) {
        this.viewProjectBtn.addEventListener("click", () => this.handleViewProject());
      }
      if (this.viewDocsBtn) {
        this.viewDocsBtn.addEventListener("click", () => this.handleViewDocuments());
      }
      if (this.newProjectBtn) {
        this.newProjectBtn.addEventListener("click", () => this.handleNewProject());
      }
      
    }
  
    // When a table row is clicked, use the composite identifier stored in data-composite.
    this.tableBody.addEventListener("click", (evt) => {
      const row = evt.target.closest("tr[data-composite]");
      if (!row) return;
      const composite = row.dataset.composite;
      // Always use single selection (ignoring allowMultiple)
      this.selectedProjects = [composite];
      this.renderTableRows();
      this.updateButtonStates();
    });
  
    this._setupTooltips();
  }
  
  _setupTooltips() {
    // Clean up existing tooltips to prevent duplication per Issue #74 fix
    const existingTooltips = this.modalEl.querySelectorAll('.tooltip-info');
    existingTooltips.forEach(tooltip => tooltip.remove());
    
    // Header tooltip
    const headerEl = this.modalEl.querySelector("h2");
    if (headerEl && !headerEl.querySelector('.tooltip-info')) {
      // Create info icon
      const infoIcon = document.createElement("span");
      infoIcon.innerHTML = `<i class="fas fa-info-circle" style="margin-left: 8px; cursor: help;"></i>`;
      infoIcon.id = "projectsPermissionInfo";
      infoIcon.className = "tooltip-info";

      // Append it to the header
      headerEl.appendChild(infoIcon);

      // Attach tooltip to the icon
      tooltip.attach(infoIcon, `
      Project Access Rules:<br>
      • SYSTEM_ADMIN or APP_ADMIN users can view all projects<br>
      • Other users can view projects:<br>
       - Listed in their authorized_projects permissions<br>
       - OR belonging to accounts in their authorized_accounts<br>
      • Editing requires PROJECT_EDITOR permission or ACCOUNT_EDITOR<br>
       on the parent account, plus appropriate access rights
    `);

      const tooltipText = this.accountId ?
        `Projects within account ${this.accountId}. ` :
        "Projects are work containers within accounts. ";

      tooltip.attach(headerEl, tooltipText +
        (this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]) ?
          "As an administrator, you can see all projects." :
          "You can see projects you have direct access to, or that belong to accounts you have access to."));
    }

    // Search input tooltip
    if (this.searchInput) {
      tooltip.attach(this.searchInput, "Search projects by name or code. Enter text to filter the list of projects.");
    }

    // Table tooltip
    const tableContainer = this.modalEl.querySelector(".projects-table-container");
    if (tableContainer) {
      tooltip.attach(tableContainer, "This table shows projects you have access to. Select a project to perform actions on it.");
    }

    // Button tooltips  
    if (this.backAccountBtn) {
      tooltip.attach(this.backAccountBtn, "Return to the accounts list. Always enabled per new UX flow.");
    }
    
    if (this.newProjectBtn) {
      tooltip.attach(this.newProjectBtn, "Create a new project in the current account context. Requires PROJECT_EDITOR permission.");
    }

    if (this.viewProjectBtn) {
      tooltip.attach(this.viewProjectBtn, "View and edit the selected project's details. Editing requires PROJECT_EDITOR permission.");
    }

    if (this.viewDocsBtn) {
      tooltip.attach(this.viewDocsBtn, "View documents within the selected project that you have access to.");
    }

    // Account context tooltip
    const accountLabel = this.modalEl.querySelector("div[style*='margin-bottom:0.5rem;']");
    if (accountLabel) {
      tooltip.attach(accountLabel, "You are viewing projects within this specific account. Projects from other accounts are not shown.");
    }
    
    
    if (this.breadcrumbsContainer) {
      tooltip.attach(this.breadcrumbsContainer, "Shows your current location in the account/project hierarchy. Click items to navigate.");
    }
  }

  async show(options = {}) {
    console.log("[ProjectsModal] show() => now visible");

    // Load account name for context display if filtering by account
    if (this.accountId && !this.accountName) {
      try {
        console.log("[ProjectsModal] Loading account name for context display:", this.accountId);
        const accountData = await getAccount(this.accountId, this.store);
        this.accountName = accountData.account?.name || accountData.name || this.accountId;
        console.log("[ProjectsModal] Loaded account name:", this.accountName);
        
        // Update the context label with the loaded account name
        this._updateAccountContextLabel();
      } catch (error) {
        console.warn("[ProjectsModal] Failed to load account name:", error);
        this.accountName = this.accountId; // Fallback to account ID
        this._updateAccountContextLabel();
      }
    }

    // Initialize with all row action buttons disabled
    this.disableRowActionButtons();

    // Refresh security object
    this.security = getFreshSecurity(this.store);
    
    // Push to navigation history if not in selection mode and navigation manager supports it
    if (!this.selectionMode && this.navigationManager && typeof this.navigationManager.pushModal === 'function') {
      try {
        this.navigationManager.pushModal('projects', {
          title: 'Projects',
          accountId: this.accountId
        });
        this._updateNavigationUI();
      } catch (error) {
        console.warn('[ProjectsModal] Navigation manager pushModal failed:', error);
        // Continue without navigation history - not critical for modal functionality
      }
    }
    
    // Show New Project button if user has permission
    this._updateNewProjectButtonVisibility();

    super.show(options);
    await this.performSearch();
  }

  disableRowActionButtons() {
    console.log("[ProjectsModal] Explicitly disabling all row action buttons");
    // Explicitly disable all buttons that operate on selected rows
    if (this.viewProjectBtn) this.viewProjectBtn.disabled = true;
    if (this.viewDocsBtn) this.viewDocsBtn.disabled = true;
    
    // Per Issue #82 requirement #9: Back to Account button is now always enabled
    if (this.backAccountBtn) this.backAccountBtn.disabled = false;

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
      loadingIndicator.id = 'projectsLoadingIndicator';
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.textContent = 'Loading projects...';
      loadingIndicator.style.textAlign = 'center';
      loadingIndicator.style.padding = '1rem';
      this.tableBody.innerHTML = '';
      this.tableBody.appendChild(loadingIndicator);

      const filterVal = this.searchInput?.value?.trim() || "";
      console.log("[ProjectsModal] performSearch => filterVal=", filterVal);

      let projs = await fetchProjects(this.accountId, filterVal);
      if (typeof this.filterCallback === "function") {
        projs = projs.filter(p => this.filterCallback(p));
      }
      console.log("[ProjectsModal] fetched projects =>", projs);

      this.projects = projs;
      // Clear selections when searching
      this.selectedProjects = [];

      // Remove loading indicator
      const indicator = document.getElementById('projectsLoadingIndicator');
      if (indicator) {
        indicator.remove();
      }

      this.renderTableRows();

      // Important: Explicitly disable all row action buttons after loading data
      // since no row is selected initially
      this.disableRowActionButtons();
    } catch (err) {
      console.error("[ProjectsModal] performSearch error:", err);
      if (this._isUnauthorizedError(err)) {
        this._handleUnauthorized();
      } else {
        this.errorModal.show({
          title: "Error",
          message: "Failed to load projects: " + err.message
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

    // DEBUG: Log project data being rendered
    console.log("[ProjectsModal] renderTableRows() - Processing", this.projects.length, "projects");

    for (const proj of this.projects) {
      const projId = proj.project_id || "";
      const composite = `${proj.account_id}#${proj.project_id}`;
      const name = proj.name || "(No Name)";
      const code = proj.project_code || proj.code || "";
      const owner = proj.created_by || proj.owner || "";

      // DEBUG: Log each project composite being created
      console.log(`[ProjectsModal] Project: "${name}" -> composite: "${composite}" (account_id: "${proj.account_id}", project_id: "${proj.project_id}")`);

      // Use the date format utility
      const created = formatHumanReadableDate(proj.created_datetime || "");

      const isSelected = this.selectedProjects.includes(composite);
      const row = document.createElement("tr");
      row.dataset.composite = composite;
      row.dataset.projId = projId;
  
      if (isSelected) row.classList.add("selected-row");
      row.style.cursor = "pointer";
  
      row.innerHTML = `
        <td>${name}</td>
        <td>${code}</td>
        <td>${owner}</td>
        <td>${created}</td>
      `;
      this.tableBody.appendChild(row);
    }
  }

  updateButtonStates() {
    // If we have a single project selected, we enable relevant buttons
    const exactlyOne = (this.selectedProjects.length === 1);

    if (this.selectionMode && this.selectBtn) {
      this.selectBtn.disabled = (this.selectedProjects.length === 0);
    } else {
      // Per Issue #82 requirement #9: Back to Account button is always enabled
      if (this.backAccountBtn) {
        this.backAccountBtn.disabled = false;
      }

      if (this.viewProjectBtn) {
        this.viewProjectBtn.disabled = !exactlyOne;
      }
      if (this.viewDocsBtn) {
        this.viewDocsBtn.disabled = !exactlyOne;
      }
    }

    console.log("[ProjectsModal] updateButtonStates => buttons updated based on selection:",
      this.selectedProjects.length > 0 ? "Row selected" : "No row selected");
  }

  handleSelect() {
    if (!this.onSelect) {
      console.warn("[ProjectsModal] selectionMode but no onSelect callback provided");
      return;
    }
    if (this.selectedProjects.length === 0) {
      this.messageModal.show({
        title: "No Projects Selected",
        message: "Please select a project."
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
    console.log("[ProjectsModal] handleBackToAccount => user wants to go back to Account list");
    
    // Per Issue #82 requirement #9: Button always enabled, goes to Account list (not Account details)
    // No longer requires a selected project
    
    // Use router navigation to go back to accounts modal
    if (window.router && window.router.isReady()) {
      console.log("[ProjectsModal] Using router to navigate back to accounts modal");
      try {
        // Navigate to accounts modal URL
        const accountsUrl = '/modals/accounts';
        console.log("[ProjectsModal] Navigating to accounts URL:", accountsUrl);

        // Use modal-to-modal navigation to preserve origin context
        this.navigateToModal(accountsUrl);
        
        console.log("[ProjectsModal] Router navigation initiated successfully");
        return;
      } catch (error) {
        console.error('[ProjectsModal] Router navigation failed:', error);
        // Fall through to fallback method
      }
    } else {
      console.warn('[ProjectsModal] Router not available, using fallback navigation');
    }
    
    // Fallback: Use modal-to-modal navigation to preserve origin context
    const accountsUrl = `/modals/accounts`;
    this.navigateToModal(accountsUrl);
  }

  // Method removed per Issue #82 requirement #8: Remove "Manage Project Users" button
  
  handleNewProject() {
    console.log("[ProjectsModal] handleNewProject => creating new project");
    
    // Verify user has permission to create projects
    if (!this.security.hasSystemPermission(['PROJECT_EDITOR']) && !this.security.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN'])) {
      this.errorModal.show({
        title: "Access Denied",
        message: "You do not have permission to create new projects."
      });
      return;
    }
    
    // Determine account context
    let accountId = this.accountId;
    if (!accountId && this.selectedProjects.length === 1) {
      const composite = this.selectedProjects[0];
      [accountId] = composite.split("#");
    }

    // Use modal-to-modal navigation to preserve origin context
    const newProjectUrl = `/modals/project/new/${accountId}`;
    this.navigateToModal(newProjectUrl);
  }
  
  
  _updateAccountContextLabel() {
    // Update the account context label after loading account name
    if (this.accountId) {
      // Find the account context label by looking for the specific text
      const labels = this.modalEl.querySelectorAll('label');
      let contextDiv = null;
      
      for (let label of labels) {
        if (label.textContent === 'Account Context') {
          contextDiv = label.parentElement;
          break;
        }
      }
      
      if (contextDiv) {
        const accountName = this.accountName ? 
          (this.accountName.length > 40 ? this.accountName.substring(0, 37) + '...' : this.accountName) : 
          "(Loading...)";
        
        const displayDiv = contextDiv.querySelector('div[style*="background-color"]');
        if (displayDiv) {
          displayDiv.innerHTML = `<strong>${this.accountId}</strong> - ${accountName}`;
        }
      }
    }
  }

  _updateNavigationUI() {
    if (!this.navigationHeader || !this.breadcrumbsContainer) return;
    
    // Show navigation header if we have account context
    const hasAccountContext = this.accountId;
    
    if (hasAccountContext) {
      this.navigationHeader.style.display = 'block';
      
      // Update breadcrumbs
      this._updateBreadcrumbs();
    } else {
      this.navigationHeader.style.display = 'none';
    }
  }
  
  _updateBreadcrumbs() {
    if (!this.breadcrumbsContainer) return;
    
    const breadcrumbs = [];
    
    // Add account context if available
    if (this.accountId) {
      breadcrumbs.push({
        text: 'Accounts',
        action: () => this._navigateToAccounts()
      });
      breadcrumbs.push({
        text: `Account ${this.accountId}`,
        action: null // Current context, no action
      });
    } else {
      breadcrumbs.push({
        text: 'Projects',
        action: null
      });
    }
    
    // Build breadcrumb HTML
    const breadcrumbHTML = breadcrumbs.map((crumb, index) => {
      if (crumb.action) {
        return `<button type="button" class="breadcrumb-link" data-index="${index}">${crumb.text}</button>`;
      } else {
        return `<span class="breadcrumb-current">${crumb.text}</span>`;
      }
    }).join('<span class="breadcrumb-separator"> / </span>');
    
    this.breadcrumbsContainer.innerHTML = breadcrumbHTML;
    
    // Add click handlers for breadcrumb links
    this.breadcrumbsContainer.querySelectorAll('.breadcrumb-link').forEach((link, index) => {
      link.addEventListener('click', () => {
        const crumb = breadcrumbs[index];
        if (crumb.action) {
          crumb.action();
        }
      });
    });
  }
  
  _navigateToAccounts() {
    // Use modal-to-modal navigation to preserve origin context
    const accountsUrl = `/modals/accounts`;
    this.navigateToModal(accountsUrl);
  }
  
  _updateNewProjectButtonVisibility() {
    if (!this.newProjectBtn) return;
    
    // Show button if user has PROJECT_EDITOR permission or is admin
    const canCreateProject = this.security.hasSystemPermission(['PROJECT_EDITOR']) || 
                           this.security.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN']);
    
    this.newProjectBtn.style.display = canCreateProject ? 'inline-flex' : 'none';
  }

  handleViewProject() {
    if (this.selectedProjects.length !== 1) {
      console.warn("[ProjectsModal] handleViewProject => no single selected project");
      return;
    }
    // Split composite into accountId and projectId
    const composite = this.selectedProjects[0];
    const [accountId, projectId] = composite.split("#");

    // DEBUG: Enhanced logging with FAIL FAST validation
    console.log("[ProjectsModal] handleViewProject DEBUG:");
    console.log("  - selectedProjects:", this.selectedProjects);
    console.log("  - composite:", composite);
    console.log("  - split result - accountId:", accountId, "projectId:", projectId);

    // FAIL FAST: Validate the split worked correctly
    if (!accountId || !projectId) {
      const error = `FAIL FAST: Invalid composite split. composite: "${composite}", accountId: "${accountId}", projectId: "${projectId}"`;
      console.error("[ProjectsModal]", error);
      throw new Error(error);
    }

    if (accountId === projectId) {
      const error = `FAIL FAST: accountId and projectId are the same after split: "${accountId}". Original composite: "${composite}"`;
      console.error("[ProjectsModal]", error);
      throw new Error(error);
    }

    console.log("  - About to create ProjectModal with (store, projectId, accountId):", this.store, projectId, accountId);
    
    // Use the composite value for permission check if desired…
    if (!this.security.canAccessProject(composite)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to view project: ${composite}`
      });
      return;
    }
    
    // Use modal-to-modal navigation to preserve origin context
    if (window.router && window.router.isReady()) {
      console.log("[ProjectsModal] Using router to navigate to project modal");
      try {
        // FAIL FAST: Validate URL parameters before building URL
        if (!accountId || !projectId || accountId === projectId) {
          const error = `FAIL FAST: Invalid parameters for URL generation. accountId: "${accountId}", projectId: "${projectId}"`;
          console.error("[ProjectsModal]", error);
          throw new Error(error);
        }

        // Navigate to project modal URL: /modals/project/accountId/projectId
        const projectUrl = `/modals/project/${accountId}/${projectId}`;
        console.log("[ProjectsModal] FAIL FAST URL GENERATION:");
        console.log("  - accountId:", accountId);
        console.log("  - projectId:", projectId);
        console.log("  - Generated URL:", projectUrl);

        this.navigateToModal(projectUrl);
        console.log("[ProjectsModal] Modal navigation to project modal initiated successfully");
        return;
      } catch (error) {
        console.error('[ProjectsModal] Router navigation failed:', error);
        // Fall through to fallback
      }
    } else {
      console.warn('[ProjectsModal] Router not available, using fallback navigation');
    }
    
    // Fallback: Direct modal creation (if router fails)
    // FAIL FAST: Validate parameters one more time before creating modal
    if (!accountId || !projectId || accountId === projectId) {
      const error = `FAIL FAST: Invalid parameters for ProjectModal creation. accountId: "${accountId}", projectId: "${projectId}"`;
      console.error("[ProjectsModal]", error);
      this.errorModal.show({
        title: "Invalid Project Parameters",
        message: error
      });
      return;
    }

    console.log("[ProjectsModal] FAIL FAST FALLBACK MODAL CREATION:");
    console.log("  - Creating ProjectModal with projectId:", projectId);
    console.log("  - Creating ProjectModal with accountId:", accountId);

    const pm = new ProjectModal(this.store, projectId, accountId, 'projects');
    pm.show();
  }

  handleViewDocuments() {
    if (this.selectedProjects.length !== 1) {
      console.warn("[ProjectsModal] handleViewDocuments => no single selected project");
      return;
    }
    // Split the composite to extract project id (and account id if needed)
    const composite = this.selectedProjects[0];
    const [accountId, projectId] = composite.split("#");
    console.log("[ProjectsModal] handleViewDocuments => projectId:", projectId, "accountId:", accountId);
  
    if (!this.security.canAccessProject(composite)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to view documents for project: ${composite}`
      });
      return;
    }
    
    // Use modal-to-modal navigation to preserve origin context
    // URL pattern: /modals/documents_management/compositeProjectId
    const documentsUrl = `/modals/documents_management/${encodeURIComponent(composite)}`;
    console.log("[ProjectsModal] Navigating to documents URL:", documentsUrl);

    this.navigateToModal(documentsUrl);
    console.log("[ProjectsModal] Modal navigation to documents modal initiated successfully");
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