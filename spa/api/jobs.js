// File: api/jobs.js

import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader, logout } from "./auth.js";

/**
 * Syncs job history for a document.
 * Lambda: backend/services/lambdas/documents/sync_document_job_history.py
 * 
 * Expects an object with:
 *   - document_id: string (document identifier)
 *   - project_id: string (raw composite project ID, e.g., "acct_23X#proj_001")
 *   - new_jobs: Array of job objects to add.
 *       Each job must include: stageId, jobId, jobType, status, and optionally progress, timestamp, metadata.
 *   - updated_jobs: Array of job objects to update.
 *
 * Returns a promise that resolves to the updated document record.
 */
export async function syncDocumentJobHistory({ document_id, project_id, new_jobs = [], updated_jobs = [] }) {
  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/documents/sync-job-history`;

  const payload = {
    document_id,
    project_id,
    new_jobs,
    updated_jobs
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      logout();
      throw new Error("Unauthorized /documents/sync-job-history => token invalid");
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Error syncing document job history");
    }

    return await response.json();
  } catch (error) {
    console.error("[jobsApi] Error syncing document job history:", error);
    throw error;
  }
}


/**
 * Helper function to format job entry for document job history
 * @param {string} jobId - Job ID
 * @param {string} stageId - Stage ID
 * @param {string} status - Job status
 * @param {object} metadata - Optional metadata
 * @returns {object} - Formatted job entry
 */
export function formatJobHistoryEntry(jobId, stageId, status, metadata = {}) {
  return {
    jobId,
    stageId,
    jobType: metadata.jobType || "analysis-lm",
    status,
    progress: status === "COMPLETED" ? 100 : status === "RUNNING" ? 50 : 0,
    timestamp: new Date().toISOString(),
    metadata,
    // Include the username from metadata if available; otherwise default to "Unknown"
    username: metadata.username || "Unknown"
  };
}


/**
 * Helper to generate a human-readable job title when none is provided
 * @private
 */
function _generateJobTitle(job) {
  if (job.request_type) {
    switch (job.request_type) {
      case 'analysis-lm':
        return 'AnalysisLM Evaluation';
      case 'batch-questions':
        return 'Batch Questions Analysis';
      case 'single-question':
        return 'Single Question Processing';
      default:
        return job.request_type.split('-').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
  }
  return `Job ${job.question_jid || job.analysis_lm_jid || 'Unknown'}`;
}

/**
 * Get active jobs count
 * Returns the number of currently active (RUNNING) jobs
 */
export async function getActiveJobsCount() {
  try {
    const jobs = await fetchJobs({ activeOnly: true });
    return jobs.length;
  } catch (error) {
    console.error("[jobsApi] Error getting active job count:", error);
    return 0;
  }
}

/**
 * Fetches jobs with optional filters
 * Lambda: backend/services/lambdas/jobs/jobs_list.py
 * @param {object} options Filter options
 * @returns {Promise<Array>} Filtered array of job objects
 */
export async function fetchJobs({
  status = null,
  type = null,
  startDate = null,
  endDate = null,
  limit = null,
  activeOnly = false
}) {
  console.log("[jobsApi] Fetching jobs with filters:", {
    status, type, startDate, endDate, limit, activeOnly
  });

  // Check if user is authenticated before making the request
  if (!localStorage.getItem("authToken")) {
    console.log("[jobsApi] No auth token available, skipping job fetch");
    return [];
  }

  // Use deduplication to prevent multiple identical calls
  const { deduplicateRequest } = await import("../utils/request-deduplication.js");
  
  return deduplicateRequest(
    'fetchJobs',
    { status, type, startDate, endDate, limit: limit || 20, activeOnly },
    async () => {
      const baseUrl = getBaseUrl("main");
      const url = `${baseUrl}/jobs/list-jobs`;

      const requestBody = {
        limit: limit || 20
      };

      if (status) requestBody.status = status;
      if (type) requestBody.type = type;
      if (startDate) requestBody.start_date = startDate;
      if (endDate) requestBody.end_date = endDate;
      if (activeOnly) requestBody.active_only = true;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader()
          },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 401) {
          logout();
          throw new Error("Unauthorized /jobs/list-jobs => token invalid");
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch jobs. Status = ${response.status}`);
        }

        const responseData = await response.json();

        // Handle different response structures
        let jobs;
        if (Array.isArray(responseData)) {
          jobs = responseData;
        } else if (responseData.jobs && Array.isArray(responseData.jobs)) {
          jobs = responseData.jobs;
        } else if (responseData.Items && Array.isArray(responseData.Items)) {
          jobs = responseData.Items;
        } else {
          console.warn("[jobsApi] Unexpected response structure:", responseData);
          return [];
        }

        // Process jobs to ensure consistent structure with proper job ID fields
        return jobs.map(job => ({
          // Use appropriate job ID field based on job type
          question_jid: job.question_jid || (job.request_type?.includes('question') ? job.job_id : null),
          analysis_lm_jid: job.analysis_lm_jid || (job.request_type?.includes('analysis-lm') ? job.analysis_lm_jid : null),
          title: job.title || _generateJobTitle(job),
          status: job.status || "UNKNOWN",
          progress: job.progress || 0,
          request_type: job.request_type || "unknown",
          start_datetime: job.start_datetime || job.analysis_lm_created_datetime,
          analysis_lm_steps_completed: job.analysis_lm_steps_completed || job.steps_completed || 0,
          analysis_lm_steps_total: job.analysis_lm_steps_total || job.steps_total || 1,
          question_batch_count: job.question_batch_count || job.batch_count,
          question_batches_completed: job.question_batches_completed || job.batches_completed,
          question_ts: job.question_ts,
          result_url: job.result_url || null,
          error_message: job.error_message || null,
          job_source: job.job_source || "unknown",
          ...job
        }));
      } catch (error) {
        console.error("[jobsApi] Error fetching jobs:", error);
        // Return empty array instead of throwing to make the UI more resilient
        return [];
      }
    },
    10000 // Cache for 10 seconds since job status can change frequently
  );
}

/**
 * Cancels a question job
 * Lambda: backend/services/lambdas/jobs/cancel_job.py
 * @param {string} questionJobId The job ID
 * @param {string} questionTS The partition key
 * @returns {Promise<object>} The cancellation result
 */
export async function cancelJob(questionJobId, questionTS) {
  // Check if user is authenticated before making the request
  if (!localStorage.getItem("authToken")) {
    throw new Error("No auth token available");
  }

  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/question-cancel-job`;

  const body = { question_jid: questionJobId, question_ts: questionTS };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(body)
  });
  if (response.status === 401) {
    logout();
    throw new Error("Unauthorized /question-cancel-job => token invalid");
  }
  if (!response.ok) {
    throw new Error("Failed to cancel job");
  }
  return await response.json();
}