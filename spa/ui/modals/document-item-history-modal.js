// File: ui/modals/document-item-history-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { fetchItemHistoryFromS3 } from "../../api/documents.js";
import formatHumanReadableDate from "../../utils/date-utils.js"; // Add this import


/**
 * DocumentItemHistoryModal
 * 
 * Shows revision history for a document item and allows
 * viewing specific revisions reconstructed from the delta changes.
 */
export class DocumentItemHistoryModal extends AsyncFormModal {
  constructor() {
    super();
    this.errorModal = new ErrorModal();
    this.projectDocumentId = null;
    this.stageGroupItemId = null;
    this.itemDisplayName = null;
    this.revisionSummaries = [];
    this.reconstructedRevision = null;
    this.selectedRevision = null;
    
    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
      this.overlayEl.style.zIndex = "9000";
    }

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form history-modal";
    this.modalEl.style.display = "none";
    this.modalEl.style.zIndex = "9996";
    this.modalEl.style.width = "80%";
    this.modalEl.style.maxWidth = "1200px";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close history modal">&times;</button>
      <h2 class="history-modal-title" title="">Document Item History</h2>
      
      <div class="modal-section">
        <!-- Two-column layout -->
        <div class="flex gap-lg">
          <!-- Left side: Revision list -->
          <div class="flex-1">
            <h3>Revisions</h3>
            <div class="data-table-container">
              <table class="w-full">
                <thead>
                  <tr>
                    <th style="width: 20%">Revision</th>
                    <th style="width: 25%">Date & Time</th>
                    <th style="width: 25%">Changed By</th>
                    <th style="width: 30%">Description</th>
                  </tr>
                </thead>
                <tbody id="revisionListBody">
                  <tr>
                    <td colspan="4" class="loading-placeholder">Loading revision history...</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="action-group action-group--right" style="margin-top: 1rem;">
              <button type="button" class="btn btn--primary" id="historyViewRevisionBtn" disabled aria-label="View selected revision">View Selected Revision</button>
            </div>
          </div>
          
          <!-- Right side: Revision details -->
          <div class="flex-1">
            <h3>Revision Details</h3>
            <div class="data-table-container">
              <div id="revisionDetails" class="revision-details">
                <div class="loading-placeholder">Select a revision to view details</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="action-group action-group--right">
        <button type="button" class="btn" id="historyCloseBtn">Close</button>
      </div>
    `;

    document.body.appendChild(this.modalEl);

    // Attach event listeners
    this.modalCloseBtn = this.modalEl.querySelector(".modal__close");
    this.modalCloseBtn.addEventListener("click", () => this.hide());

    this.closeBtn = this.modalEl.querySelector("#historyCloseBtn");
    this.closeBtn.addEventListener("click", () => this.hide());

    this.viewRevisionBtn = this.modalEl.querySelector("#historyViewRevisionBtn");
    this.viewRevisionBtn.addEventListener("click", () => this.loadSelectedRevision());

    this.revisionListBody = this.modalEl.querySelector("#revisionListBody");
    this.revisionDetailsEl = this.modalEl.querySelector("#revisionDetails");
    
    // Add click handler for revision list
    this.revisionListBody.addEventListener("click", (evt) => {
      const row = evt.target.closest("tr[data-revision]");
      if (!row) return;
      
      // Remove active class from all rows
      const allRows = this.revisionListBody.querySelectorAll("tr[data-revision]");
      allRows.forEach(r => r.classList.remove("selected-row"));
      
      // Add active class to clicked row
      row.classList.add("selected-row");
      
      // Store selected revision
      this.selectedRevision = parseInt(row.dataset.revision, 10);
      
      // Enable view button
      this.viewRevisionBtn.disabled = false;
    });

  }

  /**
   * Initialize and show the modal with a specific document item
   * @param {Object} params Parameters for the modal
   * @param {string} params.projectDocumentId The document ID
   * @param {string} params.stageGroupItemId The stage-group-item ID
   * @param {string} params.itemDisplayName Display name for the item (optional)
   */
  async show({ projectDocumentId, stageGroupItemId, itemDisplayName }) {
    if (!projectDocumentId || !stageGroupItemId) {
      console.error("[DocumentItemHistoryModal] Missing required parameters:", {
        projectDocumentId,
        stageGroupItemId,
        itemDisplayName
      });
      
      // Show error message to user
      this.errorModal.show({
        title: "Error Opening History",
        message: "Cannot display history due to missing information. Please try selecting the item again.",
        details: `Missing: ${!projectDocumentId ? 'Project Document ID' : ''} ${!stageGroupItemId ? 'Item ID' : ''}`
      });
      return;
    }
    
    this.projectDocumentId = projectDocumentId;
    this.stageGroupItemId = stageGroupItemId;
    this.itemDisplayName = itemDisplayName || "Document Item";
    
    // Update the modal title with tooltip for long titles
    const titleEl = this.modalEl.querySelector("h2");
    const fullTitle = `History: ${this.itemDisplayName}`;
    
    // Truncate title if too long but show full title in tooltip
    if (fullTitle.length > 60) {
      titleEl.textContent = fullTitle.substring(0, 57) + '...';
      titleEl.title = fullTitle;
      titleEl.style.cursor = 'help';
    } else {
      titleEl.textContent = fullTitle;
      titleEl.title = '';
      titleEl.style.cursor = 'default';
    }
    
    // Reset state
    this.revisionSummaries = [];
    this.reconstructedRevision = null;
    this.selectedRevision = null;
    this.viewRevisionBtn.disabled = true;
    
    // Show the modal
    super.show();
    
    // Load the revision history
    await this.loadRevisionHistory();
  }


  async loadRevisionHistory() {
    // Show loading state
    this.revisionListBody.innerHTML = `
      <tr>
        <td colspan="4" class="loading-placeholder">
          <i class="fas fa-spinner fa-spin"></i> Loading revision history...
        </td>
      </tr>
    `;
    this.revisionDetailsEl.innerHTML = `
      <div class="loading-placeholder">
        Select a revision to view details
      </div>
    `;
    
    try {
      // Fetch revision history from the API
      const response = await fetchItemHistoryFromS3(
        this.projectDocumentId,
        this.stageGroupItemId
      );
      
      // Store the data
      this.revisionSummaries = response.revisionSummaries || [];
      this.reconstructedRevision = response.reconstructedRevision;
      
      console.log(`[DocumentItemHistoryModal] Loaded ${this.revisionSummaries.length} revision summaries`);
      
      // Update the revision list
      this.renderRevisionList();
      
      // If we have a reconstructed revision, show it
      if (this.reconstructedRevision) {
        this.renderRevisionDetails(this.reconstructedRevision);
        
        // Find and select the corresponding row
        const rows = this.revisionListBody.querySelectorAll("tr[data-revision]");
        rows.forEach(row => {
          const revision = parseInt(row.dataset.revision, 10);
          if (revision === this.revisionSummaries.length) {
            row.click(); // Simulate click on the last revision
          }
        });
      }
    } catch (err) {
      console.error("[DocumentItemHistoryModal] Error loading revision history:", err);
      this.revisionListBody.innerHTML = `
        <tr>
          <td colspan="4" class="error-placeholder">
            Error loading revision history: ${err.message}
          </td>
        </tr>
      `;
      this.errorModal.show({
        title: "Error Loading History",
        message: `Failed to load revision history: ${err.message}`
      });
    }
  }

  renderRevisionList() {
    if (!this.revisionSummaries || this.revisionSummaries.length === 0) {
      this.revisionListBody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-placeholder">
            No revision history found for this item. The item may be newly created or revisions are still being processed.
          </td>
        </tr>
      `;
      return;
    }
    
    // Create HTML for the revision list
    const rows = this.revisionSummaries.map(summary => {
      const timestamp = formatHumanReadableDate(summary.timestamp);
      return `
        <tr data-revision="${summary.revision}">
          <td>#${summary.revision}</td>
          <td>${timestamp}</td>
          <td>${summary.changedBy}</td>
          <td>${summary.changeDescription || "No description"}</td>
        </tr>
      `;
    }).join('');
    
    this.revisionListBody.innerHTML = rows;
  }

  renderRevisionDetails(revision) {
    if (!revision) {
      this.revisionDetailsEl.innerHTML = `
        <div class="loading-placeholder">
          Select a revision to view details
        </div>
      `;
      return;
    }
    
    // Create a section for metadata
    const timestamp = revision.modified_datetime 
      ? formatHumanReadableDate(revision.modified_datetime)
      : "Unknown";
    
    const metadataHtml = `
      <div class="history-metadata-section">
        <div class="history-metadata-title">Metadata</div>
        <div class="history-metadata-item">
          <div class="history-metadata-label">Last Modified:</div>
          <div class="history-metadata-value">${timestamp}</div>
        </div>
        <div class="history-metadata-item">
          <div class="history-metadata-label">Modified By:</div>
          <div class="history-metadata-value">${revision.modified_by || "Unknown"}</div>
        </div>
        <div class="history-metadata-item">
          <div class="history-metadata-label">Status:</div>
          <div class="history-metadata-value">${revision.status || "Unknown"}</div>
        </div>
        <div class="history-metadata-item">
          <div class="history-metadata-label">Owner:</div>
          <div class="history-metadata-value">${revision.owner_username || "Unknown"}</div>
        </div>
      </div>
    `;
    
    // Create HTML for each field
    const fieldsToDisplay = [
      { key: 'question_id', label: 'Question ID' },
      { key: 'question_text', label: 'Question' },
      { key: 'guidance', label: 'Guidance' },
      { key: 'answer_text', label: 'Answer' },
      { key: 'module', label: 'Module' },
      { key: 'risk_rating', label: 'Risk Rating' },
      { key: 'completeness', label: 'Completeness' },
      { key: 'notes', label: 'Notes' },
      { key: 'item_data', label: 'Item Data' }
    ];
    
    const fieldsHtml = fieldsToDisplay.map(field => {
      const value = revision[field.key];
      const displayValue = value !== undefined && value !== null && value !== "" 
        ? String(value)
        : `<span class="empty-value">No ${field.label}</span>`;
      
      return `
        <div class="revision-detail-field">
          <div class="history-metadata-label">${field.label}:</div>
          <div class="history-metadata-value">${displayValue}</div>
        </div>
      `;
    }).join('');
    
    this.revisionDetailsEl.innerHTML = metadataHtml + fieldsHtml;
  }

  async loadSelectedRevision() {
    if (!this.selectedRevision) {
      return;
    }
    
    // Show loading state
    this.revisionDetailsEl.innerHTML = `
      <div class="loading-placeholder">
        <i class="fas fa-spinner fa-spin"></i> Loading revision #${this.selectedRevision}...
      </div>
    `;
    
    try {
      // Fetch the specific revision
      const response = await fetchItemHistoryFromS3(
        this.projectDocumentId,
        this.stageGroupItemId,
        this.selectedRevision
      );
      
      // Render the reconstructed revision
      if (response.reconstructedRevision) {
        this.renderRevisionDetails(response.reconstructedRevision);
      } else {
        this.revisionDetailsEl.innerHTML = `
          <div class="error-placeholder">
            Could not reconstruct revision #${this.selectedRevision}
          </div>
        `;
      }
    } catch (err) {
      console.error("[DocumentItemHistoryModal] Error loading revision:", err);
      this.revisionDetailsEl.innerHTML = `
        <div class="error-placeholder">
          Error loading revision #${this.selectedRevision}: ${err.message}
        </div>
      `;
      this.errorModal.show({
        title: "Error Loading Revision",
        message: `Failed to load revision #${this.selectedRevision}: ${err.message}`
      });
    }
  }
}