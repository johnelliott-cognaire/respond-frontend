// File: ui/views/document.js
import { TextPromptModal } from "../modals/text-prompt-modal.js";

/**
 * Base Document class. 
 * We have removed any separate "this.title" property and rely on the subclass
 * to store the title in docTaskInstance if needed. 
 */
export class DocumentBase {
  constructor() {
    this.domContainer = null; // assigned by TabManager when showing
  }

  attachToDOM(containerEl) {
    this.domContainer = containerEl;
  }

  renderContent() {
    if (this.domContainer) {
      // Default rendering; subclasses should override this method.
      this.domContainer.innerHTML = `<div>Base Document (no content)</div>`;
    }
  }

  addDocumentEventListeners() {
    // Subclasses override.
  }

  destroy() {
    if (this.domContainer) {
      this.domContainer.innerHTML = "";
    }
  }

  /**
   * Show a text prompt for editing the document title.
   * Subclasses typically override `updateTitle()`.
   * @param {string} fieldLabel - Label to display above the input.
   * @param {string} defaultValue - The pre-populated value.
   * @param {function} onOk - Optional callback when Ok is clicked.
   * @param {function} onCancel - Optional callback when Cancel is clicked.
   * @param {boolean} showClose - Whether to show the top-right close button (default true).
   */
  promptForTitle(fieldLabel, defaultValue, onOk, onCancel, showClose = true) {
    const promptModal = new TextPromptModal({
      fieldLabel: fieldLabel,
      defaultValue: defaultValue,
      showClose: showClose,
      onOk: (value) => {
        this.updateTitle(value);
        if (onOk) onOk(value);
      },
      onCancel: () => {
        if (onCancel) onCancel();
      }
    });
    promptModal.show();
  }

  /**
   * By default, does nothing. Subclasses (like MultiStageDocumentBase) 
   * override this to set docTaskInstance.title and re-render the doc-title in the DOM.
   */
  updateTitle(newTitle) {
    console.log("[DocumentBase] updateTitle() called with:", newTitle);
    // Subclass override
  }
}
