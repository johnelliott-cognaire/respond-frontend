// File: ui/components/corpus-collapse-nav-button.js
export class CollapseNavButton {
    constructor(store) {
      this.store = store;
      this.isCollapsed = this.store.get("corpus.navCollapsed") || false;
      this.buttonEl = null;
      this._boundToggleCollapse = this.toggleCollapse.bind(this);
    }
  
    render() {
        const button = document.createElement('button');
        button.className = `nav-collapse-toggle ${this.isCollapsed ? 'collapsed' : ''}`;
        button.setAttribute('aria-label', this.isCollapsed ? 'Expand navigation' : 'Collapse navigation');
        button.setAttribute('title', this.isCollapsed ? 'Expand navigation' : 'Collapse navigation');
        
        // Always use the same icon - rotation will be handled by CSS
        button.innerHTML = `<i class="fas fa-angle-left"></i>`;
        
        this.buttonEl = button;
        this.attachEventListeners();
        
        return button;
      }
  
    attachEventListeners() {
      if (this.buttonEl) {
        // Make sure we don't add multiple listeners
        this.buttonEl.removeEventListener('click', this._boundToggleCollapse);
        this.buttonEl.addEventListener('click', this._boundToggleCollapse);
      }
    }
  
    toggleCollapse(event) {
        // Prevent event from bubbling
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        
        this.isCollapsed = !this.isCollapsed;
        
        // Update store
        this.store.set("corpus.navCollapsed", this.isCollapsed);
        
        // Update button appearance - just toggle the class
        if (this.buttonEl) {
          this.buttonEl.classList.toggle('collapsed');
          this.buttonEl.setAttribute('aria-label', this.isCollapsed ? 'Expand navigation' : 'Collapse navigation');
          this.buttonEl.setAttribute('title', this.isCollapsed ? 'Expand navigation' : 'Collapse navigation');
          
          // No need to change the icon - CSS handles rotation
        }
        
        // Toggle collapsed class on parent container
        const container = document.querySelector('.corpus-manager-container');
        if (container) {
          container.classList.toggle('nav-collapsed', this.isCollapsed);
        }
      }
    
    destroy() {
      if (this.buttonEl) {
        this.buttonEl.removeEventListener('click', this._boundToggleCollapse);
      }
    }
  }