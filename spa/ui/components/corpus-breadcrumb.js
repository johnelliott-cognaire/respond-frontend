// ui/components/corpus-breadcrumb.js

/**
 * Renders a breadcrumb navigation trail
 */
export class CorpusBreadcrumb {
    /**
     * @param {Object} options Configuration options
     * @param {HTMLElement} options.container Element to render into
     * @param {Array} options.breadcrumb Array of breadcrumb items
     * @param {Function} options.onHomeClick Callback when home icon is clicked
     * @param {Function} options.onBreadcrumbClick Callback when breadcrumb item is clicked
     */
    constructor(options) {
      this.container = options.container;
      this.breadcrumb = options.breadcrumb || [];
      this.onHomeClick = options.onHomeClick || (() => {});
      this.onBreadcrumbClick = options.onBreadcrumbClick || (() => {});
    }
    
    /**
     * Updates the breadcrumb trail
     * @param {Array} breadcrumb New breadcrumb items
     */
    setBreadcrumb(breadcrumb) {
      this.breadcrumb = breadcrumb || [];
      this.render();
    }
    
    /**
     * Renders the component
     */
    render() {
      if (!this.container) return;
      
      // Only show separator if there are breadcrumb items
      const hasBreadcrumbs = this.breadcrumb && this.breadcrumb.length > 0;
      
      this.container.innerHTML = `
        <div class="corpus-breadcrumb">
          <div class="home-icon" id="breadcrumb-home-icon" title="Back to Corpora">
            <i class="fas fa-home"></i>
          </div>
          ${hasBreadcrumbs ? '<span class="breadcrumb-separator">›</span>' : ''}
          <div class="breadcrumb-trail">
            ${this.renderBreadcrumbTrail()}
          </div>
        </div>
      `;
      
      this.attachEventListeners();
    }
    
    /**
     * Renders the breadcrumb trail items
     */
    renderBreadcrumbTrail() {
      if (!this.breadcrumb.length) {
        return ''; // No redundant "Corpus" label - home icon serves this purpose
      }
      
      return this.breadcrumb.map((item, index) => {
        // Format the name based on the type for better readability
        const displayName = this.formatBreadcrumbName(item.name, item.type);
        
        return `
          <span class="breadcrumb-item" data-path="${item.path}">${displayName}</span>
          ${index < this.breadcrumb.length - 1 ? '<span class="breadcrumb-separator">›</span>' : ''}
        `;
      }).join('');
    }
    
    /**
     * Format breadcrumb name based on type for better readability
     * @param {string} name - Raw name
     * @param {string} type - Type: 'corpus', 'domain', or 'unit'
     * @returns {string} Formatted name
     */
    formatBreadcrumbName(name, type) {
      if (!name) return '';
      
      // For corpus names, use as-is (they're already properly formatted)
      if (type === 'corpus') {
        return name;
      }
      
      // For domains and units, capitalize and format nicely
      return name
        .split(/[-_\s]+/) // Split on hyphens, underscores, or spaces
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    /**
     * Attaches event listeners
     */
    attachEventListeners() {
      // Home icon click
      const homeIcon = this.container.querySelector('#breadcrumb-home-icon');
      if (homeIcon) {
        homeIcon.addEventListener('click', () => {
          this.onHomeClick();
        });
      }
      
      // Breadcrumb item clicks
      const breadcrumbItems = this.container.querySelectorAll('.breadcrumb-item');
      breadcrumbItems.forEach(item => {
        item.addEventListener('click', () => {
          const path = item.dataset.path;
          if (path) {
            this.onBreadcrumbClick(path);
          }
        });
      });
    }
  }