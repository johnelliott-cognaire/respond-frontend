// ui/components/flexible-table.js

/**
 * FlexibleTable - A GitHub-style responsive table component
 * 
 * Features:
 * - Flexbox-based layout for better responsiveness
 * - Resizable columns
 * - Sortable headers
 * - Tag/badge support
 * - Proper text overflow handling
 * - Selection support
 */
export class FlexibleTable {
  constructor(options = {}) {
    this.options = {
      selectable: false,
      sortable: true,
      resizable: true,
      emptyMessage: 'No data available',
      className: 'flexible-table',
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
   *   width?: string, 
   *   sortable?: boolean,
   *   type?: 'text'|'badge'|'custom',
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
   * Render table header
   */
  renderHeader() {
    if (!this.columns.length) return '';

    return `
      <div class="flexible-table-header">
        ${this.options.selectable ? '<div class="flexible-table-cell flexible-table-select"><input type="checkbox" class="select-all"></div>' : ''}
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
      <div class="flexible-table-cell flexible-table-header-cell ${sortable ? 'sortable' : ''}" 
           data-key="${column.key}"
           ${column.width ? `style="flex: 0 0 ${column.width}; max-width: ${column.width};"` : ''}>
        <div class="header-content">
          <span class="header-label">${column.label}</span>
          ${sortIcon}
        </div>
        ${this.options.resizable && column.resizable !== false ? '<div class="column-resizer"></div>' : ''}
      </div>
    `;
  }

  /**
   * Render table body
   */
  renderBody() {
    if (!this.data.length) {
      return `
        <div class="flexible-table-body">
          <div class="flexible-table-empty">
            ${this.options.emptyMessage}
          </div>
        </div>
      `;
    }

    return `
      <div class="flexible-table-body">
        ${this.data.map((row, index) => this.renderRow(row, index)).join('')}
      </div>
    `;
  }

  /**
   * Render individual row
   */
  renderRow(row, index) {
    const isSelected = this.selectedRows.has(index);
    
    return `
      <div class="flexible-table-row ${isSelected ? 'selected' : ''}" data-index="${index}">
        ${this.options.selectable ? `<div class="flexible-table-cell flexible-table-select"><input type="checkbox" class="row-select" ${isSelected ? 'checked' : ''}></div>` : ''}
        ${this.columns.map(column => this.renderCell(row, column, index)).join('')}
      </div>
    `;
  }

  /**
   * Render individual cell
   */
  renderCell(row, column, rowIndex) {
    const value = this.getCellValue(row, column);
    const content = this.renderCellContent(value, column, row, rowIndex);

    return `
      <div class="flexible-table-cell" 
           data-key="${column.key}"
           ${column.width ? `style="flex: 0 0 ${column.width}; max-width: ${column.width};"` : ''}>
        <div class="cell-content">
          ${content}
        </div>
      </div>
    `;
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
        return this.renderBadge(value, column);
      case 'boolean':
        return this.renderBoolean(value);
      case 'custom':
        return value || '';
      default:
        return this.escapeHtml(value?.toString() || '');
    }
  }

  /**
   * Render badge/tag style content
   */
  renderBadge(value, column) {
    if (!value) return '';
    
    if (Array.isArray(value)) {
      return value.map(item => `<span class="badge">${this.escapeHtml(item)}</span>`).join(' ');
    }
    
    return `<span class="badge">${this.escapeHtml(value)}</span>`;
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

    // Header click for sorting
    if (this.options.sortable) {
      const headerCells = this.container.querySelectorAll('.flexible-table-header-cell.sortable');
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
      const rows = this.container.querySelectorAll('.flexible-table-row');
      rows.forEach((row, index) => {
        const listener = (event) => {
          // Don't trigger row click if clicking on checkbox
          if (event.target.closest('.flexible-table-select')) return;
          this.onRowClick(this.data[index], index, event);
        };
        row.addEventListener('click', listener);
        this.eventListeners.push({ element: row, event: 'click', listener });
      });
    }

    // Column resizing
    if (this.options.resizable) {
      this.attachResizeListeners();
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
   * Attach column resize listeners
   */
  attachResizeListeners() {
    const resizers = this.container.querySelectorAll('.column-resizer');
    
    resizers.forEach((resizer, index) => {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;
      let column = null;

      const mouseDownListener = (e) => {
        isResizing = true;
        startX = e.clientX;
        column = resizer.parentElement;
        startWidth = parseInt(document.defaultView.getComputedStyle(column).width, 10);
        
        document.addEventListener('mousemove', mouseMoveListener);
        document.addEventListener('mouseup', mouseUpListener);
        
        e.preventDefault();
      };

      const mouseMoveListener = (e) => {
        if (!isResizing) return;
        
        const width = startWidth + e.clientX - startX;
        if (width > 50) { // Minimum column width
          column.style.flex = `0 0 ${width}px`;
          column.style.maxWidth = `${width}px`;
        }
      };

      const mouseUpListener = () => {
        isResizing = false;
        document.removeEventListener('mousemove', mouseMoveListener);
        document.removeEventListener('mouseup', mouseUpListener);
      };

      resizer.addEventListener('mousedown', mouseDownListener);
      this.eventListeners.push({ element: resizer, event: 'mousedown', listener: mouseDownListener });
    });
  }

  /**
   * Default local sorting implementation
   */
  sortData() {
    if (!this.sortField) return;

    this.data.sort((a, b) => {
      const aValue = this.getCellValue(a, { key: this.sortField });
      const bValue = this.getCellValue(b, { key: this.sortField });

      let comparison = 0;
      
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;
      
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
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
   * Update data without full re-render
   */
  updateData(data) {
    this.data = data || [];
    const tbody = this.container.querySelector('.flexible-table-body');
    if (tbody) {
      tbody.innerHTML = this.data.length 
        ? this.data.map((row, index) => this.renderRow(row, index)).join('')
        : `<div class="flexible-table-empty">${this.options.emptyMessage}</div>`;
      
      // Re-attach body event listeners
      this.removeBodyEventListeners();
      this.attachBodyEventListeners();
    }
  }

  /**
   * Remove body event listeners (for partial updates)
   */
  removeBodyEventListeners() {
    this.eventListeners = this.eventListeners.filter(({ element, event, listener }) => {
      if (element.closest && element.closest('.flexible-table-body')) {
        element.removeEventListener(event, listener);
        return false;
      }
      return true;
    });
  }

  /**
   * Re-attach body event listeners (for partial updates)
   */
  attachBodyEventListeners() {
    // This would re-attach only body-related listeners
    // Implementation would be similar to attachEventListeners but only for body elements
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    this.eventListeners.forEach(({ element, event, listener }) => {
      element.removeEventListener(event, listener);
    });
    this.eventListeners = [];
    
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}