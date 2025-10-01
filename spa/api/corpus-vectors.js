// File: api/corpus-vectors.js
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
 * Create a new vector index for a corpus
 * Lambda: backend/services/lambdas/corpus/vectors/manage_vector_index.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID (e.g., "rfp", "cognaire")
 * @param {string} params.granularity - Index granularity ("corpus", "domain", "unit", "topic", "custom")
 * @param {Object} params.filters - Filter criteria (domain, unit, document_topic)
 * @param {string} [params.index_name] - Optional custom index name
 * @returns {Promise<Object>} - Response with index creation details
 */
export async function createVectorIndex({ corpus_id, granularity, filters = {}, index_name = null }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/manage-index`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    if (!granularity || typeof granularity !== 'string') {
      throw new Error("granularity is required and must be a string");
    }

    const validGranularities = ['corpus', 'domain', 'unit', 'topic', 'custom'];
    if (!validGranularities.includes(granularity)) {
      throw new Error(`granularity must be one of: ${validGranularities.join(', ')}`);
    }

    const body = {
      operation: 'create_index',
      corpus_id,
      granularity,
      filters: filters || {},
      index_name
    };

    //console.log("[corpus-vectors.js] Creating vector index with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/manage-index");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling createVectorIndex:', error);
      throw new Error('Network error: Could not connect to the API. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Delete a vector index and clean up metadata
 * Lambda: backend/services/lambdas/corpus/vectors/manage_vector_index.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID
 * @param {string} params.index_name - Index name to delete
 * @returns {Promise<Object>} - Response with deletion confirmation
 */
export async function deleteVectorIndex({ corpus_id, index_name }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/manage-index`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    if (!index_name || typeof index_name !== 'string') {
      throw new Error("index_name is required and must be a string");
    }

    const body = {
      operation: 'delete_index',
      corpus_id,
      index_name
    };

    //console.log("[corpus-vectors.js] Deleting vector index with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/manage-index");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling deleteVectorIndex:', error);
      throw new Error('Network error: Could not connect to the API. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * List all vector indexes for a corpus
 * Lambda: backend/services/lambdas/corpus/vectors/manage_vector_index.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID
 * @returns {Promise<Object>} - Response with array of indexes and metadata
 */
export async function listVectorIndexes({ corpus_id, hierarchical_filter = null }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/manage-index`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    const body = {
      operation: 'list_indexes',
      corpus_id
    };

    // Add hierarchical filter if provided
    if (hierarchical_filter) {
      body.hierarchical_filter = hierarchical_filter;
    }

    //console.log("[corpus-vectors.js] Listing vector indexes with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/manage-index");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling listVectorIndexes:', error);
      throw new Error('Network error: Could not retrieve vector indexes. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Get status and metadata for a specific vector index
 * Lambda: backend/services/lambdas/corpus/vectors/manage_vector_index.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID
 * @param {string} params.index_name - Index name
 * @returns {Promise<Object>} - Response with detailed index metadata
 */
export async function getVectorIndexStatus({ corpus_id, index_name }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/manage-index`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    if (!index_name || typeof index_name !== 'string') {
      throw new Error("index_name is required and must be a string");
    }

    const body = {
      operation: 'get_index_status',
      corpus_id,
      index_name
    };

    //console.log("[corpus-vectors.js] Getting vector index status with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/manage-index");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling getVectorIndexStatus:', error);
      throw new Error('Network error: Could not retrieve index status. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Vectorize a single corpus document
 * Lambda: backend/services/lambdas/corpus/vectors/vectorize_documents.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID
 * @param {string} params.document_key - Document key to vectorize
 * @param {string} params.index_name - Target vector index name
 * @param {Object} [params.chunking_config] - Chunking configuration (chunk_size, overlap, max_chunks)
 * @returns {Promise<Object>} - Response with vectorization results
 */
export async function vectorizeDocument({ corpus_id, document_key, index_name, chunking_config = null }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/vectorize-documents`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    if (!document_key || typeof document_key !== 'string') {
      throw new Error("document_key is required and must be a string");
    }

    if (!index_name || typeof index_name !== 'string') {
      throw new Error("index_name is required and must be a string");
    }

    const body = {
      operation: 'vectorize_document',
      corpus_id,
      document_key,
      index_name,
      chunking_config: chunking_config || {
        chunk_size: 500,
        overlap: 50,
        max_chunks: 20
      }
    };

    //console.log("[corpus-vectors.js] Vectorizing document with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/vectorize");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling vectorizeDocument:', error);
      throw new Error('Network error: Could not vectorize document. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Vectorize multiple documents in a corpus section
 * Lambda: backend/services/lambdas/corpus/vectors/vectorize_documents.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID
 * @param {string} params.index_name - Target vector index name
 * @param {Object} params.filters - Filter criteria (domain, unit, document_topic)
 * @param {number} [params.batch_size] - Batch size for processing (default: 10)
 * @returns {Promise<Object>} - Response with batch processing results
 */
export async function vectorizeCorpusSection({ corpus_id, index_name, filters = {}, batch_size = 10 }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/vectorize-documents`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    if (!index_name || typeof index_name !== 'string') {
      throw new Error("index_name is required and must be a string");
    }

    const body = {
      operation: 'vectorize_corpus_section',
      corpus_id,
      index_name,
      filters: filters || {},
      batch_size
    };

    //console.log("[corpus-vectors.js] Vectorizing corpus section with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/vectorize");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling vectorizeCorpusSection:', error);
      throw new Error('Network error: Could not vectorize corpus section. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Perform semantic search using vector indexes
 * Lambda: backend/services/lambdas/corpus/vectors/search_vectors.py
 * @param {Object} params - Parameters object
 * @param {string} params.query - Search query text
 * @param {string} params.corpus_id - Corpus ID to search within
 * @param {Object} [params.filters] - Filter criteria (domain, unit, document_topic)
 * @param {number} [params.top_k] - Number of results to return (default: 10)
 * @param {number} [params.min_similarity] - Minimum similarity score (default: 0.0)
 * @param {string} [params.index_name] - Specific index to use (auto-selected if not provided)
 * @returns {Promise<Object>} - Response with search results and metadata
 */
export async function semanticSearch({ query, corpus_id, filters = {}, top_k = 10, min_similarity = 0.0, index_name = null }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/search`;

    // Validate required parameters
    if (!query || typeof query !== 'string') {
      throw new Error("query is required and must be a string");
    }

    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    const body = {
      operation: 'semantic_search',
      query,
      corpus_id,
      filters: filters || {},
      top_k,
      min_similarity,
      index_name
    };

    //console.log("[corpus-vectors.js] Performing semantic search with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/search");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling semanticSearch:', error);
      throw new Error('Network error: Could not perform search. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Get formatted context for RAG applications
 * Lambda: backend/services/lambdas/corpus/vectors/search_vectors.py
 * @param {Object} params - Parameters object
 * @param {string} params.query - Query text for context retrieval
 * @param {string} params.corpus_id - Corpus ID to search within
 * @param {Object} [params.filters] - Filter criteria (domain, unit, document_topic)
 * @param {number} [params.max_context_length] - Maximum context length in characters (default: 8000)
 * @param {number} [params.max_chunks] - Maximum number of chunks to include (default: 5)
 * @returns {Promise<Object>} - Response with formatted context and metadata
 */
export async function getContextForRAG({ query, corpus_id, filters = {}, max_context_length = 8000, max_chunks = 5 }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/search`;

    // Validate required parameters
    if (!query || typeof query !== 'string') {
      throw new Error("query is required and must be a string");
    }

    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    const body = {
      operation: 'get_context_for_rag',
      query,
      corpus_id,
      filters: filters || {},
      max_context_length,
      max_chunks
    };

    //console.log("[corpus-vectors.js] Getting context for RAG with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/search");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling getContextForRAG:', error);
      throw new Error('Network error: Could not retrieve context. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Perform hybrid search combining semantic and traditional approaches
 * Lambda: backend/services/lambdas/corpus/vectors/search_vectors.py
 * @param {Object} params - Parameters object
 * @param {string} params.query - Search query text
 * @param {string} params.corpus_id - Corpus ID to search within
 * @param {Object} [params.filters] - Filter criteria (domain, unit, document_topic)
 * @param {number} [params.semantic_weight] - Weight for semantic results (default: 0.7)
 * @param {number} [params.traditional_weight] - Weight for traditional results (default: 0.3)
 * @param {number} [params.top_k] - Number of results to return (default: 10)
 * @returns {Promise<Object>} - Response with combined search results
 */
export async function hybridSearch({ query, corpus_id, filters = {}, semantic_weight = 0.7, traditional_weight = 0.3, top_k = 10 }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/search`;

    // Validate required parameters
    if (!query || typeof query !== 'string') {
      throw new Error("query is required and must be a string");
    }

    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    const body = {
      operation: 'hybrid_search',
      query,
      corpus_id,
      filters: filters || {},
      semantic_weight,
      traditional_weight,
      top_k
    };

    //console.log("[corpus-vectors.js] Performing hybrid search with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/search");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling hybridSearch:', error);
      throw new Error('Network error: Could not perform hybrid search. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Find the best vector index for given filters
 * Lambda: backend/services/lambdas/corpus/vectors/search_vectors.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID
 * @param {Object} params.filters - Filter criteria (domain, unit, document_topic)
 * @returns {Promise<Object>} - Response with best matching index and match score
 */
export async function findMatchingIndex({ corpus_id, filters = {} }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/search`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    const body = {
      operation: 'find_matching_index',
      corpus_id,
      filters: filters || {}
    };

    //console.log("[corpus-vectors.js] Finding matching index with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/search");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling findMatchingIndex:', error);
      throw new Error('Network error: Could not find matching index. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Update vector status for a document
 * Lambda: backend/services/lambdas/corpus/vectors/vectorize_documents.py
 * @param {Object} params - Parameters object
 * @param {string} params.document_key - Document key
 * @param {string} params.status - New vector status ("indexed", "indexing", "index_error", "not_indexed")
 * @param {number} [params.chunk_count] - Number of chunks created (optional)
 * @param {string} [params.error_message] - Error message if status is "index_error" (optional)
 * @returns {Promise<Object>} - Response with status update confirmation
 */
export async function updateDocumentVectorStatus({ document_key, status, chunk_count = 0, error_message = null }) {
  try {
    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/vectorize-documents`;

    // Validate required parameters
    if (!document_key || typeof document_key !== 'string') {
      throw new Error("document_key is required and must be a string");
    }

    if (!status || typeof status !== 'string') {
      throw new Error("status is required and must be a string");
    }

    const validStatuses = ['indexed', 'indexing', 'index_error', 'not_indexed'];
    if (!validStatuses.includes(status)) {
      throw new Error(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const body = {
      operation: 'update_document_status',
      document_key,
      status,
      chunk_count,
      error_message
    };

    //console.log("[corpus-vectors.js] Updating document vector status with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/vectorize");
    }

    return await resp.json();
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling updateDocumentVectorStatus:', error);
      throw new Error('Network error: Could not update document status. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Get live document count for a corpus with optional filters (cached for 5 minutes)
 * Lambda: backend/services/lambdas/corpus/vectors/manage_vector_index.py
 * @param {Object} params - Parameters object
 * @param {string} params.corpus_id - Corpus ID to count documents in
 * @param {Object} [params.filters] - Optional filter criteria (domain, unit, document_topics, document_types)
 * @returns {Promise<number>} - Current document count matching the filters
 */
export async function getLiveDocumentCount({ corpus_id, filters = {} }) {
  try {
    // Create cache key based on corpus and filters
    const cacheKey = `doc_count_${corpus_id}_${JSON.stringify(filters)}`;
    const now = Date.now();
    
    // Check local cache (5-minute expiration)
    if (window._docCountCache && window._docCountCache[cacheKey]) {
      const cached = window._docCountCache[cacheKey];
      if (now - cached.timestamp < 5 * 60 * 1000) { // 5 minutes
        console.log(`[corpus-vectors.js] Using cached document count for ${corpus_id}:`, cached.count);
        return cached.count;
      }
    }

    const baseUrl = getBaseUrl("extended");
    const url = `${baseUrl}/corpus/vectors/manage-index`;

    // Validate required parameters
    if (!corpus_id || typeof corpus_id !== 'string') {
      throw new Error("corpus_id is required and must be a string");
    }

    const body = {
      operation: 'get_live_document_count',
      corpus_id,
      filters: filters || {}
    };

    //console.log("[corpus-vectors.js] Getting live document count with body:", body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return _handleApiError(resp, "/corpus/vectors/manage-index");
    }

    const result = await resp.json();
    const documentCount = result.document_count || 0;

    // Cache the result
    if (!window._docCountCache) {
      window._docCountCache = {};
    }
    window._docCountCache[cacheKey] = {
      count: documentCount,
      timestamp: now
    };

    return documentCount;
  } catch (error) {
    // Enhance error with context
    if (error.message === 'Failed to fetch') {
      console.error('[corpus-vectors.js] Network error when calling getLiveDocumentCount:', error);
      throw new Error('Network error: Could not get document count. Please check your connection and try again.');
    }

    throw error;
  }
}

/**
 * Clear the document count cache for a specific corpus (or all if no corpus specified)
 * @param {string} [corpus_id] - Optional corpus ID to clear cache for (clears all if not provided)
 */
export function clearDocumentCountCache(corpus_id = null) {
  if (!window._docCountCache) {
    return;
  }

  if (corpus_id) {
    // Clear cache entries for specific corpus
    const keysToDelete = Object.keys(window._docCountCache).filter(key => 
      key.startsWith(`doc_count_${corpus_id}_`)
    );
    keysToDelete.forEach(key => delete window._docCountCache[key]);
    console.log(`[corpus-vectors.js] Cleared document count cache for corpus: ${corpus_id}`);
  } else {
    // Clear entire cache
    window._docCountCache = {};
    console.log('[corpus-vectors.js] Cleared entire document count cache');
  }
}