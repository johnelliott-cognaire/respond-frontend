// ui/components/corpus-document-list.js
import { 
    getFileIconClass, 
    getFolderIconClass, 
    getFolderTypeName 
  } from '../../utils/corpus-utils.js';
  
  import formatHumanReadableDate from "../../utils/date-utils.js";
  import { ResponsiveTable } from './responsive-table.js';
  /**
   * Renders a list of folders and documents with support for selection and actions
   */
  export class CorpusDocumentList {
    /**
     * @param {Object} options Configuration options
     * @param {HTMLElement} options.container Element to render into
     * @param {Function} options.onFolderClick Callback when folder is clicked
     * @param {Function} options.onFolderDoubleClick Callback when folder is double-clicked
     * @param {Function} options.onDocumentClick Callback when document is clicked
     * @param {Function} options.onSortChange Callback when sort header is clicked
     * @param {string} options.sortField Current sort field
     * @param {string} options.sortDirection Current sort direction ('asc' or 'desc')
     */
    constructor(options) {
      this.container = options.container;
      this.onFolderClick = options.onFolderClick || (() => {});
      this.onFolderDoubleClick = options.onFolderDoubleClick || (() => {});
      this.onDocumentClick = options.onDocumentClick || (() => {});
      this.onSortChange = options.onSortChange || (() => {});
      this.sortField = options.sortField || 'name';
      this.sortDirection = options.sortDirection || 'asc';
      
      this.folders = [];
      this.documents = [];
      this.selectedFolderPath = null;
      this.selectedDocumentKey = null;
      
      // Responsive table component
      this.responsiveTable = null;
    }
    
    /**
     * Sets the data to display
     * @param {Object[]} folders Array of folder objects
     * @param {Object[]} documents Array of document objects
     * @param {string} selectedFolderPath Currently selected folder path
     * @param {string} selectedDocumentKey Currently selected document key
     */
    setData(folders, documents, selectedFolderPath, selectedDocumentKey) {
      // Store current scroll position
      const scrollPosition = this.container?.scrollTop || 0;
      
      this.folders = folders || [];
      this.documents = documents || [];
      this.selectedFolderPath = selectedFolderPath;
      this.selectedDocumentKey = selectedDocumentKey;
      
      this.render();
      
      // Restore scroll position after rendering
      if (this.container) {
        this.container.scrollTop = scrollPosition;
      }
    }
    
    
    /**
     * Renders the component using responsive table
     */
    render() {
      if (!this.container) return;
      
      // Initialize responsive table if not already done
      if (!this.responsiveTable) {
        this.responsiveTable = new ResponsiveTable({
          selectable: false,
          sortable: true,
          emptyMessage: 'No items in this location.',
          className: 'responsive-table corpus-list',
          onSort: (field, direction) => {
            this.sortField = field;
            this.sortDirection = direction;
            this.onSortChange(field, direction);
          },
          onRowClick: (item, index, event) => {
            if (item.type === 'folder') {
              // Handle folder clicks
              if (event.detail === 2) { // Double click
                this.onFolderDoubleClick(item.path, item.folderType);
              } else {
                this.onFolderClick(item.path, item.folderType);
              }
            } else {
              // Handle document clicks
              this.onDocumentClick(item.key);
            }
          }
        });
        
        this.responsiveTable.attachToDOM(this.container);
        this.responsiveTable.setColumns(this.getTableColumns());
      }
      
      // Prepare data for the table
      const tableData = this.prepareTableData();
      this.responsiveTable.setData(tableData);
      
      // Update selection
      this.updateSelection();
    }
    
    /**
     * Get table columns for responsive table
     */
    getTableColumns() {
      // Default columns for browse view
      const baseColumns = [
        {
          key: 'name',
          label: 'Name',
          primary: true,
          sortable: true,
          render: (value, item) => {
            if (item.type === 'folder') {
              const icon = getFolderIconClass(item.folderType);
              return `<i class="${icon} folder-icon"></i><span>${this.escapeHtml(value)}</span>`;
            } else {
              const icon = getFileIconClass(item.name);
              return `<i class="${icon} file-icon"></i><span>${this.escapeHtml(value)}</span>`;
            }
          }
        },
        {
          key: 'topic',
          label: 'Topic',
          sortable: true,
          render: (value) => {
            return value ? this.escapeHtml(value) : '<span class="text-muted">—</span>';
          }
        },
        {
          key: 'type',
          label: 'Type',
          sortable: true,
          render: (value, item) => {
            if (item.type === 'folder') {
              return getFolderTypeName(item.folderType);
            }
            return value ? this.escapeHtml(value) : '<span class="text-muted">—</span>';
          }
        },
        {
          key: 'lastModified',
          label: 'Last Modified',
          sortable: true,
          secondary: true,
          type: 'date'
        },
        {
          key: 'status',
          label: 'Status',
          sortable: true,
          type: 'status'
        }
      ];
      
      // Add approval-specific columns if we have documents with approval data
      if (this.documents.some(doc => doc.corpus || doc.author || doc.aiScore !== undefined)) {
        return [
          {
            key: 'name',
            label: 'Name',
            primary: true,
            sortable: true,
            render: (value, item) => {
              const icon = getFileIconClass(item.name);
              return `<i class="${icon} file-icon"></i><span>${this.escapeHtml(value)}</span>`;
            }
          },
          {
            key: 'corpus',
            label: 'Corpus',
            sortable: true,
            render: (value) => {
              return value ? this.escapeHtml(value) : '<span class="text-muted">—</span>';
            }
          },
          {
            key: 'topic',
            label: 'Topic',
            sortable: true,
            render: (value) => {
              return value ? this.escapeHtml(value) : '<span class="text-muted">—</span>';
            }
          },
          {
            key: 'type',
            label: 'Type',
            sortable: true,
            render: (value) => {
              return value ? this.escapeHtml(value) : '<span class="text-muted">—</span>';
            }
          },
          {
            key: 'lastModified',
            label: 'Submitted',
            sortable: true,
            secondary: true,
            type: 'date'
          },
          {
            key: 'author',
            label: 'Author',
            sortable: true,
            secondary: true,
            render: (value) => {
              return value ? this.escapeHtml(value) : '<span class="text-muted">—</span>';
            }
          },
          {
            key: 'aiScore',
            label: 'AI Score',
            sortable: true,
            secondary: true,
            render: (value) => {
              const score = value || 0;
              const scoreClass = score >= 85 ? 'ai-score-high' : (score <= 60 ? 'ai-score-low' : '');
              return `<span class="${scoreClass}">${score}</span>`;
            }
          },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            type: 'status',
            render: (value, item) => {
              const status = this.formatApprovalStatus(value, item.currentReviewer);
              const statusClass = this.getApprovalStatusClass(value, item.currentReviewer);
              return `<span class="status ${statusClass}">${status}</span>`;
            }
          }
        ];
      }
      
      return baseColumns;
    }
    
    /**
     * Prepare data for the responsive table
     */
    prepareTableData() {
      const data = [];
      
      // Add folders first
      this.folders.forEach(folder => {
        data.push({
          name: folder.name,
          type: 'folder',
          folderType: folder.type,
          path: folder.path,
          topic: null,
          lastModified: null,
          status: null
        });
      });
      
      // Add documents
      this.documents.forEach(doc => {
        data.push({
          name: doc.title || doc.name || doc.documentName,
          type: 'document',
          key: doc.key || doc.documentKey,
          topic: doc.topic,
          lastModified: doc.lastModified || doc.modifiedDatetime || doc.submitted,
          status: doc.status || doc.documentStatus,
          corpus: doc.corpus,
          author: doc.author,
          aiScore: doc.aiMetrics?.overall_score || doc.ai_metrics?.overall_score || 0,
          currentReviewer: doc.currentReviewer || doc.current_reviewer
        });
      });
      
      return data;
    }
    
    /**
     * Update selection styling
     */
    updateSelection() {
      if (!this.responsiveTable) return;
      
      const rows = this.responsiveTable.container.querySelectorAll('.responsive-table-row');
      rows.forEach((row, index) => {
        const item = this.responsiveTable.data[index];
        if (!item) return;
        
        const isSelected = (item.type === 'folder' && item.path === this.selectedFolderPath) ||
                          (item.type === 'document' && item.key === this.selectedDocumentKey);
        
        if (isSelected) {
          row.classList.add('selected');
        } else {
          row.classList.remove('selected');
        }
      });
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    /**
     * Renders the list contents (folders and documents)
     */
    renderContents() {
      if (this.folders.length === 0 && this.documents.length === 0) {
        return `
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <p>No items in this location.</p>
          </div>
        `;
      }
      
      let content = '';
      
      // Render folders
      this.folders.forEach(folder => {
        // Explicitly check folder path against selectedFolderPath for proper selection
        const isSelected = this.selectedFolderPath === folder.path;
        
        content += `
          <div class="file-browser-row ${isSelected ? 'selected' : ''}" 
               data-path="${folder.path}" 
               data-type="${folder.type}">
            <div class="file-name">
              <span class="file-icon folder-icon">
                <i class="fas ${getFolderIconClass(folder.type)}"></i>
              </span>
              <span class="file-name-text" title="${folder.name}">${folder.name}</span>
            </div>
            <div class="file-topic"></div>
            <div class="file-type">${getFolderTypeName(folder.type)}</div>
            <div class="file-edited"></div>
            <div class="file-status"></div>
          </div>
        `;
      });
      
      // Render documents
      this.documents.forEach(doc => {
        const isSelected = this.selectedDocumentKey === doc.documentKey;
        const fileExtension = doc.name.split('.').pop() || '';
        const lastModified = doc.lastModified ? formatHumanReadableDate(doc.lastModified, true) : '-';
        
        // Get the status - check multiple potential status fields
        // The Lambda returns the status as 'status', but we need to check all possible locations
        const status = doc.document_status || doc.status || 'UNKNOWN';
        
        content += `
          <div class="file-browser-row ${isSelected ? 'selected' : ''}" 
               data-document-key="${doc.documentKey}">
            <div class="file-name">
              <span class="file-icon">
                <i class="fas ${getFileIconClass(fileExtension)}"></i>
              </span>
              <span class="file-name-text" title="${doc.name}">${doc.name}</span>
            </div>
            <div class="file-topic" title="${doc.topic || '-'}">${doc.topic || '-'}</div>
            <div class="file-type" title="${doc.type || '-'}">${doc.type || '-'}</div>
            <div class="file-edited" title="${doc.lastModified ? formatHumanReadableDate(doc.lastModified, false) : '-'}">${lastModified}</div>
            <div class="file-status">
              <span class="status-pill ${this.getStatusClass(status)} status-${status.toLowerCase()}">
                ${this.formatStatus(status)}
              </span>
            </div>
          </div>
        `;
      });
      
      return content;
    }

    getStatusClass(status) {
      if (!status) return '';
      
      const statusMapping = {
        'DRAFT': '',  // Default styling
        'PENDING_AI': 'is-running',
        'PENDING_HUMAN': 'is-running',
        'APPROVED': 'is-completed',
        'REJECTED': 'is-failed',
        'DELETED': 'is-cancelled'
      };
      
      return statusMapping[status] || '';
    }
    
    /**
     * Formats document status for display
     */
    formatStatus(status) {
      const statusMap = {
        'DRAFT': 'Draft',
        'PENDING_AI': 'AI Review',
        'PENDING_HUMAN': 'Pending',
        'APPROVED': 'Approved',
        'REJECTED': 'Rejected',
        'DELETED': 'Deleted'
      };
      
      return statusMap[status] || status || 'Unknown';
    }
    
    /**
     * Formats approval status considering reviewer state
     */
    formatApprovalStatus(status, currentReviewer) {
      if (!status) return 'Unknown';
      
      const normalizedStatus = status.toUpperCase();
      
      if (normalizedStatus === 'PENDING_HUMAN' || normalizedStatus === 'PENDING_HUMAN_IN_REVIEW') {
        return currentReviewer ? 'In Review' : 'Waiting';
      }
      
      const statusMap = {
        'DRAFT': 'Draft',
        'PENDING_AI': 'AI Review',
        'PENDING_HUMAN': 'Pending',
        'PENDING_HUMAN_IN_REVIEW': 'Pending',
        'APPROVED': 'Approved',
        'REJECTED': 'Rejected',
        'DELETED': 'Deleted',
        'UNKNOWN': 'Unknown'
      };
      
      return statusMap[normalizedStatus] || status || 'Unknown';
    }
    
    /**
     * Gets approval status CSS class
     */
    getApprovalStatusClass(status, currentReviewer) {
      if (!status) return '';
      
      const normalizedStatus = status.toUpperCase();
      
      // Special handling for in-review state
      if (normalizedStatus === 'PENDING_HUMAN' && currentReviewer || normalizedStatus === 'PENDING_HUMAN_IN_REVIEW' && currentReviewer) {
        return 'status-in-review';
      }
      
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
     * Renders sort indicator for column header
     */
    renderSortIndicator(field) {
      if (this.sortField !== field) {
        return '';
      }
      
      return this.sortDirection === 'asc' 
        ? '<i class="fas fa-sort-up"></i>' 
        : '<i class="fas fa-sort-down"></i>';
    }
    
    /**
     * Attaches event listeners to the rendered elements
     */
    attachEventListeners() {
      const clearAllSelections = () => {
        this.container.querySelectorAll('.file-browser-row.selected').forEach(el => {
          el.classList.remove('selected');
        });
      };

      // Folder click
      const folderRows = this.container.querySelectorAll('.file-browser-row[data-path]');
      folderRows.forEach(row => {
        row.addEventListener('click', (e) => {
          // Remove selected class from all rows
          clearAllSelections();
          
          // Add selected class to this row
          row.classList.add('selected');
          
          const path = row.dataset.path;
          const type = row.dataset.type;
          this.onFolderClick(path, type);
          e.stopPropagation();
        });
        
        row.addEventListener('dblclick', (e) => {
          const path = row.dataset.path;
          const type = row.dataset.type;
          this.onFolderDoubleClick(path, type);
          e.stopPropagation();
        });
      });
      
      // Document click
      const documentRows = this.container.querySelectorAll('.file-browser-row[data-document-key]');
      documentRows.forEach(row => {
        row.addEventListener('click', (e) => {
          // Remove selected class from all rows
          clearAllSelections();
          
          // Add selected class to this row
          row.classList.add('selected');
          
          const documentKey = row.dataset.documentKey;
          this.onDocumentClick(documentKey);
          e.stopPropagation();
        });
      });
      
      // Sort headers
      const sortHeaders = this.container.querySelectorAll('.file-browser-header span[data-sort]');
      sortHeaders.forEach(header => {
        header.addEventListener('click', () => {
          const field = header.dataset.sort;
          
          if (field === this.sortField) {
            // Toggle direction
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            // New field
            this.sortField = field;
            this.sortDirection = 'asc';
          }
          
          this.onSortChange(this.sortField, this.sortDirection);
        });
      });
    }
    
    /**
     * Clean up component
     */
    destroy() {
      if (this.responsiveTable) {
        this.responsiveTable.destroy();
        this.responsiveTable = null;
      }
    }
  }