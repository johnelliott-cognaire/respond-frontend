// ui/components/question-grid-analytics-overview.js

/**
 * QuestionGridAnalyticsOverview
 * 
 * Executive dashboard component displaying high-level metrics, status distribution,
 * progress by tab, and team workload summary. Fixed layout issues and simplified data structure.
 */
export class QuestionGridAnalyticsOverview {
  constructor(options = {}) {
    this.projectDocumentId = options.projectDocumentId;
    this.onFilterChange = options.onFilterChange || (() => {});
    
    this.containerEl = null;
    this.data = null;
  }

  /* ---------------------------------------------------------------------- */
  /* Public API                                                             */
  /* ---------------------------------------------------------------------- */
  render(containerEl, data) {
    this.containerEl = containerEl;
    this.data = data;
    
    this._buildOverviewDOM();
  }
  
  destroy() {
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - DOM Construction                                     */
  /* ---------------------------------------------------------------------- */
  _buildOverviewDOM() {
    if (!this.containerEl || !this.data) return;
    
    this.containerEl.innerHTML = `
      <div class="an-overview-dashboard">
        ${this._buildHeaderStatsHTML()}
        ${this._buildAlertsHTML()}
        ${this._buildMainContentHTML()}
        ${this._buildTabProgressHTML()}
      </div>
    `;
    
    this._setupEventListeners();
  }
  
  _buildHeaderStatsHTML() {
    const { document } = this.data;
    
    return `
      <div class="an-header-stats">
        <div class="an-stat-item">
          <div class="an-stat-value">
            ${document.totalQuestions.toLocaleString()}
          </div>
          <div class="an-stat-label">Total Questions</div>
        </div>
        <div class="an-stat-item">
          <div class="an-stat-value">
            ${document.overallProgress}%
          </div>
          <div class="an-stat-label">Overall Progress</div>
        </div>
        <div class="an-stat-item">
          <div class="an-stat-value">
            ${document.avgRiskScore}
          </div>
          <div class="an-stat-label">Avg AI Risk Score</div>
        </div>
        <div class="an-stat-item">
          <div class="an-stat-value">
            ${document.avgCompleteness}%
          </div>
          <div class="an-stat-label">Avg AI Completeness</div>
        </div>
      </div>
    `;
  }
  
  _buildAlertsHTML() {
    if (!this.data.alerts || this.data.alerts.length === 0) return '';
    
    const criticalAlerts = this.data.alerts.filter(alert => alert.severity === 'HIGH');
    if (criticalAlerts.length === 0) return '';
    
    return `
      <div class="an-alerts-section">
        <div class="an-alert-title">
          <span class="an-alert-icon">⚠️</span>
          Current Status Alert
        </div>
        ${criticalAlerts.map(alert => `
          <div class="an-alert-message">
            ${alert.message}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  _buildMainContentHTML() {
    return `
      <div class="an-main-content">
        <div class="an-main-content-left">
          ${this._buildStatusDistributionHTML()}
        </div>
        <div class="an-main-content-right">
          ${this._buildTeamWorkloadHTML()}
        </div>
      </div>
    `;
  }
  
  _buildStatusDistributionHTML() {
    const { statusDistribution } = this.data;
    const statuses = [
      { key: 'NEW', label: 'NEW', color: '#6b7280' },
      { key: 'ANSWER_GENERATED', label: 'ANSWER\nGENERATED', color: '#3b82f6' },
      { key: 'IN_PROGRESS', label: 'IN\nPROGRESS', color: '#f59e0b' },
      { key: 'PENDING_REVIEW', label: 'PENDING\nREVIEW', color: '#8b5cf6', isBottleneck: statusDistribution.PENDING_REVIEW > 100 },
      { key: 'NEEDS_REVISION', label: 'NEEDS\nREVISION', color: '#ef4444' },
      { key: 'READY', label: 'READY', color: '#10b981' },
      { key: 'APPROVED', label: 'APPROVED', color: '#059669' }
    ];
    
    return `
      <div class="an-status-distribution-card">
        <h3 class="an-card-title">
          Question Status Distribution
        </h3>
        
        <div class="an-status-flow">
          ${statuses.map((status, index) => `
            <div class="an-status-column ${status.isBottleneck ? 'bottleneck' : ''}">
              ${index < statuses.length - 1 ? `
                <div class="an-status-arrow">→</div>
              ` : ''}
              <div class="an-status-count">
                ${statusDistribution[status.key] || 0}
              </div>
              <div class="an-status-label">
                ${status.label}
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="an-quality-metrics">
          <div class="an-metric-card">
            <div class="an-metric-value">
              ${this.data.document.avgRiskScore}
            </div>
            <div class="an-metric-label">
              Average Risk Score
            </div>
            <div class="an-risk-indicator low-risk">
              Low Risk
            </div>
          </div>
          <div class="an-metric-card">
            <div class="an-metric-value">
              ${this.data.document.avgCompleteness}%
            </div>
            <div class="an-metric-label">
              Average Completeness
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  _buildTeamWorkloadHTML() {
    const { teamSummary } = this.data;
    
    const getWorkloadClass = (status) => {
      switch (status) {
        case 'OVERLOAD': return 'overload';
        case 'HIGH': return 'high';
        case 'AVAILABLE': return 'available';
        default: return 'normal';
      }
    };
    
    const getWorkloadLabel = (status) => {
      switch (status) {
        case 'OVERLOAD': return 'Overloaded';
        case 'HIGH': return 'High Load';
        case 'AVAILABLE': return 'Available Capacity';
        default: return 'Normal Load';
      }
    };
    
    return `
      <div class="an-team-workload-card">
        <h3 class="an-card-title">
          Team Workload
        </h3>
        
        <div class="an-team-members">
          ${teamSummary.map(member => `
            <div class="an-team-member">
              <div class="an-member-info">
                <div class="an-member-avatar" style="
                  background: ${this._getUserColor(member.username)};
                ">
                  ${this._getUserInitials(member.username)}
                </div>
                <div class="an-member-details">
                  <div class="an-member-name">
                    ${member.username}
                  </div>
                  <div class="an-workload-indicator ${getWorkloadClass(member.workloadStatus)}">
                    ${getWorkloadLabel(member.workloadStatus)}
                  </div>
                </div>
              </div>
              
              <div class="an-member-stats">
                <span class="an-assigned-count">${member.totalAssigned} assigned</span>
                <div class="an-status-badges">
                  ${Object.entries(member.statusCounts).map(([status, count]) => `
                    <span class="an-status-badge ${status.toLowerCase().replace('_', '-')}">
                      ${count}
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  _buildTabProgressHTML() {
    const { tabAnalytics } = this.data;
    
    const getTabColor = (tabId, tabName) => {
      // Use tab name to determine color since we might not have standardized IDs
      const name = (tabName || tabId || '').toLowerCase();
      if (name.includes('technical') || name.includes('architecture')) return '#3b82f6';
      if (name.includes('security') || name.includes('compliance')) return '#10b981';
      if (name.includes('business') || name.includes('terms')) return '#8b5cf6';
      if (name.includes('project') || name.includes('management')) return '#f59e0b';
      
      // Fallback colors for other tabs
      const colors = ['#6b7280', '#ef4444', '#06b6d4', '#84cc16'];
      const hash = (tabId || tabName || '').split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      return colors[Math.abs(hash) % colors.length];
    };
    
    return `
      <div class="an-tab-progress-section">
        <div class="an-tab-progress-card">
          <h3 class="an-card-title">
            Progress by Tab
          </h3>
          
          <div class="an-tab-grid">
            ${tabAnalytics.map(tab => {
              const tabColor = getTabColor(tab.tabId, tab.tabName);
              return `
                <div class="an-tab-card" style="border-left-color: ${tabColor};">
                  <div class="an-tab-header">
                    <div class="an-tab-title">
                      ${tab.tabName} (${tab.totalQuestions} questions)
                    </div>
                  </div>
                  
                  <div class="an-tab-stats">
                    ${tab.completionRate}% complete • Avg AI Risk: ${tab.avgRisk} • Avg AI Completeness: ${tab.avgCompleteness}%
                  </div>
                  
                  <div class="an-progress-bar">
                    <div class="an-progress-fill" style="
                      background: ${tabColor}; 
                      width: ${tab.completionRate}%;
                    "></div>
                  </div>
                  
                  <div class="an-status-mini">
                    ${Object.entries(tab.statusCounts).map(([status, count]) => `
                      <span class="an-mini-status status-${status.toLowerCase().replace('_', '-')}">
                        ${count} ${this._formatStatusShort(status)}
                      </span>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - Utilities                                            */
  /* ---------------------------------------------------------------------- */
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
  
  _formatStatusShort(status) {
    const shortNames = {
      'NEW': 'New',
      'ANSWER_GENERATED': 'Gen',
      'IN_PROGRESS': 'Prog',
      'PENDING_REVIEW': 'Rev',
      'NEEDS_REVISION': 'Rev',
      'READY': 'Ready',
      'APPROVED': 'App'
    };
    return shortNames[status] || status;
  }

  /* ---------------------------------------------------------------------- */
  /* Private helpers - Event Handling                                       */
  /* ---------------------------------------------------------------------- */
  _setupEventListeners() {
    // Add any interactive elements here
    // For now, this is a read-only dashboard
  }
}

export default QuestionGridAnalyticsOverview;