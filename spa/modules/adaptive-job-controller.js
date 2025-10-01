// File: modules/adaptive-job-controller.js

import { JobController } from "./job-controller.js";
import { getRealtimeProgress, getUserActiveJobs } from "../api/realtime-jobs.js";
import { NotificationController } from "./notification-controller.js";
import { getCurrentTenant } from "../utils/config.js";

/**
 * Enhanced JobController with adaptive polling and real-time features
 * for question-answering jobs while maintaining backwards compatibility
 * with AnalysisLM jobs.
 */
export class AdaptiveJobController extends JobController {
    constructor(store) {
        super(store);
        
        // Enhanced features configuration
        this.enhancedFeatures = {
            adaptivePolling: true,
            syntheticProgress: true,
            sessionRecovery: true,
            realtimeUpdates: true
        };
        
        // Enhanced polling configuration
        this.pollingConfig = {
            "question-answering-master": {
                // Dynamic intervals based on job state - REASONABLE intervals for long jobs
                intervals: {
                    QUEUED: 10000,     // 10 seconds for queued jobs
                    RUNNING: 30000,    // 30 seconds during active processing
                    PROCESSING: 30000, // 30 seconds during processing
                    COMPLETED: 60000,  // 60 seconds for completed (for cleanup)
                    FAILED: 60000      // 60 seconds for failed
                },
                useRealtimeAPI: true,
                enableSyntheticProgress: true
            },
            "question-answering": { // Legacy support
                intervals: {
                    default: 5000
                },
                useRealtimeAPI: false,
                enableSyntheticProgress: false
            },
            "analysis-lm": { // Existing AnalysisLM jobs - no changes
                intervals: {
                    default: 8000
                },
                useRealtimeAPI: false,
                enableSyntheticProgress: false
            }
        };
        
        // Question completion tracking
        this.questionCompletions = new Map(); // jobId -> completions
        this.lastCompletionCheck = new Map(); // jobId -> timestamp
        
        // Synthetic progress tracking
        this.syntheticProgress = new Map(); // jobId -> progress state
        
        // Error tracking for intelligent retry logic
        this.realtimeApiErrors = new Map(); // jobId -> {count, lastError, backoffMultiplier}
        
    }

    /**
     * Calculate appropriate polling interval based on job type and status
     */
    calculatePollingInterval(jobType, jobStatus) {
        const config = this.pollingConfig[jobType] || this.pollingConfig["analysis-lm"];
        
        if (config.intervals.default) {
            // Simple fixed interval for legacy job types
            return config.intervals.default;
        }
        
        // Dynamic interval based on job status
        const status = jobStatus.status || 'QUEUED';
        const interval = config.intervals[status] || config.intervals.QUEUED;
        
        // Additional factors for adaptive polling
        if (status === 'RUNNING') {
            const activeProcessing = jobStatus.active_processing || 0;
            if (activeProcessing > 0) {
                return 1000; // 1 second during active processing
            }
        }
        
        return interval;
    }

    /**
     * Enhanced startQuestionJob with session management and enhanced tracking
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

        // Calculate total questions and content groups
        const contentGroups = Object.keys(payload.questions_by_content);
        const totalQuestions = contentGroups.reduce((total, groupName) => {
            const questions = payload.questions_by_content[groupName];
            return total + (Array.isArray(questions) ? questions.length : 0);
        }, 0);

        if (totalQuestions === 0) {
            throw new Error("No questions found in payload");
        }

        // Call the API to start the job (parent class logic)
        const { startQuestionJob: apiStartQuestionJob } = await import("../api/questions-jobs.js");
        const result = await apiStartQuestionJob(payload);

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

        // Build enhanced metadata for session management and real-time features
        const enhancedMeta = {
            questionTs: result.question_ts, // Use question_ts from API response
            questionSubJobCount: result.question_sub_job_count,
            questionSubJobsCompleted: 0,
            
            // Enhanced features metadata
            enhanced: true,
            selectedRowCount: totalQuestions,
            modelUsed: payload.primary_cqa_service || 'unknown',
            jobPayload: {
                primary_cqa_service: payload.primary_cqa_service,
                fallback_cqa_service: payload.fallback_cqa_service,
                content_groups: Object.keys(payload.questions_by_content || {}).length
            },
            documentContext: this.extractDocumentContextFromJob(docId, docItemId),
            
            // Store additional metadata for tracking
            primary_cqa_service: payload.primary_cqa_service,
            content_groups_count: contentGroups.length,
            original_message: result.message,
            
            // Phase 2: Add stage metadata for job completion integration
            stageId: payload.stageId,
            groupId: payload.groupId
        };

        // Register job in tracking map
        const newJob = {
            jobId,
            jobType,
            status: result.status, // Should be 'QUEUED' for batch jobs
            progress: 0, // Start at 0%
            docId,
            docItemId,
            meta: enhancedMeta,
            startTime: Date.now(),
            totalQuestions: totalQuestions,
            contentGroups: contentGroups.length,
            model: payload.primary_cqa_service,
            
            // Phase 3: Include description and progress_config from server
            description: result.description || `${payload.processName || "Job"} - ${totalQuestions} questions`,
            progress_config: result.progress_config || null,
            
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

        // Store job in jobsMap
        this.jobsMap[jobId] = newJob;
        this.saveJobsToStore();

        // Save to session manager
        if (window.jobSessionManager) {
            window.jobSessionManager.saveJob(jobId, newJob);
        }

        // CRITICAL: Use enhanced tracking instead of standard polling
        if (this.supportsEnhancedFeatures(jobType)) {
            // Initialize enhanced features
            this.initializeSyntheticProgress(jobId, newJob);
            
            // Start adaptive polling (the correct one)
            this.startAdaptivePolling(jobId);
            
            // Emit job tracking event
            this.notifyJobStateChange(jobId, 'TRACKING_STARTED', newJob);
        } else {
            // Fallback to standard polling for non-enhanced jobs
            this.startPollingJob(jobId, jobType, enhancedMeta);
        }

        this.checkAndCleanupIfNeeded();


        return result;
    }

    /**
     * Enhanced job tracking with realtime capabilities
     */
    async trackJob(jobId, jobType, meta = {}) {
        
        // Use parent class for non-question-answering jobs
        if (!this.supportsEnhancedFeatures(jobType)) {
            return super.trackJob(jobId, jobType, meta);
        }
        
        // Enhanced tracking for question-answering jobs
        const jobRec = this.jobsMap[jobId] || {
            jobId,
            jobType,
            status: 'QUEUED',
            progress: 0,
            startTime: Date.now(),
            meta: { ...meta, enhanced: true }
        };
        
        this.jobsMap[jobId] = jobRec;
        this.saveJobsToStore();
        
        // Initialize enhanced features
        this.initializeSyntheticProgress(jobId, jobRec);
        
        // Start adaptive polling
        this.startAdaptivePolling(jobId);
        
        // Emit job tracking event
        this.notifyJobStateChange(jobId, 'TRACKING_STARTED', jobRec);
        
        return jobRec;
    }

    /**
     * Start adaptive polling for a job
     */
    startAdaptivePolling(jobId) {
        if (this.pollIntervals[jobId]) {
            clearInterval(this.pollIntervals[jobId]);
        }
        
        const pollFunction = async () => {
            try {
                await this.enhancedPollJob(jobId);
                
                // Reset error tracking on successful poll
                this.resetErrorTracking(jobId);
                
            } catch (error) {
                console.error(`[AdaptiveJobController] Enhanced poll failed for job ${jobId}:`, error);
                
                // Track polling errors for backoff logic
                this.trackPollingError(jobId, error);
                
                // Check if we should continue polling based on error type
                const shouldContinue = this.shouldContinuePolling(jobId, error);
                if (!shouldContinue) {
                    this.stopJobPolling(jobId);
                }
            }
        };
        
        // Start immediately
        pollFunction();
        
        // Set up interval (will be dynamically adjusted)
        this.pollIntervals[jobId] = setInterval(pollFunction, 5000); // Default interval
        
    }

    /**
     * Enhanced polling with realtime progress
     */
    async enhancedPollJob(jobId) {
        const jobRec = this.jobsMap[jobId];
        if (!jobRec) {
            return;
        }
        
        const jobType = jobRec.jobType;
        
        // Question-answering jobs ONLY use realtime API - no fallbacks
        if (this.supportsEnhancedFeatures(jobType)) {
            await this.pollWithRealtimeAPI(jobId, jobRec);
        } else {
            throw new Error(`Unsupported job type: ${jobType}`);
        }
        
        // Update polling interval based on current status
        this.adjustPollingInterval(jobId, jobRec);
    }

    /**
     * Poll using realtime progress API
     */
    async pollWithRealtimeAPI(jobId, jobRec) {
        try {
            const since = this.lastCompletionCheck.get(jobId);
            const questionTs = jobRec.meta?.questionTs;
            
            if (!questionTs) {
                throw new Error(`Job ${jobId} missing questionTs`);
            }
            
            const response = await getRealtimeProgress(jobId, since, questionTs);
            
            // Check enhanced features availability
            const enhancedAvailable = response.realtime_data?.enhanced_features_available || response.enhanced_features_available;
            if (!enhancedAvailable) {
                throw new Error(`Enhanced features not available for job ${jobId}`);
            }
            
            // Update job status from realtime API
            const oldStatus = jobRec.status;
            const updatedJobRec = this.updateJobFromRealtimeResponse(jobId, jobRec, response);
            const newStatus = updatedJobRec.status;
            
            // Check if job completed - CRITICAL: Stop polling for completed jobs
            if (oldStatus !== newStatus && ["COMPLETED", "FAILED", "CANCELLED"].includes(newStatus)) {
                // Stop polling for completed jobs
                if (this.pollIntervals[jobId]) {
                    clearInterval(this.pollIntervals[jobId]);
                    delete this.pollIntervals[jobId];
                }
                
                // Also stop synthetic progress updates (Phase 3)
                if (this.syntheticProgressIntervals && this.syntheticProgressIntervals.has(jobId)) {
                    clearInterval(this.syntheticProgressIntervals.get(jobId));
                    this.syntheticProgressIntervals.delete(jobId);
                }
                
                // Notify completion
                this.notifyJobStateChange(jobId, 'JOB_COMPLETED', updatedJobRec);
                
                // Schedule cleanup of completed job from active tracking (delayed to allow UI to show completion)
                setTimeout(() => {
                    this.cleanupCompletedJob(jobId);
                }, 5000); // Remove from active tracking after 5 seconds
                
                // Don't continue processing if job is done
                return;
            }
            
            // Process question completions
            const completions = response.recent_completions || [];
            if (completions.length > 0) {
                this.processQuestionCompletions(jobId, completions);
            }
            
            // Update last check timestamp
            this.lastCompletionCheck.set(jobId, new Date().toISOString());
            
            // Update synthetic progress if enabled
            if (this.shouldUseSyntheticProgress(jobRec.jobType)) {
                this.updateSyntheticProgress(jobId, updatedJobRec);
            }
            
            // Save updated state
            this.saveJobsToStore();
            
            // Notify listeners of job update
            this.notifyJobStateChange(jobId, 'PROGRESS_UPDATE', updatedJobRec);
            
        } catch (error) {
            // Handle token expiration (401 errors)
            if (error.status === 401) {
                // Try to refresh token
                try {
                    await this.handleTokenExpiration(jobId);
                    // Don't throw - let the next polling cycle retry with the new token
                    return;
                } catch (refreshError) {
                    
                    // Stop polling this job and notify user
                    this.stopJobPolling(jobId);
                    this.notifyJobStateChange(jobId, 'AUTH_FAILED', { 
                        jobId, 
                        error: 'Authentication expired',
                        requiresUserAction: true 
                    });
                    
                    // Show user-friendly error
                    if (window.errorModal) {
                        window.errorModal.show({
                            title: "Authentication Required",
                            message: "Your session has expired. Please log in again to continue monitoring job progress.",
                            details: `Job ${jobId} will continue processing, but progress updates will stop until you log in again.`
                        });
                    }
                    
                    throw new Error(`Authentication expired for job ${jobId}`);
                }
            }
            
            // Check if this is a configuration/server error (5xx)
            if (error.status >= 500) {
                // Show a prominent error to the user
                if (window.errorModal) {
                    window.errorModal.show({
                        title: "Backend Configuration Error",
                        message: `The realtime progress system is misconfigured. Error: ${error.message}`,
                        details: `Status: ${error.status}\n\nThis needs to be fixed in the backend Lambda configuration.`
                    });
                }
                
                // For configuration errors, we fail completely
                throw new Error(`Backend configuration error for job ${jobId}: ${error.message}`);
            }
            
            // For other errors, also fail fast (no fallbacks)
            throw new Error(`Realtime API failed for job ${jobId}: ${error.message}`);
        }
    }

    /**
     * Handle token expiration during job polling
     */
    async handleTokenExpiration(jobId) {
        // Import token refresh utilities
        try {
            const { refreshAuthToken } = await import('../utils/auth-utils.js');
            
            // Attempt to refresh the token
            const success = await refreshAuthToken();
            
            if (!success) {
                throw new Error('Token refresh failed');
            }
            
            return true;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Stop polling for a specific job
     */
    stopJobPolling(jobId) {
        // Clear polling interval
        if (this.pollIntervals[jobId]) {
            clearInterval(this.pollIntervals[jobId]);
            delete this.pollIntervals[jobId];
        }
        
        // Clear synthetic progress updates
        if (this.syntheticProgressIntervals && this.syntheticProgressIntervals.has(jobId)) {
            clearInterval(this.syntheticProgressIntervals.get(jobId));
            this.syntheticProgressIntervals.delete(jobId);
        }
        
        // Mark job as having polling issues (don't remove completely)
        const jobRec = this.jobsMap[jobId];
        if (jobRec) {
            jobRec.pollingStatus = 'STOPPED';
            jobRec.pollingStoppedReason = 'Authentication expired';
            jobRec.pollingStoppedAt = new Date().toISOString();
            this.jobsMap[jobId] = jobRec;
            this.saveJobsToStore();
        }
    }

    /**
     * Resume polling for jobs that were stopped due to authentication issues
     */
    resumeAuthenticatedJobs() {
        let resumedCount = 0;
        
        // Find jobs that were stopped due to auth issues
        Object.keys(this.jobsMap).forEach(jobId => {
            const jobRec = this.jobsMap[jobId];
            
            if (jobRec.pollingStatus === 'STOPPED' && 
                jobRec.pollingStoppedReason === 'Authentication expired' &&
                !this.pollIntervals[jobId]) {
                
                // Clear the polling status
                delete jobRec.pollingStatus;
                delete jobRec.pollingStoppedReason;
                delete jobRec.pollingStoppedAt;
                
                // Only resume if job is still active
                if (jobRec.status === 'RUNNING' || jobRec.status === 'QUEUED') {
                    this.startJobPolling(jobId);
                    resumedCount++;
                }
            }
        });
        
        if (resumedCount > 0) {
            this.saveJobsToStore();
        }
        
        return resumedCount;
    }

    /**
     * Track polling errors for backoff and retry logic
     */
    trackPollingError(jobId, error) {
        if (!this.realtimeApiErrors.has(jobId)) {
            this.realtimeApiErrors.set(jobId, {
                count: 0,
                firstError: Date.now(),
                lastError: null,
                backoffMultiplier: 1,
                consecutiveErrors: 0
            });
        }

        const errorInfo = this.realtimeApiErrors.get(jobId);
        errorInfo.count++;
        errorInfo.consecutiveErrors++;
        errorInfo.lastError = Date.now();
        
        // Calculate exponential backoff (max 5x)
        errorInfo.backoffMultiplier = Math.min(
            Math.pow(1.5, Math.min(errorInfo.consecutiveErrors, 4)),
            5
        );

        this.realtimeApiErrors.set(jobId, errorInfo);
    }

    /**
     * Reset error tracking after successful poll
     */
    resetErrorTracking(jobId) {
        const errorInfo = this.realtimeApiErrors.get(jobId);
        if (errorInfo && errorInfo.consecutiveErrors > 0) {
            errorInfo.consecutiveErrors = 0;
            errorInfo.backoffMultiplier = 1;
            this.realtimeApiErrors.set(jobId, errorInfo);
        }
    }

    /**
     * Determine if polling should continue based on error type and history
     */
    shouldContinuePolling(jobId, error) {
        const errorInfo = this.realtimeApiErrors.get(jobId);
        
        // Always stop on authentication errors (handled separately)
        if (error.status === 401) {
            return false;
        }
        
        // Stop on too many consecutive errors (10+)
        if (errorInfo && errorInfo.consecutiveErrors >= 10) {
            return false;
        }
        
        // Stop on configuration errors (5xx)
        if (error.status >= 500) {
            return false;
        }
        
        // Continue for network errors and other temporary issues
        return true;
    }

    // NOTE: Error handling and retry logic removed - fail fast for question-answering jobs

    // NOTE: Standard polling completely removed - AdaptiveJobController ONLY uses realtime API

    /**
     * Update job record from realtime API response
     */
    updateJobFromRealtimeResponse(jobId, jobRec, response) {
        const jobStatus = response.job_status || {};
        const processingSummary = response.processing_summary || {};
        const realtimeData = response.realtime_data || {};
        
        // Update basic job information
        const updatedJobRec = {
            ...jobRec,
            status: jobStatus.status || jobRec.status,
            progress: jobStatus.progress || processingSummary.progress_percentage || jobRec.progress,
            lastUpdated: jobStatus.last_updated || realtimeData.last_updated || new Date().toISOString(),
            
            // Update description from job_status if available (Phase 3)
            description: jobStatus.description || jobRec.description,
            
            // Enhanced fields
            enhanced: {
                processing_summary: processingSummary,
                realtime_data: realtimeData,
                last_api_update: new Date().toISOString()
            }
        };
        
        this.jobsMap[jobId] = updatedJobRec;
        return updatedJobRec;
    }

    /**
     * Process question completions from realtime API
     */
    processQuestionCompletions(jobId, completions) {
        if (!completions || completions.length === 0) return;
        
        // Store completions for this job
        const existingCompletions = this.questionCompletions.get(jobId) || [];
        const allCompletions = [...existingCompletions, ...completions];
        const recentCompletions = allCompletions.slice(-100);
        this.questionCompletions.set(jobId, recentCompletions);
        
        // Emit completion events for grid updates
        completions.forEach(completion => {
            this.notifyQuestionCompletion(jobId, completion);
        });
    }

    /**
     * Adjust polling interval based on job state and error history
     */
    adjustPollingInterval(jobId, jobRec) {
        const currentInterval = this.pollIntervals[jobId];
        if (!currentInterval) return;
        
        let newInterval = this.calculatePollingInterval(jobRec.jobType, jobRec);
        
        // Apply backoff for jobs with recent errors
        const errorInfo = this.realtimeApiErrors.get(jobId);
        if (errorInfo && errorInfo.backoffMultiplier > 1) {
            newInterval = Math.min(newInterval * errorInfo.backoffMultiplier, 60000); // Max 1 minute
        }
        
        // Only adjust if interval has changed significantly
        const currentMs = currentInterval._idleTimeout || 5000;
        if (Math.abs(newInterval - currentMs) > 1000) {
            clearInterval(this.pollIntervals[jobId]);
            this.pollIntervals[jobId] = setInterval(async () => {
                await this.enhancedPollJob(jobId);
            }, newInterval);
        }
    }

    /**
     * Initialize synthetic progress for a job (Phase 3 Enhanced)
     */
    initializeSyntheticProgress(jobId, jobRec) {
        if (!this.shouldUseSyntheticProgress(jobRec.jobType)) {
            return;
        }
        
        const progressConfig = jobRec.progress_config || this.getDefaultProgressConfig(jobRec);
        const initialProgress = Math.max(jobRec.progress || 0, 2);
        
        this.syntheticProgress.set(jobId, {
            current: initialProgress,
            config: progressConfig,
            lastUpdate: Date.now(),
            isActive: jobRec.status === 'QUEUED' || jobRec.status === 'RUNNING' || jobRec.status === 'PROCESSING',
            phase: 'startup'
        });
        
        if (jobRec.progress < initialProgress) {
            jobRec.progress = initialProgress;
            this.jobsMap[jobId] = jobRec;
        }
        
        // Immediately start synthetic progress updates (Phase 3)
        if (jobRec.status === 'QUEUED' || jobRec.status === 'RUNNING' || jobRec.status === 'PROCESSING') {
            // Force an immediate synthetic progress update
            setTimeout(() => {
                const currentJobRec = this.jobsMap[jobId];
                if (currentJobRec) {
                    this.updateSyntheticProgress(jobId, currentJobRec);
                }
            }, 100); // Small delay to ensure state is settled
            
            // Set up periodic synthetic progress updates
            const syntheticUpdateInterval = setInterval(() => {
                const currentJobRec = this.jobsMap[jobId];
                const synthState = this.syntheticProgress.get(jobId);
                
                if (!currentJobRec || !synthState || !synthState.isActive) {
                    clearInterval(syntheticUpdateInterval);
                    return;
                }
                
                this.updateSyntheticProgress(jobId, currentJobRec);
            }, 1000);
            
            // Store interval reference for cleanup
            if (!this.syntheticProgressIntervals) {
                this.syntheticProgressIntervals = new Map();
            }
            this.syntheticProgressIntervals.set(jobId, syntheticUpdateInterval);
        }
    }

    /**
     * Update synthetic progress based on real progress (Phase 3 Enhanced)
     */
    updateSyntheticProgress(jobId, jobRec) {
        const synthState = this.syntheticProgress.get(jobId);
        if (!synthState || !synthState.isActive) return;
        
        const config = synthState.config.synthetic_config || {};
        const realProgress = jobRec.progress || 0;
        const now = Date.now();
        const timeSinceUpdate = now - synthState.lastUpdate;
        
        // Only update every 2 seconds
        if (timeSinceUpdate < 2000) return;
        
        // During startup phase: progress toward 30% over 45 seconds
        if (synthState.phase === 'startup' && realProgress < 30) {
            const progressPerSecond = 30 / 45; // 30% over 45 seconds
            const increment = (timeSinceUpdate / 1000) * progressPerSecond;
            
            if (synthState.current < 30) {
                const newProgress = Math.min(synthState.current + increment, 30);
                this.updateProgress(jobId, jobRec, synthState, Math.round(newProgress), now);
            }
        } 
        // Processing phase: slow increments, stay within buffer of real progress
        else {
            if (synthState.phase === 'startup') {
                synthState.phase = 'processing';
            }
            
            if (realProgress > synthState.current) {
                // Real progress jumped - sync immediately
                this.updateProgress(jobId, jobRec, synthState, realProgress, now);
            } else if (timeSinceUpdate > 30000 && synthState.current < realProgress + 10 && synthState.current < 85) {
                // Small increment every 30 seconds, stay within 10% of real progress, max 85%
                this.updateProgress(jobId, jobRec, synthState, synthState.current + 1, now);
            }
        }
        
        // Deactivate when job completes
        if (jobRec.status === 'COMPLETED' || jobRec.status === 'FAILED') {
            synthState.isActive = false;
            synthState.current = jobRec.status === 'COMPLETED' ? 100 : synthState.current;
        }
    }
    
    /**
     * Helper method to update progress and log details
     */
    updateProgress(jobId, jobRec, synthState, newProgress, timestamp) {
        synthState.current = newProgress;
        synthState.lastUpdate = timestamp;
        jobRec.progress = newProgress;
        this.jobsMap[jobId] = jobRec;
        this.saveJobsToStore();
        this.notifyJobStateChange(jobId, 'PROGRESS_UPDATE', jobRec);
    }
    
    /**
     * Get default progress configuration when server config is not available
     */
    getDefaultProgressConfig(jobRec) {
        // Fallback configuration if server doesn't provide one
        const questionCount = jobRec.meta?.selectedRowCount || 1;
        
        return {
            question_count: questionCount,
            estimated_duration_minutes: 1 + questionCount,
            synthetic_config: {
                enable: true,
                startup_target: 30,
                max_advance_buffer: 10,
                smooth_duration_seconds: 45,
                increment_interval_seconds: 30
            }
        };
    }

    /**
     * Extract questionTs from job ID or construct a reasonable default
     * @param {string} jobId - The job ID (e.g., "mstr-123-456-789")
     * @returns {string} - The question tenant shard (e.g., "dev1#1")
     */
    extractQuestionTsFromJobId(jobId) {
        // Use the configuration system to get the current tenant
        const currentTenant = getCurrentTenant();
        
        // Validate that we have a real tenant (not 'default')
        if (!currentTenant || currentTenant === 'default') {
            throw new Error(`Cannot extract questionTs: invalid tenant '${currentTenant}'. Check domain configuration.`);
        }
        
        // Always use shard #1 for the current tenant
        const questionTs = `${currentTenant}#1`;
        
        return questionTs;
    }

    /**
     * Validate job metadata for API calls
     * @param {Object} jobRec - The job record
     * @param {string} jobId - The job ID  
     * @returns {boolean} - True if metadata is valid for API calls
     */
    validateJobMetadata(jobRec, jobId) {
        if (!jobRec.meta) {
            return false;
        }
        
        if (!jobRec.meta.questionTs) {
            // Try to reconstruct it
            try {
                jobRec.meta.questionTs = this.extractQuestionTsFromJobId(jobId);
            } catch (error) {
                return false;
            }
        }
        
        return true;
    }


    /**
     * Cross-session job recovery
     */
    async restoreActiveJobs() {
        try {
            // First restore from localStorage (fast)
            super.restoreUnfinishedJobs();
            
            // Then check server for additional active jobs
            if (localStorage.getItem("authToken")) {
                const response = await getUserActiveJobs();
                
                if (response.active_jobs && response.active_jobs.length > 0) {
                    response.active_jobs.forEach(serverJob => {
                        const existingJob = this.jobsMap[serverJob.job_id];
                        
                        if (!existingJob) {
                            // New job not in local storage - need to reconstruct metadata
                            
                            // Extract tenant shard for questionTs
                            let questionTs;
                            try {
                                questionTs = this.extractQuestionTsFromJobId(serverJob.job_id);
                            } catch (error) {
                                return; // Skip this job entirely rather than guessing
                            }
                            
                            // Extract docId from document context for TopBar display
                            let docId = null;
                            if (serverJob.document_context && serverJob.document_context.project_document_id) {
                                docId = serverJob.document_context.project_document_id;
                            }
                            
                            // Re-evaluate enhanced features based on current context
                            // Don't just rely on serverJob.enhanced_features_available
                            let enhancedEnabled = serverJob.enhanced_features_available;
                            let currentDocumentContext = serverJob.document_context;
                            
                            // If server doesn't think enhanced features are available, 
                            // but this is a question-answering job, try to extract context from current session
                            if (!enhancedEnabled && this.supportsEnhancedFeatures(serverJob.job_type)) {
                                // Try to extract document context from current URL/tab context
                                const extractedContext = this.extractDocumentContextFromJob(docId, null);
                                if (extractedContext) {
                                    enhancedEnabled = true;
                                    currentDocumentContext = extractedContext;
                                }
                            }
                            
                            const jobRec = {
                                jobId: serverJob.job_id,
                                jobType: serverJob.job_type,
                                status: serverJob.status,
                                progress: serverJob.progress || 0,
                                startTime: new Date(serverJob.started_at).getTime(),
                                docId: docId, // Set docId for TopBar job display
                                meta: {
                                    // Critical: Include questionTs for API calls
                                    questionTs: questionTs,
                                    questionSubJobCount: serverJob.processing_metrics?.batch_count || 1,
                                    // Enhanced features metadata
                                    restored: true,
                                    enhanced: enhancedEnabled, // Use re-evaluated enhanced status
                                    documentContext: currentDocumentContext,
                                    // Include processing metrics if available
                                    ...serverJob.processing_metrics
                                }
                            };
                            
                            this.jobsMap[serverJob.job_id] = jobRec;
                            
                            // Start tracking if still active
                            if (serverJob.status === 'RUNNING' || serverJob.status === 'QUEUED') {
                                this.startAdaptivePolling(serverJob.job_id);
                            }
                        } else {
                            // Merge server data with existing local data to preserve metadata
                            existingJob.status = serverJob.status;
                            existingJob.progress = serverJob.progress || existingJob.progress;
                            
                            // Ensure docId is set if available from server context and not already present
                            if (!existingJob.docId && serverJob.document_context && serverJob.document_context.project_document_id) {
                                existingJob.docId = serverJob.document_context.project_document_id;
                            }
                            
                            // Re-evaluate enhanced features for existing jobs too
                            let enhancedEnabled = serverJob.enhanced_features_available;
                            let currentDocumentContext = serverJob.document_context || existingJob.meta.documentContext;
                            
                            // If server doesn't think enhanced features are available, 
                            // but this is a question-answering job, try to extract context from current session
                            if (!enhancedEnabled && this.supportsEnhancedFeatures(serverJob.job_type)) {
                                // Try to extract document context from current URL/tab context
                                const extractedContext = this.extractDocumentContextFromJob(existingJob.docId, null);
                                if (extractedContext) {
                                    enhancedEnabled = true;
                                    currentDocumentContext = extractedContext;
                                }
                            }
                            
                            // Enhance metadata while preserving critical fields
                            existingJob.meta = {
                                ...existingJob.meta, // Preserve existing metadata including questionTs
                                enhanced: enhancedEnabled, // Use re-evaluated enhanced status
                                documentContext: currentDocumentContext,
                                restored: true,
                                ...serverJob.processing_metrics
                            };
                            
                            // Restart polling if job became active
                            if ((serverJob.status === 'RUNNING' || serverJob.status === 'QUEUED') && 
                                !this.pollIntervals[serverJob.job_id]) {
                                this.startAdaptivePolling(serverJob.job_id);
                            }
                        }
                    });
                    
                    this.saveJobsToStorage();
                }
            }
        } catch (error) {
            // Continue with local restoration only
        }
    }

    /**
     * Clean up completed job from active tracking
     */
    cleanupCompletedJob(jobId) {
        // Remove from active jobs tracking
        if (this.jobsMap[jobId]) {
            delete this.jobsMap[jobId];
        }
        
        // Clean up any remaining intervals
        if (this.pollIntervals[jobId]) {
            clearInterval(this.pollIntervals[jobId]);
            delete this.pollIntervals[jobId];
        }
        
        // Clean up synthetic progress tracking
        if (this.syntheticProgress && this.syntheticProgress.has(jobId)) {
            this.syntheticProgress.delete(jobId);
        }
        
        if (this.syntheticProgressIntervals && this.syntheticProgressIntervals.has(jobId)) {
            clearInterval(this.syntheticProgressIntervals.get(jobId));
            this.syntheticProgressIntervals.delete(jobId);
        }
        
        // Clean up completion tracking
        if (this.questionCompletions && this.questionCompletions.has(jobId)) {
            this.questionCompletions.delete(jobId);
        }
        
        if (this.lastCompletionCheck && this.lastCompletionCheck.has(jobId)) {
            this.lastCompletionCheck.delete(jobId);
        }
        
        // Update store
        this.saveJobsToStore();
        
        // Notify that job was removed from tracking
        this.notifyJobStateChange(jobId, 'JOB_CLEANUP', { jobId, status: 'REMOVED_FROM_TRACKING' });
    }

    /**
     * Enhanced job state notifications
     */
    notifyJobStateChange(jobId, eventType, jobData) {
        document.dispatchEvent(new CustomEvent('jobStateChange', {
            detail: {
                jobId,
                eventType,
                jobData,
                timestamp: Date.now()
            }
        }));
    }

    /**
     * Question completion notifications for grid updates
     */
    notifyQuestionCompletion(jobId, completion) {
        document.dispatchEvent(new CustomEvent('questionCompletion', {
            detail: {
                jobId,
                completion,
                timestamp: Date.now()
            }
        }));
    }

    /**
     * Calculate selected rows count from payload
     */
    calculateSelectedRows(payload) {
        if (!payload || !payload.questions_by_content) return 0;
        
        let totalRows = 0;
        Object.values(payload.questions_by_content).forEach(questions => {
            if (Array.isArray(questions)) {
                totalRows += questions.length;
            }
        });
        
        return totalRows;
    }

    /**
     * Extract document context from job parameters
     */
    extractDocumentContextFromJob(docId, docItemId) {
        // Try to extract from current URL and parameters
        const context = {
            available: false
        };
        
        if (docId) {
            context.projectDocumentId = docId;
            context.available = true;
        }
        
        if (docItemId) {
            context.groupId = docItemId;
            context.available = true;
        }
        
        // Try to extract from current URL if not provided
        if (!context.available) {
            const url = window.location.pathname;
            const urlMatch = url.match(/\/documents\/([^\/]+)/);
            if (urlMatch) {
                context.projectDocumentId = urlMatch[1];
                context.available = true;
            }
        }
        
        // Try to get document title from current tab
        if (context.available && window.tabManager) {
            try {
                const activeTab = window.tabManager.getActiveTab();
                if (activeTab && activeTab.title) {
                    context.documentTitle = activeTab.title;
                }
            } catch (error) {
                console.warn('[AdaptiveJobController] Error getting active tab:', error);
                // Continue without document title - not critical
            }
        }
        
        return context.available ? context : null;
    }

    /**
     * Feature support checks
     */
    supportsEnhancedFeatures(jobType) {
        return jobType && (
            jobType.startsWith('question-answering') || 
            jobType === 'question-answering-master'
        );
    }

    supportsRealtimeAPI(jobType) {
        const config = this.pollingConfig[jobType];
        return config && config.useRealtimeAPI;
    }

    shouldUseSyntheticProgress(jobType) {
        const config = this.pollingConfig[jobType];
        return config && config.enableSyntheticProgress && this.enhancedFeatures.syntheticProgress;
    }

    /**
     * Enhanced cleanup
     */
    stopTracking(jobId) {
        // Clean up enhanced features
        this.questionCompletions.delete(jobId);
        this.lastCompletionCheck.delete(jobId);
        this.syntheticProgress.delete(jobId);
        this.realtimeApiErrors.delete(jobId);
        
        // Call parent cleanup
        super.stopTracking(jobId);
    }

    /**
     * TEST METHOD: Simulate a question completion for testing the grid update flow
     */
    /**
     * Get available item IDs from the grid for testing
     */
    getGridItemIds() {
        // Try to find grid data from the global window object
        const gridData = window.agGrid?.gridData || window.currentGridData;
        if (gridData && Array.isArray(gridData)) {
            const itemIds = gridData.map(row => row.item_id).filter(Boolean);
            return itemIds;
        }
        
        // Try alternative approach - look for grid component
        const gridElement = document.querySelector('[data-grid-container]') || document.querySelector('.ag-grid');
        if (gridElement && gridElement.gridApi) {
            const rowData = [];
            const itemIds = [];
            
            gridElement.gridApi.forEachNode(node => {
                if (node.data) {
                    rowData.push(node.data);
                    
                    // Use the main item ID field
                    if (node.data.project_document_stage_group_id_item_id) {
                        itemIds.push(node.data.project_document_stage_group_id_item_id);
                    }
                }
            });
            
            return itemIds;
        }
        
        return [];
    }
    
    testQuestionCompletion(jobId, itemId = null) {
        // If no itemId provided, try to get one from the grid
        if (!itemId) {
            const availableIds = this.getGridItemIds();
            itemId = availableIds.length > 0 ? availableIds[0] : 'test-item-123';
        }
        
        const testCompletion = {
            item_id: itemId,
            job_id: jobId,
            status: 'COMPLETED',
            processing_completed_at: new Date().toISOString(),
            answer: {
                answer_text: 'TEST ANSWER: This is a simulated completion for testing the grid update flow',
                ai_answer_text: 'TEST ANSWER: This is a simulated completion for testing the grid update flow',
                generated_datetime: new Date().toISOString(),
                completeness: 0.95,
                risk_rating: 1
            }
        };
        
        this.notifyQuestionCompletion(jobId, testCompletion);
        
        return testCompletion;
    }
    
    /**
     * Diagnostic method to trace the complete data flow
     */
    diagnoseDataFlow(jobId) {
        // 1. Check job state
        const jobRec = this.jobsMap[jobId];
        
        // 2. Check grid state
        const gridItemIds = this.getGridItemIds();
        
        // 3. Check stored completions
        const storedCompletions = this.questionCompletions.get(jobId) || [];
        
        // 4. Check event listeners
        document.dispatchEvent(new CustomEvent('diagnostic-test', {
            detail: { source: 'AdaptiveJobController', jobId }
        }));
        
        return {
            jobRecord: jobRec,
            gridItemIds,
            storedCompletions,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Initialize adaptive job controller
     */
    async initialize() {
        // Restore active jobs with cross-session recovery
        await this.restoreActiveJobs();
        
        // Start periodic job refresh if authenticated
        if (localStorage.getItem("authToken")) {
            setTimeout(() => this.refreshAllJobs(), 2000);
        }
    }
}