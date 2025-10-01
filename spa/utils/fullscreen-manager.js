// File: utils/fullscreen-manager.js
/**
 * FullScreenManager - Manages full-screen mode for RFP Stage 3 Answer Questions
 * 
 * This utility class provides full-screen functionality specifically for the RFP Stage 3
 * workflow, hiding the main application UI components while preserving the question grid,
 * control pane, and topic tabs functionality.
 */
export class FullScreenManager {
  constructor() {
    this.isFullScreen = false;
    this.originalBodyClasses = [];
    this.targetElement = null;
    this.exitButton = null;
    this.setupKeyboardShortcuts();
  }

  /**
   * Check if full-screen mode is available (only in Stage 3 of RFP workflow)
   * @returns {boolean} True if full-screen is available
   */
  isFullScreenAvailable() {
    // Check if we're in Stage 3 by looking for the RFP answer questions stage component
    const rfpStageElement = document.querySelector('.rfp-answer-questions-stage');
    if (!rfpStageElement) return false;
    
    // Additionally check if the control pane with full-screen button exists
    const fullScreenButton = document.querySelector('.fullscreen-btn');
    if (!fullScreenButton) return false;
    
    // Check if we can find the target wrapper element
    const targetElement = document.querySelector('.doc-stage-content-wrapper');
    if (!targetElement) return false;
    
    return true;
  }

  /**
   * Enter full-screen mode
   * @param {HTMLElement} targetElement - The element to make full-screen
   * @returns {boolean} True if successful
   */
  enterFullScreen(targetElement) {
    if (this.isFullScreen || !this.isFullScreenAvailable()) return false;
    
    console.log('[FullScreenManager] Entering full-screen mode');
    
    this.targetElement = targetElement;
    this.originalBodyClasses = Array.from(document.body.classList);
    
    // Add full-screen classes
    document.body.classList.add('fullscreen-mode-active');
    this.targetElement.classList.add('fullscreen-content');
    
    // Hide components
    this.hideComponents();
    
    // Prevent navigation
    this.preventNavigation(true);
    
    this.isFullScreen = true;
    
    // Trigger resize events for AG Grid
    this.triggerResize();
    
    return true;
  }

  /**
   * Exit full-screen mode
   * @returns {boolean} True if successful
   */
  exitFullScreen() {
    if (!this.isFullScreen) return false;
    
    console.log('[FullScreenManager] Exiting full-screen mode');
    
    // Remove full-screen classes
    document.body.classList.remove('fullscreen-mode-active');
    if (this.targetElement) {
      this.targetElement.classList.remove('fullscreen-content');
    }
    
    // Show components
    this.showComponents();
    
    // Restore navigation
    this.preventNavigation(false);
    
    this.isFullScreen = false;
    this.targetElement = null;
    
    // Trigger resize events for AG Grid
    setTimeout(() => this.triggerResize(), 100);
    
    return true;
  }

  /**
   * Toggle full-screen mode
   * @param {HTMLElement} targetElement - The element to make full-screen
   * @returns {boolean} True if successful
   */
  toggleFullScreen(targetElement) {
    if (this.isFullScreen) {
      return this.exitFullScreen();
    } else {
      return this.enterFullScreen(targetElement);
    }
  }

  /**
   * Hide UI components for full-screen mode
   * @private
   */
  hideComponents() {
    const selectors = [
      '#topBarRoot',
      '.tab-bar-wrapper',
      '.doc-stage-breadcrumb'
    ];
    
    selectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        element.classList.add('fullscreen-hidden');
      }
    });
    
    // Hide document header (parent sibling of doc-stage-content-wrapper)
    if (this.targetElement?.parentElement) {
      const documentHeader = this.targetElement.parentElement.querySelector('.doc-header, .document-header');
      if (documentHeader) {
        documentHeader.classList.add('fullscreen-hidden');
      }
    }
  }

  /**
   * Show previously hidden UI components
   * @private
   */
  showComponents() {
    const elements = document.querySelectorAll('.fullscreen-hidden');
    elements.forEach(element => {
      element.classList.remove('fullscreen-hidden');
    });
  }


  /**
   * Prevent/allow navigation away from Stage 3
   * @param {boolean} prevent - Whether to prevent navigation
   * @private
   */
  preventNavigation(prevent) {
    // Disable stage navigation breadcrumb clicks
    const stageLinks = document.querySelectorAll('.stage-link');
    stageLinks.forEach(link => {
      if (prevent) {
        link.style.pointerEvents = 'none';
        link.style.opacity = '0.5';
      } else {
        link.style.pointerEvents = '';
        link.style.opacity = '';
      }
    });
    
    // Disable tab navigation
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      if (prevent) {
        tab.style.pointerEvents = 'none';
        tab.style.opacity = '0.5';
      } else {
        tab.style.pointerEvents = '';
        tab.style.opacity = '';
      }
    });
  }

  /**
   * Trigger resize events for AG Grid and other components
   * @private
   */
  triggerResize() {
    // Notify AG Grid and other components of size changes
    window.dispatchEvent(new Event('resize'));
    
    // Specifically trigger AG Grid resize if available
    if (window.currentQuestionGrid?.gridApi) {
      window.currentQuestionGrid.gridApi.sizeColumnsToFit();
    }
  }

  /**
   * Setup keyboard shortcuts for full-screen mode
   * @private
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      // F11 or Ctrl+Shift+F to toggle full-screen
      if (event.key === 'F11' || 
          (event.ctrlKey && event.shiftKey && event.key === 'F')) {
        event.preventDefault();
        
        if (this.isFullScreenAvailable()) {
          if (this.isFullScreen) {
            this.exitFullScreen();
          } else {
            const target = document.querySelector('.doc-stage-content-wrapper');
            if (target) this.enterFullScreen(target);
          }
        }
      }
      
      // Escape to exit full-screen
      if (event.key === 'Escape' && this.isFullScreen) {
        this.exitFullScreen();
      }
    });
  }

  /**
   * Reset on page refresh (called during initialization)
   */
  resetOnRefresh() {
    this.isFullScreen = false;
    document.body.classList.remove('fullscreen-mode-active');
    
    const fullscreenElements = document.querySelectorAll('.fullscreen-content');
    fullscreenElements.forEach(el => el.classList.remove('fullscreen-content'));
    
    this.showComponents();
  }
}

// Global instance
export const fullScreenManager = new FullScreenManager();