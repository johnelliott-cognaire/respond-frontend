// File: ui/modals/yesno-modal.js using OptionsModal

import { OptionsModal } from './options-modal.js';

/**
 * Reusable "Yes/No" or "Confirm" modal that uses OptionsModal.
 * Now supports HTML content while maintaining full backwards compatibility.
 * 
 * Usage (existing - works unchanged):
 *   const confirmModal = new YesNoModal();
 *   confirmModal.show({
 *     title: "Confirm",
 *     message: "Are you sure?",
 *     onYes: () => { ... },
 *     onNo: () => { ... }
 *   });
 * 
 * Usage (new HTML feature):
 *   confirmModal.show({
 *     title: "Confirm",
 *     message: "<p>HTML content</p>",
 *     isHtml: true,  // NEW: opt-in to HTML rendering
 *     onYes: () => { ... }
 *   });
 */
export class YesNoModal {
  constructor() {
    this.onYes = null;
    this.onNo = null;
    this.optionsModal = new OptionsModal();
  }

  show({ title, message, yesText, noText, onYes, onNo, isHtml = false }) {
    console.log('[YesNoModal] show() called with:', { title, message, yesText, noText, onYes: typeof onYes, onNo: typeof onNo, isHtml });
    
    // Store callbacks
    this.onYes = onYes;
    this.onNo = onNo;
    
    const optionsData = {
      title: title || "Confirm?",
      message: message || "Are you sure?",
      isHtml: isHtml,  // ENHANCED: Pass through the HTML flag
      options: [
        {
          text: noText || "No",
          btnClass: "btn-negative btn--danger",
          id: "noBtn",
          onClick: () => {
            console.log('[YesNoModal] No button clicked');
            if (this.onNo) this.onNo();
          }
        },
        {
          text: yesText || "Yes", 
          btnClass: "btn--primary",
          id: "yesBtn",
          onClick: () => {
            console.log('[YesNoModal] Yes button clicked');
            if (this.onYes) this.onYes();
          }
        }
      ]
    };
    
    console.log('[YesNoModal] About to call optionsModal.show() with:', optionsData);
    
    try {
      // Use OptionsModal to show the Yes/No dialog
      const result = this.optionsModal.show(optionsData);
      console.log('[YesNoModal] optionsModal.show() returned:', result);
      return result;
    } catch (error) {
      console.error('[YesNoModal] Error calling optionsModal.show():', error);
      console.error('[YesNoModal] Error stack:', error.stack);
      throw error;
    }
  }

  hide() {
    this.optionsModal.hide();
  }
}