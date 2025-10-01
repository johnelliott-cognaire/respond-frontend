// ui/modals/question-grid-analytics-modal.js - FIXED VERSION (Filters moved to Team component)

import QuestionGridAnalyticsOverview from '../components/question-grid-analytics-overview.js';
import QuestionGridAnalyticsTeam from '../components/question-grid-analytics-team.js';
import { getOverviewAnalytics, getTeamAnalytics } from '../../api/question-grid-analytics.js';

/**
 * QuestionGridAnalyticsModal
 * 
 * Wide, read-only modal for displaying comprehensive analytics about the Question Grid.
 * Features two distinct views:
 * - Overview: Executive dashboard with high-level metrics and progress tracking
 * - Team: Individual performance analytics and workload management (with filters)
 * 
 * FIXED: Filters moved to Team component since they're only used there.
 */
export class QuestionGridAnalyticsModal {
  constructor(options = {}) {
    this.modalEl = null;
    this.overlayEl = null;
    this.contentEl = null;
    this.tabButtonsEl = null;
    
    // Modal context - passed from ControlPane
    this.projectDocumentId = options.projectDocumentId || null;
    this.stageId = options.stageId || 'rfp_stage_3_answer_questions';
    this.defaultTab = options.defaultTab || 'all';
    this.availableGroups = options.availableGroups || []; // From parent component
    this.availableUsers = options.availableUsers || []; // From parent component
    
    // View state
    this.currentView = 'overview';
    this.isLoading = false;
    
    // View components
    this.overviewComponent = null;
    this.teamComponent = null;
    
    this._buildDOM();
    this._setupEventListeners();
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - DOM Construction                                     */
  /* ---------------------------------------------------------------------- */
  _buildDOM() {
    /* Overlay (shared styling) ------------------------------------------- */
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "overlay";
    this.overlayEl.style.display = "none";

    /* Modal container ---------------------------------------------------- */
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--import-wizard an-question-grid-analytics-modal";
    this.modalEl.style.display = "none";

    /* Build modal structure ---------------------------------------------- */
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close analytics modal">&times;</button>
      
      <div class="an-analytics-modal-content">
        <!-- View Tabs -->
        <div class="an-analytics-tabs">
          <button class="an-analytics-tab is-active" data-view="overview">
            <span style="margin-right: 6px;">📊</span> Overview
          </button>
          <button class="an-analytics-tab" data-view="team">
            <span style="margin-right: 6px;">👥</span> Team View
          </button>
        </div>
        
        <!-- Content Area -->
        <div class="an-analytics-content">
          <!-- Loading overlay -->
          <div class="an-loading-overlay is-hidden">
            <div class="an-loading-content">
              <div class="is-loading"></div>
              <div class="an-loading-text">Loading analytics...</div>
            </div>
          </div>
          
          <!-- View content will be injected here -->
          <div class="an-view-container"></div>
        </div>
      </div>
    `;

    /* Attach to DOM ------------------------------------------------------- */
    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.modalEl);
    
    /* Store references to key elements ------------------------------------ */
    this.contentEl = this.modalEl.querySelector('.an-view-container');
    this.tabButtonsEl = this.modalEl.querySelectorAll('.an-analytics-tab');
    this.loadingEl = this.modalEl.querySelector('.an-loading-overlay');
  }

  _setupEventListeners() {
    /* Close actions ------------------------------------------------------- */
    this.modalEl
      .querySelector(".modal__close")
      .addEventListener("click", () => this.hide());
    this.overlayEl.addEventListener("click", () => this.hide());
    
    /* Tab switching ------------------------------------------------------- */
    this.tabButtonsEl.forEach(button => {
      button.addEventListener('click', (e) => {
        const newView = e.target.closest('.an-analytics-tab').dataset.view;
        this._switchView(newView);
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - View Management                                      */
  /* ---------------------------------------------------------------------- */
  async _switchView(viewName) {
    if (this.currentView === viewName || this.isLoading) return;
    
    // Update tab appearance
    this.tabButtonsEl.forEach(btn => btn.classList.remove('is-active'));
    this.modalEl.querySelector(`[data-view="${viewName}"]`).classList.add('is-active');
    
    this.currentView = viewName;
    await this._loadCurrentView();
  }
  
  async _loadCurrentView() {
    if (!this.projectDocumentId) {
      this._showError('Missing project document context');
      return;
    }
    
    this._showLoading(true);
    
    try {
      // Clear previous content
      this.contentEl.innerHTML = '';
      
      console.log(`[QuestionGridAnalyticsModal] Loading view: ${this.currentView}`);
      
      switch (this.currentView) {
        case 'overview':
          await this._loadOverviewView();
          break;
        case 'team':
          await this._loadTeamView();
          break;
        default:
          console.warn(`[QuestionGridAnalyticsModal] Unknown view: ${this.currentView}`);
          this._showError(`Unknown view: ${this.currentView}`);
          break;
      }
    } catch (error) {
      console.error('[QuestionGridAnalyticsModal] Error loading view:', error);
      this._showError(error.message || 'Failed to load analytics data');
    } finally {
      this._showLoading(false);
    }
  }
  
  async _loadOverviewView() {
    if (!this.overviewComponent) {
      this.overviewComponent = new QuestionGridAnalyticsOverview({
        projectDocumentId: this.projectDocumentId
      });
    }
    
    // Overview doesn't use filters - always load all data
    const data = await getOverviewAnalytics(this.projectDocumentId, {});
    this.overviewComponent.render(this.contentEl, data);
  }
  
  async _loadTeamView() {
    // Extract actual usernames from availableUsers
    const teamMembers = this.availableUsers.map(user => {
      // Handle both string usernames and user objects
      if (typeof user === 'string') {
        return user;
      } else if (user.username) {
        return user.username;
      } else if (user.user_id) {
        return user.user_id;
      } else {
        console.warn('Unknown user format:', user);
        return null;
      }
    }).filter(Boolean); // Remove null values
    
    console.log('[Analytics Modal] Available team members:', teamMembers);
    
    if (!this.teamComponent) {
      this.teamComponent = new QuestionGridAnalyticsTeam({
        projectDocumentId: this.projectDocumentId,
        stageId: this.stageId,
        availableGroups: this.availableGroups,  // Pass available groups for filter dropdown
        availableUsers: this.availableUsers,    // Pass available users for filter dropdown
        teamMembers: teamMembers,               // Pass actual team members for API calls
        defaultTab: this.defaultTab
      });
    }
    
    // Team component now handles its own data loading and filtering
    this.teamComponent.render(this.contentEl);
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - UI State                                             */
  /* ---------------------------------------------------------------------- */
  _showLoading(show) {
    this.isLoading = show;
    if (show) {
      this.loadingEl.classList.remove('is-hidden');
    } else {
      this.loadingEl.classList.add('is-hidden');
    }
  }
  
  _showError(message) {
    this.contentEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center;">
        <div>
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3 style="color: var(--status-error); margin-bottom: 8px;">Error Loading Analytics</h3>
          <p style="color: var(--text-secondary);">${message}</p>
          <button onclick="this.closest('.an-question-grid-analytics-modal').dispatchEvent(new CustomEvent('retry'))" 
                  style="margin-top: 16px; padding: 8px 16px; background: var(--interactive-primary); color: var(--text-on-primary); border: none; border-radius: 4px; cursor: pointer;">
            Try Again
          </button>
        </div>
      </div>
    `;
  }

  /* ---------------------------------------------------------------------- */
  /* Public API                                                             */
  /* ---------------------------------------------------------------------- */
  async show() {
    // Display overlay & modal (flex because .modal--import-wizard is flex)
    this.overlayEl.style.display = "block";
    this.modalEl.style.display = "flex";
    
    // Load initial view
    await this._loadCurrentView();
  }

  hide() {
    this.overlayEl.style.display = "none";
    this.modalEl.style.display = "none";
    
    // Clean up components to prevent memory leaks
    if (this.overviewComponent) {
      this.overviewComponent.destroy?.();
    }
    if (this.teamComponent) {
      this.teamComponent.destroy?.();
    }
  }
  
  destroy() {
    this.hide();
    if (this.modalEl) {
      this.modalEl.remove();
    }
    if (this.overlayEl) {
      this.overlayEl.remove();
    }
  }
}

export default QuestionGridAnalyticsModal;