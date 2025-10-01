// api/corpus-types-and-strings.js
import { clearAllCachesFor } from '../utils/cache-utils.js';
import { getBaseUrl } from '../utils/config.js';
import { getAuthHeader, logout } from "./auth.js";
import { invalidateSubtenantAttributeCache } from './subtenants.js';

/**
 * Creates a new document type for a specific corpus.
 * Lambda: backend/services/lambdas/corpus/types/create_corpus_document_type.py
 * @param {Object} params - Request parameters
 * @param {string} params.corpus - The corpus ID
 * @param {string} params.name - The document type name
 * @returns {Promise<Object>} The response data
 */
export async function createDocumentType(params) {
  //console.log('[corpus-types-and-strings.js] createDocumentType() called with:', params);

  try {
    const url = getBaseUrl("extended") + '/corpus/types/create';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || `Failed to create document type (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-types-and-strings.js] Error creating document type:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}

/**
 * Deletes a document type from a specific corpus.
 * Lambda: backend/services/lambdas/corpus/types/delete_corpus_document_type.py
 * @param {Object} params - Request parameters
 * @param {string} params.corpus - The corpus ID
 * @param {string} params.name - The document type name to delete
 * @returns {Promise<Object>} The response data
 */
export async function deleteDocumentType(params) {
  //console.log('[corpus-types-and-strings.js] deleteDocumentType() called with:', params);

  try {
    const url = getBaseUrl("extended") + '/corpus/types/delete';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || `Failed to delete document type (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-types-and-strings.js] Error deleting document type:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}

/**
 * Creates a new label friendly name mapping.
 * Lambda: backend/services/lambdas/corpus/labels/create_corpus_label.py
 * @param {Object} params - Request parameters
 * @param {string} params.name - The label key
 * @param {string} params.value - The friendly display name
 * @returns {Promise<Object>} The response data
 */
export async function createLabel(params) {
  //console.log('[corpus-types-and-strings.js] createLabel() called with:', params);

  try {
    const url = getBaseUrl("extended") + '/corpus/labels/create';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || `Failed to create label (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-types-and-strings.js] Error creating label:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}

/**
 * Deletes a label friendly name mapping.
 * Lambda: backend/services/lambdas/corpus/labels/delete_corpus_label.py
 * @param {Object} params - Request parameters
 * @param {string} params.name - The label key to delete
 * @returns {Promise<Object>} The response data
 */
export async function deleteLabel(params) {
  //console.log('[corpus-types-and-strings.js] deleteLabel() called with:', params);

  try {
    const url = getBaseUrl("extended") + '/corpus/labels/delete';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || `Failed to delete label (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-types-and-strings.js] Error deleting label:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}