// File: ui/modals/documents-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { getAuthHeader, logout } from "../../api/auth.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { parseApiError } from "../../utils/api-utils.js";
import { getBaseUrl } from "../../utils/config.js";
import { LoginModal } from "./login-modal.js";
import { Security } from "../../state/security.js";
import { verifyPermission, getFreshSecurity } from "../../utils/security-utils.js";
import { DocumentTaskFramework } from "../../ui/framework/document-task-framework.js";
import { ProjectModal } from "./project-modal.js";
import tooltip from "../framework/tooltip.js";
import formatHumanReadableDate from "../../utils/date-utils.js";
import { PaginatedResponsiveTable } from "../components/paginated-responsive-table.js";
import { isUserFriendlyStorageError } from "../../utils/storage-errors.js";
import { listDocuments, getDocumentsByAccountProject, deleteDocument } from "../../api/documents.js";



/**
 * DocumentsModal
 * 
 * Displays a list of documents with filtering by owner and status.
 * Allows viewing document details and opening documents in the multi-stage framework.
 * 
 * Features:
 *  - Filter by owner (admin only) and status
 *  - Open selected document in the multi-stage framework
 *  - Navigate back to parent project
 *  - Permission-based access control
 */
export class DocumentsModal extends AsyncFormModal {
  constructor(store, options = {}) {
    super();
    this.store = store;
    this.security = getFreshSecurity(store);
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    this.projectId = options.projectId || null;
    this.pageSize = 5;
    this.lastEvaluatedKey = null;

    this.documents = []; // All documents (unfiltered)
    this.currentPageData = []; // Current page of documents
    this.selectedDocId = null;
    this.selectedDocument = null;
    this.selectedRowIndex = -1;
    this.currentPage = 1;
    this.totalPages = 1;

    // Account/Project filtering state
    this.accountFilter = options.accountId || "";
    this.projectFilter = options.plainProjectId || "";

    this.setUser();

    this.statusList = ["NEW"]; // Start with NEW status as default
    
    // Initialize sort state
    this.currentSortField = 'title';
    this.currentSortDirection = 'asc';

    // For loading doc
    this.framework = new DocumentTaskFramework(this.store, window.jobController);

    // Initialize paginated table
    this.documentsTable = new PaginatedResponsiveTable({
      className: 'documents-table',
      selectable: false,
      sortable: true,
      emptyMessage: 'No documents found matching the selected criteria.',
      pagination: {
        pageSize: this.pageSize,
        showPageSize: true,
        showTotal: true
      },
      sort: {
        showSortControls: true,
        defaultSortField: 'title',
        defaultSortDirection: 'asc',
        sortLabel: 'Sort by'
      },
      onSort: (field, direction) => this.handleSort(field, direction),
      onPageChange: (direction, paginationInfo) => this.handlePageChange(direction, paginationInfo),
      onPageSizeChange: (newPageSize) => this.handlePageSizeChange(newPageSize),
      onRowClick: (data, index, event) => this.handleRowClick(data, index, event)
    });

    // Build UI
    this._buildDOM();
    this._setupTooltips();
  }

  /**
 * setUser: Updates the username for filtering.
 * It retrieves the username from localStorage "currentUser".
 */
  setUser() {
    this.username = localStorage.getItem("currentUser") || "guest";
    // Optionally, update the owner input if it's already in the DOM
    if (this.docOwnerInput) {
      this.docOwnerInput.value = this.username;
    }
  }

  // Fixed version of the _buildDOM method for DocumentsModal

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
  
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form documents-modal";
    this.modalEl.style.zIndex = "9991";
    this.modalEl.id = "documentsModal";
  
    let backButtonHtml = "";
    if (this.projectId) {
      backButtonHtml = `<button type="button" class="btn" id="docBackBtn" aria-label="Return to project view">Back to Project</button>`;
    }
  
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close documents modal">&times;</button>
      <h2 id="documentsModalTitle">Documents</h2>
  
      <div class="modal-section">
        ${
          this.projectId
            ? `<div class="form-group">
                <label for="docProjectId">Project Context</label>
                <input type="text" id="docProjectId" class="doc-input" disabled />
              </div>`
            : ""
        }
  
        <div class="documents-modal__filters">
          <div class="documents-modal__filter-group">
            <label for="docOwner">Owner Username</label>
            <div class="documents-modal__owner-input-group">
              <input type="text" id="docOwner" class="doc-input" value="" disabled />
              <button type="button" class="btn" id="searchBtn" style="display:none;" aria-label="Apply owner filter">Search</button>
            </div>
          </div>
          
          <div class="documents-modal__filter-group">
            <label for="docAccountFilter">Account ID</label>
            <div class="documents-modal__owner-input-group">
              <input type="text" id="docAccountFilter" class="doc-input" value="" placeholder="Filter by account..." />
              <button type="button" class="btn btn--secondary" id="clearAccountBtn" aria-label="Clear account filter">Clear</button>
            </div>
          </div>
          
          <div class="documents-modal__filter-group">
            <label for="docProjectFilter">Project ID</label>
            <div class="documents-modal__owner-input-group">
              <input type="text" id="docProjectFilter" class="doc-input" value="" placeholder="Filter by project..." />
              <button type="button" class="btn btn--secondary" id="clearProjectBtn" aria-label="Clear project filter">Clear</button>
            </div>
          </div>
          
          <div class="documents-modal__filter-group">
            <label for="document-modal-status">Status</label>
            <div class="status-dropdown-wrapper">
              <div class="status" id="document-modal-status" aria-haspopup="listbox" aria-expanded="false" aria-label="Filter by document status">
                <span id="selectedStatusLabel">New</span>
                <i class="fas fa-caret-down" aria-hidden="true"></i>
              </div>
              <div class="status-dropdown-options" id="document-modal-status-options" role="listbox">
                <div class="status-option selected" data-value="NEW" role="option" aria-selected="true">New</div>
                <div class="status-option" data-value="IN_PROGRESS" role="option" aria-selected="false">In Progress</div>
                <div class="status-option" data-value="READY" role="option" aria-selected="false">Ready</div>
                <div class="status-option" data-value="SUBMITTED" role="option" aria-selected="false">Submitted</div>
                <div class="status-option" data-value="CANCELLED" role="option" aria-selected="false">Cancelled</div>
              </div>
            </div>
          </div>
          
          <div class="documents-modal__filter-group">
            <button type="button" class="btn btn--primary" id="applyFiltersBtn" aria-label="Apply all filters">Apply Filters</button>
          </div>
        </div>
      </div>
  
      <div class="documents-table-container" id="documentsTableContainer">
        <!-- Table will be rendered here by PaginatedResponsiveTable -->
      </div>
  
      <div class="documents-modal__footer action-group action-group--right">
        ${backButtonHtml}
        <button type="button" class="btn btn--danger" id="docDeleteBtn" aria-label="Delete selected document" disabled>Delete</button>
        <button type="button" class="btn btn--primary" id="docOpenBtn" aria-label="Open selected document">Open</button>
      </div>
    `;
    this.modalEl.style.display = "none";
    document.body.appendChild(this.modalEl);
  
    // Attach event listeners
    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => this.hide());
  
    if (this.projectId) {
      const docProjectIdInput = this.modalEl.querySelector("#docProjectId");
      if (docProjectIdInput) {
        docProjectIdInput.value = this.projectId;
      }
    }
  
    this.docOwnerInput = this.modalEl.querySelector("#docOwner");
    this.searchBtn = this.modalEl.querySelector("#searchBtn");
    if (this.searchBtn) {
      this.searchBtn.addEventListener("click", () => {
        this.lastEvaluatedKey = null;
        this.fetchDocuments();
      });
    }

    // Account and Project filter elements
    this.accountFilterInput = this.modalEl.querySelector("#docAccountFilter");
    this.projectFilterInput = this.modalEl.querySelector("#docProjectFilter");
    this.clearAccountBtn = this.modalEl.querySelector("#clearAccountBtn");
    this.clearProjectBtn = this.modalEl.querySelector("#clearProjectBtn");
    this.applyFiltersBtn = this.modalEl.querySelector("#applyFiltersBtn");

    // Set initial filter values
    if (this.accountFilterInput) {
      this.accountFilterInput.value = this.accountFilter;
    }
    if (this.projectFilterInput) {
      this.projectFilterInput.value = this.projectFilter;
    }

    // Add event listeners for filter controls
    if (this.clearAccountBtn) {
      this.clearAccountBtn.addEventListener("click", () => {
        this.accountFilterInput.value = "";
        this.accountFilter = "";
        this.applyFilters();
      });
    }

    if (this.clearProjectBtn) {
      this.clearProjectBtn.addEventListener("click", () => {
        this.projectFilterInput.value = "";
        this.projectFilter = "";
        this.applyFilters();
      });
    }

    if (this.applyFiltersBtn) {
      this.applyFiltersBtn.addEventListener("click", () => {
        this.applyFilters();
      });
    }

    // Apply filters on Enter key press
    if (this.accountFilterInput) {
      this.accountFilterInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.applyFilters();
        }
      });
    }

    if (this.projectFilterInput) {
      this.projectFilterInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.applyFilters();
        }
      });
    }
  
    const docOpenBtn = this.modalEl.querySelector("#docOpenBtn");
    docOpenBtn.addEventListener("click", () => this.handleOpen());
    docOpenBtn.disabled = true;

    const docDeleteBtn = this.modalEl.querySelector("#docDeleteBtn");
    docDeleteBtn.addEventListener("click", () => this.handleDelete());
    docDeleteBtn.disabled = true;

    // Attach the paginated table to the container
    const tableContainer = this.modalEl.querySelector("#documentsTableContainer");
    this.documentsTable.attachToDOM(tableContainer);
    
    // Set up table columns
    this.documentsTable.setColumns([
      {
        key: 'title',
        label: 'Title',
        primary: true,
        sortable: true,
        render: (value, row) => {
          const title = value || '(Untitled)';
          const docId = row.document_id || '';
          return `
            <div class="documents-modal__title-cell">
              <div class="documents-modal__title">${title}</div>
              <div class="documents-modal__doc-id">${docId}</div>
            </div>
          `;
        }
      },
      {
        key: 'created_datetime',
        label: 'Created',
        type: 'date',
        sortable: true,
        render: (value) => formatHumanReadableDate(value)
      },
      {
        key: 'modified_datetime',
        label: 'Modified',
        type: 'date',
        sortable: true,
        render: (value) => formatHumanReadableDate(value)
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        sortable: true
      }
    ]);
  
    if (this.projectId) {
      const backBtn = this.modalEl.querySelector("#docBackBtn");
      if (backBtn) {
        backBtn.addEventListener("click", () => this.handleBack());
      }
    }

    // Set up status dropdown behavior
    const statusDropdownWrapper = this.modalEl.querySelector(".status-dropdown-wrapper");
    const selectedStatus = this.modalEl.querySelector("#document-modal-status");
    const dropdownOptions = this.modalEl.querySelector("#document-modal-status-options");

    if (selectedStatus && dropdownOptions) {
      // Toggle dropdown
      selectedStatus.addEventListener("click", (e) => {
        e.stopPropagation();
        const isExpanded = statusDropdownWrapper.classList.toggle("open");
        selectedStatus.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", () => {
        statusDropdownWrapper.classList.remove("open");
        selectedStatus.setAttribute("aria-expanded", "false");
      });

      // Prevent closing when clicking inside dropdown
      dropdownOptions.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Handle option selection
      const statusOptions = dropdownOptions.querySelectorAll(".status-option");
      statusOptions.forEach(option => {
        option.addEventListener("click", () => {
          const newStatus = option.getAttribute("data-value");
          const newLabel = option.textContent.trim();

          // Update UI
          const selectedStatusLabel = selectedStatus.querySelector("#selectedStatusLabel");
          if (selectedStatusLabel) {
            selectedStatusLabel.textContent = newLabel;
          }

          // Update ARIA attributes
          statusOptions.forEach(opt => {
            opt.classList.remove("selected");
            opt.setAttribute("aria-selected", "false");
          });
          option.classList.add("selected");
          option.setAttribute("aria-selected", "true");

          // Update status and fetch documents
          this.statusList = [newStatus];
          this.lastEvaluatedKey = null;
          this.fetchDocuments();

          // Close dropdown
          statusDropdownWrapper.classList.remove("open");
          selectedStatus.setAttribute("aria-expanded", "false");

          console.log(`[DocumentsModal] Status filter changed to: ${newStatus}`);
        });
      });
    }
  }

  _setupTooltips() {
    // Header tooltip
    const headerEl = this.modalEl.querySelector("h2");
    if (headerEl) {
      tooltip.attach(headerEl, "This modal displays documents that you have access to. Select a document to open it.");
    }

    // Owner field tooltip
    if (this.docOwnerInput) {
      tooltip.attach(this.docOwnerInput, "The username of the document owner. By default shows your documents.");
    }

    // Search button tooltip
    if (this.searchBtn) {
      tooltip.attach(this.searchBtn, "Filter documents by the specified owner username.");
    }

    // Account filter tooltip
    const accountFilterInput = this.modalEl.querySelector("#docAccountFilter");
    if (accountFilterInput) {
      tooltip.attach(accountFilterInput, "Filter documents by account ID. Leave empty to show all accounts.");
    }

    // Project filter tooltip
    const projectFilterInput = this.modalEl.querySelector("#docProjectFilter");
    if (projectFilterInput) {
      tooltip.attach(projectFilterInput, "Filter documents by project ID. Leave empty to show all projects.");
    }

    // Apply filters button tooltip
    const applyFiltersBtn = this.modalEl.querySelector("#applyFiltersBtn");
    if (applyFiltersBtn) {
      tooltip.attach(applyFiltersBtn, "Apply the selected account and project filters to the document list.");
    }

    // Status dropdown tooltip
    const statusField = this.modalEl.querySelector("#document-modal-status");
    if (statusField) {
      tooltip.attach(statusField, "Filter documents by their current status.");
    }

    // Table tooltip
    const tableContainer = this.modalEl.querySelector(".data-table-container");
    if (tableContainer) {
      tooltip.attach(tableContainer, "Click on a document to select it. You can then open the selected document.");
    }

    // Delete button tooltip
    const deleteBtn = this.modalEl.querySelector("#docDeleteBtn");
    if (deleteBtn) {
      tooltip.attach(deleteBtn, "Delete the selected document and all its items. This action cannot be undone.");
    }

    // Open button tooltip
    const openBtn = this.modalEl.querySelector("#docOpenBtn");
    if (openBtn) {
      tooltip.attach(openBtn, "Open the selected document in a new tab.");
    }

    // Back button tooltip
    const backBtn = this.modalEl.querySelector("#docBackBtn");
    if (backBtn) {
      tooltip.attach(backBtn, "Return to the parent project view.");
    }
  }

  /**
   * Format document ID for display with ellipsis
   */
  formatDocId(id) {
    const maxLen = 18;
    if (!id || id.length <= maxLen) return id;
    const prefixLen = 8;
    const suffixLen = 5;
    return (
      id.slice(0, prefixLen) +
      "..." +
      id.slice(id.length - suffixLen, id.length)
    );
  }

  /**
   * Apply current filter settings and refresh document list
   */
  applyFilters() {
    // Update filter state from inputs
    this.accountFilter = this.accountFilterInput ? this.accountFilterInput.value.trim() : "";
    this.projectFilter = this.projectFilterInput ? this.projectFilterInput.value.trim() : "";
    
    // Reset pagination
    this.lastEvaluatedKey = null;
    this.currentPage = 1;
    
    // Clear selection
    this.selectedDocId = null;
    this.selectedDocument = null;
    this.selectedRowIndex = -1;
    
    console.log("[DocumentsModal] Applying filters:", {
      account: this.accountFilter,
      project: this.projectFilter,
      status: this.statusList,
      owner: this.docOwnerInput ? this.docOwnerInput.value : ""
    });
    
    // Fetch documents with new filters
    this.fetchDocuments();
  }

  /**
   * Handle table row click - select document
   */
  handleRowClick(data, index, event) {
    // Extract document ID from the data
    const docId = data.document_id?.S || data.document_id;
    this.selectedDocId = docId;
    this.selectedDocument = data;
    this.selectedRowIndex = index;
    
    // Update visual selection state
    this.documentsTable.updateRowSelection(index);
    this.updateButtonStates();
    
    console.log(`[DocumentsModal] Document selected: ${docId} (page ${this.currentPage}, row ${index})`);
  }

  /**
   * Handle table sorting
   */
  handleSort(field, direction) {
    console.log(`[DocumentsModal] Sort by ${field} ${direction}`);
    
    // Update current sort state
    this.currentSortField = field;
    this.currentSortDirection = direction;
    
    // Sort all normalized documents
    if (this.normalizedDocuments) {
      this.normalizedDocuments.sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        
        // Handle date fields
        if (field.includes('datetime')) {
          aVal = new Date(aVal || 0);
          bVal = new Date(bVal || 0);
        } else if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }
        
        if (direction === 'asc') {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
      });
      
      // Reset to first page after sorting
      this.currentPage = 1;
      this.updateCurrentPageData();
    }
  }

  /**
   * Handle page change (next/previous) - Client-side pagination
   */
  handlePageChange(direction, paginationInfo) {
    console.log(`[DocumentsModal] Page change: ${direction}`, paginationInfo);
    
    if (direction === 'next' && this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updateCurrentPageData();
    } else if (direction === 'previous' && this.currentPage > 1) {
      this.currentPage--;
      this.updateCurrentPageData();
    }
  }

  /**
   * Handle page size change
   */
  handlePageSizeChange(newPageSize) {
    console.log(`[DocumentsModal] handlePageSizeChange called with: ${newPageSize}`);
    console.log(`[DocumentsModal] Current state before change: currentPage=${this.currentPage}, pageSize=${this.pageSize}`);
    
    this.pageSize = newPageSize;
    this.currentPage = 1; // Reset to first page
    this.calculatePagination();
    this.updateCurrentPageData();
  }

  show() {
    console.log("[DocumentsModal] show() called");

    // Refresh security object first to ensure correct user info
    this.security = getFreshSecurity(this.store);

    this.setUser();

    // Check permissions for owner editing
    this._handleOwnerField();

    if (this.docOwnerInput) {
      // Always use the username we just retrieved above
      this.docOwnerInput.value = this.username;
    }

    // Set default status to NEW
    this.statusList = ["NEW"];

    // Update the status dropdown UI to show "New" as selected
    const statusOptions = this.modalEl.querySelectorAll(".status-option");
    if (statusOptions) {
      statusOptions.forEach(opt => {
        if (opt.getAttribute("data-value") === "NEW") {
          opt.classList.add("selected");
          opt.setAttribute("aria-selected", "true");

          // Update the selected label
          const selectedStatusLabel = this.modalEl.querySelector("#selectedStatusLabel");
          if (selectedStatusLabel) {
            selectedStatusLabel.textContent = "New";
          }
        } else {
          opt.classList.remove("selected");
          opt.setAttribute("aria-selected", "false");
        }
      });
    }

    this.lastEvaluatedKey = null;
    this.selectedDocId = null;
    this.currentPage = 1; // Reset to first page when showing modal

    // Disable buttons initially
    const openBtn = this.modalEl.querySelector("#docOpenBtn");
    if (openBtn) {
      openBtn.disabled = true;
    }

    const deleteBtn = this.modalEl.querySelector("#docDeleteBtn");
    if (deleteBtn) {
      deleteBtn.disabled = true;
    }

    console.log("[DocumentsModal] Reset to page 1 in show()");

    super.show();
    this.fetchDocuments();
  }

  async fetchDocuments() {
    try {
      console.log("[DocumentsModal] fetchDocuments() => start");
      this.lockFields();
      this.lockButtons();

      // Show loading state in the table
      this.documentsTable.setLoading(true);

      // Prepare filters
      const filters = {
        owner_username: (this.docOwnerInput && this.docOwnerInput.value) || this.username,
        status_list: this.statusList,
        page_size: this.pageSize
      };

      // Add account/project filtering
      if (this.accountFilter) {
        filters.account_id = this.accountFilter;
      }

      if (this.projectFilter) {
        // If we have both account and project, create composite project_id
        if (this.accountFilter) {
          filters.project_id = `${this.accountFilter}#${this.projectFilter}`;
        } else {
          filters.plain_project_id = this.projectFilter;
        }
      }

      // Handle legacy projectId from constructor (when called from ProjectModal)
      if (this.projectId && !this.accountFilter && !this.projectFilter) {
        filters.project_id = this.projectId;
      }

      if (this.lastEvaluatedKey) {
        filters.last_evaluated_key = this.lastEvaluatedKey;
      }

      console.log("[DocumentsModal] Calling listDocuments with filters:", filters);

      // Use the new API client method
      const data = await listDocuments(filters);
      const docItems = data.documents || [];
      this.lastEvaluatedKey = data.last_evaluated_key || null;

      // Store all documents and reset selection
      this.documents = docItems;
      this.selectedDocId = null;
      this.selectedDocument = null;
      this.selectedRowIndex = -1;
      this.currentPage = 1;

      // Normalize the data format for the table (handle both DynamoDB and plain formats)
      this.normalizedDocuments = this.documents.map(doc => ({
        document_id: doc.document_id?.S || doc.document_id,
        title: doc.title?.S || doc.title,
        status: doc.status?.S || doc.status,
        created_datetime: doc.created_datetime?.S || doc.created_datetime,
        modified_datetime: doc.modified_datetime?.S || doc.modified_datetime,
        project_id: doc.project_id?.S || doc.project_id,
        account_id: doc.account_id?.S || doc.account_id,
        // Store original data for opening document
        _original: doc
      }));

      // Calculate pagination and update table
      this.calculatePagination();
      this.updateCurrentPageData();

      // Update button states
      this.updateButtonStates();

      console.log(`[DocumentsModal] fetchDocuments => got ${docItems.length} doc(s), showing page ${this.currentPage} of ${this.totalPages}`);
    } catch (err) {
      console.error("[DocumentsModal] fetchDocuments error:", err);
      
      // Handle authentication errors by prompting login
      if (err.message.includes("token invalid") || err.message.includes("Unauthorized")) {
        console.warn("[DocumentsModal] Unauthorized => prompting login popup");
        this.hide();
        const lm = new LoginModal();
        lm.show();
        return;
      }
      
      // Show other errors to user
      this.errorModal.show({
        title: "Failed to load documents",
        message: err.message || "An unexpected error occurred while loading documents."
      });
    } finally {
      this.documentsTable.setLoading(false);
      this.unlockFields();
      this.unlockButtons();
    }
  }


  /**
   * Calculate pagination based on current documents and page size
   */
  calculatePagination() {
    const totalItems = this.normalizedDocuments?.length || 0;
    this.totalPages = Math.ceil(totalItems / this.pageSize) || 1;
    
    // Ensure current page is within bounds
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }
    
    console.log(`[DocumentsModal] calculatePagination: totalItems=${totalItems}, pageSize=${this.pageSize}, totalPages=${this.totalPages}, currentPage=${this.currentPage}`);
  }

  /**
   * Update current page data and refresh table
   */
  updateCurrentPageData() {
    if (!this.normalizedDocuments) {
      this.currentPageData = [];
      return;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.currentPageData = this.normalizedDocuments.slice(startIndex, endIndex);

    // Calculate pagination state with explicit type checking
    const currentPageNum = Number(this.currentPage);
    const totalPagesNum = Number(this.totalPages);
    const hasNextPage = currentPageNum < totalPagesNum;
    const hasPreviousPage = currentPageNum > 1;
    
    console.log(`[DocumentsModal] DETAILED Pagination state:`);
    console.log(`  - currentPage: ${this.currentPage} (type: ${typeof this.currentPage}) -> num: ${currentPageNum}`);
    console.log(`  - totalPages: ${this.totalPages} (type: ${typeof this.totalPages}) -> num: ${totalPagesNum}`);
    console.log(`  - currentPageNum > 1: ${currentPageNum > 1}`);
    console.log(`  - hasPreviousPage: ${hasPreviousPage}`);
    
    // Log table's internal pagination options for debugging
    console.log(`[DocumentsModal] Table pageSize: ${this.documentsTable.paginationOptions.pageSize}, Our pageSize: ${this.pageSize}`);
    
    // Update table with current page data and pagination state
    this.documentsTable.setDataWithPagination(this.currentPageData, {
      currentPage: this.currentPage,
      totalItems: this.normalizedDocuments.length,
      hasNextPage: hasNextPage,
      hasPreviousPage: hasPreviousPage,
      pageSize: this.pageSize
    });

    // Update button states
    this.updateButtonStates();
  }

  updateButtonStates() {
    const openBtn = this.modalEl.querySelector("#docOpenBtn");
    if (openBtn) {
      openBtn.disabled = !this.selectedDocId;
    }

    const deleteBtn = this.modalEl.querySelector("#docDeleteBtn");
    if (deleteBtn) {
      deleteBtn.disabled = !this.selectedDocId;
    }
  }

  handleOpen() {
    if (!this.selectedDocId || !this.selectedDocument) {
      this.messageModal.show({
        title: "No Document Selected",
        message: "Please select a document from the table first."
      });
      return;
    }

    console.log("[DocumentsModal] handleOpen => doc:", this.selectedDocument);
    // Use the original document data for opening
    const originalDoc = this.selectedDocument._original || this.selectedDocument;
    this._openSelectedDocument(originalDoc);
  }

  /**
   * Opens the selected document using TabManager
   * @private
   */
  async _openSelectedDocument(selectedDoc) {
    try {
      if (!selectedDoc) {
        this.messageModal.show({
          title: "No Selection",
          message: "Please select a document to open."
        });
        return;
      }

      // Get document ID and project information
      const docId = selectedDoc.document_id?.S || selectedDoc.document_id;
      const plainProjectId = selectedDoc.project_id?.S || selectedDoc.project_id;
      const accountId = selectedDoc.account_id?.S || selectedDoc.account_id;

      // Ensure projectId is in composite format (accountId#projectId)
      let compositeProjectId = plainProjectId;
      if (accountId && !plainProjectId.includes('#')) {
        compositeProjectId = `${accountId}#${plainProjectId}`;
      }

      console.log(`[DocumentsModal] _openSelectedDocument => docId=${docId}, projectId=${compositeProjectId}`);

      // Check if TabManager is available
      if (!window.tabManager) {
        this.errorModal.show({
          title: "Error",
          message: "TabManager is not available. Cannot open document."
        });
        return;
      }

      try {
        // Use TabManager's loadDocument method to load and open the document
        const tabIndex = await window.tabManager.loadDocument(docId, compositeProjectId);

        if (tabIndex >= 0) {
          console.log(`[DocumentsModal] Document opened successfully in tab index ${tabIndex}`);
          if (window.showMainApp) window.showMainApp();
          // Hide modal after successful open
          this.hide();
        } else {
          this.errorModal.show({
            title: "Error Opening Document",
            message: "Failed to open document. See console for details."
          });
        }
      } catch (tabError) {
        console.error("[DocumentsModal] Error from TabManager:", tabError);
        
        // Handle user-friendly storage errors specially
        if (isUserFriendlyStorageError(tabError)) {
          const userMessage = tabError.getUserMessage();
          this.errorModal.show({
            title: userMessage.title,
            message: userMessage.message,
            details: userMessage.details + "\n\n" + userMessage.actionAdvice
          });
        } else {
          // Handle other tab manager errors
          this.errorModal.show({
            title: "Cannot Open Document",
            message: tabError.message || "Failed to open document in a new tab.",
            details: "Please try again or contact support if the problem persists."
          });
        }
        return; // Don't continue to outer catch
      }
    } catch (error) {
      console.error("[DocumentsModal] Error opening document:", error);
      this.errorModal.show({
        title: "Error Opening Document",
        message: error.message || "An unexpected error occurred."
      });
    }
  }


  handleBack() {
    console.log("[DocumentsModal] handleBack => opening ProjectModal for projectId=", this.projectId);
    
    // Assume this.projectId is a composite string (e.g. "IAG#LDM")
    const composite = this.projectId;
    if (!composite.includes("#")) {
      console.error("DocumentsModal.handleBack: projectId is not composite");
      return;
    }
    const [accountId, plainProjectId] = composite.split("#");
    
    // Perform a permission check using the composite if needed
    const security = this.security;
    if (!security.canAccessProject(composite)) {
      this.errorModal.show({
        title: "Access Denied",
        message: `You do not have permission to view project: ${composite}`
      });
      return;
    }
    
    // Use modal-to-modal navigation to preserve origin context
    const projectUrl = `/modals/project/${accountId}/${plainProjectId}`;
    this.navigateToModal(projectUrl);
  }

  /**
   * Handle delete document with confirmation
   */
  async handleDelete() {
    if (!this.selectedDocId || !this.selectedDocument) {
      this.messageModal.show({
        title: "No Document Selected",
        message: "Please select a document from the table first."
      });
      return;
    }

    const docId = this.selectedDocId;
    const docTitle = this.selectedDocument.title?.S || this.selectedDocument.title || "Unnamed Document";

    try {
      // Import YesNoModal for confirmation
      const { YesNoModal } = await import("./yesno-modal.js");
      
      // Show confirmation dialog with clear consequences
      const confirmed = await new Promise((resolve) => {
        const confirmModal = new YesNoModal();
        confirmModal.show({
          title: "Confirm Document Deletion",
          message: `Are you sure you want to delete "${docTitle}"?\n\nThis will permanently delete:\n• The document and all its content\n• All questions and answers\n• All associated document items\n\nThis action cannot be undone.`,
          yesText: "Delete Document",
          noText: "Cancel",
          yesClass: "btn--danger",
          onResult: (result) => {
            resolve(result);
          }
        });
      });

      if (!confirmed) {
        console.log("[DocumentsModal] Document deletion cancelled by user");
        return;
      }

      // Show loading state
      this.lockButtons();
      const deleteBtn = this.modalEl.querySelector("#docDeleteBtn");
      if (deleteBtn) {
        deleteBtn.textContent = "Deleting...";
        deleteBtn.disabled = true;
      }

      // Perform deletion
      console.log(`[DocumentsModal] Deleting document: ${docId}`);
      const result = await deleteDocument(docId, "DELETE_CONFIRMED");

      console.log("[DocumentsModal] Document deletion successful:", result);

      // Show success message
      this.messageModal.show({
        title: "Document Deleted",
        message: `"${docTitle}" has been permanently deleted.\n\nDeletion summary:\n• Document items deleted: ${result.deletion_summary?.document_items_deleted || 0}\n• Document groups deleted: ${result.deletion_summary?.document_groups_deleted || 0}`
      });

      // Clear selection and refresh the document list
      this.selectedDocId = null;
      this.selectedDocument = null;
      this.selectedRowIndex = -1;
      
      // Refresh the documents table
      await this.fetchDocuments();

      // Update button states
      this.updateButtonStates();

    } catch (error) {
      console.error("[DocumentsModal] Error deleting document:", error);

      // Handle specific error types
      let errorTitle = "Deletion Failed";
      let errorMessage = error.message || "An unexpected error occurred while deleting the document.";

      if (error.message.includes("Authentication")) {
        errorTitle = "Authentication Required";
        errorMessage = "Please log in again to delete documents.";
        this._handleUnauthorized();
        return;
      } else if (error.message.includes("Permission")) {
        errorTitle = "Permission Denied";
        errorMessage = "You can only delete documents that you own.";
      } else if (error.message.includes("not found")) {
        errorTitle = "Document Not Found";
        errorMessage = "The document may have already been deleted or you don't have access to it.";
      }

      this.errorModal.show({
        title: errorTitle,
        message: errorMessage,
        details: error.stack || error.toString()
      });

    } finally {
      // Restore button state
      this.unlockButtons();
      const deleteBtn = this.modalEl.querySelector("#docDeleteBtn");
      if (deleteBtn) {
        deleteBtn.textContent = "Delete";
        deleteBtn.disabled = !this.selectedDocId;
      }
    }
  }

  _handleUnauthorized() {
    // In place of logout, auto-prompt for login
    this.hide();
    const lm = new LoginModal();
    lm.show();
  }

  /**
   * _handleOwnerField: enable docOwnerInput if user is SYSTEM_ADMIN or APP_ADMIN, else disable
   * Also, on change => re-fetch
   */
  _handleOwnerField() {
    console.log("[DocumentsModal] _handleOwnerField => checking perms");
    const canChangeOwner = this.security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]);

    if (this.docOwnerInput) {
      // enable or disable based on permissions
      this.docOwnerInput.disabled = !canChangeOwner;

      // Show or hide the search button
      if (this.searchBtn) {
        this.searchBtn.style.display = canChangeOwner ? "block" : "none";
      }

      // If owner input is enabled for SYSTEM_ADMIN/APP_ADMIN, add change event listener
      if (canChangeOwner) {
        // Remove any previous listeners first to avoid duplicates
        const newOwnerInput = this.docOwnerInput.cloneNode(true);
        this.docOwnerInput.parentNode.replaceChild(newOwnerInput, this.docOwnerInput);
        this.docOwnerInput = newOwnerInput;
      }
    }
  }

  // Lock all form fields and buttons
  lockFields() {
    if (!this.modalEl) return;
    const inputs = this.modalEl.querySelectorAll("input, select, textarea");
    inputs.forEach(input => {
      // Store original disabled state to restore later
      input._wasDisabled = input.disabled;
      input.disabled = true;
    });
  }

  // Unlock all form fields, respecting original states
  unlockFields() {
    if (!this.modalEl) return;
    const inputs = this.modalEl.querySelectorAll("input, select, textarea");
    inputs.forEach(input => {
      // Restore original disabled state
      input.disabled = input._wasDisabled || false;
      delete input._wasDisabled;
    });

    // Re-apply owner field permissions
    this._handleOwnerField();
  }

  // Lock buttons to prevent actions during loading
  lockButtons() {
    if (!this.modalEl) return;
    const buttons = this.modalEl.querySelectorAll("button:not(.modal-close)");
    buttons.forEach(button => {
      button._wasDisabled = button.disabled;
      button.disabled = true;
    });
  }

  // Unlock buttons, respecting original states
  unlockButtons() {
    if (!this.modalEl) return;
    const buttons = this.modalEl.querySelectorAll("button:not(.modal-close)");
    buttons.forEach(button => {
      button.disabled = button._wasDisabled || false;
      delete button._wasDisabled;
    });

    // Re-apply button states based on selection
    this.updateButtonStates();
  }

  /**
   * Clean up resources when modal is destroyed
   */
  destroy() {
    if (this.documentsTable) {
      this.documentsTable.destroy();
    }
    super.destroy();
  }
}