// File: utils/tab-doc-utils.js
/**
 * Utility functions for document naming.
 */

export function getTaskTypeFriendlyName(taskType) {
  const mapping = {
    "single_question": "Question",
    "question_list": "Question List"
    // add additional mappings as needed
  };
  return mapping[taskType] || taskType.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Returns a standardized composite ID for referencing a doc by projectId + documentId.
 * If documentId is "temp_xyz" or an actual real ID from the server, we just do projectId#documentId.
 */
export function getCompositeDocumentId(projectId, documentId) {
  return `${projectId}#${documentId}`;
}
