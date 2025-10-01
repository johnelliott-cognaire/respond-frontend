// ui/views/corpus/corpus-labels-view.js
import { CorpusViewBase } from './corpus-view-base.js';
import { ErrorModal } from '../../modals/error-modal.js';
import { YesNoModal } from '../../modals/yesno-modal.js';
import { MessageModal } from '../../modals/message-modal.js';
import { getSubtenantAttributes } from '../../../api/subtenants.js';
import { createLabel, deleteLabel } from '../../../api/corpus-types-and-strings.js';

export class CorpusLabelsView extends CorpusViewBase {
  constructor(store, jobController) {
    super(store, jobController);

    // Initialize modals
    this.errorModal = new ErrorModal();
    this.confirmModal = new YesNoModal();
    this.messageModal = new MessageModal();

    // State
    this.loading = false;
    this.labelFriendlyNames = {};
    this.deleteInProgress = new Set();

    // DOM references
    this.labelsList = null;
    this.newLabelKeyInput = null;
    this.newLabelValueInput = null;
    this.addLabelBtn = null;
  }

  renderContent() {
    return `
      <div class="corpus-settings-container">
        <p>Configure display-friendly names for labels. Keys must be lowercase with hyphens instead of spaces.</p>
        
        <div class="input-button-group" style="max-width: 600px;">
          <input type="text" id="new-label-key" placeholder="Label key (e.g. policy-doc)" />
          <input type="text" id="new-label-value" placeholder="Display name (e.g. Policy Doc)" />
          <button id="add-label-btn" class="btn btn--primary">Add Label</button>
        </div>
        
        <div class="mt-4">
          <h4>Current Labels</h4>
          <div class="table-responsive" style="max-width: 800px;">
            <table class="table" style="width: 100%;">
              <thead>
                <tr>
                  <th style="width: 30%;">Label Key</th>
                  <th style="width: 50%;">Display Name</th>
                  <th style="width: 20%;">Actions</th>
                </tr>
              </thead>
              <tbody id="labels-list">
                ${this.renderLabelsList()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  renderLabelsList() {
    if (!this.labelFriendlyNames || Object.keys(this.labelFriendlyNames).length === 0) {
      return `<tr><td colspan="3" class="text-muted text-center">No label mappings defined</td></tr>`;
    }

    return Object.entries(this.labelFriendlyNames)
      .map(([key, value]) => `
        <tr>
          <td>${key}</td>
          <td>${value}</td>
          <td>
            <button class="btn btn--icon delete-label ${this.deleteInProgress.has(key) ? 'loading' : ''}" 
                data-key="${key}" ${this.deleteInProgress.has(key) ? 'disabled' : ''}>
              ${this.deleteInProgress.has(key) ? 
                '<div class="loading-spinner" style="width: 16px; height: 16px;"></div>' : 
                '<i class="fas fa-trash-alt"></i>'}
            </button>
          </td>
        </tr>
      `)
      .join('');
  }

  attachEventListeners() {
    // Get DOM elements
    this.newLabelKeyInput = this.containerEl.querySelector('#new-label-key');
    this.newLabelValueInput = this.containerEl.querySelector('#new-label-value');
    this.labelsList = this.containerEl.querySelector('#labels-list');
    this.addLabelBtn = this.containerEl.querySelector('#add-label-btn');

    // Add label button
    if (this.addLabelBtn) {
      this.addListener(this.addLabelBtn, 'click', () => {
        this.addLabel();
      });
    }

    // New label input - add on Enter key
    if (this.newLabelValueInput) {
      this.addListener(this.newLabelValueInput, 'keypress', (e) => {
        if (e.key === 'Enter') {
          this.addLabel();
        }
      });
    }

    // Delete label buttons - using event delegation
    if (this.labelsList) {
      this.addListener(this.labelsList, 'click', (e) => {
        const deleteBtn = e.target.closest('.delete-label');
        if (deleteBtn && !deleteBtn.disabled) {
          const key = deleteBtn.dataset.key;
          this.confirmDeleteLabel(key);
        }
      });
    }
  }

  async onActivate() {
    try {
      await this.loadLabelFriendlyNames();
    } catch (error) {
      console.error('[CorpusLabelsView] Error activating view:', error);
      this.errorModal.show({
        title: "Error Loading View",
        message: "There was a problem loading the labels view. Please try again."
      });
    }
  }

  async loadLabelFriendlyNames() {
    try {
      this.setLoading(true);

      // Get label_friendly_names from subtenant attributes
      const attributes = await getSubtenantAttributes(['label_friendly_names']);
      this.labelFriendlyNames = attributes.label_friendly_names || {};

      this.updateUI();
    } catch (error) {
      console.error('[CorpusLabelsView] Error loading label friendly names:', error);
      this.errorModal.show({
        title: "Error Loading Labels",
        message: error.message || "Failed to load label friendly names"
      });
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  updateUI() {
    // Update labels list
    if (this.labelsList) {
      this.labelsList.innerHTML = this.renderLabelsList();
    }
  }

  async addLabel() {
    const key = this.newLabelKeyInput?.value?.trim();
    const value = this.newLabelValueInput?.value?.trim();
    
    if (!key || !value) {
      this.errorModal.show({
        title: "Validation Error",
        message: "Please enter both a label key and display name"
      });
      return;
    }

    // Validate key format (lowercase, no spaces, only letters, numbers, and hyphens)
    const keyPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!keyPattern.test(key)) {
      this.errorModal.show({
        title: "Validation Error",
        message: "Label key must be lowercase, with no spaces. Only letters, numbers, and hyphens are allowed."
      });
      return;
    }

    try {
      // Disable inputs and button
      if (this.newLabelKeyInput) this.newLabelKeyInput.disabled = true;
      if (this.newLabelValueInput) this.newLabelValueInput.disabled = true;
      if (this.addLabelBtn) {
        this.addLabelBtn.disabled = true;
        this.addLabelBtn.innerHTML = '<div class="loading-spinner" style="width: 16px; height: 16px;"></div> Adding...';
      }
      
      // Call API to add/update label
      await createLabel({
        name: key,
        value: value
      });
      
      // Reload label data
      await this.loadLabelFriendlyNames();
      
      // Clear inputs
      if (this.newLabelKeyInput) this.newLabelKeyInput.value = '';
      if (this.newLabelValueInput) this.newLabelValueInput.value = '';
      if (this.newLabelKeyInput) this.newLabelKeyInput.focus();
      
    } catch (error) {
      console.error('[CorpusLabelsView] Error adding label:', error);
      this.errorModal.show({
        title: "Error Adding Label",
        message: error.message || "Failed to add label"
      });
    } finally {
      // Re-enable inputs and button
      if (this.newLabelKeyInput) this.newLabelKeyInput.disabled = false;
      if (this.newLabelValueInput) this.newLabelValueInput.disabled = false;
      if (this.addLabelBtn) {
        this.addLabelBtn.disabled = false;
        this.addLabelBtn.innerHTML = 'Add Label';
      }
    }
  }

  confirmDeleteLabel(key) {
    this.confirmModal.show({
      title: "Delete Label",
      message: `Are you sure you want to delete the label "${key}"?`,
      onYes: () => {
        this.deleteLabel(key);
      },
      onNo: () => {
        // Do nothing
      }
    });
  }

  async deleteLabel(key) {
    try {
      // Mark this label as being deleted
      this.deleteInProgress.add(key);
      this.updateUI();
      
      // Call API to delete label
      await deleteLabel({
        name: key
      });
      
      // Reload label data
      await this.loadLabelFriendlyNames();
      
    } catch (error) {
      console.error('[CorpusLabelsView] Error deleting label:', error);
      this.errorModal.show({
        title: "Error Deleting Label",
        message: error.message || "Failed to delete label"
      });
    } finally {
      // Remove from in-progress set
      this.deleteInProgress.delete(key);
      this.updateUI();
    }
  }

  setLoading(loading) {
    this.loading = loading;
    
    // Remove any existing overlays
    const existingOverlays = this.containerEl?.querySelectorAll('.loading-overlay');
    existingOverlays?.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    
    // Add loading overlay if loading
    if (loading && this.containerEl) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loading-spinner"></div>';
      this.containerEl.appendChild(overlay);
    }
  }

  destroy() {
    super.destroy();
  }
}