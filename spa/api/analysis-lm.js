// File: api/analysis-lm.js

import { getAuthHeader, logout } from "./auth.js";
import { getBaseUrl } from "../utils/config.js";
import { getStageIdForDataSource } from "../ui/framework/document-task-type-definitions.js";

/**
 * Fetches available process definitions for the authenticated user's subtenant.
 * Uses the new /analysis-lm-process-definitions endpoint.
 *
 * @param {boolean} returnAllVersions - Whether to return all versions or just latest (default: false).
 * @returns {Promise<Array>} Array of process definition objects.
 */
export async function fetchProcessDefinitions(returnAllVersions = false) {
  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/analysis-lm-process-definitions`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        returnAllVersions: returnAllVersions
      })
    });
    
    if (response.status === 401) {
      logout();
      throw new Error("Unauthorized: token invalid");
    }
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error fetching process definitions: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.process_definitions || [];
    
  } catch (err) {
    console.error("[analysis-lm] fetchProcessDefinitions error:", err);
    throw err;
  }
}

/**
 * Fetches the process configuration. This contains the definition of the end-to-end
 * task including input parameters, steps and interdependencies.
 * Uses the existing /analysis-lm-process-config endpoint.
 *
 * @param {string} processDefId - The process definition ID.
 * @returns {Promise<object>} The process configuration.
 */
export async function fetchProcessConfig(processDefId) {
  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/analysis-lm-process-config`;
  const body = { process_def_id: processDefId };
  try {
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
      throw new Error("Unauthorized: token invalid");
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error fetching process config: HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("[analysis-lm] fetchProcessConfig error:", err);
    throw err;
  }
}

/**
 * Starts the AnalysisLM process with enhanced support for Lambda runtime parameters.
 * Uses the existing /analysis-lm-start endpoint.
 *
 * @param {object} payload - The payload to start the process.
 * @param {string} payload.process_def_id - The process definition ID.
 * @param {object} payload.external_inputs - Text inputs for the process.
 * @param {object} payload.external_inputs_s3_objects - S3 object references.
 * @param {object} payload.external_parameters - UI form parameters.
 * @param {object} [payload.lambda_runtime_parameters] - Runtime parameters for Lambda functions.
 * @param {string} [payload.lambda_runtime_parameters.project_document_id] - Project document ID.
 * @param {string} [payload.lambda_runtime_parameters.stage_id] - Stage ID.
 * @returns {Promise<object>} The result containing job details with analysis_lm_ prefixes.
 */
export async function startProcess(payload) {
  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/analysis-lm-start`;
  
  // Validate required Lambda runtime parameters if process uses Lambda functions
  if (payload.lambda_runtime_parameters) {
    console.log("[analysis-lm] Starting process with Lambda runtime parameters:", payload.lambda_runtime_parameters);
  }
  
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
      throw new Error("Unauthorized: token invalid");
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error starting process: HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("[analysis-lm] startProcess error:", err);
    throw err;
  }
}

/**
 * Retrieves the AnalysisLM job status. Used for polling an active job.
 * Uses the existing /analysis-lm-job-status endpoint.
 *
 * @param {string} analysisLmJid - The analysis LM job ID.
 * @param {string} analysisLmCreatedDatetime - The job creation datetime.
 * @returns {Promise<object>} The job status result with analysis_lm_ prefixes.
 */
export async function getJobStatus(analysisLmJid, analysisLmCreatedDatetime) {
  const baseUrl = getBaseUrl("main");
  const url = `${baseUrl}/analysis-lm-job-status`;
  const body = {
    analysis_lm_jid: analysisLmJid,
    analysis_lm_created_datetime: analysisLmCreatedDatetime
  };
  try {
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
      throw new Error("Unauthorized: token invalid");
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error fetching job status: HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("[analysis-lm] getJobStatus error:", err);
    throw err;
  }
}

/**
 * Helper function to extract Lambda runtime parameters from document context.
 * This now uses the same logic as the framework's _getAvailableLambdaParameters method.
 *
 * @param {object} docTaskInstance - The document task instance.
 * @param {object} processConfig - The process configuration.
 * @param {string} stageId - The current stage ID.
 * @returns {object} Lambda runtime parameters object.
 */
export function extractLambdaRuntimeParameters(docTaskInstance, processConfig, stageId) {
  const lambdaParams = {};
  
  // Check if process definition requires Lambda runtime parameters
  if (!processConfig.lambda_runtime_parameters || !Array.isArray(processConfig.lambda_runtime_parameters)) {
    return lambdaParams;
  }
  
  const requiredParams = processConfig.lambda_runtime_parameters;
  
  // -------- project_document_id ---------------------------------
  // Preferred format is "{projectId}#{documentId}"
  if (requiredParams.includes('project_document_id')) {
    if (docTaskInstance?.projectId && docTaskInstance?.documentId) {
      lambdaParams.project_document_id = `${docTaskInstance.projectId}#${docTaskInstance.documentId}`;
    } else if (docTaskInstance?.projectId) {
      // fall-back: we at least know which project we're in
      lambdaParams.project_document_id = docTaskInstance.projectId;
    } else if (docTaskInstance?.documentId) {
      // absolute last resort
      lambdaParams.project_document_id = docTaskInstance.documentId;
    }
  }
  
  // -------- stage_id --------------------------------------------
  if (requiredParams.includes('stage_id') && stageId) {
    // Determine the correct task type and data source name from the document instance
    const taskType = docTaskInstance?.taskType;
    let dataSourceName = "questions"; // default fallback
    
    if (taskType === "security_questionnaire_workflow") {
      dataSourceName = "security_questions";
    } else if (taskType === "rfp_question_list_new_framework") {
      dataSourceName = "questions";
    }
    
    console.log(`[analysis-lm] Extracting stage_id for taskType: ${taskType}, dataSourceName: ${dataSourceName}`);
    
    try {
      lambdaParams.stage_id = getStageIdForDataSource(taskType, dataSourceName);
    } catch (error) {
      console.error(`[analysis-lm] Error getting stage_id for taskType ${taskType}, dataSourceName ${dataSourceName}:`, error);
      // Fallback to the current stageId if lookup fails
      lambdaParams.stage_id = stageId;
    }
  }
  
  // Log for debugging
  console.log("[analysis-lm] Extracted Lambda runtime parameters:", lambdaParams);
  
  // Validate that all required parameters are present
  const missingParams = requiredParams.filter(param => !lambdaParams[param]);
  if (missingParams.length > 0) {
    console.warn("[analysis-lm] Missing Lambda runtime parameters:", missingParams);
  }
  
  return lambdaParams;
}

/**
 * Enhanced payload builder that includes Lambda runtime parameters.
 * Now passes stageId to extractLambdaRuntimeParameters.
 *
 * @param {object} config - Configuration object.
 * @param {string} config.processDefId - Process definition ID.
 * @param {object} config.externalInputs - External inputs.
 * @param {object} config.uploadedUrls - Uploaded file URLs.
 * @param {object} config.externalParameters - External parameters.
 * @param {object} config.docTaskInstance - Document task instance.
 * @param {object} config.processConfig - Process configuration.
 * @param {string} config.stageId - Current stage ID.
 * @returns {object} Complete payload for startProcess.
 */
export function buildStartProcessPayload({
  processDefId,
  externalInputs,
  uploadedUrls,
  externalParameters,
  docTaskInstance,
  processConfig,
  stageId  // Required parameter
}) {
  const payload = {
    process_def_id: processDefId,
    external_inputs: externalInputs || {},
    external_inputs_s3_objects: uploadedUrls || {},
    external_parameters: externalParameters || {}
  };
  
  // Add Lambda runtime parameters if the process definition requires them
  if (processConfig && processConfig.lambda_runtime_parameters) {
    payload.lambda_runtime_parameters = extractLambdaRuntimeParameters(
      docTaskInstance, 
      processConfig, 
      stageId
    );
  }
  
  return payload;
}