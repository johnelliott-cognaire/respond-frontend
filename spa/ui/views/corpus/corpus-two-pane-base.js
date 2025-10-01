// ui/views/corpus/corpus-two-pane-base.js
import { CorpusViewBase } from './corpus-view-base.js';

export class CorpusTwoPaneBase extends CorpusViewBase {
  constructor(store, jobController) {
    super(store, jobController);
    
    // Pane references
    this.headerPaneEl = null;
    this.subheaderPaneEl = null;
    this.leftPaneEl = null;
    this.rightPaneEl = null;
    
    // Generic layout classes
    this._layoutClasses = {
      container: ['corpus-two-pane-container'],
      headerPane: ['corpus-two-pane-header'],
      subheaderPane: ['corpus-two-pane-subheader'],
      contentSection: ['corpus-two-pane-content'],
      leftPane: ['corpus-two-pane-left'],
      rightPane: ['corpus-two-pane-right']
    };
    
    // Component-specific classes
    this._componentClasses = {
      container: [],
      headerPane: [],
      subheaderPane: [],
      contentSection: [],
      leftPane: [],
      rightPane: []
    };
    
    // Component visibility
    this._showHeaderPane = true;
    this._showSubheaderPane = true;
    this._showLeftPane = true;
    this._showRightPane = true;
  }
  
  /**
   * Override the original renderContent to use a structure that more closely
   * aligns with the original CorpusBrowseView implementation
   */
  renderContent() {
    // Allow derived classes to determine the exact content to render
    return this.renderTwoPaneContent();
  }
  
  /**
   * Template method to be overridden by derived classes to provide specific content
   */
  renderTwoPaneContent() {
    // This should be overridden by derived classes
    throw new Error('renderTwoPaneContent() must be implemented by child class');
  }
  
  /**
   * Set visibility of a pane
   */
  setPaneVisibility(pane, visible) {
    switch(pane) {
      case 'headerPane':
        this._showHeaderPane = visible;
        break;
      case 'subheaderPane':
        this._showSubheaderPane = visible;
        break;
      case 'leftPane':
        this._showLeftPane = visible;
        break;
      case 'rightPane':
        this._showRightPane = visible;
        break;
      default:
        console.warn(`Unknown pane: ${pane}`);
        return;
    }
    
    // Re-render if already attached to DOM
    if (this.containerEl) {
      this.render();
    }
  }
  
  /**
   * Add a component-specific class to a pane
   */
  addComponentClass(pane, className) {
    if (!this._componentClasses[pane]) {
      console.warn(`Unknown pane: ${pane}`);
      return;
    }
    
    if (!this._componentClasses[pane].includes(className)) {
      this._componentClasses[pane].push(className);
    }
  }
  
  /**
   * Set multiple component-specific classes for a pane
   */
  setComponentClasses(pane, classNames) {
    if (!this._componentClasses[pane]) {
      console.warn(`Unknown pane: ${pane}`);
      return;
    }
    
    this._componentClasses[pane] = [...classNames];
  }
  
  /**
   * Set loading state for a specific pane
   */
  setPaneLoading(pane, loading) {
    if (!this.containerEl) return;
    
    let element = null;
    switch(pane) {
      case 'leftPane':
        element = this.leftPaneEl;
        break;
      case 'rightPane':
        element = this.rightPaneEl;
        break;
      default:
        console.warn(`Loading not supported for pane: ${pane}`);
        return;
    }
    
    if (!element) return;
    
    // Remove existing overlays
    const existingOverlay = element.querySelector('.loading-overlay');
    if (existingOverlay) {
      element.removeChild(existingOverlay);
    }
    
    // Add loading overlay if loading
    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loading-spinner"></div>';
      
      // Ensure proper positioning
      if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
      }
      
      element.appendChild(overlay);
    }
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    // Clean up pane elements
    this.headerPaneEl = null;
    this.subheaderPaneEl = null;
    this.leftPaneEl = null;
    this.rightPaneEl = null;
    
    // Call parent destroy
    super.destroy();
  }
}