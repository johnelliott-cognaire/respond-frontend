// ui/views/corpus/corpus-document-topics-view.js - COMPLETE VERSION
import { CorpusViewBase } from './corpus-view-base.js';
import { ErrorModal } from '../../modals/error-modal.js';
import { YesNoModal } from '../../modals/yesno-modal.js';
import { MessageModal } from '../../modals/message-modal.js';
import { TextPromptModal } from '../../modals/text-prompt-modal.js';
import { CorpusDocumentTopicAssignModal } from '../../modals/corpus-document-topic-assign-modal.js';
import { getSubtenantAttributes } from '../../../api/subtenants.js';
import { getFreshSecurity } from '../../../utils/security-utils.js';
import { listUserGroups } from '../../../api/usergroups.js';
import { Tooltip } from '../../framework/tooltip.js';  // Updated path to tooltip.js

// Import API functions for topic management
import {
    createDocumentTopic,
    updateDocumentTopic,
    deleteDocumentTopic,
    updateAllTopics
} from '../../../api/corpus-topics.js';

// Import new responsive table component
import { ResponsiveTable } from '../../components/responsive-table.js';

/**
 * CorpusDocumentTopicsView
 * Provides an administration interface for managing document topic approval rules
 */
export class CorpusDocumentTopicsView extends CorpusViewBase {
    constructor(store, jobController) {
        super(store, jobController);

        // Initialize state tracking
        this._loadingCounter = 0;

        // Initialize modals
        this.errorModal = new ErrorModal();
        this.confirmModal = new YesNoModal();
        this.messageModal = new MessageModal();
        this.textPromptModal = new TextPromptModal();

        this.topicAssignModal = new CorpusDocumentTopicAssignModal();

        // Create tooltip instance
        this.tooltipInstance = new Tooltip();

        // State
        this.loading = false;
        this.corpusConfig = null;
        this.approvalByTopic = {};
        this.selectedTopic = null;
        this.availableUserGroups = [];
        this.hasUnsavedChanges = false;
        this.originalData = null; // For tracking changes

        // Sorting state
        this.sortField = 'name';
        this.sortDirection = 'asc';

        // Temporary state for newly added subtopics
        this.newSubtopicText = '';
        this.newSubtopicWeight = 1.0;
        this.newPenaltyText = '';
        this.newPenaltyWeight = 1.5;
        this.newBlockingText = '';

        // Track current active subtopic tab
        this.activeSubtopicTab = 'allowed';

        // UI references
        this.topicListContainer = null;
        this.topicConfigContainer = null;
        
        // Table components
        this.topicListTable = null;

        this.debouncedRender = this.debounce(() => {
            this.renderTopicList();
        }, 100);

        // Define tooltips
        this.tooltips = {
            "primary_approver_group": "The user group responsible for reviewing documents with this topic. Members of this group will see pending documents in their approval queue.",
            "auto_approve_toggle": "When enabled, documents with minimal changes (below the token change threshold) will be automatically approved if they pass all quality checks. Useful for small updates that don't need full review.",
            "bypass_ai_toggle": "When enabled, documents will skip AI evaluation and go directly to human review. Use for topics where AI evaluation is less reliable or human judgment is always preferred.",
            "token_change_threshold": "Maximum percentage of text that can change for auto-approval of minor edits. Lower values (1-5%) are appropriate for cosmetic changes, higher values (10-20%) allow substantive revisions to qualify for auto-approval.",
            "relevance_minimum": "Minimum required overall topic relevance score (0-100). Higher values ensure stronger topic adherence. Example: A score of 85 requires substantial, focused coverage of the topic's allowed subtopics.",
            "quality_minimum": "Minimum required grammar and spelling score (0-100). Higher values enforce stricter writing quality. Example: A score of 90 allows very few grammatical errors or misspellings.",
            "tone_balance_rule": "Determines how promotional vs. factual content is evaluated. 'Greater than' requires more promotional content, 'Less than' requires more factual content, 'N/A' applies no tone requirements.",
            "tone_threshold": "The boundary value for the tone balance rule (0-100). A value of 50 represents balanced content. Lower values (0-40) favor factual, objective content. Higher values (60-100) allow more promotional language. Example of highly promotional content: 'The BEST solution on the market with UNMATCHED performance!'",
            "allowed_subtopics": "Key phrases or concepts that positively contribute to the document's relevance score. Higher coverage of these subtopics increases the overall score. Examples: For a 'security' topic, phrases like 'encryption', 'access control', or 'vulnerability management'.",
            "allowed_subtopic_weight": "Multiplier that determines how strongly this subtopic contributes to the overall score. Default is 1.0. Higher weights (e.g., 2.0) make this subtopic twice as important. Example: Weight of 1.5 for 'data protection' makes it 50% more impactful than subtopics with weight 1.0.",
            "penalty_subtopics": "Phrases or concepts that reduce the document's relevance score when present. Examples: For a technical document, phrases like 'pricing details' or 'contract terms' might be penalized as off-topic content.",
            "penalty_subtopic_weight": "Multiplier that determines how strongly this subtopic reduces the overall score. Higher values (e.g., 3.0) create stronger penalties. Example: Penalty weight of 2.0 for 'competing products' would heavily penalize mentioning competitors.",
            "blocking_subtopics": "Phrases or concepts that automatically reject a document when detected. Use for prohibited content that should never be approved. Examples: For public documentation, phrases like 'internal use only' or 'confidential information' might be blocking."
        };
    }

    /**
     * IMPORTANT: This method is intentionally empty
     * The header is managed entirely by corpus-manager.js
     */
    renderHeader() {
        return '';
    }

    /**
     * Initialize the responsive table component
     */
    initializeResponsiveTable() {
        console.log('[CorpusDocumentTopicsView] Initializing responsive table');

        // Initialize topic list table
        this.topicListTable = new ResponsiveTable({
            selectable: false,
            sortable: true,
            emptyMessage: 'No topics defined',
            className: 'responsive-table',
            onSort: (field, direction) => {
                this.sortField = field;
                this.sortDirection = direction;
                this.renderTopicList();
            },
            onRowClick: (topic, index, event) => {
                this.selectTopic(topic.name);
            }
        });
    }

    /**
     * Get topic list table columns definition for responsive table
     */
    getTopicListColumns() {
        return [
            {
                key: 'name',
                label: 'Topic Name',
                primary: true, // This will be emphasized
                sortable: true
            },
            {
                key: 'approver',
                label: 'Approver',
                sortable: true,
                render: (value) => {
                    if (!value) return '<span class="text-muted">Not set</span>';
                    // Remove "Group:" prefix for display
                    const displayName = value.startsWith('Group:') ? value.substring(6) : value;
                    return this.escapeHtml(displayName);
                }
            },
            {
                key: 'auto_approve',
                label: 'Auto Approve',
                sortable: true,
                type: 'boolean'
            },
            {
                key: 'corpora_count',
                label: 'Corpora Count',
                sortable: true,
                render: (value) => {
                    return `<span class="badge">${value || 0}</span>`;
                }
            }
        ];
    }

    /**
     * Prepare topic data for the flexible table
     */
    prepareTopicTableData() {
        if (!this.approvalByTopic) return [];

        return Object.entries(this.approvalByTopic).map(([topicName, topicData]) => ({
            name: topicName,
            approver: topicData.primary_group || '',
            auto_approve: topicData.auto_approve_minor_edits || false,
            corpora_count: this.countCorpusAssignments(topicName),
            _originalData: topicData // Keep reference to original data
        }));
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Main render method for the topics view
     */
    renderContent() {
        return `
      <div class="corpus-two-pane-container">
        <!-- Left panel: Topic list -->
        <div class="corpus-two-pane-content">
          <div class="corpus-two-pane-left">
            <div class="topic-list-controls">
              <button id="add-topic-button" class="btn btn--primary">
                <i class="fas fa-plus"></i> Add Topic
              </button>
              <button id="delete-topic-button" class="btn btn--danger" ${!this.selectedTopic ? 'disabled' : ''}>
                <i class="fas fa-trash"></i> Delete Topic
              </button>
              <button id="assign-topics-button" class="btn btn--secondary">
                <i class="fas fa-link"></i> Assign to Corpora
              </button>
            </div>

            <div id="topic-list-container" class="topic-list">
              <!-- Topic list table will be rendered here by FlexibleTable component -->
            </div>
          </div>
          
          <!-- Right panel: Topic configuration -->
          <div class="corpus-two-pane-right">
            <div id="topic-config-container">
              ${this.selectedTopic
                ? this.renderTopicConfiguration()
                : `<p class="placeholder-text">Select a topic to configure or add a new one</p>`}
            </div>
          </div>
        </div>
        
        <!-- Footer actions -->
        <div class="corpus-two-pane-footer">
          <div class="footer-actions">
            <button id="reset-button" class="btn btn--secondary" ${!this.hasUnsavedChanges ? 'disabled' : ''}>
              Reset
            </button>
            <button id="save-changes-button" class="btn btn--primary" ${!this.hasUnsavedChanges ? 'disabled' : ''}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    `;
    }

    /**
     * Renders the sort indicator for a column
     */
    renderSortIndicator(field) {
        if (this.sortField !== field) {
            return '';
        }

        return this.sortDirection === 'asc'
            ? '<i class="fas fa-sort-up"></i>'
            : '<i class="fas fa-sort-down"></i>';
    }

    /**
     * Renders the tone balance rule controls - update this function
     */
    renderToneBalanceControls(topic) {
        const ruleType = topic.tone_balance_rule.type || 'N/A';
        // Initialize threshold to 50 if not set and rule type is not N/A
        let threshold = topic.tone_balance_rule.threshold;
        if (threshold === undefined && ruleType !== 'N/A') {
            threshold = 50;
            // Update the topic object
            topic.tone_balance_rule.threshold = threshold;
        } else if (threshold === undefined) {
            threshold = 50; // Default for display even if N/A
        }
        const showThreshold = ruleType !== 'N/A';

        return `
    <div class="form-group">
      <div style="display: flex; align-items: center; margin-bottom: 5px;">
        <label for="tone-balance-rule">Tone Balance Rule:</label>
        <i class="fas fa-info-circle tooltip-icon" id="tone-balance-rule-tooltip"></i>
      </div>
      <select id="tone-balance-rule" class="form-control">
        <option value="N/A" ${ruleType === 'N/A' ? 'selected' : ''}>Not applicable</option>
        <option value=">" ${ruleType === '>' ? 'selected' : ''}>Greater than</option>
        <option value="<" ${ruleType === '<' ? 'selected' : ''}>Less than</option>
      </select>
    </div>
    
    <div id="tone-threshold-container" class="form-group" ${!showThreshold ? 'style="display:none;"' : ''}>
      <div style="display: flex; align-items: center; margin-bottom: 5px;">
        <label for="tone-threshold">Threshold: <span id="tone-threshold-value">${threshold}</span></label>
        <i class="fas fa-info-circle tooltip-icon" id="tone-threshold-tooltip"></i>
      </div>
      <div class="slider-container">
        <input type="range" id="tone-threshold" 
              min="0" max="100" step="5" 
              value="${threshold}" 
              class="slider">
        <div class="slider-limits">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
    </div>
  `;
    }

    /**
     * Renders the topic configuration panel - update only this function
     */
    renderTopicConfiguration() {
        if (!this.selectedTopic || !this.approvalByTopic[this.selectedTopic]) {
            return `<p class="placeholder-text">Select a topic to configure</p>`;
        }

        const topic = this.approvalByTopic[this.selectedTopic];

        return `
    <div class="topic-configuration">
      <h2 class="topic-config-title">Topic Configuration: ${this.selectedTopic}</h2>
      
      <!-- Basic Settings Section -->
      <div class="config-section">
        <h3 class="section-title">Basic Settings</h3>
        
        <div class="form-group">
          <div style="display: flex; align-items: center; margin-bottom: 5px;">
            <label for="primary-approver-group">Primary Approver Group:</label>
            <i class="fas fa-info-circle tooltip-icon" id="primary-approver-group-tooltip"></i>
          </div>
          <select id="primary-approver-group" class="form-control">
            ${this.renderApproverGroupOptions(topic.primary_group)}
          </select>
        </div>
        
        <div class="form-group">
          <div class="checkbox-container">
            <input type="checkbox" id="auto-approve-toggle" ${topic.auto_approve_minor_edits ? 'checked' : ''}>
            <label for="auto-approve-toggle">Auto-approve Minor Edits</label>
            <i class="fas fa-info-circle tooltip-icon" id="auto-approve-toggle-tooltip"></i>
          </div>
        </div>
        
        <div class="form-group">
          <div class="checkbox-container">
            <input type="checkbox" id="bypass-ai-toggle" ${topic.bypass_ai_review ? 'checked' : ''}>
            <label for="bypass-ai-toggle">Bypass AI Review</label>
            <i class="fas fa-info-circle tooltip-icon" id="bypass-ai-toggle-tooltip"></i>
          </div>
        </div>
        
        <div class="form-group">
          <div style="display: flex; align-items: center; margin-bottom: 5px;">
            <label for="token-change-threshold">Token Change Threshold: <span id="token-change-threshold-value">${(topic.token_change_threshold * 100).toFixed(0)}%</span></label>
            <i class="fas fa-info-circle tooltip-icon" id="token-change-threshold-tooltip"></i>
          </div>
          <div class="slider-container">
            <input type="range" id="token-change-threshold" 
                  min="1" max="20" step="1" 
                  value="${topic.token_change_threshold * 100}" 
                  class="slider">
            <div class="slider-limits">
              <span>1%</span>
              <span>20%</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Quality Thresholds Section -->
      <div class="config-section">
        <h3 class="section-title">Quality Thresholds</h3>
        
        <div class="form-group">
          <div style="display: flex; align-items: center; margin-bottom: 5px;">
            <label for="relevance-minimum">Relevance Minimum: <span id="relevance-minimum-value">${topic.relevance_min}</span></label>
            <i class="fas fa-info-circle tooltip-icon" id="relevance-minimum-tooltip"></i>
          </div>
          <div class="slider-container">
            <input type="range" id="relevance-minimum" 
                  min="0" max="100" step="5" 
                  value="${topic.relevance_min}" 
                  class="slider">
            <div class="slider-limits">
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <div style="display: flex; align-items: center; margin-bottom: 5px;">
            <label for="quality-minimum">Quality Minimum: <span id="quality-minimum-value">${topic.quality_min}</span></label>
            <i class="fas fa-info-circle tooltip-icon" id="quality-minimum-tooltip"></i>
          </div>
          <div class="slider-container">
            <input type="range" id="quality-minimum" 
                  min="0" max="100" step="5" 
                  value="${topic.quality_min}" 
                  class="slider">
            <div class="slider-limits">
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        </div>
        
        ${this.renderToneBalanceControls(topic)}
      </div>
      
      <!-- Subtopics Management Section -->
      <div class="config-section">
        <h3 class="section-title">Subtopics Management</h3>
        
        <div class="tabs-container">
          <div class="document-preview-tabs">
            <button class="tab-button ${this.activeSubtopicTab === 'allowed' ? 'active' : ''}" data-tab="allowed">Allowed</button>
            <button class="tab-button ${this.activeSubtopicTab === 'penalty' ? 'active' : ''}" data-tab="penalty">Penalty</button>
            <button class="tab-button ${this.activeSubtopicTab === 'blocking' ? 'active' : ''}" data-tab="blocking">Blocking</button>
          </div>
          
          <div class="tab-pane ${this.activeSubtopicTab === 'allowed' ? 'active' : ''}" id="allowed-tab">
            ${this.renderAllowedSubtopicsTab(topic)}
          </div>
          
          <div class="tab-pane ${this.activeSubtopicTab === 'penalty' ? 'active' : ''}" id="penalty-tab">
            ${this.renderPenaltySubtopicsTab(topic)}
          </div>
          
          <div class="tab-pane ${this.activeSubtopicTab === 'blocking' ? 'active' : ''}" id="blocking-tab">
            ${this.renderBlockingSubtopicsTab(topic)}
          </div>
        </div>
      </div>
    </div>
  `;
    }

    /**
     * Renders the options for approver group dropdown
     */
    renderApproverGroupOptions(selectedGroup) {
        if (!this.userGroupsLoaded) {
            return `
        <option value="" disabled selected>Loading approver groups...</option>
        <option value="Group:GlobalApprovers">GlobalApprovers (Default)</option>
      `;
        }

        if (this.availableUserGroups.length === 0) {
            return `<option value="Group:GlobalApprovers">GlobalApprovers (Default)</option>`;
        }

        return this.availableUserGroups.map(group =>
            `<option value="${group.id}" ${group.id === selectedGroup ? 'selected' : ''}>${group.name}</option>`
        ).join('');
    }

    /**
     * Renders the allowed subtopics tab content
     */
    renderAllowedSubtopicsTab(topic) {
        const allowedSubtopics = Array.isArray(topic.allowed_subtopics)
            ? topic.allowed_subtopics
            : [];

        // Normalize allowed subtopics to objects with phrase and weight
        const normalizedSubtopics = allowedSubtopics.map(item => {
            if (typeof item === 'string') {
                // Convert string format to object format
                return { phrase: item, weight: 1.0 };
            }
            return item;
        });

        return `
    <div class="subtopics-tab-content">
      <div class="subtopic-header">
        <h4>
          Allowed Subtopics 
          <i class="fas fa-info-circle tooltip-icon" id="allowed-subtopics-tooltip"></i>
        </h4>
        <p class="subtopic-description">Define key phrases that contribute positively to the document's relevance score.</p>
      </div>
      
      <div class="subtopic-controls">
        <div class="add-subtopic-form">
          <input type="text" id="new-allowed-subtopic" class="form-control" placeholder="New subtopic phrase">
          <div style="display: flex; align-items: center;">
            <label for="new-allowed-weight">
              Weight:
              <input type="number" id="new-allowed-weight" class="form-control" value="1.0" min="0.1" max="2.0" step="0.1">
            </label>
            <i class="fas fa-info-circle tooltip-icon" id="allowed-subtopic-weight-tooltip"></i>
          </div>
          <button id="add-allowed-subtopic" class="btn btn--success">
            <i class="fas fa-plus"></i> Add
          </button>
        </div>
      </div>
      
      <div class="subtopics-table-container">
        <table class="subtopics-table">
          <thead>
            <tr>
              <th width="40px"></th>
              <th>Phrase</th>
              <th width="100px">Weight</th>
            </tr>
          </thead>
          <tbody>
            ${normalizedSubtopics.length === 0
                ? `<tr><td colspan="3">No allowed subtopics defined</td></tr>`
                : normalizedSubtopics.map((item, index) => `
                <tr data-index="${index}">
                  <td>
                    <input type="radio" name="allowed-subtopic-selection" value="${index}">
                  </td>
                  <td>${item.phrase}</td>
                  <td>${item.weight || 1.0}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="subtopic-actions">
        <button id="remove-allowed-subtopic" class="btn btn--danger" disabled>
          <i class="fas fa-minus"></i> Remove
        </button>
      </div>
    </div>
  `;
    }

    /**
     * Renders the penalty subtopics tab content
     */
    renderPenaltySubtopicsTab(topic) {
        const penaltySubtopics = Array.isArray(topic.penalty_subtopics)
            ? topic.penalty_subtopics
            : [];

        return `
    <div class="subtopics-tab-content">
      <div class="subtopic-header">
        <h4>
          Penalty Subtopics 
          <i class="fas fa-info-circle tooltip-icon" id="penalty-subtopics-tooltip"></i>
        </h4>
        <p class="subtopic-description">Define phrases that reduce the document's relevance score when present.</p>
      </div>
      
      <div class="subtopic-controls">
        <div class="add-subtopic-form">
          <input type="text" id="new-penalty-subtopic" class="form-control" placeholder="New penalty phrase">
          <div style="display: flex; align-items: center;">
            <label for="new-penalty-weight">
              Penalty Weight:
              <input type="number" id="new-penalty-weight" class="form-control" value="1.5" min="0.1" max="5.0" step="0.1">
            </label>
            <i class="fas fa-info-circle tooltip-icon" id="penalty-subtopic-weight-tooltip"></i>
          </div>
          <button id="add-penalty-subtopic" class="btn btn--success">
            <i class="fas fa-plus"></i> Add
          </button>
        </div>
      </div>
      
      <div class="subtopics-table-container">
        <table class="subtopics-table">
          <thead>
            <tr>
              <th width="40px"></th>
              <th>Phrase</th>
              <th width="120px">Penalty Weight</th>
            </tr>
          </thead>
          <tbody>
            ${penaltySubtopics.length === 0
                ? `<tr><td colspan="3">No penalty subtopics defined</td></tr>`
                : penaltySubtopics.map((item, index) => `
                <tr data-index="${index}">
                  <td>
                    <input type="radio" name="penalty-subtopic-selection" value="${index}">
                  </td>
                  <td>${item.subtopic || item.phrase}</td>
                  <td>${item.penalty_weight}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="subtopic-actions">
        <button id="remove-penalty-subtopic" class="btn btn--danger" disabled>
          <i class="fas fa-minus"></i> Remove
        </button>
      </div>
    </div>
  `;
    }

    /**
     * Renders the blocking subtopics tab content
     */
    renderBlockingSubtopicsTab(topic) {
        const blockingSubtopics = Array.isArray(topic.blocking_subtopics)
            ? topic.blocking_subtopics
            : [];

        return `
    <div class="subtopics-tab-content">
      <div class="subtopic-header">
        <h4>
          Blocking Subtopics 
          <i class="fas fa-info-circle tooltip-icon" id="blocking-subtopics-tooltip"></i>
        </h4>
        <p class="subtopic-description">Define phrases that automatically reject a document when detected.</p>
      </div>
    
      <div class="subtopic-controls">
        <div class="add-subtopic-form">
          <input type="text" id="new-blocking-subtopic" class="form-control" placeholder="New blocking phrase">
          <button id="add-blocking-subtopic" class="btn btn--success">
            <i class="fas fa-plus"></i> Add
          </button>
        </div>
      </div>
      
      <div class="subtopics-table-container">
        <table class="subtopics-table">
          <thead>
            <tr>
              <th width="40px"></th>
              <th>Phrase</th>
            </tr>
          </thead>
          <tbody>
            ${blockingSubtopics.length === 0
                ? `<tr><td colspan="2">No blocking subtopics defined</td></tr>`
                : blockingSubtopics.map((item, index) => `
                <tr data-index="${index}">
                  <td>
                    <input type="radio" name="blocking-subtopic-selection" value="${index}">
                  </td>
                  <td>${item}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="subtopic-actions">
        <button id="remove-blocking-subtopic" class="btn btn--danger" disabled>
          <i class="fas fa-minus"></i> Remove
        </button>
      </div>
    </div>
  `;
    }

    /**
     * Renders the topic list using the responsive table component
     */
    renderTopicList() {
        const topicListContainer = this.containerEl?.querySelector('#topic-list-container');
        if (!topicListContainer) {
            console.warn('[CorpusDocumentTopicsView] Cannot find topic-list-container element');
            return;
        }

        console.log('[CorpusDocumentTopicsView] Rendering topic list with approvalByTopic:', this.approvalByTopic);

        // Initialize or reattach responsive table
        if (!this.topicListTable) {
            this.topicListTable = new ResponsiveTable({
                selectable: false,
                sortable: true,
                emptyMessage: 'No topics defined',
                className: 'responsive-table',
                onSort: (field, direction) => {
                    this.sortField = field;
                    this.sortDirection = direction;
                    this.renderTopicList();
                },
                onRowClick: (topic, index, event) => {
                    this.selectTopic(topic.name);
                }
            });
        }
        
        // Check if the table needs to be reattached (after DOM rebuild)
        if (!this.topicListTable.container || !topicListContainer.contains(this.topicListTable.container)) {
            this.topicListTable.attachToDOM(topicListContainer);
            this.topicListTable.setColumns(this.getTopicListColumns());
        }

        if (!this.approvalByTopic || Object.keys(this.approvalByTopic).length === 0) {
            this.topicListTable.setData([]);
            return;
        }

        // Prepare and sort data
        const tableData = this.prepareTopicTableData();
        if (this.sortField && this.sortDirection) {
            this.sortTopicTableData(tableData);
        }

        // Set data in the responsive table
        this.topicListTable.setData(tableData);
        
        // Update selection
        this.updateTopicTableSelection();
    }

    /**
     * Sort topic table data based on current sort settings
     */
    sortTopicTableData(data) {
        if (!this.sortField) return;

        data.sort((a, b) => {
            let aValue = a[this.sortField];
            let bValue = b[this.sortField];

            // Handle different data types
            if (typeof aValue === 'boolean') {
                aValue = aValue ? 1 : 0;
                bValue = bValue ? 1 : 0;
            } else if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            let comparison = 0;
            if (aValue < bValue) comparison = -1;
            else if (aValue > bValue) comparison = 1;

            return this.sortDirection === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * Update topic table selection to highlight the selected topic
     */
    updateTopicTableSelection() {
        if (!this.topicListTable || !this.selectedTopic) return;

        // Use ResponsiveTable's selection functionality
        const rows = this.topicListTable.container?.querySelectorAll('.responsive-table-row');
        if (!rows) return;

        rows.forEach((row, index) => {
            const rowData = this.topicListTable.data[index];
            if (rowData && rowData.name === this.selectedTopic) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
    }

    /**
     * Attaches tooltips to UI elements
     */
    attachTooltips() {
        // Attaching tooltips to UI elements

        // Create a tooltip instance if we don't already have one
        if (!this.tooltipInstance) {
            this.tooltipInstance = new Tooltip();
        }

        // Ensure tooltips are attached after a longer delay to ensure DOM is fully rendered
        // Increasing from 100ms to 500ms for more reliable DOM access
        setTimeout(() => {
            console.log('[CorpusDocumentTopicsView] Starting tooltip attachment process');
            
            // Check if topicConfigContainer has content
            if (!this.topicConfigContainer || !this.topicConfigContainer.innerHTML.trim()) {
                console.warn('[CorpusDocumentTopicsView] Topic configuration container is empty, skipping tooltip attachment');
                return;
            }
            
            // Count available tooltip elements
            const tooltipElements = this.topicConfigContainer.querySelectorAll('[id$="-tooltip"]');
            console.log(`[CorpusDocumentTopicsView] Found ${tooltipElements.length} tooltip elements in DOM`);
            
            // Try document-wide element selection if containerEl lookup fails
            const findElement = (selector) => {
                const element = this.containerEl?.querySelector(selector);
                // Fall back to document-wide search if not found in container
                return element || document.querySelector(selector);
            };

            // Basic Settings tooltips
            this.attachTooltipBySelector('#primary-approver-group-tooltip', this.tooltips.primary_approver_group);
            this.attachTooltipBySelector('#auto-approve-toggle-tooltip', this.tooltips.auto_approve_toggle);
            this.attachTooltipBySelector('#bypass-ai-toggle-tooltip', this.tooltips.bypass_ai_toggle);
            this.attachTooltipBySelector('#token-change-threshold-tooltip', this.tooltips.token_change_threshold);

            // Quality Thresholds tooltips
            this.attachTooltipBySelector('#relevance-minimum-tooltip', this.tooltips.relevance_minimum);
            this.attachTooltipBySelector('#quality-minimum-tooltip', this.tooltips.quality_minimum);
            this.attachTooltipBySelector('#tone-balance-rule-tooltip', this.tooltips.tone_balance_rule);
            this.attachTooltipBySelector('#tone-threshold-tooltip', this.tooltips.tone_threshold);

            // Subtopics tooltips
            this.attachTooltipBySelector('#allowed-subtopics-tooltip', this.tooltips.allowed_subtopics);
            this.attachTooltipBySelector('#allowed-subtopic-weight-tooltip', this.tooltips.allowed_subtopic_weight);
            this.attachTooltipBySelector('#penalty-subtopics-tooltip', this.tooltips.penalty_subtopics);
            this.attachTooltipBySelector('#penalty-subtopic-weight-tooltip', this.tooltips.penalty_subtopic_weight);
            this.attachTooltipBySelector('#blocking-subtopics-tooltip', this.tooltips.blocking_subtopics);

            console.log('[CorpusDocumentTopicsView] Tooltips attachment attempted');
        }, 500); // Increased timeout
    }

    /**
     * New method: Attach tooltip by selector - combines querySelector approaches
     * for more robust element finding
     */
    attachTooltipBySelector(selector, tooltipText) {
        // Try container first, then fall back to document
        let element = this.containerEl?.querySelector(selector);

        if (!element) {
            element = document.querySelector(selector);
        }

        if (element) {
            // Found tooltip element

            // Check if tooltip class is available
            if (typeof this.tooltipInstance === 'undefined') {
                console.error(`[CorpusDocumentTopicsView] tooltipInstance is undefined when attaching to ${selector}`);
                return;
            }

            // Add the tooltip-icon class explicitly if not present
            if (!element.classList.contains('tooltip-icon') && !element.classList.contains('info-icon')) {
                element.classList.add('tooltip-icon');
            }

            try {
                this.tooltipInstance.attach(element, tooltipText);
                // Tooltip attached successfully
            } catch (error) {
                console.error(`[CorpusDocumentTopicsView] Error attaching tooltip to ${selector}:`, error);
            }
        } else {
            // Element not found - tooltip target may not be rendered yet
        }
    }

    /**
     * Attach tooltip only if element exists - with improved debugging
     */
    attachTooltipIfElementExists(elementId, tooltipText) {
        const element = this.containerEl?.querySelector(`#${elementId}`);
        if (element) {
            // Found tooltip element

            // Check if tooltip class is available
            if (typeof this.tooltipInstance === 'undefined') {
                console.error(`[CorpusDocumentTopicsView] tooltipInstance is undefined when attaching to #${elementId}`);
                return;
            }

            // Add the tooltip-icon class explicitly if not present
            if (!element.classList.contains('tooltip-icon') && !element.classList.contains('info-icon')) {
                element.classList.add('tooltip-icon');
            }

            // Attaching tooltip to element

            try {
                this.tooltipInstance.attach(element, tooltipText);
                // Tooltip attached successfully
            } catch (error) {
                console.error(`[CorpusDocumentTopicsView] Error attaching tooltip to #${elementId}:`, error);
            }
        } else {
            // Element not found - tooltip target may not be rendered yet
        }
    }

    /**
     * Builds UI components after rendering
     */
    attachEventListeners() {
        console.log('[CorpusDocumentTopicsView] Attaching event listeners');

        // Topic list container
        this.topicListContainer = this.containerEl.querySelector('.topic-list');

        // Topic configuration container
        this.topicConfigContainer = this.containerEl.querySelector('#topic-config-container');

        // Render the topic list with the current data
        this.debouncedRender();

        // Listen for topic assignment updates
        document.addEventListener('topic-assignments-updated', this.handleTopicAssignmentsUpdated);

        // Attach event listeners to topic list items
        this.containerEl.addEventListener('click', (e) => {
            console.log('[CorpusDocumentTopicsView] Click event on:', e.target);
            const topicItem = e.target.closest('.file-browser-row[data-topic]');
            console.log('[CorpusDocumentTopicsView] Found topic item:', topicItem);

            if (topicItem) {
                const topicName = topicItem.dataset.topic;
                console.log(`[CorpusDocumentTopicsView] Selecting topic: ${topicName}`);
                this.selectTopic(topicName);
            }
        });

        // Add topic button
        const addTopicButton = this.containerEl.querySelector('#add-topic-button');
        if (addTopicButton) {
            this.addListener(addTopicButton, 'click', () => {
                this.showAddTopicDialog();
            });
        }

        // Delete topic button
        const deleteTopicButton = this.containerEl.querySelector('#delete-topic-button');
        if (deleteTopicButton) {
            this.addListener(deleteTopicButton, 'click', () => {
                this.confirmDeleteTopic();
            });
        }

        // Assign topics button
        const assignTopicsButton = this.containerEl.querySelector('#assign-topics-button');
        if (assignTopicsButton) {
            this.addListener(assignTopicsButton, 'click', () => {
                this.showAssignTopicsModal();
            });
        }

        // Attach event listeners to config controls if topic is selected
        if (this.selectedTopic) {
            this.attachConfigEventListeners();
        }

        // Reset button
        const resetButton = this.containerEl.querySelector('#reset-button');
        if (resetButton) {
            this.addListener(resetButton, 'click', () => {
                this.confirmReset();
            });
        }

        // Save button
        const saveButton = this.containerEl.querySelector('#save-changes-button');
        if (saveButton) {
            this.addListener(saveButton, 'click', () => {
                this.saveChanges();
            });
        }

        // Attach tooltips to UI elements
        this.attachTooltips();
    }

    async refreshCorpusConfig() {
        try {
            console.log('[CorpusDocumentTopicsView] Forcing refresh of corpus configuration');

            // First, manually invalidate the cache if needed
            if (typeof invalidateSubtenantAttributeCache === 'function') {
                invalidateSubtenantAttributeCache('corpus_config');
            }

            // Then load the config (will now use fresh data since cache was invalidated)
            await this.loadCorpusConfig();

            // Update the UI with fresh data
            this.renderTopicList();

            console.log('[CorpusDocumentTopicsView] Corpus config refreshed successfully');
        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error refreshing corpus config:', error);
        }
    }

    /**
     * Handles a sort change
     */
    handleSortChange(field) {
        console.log(`[CorpusDocumentTopicsView] Sort changed to ${field}`);

        // Toggle direction if same field, otherwise reset to ascending
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }

        // Re-render the content to update sort indicators
        this.render(this.containerEl);

        // Sort and re-render the list
        this.sortTopics();
        this.debouncedRender();
    }

    /**
     * Sorts the topics based on current sort field and direction
     */
    sortTopics() {
        if (!this.approvalByTopic || Object.keys(this.approvalByTopic).length === 0) {
            return;
        }

        const sortedEntries = Object.entries(this.approvalByTopic).sort((a, b) => {
            const [topicNameA, configA] = a;
            const [topicNameB, configB] = b;

            let valA, valB;

            switch (this.sortField) {
                case 'name':
                    valA = topicNameA;
                    valB = topicNameB;
                    break;
                case 'approver':
                    valA = (configA.primary_group || '').replace('Group:', '');
                    valB = (configB.primary_group || '').replace('Group:', '');
                    break;
                case 'auto':
                    valA = configA.auto_approve_minor_edits ? 1 : 0;
                    valB = configB.auto_approve_minor_edits ? 1 : 0;
                    break;
                case 'corpora':
                    valA = this.countCorpusAssignments(topicNameA);
                    valB = this.countCorpusAssignments(topicNameB);
                    break;
                default:
                    valA = topicNameA;
                    valB = topicNameB;
            }

            // String comparison should be case-insensitive
            if (typeof valA === 'string' && typeof valB === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            // Compare based on sort direction
            if (this.sortDirection === 'asc') {
                return valA < valB ? -1 : valA > valB ? 1 : 0;
            } else {
                return valA > valB ? -1 : valA < valB ? 1 : 0;
            }
        });

        // Re-build the approvalByTopic object in sorted order
        const sortedTopics = {};
        sortedEntries.forEach(([topicName, config]) => {
            sortedTopics[topicName] = config;
        });

        // Replace the approvalByTopic with the sorted version
        // This doesn't modify the data, just the order for display
        this.approvalByTopic = sortedTopics;
    }

    async showAssignTopicsModal() {
        try {
            console.log('[CorpusDocumentTopicsView] Opening topic assignment modal');

            // Show the modal
            await this.topicAssignModal.show();

            // After modal is closed, refresh the data
            await this.loadCorpusConfig();

            // Render the topic list with updated corpora counts
            this.renderTopicList();

        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error showing topic assignment modal:', error);
            this.errorModal.show({
                title: 'Error',
                message: 'Failed to open topic assignment modal: ' + error.message
            });
        }
    }

    /**
     * Attach event listeners to topic configuration controls
     */
    attachConfigEventListeners() {
        // Subtopic tabs
        const tabButtons = this.containerEl.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            this.addListener(button, 'click', () => {
                const tab = button.dataset.tab;
                this.switchSubtopicTab(tab);
            });
        });

        // Tone balance rule type
        const toneRuleSelect = this.containerEl.querySelector('#tone-balance-rule');
        if (toneRuleSelect) {
            this.addListener(toneRuleSelect, 'change', () => {
                const ruleType = toneRuleSelect.value;
                const thresholdContainer = this.containerEl.querySelector('#tone-threshold-container');

                // Show/hide threshold input based on rule type
                if (ruleType === 'N/A') {
                    thresholdContainer.style.display = 'none';
                } else {
                    thresholdContainer.style.display = 'block';
                }

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic) {
                    topic.tone_balance_rule.type = ruleType;

                    // Initialize threshold to 50 if not set and rule type is not N/A
                    if (topic.tone_balance_rule.threshold === undefined && ruleType !== 'N/A') {
                        topic.tone_balance_rule.threshold = 50;

                        // Update the slider value and display
                        const toneThreshold = this.containerEl.querySelector('#tone-threshold');
                        const toneThresholdValue = this.containerEl.querySelector('#tone-threshold-value');

                        if (toneThreshold) {
                            toneThreshold.value = 50;
                        }

                        if (toneThresholdValue) {
                            toneThresholdValue.textContent = '50';
                        }
                    }

                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();
                }
            });
        }

        // Attach sliders
        this.attachSliderEventListeners();

        // Checkboxes
        this.attachCheckboxEventListeners();

        // Approver group
        const approverGroup = this.containerEl.querySelector('#primary-approver-group');
        if (approverGroup) {
            this.addListener(approverGroup, 'change', () => {
                const value = approverGroup.value;

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic) {
                    topic.primary_group = value;
                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();
                }
            });
        }

        // Add/remove subtopics
        this.attachSubtopicEventListeners();
    }

    /**
     * Attach event listeners to slider inputs
     */
    attachSliderEventListeners() {
        // Token change threshold slider
        const tokenThresholdSlider = this.containerEl.querySelector('#token-change-threshold');
        const tokenThresholdValue = this.containerEl.querySelector('#token-change-threshold-value');

        if (tokenThresholdSlider && tokenThresholdValue) {
            this.addListener(tokenThresholdSlider, 'input', () => {
                const value = parseInt(tokenThresholdSlider.value, 10);

                // Update display value in real-time
                tokenThresholdValue.textContent = `${value}%`;

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic) {
                    topic.token_change_threshold = value / 100; // Convert percentage to decimal
                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();
                }
            });
        }

        // Relevance minimum slider
        const relevanceSlider = this.containerEl.querySelector('#relevance-minimum');
        const relevanceValue = this.containerEl.querySelector('#relevance-minimum-value');

        if (relevanceSlider && relevanceValue) {
            this.addListener(relevanceSlider, 'input', () => {
                const value = parseInt(relevanceSlider.value, 10);

                // Update display value in real-time
                relevanceValue.textContent = `${value}`;

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic) {
                    topic.relevance_min = value;
                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();
                }
            });
        }

        // Quality minimum slider
        const qualitySlider = this.containerEl.querySelector('#quality-minimum');
        const qualityValue = this.containerEl.querySelector('#quality-minimum-value');

        if (qualitySlider && qualityValue) {
            this.addListener(qualitySlider, 'input', () => {
                const value = parseInt(qualitySlider.value, 10);

                // Update display value in real-time
                qualityValue.textContent = `${value}`;

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic) {
                    topic.quality_min = value;
                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();
                }
            });
        }

        // Tone threshold slider
        const toneThresholdSlider = this.containerEl.querySelector('#tone-threshold');
        const toneThresholdValue = this.containerEl.querySelector('#tone-threshold-value');

        if (toneThresholdSlider && toneThresholdValue) {
            this.addListener(toneThresholdSlider, 'input', () => {
                const value = parseInt(toneThresholdSlider.value, 10);

                // Update display value in real-time
                toneThresholdValue.textContent = `${value}`;

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic && topic.tone_balance_rule) {
                    topic.tone_balance_rule.threshold = value;
                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();
                }
            });
        }
    }

    /**
     * Helper function to attach event listeners to checkbox inputs
     * This overcomes potential event triggering issues
     */
    attachCheckboxEventListeners() {
        // Auto-approve toggle
        const autoApproveToggle = this.containerEl.querySelector('#auto-approve-toggle');
        if (autoApproveToggle) {
            this.addListener(autoApproveToggle, 'change', () => {
                const checked = autoApproveToggle.checked;

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic) {
                    topic.auto_approve_minor_edits = checked;
                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();

                    // Update topic list
                    this.debouncedRender();
                }
            });
        }

        // Bypass AI toggle
        const bypassAIToggle = this.containerEl.querySelector('#bypass-ai-toggle');
        if (bypassAIToggle) {
            this.addListener(bypassAIToggle, 'change', () => {
                const checked = bypassAIToggle.checked;

                // Update topic config
                const topic = this.approvalByTopic[this.selectedTopic];
                if (topic) {
                    topic.bypass_ai_review = checked;
                    this.hasUnsavedChanges = true;
                    this.updateActionButtonStates();
                }
            });
        }

        // Stop event propagation for tooltip icons to prevent toggling checkboxes
        const tooltipIcons = this.containerEl.querySelectorAll('.tooltip-icon');
        tooltipIcons.forEach(icon => {
            // First remove any existing click listeners
            const newIcon = icon.cloneNode(true);
            if (icon.parentNode) {
                icon.parentNode.replaceChild(newIcon, icon);
            }

            // Then add the new listener
            newIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`[CorpusDocumentTopicsView] Tooltip icon clicked, propagation stopped`);
            });
        });
    }

    /**
     * Attach event listeners for subtopic management
     */
    attachSubtopicEventListeners() {
        // Add allowed subtopic button
        const addAllowedButton = this.containerEl.querySelector('#add-allowed-subtopic');
        if (addAllowedButton) {
            this.addListener(addAllowedButton, 'click', () => {
                this.addAllowedSubtopic();
            });
        }

        // Add Enter key support for allowed subtopic input
        const allowedSubtopicInput = this.containerEl.querySelector('#new-allowed-subtopic');
        if (allowedSubtopicInput) {
            this.addListener(allowedSubtopicInput, 'keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.addAllowedSubtopic();
                }
            });
        }

        // Remove allowed subtopic button
        const removeAllowedButton = this.containerEl.querySelector('#remove-allowed-subtopic');
        if (removeAllowedButton) {
            this.addListener(removeAllowedButton, 'click', () => {
                this.removeAllowedSubtopic();
            });
        }

        // Add penalty subtopic button
        const addPenaltyButton = this.containerEl.querySelector('#add-penalty-subtopic');
        if (addPenaltyButton) {
            this.addListener(addPenaltyButton, 'click', () => {
                this.addPenaltySubtopic();
            });
        }

        // Add Enter key support for penalty subtopic input
        const penaltySubtopicInput = this.containerEl.querySelector('#new-penalty-subtopic');
        if (penaltySubtopicInput) {
            this.addListener(penaltySubtopicInput, 'keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.addPenaltySubtopic();
                }
            });
        }

        // Remove penalty subtopic button
        const removePenaltyButton = this.containerEl.querySelector('#remove-penalty-subtopic');
        if (removePenaltyButton) {
            this.addListener(removePenaltyButton, 'click', () => {
                this.removePenaltySubtopic();
            });
        }

        // Add blocking subtopic button
        const addBlockingButton = this.containerEl.querySelector('#add-blocking-subtopic');
        if (addBlockingButton) {
            this.addListener(addBlockingButton, 'click', () => {
                this.addBlockingSubtopic();
            });
        }

        // Add Enter key support for blocking subtopic input
        const blockingSubtopicInput = this.containerEl.querySelector('#new-blocking-subtopic');
        if (blockingSubtopicInput) {
            this.addListener(blockingSubtopicInput, 'keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.addBlockingSubtopic();
                }
            });
        }

        // Remove blocking subtopic button
        const removeBlockingButton = this.containerEl.querySelector('#remove-blocking-subtopic');
        if (removeBlockingButton) {
            this.addListener(removeBlockingButton, 'click', () => {
                this.removeBlockingSubtopic();
            });
        }

        // Allowed subtopic selection
        const allowedSelections = this.containerEl.querySelectorAll('input[name="allowed-subtopic-selection"]');
        allowedSelections.forEach(radio => {
            this.addListener(radio, 'change', () => {
                this.updateRemoveButtonState('allowed');
            });
        });

        // Penalty subtopic selection
        const penaltySelections = this.containerEl.querySelectorAll('input[name="penalty-subtopic-selection"]');
        penaltySelections.forEach(radio => {
            this.addListener(radio, 'change', () => {
                this.updateRemoveButtonState('penalty');
            });
        });

        // Blocking subtopic selection
        const blockingSelections = this.containerEl.querySelectorAll('input[name="blocking-subtopic-selection"]');
        blockingSelections.forEach(radio => {
            this.addListener(radio, 'change', () => {
                this.updateRemoveButtonState('blocking');
            });
        });
    }

    /**
     * Updates the state of remove buttons based on selection
     */
    updateRemoveButtonState(type) {
        const selectedRadio = this.containerEl.querySelector(`input[name="${type}-subtopic-selection"]:checked`);
        const removeButton = this.containerEl.querySelector(`#remove-${type}-subtopic`);

        if (removeButton) {
            removeButton.disabled = !selectedRadio;
        }
    }

    /**
     * Updates action buttons based on unsaved changes state
     */
    updateActionButtonStates() {
        const resetButton = this.containerEl.querySelector('#reset-button');
        const saveButton = this.containerEl.querySelector('#save-changes-button');

        if (resetButton) {
            resetButton.disabled = !this.hasUnsavedChanges;
        }

        if (saveButton) {
            saveButton.disabled = !this.hasUnsavedChanges;
        }

        // Also update delete topic button
        const deleteButton = this.containerEl.querySelector('#delete-topic-button');
        if (deleteButton) {
            deleteButton.disabled = !this.selectedTopic;
        }
    }

    /**
     * Adds a new allowed subtopic
     */
    addAllowedSubtopic() {
        console.log('[CorpusDocumentTopicsView] addAllowedSubtopic() called');
        
        const inputField = this.containerEl.querySelector('#new-allowed-subtopic');
        const weightField = this.containerEl.querySelector('#new-allowed-weight');

        if (!inputField || !weightField) {
            console.error('[CorpusDocumentTopicsView] Input fields not found');
            this.errorModal.show({
                title: 'Error',
                message: 'Input fields not found. Please try refreshing the page.'
            });
            return;
        }

        const subtopicText = inputField.value.trim();
        const weight = parseFloat(weightField.value);
        
        console.log('[CorpusDocumentTopicsView] Adding subtopic:', { subtopicText, weight, selectedTopic: this.selectedTopic });

        if (!subtopicText) {
            console.log('[CorpusDocumentTopicsView] Empty subtopic text');
            this.errorModal.show({
                title: 'Error',
                message: 'Please enter a subtopic phrase'
            });
            return;
        }

        if (isNaN(weight) || weight <= 0) {
            console.log('[CorpusDocumentTopicsView] Invalid weight:', weight);
            this.errorModal.show({
                title: 'Error',
                message: 'Weight must be a positive number'
            });
            return;
        }

        // Add to topic config
        const topic = this.approvalByTopic[this.selectedTopic];
        if (!topic) {
            console.error('[CorpusDocumentTopicsView] No topic selected or topic not found');
            this.errorModal.show({
                title: 'Error',
                message: 'No topic selected. Please select a topic first.'
            });
            return;
        }

        // Initialize array if needed
        if (!Array.isArray(topic.allowed_subtopics)) {
            console.log('[CorpusDocumentTopicsView] Initializing allowed_subtopics array');
            topic.allowed_subtopics = [];
        }

        // Check if already exists
        const exists = topic.allowed_subtopics.some(item => {
            if (typeof item === 'string') {
                return item === subtopicText;
            }
            return item.phrase === subtopicText;
        });

        if (exists) {
            console.log('[CorpusDocumentTopicsView] Duplicate subtopic:', subtopicText);
            this.errorModal.show({
                title: 'Duplicate',
                message: 'This subtopic already exists'
            });
            return;
        }

        // Add new subtopic
        const newSubtopic = {
            phrase: subtopicText,
            weight: weight
        };
        
        topic.allowed_subtopics.push(newSubtopic);
        console.log('[CorpusDocumentTopicsView] Added new subtopic:', newSubtopic);
        console.log('[CorpusDocumentTopicsView] Topic now has', topic.allowed_subtopics.length, 'allowed subtopics');

        // Clear input fields
        inputField.value = '';
        weightField.value = '1.0';

        // Mark changes
        this.hasUnsavedChanges = true;
        this.updateActionButtonStates();

        try {
            // Update UI
            console.log('[CorpusDocumentTopicsView] Updating UI after adding subtopic');
            if (this.topicConfigContainer) {
                this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
                this.attachConfigEventListeners();
            }
            console.log('[CorpusDocumentTopicsView] UI update completed');
        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error updating UI:', error);
            this.errorModal.show({
                title: 'Error',
                message: 'Failed to update the interface. The subtopic was added but the display may not reflect the change.'
            });
        }
    }

    /**
     * Removes the selected allowed subtopic
     */
    removeAllowedSubtopic() {
        const selectedRadio = this.containerEl.querySelector('input[name="allowed-subtopic-selection"]:checked');
        if (!selectedRadio) return;

        const index = parseInt(selectedRadio.value, 10);

        // Remove from topic config
        const topic = this.approvalByTopic[this.selectedTopic];
        if (topic && Array.isArray(topic.allowed_subtopics) && index >= 0 && index < topic.allowed_subtopics.length) {
            topic.allowed_subtopics.splice(index, 1);

            // Mark changes
            this.hasUnsavedChanges = true;
            this.updateActionButtonStates();

            // Update UI
            if (this.topicConfigContainer) {
                this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
                this.attachConfigEventListeners();
            }
        }
    }

    /**
     * Adds a new penalty subtopic
     */
    addPenaltySubtopic() {
        console.log('[CorpusDocumentTopicsView] addPenaltySubtopic() called');
        
        const inputField = this.containerEl.querySelector('#new-penalty-subtopic');
        const weightField = this.containerEl.querySelector('#new-penalty-weight');

        if (!inputField || !weightField) {
            console.error('[CorpusDocumentTopicsView] Penalty input fields not found');
            this.errorModal.show({
                title: 'Error',
                message: 'Input fields not found. Please try refreshing the page.'
            });
            return;
        }

        const subtopicText = inputField.value.trim();
        const weight = parseFloat(weightField.value);
        
        console.log('[CorpusDocumentTopicsView] Adding penalty subtopic:', { subtopicText, weight, selectedTopic: this.selectedTopic });

        if (!subtopicText) {
            console.log('[CorpusDocumentTopicsView] Empty penalty subtopic text');
            this.errorModal.show({
                title: 'Error',
                message: 'Please enter a subtopic phrase'
            });
            return;
        }

        if (isNaN(weight) || weight <= 0) {
            console.log('[CorpusDocumentTopicsView] Invalid penalty weight:', weight);
            this.errorModal.show({
                title: 'Error',
                message: 'Penalty weight must be a positive number'
            });
            return;
        }

        // Add to topic config
        const topic = this.approvalByTopic[this.selectedTopic];
        if (!topic) {
            console.error('[CorpusDocumentTopicsView] No topic selected or topic not found');
            this.errorModal.show({
                title: 'Error',
                message: 'No topic selected. Please select a topic first.'
            });
            return;
        }

        if (topic) {
            // Initialize array if needed
            if (!Array.isArray(topic.penalty_subtopics)) {
                topic.penalty_subtopics = [];
            }

            // Check if already exists
            const exists = topic.penalty_subtopics.some(item =>
                (item.subtopic === subtopicText || item.phrase === subtopicText)
            );

            if (exists) {
                console.log('[CorpusDocumentTopicsView] Duplicate penalty subtopic:', subtopicText);
                this.errorModal.show({
                    title: 'Duplicate',
                    message: 'This penalty subtopic already exists'
                });
                return;
            }

            // Add new subtopic
            const newSubtopic = {
                subtopic: subtopicText,
                penalty_weight: weight
            };
            
            topic.penalty_subtopics.push(newSubtopic);
            console.log('[CorpusDocumentTopicsView] Added new penalty subtopic:', newSubtopic);
            console.log('[CorpusDocumentTopicsView] Topic now has', topic.penalty_subtopics.length, 'penalty subtopics');

            // Clear input fields
            inputField.value = '';
            weightField.value = '1.5';

            // Mark changes
            this.hasUnsavedChanges = true;
            this.updateActionButtonStates();

            // Update UI
            if (this.topicConfigContainer) {
                this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
                this.attachConfigEventListeners();
            }
        }
    }

    /**
     * Removes the selected penalty subtopic
     */
    removePenaltySubtopic() {
        const selectedRadio = this.containerEl.querySelector('input[name="penalty-subtopic-selection"]:checked');
        if (!selectedRadio) return;

        const index = parseInt(selectedRadio.value, 10);

        // Remove from topic config
        const topic = this.approvalByTopic[this.selectedTopic];
        if (topic && Array.isArray(topic.penalty_subtopics) && index >= 0 && index < topic.penalty_subtopics.length) {
            topic.penalty_subtopics.splice(index, 1);

            // Mark changes
            this.hasUnsavedChanges = true;
            this.updateActionButtonStates();

            // Update UI
            if (this.topicConfigContainer) {
                this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
                this.attachConfigEventListeners();
            }
        }
    }

    /**
     * Adds a new blocking subtopic
     */
    addBlockingSubtopic() {
        console.log('[CorpusDocumentTopicsView] addBlockingSubtopic() called');
        
        const inputField = this.containerEl.querySelector('#new-blocking-subtopic');
        if (!inputField) {
            console.error('[CorpusDocumentTopicsView] Blocking input field not found');
            this.errorModal.show({
                title: 'Error',
                message: 'Input field not found. Please try refreshing the page.'
            });
            return;
        }

        const subtopicText = inputField.value.trim();
        console.log('[CorpusDocumentTopicsView] Adding blocking subtopic:', { subtopicText, selectedTopic: this.selectedTopic });

        if (!subtopicText) {
            console.log('[CorpusDocumentTopicsView] Empty blocking subtopic text');
            this.errorModal.show({
                title: 'Error',
                message: 'Please enter a blocking phrase'
            });
            return;
        }

        // Add to topic config
        const topic = this.approvalByTopic[this.selectedTopic];
        if (!topic) {
            console.error('[CorpusDocumentTopicsView] No topic selected or topic not found');
            this.errorModal.show({
                title: 'Error',
                message: 'No topic selected. Please select a topic first.'
            });
            return;
        }

        if (topic) {
            // Initialize array if needed
            if (!Array.isArray(topic.blocking_subtopics)) {
                topic.blocking_subtopics = [];
            }

            // Check if already exists
            const exists = topic.blocking_subtopics.includes(subtopicText);

            if (exists) {
                console.log('[CorpusDocumentTopicsView] Duplicate blocking subtopic:', subtopicText);
                this.errorModal.show({
                    title: 'Duplicate',
                    message: 'This blocking subtopic already exists'
                });
                return;
            }

            // Add new subtopic
            topic.blocking_subtopics.push(subtopicText);
            console.log('[CorpusDocumentTopicsView] Added new blocking subtopic:', subtopicText);
            console.log('[CorpusDocumentTopicsView] Topic now has', topic.blocking_subtopics.length, 'blocking subtopics');

            // Clear input field
            inputField.value = '';

            // Mark changes
            this.hasUnsavedChanges = true;
            this.updateActionButtonStates();

            // Update UI
            if (this.topicConfigContainer) {
                this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
                this.attachConfigEventListeners();
            }
        }
    }

    /**
     * Removes the selected blocking subtopic
     */
    removeBlockingSubtopic() {
        const selectedRadio = this.containerEl.querySelector('input[name="blocking-subtopic-selection"]:checked');
        if (!selectedRadio) return;

        const index = parseInt(selectedRadio.value, 10);

        // Remove from topic config
        const topic = this.approvalByTopic[this.selectedTopic];
        if (topic && Array.isArray(topic.blocking_subtopics) && index >= 0 && index < topic.blocking_subtopics.length) {
            topic.blocking_subtopics.splice(index, 1);

            // Mark changes
            this.hasUnsavedChanges = true;
            this.updateActionButtonStates();

            // Update UI
            if (this.topicConfigContainer) {
                this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
                this.attachConfigEventListeners();
            }
        }
    }

    /**
     * Shows the dialog for adding a new topic
     */
    showAddTopicDialog() {
        this.textPromptModal.show({
            title: 'Add New Topic',
            message: 'Enter a name for the new topic (lowercase with hyphens):',
            placeholder: 'topic-name',
            defaultValue: '',
            onOk: (topicName) => {
                console.log('[CorpusDocumentTopicsView] Creating new topic:', topicName);
                if (topicName && topicName.trim() !== '') {
                    this.createNewTopic(topicName.trim());
                }
            }
        });
    }


    /**
     * Creates a new topic with default settings
     */
    async createNewTopic(topicName) {
        if (!topicName) return;

        try {
            this.setLoading(true);
            console.log('[CorpusDocumentTopicsView] Creating new topic with name:', topicName);

            // Format validation
            if (!/^[a-z0-9-]+$/.test(topicName)) {
                this.errorModal.show({
                    title: 'Invalid Format',
                    message: 'Topic name must be lowercase with hyphens (no spaces or special characters)'
                });
                return;
            }

            // Check for existing topic
            if (this.approvalByTopic[topicName]) {
                this.errorModal.show({
                    title: 'Topic Exists',
                    message: `A topic with the name "${topicName}" already exists.`
                });
                return;
            }

            // Create default topic structure
            const topicData = {
                name: topicName,
                settings: {
                    primary_group: this.availableUserGroups.length > 0 ? this.availableUserGroups[0].id : 'Group:GlobalApprovers',
                    auto_approve_minor_edits: true,
                    bypass_ai_review: false,
                    relevance_min: 70,
                    quality_min: 70,
                    token_change_threshold: 0.05,
                    tone_balance_rule: {
                        type: 'N/A'
                    },
                    allowed_subtopics: [],
                    penalty_subtopics: [],
                    blocking_subtopics: []
                }
            };

            // Call the API to create the topic
            const response = await createDocumentTopic(topicData);

            if (!response.success) {
                throw new Error(response.message || 'Failed to create topic');
            }

            // Add to local state
            this.approvalByTopic[topicName] = topicData.settings;

            // Mark changes
            this.hasUnsavedChanges = false; // Don't mark as dirty since we just saved to API

            // Select the new topic
            this.selectTopic(topicName);

            // Update topic list
            this.renderTopicList();

            // Show success message
            this.messageModal.show({
                title: 'Success',
                message: `Topic "${topicName}" created successfully.`
            });

            // Emit corpus config update event for other components
            this.emitCorpusConfigUpdate();

        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error creating topic:', error);
            this.errorModal.show({
                title: 'Error',
                message: 'Failed to create topic: ' + (error.message || 'Unknown error')
            });
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Shows confirmation dialog for deleting a topic
     */
    confirmDeleteTopic() {
        if (!this.selectedTopic) return;

        this.confirmModal.show({
            title: 'Delete Topic',
            message: `Are you sure you want to delete the topic "${this.selectedTopic}"? This action cannot be undone.`,
            onYes: () => {
                this.deleteTopic();
            }
        });
    }

    /**
     * Deletes the selected topic
     */
    async deleteTopic() {
        if (!this.selectedTopic) return;

        try {
            this.setLoading(true);

            // Call API to check if topic is in use and delete it
            const response = await deleteDocumentTopic(this.selectedTopic);

            if (!response.success) {
                throw new Error(response.message || `Failed to delete topic '${this.selectedTopic}'`);
            }

            // Delete from local approval_by_topic object
            delete this.approvalByTopic[this.selectedTopic];

            // Mark changes
            this.hasUnsavedChanges = true;
            this.updateActionButtonStates();

            // Clear selection
            this.selectedTopic = null;

            // Show success message
            this.messageModal.show({
                title: 'Success',
                message: `Topic '${response.topic}' deleted successfully.`
            });

            // Emit corpus config update event for other components
            this.emitCorpusConfigUpdate();

            // Update UI
            this.render(this.containerEl);

        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error deleting topic:', error);
            this.errorModal.show({
                title: 'Error',
                message: error.message || 'Failed to delete topic'
            });
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Shows confirmation dialog for resetting changes
     */
    confirmReset() {
        if (!this.hasUnsavedChanges) return;

        this.confirmModal.show({
            title: 'Reset Changes',
            message: 'Are you sure you want to reset all changes? Any unsaved modifications will be lost.',
            onYes: () => {
                this.resetChanges();
            }
        });
    }

    /**
     * Resets all changes to original state
     */
    resetChanges() {
        if (!this.originalData) return;

        // Reset to original data
        this.approvalByTopic = JSON.parse(JSON.stringify(this.originalData));

        // Clear unsaved changes flag
        this.hasUnsavedChanges = false;
        this.updateActionButtonStates();

        // Re-render the view
        this.render(this.containerEl);
    }

    /**
     * Saves all changes to approval_by_topic
     */
    async saveChanges() {
        if (!this.hasUnsavedChanges) return;

        try {
            this.setLoading(true);

            // Prepare data for update - the entire approval_by_topic object
            const updateData = this.approvalByTopic;

            console.log('[CorpusDocumentTopicsView] Saving approval_by_topic data');

            // Call the API to update all topics at once
            // This will also handle cache invalidation
            const response = await updateAllTopics(updateData);

            if (!response.success) {
                throw new Error(response.message || 'Failed to save topic configurations');
            }

            // Update original data with current state
            this.originalData = JSON.parse(JSON.stringify(this.approvalByTopic));

            // Clear unsaved changes flag
            this.hasUnsavedChanges = false;
            this.updateActionButtonStates();

            this.messageModal.show({
                title: 'Success',
                message: `Topic configurations saved successfully (${response.topicCount} topics).`
            });

            // Emit corpus config update event for other components
            this.emitCorpusConfigUpdate();

        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error saving changes:', error);
            this.errorModal.show({
                title: 'Error',
                message: 'Failed to save changes: ' + (error.message || 'Unknown error')
            });
        } finally {
            this.setLoading(false);
        }
    }

    countCorpusAssignments(topicName) {
        if (!this.corpusConfig || !this.corpusConfig.corpora) {
            return 0;
        }

        let count = 0;

        // Loop through all corpora
        for (const corpusId in this.corpusConfig.corpora) {
            const corpus = this.corpusConfig.corpora[corpusId];

            // Check if this topic is in the document_topics_choices array
            if (corpus && corpus.document_topics_choices) {
                for (const topic of corpus.document_topics_choices) {
                    if ((typeof topic === 'object' && topic.S === topicName) ||
                        (typeof topic === 'string' && topic === topicName)) {
                        count++;
                        break; // Found in this corpus, move to next corpus
                    }
                }
            }
        }

        return count;
    }

    /**
     * Selects a topic and shows its configuration
     */
    selectTopic(topicName) {
        if (this.selectedTopic === topicName) return;

        console.log(`[CorpusDocumentTopicsView] Setting selectedTopic to: ${topicName}`);
        this.selectedTopic = topicName;

        // Update topic table selection
        this.updateTopicTableSelection();

        // Update configuration panel
        if (this.topicConfigContainer) {
            this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
            this.attachConfigEventListeners();

            // Re-attach tooltips after updating the DOM
            setTimeout(() => {
                this.attachTooltips();
            }, 300);
        }

        // Update action button states
        this.updateActionButtonStates();
    }

    /**
     * Switches between subtopic tabs
     */
    switchSubtopicTab(tab) {
        if (this.activeSubtopicTab === tab) return;

        this.activeSubtopicTab = tab;

        // Update tab buttons
        const tabButtons = this.containerEl.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });

        // Update tab panes
        const tabPanes = this.containerEl.querySelectorAll('.tab-pane');
        tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `${tab}-tab`);
        });
    }

    /**
     * Called when the view becomes active
     */
    async onActivate() {
        try {
            console.log('[CorpusDocumentTopicsView] Activating');
            this.setLoading(true);

            // Check admin permissions first
            const security = getFreshSecurity(this.store);
            const isAdmin = security.hasSystemPermission('SYSTEM_ADMIN') ||
                security.hasSystemPermission('APP_ADMIN');

            if (!isAdmin) {
                console.warn('[CorpusDocumentTopicsView] User does not have admin permissions');
                this.errorModal.show({
                    title: 'Access Denied',
                    message: 'You need admin permissions to manage document topics.'
                });
                return;
            }

            // Load corpus config
            this.corpusConfig = this.store.get('corpus_config');

            if (!this.corpusConfig) {
                await this.loadCorpusConfig();
            } else {
                this.approvalByTopic = this.corpusConfig.approval_by_topic || {};
                this.originalData = JSON.parse(JSON.stringify(this.approvalByTopic));
            }

            // Initialize with placeholder user groups
            this.userGroupsLoaded = false;
            this.initializeApproverGroups();

            // Only render if not already rendered (avoid double rendering which destroys the ResponsiveTable)
            if (!this.containerEl.innerHTML.trim()) {
                this.render(this.containerEl);
            }

            // Ensure tooltips are initialized after the DOM is rendered
            setTimeout(() => {
                this.attachTooltips();
            }, 500);

            // Then load the real user groups asynchronously
            this.loadUserGroups().then(() => {
                this.userGroupsLoaded = true;

                // Only update the configuration panel if a topic is selected
                if (this.selectedTopic && this.topicConfigContainer) {
                    console.log('[CorpusDocumentTopicsView] Updating config panel with loaded groups');
                    this.topicConfigContainer.innerHTML = this.renderTopicConfiguration();
                    this.attachConfigEventListeners();

                    // Re-attach tooltips after updating the DOM
                    setTimeout(() => {
                        this.attachTooltips();
                    }, 300);
                }
            }).catch(error => {
                console.error('[CorpusDocumentTopicsView] Error loading user groups:', error);
            }).finally(() => {
                this.setLoading(false, '#topic-config-container');
            });

        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error activating view:', error);
            this.errorModal.show({
                title: 'Error',
                message: 'Failed to initialize Document Topics view: ' + (error.message || 'Unknown error')
            });
            this.setLoading(false);
        }
    }


    /**
     * Loads user groups for approver selection
     */
    async loadUserGroups() {
        try {
            console.log('[CorpusDocumentTopicsView] Loading all user groups');

            // Set a small local loading indicator just for the dropdown
            const groupSelector = this.containerEl?.querySelector('#primary-approver-group');
            if (groupSelector) {
                groupSelector.classList.add('loading');
            }

            // Use the API to get ALL user groups (not just accessible ones)
            const response = await listUserGroups(false); // accessibleOnly = false

            if (!response || !response.groups) {
                console.warn('[CorpusDocumentTopicsView] No user groups found');
                this.availableUserGroups = [];
                return;
            }

            // Transform groups to expected format
            this.availableUserGroups = response.groups.map(group => {
                const groupName = group.name;
                const groupId = groupName.startsWith('Group:') ? groupName : `Group:${groupName}`;

                return {
                    id: groupId,
                    name: groupName.replace(/^Group:/, '') // Remove prefix from display name
                };
            });

            console.log('[CorpusDocumentTopicsView] Loaded user groups:', this.availableUserGroups);

        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error loading user groups:', error);
            this.initializeApproverGroups();
        } finally {
            // Remove loading indicator
            const groupSelector = this.containerEl?.querySelector('#primary-approver-group');
            if (groupSelector) {
                groupSelector.classList.remove('loading');
            }
        }
    }

    /**
     * Initializes approver groups with standard options (fallback)
     */
    initializeApproverGroups() {
        console.log('[CorpusDocumentTopicsView] Initializing standard approver groups (fallback)');

        // Set standard approver groups
        this.availableUserGroups = [
            { id: 'Group:GlobalApprovers', name: 'GlobalApprovers' },
            { id: 'Group:SecurityTeam', name: 'SecurityTeam' },
            { id: 'Group:ContentTeam', name: 'ContentTeam' },
            { id: 'Group:FunctionalApprovers', name: 'FunctionalApprovers' }
        ];

        // Check for custom groups in current topics
        if (this.approvalByTopic) {
            Object.values(this.approvalByTopic).forEach(topic => {
                if (topic.primary_group) {
                    const groupName = topic.primary_group.replace(/^Group:/, '');
                    const groupId = topic.primary_group;

                    // Add to available groups if not already present
                    const exists = this.availableUserGroups.some(g => g.id === groupId);
                    if (!exists) {
                        this.availableUserGroups.push({ id: groupId, name: groupName });
                    }
                }
            });
        }

        console.log('[CorpusDocumentTopicsView] Available approver groups (fallback):', this.availableUserGroups);
    }

    /**
     * Loads corpus configuration from API, bypassing any local cache
     */
    async loadCorpusConfig() {
        try {
            console.log('[CorpusDocumentTopicsView] Loading corpus configuration from API');

            const attributes = await getSubtenantAttributes(['corpus_config']);
            console.log('[CorpusDocumentTopicsView] Received fresh attributes from API:', attributes);

            this.corpusConfig = attributes.corpus_config || {};

            // Store in application store for global access
            this.store.set('corpus_config', this.corpusConfig);

            // Extract approval_by_topic
            this.approvalByTopic = this.corpusConfig.approval_by_topic || {};

            // Make a deep copy to track changes
            this.originalData = JSON.parse(JSON.stringify(this.approvalByTopic));

            console.log('[CorpusDocumentTopicsView] Loaded approval_by_topic from API:', this.approvalByTopic);

            return this.corpusConfig;
        } catch (error) {
            console.error('[CorpusDocumentTopicsView] Error loading corpus config:', error);
            this.errorModal.show({
                title: 'Error Loading Configuration',
                message: 'Failed to load approval configuration: ' + (error.message || 'Unknown error')
            });

            // Initialize with empty objects to prevent further errors
            this.corpusConfig = {};
            this.approvalByTopic = {};
            this.originalData = {};

            throw error;
        }
    }

    /**
     * Shows/hides loading indicator
     */
    setLoading(loading, containerSelector = null) {
        console.log(`[CorpusDocumentTopicsView] setLoading(${loading}, ${containerSelector})`);

        if (loading) {
            this._loadingCounter++;
        } else {
            this._loadingCounter = Math.max(0, this._loadingCounter - 1);
        }

        this.loading = this._loadingCounter > 0;

        // Remove all existing loading overlays
        const existingOverlays = this.containerEl?.querySelectorAll('.loading-overlay, .loading-indicator, .loading-state-corpus');
        if (existingOverlays?.length) {
            console.log(`[CorpusDocumentTopicsView] Removing ${existingOverlays.length} loading overlays`);
            existingOverlays.forEach(overlay => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            });
        }

        // Replace loading content in file-browser-body if it's just a loading spinner
        const fileBodyEl = this.containerEl?.querySelector('.file-browser-body');
        if (fileBodyEl) {
            const hasOnlyLoadingSpinner = fileBodyEl.querySelector('.loading-state-corpus') &&
                fileBodyEl.childElementCount === 1;

            if (!loading && hasOnlyLoadingSpinner) {
                console.log('[CorpusDocumentTopicsView] Rendering topic list to replace loading state');
                this.debouncedRender();
            }
        }

        // If still loading, add a single overlay in the appropriate place
        if (this.loading) {
            let targetContainer;

            if (containerSelector) {
                // Specific container requested
                targetContainer = this.containerEl?.querySelector(containerSelector);
            } else {
                // Default container
                targetContainer = this.containerEl?.querySelector('.corpus-two-pane-container');
            }

            if (targetContainer) {
                // Position the container relatively if not already
                if (getComputedStyle(targetContainer).position === 'static') {
                    targetContainer.style.position = 'relative';
                }

                // Create a consistent overlay
                const overlay = document.createElement('div');
                overlay.className = 'loading-overlay';
                overlay.innerHTML = '<div class="loading-spinner"></div>';
                targetContainer.appendChild(overlay);

                console.log('[CorpusDocumentTopicsView] Added loading overlay to', targetContainer);
            }
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    handleTopicAssignmentsUpdated = async () => {
        console.log('[CorpusDocumentTopicsView] Topic assignments updated, refreshing data');

        // Add a small timeout to ensure cache invalidation has time to propagate
        setTimeout(async () => {
            await this.refreshCorpusConfig();
        }, 100);
    };

    /**
     * Emit corpus config update event to notify other components
     */
    emitCorpusConfigUpdate() {
        console.log('[CorpusDocumentTopicsView] Emitting corpus config update event');
        
        // Emit event that corpus manager will listen for
        const event = new CustomEvent('corpus:config-updated', {
            detail: {
                source: 'document-topics',
                timestamp: new Date().toISOString()
            },
            bubbles: true
        });
        
        // Dispatch from the container element so it bubbles up to corpus manager
        if (this.containerEl) {
            this.containerEl.dispatchEvent(event);
        } else {
            // Fallback to document if container not available
            document.dispatchEvent(event);
        }
    }

    /**
     * Clean up component resources
     */
    destroy() {
        // Clean up responsive table component
        if (this.topicListTable) {
            this.topicListTable.destroy();
            this.topicListTable = null;
        }

        // Clean up the topic assign modal
        if (this.topicAssignModal) {
            this.topicAssignModal = null;
        }

        document.removeEventListener('topic-assignments-updated', this.handleTopicAssignmentsUpdated);

        // Call base class cleanup
        super.destroy();
    }
}