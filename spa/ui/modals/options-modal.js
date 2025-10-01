// File: ui/modals/options-modal.js

/**
 * Enhanced OptionsModal with backwards-compatible HTML support
 * 
 * BACKWARDS COMPATIBLE: All existing usage continues to work exactly as before
 * NEW FEATURE: Optional HTML rendering when isHtml: true is specified
 * 
 * Usage (existing - works unchanged):
 *   const optionsModal = new OptionsModal();
 *   optionsModal.show({
 *     title: "Choose an action",
 *     message: "What would you like to do?",
 *     options: [...]
 *   });
 * 
 * Usage (new HTML feature):
 *   optionsModal.show({
 *     title: "Choose an action", 
 *     message: "<p>HTML <strong>content</strong> here</p>",
 *     isHtml: true,  // NEW: opt-in to HTML rendering
 *     options: [...]
 *   });
 */
export class OptionsModal {
    constructor() {
      this.modalEl = null;
      this.overlayEl = null;
      this.onCancel = null;
    }
  
    _buildDOM() {
      // Create overlay with high z-index (higher than VectorIndexManagementModal)
      this.overlayEl = document.createElement("div");
      this.overlayEl.className = "overlay";
      this.overlayEl.style.zIndex = "12000"; // Higher than VectorIndexManagementModal's 10499
      this.overlayEl.style.display = "none";
  
      // Create modal with high z-index (higher than VectorIndexManagementModal)
      this.modalEl = document.createElement("div");
      this.modalEl.className = "modal modal--simple"; // Using modal--simple as default
      this.modalEl.style.zIndex = "12001"; // Higher than VectorIndexManagementModal's 10500
      this.modalEl.style.display = "none";
  
      this.modalEl.innerHTML = `
        <button class="modal__close" aria-label="Close modal">&times;</button>
        <h2 id="yesNoTitle"></h2>
        <div id="yesNoMessage"></div>
        <div class="button-group">
          <!-- Options will be inserted here -->
        </div>
      `;
  
      document.body.appendChild(this.overlayEl);
      document.body.appendChild(this.modalEl);
  
      // Event listeners
      const closeBtn = this.modalEl.querySelector(".modal__close");
      closeBtn.addEventListener("click", () => {
        this.hide();
        if (this.onCancel) this.onCancel();
      });
      
      this.overlayEl.addEventListener("click", () => {
        this.hide();
        if (this.onCancel) this.onCancel();
      });
    }
  
    _validateOptions(options) {
      if (!Array.isArray(options) || options.length === 0) {
        throw new Error("Options must be a non-empty array");
      }
      
      options.forEach((option, index) => {
        if (!option || typeof option !== "object") {
          throw new Error(`Option at index ${index} must be an object`);
        }
        
        if (!option.text || typeof option.text !== "string") {
          throw new Error(`Option at index ${index} must have a text property of type string`);
        }
        
        if (option.onClick && typeof option.onClick !== "function") {
          throw new Error(`onClick for option "${option.text}" must be a function`);
        }
        
        if (option.btnClass && typeof option.btnClass !== "string") {
          throw new Error(`btnClass for option "${option.text}" must be a string`);
        }
      });
      
      return options;
    }
  
    show({ title, message, options, onCancel, isHtml = false }) {
      console.log('[OptionsModal] show() called with:', { title, message, options, onCancel: typeof onCancel, isHtml });
      
      // Store callback
      this.onCancel = onCancel || (() => {});
      
      try {
        console.log('[OptionsModal] About to validate options:', options);
        // Validate options
        options = this._validateOptions(options);
        console.log('[OptionsModal] Options validated successfully');
      } catch (error) {
        console.error('[OptionsModal] Options validation failed:', error);
        throw error;
      }
      
      // Create modal if it doesn't exist
      if (!this.modalEl) {
        this._buildDOM();
      }
      
      // Set title and message content
      const titleEl = this.modalEl.querySelector("#yesNoTitle");
      const msgEl = this.modalEl.querySelector("#yesNoMessage");
      
      titleEl.textContent = title || "Select an Option";
      
      // ENHANCED: Support HTML content when explicitly requested
      if (isHtml) {
        msgEl.innerHTML = message || "Please select an option:";
      } else {
        // BACKWARDS COMPATIBLE: Use textContent by default (safe)
        msgEl.textContent = message || "Please select an option:";
      }
      
      // Create option buttons
      const buttonContainer = this.modalEl.querySelector(".button-group");
      buttonContainer.innerHTML = "";
      
      options.forEach(option => {
        const button = document.createElement("button");
        
        // Apply classes
        button.className = `btn ${option.btnClass || "btn--secondary"}`;
        
        // Set ID if provided
        if (option.id) {
          button.id = option.id;
        }
        
        button.textContent = option.text;
        
        button.addEventListener("click", () => {
          this.hide();
          if (option.onClick) option.onClick();
        });
        
        buttonContainer.appendChild(button);
      });
      
      // Show modal
      console.log('[OptionsModal] About to show modal - overlay:', this.overlayEl, 'modal:', this.modalEl);
      this.overlayEl.style.display = "block";
      this.modalEl.style.display = "block";
      console.log('[OptionsModal] Modal display styles set - overlay.display:', this.overlayEl.style.display, 'modal.display:', this.modalEl.style.display);
    }
  
    hide() {
      if (this.overlayEl) this.overlayEl.style.display = "none";
      if (this.modalEl) this.modalEl.style.display = "none";
    }
}