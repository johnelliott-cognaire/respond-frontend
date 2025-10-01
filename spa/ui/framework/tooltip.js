// ui/framework/tooltip.js

/**
 * Modified tooltip.js file to fix tooltip interaction issues
 * This version improves tooltip reliability and event handling
 */
export class Tooltip {
  constructor() {
    this.tooltipEl = null;
    this.activeElement = null;
    this.hideTimeout = null;
    
    // Check if there's already a tooltip instance
    const existingTooltip = document.querySelector('.custom-tooltip');
    if (existingTooltip) {
      this.tooltipEl = existingTooltip;
    } else {
      this._createTooltipElement();
    }
    
    this._setupGlobalEvents();
    
    // Debug marker to identify tooltip instance
    this._instanceId = Math.random().toString(36).substring(2, 9);
  }

  /**
   * Creates the tooltip DOM element
   */
  _createTooltipElement() {
    // Create tooltip element if it doesn't exist
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'custom-tooltip';
      this.tooltipEl.id = 'global-tooltip';
      this.tooltipEl.setAttribute('aria-hidden', 'true');
      
      // Make absolutely sure it's styled correctly
      this.tooltipEl.style.position = 'absolute';
      this.tooltipEl.style.zIndex = '10000';
      this.tooltipEl.style.pointerEvents = 'none';
      this.tooltipEl.style.opacity = '0';
      this.tooltipEl.style.display = 'none';
      
      document.body.appendChild(this.tooltipEl);
    }
  }

  /**
   * Setup global events to handle tooltip positioning and hiding
   */
  _setupGlobalEvents() {
    // Remove previous event listeners to prevent duplicates
    window.removeEventListener('scroll', this._handleGlobalScroll);
    window.removeEventListener('resize', this._handleGlobalResize);
    document.removeEventListener('mouseleave', this._handleDocumentLeave);
    
    // Define bound methods to ensure proper this context
    this._handleGlobalScroll = () => this.hide();
    this._handleGlobalResize = () => this.hide();
    this._handleDocumentLeave = () => this.hide();
    
    // Add event listeners
    window.addEventListener('scroll', this._handleGlobalScroll, { passive: true });
    window.addEventListener('resize', this._handleGlobalResize, { passive: true });
    document.addEventListener('mouseleave', this._handleDocumentLeave);
    
  }

  /**
   * Attach tooltip to an element
   * @param {HTMLElement} element - The element to attach the tooltip to
   * @param {string} text - The text to display in the tooltip
   * @param {Object} options - Optional configuration
   */
  attach(element, text, options = {}) {
    if (!element) {
      console.warn('[Tooltip] Cannot attach tooltip to undefined element');
      return;
    }
    
    const defaultOptions = {
      position: 'top',
      delay: 300,
      html: true, // Support HTML in tooltips
    };
    
    const config = { ...defaultOptions, ...options };
    
    // Clean up any previous event listeners to prevent duplicates
    element.removeEventListener('mouseenter', element._tooltipEnterHandler);
    element.removeEventListener('mouseleave', element._tooltipLeaveHandler);
    element.removeEventListener('focus', element._tooltipEnterHandler);
    element.removeEventListener('blur', element._tooltipLeaveHandler);
    element.removeEventListener('click', element._tooltipClickHandler);
    
    // Store the tooltip text as a data attribute
    element.dataset.tooltip = text;
    element.dataset.tooltipPosition = config.position;
    element.dataset.tooltipDelay = config.delay;
    element.dataset.tooltipHtml = config.html.toString();
    
    // Set cursor to help if it's an info icon or tooltip-icon
    if (element.classList.contains('info-icon') || element.classList.contains('tooltip-icon')) {
      element.style.cursor = 'help';
    }
    
    // Create bound event handlers with proper this context
    element._tooltipEnterHandler = this._handleMouseEnter.bind(this);
    element._tooltipLeaveHandler = this._handleMouseLeave.bind(this);
    element._tooltipClickHandler = (e) => {
      // Stop propagation for tooltip icons to prevent triggering parent elements
      if (element.classList.contains('info-icon') || element.classList.contains('tooltip-icon')) {
        e.preventDefault();
        e.stopPropagation();
        
        // Show tooltip on click too (for mobile)
        this._handleMouseEnter(e);
      }
    };
    
    // Add event listeners
    element.addEventListener('mouseenter', element._tooltipEnterHandler);
    element.addEventListener('mouseleave', element._tooltipLeaveHandler);
    element.addEventListener('focus', element._tooltipEnterHandler);
    element.addEventListener('blur', element._tooltipLeaveHandler);
    element.addEventListener('click', element._tooltipClickHandler);
    
  }

  /**
   * Handle mouse enter event
   * @param {Event} event - The mouse event
   */
  _handleMouseEnter(event) {
    if (!event || !event.currentTarget) return;
    
    const element = event.currentTarget;
    const text = element.dataset.tooltip;
    
    if (!text) {
      return;
    }
    
    const delay = parseInt(element.dataset.tooltipDelay || 300);
    const position = element.dataset.tooltipPosition || 'top';
    const html = element.dataset.tooltipHtml === 'true';
    
    // Clear any existing timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    
    // Set the active element
    this.activeElement = element;
    
    // Create a specific showTimeout property for this element
    if (element._showTimeout) {
      clearTimeout(element._showTimeout);
    }
    
    // Show tooltip after delay
    element._showTimeout = setTimeout(() => {
      if (this.activeElement === element) {
        this.show(element, text, position, html);
      }
    }, delay);
  }

  /**
   * Handle mouse leave event
   */
  _handleMouseLeave() {
    this.activeElement = null;
    
    // Hide with a small delay to prevent flickering
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    
    this.hideTimeout = setTimeout(() => {
      this.hide();
    }, 100);
  }

  /**
   * Show tooltip for an element
   * @param {HTMLElement} element - The element to show tooltip for
   * @param {string} text - The tooltip text
   * @param {string} position - Position of the tooltip
   * @param {boolean} html - Whether to interpret text as HTML
   */
  show(element, text, position = 'top', html = true) {
    if (!this.tooltipEl) {
      this._createTooltipElement();
    }
    
    if (!element) {
      return;
    }
    
    
    // Set tooltip content
    if (html) {
      this.tooltipEl.innerHTML = text;
    } else {
      this.tooltipEl.textContent = text;
    }
    
    // Make sure tooltip is visible first to get correct dimensions
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.opacity = '0';
    this.tooltipEl.classList.add('visible');
    
    // Get element position
    const elementRect = element.getBoundingClientRect();
    const tooltipRect = this.tooltipEl.getBoundingClientRect();
    
    // Calculate positions
    let top, left;
    
    switch (position) {
      case 'top':
        top = elementRect.top - tooltipRect.height - 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'bottom':
        top = elementRect.bottom + 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = elementRect.top + (elementRect.height / 2) - (tooltipRect.height / 2);
        left = elementRect.left - tooltipRect.width - 8;
        break;
      case 'right':
        top = elementRect.top + (elementRect.height / 2) - (tooltipRect.height / 2);
        left = elementRect.right + 8;
        break;
      default:
        top = elementRect.top - tooltipRect.height - 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
    }
    
    // Adjust to stay in viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Ensure tooltip stays within viewport horizontally
    if (left < 10) left = 10;
    if (left + tooltipRect.width > viewportWidth - 10) {
      left = viewportWidth - tooltipRect.width - 10;
    }
    
    // If tooltip would appear above viewport, show it below the element instead
    if (top < 10) {
      top = elementRect.bottom + 8;
    }
    
    // If tooltip would appear below viewport, show it above the element
    if (top + tooltipRect.height > viewportHeight - 10) {
      top = elementRect.top - tooltipRect.height - 8;
    }
    
    // Position the tooltip with scroll offset
    const finalTop = top + window.scrollY;
    const finalLeft = left + window.scrollX;
    
    this.tooltipEl.style.top = `${finalTop}px`;
    this.tooltipEl.style.left = `${finalLeft}px`;
    
    
    // Make it visible after positioning
    setTimeout(() => {
      if (this.activeElement === element) {
        this.tooltipEl.style.opacity = '1';
        this.tooltipEl.classList.add('visible');
        this.tooltipEl.setAttribute('aria-hidden', 'false');
      }
    }, 10);
  }

  /**
   * Hide the tooltip
   */
  hide() {
    if (this.tooltipEl) {
      this.tooltipEl.style.opacity = '0';
      this.tooltipEl.classList.remove('visible');
      this.tooltipEl.setAttribute('aria-hidden', 'true');
      this.activeElement = null;
      
      // Actually hide the element after fade out
      setTimeout(() => {
        if (this.tooltipEl && this.tooltipEl.style.opacity === '0') {
          this.tooltipEl.style.display = 'none';
          this.tooltipEl.classList.remove('visible');
        }
      }, 200);
    }
  }
}

// Create a singleton instance for global use
// Note: This creates one tooltip instance that is available for import
const tooltip = new Tooltip();
export default tooltip;