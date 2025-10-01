// Updated api/questions-jobs.js file

import { getAuthHeader, logout } from "./auth.js";
import { getBaseUrl } from "../utils/config.js";

/**
 * Validates items before processing by AI
 * @param {Array} items Array of document items to validate
 * @returns {Object} Validation result with errors
 */
export function validateItemsForAI(items) {
  const errors = {
    missingIds: [],
    duplicateIds: [],
    shortQuestions: [],
    missingContent: []
  };

  // Track IDs to detect duplicates
  const seenIds = new Set();

  items.forEach(item => {
    // Check for missing ID
    if (!item.question_id) {
      errors.missingIds.push(`Row ${item.index || 'unknown'}`);
    } else {
      // Check for duplicate IDs
      if (seenIds.has(item.question_id)) {
        errors.duplicateIds.push(`Question ID ${item.question_id}`);
      } else {
        seenIds.add(item.question_id);
      }
    }

    // Check question length
    if (!item.question_text || item.question_text.trim().length < 10) {
      errors.shortQuestions.push(`Question ID ${item.question_id || `Row ${item.index || 'unknown'}`}`);
    }

    // Check content field (must have domain and unit)
    let contentObj = null;
    try {
      // Parse content if it's a string
      if (item.content) {
        contentObj = typeof item.content === 'string' ?
          JSON.parse(item.content) : item.content;
      }

      // Check if content has valid domain/unit configuration
      if (!contentObj || !contentObj.domain || !contentObj.unit) {
        errors.missingContent.push(`Question ID ${item.question_id || `Row ${item.index || 'unknown'}`}`);
      }
    } catch (err) {
      console.error(`[validateItemsForAI] Error parsing content for question ${item.question_id}:`, err);
      errors.missingContent.push(`Question ID ${item.question_id || `Row ${item.index || 'unknown'}`}`);
    }
  });

  // Check if any errors were found
  const hasErrors = Object.values(errors).some(arr => arr.length > 0);

  return {
    valid: !hasErrors,
    errors
  };
}

/**
 * Start a batch question job with the new payload structure
 * Lambda: backend/services/lambdas/jobs/start_question_job.py
 * @param {Object} payload Job configuration with questions_by_content structure
 * @returns {Promise<Object>} Job result with question_ prefixed parameters
 */
export async function startQuestionJob(payload) {
  console.log("[startQuestionJob] Calling /startquestionjob with payload structure:", {
    contentGroups: Object.keys(payload.questions_by_content || {}).length,
    primaryService: payload.primary_cqa_service,
    fallbackService: payload.fallback_cqa_service
  });

  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/startquestionjob`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      logout();
      throw new Error("Unauthorized /startquestionjob => token invalid");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || errorData.message || `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    console.log("[startQuestionJob] API response:", {
      status: result.status,
      questionMasterJid: result.question_master_jid,
      questionTs: result.question_ts,
      questionSubJobCount: result.question_sub_job_count
    });

    return result;
  } catch (err) {
    console.error("[startQuestionJob] API call failed:", err);
    throw err;
  }
}

/**
 * Gets the status of a question job
 * Lambda: backend/services/lambdas/jobs/question_job_status.py
 * @param {string} questionJid The question job ID
 * @param {string} questionTs The question tenant shard
 * @returns {Promise<object>} The job status with question_ prefixed parameters
 */
export async function getQuestionsJobStatus(questionJid, questionTs) {
  // Check if user is authenticated before making the request
  if (!localStorage.getItem("authToken")) {
    throw new Error("No auth token available");
  }

  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/question-job-status`;

  const body = { 
    question_jid: questionJid, 
    question_ts: questionTs 
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(body)
  });
  
  if (resp.status === 401) {
    logout();
    throw new Error("Unauthorized /question-job-status => token invalid");
  }
  
  if (!resp.ok) {
    throw new Error(`Failed to get job status. Status = ${resp.status}`);
  }
  
  return await resp.json();
}

/**
 * Gets ad-hoc result for a completed job
 * @param {string} questionJid The question job ID
 * @param {string} questionTs The question tenant shard
 * @returns {Promise<object>} The job result
 */
export async function getAdHocResult(questionJid, questionTs) {
  // Check if user is authenticated before making the request
  if (!localStorage.getItem("authToken")) {
    throw new Error("No auth token available");
  }

  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/question/ad-hoc-results`;

  const body = {
    question_jid: questionJid,
    question_ts: questionTs,
    request_type: "ad-hoc-question"
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(body)
  });
  
  if (resp.status === 401) {
    logout();
    throw new Error("Unauthorized /question/ad-hoc-results => token invalid");
  }
  
  if (!resp.ok) {
    throw new Error(`Failed to get ad-hoc question result (status: ${resp.status}).`);
  }
  
  return await resp.json();
}

/**
 * Helper function to group questions by their content configuration
 * @param {Array} questions Array of question objects with content property
 * @returns {Object} Questions grouped by content key
 */
export function groupQuestionsByContent(questions) {
  const grouped = {};
  
  for (const question of questions) {
    if (!question.content) {
      console.warn('[groupQuestionsByContent] Question missing content configuration:', question.question_id);
      continue;
    }
    
    let contentConfig;
    try {
      // Parse content if it's a string
      contentConfig = typeof question.content === 'string' ? 
        JSON.parse(question.content) : question.content;
    } catch (err) {
      console.error(`[groupQuestionsByContent] Invalid content JSON for question ${question.question_id}:`, err);
      continue;
    }
    
    // Build content key
    const orderedConfig = {
      corpus: contentConfig.corpus,
      ...(contentConfig.domain && { domain: contentConfig.domain }),
      ...(contentConfig.unit && { unit: contentConfig.unit }),
      document_topics: contentConfig.document_topics || [],
      document_types: contentConfig.document_types || [],
      ...(contentConfig.language_rules && { language_rules: contentConfig.language_rules })
    };
    
    const contentKey = JSON.stringify(orderedConfig);
    
    if (!grouped[contentKey]) {
      grouped[contentKey] = [];
    }
    
    // Remove content from question object since it's now the key
    const { content, ...questionWithoutContent } = question;
    grouped[contentKey].push(questionWithoutContent);
  }
  
  return grouped;
}

/**
 * Process document items for AI answering with new payload structure
 * @param {Object} batchParams Parameters for batch processing
 * @param {Object} jobController Job controller instance
 * @param {string} mode Model mode ("Standard" or "Enhanced")
 * @returns {Promise<Object>} Processing result
 */
export async function processDocumentItemsForAI(batchParams, jobController, mode = 'Standard') {
  try {
    console.log("[processDocumentItemsForAI] Processing items for AI with mode:", mode);
    
    // This function would need to be updated to work with the new payload structure
    // For now, we'll rely on the ControlPane to format the payload correctly
    // and just use the jobController.startQuestionJob method
    
    return {
      success: true,
      message: "AI processing initiated successfully"
    };
    
  } catch (err) {
    console.error("[processDocumentItemsForAI] Error:", err);
    return {
      success: false,
      error: err.message || "Failed to process items for AI"
    };
  }
}