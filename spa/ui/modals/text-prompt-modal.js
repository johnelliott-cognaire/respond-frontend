// File: ui/modals/text-prompt-modal.js
/**
 * TextPromptModal: a simple modal with a text input field.
 * Enhanced to disable the OK button when the input is empty.
 */
import { AsyncFormModal } from "./async-form-modal.js";

export class TextPromptModal extends AsyncFormModal {
  constructor(options = {}) {
    super();
    this.fieldLabel = options.fieldLabel || "Enter value:";
    this.defaultValue = options.defaultValue || "";
    this.showClose = (options.showClose !== undefined) ? options.showClose : true;
    this.onOk = options.onOk || function(value){};
    this.onCancel = options.onCancel || function(){};
    this.allowEmpty = options.allowEmpty || false; // New option to control whether empty values are allowed

    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
      this.overlayEl.style.zIndex = "9000";
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form modal--narrow text-prompt-modal";
    this.modalEl.style.display = "none";
    this.modalEl.style.zIndex = "10001";

    const closeButtonHtml = this.showClose ? `<button class="modal__close" aria-label="Close prompt">&times;</button>` : "";
    this.modalEl.innerHTML = `
      ${closeButtonHtml}
      <h2 id="textPromptTitle">${this.fieldLabel}</h2>
      <p id="textPromptMessage" style="margin-top: 0.5rem; margin-bottom: 1rem;"></p>
      <div class="form-group">
        <input type="text" id="textPromptInput" class="doc-input" value="${this.defaultValue}" />
      </div>
      <!-- button-group for Cancel & OK -->
      <div class="button-group">
        <button type="button" class="btn" id="textPromptCancelBtn">Cancel</button>
        <button type="button" class="btn btn--primary" id="textPromptOkBtn" ${!this.defaultValue && !this.allowEmpty ? 'disabled' : ''}>OK</button>
      </div>
    `;
    document.body.appendChild(this.modalEl);

    // Get references to elements
    const inputEl = this.modalEl.querySelector("#textPromptInput");
    const okBtn = this.modalEl.querySelector("#textPromptOkBtn");

    // Add input listener to enable/disable the OK button
    inputEl.addEventListener("input", () => {
      const value = inputEl.value.trim();
      okBtn.disabled = value === "" && !this.allowEmpty;
    });

    // Set initial focus on the input
    setTimeout(() => {
      inputEl.focus();
      // Select all text if there's default text
      if (this.defaultValue) {
        inputEl.select();
      }
    }, 50);

    // Add event listener for pressing Enter key
    inputEl.addEventListener("keyup", (event) => {
      if (event.key === "Enter" && !okBtn.disabled) {
        okBtn.click();
      }
    });

    if (this.showClose) {
      const closeBtn = this.modalEl.querySelector(".modal__close");
      closeBtn.addEventListener("click", () => {
        this.hide();
        this.onCancel();
      });
    }
    
    const cancelBtn = this.modalEl.querySelector("#textPromptCancelBtn");
    cancelBtn.addEventListener("click", () => {
      this.hide();
      this.onCancel();
    });
    
    okBtn.addEventListener("click", () => {
      const inputValue = inputEl.value.trim();
      // Check again to prevent empty submission
      if (inputValue === "" && !this.allowEmpty) {
        return;
      }
      this.hide();
      this.onOk(inputValue);
    });
  }

  /**
   * Show the modal and override the field label if provided
   * @param {Object} options Optional parameters to override when showing
   * @param {string} options.title Override the title
   * @param {string} options.message Optional message to display
   * @param {string} options.fieldLabel Override the field label
   * @param {string} options.defaultValue Override the default value
   * @param {Function} options.onOk Callback when OK is clicked
   * @param {Function} options.onCancel Callback when Cancel is clicked
   */
  show(options = {}) {
    super.show();
    
    // Update callbacks if provided
    if (options.onOk) {
      this.onOk = options.onOk;
    }
    
    if (options.onCancel) {
      this.onCancel = options.onCancel;
    }
    
    // Update the title if provided
    if (options.title) {
      const titleEl = this.modalEl.querySelector("#textPromptTitle");
      titleEl.textContent = options.title;
    } else if (options.fieldLabel) {
      // Fall back to fieldLabel if title not provided
      const titleEl = this.modalEl.querySelector("#textPromptTitle");
      titleEl.textContent = options.fieldLabel;
    }
    
    // Update the message if provided
    const messageEl = this.modalEl.querySelector("#textPromptMessage");
    if (options.message) {
      messageEl.textContent = options.message;
      messageEl.style.display = "block";
    } else {
      messageEl.style.display = "none";
    }
    
    // CRITICAL FIX: Set the input value first, then do everything else
    const inputEl = this.modalEl.querySelector("#textPromptInput");
    
    // Update the default value if provided (with explicit fallback to empty string)
    if (options.defaultValue !== undefined) {
      console.log("[TextPromptModal] Setting default value:", options.defaultValue);
      // Clear and set the input value directly
      inputEl.value = "";
      inputEl.value = options.defaultValue;
      
      // Force a DOM update
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Update button state based on new value
      const okBtn = this.modalEl.querySelector("#textPromptOkBtn");
      okBtn.disabled = options.defaultValue.trim() === "" && !this.allowEmpty;
    }
    
    // Focus and select with a slight delay to ensure modal is visible
    setTimeout(() => {
      console.log("[TextPromptModal] Focusing input with current value:", inputEl.value);
      inputEl.focus();
      if (inputEl.value) {
        inputEl.select();
      }
    }, 100);
  }
}