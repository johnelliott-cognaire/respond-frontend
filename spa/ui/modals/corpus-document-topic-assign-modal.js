// ui/modals/corpus-document-topic-assign-modal.js
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { YesNoModal } from "./yesno-modal.js";
import { getSubtenantAttributes } from "../../api/subtenants.js";
import { updateCorpusTopicAssignments } from "../../api/corpus-topics.js";

/**
 * CorpusDocumentTopicAssignModal
 */
export class CorpusDocumentTopicAssignModal extends AsyncFormModal {
  constructor() {
    super();
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.confirmModal = new YesNoModal();
    
    this.corpusConfig = null;
    this.topicsMap = {}; // Tracks which topics are assigned to which corpora
    this.originalTopicsMap = {}; // Keeps the original state for comparison
    this.dirty = false; // Explicit dirty flag to track changes
    
    this._buildDOM();
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form";
    this.modalEl.style.display = "none";

    // Use a very explicit disabled attribute right in the HTML
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close modal">&times;</button>
      <h2>Assign Document Topics to Corpora</h2>
      
      <div class="modal-section">
        <p>Select which document topics are available in each corpus.</p>
        
        <div class="data-table-container" style="max-height: 400px;">
          <table id="topicMatrixTable" class="w-full">
            <thead>
              <tr>
                <th style="width: 200px;">Document Topic</th>
                <!-- Corpus headers will be inserted here -->
              </tr>
            </thead>
            <tbody>
              <!-- Topic rows will be inserted here -->
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="action-group" style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="button" class="btn" id="resetBtn">Reset</button>
        <button type="button" class="btn btn--primary" id="saveBtn" disabled="disabled">Save Changes</button>
      </div>
    `;

    document.body.appendChild(this.modalEl);
    
    this.closeBtn = this.modalEl.querySelector(".modal__close");
    this.cancelBtn = this.modalEl.querySelector("#cancelBtn");
    this.resetBtn = this.modalEl.querySelector("#resetBtn");
    this.saveBtn = this.modalEl.querySelector("#saveBtn");
    
    // Force disabled state immediately 
    this.saveBtn.disabled = true;
    this.saveBtn.setAttribute('disabled', 'disabled');
    
    this.closeBtn.addEventListener("click", () => this.hide());
    this.cancelBtn.addEventListener("click", () => this.hide());
    this.resetBtn.addEventListener("click", () => this.resetForm());
    this.saveBtn.addEventListener("click", this.saveChanges.bind(this));
  }

  /**
   * Override the base class show method to ensure button state
   */
  async show() {
    // Initialize everything before showing
    this.dirty = false;
    this.corpusConfig = null;
    this.topicsMap = {};
    this.originalTopicsMap = {};
    
    // Force disable button before showing
    if (this.saveBtn) {
      this.saveBtn.disabled = true;
      this.saveBtn.setAttribute('disabled', 'disabled');
    }
    
    // Call parent show method
    super.show();
    
    // Use setTimeout to force button disabling after the modal is visible
    setTimeout(() => {
      if (this.saveBtn) {
        this.saveBtn.disabled = true;
        this.saveBtn.setAttribute('disabled', 'disabled');
      }
    }, 0);
    
    try {
      this.lockButtons();
      await this.loadTopicCorpusData();
      this.renderMatrix();
      
      // Force disabled state again after rendering
      this.disableSaveButton();
      
      this.unlockButtons();
      
      // One more time after unlocking buttons
      this.disableSaveButton();
    } catch (error) {
      console.error("[CorpusDocumentTopicAssignModal] Error loading data:", error);
      this.errorModal.show({
        title: "Error Loading Data",
        message: `Failed to load topic and corpus data: ${error.message}`
      });
      this.hide();
    }
  }
  
  /**
   * Helper method to forcefully disable the save button
   */
  disableSaveButton() {
    if (!this.dirty && this.saveBtn) {
      console.log("[CorpusDocumentTopicAssignModal] Forcefully disabling save button");
      this.saveBtn.disabled = true;
      this.saveBtn.setAttribute('disabled', 'disabled');
      
      // Use setTimeout to ensure it happens after any other operations
      setTimeout(() => {
        if (!this.dirty && this.saveBtn) {
          this.saveBtn.disabled = true;
          this.saveBtn.setAttribute('disabled', 'disabled');
        }
      }, 0);
    }
  }

  /**
   * Loads the corpus configuration data from the subtenant attributes
   */
  async loadTopicCorpusData() {
    // Load corpus configuration
    const response = await getSubtenantAttributes(['corpus_config'], { bypassCache: true });
    
    if (!response || !response.corpus_config) {
      throw new Error("Failed to load corpus configuration");
    }
    
    this.corpusConfig = response.corpus_config;
    
    // Extract available topics from approval_by_topic
    const availableTopics = Object.keys(this.corpusConfig.approval_by_topic || {});
    
    // Extract available corpora
    const availableCorpora = Object.keys(this.corpusConfig.corpora || {});
    
    // Initialize the topics map
    this.topicsMap = {};
    this.originalTopicsMap = {};
    
    // For each corpus, check which topics are assigned
    for (const corpusId of availableCorpora) {
      const corpus = this.corpusConfig.corpora[corpusId];
      const assignedTopics = new Set();
      
      // Get the document_topics_choices array if it exists
      if (corpus && corpus.document_topics_choices) {
        // Convert the array of topics to a Set for quick lookups
        corpus.document_topics_choices.forEach(topic => {
          if (typeof topic === 'object' && topic.S) {
            assignedTopics.add(topic.S);
          } else if (typeof topic === 'string') {
            assignedTopics.add(topic);
          }
        });
      }
      
      // Store assigned topics for this corpus
      this.topicsMap[corpusId] = {};
      this.originalTopicsMap[corpusId] = {};
      
      // Set assignment status for each topic
      for (const topic of availableTopics) {
        this.topicsMap[corpusId][topic] = assignedTopics.has(topic);
        this.originalTopicsMap[corpusId][topic] = assignedTopics.has(topic);
      }
    }
    
    // Reset dirty state after loading
    this.dirty = false;
    
    // Force disabled state
    this.disableSaveButton();
  }

  /**
   * Renders the topic-corpus matrix
   */
  renderMatrix() {
    const table = this.modalEl.querySelector("#topicMatrixTable");
    const thead = table.querySelector("thead tr");
    const tbody = table.querySelector("tbody");
    
    // Clear existing content
    while (thead.children.length > 1) {
      thead.removeChild(thead.lastChild);
    }
    tbody.innerHTML = "";
    
    // Get available topics and corpora
    const availableTopics = Object.keys(this.corpusConfig.approval_by_topic || {});
    const availableCorpora = Object.keys(this.corpusConfig.corpora || {});
    
    if (availableTopics.length === 0 || availableCorpora.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="2" style="text-align: center; padding: 20px;">
            No topics or corpora available to configure.
          </td>
        </tr>
      `;
      return;
    }
    
    // Add corpus headers
    for (const corpusId of availableCorpora) {
      const corpus = this.corpusConfig.corpora[corpusId];
      const corpusName = corpus.name || corpusId;
      
      const th = document.createElement("th");
      th.textContent = corpusName;
      th.style.textAlign = "center";
      thead.appendChild(th);
    }
    
    // Add topic rows
    for (const topic of availableTopics) {
      const tr = document.createElement("tr");
      
      // Add topic name cell
      const topicCell = document.createElement("td");
      topicCell.textContent = this.formatTopicName(topic);
      topicCell.style.fontWeight = "500";
      tr.appendChild(topicCell);
      
      // Add checkbox cells for each corpus
      for (const corpusId of availableCorpora) {
        const checkboxCell = document.createElement("td");
        checkboxCell.style.textAlign = "center";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "topic-corpus-checkbox";
        checkbox.checked = this.topicsMap[corpusId][topic] || false;
        checkbox.dataset.topic = topic;
        checkbox.dataset.corpus = corpusId;
        
        // When checkbox changes, update the topicsMap and mark as dirty
        checkbox.addEventListener("change", (e) => {
          const { topic, corpus } = e.target.dataset;
          this.topicsMap[corpus][topic] = e.target.checked;
          this.dirty = true;
          this.updateSaveButtonState();
        });
        
        checkboxCell.appendChild(checkbox);
        tr.appendChild(checkboxCell);
      }
      
      tbody.appendChild(tr);
    }
    
    // Reset dirty state after rendering
    this.dirty = false;
    
    // Force disable button
    this.disableSaveButton();
  }

  /**
   * Format a topic ID into a more readable name
   */
  formatTopicName(topic) {
    return topic
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Updates the save button state based on dirty flag
   */
  updateSaveButtonState() {
    console.log("[CorpusDocumentTopicAssignModal] Dirty state:", this.dirty);
    if (this.dirty) {
      this.saveBtn.removeAttribute('disabled');
      this.saveBtn.disabled = false;
    } else {
      this.saveBtn.setAttribute('disabled', 'disabled');
      this.saveBtn.disabled = true;
    }
  }

  /**
   * Resets the form to its original state
   */
  resetForm() {
    if (!this.dirty) {
      return;
    }
    
    this.confirmModal.show({
      title: "Reset Changes",
      message: "Are you sure you want to reset all changes?",
      onYes: () => {
        // Reset to original values
        const corpora = Object.keys(this.topicsMap);
        
        for (const corpus of corpora) {
          const topics = Object.keys(this.topicsMap[corpus]);
          
          for (const topic of topics) {
            this.topicsMap[corpus][topic] = this.originalTopicsMap[corpus][topic];
          }
        }
        
        // Update checkboxes
        const checkboxes = this.modalEl.querySelectorAll(".topic-corpus-checkbox");
        checkboxes.forEach(checkbox => {
          const { topic, corpus } = checkbox.dataset;
          checkbox.checked = this.topicsMap[corpus][topic];
        });
        
        // Reset dirty state
        this.dirty = false;
        
        // Force disable save button
        this.saveBtn.setAttribute('disabled', 'disabled');
        this.saveBtn.disabled = true;
      }
    });
  }

  /**
   * Saves the changes to the backend
   */
  async saveChanges() {
    console.log("[CorpusDocumentTopicAssignModal] saveChanges called");
    
    if (!this.dirty) {
      console.log("[CorpusDocumentTopicAssignModal] No changes to save");
      return;
    }
    
    try {
      this.lockButtons();
      console.log("[CorpusDocumentTopicAssignModal] Preparing updates...");
      
      const updates = this.prepareUpdates();
      console.log("[CorpusDocumentTopicAssignModal] Updates to send:", updates);
      
      const result = await updateCorpusTopicAssignments(updates);
      console.log("[CorpusDocumentTopicAssignModal] Update result:", result);
      
      // Update original state to match current state
      for (const corpus in this.topicsMap) {
        for (const topic in this.topicsMap[corpus]) {
          this.originalTopicsMap[corpus][topic] = this.topicsMap[corpus][topic];
        }
      }
      
      this.messageModal.show({
        title: "Success",
        message: "Topic assignments updated successfully."
      });
      
      // Reset dirty state after save
      this.dirty = false;
      
      // Force disable save button
      this.saveBtn.setAttribute('disabled', 'disabled');
      this.saveBtn.disabled = true;

      // Fire a custom event to notify the parent view
      const event = new CustomEvent('topic-assignments-updated', {
        bubbles: true, 
        detail: { 
            success: true,
            updateTime: new Date().toISOString(),
            affectedCorpora: Object.keys(updates)
          }
      });
      document.dispatchEvent(event);

    } catch (error) {
      console.error("[CorpusDocumentTopicAssignModal] Error saving changes:", error);
      this.errorModal.show({
        title: "Error Saving Changes",
        message: `Failed to save topic assignments: ${error.message}`
      });
    } finally {
      this.unlockButtons();
      
      // In case unlockButtons re-enables the save button
      if (!this.dirty) {
        setTimeout(() => {
          this.saveBtn.setAttribute('disabled', 'disabled');
          this.saveBtn.disabled = true;
        }, 0);
      }
    }
  }

  /**
   * Prepares the updates to be sent to the backend
   */
  prepareUpdates() {
    const updates = {};
    
    for (const corpus in this.topicsMap) {
      // Include all corpora when the form is dirty
      updates[corpus] = Object.keys(this.topicsMap[corpus])
        .filter(topic => this.topicsMap[corpus][topic])
        .map(topic => topic);
    }
    
    return updates;
  }
}