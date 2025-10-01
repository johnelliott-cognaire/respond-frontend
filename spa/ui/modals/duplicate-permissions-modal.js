// File: ui/modals/duplicate-permissions-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { duplicatePermissions } from "../../api/users.js";

/**
 * DuplicatePermissionsModal
 * [PHASE 9 Implementation]
 *
 * Usage:
 *   const modal = new DuplicatePermissionsModal({
 *     sourceUsername: "john_doe",
 *     onSuccess: () => { ... }
 *   });
 *   modal.show();
 */
export class DuplicatePermissionsModal extends AsyncFormModal {
  constructor(options = {}) {
    super();
    this.sourceUsername = options.sourceUsername || "";
    this.onSuccess = typeof options.onSuccess === "function" ? options.onSuccess : null;

    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();

    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form";
    this.modalEl.style.display = "none";
    
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close duplicate permissions modal">&times;</button>
      <h2>Duplicate Permissions</h2>

      <div class="form-group">
        <label>Source User</label>
        <input type="text" id="dpSourceUser" class="doc-input" disabled />
      </div>

      <div class="form-group">
        <label>Target Username</label>
        <input type="text" id="dpTargetUser" class="doc-input" placeholder="Enter target username" />
      </div>

      <div class="form-group">
        <label>Permissions to Copy</label>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="display:flex; align-items:center; gap:4px;">
            <input type="checkbox" id="dpCopySystem" checked />
            System Permissions
          </label>
          <label style="display:flex; align-items:center; gap:4px;">
            <input type="checkbox" id="dpCopyAccounts" checked />
            Account Permissions
          </label>
          <label style="display:flex; align-items:center; gap:4px;">
            <input type="checkbox" id="dpCopyProjects" checked />
            Project Permissions
          </label>
        </div>
      </div>

      <div class="inline-error" id="dpError" style="display:none;"></div>

      <div class="button-group" style="margin-top:1rem;">
        <button type="button" class="btn" id="dpCancelBtn">Cancel</button>
        <button type="button" class="btn btn--primary" id="dpDuplicateBtn">Duplicate</button>
      </div>
    `;
    document.body.appendChild(this.modalEl);

    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => this.hide());

    this.dpSourceUser = this.modalEl.querySelector("#dpSourceUser");
    this.dpTargetUser = this.modalEl.querySelector("#dpTargetUser");
    this.dpCopySystem = this.modalEl.querySelector("#dpCopySystem");
    this.dpCopyAccounts = this.modalEl.querySelector("#dpCopyAccounts");
    this.dpCopyProjects = this.modalEl.querySelector("#dpCopyProjects");
    this.dpError = this.modalEl.querySelector("#dpError");

    const cancelBtn = this.modalEl.querySelector("#dpCancelBtn");
    cancelBtn.addEventListener("click", () => this.hide());

    const duplicateBtn = this.modalEl.querySelector("#dpDuplicateBtn");
    duplicateBtn.addEventListener("click", () => this.handleDuplicate());
  }

  show() {
    super.show();
    this.dpSourceUser.value = this.sourceUsername;
  }

  async handleDuplicate() {
    this.dpError.style.display = "none";
    const target = this.dpTargetUser.value.trim();
    if (!target) {
      this.dpError.textContent = "Please enter a target username.";
      this.dpError.style.display = "block";
      return;
    }

    try {
      this.lockFields();
      this.lockButtons();
      
      const copyOptions = {
        copySystem: this.dpCopySystem.checked,
        copyAccounts: this.dpCopyAccounts.checked,
        copyProjects: this.dpCopyProjects.checked
      };

      await duplicatePermissions(this.sourceUsername, target, copyOptions);
      this.messageModal.show({
        title: "Permissions Duplicated",
        message: `Permissions successfully duplicated onto ${target}`
      });
      this.hide();
      if (this.onSuccess) {
        this.onSuccess();
      }
    } catch (err) {
      console.error("[DuplicatePermissionsModal] handleDuplicate => error:", err);
      this.dpError.textContent = err.message;
      this.dpError.style.display = "block";
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }
}
