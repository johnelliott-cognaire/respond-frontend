// File: modules/job-controller.js
//
// BASE JOB CONTROLLER - Foundation for basic job tracking and polling
//
// Role:
// - Handles all job types: analysis-lm, question-answering, question-answering-master
// - Basic polling with fixed intervals per job type
// - Simple status updates and notifications
// - Legacy job restoration and cleanup
// - Document status integration (tab coloring, stage status)
//
// Relationship to AdaptiveJobController:
// - AdaptiveJobController EXTENDS this class (inheritance)
// - Used directly for analysis-lm jobs (no enhanced features needed)
// - Used as fallback for unsupported job types
// - Provides core polling infrastructure that AdaptiveJobController builds upon
//
// Main differences:
// - JobController: Fixed polling intervals, basic features
// - AdaptiveJobController: Dynamic intervals, realtime API, synthetic progress, enhanced features

import { startQuestionJob, getQuestionsJobStatus } from "../api/questions-jobs.js";
import { cancelJob, fetchJobs } from "../api/jobs.js";
import { startProcess, getJobStatus as analysisLMGetStatus } from "../api/analysis-lm.js";
import { computeAggregateStatus, JOB_STATUS } from "../utils/job-status-utils.js";
import { NotificationController } from "./notification-controller.js";

/**
 * Poll configuration for different job types
 */
const pollConfig = {
  "question-answering-master": {
    rateMs: 10000,
    getStatusFn: async (jobId, meta) => {
      if (!localStorage.getItem("authToken")) {
        throw new Error("No auth token available");
      }
      const questionTs = meta?.questionTs;
      return await getQuestionsJobStatus(jobId, questionTs);
    }
  },
  "question-answering": { // Legacy support - may be deprecated
    rateMs: 5000,
    getStatusFn: async (jobId, meta) => {
      if (!localStorage.getItem("authToken")) {
        throw new Error("No auth token available");
      }
      const questionTs = meta?.questionTs;
      return await getQuestionsJobStatus(jobId, questionTs);
    }
  },
  "analysis-lm": {
    rateMs: 8000,
    getStatusFn: async (jobId, meta) => {
      if (!localStorage.getItem("authToken")) {
        throw new Error("No auth token available");
      }
      const createdDt = meta?.analysisLmCreatedDatetime;
      return await analysisLMGetStatus(jobId, createdDt);
    }
  }
};

export class JobController {
  constructor(store) {
    this.store = store;
    this.pollIntervals = {};  // jobId -> setInterval ref
    this.jobsMap = {};        // jobId -> job object
    this.notificationCtrl = new NotificationController(store);

    this.config = {
        maxJobAge: 12 * 60 * 60 * 1000, // 12 hours
        maxStoredJobs: 100, // Maximum jobs to keep in localStorage
        cleanupInterval: 30 * 60 * 1000, // Clean up every 30 minutes
        maxJobHistoryDays: 7 // Keep job history for 7 days
    };

    // Add batching for localStorage writes
    this.saveTimeout = null;
    this.saveDelay = 500; // 500ms debounce
    this.isDirty = false;

    // Start periodic cleanup
    this.startPeriodicCleanup();

    // On init, restore and clean up jobs
    this.restoreAndCleanupJobs();

    // On init, restore any unfinished jobs from localStorage
    this.restoreUnfinishedJobs();

    // Start polling for active jobs immediately if user is authenticated
    if (localStorage.getItem("authToken")) {
      setTimeout(() => this.refreshAllJobs(), 2000);
    }

    // Listen for logout events to stop all polling and cleanup jobs
    document.addEventListener("userLoggedOut", () => {
      this.handleUserLogout();
    });

    // Import token refresh service (use dynamic import to avoid circular dependencies)
    this.tokenRefreshService = null;
    this._loadTokenRefreshService();

    // Listen for login/logout events
    document.addEventListener("userLoggedIn", () => {
      // Restart polling and token refresh when user logs in
      setTimeout(() => this.refreshAllJobs(), 2000);
    });
  }

  /**
   * Enhanced job restoration with cleanup - now removes expired jobs entirely
   */
  restoreAndCleanupJobs() {
      if (!localStorage.getItem("authToken")) {
          return;
      }

      const stored = this.store.get("jobsMap") || {};
      const currentTime = Date.now();
      const maxAge = this.config.maxJobAge;
      const maxHistoryAge = this.config.maxJobHistoryDays * 24 * 60 * 60 * 1000;

      // Clean up jobs - completely remove expired ones
      const activeJobs = {};
      let removedCount = 0;
      let expiredCount = 0;

      Object.keys(stored).forEach(jobId => {
          const jobRec = stored[jobId];
          const jobStartTime = jobRec.startTime || currentTime;
          const jobAge = currentTime - jobStartTime;

          // Jobs older than max history age - delete completely
          if (jobAge > maxHistoryAge) {
              removedCount++;
              return;
          }

          // Jobs older than max age - remove entirely instead of keeping as expired
          if (jobAge > maxAge) {
              expiredCount++;
              return;
          }

          // Keep only recent jobs
          activeJobs[jobId] = jobRec;

          // Resume polling for truly active jobs
          if (['RUNNING', 'QUEUED'].includes(jobRec.status)) {
              const isMasterJob = jobId.startsWith('mstr-');
              const jobType = isMasterJob ? 'question-answering-master' : (jobRec.jobType || 'question-answering');
              this.startPollingJob(jobId, jobType, jobRec.meta);
          }
      });

      // Limit total stored jobs
      const jobEntries = Object.entries(activeJobs);
      if (jobEntries.length > this.config.maxStoredJobs) {
          // Keep only the most recent jobs
          const sortedJobs = jobEntries.sort((a, b) => {
              const timeA = a[1].startTime || 0;
              const timeB = b[1].startTime || 0;
              return timeB - timeA; // Newest first
          });

          const keptJobs = {};
          sortedJobs.slice(0, this.config.maxStoredJobs).forEach(([jobId, jobData]) => {
              keptJobs[jobId] = jobData;
          });

          this.jobsMap = keptJobs;
          removedCount += sortedJobs.length - this.config.maxStoredJobs;
      } else {
          this.jobsMap = activeJobs;
      }

      // Save cleaned jobs map immediately (cleanup is critical)
      this.saveJobsToStoreImmediate();

  }

  /**
   * Periodic cleanup to prevent localStorage bloat
   */
  startPeriodicCleanup() {
      // Clean up every 30 minutes
      setInterval(() => {
          if (localStorage.getItem("authToken")) {
              this.performMaintenanceCleanup();
          }
      }, this.config.cleanupInterval);
  }

  /**
   * Maintenance cleanup without full restoration - enhanced to remove expired jobs
   */
  performMaintenanceCleanup() {
      const currentTime = Date.now();
      const maxAge = this.config.maxJobAge;
      const maxHistoryAge = this.config.maxJobHistoryDays * 24 * 60 * 60 * 1000;
      let removedCount = 0;
      let expiredCount = 0;

      // Remove old and expired jobs
      Object.keys(this.jobsMap).forEach(jobId => {
          const jobRec = this.jobsMap[jobId];
          const jobAge = currentTime - (jobRec.startTime || currentTime);

          // Remove very old jobs (beyond history limit)
          if (jobAge > maxHistoryAge) {
              delete this.jobsMap[jobId];
              removedCount++;
              return;
          }

          // Remove expired jobs (beyond max age)
          if (jobAge > maxAge) {
              delete this.jobsMap[jobId];
              expiredCount++;
              return;
          }
      });

      const totalRemoved = removedCount + expiredCount;
      if (totalRemoved > 0) {
          this.saveJobsToStoreImmediate();
      }
  }

  /**
   * Enhanced job filtering and sorting
   */
  getJobsByStatus(statuses = null, limit = null) {
      let jobs = Object.values(this.jobsMap);

      // Filter by status if specified
      if (statuses && Array.isArray(statuses)) {
          jobs = jobs.filter(job => statuses.includes(job.status));
      }

      // Sort by start time (newest first)
      jobs.sort((a, b) => {
          const timeA = a.startTime || 0;
          const timeB = b.startTime || 0;
          return timeB - timeA;
      });

      // Limit results if specified
      if (limit && limit > 0) {
          jobs = jobs.slice(0, limit);
      }

      return jobs;
  }

  /**
   * Get active jobs for dropdown
   */
  getActiveJobs(limit = 10) {
      return this.getJobsByStatus(['RUNNING', 'QUEUED'], limit);
  }

  /**
   * Get recent completed jobs
   */
  getRecentCompletedJobs(limit = 5) {
      const recentJobs = this.getJobsByStatus(['COMPLETED', 'FAILED', 'CANCELLED'], limit);
      
      // Only return jobs from the last 24 hours
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      return recentJobs.filter(job => (job.startTime || 0) > oneDayAgo);
  }

  /**
   * Enhanced job statistics
   */
  getJobStats() {
      const jobs = Object.values(this.jobsMap);
      const stats = {
          total: jobs.length,
          running: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          queued: 0,
          totalQuestions: 0,
          avgCompletionTime: 0
      };

      let completionTimes = [];

      jobs.forEach(job => {
          stats[job.status.toLowerCase()] = (stats[job.status.toLowerCase()] || 0) + 1;
          
          if (job.totalQuestions) {
              stats.totalQuestions += job.totalQuestions;
          }

          if (job.status === 'COMPLETED' && job.startTime && job.endTime) {
              completionTimes.push(job.endTime - job.startTime);
          }
      });

      if (completionTimes.length > 0) {
          stats.avgCompletionTime = completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
      }

      return stats;
  }

  /**
   * Process updates for master jobs
   */
  async _processMasterJobStatus(jobRec, statusResp) {
    if (!jobRec || !statusResp) return;

    // Update progress regardless of status
    if (statusResp.progress !== undefined) {
      jobRec.progress = statusResp.progress;

      // If document is open, update UI with progress
      this._updateDocumentStatus(jobRec, jobRec.status);
    }

    // If status is COMPLETED, we need to process the results of all sub-jobs
    if (statusResp.status === 'COMPLETED') {
      try {
        // Get document items that need updating
        const docId = jobRec.docId;
        const groupId = jobRec.docItemId;

        // Refresh the grid data to show completed answers
        if (window.refreshGridData && docId && groupId) {
          await window.refreshGridData(docId, groupId);
        }

        // Show notification
        this.notificationCtrl.addNotification({
          type: 'job_complete',
          message: `Batch question answering completed for ${jobRec.meta.questionSubJobCount} batches.`,
          entityType: 'job',
          entityId: jobRec.jobId
        });
      } catch (err) {
        // Silently handle errors in master job completion
      }
    }
  }

  async _loadTokenRefreshService() {
    try {
      const { default: tokenRefreshService } = await import("../utils/token-refresh-service.js");
      this.tokenRefreshService = tokenRefreshService;
    } catch (err) {
      // Token refresh service not available
    }
  }

  /**
   * Stop all polling intervals
   */
  stopAllPolling() {
    Object.keys(this.pollIntervals).forEach(jobId => {
      clearInterval(this.pollIntervals[jobId]);
      delete this.pollIntervals[jobId];
    });
  }

  /**
   * Handle user logout - stop polling and cleanup expired jobs
   */
  handleUserLogout() {
    // Stop all active polling
    this.stopAllPolling();
    
    // Clean up expired and old jobs
    this.performLogoutCleanup();
    
    // Unregister all jobs from token refresh service
    if (this.tokenRefreshService) {
      Object.keys(this.jobsMap).forEach(jobId => {
        this.tokenRefreshService.unregisterJob(jobId);
      });
    }
  }

  /**
   * Perform aggressive cleanup on logout to prevent job pollution in guest sessions
   */
  performLogoutCleanup() {
    const currentTime = Date.now();
    const expiredJobs = [];
    const keptJobs = {};
    let removedCount = 0;
    
    // Only keep very recent jobs (last 30 minutes) and only if they're completed
    const recentThreshold = 30 * 60 * 1000; // 30 minutes
    
    Object.keys(this.jobsMap).forEach(jobId => {
      const jobRec = this.jobsMap[jobId];
      const jobAge = currentTime - (jobRec.startTime || currentTime);
      
      // Remove running/queued jobs immediately on logout (they can't continue without auth)
      if (['RUNNING', 'QUEUED'].includes(jobRec.status)) {
        removedCount++;
        return;
      }
      
      // Remove jobs older than 30 minutes
      if (jobAge > recentThreshold) {
        removedCount++;
        return;
      }
      
      // Keep only recent completed/failed jobs
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(jobRec.status)) {
        keptJobs[jobId] = jobRec;
      } else {
        removedCount++;
      }
    });
    
    this.jobsMap = keptJobs;
    
    // Save cleaned jobs immediately
    this.saveJobsToStoreImmediate();
    
  }

  /**
   * Router function to direct to appropriate job starter or register existing job
   * @param {object} payload - Job payload
   * @param {string} docId - Associated document ID
   * @param {string} docItemId - Associated document item ID
   * @param {boolean} isExistingJob - Whether the job already exists and just needs tracking
   * @returns {Promise<object>} - Job result
   */
  async startJob(payload, docId = null, docItemId = null, isExistingJob = false) {
    // Check authentication
    if (!localStorage.getItem("authToken")) {
      throw new Error("Not authenticated");
    }


    // Determine job type
    const isAnalysisLM = payload.request_type &&
      (payload.request_type.includes("analysis-lm") ||
        payload.process_def_id ||
        payload.analysis_lm_jid);

    let result;
    const jobType = isAnalysisLM ? "analysis-lm" : "question-answering";

    if (isExistingJob) {
      // Just register an existing job for tracking
      result = payload;
    } else {
      // Start a new job via appropriate API
      if (isAnalysisLM) {
        result = await startProcess(payload);
      } else {
        result = await startQuestionJob(payload);
      }
    }

    // Extract relevant job ID based on job type
    const jobId = isAnalysisLM ? result.analysis_lm_jid : (result.question_master_jid || result.question_jid);
    if (!jobId) {
      throw new Error(`Failed to get job ID from ${isAnalysisLM ? 'AnalysisLM' : 'Question'} job result`);
    }

    // Register job with token refresh service
    if (this.tokenRefreshService) {
      this.tokenRefreshService.registerJob(jobId);
    }

    // Extract username if provided, default to "Unknown"
    const jobUsername = result.username || "Unknown";

    // Set up metadata for polling based on job type
    const meta = isAnalysisLM ? {
      analysisLmCreatedDatetime: result.analysis_lm_created_datetime || null,
    } : {
      questionTs: result.question_ts || null,
    };

    // Register job in tracking map, including username
    const newJob = {
      jobId,
      jobType,
      status: JOB_STATUS.RUNNING,
      progress: 0,
      docId,
      docItemId,
      meta,
      startTime: Date.now(), // Track when job was started for 12-hour timeout
      username: jobUsername,
      description: result.description || '',  // Include description from server response (Phase 3)
      progress_config: result.progress_config || null  // Include centralized progress config (Phase 3)
    };

    // Remove any circular references to avoid serialization issues
    const jobWithoutCircular = { ...newJob };
    delete jobWithoutCircular.docTaskInstance;
    delete jobWithoutCircular.__parent;

    this.jobsMap[jobId] = jobWithoutCircular;
    this.saveJobsToStore();

    // Start polling for status updates
    this.startPollingJob(jobId, jobType, meta);

    return result;
  }

  /**
   * Start an AnalysisLM job
   * @param {object} payload - Job configuration
   * @param {string} docId - Associated document ID
   * @param {string} docItemId - Associated document item ID 
   * @returns {Promise<object>} - Job result
   */
  async startAnalysisLMJob(payload, docId = null, docItemId = null) {
    // Ensure payload has analysis-lm identifier
    const enhancedPayload = {
      ...payload,
      request_type: payload.request_type || "analysis-lm"
    };

    return this.startJob(enhancedPayload, docId, docItemId);
  }

  /**
   * Start a Question-Answering job with the new payload structure
   * @param {object} payload - Job configuration with questions_by_content structure
   * @param {string} docId - Associated document ID
   * @param {string} docItemId - Associated document item ID
   * @returns {Promise<object>} - Job result 
   */
async startQuestionJob(payload, docId = null, docItemId = null) {
    // Check authentication
    if (!localStorage.getItem("authToken")) {
        throw new Error("Not authenticated");
    }


    // Validate the new payload structure
    if (!payload.questions_by_content || typeof payload.questions_by_content !== 'object') {
        throw new Error("Invalid payload: questions_by_content is required and must be an object");
    }

    const contentGroups = Object.keys(payload.questions_by_content);
    if (contentGroups.length === 0) {
        throw new Error("Invalid payload: questions_by_content cannot be empty");
    }

    // Count total questions across all content groups
    let totalQuestions = 0;
    for (const contentKey of contentGroups) {
        const questions = payload.questions_by_content[contentKey];
        if (!Array.isArray(questions)) {
            throw new Error(`Invalid payload: questions for content key "${contentKey}" must be an array`);
        }
        totalQuestions += questions.length;
    }


    // Import the API function dynamically to avoid circular dependencies
    const { startQuestionJob } = await import("../api/questions-jobs.js");

    try {
        // Call the API endpoint
        const result = await startQuestionJob(payload);


        // Validate required response fields from backend
        if (!result) {
            throw new Error("No response received from question job API");
        }

        if (!result.question_master_jid) {
            throw new Error("Missing question_master_jid in API response");
        }

        if (!result.question_ts) {
            throw new Error("Missing question_ts in API response");
        }

        if (result.question_sub_job_count === undefined) {
            throw new Error("Missing question_sub_job_count in API response");
        }


        // Check if we got an immediate completion (shouldn't happen for batch jobs, but just in case)
        if (result.status === "COMPLETED") {
            return result;
        }

        const jobId = result.question_master_jid;

        // Register job with token refresh service
        if (this.tokenRefreshService) {
            this.tokenRefreshService.registerJob(jobId);
        }

        // Determine job type - batch jobs always use master job tracking
        const jobType = 'question-answering-master';

        // Set up metadata using only data from the API response
        const meta = {
            questionTs: result.question_ts, // Use question_ts from API response
            questionSubJobCount: result.question_sub_job_count,
            questionSubJobsCompleted: 0,
            // Store additional metadata for tracking
            primary_cqa_service: payload.primary_cqa_service,
            content_groups_count: contentGroups.length,
            original_message: result.message,
            // Phase 2: Add stage metadata for job completion integration
            stageId: payload.stageId,
            groupId: payload.groupId,
            // Enhanced job display metadata
            processName: payload.processName || "Unknown Process",
            topicName: payload.topicName || "Unknown Topic",
            questionCount: payload.questionCount || totalQuestions
        };

        // Register job in tracking map
        const newJob = {
            jobId,
            jobType,
            status: result.status, // Should be 'QUEUED' for batch jobs
            progress: 0, // Start at 0%
            docId,
            docItemId,
            meta,
            startTime: Date.now(),
            // Note: username will be available from backend logs/tracking, no need to store client-side
            totalQuestions: totalQuestions,
            contentGroups: contentGroups.length,
            model: payload.primary_cqa_service,
            // Enhanced job display information
            processName: payload.processName || "Unknown Process",
            topicName: payload.topicName || "Unknown Topic",
            questionCount: payload.questionCount || totalQuestions,
            description: result.description || payload.description || `${payload.processName || "Unknown Process"} - ${payload.topicName || "Unknown Topic"} (${payload.questionCount || totalQuestions} questions)`,
            progress_config: result.progress_config || null,  // Include centralized progress config (Phase 3)
            payload: {
                primary_cqa_service: payload.primary_cqa_service,
                fallback_cqa_service: payload.fallback_cqa_service,
                content_groups: Object.keys(payload.questions_by_content).length
            },
            // Store response details for debugging
            apiResponse: {
                message: result.message,
                question_master_jid: result.question_master_jid,
                question_ts: result.question_ts,
                question_sub_job_count: result.question_sub_job_count,
                status: result.status
            }
        };

        // Store job (no circular references to worry about)
        this.jobsMap[jobId] = newJob;
        this.saveJobsToStore();

        // Start polling for status updates
        this.startPollingJob(jobId, jobType, meta);

        this.checkAndCleanupIfNeeded();


        return result;

    } catch (err) {
        throw err;
    }
}

    /**
     * Check if cleanup is needed when adding new jobs
     */
    checkAndCleanupIfNeeded() {
        const jobCount = Object.keys(this.jobsMap).length;
        
        if (jobCount > this.config.maxStoredJobs * 1.2) { // 20% over limit
            this.performMaintenanceCleanup();
        }
    }

  /**
   * Enhanced method to register a master job for tracking with better validation
   */
  registerMasterJob(jobInfo) {
    const { question_jid, question_ts, docId, docItemId, question_sub_job_count } = jobInfo;

    if (!question_jid) {
      throw new Error("Cannot register master job: question_jid is required");
    }

    // Create a master job record
    const masterJob = {
      jobId: question_jid,
      jobType: 'question-answering-master',
      status: jobInfo.status || 'RUNNING',
      progress: jobInfo.progress || 0,
      docId,
      docItemId,
      meta: {
        questionTs: question_ts,
        questionSubJobCount: question_sub_job_count || 1,
        questionSubJobsCompleted: 0
      },
      startTime: Date.now(),
      username: jobInfo.username || "Unknown"
    };

    // Store in jobs map
    this.jobsMap[question_jid] = masterJob;
    this.saveJobsToStore();

    // Start polling for status updates
    this.startPollingJob(question_jid, 'question-answering-master', masterJob.meta);


    return masterJob;
  }

  /**
   * Process completed question answering job results
   * @param {object} jobRec - The job record
   * @param {object} statusResp - The job status response
   * @private
   */
  async _processCompletedQuestionJob(jobRec, statusResp) {
    if (!jobRec || !statusResp) {
      return;
    }

    try {
      const docId = jobRec.docId;
      const stageId = jobRec.meta?.stageId || jobRec.jobStageId;
      const groupId = jobRec.meta?.groupId || jobRec.jobGroupId;

      if (!docId || !groupId) {
        return;
      }

      // If we have detailed results, try to update items directly
      if (statusResp.results && typeof window.updateDocumentItemsFromJobResults === 'function') {
        const updateResult = await window.updateDocumentItemsFromJobResults(
          docId,
          stageId,
          groupId,
          statusResp
        );

        jobRec.updatedItemCount = updateResult.updatedCount;
        this._upsertJobInfo(jobRec, jobRec.docId);
      }

      // Always trigger grid refresh to show latest data from database
      if (typeof window.refreshDocumentItemsGrid === 'function' &&
          window.refreshDocumentItemsGrid instanceof Function) {
        window.refreshDocumentItemsGrid(docId, groupId);
      }

      // Also trigger question completion event for any grid listeners
      const completionEvent = new CustomEvent('questionCompletion', {
        detail: {
          jobId: jobRec.jobId,
          docId: docId,
          groupId: groupId,
          stageId: stageId,
          completedAt: Date.now()
        }
      });
      document.dispatchEvent(completionEvent);

    } catch (err) {
      // Silently handle errors in question job completion
    }
  }

  /**
   * Register an existing job (already started elsewhere) for tracking
   * @param {object} jobDetails - Job details including ID and metadata
   * @param {string} docId - Associated document ID
   * @param {string} docItemId - Associated document item ID
   * @returns {object} - The registered job details
   */
  async registerExistingJob(jobDetails, docId = null, docItemId = null) {

    // Determine job type
    const isAnalysisLM = jobDetails.request_type &&
      (jobDetails.request_type.includes("analysis-lm") ||
        jobDetails.process_def_id ||
        jobDetails.analysis_lm_jid);

    const jobType = isAnalysisLM ? "analysis-lm" : "question-answering";
    const jobId = isAnalysisLM ? jobDetails.analysis_lm_jid : (jobDetails.question_master_jid || jobDetails.question_jid);
    const jobStageId = jobDetails.stageId || jobDetails.stage_id ||
      jobDetails.meta?.stageId || jobDetails.metadata?.stageId;

    if (!jobId) {
      throw new Error("Missing job ID. Cannot register job for tracking.");
    }

    // Extract username from jobDetails, default to "Unknown"
    const jobUsername = jobDetails.username || "Unknown";

    // Set up metadata for polling based on job type
    const meta = isAnalysisLM ? {
      analysisLmCreatedDatetime: jobDetails.analysis_lm_created_datetime || null,
      process_def_id: jobDetails.process_def_id || null,
      stageId: jobStageId // Always store stageId in meta if available
    } : {
      questionTs: jobDetails.question_ts || null,
      stageId: jobStageId // Always store stageId in meta if available
    };

    // Check if it's a master job
    const isMasterJob = jobId.startsWith('mstr-');
    const effectiveJobType = isMasterJob ? 'question-answering-master' : jobType;

    // Register job in tracking map, including username and stageId
    const newJob = {
      jobId,
      jobType: effectiveJobType,
      jobStageId, // Store it directly on the job as well
      status: jobDetails.status || JOB_STATUS.RUNNING,
      progress: jobDetails.progress || 0,
      docId,
      docItemId,
      meta,
      startTime: Date.now(), // Track when job was started for 12-hour timeout
      username: jobUsername
    };

    // Remove any circular references to avoid serialization issues
    const jobWithoutCircular = { ...newJob };
    delete jobWithoutCircular.docTaskInstance;
    delete jobWithoutCircular.__parent;

    this._upsertJobInfo(jobWithoutCircular, docId);

    // Start polling for status updates
    this.startPollingJob(jobId, effectiveJobType, meta);

    return newJob;
  }

  /**
   * Set up polling for job status updates
   */
  startPollingJob(jobId, jobType, meta) {
    // Skip polling if not authenticated
    if (!localStorage.getItem("authToken")) {
      return;
    }


    // If already polling, clear it
    if (this.pollIntervals[jobId]) {
      clearInterval(this.pollIntervals[jobId]);
      delete this.pollIntervals[jobId];
    }

    // Check if it's a master job by ID prefix
    const effectiveJobType = jobId.startsWith('mstr-') ? 'question-answering-master' : jobType;

    const config = pollConfig[effectiveJobType] || {
      rateMs: 14000,
      getStatusFn: pollConfig["question-answering"].getStatusFn // fallback
    };

    const pollFn = async () => {
      // Skip polling if no longer authenticated
      if (!localStorage.getItem("authToken")) {
        clearInterval(this.pollIntervals[jobId]);
        delete this.pollIntervals[jobId];
        return;
      }

      try {
        const jobRec = this.jobsMap[jobId];
        if (!jobRec) {
          clearInterval(this.pollIntervals[jobId]);
          delete this.pollIntervals[jobId];
          return;
        }

        // Check if job has been running for more than 12 hours
        const currentTime = Date.now();
        const jobStartTime = jobRec.startTime || currentTime;
        const twelveHoursMs = 12 * 60 * 60 * 1000;

        if (currentTime - jobStartTime > twelveHoursMs) {
          clearInterval(this.pollIntervals[jobId]);
          delete this.pollIntervals[jobId];

          // Update job status to indicate timeout
          jobRec.status = JOB_STATUS.FAILED;
          jobRec.error = "Job exceeded maximum execution time of 12 hours";
          this.jobsMap[jobId] = jobRec;
          this.saveJobsToStore();

          // Update document status for UI
          this._updateDocumentStatus(jobRec, JOB_STATUS.FAILED);
          return;
        }

        const statusResp = await config.getStatusFn(jobId, meta);
        // unify the returned status to our standard set
        let newStatus = (statusResp.status || "").toUpperCase();
        if (newStatus === "STARTED") {
          // Some endpoints use "STARTED" to mean it's effectively running
          newStatus = JOB_STATUS.RUNNING;
        } else if (!Object.values(JOB_STATUS).includes(newStatus)) {
          // Map unknown statuses to something
          if (newStatus.includes("ERROR")) {
            newStatus = JOB_STATUS.FAILED;
          } else {
            newStatus = JOB_STATUS.RUNNING;
          }
        }

        const oldStatus = jobRec.status;
        jobRec.status = newStatus;
        jobRec.progress = statusResp.progress || 0;

        // Store steps info if available (for UI display)
        if (statusResp.analysis_lm_steps_completed !== undefined) {
          jobRec.steps_completed = statusResp.analysis_lm_steps_completed;
        }
        if (statusResp.analysis_lm_steps_total !== undefined) {
          jobRec.steps_total = statusResp.analysis_lm_steps_total;
        }

        // For master jobs, store sub-job completion info
        if (jobRec.jobType === 'question-answering-master') {
          if (statusResp.question_batches_completed !== undefined) {
            jobRec.meta.questionSubJobsCompleted = statusResp.question_batches_completed;
          }
          if (statusResp.question_batch_count !== undefined && !jobRec.meta.questionSubJobCount) {
            jobRec.meta.questionSubJobCount = statusResp.question_batch_count;
          }

          // Process master job specific logic
          await this._processMasterJobStatus(jobRec, statusResp);
        }

        // Always update document status for UI color consistency
        this._updateDocumentStatus(jobRec, newStatus);

        // Check for transitions to a terminal status
        if (oldStatus === JOB_STATUS.RUNNING && [
          JOB_STATUS.COMPLETED,
          JOB_STATUS.FAILED,
          JOB_STATUS.STOPPED,
          JOB_STATUS.CANCELLED
        ].includes(newStatus)) {

          jobRec.endTime = Date.now();

          // Unregister job from token refresh service when job completes
          if (this.tokenRefreshService) {
            this.tokenRefreshService.unregisterJob(jobId);
          }

          // Fire off a notification
          let msg = `Job ${jobId} has ${newStatus.toLowerCase()}`;
          if (newStatus === JOB_STATUS.FAILED) {
            msg = `Job ${jobId} failed - see logs for details.`;
          }
          this.notificationCtrl.addNotification({
            type: 'job_change',
            message: msg,
            entityType: 'job',
            entityId: jobId,
            metadata: {
              finalStatus: newStatus,
              docId: jobRec.docId
            }
          });

          // Store results if available
          if (newStatus === JOB_STATUS.COMPLETED && statusResp.results) {
            jobRec.results = statusResp.results;
          }
        }

        // If terminal, stop polling
        if ([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.STOPPED, JOB_STATUS.CANCELLED].includes(newStatus)) {

          // For completed question-answering jobs, process results
          if (newStatus === JOB_STATUS.COMPLETED && (jobRec.jobType === 'question-answering' || jobRec.jobType === 'question-answering-master')) {
            await this._processCompletedQuestionJob(jobRec, statusResp);
          }

          clearInterval(this.pollIntervals[jobId]);
          delete this.pollIntervals[jobId];
        }

        // Persist
        this._upsertJobInfo(jobRec, jobRec.docId);

      } catch (err) {
        // If there's an authentication error, stop polling
        if (err.message && (err.message.includes("auth") || err.message.includes("token"))) {
          clearInterval(this.pollIntervals[jobId]);
          delete this.pollIntervals[jobId];
        }
      }
    };

    pollFn(); // do initial check
    this.pollIntervals[jobId] = setInterval(pollFn, config.rateMs);
  }

  /**
   * Upserts a job info object into the jobsMap and persists to store.
   * Also triggers UI updates for the document if document ID is provided.
   * 
   * @param {Object} jobInfo - The job info object to upsert
   * @param {string} [docId] - Optional document ID associated with the job
   * @private
   */
  _upsertJobInfo(jobInfo, docId = null) {
    // Make sure we have a jobId
    if (!jobInfo.jobId) {
      return;
    }

    // Ensure required properties to prevent crashes
    if (!jobInfo.status) jobInfo.status = "UNKNOWN";
    if (!jobInfo.progress && jobInfo.progress !== 0) jobInfo.progress = 0;

    // Default to current timestamp if not provided
    if (!jobInfo.start_datetime) {
      jobInfo.start_datetime = new Date().toISOString();
    }

    // Ensure we have a meta object
    if (!jobInfo.meta) {
      jobInfo.meta = {
        created_datetime: jobInfo.start_datetime
      };
    }

    // Update or add the job info to the jobsMap
    this.jobsMap[jobInfo.jobId] = jobInfo;

    // Update the document associated with this job (if provided and status has changed)
    if (docId) {
      jobInfo.docId = docId; // Ensure docId is set on job
      this._updateDocumentStatus(jobInfo, jobInfo.status);
    }

    // Save changes to store (batched for performance)
    this.saveJobsToStore();
  }
  
  /**
   * Batch update multiple job statuses (for initial page load optimization)
   */
  batchUpdateJobStatuses(jobUpdates) {
    let updateCount = 0;
    jobUpdates.forEach(({ jobId, status, ...otherUpdates }) => {
      if (this.jobsMap[jobId]) {
        this.jobsMap[jobId].status = status;
        Object.assign(this.jobsMap[jobId], otherUpdates);
        updateCount++;
      }
    });
    
    // Single save at the end
    this.saveJobsToStoreImmediate();
  }

  /**
   * Updates ONLY the stage status based on job status with direct element targeting
   * Does NOT modify document status
   * @param {string|object} docIdOrJob - The document ID or job object
   * @param {string} jobStatus - The job status to apply
   * @private
   */
  _updateDocumentStatus(docIdOrJob, jobStatus) {
    // Extract docId if a job object was passed
    const docId = typeof docIdOrJob === 'object' ? docIdOrJob.docId : docIdOrJob;
    const job = typeof docIdOrJob === 'object' ? docIdOrJob : this.jobsMap[docIdOrJob];

    // First check if this document is currently open in a tab
    if (window.tabManager) {
      // Find the tab with this doc
      const matchingTab = window.tabManager.tabs.find(tab => {
        if (!tab.newFrameworkDoc || !tab.newFrameworkDoc.docTaskInstance) return false;

        // Check both documentId and compositeId
        const tabDocId = tab.newFrameworkDoc.docTaskInstance.documentId;
        const tabCompositeId = tab.newFrameworkDoc.docTaskInstance.compositeId;

        return (tabDocId === docId || tabCompositeId === docId);
      });

      if (matchingTab && matchingTab.newFrameworkDoc) {

        // Get the job's process definition ID to identify which stage it belongs to
        const processDefId = job?.meta?.process_def_id || null;

        // Find which stage this job belongs to using process definition ID
        let jobStageIndex = -1;
        let jobStageId = null;

        // STRATEGY 1: Check if job explicitly specifies its stage - MOST RELIABLE
        // First check if the job metadata already has a stageId
        if (job?.meta?.stageId) {
          jobStageId = job.meta.stageId;
        }
        // If job has stageId directly on the job object (not in meta)
        else if (job?.jobStageId) {
          jobStageId = job.jobStageId;
        }

        // If we found a stageId, look up its index
        if (jobStageId && matchingTab.newFrameworkDoc.docTaskInstance.stages) {
          jobStageIndex = matchingTab.newFrameworkDoc.docTaskInstance.stages.findIndex(s =>
            s.stageId === jobStageId
          );
        }

        // STRATEGY 2: Use process definition and form module association - SECOND MOST RELIABLE
        if (jobStageIndex === -1 && processDefId && matchingTab.newFrameworkDoc.docTaskInstance.stages) {
          // Look through stages to find one with a matching formModule
          matchingTab.newFrameworkDoc.docTaskInstance.stages.forEach((stage, index) => {
            if (stage.formModule && stage.formModule.includes(processDefId)) {
              jobStageIndex = index;
              jobStageId = stage.stageId;
            }
          });
        }

        // STRATEGY 3: Look at job history to find where this job was previously recorded - THIRD MOST RELIABLE
        if (jobStageIndex === -1 && job?.jobId && matchingTab.newFrameworkDoc.docTaskInstance.stageData) {
          const jobId = job.jobId;
          // Search through all stages' job history to find this job
          Object.entries(matchingTab.newFrameworkDoc.docTaskInstance.stageData).forEach(([stageId, data]) => {
            if (data.jobHistory) {
              // Check if this job is in this stage's history
              const jobKey = `root_${jobId}`;
              if (data.jobHistory[jobKey]) {
                jobStageId = stageId;

                // Now find the index
                if (matchingTab.newFrameworkDoc.docTaskInstance.stages) {
                  jobStageIndex = matchingTab.newFrameworkDoc.docTaskInstance.stages.findIndex(s =>
                    s.stageId === stageId
                  );
                }
              }
            }
          });
        }

        // Only proceed if we have a definitive match
        if (jobStageId === null || jobStageIndex === -1) {
          // Only update the tab indicator if we need to, but don't modify any stage data
          if (window.tabManager && typeof window.tabManager.updateDocStatus === 'function') {
            window.tabManager.updateDocStatus(matchingTab.newFrameworkDoc, jobStatus);
          }

          // Exit early - DO NOT update any stage if we can't determine which one
          return;
        }

        // Only update status for the matching stage if we found one
        if (jobStageId && jobStageIndex >= 0 && matchingTab.newFrameworkDoc.docTaskInstance.stages) {
          const stage = matchingTab.newFrameworkDoc.docTaskInstance.stages[jobStageIndex];

          if (stage) {
            // Update job in stage jobHistory if it exists
            if (matchingTab.newFrameworkDoc.docTaskInstance.stageData &&
              matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId]) {

              // Make sure jobHistory exists
              if (!matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId].jobHistory) {
                matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId].jobHistory = {};
              }

              // Look for the job in jobHistory or add it
              const jobId = job?.jobId || (typeof docIdOrJob === 'string' ? docIdOrJob : null);
              if (jobId) {
                const jobKey = `root_${jobId}`;
                const timestamp = new Date().toISOString();

                // Update existing job info or create new entry
                if (matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId].jobHistory[jobKey]) {
                  // Update existing job
                  const jobInfo = matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId].jobHistory[jobKey];
                  jobInfo.status = jobStatus;
                  jobInfo.updated = timestamp;
                  jobInfo.progress = job?.progress || 100; // Default to 100 for completed/failed
                  jobInfo.stageId = jobStageId; // Ensure stageId is included
                } else {
                  // Create new job entry
                  matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId].jobHistory[jobKey] = {
                    jobId: jobId,
                    jobType: job?.jobType || "analysis-lm",
                    status: jobStatus,
                    progress: job?.progress || 0,
                    created: job?.meta?.analysisLmCreatedDatetime || job?.meta?.created_datetime || timestamp,
                    updated: timestamp,
                    process_def_id: processDefId || job?.meta?.process_def_id,
                    stageId: jobStageId, // Explicitly store stageId
                    metadata: {
                      created_datetime: job?.meta?.analysisLmCreatedDatetime || job?.meta?.created_datetime || timestamp,
                      stageId: jobStageId
                    }
                  };

                }
              }
            }

            // Update ONLY this stage's status based on job status
            if (jobStatus === 'COMPLETED') {
              stage.status = 'COMPLETED';
            }
            else if (jobStatus === 'RUNNING') {
              stage.status = 'RUNNING';
            }
            else if (jobStatus === 'FAILED') {
              stage.status = 'FAILED';
            }

            // Also update the stageData status for this specific stage
            if (matchingTab.newFrameworkDoc.docTaskInstance.stageData &&
              matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId]) {
              matchingTab.newFrameworkDoc.docTaskInstance.stageData[jobStageId].status = stage.status;
            }

            // Directly update the stage breadcrumb in the UI
            if (typeof matchingTab.newFrameworkDoc.updateStageBreadcrumbStatus === 'function') {
              try {
                // IMPORTANT: Only update UI for this specific stage
                matchingTab.newFrameworkDoc.updateStageBreadcrumbStatus(jobStageId, stage.status);
              } catch (err) {
                // Silently handle breadcrumb update errors
              }
            }

            // Refresh document UI indicators if needed - IMPORTANT: We need to do this
            // after updating the stage to ensure the UI reflects the correct status
            if (matchingTab.newFrameworkDoc.docTaskInstance &&
              matchingTab.newFrameworkDoc.docTaskInstance.__parent &&
              typeof matchingTab.newFrameworkDoc.docTaskInstance.__parent.refreshDocUIIndicatorsAggregateStatus === 'function') {
              matchingTab.newFrameworkDoc.docTaskInstance.__parent.refreshDocUIIndicatorsAggregateStatus();
            }
            // If document has a refreshDocUIIndicatorsAggregateStatus method, call it
            else if (
              (typeof window.MultiStageDocumentWithBreadcrumbOrchestrator === 'function' &&
              matchingTab.newFrameworkDoc instanceof window.MultiStageDocumentWithBreadcrumbOrchestrator) ||
              typeof matchingTab.newFrameworkDoc.refreshDocUIIndicatorsAggregateStatus === 'function'
            ) {
              matchingTab.newFrameworkDoc.refreshDocUIIndicatorsAggregateStatus();
            }
            // Otherwise, use tabManager to update tab color based on job status
            else if (window.tabManager && typeof window.tabManager.updateDocStatus === 'function') {
              window.tabManager.updateDocStatus(matchingTab.newFrameworkDoc, jobStatus);
            }
          }
        }

        // Persist changes to tab storage
        window.tabManager.persistTabs();
      }
    }
  }

  async cancelJob(jobId) {
    // Check authentication before making the request
    if (!localStorage.getItem("authToken")) {
      throw new Error("Not authenticated");
    }

    const jobRec = this.jobsMap[jobId];
    if (!jobRec) {
      return;
    }
    
    // Use appropriate tenant shard based on job type
    const tenantShard = jobRec.jobType === 'analysis-lm' ? 
      jobRec.meta?.analysisLmTs : jobRec.meta?.questionTs;

    try {
      await cancelJob(jobId, tenantShard);
      // Mark it as CANCELLED
      jobRec.status = JOB_STATUS.CANCELLED;
      this._upsertJobInfo(jobRec, jobRec.docId);

      // Stop polling
      if (this.pollIntervals[jobId]) {
        clearInterval(this.pollIntervals[jobId]);
        delete this.pollIntervals[jobId];
      }

      // Possibly notify
      this.notificationCtrl.addNotification({
        type: 'job_change',
        message: `Job ${jobId} cancelled by user.`,
        entityType: 'job',
        entityId: jobId,
        metadata: {
          finalStatus: JOB_STATUS.CANCELLED
        }
      });
    } catch (err) {
      throw err;
    }
  }

  /**
   * getAllJobs => returns array of job objects from this.jobsMap
   */
  getAllJobs() {
    return Object.values(this.jobsMap);
  }

  /**
   * Gets details for a specific job
   * @param {string} jobId - Job ID to get details for
   * @returns {Promise<object>} - Job details
   */
  async getJobDetails(jobId) {
    // Check authentication before making the request
    if (!localStorage.getItem("authToken")) {
      throw new Error("Not authenticated");
    }

    // First check if we already have this job in our map
    if (this.jobsMap[jobId]) {
      return this.jobsMap[jobId];
    }

    try {
      // Fetch job details from server
      const jobs = await fetchJobs({ jobId });
      if (jobs && jobs.length > 0) {
        const job = jobs[0];

        // Check for analysis-lm job format vs standard format
        const isAnalysisLM = job.request_type && job.request_type.includes('analysis-lm') ||
          job.type === 'analysis-lm' ||
          job.analysis_lm_jid;

        // Check if it's a master job
        const isMasterJob = jobId.startsWith('mstr-');
        const jobType = isMasterJob ? 'question-answering-master' :
          (isAnalysisLM ? 'analysis-lm' : 'question-answering');

        // Format it to match our internal structure
        const formattedJob = {
          jobId: job.question_jid || job.analysis_lm_jid,
          jobType: jobType,
          status: job.status?.toUpperCase() || 'UNKNOWN',
          progress: job.progress || 0,
          docId: job.doc_id || job.documentId || null,
          docItemId: job.doc_item_id || null,
          type: job.type || job.request_type || jobType,
          start_datetime: job.start_datetime || job.analysis_lm_created_datetime || new Date().toISOString(),
          startTime: new Date(job.start_datetime || job.analysis_lm_created_datetime || Date.now()).getTime(),
          meta: isAnalysisLM ? {
            analysisLmCreatedDatetime: job.analysis_lm_created_datetime || job.start_datetime
          } : {
            questionTs: job.question_ts
          },
          // Preserve all other properties including username if provided
          ...job
        };

        // Update our map
        this.jobsMap[jobId] = formattedJob;
        this.saveJobsToStore();

        return formattedJob;
      }
      throw new Error(`Job ${jobId} not found`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Refresh all jobs from the server
   * This will update our internal jobsMap with the latest status
   * and start polling for any active jobs
   */
  async refreshAllJobs() {
    // Skip if not authenticated
    if (!localStorage.getItem("authToken")) {
      return [];
    }

    try {
      // Fetch recent jobs from server
      const recentJobs = await fetchJobs({ limit: 20 });

      // Process each job
      for (const job of recentJobs) {
        const jobId = job.question_jid || job.analysis_lm_jid;
        if (!jobId) {
          continue;
        }

        // Determine job type - check for master job first
        const isMasterJob = jobId.startsWith('mstr-');
        const jobType = isMasterJob ? 'question-answering-master' :
          (job.request_type && job.request_type.includes('analysis-lm') || job.type === 'analysis-lm' ?
            'analysis-lm' : 'question-answering');

        const status = (job.status || '').toUpperCase();
        const jobStartTime = new Date(job.start_datetime || job.analysis_lm_created_datetime || Date.now()).getTime();
        const currentTime = Date.now();
        const twelveHoursMs = 12 * 60 * 60 * 1000;

        // Skip jobs that have been running for more than 12 hours
        if (status === 'RUNNING' && (currentTime - jobStartTime > twelveHoursMs)) {
          continue;
        }

        // Create or update job in our map
        if (!this.jobsMap[jobId]) {
          // New job we don't know about
          const isAnalysisLM = jobType === 'analysis-lm';
          this.jobsMap[jobId] = {
            jobId,
            jobType,
            status,
            progress: job.progress || 0,
            docId: job.doc_id || job.documentId || null,
            docItemId: job.doc_item_id || null,
            type: job.type || job.request_type || jobType,
            start_datetime: job.start_datetime || job.analysis_lm_created_datetime || new Date().toISOString(),
            startTime: jobStartTime,
            meta: isAnalysisLM ? {
              analysisLmCreatedDatetime: job.analysis_lm_created_datetime || job.start_datetime
            } : {
              questionTs: job.question_ts
            }
          };
        } else {
          // Update existing job
          const existingJob = this.jobsMap[jobId];
          existingJob.status = status;
          existingJob.progress = job.progress || 0;

          // Update other fields if they exist
          if (job.doc_id || job.documentId) {
            existingJob.docId = job.doc_id || job.documentId;
          }
          if (job.doc_item_id) {
            existingJob.docItemId = job.doc_item_id;
          }

          // Update document status for UI if status has changed
          this._upsertJobInfo(existingJob, existingJob.docId);
        }

        // If job is running and we're not already polling, start polling
        if (status === 'RUNNING' && !this.pollIntervals[jobId]) {
          const isAnalysisLM = jobType === 'analysis-lm';
          const meta = isAnalysisLM ? {
            analysisLmCreatedDatetime: job.analysis_lm_created_datetime || job.start_datetime
          } : {
            questionTs: job.question_ts
          };
          this.startPollingJob(jobId, jobType, meta);
        }
      }

      // Save to store
      this.saveJobsToStore();

      // Return the jobs (converted to our standard format)
      return Object.values(this.jobsMap);
    } catch (error) {
      return [];
    }
  }

  /**
   * getJobsForDocument => returns all job objects matching docId.
   * Documents can then call aggregator on these job statuses if they wish.
   */
  getJobsForDocument(docId) {
    if (!docId) return [];
    const all = this.getAllJobs();
    return all.filter(j => j.docId === docId);
  }

  /**
   * Find tab ID for a job (if the job is open in a tab)
   * @param {string} jobId - Job ID to find tab for
   * @returns {string|null} - Tab ID or null if not found
   */
  getTabIdForJob(jobId) {
    if (!window.tabManager) return null;

    const tabIndex = window.tabManager.tabs.findIndex(tab =>
      tab.jobId === jobId ||
      (tab.newFrameworkDoc && tab.newFrameworkDoc.docTaskInstance &&
        tab.newFrameworkDoc.docTaskInstance.jobId === jobId)
    );

    if (tabIndex >= 0) {
      return window.tabManager.tabs[tabIndex].id;
    }

    return null;
  }

  /**
   * getDocumentAggregatedStatus => aggregator for doc-level
   * (If the document also uses docItem-level statuses, you can combine them too.)
   */
  getDocumentAggregatedStatus(docId, itemStatuses = []) {
    // itemStatuses is optional array of status strings from doc items if you like
    const docJobs = this.getJobsForDocument(docId);
    const jobStatuses = docJobs.map(j => j.status);

    // Combine job statuses with itemStatuses (like sub-jobs).
    const combined = [...jobStatuses, ...itemStatuses];
    if (!combined.length) {
      // no statuses at all => "NOT_APPLICABLE"
      return JOB_STATUS.NOT_APPLICABLE;
    }
    return computeAggregateStatus(combined);
  }

  /**
   * restoreUnfinishedJobs
   * Reads from localStorage (via store) to re-init polling for any job that is not done.
   */
  restoreUnfinishedJobs() {
    // Skip if not authenticated
    if (!localStorage.getItem("authToken")) {
      return;
    }

    const stored = this.store.get("jobsMap") || {};
    this.jobsMap = stored;

    const currentTime = Date.now();
    const twelveHoursMs = 12 * 60 * 60 * 1000;

    Object.keys(this.jobsMap).forEach(jobId => {
      const jobRec = this.jobsMap[jobId];

      // Skip jobs older than 12 hours
      const jobStartTime = jobRec.startTime || currentTime;
      if (currentTime - jobStartTime > twelveHoursMs) {
        // Update status to FAILED if it was still RUNNING
        if (jobRec.status === JOB_STATUS.RUNNING) {
          jobRec.status = JOB_STATUS.FAILED;
          jobRec.error = "Job exceeded maximum execution time of 12 hours";
          this.jobsMap[jobId] = jobRec;

          // Update document status for UI
          this._updateDocumentStatus(jobRec, JOB_STATUS.FAILED);
        }
        return;
      }

      // If it is not in a terminal status, resume polling
      if ([
        JOB_STATUS.RUNNING,
        JOB_STATUS.NOT_APPLICABLE // or some custom
      ].includes(jobRec.status)) {
        // Check if it's a master job (by ID prefix) and set jobType accordingly
        const isMasterJob = jobId.startsWith('mstr-');
        const jobType = isMasterJob ? 'question-answering-master' : (jobRec.jobType || 'question-answering');

        this.startPollingJob(jobId, jobType, jobRec.meta);
      }
    });

    // Save updated job map to store
    this.saveJobsToStore();
  }

  /**
   * Schedule a debounced save to prevent excessive localStorage writes
   */
  saveJobsToStore() {
    this.isDirty = true;
    
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // Schedule debounced save
    this.saveTimeout = setTimeout(() => {
      this.performSaveToStore();
      this.saveTimeout = null;
    }, this.saveDelay);
  }
  
  /**
   * Force immediate save (for critical operations)
   */
  saveJobsToStoreImmediate() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.performSaveToStore();
  }

  /**
   * saveJobsToStore => persists this.jobsMap in store (=> localStorage).
   */
  performSaveToStore() {
    if (!this.isDirty) return;
    
    // First ensure we remove any circular references that might cause problems
    const sanitizedJobsMap = {};

    Object.keys(this.jobsMap).forEach(jobId => {
      // Create a clean copy without circular references
      const job = { ...this.jobsMap[jobId] };

      // Remove potential circular references
      delete job.docTaskInstance;
      delete job.__parent;

      sanitizedJobsMap[jobId] = job;
    });

    this.store.set("jobsMap", sanitizedJobsMap);
    this.isDirty = false;
  }

  destroy() {
    // Clear cleanup interval
    if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
    }

    // Clear cached data
    this.contentOptionsCache = null;
    this.licenseCheckCache = null;

    // Stop all polling intervals
    this.stopAllPolling();

  }
}