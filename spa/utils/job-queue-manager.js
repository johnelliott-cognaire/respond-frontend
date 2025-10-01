/**
 * utils/job-queue-manager.js
 * Manages client-side job queueing for AI answering jobs
 */

import { getJobConfig } from "./job-config.js";
import tokenRefreshService from "./token-refresh-service.js";
import { MessageModal } from "../ui/modals/message-modal.js";

class JobQueueManager {
  constructor() {
    this.jobQueue = [];
    this.runningJobs = new Map();
    this.maxParallelJobs = getJobConfig().MAX_PARALLEL_JOBS;
    this.jobController = null;
    this.statusUpdateCallbacks = [];
    this.isProcessing = false;
    
    // Create a message modal for status updates
    this.messageModal = new MessageModal();
  }

  /**
   * Set the job controller instance
   * @param {JobController} controller The job controller instance
   */
  setJobController(controller) {
    this.jobController = controller;
  }

  /**
   * Add a new job to the queue
   * @param {object} jobPayload The job configuration payload
   * @param {string} docId The document ID
   * @param {string} groupId The group ID
   * @param {Array} itemIds The item IDs for this job
   * @param {Array} allItemIds All item IDs across all batches in this operation
   * @returns {Promise<object>} The queued job info
   */
  async addToQueue(jobPayload, docId, groupId, itemIds, allItemIds) {
    const jobInfo = {
      payload: jobPayload,
      docId,
      groupId,
      itemIds,
      allItemIds,
      status: 'QUEUED',
      queuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    };
    
    this.jobQueue.push(jobInfo);
    
    // Update status
    this._notifyStatusChange();
    
    // Start processing if not already processing
    if (!this.isProcessing) {
      this._processQueue();
    }
    
    return jobInfo;
  }

  /**
   * Process the job queue
   * @private
   */
  async _processQueue() {
    if (this.isProcessing || this.jobQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Keep processing while there are jobs in the queue and slots available
      while (this.jobQueue.length > 0 && this.runningJobs.size < this.maxParallelJobs) {
        // Get the next job from the queue
        const jobInfo = this.jobQueue.shift();
        
        // Show the job status modal if there are remaining queued jobs
        if (this.jobQueue.length > 0 || this.runningJobs.size > 0) {
          this._showStatusModal();
        }
        
        // Start the job
        jobInfo.status = 'STARTING';
        jobInfo.startedAt = Date.now();
        this._notifyStatusChange();
        
        try {
          // Ensure token is fresh before starting a job
          await tokenRefreshService.forceRefresh();
          
          // Start the job using the job controller
          const result = await this.jobController.startQuestionJob(
            jobInfo.payload, 
            jobInfo.docId, 
            jobInfo.groupId
          );
          
          // Add job to running jobs map
          const jobId = result.question_master_jid || result.question_jid;
          if (jobId) {
            jobInfo.jobId = jobId;
            jobInfo.status = 'RUNNING';
            jobInfo.result = result;
            this.runningJobs.set(jobId, jobInfo);
            
            // Register with token refresh service
            tokenRefreshService.registerJob(jobId);
            
            // Set up a completion listener for this job
            this._setupJobCompletionListener(jobId);
          } else {
            // No job ID returned, consider as failed
            jobInfo.status = 'FAILED';
            jobInfo.error = 'No job ID returned from server';
            jobInfo.completedAt = Date.now();
          }
        } catch (error) {
          console.error(`[JobQueueManager] Error starting job:`, error);
          jobInfo.status = 'FAILED';
          jobInfo.error = error.message;
          jobInfo.completedAt = Date.now();
        }
        
        // Update status
        this._notifyStatusChange();
      }
    } finally {
      this.isProcessing = false;
      
      // Check if we need to process more jobs (could happen if a job completed during processing)
      if (this.jobQueue.length > 0 && this.runningJobs.size < this.maxParallelJobs) {
        this._processQueue();
      }
    }
  }

  /**
   * Set up a listener for job completion
   * @param {string} jobId The job ID to listen for
   * @private
   */
  _setupJobCompletionListener(jobId) {
    // Create a listener function
    const checkJobStatus = async () => {
      if (!this.jobController) return;
      
      try {
        // Check if the job exists in the job controller
        const jobDetails = await this.jobController.getJobDetails(jobId);
        
        if (!jobDetails) {
          console.log(`[JobQueueManager] Job ${jobId} not found in job controller`);
          return;
        }
        
        const status = jobDetails.status;
        
        // Check if the job has completed or failed
        if (status === 'COMPLETED' || status === 'FAILED' || status === 'STOPPED' || status === 'CANCELLED') {
          // Job is complete, remove from running jobs
          const jobInfo = this.runningJobs.get(jobId);
          if (jobInfo) {
            jobInfo.status = status;
            jobInfo.completedAt = Date.now();
            
            // Unregister from token refresh service
            tokenRefreshService.unregisterJob(jobId);
            
            // Remove from running jobs
            this.runningJobs.delete(jobId);
            
            // Process next job if available
            if (this.jobQueue.length > 0) {
              this._processQueue();
            } else if (this.runningJobs.size === 0) {
              // No more jobs, hide status modal
              this._hideStatusModal();
            } else {
              // Update the status modal
              this._showStatusModal();
            }
            
            // Notify status change
            this._notifyStatusChange();
          }
        }
      } catch (error) {
        console.error(`[JobQueueManager] Error checking job status for ${jobId}:`, error);
      }
    };
    
    // Initial check
    checkJobStatus();
    
    // Set up an interval to check periodically
    const intervalId = setInterval(checkJobStatus, 5000);
    
    // Clean up interval if job is removed
    const cleanup = () => {
      clearInterval(intervalId);
    };
    
    // Store the cleanup function with the job info
    const jobInfo = this.runningJobs.get(jobId);
    if (jobInfo) {
      jobInfo.cleanup = cleanup;
    }
  }

  /**
   * Register a callback for status updates
   * @param {function} callback The callback function
   */
  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.statusUpdateCallbacks.push(callback);
    }
  }

  /**
   * Notify all registered callbacks of status change
   * @private
   */
  _notifyStatusChange() {
    const status = this.getStatus();
    this.statusUpdateCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in status update callback:', error);
      }
    });
  }

  /**
   * Get the current status of the job queue
   * @returns {object} The job queue status
   */
  getStatus() {
    return {
      queuedJobs: this.jobQueue.length,
      runningJobs: this.runningJobs.size,
      totalJobs: this.jobQueue.length + this.runningJobs.size,
      maxParallelJobs: this.maxParallelJobs,
      isProcessing: this.isProcessing,
      queuedJobDetails: this.jobQueue.map(job => ({
        docId: job.docId,
        groupId: job.groupId,
        itemCount: job.itemIds?.length || 0,
        status: job.status,
        queuedAt: job.queuedAt
      })),
      runningJobDetails: Array.from(this.runningJobs.values()).map(job => ({
        jobId: job.jobId,
        docId: job.docId,
        groupId: job.groupId,
        itemCount: job.itemIds?.length || 0,
        status: job.status,
        startedAt: job.startedAt
      }))
    };
  }

  /**
   * Show a modal with job status information
   * @private
   */
  _showStatusModal() {
    const status = this.getStatus();
    
    let message = `<div style="text-align: left;">
      <h3>AI Question Answering Status</h3>
      <p><strong>${status.runningJobs}</strong> job(s) currently running.<br>
      <strong>${status.queuedJobs}</strong> job(s) waiting in queue.</p>`;
      
    if (status.runningJobs > 0) {
      message += `<p><strong>Running jobs:</strong></p><ul>`;
      status.runningJobDetails.forEach(job => {
        const runtime = job.startedAt ? Math.floor((Date.now() - job.startedAt) / 1000 / 60) : 0;
        message += `<li>Job ${job.jobId.slice(-6)}: ${job.itemCount} questions (running for ${runtime} min)</li>`;
      });
      message += `</ul>`;
    }
    
    if (status.queuedJobs > 0) {
      message += `<p><strong>Queued jobs:</strong></p><ul>`;
      status.queuedJobDetails.forEach((job, index) => {
        message += `<li>Job #${index + 1}: ${job.itemCount} questions</li>`;
      });
      message += `</ul>`;
    }
    
    message += `<p><strong>Important:</strong> Please keep this browser tab open until all jobs are completed. Jobs will continue running in the background.</p>
    </div>`;
    
    this.messageModal.show({
      title: "Job Status",
      message: message,
      buttonText: "Close",
      allowClose: true,
      modalId: "job-queue-status-modal"
    });
  }

  /**
   * Hide the status modal
   * @private
   */
  _hideStatusModal() {
    // Close the message modal if it's open
    if (this.messageModal && typeof this.messageModal.hide === 'function') {
      this.messageModal.hide();
    }
  }

  /**
   * Cancel all queued and running jobs
   */
  async cancelAllJobs() {
    // Clear the queue
    this.jobQueue = [];
    
    // Cancel running jobs
    for (const [jobId, jobInfo] of this.runningJobs.entries()) {
      try {
        if (jobInfo.cleanup) {
          jobInfo.cleanup();
        }
        
        // Unregister from token refresh service
        tokenRefreshService.unregisterJob(jobId);
        
        // Cancel the job using job controller
        if (this.jobController && typeof this.jobController.cancelJob === 'function') {
          await this.jobController.cancelJob(jobId);
        }
      } catch (error) {
        console.error(`[JobQueueManager] Error cancelling job ${jobId}:`, error);
      }
    }
    
    // Clear running jobs
    this.runningJobs.clear();
    
    // Hide status modal
    this._hideStatusModal();
    
    // Notify status change
    this._notifyStatusChange();
  }

  /**
   * Reset the job queue manager
   */
  reset() {
    this.cancelAllJobs();
    this.jobQueue = [];
    this.runningJobs.clear();
    this.isProcessing = false;
    this._notifyStatusChange();
  }
}

// Create a singleton instance
const jobQueueManager = new JobQueueManager();

export default jobQueueManager;