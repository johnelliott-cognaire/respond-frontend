// File: ui/modals/choose-content-for-ai-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { TextPromptModal } from "./text-prompt-modal.js";
import { Tooltip } from "../framework/tooltip.js";
import {
    getSubtenantAttributes,
    getDomains,
    getUnits,
    getLabelFriendlyName,
    saveFavoriteDomainUnit,
    invalidateSubtenantAttributeCache  // ADD: Import cache invalidation
} from "../../api/subtenants.js";

/**
 * ChooseContentForAIModal
 * Enhanced with proper cache invalidation and corpus handling
 */
export class ChooseContentForAIModal extends AsyncFormModal {
    constructor(options = {}) {
        super();
        this.onSubmit = options.onSubmit || (() => { });
        this.corpus = options.corpus || "rfp"; // Default to rfp if not specified

        this.subtenantCache = options.subtenantCache || null;
        
        this.errorModal = new ErrorModal();
        this.messageModal = new MessageModal();
        this.textPromptModal = new TextPromptModal({
            fieldLabel: "Favorite Name",
            defaultValue: "",
            showClose: true,
            allowEmpty: false
        });

        // Initialize tooltip instance
        this.tooltipInstance = new Tooltip();

        // Initialize empty data structures
        this.corpusConfig = null;
        this.labelFriendlyNames = null;
        this.domains = [];
        this.units = [];
        this.documentTopics = [];
        this.documentTypes = [];
        this.topicsTypePreselection = {};
        this.favoriteDomainUnits = {};

        // Form state
        this.selectedDomain = "";
        this.selectedUnit = "";
        this.selectedTopics = [];
        this.selectedTypes = [];
        this.languageRules = "";
        this.favoriteSlot = "";
        this.favoriteName = "";
        this.showFavoriteDropdown = false;
        this.currentUsername = null;

        // Define comprehensive tooltips (same as before)
        this.tooltips = {
            "modal-purpose": "This modal allows you to select specific content from your document corpus that the AI will use as reference material when generating responses. The AI will only access documents that match your selected criteria. This ensures higher quality answers as it provides a more focussed set of documents for the AI to interpret.",
            "domain-select": "Domains represent broad product groups or organizational divisions in your corpus structure. For example, 'Beauty', 'Healthcare', or 'Regulatory'. Each domain contains related business units and their associated documents.",
            "unit-select": "Units are specific products, services, or modules within a domain. For example, under a 'Beauty' domain, you might have units like 'Pantene', 'Olay', or 'Head & Shoulders'. Units contain the actual document collections.",
            "language-rules": "Language Rules provide stylistic guidance to the AI for generating responses. Use this to specify tone (formal/casual), avoid certain terms, emphasize customer-centricity, or match your brand voice. These rules don't affect which documents are referenced, only how the AI crafts its response.",
            "document-topics": "Document Topics categorize content by subject matter and determine which folders in your corpus structure the AI will search. Common topics include 'functional' (product features), 'security' (compliance info), 'commercial' (pricing/contracts), and 'ai' (AI-related content). Select all relevant topics for comprehensive coverage.",
            "document-types": "Document Types specify the kind of content the AI should reference, based on the first part of document filenames. Examples: 'contract' (legal agreements), 'policy-doc' (internal policies), 'marketing' (promotional materials), 'product-doc' (technical specifications). Choose types that match your query needs.",
            "favorite-button": "Save your current selection as a favorite for quick access later in the 'Content' menu. You can store up to 5 different combinations of domain, unit, topics, types, and language rules. Perfect for frequently used configurations or different use cases.",
            "favorite-dropdown": "Choose a slot to add a favorite to the 'Content' menu. Each slot can store a complete set of selections including domain, unit, document topics, document types, and language rules. Click any slot to save your current configuration or load an existing one."
        };

        this._buildDOM();
    }

    async _loadSubtenantData() {
        try {
            console.log("[ChooseContentForAIModal] _loadSubtenantData() called with corpus:", this.corpus);
            
            // ADD: Debug logging for corpus tracking
            console.log("[ChooseContentForAIModal] Current corpus being used:", this.corpus);
            
            // If we have a pre-populated cache, use it instead of making an API call
            if (this.subtenantCache) {
                console.log("[ChooseContentForAIModal] Using pre-populated subtenant cache");
                
                // Use the provided cache
                this.corpusConfig = this.subtenantCache.corpus_config || {};
                this.labelFriendlyNames = this.subtenantCache.label_friendly_names || {};
                this.topicsTypePreselection = this.subtenantCache.document_topics_type_preselection || {};
            } else {
                // Fallback to API call if no cache was provided
                console.log("[ChooseContentForAIModal] No pre-populated cache, fetching from API");
                
                // Fetch corpus config and other needed attributes
                const attrs = await getSubtenantAttributes([
                    "corpus_config",
                    "label_friendly_names",
                    "document_topics_type_preselection"
                ]);

                this.corpusConfig = attrs.corpus_config || {};
                this.labelFriendlyNames = attrs.label_friendly_names || {};
                this.topicsTypePreselection = attrs.document_topics_type_preselection || {};
            }

            // Get the current username from the session
            this.currentUsername = sessionStorage.getItem("username") || "guest";
            
            console.log("[ChooseContentForAIModal] Loaded subtenant data, currentUsername:", this.currentUsername);
            
            // ADD: Debug corpus config
            console.log("[ChooseContentForAIModal] Available corpora:", Object.keys(this.corpusConfig.corpora || {}));
            console.log("[ChooseContentForAIModal] Default corpus:", this.corpusConfig.default_corpus);
            
            // Populate options based on the corpus config
            this._populateOptions();
            
            // Apply auto-selection logic after populating options
            this._applyAutoSelection();
            
        } catch (err) {
            console.error("[ChooseContentForAIModal] Error loading subtenant data:", err);
            this.errorModal.show({
                title: "Error",
                message: "Failed to load content options: " + err.message
            });
        }
    }

    _populateOptions() {
        console.log("[ChooseContentForAIModal] _populateOptions() called");

        if (!this.corpusConfig || !this.corpusConfig.corpora) {
            console.warn("[ChooseContentForAIModal] Missing corpus configuration");
            return;
        }

        // Make sure the corpus exists
        if (!this.corpusConfig.corpora[this.corpus]) {
            console.warn(`[ChooseContentForAIModal] Missing corpus configuration for: ${this.corpus}`);
            // Try to use the default corpus if available
            if (this.corpusConfig.default_corpus && this.corpusConfig.corpora[this.corpusConfig.default_corpus]) {
                console.log(`[ChooseContentForAIModal] Falling back to default corpus: ${this.corpusConfig.default_corpus}`);
                this.corpus = this.corpusConfig.default_corpus;
            } else {
                // Try to use the first available corpus
                const availableCorpora = Object.keys(this.corpusConfig.corpora);
                if (availableCorpora.length > 0) {
                    console.log(`[ChooseContentForAIModal] Falling back to first available corpus: ${availableCorpora[0]}`);
                    this.corpus = availableCorpora[0];
                } else {
                    console.error("[ChooseContentForAIModal] No corpus configurations available");
                    return;
                }
            }
        }

        console.log(`[ChooseContentForAIModal] Using corpus: ${this.corpus}`);
        const corpusData = this.corpusConfig.corpora[this.corpus];

        // Extract favorite_domain_units if available
        this.favoriteDomainUnits = corpusData.favorite_domain_units || {};
        if (Array.isArray(this.favoriteDomainUnits)) {
            // Handle legacy popular_domain_units format
            console.warn("[ChooseContentForAIModal] Legacy array format detected for favorite_domain_units");
            this.favoriteDomainUnits = {};
        }
        
        // ADD: Debug favorites
        console.log("[ChooseContentForAIModal] Favorites for corpus", this.corpus, ":", this.favoriteDomainUnits);

        // Get domains
        this.domains = getDomains(this.corpusConfig, this.corpus);
        console.log(`[ChooseContentForAIModal] Found ${this.domains.length} domains:`, this.domains);
        this._populateDomainDropdown();

        // Get document topics and types from corpus config
        if (corpusData.document_topics_choices && Array.isArray(corpusData.document_topics_choices)) {
            this.documentTopics = corpusData.document_topics_choices;
        } else {
            console.warn("[ChooseContentForAIModal] No document_topics_choices found, using empty array");
            this.documentTopics = [];
        }

        if (corpusData.document_types_choices && Array.isArray(corpusData.document_types_choices)) {
            this.documentTypes = corpusData.document_types_choices;
        } else {
            console.warn("[ChooseContentForAIModal] No document_types_choices found, using empty array");
            this.documentTypes = [];
        }

        console.log(`[ChooseContentForAIModal] Found ${this.documentTopics.length} topics and ${this.documentTypes.length} types`);

        // Populate UI
        this._populateTopicsCheckboxes();
        this._populateTypesCheckboxes();
        this._populateFavoriteDropdown();
    }

    /**
     * Apply auto-selection logic for domains and units
     */
    _applyAutoSelection() {
        console.log("[ChooseContentForAIModal] Applying auto-selection logic");
        
        // Auto-select domain
        if (this.domains.length === 1) {
            // Only one domain available - auto-select it
            console.log("[ChooseContentForAIModal] Auto-selecting single domain:", this.domains[0]);
            this.selectedDomain = this.domains[0];
            this.domainSelect.value = this.selectedDomain;
        } else if (this.domains.length > 1) {
            // Multiple domains - select the first one
            console.log("[ChooseContentForAIModal] Pre-selecting first domain:", this.domains[0]);
            this.selectedDomain = this.domains[0];
            this.domainSelect.value = this.selectedDomain;
        }

        // If a domain was selected, populate and auto-select unit
        if (this.selectedDomain) {
            this._populateUnitDropdown();
            
            // Auto-select unit after populating
            const units = getUnits(this.corpusConfig, this.corpus, this.selectedDomain);
            if (units.length === 1) {
                // Only one unit available - auto-select it
                console.log("[ChooseContentForAIModal] Auto-selecting single unit:", units[0]);
                this.selectedUnit = units[0];
                this.unitSelect.value = this.selectedUnit;
            } else if (units.length > 1) {
                // Multiple units - select the first one
                console.log("[ChooseContentForAIModal] Pre-selecting first unit:", units[0]);
                this.selectedUnit = units[0];
                this.unitSelect.value = this.selectedUnit;
            }
        }
    }

    // ... (buildDOM, attachTooltips, etc. - same as before)
    _buildDOM() {
        if (!this.overlayEl) {
            this._buildOverlay();
        }
        this.modalEl = document.createElement("div");
        this.modalEl.className = "modal modal--form choose-content-modal";
        this.modalEl.style.display = "none";

        this.modalEl.innerHTML = `
      <div class="modal-header" style="padding-left: 0px!important;">
        <div class="header-title-container">
          <h2>Choose Content for AI</h2>
          <i class="fas fa-info-circle tooltip-icon" id="modal-purpose-tooltip"></i>
        </div>
        <div class="header-actions">
          <button id="favoriteBtn" style="margin-right: 20px!important;" class="favorite-button">
            <span style="color: #ff4757; margin-right: 4px;">♥</span> Favorite
            <i class="fas fa-info-circle tooltip-icon" id="favorite-button-tooltip"></i>
          </button>
          <button class="modal__close" style="top: auto; right: 0px;" aria-label="Close Choose Content Modal">&times;</button>
        </div>
      </div>
      
      <div id="favoriteDropdown" class="favorite-dropdown">
        <div class="favorite-dropdown-header">
          Save as Favorite
          <i class="fas fa-info-circle tooltip-icon" id="favorite-dropdown-tooltip"></i>
        </div>
        <div id="favoriteSlotsList"></div>
      </div>
  
      <form id="chooseContentForm" class="form">
        <!-- Domain and Unit on the same row -->
        <div class="form-group">
          <div style="display: flex; gap: 20px;">
            <div style="flex: 1;">
              <div class="label-with-tooltip">
                <label for="domainSelect">Domain</label>
                <i class="fas fa-info-circle tooltip-icon" id="domain-select-tooltip"></i>
              </div>
              <select id="domainSelect" class="doc-input"></select>
            </div>
            <div style="flex: 1;">
              <div class="label-with-tooltip">
                <label for="unitSelect">Unit</label>
                <i class="fas fa-info-circle tooltip-icon" id="unit-select-tooltip"></i>
              </div>
              <select id="unitSelect" class="doc-input"></select>
            </div>
          </div>
        </div>
        
        <!-- Language Rules -->
        <div class="form-group">
          <div class="label-with-tooltip">
            <label for="languageRules">Language Rules</label>
            <i class="fas fa-info-circle tooltip-icon" id="language-rules-tooltip"></i>
          </div>
          <textarea id="languageRules" class="doc-input" rows="4" placeholder="Enter language rules for AI content generation (e.g., 'Use formal tone', 'Avoid technical jargon', 'Focus on customer benefits')..."></textarea>
        </div>
  
        <div class="form-group">
          <div class="label-with-tooltip">
            <label>Document Topics</label>
            <i class="fas fa-info-circle tooltip-icon" id="document-topics-tooltip"></i>
          </div>
          <div id="topicsContainer" class="checkbox-container"></div>
        </div>
  
        <div class="form-group">
          <div class="label-with-tooltip">
            <label>Document Types</label>
            <i class="fas fa-info-circle tooltip-icon" id="document-types-tooltip"></i>
          </div>
          <div id="typesContainer" class="checkbox-container"></div>
        </div>
  
        <div id="errorMessage" class="error-message" style="color: red; margin-top: 10px; display: none;"></div>
  
        <div class="button-group" style="margin-top:1rem; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn" id="cancelBtn">Cancel</button>
          <button type="button" class="btn btn--primary" id="okBtn">OK</button>
        </div>
      </form>
    `;

        document.body.appendChild(this.modalEl);

        // Setup references to DOM elements
        const closeBtn = this.modalEl.querySelector(".modal__close");
        closeBtn.addEventListener("click", () => this.hide());

        this.domainSelect = this.modalEl.querySelector("#domainSelect");
        this.unitSelect = this.modalEl.querySelector("#unitSelect");
        this.topicsContainer = this.modalEl.querySelector("#topicsContainer");
        this.typesContainer = this.modalEl.querySelector("#typesContainer");
        this.errorMessage = this.modalEl.querySelector("#errorMessage");
        this.cancelBtn = this.modalEl.querySelector("#cancelBtn");
        this.okBtn = this.modalEl.querySelector("#okBtn");
        this.favoriteBtn = this.modalEl.querySelector("#favoriteBtn");
        this.favoriteDropdown = this.modalEl.querySelector("#favoriteDropdown");
        this.favoriteSlotsList = this.modalEl.querySelector("#favoriteSlotsList");
        this.languageRulesTextarea = this.modalEl.querySelector("#languageRules");

        // Event handlers
        this.domainSelect.addEventListener("change", () => this.handleDomainChange());
        this.unitSelect.addEventListener("change", () => this.handleUnitChange());
        this.cancelBtn.addEventListener("click", () => this.hide());
        this.okBtn.addEventListener("click", () => this.handleSubmit());
        
        // Favorite button click handler
        this.favoriteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleFavoriteDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", (e) => {
            if (this.showFavoriteDropdown && !this.favoriteDropdown.contains(e.target) && e.target !== this.favoriteBtn) {
                this.closeFavoriteDropdown();
            }
        });

        // Add styles for the modal layout
        this._addStyles();
        
        // Attach tooltips after DOM is built
        this._attachTooltips();
    }

    /**
     * Attach comprehensive tooltips to UI elements
     */
    _attachTooltips() {
        console.log("[ChooseContentForAIModal] Attaching tooltips to UI elements");

        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
            // Attach tooltips using the pattern from corpus-document-topics-view.js
            this._attachTooltipBySelector("#modal-purpose-tooltip", this.tooltips["modal-purpose"]);
            this._attachTooltipBySelector("#domain-select-tooltip", this.tooltips["domain-select"]);
            this._attachTooltipBySelector("#unit-select-tooltip", this.tooltips["unit-select"]);
            this._attachTooltipBySelector("#language-rules-tooltip", this.tooltips["language-rules"]);
            this._attachTooltipBySelector("#document-topics-tooltip", this.tooltips["document-topics"]);
            this._attachTooltipBySelector("#document-types-tooltip", this.tooltips["document-types"]);
            this._attachTooltipBySelector("#favorite-button-tooltip", this.tooltips["favorite-button"]);
            this._attachTooltipBySelector("#favorite-dropdown-tooltip", this.tooltips["favorite-dropdown"]);

            console.log("[ChooseContentForAIModal] Tooltips attachment completed");
        }, 100);
    }

    /**
     * Helper method to attach tooltip by selector
     */
    _attachTooltipBySelector(selector, tooltipText) {
        // Try container first, then fall back to document
        let element = this.modalEl?.querySelector(selector);

        if (!element) {
            element = document.querySelector(selector);
        }

        if (element) {
            console.log(`[ChooseContentForAIModal] Found element ${selector} for tooltip`);

            // Add the tooltip-icon class explicitly if not present
            if (!element.classList.contains('tooltip-icon') && !element.classList.contains('info-icon')) {
                element.classList.add('tooltip-icon');
            }

            try {
                this.tooltipInstance.attach(element, tooltipText);
                console.log(`[ChooseContentForAIModal] Tooltip attached successfully to ${selector}`);
            } catch (error) {
                console.error(`[ChooseContentForAIModal] Error attaching tooltip to ${selector}:`, error);
            }
        } else {
            console.warn(`[ChooseContentForAIModal] Element ${selector} not found for tooltip`);
        }
    }

    // ... (other methods remain the same until saveFavorite)

    async saveFavorite(slotId, name) {
        console.log("[ChooseContentForAIModal] saveFavorite called with slotId:", slotId, "name:", name);
        
        if (!name || name.trim() === "") {
            console.warn("[ChooseContentForAIModal] Favorite name is empty, showing error");
            this.errorModal.show({
                title: "Error",
                message: "Favorite name cannot be empty"
            });
            return;
        }
        
        // Enforce 40 character limit
        if (name.length > 40) {
            name = name.substring(0, 40); // Truncate to 40 characters
        }
        
        try {
            // Enhanced validation - detailed logs for debugging
            console.log("[ChooseContentForAIModal] Validating selections before saving:", {
                corpus: this.corpus,  // ADD: Include corpus in validation
                domain: this.selectedDomain,
                unit: this.selectedUnit,
                topics: this.selectedTopics,
                types: this.selectedTypes
            });
            
            let errorMessage = "";
            
            if (!this.selectedDomain) {
                errorMessage = "Please select a Domain before saving as a favorite";
            } else if (!this.selectedUnit) {
                errorMessage = "Please select a Unit before saving as a favorite";
            } else if (!this.selectedTopics || this.selectedTopics.length === 0) {
                errorMessage = "Please select at least one Document Topic before saving as a favorite";
            } else if (!this.selectedTypes || this.selectedTypes.length === 0) {
                errorMessage = "Please select at least one Document Type before saving as a favorite";
            }
            
            if (errorMessage) {
                console.warn("[ChooseContentForAIModal] Validation failed:", errorMessage);
                this.errorModal.show({
                    title: "Validation Error",
                    message: errorMessage
                });
                return;
            }
            
            // Get language rules from textarea
            this.languageRules = this.languageRulesTextarea.value || "";
            
            // CREATE FAVORITE OBJECT WITH CORPUS INCLUDED
            const favorite = {
                name: name,
                corpus: this.corpus,  // ADD: Include corpus in favorite data
                domain: this.selectedDomain,
                unit: this.selectedUnit,
                document_topics: this.selectedTopics,
                document_types: this.selectedTypes,
                language_rules: this.languageRules
                // Server will set created_by and created_datetime
            };
            
            console.log("[ChooseContentForAIModal] Saving favorite with corpus:", JSON.stringify(favorite));
            console.log("[ChooseContentForAIModal] Critical params - corpus:", this.corpus, "slotId:", slotId);
            
            try {
                // Save to backend
                console.log("[ChooseContentForAIModal] About to call saveFavoriteDomainUnit API function");
                const result = await saveFavoriteDomainUnit(this.corpus, slotId, favorite);
                console.log("[ChooseContentForAIModal] saveFavoriteDomainUnit succeeded with result:", result);
                
                // IMPORTANT: Invalidate the corpus_config cache so fresh data will be loaded
                console.log("[ChooseContentForAIModal] Invalidating corpus_config cache");
                invalidateSubtenantAttributeCache('corpus_config');
                
                // Also clear sessionStorage cache if it exists
                try {
                    sessionStorage.removeItem('subtenantCache');
                    console.log("[ChooseContentForAIModal] Cleared sessionStorage subtenantCache");
                } catch (storageErr) {
                    console.warn("[ChooseContentForAIModal] Failed to clear sessionStorage cache:", storageErr);
                }
                
                // Update local data with the server result (which includes created_by/created_datetime)
                if (!this.favoriteDomainUnits) {
                    this.favoriteDomainUnits = {};
                }
                
                if (result && result.favorite_domain_units && result.favorite_domain_units[slotId]) {
                    // Use the server-returned data
                    this.favoriteDomainUnits[slotId] = result.favorite_domain_units[slotId];
                } else {
                    // Fallback to local data if server doesn't return the expected format
                    this.favoriteDomainUnits[slotId] = favorite;
                }
                
                // Update the favorites dropdown to show the new favorite immediately
                this._populateFavoriteDropdown();
                
                // Emit event for real-time UI updates in other components
                console.log("[ChooseContentForAIModal] Emitting favorites-updated event");
                try {
                    const favoritesUpdatedEvent = new CustomEvent('favorites-updated', {
                        detail: {
                            corpus: this.corpus,
                            slotId: slotId,
                            favoriteData: favorite,
                            timestamp: Date.now()
                        }
                    });
                    document.dispatchEvent(favoritesUpdatedEvent);
                    console.log("[ChooseContentForAIModal] favorites-updated event dispatched successfully");
                } catch (eventErr) {
                    console.warn("[ChooseContentForAIModal] Failed to dispatch favorites-updated event:", eventErr);
                }
                
                // Show success message
                console.log("[ChooseContentForAIModal] Showing success message");
                this.messageModal.show({
                    title: "Favorite Saved",
                    message: `Content configuration has been saved as favorite: ${name}`
                });
                
            } catch (apiError) {
                console.error("[ChooseContentForAIModal] API call failed:", apiError);
                throw apiError; // Re-throw to be caught by outer catch
            }
            
        } catch (err) {
            console.error("[ChooseContentForAIModal] Error saving favorite:", err);
            this.errorModal.show({
                title: "Error",
                message: `Error saving favorite: ${err.message}`
            });
        }
    }

    // ... (rest of the methods remain the same)
    
    toggleFavoriteDropdown() {
        if (this.showFavoriteDropdown) {
            this.closeFavoriteDropdown();
        } else {
            this.openFavoriteDropdown();
        }
    }

    openFavoriteDropdown() {
        this._populateFavoriteDropdown();
        this.favoriteDropdown.style.display = "block";
        this.showFavoriteDropdown = true;
    }

    closeFavoriteDropdown() {
        this.favoriteDropdown.style.display = "none";
        this.showFavoriteDropdown = false;
    }

    _addStyles() {
        // Add CSS for the modal styling if not already present
        if (!document.getElementById('choose-content-styles')) {
            const style = document.createElement('style');
            style.id = 'choose-content-styles';
            style.textContent = `
                /* Reset for checkboxes to avoid conflict with .form-modal input */
                .form-modal .checkbox-container input[type="checkbox"] {
                    width: auto !important;
                    padding: 0 !important;
                    margin: 0 6px 0 0 !important;
                    box-sizing: border-box !important;
                    border: none !important;
                    flex-shrink: 0 !important;
                    appearance: checkbox !important;
                    -webkit-appearance: checkbox !important;
                    box-shadow: none !important;
                    transition: none !important;
                    background-color: transparent !important;
                }
                
                /* Main container */
                .checkbox-container {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    grid-gap: 8px;
                    margin-top: 5px;
                    max-height: 150px;
                    overflow-y: auto;
                    border: 1px solid #ddd;
                    padding: 10px;
                    border-radius: 4px;
                }
                
                /* Individual checkbox items */
                .checkbox-item {
                    display: flex;
                    align-items: center;
                    padding: 2px 4px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                /* Force checkbox label styles */
                .checkbox-item label {
                    margin: 0 !important;
                    font-size: 14px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    cursor: pointer !important;
                    display: inline-block !important;
                    max-width: calc(100% - 22px) !important;
                    padding: 0 !important;
                    color: inherit !important;
                }
                
                /* Label with tooltip styling */
                .label-with-tooltip {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    margin-bottom: 5px;
                }
                
                .label-with-tooltip label {
                    margin: 0 !important;
                }
                
                /* Header title container with tooltip */
                .header-title-container {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .header-title-container h2 {
                    margin: 0 !important;
                }

                label + .tooltip-icon {
                    top: 0px!important;
                }
                
                /* Favorite slots styling */
                .favorite-slot-item {
                    padding: 8px 12px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .favorite-slot-item:hover {
                    background-color: #f5f5f5;
                }
                
                .favorite-slot-name {
                    font-weight: normal;
                }
                
                .favorite-slot-status {
                    color: #888;
                    font-size: 0.9em;
                }
                
                /* Textarea styling */
                .form-modal textarea.doc-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 0.75rem 1rem;
                    background-color: var(--input-background, white);
                    border: 1px solid var(--input-border, #ddd);
                    border-radius: 6px;
                    color: var(--text-primary, #333);
                    font-size: 0.9375rem;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    resize: vertical;
                    font-family: inherit;
                }
                
                .form-modal textarea.doc-input:focus {
                    outline: none;
                    border-color: var(--border-focus, #0056b3);
                    box-shadow: 0 0 0 2px var(--focus-ring, rgba(0, 86, 179, 0.25));
                }
                
                /* Header layout */
                .choose-content-modal .modal-header {
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                    padding: 15px 20px !important;
                    margin-bottom: 20px !important;
                    border-bottom: 1px solid #eee !important;
                    position: relative !important;
                }
                
                .choose-content-modal .modal-header h2 {
                    margin: 0 !important;
                    font-size: 1.5rem !important;
                    flex: 1 !important;
                }
                
                /* Header actions container */
                .choose-content-modal .header-actions {
                    display: flex !important;
                    align-items: center !important;
                    gap: 12px !important;
                }
                
                /* Favorite button */
                .choose-content-modal .favorite-button {
                    background: none !important;
                    border: 1px solid #ddd !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    padding: 8px 12px !important;
                    font-size: 0.9rem !important;
                    display: flex !important;
                    align-items: center !important;
                    color: #333 !important;
                    margin-right: 8px !important;
                    transition: background-color 0.2s !important;
                    gap: 4px !important;
                }
                
                .choose-content-modal .favorite-button:hover {
                    background-color: #f5f5f5 !important;
                }
                
                /* Close button */
                .choose-content-modal .modal-close {
                    top: 20px !important;
                    right: -5px !important;
                    background: none !important;
                    border: none !important;
                    font-size: 1.5rem !important;
                    line-height: 1 !important;
                    padding: 4px 8px !important;
                    cursor: pointer !important;
                    color: #666 !important;
                }
                
                /* Favorite dropdown */
                .choose-content-modal .favorite-dropdown {
                    display: none;
                    position: absolute !important;
                    right: 20px !important;
                    top: 60px !important;
                    background: white !important;
                    border: 1px solid #ddd !important;
                    border-radius: 4px !important;
                    width: 250px !important;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
                    z-index: 1000 !important;
                }
                
                .choose-content-modal .favorite-dropdown-header {
                    padding: 10px 15px !important;
                    border-bottom: 1px solid #eee !important;
                    font-weight: bold !important;
                    font-size: 0.9rem !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 5px !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    _populateFavoriteDropdown() {
        // Clear previous options
        this.favoriteSlotsList.innerHTML = "";
        
        // Generate 5 slots
        for (let i = 1; i <= 5; i++) {
            const slotId = `slot${i}`;
            const favorite = this.favoriteDomainUnits[slotId];
            
            const slotItem = document.createElement("div");
            slotItem.className = "favorite-slot-item";
            
            // Star icon and slot name
            const nameSpan = document.createElement("span");
            nameSpan.className = "favorite-slot-name";
            nameSpan.innerHTML = `<span style="margin-right: 5px;">★</span> ${favorite && favorite.name ? favorite.name : `Favorite Slot ${i}`}`;
            
            // Status (Available/In Use)
            const statusSpan = document.createElement("span");
            statusSpan.className = "favorite-slot-status";
            statusSpan.textContent = favorite && favorite.name ? "In Use" : "Available";
            
            slotItem.appendChild(nameSpan);
            slotItem.appendChild(statusSpan);
            
            // Click handler
            slotItem.addEventListener("click", () => {
                this.handleFavoriteSlotClick(slotId, favorite);
            });
            
            this.favoriteSlotsList.appendChild(slotItem);
        }
    }

    handleFavoriteSlotClick(slotId, existingFavorite) {
        console.log("[ChooseContentForAIModal] handleFavoriteSlotClick:", slotId, existingFavorite);
        this.closeFavoriteDropdown();
        
        // Validate required selections before opening prompt
        let errorMessage = "";
        
        if (!this.selectedDomain) {
            errorMessage = "Please select a Domain before saving as a favorite";
        } else if (!this.selectedUnit) {
            errorMessage = "Please select a Unit before saving as a favorite";
        } else if (!this.selectedTopics || this.selectedTopics.length === 0) {
            errorMessage = "Please select at least one Document Topic before saving as a favorite";
        } else if (!this.selectedTypes || this.selectedTypes.length === 0) {
            errorMessage = "Please select at least one Document Type before saving as a favorite";
        }
        
        if (errorMessage) {
            console.warn(`[ChooseContentForAIModal] Cannot create favorite - ${errorMessage}`);
            this.errorModal.show({
                title: "Validation Error",
                message: errorMessage
            });
            return;
        }
        
        // Generate default name from domain and unit (always available due to validation above)
        const domainLabel = getLabelFriendlyName(this.labelFriendlyNames, this.selectedDomain) || this.selectedDomain;
        const unitLabel = getLabelFriendlyName(this.labelFriendlyNames, this.selectedUnit) || this.selectedUnit;
        const defaultName = `${domainLabel} - ${unitLabel}`;
        
        console.log("[ChooseContentForAIModal] Generated default name:", defaultName, 
            "Domain:", this.selectedDomain, 
            "Unit:", this.selectedUnit,
            "Topics:", this.selectedTopics.length, 
            "Types:", this.selectedTypes.length);
        
        // Set the current favorite slot
        this.favoriteSlot = slotId;
        
        // Show the text prompt modal with a guaranteed default name
        setTimeout(() => {
            // Use timeout to ensure DOM is ready
            console.log("[ChooseContentForAIModal] Showing text prompt with default name:", defaultName);
            this.textPromptModal.show({
                title: "Save as Favorite",
                message: existingFavorite && existingFavorite.name ? 
                        "Enter a new name for this favorite (will overwrite existing):" : 
                        "Enter a name for this favorite:",
                fieldLabel: "Favorite Name",
                defaultValue: defaultName,
                onOk: (name) => this.saveFavorite(slotId, name)
            });
        }, 50);
    }

    _populateDomainDropdown() {
        // Clear previous options
        this.domainSelect.innerHTML = "";

        // Add empty default option
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "-- Select Domain --";
        this.domainSelect.appendChild(emptyOption);

        // Add domains
        this.domains.forEach(domain => {
            const option = document.createElement("option");
            option.value = domain;
            // Use friendly name if available
            option.textContent = getLabelFriendlyName(this.labelFriendlyNames, domain);
            this.domainSelect.appendChild(option);
        });
    }

    _populateUnitDropdown() {
        // Clear previous options
        this.unitSelect.innerHTML = "";

        // Add empty default option
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "-- Select Unit --";
        this.unitSelect.appendChild(emptyOption);

        // If no domain selected, leave dropdown empty
        if (!this.selectedDomain) {
            return;
        }

        // Get units for the selected domain
        const units = getUnits(this.corpusConfig, this.corpus, this.selectedDomain);

        // Add units
        units.forEach(unit => {
            const option = document.createElement("option");
            option.value = unit;
            // Use friendly name if available
            option.textContent = getLabelFriendlyName(this.labelFriendlyNames, unit);
            this.unitSelect.appendChild(option);
        });
    }

    handleDomainChange() {
        this.selectedDomain = this.domainSelect.value;
        this.selectedUnit = ""; // Reset unit selection

        // Update unit dropdown
        this._populateUnitDropdown();
        
        // Auto-select unit if there's only one or multiple available
        if (this.selectedDomain) {
            const units = getUnits(this.corpusConfig, this.corpus, this.selectedDomain);
            if (units.length === 1) {
                // Only one unit available - auto-select it
                console.log("[ChooseContentForAIModal] Auto-selecting single unit after domain change:", units[0]);
                this.selectedUnit = units[0];
                this.unitSelect.value = this.selectedUnit;
            } else if (units.length > 1) {
                // Multiple units - select the first one
                console.log("[ChooseContentForAIModal] Pre-selecting first unit after domain change:", units[0]);
                this.selectedUnit = units[0];
                this.unitSelect.value = this.selectedUnit;
            }
        }
    }

    handleUnitChange() {
        this.selectedUnit = this.unitSelect.value;
    }

    _populateTopicsCheckboxes() {
        // Clear previous checkboxes
        this.topicsContainer.innerHTML = "";
        
        // Create checkboxes for each topic
        this.documentTopics.forEach(topic => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "checkbox-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = `topic-${topic}`;
            checkbox.value = topic;
            checkbox.addEventListener("change", () => this.handleTopicChange(topic, checkbox.checked));

            const label = document.createElement("label");
            label.htmlFor = `topic-${topic}`;
            // Use friendly name if available
            label.textContent = getLabelFriendlyName(this.labelFriendlyNames, topic);

            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(label);
            this.topicsContainer.appendChild(itemDiv);
        });
    }

    _populateTypesCheckboxes() {
        // Clear previous checkboxes
        this.typesContainer.innerHTML = "";
        
        // Create checkboxes for each type
        this.documentTypes.forEach(type => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "checkbox-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = `type-${type}`;
            checkbox.value = type;
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    if (!this.selectedTypes.includes(type)) {
                        this.selectedTypes.push(type);
                    }
                } else {
                    this.selectedTypes = this.selectedTypes.filter(t => t !== type);
                }
            });

            const label = document.createElement("label");
            label.htmlFor = `type-${type}`;
            // Use friendly name if available
            label.textContent = getLabelFriendlyName(this.labelFriendlyNames, type);

            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(label);
            this.typesContainer.appendChild(itemDiv);
        });
    }

    handleTopicChange(topic, isChecked) {
        // Update selected topics
        if (isChecked) {
            if (!this.selectedTopics.includes(topic)) {
                this.selectedTopics.push(topic);
            }

            // Apply preselection for document types if available
            this._applyDocumentTypePreselection(topic);
        } else {
            this.selectedTopics = this.selectedTopics.filter(t => t !== topic);
        }
    }

    _applyDocumentTypePreselection(topic) {
        // Check if we have preselection for this topic
        if (this.topicsTypePreselection && this.topicsTypePreselection[topic]) {
            const typesToSelect = this.topicsTypePreselection[topic];
            console.log(`[ChooseContentForAIModal] Found ${typesToSelect.length} types to preselect:`, typesToSelect);
        
            // Go through each type checkbox
            this.typesContainer.querySelectorAll("input[type=checkbox]").forEach(checkbox => {
                // Handle if the types might be objects with S property
                let checkboxValue = checkbox.value;
                let typesArray = typesToSelect;
                
                // Extract list of values from typesToSelect if it's an array of objects
                if (typesToSelect.length > 0 && typeof typesToSelect[0] === 'object' && typesToSelect[0].S) {
                    typesArray = typesToSelect.map(item => item.S);
                }
                
                if (typesArray.includes(checkboxValue) && !checkbox.checked) {
                    console.log(`[ChooseContentForAIModal] Checking type: ${checkboxValue}`);
                    checkbox.checked = true;
                    if (!this.selectedTypes.includes(checkboxValue)) {
                        this.selectedTypes.push(checkboxValue);
                    }
                }
            });
        }
    }

    _updateTopicCheckboxes() {
        // Update checkbox states based on selectedTopics
        const topicCheckboxes = this.topicsContainer.querySelectorAll("input[type=checkbox]");
        topicCheckboxes.forEach(checkbox => {
            checkbox.checked = this.selectedTopics.includes(checkbox.value);
        });
    }
    
    _updateTypeCheckboxes() {
        // Update checkbox states based on selectedTypes
        const typeCheckboxes = this.typesContainer.querySelectorAll("input[type=checkbox]");
        typeCheckboxes.forEach(checkbox => {
            checkbox.checked = this.selectedTypes.includes(checkbox.value);
        });
    }

    validateForm() {
        let errorMsg = "";

        if (!this.selectedDomain) {
            errorMsg = "Please select a Domain";
        } else if (!this.selectedUnit) {
            errorMsg = "Please select a Unit";
        } else if (this.selectedTopics.length === 0) {
            errorMsg = "Please select at least one Document Topic";
        } else if (this.selectedTypes.length === 0) {
            errorMsg = "Please select at least one Document Type";
        }

        // Show error if any
        if (errorMsg) {
            this.errorMessage.textContent = errorMsg;
            this.errorMessage.style.display = "block";
            return false;
        }

        // Clear any previous error
        this.errorMessage.style.display = "none";
        return true;
    }

    async handleSubmit() {
        if (!this.validateForm()) {
            return;
        }

        // Get the language rules from the textarea
        this.languageRules = this.languageRulesTextarea.value;

        // Create the content configuration object WITH CORPUS INCLUDED
        const contentConfig = {
            corpus: this.corpus,  // ADD: Include corpus in submitted config
            domain: this.selectedDomain,
            unit: this.selectedUnit,
            document_topics: this.selectedTopics,
            document_types: this.selectedTypes,
            language_rules: this.languageRules
        };

        console.log("[ChooseContentForAIModal] Submitting content config with corpus:", contentConfig);

        // Call the onSubmit callback
        if (this.onSubmit) {
            this.onSubmit(contentConfig);
        }
        
        // Hide modal
        this.hide();
    }

    async show() {
        super.show();

        // Reset form state
        this.selectedDomain = "";
        this.selectedUnit = "";
        this.selectedTopics = [];
        this.selectedTypes = [];
        this.languageRules = "";
        this.favoriteSlot = "";
        this.favoriteName = "";
        
        // Reset form UI
        this.domainSelect.value = "";
        this.unitSelect.innerHTML = "";
        this.languageRulesTextarea.value = "";
        this.closeFavoriteDropdown();

        // Lock UI while loading data
        this.lockFields();
        this.lockButtons();

        try {
            // Load subtenant data
            await this._loadSubtenantData();
        } finally {
            // Unlock UI
            this.unlockFields();
            this.unlockButtons();
        }
    }

    hide() {
        super.hide();
        // Make sure dropdown is closed when hiding modal
        this.closeFavoriteDropdown();
    }

    lockFields() {
        const inputs = this.modalEl.querySelectorAll("input, select, textarea");
        inputs.forEach(input => {
            input.disabled = true;
        });
    }

    unlockFields() {
        const inputs = this.modalEl.querySelectorAll("input, select, textarea");
        inputs.forEach(input => {
            input.disabled = false;
        });
    }

    lockButtons() {
        const buttons = this.modalEl.querySelectorAll("button");
        buttons.forEach(btn => {
            btn.disabled = true;
        });
    }

    unlockButtons() {
        const buttons = this.modalEl.querySelectorAll("button");
        buttons.forEach(btn => {
            btn.disabled = false;
        });
    }
}