// ui/components/manage-user-groups.js
import { 
    listUserGroups, 
    createUserGroup, 
    updateUserGroup, 
    addGroupMember, 
    removeGroupMember, 
    deleteUserGroup, 
    clearUserGroupsCache 
  } from "../../api/usergroups.js";
import { getFreshSecurity } from "../../utils/security-utils.js";
import { ResponsiveTable } from './responsive-table.js';
import formatHumanReadableDate from '../../utils/date-utils.js';

export class ManageUserGroups {
    constructor(options = {}) {
        // Required
        this.containerEl = options.container || null;
        this.store = options.store || null;

        // Optional 
        this.onError = options.onError || ((title, msg) => console.error(`[ManageUserGroups] ${title}: ${msg}`));
        this.onUserGroupsUpdated = options.onUserGroupsUpdated || (() => { });
        this.onMembershipUpdated = options.onMembershipUpdated || (() => { });
        this.onViewUserGroups = options.onViewUserGroups || ((username) => { });
        this.onAddUserClick = options.onAddUserClick || ((selectedGroup) => { });
        this.onConfirmNewGroup = options.onConfirmNewGroup || ((groupName) => Promise.resolve(true));
        this.onConfirmRemoveMember = options.onConfirmRemoveMember || ((group, username) => Promise.resolve(true));
    
        // State
        this.groups = [];
        this.selectedGroup = null;
        this.members = [];
        this.loading = {
            groups: false,
            members: false
        };
        this.sortField = 'name';
        this.sortDirection = 'asc';
        this.memberSortField = 'member_username';
        this.memberSortDirection = 'asc';

        // Element refs
        this.groupListBody = null;
        this.memberListBody = null;
        this.security = getFreshSecurity(this.store);
        
        // Responsive table instances
        this.groupsTable = null;
        this.membersTable = null;

        // Bind methods - IMPORTANT: These methods must all exist!
        this.handleGroupClick = this.handleGroupClick.bind(this);
        this.handleMemberClick = this.handleMemberClick.bind(this);
        this.handleRemoveMember = this.handleRemoveMember.bind(this);
        this.handleViewUserGroups = this.handleViewUserGroups.bind(this);
    }

    render() {
        console.log("******** RENDERING MAIN UI ********");
        if (!this.containerEl) {
            console.error("[ManageUserGroups] No container element provided");
            return;
        }

        this.containerEl.innerHTML = `
      <div class="corpus-two-pane-container">
        <!-- Top control bar -->
        <div class="corpus-two-pane-header">
          <div class="corpus-approvals-controls">
            <button id="add-user-button" class="btn btn--primary">
              <i class="fas fa-user-plus"></i> Add User to Group
            </button>
            <button id="refresh-button" class="btn btn--secondary">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
        </div>
        
        <!-- Two-pane content -->
        <div class="corpus-two-pane-content-skinny-left">
          <!-- Left pane: Groups list -->
          <div class="corpus-two-pane-left-skinny-left">
            <div id="groups-table-container"></div>
          </div>
          
          <!-- Right pane: Group members -->
          <div class="corpus-two-pane-right-skinny-left">
            <div id="members-table-container"></div>
          </div>
        </div>
      </div>
    `;

        // Store references to key elements
        this.groupsTableContainer = this.containerEl.querySelector('#groups-table-container');
        this.membersTableContainer = this.containerEl.querySelector('#members-table-container');

        // Initialize responsive tables
        this.initializeResponsiveTables();

        // Attach event listeners
        this.attachEventListeners();

        // Load initial data
        this.loadGroups();
    }

    initializeResponsiveTables() {
        console.log("******** INITIALIZING RESPONSIVE TABLES ********");
        
        // Initialize groups table
        this.groupsTable = new ResponsiveTable({
            selectable: false,
            sortable: true,
            emptyMessage: 'No user groups available',
            className: 'responsive-table',
            onSort: (field, direction) => {
                this.sortField = field;
                this.sortDirection = direction;
                this.sortGroups();
                this.renderGroupsTable();
            },
            onRowClick: (group, index, event) => {
                this.selectGroup(group._originalData);
            }
        });
        
        this.groupsTable.attachToDOM(this.groupsTableContainer);
        this.groupsTable.setColumns(this.getGroupsTableColumns());

        // Initialize members table
        this.membersTable = new ResponsiveTable({
            selectable: false,
            sortable: true,
            emptyMessage: 'Select a group to view members',
            className: 'responsive-table',
            onSort: (field, direction) => {
                this.memberSortField = field;
                this.memberSortDirection = direction;
                this.sortMembers();
                this.renderMembersTable();
            },
            onRowClick: (member, index, event) => {
                // No action on row click - actions are handled by buttons
            }
        });
        
        this.membersTable.attachToDOM(this.membersTableContainer);
        this.membersTable.setColumns(this.getMembersTableColumns());
    }

    getGroupsTableColumns() {
        return [
            {
                key: 'name',
                label: 'Group Name',
                primary: true,
                sortable: true,
                render: (value) => {
                    return `<i class="fas fa-users" style="margin-right: 8px;"></i><span>${this.escapeHtml(value)}</span>`;
                }
            },
            {
                key: 'memberCount',
                label: 'Members',
                sortable: true,
                render: (value) => {
                    return `<span class="badge">${value || 0}</span>`;
                }
            }
        ];
    }

    getMembersTableColumns() {
        return [
            {
                key: 'member_username',
                label: 'Username',
                primary: true,
                sortable: true,
                render: (value) => {
                    return `<i class="fas fa-user" style="margin-right: 8px;"></i><span>${this.escapeHtml(value)}</span>`;
                }
            },
            {
                key: 'added_datetime',
                label: 'Date Added',
                sortable: true,
                secondary: true,
                type: 'date',
                render: (value) => {
                    return value && value !== 'Unknown' ? this.formatDate(value) : '<span class="text-muted">Unknown</span>';
                }
            },
            {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                className: 'row-actions',
                showLabel: false,
                render: (value, item) => {
                    return `
                        <div class="action-buttons" style="display: flex; gap: 4px;">
                            <button class="btn btn--small btn--danger remove-member-btn" 
                                    data-username="${item.member_username}" 
                                    title="Remove from group">
                                <i class="fas fa-user-minus"></i>
                            </button>
                            <button class="btn btn--small view-user-groups-btn" 
                                    data-username="${item.member_username}" 
                                    title="View user's groups">
                                <i class="fas fa-users"></i>
                            </button>
                        </div>
                    `;
                }
            }
        ];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    attachEventListeners() {
        console.log("******** ATTACHING EVENT LISTENERS ********");
        // Add user button
        const addUserBtn = this.containerEl.querySelector('#add-user-button');
        addUserBtn?.addEventListener('click', () => this.onAddUserClick(this.selectedGroup));

        // Refresh button
        const refreshBtn = this.containerEl.querySelector('#refresh-button');
        refreshBtn?.addEventListener('click', () => {
            // Clear usergroups cache before refreshing
            if (typeof clearUserGroupsCache === 'function') {
                clearUserGroupsCache();
            }
            this.loadGroups(true); // Force refresh
        });

        // Action button event delegation for members table
        this.containerEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-member-btn') || e.target.closest('.remove-member-btn')) {
                const btn = e.target.classList.contains('remove-member-btn') ? e.target : e.target.closest('.remove-member-btn');
                const username = btn.dataset.username;
                if (username) {
                    e.stopPropagation();
                    this.handleRemoveMember(username);
                }
            } else if (e.target.classList.contains('view-user-groups-btn') || e.target.closest('.view-user-groups-btn')) {
                const btn = e.target.classList.contains('view-user-groups-btn') ? e.target : e.target.closest('.view-user-groups-btn');
                const username = btn.dataset.username;
                if (username) {
                    e.stopPropagation();
                    this.handleViewUserGroups(username);
                }
            }
        });
    }

    async loadGroups(forceRefresh = false) {
        console.log(`******** LOADING GROUPS (force=${forceRefresh}) ********`);
        try {
            this.setLoading(true, 'groups');

            // Clear cache if forcing refresh
            if (forceRefresh && typeof clearUserGroupsCache === 'function') {
                clearUserGroupsCache();
                console.log("[ManageUserGroups] Cache cleared for forced refresh");
            }

            console.log("[ManageUserGroups] Making API call to list user groups");
            // Fetch all groups (pass false to get all groups, not just accessible ones)
            const response = await listUserGroups(false);
            console.log("[ManageUserGroups] API call completed:", response);
            this.groups = response.groups || [];

            console.log("[ManageUserGroups] Loaded", this.groups.length, "groups:", this.groups.map(g => g.name).join(', '));

            // Sort and render
            this.sortGroups();
            this.renderGroupsTable();

            // If we had a previously selected group, try to reselect it
            if (this.selectedGroup) {
                console.log("[ManageUserGroups] Had previously selected group:", this.selectedGroup.name);
                const group = this.groups.find(g => g.name === this.selectedGroup.name);
                if (group) {
                    console.log("[ManageUserGroups] Re-selecting previously selected group");
                    this.selectGroup(group);
                } else {
                    console.log("[ManageUserGroups] Previously selected group no longer exists");
                    this.selectedGroup = null;
                    this.members = [];
                    this.renderMembersTable(); // Clear the members list UI
                }
            }

        } catch (error) {
            console.error("[ManageUserGroups] Error loading groups:", error);
            this.onError("Load Error", `Failed to load user groups: ${error.message}`);
            if (this.groupsTable) {
                this.groupsTable.setData([]);
            }
        } finally {
            this.setLoading(false, 'groups');
        }
    }

    async loadGroupMembers(group) {
        console.log(`******** LOADING MEMBERS FOR "${group.name}" ********`);
        if (!group) {
            console.error("[ManageUserGroups] Cannot load members - group is null!");
            return;
        }

        console.log("[ManageUserGroups] Group data:", JSON.stringify(group));

        try {
            console.log("[ManageUserGroups] Processing members for group");

            // Create member objects from the group data
            // Backend now returns member objects with metadata
            this.members = (group.members || []).map(member => {
                if (typeof member === 'string') {
                    // Legacy format - simple username string (for backward compatibility)
                    return {
                        member_username: member,
                        added_datetime: 'Unknown'
                    };
                } else if (typeof member === 'object') {
                    // New format - object with metadata
                    return {
                        member_username: member.username || member.member_username,
                        added_datetime: member.added_datetime || 'Unknown'
                    };
                } else {
                    // Fallback for unexpected data types
                    return {
                        member_username: String(member),
                        added_datetime: 'Unknown'
                    };
                }
            });

            console.log("[ManageUserGroups] Created member objects:", JSON.stringify(this.members));

            // Sort and render
            this.sortMembers();
            this.renderMembersTable();

        } catch (error) {
            console.error("[ManageUserGroups] Error loading members:", error);
            this.onError("Load Error", `Failed to load group members: ${error.message}`);
            if (this.membersTable) {
                this.membersTable.setData([]);
            }
        }
    }

    renderSortIndicator(field, isMember = false) {
        const currentField = isMember ? this.memberSortField : this.sortField;
        const currentDirection = isMember ? this.memberSortDirection : this.sortDirection;

        if (currentField !== field) return '';

        return currentDirection === 'asc'
            ? '<i class="fas fa-sort-up"></i>'
            : '<i class="fas fa-sort-down"></i>';
    }

    renderGroupsTable() {
        console.log(`******** RENDERING GROUPS TABLE (${this.groups.length} groups) ********`);
        if (!this.groupsTable) {
            console.error("[ManageUserGroups] No groups table initialized!");
            return;
        }

        if (this.loading.groups) {
            console.log("[ManageUserGroups] Showing loading state for groups");
            this.groupsTable.setData([]);
            return;
        }

        // Prepare data for the responsive table
        const tableData = this.groups.map(group => ({
            name: this.formatGroupName(group.name),
            memberCount: (group.members || []).length,
            _originalData: group // Keep reference to original group object
        }));

        console.log("[ManageUserGroups] Setting groups table data:", tableData.length, "items");
        this.groupsTable.setData(tableData);
        
        // Update selection
        this.updateGroupsTableSelection();
    }

    renderMembersTable() {
        console.log(`******** RENDERING MEMBERS TABLE (${this.members.length} members) ********`);
        if (!this.membersTable) {
            console.error("[ManageUserGroups] No members table initialized!");
            return;
        }

        if (this.loading.members) {
            console.log("[ManageUserGroups] Showing loading state for members");
            this.membersTable.setData([]);
            return;
        }

        if (!this.selectedGroup) {
            console.log("[ManageUserGroups] No group selected - showing placeholder");
            this.membersTable.setData([]);
            return;
        }

        console.log("[ManageUserGroups] Rendering members:", this.members.map(m => m.member_username).join(", "));

        // Prepare data for the responsive table
        const tableData = this.members.map(member => ({
            member_username: member.member_username,
            added_datetime: member.added_datetime,
            actions: '' // This will be rendered by the column render function
        }));

        console.log("[ManageUserGroups] Setting members table data:", tableData.length, "items");
        this.membersTable.setData(tableData);
    }

    updateGroupsTableSelection() {
        if (!this.groupsTable || !this.selectedGroup) return;

        // Update selection styling in the responsive table
        const rows = this.groupsTable.container?.querySelectorAll('.responsive-table-row');
        if (!rows) return;

        rows.forEach((row, index) => {
            const rowData = this.groupsTable.data[index];
            if (rowData && rowData._originalData && rowData._originalData.name === this.selectedGroup.name) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
    }

    handleGroupClick(e) {
        console.log("******** GROUP ROW CLICKED ********");
        const row = e.currentTarget;
        console.log("[ManageUserGroups] Group row clicked:", row);
        console.log("[ManageUserGroups] Group row dataset:", row.dataset);

        const groupName = row.dataset.group;
        console.log("[ManageUserGroups] Clicked group name:", groupName);

        // Find the group object
        const group = this.groups.find(g => g.name === groupName);
        if (!group) {
            console.error(`[ManageUserGroups] Group not found: "${groupName}"`);
            console.log("[ManageUserGroups] Available groups:", this.groups.map(g => g.name));
            return;
        }

        console.log(`[ManageUserGroups] Group found in data, members: ${group.members?.length || 0}`);
        this.selectGroup(group);
    }

    // THIS METHOD WAS MISSING - ADDING IT NOW
    selectGroup(group) {
        console.log("******** SELECTING GROUP ********");
        console.log(`[ManageUserGroups] Setting selected group to: ${group.name}`);

        // Update selection
        this.selectedGroup = group;

        // Re-render the group list to update selection styling
        console.log("[ManageUserGroups] Re-rendering group list to update selection");
        this.updateGroupsTableSelection();

        // Load members from the already available data WITHOUT setting loading state
        console.log(`[ManageUserGroups] Loading members for ${group.name} with ${group.members?.length || 0} members`);
        this.loadGroupMembers(group);
    }

    handleMemberClick(e) {
        // This is just an empty handler function since we're only using buttons on members
        console.log("[ManageUserGroups] Member row clicked");
        // No action needed - using action buttons instead
    }

    async handleRemoveMember(username) {
        if (!this.selectedGroup) {
          console.error("[ManageUserGroups] Cannot remove member - no group selected");
          return;
        }
        
        try {
          // Add confirmation dialog
          const confirmed = await this.onConfirmRemoveMember(this.selectedGroup, username);
          if (!confirmed) {
            return; // User canceled the removal
          }
          
          console.log(`[ManageUserGroups] Removing member ${username} from ${this.selectedGroup.name}`);
          
          // Use the more efficient single-member removal API
          await removeGroupMember({
            name: this.selectedGroup.name,
            username: username
          });
          
          console.log("[ManageUserGroups] API call successful, updating UI");
          
          // Update local state - handle both string and object member formats
          if (Array.isArray(this.selectedGroup.members) && this.selectedGroup.members.length > 0) {
            if (typeof this.selectedGroup.members[0] === 'string') {
              // Legacy string format
              this.selectedGroup.members = this.selectedGroup.members.filter(m => m !== username);
            } else {
              // New object format
              this.selectedGroup.members = this.selectedGroup.members.filter(m => m.username !== username);
            }
          }
          this.members = this.members.filter(m => m.member_username !== username);
          
          // Render updated members list
          this.renderMembersTable();
          
          // Re-render group list to update member count
          this.renderGroupsTable();
          
          // Notify parent about the update
          this.onMembershipUpdated(this.selectedGroup, username, 'removed');
          
        } catch (error) {
          console.error("[ManageUserGroups] Error removing member:", error);
          this.onError("Remove Error", `Failed to remove user from group: ${error.message}`);
        }
      }

    handleViewUserGroups(username) {
        this.onViewUserGroups(username);
    }

    // Check if group exists
    doesGroupExist(groupName) {
        return this.groups.some(g => g.name === groupName);
    }

    async addUserToGroup(groupName, username) {
        try {
          this.setLoading(true, 'groups');
          
          // Check if group exists
          const groupExists = this.doesGroupExist(groupName);
          
          if (groupExists) {
            // Group exists, add the user with the single-member API
            console.log(`[ManageUserGroups] Adding user ${username} to existing group ${groupName}`);
            
            await addGroupMember({
              name: groupName,
              username: username
            });
            
            // Update local state immediately for responsive UI
            const group = this.groups.find(g => g.name === groupName);
            if (group) {
              // Check if user is already in group (handle both string and object formats)
              const isAlreadyMember = Array.isArray(group.members) && group.members.some(m => 
                typeof m === 'string' ? m === username : m.username === username
              );
              
              if (!isAlreadyMember) {
                // Add as object format (new backend response)
                group.members.push({
                  username: username,
                  added_datetime: new Date().toISOString()
                });
                console.log(`[ManageUserGroups] Updated local group state for ${groupName}`);
              }
            }
            
            // If this is the selected group, update the members array and UI
            if (this.selectedGroup && this.selectedGroup.name === groupName) {
              // Check if user is already in selected group (handle both formats)
              const isAlreadyInSelectedGroup = Array.isArray(this.selectedGroup.members) && this.selectedGroup.members.some(m => 
                typeof m === 'string' ? m === username : m.username === username
              );
              
              if (!isAlreadyInSelectedGroup) {
                // Add to selected group (may be string or object format)
                this.selectedGroup.members.push({
                  username: username,
                  added_datetime: new Date().toISOString()
                });
              }
              
              // Update the members list immediately without reloading from server
              this.members.push({
                member_username: username,
                added_datetime: new Date().toISOString()
              });
              
              // Re-render the members list and group list to show updated counts
              this.sortMembers();
              this.renderMembersTable();
              this.renderGroupsTable(); // Update member count display
            } else {
              // Just update the group list to show new member count
              this.renderGroupsTable();
            }
          } else {
            // Group doesn't exist, confirm creation
            const shouldCreate = await this.onConfirmNewGroup(groupName);
            if (!shouldCreate) {
              this.setLoading(false, 'groups');
              return false;
            }
            
            console.log(`[ManageUserGroups] Creating new group ${groupName} with member ${username}`);
            
            // Create new group with initial member
            await createUserGroup({
              name: groupName,
              members: [username]
            });
            
            // For new groups, reload all data to get the fresh group
            await this.loadGroups(true);
          }
          
          // Notify parent about the update
          this.onMembershipUpdated(
            this.groups.find(g => g.name === groupName) || { name: groupName },
            username,
            'added'
          );
          
          return true;
        } catch (error) {
          console.error("[ManageUserGroups] Error adding user to group:", error);
          
          // Special handling for missing users
          if (error.response && error.response.data && error.response.data.missing_users) {
            const missingUsers = error.response.data.missing_users;
            this.onError("Invalid User", `The following username(s) do not exist: ${missingUsers.join(', ')}`);
          } else {
            this.onError("Add Error", `Failed to add user to group: ${error.message}`);
          }
          
          throw error; // Re-throw to allow caller to handle
        } finally {
          this.setLoading(false, 'groups');
        }
      }

    handleSortChange(field) {
        // Toggle direction if same field, otherwise set to asc
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }

        // Re-sort and render
        this.sortGroups();
        this.renderGroupsTable();
    }

    handleMemberSortChange(field) {
        // Toggle direction if same field, otherwise set to asc
        if (this.memberSortField === field) {
            this.memberSortDirection = this.memberSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.memberSortField = field;
            this.memberSortDirection = 'asc';
        }

        // Re-sort and render
        this.sortMembers();
        this.renderMembersTable();
    }

    sortGroups() {
        if (!this.groups || !this.groups.length) return;

        this.groups.sort((a, b) => {
            let aVal, bVal;

            if (this.sortField === 'name') {
                aVal = a.name;
                bVal = b.name;
            } else if (this.sortField === 'members') {
                aVal = (a.members || []).length;
                bVal = (b.members || []).length;
            } else {
                aVal = a[this.sortField];
                bVal = b[this.sortField];
            }

            // Handle nulls
            if (aVal === null || aVal === undefined) aVal = '';
            if (bVal === null || bVal === undefined) bVal = '';

            // Sort
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            } else {
                const aStr = String(aVal).toLowerCase();
                const bStr = String(bVal).toLowerCase();
                return this.sortDirection === 'asc'
                    ? aStr.localeCompare(bStr)
                    : bStr.localeCompare(aStr);
            }
        });
    }

    sortMembers() {
        if (!this.members || !this.members.length) return;

        this.members.sort((a, b) => {
            let aVal = a[this.memberSortField];
            let bVal = b[this.memberSortField];

            // Handle nulls
            if (aVal === null || aVal === undefined) aVal = '';
            if (bVal === null || bVal === undefined) bVal = '';

            // Sort
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return this.memberSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            } else {
                const aStr = String(aVal).toLowerCase();
                const bStr = String(bVal).toLowerCase();
                return this.memberSortDirection === 'asc'
                    ? aStr.localeCompare(bStr)
                    : bStr.localeCompare(aStr);
            }
        });
    }

    formatGroupName(name) {
        // Remove 'Group:' prefix if present
        return name.replace(/^Group:/, '');
    }

    formatDate(dateStr) {
        if (!dateStr || dateStr === 'Unknown') return 'Unknown';

        try {
            return formatHumanReadableDate(dateStr, true); // Use compact format
        } catch (e) {
            return dateStr;
        }
    }

    setLoading(isLoading, target) {
        console.log(`[ManageUserGroups] Setting loading state to ${isLoading} for target ${target}`);
        this.loading[target] = isLoading;

        if (target === 'groups') {
            console.log(`[ManageUserGroups] Rendering ${isLoading ? 'loading' : 'content'} state for groups list`);
            this.renderGroupsTable();
        } else if (target === 'members') {
            console.log(`[ManageUserGroups] Rendering ${isLoading ? 'loading' : 'content'} state for members list`);
            this.renderMembersTable();
        }
    }

    destroy() {
        // Clean up responsive tables
        if (this.groupsTable) {
            this.groupsTable.destroy();
            this.groupsTable = null;
        }
        
        if (this.membersTable) {
            this.membersTable.destroy();
            this.membersTable = null;
        }

        // Clear references
        this.groupsTableContainer = null;
        this.membersTableContainer = null;
        this.containerEl = null;
    }
}