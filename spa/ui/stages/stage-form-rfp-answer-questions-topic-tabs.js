// File: ui/stages/stage-form-rfp-answer-questions-topic-tabs.js
import { TextPromptModal } from "../../ui/modals/text-prompt-modal.js";
import { YesNoModal } from "../../ui/modals/yesno-modal.js";
import { ErrorModal } from "../../ui/modals/error-modal.js";
import { fetchDocumentItems, renameDocumentItemGroup } from "../../api/documents.js";

/**
 * TopicTabs
 * Renders a row of tabs in Excel/Google Sheets style
 * with scroll buttons and a "+" button to add new topics.
 * Enhanced with rename (double-click) and delete functionality.
 * 
 * @optimized Performance improvements:
 * - Optimized DOM manipulation
 * - Better visual feedback during loading
 * - Debounced scroll handlers
 * - Cached item counts
 * - Lazy loading for tab data only when needed
 */
export class TopicTabs {
    constructor({ groups, currentGroupId, onTabSelected, onAddNewTopic, onDeleteTopic, projectDocumentId, stageId, errorModal }) {
        this.groups = groups || [];
        this.currentGroupId = currentGroupId || null;
        this.onTabSelected = onTabSelected;
        this.onAddNewTopic = onAddNewTopic;
        this.onDeleteTopic = onDeleteTopic;
        this.projectDocumentId = projectDocumentId;
        this.stageId = stageId;
        this.tabsWrapper = null;
        this.tabsScroller = null;
        this.yesNoModal = new YesNoModal();
        this.errorModal = errorModal || new ErrorModal();

        // Keep track of which groups have items
        this.groupItemCounts = {};
        
        // Track which tabs have been checked already
        this.checkedGroups = new Set();
        
        // Debounce timers
        this.scrollDebounceTimer = null;
        this.itemCountDebounceTimer = null;
        
        // Add CSS for loading indicators
        this.addLoadingStyles();
    }

    /**
     * Add CSS styles for loading indicators
     */
    addLoadingStyles() {
        if (document.getElementById('topic-tabs-loading-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'topic-tabs-loading-styles';
        
        document.head.appendChild(style);
    }

    render(container) {
        console.log("[TopicTabs] render() called with groups:", this.groups, "and currentGroupId:", this.currentGroupId);
        container.innerHTML = "";

        // Create Excel-like tabs container
        const tabsContainer = document.createElement("div");
        tabsContainer.classList.add("excel-tabs-container");

        // Add scroll buttons
        const leftScrollButton = document.createElement("button");
        leftScrollButton.classList.add("scroll-btn", "left-scroll");
        leftScrollButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
        leftScrollButton.addEventListener("click", () => this.scrollTabs('left'));
        leftScrollButton.style.opacity = '0.3'; // Initially faded
        tabsContainer.appendChild(leftScrollButton);

        // Create scrollable tabs wrapper
        this.tabsScroller = document.createElement("div");
        this.tabsScroller.classList.add("grid-tabs-scroller");
        tabsContainer.appendChild(this.tabsScroller);

        // Create the actual tabs wrapper
        this.tabsWrapper = document.createElement("div");
        this.tabsWrapper.classList.add("excel-tabs-wrapper");
        this.tabsScroller.appendChild(this.tabsWrapper);

        // If no groups, show loading or empty message
        if (this.groups.length === 0) {
            const emptyTab = document.createElement("div");
            emptyTab.classList.add("excel-tab-container");
            
            const emptyButton = document.createElement("button");
            emptyButton.classList.add("excel-tab");
            emptyButton.textContent = "No topic sheets available";
            emptyButton.style.fontStyle = "italic";
            emptyButton.style.opacity = "0.7";
            
            emptyTab.appendChild(emptyButton);
            this.tabsWrapper.appendChild(emptyTab);
        } else {
            // Build tabs for each group with optimized batch rendering
            this.renderGroupTabs();
        }

        // Add right scroll button
        const rightScrollButton = document.createElement("button");
        rightScrollButton.classList.add("scroll-btn", "right-scroll");
        rightScrollButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
        rightScrollButton.addEventListener("click", () => this.scrollTabs('right'));
        tabsContainer.appendChild(rightScrollButton);

        // Add "+" button to create new topic
        const addButton = document.createElement("button");
        addButton.classList.add("tab-add-button");
        addButton.innerHTML = '<i class="fas fa-plus"></i>';
        addButton.addEventListener("click", () => {
            if (this.onAddNewTopic) {
                this.onAddNewTopic();
            }
        });
        tabsContainer.appendChild(addButton);

        container.appendChild(tabsContainer);

        // Update scroll button visibility
        this.updateScrollButtons();

        // Add scroll event listener with debounce to update button visibility
        this.tabsScroller.addEventListener('scroll', () => {
            // Clear previous timer
            if (this.scrollDebounceTimer) {
                clearTimeout(this.scrollDebounceTimer);
            }
            
            // Set new timer (50ms debounce)
            this.scrollDebounceTimer = setTimeout(() => {
                this.updateScrollButtons();
            }, 50);
        });

        // Add CSS for the new elements
        this.addStyles();
        
        // Only load the data for the current tab if we have one selected
        if (this.currentGroupId) {
            this.loadTabData(this.currentGroupId);
        }

        console.log("[TopicTabs] render() complete. Tabs rendered:", this.tabsWrapper.childNodes.length);
    }
    
    /**
     * Render all group tabs with optimized DOM operations
     */
    renderGroupTabs() {
        console.log("[TopicTabs] Rendering tabs for", this.groups.length, "groups");
        
        // Create a document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        // Process groups in batches if there are many
        const batchSize = 10;
        const processNextBatch = (startIndex) => {
            const endIndex = Math.min(startIndex + batchSize, this.groups.length);
            
            for (let i = startIndex; i < endIndex; i++) {
                const grp = this.groups[i];
                const stageGroupId = grp.stage_group_id;
                
                if (!stageGroupId) {
                    console.warn("[TopicTabs] Group at index", i, "missing stage_group_id:", grp);
                    continue;
                }
                
                const rawGroupId = this._parseGroupIdFromFull(stageGroupId);
                
                // Create and append the tab
                const tabEl = this.createTabElement(rawGroupId, grp.group_name || rawGroupId);
                fragment.appendChild(tabEl);
            }
            
            // Append the fragment to the wrapper
            this.tabsWrapper.appendChild(fragment);
            
            // If there are more groups to process, schedule the next batch
            if (endIndex < this.groups.length) {
                setTimeout(() => processNextBatch(endIndex), 0);
            } else {
                // All tabs are rendered, update the active tab
                if (this.currentGroupId) {
                    this.updateActiveTab(this.currentGroupId);
                }
            }
        };
        
        // Start processing the first batch
        processNextBatch(0);
    }
    
    /**
     * Create a single tab element
     */
    createTabElement(groupId, groupName) {
        // Create the tab element
        const tabEl = document.createElement("div");
        tabEl.classList.add("excel-tab-container");

        // Create the main button part of the tab
        const tabButton = document.createElement("button");
        tabButton.classList.add("excel-tab");
        tabButton.setAttribute("data-group-id", groupId);

        // Set active class based on current group ID
        if (groupId === this.currentGroupId) {
            tabButton.classList.add("active");
        }

        tabButton.textContent = groupName;
        
        // Add item count badge (initially empty)
        const countBadge = document.createElement("span");
        countBadge.classList.add("excel-tab-badge");
        countBadge.style.display = "none"; // Hide until we have a count
        tabEl.appendChild(countBadge);

        // Add click handler - only trigger if not already active
        tabButton.addEventListener("click", () => {
            // Only take action if this tab is not already active
            if (groupId !== this.currentGroupId) {
                console.log("[TopicTabs] Tab clicked. Calling onTabSelected with:", groupId);

                // Update current group ID
                this.currentGroupId = groupId;

                // Update active tab styling
                this.updateActiveTab(groupId);
                
                // Load data for this tab if it hasn't been loaded yet
                this.loadTabData(groupId);

                // Notify parent
                if (this.onTabSelected) {
                    this.onTabSelected(groupId);
                }
            }
        });

        // Add double-click handler for renaming
        tabButton.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            this.promptToRenameTab(groupId, groupName);
        });

        // Append the main button to the container
        tabEl.appendChild(tabButton);

        // Create delete button (x)
        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("excel-tab-delete");
        deleteBtn.innerHTML = '&times;';
        deleteBtn.setAttribute("title", "Delete this topic sheet");
        deleteBtn.setAttribute("data-group-id", groupId);

        // Default to hidden - we'll show it only if the group has no items
        deleteBtn.style.display = "none";

        // Add click handler for delete button
        deleteBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await this.promptToDeleteTab(groupId);
        });

        // Append the delete button to the container
        tabEl.appendChild(deleteBtn);
        
        return tabEl;
    }

    /**
     * Load data for a specific tab only when needed
     */
    async loadTabData(groupId) {
        // Skip if already checked or if we already know the count
        if (this.checkedGroups.has(groupId) || this.groupItemCounts[groupId] !== undefined) {
            console.log(`[TopicTabs] Tab ${groupId} already loaded, skipping`);
            return;
        }
        
        // Mark this group as checked to avoid duplicate fetches
        this.checkedGroups.add(groupId);
        
        // Fetch item count and update UI for this tab
        await this.checkGroupItems(groupId);
    }

    /**
     * Add necessary CSS styles for tab delete buttons
     */
    addStyles() {
        // Check if our styles already exist
        if (document.getElementById('topic-tabs-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'topic-tabs-styles';
        styleEl.textContent = `
        .excel-tab-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          min-width: 100px; 
          max-width: 180px; 
          overflow: hidden; /* Ensure nothing escapes container */
        }
        
        .excel-tab-delete {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          border: none;
          background: transparent;
          color: #888;
          font-size: 12px;
          font-weight: bold;
          padding: 0;
          margin: 0;
          width: 16px;
          height: 16px;
          line-height: 16px;
          text-align: center;
          border-radius: 50%;
          cursor: pointer;
          z-index: 5;
          display: none;
        }
        
        .excel-tab-delete:hover {
          background-color: rgba(255, 0, 0, 0.1);
          color: #ff0000;
        }
        
        .excel-tab {
            padding-right: 30px !important; /* More space for the badge */
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
            text-align: left;
        }
      `;
        document.head.appendChild(styleEl);
    }

    /**
     * Async check if a group has any items and update delete button visibility
     * Optimized with better error handling and loading indicators
     */
    async checkGroupItems(groupId) {
        if (!this.projectDocumentId || !this.stageId) {
            console.warn("[TopicTabs] Missing projectDocumentId or stageId, can't check items");
            return;
        }

        // Show loading indicator for this tab
        this.showTabLoading(groupId, true);

        try {
            // Fetch items for this group
            const items = await fetchDocumentItems(this.projectDocumentId, this.stageId, groupId);

            // Store the count
            this.groupItemCounts[groupId] = items.length;

            // Update delete button visibility and badge
            this.updateDeleteButtonVisibility(groupId, items.length === 0);
            this.updateTabBadge(groupId, items.length);

            console.log(`[TopicTabs] Group ${groupId} has ${items.length} items`);
        } catch (err) {
            console.error(`[TopicTabs] Error checking items for group ${groupId}:`, err);
            // Default to hiding delete button on error
            this.updateDeleteButtonVisibility(groupId, false);
        } finally {
            // Hide loading indicator
            this.showTabLoading(groupId, false);
        }
    }
    
    /**
     * Show or hide loading indicator on a tab
     */
    showTabLoading(groupId, isLoading) {
        const tab = this.tabsWrapper?.querySelector(`.excel-tab[data-group-id="${groupId}"]`);
        if (!tab) return;
        
        if (isLoading) {
            tab.classList.add("excel-tab-loading");
            
            // Add loading spinner if not already present
            let spinner = tab.querySelector('.tab-loading-indicator');
            if (!spinner) {
                spinner = document.createElement('span');
                spinner.className = 'tab-loading-indicator';
                tab.appendChild(spinner);
            }
        } else {
            tab.classList.remove("excel-tab-loading");
            
            // Remove loading spinner if present
            const spinner = tab.querySelector('.tab-loading-indicator');
            if (spinner) {
                spinner.remove();
            }
        }
    }
    
    /**
     * Update the count badge on a tab
     */
    updateTabBadge(groupId, count) {
        const tabContainer = this.tabsWrapper?.querySelector(`.excel-tab-container:has(.excel-tab[data-group-id="${groupId}"])`);
        if (!tabContainer) return;
        
        const badge = tabContainer.querySelector('.excel-tab-badge');
        if (!badge) return;
        
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = "block";
        } else {
            badge.style.display = "none";
        }
    }

    /**
     * Update the visibility of a specific group's delete button
     * @param {string} groupId - The ID of the group
     * @param {boolean} showDelete - Whether to show the delete button
     */
    updateDeleteButtonVisibility(groupId, showDelete) {
        console.log(`[TopicTabs] Updating delete button visibility for ${groupId}: ${showDelete ? 'show' : 'hide'}`);

        const deleteBtn = this.tabsWrapper?.querySelector(`.excel-tab-delete[data-group-id="${groupId}"]`);
        if (deleteBtn) {
            deleteBtn.style.display = showDelete ? "block" : "none";
        } else {
            console.warn(`[TopicTabs] Delete button not found for group ${groupId}`);
        }
    }

    /**
     * Prompt user to rename a tab
     */
    promptToRenameTab(groupId, currentName) {
        console.log(`[TopicTabs] Prompting to rename tab ${groupId} from "${currentName}"`);

        if (!this.projectDocumentId || !this.stageId) {
            console.error("[TopicTabs] Cannot rename: missing projectDocumentId or stageId");
            this.errorModal.show({
                title: "Error",
                message: "Cannot rename tab: missing project or stage information."
            });
            return;
        }

        const promptModal = new TextPromptModal({
            fieldLabel: "Rename Topic Sheet",
            defaultValue: currentName,
            onOk: async (newName) => {
                try {
                    if (newName.trim() === '') {
                        this.errorModal.show({
                            title: "Error",
                            message: "Topic sheet name cannot be empty."
                        });
                        return;
                    }

                    // Show loading state on the tab
                    this.showTabLoading(groupId, true);
                    
                    // Call the API to rename
                    const updatedGroup = await renameDocumentItemGroup(
                        this.projectDocumentId,
                        this.stageId,
                        groupId,
                        newName
                    );

                    console.log(`[TopicTabs] Successfully renamed group ${groupId} to "${newName}"`, updatedGroup);

                    // Update the tab text
                    this.updateTabName(groupId, newName);

                    // Update the groups array
                    const groupIndex = this.groups.findIndex(g => g.stage_group_id.includes(`#GRP#${groupId}`));
                    if (groupIndex >= 0) {
                        this.groups[groupIndex].group_name = newName;
                    }
                } catch (err) {
                    console.error(`[TopicTabs] Error renaming group ${groupId}:`, err);
                    this.errorModal.show({
                        title: "Error Renaming Topic Sheet",
                        message: err.message || "An error occurred while renaming the topic sheet.",
                        details: err.stack
                    });
                } finally {
                    // Hide loading state
                    this.showTabLoading(groupId, false);
                }
            }
        });

        promptModal.show();
    }

    /**
     * Update a tab's display name
     */
    updateTabName(groupId, newName) {
        const tab = this.tabsWrapper?.querySelector(`.excel-tab[data-group-id="${groupId}"]`);
        if (tab) {
            tab.textContent = newName;
        }
    }

    /**
     * Prompt user to delete a tab, checking first if it's empty
     */
    async promptToDeleteTab(groupId) {
        console.log(`[TopicTabs] Prompting to delete tab ${groupId}`);

        // Check if we already know the item count
        let itemCount = this.groupItemCounts[groupId];

        // If we don't have the count yet, fetch it
        if (itemCount === undefined) {
            // Show loading indicator
            this.showTabLoading(groupId, true);
            
            try {
                const items = await fetchDocumentItems(this.projectDocumentId, this.stageId, groupId);
                itemCount = items.length;
                this.groupItemCounts[groupId] = itemCount;
                this.updateTabBadge(groupId, itemCount);
            } catch (err) {
                console.error(`[TopicTabs] Error checking items for group ${groupId}:`, err);
                this.errorModal.show({
                    title: "Error",
                    message: "Unable to check if this topic sheet is empty.",
                    details: err.message
                });
                return;
            } finally {
                // Hide loading indicator
                this.showTabLoading(groupId, false);
            }
        }

        // If the group has items, show an error
        if (itemCount > 0) {
            this.errorModal.show({
                title: "Cannot Delete",
                message: `This topic sheet contains ${itemCount} item(s). Please move or delete all items before deleting the sheet.`
            });
            return;
        }

        // Get the tab name for display in the confirmation
        const tab = this.tabsWrapper?.querySelector(`.excel-tab[data-group-id="${groupId}"]`);
        const tabName = tab ? tab.textContent : groupId;

        // Show confirmation dialog
        this.yesNoModal.show({
            title: "Delete Topic Sheet",
            message: `Are you sure you want to delete the topic sheet "${tabName}"?`,
            onYes: () => {
                // Call parent's onDeleteTopic if available
                if (this.onDeleteTopic) {
                    this.onDeleteTopic(groupId, tabName);
                }
            }
        });
    }

    /**
     * Scroll the tabs left or right with improved animation
     * @param {string} direction - 'left' or 'right'
     */
    scrollTabs(direction) {
        if (!this.tabsScroller) return;

        const scrollAmount = 200; // pixels to scroll
        const currentScroll = this.tabsScroller.scrollLeft;

        if (direction === 'left') {
            this.tabsScroller.scrollTo({
                left: Math.max(0, currentScroll - scrollAmount),
                behavior: 'smooth'
            });
        } else {
            this.tabsScroller.scrollTo({
                left: currentScroll + scrollAmount,
                behavior: 'smooth'
            });
        }
        
        // Update scroll buttons after animation
        setTimeout(() => this.updateScrollButtons(), 300);
    }

    /**
     * Update the visibility of scroll buttons based on scroll position
     */
    updateScrollButtons() {
        if (!this.tabsScroller || !this.tabsWrapper) return;

        const leftButton = document.querySelector('.scroll-btn--left-left');
        const rightButton = document.querySelector('.scroll-btn--rightright');

        if (!leftButton || !rightButton) return;

        // Show/hide left button based on scroll position
        leftButton.style.opacity = this.tabsScroller.scrollLeft > 0 ? '1' : '0.3';

        // Show/hide right button based on whether there's more content to scroll
        const maxScroll = this.tabsScroller.scrollWidth - this.tabsScroller.clientWidth;
        rightButton.style.opacity = this.tabsScroller.scrollLeft < maxScroll - 5 ? '1' : '0.3';
    }

    /**
     * Parse group ID from full stage_group_id
     * @param {string} stageGroupId Full stage group ID like "STG#stage_id#GRP#group_id"
     * @returns {string} The parsed group ID
     */
    _parseGroupIdFromFull(stageGroupId) {
        return stageGroupId.split("#GRP#")[1];
    }

    /**
     * Update the active tab styling
     * @param {string} activeGroupId - The ID of the active group
     */
    updateActiveTab(activeGroupId) {
        if (!this.tabsWrapper) return;

        console.log("[TopicTabs] updateActiveTab called with:", activeGroupId);

        // Remove active class from all tabs
        const allTabs = this.tabsWrapper.querySelectorAll(".excel-tab");
        allTabs.forEach(tab => {
            tab.classList.remove("active");
        });

        // Add active class to the selected tab
        const activeTab = this.tabsWrapper.querySelector(`.excel-tab[data-group-id="${activeGroupId}"]`);
        if (activeTab) {
            activeTab.classList.add("active");

            // Scroll to make the active tab visible if needed
            this.scrollTabIntoView(activeTab);
        } else {
            console.warn("[TopicTabs] Active tab not found for group ID:", activeGroupId);
        }
    }

    /**
     * Scroll to make a tab visible if it's outside the viewport
     * @param {HTMLElement} tabEl - The tab element
     */
    scrollTabIntoView(tabEl) {
        if (!this.tabsScroller || !tabEl) return;

        const tabRect = tabEl.getBoundingClientRect();
        const scrollerRect = this.tabsScroller.getBoundingClientRect();

        // If the tab is outside the visible area
        if (tabRect.left < scrollerRect.left || tabRect.right > scrollerRect.right) {
            // Calculate the scroll position to center the tab
            tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    /**
     * External method to update the current group ID
     * Used when the group is changed outside of the tabs
     * @param {string} groupId - The new current group ID
     */
    setCurrentGroupId(groupId) {
        console.log("[TopicTabs] setCurrentGroupId called with:", groupId);
        this.currentGroupId = groupId;
        this.updateActiveTab(groupId);
        
        // Load data for the tab if it hasn't been loaded yet
        this.loadTabData(groupId);
    }

    /**
     * Add a new tab for a new topic group
     * @param {Object} newGroup - The new group object
     */
    addNewTab(newGroup) {
        if (!this.tabsWrapper || !newGroup) return;

        const stageGroupId = newGroup.stage_group_id;
        if (!stageGroupId) {
            console.warn("[TopicTabs] New group missing stage_group_id:", newGroup);
            return;
        }

        const rawGroupId = this._parseGroupIdFromFull(stageGroupId);
        
        // Create the tab element
        const tabEl = this.createTabElement(rawGroupId, newGroup.group_name || rawGroupId);

        // Add to the wrapper
        this.tabsWrapper.appendChild(tabEl);

        // Update the groups array
        this.groups.push(newGroup);

        // Activate the new tab
        this.setCurrentGroupId(rawGroupId);

        // Scroll to show the new tab
        const tabButton = tabEl.querySelector('.excel-tab');
        this.scrollTabIntoView(tabButton);

        // Set initial item count to 0 and update badge/delete button
        this.groupItemCounts[rawGroupId] = 0;
        this.updateTabBadge(rawGroupId, 0);
        this.updateDeleteButtonVisibility(rawGroupId, true);
        
        // Mark this group as checked
        this.checkedGroups.add(rawGroupId);

        return rawGroupId;
    }

    /**
     * Notify the component that items have been added to or removed from a group
     * This will update the delete button visibility
     * Optimized with debouncing for better performance
     */
    notifyGroupItemCountChanged(groupId, count) {
        // Clear previous timer
        if (this.itemCountDebounceTimer) {
            clearTimeout(this.itemCountDebounceTimer);
        }
        
        // Set new timer (100ms debounce)
        this.itemCountDebounceTimer = setTimeout(() => {
            console.log(`[TopicTabs] Notified of item count change for ${groupId}: ${count}`);
            
            // Store the count
            this.groupItemCounts[groupId] = count;
            
            // Mark this group as checked
            this.checkedGroups.add(groupId);
            
            // Update tab badge
            this.updateTabBadge(groupId, count);
            
            // Update delete button visibility - show only if count is zero
            this.updateDeleteButtonVisibility(groupId, count === 0);
        }, 100);
    }
    
    /**
     * Clean up resources when component is destroyed
     */
    destroy() {
        // Clear any pending timers
        if (this.scrollDebounceTimer) {
            clearTimeout(this.scrollDebounceTimer);
            this.scrollDebounceTimer = null;
        }
        
        if (this.itemCountDebounceTimer) {
            clearTimeout(this.itemCountDebounceTimer);
            this.itemCountDebounceTimer = null;
        }
        
        // Clear cached data
        this.groupItemCounts = {};
        this.checkedGroups.clear();
        
        console.log("[TopicTabs] Resources cleaned up");
    }
}