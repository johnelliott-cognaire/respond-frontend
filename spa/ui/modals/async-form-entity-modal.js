// File: ui/modals/async-form-entity-modal.js
import { AsyncFormModal } from "./async-form-modal.js";

/**
 * AsyncFormEntityModal is a specialized base class for entity editing/viewing modals.
 * It provides structured handling of access levels, field permissions, and state management.
 */
export class AsyncFormEntityModal extends AsyncFormModal {
    /**
     * @param {Object} options - Configuration options
     * @param {Boolean} options.isNewEntity - Whether this modal is creating a new entity
     * @param {Boolean} options.forceEditMode - Start in edit mode
     * @param {Object} options.store - Application state store
     */
    constructor(options = {}) {
      super();
      
      // Core state tracking
      this.store = options.store;
      this.isNewEntity = !!options.isNewEntity;
      this.editMode = this.isNewEntity || !!options.forceEditMode;
      this.formDirty = false;
      
      // Entity data
      this.originalData = null;
      this.currentData = null;
      
      // Access level management
      this.accessLevels = {
        NONE: 0,      // No access
        BASIC: 1,     // Basic user access (e.g., self-view with limited editing)
        EXTENDED: 2,  // Extended access (e.g., admin viewing others)
        ADMIN: 3      // Full administrative access
      };
      
      // Default to BASIC access
      this.currentAccessLevel = this.accessLevels.BASIC;
      
      // UI component registries
      this.fields = new Map();
      this.buttons = new Map();
      this.sections = new Map();
      
      // State tracking
      this.loading = false;
      this.saving = false;
      this.error = null;
      
      // Create helpers
      this.dialogService = {
        confirm: this._confirmDialog.bind(this),
        alert: this._alertDialog.bind(this),
        error: this._errorDialog.bind(this)
      };
    }
    
    /**
     * Determines the user's access level for this entity
     * Override in subclasses to implement specific logic
     * @returns {Number} The access level constant
     */
    determineAccessLevel() {
      // Default implementation - override in subclasses
      return this.accessLevels.BASIC;
    }
    
    /**
     * Register a field with access level rules
     * 
     * @param {String} id - Field identifier
     * @param {HTMLElement} element - DOM element
     * @param {Object} options - Field options
     * @param {Number|Function} options.requiredAccessLevel - Minimum access level or function returning boolean
     * @param {Boolean|Function} options.editableInViewMode - Whether field is editable in view mode
     * @param {Boolean|Function} options.editableInEditMode - Whether field is editable in edit mode
     * @param {Function} options.onChange - Change handler
     */
    registerField(id, element, options = {}) {
      if (!element) {
        console.warn(`[${this.constructor.name}] Cannot register field '${id}': element is null`);
        return this;
      }
      
      // Default options
      const fieldOpts = {
        requiredAccessLevel: this.accessLevels.BASIC,
        editableInViewMode: false,
        editableInEditMode: true,
        onChange: () => this.markDirty(),
        ...options
      };
      
      // Store the field configuration
      this.fields.set(id, {
        element,
        options: fieldOpts
      });
      
      // Attach change listener if provided
      if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
        element.addEventListener('change', () => {
          if (typeof fieldOpts.onChange === 'function') {
            fieldOpts.onChange.call(this, element);
          }
        });
        
        // For immediate feedback, also listen to input events on text fields
        if (element.type === 'text' || element.type === 'email' || element.tagName === 'TEXTAREA') {
          element.addEventListener('input', () => {
            if (typeof fieldOpts.onChange === 'function') {
              fieldOpts.onChange.call(this, element);
            }
          });
        }
      }
      
      return this;
    }
    
    /**
     * Register a button with access level rules
     * 
     * @param {String} id - Button identifier
     * @param {HTMLElement} element - DOM element
     * @param {Object} options - Button options
     * @param {Number|Function} options.requiredAccessLevel - Minimum access level or function returning boolean
     * @param {Boolean|Function} options.visibleInViewMode - Whether button is visible in view mode
     * @param {Boolean|Function} options.visibleInEditMode - Whether button is visible in edit mode
     * @param {Boolean|Function} options.enabledInViewMode - Whether button is enabled in view mode
     * @param {Boolean|Function} options.enabledInEditMode - Whether button is enabled in edit mode
     * @param {Function} options.onClick - Click handler
     */
    registerButton(id, element, options = {}) {
      if (!element) {
        console.warn(`[${this.constructor.name}] Cannot register button '${id}': element is null`);
        return this;
      }
      
      // Default options
      const buttonOpts = {
        requiredAccessLevel: this.accessLevels.BASIC,
        visibleInViewMode: true,
        visibleInEditMode: true,
        enabledInViewMode: true,
        enabledInEditMode: true,
        onClick: null,
        ...options
      };
      
      // Store the button configuration
      this.buttons.set(id, {
        element,
        options: buttonOpts
      });
      
      // Attach click handler if provided
      if (typeof buttonOpts.onClick === 'function') {
        element.addEventListener('click', (e) => {
          buttonOpts.onClick.call(this, e);
        });
      }
      
      return this;
    }
    
    /**
     * Register a section (container of fields) with access level rules
     * 
     * @param {String} id - Section identifier
     * @param {HTMLElement} element - DOM element
     * @param {Object} options - Section options
     * @param {Number|Function} options.requiredAccessLevel - Minimum access level or function returning boolean
     * @param {Boolean|Function} options.visibleInViewMode - Whether section is visible in view mode
     * @param {Boolean|Function} options.visibleInEditMode - Whether section is visible in edit mode
     */
    registerSection(id, element, options = {}) {
      if (!element) {
        console.warn(`[${this.constructor.name}] Cannot register section '${id}': element is null`);
        return this;
      }
      
      // Default options
      const sectionOpts = {
        requiredAccessLevel: this.accessLevels.BASIC,
        visibleInViewMode: true,
        visibleInEditMode: true,
        ...options
      };
      
      // Store the section configuration
      this.sections.set(id, {
        element,
        options: sectionOpts
      });
      
      return this;
    }
    
    /**
     * Check if a condition is met based on either a function or static value
     * 
     * @param {*} condition - Boolean or function returning boolean
     * @returns {Boolean} Result
     */
    _evaluateCondition(condition) {
      if (typeof condition === 'function') {
        return condition.call(this);
      }
      return !!condition;
    }
    
    /**
     * Check if an access level requirement is met
     * 
     * @param {Number|Function} requiredLevel - Required access level or function
     * @returns {Boolean} Whether access is allowed
     */
    _hasRequiredAccess(requiredLevel) {
      if (typeof requiredLevel === 'function') {
        return requiredLevel.call(this);
      }
      
      // If it's a number, compare against current access level
      return this.currentAccessLevel >= requiredLevel;
    }
    
    /**
     * Update all registered UI components based on current state
     */
    updateUIState() {
      // First, determine current access level
      this.currentAccessLevel = this.determineAccessLevel();
      
      // Update fields
      this._updateFieldStates();
      
      // Update buttons
      this._updateButtonStates();
      
      // Update sections
      this._updateSectionStates();
      
      // Log the state update for debugging
      console.log(`[${this.constructor.name}] Updated UI state: editMode=${this.editMode}, accessLevel=${this.currentAccessLevel}, dirty=${this.formDirty}`);
    }
    
    /**
     * Update field states based on rules
     */
    _updateFieldStates() {
      for (const [id, field] of this.fields.entries()) {
        const { element, options } = field;
        
        // Check access level
        const hasAccess = this._hasRequiredAccess(options.requiredAccessLevel);
        
        // Determine if field should be editable based on mode
        let isEditable = false;
        
        if (this.editMode) {
          isEditable = hasAccess && this._evaluateCondition(options.editableInEditMode);
        } else {
          isEditable = hasAccess && this._evaluateCondition(options.editableInViewMode);
        }
        
        // Apply state
        element.disabled = !isEditable;
      }
    }
    
    /**
     * Update button states based on rules
     */
    _updateButtonStates() {
      for (const [id, button] of this.buttons.entries()) {
        const { element, options } = button;
        
        // Check access level
        const hasAccess = this._hasRequiredAccess(options.requiredAccessLevel);
        
        // Determine visibility
        let isVisible = false;
        if (this.editMode) {
          isVisible = hasAccess && this._evaluateCondition(options.visibleInEditMode);
        } else {
          isVisible = hasAccess && this._evaluateCondition(options.visibleInViewMode);
        }
        
        // Determine enabled state
        let isEnabled = false;
        if (this.editMode) {
          isEnabled = hasAccess && this._evaluateCondition(options.enabledInEditMode);
        } else {
          isEnabled = hasAccess && this._evaluateCondition(options.enabledInViewMode);
        }
        
        // Apply states
        element.style.display = isVisible ? '' : 'none';
        element.disabled = !isEnabled;
      }
    }
    
    /**
     * Update section visibility based on rules
     */
    _updateSectionStates() {
      for (const [id, section] of this.sections.entries()) {
        const { element, options } = section;
        
        // Check access level
        const hasAccess = this._hasRequiredAccess(options.requiredAccessLevel);
        
        // Determine visibility
        let isVisible = false;
        if (this.editMode) {
          isVisible = hasAccess && this._evaluateCondition(options.visibleInEditMode);
        } else {
          isVisible = hasAccess && this._evaluateCondition(options.visibleInViewMode);
        }
        
        // Apply state
        element.style.display = isVisible ? '' : 'none';
      }
    }
    
    /**
     * Mark form as dirty and update UI
     */
    markDirty() {
      if (!this.formDirty) {
        this.formDirty = true;
        console.log(`[${this.constructor.name}] Form marked as dirty`);
        this.updateUIState();
      }
    }
    
    /**
     * Reset dirty state
     */
    resetDirty() {
      this.formDirty = false;
      this.updateUIState();
    }
    
    /**
     * Enter edit mode
     */
    enterEditMode() {
      this.editMode = true;
      this.updateUIState();
    }
    
    /**
     * Exit edit mode and optionally revert changes
     * 
     * @param {Boolean} revertChanges - Whether to revert to original data
     */
    exitEditMode(revertChanges = true) {
      if (revertChanges && this.originalData) {
        this.currentData = this.cloneData(this.originalData);
        this.renderData();
      }
      
      this.editMode = false;
      this.formDirty = false;
      this.updateUIState();
    }
    
    /**
     * Common show implementation for entity modals
     */
    async show() {
      super.show();
      
      // Lock everything initially to prevent interaction during loading
      this.lockFields();
      this.lockButtons();
      
      try {
        this.loading = true;
        
        if (this.isNewEntity) {
          // Initialize with empty data
          this.originalData = this.getEmptyDataModel();
          this.currentData = this.cloneData(this.originalData);
          this.editMode = true;
        } else {
          // Load existing data
          const data = await this.loadEntityData();
          this.originalData = data;
          this.currentData = this.cloneData(data);
          // Edit mode is set in constructor based on options
        }
        
        // Render the data and update UI state
        this.renderData();
        this.updateUIState();
        
      } catch (error) {
        this.handleError(error);
      } finally {
        this.loading = false;
      }
    }
    
    /**
     * Handle save action with validation and state management
     */
    async handleSave() {
      if (this.saving) return;
      
      try {
        this.saving = true;
        this.lockFields();
        this.lockButtons();
        
        // Collect and validate data
        this.collectFormData();
        const validation = this.validateFormData();
        
        if (!validation.valid) {
          this.showValidationErrors(validation.errors);
          return;
        }
        
        // Save to server
        const savedData = await this.saveEntityData();
        this.originalData = savedData;
        this.currentData = this.cloneData(savedData);
        
        // Update UI
        this.formDirty = false;
        this.editMode = false;
        this.renderData();
        this.dialogService.alert('Success', 'Changes saved successfully');
        
      } catch (error) {
        this.handleError(error);
      } finally {
        this.saving = false;
        this.updateUIState();
      }
    }
    
    /**
     * Handle cancel button with confirmation if dirty
     */
    handleCancel() {
      if (this.formDirty) {
        this.dialogService.confirm(
          'Discard Changes', 
          'You have unsaved changes. Are you sure you want to discard them?',
          () => this.exitEditMode(true)
        );
      } else {
        this.exitEditMode(true);
      }
    }
    
    /**
     * Clone data to avoid reference issues
     * @param {Object} data - Data to clone
     * @returns {Object} Cloned data
     */
    cloneData(data) {
      return JSON.parse(JSON.stringify(data));
    }
    
    /**
     * Default dialog implementations
     * Subclasses should override these with actual implementations
     */
    _confirmDialog(title, message, onConfirm, onCancel) {
      const confirmed = window.confirm(message);
      if (confirmed && onConfirm) onConfirm();
      else if (!confirmed && onCancel) onCancel();
    }
    
    _alertDialog(title, message) {
      window.alert(message);
    }
    
    _errorDialog(title, message) {
      window.alert(`Error: ${message}`);
    }
    
    /**
     * Handle error display
     * @param {Error} error - Error object to handle
     */
    handleError(error) {
      console.error(`[${this.constructor.name}] Error:`, error);
      this.error = error;
      
      // Handle specific error types
      if (this.isAuthenticationError(error)) {
        this.handleAuthenticationError();
      } else {
        this.dialogService.error('Error', error.message || 'An error occurred');
      }
    }
    
    /**
     * Check if error is authentication related
     * @param {Error} error - Error to check
     * @returns {Boolean} True if authentication error
     */
    isAuthenticationError(error) {
      return error.message && (
        error.message.toLowerCase().includes('unauthorized') || 
        error.message.toLowerCase().includes('token')
      );
    }
    
    /**
     * Handle authentication errors
     * Subclasses should implement specific behavior
     */
    handleAuthenticationError() {
      // Default implementation just hides the form
      this.hide();
    }
    
    /**
     * Show validation errors
     * @param {Object} errors - Validation errors
     */
    showValidationErrors(errors) {
      // Default implementation
      const errorMessages = Object.entries(errors)
        .map(([field, message]) => `${field}: ${message}`)
        .join('\n');
      
      this.dialogService.error('Validation Error', errorMessages);
    }
    
    /**
     * Methods that must be implemented by subclasses
     */
    getEmptyDataModel() {
      throw new Error(`${this.constructor.name} must implement getEmptyDataModel()`);
    }
    
    loadEntityData() {
      throw new Error(`${this.constructor.name} must implement loadEntityData()`);
    }
    
    saveEntityData() {
      throw new Error(`${this.constructor.name} must implement saveEntityData()`);
    }
    
    renderData() {
      throw new Error(`${this.constructor.name} must implement renderData()`);
    }
    
    collectFormData() {
      throw new Error(`${this.constructor.name} must implement collectFormData()`);
    }
    
    validateFormData() {
      // Default implementation passes validation
      return { valid: true, errors: {} };
    }
  }