// ui/views/corpus/manage-user-groups-view.js
import { CorpusViewBase } from './corpus-view-base.js';
import { ManageUserGroups } from '../../components/manage-user-groups.js';
import { ErrorModal } from '../../modals/error-modal.js';
import { YesNoModal } from '../../modals/yesno-modal.js';
import { MessageModal } from '../../modals/message-modal.js';
import { UserGroupAddModal } from '../../modals/user-group-add-modal.js';
import { UserGroupsModal } from '../../modals/user-groups-modal.js';
import { clearUserGroupsCache } from "../../../api/usergroups.js";

/**
 * ManageUserGroupsView
 * 
 * A Corpus Management view for managing user groups
 * This is a lightweight wrapper around the ManageUserGroups component
 */
export class ManageUserGroupsView extends CorpusViewBase {
  constructor(store, jobController) {
    super(store, jobController);
    
    // Modals
    this.errorModal = new ErrorModal();
    this.confirmModal = new YesNoModal();
    this.messageModal = new MessageModal();
    this.addUserModal = new UserGroupAddModal();
    this.userGroupsModal = new UserGroupsModal();
    
    // Core component
    this.userGroupsComponent = null;
  }
  
  /**
   * Render the header for this view
   * @returns {string} - HTML for the header
   */
  renderHeader() {
    return ''; // Empty header - main title handled by CorpusManager
  }
  
  /**
   * Render the main content of this view
   * @returns {string} - HTML for the content
   */
  renderContent() {
    return `
      <div class="view-header">
        <p class="view-subheader">
          Manage user group assignments for document approval workflows
        </p>
      </div>
      <div id="user-groups-container"></div>
    `;
  }
  
  /**
   * Create component and attach event listeners
   */
  attachEventListeners() {
    const container = this.containerEl.querySelector('#user-groups-container');
    
    if (container) {
        this.userGroupsComponent = new ManageUserGroups({
            container,
            store: this.store,
            onError: (title, message) => this.errorModal.show({ title, message }),
            onUserGroupsUpdated: () => this.handleUserGroupsUpdated(),
            onMembershipUpdated: (group, username, action) => this.handleMembershipUpdated(group, username, action),
            onViewUserGroups: (username) => this.handleViewUserGroups(username),
            onAddUserClick: (selectedGroup) => this.handleAddUserClick(selectedGroup),
            onConfirmNewGroup: (groupName) => this.confirmNewGroup(groupName),
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
    // Inform user of success
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
   * Confirm creating a new group
   * @param {string} groupName - The group name
   * @returns {Promise<boolean>} - Whether to proceed
   */
  async confirmNewGroup(groupName) {
    return new Promise((resolve) => {
      this.confirmModal.show({
        title: "Create New Group",
        message: `You are about to create a new user group: "${this.formatGroupName(groupName)}". Are you sure you want to continue?`,
        onYes: () => resolve(true),
        onNo: () => resolve(false)
      });
    });
  }
  
  /**
   * Handle adding a user to a group
   * @param {Object} selectedGroup - The currently selected group (if any)
   */
  handleAddUserClick(selectedGroup) {
    this.addUserModal.show({
      groupName: selectedGroup ? selectedGroup.name : '',
      onSave: async (groupName, username) => {
        try {
          // Add user to group - backend will validate if user exists
          const success = await this.userGroupsComponent.addUserToGroup(groupName, username);
          
          if (success) {
            // Clear cache after successful operation
            clearUserGroupsCache();
            
            // Show success message
            this.messageModal.show({
              title: "Success",
              message: `User "${username}" was added to group "${this.formatGroupName(groupName)}".`
            });
          }
          
          return success;
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
   * Called when the view is activated
   */
  onActivate() {
    // Clear cache when view is activated to ensure fresh data
    clearUserGroupsCache();
    
    // Refresh data when view is activated
    if (this.userGroupsComponent) {
      this.userGroupsComponent.loadGroups(true); // Force refresh
    }
  }
  
  /**
   * Called when the view is deactivated
   */
  onDeactivate() {
    // Nothing specific needed
  }
  
  /**
   * Clean up the view
   */
  destroy() {
    super.destroy();
    
    if (this.userGroupsComponent) {
      this.userGroupsComponent.destroy();
      this.userGroupsComponent = null;
    }
  }
}