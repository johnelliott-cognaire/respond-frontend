// File: ui/views/corpus/corpus-view-base.js
export class CorpusViewBase {
    constructor(store, jobController) {
        this.store = store;
        this.jobController = jobController;
        this.containerEl = null;
        this._listeners = [];
    }

    /**
     * Called by CorpusManager to render this view
     * @param {HTMLElement} containerEl - The container element to render into
     */
    render(containerEl) {
        // Store the container reference
        if (containerEl) {
          this.containerEl = containerEl;
        }
        
        // Check if containerEl exists before trying to render
        if (!this.containerEl) {
          console.warn('Cannot render view: containerEl is not defined');
          return; // Exit early if no container
        }
        
        // Create standardized view structure
        this.containerEl.innerHTML = `
          ${this.renderHeader()}
          ${this.renderContent()}
          ${this.renderFooter()}
        `;
    
        // Attach event listeners after rendering
        this.attachEventListeners();
    }

    /**
     * Override in child classes for custom header content
     */
    renderHeader() {
        return '';
    }

    /**
     * Override in child classes for main content
     */
    renderContent() {
        throw new Error('renderContent() must be implemented by child class');
    }

    /**
     * Override in child classes for custom footer content
     */
    renderFooter() {
        return '';
    }

    /**
     * Override in child classes to attach event listeners
     */
    attachEventListeners() {
        // Base implementation - child classes should extend or override
    }

    /**
     * Called when the view is no longer active
     */
    destroy() {
        // Clean up any resources, timers, etc.
        if (this.containerEl) {
            this.containerEl.innerHTML = '';
        }
    }

    /**
     * Called when the view becomes active
     * @param {Object} routerMatch - Optional router match information for URL restoration
     */
    onActivate(routerMatch) {
        // Override in child classes to handle activation logic
        console.log('[CorpusViewBase] View activated with router match:', routerMatch);
    }

    /**
     * Called when the view is deactivated
     */
    onDeactivate() {
        // Override in child classes to handle deactivation logic
    }

    /**
     * Helper method to add event listener with automatic cleanup
     */
    addListener(element, event, handler) {
        if (!element) return;

        // Create bound handler to maintain 'this' context
        const boundHandler = handler.bind(this);

        // Store for cleanup
        if (!this._listeners) this._listeners = [];
        this._listeners.push({ element, event, handler: boundHandler });

        element.addEventListener(event, boundHandler);
    }

    /**
     * Clean up all event listeners
     */
    cleanup() {
        if (this._listeners) {
            this._listeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this._listeners = [];
        }
    }
}