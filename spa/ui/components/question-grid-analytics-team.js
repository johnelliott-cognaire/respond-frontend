// ui/components/question-grid-analytics-team.js - WITH INTEGRATED FILTERS

import { getTeamAnalytics } from '../../api/question-grid-analytics.js';

/**
 * QuestionGridAnalyticsTeam
 * 
 * People-focused analytics component for resource management and individual 
 * performance tracking. NOW INCLUDES integrated filters and data management.
 */
export class QuestionGridAnalyticsTeam {
  constructor(options = {}) {
    this.projectDocumentId = options.projectDocumentId;
    this.stageId = options.stageId;
    this.availableGroups = options.availableGroups || [];
    this.availableUsers = options.availableUsers || [];
    this.teamMembers = options.teamMembers || [];  // Actual usernames for API calls
    this.defaultTab = options.defaultTab || 'all';
    
    this.containerEl = null;
    this.data = null;
    this.isLoading = false;
    
    // Filter state
    this.filters = {
      selectedTab: this.defaultTab,
      selectedAssignee: 'all',
      selectedRisk: 'all'
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Public API                                                             */
  /* ---------------------------------------------------------------------- */
  async render(containerEl) {
    this.containerEl = containerEl;
    
    // Build the UI structure first
    this._buildTeamDOM();
    
    // Then load the initial data
    await this._loadData();
  }
  
  destroy() {
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - DOM Construction                                     */
  /* ---------------------------------------------------------------------- */
  _buildTeamDOM() {
    if (!this.containerEl) return;
    
    this.containerEl.innerHTML = `
      <div class="an-team-dashboard">
        <!-- Filters Section -->
        ${this._buildFiltersHTML()}
        
        <!-- Loading overlay -->
        <div class="an-team-loading-overlay is-hidden">
          <div class="an-loading-content">
            <div class="is-loading"></div>
            <div class="an-loading-text">Loading team analytics...</div>
          </div>
        </div>
        
        <!-- Content Area -->
        <div class="an-team-content">
          <!-- Content will be populated by _updateContent() -->
        </div>
      </div>
    `;
    
    this._setupEventListeners();
  }
  
  _buildFiltersHTML() {
    return `
      <div class="an-analytics-filters" style="
        display: flex;
        gap: 2rem;
        align-items: end;
        background: var(--surface-default);
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid var(--border-subtle);
        margin-bottom: 1.5rem;
      ">
        <div class="form-group">
          <label for="an-tab-filter">Show Tab:</label>
          <select id="an-tab-filter" class="doc-input" data-filter="tab">
            <option value="all">All Tabs</option>
            ${this.availableGroups.map(group => {
              const groupId = this._parseGroupIdFromFull(group.stage_group_id);
              const isSelected = this.filters.selectedTab === groupId ? 'selected' : '';
              return `<option value="${groupId}" ${isSelected}>${group.group_name || groupId}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="an-assignee-filter">Show Assignee:</label>
          <select id="an-assignee-filter" class="doc-input" data-filter="assignee">
            <option value="all">All Team Members</option>
            ${this.availableUsers.map(user => {
              const username = user.username || user;
              const isSelected = this.filters.selectedAssignee === username ? 'selected' : '';
              return `<option value="${username}" ${isSelected}>${username}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="an-risk-filter">Risk Level:</label>
          <select id="an-risk-filter" class="doc-input" data-filter="risk">
            <option value="all" ${this.filters.selectedRisk === 'all' ? 'selected' : ''}>All Risk Levels</option>
            <option value="high" ${this.filters.selectedRisk === 'high' ? 'selected' : ''}>High Risk Only</option>
            <option value="medium" ${this.filters.selectedRisk === 'medium' ? 'selected' : ''}>Medium Risk Only</option>
            <option value="low" ${this.filters.selectedRisk === 'low' ? 'selected' : ''}>Low Risk Only</option>
          </select>
        </div>
        <div class="form-group">
          <label>&nbsp;</label>
          <button class="an-refresh-btn btn btn-secondary" title="Refresh Data">
            🔄 Refresh
          </button>
        </div>
      </div>
    `;
  }
  
  _updateContent(data) {
    const contentEl = this.containerEl.querySelector('.an-team-content');
    if (!contentEl) return;
    
    contentEl.innerHTML = `
      ${this._buildTeamAlertsHTML(data)}
      ${this._buildTeamMembersHTML(data)}
      ${this._buildTeamSummaryHTML(data)}
    `;
  }
  
  _buildTeamAlertsHTML(data) {
    if (!data.alerts || data.alerts.length === 0) return '';
    
    return `
      <div class="an-team-alerts">
        <div style="color: var(--status-error); font-weight: 600; margin-bottom: 8px; display: flex; align-items: center;">
          <span style="margin-right: 8px;">⚠️</span>
          Team Attention Required
        </div>
        <ul style="margin: 0; padding-left: 1rem; color: var(--status-error); font-size: 14px;">
          ${data.alerts.map(alert => `
            <li style="margin-bottom: 4px;">${alert.message}</li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  _buildTeamMembersHTML(data) {
    const { teamMembers } = data;
    
    if (!teamMembers || teamMembers.length === 0) {
      return `
        <div class="an-team-members" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No team member data available for current filters
        </div>
      `;
    }
    
    return `
      <div class="an-team-members" style="
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); 
        gap: 1rem; 
        margin-bottom: 1rem;
      ">
        ${teamMembers.map(member => this._buildMemberCardHTML(member)).join('')}
      </div>
    `;
  }
  
  _buildMemberCardHTML(member) {
    const workloadClass = this._getWorkloadClass(member.workloadStatus);
    const workloadLabel = this._getWorkloadLabel(member.workloadStatus);
    
    return `
      <div class="an-team-member-card" style="
        background: var(--surface-default); 
        border-radius: 8px; 
        padding: 1.5rem; 
        border: 1px solid var(--border-subtle);
      ">
        <!-- Member Header -->
        <div class="an-member-header" style="
          display: flex; 
          align-items: center; 
          gap: 1rem; 
          margin-bottom: 1.5rem;
        ">
          <div class="an-member-avatar" style="
            width: 60px; 
            height: 60px; 
            border-radius: 50%; 
            background: ${this._getUserColor(member.username)}; 
            color: white; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 1.5rem; 
            font-weight: bold;
          ">
            ${this._getUserInitials(member.username)}
          </div>
          <div style="flex: 1;">
            <h4 style="margin: 0 0 4px 0; color: var(--text-primary);">${member.username}</h4>
            <div class="an-workload-indicator" style="
              padding: 4px 8px; 
              border-radius: 4px; 
              font-size: 0.75rem; 
              font-weight: 600;
              display: inline-block;
              ${workloadClass}
            ">
              ${workloadLabel}
            </div>
          </div>
        </div>
        
        <!-- Member Stats -->
        <div class="an-member-stats" style="
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 1rem; 
          margin-bottom: 1.5rem;
        ">
          <div class="an-stat-box" style="
            text-align: center; 
            padding: 0.75rem; 
            background: var(--surface-alt); 
            border-radius: 6px;
          ">
            <div class="an-stat-value" style="font-size: 1.5rem; font-weight: bold; color: var(--interactive-primary);">
              ${member.performance?.totalAssigned || 0}
            </div>
            <div class="an-stat-label" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
              Assigned Questions
            </div>
          </div>
          <div class="an-stat-box" style="
            text-align: center; 
            padding: 0.75rem; 
            background: var(--surface-alt); 
            border-radius: 6px;
          ">
            <div class="an-stat-value" style="font-size: 1.5rem; font-weight: bold; color: var(--interactive-primary);">
              ${member.performance?.completionRate || 0}%
            </div>
            <div class="an-stat-label" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
              Complete
            </div>
          </div>
        </div>
        
        <!-- Status Breakdown -->
        <div class="an-status-breakdown" style="margin-bottom: 1.5rem;">
          <div class="an-breakdown-title" style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; font-size: 0.875rem;">
            Status Distribution
          </div>
          <div class="an-status-bars" style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${member.statusBreakdown ? Object.entries(member.statusBreakdown).map(([status, data]) => `
              <div class="an-status-bar" style="display: flex; align-items: center; gap: 1rem;">
                <div class="an-status-label" style="min-width: 100px; font-size: 0.75rem; color: var(--text-secondary);">
                  ${this._formatStatusLabel(status)}
                </div>
                <div class="an-bar-container" style="
                  flex: 1; 
                  height: 20px; 
                  background: var(--border-subtle); 
                  border-radius: 10px; 
                  overflow: hidden; 
                  position: relative;
                ">
                  <div class="an-bar-fill" style="
                    height: 100%; 
                    background: ${this._getStatusColor(status)}; 
                    width: ${data.percentage}%;
                    border-radius: 10px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    color: white; 
                    font-size: 0.6875rem; 
                    font-weight: 600;
                    min-width: ${data.count > 0 ? '30px' : '0'};
                  ">
                    ${data.count > 0 ? data.count : ''}
                  </div>
                </div>
              </div>
            `).join('') : '<div style="color: var(--text-secondary); font-size: 0.875rem;">No status breakdown available</div>'}
          </div>
        </div>
        
        <!-- Focus Areas -->
        <div class="an-member-topics">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; font-size: 0.875rem;">
            Focus Areas
          </div>
          <div class="an-topics-list" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${member.focusAreas && member.focusAreas.length > 0 ? member.focusAreas.map(area => `
              <div class="an-topic-chip" style="
                padding: 4px 8px; 
                border-radius: 4px; 
                font-size: 0.6875rem; 
                color: white;
                background: ${area.color};
                display: flex; 
                align-items: center; 
                gap: 4px;
              ">
                <span>${area.area}</span>
                <span>${area.count}</span>
              </div>
            `).join('') : '<div style="color: var(--text-secondary); font-size: 0.875rem;">No focus areas assigned</div>'}
          </div>
          
          ${member.alerts && member.alerts.length > 0 ? `
            <div style="margin-top: 0.75rem;">
              ${member.alerts.map(alert => `
                <div style="
                  font-size: 0.75rem; 
                  color: var(--status-warning); 
                  background: #fef3c7; 
                  padding: 4px 8px; 
                  border-radius: 4px; 
                  margin-bottom: 4px;
                ">
                  ⚠️ ${alert}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  _buildTeamSummaryHTML(data) {
    // Handle actual API response structure
    const { totals, performanceIndicators, workloadDistribution } = data;
    
    // Add null checks for defensive programming
    if (!totals && !performanceIndicators) {
      return `
        <div class="an-team-summary" style="
          background: var(--surface-default); 
          border-radius: 8px; 
          padding: 1.5rem; 
          border: 1px solid var(--border-subtle);
          text-align: center;
          color: var(--text-secondary);
        ">
          Team summary data unavailable
        </div>
      `;
    }
    
    return `
      <div class="an-team-summary" style="
        background: var(--surface-default); 
        border-radius: 8px; 
        padding: 1.5rem; 
        border: 1px solid var(--border-subtle);
      ">
        <h3 style="color: var(--text-primary); margin-bottom: 1rem; font-size: 1.125rem;">
          Team Performance Summary
        </h3>
        
        <!-- Team Stats Grid -->
        <div class="an-team-stats" style="
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 1rem; 
          margin-bottom: 1.5rem;
        ">
          <div style="
            text-align: center; 
            padding: 1rem; 
            background: var(--surface-alt); 
            border-radius: 6px;
          ">
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--interactive-primary);">
              ${totals?.assigned || 0}
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 4px;">
              Total Assigned Questions
            </div>
          </div>
          <div style="
            text-align: center; 
            padding: 1rem; 
            background: var(--surface-alt); 
            border-radius: 6px;
          ">
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--interactive-primary);">
              ${totals?.avgCompletion || 0}%
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 4px;">
              Team Average Completion
            </div>
          </div>
          <div style="
            text-align: center; 
            padding: 1rem; 
            background: var(--surface-alt); 
            border-radius: 6px;
          ">
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--interactive-primary);">
              ${totals?.inReview || 0}
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 4px;">
              Questions In Review
            </div>
          </div>
          <div style="
            text-align: center; 
            padding: 1rem; 
            background: var(--surface-alt); 
            border-radius: 6px;
          ">
            <div style="font-size: 1.5rem; font-weight: bold; color: var(--interactive-primary);">
              ${totals?.readyForApproval || 0}
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 4px;">
              Questions Ready/Approved
            </div>
          </div>
        </div>
        
        <!-- Performance Indicators -->
        ${performanceIndicators ? `
          <div class="an-performance-indicators" style="
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
            gap: 1rem;
          ">
            ${Object.entries(performanceIndicators).map(([key, indicator]) => `
              <div class="an-indicator-card" style="
                text-align: center; 
                padding: 1rem; 
                background: var(--surface-alt); 
                border-radius: 6px; 
                border-left: 4px solid ${this._getIndicatorColor(indicator.status)};
              ">
                <div class="an-indicator-value" style="font-size: 1.25rem; font-weight: bold; color: var(--text-primary);">
                  ${indicator.value}
                </div>
                <div class="an-indicator-label" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                  ${this._formatIndicatorLabel(key)}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - Data Management                                       */
  /* ---------------------------------------------------------------------- */
  async _loadData() {
    if (!this.projectDocumentId || this.teamMembers.length === 0) {
      console.warn('[Team Analytics] Missing project document ID or team members');
      this._updateContent({ teamMembers: [], totals: {}, alerts: [] });
      return;
    }
    
    this._showLoading(true);
    
    try {
      console.log('[Team Analytics] Loading data with filters:', this.filters);
      console.log('[Team Analytics] Team members:', this.teamMembers);
      
      const data = await getTeamAnalytics(
        this.projectDocumentId, 
        this.stageId, 
        this.teamMembers,
        this.filters
      );
      
      console.log('[Team Analytics] Received data:', data);
      this.data = data;
      this._updateContent(data);
      
    } catch (error) {
      console.error('[Team Analytics] Error loading data:', error);
      this._showError(error.message || 'Failed to load team analytics');
    } finally {
      this._showLoading(false);
    }
  }
  
  _showLoading(show) {
    const loadingEl = this.containerEl?.querySelector('.an-team-loading-overlay');
    if (loadingEl) {
      if (show) {
        loadingEl.classList.remove('is-hidden');
      } else {
        loadingEl.classList.add('is-hidden');
      }
    }
  }
  
  _showError(message) {
    const contentEl = this.containerEl?.querySelector('.an-team-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 200px; text-align: center;">
          <div>
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="color: var(--status-error); margin-bottom: 8px;">Error Loading Team Data</h3>
            <p style="color: var(--text-secondary);">${message}</p>
            <button class="an-retry-btn" style="margin-top: 16px; padding: 8px 16px; background: var(--interactive-primary); color: var(--text-on-primary); border: none; border-radius: 4px; cursor: pointer;">
              Try Again
            </button>
          </div>
        </div>
      `;
      
      // Add retry functionality
      const retryBtn = contentEl.querySelector('.an-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this._loadData());
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - Event Handling                                       */
  /* ---------------------------------------------------------------------- */
  _setupEventListeners() {
    if (!this.containerEl) return;
    
    // Filter change handlers
    const filterSelects = this.containerEl.querySelectorAll('[data-filter]');
    filterSelects.forEach(select => {
      select.addEventListener('change', (e) => {
        const filterType = e.target.dataset.filter;
        const filterValue = e.target.value;
        
        // Update filter state
        this.filters[`selected${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`] = filterValue;
        
        console.log('[Team Analytics] Filter changed:', filterType, '=', filterValue);
        console.log('[Team Analytics] New filters:', this.filters);
        
        // Reload data with new filters
        this._loadData();
      });
    });
    
    // Refresh button handler
    const refreshBtn = this.containerEl.querySelector('.an-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        console.log('[Team Analytics] Manual refresh requested');
        this._loadData();
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - Utilities                                            */
  /* ---------------------------------------------------------------------- */
  _parseGroupIdFromFull(stageGroupId) {
    if (!stageGroupId) return '';
    const parts = stageGroupId.split("#GRP#");
    return parts.length > 1 ? parts[1] : stageGroupId;
  }
  
  _getUserColor(username) {
    // Generate consistent colors based on username
    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
    const hash = username.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  }
  
  _getUserInitials(username) {
    if (!username) return '?';
    
    // Handle usernames with dots or underscores
    const parts = username.split(/[._]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    
    // Single word username
    return username.substring(0, 2).toUpperCase();
  }
  
  _getWorkloadClass(status) {
    switch (status) {
      case 'OVERLOAD': return 'background: #fecaca; color: #dc2626;';
      case 'HIGH': return 'background: #fef3c7; color: #92400e;';
      case 'AVAILABLE': return 'background: #d1fae5; color: #065f46;';
      default: return 'background: #d1fae5; color: #065f46;';
    }
  }
  
  _getWorkloadLabel(status) {
    switch (status) {
      case 'OVERLOAD': return 'Overloaded';
      case 'HIGH': return 'High Load';
      case 'AVAILABLE': return 'Available Capacity';
      default: return 'Normal Load';
    }
  }
  
  _getStatusColor(status) {
    switch (status) {
      case 'NEW': return '#6b7280';
      case 'ANSWER_GENERATED': return '#3b82f6';
      case 'IN_PROGRESS': return '#f59e0b';
      case 'PENDING_REVIEW': return '#8b5cf6';
      case 'NEEDS_REVISION': return '#ef4444';
      case 'READY': return '#10b981';
      case 'APPROVED': return '#059669';
      default: return '#6b7280';
    }
  }
  
  _formatStatusLabel(status) {
    return status.replace(/_/g, ' ').toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  _getIndicatorColor(status) {
    switch (status) {
      case 'CRITICAL': return 'var(--status-error)';
      case 'WARNING': return 'var(--status-warning)';
      case 'GOOD': return 'var(--status-success)';
      default: return 'var(--interactive-primary)';
    }
  }
  
  _formatIndicatorLabel(key) {
    const labels = {
      questionsStuck: 'Questions Stuck >3 Days',
      avgRiskTechnical: 'Avg AI Risk Score',
      availableCapacity: 'Team Members Available'
    };
    return labels[key] || key;
  }
}

export default QuestionGridAnalyticsTeam;