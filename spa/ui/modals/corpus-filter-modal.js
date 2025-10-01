// File: ui/modals/corpus-filter-modal.js
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";

/**
 * Corpus Filter Modal
 * 
 * A modal for configuring corpus filters for content generation in the AnalysisLM framework.
 */
export class CorpusFilterModal {
  /**
   * Constructor
   * @param {object} framework - The parent AnalysisLM framework instance
   */
  constructor(framework) {
    console.log("[CorpusFilterModal] constructor called");
    this.framework = framework;
    this.currentInputKey = null;
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this._buildDOM();
  }
  
  /**
   * Build the DOM structure for the modal
   * @private
   */
  _buildDOM() {
    // Create the modal element
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'corpus-filter-modal';
    this.modalEl.className = 'modal hidden';
    
    this.modalEl.innerHTML = `
      <div class="modal-content-filter wide-modal">
        <div class="modal-header">
          <h3 id='filter-modal-header'></h3>
          <span class="close-btn" id="filter-close-button">&times;</span>
        </div>
        <div class="modal-body">
          <div id="corpus-filter-container"></div>
        </div>
        <div class="modal-footer">
          <div class="modal-footer-content">
            <div class="note-text">
              <span>Status:</span>&nbsp;<span class="status-indicator" id="filter-generation-status">Not started</span>
            </div>
            <div class="button-group">
              <button id="filter-cancel-button" class="btn secondary">Cancel</button>
              <button id="filter-generate-button" class="btn primary">Generate</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.modalEl);
    
    // Store references to important elements
    this.modalHeader = this.modalEl.querySelector('#filter-modal-header');
    this.filterContainer = this.modalEl.querySelector('#corpus-filter-container');
    this.statusIndicator = this.modalEl.querySelector('#filter-generation-status');
    this.generateButton = this.modalEl.querySelector('#filter-generate-button');
    this.cancelButton = this.modalEl.querySelector('#filter-cancel-button');
    this.closeButton = this.modalEl.querySelector('#filter-close-button');
    
    // Add event listeners
    this._attachEventListeners();
  }
  
  /**
   * Attach event listeners to modal elements
   * @private
   */
  _attachEventListeners() {
    // Generate button
    if (this.generateButton) {
      this.generateButton.addEventListener('click', () => this._startGeneration());
    }
    
    // Cancel button
    if (this.cancelButton) {
      this.cancelButton.addEventListener('click', () => this.hide());
    }
    
    // Close button
    if (this.closeButton) {
      this.closeButton.addEventListener('click', () => this.hide());
    }
  }
  
  /**
   * Show the modal for a specific input key
   * @param {string} inputKey - The input key to generate content for
   */
  show(inputKey) {
    console.log("[CorpusFilterModal] show() called for input key:", inputKey);
    
    if (!inputKey || !this.framework.processConfig.corpus_question_population_mapping?.[inputKey]) {
      console.error("[CorpusFilterModal] No mapping found for input key:", inputKey);
      return;
    }
    
    this.currentInputKey = inputKey;
    const mapping = this.framework.processConfig.corpus_question_population_mapping[inputKey];
    
    // Set modal header
    if (this.modalHeader) {
      this.modalHeader.textContent = mapping.label_for_action;
    }
    
    // Validate any placeholders in question_request
    const placeholders = mapping.question_request.match(/\\{([^}]+)\\}/g);
    if (placeholders) {
      for (const placeholder of placeholders) {
        const fieldName = placeholder.slice(2, -2); // Remove \{ and \}
        const fieldValue = document.getElementById(fieldName)?.value?.trim();
        
        if (!fieldValue) {
          this.messageModal.show({
            title: "Missing Required Field", 
            message: `Please fill in the "${this.framework.prettifyInputName(fieldName)}" field before configuring the filter.`
          });
          return;
        }
      }
    }
    
    // Create and populate question request section
    let questionRequest = mapping.question_request;
    if (placeholders) {
      for (const placeholder of placeholders) {
        const fieldName = placeholder.slice(2, -2);
        const fieldValue = document.getElementById(fieldName)?.value?.trim();
        questionRequest = questionRequest.replace(placeholder, fieldValue);
      }
    }
    
    // Populate the filter container
    if (this.filterContainer) {
      this.filterContainer.innerHTML = `
        <div class="question-request-section">
          <h4>The following request will be used to generate '${mapping.label_for_action}'</h4>
          <p class="question-request-text">${questionRequest.replace(/\n/g, '<br>')}</p>
        </div>
        ${this._createCorpusFilterForm()}
      `;
    }
    
    // Initialize filters
    this._initializeFilters(mapping);
    
    // Update status indicator
    this._updateFilterGenerationStatus('NOT_STARTED');
    
    // Show the modal
    this.modalEl.classList.remove('hidden');
  }
  
  /**
   * Hide the modal
   */
  hide() {
    console.log("[CorpusFilterModal] hide() called");
    this.modalEl.classList.add('hidden');
  }
  
  /**
   * Create the corpus filter form HTML
   * @returns {string} - The HTML for the corpus filter form
   * @private
   */
  _createCorpusFilterForm() {
    return `
      <div class="filter-form">
        <div class="form-group">
          <label for="corpus-select">Corpus:</label>
          <select id="corpus-select" class="filter-select"></select>
        </div>
        
        <div class="form-group">
          <label for="module-group-select">Module Group:</label>
          <select id="module-group-select" class="filter-select"></select>
        </div>
        
        <div class="form-group">
          <label for="module-select">Module:</label>
          <select id="module-select" class="filter-select"></select>
        </div>
        
        <div id="categories-container" class="filter-section">
          <h4>Categories</h4>
          <div id="categories" class="checkbox-grid"></div>
        </div>
        
        <div id="resource-types-container" class="filter-section">
          <h4>Resource Types</h4>
          <div id="resource-types" class="checkbox-grid"></div>
        </div>
        
        <div class="filter-section">
          <div class="collapsible-container">
            <span class="collapsible-label">Advanced Options</span>
            <div id="advanced" class="collapsible-content">
              <div class="form-group">
                <label>
                  <input type="checkbox" id="force-deep-search" checked>
                  Force Deep Search
                </label>
              </div>
              <div class="form-group">
                <label for="primary-cqa-service">Primary CQA Service:</label>
                <select id="primary-cqa-service">
                  <option value="none">None</option>
                  <option value="standard" selected>Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div class="form-group">
                <label for="fallback-cqa-service">Fallback CQA Service:</label>
                <select id="fallback-cqa-service">
                  <option value="none" selected>None</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Initialize the filter fields with data
   * @param {object} mapping - The corpus question mapping
   * @private
   */
  async _initializeFilters(mapping) {
    try {
      // TODO: In a real implementation, this would fetch available corpora, 
      // module groups, modules, categories, and resource types from the backend.
      // For now, we'll use dummy data
      
      // Populate corpus select
      const corpusSelect = this.modalEl.querySelector('#corpus-select');
      if (corpusSelect) {
        corpusSelect.innerHTML = `
          <option value="rfp">RFP</option>
          <option value="rfplite">RFP Lite</option>
          <option value="sales">Sales</option>
          <option value="internal">Internal</option>
          <option value="partners">Partners</option>
        `;
        
        // Set initial value
        corpusSelect.value = mapping.corpus;
      }
      
      // Populate module group select
      const moduleGroupSelect = this.modalEl.querySelector('#module-group-select');
      if (moduleGroupSelect) {
        moduleGroupSelect.innerHTML = `
          <option value="all">All</option>
          <option value="technical">Technical</option>
          <option value="business">Business</option>
          <option value="product">Product</option>
        `;
        
        // Set initial value
        moduleGroupSelect.value = mapping.module_group;
      }
      
      // Populate module select
      const moduleSelect = this.modalEl.querySelector('#module-select');
      if (moduleSelect) {
        moduleSelect.innerHTML = `
          <option value="all">All</option>
          <option value="module1">Module 1</option>
          <option value="module2">Module 2</option>
          <option value="module3">Module 3</option>
        `;
        
        // Set initial value
        moduleSelect.value = mapping.module;
      }
      
      // Populate categories
      const categoriesContainer = this.modalEl.querySelector('#categories');
      if (categoriesContainer) {
        categoriesContainer.innerHTML = `
          <label><input type="checkbox" name="category1-checkbox"> Category 1</label>
          <label><input type="checkbox" name="category2-checkbox"> Category 2</label>
          <label><input type="checkbox" name="category3-checkbox"> Category 3</label>
          <label><input type="checkbox" name="category4-checkbox"> Category 4</label>
        `;
        
        // Set initial values
        if (mapping.categories && Array.isArray(mapping.categories)) {
          mapping.categories.forEach(category => {
            const checkbox = categoriesContainer.querySelector(`input[name="${category}-checkbox"]`);
            if (checkbox) {
              checkbox.checked = true;
            }
          });
        }
      }
      
      // Populate resource types
      const resourceTypesContainer = this.modalEl.querySelector('#resource-types');
      if (resourceTypesContainer) {
        resourceTypesContainer.innerHTML = `
          <label><input type="checkbox" name="type1-checkbox"> Type 1</label>
          <label><input type="checkbox" name="type2-checkbox"> Type 2</label>
          <label><input type="checkbox" name="type3-checkbox"> Type 3</label>
          <label><input type="checkbox" name="type4-checkbox"> Type 4</label>
        `;
        
        // Set initial values
        if (mapping.resource_types && Array.isArray(mapping.resource_types)) {
          mapping.resource_types.forEach(type => {
            const checkbox = resourceTypesContainer.querySelector(`input[name="${type}-checkbox"]`);
            if (checkbox) {
              checkbox.checked = true;
            }
          });
        }
      }
      
      // Initialize collapsible for Advanced Options
      this._initializeAdvancedOptions();
      
      // Lock filters if needed
      if (mapping.allow_override_of_filters === false) {
        this._lockFilters(true);
      }
      
    } catch (error) {
      console.error('[CorpusFilterModal] Error initializing filters:', error);
      this.errorModal.show({
        title: "Error",
        message: "Failed to initialize filters. Please try again."
      });
    }
  }
  
  /**
   * Initialize the advanced options collapsible section
   * @private
   */
  _initializeAdvancedOptions() {
    const label = this.modalEl.querySelector('.collapsible-label');
    const content = this.modalEl.querySelector('#advanced');
    
    if (label && content) {
      // Add click handler
      label.addEventListener('click', function() {
        this.classList.toggle('active');
        content.classList.toggle('show');
      });
      
      // Set initial state (closed)
      content.classList.remove('show');
      label.classList.remove('active');
    }
  }
  
  /**
   * Lock or unlock the filter fields
   * @param {boolean} shouldLock - Whether to lock the filters
   * @private
   */
  _lockFilters(shouldLock) {
    const filterElements = this.modalEl.querySelectorAll('.filter-select, #categories input, #resource-types input');
    
    filterElements.forEach(element => {
      element.disabled = shouldLock;
    });
  }
  
  /**
   * Update the filter generation status indicator
   * @param {string} status - The status to display
   * @param {number} progress - Optional progress percentage
   * @private
   */
  _updateFilterGenerationStatus(status, progress = null) {
    if (!this.statusIndicator) return;
    
    // Remove existing status classes
    this.statusIndicator.classList.remove(
      'status-not-started',
      'status-started',
      'status-processing',
      'status-completed',
      'status-failed',
      'status-error'
    );
    
    let statusText;
    let statusClass;
    let enableButtons;
    
    switch (status.toUpperCase()) {
      case 'STARTED':
        statusText = 'Starting...';
        statusClass = 'status-started';
        enableButtons = false;
        break;
      case 'PROCESSING':
        statusText = progress ? `Processing: ${progress}%` : 'Processing...';
        statusClass = 'status-processing';
        enableButtons = false;
        break;
      case 'COMPLETED':
        statusText = 'Completed';
        statusClass = 'status-completed';
        enableButtons = true;
        break;
      case 'FAILED':
        statusText = 'Failed';
        statusClass = 'status-failed';
        enableButtons = true;
        break;
      default:
        statusText = 'Not started';
        statusClass = 'status-not-started';
        enableButtons = true;
    }
    
    this.statusIndicator.textContent = statusText;
    this.statusIndicator.classList.add(statusClass);
    
    // Update button states
    if (this.generateButton) {
      this.generateButton.disabled = !enableButtons;
    }
    if (this.cancelButton) {
      this.cancelButton.disabled = !enableButtons;
    }
  }
  
  /**
   * Start the generation process
   * @private
   */
  async _startGeneration() {
    console.log("[CorpusFilterModal] _startGeneration() called");
    
    try {
      // Get required elements
      const questionRequestElement = this.modalEl.querySelector('.question-request-text');
      const corpusSelect = this.modalEl.querySelector('#corpus-select');
      const moduleGroupSelect = this.modalEl.querySelector('#module-group-select');
      const moduleSelect = this.modalEl.querySelector('#module-select');
      
      if (!questionRequestElement || !corpusSelect || !moduleGroupSelect || !moduleSelect) {
        throw new Error("Required filter elements not found");
      }
      
      // Validate selections
      if (!corpusSelect.value || !moduleGroupSelect.value || !moduleSelect.value) {
        throw new Error("Please select all required filters");
      }
      
      // Get checkbox selections (removing the -checkbox suffix)
      const categories = Array.from(this.modalEl.querySelectorAll('#categories input[type=checkbox]:checked'))
        .map(cb => cb.name.replace('-checkbox', ''));
      const resourceTypes = Array.from(this.modalEl.querySelectorAll('#resource-types input[type=checkbox]:checked'))
        .map(cb => cb.name.replace('-checkbox', ''));
      
      if (categories.length === 0 || resourceTypes.length === 0) {
        throw new Error("Please select at least one category and resource type");
      }
      
      // Get advanced options
      const forceDeepSearch = this.modalEl.querySelector('#force-deep-search')?.checked || false;
      const primaryCqaService = this.modalEl.querySelector('#primary-cqa-service')?.value || 'standard';
      const fallbackCqaService = this.modalEl.querySelector('#fallback-cqa-service')?.value || 'none';
      
      // Lock filters and update status
      this._lockFilters(true);
      this._updateFilterGenerationStatus('STARTED');
      
      // Prepare payload
      const payload = {
        corpus: corpusSelect.value,
        module_group: moduleGroupSelect.value,
        module: moduleSelect.value,
        categories: categories,
        resource_types: resourceTypes,
        force_deep_search: forceDeepSearch,
        question: questionRequestElement.innerText,
        request_type: 'ad-hoc-question',
        primary_cqa_service: primaryCqaService === 'none' ? null : primaryCqaService,
        fallback_cqa_service: fallbackCqaService === 'none' ? null : fallbackCqaService
      };
      
      console.log("[CorpusFilterModal] Submitting generation payload:", payload);
      
      // Start the job
      this._updateFilterGenerationStatus('PROCESSING', 0);
      const result = await this._startJob(payload);
      
      if (!result) {
        throw new Error("No result received from job start");
      }
      
      if (result.question_jid && result.question_ts) {
        console.log("[CorpusFilterModal] Job started successfully:", {
          jobId: result.question_jid,
          tenantShard: result.question_ts
        });
        this._pollGenerationStatus(result.question_jid, result.question_ts);
      } else {
        throw new Error("Invalid job response: missing question job ID or TS partition key");
      }
      
    } catch (error) {
      console.error('[CorpusFilterModal] Error in _startGeneration:', error);
      this._updateFilterGenerationStatus('FAILED');
      this._lockFilters(false);
      this.errorModal.show({
        title: "Generation Error",
        message: error.message || "Failed to start generation"
      });
    }
  }
  
  /**
   * Start a generation job
   * @param {object} payload - The job payload
   * @returns {Promise<object>} - The job result
   * @private
   */
  async _startJob(payload) {
    // In a real implementation, this would make an API call to start the job
    // For this migration, we'll simulate a successful response
    return {
      question_jd: "sim_" + Math.random().toString(36).substring(2, 10),
      question_ts: "demo"
    };
  }
  
  /**
   * Poll for generation status
   * @param {string} jobId - The job ID
   * @param {string} tenantShard - The tenant shard
   * @private
   */
  _pollGenerationStatus(jobId, tenantShard) {
    let progress = 0;
    const pollInterval = setInterval(async () => {
      try {
        // In a real implementation, this would make an API call to get the job status
        // For this migration, we'll simulate progress updates
        progress += 20;
        
        this._updateFilterGenerationStatus('PROCESSING', progress);
        
        if (progress >= 100) {
          clearInterval(pollInterval);
          this._updateFilterGenerationStatus('COMPLETED');
          
          // Simulate getting the generated content
          setTimeout(() => {
            // Update the target textarea with the generated response
            const textarea = document.getElementById(this.currentInputKey);
            if (textarea) {
              textarea.value = "This is simulated generated content for " + this.currentInputKey + 
                "\n\nThe content was generated using the specified filters and parameters." +
                "\n\nIn a real implementation, this would be the actual response from the generation job.";
            }
            
            this.hide();
            this.messageModal.show({
              title: "Content Generation Completed",
              message: `Content for '${this.framework.prettifyInputName(this.currentInputKey)}' successfully generated.`
            });
          }, 500);
        }
      } catch (error) {
        clearInterval(pollInterval);
        console.error('[CorpusFilterModal] Error polling generation status:', error);
        this._updateFilterGenerationStatus('FAILED');
        this._lockFilters(false);
        this.errorModal.show({
          title: "Generation Error",
          message: error.message || "Failed to get generation status"
        });
      }
    }, 1000); // Poll every second for the simulation
  }
}