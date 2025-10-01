// File: ui/top-bar/top-bar.js
import { logout } from "../../api/auth.js";
import { fetchJobs } from "../../api/jobs.js";
import { getFreshSecurity } from "../../utils/security-utils.js";
import { AccountsModal } from "../modals/accounts-modal.js";
import { DocumentsModal } from "../modals/documents-modal.js";
import { LoginModal } from "../modals/login-modal.js";
import { ProjectsModal } from "../modals/projects-modal.js";
import { RegisterModal } from "../modals/register-modal.js";
import { UserModal } from "../modals/user-modal.js";
import { UsersModal } from "../modals/users-modal.js";
import tooltip from "../framework/tooltip.js";

export class TopBar {
  constructor(store, jobController, notificationController) {
    // TopBar constructor initialized
    this.store = store;
    this.jobController = jobController;
    this.notificationController = notificationController;

    this.rootEl = null;
    this.activeDropdown = null;

    // These modals are pre-instantiated for quick access
    this.jobsModal = null;          // assigned from outside
    this.documentsModal = null;
    this.accountsModal = null;
    this.projectsModal = null;
    this.usersModal = null;

    // Pre-instantiate the DocumentsModal
    this.documentsModal = new DocumentsModal(this.store);

    // Pre-instantiate AccountsModal, ProjectsModal, UsersModal
    this.accountsModal = new AccountsModal(this.store);
    this.projectsModal = new ProjectsModal(this.store);
    this.usersModal = new UsersModal(this.store);

    // Periodic polling for job updates
    this.jobPollingInterval = null;
    this.jobPollingEnabled = false;
    this.lastJobUpdate = null;

    // Start periodic polling if user is authenticated
    this.initializePeriodicJobPolling();
  }

  attachToDOM(containerEl) {
    console.log("[TopBar] attachToDOM() called");
    this.rootEl = containerEl;
  }

  /**
   * Update router link states based on current route
   * Called by the router when route changes
   */
  updateRouterLinkStates() {
    if (!window.router || !this.rootEl) return;
    
    const links = this.rootEl.querySelectorAll('[data-router-link]');
    links.forEach(link => {
      const routeId = link.getAttribute('data-router-link');
      if (routeId) {
        const isActive = window.router.isRouteActive(routeId);
        link.classList.toggle('router-active', isActive);
        
        // Update aria-current for accessibility
        if (isActive) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      }
    });
  }

  render() {
    console.log("[TopBar] render() called");
    if (!this.rootEl) {
      console.error("[TopBar] rootEl not set");
      return;
    }

    // 1) Check login state
    const token = localStorage.getItem("authToken");
    const user = this.store.get("user");
    const isLoggedIn = !!token;
    const username = user?.username || "guest";

    // 2) Check permissions
    const security = getFreshSecurity(this.store);

    // Show accounts icon if user is system/app admin or has authorized_accounts
    const hasAnyAccountAccess =
      security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]) ||
      (Array.isArray(user.authorized_accounts) && user.authorized_accounts.length > 0);

    // Show projects icon if user is system/app admin or has authorized_projects
    const hasAnyProjectAccess =
      security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]) ||
      (Array.isArray(user.authorized_projects) && user.authorized_projects.length > 0);

    // Manage users if system or app admin
    const canManageUsers = security.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"]);

    // 3) Generate management icon HTML
    const corpusIconHtml = `
    <div class="icon corpus-icon" id="corpusIcon" 
         data-router-link="corpus" 
         data-href="/corpus" 
         aria-label="Corpus Management">
      <i class="fas fa-book-open"></i>
    </div>
    `;
    const accountsProjectsIconHtml = `
      <div class="icon accounts-projects-icon" id="accountsProjectsIcon" aria-label="Manage Accounts and Projects">
        <i class="fas fa-folder-tree"></i>
      </div>
    `;
    const usersIconHtml = `
      <div class="icon users-icon" id="usersIcon" aria-label="Manage Users">
        <i class="fas fa-users"></i>
      </div>
    `;
    const notificationsCount = this.store.get("notificationsCount") || 0;
    const docJobsIconsHtml = `
      <div class="icon open-docs-icon" id="openDocumentsIcon" aria-label="Open Documents">
        <i class="fas fa-folder-open"></i>
      </div>
      |
      <div class="icon jobs-icon" id="jobsIcon" aria-label="Jobs">
        <i class="fas fa-gears"></i>
        <span class="count" id="jobsCount" style="display: none;">0</span>
      </div>
      <div class="icon notifications-icon" id="notificationsIcon" aria-label="Notifications">
        <i class="fas fa-bell"></i>
        <span class="count" id="notificationsCount" style="display:${notificationsCount > 0 ? 'inline-block' : 'none'};">${notificationsCount}</span>
      </div>
    `;

    // Combine them only if logged in
    let managementIconsHtml = `
      ${(hasAnyAccountAccess || hasAnyProjectAccess) ? accountsProjectsIconHtml : ""}
      ${canManageUsers ? usersIconHtml : ""}
    `;

    const statusIconsHtml = isLoggedIn
      ? `
          ${managementIconsHtml}|
          ${corpusIconHtml}
          ${(hasAnyAccountAccess || hasAnyProjectAccess) ? "|" : ""}
          ${docJobsIconsHtml}
        `
      : "";

    // 4) Build final HTML
    this.rootEl.innerHTML = `
      <div class="top-bar">
        <div class="logo" 
             data-router-link="docs" 
             data-href="/docs" 
             aria-label="Application Logo">
          <img src="/assets/cognaire-respond-logo.png" alt="Cognaire" height="40">
        </div>
        <div class="top-bar-right">
          ${statusIconsHtml}
          <div class="user-pill" id="userPill">
            ${isLoggedIn
        ? `
                   <span class="username" style="cursor:pointer;" aria-label="Logged in user">${username}</span>
                   <button class="logout-link" id="logoutBtn" aria-label="Logout">
                     <i class="fas fa-sign-out-alt"></i> <span class="logout-text">Logout</span>
                   </button>
                `
        : `
                   <button class="register-link" id="registerBtn" aria-label="Register">
                     <i class="fas fa-edit"></i> Register
                   </button>
                   <span>|</span>
                   <button class="login-link" id="loginBtn" aria-label="Login">
                     <i class="fas fa-user"></i> Login
                   </button>
                `
      }
          </div>
        </div>
      </div>
    `;

    // 5) Attach event listeners (the rest of TopBar logic)
    this.addEventListeners();
    
    // 6) Attach tooltips to icons
    this.attachTooltips();
  }

  /**
   * Toggle the jobs dropdown with real job data
   * @param {Event} event - The click event
   */
  async toggleJobsDropdown(event) {
    console.log("[TopBar] toggleJobsDropdown() called");
    event.stopPropagation();
    if (this.activeDropdown === "jobs") {
      this.hideDropdowns();
      return;
    }
    this.hideDropdowns();

    // Store the position of the original button
    const iconElement = event.currentTarget;
    if (!iconElement || typeof iconElement.getBoundingClientRect !== 'function') {
      console.error("[TopBar] Invalid event target for dropdown positioning");
      return;
    }
    const iconRect = iconElement.getBoundingClientRect();
    const dropdownPosition = {
      top: `${iconRect.bottom + 5}px`,
      right: `${window.innerWidth - iconRect.right}px`
    };

    // Create enhanced dropdown with loading state
    const dropdown = document.createElement("div");
    dropdown.className = "jobs-dropdown enhanced-jobs-dropdown";
    dropdown.style.position = "absolute";
    dropdown.style.top = dropdownPosition.top;
    dropdown.style.right = dropdownPosition.right;
    dropdown.style.zIndex = "8500";
    dropdown.style.minWidth = "400px";
    dropdown.style.maxHeight = "500px";

    dropdown.innerHTML = `
        <div class="dropdown-content">
            <div class="dropdown-header">
                <div class="header-content">
                    <span class="header-title">Jobs</span>
                    <div class="header-stats">
                        <span class="loading-text">Loading...</span>
                    </div>
                </div>
                <div class="header-controls">
                    <button class="filter-btn active" data-filter="active">Active</button>
                    <button class="filter-btn" data-filter="this_week">This Week</button>
                    <button class="filter-btn" data-filter="last_week">Last Week</button>
                </div>
            </div>
            <div class="jobs-content">
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <span>Loading jobs...</span>
                </div>
            </div>
            <div class="dropdown-footer">
                <button class="refresh-btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
                <button class="view-all-btn">
                    <i class="fas fa-external-link-alt"></i> Job Manager
                </button>
                <button class="export-btn" title="Export job data">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(dropdown);
    this.activeDropdown = "jobs";

    try {
      // Get enhanced job data
      const [activeJobs, recentJobs, jobStats] = await Promise.all([
        this.jobController.getActiveJobs(10),
        this.jobController.getRecentCompletedJobs(10),
        Promise.resolve(this.jobController.getJobStats())
      ]);

      console.log("[TopBar] Job data loaded:", { activeJobs: activeJobs.length, recentJobs: recentJobs.length, stats: jobStats });

      // Update header stats
      const headerStats = dropdown.querySelector('.header-stats');
      headerStats.innerHTML = `
            <span class="stat-item">
                <i class="fas fa-play-circle stat-icon running"></i>
                ${jobStats.running || 0} Active
            </span>
            <span class="stat-item">
                <i class="fas fa-check-circle stat-icon completed"></i>
                ${jobStats.completed || 0} Done
            </span>
        `;

      // Set up filter functionality
      let currentFilter = 'active';
      const filterButtons = dropdown.querySelectorAll('.filter-btn');
      const updateJobsList = async (filter) => {
        currentFilter = filter;

        // Update active filter button
        filterButtons.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        let jobsToShow = [];
        let emptyMessage = '';

        switch (filter) {
          case 'active':
            jobsToShow = activeJobs;
            emptyMessage = 'No active jobs';
            break;
          case 'this_week':
            try {
              jobsToShow = await this.fetchJobsWithTimeFilter('this_week');
              emptyMessage = 'No jobs this week';
            } catch (error) {
              console.error('[TopBar] Failed to fetch this week jobs:', error);
              jobsToShow = [];
              emptyMessage = 'Failed to load jobs';
            }
            break;
          case 'last_week':
            try {
              jobsToShow = await this.fetchJobsWithTimeFilter('last_week');
              emptyMessage = 'No jobs last week';
            } catch (error) {
              console.error('[TopBar] Failed to fetch last week jobs:', error);
              jobsToShow = [];
              emptyMessage = 'Failed to load jobs';
            }
            break;
        }

        renderJobsList(jobsToShow, emptyMessage);
      };

      // Function to render jobs list - uses centralized method
      const renderJobsList = (jobs, emptyMessage) => {
        const content = dropdown.querySelector('.jobs-content');
        this._renderJobsList(content, jobs, emptyMessage);
      };

      // Set up filter button listeners - handle async operations
      filterButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          
          // Disable button during fetch
          btn.disabled = true;
          const originalText = btn.textContent;
          btn.textContent = 'Loading...';
          
          try {
            await updateJobsList(btn.dataset.filter);
          } finally {
            btn.disabled = false;
            btn.textContent = originalText;
          }
        });
      });

      // Set up footer button listeners
      const refreshBtn = dropdown.querySelector('.refresh-btn');
      refreshBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        // Store original button state
        const originalHTML = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        refreshBtn.disabled = true;

        try {
          // Refresh job data
          const [activeJobs, recentJobs, jobStats] = await Promise.all([
            this.jobController.refreshAllJobs().then(() => this.jobController.getActiveJobs(10)),
            this.jobController.getRecentCompletedJobs(10),
            Promise.resolve(this.jobController.getJobStats())
          ]);

          console.log("[TopBar] Jobs refreshed successfully");

          // Update header stats WITHOUT closing dropdown
          const headerStats = dropdown.querySelector('.header-stats');
          if (headerStats) {
            headerStats.innerHTML = `
              <span class="stat-item">
                <i class="fas fa-play-circle stat-icon running"></i>
                ${jobStats.running || 0} Active
              </span>
              <span class="stat-item">
                <i class="fas fa-check-circle stat-icon completed"></i>
                ${jobStats.completed || 0} Done
              </span>
            `;
          }

          // Update the jobs list in-place
          updateJobsList(currentFilter);

          // Reset button state
          refreshBtn.innerHTML = originalHTML;
          refreshBtn.disabled = false;

        } catch (err) {
          console.error("Error refreshing jobs:", err);

          // Show error in dropdown but don't close it
          const content = dropdown.querySelector('.jobs-content');
          if (content) {
            content.innerHTML = `
              <div class="error-state">
                <i class="fas fa-exclamation-circle error-icon"></i>
                <span>Failed to refresh jobs: ${err.message}</span>
                <button class="retry-btn">Retry</button>
              </div>
            `;

            // Add retry functionality
            const retryBtn = content.querySelector('.retry-btn');
            if (retryBtn) {
              retryBtn.addEventListener('click', () => {
                // Trigger refresh again
                refreshBtn.click();
              });
            }
          }

          // Reset button state
          refreshBtn.innerHTML = originalHTML;
          refreshBtn.disabled = false;
        }
      });

      const viewAllBtn = dropdown.querySelector('.view-all-btn');
      viewAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.hideDropdowns();
        
        // Try to use router navigation first (if available)
        if (typeof window.navigateWithModal === 'function') {
          try {
            await window.navigateWithModal('modals', 'jobs');
            console.log('[TopBar] Navigated to admin route with jobs modal');
            return;
          } catch (error) {
            console.warn('[TopBar] Router navigation failed, falling back to direct modal:', error);
          }
        }
        
        // Fallback to direct modal show (existing behavior)
        if (this.jobsModal) {
          this.jobsModal.show();
        }
      });

      const exportBtn = dropdown.querySelector('.export-btn');
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._exportJobData();
      });

      // Initial render with active jobs
      updateJobsList('active');

    } catch (error) {
      console.error("[TopBar] Error fetching enhanced job data:", error);

      const content = dropdown.querySelector('.jobs-content');
      content.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-circle error-icon"></i>
                <span>Failed to load jobs</span>
                <button class="retry-btn">Retry</button>
            </div>
        `;

      const retryBtn = content.querySelector('.retry-btn');
      retryBtn.addEventListener('click', () => {
        this.hideDropdowns();
        setTimeout(() => this.toggleJobsDropdown(event), 100);
      });
    }
  }

  /**
   * Refresh jobs dropdown content without recreating the dropdown
   */
  async refreshJobsDropdown() {
    const dropdown = document.querySelector('.jobs-dropdown');
    if (!dropdown) {
      return; // No dropdown to refresh
    }

    try {
      // Get fresh job data
      const [activeJobs, recentJobs, jobStats] = await Promise.all([
        this.jobController.getActiveJobs(10),
        this.jobController.getRecentCompletedJobs(10),
        Promise.resolve(this.jobController.getJobStats())
      ]);

      // Update header stats
      const headerStats = dropdown.querySelector('.header-stats');
      if (headerStats) {
        headerStats.innerHTML = `
          <span class="stat-item">
              <i class="fas fa-play-circle stat-icon running"></i>
              ${jobStats.running || 0} Active
          </span>
          <span class="stat-item">
              <i class="fas fa-check-circle stat-icon completed"></i>
              ${jobStats.completed || 0} Done
          </span>
        `;
      }

      // Get current filter and update jobs list
      const activeFilterBtn = dropdown.querySelector('.filter-btn.active');
      const currentFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'active';
      const jobsContent = dropdown.querySelector('.jobs-content');
      
      if (jobsContent) {
        let jobsToShow = [];
        let emptyMessage = '';
        
        switch (currentFilter) {
          case 'active':
            jobsToShow = activeJobs;
            emptyMessage = 'No active jobs';
            break;
          case 'recent':
            jobsToShow = recentJobs;
            emptyMessage = 'No recent jobs';
            break;
          case 'all':
            const allJobs = this.jobController.getJobsByStatus(null, 20);
            jobsToShow = allJobs;
            emptyMessage = 'No jobs found';
            break;
        }
        
        this._renderJobsList(jobsContent, jobsToShow, emptyMessage);
      }

      // Jobs dropdown refreshed successfully
    } catch (error) {
      console.error("[TopBar] Error refreshing jobs dropdown:", error);
    }
  }


  /**
   * Render jobs list in the dropdown content
   */
  _renderJobsList(content, jobs, emptyMessage) {
    if (jobs.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox empty-icon"></i>
          <span>${emptyMessage}</span>
        </div>
      `;
      return;
    }

    const jobsHtml = jobs.map(job => {
      const duration = this._calculateJobDuration(job);
      const progress = job.progress || 0;
      const statusClass = job.status.toLowerCase().replace('_', '-');

      // Job display name generation (reduced logging)

      return `
        <div class="job-item ${statusClass}" data-job-id="${job.jobId}">
          <div class="job-header">
            <div class="job-info">
              <div class="job-title" title="${job.docId || job.jobId}">
                ${this._getJobDisplayName(job)}
              </div>
              <div class="job-metadata">
                ${this._getEnhancedJobMetadata(job)}
                ${duration ? `• ${duration}` : ''}
              </div>
            </div>
            <div class="job-status">
              <span class="status-badge ${statusClass}">
                ${this._getStatusIcon(job.status)}
                ${this._formatStatus(job.status)}
              </span>
            </div>
          </div>
          
          ${this._shouldShowProgressDetails(job) ? `
            <div class="job-progress-enhanced">
              <div class="progress-bar-enhanced">
                <div class="progress-fill-enhanced" style="width: ${progress}%"></div>
                <div class="progress-shimmer"></div>
              </div>
              <div class="progress-details">
                <span class="progress-text-enhanced">${this._getProgressText(job)}</span>
                <span class="progress-phase">${this._getCurrentPhase(job)}</span>
              </div>
              ${this._getTimeEstimate(job) ? `
                <div class="time-estimate">
                  <i class="fas fa-clock"></i>
                  ${this._getTimeEstimate(job)}
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          <div class="job-actions">
            ${this._getJobActions(job)}
          </div>
        </div>
      `;
    }).join('');

    content.innerHTML = `<div class="jobs-list">${jobsHtml}</div>`;

    // Add event listeners for actions
    this._addJobActionListeners(content);
  }

  /**
   * Helper methods for enhanced dropdown
   */
  _calculateJobDuration(job) {
    if (!job.startTime) return null;

    const endTime = job.endTime || Date.now();
    const duration = endTime - job.startTime;

    if (duration < 60000) { // Less than 1 minute
      return `${Math.round(duration / 1000)}s`;
    } else if (duration < 3600000) { // Less than 1 hour
      return `${Math.round(duration / 60000)}m`;
    } else {
      return `${Math.round(duration / 3600000)}h`;
    }
  }

  _getJobDisplayName(job) {
    // Generate display name (logging reduced to avoid noise)
    
    // PRIORITY 1: Use description field if available (new clean approach)
    if (job.description) {
      return job.description;
    }
    
    // FALLBACK 1: Check if we have enhanced job metadata (legacy approach)
    if (job.processName && job.topicName && job.questionCount !== undefined) {
      // Format: "RFP Workflow - Nonfunctional (2 questions)"
      const questionText = job.questionCount === 1 ? 'question' : 'questions';
      const enhancedName = `${job.processName} - ${job.topicName} (${job.questionCount} ${questionText})`;
      return enhancedName;
    }
    
    // Fallback to document ID based display
    if (job.docId) {
      const parts = job.docId.split('#');
      return parts[parts.length - 1] || job.docId;
    }
    
    // Final fallback to job ID
    return this._truncateString(job.jobId, 20);
  }

  /**
   * Truncate string to specified length with ellipsis
   */
  _truncateString(str, maxLength) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }

  _formatStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace('_', ' ');
  }

  _getStatusIcon(status) {
    const icons = {
      'RUNNING': '<i class="fas fa-play-circle"></i>',
      'QUEUED': '<i class="fas fa-clock"></i>',
      'COMPLETED': '<i class="fas fa-check-circle"></i>',
      'FAILED': '<i class="fas fa-exclamation-circle"></i>',
      'CANCELLED': '<i class="fas fa-ban"></i>'
    };
    return icons[status] || '<i class="fas fa-question-circle"></i>';
  }

  _canOpenJob(job) {
    return job.docId && job.status !== 'RUNNING';
  }

  // ============================
  // Phase 2: Enhanced Job Display Methods
  // ============================

  /**
   * Get enhanced job metadata with detailed information
   */
  _getEnhancedJobMetadata(job) {
    const parts = [];

    // Process name if available
    if (job.processName && job.processName !== "Unknown Process") {
      parts.push(job.processName);
    }

    // Topic/Group name if available
    if (job.topicName && job.topicName !== "Unknown Topic") {
      parts.push(job.topicName);
    }

    // Question count with completion info
    if (job.totalQuestions || job.questionCount) {
      const totalQ = job.totalQuestions || job.questionCount;
      const completedCount = job.questionsCompleted || 0;
      if (job.status === 'RUNNING' && completedCount > 0) {
        parts.push(`${completedCount}/${totalQ} questions`);
      } else {
        parts.push(`${totalQ} questions`);
      }
    }

    // Model information with enhanced display
    if (job.model) {
      let modelDisplay = job.model.replace('-model', '');
      if (job.enhanced) {
        modelDisplay += ' ⚡'; // Enhanced indicator
      }
      parts.push(modelDisplay);
    }

    return parts.join(' • ');
  }

  /**
   * Determine if progress details should be shown
   */
  _shouldShowProgressDetails(job) {
    return job.status === 'RUNNING' || job.status === 'QUEUED';
  }

  /**
   * Get progress details text
   */
  _getProgressDetails(job) {
    if (job.status === 'QUEUED') {
      return 'Waiting to start';
    }

    if (job.status === 'RUNNING') {
      if (job.questionsCompleted && job.totalQuestions) {
        return `${job.questionsCompleted}/${job.totalQuestions} questions`;
      } else {
        return this._getCurrentPhase(job);
      }
    }

    return '';
  }

  /**
   * Get job action buttons
   */
  _getJobActions(job) {
    let actions = [];

    if (job.status === 'RUNNING') {
      actions.push(`
        <button class="action-btn cancel-btn" data-job-id="${job.jobId}" title="Cancel job">
          <i class="fas fa-stop"></i>
        </button>
      `);
    }

    actions.push(`
      <button class="action-btn details-btn" data-job-id="${job.jobId}" title="View details">
        <i class="fas fa-info-circle"></i>
      </button>
    `);

    if (this._canOpenJob(job)) {
      actions.push(`
        <button class="action-btn open-btn" data-job-id="${job.jobId}" title="Open document">
          <i class="fas fa-external-link-alt"></i>
        </button>
      `);
    }

    return actions.join('');
  }

  /**
   * Get detailed progress text
   */
  _getProgressText(job) {
    const progress = job.progress || 0;

    if (job.status === 'QUEUED') {
      return 'Queued for processing';
    }

    if (job.status === 'RUNNING') {
      if (job.questionsCompleted && job.totalQuestions) {
        return `Processing ${job.questionsCompleted}/${job.totalQuestions} (${progress}%)`;
      } else {
        return `${progress}% complete`;
      }
    }

    return `${progress}%`;
  }

  /**
   * Get current processing phase
   */
  _getCurrentPhase(job) {
    if (job.status === 'QUEUED') {
      return 'Waiting to start';
    }

    if (job.status === 'RUNNING') {
      // Map progress ranges to phases
      const progress = job.progress || 0;
      if (progress < 10) {
        return 'Initializing';
      } else if (progress < 30) {
        return 'Content Retrieval';
      } else if (progress < 90) {
        return 'Answer Generation';
      } else {
        return 'Finalizing';
      }
    }

    return '';
  }

  /**
   * Get time estimate for job completion
   */
  _getTimeEstimate(job) {
    if (job.status !== 'RUNNING') return null;

    // Use enhanced job data if available
    if (job.enhanced && job.enhanced.realtime_data && job.enhanced.realtime_data.estimated_completion) {
      return job.enhanced.realtime_data.estimated_completion;
    }

    // Calculate simple estimate based on progress and elapsed time
    const progress = job.progress || 0;
    if (progress > 5 && progress < 95) {
      const startTime = new Date(job.startTime);
      const elapsed = Date.now() - startTime.getTime();
      const totalEstimated = (elapsed / progress) * 100;
      const remaining = totalEstimated - elapsed;

      if (remaining > 0) {
        const minutes = Math.round(remaining / (60 * 1000));
        if (minutes > 60) {
          const hours = Math.round(minutes / 60);
          return `~${hours}h remaining`;
        } else if (minutes > 0) {
          return `~${minutes}m remaining`;
        } else {
          return '~1m remaining';
        }
      }
    }

    return null;
  }

  _addJobActionListeners(content) {
    // Cancel job buttons
    content.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const jobId = btn.dataset.jobId;

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
          await this.jobController.cancelJob(jobId);
          this.hideDropdowns();
        } catch (err) {
          console.error("Error cancelling job:", err);
          btn.innerHTML = '<i class="fas fa-stop"></i>';
          btn.disabled = false;
        }
      });
    });

    // Details buttons
    content.querySelectorAll('.details-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const jobId = btn.dataset.jobId;
        this._showJobDetails(jobId);
      });
    });

    // Open document buttons
    content.querySelectorAll('.open-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const jobId = btn.dataset.jobId;
        this._focusOrOpenJobTab(jobId);
        this.hideDropdowns();
      });
    });

    // Job item click (for details)
    content.querySelectorAll('.job-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on action buttons
        if (e.target.closest('.job-actions')) return;

        const jobId = item.dataset.jobId;
        this._showJobDetails(jobId);
      });
    });
  }

  /**
   * Focus or open a job's associated tab
   */
  _focusOrOpenJobTab(jobId) {
    const job = this.jobController.jobsMap[jobId];
    if (!job || !job.docId) {
      console.warn(`[TopBar] Cannot focus job tab - no docId for job ${jobId}`);
      return;
    }

    // Try to find existing tab
    if (window.tabManager) {
      const existingTab = window.tabManager.tabs.find(tab =>
        tab.newFrameworkDoc?.docTaskInstance?.documentId === job.docId ||
        tab.newFrameworkDoc?.docTaskInstance?.compositeId === job.docId
      );

      if (existingTab) {
        // Focus existing tab
        window.tabManager.selectTab(existingTab.id);
        console.log(`[TopBar] Focused existing tab for job ${jobId}`);
      } else {
        // Open new tab if possible
        if (window.openDocumentInNewTab) {
          window.openDocumentInNewTab(job.docId);
          console.log(`[TopBar] Opened new tab for job ${jobId}`);
        }
      }
    }
  }

  _showJobDetails(jobId) {
    this.hideDropdowns();

    if (this.jobsModal) {
      this.jobsModal.showJobDetails(jobId);
    } else {
      console.warn("[TopBar] JobsModal not available for details view");
    }
  }

  /**
   * Export job data to JSON file
   */
  _exportJobData() {
    try {
      const jobData = {
        exportTime: new Date().toISOString(),
        jobs: this.jobController.getAllJobs(),
        stats: this.jobController.getJobStats()
      };

      const blob = new Blob([JSON.stringify(jobData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `cognaire-jobs-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log("[TopBar] Job data exported successfully");
    } catch (err) {
      console.error("[TopBar] Error exporting job data:", err);
    }
  }

  toggleNotificationsDropdown(event) {
    console.log("[TopBar] toggleNotificationsDropdown() called");
    event.stopPropagation();
    if (this.activeDropdown === "notifications") {
      this.hideDropdowns();
      return;
    }
    this.hideDropdowns();

    // Store the position of the original button
    const iconRect = event.currentTarget.getBoundingClientRect();
    const dropdownPosition = {
      top: `${iconRect.bottom + 5}px`,
      right: `${window.innerWidth - iconRect.right}px`
    };

    // Show loading state initially
    const dropdown = document.createElement("div");
    dropdown.className = "notifications-dropdown";
    dropdown.style.position = "absolute";
    dropdown.style.top = dropdownPosition.top;
    dropdown.style.right = dropdownPosition.right;

    dropdown.innerHTML = `
      <div class="dropdown-content">
        <div class="dropdown-header">
          <span>Notifications</span>
        </div>
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i> Loading notifications...
        </div>
      </div>
    `;
    document.body.appendChild(dropdown);
    this.activeDropdown = "notifications";

    // Fetch fresh notifications from server
    this.notificationController.fetchNotificationsFromServer().then(notifications => {
      // Update dropdown with fetched notifications
      const content = dropdown.querySelector('.dropdown-content');
      if (!content) return;

      const unreadCount = notifications.length;
      const markAllReadBtn = unreadCount > 0
        ? `<button class="mark-all-read-btn"><i class="fas fa-check-double"></i> Mark all read</button>`
        : '';

      const notificationViewLimit = 10;

      const notificationsHtml = notifications.length
        ? notifications.slice(0, notificationViewLimit).map(n => {
          // Check if the notification has a description to add a preview button
          const hasDescription = !!n.description;
          const previewButton = hasDescription ?
            `<button class="preview-description" title="Show details"><i class="fas fa-info-circle"></i></button>` :
            '';

          return `
            <div class="notification-item ${n.read ? '' : 'unread'}" data-notif-id="${n.notification_id}">
              <div class="notification-content">
                <div class="notification-icon">
                  <i class="fas ${this._getIconForNotificationType(n.type)}"></i>
                </div>
                <div class="note-text">
                  <div class="notification-message">${n.message}</div>
                  <div class="notification-time">${this._formatTimestamp(n.notification_id)}</div>
                </div>
                ${previewButton}
              </div>
              ${hasDescription ? `<div class="notification-description" style="display:none;">
                <div class="description-content">${n.description}</div>
              </div>` : ''}
            </div>
          `;
        }).join("")
        : `<div class="empty-state">No notifications</div>`;

      content.innerHTML = `
        <div class="dropdown-header">
          <span>Notifications ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}</span>
          ${markAllReadBtn}
        </div>
        <div class="notifications-list">
          ${notificationsHtml}
        </div>
        <div class="dropdown-footer">
          <button class="refresh-btn"><i class="fas fa-sync-alt"></i> Refresh</button>
        </div>
      `;

      // Add event listeners
      const markAllBtn = content.querySelector('.mark-all-read-btn');
      if (markAllBtn) {
        markAllBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          markAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marking...';
          markAllBtn.disabled = true;
          await this.notificationController.markAllAsRead();
          this.hideDropdowns();
          this.updateNotificationCountBadge();
          this.render(); // Update notification count in UI
        });
      }

      const refreshBtn = content.querySelector('.refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
          refreshBtn.disabled = true;
          await this.notificationController.fetchNotificationsFromServer();
          this.hideDropdowns();
          this.updateNotificationCountBadge();

          // Pass a custom event that includes position information
          const customEvent = {
            currentTarget: { getBoundingClientRect: () => ({ bottom: parseInt(dropdownPosition.top) - 5, right: window.innerWidth - parseInt(dropdownPosition.right) }) },
            stopPropagation: () => { }
          };
          this.toggleNotificationsDropdown(customEvent);
        });
      }

      // Add event listeners to preview description buttons
      content.querySelectorAll('.preview-description').forEach(button => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          const notificationItem = e.target.closest('.notification-item');
          const descriptionDiv = notificationItem.querySelector('.notification-description');
          if (descriptionDiv) {
            const isShowing = descriptionDiv.style.display !== 'none';
            if (isShowing) {
              descriptionDiv.style.display = 'none';
              button.querySelector('i').classList.replace('fa-chevron-circle-up', 'fa-info-circle');
              button.title = 'Show details';
            } else {
              descriptionDiv.style.display = 'block';
              button.querySelector('i').classList.replace('fa-info-circle', 'fa-chevron-circle-up');
              button.title = 'Hide details';
            }
          }
        });
      });

      // Add click handlers for notification items
      content.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', (e) => {
          // Skip if clicking on the preview button or description
          if (e.target.closest('.preview-description') || e.target.closest('.notification-description')) {
            return;
          }

          const notificationId = item.dataset.notifId;
          // Find the notification in the controller
          const notification = this.notificationController.getNotifications().find(
            n => n.notification_id === notificationId
          );

          if (notification) {
            // Mark as read
            this.notificationController.markAsRead(notificationId);

            // Handle click based on entity type
            this.notificationController.handleNotificationClick(notification);

            // Close dropdown
            this.hideDropdowns();
          }
        });
      });

    }).catch(error => {
      console.error("[TopBar] Error fetching notifications:", error);

      // Show error state
      const content = dropdown.querySelector('.dropdown-content');
      if (content) {
        content.innerHTML = `
          <div class="dropdown-header">
            <span>Notifications</span>
          </div>
          <div class="error-state">
            <i class="fas fa-exclamation-circle"></i> 
            Failed to load notifications.
          </div>
          <div class="dropdown-footer">
            <button class="refresh-btn">Retry</button>
          </div>
        `;

        const retryBtn = content.querySelector('.refresh-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            this.hideDropdowns();
            // Pass a custom event that includes position information
            const customEvent = {
              currentTarget: { getBoundingClientRect: () => ({ bottom: parseInt(dropdownPosition.top) - 5, right: window.innerWidth - parseInt(dropdownPosition.right) }) },
              stopPropagation: () => { }
            };
            this.toggleNotificationsDropdown(customEvent);
          });
        }
      }
    });
  }

  // Helper method to get an appropriate icon for notification type
  _getIconForNotificationType(type) {
    switch (type) {
      case 'job_completion':
        return 'fa-check-circle';
      case 'job_failure':
        return 'fa-exclamation-circle';
      case 'job_change':
        return 'fa-sync-alt';
      case 'document_shared':
        return 'fa-file-alt';
      case 'corpus_document_rejected':
        return 'fa-times-circle';
      case 'corpus_document_ai_rejected':
        return 'fa-robot fa-times-circle';  // A robot icon with an X
      case 'corpus_document_approved':
        return 'fa-check';
      case 'corpus_document_published':
        return 'fa-upload';
      case 'corpus_document_change':
        return 'fa-file-edit';
      case 'mention':
        return 'fa-at';
      case 'system_update':
        return 'fa-bell';
      default:
        return 'fa-bell';
    }
  }

  updateNotificationCountBadge() {
    // Get the current unread notifications count from the store.
    const count = this.store.get("notificationsCount") || 0;
    const badgeEl = document.getElementById("notificationsCount");
    if (badgeEl) {
      if (count > 0) {
        badgeEl.textContent = count;
        badgeEl.style.display = "inline-block";  // ensure the badge is visible
      } else {
        // Hide the badge when count is zero.
        badgeEl.style.display = "none";
      }
    }
  }


  // Helper method to format a notification_id string (which embeds an ISO timestamp)
  _formatTimestamp(notificationId) {
    if (!notificationId || typeof notificationId !== 'string') {
      return '';
    }

    // Attempt to extract the ISO date string from the notification_id.
    // The expected format is: ISO_TIMESTAMP + '_' + randomString (e.g., "2025-04-09T05:44:01.281_c75a6f90")
    let isoTimestamp;
    const underscoreIndex = notificationId.indexOf('_');
    if (underscoreIndex !== -1) {
      isoTimestamp = notificationId.substring(0, underscoreIndex);
    } else {
      // Fallback: if underscore not found, assume the whole string is a timestamp
      isoTimestamp = notificationId;
    }

    // Ensure the timestamp string is treated as UTC by appending a 'Z' if it's missing.
    if (!isoTimestamp.endsWith('Z')) {
      isoTimestamp += 'Z';
    }

    // Parse the ISO timestamp string into a Date object.
    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) {
      // If parsing fails, fallback to simply returning the original string.
      return notificationId;
    }

    // Get the current time (as a Date object).
    const now = new Date();
    // Compute the difference in milliseconds (both date and now are based on the same UTC epoch)
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    // Format relative time for recent notifications
    if (diffDay > 7) {
      return date.toLocaleDateString();
    } else if (diffDay > 0) {
      return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    } else if (diffHour > 0) {
      return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    } else if (diffMin > 0) {
      return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }


  hideDropdowns() {
    document.querySelectorAll(".jobs-dropdown, .notifications-dropdown")
      .forEach(el => el.remove());
    this.activeDropdown = null;
  }

  addEventListeners() {
    console.log("[TopBar] Adding event listeners");

    const jobsIcon = document.getElementById("jobsIcon");
    if (jobsIcon) {
      jobsIcon.addEventListener("click", (e) => this.toggleJobsDropdown(e));
    }

    const notificationsIcon = document.getElementById("notificationsIcon");
    if (notificationsIcon) {
      notificationsIcon.addEventListener("click", (e) => this.toggleNotificationsDropdown(e));
    }

    /* ── corpus icon → open corpus view ───────────────────────────── */
    const corpusIcon = document.getElementById("corpusIcon");
    if (corpusIcon) {
      corpusIcon.addEventListener("click", async (event) => {
        console.log("[TopBar] 🗂️ Corpus icon clicked");
        
        // Router-aware navigation with fallback
        console.log("[TopBar] 🗂️ Checking router availability:", {
          router: !!window.router,
          isReady: window.router?.isReady?.()
        });
        
        if (window.router && window.router.isReady()) {
          const href = corpusIcon.getAttribute('data-href');
          console.log("[TopBar] 🗂️ Using router navigation to:", href);
          
          if (href) {
            event.preventDefault();
            try {
              const result = await window.router.navigate(href);
              console.log("[TopBar] 🗂️ Router navigation result:", result);
              
              if (result.success) {
                console.log("[TopBar] 🗂️ Router navigation successful");
              } else {
                console.warn("[TopBar] 🗂️ Router navigation failed, using fallback:", result.error);
                if (window.showCorpusManagement) window.showCorpusManagement();
              }
            } catch (error) {
              console.error("[TopBar] 🗂️ Router navigation error, using fallback:", error);
              if (window.showCorpusManagement) window.showCorpusManagement();
            }
            return;
          } else {
            console.warn("[TopBar] 🗂️ No href attribute found on corpus icon");
          }
        } else {
          console.log("[TopBar] 🗂️ Router not available, using direct fallback");
        }
        
        // Fallback to existing functionality
        console.log("[TopBar] 🗂️ Using fallback showCorpusManagement");
        if (window.showCorpusManagement) {
          window.showCorpusManagement();
        } else {
          console.error("[TopBar] 🗂️ showCorpusManagement not available");
        }
      });
    }

    /* ── logo click → back to main app ────────────────────────────── */
    const logoEl = this.rootEl.querySelector(".logo");
    if (logoEl) {
      logoEl.style.cursor = "pointer";
      logoEl.addEventListener("click", (event) => {
        // Router-aware navigation with fallback
        if (window.router && window.router.isReady()) {
          const href = logoEl.getAttribute('data-href');
          if (href) {
            event.preventDefault();
            window.router.navigate(href);
            return;
          }
        }
        // Fallback to existing functionality
        if (window.showMainApp) window.showMainApp();
      });
    }

    const openDocsIcon = document.getElementById("openDocumentsIcon");
    if (openDocsIcon) {
      openDocsIcon.addEventListener("click", async () => {
        console.log("[TopBar] 📂 Documents icon clicked");
        console.log("[TopBar] 📂 window.navigateWithModal available:", typeof window.navigateWithModal);
        console.log("[TopBar] 📂 window.modalNavigationManager available:", !!window.modalNavigationManager);
        
        // Try to use router navigation first (if available)
        if (typeof window.navigateWithModal === 'function') {
          try {
            console.log("[TopBar] 📂 About to call navigateWithModal('modals', 'documents_management')");
            const result = await window.navigateWithModal('modals', 'documents_management');
            console.log('[TopBar] 📂 Router navigation result:', result);
            console.log('[TopBar] 📂 Successfully navigated to system_modals route with documents_management modal');
            return;
          } catch (error) {
            console.error('[TopBar] 📂 Router navigation failed, falling back to direct modal:', error);
            console.error('[TopBar] 📂 Error stack:', error.stack);
          }
        } else {
          console.warn('[TopBar] 📂 window.navigateWithModal not available, using direct modal');
        }
        
        // Fallback to direct modal show (existing behavior)
        console.log('[TopBar] 📂 Using fallback - direct modal show');
        console.log('[TopBar] 📂 this.documentsModal available:', !!this.documentsModal);
        if (!this.documentsModal) {
          console.warn("[TopBar] 📂 documentsModal not defined - cannot show modal");
          return;
        }
        console.log('[TopBar] 📂 Calling this.documentsModal.show()');
        this.documentsModal.show();
      });
    }

    const accountsProjectsIcon = document.getElementById("accountsProjectsIcon");
    if (accountsProjectsIcon) {
      accountsProjectsIcon.addEventListener("click", async () => {
        console.log("[TopBar] 🗂️ Accounts/Projects icon clicked");
        
        // CRITICAL FIX: Hide any currently open modals before showing new one
        this._hideAllTopBarModals();
        
        // Try to use router navigation first (if available)
        if (typeof window.navigateWithModal === 'function') {
          try {
            await window.navigateWithModal('modals', 'accounts');
            console.log('[TopBar] Navigated to admin route with accounts modal');
            return;
          } catch (error) {
            console.warn('[TopBar] Router navigation failed, falling back to direct modal:', error);
          }
        }
        
        // Fallback to direct modal show (existing behavior)
        if (!this.accountsModal) {
          console.warn("[TopBar] accountsModal not defined");
          return;
        }
        this.accountsModal.show();
      });
    }

    const usersIcon = document.getElementById("usersIcon");
    if (usersIcon) {
      usersIcon.addEventListener("click", async () => {
        console.log("[TopBar] 👥 Users icon clicked");
        console.log("[TopBar] 👥 window.navigateWithModal available:", typeof window.navigateWithModal);
        console.log("[TopBar] 👥 window.modalNavigationManager available:", !!window.modalNavigationManager);
        
        // Try to use router navigation first (if available)
        if (typeof window.navigateWithModal === 'function') {
          try {
            console.log("[TopBar] 👥 About to call navigateWithModal('modals', 'users')");
            const result = await window.navigateWithModal('modals', 'users');
            console.log('[TopBar] 👥 Router navigation result:', result);
            console.log('[TopBar] 👥 Successfully navigated to admin route with users modal');
            return;
          } catch (error) {
            console.error('[TopBar] 👥 Router navigation failed, falling back to direct modal:', error);
            console.error('[TopBar] 👥 Error stack:', error.stack);
          }
        } else {
          console.warn('[TopBar] 👥 window.navigateWithModal not available, using direct modal');
        }
        
        // Fallback to direct modal show (existing behavior)
        console.log('[TopBar] 👥 Using fallback - direct modal show');
        console.log('[TopBar] 👥 this.usersModal available:', !!this.usersModal);
        console.log('[TopBar] 👥 Calling this.usersModal.show()');
        this.usersModal.show();
      });
    }

    const userPill = document.getElementById("userPill");
    if (userPill) {
      const usernameSpan = userPill.querySelector(".username");
      if (usernameSpan) {
        usernameSpan.addEventListener("click", async () => {
          const currentUser = localStorage.getItem("currentUser") || "guest";
          if (currentUser === "guest") {
            console.warn("[TopBar] Guest user clicked => ignoring");
            return;
          }
          console.log("[TopBar] Username clicked for user:", currentUser);
          
          // Try to use router navigation first (if available)
          if (typeof window.navigateWithModal === 'function') {
            try {
              await window.navigateWithModal('modals', 'user_detail', { entityId: currentUser });
              console.log('[TopBar] Navigated to admin route with user_detail modal for:', currentUser);
              return;
            } catch (error) {
              console.warn('[TopBar] Router navigation failed, falling back to direct modal:', error);
            }
          }
          
          // Fallback to direct modal show (existing behavior)
          console.log("[TopBar] Opening UserModal for self user:", currentUser);
          const selfUserModal = new UserModal(this.store, { username: currentUser });
          selfUserModal.show();
        });
      }

      const loginBtn = userPill.querySelector("#loginBtn");
      if (loginBtn) {
        loginBtn.addEventListener("click", async () => {
          console.log("[TopBar] Login button clicked");
          
          // Try to use router navigation first (if available)
          if (typeof window.navigateWithModal === 'function') {
            try {
              await window.navigateWithModal('auth_modals', 'login');
              console.log('[TopBar] Navigated to auth-modals route with login modal');
              return;
            } catch (error) {
              console.warn('[TopBar] Router navigation failed, falling back to direct modal:', error);
            }
          }
          
          // Fallback to direct modal show (existing behavior)
          const lm = new LoginModal();
          lm.show();
        });
      }

      const registerBtn = userPill.querySelector("#registerBtn");
      if (registerBtn) {
        registerBtn.addEventListener("click", async () => {
          console.log("[TopBar] Register button clicked");
          
          // Try to use router navigation first (if available)
          if (typeof window.navigateWithModal === 'function') {
            try {
              await window.navigateWithModal('auth_modals', 'register');
              console.log('[TopBar] Navigated to auth-modals route with register modal');
              return;
            } catch (error) {
              console.warn('[TopBar] Router navigation failed, falling back to direct modal:', error);
            }
          }
          
          // Fallback to direct modal show (existing behavior)
          const rm = new RegisterModal();
          rm.show();
        });
      }

      const logoutBtn = userPill.querySelector("#logoutBtn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
          console.log("[TopBar] Logout button clicked");
          if (window.handleLogout) {
            window.handleLogout();
          } else {
            logout();
            window.location.reload();
          }
        });
      }
    }

    // Clicking outside => hide
    document.addEventListener("click", (evt) => {
      if (
        !evt.target.closest(".jobs-dropdown") &&
        !evt.target.closest(".notifications-dropdown") &&
        !evt.target.closest("#jobsIcon") &&
        !evt.target.closest("#notificationsIcon")
      ) {
        this.hideDropdowns();
      }
    });
  }

  /**
   * Attach tooltips to all TopBar icons
   */
  attachTooltips() {
    // Accounts and Projects combined icon tooltip
    const accountsProjectsIcon = document.getElementById("accountsProjectsIcon");
    if (accountsProjectsIcon) {
      tooltip.attach(accountsProjectsIcon, "Set up accounts and projects to organize documents");
    }

    // Users icon tooltip
    const usersIcon = document.getElementById("usersIcon");
    if (usersIcon) {
      tooltip.attach(usersIcon, "Manage users in your organization");
    }

    // Corpus icon tooltip
    const corpusIcon = document.getElementById("corpusIcon");
    if (corpusIcon) {
      tooltip.attach(corpusIcon, "Manage your knowledge corpus");
    }

    // Open documents icon tooltip
    const openDocumentsIcon = document.getElementById("openDocumentsIcon");
    if (openDocumentsIcon) {
      tooltip.attach(openDocumentsIcon, "View and open recent documents");
    }

    // Jobs icon tooltip
    const jobsIcon = document.getElementById("jobsIcon");
    if (jobsIcon) {
      tooltip.attach(jobsIcon, "View running and completed jobs");
    }

    // Notifications icon tooltip
    const notificationsIcon = document.getElementById("notificationsIcon");
    if (notificationsIcon) {
      tooltip.attach(notificationsIcon, "View your notifications");
    }
  }

  /**
   * Initialize periodic polling for job updates in TopBar
   */
  initializePeriodicJobPolling() {
    console.log("[TopBar] Initializing periodic job polling");

    // Check if user is authenticated
    const token = localStorage.getItem("authToken");
    if (!token) {
      return; // Skip if no authentication
    }

    this.startJobPolling();

    // Listen for login/logout events to start/stop polling
    document.addEventListener("userLoggedIn", () => {
      this.startJobPolling();
    });

    document.addEventListener("userLoggedOut", () => {
      this.stopJobPolling();
    });

    // CRITICAL FIX: Listen for real-time job state changes to update UI immediately
    document.addEventListener("jobStateChange", (event) => {
      const { jobId, eventType, jobData } = event.detail;
      // Handle different types of job state changes
      switch (eventType) {
        case 'PROGRESS_UPDATE':
          // Job progress changed - refresh jobs display if dropdown is open
          if (this.activeDropdown === 'jobs') {
            this.refreshJobsDropdown();
          }
          break;
          
        case 'JOB_COMPLETED':
          console.log(`[TopBar] Job ${jobId} completed`);
          // Job completed - refresh immediately to show completion state
          if (this.activeDropdown === 'jobs') {
            this.refreshJobsDropdown();
          }
          break;
          
        case 'JOB_CLEANUP':
          // Job was removed from tracking - refresh to remove from UI
          if (this.activeDropdown === 'jobs') {
            this.refreshJobsDropdown();
          }
          break;
      }
    });
  }

  /**
   * Start adaptive polling for job updates based on job phases
   */
  startJobPolling() {
    if (this.jobPollingInterval) {
      return; // Polling already active
    }

    this.jobPollingEnabled = true;
    console.log("[TopBar] Started job polling");

    // Use adaptive polling based on job activity
    this.scheduleNextJobPoll();

    // Update immediately
    this.updateJobStatistics();
  }

  /**
   * Schedule next job poll with adaptive interval based on active jobs
   */
  scheduleNextJobPoll() {
    if (!this.jobPollingEnabled) return;

    // Calculate optimal polling interval based on active jobs
    const activeJobs = this.jobController.getActiveJobs(10);
    const interval = this.calculateOptimalTopBarPollingInterval(activeJobs);
    
    // Only log scheduling diagnostics if we have active jobs or debug mode
    if (activeJobs.length > 0) {
      console.log(`[TopBar] Scheduling next poll: ${activeJobs.length} active jobs, ${interval}ms interval`);
    }

    this.jobPollingInterval = setTimeout(() => {
      this.updateJobStatistics();
      this.scheduleNextJobPoll(); // Schedule next poll recursively
    }, interval);
  }

  /**
   * Calculate optimal polling interval based on active job states
   */
  calculateOptimalTopBarPollingInterval(activeJobs) {
    if (!activeJobs || activeJobs.length === 0) {
      return 30000; // 30 seconds when no active jobs
    }

    // Find the most urgent job state
    let minInterval = 10000; // Default 10 seconds

    for (const job of activeJobs) {
      let jobInterval = 10000;

      if (job.jobType === 'question-answering-master') {
        // Use adaptive intervals for Q&A jobs based on status and progress
        if (job.status === 'QUEUED') {
          jobInterval = 5000; // 5 seconds for queued jobs
        } else if (job.status === 'RUNNING') {
          // Dynamic based on progress
          if (job.progress >= 90) {
            jobInterval = 1000; // 1 second when near completion
          } else if (job.progress >= 50) {
            jobInterval = 2000; // 2 seconds during active processing
          } else {
            jobInterval = 3000; // 3 seconds during startup/early processing
          }
        }
      } else if (job.jobType === 'analysis-lm') {
        // Slightly longer intervals for AnalysisLM jobs
        if (job.status === 'RUNNING') {
          if (job.progress >= 75) {
            jobInterval = 3000; // 3 seconds near completion
          } else {
            jobInterval = 8000; // 8 seconds during processing
          }
        } else {
          jobInterval = 5000; // 5 seconds for other states
        }
      }

      minInterval = Math.min(minInterval, jobInterval);
    }

    return minInterval;
  }

  /**
   * Stop periodic polling for job updates
   */
  stopJobPolling() {
    if (this.jobPollingInterval) {
      clearTimeout(this.jobPollingInterval);
      this.jobPollingInterval = null;
      console.log("[TopBar] Stopped job polling");
    }
    this.jobPollingEnabled = false;
  }

  /**
   * Update job statistics and refresh jobs dropdown if open
   */
  async updateJobStatistics() {
    if (!this.jobPollingEnabled || !localStorage.getItem("authToken")) {
      // Skip polling if disabled or no authentication
      return;
    }

    try {
      // Get current job statistics
      const stats = this.jobController.getJobStats();
      const activeJobsCount = stats.active || 0;
      
      // Update job statistics (logging reduced to avoid noise)
      if (activeJobsCount > 0) {
        console.log(`[TopBar] Job statistics: ${activeJobsCount} active jobs`);
      }

      // Update the jobs count in the top bar icon
      const jobsCountElement = document.getElementById("jobsCount");
      if (jobsCountElement && this.rootEl) {
        // Only update if count has changed to avoid unnecessary DOM manipulation
        const currentText = jobsCountElement.textContent;
        const newText = activeJobsCount.toString();

        if (currentText !== newText) {
          jobsCountElement.textContent = newText;
          jobsCountElement.style.display = activeJobsCount > 0 ? 'inline-block' : 'none';
        }
      }

      // If jobs dropdown is currently open, refresh its content
      if (this.activeDropdown === "jobs") {
        // Refresh jobs dropdown content
        await this.refreshJobsDropdown();
      }

      this.lastJobUpdate = Date.now();

    } catch (error) {
      console.error("[TopBar] Error updating job statistics:", error);
    }
  }

  /**
   * Refresh the content of the jobs dropdown without closing it
   */

  /**
   * Render a single job item HTML
   */
  _renderJobItem(job) {
    const duration = this._calculateJobDuration(job);
    const progress = job.progress || 0;
    const statusClass = job.status.toLowerCase().replace('_', '-');

    return `
      <div class="job-item ${statusClass}" data-job-id="${job.jobId}">
        <div class="job-header">
          <div class="job-info">
            <div class="job-title" title="${job.docId || job.jobId}">
              ${this._getJobDisplayName(job)}
            </div>
            <div class="job-metadata">
              ${this._getEnhancedJobMetadata(job)}
              ${duration ? `• ${duration}` : ''}
            </div>
          </div>
          <div class="job-status">
            <span class="status-badge ${statusClass}">
              ${this._getStatusIcon(job.status)}
              ${this._formatStatus(job.status)}
            </span>
          </div>
        </div>
        
        ${this._shouldShowProgressDetails(job) ? `
          <div class="job-progress-enhanced">
            <div class="progress-bar-enhanced">
              <div class="progress-fill-enhanced" style="width: ${progress}%"></div>
              <div class="progress-shimmer"></div>
            </div>
            <div class="progress-details">
              <span class="progress-text-enhanced">${this._getProgressText(job)}</span>
              <span class="progress-phase">${this._getCurrentPhase(job)}</span>
            </div>
            ${this._getTimeEstimate(job) ? `
              <div class="time-estimate">
                <i class="fas fa-clock"></i>
                ${this._getTimeEstimate(job)}
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        <div class="job-actions">
          ${job.status === 'RUNNING' ? `
            <button class="action-btn cancel-btn" data-job-id="${job.jobId}" title="Cancel job">
              <i class="fas fa-stop"></i>
            </button>
          ` : ''}
          <button class="action-btn details-btn" data-job-id="${job.jobId}" title="View details">
            <i class="fas fa-info-circle"></i>
          </button>
          ${this._canOpenJob(job) ? `
            <button class="action-btn open-btn" data-job-id="${job.jobId}" title="Open document">
              <i class="fas fa-external-link-alt"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to jobs dropdown content
   */
  _attachJobsDropdownEventListeners(dropdown) {
    const content = dropdown.querySelector('.dropdown-content');
    if (!content) return;

    // Attach job action listeners (cancel, details, open)
    this._addJobActionListeners(content);

    // Attach filter button listeners (Active, Recent, All)
    const filterButtons = content.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedFilter = btn.dataset.filter;

        // Update active filter button
        filterButtons.forEach(b => b.classList.toggle('active', b.dataset.filter === selectedFilter));

        // Refresh content for selected filter
        this.refreshJobsDropdown();
      });
    });

    // Attach refresh button listener
    const refreshBtn = content.querySelector('.refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';

        try {
          await this.jobController.refreshAllJobs();
          await this.refreshJobsDropdown();
        } catch (error) {
          console.error('[TopBar] Error refreshing jobs:', error);
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
      });
    }

    // Attach export button listener
    const exportBtn = content.querySelector('.export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._exportJobData();
      });
    }
  }


  /**
   * Fetch jobs from server with time-based filtering
   * @param {string} timeFilter - 'this_week' or 'last_week'
   * @returns {Promise<Array>} Array of job objects
   */
  async fetchJobsWithTimeFilter(timeFilter) {
    try {
      const now = new Date();
      let startDate, endDate;
      
      // Calculate week boundaries (Monday to Sunday)
      const getWeekBoundaries = (date, weeksOffset = 0) => {
        const week = new Date(date);
        week.setDate(week.getDate() + (weeksOffset * 7));
        
        // Get Monday of the week
        const monday = new Date(week);
        const day = monday.getDay();
        const diff = monday.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        
        // Get Sunday of the week
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        
        return { start: monday, end: sunday };
      };
      
      if (timeFilter === 'this_week') {
        const boundaries = getWeekBoundaries(now, 0);
        startDate = boundaries.start;
        endDate = boundaries.end;
      } else if (timeFilter === 'last_week') {
        const boundaries = getWeekBoundaries(now, -1);
        startDate = boundaries.start;
        endDate = boundaries.end;
      }
      
      console.log(`[TopBar] Fetching ${timeFilter} jobs from ${startDate} to ${endDate}`);
      
      // Use the jobs API client with ISO format dates
      const jobs = await fetchJobs({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 50
      });
      
      console.log(`[TopBar] Fetched ${timeFilter} jobs:`, jobs);
      return jobs;
      
    } catch (error) {
      console.error(`[TopBar] Failed to fetch ${timeFilter} jobs:`, error);
      throw error;
    }
  }

  /**
   * Hide all TopBar-managed modals to prevent stacking
   */
  _hideAllTopBarModals() {
    console.log("[TopBar] Hiding all TopBar modals to prevent stacking");
    
    // Hide all pre-instantiated modals
    if (this.documentsModal) {
      this.documentsModal.hide();
    }
    if (this.accountsModal) {
      this.accountsModal.hide();
    }
    if (this.projectsModal) {
      this.projectsModal.hide();
    }
    if (this.usersModal) {
      this.usersModal.hide();
    }
    if (this.jobsModal) {
      this.jobsModal.hide();
    }
    
    // Also hide any dynamically created modals (like UserModal, LoginModal, RegisterModal)
    // Check for any modals currently visible in the DOM
    const visibleModals = document.querySelectorAll('.modal[style*="block"], .modal-overlay[style*="block"]');
    visibleModals.forEach(modal => {
      if (modal.style.display === 'block') {
        console.log("[TopBar] Force hiding visible modal:", modal.className);
        modal.style.display = 'none';
      }
    });
    
    // Hide modal overlays
    const visibleOverlays = document.querySelectorAll('.modal-overlay[style*="block"]');
    visibleOverlays.forEach(overlay => {
      if (overlay.style.display === 'block') {
        console.log("[TopBar] Force hiding visible overlay");
        overlay.style.display = 'none';
      }
    });
  }

  /**
   * Cleanup method to stop polling when TopBar is destroyed
   */
  destroy() {
    this.stopJobPolling();
    this._hideAllTopBarModals();
    console.log("[TopBar] Destroyed and cleaned up job polling");
  }
}
