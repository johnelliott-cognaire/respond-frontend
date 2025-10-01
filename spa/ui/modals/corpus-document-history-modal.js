// ui/modals/corpus-document-history-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { 
  getCorpusDocumentDetails,
  listCorpusDocumentVersions
} from "../../api/corpus.js";
import formatHumanReadableDate from "../../utils/date-utils.js";
import { escapeHtml } from "../../utils/corpus-utils.js";

/**
 * CorpusDocumentHistoryModal
 * 
 * Shows revision history for a corpus document and allows
 * viewing specific revisions.
 */
export class CorpusDocumentHistoryModal extends AsyncFormModal {
  constructor() {
    super();
    this.errorModal = new ErrorModal();
    this.documentKey = null;
    this.displayName = null;
    this.versions = [];
    this.selectedVersion = null;
    
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
      <h2>Document Version History</h2>
      
      <div class="modal-section">
        <!-- Two-column layout -->
        <div class="flex gap-lg">
          <!-- Left side: Version list -->
          <div class="flex-1">
            <h3>Versions</h3>
            <div class="data-table-container">
              <table class="w-full">
                <thead>
                  <tr>
                    <th style="width: 20%">Version</th>
                    <th style="width: 25%">Date & Time</th>
                    <th style="width: 25%">Changed By</th>
                    <th style="width: 30%">Status</th>
                  </tr>
                </thead>
                <tbody id="versionListBody">
                  <tr>
                    <td colspan="4" class="loading-placeholder">Loading version history...</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="action-group action-group--right" style="margin-top: 1rem;">
              <button type="button" class="btn btn--primary" id="historyViewVersionBtn" disabled aria-label="View selected version">View Selected Version</button>
            </div>
          </div>
          
          <!-- Right side: Version details -->
          <div class="flex-1-5">
            <h3>Version Content</h3>
            <div class="data-table-container">
              <div id="versionContent" class="version-content">
                <div class="loading-placeholder">Select a version to view content</div>
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

    this.viewVersionBtn = this.modalEl.querySelector("#historyViewVersionBtn");
    this.viewVersionBtn.addEventListener("click", () => this.loadSelectedVersion());

    this.versionListBody = this.modalEl.querySelector("#versionListBody");
    this.versionContentEl = this.modalEl.querySelector("#versionContent");
    
    // Add click handler for version list
    this.versionListBody.addEventListener("click", (evt) => {
      const row = evt.target.closest("tr[data-version-id]");
      if (!row) return;
      
      // Remove active class from all rows
      const allRows = this.versionListBody.querySelectorAll("tr[data-version-id]");
      allRows.forEach(r => r.classList.remove("selected-row"));
      
      // Add active class to clicked row
      row.classList.add("selected-row");
      
      // Store selected version
      this.selectedVersion = row.dataset.versionId;
      
      // Enable view button
      this.viewVersionBtn.disabled = false;
    });
  }

  /**
   * Initialize and show the modal with a specific document
   * @param {Object} params Parameters for the modal
   * @param {string} params.documentKey The document key
   * @param {string} params.displayName Display name for the document (optional)
   */
  async show({ documentKey, displayName }) {
    if (!documentKey) {
      console.error("[CorpusDocumentHistoryModal] Missing required parameters");
      return;
    }
    
    this.documentKey = documentKey;
    this.displayName = displayName || documentKey.split('/').pop() || "Document";
    
    // Update the modal title
    const titleEl = this.modalEl.querySelector("h2");
    titleEl.textContent = `Version History: ${this.displayName}`;
    
    // Reset state
    this.versions = [];
    this.selectedVersion = null;
    this.viewVersionBtn.disabled = true;
    
    // Show the modal
    super.show();
    
    // Load the version history
    await this.loadVersionHistory();
  }

  async loadVersionHistory() {
    // Show loading state
    this.versionListBody.innerHTML = `
      <tr>
        <td colspan="4" class="loading-placeholder">
          <i class="fas fa-spinner fa-spin"></i> Loading version history...
        </td>
      </tr>
    `;
    this.versionContentEl.innerHTML = `
      <div class="loading-placeholder">
        Select a version to view content
      </div>
    `;
    
    try {
      // Use the new API function to get document versions
      const response = await listCorpusDocumentVersions({
        documentKey: this.documentKey
      });
      
      // Store the versions from the response
      this.versions = response.versions || [];
      
      // Update the version list
      this.renderVersionList();
      
      // If we have versions, try to select the latest one
      if (this.versions.length > 0) {
        // Find the latest version
        const latestVersion = this.versions.find(v => v.isLatest);
        
        if (latestVersion) {
          // Find and click the row for the latest version
          setTimeout(() => {
            const latestRow = this.versionListBody.querySelector(`tr[data-version-id="${latestVersion.versionId}"]`);
            if (latestRow) {
              latestRow.click();
            }
          }, 100);
        }
      }
    } catch (err) {
      console.error("[CorpusDocumentHistoryModal] Error loading version history:", err);
      this.versionListBody.innerHTML = `
        <tr>
          <td colspan="4" class="error-placeholder">
            Error loading version history: ${err.message}
          </td>
        </tr>
      `;
      this.errorModal.show({
        title: "Error Loading History",
        message: `Failed to load version history: ${err.message}`
      });
    }
  }

  renderVersionList() {
    if (!this.versions || this.versions.length === 0) {
      this.versionListBody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-placeholder">
            No version history found for this document
          </td>
        </tr>
      `;
      return;
    }
    
    // Create HTML for the version list
    const rows = this.versions.map((version, index) => {
      const versionNumber = this.versions.length - index; // Display as count-down
      const timestamp = version.timestamp || version.modified_datetime || version.created_datetime || 'Unknown';
      const formattedTimestamp = timestamp ? formatHumanReadableDate(timestamp) : 'Unknown';
      const author = version.author || version.modified_by || 'Unknown';
      const status = version.document_status || version.status || 'Unknown';
      
      return `
        <tr data-version-id="${version.versionId}" class="${version.isLatest ? 'current-version' : ''}">
          <td>${version.isLatest ? `#${versionNumber} (Current)` : `#${versionNumber}`}</td>
          <td>${formattedTimestamp}</td>
          <td>${author}</td>
          <td>
            <span class="status-pill status-${status.toLowerCase()}">
              ${status}
            </span>
          </td>
        </tr>
      `;
    }).join('');
    
    this.versionListBody.innerHTML = rows;
  }

  renderVersionContent(version) {
    if (!version || !version.content) {
      this.versionContentEl.innerHTML = `
        <div class="loading-placeholder">
          Select a version to view content
        </div>
      `;
      return;
    }
    
    // Create a section for metadata
    const timestamp = version.timestamp || version.modified_datetime || version.created_datetime;
    const formattedTimestamp = timestamp ? formatHumanReadableDate(timestamp) : "Unknown";
    
    const metadataHtml = `
      <div class="history-metadata-section">
        <div class="history-metadata-title">Version Info</div>
        <div class="history-metadata-item">
          <div class="history-metadata-label">Last Modified:</div>
          <div class="history-metadata-value">${formattedTimestamp}</div>
        </div>
        <div class="history-metadata-item">
          <div class="history-metadata-label">Modified By:</div>
          <div class="history-metadata-value">${version.author || version.modified_by || "Unknown"}</div>
        </div>
        <div class="history-metadata-item">
          <div class="history-metadata-label">Status:</div>
          <div class="history-metadata-value">
            <span class="status-pill status-${(version.document_status || version.status || '').toLowerCase()}">
              ${version.document_status || version.status || "Unknown"}
            </span>
          </div>
        </div>
      </div>
    `;
    
    // Content preview based on content type
    let contentHtml = '';
    
    const contentType = version.contentType || version.content_type || '';
    if (contentType.includes('markdown') || this.documentKey.endsWith('.md')) {
      // Render Markdown
      try {
        contentHtml = `
          <div class="content-preview markdown-preview">
            ${marked.parse(version.content)}
          </div>
        `;
      } catch (err) {
        contentHtml = `
          <div class="content-preview">
            <pre>${escapeHtml(version.content)}</pre>
          </div>
        `;
      }
    } else if (contentType.includes('html') || this.documentKey.endsWith('.html')) {
      // HTML preview in iframe
      contentHtml = `
        <div class="content-preview html-preview">
          <iframe srcdoc="${escapeHtml(version.content)}" style="width:100%; height:400px; border:1px solid #ccc;"></iframe>
        </div>
      `;
    } else if (contentType.includes('csv') || this.documentKey.endsWith('.csv')) {
      // Format CSV as table
      contentHtml = `
        <div class="content-preview csv-preview">
          ${this.formatCSV(version.content)}
        </div>
      `;
    } else {
      // Plain text
      contentHtml = `
        <div class="content-preview">
          <pre>${escapeHtml(version.content)}</pre>
        </div>
      `;
    }
    
    this.versionContentEl.innerHTML = metadataHtml + contentHtml;
  }

  formatCSV(csvContent) {
    if (!csvContent) return '<p>Empty CSV file</p>';
    
    // Simple CSV parser
    const rows = csvContent.split('\n')
      .filter(row => row.trim().length > 0) // Remove empty rows
      .map(row => row.split(','));
    
    if (rows.length === 0) return '<p>Empty CSV file</p>';
    
    // Create HTML table
    let tableHtml = '<table class="csv-table">';
    
    // Add header row
    tableHtml += '<thead><tr>';
    rows[0].forEach(cell => {
      tableHtml += `<th>${escapeHtml(cell)}</th>`;
    });
    tableHtml += '</tr></thead>';
    
    // Add data rows
    tableHtml += '<tbody>';
    for (let i = 1; i < Math.min(rows.length, 100); i++) { // Limit to 100 rows for performance
      tableHtml += '<tr>';
      rows[i].forEach((cell, j) => {
        // Ensure we don't exceed columns from header
        if (j < rows[0].length) {
          tableHtml += `<td>${escapeHtml(cell)}</td>`;
        }
      });
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';
    
    return tableHtml;
  }

  async loadSelectedVersion() {
    if (!this.selectedVersion) {
      return;
    }
    
    // Show loading state
    this.versionContentEl.innerHTML = `
      <div class="loading-placeholder">
        <i class="fas fa-spinner fa-spin"></i> Loading version content...
      </div>
    `;
    
    try {
      // Use getCorpusDocumentDetails to fetch the specific version
      const response = await getCorpusDocumentDetails({
        documentKey: this.documentKey,
        versionId: this.selectedVersion
      });
      
      // Render the content
      this.renderVersionContent({
        ...response,
        // Make sure we have consistent field names by mapping them
        document_status: response.status,
        modified_by: response.author,
        timestamp: response.lastModified,
        content_type: response.contentType
      });
    } catch (err) {
      console.error("[CorpusDocumentHistoryModal] Error loading version:", err);
      this.versionContentEl.innerHTML = `
        <div class="error-placeholder">
          Error loading version: ${err.message}
        </div>
      `;
      this.errorModal.show({
        title: "Error Loading Version",
        message: `Failed to load version: ${err.message}`
      });
    }
  }
}