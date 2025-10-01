// ui/modals/manage-user-groups-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ManageUserGroups } from "../components/manage-user-groups.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { UserGroupAddModal } from "./user-group-add-modal.js";
import { UserGroupsModal } from "./user-groups-modal.js";

/**
 * ManageUserGroupsModal
 * 
 * A modal wrapper for the ManageUserGroups component
 */
export class ManageUserGroupsModal extends AsyncFormModal {
  constructor() {
    super();
    
    // Modals
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.addUserModal = new UserGroupAddModal();
    this.userGroupsModal = new UserGroupsModal();
    
    // State
    this.store = null;
    this.onClose = null;
    
    // Core component
    this.userGroupsComponent = null;
    
    this._buildDOM();
  }
  
  _buildDOM() {
    super._buildOverlay();
    
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form manage-user-groups-modal";
    this.modalEl.style.display = "none";
    this.modalEl.style.width = "90%";
    this.modalEl.style.maxWidth = "1200px";
    
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close user groups modal">&times;</button>
      <h2>Manage User Groups</h2>
      
      <div class="modal-section">
        <div id="modal-user-groups-container"></div>
      </div>
      
      <div class="action-group action-group--right">
        <button type="button" class="btn" id="closeBtn">Close</button>
      </div>
    `;
    
    document.body.appendChild(this.modalEl);
    
    // Attach close event listeners
    this.modalEl.querySelector(".modal__close").addEventListener("click", () => this.hide());
    this.modalEl.querySelector("#closeBtn").addEventListener("click", () => this.hide());
  }
  
  /**
   * Show the modal
   * @param {Object} options - Options for the modal
   * @param {Object} options.store - The application store
   * @param {Function} options.onClose - Callback when modal is closed
   */
  async show(options = {}) {
    this.store = options.store;
    this.onClose = options.onClose;
    
    super.show();
    
    // Initialize the user groups component
    const container = this.modalEl.querySelector('#modal-user-groups-container');
    
    if (container) {
        this.userGroupsComponent = new ManageUserGroups({
            container,
            store: this.store,
            onError: (title, message) => this.errorModal.show({ title, message }),
            onUserGroupsUpdated: () => this.handleUserGroupsUpdated(),
            onMembershipUpdated: (group, username, action) => this.handleMembershipUpdated(group, username, action),
            onViewUserGroups: (username) => this.handleViewUserGroups(username),
            onAddUserClick: () => this.handleAddUserClick(),
            // Add this new callback
            onConfirmRemoveMember: async (group, username) => {
                return new Promise((resolve) => {
                    this.confirmModal.show({
                        title: "Confirm Removal",
                        message: `Are you sure you want to remove ${username} from the group "${this.formatGroupName(group.name)}"?`,
                        onYes: () => resolve(true),
                        onNo: () => resolve(false)
                    });
                });
            }
        });
      
      this.userGroupsComponent.render();
    }
  }
  
  /**
   * Handle when user groups are updated
   */
  handleUserGroupsUpdated() {
    this.messageModal.show({
      title: "Success",
      message: "User groups have been updated successfully."
    });
  }
  
  /**
   * Handle when a user's membership in a group is updated
   * @param {Object} group - The group that was updated
   * @param {string} username - The affected username
   * @param {string} action - The action ('added' or 'removed')
   */
  handleMembershipUpdated(group, username, action) {
    const actionText = action === 'added' ? 'added to' : 'removed from';
    this.messageModal.show({
      title: "Success",
      message: `User ${username} was ${actionText} group "${this.formatGroupName(group.name)}".`
    });
  }
  
  /**
   * Handle viewing a user's groups
   * @param {string} username - The username to view groups for
   */
  handleViewUserGroups(username) {
    this.userGroupsModal.show({ username });
  }
  
  /**
   * Handle adding a user to a group
   */
  handleAddUserClick() {
    this.addUserModal.show({
      onSave: async (groupName, username) => {
        try {
          // Verify user exists
          const userExists = await this.userGroupsComponent.verifyUserExists(username);
          if (!userExists) {
            this.errorModal.show({
              title: "Invalid User",
              message: `User "${username}" does not exist. Please check the username and try again.`
            });
            return false;
          }
          
          // Add user to group
          await this.userGroupsComponent.addUserToGroup(groupName, username);
          
          // Show success message
          this.messageModal.show({
            title: "Success", 
            message: `User "${username}" was added to group "${this.formatGroupName(groupName)}".`
          });
          
          return true;
        } catch (error) {
          // Error already shown by component
          return false;
        }
      },
      getExistingGroups: () => this.userGroupsComponent.groups.map(g => g.name)
    });
  }
  
  /**
   * Format a group name for display
   * @param {string} name - The group name
   * @returns {string} - Formatted group name
   */
  formatGroupName(name) {
    return name.replace(/^Group:/, '');
  }
  
  /**
   * Hide the modal
   */
  hide() {
    super.hide();
    
    // Clean up
    if (this.userGroupsComponent) {
      this.userGroupsComponent.destroy();
      this.userGroupsComponent = null;
    }
    
    // Call onClose callback if provided
    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }
}