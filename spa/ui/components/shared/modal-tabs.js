// ui/components/shared/modal-tabs.js

/**
 * Excel-style tab navigation for modals
 * Displays tabs at the bottom of a modal, similar to Excel worksheets.
 * Based on the TopicTabs component for styling and behavior consistency.
 * 
 * This is used in the Excel/CSV data import wizard.
 */
export class ModalTabs {
    /**
     * Create a new ModalTabs instance
     * @param {Object} options - Configuration options
     * @param {Array} options.tabs - Array of tab objects: {id, name, badge, disabled, excluded}
     * @param {string} options.currentTabId - ID of the currently active tab
     * @param {Function} options.onTabSelected - Callback when a tab is selected
     */
    constructor(options = {}) {
        this.tabs = options.tabs || [];
        this.currentTabId = options.currentTabId || (this.tabs.length > 0 ? this.tabs[0].id : null);
        this.onTabSelected = options.onTabSelected || (() => {});
        
        this.tabsWrapper = null;
        this.tabsScroller = null;
        this.scrollDebounceTimer = null;
        
    }
    
    /**
     * Render the tabs component
     * @param {HTMLElement} container - Container element
     */
    render(container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        // Create tabs container
        const tabsContainer = document.createElement('div');
        tabsContainer.classList.add('import-modal-tabs-container');
        
        // Add left scroll button
        const leftScrollButton = document.createElement('button');
        leftScrollButton.classList.add('scroll-btn', 'left-scroll');
        leftScrollButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
        leftScrollButton.addEventListener('click', () => this.scrollTabs('left'));
        leftScrollButton.style.opacity = '0.3'; // Initially faded
        tabsContainer.appendChild(leftScrollButton);
        
        // Create scrollable tabs wrapper
        this.tabsScroller = document.createElement('div');
        this.tabsScroller.classList.add('grid-tabs-scroller');
        tabsContainer.appendChild(this.tabsScroller);
        
        // Create the actual tabs wrapper
        this.tabsWrapper = document.createElement('div');
        this.tabsWrapper.classList.add('worksheet-tabs-modal-wrapper');
        this.tabsScroller.appendChild(this.tabsWrapper);
        
        // If no tabs, show empty message
        if (this.tabs.length === 0) {
            const emptyTab = document.createElement('div');
            emptyTab.classList.add('worksheet-tab-modal-container');
            
            const emptyButton = document.createElement('button');
            emptyButton.classList.add('worksheet-tab-modal');
            emptyButton.textContent = 'No tabs available';
            emptyButton.style.fontStyle = 'italic';
            emptyButton.style.opacity = '0.7';
            
            emptyTab.appendChild(emptyButton);
            this.tabsWrapper.appendChild(emptyTab);
        } else {
            // Render all tabs
            this.tabs.forEach(tab => {
                const tabContainer = document.createElement('div');
                tabContainer.classList.add('worksheet-tab-modal-container');
                
                const tabButton = document.createElement('button');
                tabButton.classList.add('worksheet-tab-modal');
                tabButton.setAttribute('data-tab-id', tab.id);
                
                // Set active class if this is the current tab
                if (tab.id === this.currentTabId) {
                    tabButton.classList.add('active');
                }
                
                // Set disabled class if tab is disabled
                if (tab.disabled) {
                    tabButton.classList.add('disabled');
                }
                
                // Set excluded class if tab is excluded
                if (tab.excluded) {
                    tabButton.classList.add('excluded');
                }
                
                tabButton.textContent = tab.name || tab.id;
                
                // Add badge if present
                if (tab.badge) {
                    const badge = document.createElement('span');
                    badge.classList.add('worksheet-tab-modal-badge');
                    badge.textContent = tab.badge;
                    tabContainer.appendChild(badge);
                }
                
                // Add click handler
                tabButton.addEventListener('click', () => {
                    if (tab.disabled) return;
                    if (tab.id !== this.currentTabId) {
                        this.setCurrentTabId(tab.id);
                    }
                });
                
                tabContainer.appendChild(tabButton);
                this.tabsWrapper.appendChild(tabContainer);
            });
        }
        
        // Add right scroll button
        const rightScrollButton = document.createElement('button');
        rightScrollButton.classList.add('scroll-btn', 'right-scroll');
        rightScrollButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
        rightScrollButton.addEventListener('click', () => this.scrollTabs('right'));
        tabsContainer.appendChild(rightScrollButton);
        
        container.appendChild(tabsContainer);
        
        // Update scroll button visibility
        this.updateScrollButtons();
        
        // Add scroll event listener with debounce
        this.tabsScroller.addEventListener('scroll', () => {
            if (this.scrollDebounceTimer) {
                clearTimeout(this.scrollDebounceTimer);
            }
            
            this.scrollDebounceTimer = setTimeout(() => {
                this.updateScrollButtons();
            }, 50);
        });
        
        // If we have a current tab, scroll it into view
        if (this.currentTabId) {
            const activeTab = this.tabsWrapper.querySelector(`.worksheet-tab-modal[data-tab-id="${this.currentTabId}"]`);
            if (activeTab) {
                this.scrollTabIntoView(activeTab);
            }
        }
    }
    
    /**
     * Update the visibility of scroll buttons based on scroll position
     */
    updateScrollButtons() {
        if (!this.tabsScroller) return;
        
        const leftButton = document.querySelector('.tab-scroll-button.left-scroll');
        const rightButton = document.querySelector('.tab-scroll-button.right-scroll');
        
        if (!leftButton || !rightButton) return;
        
        // Show/hide left button based on scroll position
        leftButton.style.opacity = this.tabsScroller.scrollLeft > 0 ? '1' : '0.3';
        
        // Show/hide right button based on whether there's more content to scroll
        const maxScroll = this.tabsScroller.scrollWidth - this.tabsScroller.clientWidth;
        rightButton.style.opacity = this.tabsScroller.scrollLeft < maxScroll - 5 ? '1' : '0.3';
    }
    
    /**
     * Scroll the tabs left or right
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
     * Scroll to make a tab visible if needed
     * @param {HTMLElement} tabEl - The tab element
     */
    scrollTabIntoView(tabEl) {
        if (!this.tabsScroller || !tabEl) return;
        
        const tabRect = tabEl.getBoundingClientRect();
        const scrollerRect = this.tabsScroller.getBoundingClientRect();
        
        // If the tab is outside the visible area
        if (tabRect.left < scrollerRect.left || tabRect.right > scrollerRect.right) {
            // Calculate the scroll position to center the tab
            tabEl.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }
    
    /**
     * Set the current tab
     * @param {string} tabId - The ID of the tab to set as active
     */
    setCurrentTabId(tabId) {
        if (!this.tabsWrapper) return;
        
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab || tab.disabled) return;
        
        this.currentTabId = tabId;
        
        // Update active class
        const allTabs = this.tabsWrapper.querySelectorAll('.worksheet-tab-modal');
        allTabs.forEach(t => t.classList.remove('active'));
        
        const activeTab = this.tabsWrapper.querySelector(`.worksheet-tab-modal[data-tab-id="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            this.scrollTabIntoView(activeTab);
        }
        
        // Call the callback
        if (this.onTabSelected) {
            this.onTabSelected(tabId);
        }
    }
    
    /**
     * Update the list of tabs
     * @param {Array} tabs - New array of tab objects
     * @param {string} [currentTabId] - ID of the tab to set as current (optional)
     */
    updateTabs(tabs, currentTabId) {
        this.tabs = tabs || [];
        
        if (currentTabId) {
            this.currentTabId = currentTabId;
        } else if (this.tabs.length > 0 && !this.tabs.find(t => t.id === this.currentTabId)) {
            // If current tab no longer exists, select the first tab
            this.currentTabId = this.tabs[0].id;
        }
        
        // Re-render if we already have a wrapper
        if (this.tabsWrapper) {
            const container = this.tabsWrapper.closest('.import-modal-tabs-container')?.parentElement;
            if (container) {
                this.render(container);
            }
        }
    }
    
    /**
     * Update or add a badge to a tab
     * @param {string} tabId - ID of the tab to update
     * @param {string|number} badge - Badge text or number to display
     */
    updateTabBadge(tabId, badge) {
        // Update in our data
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.badge = badge;
        }
        
        // Update in the DOM if rendered
        if (this.tabsWrapper) {
            const tabContainer = this.tabsWrapper.querySelector(`.worksheet-tab-modal-container .worksheet-tab-modal[data-tab-id="${tabId}"]`)?.parentElement;
            if (tabContainer) {
                let badgeEl = tabContainer.querySelector('.worksheet-tab-modal-badge');
                
                if (badge) {
                    if (!badgeEl) {
                        badgeEl = document.createElement('span');
                        badgeEl.classList.add('worksheet-tab-modal-badge');
                        tabContainer.appendChild(badgeEl);
                    }
                    badgeEl.textContent = badge;
                } else if (badgeEl) {
                    badgeEl.remove();
                }
            }
        }
    }
    
    /**
     * Set the excluded state of a tab
     * @param {string} tabId - ID of the tab to update
     * @param {boolean} excluded - Whether the tab should be excluded
     */
    setTabExcluded(tabId, excluded) {
        // Update in our data
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.excluded = excluded;
        }
        
        // Update in the DOM if rendered
        if (this.tabsWrapper) {
            const tabEl = this.tabsWrapper.querySelector(`.worksheet-tab-modal[data-tab-id="${tabId}"]`);
            if (tabEl) {
                if (excluded) {
                    tabEl.classList.add('excluded');
                } else {
                    tabEl.classList.remove('excluded');
                }
            }
        }
    }
    
    /**
     * Enable or disable a tab
     * @param {string} tabId - ID of the tab to enable/disable
     * @param {boolean} disabled - Whether the tab should be disabled
     */
    setTabDisabled(tabId, disabled) {
        // Update in our data
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.disabled = disabled;
        }
        
        // Update in the DOM if rendered
        if (this.tabsWrapper) {
            const tabEl = this.tabsWrapper.querySelector(`.worksheet-tab-modal[data-tab-id="${tabId}"]`);
            if (tabEl) {
                if (disabled) {
                    tabEl.classList.add('disabled');
                } else {
                    tabEl.classList.remove('disabled');
                }
            }
        }
    }
    
    /**
     * Get visible (non-excluded) tabs
     * @returns {Array} Array of visible tab objects
     */
    getVisibleTabs() {
        return this.tabs.filter(tab => !tab.excluded);
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        if (this.scrollDebounceTimer) {
            clearTimeout(this.scrollDebounceTimer);
            this.scrollDebounceTimer = null;
        }
    }
}

export default ModalTabs;