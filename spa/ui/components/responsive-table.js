// ui/components/responsive-table.js

/**
 * ResponsiveTable - GitHub Issues style responsive table component
 * 
 * Features:
 * - Card-based layout that works on narrow screens
 * - Content wraps to multiple lines as needed
 * - No fixed columns - content flows naturally
 * - Responsive design that adapts to screen size
 * - Sortable headers
 * - Selection support
 */
export class ResponsiveTable {
  constructor(options = {}) {
    this.options = {
      selectable: false,
      sortable: true,
      emptyMessage: 'No data available',
      className: 'responsive-table',
      ...options
    };

    this.container = null;
    this.data = [];
    this.columns = [];
    this.sortField = null;
    this.sortDirection = 'asc';
    this.selectedRows = new Set();
    this.eventListeners = [];

    // Callbacks
    this.onSort = options.onSort || null;
    this.onSelect = options.onSelect || null;
    this.onRowClick = options.onRowClick || null;
  }

  /**
   * Initialize the table in a container
   */
  attachToDOM(container) {
    this.container = container;
    this.render();
    return this;
  }

  /**
   * Set table data
   */
  setData(data) {
    this.data = data || [];
    this.render();
    return this;
  }

  /**
   * Set table columns
   * Column format: { 
   *   key: string, 
   *   label: string, 
   *   primary?: boolean, // Primary field gets emphasis
   *   secondary?: boolean, // Secondary fields are muted
   *   sortable?: boolean,
   *   type?: 'text'|'badge'|'status'|'date',
   *   render?: function
   * }
   */
  setColumns(columns) {
    this.columns = columns || [];
    this.render();
    return this;
  }

  /**
   * Main render method
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = this.getTemplate();
    this.attachEventListeners();
  }

  /**
   * Generate the table HTML template
   */
  getTemplate() {
    return `
      <div class="${this.options.className}">
        ${this.renderHeader()}
        ${this.renderBody()}
      </div>
    `;
  }

  /**
   * Render table header - only visible on larger screens
   */
  renderHeader() {
    if (!this.columns.length) return '';

    return `
      <div class="responsive-table-header">
        ${this.options.selectable ? '<div class="responsive-table-header-cell select-cell"><input type="checkbox" class="select-all"></div>' : ''}
        ${this.columns.map(column => this.renderHeaderCell(column)).join('')}
      </div>
    `;
  }

  /**
   * Render individual header cell
   */
  renderHeaderCell(column) {
    const sortable = this.options.sortable && (column.sortable !== false);
    const isSorted = this.sortField === column.key;
    const sortIcon = isSorted 
      ? (this.sortDirection === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>')
      : (sortable ? '<i class="fas fa-sort"></i>' : '');

    return `
      <div class="responsive-table-header-cell ${sortable ? 'sortable' : ''}" 
           data-key="${column.key}">
        <span class="header-label">${column.label}</span>
        ${sortIcon}
      </div>
    `;
  }

  /**
   * Render table body - card-based layout
   */
  renderBody() {
    if (!this.data.length) {
      return `
        <div class="responsive-table-body">
          <div class="responsive-table-empty">
            ${this.options.emptyMessage}
          </div>
        </div>
      `;
    }

    return `
      <div class="responsive-table-body">
        ${this.data.map((row, index) => this.renderRow(row, index)).join('')}
      </div>
    `;
  }

  /**
   * Render individual row as a card
   */
  renderRow(row, index) {
    const isSelected = this.selectedRows.has(index);
    
    return `
      <div class="responsive-table-row ${isSelected ? 'selected' : ''}" data-index="${index}">
        ${this.options.selectable ? `<div class="row-select-container"><input type="checkbox" class="row-select" ${isSelected ? 'checked' : ''}></div>` : ''}
        <div class="row-content">
          ${this.renderRowContent(row, index)}
        </div>
      </div>
    `;
  }

  /**
   * Render row content - primary field gets emphasis, others wrap naturally
   */
  renderRowContent(row, index) {
    const primaryColumn = this.columns.find(col => col.primary);
    const secondaryColumns = this.columns.filter(col => !col.primary);

    let content = '';

    // Primary field gets top billing
    if (primaryColumn) {
      const value = this.getCellValue(row, primaryColumn);
      const formattedValue = this.renderCellContent(value, primaryColumn, row, index);
      
      content += `
        <div class="row-primary">
          ${formattedValue}
        </div>
      `;
    }

    // Secondary fields wrap in a flexible layout
    if (secondaryColumns.length > 0) {
      content += '<div class="row-secondary">';
      
      secondaryColumns.forEach(column => {
        const value = this.getCellValue(row, column);
        const formattedValue = this.renderCellContent(value, column, row, index);
        
        if (formattedValue) { // Only show non-empty values
          const columnClass = column.className || '';
          const showLabel = column.showLabel !== false; // Default to true, hide only if explicitly false
          content += `
            <div class="row-field ${columnClass}">
              ${showLabel ? `<span class="field-label">${column.label}:</span>` : ''}
              <span class="field-value ${column.secondary ? 'muted' : ''}">${formattedValue}</span>
            </div>
          `;
        }
      });
      
      content += '</div>';
    }

    return content;
  }

  /**
   * Get cell value from row data
   */
  getCellValue(row, column) {
    const keys = column.key.split('.');
    let value = row;
    
    for (const key of keys) {
      value = value?.[key];
    }
    
    return value;
  }

  /**
   * Render cell content based on column type
   */
  renderCellContent(value, column, row, rowIndex) {
    // Custom render function
    if (column.render) {
      return column.render(value, row, rowIndex);
    }

    // Handle different column types
    switch (column.type) {
      case 'badge':
        return this.renderBadge(value);
      case 'status':
        return this.renderStatus(value);
      case 'date':
        return this.renderDate(value);
      case 'boolean':
        return this.renderBoolean(value);
      default:
        return this.escapeHtml(value?.toString() || '');
    }
  }

  /**
   * Render badge/tag style content
   */
  renderBadge(value) {
    if (!value) return '';
    
    if (Array.isArray(value)) {
      return value.map(item => `<span class="badge">${this.escapeHtml(item)}</span>`).join(' ');
    }
    
    return `<span class="badge">${this.escapeHtml(value)}</span>`;
  }

  /**
   * Render status with appropriate styling
   */
  renderStatus(value) {
    if (!value) return '';
    
    const statusClass = value.toLowerCase().replace(/\s+/g, '-');
    return `<span class="status status-${statusClass}">${this.escapeHtml(value)}</span>`;
  }

  /**
   * Render date in a human-friendly format
   */
  renderDate(value) {
    if (!value) return '';
    
    try {
      const date = new Date(value);
      return `<span class="date" title="${date.toLocaleString()}">${this.formatRelativeDate(date)}</span>`;
    } catch (e) {
      return this.escapeHtml(value);
    }
  }

  /**
   * Format date relative to now (like GitHub)
   */
  formatRelativeDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  /**
   * Render boolean as icon
   */
  renderBoolean(value) {
    return value 
      ? '<i class="fas fa-check text-success"></i>' 
      : '<i class="fas fa-times text-muted"></i>';
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
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.container) return;

    // Clear existing listeners
    this.clearEventListeners();

    // Header click for sorting
    if (this.options.sortable) {
      const headerCells = this.container.querySelectorAll('.responsive-table-header-cell.sortable');
      headerCells.forEach(cell => {
        const listener = () => this.handleSort(cell.dataset.key);
        cell.addEventListener('click', listener);
        this.eventListeners.push({ element: cell, event: 'click', listener });
      });
    }

    // Row selection
    if (this.options.selectable) {
      // Select all checkbox
      const selectAllCheckbox = this.container.querySelector('.select-all');
      if (selectAllCheckbox) {
        const listener = () => this.handleSelectAll(selectAllCheckbox.checked);
        selectAllCheckbox.addEventListener('change', listener);
        this.eventListeners.push({ element: selectAllCheckbox, event: 'change', listener });
      }

      // Individual row checkboxes
      const rowCheckboxes = this.container.querySelectorAll('.row-select');
      rowCheckboxes.forEach((checkbox, index) => {
        const listener = () => this.handleRowSelect(index, checkbox.checked);
        checkbox.addEventListener('change', listener);
        this.eventListeners.push({ element: checkbox, event: 'change', listener });
      });
    }

    // Row click events
    if (this.onRowClick) {
      const rows = this.container.querySelectorAll('.responsive-table-row');
      rows.forEach((row, index) => {
        const listener = (event) => {
          // Don't trigger row click if clicking on checkbox
          if (event.target.closest('.row-select-container')) return;
          this.onRowClick(this.data[index], index, event);
        };
        row.addEventListener('click', listener);
        this.eventListeners.push({ element: row, event: 'click', listener });
      });
    }
  }

  /**
   * Handle column sorting
   */
  handleSort(key) {
    if (this.sortField === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = key;
      this.sortDirection = 'asc';
    }

    if (this.onSort) {
      this.onSort(this.sortField, this.sortDirection);
    } else {
      // Default local sorting
      this.sortData();
      this.render();
    }
  }

  /**
   * Handle select all checkbox
   */
  handleSelectAll(checked) {
    if (checked) {
      this.data.forEach((_, index) => this.selectedRows.add(index));
    } else {
      this.selectedRows.clear();
    }
    
    this.render();
    
    if (this.onSelect) {
      this.onSelect(Array.from(this.selectedRows));
    }
  }

  /**
   * Handle individual row selection
   */
  handleRowSelect(index, checked) {
    if (checked) {
      this.selectedRows.add(index);
    } else {
      this.selectedRows.delete(index);
    }

    // Update select all checkbox state
    const selectAllCheckbox = this.container.querySelector('.select-all');
    if (selectAllCheckbox) {
      const allSelected = this.selectedRows.size === this.data.length;
      const someSelected = this.selectedRows.size > 0;
      
      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = someSelected && !allSelected;
    }

    if (this.onSelect) {
      this.onSelect(Array.from(this.selectedRows));
    }
  }

  /**
   * Default local sorting implementation
   */
  sortData() {
    if (!this.sortField) {
      console.warn('[ResponsiveTable] sortData called but no sortField set');
      return;
    }

    console.log(`[ResponsiveTable] Sorting by ${this.sortField} ${this.sortDirection}`);

    this.data.sort((a, b) => {
      const aValue = this.getCellValue(a, { key: this.sortField });
      const bValue = this.getCellValue(b, { key: this.sortField });

      console.log(`[ResponsiveTable] Comparing "${aValue}" vs "${bValue}"`);

      let comparison = 0;
      
      // Handle null/undefined values
      if (aValue == null && bValue == null) comparison = 0;
      else if (aValue == null) comparison = 1;
      else if (bValue == null) comparison = -1;
      else if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;
      
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });

    console.log(`[ResponsiveTable] Sorted data:`, this.data.map(item => ({
      [this.sortField]: this.getCellValue(item, { key: this.sortField })
    })));
  }

  /**
   * Get selected row data
   */
  getSelectedData() {
    return Array.from(this.selectedRows).map(index => this.data[index]);
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.selectedRows.clear();
    this.render();
  }

  /**
   * Clear event listeners
   */
  clearEventListeners() {
    this.eventListeners.forEach(({ element, event, listener }) => {
      element.removeEventListener(event, listener);
    });
    this.eventListeners = [];
  }

  /**
   * Clean up
   */
  destroy() {
    this.clearEventListeners();
    
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}