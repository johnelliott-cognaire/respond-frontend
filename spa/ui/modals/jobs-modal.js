// File: ui/modals/jobs-modal.js
import { ErrorModal } from "./error-modal.js";
import { verifyPermission, getFreshSecurity } from "../../utils/security-utils.js";
import { getConfig } from "../../utils/config.js";

export class JobsModal {
  constructor(store, jobController) {
    this.store = store;
    this.jobController = jobController;
    this.jobs = [];
    this.selectedJobId = null;
    this.modalEl = null;
    this.overlayEl = null;
    this.errorModal = new ErrorModal();
    this.isInitialized = false;
  }

  async init() {
    console.log("[JobsModal] Initializing");
    
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    
    if (!this.modalEl) {
      this._buildDOM();
    }
    
    this.isInitialized = true;
  }

  _buildOverlay() {
    // Create overlay if it doesn't exist
    this.overlayEl = document.getElementById("overlay");
    if (!this.overlayEl) {
      this.overlayEl = document.createElement("div");
      this.overlayEl.id = "overlay";
      this.overlayEl.className = "modal-overlay";
      this.overlayEl.style.display = "none";
      this.overlayEl.style.zIndex = "9995";
      document.body.appendChild(this.overlayEl);
    }
  }

  _buildDOM() {
    console.log("[JobsModal] Building DOM");
    
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form jobs-modal";
    this.modalEl.style.display = "none";
    this.modalEl.style.zIndex = "9996";
    
    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close jobs modal">&times;</button>
      <h2>Active & Recent Jobs</h2>
      
      <div class="form-group" style="display:flex; gap:0.5rem;">
        <input type="text" id="jobsSearchInput" class="doc-input" placeholder="Search..." style="flex:1; min-width:0;" />
        <button type="button" class="btn" id="jobsSearchBtn">Search</button>
        <button type="button" class="btn" id="jobsRefreshBtn">Refresh</button>
      </div>
      
      <div class="jobs-table-container" 
           style="max-height: 400px; overflow-y: auto; border:1px solid var(--border-subtle); margin-top:1rem; padding:0.5rem;">
        <table class="jobs-table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width:20%">Job ID</th>
              <th style="width:20%">Type</th>
              <th style="width:15%">Status</th>
              <th style="width:15%">Progress</th>
              <th style="width:15%">Created</th>
              <th style="width:15%">Actions</th>
            </tr>
          </thead>
          <tbody id="jobsTableBody"></tbody>
        </table>
      </div>
      
      <div class="button-group">
        <button type="button" class="btn" id="jobsModalCloseBtn">Close</button>
        <button type="button" class="btn" id="viewJobDetailsBtn" disabled>View Details</button>
        <button type="button" class="btn" id="openJobResultBtn" disabled>Open Result</button>
      </div>
    `;
    
    document.body.appendChild(this.modalEl);
    
    // Add event listeners
    this.addEventListeners();
  }

  addEventListeners() {
    const closeBtn = this.modalEl.querySelector(".modal__close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.hide());
    }
    
    const modalCloseBtn = this.modalEl.querySelector("#jobsModalCloseBtn");
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener("click", () => this.hide());
    }
    
    this.overlayEl.addEventListener("click", () => this.hide());
    
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isVisible()) {
        this.hide();
      }
    });
    
    // Refresh button
    const refreshBtn = this.modalEl.querySelector("#jobsRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        try {
          refreshBtn.disabled = true;
          refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          await this.jobController.refreshAllJobs();
          await this.refreshJobs();
        } catch (err) {
          console.error("[JobsModal] Error refreshing jobs:", err);
          this.errorModal.show({
            title: "Refresh Error",
            message: "Failed to refresh jobs. Please try again."
          });
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = 'Refresh';
        }
      });
    }
    
    // Search button
    const searchBtn = this.modalEl.querySelector("#jobsSearchBtn");
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        this.performSearch();
      });
      
      // Also add enter key listener to search input
      const searchInput = this.modalEl.querySelector("#jobsSearchInput");
      if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            this.performSearch();
          }
        });
      }
    }
    
    // Table row click
    const tableBody = this.modalEl.querySelector("#jobsTableBody");
    if (tableBody) {
      tableBody.addEventListener("click", (e) => {
        const row = e.target.closest("tr[data-job-id]");
        if (!row) return;
        
        const jobId = row.dataset.jobId;
        this.selectedJobId = jobId;
        this.updateJobsTable();
        this.updateButtonStates();
      });
    }
    
    // View details button
    const viewDetailsBtn = this.modalEl.querySelector("#viewJobDetailsBtn");
    if (viewDetailsBtn) {
      viewDetailsBtn.addEventListener("click", () => {
        if (this.selectedJobId) {
          this.viewJobDetails(this.selectedJobId);
        }
      });
    }
    
    // Open result button
    const openResultBtn = this.modalEl.querySelector("#openJobResultBtn");
    if (openResultBtn) {
      openResultBtn.addEventListener("click", () => {
        if (this.selectedJobId) {
          this.openJobResultTab(this.selectedJobId);
        }
      });
    }
    
    // Cancel job action
    this.modalEl.addEventListener("click", async (e) => {
      if (e.target.classList.contains("cancel-btn")) {
        const jobId = e.target.dataset.jobId;
        if (jobId) {
          try {
            e.target.disabled = true;
            e.target.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await this.jobController.cancelJob(jobId);
            await this.refreshJobs();
          } catch (err) {
            console.error("[JobsModal] Error cancelling job:", err);
            this.errorModal.show({
              title: "Cancel Error",
              message: "Failed to cancel job. Please try again."
            });
            e.target.disabled = false;
            e.target.innerHTML = 'Cancel';
          }
        }
      }
    });
  }

  async performSearch() {
    const searchInput = this.modalEl.querySelector("#jobsSearchInput");
    if (!searchInput) return;
    
    const searchText = searchInput.value.trim().toLowerCase();
    
    if (!searchText) {
      // If empty search, refresh all jobs
      await this.refreshJobs();
      return;
    }
    
    // Filter existing jobs based on search text
    const filteredJobs = this.jobs.filter(job => {
      const jobId = (job.jobId || job.job_id || job.question_jid || job.analysis_lm_jid || "").toLowerCase();
      const type = (job.jobType || job.type || "").toLowerCase();
      const docId = (job.docId || "").toLowerCase();
      
      return jobId.includes(searchText) || 
             type.includes(searchText) || 
             docId.includes(searchText);
    });
    
    // Update display with filtered results
    this.updateJobsTableWithData(filteredJobs);
  }

  async show(options = {}) {
    if (!localStorage.getItem("authToken")) {
      this.errorModal.show({ 
        title: "Access Denied", 
        message: "Please log in to view jobs." 
      });
      return;
    }
    
    if (!this.isInitialized) {
      await this.init();
    }
    
    console.log("[JobsModal] Showing modal");
    await this.refreshJobs();
    
    // Reset selection
    this.selectedJobId = null;
    this.updateButtonStates();

    this.modalEl.style.display = "block";
    this.overlayEl.style.display = "block";
  }

  hide() {
    console.log("[JobsModal] Hiding modal");
    if (this.modalEl) {
      this.modalEl.style.display = "none";
    }
    if (this.overlayEl) {
      this.overlayEl.style.display = "none";
    }
  }

  isVisible() {
    return this.modalEl?.style.display === "block";
  }

  async refreshJobs() {
    console.log("[JobsModal] Refreshing jobs");
    try {
      await this.jobController.refreshAllJobs();
      this.jobs = await this.jobController.getAllJobs();
      this.updateJobsTable();
    } catch (err) {
      console.error("[JobsModal] Error refreshing jobs:", err);
    }
  }

  updateJobsTable() {
    this.updateJobsTableWithData(this.jobs);
  }

  updateJobsTableWithData(jobsData) {
    const tbody = this.modalEl.querySelector("#jobsTableBody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    if (!jobsData || jobsData.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `
        <td colspan="6" style="text-align: center; padding: 20px;">
          No jobs found.
        </td>
      `;
      tbody.appendChild(emptyRow);
      return;
    }
  
    // Sort by creation date, newest first
    const sortedJobs = [...jobsData].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_datetime || a.start_datetime || 0);
      const dateB = new Date(b.createdAt || b.created_datetime || b.start_datetime || 0);
      return dateB - dateA;
    });
  
    for (const job of sortedJobs) {
      const jobId = job.jobId || job.job_id || job.question_jid || job.analysis_lm_jid || "";
      const jobType = job.jobType || job.type || "";
      const status = job.status || "";
      const progress = job.progress || 0;
      const createdAt = new Date(job.createdAt || job.created_datetime || job.start_datetime || 0);
      const formattedDate = isNaN(createdAt) ? "-" : createdAt.toLocaleString();
  
      const isSelected = (jobId === this.selectedJobId);
      const row = document.createElement("tr");
      row.dataset.jobId = jobId;
      row.classList.toggle("selected-row", isSelected);
  
      row.innerHTML = `
        <td>${this._truncateString(jobId, 12)}</td>
        <td>${this._truncateString(jobType, 15)}</td>
        <td>${status}</td>
        <td>
          <div class="progress-bar">
            <div class="progress" style="width: ${progress}%"></div>
          </div>
          <span class="progress-text">${progress}%</span>
        </td>
        <td>${formattedDate}</td>
        <td>
          ${
            status === "RUNNING" || status === "PENDING"
              ? `<button class="cancel-btn" data-job-id="${jobId}">Cancel</button>`
              : `<span style="color:gray;">N/A</span>`
          }
        </td>
      `;
  
      tbody.appendChild(row);
    }
  }

  /**
   * Helper method to truncate a string
   * @param {string} str - String to truncate
   * @param {number} length - Maximum length
   * @returns {string} Truncated string
   * @private
   */
  _truncateString(str, length) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length - 3) + '...';
  }

  updateButtonStates() {
    const viewDetailsBtn = this.modalEl.querySelector("#viewJobDetailsBtn");
    const openResultBtn = this.modalEl.querySelector("#openJobResultBtn");
    
    if (viewDetailsBtn) {
      viewDetailsBtn.disabled = !this.selectedJobId;
    }
    
    if (openResultBtn) {
      const selectedJob = this.jobs.find(j => (j.jobId || j.job_id || j.question_jid || j.analysis_lm_jid) === this.selectedJobId);
      openResultBtn.disabled = !this.selectedJobId || 
                              !(selectedJob?.status === "COMPLETED");
    }
  }

  viewJobDetails(jobId) {
    console.log("[JobsModal] Viewing details for job:", jobId);
    // This could open a detailed view in a different modal or tab
    const job = this.jobs.find(j => (j.jobId || j.job_id || j.question_jid || j.analysis_lm_jid) === jobId);
    if (job) {
      const detailsStr = JSON.stringify(job, null, 2);
      alert(`Job Details:\n\n${detailsStr}`);
      // In a real implementation, you might show a detailed modal
    }
  }

  async openJobResultTab(jobId) {
    console.log("[JobsModal] Opening result tab for job:", jobId);
    try {
      // Get the full job details
      const jobDetails = await this.jobController.getJobDetails(jobId);
      
      // Check if there's already a tab open for this job
      const tabId = this.jobController.getTabIdForJob(jobId);
      
      if (tabId) {
        // Focus on existing tab
        if (window.tabManager) {
          window.tabManager.setActiveTabById(tabId);
        }
      } else {
        // Create a new tab based on job type
        if (window.tabManager) {
          // This would depend on your application's tab system
          // Focus or create a tab showing the job result
          console.log("[JobsModal] Creating new tab for job:", jobId);
          
          // Example (implementation would depend on your tab system):
          // window.tabManager.addNewTabForJobResult(jobDetails);
        }
      }
      
      // Hide the modal after opening the tab
      this.hide();
    } catch (error) {
      console.error("[JobsModal] Error opening job result:", error);
      this.errorModal.show({
        title: "Error",
        message: `Failed to open job result: ${error.message}`
      });
    }
  }
}