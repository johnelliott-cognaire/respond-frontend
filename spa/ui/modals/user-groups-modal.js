// ui/modals/user-groups-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { listUserGroups } from "../../api/usergroups.js";

/**
 * UserGroupsModal
 * 
 * A modal for displaying all groups a user belongs to
 */
export class UserGroupsModal extends AsyncFormModal {
  constructor() {
    super();
    
    // Modals
    this.errorModal = new ErrorModal();
    
    // State
    this.username = null;
    this.userGroups = [];
    this.loading = false;
    
    this._buildDOM();
  }
  
  _buildDOM() {
    super._buildOverlay();
    
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form user-groups-modal";
    this.modalEl.style.display = "none";
    
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close user groups modal">&times;</button>
      <h2>User Groups</h2>
      
      <div class="modal-section">
        <div class="user-info">
          <div class="user-info-header">
            <i class="fas fa-user"></i>
            <span id="usernameDisplay">Loading user...</span>
          </div>
        </div>
        
        <h3>Group Memberships</h3>
        <div id="groupsList" class="groups-list" style="max-height: 300px; overflow-y: auto; overflow-x: hidden;">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading groups...</div>
          </div>
        </div>
      </div>
      
      <div class="action-group action-group--right">
        <button type="button" class="btn" id="closeBtn">Close</button>
      </div>
    `;
    
    document.body.appendChild(this.modalEl);
    
    // Attach close event listeners
    this.modalEl.querySelector(".modal__close").addEventListener("click", () => this.hide());
    this.modalEl.querySelector("#closeBtn").addEventListener("click", () => this.hide());
    
    // Element refs
    this.usernameDisplay = this.modalEl.querySelector("#usernameDisplay");
    this.groupsList = this.modalEl.querySelector("#groupsList");
  }
  
  /**
   * Show the modal
   * @param {Object} options - Options for the modal
   * @param {string} options.username - The username to show groups for
   */
  async show(options = {}) {
    this.username = options.username;
    
    // Update the UI
    this.usernameDisplay.textContent = this.username || 'Unknown User';
    this.groupsList.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading groups...</div>
      </div>
    `;
    
    super.show();
    
    // Load user groups
    await this.loadUserGroups();
  }
  
  /**
   * Load groups for the user
   */
  async loadUserGroups() {
    if (!this.username) return;
    
    this.loading = true;
    
    try {
      console.log(`[UserGroupsModal] Loading groups for username: ${this.username}`);
      
      // Get all groups
      const response = await listUserGroups(false); // Get all groups
      const allGroups = response.groups || [];
      
      console.log(`[UserGroupsModal] Loaded ${allGroups.length} total groups`);
      console.log(`[UserGroupsModal] Sample group data:`, allGroups[0]);
      
      // Filter groups where this user is a member
      // Handle both old format (username strings) and new format (member objects)
      this.userGroups = allGroups.filter(group => {
        const members = group.members || [];
        const isMember = members.some(member => {
          if (typeof member === 'string') {
            // Old format: member is just a username string
            return member === this.username;
          } else if (typeof member === 'object' && member.username) {
            // New format: member is an object with username property
            return member.username === this.username;
          }
          return false;
        });
        
        if (isMember) {
          console.log(`[UserGroupsModal] Found user ${this.username} in group: ${group.name}`);
        }
        
        return isMember;
      });
      
      console.log(`[UserGroupsModal] Filtered to ${this.userGroups.length} groups for user ${this.username}`);
      
      // Render groups
      this.renderGroups();
      
    } catch (error) {
      console.error("[UserGroupsModal] Error loading user groups:", error);
      this.errorModal.show({
        title: "Error", 
        message: `Failed to load groups for user: ${error.message}`
      });
      
      this.groupsList.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error loading groups: ${error.message}</p>
        </div>
      `;
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Render the list of groups
   */
  renderGroups() {
    if (!this.userGroups.length) {
      this.groupsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-users-slash"></i>
          <p>User is not a member of any groups</p>
        </div>
      `;
      return;
    }
    
    // Sort groups by name
    const sortedGroups = [...this.userGroups].sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
    
    // Create HTML for the groups
    const html = sortedGroups.map(group => `
      <div class="group-item" style="display: flex; padding: 10px; border-bottom: 1px solid #eee; align-items: center;">
        <div class="group-icon" style="margin-right: 10px;"><i class="fas fa-users"></i></div>
        <div class="group-name" style="flex: 1;">${this.formatGroupName(group.name)}</div>
        <div class="group-members">${(group.members || []).length} member${(group.members || []).length !== 1 ? 's' : ''}</div>
      </div>
    `).join('');
    
    this.groupsList.innerHTML = html;
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