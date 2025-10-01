// File: api/realtime-jobs.js

import { getBaseUrl } from '../utils/config.js';
import { getAuthHeader } from './auth.js';

/**
 * API client for enhanced realtime job management endpoints
 */

/**
 * Get realtime progress for a job with enhanced question completion data
 * Lambda: backend/services/lambdas/jobs/realtime_progress.py
 * 
 * @param {string} jobId - Master job ID
 * @param {string} [sinceTimestamp] - ISO timestamp to get completions since
 * @param {string} [tenantShard] - Tenant shard (questionTs) for the job
 * @returns {Promise<Object>} Enhanced progress data including recent completions
 */
export async function getRealtimeProgress(jobId, sinceTimestamp = null, tenantShard = null) {
    console.log(`[RealtimeJobsAPI] Getting realtime progress for job ${jobId}`);
    
    try {
        const baseUrl = getBaseUrl("extended");
        const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(jobId)}/realtime-progress`, {
            method: 'POST',
            headers: {
                ...getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                job_id: jobId,
                since_timestamp: sinceTimestamp,
                question_ts: tenantShard
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            console.error(`[RealtimeJobsAPI] API Error:`, {
                status: response.status,
                statusText: response.statusText,
                error: errorData.error || 'Unknown error'
            });
            
            // Handle configuration errors (5xx) prominently
            if (response.status >= 500) {
                console.error(`[RealtimeJobsAPI] Server error detected - backend configuration issue`);
                
                const error = new Error(errorData.error || `Server error: ${response.statusText}`);
                error.status = response.status;
                error.details = errorData.details || 'No additional details';
                error.isConfigurationError = true;
                throw error;
            }
            
            // Handle 404 specially - it might mean the endpoint isn't deployed yet
            if (response.status === 404) {
                console.warn(`[RealtimeJobsAPI] Realtime progress endpoint not found (404). This may indicate the backend Lambda hasn't been deployed yet.`);
                const error = new Error(errorData.error || `Job ${jobId} not found`);
                error.status = 404;
                throw error;
            }
            
            // Handle other client errors
            const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            error.status = response.status;
            error.details = errorData.details;
            throw error;
        }

        const data = await response.json();
        // Log essential progress information
        const completions = data.recent_completions?.length || 0;
        const progress = data.processing_summary?.progress_percentage;
        const status = data.job_status?.status;
        
        if (completions > 0) {
            console.log(`[RealtimeJobsAPI] Received ${completions} completions for job ${jobId} (${progress}% complete, status: ${status})`);
        }
        
        return data;
    } catch (error) {
        console.error(`[RealtimeJobsAPI] Failed to get realtime progress for job ${jobId}:`, error);
        throw error;
    }
}

/**
 * Get all active jobs for the authenticated user (cross-session recovery)
 * Lambda: backend/services/lambdas/jobs/user_active_jobs.py
 * 
 * @returns {Promise<Object>} User's active jobs across sessions
 */
export async function getUserActiveJobs() {
    console.log('[RealtimeJobsAPI] Getting user active jobs for cross-session recovery');
    
    try {
        const baseUrl = getBaseUrl("extended");
        const response = await fetch(`${baseUrl}/user/active-jobs`, {
            method: 'POST',
            headers: {
                ...getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // Empty body, uses Authorization header for user context
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[RealtimeJobsAPI] Retrieved ${data.active_jobs?.length || 0} active jobs for user`);
        
        return data;
    } catch (error) {
        console.error('[RealtimeJobsAPI] Failed to get user active jobs:', error);
        throw error;
    }
}

/**
 * Get document item completions for a specific job
 * Helper function to get completion events using realtime API
 * 
 * @param {string} jobId - Master job ID
 * @param {string} [sinceTimestamp] - ISO timestamp to get completions since
 * @param {number} [limit=20] - Maximum number of completions to return
 * @returns {Promise<Array>} Array of completion events
 */
export async function getDocumentItemCompletions(jobId, sinceTimestamp = null, limit = 20) {
    try {
        const response = await getRealtimeProgress(jobId, sinceTimestamp);
        
        if (!response.enhanced_features_available) {
            console.warn(`[RealtimeJobsAPI] Enhanced features not available for job ${jobId}`);
            return [];
        }
        
        const completions = response.recent_completions || [];
        
        // Apply limit if specified
        if (limit && completions.length > limit) {
            return completions.slice(-limit); // Get most recent
        }
        
        return completions;
    } catch (error) {
        console.error(`[RealtimeJobsAPI] Failed to get completions for job ${jobId}:`, error);
        return [];
    }
}

/**
 * Check if enhanced features are available for a job
 * 
 * @param {string} jobId - Job ID to check
 * @returns {Promise<boolean>} Whether enhanced features are available
 */
export async function checkEnhancedFeaturesAvailable(jobId) {
    try {
        const response = await getRealtimeProgress(jobId);
        return response.enhanced_features_available === true;
    } catch (error) {
        console.error(`[RealtimeJobsAPI] Failed to check enhanced features for job ${jobId}:`, error);
        return false;
    }
}

/**
 * Get job processing statistics
 * 
 * @param {string} jobId - Master job ID
 * @returns {Promise<Object>} Processing statistics summary
 */
export async function getJobProcessingStats(jobId) {
    try {
        const response = await getRealtimeProgress(jobId);
        
        if (!response.enhanced_features_available) {
            return null;
        }
        
        const processingSummary = response.processing_summary || {};
        const realtimeData = response.realtime_data || {};
        
        return {
            total_items: processingSummary.total_items || 0,
            status_counts: processingSummary.status_counts || {},
            progress_percentage: processingSummary.progress_percentage || 0,
            recent_activity: (response.recent_completions || []).length,
            processing_active: realtimeData.processing_active || false,
            completion_rate: realtimeData.completion_rate || 0,
            estimated_completion: realtimeData.estimated_completion || null,
            last_updated: processingSummary.timestamp || new Date().toISOString()
        };
    } catch (error) {
        console.error(`[RealtimeJobsAPI] Failed to get processing stats for job ${jobId}:`, error);
        return null;
    }
}