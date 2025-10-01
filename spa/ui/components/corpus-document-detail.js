// ui/components/corpus-document-detail.js
import { 
  formatDate, 
  formatFileSize, 
  getFileIconClass, 
  escapeHtml, 
  extractRealFilename 
} from '../../utils/corpus-utils.js';
import formatHumanReadableDate from '../../utils/date-utils.js';

/**
 * Displays detailed information about a selected document with tabbed interface
 */
export class CorpusDocumentDetail {
  /**
   * @param {Object} options Configuration options
   * @param {HTMLElement} options.container Element to render into
   * @param {Function} options.onActionClick Callback when action button is clicked
   * @param {string} options.viewMode View context: 'browse-view' or 'approvals-view'
   * @param {Function} options.onTabChange Optional callback when tab is changed
   * @param {boolean} options.includeReviewerNote Whether to include reviewer note textarea (for approvals)
   */
  constructor(options) {
    this.container = options.container;
    this.onActionClick = options.onActionClick || (() => {});
    this.onTabChange = options.onTabChange || (() => {});
    this.viewMode = options.viewMode || 'browse-view';
    this.includeReviewerNote = options.includeReviewerNote || false;
    
    this.document = null;
    this.security = null;
    this.activeTab = 'preview'; // Default tab
    this.diffContent = null;
    this.diffLoaded = false;
    this.showDiffHighlights = true;
  }
  
  /**
   * Updates the displayed document
   * @param {Object} document Document to display
   * @param {Object} security Security permissions for action availability
   */
  setDocument(document, security) {
    this.document = document;
    this.security = security;
    this.activeTab = 'preview'; // Reset to preview tab when document changes
    this.diffLoaded = false;    // Reset diff state
    this.render();
  }
  
  /**
   * Clears the detail view
   */
  clear() {
    this.document = null;
    this.diffLoaded = false;
    if (this.container) {
      this.container.innerHTML = `
        <div class="detail-pane-placeholder">
          <p>Select a document to view details</p>
        </div>
      `;
    }
  }
  
  /**
   * Renders the component
   */
  render() {
    if (!this.container) return;
    
    if (!this.document) {
      this.clear();
      return;
    }

    // Normalize document fields to handle different API response formats
    const doc = this.normalizeDocumentFields(this.document);
    
    this.container.innerHTML = `
      <div class="document-detail">
        <!-- Header with icon, name, and status -->
        <div class="document-detail-header">
          <h3 class="detail-heading">
            <i class="fas ${getFileIconClass(this.getFileExtension(doc))}"></i> 
            ${extractRealFilename(doc.documentName || '') || 'Document'}
          </h3>
          <div class="document-status">
            <span class="status-pill ${this.getStatusClass(doc.status)}">${this.formatStatus(doc.status)}</span>
          </div>
        </div>
        
        <!-- Action buttons at the top -->
        <div class="document-actions">
          ${this.renderActionButtons(doc)}
        </div>
        
        ${this.includeReviewerNote ? `
          <!-- Reviewer note (only in approvals view) -->
          <div class="reviewer-note">
            <label for="reviewerNote">Reviewer note ${this.canApproveDocument() ? '(required if rejecting)' : ''}</label>
            <div>
              <textarea id="reviewerNote" ${!this.canApproveDocument() ? 'disabled' : ''}></textarea>
            </div>
          </div>
        ` : ''}
        
        <!-- Metadata grid -->
        <div class="document-metadata-grid">
          ${this.renderMetadataGrid(doc)}
        </div>
        
        <!-- Tabbed content -->
        <div class="document-tabs-container">
          <div class="document-preview-tabs">
            <button class="tab-button ${this.activeTab === 'preview' ? 'active' : ''}" data-tab="preview">
              Preview
            </button>
            ${this.viewMode === 'approvals-view' ? `
              <button class="tab-button ${this.activeTab === 'changes' ? 'active' : ''}" data-tab="changes">
                Changes
              </button>
            ` : ''}
            ${doc.aiMetrics ? `
              <button class="tab-button ${this.activeTab === 'metrics' ? 'active' : ''}" data-tab="metrics">
                AI Metrics
              </button>
            ` : ''}
            ${doc.approvalHistory && doc.approvalHistory.length > 0 ? `
              <button class="tab-button ${this.activeTab === 'history' ? 'active' : ''}" data-tab="history">
                History
              </button>
            ` : ''}
          </div>
          
          <div class="tab-content">
            <!-- Preview Tab -->
            <div id="preview-tab" class="tab-pane ${this.activeTab === 'preview' ? 'active' : ''}">
              ${this.renderPreviewTab(doc)}
            </div>
            
            <!-- Changes Tab (only in approvals view) -->
            ${this.viewMode === 'approvals-view' ? `
              <div id="changes-tab" class="tab-pane ${this.activeTab === 'changes' ? 'active' : ''}">
                ${this.activeTab === 'changes' ? this.renderChangesTab(doc) : ''}
              </div>
            ` : ''}
            
            <!-- AI Metrics Tab -->
            ${doc.aiMetrics ? `
              <div id="metrics-tab" class="tab-pane ${this.activeTab === 'metrics' ? 'active' : ''}">
                ${this.activeTab === 'metrics' ? this.renderMetricsTab(doc) : ''}
              </div>
            ` : ''}
            
            <!-- History Tab -->
            ${doc.approvalHistory && doc.approvalHistory.length > 0 ? `
              <div id="history-tab" class="tab-pane ${this.activeTab === 'history' ? 'active' : ''}">
                ${this.activeTab === 'history' ? this.renderHistoryTab(doc) : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }
  
  /**
   * Normalizes document fields to handle different API response formats
   */
  normalizeDocumentFields(doc) {
    if (!doc) return {};
    
    return {
      // Basic metadata
      documentKey: doc.documentKey || doc.document_key,
      documentName: doc.documentName || doc.name || this.getFileNameFromKey(doc.documentKey || doc.document_key || ''),
      content: doc.content,
      
      // Version info
      s3VersionId: doc.s3VersionId || doc.s3_version_id || doc.versionId || doc.version_id,
      versionId: doc.versionId || doc.version_id || doc.s3VersionId || doc.s3_version_id,
      
      // Content metadata
      contentType: doc.contentType || doc.content_type,
      size: doc.size,
      
      // Status
      status: doc.status || doc.documentStatus || 'UNKNOWN',
      currentReviewer: doc.currentReviewer || doc.current_reviewer,
      
      // Classification
      corpus: doc.corpus,
      topic: doc.topic || doc.documentTopic,
      type: doc.type || doc.documentType,
      
      // Timestamps
      lastModified: doc.lastModified || doc.modified_datetime || doc.modifiedDatetime,
      created: doc.created || doc.created_datetime || doc.createdDatetime,
      
      // Author
      author: doc.author,
      
      // Approval info
      aiMetrics: doc.aiMetrics || doc.ai_metrics,
      approvalHistory: doc.approvalHistory || doc.approval_history || [],
      tokenChangeRatio: doc.tokenChangeRatio || doc.token_change_ratio,
      currentApproverGroup: doc.currentApproverGroup || doc.current_approver_group,
      revisions: doc.revisions || 1,
      
      // Original reference - keep for compatibility
      _original: doc
    };
  }
  
  /**
   * Get file extension from document
   */
  getFileExtension(doc) {
    if (doc.documentName) {
      return doc.documentName.split('.').pop().toLowerCase();
    }
    
    // Try to extract from document key
    const documentKey = doc.documentKey || '';
    const keyParts = documentKey.split('/');
    const fileName = keyParts[keyParts.length - 1] || '';
    return fileName.split('.').pop().toLowerCase();
  }
  
  /**
   * Extract filename from document key
   */
  getFileNameFromKey(documentKey) {
    if (!documentKey) return 'Unknown';
    const parts = documentKey.split('/');
    return parts[parts.length - 1] || 'Unknown';
  }
  
  /**
   * Renders action buttons based on document state and view mode
   */
  renderActionButtons(doc) {
    // Common actions for all views
    const commonActions = `
      <button class="btn btn--secondary" data-action="download" data-document-key="${doc.documentKey}">
        <i class="fas fa-download"></i>
      </button>
      
      <button class="btn btn--secondary" data-action="view-history" data-document-key="${doc.documentKey}">
        <i class="fas fa-history"></i>
      </button>
    `;
    
    // Browse view specific actions
    const browseActions = `
      ${this.canEditDocument() ? `
        <button class="btn btn--primary" data-action="edit" data-document-key="${doc.documentKey}">
          <i class="fas fa-edit"></i>
        </button>
      ` : ''}
      
      ${this.canSubmitForApproval() ? `
        <button class="btn btn--primary" data-action="submit-for-approval" data-document-key="${doc.documentKey}">
          <i class="fas fa-arrow-up"></i> Submit
        </button>
      ` : ''}
      
      ${this.canDeleteDocument() ? `
        <button class="btn btn--danger" data-action="delete" data-document-key="${doc.documentKey}">
          <i class="fas fa-trash"></i>
        </button>
      ` : ''}
    `;
    
    // Approval view specific actions
    const approvalActions = `
      ${this.canApproveDocument() ? `
        <button class="btn btn--success" data-action="approve" data-document-key="${doc.documentKey}">
          <i class="fas fa-check"></i> Approve
        </button>
        <button class="btn btn--danger" data-action="reject" data-document-key="${doc.documentKey}">
          <i class="fas fa-times"></i> Reject
        </button>
      ` : ''}
      
      ${doc.currentReviewer === this.getUsername() ? `
        <button class="btn btn--secondary" data-action="release" data-document-key="${doc.documentKey}">
          <i class="fas fa-undo"></i> Re-Queue
        </button>
      ` : ''}
    `;
    
    return `
      <div class="button-group">
        ${this.viewMode === 'approvals-view' ? approvalActions : browseActions}
        ${commonActions}
      </div>
    `;
  }
  
  /**
   * Gets the current username from store
   */
  getUsername() {
    try {
      // This assumes a store object is available in the parent component
      return this.document?._original?.store?.get?.('username') || '';
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Renders metadata grid
   */
  renderMetadataGrid(doc) {
    const tokenChangeRatio = doc.tokenChangeRatio !== undefined
      ? `${(doc.tokenChangeRatio * 100).toFixed(2)}%`
      : 'N/A';
    
    return `
      <div class="metadata-card">
        <div class="metadata-label">Topic</div>
        <div class="metadata-value">${doc.topic || '-'}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Type</div>
        <div class="metadata-value">${doc.type || '-'}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Size</div>
        <div class="metadata-value">${formatFileSize(doc.size)}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">${this.viewMode === 'approvals-view' ? 'Submitted' : 'Last Modified'}</div>
        <div class="metadata-value">${formatHumanReadableDate(doc.lastModified, true)}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">Author</div>
        <div class="metadata-value">${doc.author || '-'}</div>
      </div>
      <div class="metadata-card">
        <div class="metadata-label">${this.viewMode === 'approvals-view' ? 'Token Δ' : 'Revisions'}</div>
        <div class="metadata-value">${this.viewMode === 'approvals-view' ? tokenChangeRatio : doc.revisions}</div>
      </div>
      ${doc.currentApproverGroup ? `
        <div class="metadata-card">
          <div class="metadata-label">Approver Group</div>
          <div class="metadata-value">${doc.currentApproverGroup}</div>
        </div>
      ` : ''}
      ${doc.aiMetrics ? `
        <div class="metadata-card">
          <div class="metadata-label">AI Score</div>
          <div class="metadata-value">${doc.aiMetrics.overall_score}/100</div>
        </div>
      ` : ''}
    `;
  }
  
  /**
   * Renders the preview tab
   */
  renderPreviewTab(doc) {
    const fileExtension = this.getFileExtension(doc);
    
    if (['txt', 'md', 'html', 'csv'].includes(fileExtension)) {
      if (doc.content) {
        if (fileExtension === 'md') {
          // Use Marked.js to render markdown
          try {
            const renderedMarkdown = marked.parse(doc.content);
            return `<div class="markdown-preview">${renderedMarkdown}</div>`;
          } catch (error) {
            console.error('Error rendering markdown:', error);
            return `<pre class="text-preview">${escapeHtml(doc.content)}</pre>`;
          }
        } else if (fileExtension === 'html') {
          return `<iframe srcdoc="${escapeHtml(doc.content)}" class="html-preview"></iframe>`;
        } else if (fileExtension === 'csv') {
          return this.formatCSV(doc.content);
        } else {
          return `<pre class="text-preview">${escapeHtml(doc.content)}</pre>`;
        }
      } else {
        return `<p>Content preview not available. Click Download to view the document.</p>`;
      }
    } else {
      // Binary files preview
      return `
        <div class="binary-preview">
          <div class="file-icon">
            <i class="fas ${getFileIconClass(fileExtension)} fa-5x"></i>
          </div>
          <p>${doc.documentName || 'Document'}</p>
          <div class="file-size">${formatFileSize(doc.size)}</div>
        </div>
      `;
    }
  }
  
  /**
   * Renders the changes tab (diff view)
   */
  renderChangesTab(doc) {
    // Check if this is the first version (no previous version to compare with)
    const isFirstVersion = doc.tokenChangeRatio === 1.0;
    
    if (isFirstVersion) {
      return `
        <div class="info-message">
          <i class="fas fa-info-circle"></i>
          <p>This is the first version of this document. No previous version exists for comparison.</p>
        </div>
      `;
    }
    
    if (!this.diffLoaded) {
      // If diff not loaded yet, return a placeholder with toolbar
      return `
        <div class="diff-toolbar">
          <button id="toggle-diff-highlights" class="btn btn--sm">
            <i class="fas fa-highlighter"></i> ${this.showDiffHighlights ? 'Hide' : 'Show'} Highlights
          </button>
          <div class="diff-version-selector">
            <label for="diff-version-selector">Compare with:</label>
            <select id="diff-version-selector">
              <option value="lastApproved" selected>Last Approved Version</option>
              <option value="loading">Loading versions...</option>
            </select>
          </div>
          <a href="#" id="download-full-diff" class="diff-download-link">Download Full Diff</a>
        </div>
        <div class="diff-container">
          <div class="loading-state-corpus">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading diff...</div>
          </div>
        </div>
      `;
    }
    
    // Show the diff content if loaded
    return `
      <div class="diff-toolbar">
        <button id="toggle-diff-highlights" class="btn btn--sm">
          <i class="fas fa-highlighter"></i> ${this.showDiffHighlights ? 'Hide' : 'Show'} Highlights
        </button>
        <div class="diff-version-selector">
          <label for="diff-version-selector">Compare with:</label>
          <select id="diff-version-selector">
            <option value="lastApproved" selected>Last Approved Version</option>
            <!-- Version options would be populated dynamically -->
          </select>
        </div>
        <a href="#" id="download-full-diff" class="diff-download-link">Download Full Diff</a>
      </div>
      <div class="diff-container">
        <div class="diff-content ${this.showDiffHighlights ? '' : 'hide-highlights'}">
          ${this.diffContent || '<p>No differences detected.</p>'}
        </div>
      </div>
    `;
  }
  
  /**
   * Sets the diff content
   */
  setDiffContent(diffContent, diffStats = null) {
    this.diffContent = diffContent;
    this.diffLoaded = true;
    
    if (this.activeTab === 'changes') {
      this.render(); // Re-render to show updated diff
    }
  }
  
  /**
   * Renders the AI metrics tab
   */
  renderMetricsTab(doc) {
    if (!doc.aiMetrics) {
      return `
        <div class="info-message">
          <i class="fas fa-info-circle"></i>
          <p>AI metrics not available for this document.</p>
        </div>
      `;
    }
    
    const metrics = doc.aiMetrics;
    
    return `
      <div class="metrics-grid">
        <div class="metric-card ${this.getScoreClass(metrics.overall_score)}">
          <div class="metric-value">${metrics.overall_score}</div>
          <div class="metric-label">Overall Score</div>
        </div>
        <div class="metric-card ${this.getScoreClass(metrics.grammar_score)}">
          <div class="metric-value">${metrics.grammar_score}</div>
          <div class="metric-label">Grammar</div>
        </div>
        <div class="metric-card ${this.getScoreClass(metrics.spelling_score)}">
          <div class="metric-value">${metrics.spelling_score}</div>
          <div class="metric-label">Spelling</div>
        </div>
        <div class="metric-card ${this.getScoreClass(metrics.customer_centric_score)}">
          <div class="metric-value">${metrics.customer_centric_score}</div>
          <div class="metric-label">Customer-Centric</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.tone_balance_index}</div>
          <div class="metric-label">Tone Balance</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${(metrics.confidence * 100).toFixed(0)}</div>
          <div class="metric-label">Confidence</div>
        </div>
      </div>
      
      ${metrics.blocked ? `
        <div class="blocked-alert">
          <i class="fas fa-exclamation-triangle"></i>
          <span>Document contains blocked subtopics</span>
        </div>
      ` : ''}
      
      ${metrics.subtopic_breakdown && Object.keys(metrics.subtopic_breakdown).length > 0 ? `
        <div class="subtopic-breakdown">
          <h5>Subtopic Breakdown</h5>
          <ul>
            ${Object.entries(metrics.subtopic_breakdown)
              .map(([topic, coverage]) => 
                `<li>${topic}: ${(coverage * 100).toFixed(0)}%</li>`)
              .join('')}
          </ul>
        </div>
      ` : ''}
    `;
  }
  
  /**
   * Renders the history tab
   */
  renderHistoryTab(doc) {
    if (!doc.approvalHistory || doc.approvalHistory.length === 0) {
      return `
        <div class="info-message">
          <i class="fas fa-info-circle"></i>
          <p>No approval history available for this document.</p>
        </div>
      `;
    }
    
    return `
      <div class="history-timeline">
        ${doc.approvalHistory.map(entry => `
          <div class="timeline-entry">
            <div class="timeline-icon">
              <i class="fas ${this.getActionIcon(entry.action)}"></i>
            </div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="action-type">${this.formatAction(entry.action)}</span>
                <span class="action-actor">by ${entry.actor}</span>
                <span class="action-date">${formatDate(entry.ts)}</span>
              </div>
              ${entry.note ? `<div class="action-note">${entry.note}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  /**
   * Format CSV content as HTML table
   */
  formatCSV(csvContent) {
    if (!csvContent) return '<p>Empty CSV file</p>';
    
    // Simple CSV parser
    const rows = csvContent.split('\n')
      .filter(row => row.trim().length > 0) // Remove empty rows
      .map(row => {
        // Handle quoted values with commas properly
        const result = [];
        let inQuotes = false;
        let currentValue = '';
        
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          
          if (char === '"' && (i === 0 || row[i-1] !== '\\')) {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(currentValue);
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        
        // Add the last value
        result.push(currentValue);
        return result;
      });
    
    if (rows.length === 0) return '<p>Empty CSV file</p>';
    
    // Create HTML table
    let tableHtml = '<div class="csv-table-container"><table class="csv-table">';
    
    // Add header row
    tableHtml += '<thead><tr>';
    rows[0].forEach(cell => {
      tableHtml += `<th>${escapeHtml(cell)}</th>`;
    });
    tableHtml += '</tr></thead>';
    
    // Add data rows
    tableHtml += '<tbody>';
    for (let i = 1; i < Math.min(rows.length, 100); i++) {
      tableHtml += '<tr>';
      
      // Fill in all columns, handling empty or missing cells
      for (let j = 0; j < rows[0].length; j++) {
        // Use empty string for undefined or null cells
        const cell = (j < rows[i].length) ? rows[i][j] : '';
        tableHtml += `<td>${escapeHtml(cell)}</td>`;
      }
      
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table></div>';
    
    return tableHtml;
  }

  /**
   * Attaches event listeners to interactive elements
   */
  attachEventListeners() {
    // Handle tab changes
    const tabButtons = this.container.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        this.switchTab(tab);
      });
    });
    
    // Handle action buttons
    const actionButtons = this.container.querySelectorAll('[data-action]');
    actionButtons.forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        const documentKey = button.dataset.documentKey;
        
        if (action && documentKey) {
          // Get reviewer note if present
          const noteTextarea = this.container.querySelector('#reviewerNote');
          const note = noteTextarea ? noteTextarea.value.trim() : '';
          
          // Pass action, documentKey, and note to the callback
          this.onActionClick(action, documentKey, this.document?.s3VersionId, note);
        }
      });
    });
    
    // Handle diff controls if present
    const diffToggle = this.container.querySelector('#toggle-diff-highlights');
    if (diffToggle) {
      diffToggle.addEventListener('click', () => {
        this.toggleDiffHighlights();
      });
    }
    
    // Handle metrics copy button
    const copyMetricsButton = this.container.querySelector('#copy-metrics-json');
    if (copyMetricsButton) {
      copyMetricsButton.addEventListener('click', () => {
        this.copyAIMetricsToClipboard();
      });
    }
  }
  
  /**
   * Switches the active tab
   */
  switchTab(tab) {
    if (this.activeTab === tab) return;
    
    this.activeTab = tab;

    // Reset diffLoaded when switching to the changes tab
    if (tab === 'changes' && this.selectedDocument) {
      if (this.diffNeedsRefresh) {
        this.diffLoaded = false;
        this.diffNeedsRefresh = false;
      }
      
      if (!this.diffLoaded) {
        this.loadDiff();
      }
    }
    
    // Notify parent of tab change
    this.onTabChange(tab);
    
    // Re-render to update tab content
    this.render();
  }
  
  /**
   * Toggles diff highlights
   */
  toggleDiffHighlights() {
    this.showDiffHighlights = !this.showDiffHighlights;
    
    // Update diff content visibility
    const diffContent = this.container.querySelector('.diff-content');
    if (diffContent) {
      diffContent.classList.toggle('hide-highlights', !this.showDiffHighlights);
    }
    
    // Update toggle button text
    const diffToggle = this.container.querySelector('#toggle-diff-highlights');
    if (diffToggle) {
      diffToggle.innerHTML = `<i class="fas fa-highlighter"></i> ${this.showDiffHighlights ? 'Hide' : 'Show'} Highlights`;
    }
  }
  
  /**
   * Copies AI metrics to clipboard
   */
  copyAIMetricsToClipboard() {
    if (!this.document?.aiMetrics) {
      alert('No AI metrics available to copy.');
      return;
    }
    
    try {
      const metricsJson = JSON.stringify(this.document.aiMetrics, null, 2);
      navigator.clipboard.writeText(metricsJson).then(() => {
        alert('AI metrics JSON copied to clipboard.');
      }).catch(err => {
        console.error('Error copying to clipboard:', err);
        alert('Failed to copy metrics to clipboard.');
      });
    } catch (error) {
      console.error('Error formatting metrics JSON:', error);
      alert('Failed to format metrics JSON.');
    }
  }
  
  /**
   * Gets CSS status class
   */
  getStatusClass(status) {
    if (!status) return '';
    
    // Normalize status to uppercase for consistent comparison
    const normalizedStatus = status.toUpperCase();
    
    const statusMapping = {
      'DRAFT': 'status-draft',
      'PENDING_AI': 'status-pending_ai',
      'PENDING_HUMAN': 'status-pending_human',
      'PENDING_HUMAN_IN_REVIEW': 'status-pending_human',
      'APPROVED': 'status-approved',
      'REJECTED': 'status-rejected',
      'DELETED': 'status-deleted'
    };
    
    return statusMapping[normalizedStatus] || '';
  }
  
  /**
   * Gets CSS class based on score value
   */
  getScoreClass(score) {
    if (score >= 90) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-average';
    return 'score-poor';
  }
  
  /**
   * Gets icon for action type
   */
  getActionIcon(action) {
    const iconMap = {
      'AI_REVIEW': 'fa-robot',
      'AI_APPROVE': 'fa-check-circle',
      'AI_REJECT': 'fa-times-circle',
      'AI_PASS_TO_HUMAN': 'fa-user-check',
      'APPROVED': 'fa-check',
      'REJECTED': 'fa-times',
      'SUBMITTED': 'fa-arrow-up',
      'DELETED': 'fa-trash'
    };
    
    return iconMap[action] || 'fa-circle';
  }
  
  /**
   * Formats action type for display
   */
  formatAction(action) {
    const actionMap = {
      'AI_REVIEW': 'AI Review',
      'AI_APPROVE': 'AI Approved',
      'AI_REJECT': 'AI Rejected',
      'AI_PASS_TO_HUMAN': 'Passed to Human',
      'APPROVED': 'Approved',
      'REJECTED': 'Rejected',
      'SUBMITTED': 'Submitted',
      'DELETED': 'Deleted'
    };
    
    return actionMap[action] || action;
  }
  
  /**
   * Formats document status for display
   */
  formatStatus(status) {
    if (!status) return 'Unknown';
    
    // Normalize status to uppercase for consistent comparison
    const normalizedStatus = status.toUpperCase();
    
    const statusMap = {
      'DRAFT': 'Draft',
      'PENDING_AI': 'Pending AI Review',
      'PENDING_HUMAN': 'Pending Approval',
      'PENDING_HUMAN_IN_REVIEW': 'Pending Approval',
      'APPROVED': 'Approved',
      'REJECTED': 'Rejected',
      'DELETED': 'Deleted',
      'UNKNOWN': 'Unknown'
    };
    
    return statusMap[normalizedStatus] || status;
  }
  
  /**
   * Checks if document can be edited
   */
  canEditDocument() {
    if (!this.document || !this.security) return false;
    
    const editableTypes = ['txt', 'md', 'html', 'csv'];
    const fileExtension = this.getFileExtension(this.document);
    const nonEditableStatuses = ['PENDING_AI', 'PENDING_HUMAN', 'PENDING_HUMAN_IN_REVIEW', 'DELETED'];
    const status = this.document.status || this.document.documentStatus || '';
    
    return editableTypes.includes(fileExtension) && 
           !nonEditableStatuses.includes(status.toUpperCase()) &&
           this.security.hasCorpusPermission(this.document.corpus || 'rfp', 'CORPUS_EDITOR');
  }
  
  /**
   * Checks if document can be deleted
   */
  canDeleteDocument() {
    if (!this.document || !this.security) return false;
    
    const status = (this.document.status || this.document.documentStatus || '').toUpperCase();
    
    return !['PENDING_AI', 'PENDING_HUMAN', 'PENDING_HUMAN_IN_REVIEW'].includes(status) &&
           this.security.hasCorpusPermission(this.document.corpus || 'rfp', 'CORPUS_EDITOR');
  }
  
  /**
   * Checks if document can be submitted for approval
   */
  canSubmitForApproval() {
    if (!this.document || !this.security) return false;
    
    const status = (this.document.status || this.document.documentStatus || '').toUpperCase();
    
    return (status === 'DRAFT' || status === 'REJECTED') &&
           this.security.hasCorpusPermission(this.document.corpus || 'rfp', 'CORPUS_EDITOR');
  }
  
  /**
   * Checks if document can be approved
   */
  canApproveDocument() {
    if (!this.document || !this.security || this.viewMode !== 'approvals-view') return false;
    
    // Check if the user has the DOCUMENT_APPROVER permission for this corpus
    const hasPermission = this.security.hasCorpusPermission(
      this.document.corpus || 'rfp',
      'DOCUMENT_APPROVER'
    );
    
    // Document must be in PENDING_HUMAN status
    const status = (this.document.status || this.document.documentStatus || '').toUpperCase();
    const isPending = status === 'PENDING_HUMAN' || status === 'PENDING_HUMAN_IN_REVIEW';
    
    return hasPermission && isPending;
  }
}