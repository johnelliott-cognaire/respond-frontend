// ui/components/corpus-filters.js

import { clearAllCachesFor } from '../../utils/cache-utils.js';

/**
 * Component for rendering and handling filter controls
 */
export class CorpusFilters {
    /**
     * @param {Object} options Configuration options
     * @param {HTMLElement} options.container Element to render into
     * @param {Object} options.corpus Current corpus configuration
     * @param {Object} options.filters Current filter values
     * @param {Function} options.onFilterChange Callback when filters change
     * @param {Function} options.onResetFilters Callback when reset button is clicked
     */
    constructor(options) {
      this.container = options.container;
      this.corpus = options.corpus || {};
      this.filters = options.filters || {
        topic: '',
        type: '',
        status: '',
        myDrafts: false
      };
      this.onFilterChange = options.onFilterChange || (() => {});
      this.onResetFilters = options.onResetFilters || (() => {});
      this.onRefresh = options.onRefresh || (() => {});
    }
    
    /**
     * Updates the corpus configuration
     * @param {Object} corpus New corpus configuration
     */
    setCorpus(corpus) {
      this.corpus = corpus || {};
      this.render();
    }
    
    /**
     * Updates filter values
     * @param {Object} filters New filter values
     */
    setFilters(filters) {
      this.filters = { ...this.filters, ...filters };
      this.render();
    }
    
    /**
     * Renders the filter controls
     */
    render() {
      if (!this.container) return;
      
      // Sort topics and types alphabetically for better UX
      const topicChoices = [...(this.corpus.document_topics_choices || [])].sort();
      const typeChoices = [...(this.corpus.document_types_choices || [])].sort();
      
      const topicOptions = this.renderOptions(topicChoices, this.filters.topic);
      const typeOptions = this.renderOptions(typeChoices, this.filters.type);
      
      this.container.innerHTML = `
        <div class="corpus-filters-container">
          <div class="filter-group">
            <label for="filter-topic">Topic:</label>
            <select id="filter-topic" class="filter-select">
              <option value="">All Topics</option>
              ${topicOptions}
            </select>
          </div>
          
          <div class="filter-group">
            <label for="filter-type">Type:</label>
            <select id="filter-type" class="filter-select">
              <option value="">All Types</option>
              ${typeOptions}
            </select>
          </div>
          
          <div class="filter-group">
            <label for="filter-status">Status:</label>
            <select id="filter-status" class="filter-select">
              <option value="">All Statuses</option>
              <option value="DRAFT" ${this.filters.status === 'DRAFT' ? 'selected' : ''}>Draft</option>
              <option value="PENDING_AI" ${this.filters.status === 'PENDING_AI' ? 'selected' : ''}>Pending AI Review</option>
              <option value="PENDING_HUMAN" ${this.filters.status === 'PENDING_HUMAN' ? 'selected' : ''}>Pending Approval</option>
              <option value="APPROVED" ${this.filters.status === 'APPROVED' ? 'selected' : ''}>Approved</option>
              <option value="REJECTED" ${this.filters.status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
            </select>
          </div>
          
          <div class="filter-group filter-checkbox">
            <input type="checkbox" id="filter-my-drafts" ${this.filters.myDrafts ? 'checked' : ''}>
            <label for="filter-my-drafts">My Drafts</label>
          </div>
          
          <div class="filter-actions">
            <button id="reset-filters" class="btn btn--sm">
              <i class="fas fa-times"></i> Reset
            </button>
            <button id="refresh-documents" class="btn btn--sm">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
        </div>
      `;
      
      this.attachEventListeners();
    }
    
    /**
     * Renders option elements for a select
     * @param {string[]} options Array of option values
     * @param {string} selected Currently selected value
     * @returns {string} HTML for option elements
     */
    renderOptions(options, selected) {
      return (options || [])
        .map(option => `<option value="${option}" ${option === selected ? 'selected' : ''}>${option}</option>`)
        .join('');
    }
    
    /**
     * Attaches event listeners to the rendered controls
     */
    attachEventListeners() {
      const topicFilter = this.container.querySelector('#filter-topic');
      const typeFilter = this.container.querySelector('#filter-type');
      const statusFilter = this.container.querySelector('#filter-status');
      const myDraftsFilter = this.container.querySelector('#filter-my-drafts');
      const resetFilters = this.container.querySelector('#reset-filters');
      
      if (topicFilter) {
        topicFilter.addEventListener('change', () => {
          this.filters.topic = topicFilter.value;
          this.onFilterChange(this.filters);
        });
      }
      
      if (typeFilter) {
        typeFilter.addEventListener('change', () => {
          this.filters.type = typeFilter.value;
          this.onFilterChange(this.filters);
        });
      }
      
      if (statusFilter) {
        statusFilter.addEventListener('change', () => {
          this.filters.status = statusFilter.value;
          this.onFilterChange(this.filters);
        });
      }

      // refresh button event listener
      const refreshButton = this.container.querySelector('#refresh-documents');
      if (refreshButton) {
        refreshButton.addEventListener('click', () => {
          if (this.onRefresh) {

            // Clear all related caches
            clearAllCachesFor('corpus_config');

            this.onRefresh();
          }
        });
      }
      
      if (myDraftsFilter) {
        myDraftsFilter.addEventListener('change', () => {
          this.filters.myDrafts = myDraftsFilter.checked;
          
          // Auto-select DRAFT status when "My Drafts" is checked
          if (myDraftsFilter.checked && statusFilter) {
            statusFilter.value = 'DRAFT';
            statusFilter.disabled = true;
            this.filters.status = 'DRAFT';
          } else if (statusFilter) {
            statusFilter.disabled = false;
          }
          
          this.onFilterChange(this.filters);
        });
      }
      
      if (resetFilters) {
        resetFilters.addEventListener('click', () => {
          this.onResetFilters();
        });
      }
    }
  }