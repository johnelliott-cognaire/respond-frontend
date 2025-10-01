// ui/modals/user-group-add-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";

/**
 * UserGroupAddModal
 * 
 * A modal for adding a user to a group
 */
export class UserGroupAddModal extends AsyncFormModal {
  constructor() {
    super();
    
    // Modals
    this.errorModal = new ErrorModal();
    
    // State
    this.onSave = null;
    this.getExistingGroups = null;
    this.existingGroups = [];
    this.initialGroupName = '';
    
    this._buildDOM();
  }
  
  _buildDOM() {
    super._buildOverlay();
    
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form user-group-add-modal";
    this.modalEl.style.display = "none";
    
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close add user modal">&times;</button>
      <h2>Add User to Group</h2>
      
      <div class="modal-section">
        <form id="add-user-form">
          <div class="form-group">
            <label for="groupInput">Group Name</label>
            <div class="input-with-dropdown">
              <input type="text" id="groupInput" class="doc-input" required
                placeholder="Enter or select a group name">
              <div class="dropdown-menu" id="groupDropdown" style="display: none;"></div>
            </div>
            <div class="form-hint">Group names should be descriptive and unique</div>
          </div>
          
          <div class="form-group">
            <label for="usernameInput">Username</label>
            <input type="text" id="usernameInput" class="doc-input" required
              placeholder="Enter username to add to group"
              pattern="[a-z0-9\\-]+" title="Only lowercase letters, numbers, and dashes">
            <div class="form-hint">Username must contain only lowercase letters, numbers, and dashes</div>
          </div>
          
          <div class="modal-error" id="modalError" style="display: none;"></div>
        </form>
      </div>
      
      <div class="action-group action-group--right">
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="button" class="btn btn--primary" id="saveBtn">Add User</button>
      </div>
    `;
    
    document.body.appendChild(this.modalEl);
    
    // Add dropdown styles
    const style = document.createElement('style');
    style.textContent = `
      .input-with-dropdown {
        position: relative;
      }
      .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        max-height: 200px;
        overflow-y: auto;
        background: white;
        border: 1px solid #ccc;
        border-radius: 0 0 4px 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        z-index: 1000;
      }
      .dropdown-item {
        padding: 8px 12px;
        cursor: pointer;
      }
      .dropdown-item:hover {
        background: #f5f5f5;
      }
    `;
    document.head.appendChild(style);
    
    // Attach event listeners
    this.modalEl.querySelector(".modal__close").addEventListener("click", () => this.hide());
    this.modalEl.querySelector("#cancelBtn").addEventListener("click", () => this.hide());
    this.modalEl.querySelector("#saveBtn").addEventListener("click", () => this.handleSave());
    
    // Form field references
    this.groupInput = this.modalEl.querySelector("#groupInput");
    this.usernameInput = this.modalEl.querySelector("#usernameInput");
    this.groupDropdown = this.modalEl.querySelector("#groupDropdown");
    this.errorEl = this.modalEl.querySelector("#modalError");
    
    // Set up autocomplete
    this.groupInput.addEventListener("input", () => this.updateGroupSuggestions());
    this.groupInput.addEventListener("focus", () => this.showGroupSuggestions());
    this.groupInput.addEventListener("blur", () => {
      // Delay hiding dropdown to allow for clicks
      setTimeout(() => {
        this.groupDropdown.style.display = "none";
      }, 200);
    });
    
    // Enter key handling
    this.modalEl.querySelector("form").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleSave();
      }
    });
  }
  
  /**
   * Show the modal
   * @param {Object} options - Options for the modal
   * @param {string} options.groupName - Pre-populated group name (optional)
   * @param {Function} options.onSave - Callback when user is saved
   * @param {Function} options.getExistingGroups - Function to get existing groups
   */
  async show(options = {}) {
    this.onSave = options.onSave;
    this.getExistingGroups = options.getExistingGroups;
    this.initialGroupName = options.groupName || '';
    
    // Reset form
    this.groupInput.value = this.initialGroupName ? this.formatGroupName(this.initialGroupName) : "";
    this.usernameInput.value = "";
    this.errorEl.style.display = "none";
    
    // Load existing groups
    this.loadExistingGroups();
    
    super.show();
    
    // Focus first empty field
    setTimeout(() => {
      if (this.groupInput.value) {
        this.usernameInput.focus();
      } else {
        this.groupInput.focus();
      }
    }, 100);
  }
  
  /**
   * Load existing groups for autocomplete
   */
  loadExistingGroups() {
    if (typeof this.getExistingGroups === 'function') {
      this.existingGroups = this.getExistingGroups() || [];
    } else {
      this.existingGroups = [];
    }
  }
  
  /**
   * Show group suggestions when field is focused
   */
  showGroupSuggestions() {
    if (!this.existingGroups.length) {
      this.groupDropdown.style.display = "none";
      return;
    }
    
    // Show all groups (max 10)
    const displayGroups = this.existingGroups.slice(0, 10);
    
    // Generate dropdown HTML
    const html = displayGroups.map(group => 
      `<div class="dropdown-item">${this.formatGroupName(group)}</div>`
    ).join('');
    
    this.groupDropdown.innerHTML = html;
    this.groupDropdown.style.display = "block";
    
    // Attach click handlers
    const items = this.groupDropdown.querySelectorAll(".dropdown-item");
    items.forEach(item => {
      item.addEventListener("click", () => {
        this.groupInput.value = item.textContent;
        this.groupDropdown.style.display = "none";
        this.usernameInput.focus();
      });
    });
  }
  
  /**
   * Update group suggestions based on current input
   */
  updateGroupSuggestions() {
    const input = this.groupInput.value.toLowerCase();
    
    if (!input || !this.existingGroups.length) {
      this.groupDropdown.style.display = "none";
      return;
    }
    
    // Filter groups that match input
    const matches = this.existingGroups
      .filter(group => this.formatGroupName(group).toLowerCase().includes(input))
      .slice(0, 10); // Limit to 10 results
    
    if (!matches.length) {
      this.groupDropdown.style.display = "none";
      return;
    }
    
    // Generate dropdown HTML
    const html = matches.map(group => 
      `<div class="dropdown-item">${this.formatGroupName(group)}</div>`
    ).join('');
    
    this.groupDropdown.innerHTML = html;
    this.groupDropdown.style.display = "block";
    
    // Attach click handlers
    const items = this.groupDropdown.querySelectorAll(".dropdown-item");
    items.forEach(item => {
      item.addEventListener("click", () => {
        this.groupInput.value = item.textContent;
        this.groupDropdown.style.display = "none";
        this.usernameInput.focus();
      });
    });
  }
  
  /**
   * Handle saving the form
   */
  async handleSave() {
    // Validate form
    if (!this.validateForm()) {
      return;
    }
    
    this.lockButtons();
    
    try {
      // Get values
      let groupName = this.groupInput.value.trim();
      const username = this.usernameInput.value.trim();
      
      // Add 'Group:' prefix if not present
      if (!groupName.startsWith('Group:')) {
        groupName = `Group:${groupName}`;
      }
      
      // Call onSave callback
      if (typeof this.onSave === 'function') {
        const success = await this.onSave(groupName, username);
        if (success) {
          this.hide();
        }
      } else {
        this.hide();
      }
    } catch (error) {
      this.showError(`Error: ${error.message}`);
    } finally {
      this.unlockButtons();
    }
  }
  
  /**
   * Validate the form
   * @returns {boolean} - Whether the form is valid
   */
  validateForm() {
    this.errorEl.style.display = "none";
    
    const groupName = this.groupInput.value.trim();
    const username = this.usernameInput.value.trim();
    
    if (!groupName) {
      this.showError("Group name is required");
      this.groupInput.focus();
      return false;
    }
    
    if (!username) {
      this.showError("Username is required");
      this.usernameInput.focus();
      return false;
    }
    
    // Username validation - only lowercase letters, numbers, and dashes
    const usernameRegex = /^[a-z0-9\-]+$/;
    if (!usernameRegex.test(username)) {
      this.showError("Username must contain only lowercase letters, numbers, and dashes");
      this.usernameInput.focus();
      return false;
    }
    
    return true;
  }
  
  /**
   * Show an error message
   * @param {string} message - The error message
   */
  showError(message) {
    this.errorEl.textContent = message;
    this.errorEl.style.display = "block";
  }
  
  /**
   * Format a group name for display
   * @param {string} name - The group name
   * @returns {string} - Formatted group name
   */
  formatGroupName(name) {
    return name.replace(/^Group:/, '');
  }
}