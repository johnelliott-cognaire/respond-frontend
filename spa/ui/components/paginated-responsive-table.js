// ui/components/paginated-responsive-table.js

import { ResponsiveTable } from './responsive-table.js';

/**
 * PaginatedResponsiveTable - Extends ResponsiveTable with pagination support
 * 
 * Features:
 * - All ResponsiveTable functionality (sorting, selection, responsive design)
 * - Server-side pagination with next/previous controls
 * - Loading states during data fetching
 * - Customizable page size
 * - Total count display
 * - Maintains backwards compatibility with ResponsiveTable
 */
export class PaginatedResponsiveTable extends ResponsiveTable {
  constructor(options = {}) {
    super(options);
    
    this.paginationOptions = {
      pageSize: 10,
      showPageSize: true,
      showTotal: true,
      showPageNumbers: false, // Keep simple for now
      showHeader: false, // ResponsiveTable is designed to be headerless by default
      loadingMessage: 'Loading...',
      ...options.pagination
    };

    this.sortOptions = {
      showSortControls: false, // Enable sort toolbar
      defaultSortField: null,
      defaultSortDirection: 'asc',
      sortLabel: 'Sort by',
      ...options.sort
    };

    // Pagination state
    this.currentPage = 1;
    this.totalItems = 0;
    this.hasNextPage = false;
    this.hasPreviousPage = false;
    this.isLoading = false;
    this.lastEvaluatedKey = null;
    
    // Callbacks
    this.onPageChange = options.onPageChange || null;
    this.onPageSizeChange = options.onPageSizeChange || null;

    // Initialize sort state
    this.sortField = this.sortOptions.defaultSortField;
    this.sortDirection = this.sortOptions.defaultSortDirection;
  }

  /**
   * Override getTemplate to include sort toolbar and pagination controls
   */
  getTemplate() {
    return `
      <div class="${this.options.className}">
        ${this.renderSortToolbar()}
        ${this.renderHeader()}
        ${this.renderBody()}
        ${this.renderPagination()}
      </div>
    `;
  }

  /**
   * Override render to add button state forcing after template update
   */
  render() {
    super.render();
    
    // Force correct button states after render completes
    setTimeout(() => {
      this.forceCorrectButtonState();
    }, 0);
  }

  /**
   * Render sort toolbar for responsive tables
   */
  renderSortToolbar() {
    if (!this.sortOptions.showSortControls || !this.columns.length) return '';

    const sortableColumns = this.columns.filter(col => col.sortable !== false);
    if (sortableColumns.length === 0) return '';

    const currentField = this.sortField || this.sortOptions.defaultSortField || sortableColumns[0].key;
    const currentDirection = this.sortDirection || this.sortOptions.defaultSortDirection;

    const currentFieldLabel = sortableColumns.find(col => col.key === currentField)?.label || sortableColumns[0]?.label;

    return `
      <div class="responsive-table-sort-toolbar">
        <div class="sort-toolbar-content">
          <span class="sort-label">${this.sortOptions.sortLabel}:</span>
          <div class="sort-controls">
            <div class="sort-field-dropdown-wrapper">
              <div class="sort-field-dropdown" id="sort-field-dropdown" aria-haspopup="listbox" aria-expanded="false" aria-label="Select sort field">
                <span id="selectedSortFieldLabel">${currentFieldLabel}</span>
                <i class="fas fa-caret-down" aria-hidden="true"></i>
              </div>
              <div class="sort-field-dropdown-options" id="sort-field-dropdown-options" role="listbox">
                ${sortableColumns.map(column => 
                  `<div class="sort-field-option ${currentField === column.key ? 'selected' : ''}" data-value="${column.key}" role="option" aria-selected="${currentField === column.key ? 'true' : 'false'}">${column.label}</div>`
                ).join('')}
              </div>
            </div>
            <button 
              type="button" 
              class="btn btn--subtle sort-direction-btn" 
              id="sort-direction-btn"
              aria-label="Toggle sort direction"
              title="${currentDirection === 'asc' ? 'Sort descending' : 'Sort ascending'}"
            >
              <i class="fas fa-sort-${currentDirection === 'asc' ? 'up' : 'down'}"></i>
              ${currentDirection === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Override renderHeader to conditionally show header
   */
  renderHeader() {
    if (!this.columns.length || !this.paginationOptions.showHeader) return '';

    const headerClass = this.paginationOptions.showHeader 
      ? 'responsive-table-header responsive-table-header--sticky'
      : 'responsive-table-header';

    return `
      <div class="${headerClass}">
        ${this.options.selectable ? '<div class="responsive-table-header-cell select-cell"><input type="checkbox" class="select-all"></div>' : ''}
        ${this.columns.map(column => this.renderHeaderCell(column)).join('')}
      </div>
    `;
  }

  /**
   * Override renderBody to show loading state
   */
  renderBody() {
    if (this.isLoading) {
      return `
        <div class="responsive-table-body">
          <div class="responsive-table-loading">
            <div class="loading-spinner"></div>
            <span>${this.paginationOptions.loadingMessage}</span>
          </div>
        </div>
      `;
    }

    return super.renderBody();
  }

  /**
   * Render pagination controls
   */
  renderPagination() {
    // Only show pagination if there are navigation options or we want to show info
    const hasNavigation = this.hasPreviousPage || this.hasNextPage;
    const showInfo = this.paginationOptions.showTotal || this.paginationOptions.showPageSize;
    
    if (!hasNavigation && !showInfo) {
      return '';
    }

    return `
      <div class="responsive-table-pagination">
        <div class="pagination-info">
          ${this.renderPageInfo()}
          ${this.renderPageSizeSelector()}
        </div>
        ${hasNavigation ? `<div class="pagination-controls">${this.renderPaginationButtons()}</div>` : ''}
      </div>
    `;
  }

  /**
   * Render page information
   */
  renderPageInfo() {
    if (!this.paginationOptions.showTotal) return '';

    const startItem = ((this.currentPage - 1) * this.paginationOptions.pageSize) + 1;
    const endItem = Math.min(startItem + this.data.length - 1, this.totalItems);
    
    if (this.totalItems === 0) {
      return '<span class="pagination-info-text">No items found</span>';
    }

    return `
      <span class="pagination-info-text">
        Showing ${startItem}-${endItem} of ${this.totalItems} items
      </span>
    `;
  }

  /**
   * Render page size selector
   */
  renderPageSizeSelector() {
    if (!this.paginationOptions.showPageSize) return '';

    const pageSizes = [5, 10, 20, 50];
    const options = pageSizes.map(size => 
      `<option value="${size}" ${size === this.paginationOptions.pageSize ? 'selected' : ''}>${size}</option>`
    ).join('');

    return `
      <div class="page-size-selector">
        <label for="page-size-select">Items per page:</label>
        <select id="page-size-select" class="page-size-select">
          ${options}
        </select>
      </div>
    `;
  }

  /**
   * Render pagination buttons
   */
  renderPaginationButtons() {
    // Force correct disabled state based on current page
    const prevDisabled = (this.currentPage <= 1) || this.isLoading;
    const nextDisabled = !this.hasNextPage || this.isLoading;
    
    console.log(`[PaginatedResponsiveTable] renderPaginationButtons: currentPage=${this.currentPage}, hasPrev=${this.hasPreviousPage}, hasNext=${this.hasNextPage}, prevDisabled=${prevDisabled}, nextDisabled=${nextDisabled}`);
    
    return `
      <div class="pagination-buttons">
        <button 
          class="btn btn--subtle pagination-btn" 
          id="prev-page-btn"
          ${prevDisabled ? 'disabled' : ''}
          aria-label="Previous page"
        >
          <i class="fas fa-chevron-left"></i>
          Previous
        </button>
        
        <button 
          class="btn btn--subtle pagination-btn" 
          id="next-page-btn"
          ${nextDisabled ? 'disabled' : ''}
          aria-label="Next page"
        >
          Next
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;
  }

  /**
   * Override attachEventListeners to include pagination and sort events
   */
  attachEventListeners() {
    super.attachEventListeners();

    if (!this.container) return;

    // Sort field dropdown
    const sortFieldDropdownWrapper = this.container.querySelector('.sort-field-dropdown-wrapper');
    const sortFieldDropdown = this.container.querySelector('#sort-field-dropdown');
    const sortFieldOptions = this.container.querySelector('#sort-field-dropdown-options');

    if (sortFieldDropdown && sortFieldOptions) {
      // Toggle dropdown
      const toggleListener = (e) => {
        e.stopPropagation();
        const isExpanded = sortFieldDropdownWrapper.classList.toggle('open');
        sortFieldDropdown.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      };
      sortFieldDropdown.addEventListener('click', toggleListener);
      this.eventListeners.push({ element: sortFieldDropdown, event: 'click', listener: toggleListener });

      // Close dropdown when clicking outside
      const outsideClickListener = () => {
        sortFieldDropdownWrapper.classList.remove('open');
        sortFieldDropdown.setAttribute('aria-expanded', 'false');
      };
      document.addEventListener('click', outsideClickListener);
      this.eventListeners.push({ element: document, event: 'click', listener: outsideClickListener });

      // Prevent closing when clicking inside dropdown
      const preventCloseListener = (e) => e.stopPropagation();
      sortFieldOptions.addEventListener('click', preventCloseListener);
      this.eventListeners.push({ element: sortFieldOptions, event: 'click', listener: preventCloseListener });

      // Handle option selection
      const fieldOptions = sortFieldOptions.querySelectorAll('.sort-field-option');
      fieldOptions.forEach(option => {
        const optionListener = () => {
          const newField = option.getAttribute('data-value');
          const newLabel = option.textContent.trim();

          // Update UI
          const selectedFieldLabel = sortFieldDropdown.querySelector('#selectedSortFieldLabel');
          if (selectedFieldLabel) {
            selectedFieldLabel.textContent = newLabel;
          }

          // Update ARIA attributes
          fieldOptions.forEach(opt => {
            opt.classList.remove('selected');
            opt.setAttribute('aria-selected', 'false');
          });
          option.classList.add('selected');
          option.setAttribute('aria-selected', 'true');

          // Handle sort change
          this.handleSortFieldChange(newField);

          // Close dropdown
          sortFieldDropdownWrapper.classList.remove('open');
          sortFieldDropdown.setAttribute('aria-expanded', 'false');
        };
        option.addEventListener('click', optionListener);
        this.eventListeners.push({ element: option, event: 'click', listener: optionListener });
      });
    }

    // Sort direction toggle
    const sortDirectionBtn = this.container.querySelector('#sort-direction-btn');
    if (sortDirectionBtn) {
      const listener = () => this.handleSortDirectionToggle();
      sortDirectionBtn.addEventListener('click', listener);
      this.eventListeners.push({ element: sortDirectionBtn, event: 'click', listener });
    }

    // Previous page button
    const prevBtn = this.container.querySelector('#prev-page-btn');
    if (prevBtn) {
      const listener = (event) => {
        console.log(`[PaginatedResponsiveTable] Previous button clicked: disabled=${prevBtn.disabled}, currentPage=${this.currentPage}`);
        if (this.currentPage <= 1 || prevBtn.disabled) {
          console.log(`[PaginatedResponsiveTable] Blocking previous page click - on page 1 or disabled`);
          event.preventDefault();
          event.stopPropagation();
          return false;
        }
        this.handlePreviousPage();
      };
      prevBtn.addEventListener('click', listener);
      this.eventListeners.push({ element: prevBtn, event: 'click', listener });
    }

    // Next page button
    const nextBtn = this.container.querySelector('#next-page-btn');
    if (nextBtn) {
      const listener = () => this.handleNextPage();
      nextBtn.addEventListener('click', listener);
      this.eventListeners.push({ element: nextBtn, event: 'click', listener });
    }

    // Page size selector
    const pageSizeSelect = this.container.querySelector('#page-size-select');
    if (pageSizeSelect) {
      const listener = (event) => this.handlePageSizeChange(parseInt(event.target.value));
      pageSizeSelect.addEventListener('change', listener);
      this.eventListeners.push({ element: pageSizeSelect, event: 'change', listener });
    }
  }

  /**
   * Handle previous page navigation
   */
  handlePreviousPage() {
    if (!this.hasPreviousPage || this.isLoading) return;

    if (this.onPageChange) {
      this.onPageChange('previous', {
        currentPage: this.currentPage,
        pageSize: this.paginationOptions.pageSize,
        lastEvaluatedKey: this.lastEvaluatedKey
      });
    }
  }

  /**
   * Handle next page navigation
   */
  handleNextPage() {
    if (!this.hasNextPage || this.isLoading) return;

    if (this.onPageChange) {
      this.onPageChange('next', {
        currentPage: this.currentPage,
        pageSize: this.paginationOptions.pageSize,
        lastEvaluatedKey: this.lastEvaluatedKey
      });
    }
  }

  /**
   * Handle page size change
   */
  handlePageSizeChange(newPageSize) {
    if (newPageSize === this.paginationOptions.pageSize) return;

    this.paginationOptions.pageSize = newPageSize;

    if (this.onPageSizeChange) {
      this.onPageSizeChange(newPageSize);
    }
  }

  /**
   * Handle sort field change from dropdown
   */
  handleSortFieldChange(newField) {
    if (this.sortField === newField) return;
    
    console.log(`[PaginatedResponsiveTable] Sort field changed to: ${newField}`);
    this.sortField = newField;
    this.sortDirection = this.sortOptions.defaultSortDirection;
    
    if (this.onSort) {
      this.onSort(this.sortField, this.sortDirection);
    } else {
      this.sortData();
    }
    
    // Always re-render to update the UI
    this.render();
  }

  /**
   * Handle sort direction toggle
   */
  handleSortDirectionToggle() {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    
    console.log(`[PaginatedResponsiveTable] Sort direction changed to: ${this.sortDirection}`);
    
    if (this.onSort) {
      this.onSort(this.sortField, this.sortDirection);
    } else {
      this.sortData();
    }
    
    // Always re-render to update the UI
    this.render();
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;
    this.render();
  }

  /**
   * Update pagination state
   */
  setPaginationState(paginationData) {
    this.currentPage = paginationData.currentPage || 1;
    this.totalItems = paginationData.totalItems || 0;
    this.hasNextPage = paginationData.hasNextPage === true;
    this.hasPreviousPage = paginationData.hasPreviousPage === true;
    this.lastEvaluatedKey = paginationData.lastEvaluatedKey || null;
    
    console.log(`[PaginatedResponsiveTable] setPaginationState called with:`, paginationData);
    console.log(`[PaginatedResponsiveTable] Set pagination state: hasNext: ${this.hasNextPage}, hasPrev: ${this.hasPreviousPage}`);
    console.trace(`[PaginatedResponsiveTable] setPaginationState call stack`);
    
    this.render();
    
    // FORCE correct disabled state immediately after render - multiple attempts to override any interference
    this.forceCorrectButtonState();
    
    // Force again with slight delay to override any async interference
    setTimeout(() => {
      this.forceCorrectButtonState();
    }, 10);
    
    // Force again with longer delay to catch any deferred operations
    setTimeout(() => {
      this.forceCorrectButtonState();
    }, 50);
    
    // Check actual DOM state after render
    setTimeout(() => {
      const prevBtn = this.container?.querySelector('#prev-page-btn');
      const nextBtn = this.container?.querySelector('#next-page-btn');
      if (prevBtn && nextBtn) {
        console.log(`[PaginatedResponsiveTable] DOM CHECK: prevBtn.disabled=${prevBtn.disabled}, nextBtn.disabled=${nextBtn.disabled}`);
        console.log(`[PaginatedResponsiveTable] DOM CHECK: prevBtn.hasAttribute('disabled')=${prevBtn.hasAttribute('disabled')}, nextBtn.hasAttribute('disabled')=${nextBtn.hasAttribute('disabled')}`);
      }
    }, 100);
  }

  /**
   * Force correct button disabled state - workaround for something overriding our disabled attributes
   */
  forceCorrectButtonState() {
    if (!this.container) return;
    
    const prevBtn = this.container.querySelector('#prev-page-btn');
    const nextBtn = this.container.querySelector('#next-page-btn');
    
    if (prevBtn) {
      const shouldDisable = (this.currentPage <= 1) || this.isLoading;
      prevBtn.disabled = shouldDisable;
      if (shouldDisable) {
        prevBtn.setAttribute('disabled', 'disabled');
      } else {
        prevBtn.removeAttribute('disabled');
      }
      console.log(`[PaginatedResponsiveTable] FORCED prevBtn disabled to: ${shouldDisable}`);
    }
    
    if (nextBtn) {
      const shouldDisable = !this.hasNextPage || this.isLoading;
      nextBtn.disabled = shouldDisable;
      if (shouldDisable) {
        nextBtn.setAttribute('disabled', 'disabled');
      } else {
        nextBtn.removeAttribute('disabled');
      }
      console.log(`[PaginatedResponsiveTable] FORCED nextBtn disabled to: ${shouldDisable}`);
    }
  }

  /**
   * Update row selection states
   */
  updateRowSelection(selectedIndex = -1) {
    if (!this.container) return;
    
    const rows = this.container.querySelectorAll('.responsive-table-row');
    rows.forEach((row, index) => {
      if (index === selectedIndex) {
        row.classList.add('selected');
      } else {
        row.classList.remove('selected');
      }
    });
  }

  /**
   * Set both data and pagination state together
   */
  setDataWithPagination(data, paginationData) {
    this.data = data || [];
    this.setPaginationState(paginationData);
  }

  /**
   * Get current pagination state
   */
  getPaginationState() {
    return {
      currentPage: this.currentPage,
      pageSize: this.paginationOptions.pageSize,
      totalItems: this.totalItems,
      hasNextPage: this.hasNextPage,
      hasPreviousPage: this.hasPreviousPage,
      lastEvaluatedKey: this.lastEvaluatedKey,
      isLoading: this.isLoading
    };
  }

  /**
   * Reset pagination to first page
   */
  resetPagination() {
    this.currentPage = 1;
    this.hasNextPage = false;
    this.hasPreviousPage = false;
    this.lastEvaluatedKey = null;
    this.totalItems = 0;
    this.render();
  }
}