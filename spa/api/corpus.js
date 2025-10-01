// File: api/corpus.js
import { getAuthHeader, logout } from "../api/auth.js";
import { getBaseUrl } from "../utils/config.js";

/**
 * Handle API errors consistently
 * @param {Response} response - Fetch Response object 
 * @param {string} endpoint - API endpoint for logging
 * @returns {Promise<Object>} - Parsed error response or default error
 */
async function _handleApiError(response, endpoint) {
  // Handle 401 Unauthorized errors
  if (response.status === 401) {
    logout();
    throw new Error(`Unauthorized ${endpoint} => token invalid`);
  }

  // Try to parse the error response as JSON
  let errorMessage = `HTTP ${response.status}`;
  try {
    const errorData = await response.json();
    errorMessage = errorData.error || errorMessage;
  } catch (e) {
    console.error(`Could not parse error response from ${endpoint}:`, e);
  }

  throw new Error(errorMessage);
}

/**
 * Creates a new corpus
 * Lambda: backend/services/lambdas/corpus/create_corpus.py
 * @param {Object} params - Parameters object
 * @param {string} params.name - Name for the new corpus
 * @returns {Promise<Object>} - Response data
 */
export async function createCorpus({ name }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/create`;

    // Validate name
    if (!name || typeof name !== 'string') {
      throw new Error("Corpus name is required and must be a string");
    }

    //console.log("[corpus.js] Creating new corpus with name:", name);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/create");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling createCorpus:', error);
      throw new Error('Network error: Could not connect to the API. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * List documents under selected folder with filters
 * Lambda: backend/services/lambdas/corpus/structure/list_corpus_documents.py
 * @param {Object} params - Parameters object
 * @param {string} params.folderPath - Path to folder
 * @param {Object} params.filters - Filter criteria (topic, type, status, author)
 * @returns {Promise<Object>} Array of document objects
 */
export async function listCorpusDocuments({ folderPath, filters }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/documents/list`;

    // Ensure folderPath is provided and is a string
    if (!folderPath || typeof folderPath !== 'string') {
      throw new Error("folderPath is required and must be a string");
    }

    // Ensure filters is an object
    const safeFilters = filters || {};

    const body = {
      folderPath,
      filters: safeFilters
    };


    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/documents/list");
    }

    const result = await resp.json();
    return result;
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling listCorpusDocuments:', error);
      throw new Error('Network error: Could not connect to the API. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Get document details and content
 * Lambda: backend/services/lambdas/corpus/management/get_corpus_document_details.py
 * @param {Object} params - Parameters object
 * @param {string} params.documentKey - Document key
 * @param {string} [params.versionId] - Optional specific version ID
 * @returns {Promise<Object>} Document details including content
 */
export async function getCorpusDocumentDetails({ documentKey, versionId = null }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/documents/get-details`;

    // Ensure documentKey is provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    const body = { documentKey, versionId };
    //console.log("[corpus.js] Getting document details with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/documents/get-details");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling getCorpusDocumentDetails:', error);
      throw new Error('Network error: Could not retrieve document details. Please try again later.');
    }

    throw error;
  }
}

/**
 * List all versions of a corpus document
 * Lambda: backend/services/lambdas/corpus/management/list_corpus_document_versions.py
 * @param {Object} params - Parameters object
 * @param {string} params.documentKey - Document key
 * @returns {Promise<Object>} Object containing versions array and metadata
 */
export async function listCorpusDocumentVersions({ documentKey }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/documents/list-versions`;

    // Ensure documentKey is provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    const body = { documentKey };
    //console.log("[corpus.js] Listing document versions with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/documents/list-versions");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling listCorpusDocumentVersions:', error);
      throw new Error('Network error: Could not retrieve document versions. Please try again later.');
    }

    throw error;
  }
}

/**
 * Submit document for approval workflow
 * Lambda: backend/services/lambdas/corpus/management/submit_corpus_document_for_approval.py
 * @param {Object} params - Parameters object
 * @param {string} params.documentKey - Document key
 * @param {string} [params.versionId] - Optional specific version ID (defaults to latest)
 * @returns {Promise<Object>} Success response with status
 */
export async function submitCorpusDocumentForApproval({ documentKey, versionId = null }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/documents/submit-for-approval`;

    // Ensure documentKey is provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    const body = { documentKey, versionId };
    //console.log("[corpus.js] Submitting document for approval with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/documents/submit-for-approval");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling submitCorpusDocumentForApproval:', error);
      throw new Error('Network error: Could not submit document for approval. Please try again later.');
    }

    throw error;
  }
}

/**
 * Delete a document (permanent or soft, depending on permissions)
 * Lambda: backend/services/lambdas/corpus/management/delete_corpus_document.py
 * @param {Object} params - Parameters object
 * @param {string} params.documentKey - Document key
 * @returns {Promise<Object>} Success response
 */
export async function deleteCorpusDocument({ documentKey, deleteType = 'soft' }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/documents/delete`;

    // Ensure documentKey is provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    const body = { documentKey, deleteType };
    //console.log("[corpus.js] Deleting document with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/documents/delete");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling deleteCorpusDocument:', error);
      throw new Error('Network error: Could not delete document. Please try again later.');
    }

    throw error;
  }
}

/**
 * Save document as draft (creates new version)
 * Lambda: backend/services/lambdas/corpus/management/save_corpus_document_draft.py
 * @param {Object} params - Parameters object
 * @param {string} params.documentKey - Document key (null for new document)
 * @param {string} params.content - Document content
 * @param {Object} params.metadata - Metadata including topic, type, etc.
 * @returns {Promise<Object>} Success response with version ID
 */
export async function saveCorpusDocumentDraft({ documentKey, content, metadata }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/documents/save-draft`;

    // Ensure content is provided
    if (!content) {
      throw new Error("content is required");
    }

    // Ensure metadata is an object
    if (!metadata || typeof metadata !== 'object') {
      throw new Error("metadata is required and must be an object");
    }

    const body = { documentKey, content, metadata };
    //console.log("[corpus.js] Saving document draft with body (content truncated):", {
    //    ...body,
    //    content: content.substring(0, 100) + '...'
    //});

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/documents/save-draft");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling saveCorpusDocumentDraft:', error);
      throw new Error('Network error: Could not save document draft. Please try again later.');
    }

    throw error;
  }
}


/**
 * Get documents pending approval for a user's group
 * Lambda: backend/services/lambdas/corpus/approval/get_corpus_approval_queue.py
 * @param {Object} params Parameters object
 * @param {string} [params.approverGroup] Approver group name (uses user's group if omitted)
 * @param {Object} [params.filters] Filter criteria (corpus, topic, type, status, dates)
 * @param {Object} [params.pagination] Pagination options
 * @returns {Promise<Object>} List of pending documents
 */
export async function getCorpusApprovalQueue({ approverGroup = null, filters = {}, pagination = {} }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/approval/queue`;

    const body = {
      approverGroup,
      filters,
      pagination
    };

    //console.log("[corpus.js] Getting corpus approval queue with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/approval/queue");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling getCorpusApprovalQueue:', error);
      throw new Error('Network error: Could not retrieve approval queue. Please try again later.');
    }

    throw error;
  }
}

/**
 * Claim a document for review by the current user
 * Lambda: backend/services/lambdas/corpus/approval/claim_document.py
 * @param {Object} params Parameters object
 * @param {string} params.documentKey Document key
 * @param {string} params.versionId Document version ID
 * @returns {Promise<Object>} Success response
 */
export async function claimCorpusDocument({ documentKey, versionId }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/approval/claim`;

    // Ensure documentKey is provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    const body = { documentKey, versionId };
    //console.log("[corpus.js] Claiming document with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/approval/claim");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling claimCorpusDocument:', error);
      throw new Error('Network error: Could not claim document. Please try again later.');
    }

    throw error;
  }
}

/**
 * Release a document back to the queue
 * Lambda: backend/services/lambdas/corpus/approval/release_document.py
 * @param {Object} params Parameters object 
 * @param {string} params.documentKey Document key
 * @param {string} params.versionId Document version ID
 * @returns {Promise<Object>} Success response
 */
export async function releaseCorpusDocument({ documentKey, versionId }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/approval/release`;

    // Ensure documentKey is provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    const body = { documentKey, versionId };
    //console.log("[corpus.js] Releasing document with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/approval/release");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling releaseCorpusDocument:', error);
      throw new Error('Network error: Could not release document. Please try again later.');
    }

    throw error;
  }
}

/**
 * Get HTML diff between document versions
 * Lambda: backend/services/lambdas/corpus/approval/get_corpus_document_diff.py
 * @param {Object} params Parameters object
 * @param {string} params.documentKey Document key
 * @param {string} params.newVersionId New version ID
 * @param {string} [params.oldVersionId] Optional old version ID (defaults to last approved)
 * @param {string} [params.base] Base comparison ('lastApproved' or specific version ID)
 * @returns {Promise<Object>} HTML diff and metadata
 */
export async function getCorpusDocumentDiff({ documentKey, newVersionId, oldVersionId = null, base = 'lastApproved' }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/approval/diff`;

    // Ensure documentKey and newVersionId are provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    if (!newVersionId) {
      throw new Error("newVersionId is required");
    }

    const body = {
      documentKey,
      newVersionId,
      oldVersionId: oldVersionId || null,
      base: !oldVersionId ? base : null
    };

    //console.log("[corpus.js] Getting document diff with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/approval/diff");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling getCorpusDocumentDiff:', error);
      throw new Error('Network error: Could not retrieve document diff. Please try again later.');
    }

    throw error;
  }
}

/**
 * Approve a document
 * Lambda: backend/services/lambdas/corpus/approval/approve_corpus_document.py
 * @param {Object} params Parameters object
 * @param {string} params.documentKey Document key
 * @param {string} params.versionId Document version ID
 * @param {string} [params.note] Optional reviewer note
 * @returns {Promise<Object>} Success response
 */
export async function approveCorpusDocument({ documentKey, versionId, note = '' }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/approval/approve`;

    // Ensure documentKey and versionId are provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    if (!versionId) {
      throw new Error("versionId is required");
    }

    const body = { documentKey, versionId, note };
    //console.log("[corpus.js] Approving document with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/approval/approve");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling approveCorpusDocument:', error);
      throw new Error('Network error: Could not approve document. Please try again later.');
    }

    throw error;
  }
}

/**
 * Reject a document
 * Lambda: backend/services/lambdas/corpus/approval/reject_corpus_document.py
 * @param {Object} params Parameters object
 * @param {string} params.documentKey Document key
 * @param {string} params.versionId Document version ID
 * @param {string} params.note Required reviewer note
 * @returns {Promise<Object>} Success response
 */
export async function rejectCorpusDocument({ documentKey, versionId, note }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/approval/reject`;

    // Ensure documentKey, versionId, and note are provided
    if (!documentKey) {
      throw new Error("documentKey is required");
    }

    if (!versionId) {
      throw new Error("versionId is required");
    }

    if (!note || !note.trim()) {
      throw new Error("note is required when rejecting a document");
    }

    const body = { documentKey, versionId, note };
    //console.log("[corpus.js] Rejecting document with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/approval/reject");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling rejectCorpusDocument:', error);
      throw new Error('Network error: Could not reject document. Please try again later.');
    }

    throw error;
  }
}

/**
 * Creates a new folder in the corpus structure (corpus, domain, or unit)
 * @param {Object} params - Parameters object
 * @param {string} params.entityType - Type of entity to create ('corpus', 'domain', or 'unit')
 * @param {string} params.corpusPath - Path to the parent entity (e.g., 'rfp' for a domain, 'rfp->quality-and-compliance' for a unit)
 * @param {string} params.name - Name for the new entity (lowercase letters, numbers, and dashes only)
 * @returns {Promise<Object>} - Response data
 */
export async function createCorpusFolder({ entityType, corpusPath, name }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/createfolder`;

    // Validate required parameters
    if (!entityType) {
      throw new Error("entityType is required ('corpus', 'domain', or 'unit')");
    }

    if (!['corpus', 'domain', 'unit'].includes(entityType)) {
      throw new Error("entityType must be one of: 'corpus', 'domain', or 'unit'");
    }

    if (!name || typeof name !== 'string') {
      throw new Error("name is required and must be a string");
    }

    // corpusPath is required for domain and unit, but not for corpus
    if (entityType !== 'corpus' && (!corpusPath || typeof corpusPath !== 'string')) {
      throw new Error("corpusPath is required for domain and unit creation");
    }

    //console.log(`[corpus.js] Creating new ${entityType} with name: ${name} at path: ${corpusPath || ''}`);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entityType,
        corpusPath: corpusPath || '',
        name
      })
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/createfolder");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling createCorpusFolder:', error);
      throw new Error(`Network error: Could not create ${entityType}. Please check your connection and try again.`);
    }

    throw error;
  }
}

/**
 * Deletes a folder from the corpus structure (corpus, domain, or unit)
 * @param {Object} params - Parameters object
 * @param {string} params.entityType - Type of entity to delete ('corpus', 'domain', or 'unit')
 * @param {string} params.corpusPath - Path to the entity to delete 
 *                                    (e.g., 'rfp' for a corpus, 'rfp->quality-and-compliance' for a domain,
 *                                     'rfp->quality-and-compliance->quality-assurance' for a unit)
 * @returns {Promise<Object>} - Response data
 */
export async function deleteCorpusFolder({ entityType, corpusPath }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/deletefolder`;

    // Validate required parameters
    if (!entityType) {
      throw new Error("entityType is required ('corpus', 'domain', or 'unit')");
    }

    if (!['corpus', 'domain', 'unit'].includes(entityType)) {
      throw new Error("entityType must be one of: 'corpus', 'domain', or 'unit'");
    }

    if (!corpusPath || typeof corpusPath !== 'string') {
      throw new Error("corpusPath is required");
    }

    //console.log(`[corpus.js] Deleting ${entityType} at path: ${corpusPath}`);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entityType,
        corpusPath
      })
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/deletefolder");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling deleteCorpusFolder:', error);
      throw new Error(`Network error: Could not delete ${entityType}. Please check your connection and try again.`);
    }

    throw error;
  }
}

/**
 * Quick answer for a single question using S3 Vectors + ModelManager
 * Lambda: backend/services/lambdas/corpus/quick_answer_question.py
 * @param {Object} params - Parameters object
 * @param {string} params.question - The question to answer (REQUIRED)
 * @param {string} params.corpus - Corpus to search (REQUIRED)
 * @param {string} params.model_tier - 'standard' or 'enhanced' (default: 'standard')
 * @param {string} params.index_name - S3 Vector index name (default: 'main-index')
 * @param {number} params.max_chunks - Maximum chunks to retrieve (default: 5)
 * @param {number} params.min_similarity - Minimum similarity threshold (default: 0.7)
 * @returns {Promise<Object>} Answer with sources and metadata
 */
export async function quickAnswerQuestion({
  question,
  corpus,
  model_tier = 'standard',
  index_name = 'main-index',
  max_chunks = 5,
  min_similarity = 0.7
}) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/quick-answer`;

    // Validate required parameters
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new Error("Question is required and must be a non-empty string");
    }

    if (!corpus || typeof corpus !== 'string') {
      throw new Error("Corpus is required and must be a string");
    }

    // Validate model_tier
    if (!['standard', 'enhanced'].includes(model_tier)) {
      throw new Error("model_tier must be 'standard' or 'enhanced'");
    }

    console.log("[corpus.js] Quick answer request:", {
      question: question.substring(0, 50) + "...",
      corpus,
      model_tier,
      index_name
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        question,
        corpus,
        model_tier,
        index_name,
        max_chunks,
        min_similarity
      })
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/quick-answer");
    }

    const result = await resp.json();

    console.log("[corpus.js] Quick answer response:", {
      model_used: result.model_used,
      model_tier: result.model_tier,
      sources_count: result.sources?.length || 0,
      cost: result.cost,
      tokens: result.tokens
    });

    return result;
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus.js] Network error when calling quickAnswerQuestion:', error);
      throw new Error('Network error: Could not get quick answer. Please check your connection and try again.');
    }

    console.error('[corpus.js] Quick answer failed:', error);
    throw error;
  }
}