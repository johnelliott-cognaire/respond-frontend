// api/corpus-topics.js
import { clearAllCachesFor } from '../utils/cache-utils.js';
import { getBaseUrl } from '../utils/config.js';
import { getAuthHeader, logout } from "./auth.js";
import { invalidateSubtenantAttributeCache } from './subtenants.js';

/**
 * Creates a new document topic with specified settings.
 * Lambda: backend/services/lambdas/corpus/topics/create_corpus_document_topic.py
 * @param {Object} topicData - Topic configuration object
 * @returns {Promise<Object>} The response data
 */
export async function createDocumentTopic(topicData) {
  //console.log('[corpus-topics.js] createDocumentTopic() called with:', topicData);

  try {
    const url = getBaseUrl("extended") + '/corpus/topics/create';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(topicData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to create topic (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-topics.js] Error creating topic:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}

/**
 * Updates an existing document topic with new settings.
 * Lambda: backend/services/lambdas/corpus/topics/update_corpus_document_topic.py
 * @param {Object} topicData - Topic configuration object
 * @returns {Promise<Object>} The response data
 */
export async function updateDocumentTopic(topicData) {
  //console.log('[corpus-topics.js] updateDocumentTopic() called with:', topicData);

  try {
    const url = getBaseUrl("extended") + '/corpus/topics/update';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(topicData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to update topic (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-topics.js] Error updating topic:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}

/**
 * Deletes a document topic if not in use.
 * Lambda: backend/services/lambdas/corpus/topics/delete_corpus_document_topic.py
 * @param {string} topicName - The name of the topic to delete
 * @returns {Promise<Object>} The response data
 */
export async function deleteDocumentTopic(topicName) {
  //console.log('[corpus-topics.js] deleteDocumentTopic() called with:', topicName);

  try {
    const url = getBaseUrl("extended") + '/corpus/topics/delete';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ name: topicName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to delete topic (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-topics.js] Error deleting topic:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}

/**
 * Updates the document topic assignments for multiple corpora
 * Lambda: backend/services/lambdas/corpus/topics/update_corpus_topic_assignments.py
 * @param {Object} updates - Map of corpus IDs to arrays of topic IDs
 * @returns {Promise<Object>} The response data
 */
export async function updateCorpusTopicAssignments(updates) {
  //console.log('[corpus-topics.js] updateCorpusTopicAssignments() called with:', updates);

  try {
    const url = getBaseUrl("extended") + '/corpus/topics/update-assignments';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ updates })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update topic assignments');
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-topics.js] Error updating topic assignments:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}

/**
 * Updates multiple document topic configurations in bulk.
 * Lambda: backend/services/lambdas/corpus/topics/bulk_update_corpus_document_topics.py
 * @param {Object} topics - Map of topic names to their configuration settings
 * @returns {Promise<Object>} The response data
 */
export async function updateAllTopics(topics) {
  //console.log('[corpus-topics.js] updateAllTopics() called with:', Object.keys(topics).length, 'topics');

  try {
    const url = getBaseUrl("extended") + '/corpus/topics/bulk-update';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ topics })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to update topics in bulk (${response.status})`);
    }

    // After successful API call, use comprehensive cache clearing
    clearAllCachesFor('corpus_config');
    invalidateSubtenantAttributeCache('corpus_config'); // Keep for backward compatibility

    return await response.json();
  } catch (error) {
    console.error('[corpus-topics.js] Error updating topics in bulk:', error);

    // Check for auth errors
    if (error.message && error.message.toLowerCase().includes('unauthorized')) {
      logout();
      throw new Error('Your session has expired. Please log in again.');
    }

    throw error;
  }
}