// File: api/documents.js
import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader } from "./auth.js";
import { fetchWithAuth } from "../utils/api-utils.js";


/**
 * Retrieves a document using the GetDocumentFunction (Back-end).
 * Lambda: backend/services/lambdas/documents/get_document.py
 * ----------------------------------------------------------------
 * Status: Integrated (Real) 
 * Stream: N/A (Document-level, not part of groups/items streams)
 * Front-End: Called from "stage-form-rfp-answer-questions" and other doc loaders
 * 
 * @param {Object} params Object containing document identification
 * @param {string} params.document_id Document ID (required)
 * @param {string} [params.project_id] Composite project ID ("accountId#projectId")
 * @param {string} [params.account_id] or [params.plain_project_id]
 * @returns {Promise<Object>} Document data from back-end
 */
export async function getDocument(params) {
  console.log("[document-loader] getDocument() called with params:", params);

  const { document_id, project_id, account_id, plain_project_id } = params;

  // Validation
  if (!document_id) {
    throw new Error("document_id is required");
  }

  // Build request body
  const body = { document_id };

  // Case 1: Composite project_id provided (recommended format)
  if (project_id) {
    if (!project_id.includes("#")) {
      console.warn("[document-loader] project_id should be in composite format 'accountId#projectId'");
      // For backward compatibility, still send it
    }
    body.project_id = project_id;
  }
  // Case 2: Separate account_id and plain_project_id provided
  else if (account_id && plain_project_id) {
    body.account_id = account_id;
    body.plain_project_id = plain_project_id;
  }
  // Case 3: Missing required project identification
  else {
    throw new Error("Either project_id (composite format) or both account_id and plain_project_id must be provided");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/documents/get`;

  try {
    const resp = await fetchWithAuth(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error fetching document: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    console.log("[document-loader] Document fetched successfully:", data);
    return data;
  } catch (err) {
    console.error("[document-loader] Error in getDocument:", err);
    throw err;
  }
}

/**
 * Creates a new document in DynamoDB by calling /documents/create.
 * Lambda: backend/services/lambdas/documents/create_document.py
 * ----------------------------------------------------------------
 * Status: Integrated (Real)
 * Stream: N/A (Document-level)
 * Front-End: Typically used in document creation workflows
 * 
 * @param {Object} params 
 * @param {string} params.taskType Type of document task
 * @param {string} params.ownerUsername Username of document owner
 * @param {string} params.projectId Composite project ID ("accountId#projectId")
 * @param {string} [params.title] Document title
 * @param {Object} [params.documentData] Document data to store
 * @returns {Promise<Object>} Response with new document_id and doc object
 */
export async function createDocument({ taskType, ownerUsername, projectId, title, documentData }) {
  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/documents/create`;

  // Validate that projectId is in composite format
  if (!projectId.includes("#")) {
    console.error("[documents.js] projectId must be in composite format 'accountId#projectId'");
    throw new Error("Invalid projectId format. Expected 'accountId#projectId'");
  }

  const body = {
    taskType,
    owner_username: ownerUsername,
    project_id: projectId,
    title: title || "",
    document_data: documentData ? JSON.stringify(documentData) : "{}"
  };

  console.log("[documents.js] Creating document with body:", body);

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
    throw new Error("Unauthorized /documents/create => token invalid");
  }
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || "Error creating document");
  }
  return await resp.json();
}

/**
 * Updates an existing document by calling /documents/update.
 * Lambda: backend/services/lambdas/documents/update_document.py
 * ----------------------------------------------------------------
 * Status: Integrated (Real)
 * Stream: N/A (Document-level)
 * Front-End: Called to update doc fields (status, title, etc.)
 * 
 * @param {Object} docUpdate Expects keys like { document_id, status, title, etc. }
 * @returns {Promise<Object>} Updated document data
 */
export async function updateDocument(docUpdate) {
  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/documents/update`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(docUpdate)
  });

  if (resp.status === 401) {
    logout();
    throw new Error("Unauthorized /documents/update => token invalid");
  }
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || "Error updating document");
  }
  return await resp.json();
}


//
// File: api/documents.js STUB SECTION
//
// This module contains **stubbed** functions representing the API endpoints
// for reading/writing Document, Group, and Item data in DynamoDB for both
// Stage 1 (Upload Questions) and Stage 3 (Answer Questions).
//
// All stubs:
//  - Return mock data or log “write” actions (no real backend calls).
//  - Help the UI test multi-select actions, row-locking, group creation, etc.
//  - Document each function’s usage in the UI and which DynamoDB table/keys it references.
//
// Eventually, these stubs will be replaced by real AWS Lambda integration.
//
// ----------------------------------------------------------------------
//
//  RELEVANT TABLES AND KEYS:
//
//  1) DocumentsTable [Existing]
//     - PK: project_id  (string, e.g. "acme___IAG#SM2")
//     - SK: document_id (string, e.g. "doc_abc123")
//     - GSI: "GSI-OwnerStatus" on (owner_username, status)
//     - Contains top-level doc data, not per-question.
//
//  2) DocumentItemGroupsTable
//     - PK: project_document_stage_group_id (like "acme___IAG#SM2#doc_abc123STG#...#GRP#...")
//     - GSI: "GSI-ProjectDocumentId" on (project_document_id, stage_group_id)
//     - Used for "sheet" or "topic" metadata under a doc's stage.
//
//  3) DocumentItemsTable
//     - PK: project_document_id         (e.g. "acme___IAG#SM2#doc_abc123")
//     - SK: project_document_stage_group_id_item_id 
//         ("STG#rfp_stage_3_answer_questions#GRP#security#ITEM#0001")
//     - GSI-OwnerStageDoc: partition key = owner_stage_doc_key
//     - Stores individual questions/answers. Stage 3 actions (editing, AI answer, etc.) revolve around this.
//
// ----------------------------------------------------------------------

// Internal in-memory mock structures. The UI can manipulate these stubs as if
// it were calling real endpoints:
// Define default/stub groups regardless of the document passed in.
const DEFAULT_GROUPS = [
  {
    // Use both keys if needed or map one to the expected property
    stage_group_id: "STG#rfp_stage_3_answer_questions#GRP#security",
    group_name: "Security Requirements",
    date_modified: "2025-04-09T10:15:00Z",
    modified_by: "mary.white",
    metadata: JSON.stringify({ rowCount: 2, notes: "Focus on data encryption" })
  },
  {
    stage_group_id: "STG#rfp_stage_3_answer_questions#GRP#functional",
    group_name: "Functional Section",
    date_modified: "2025-04-09T11:02:45Z",
    modified_by: "jamesp",
    metadata: JSON.stringify({ rowCount: 2 })
  }
];


/**
 * fetchDocumentItemGroups
 * Lambda: backend/services/lambdas/documents/groups/list_document_item_groups.py
 * ----------------------------------------------------------------
 * Status: Real Implementation
 * Stream: 1 (Document Item Groups)
 * Front-End: Stage 3 "Answer Questions" -> loads tab sheets
 *
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @returns {Promise<Array>} List of group objects
 */
export async function fetchDocumentItemGroups(projectDocumentId, stageId) {
  if (!projectDocumentId || !stageId) {
    throw new Error("fetchDocumentItemGroups requires projectDocumentId and stageId");
  }

  // Use deduplication to prevent multiple identical calls
  const { deduplicateRequest } = await import("../utils/request-deduplication.js");
  
  return deduplicateRequest(
    'fetchDocumentItemGroups',
    { project_document_id: projectDocumentId, stage_id: stageId },
    async () => {
      const baseUrl = getBaseUrl("extended");
      const url = `${baseUrl}/document-item-groups/list-doc-item-groups`;

      const body = {
        project_document_id: projectDocumentId,  // no subtenant prefix from client
        stage_id: stageId
      };

      try {
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
          throw new Error("Unauthorized /document-item-groups/list-doc-item-groups => token invalid");
        }
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `Error fetching item groups: HTTP ${resp.status}`);
        }

        const data = await resp.json();
        // Expect data.groups = [...]
        return data.groups || [];
      } catch (err) {
        console.error("fetchDocumentItemGroups error:", err);
        throw err;
      }
    },
    5000 // Cache for 5 seconds to handle rapid successive calls
  );
}

/**
 * fetchDocumentItems
 * Lambda: backend/services/lambdas/documents/get_document_items.py
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 2 (Document Items) 
 * Front-End: Stage 3 -> loads items from DocumentItemsTable, possibly filtered by group
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string|null} groupId
 * @param {object} [filters]
 * @param {object|null} [sorting]
 * @returns {Promise<Array>} List of items
 */
export async function fetchDocumentItems(
  projectDocumentId,
  stageId,
  groupId = null,
  filters = {},
  sorting = null
) {
  console.log("[documents.js] fetchDocumentItems() called with:", {
    projectDocumentId, stageId, groupId, filters, sorting
  });

  // Use deduplication to prevent multiple identical calls
  const { deduplicateRequest } = await import("../utils/request-deduplication.js");
  
  return deduplicateRequest(
    'fetchDocumentItems',
    { 
      project_document_id: projectDocumentId, 
      stage_id: stageId, 
      group_id: groupId,
      filters,
      sorting
    },
    async () => {
      const baseUrl = getBaseUrl("extended");
      const url = `${baseUrl}/document-items/get-doc-items`;

      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader()
          },
          body: JSON.stringify({
            project_document_id: projectDocumentId,
            stage_id: stageId,
            group_id: groupId,
            filters,
            sorting
          })
        });

        if (resp.status === 401) {
          logout();
          throw new Error("Unauthorized /document-items/get-doc-items => token invalid");
        }

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `Error fetching document items: HTTP ${resp.status}`);
        }

        const data = await resp.json();
        console.log("[documents.js] Document items fetched successfully, count:", data.items?.length);
        return data.items || [];
      } catch (err) {
        console.error("[documents.js] Error in fetchDocumentItems:", err);
        throw err;
      }
    },
    30000 // Cache for 30 seconds since document items can be modified frequently
  );
}


/**
 * createDocumentItemGroup
 * Lambda: backend/services/lambdas/documents/groups/create_document_item_group.py
 * ----------------------------------------------------------------
 * Status: Real Implementation
 * Stream: 1 (Groups)
 * Front-End: Stage 3 -> Creates a new single group/tab from the UI
 *
 * Create a new document item group (topic sheet). This is triggered by creating a 
 * group (topic sheet) in the UI, rather than bulk creating via the import wizard.
 * 
 * @param {string} projectDocumentId - The project document ID
 * @param {string} stageId - The stage ID
 * @param {string} groupName - The name of the new group
 * @returns {Promise<Object>} - The created group object
 */
export async function createDocumentItemGroup(projectDocumentId, stageId, groupName) {
  if (!projectDocumentId || !stageId || !groupName) {
    throw new Error("createDocumentItemGroup requires projectDocumentId, stageId, and groupName");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-item-groups/create`;

  const body = {
    project_document_id: projectDocumentId,
    stage_id: stageId,
    group_name: groupName
  };

  try {
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
      throw new Error("Unauthorized /document-item-groups/create => token invalid");
    }
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      if (resp.status === 409) {
        throw new Error(errData.error || "Group already exists");
      }
      throw new Error(errData.error || "Error creating item group");
    }
    const data = await resp.json();
    // Expect data.group = { ... }
    return data.group;
  } catch (err) {
    console.error("createDocumentItemGroup error:", err);
    throw err;
  }
}

/**
 * renameDocumentItemGroup (NEW ADDITION)
 * Lambda: backend/services/lambdas/documents/groups/update_document_item_group.py
 * ----------------------------------------------------------------
 * Status: Real Implementation
 * Stream: 1 (Groups)
 * Front-End: Stage 3 -> rename tab label
 *
 * @param {string} projectDocumentId  [NOT always needed if you already have the PK]
 * @param {string} stageId           [same note as above]
 * @param {string} groupId           The short group ID or the full 'stage_group_id'?
 * @param {string} newName
 * @returns {Promise<Object>} Updated group object
 */
export async function renameDocumentItemGroup(projectDocumentId, stageId, groupId, newName) {
  // The server expects a single key: "project_document_stage_group_id",
  // which should combine doc + stage + group ID. If your UI has it, pass it directly.

  if (!projectDocumentId || !stageId || !groupId || !newName) {
    throw new Error("renameDocumentItemGroup requires projectDocumentId, stageId, groupId, newName");
  }

  // We must reconstruct the "project_document_stage_group_id" if not already known
  // e.g. "acme___IAG#SM2#doc_xyzSTG#rfp_stage_3#GRP#security"
  // But your UI might have stored that from the group's PK. If so, just pass it in.

  // For example, let's assume we do NOT have the full PK in the UI. We'll do a quick local build:
  // (In reality, you might store the group PK on each group object as "project_document_stage_group_id".)
  const fullGroupPk = `${projectDocumentId}STG#${stageId}#GRP#${groupId}`;

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-item-groups/update`;

  const body = {
    project_document_stage_group_id: fullGroupPk,
    new_group_name: newName
  };

  try {
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
      throw new Error("Unauthorized /document-item-groups/update => token invalid");
    }
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      if (resp.status === 404) {
        throw new Error("Group not found");
      }
      throw new Error(errData.error || "Error renaming item group");
    }
    const data = await resp.json();
    // Expect data.updated_group
    return data.updated_group;
  } catch (err) {
    console.error("renameDocumentItemGroup error:", err);
    throw err;
  }
}


/**
 * deleteDocumentItemGroup (NEW ADDITION)
 * Lambda: backend/services/lambdas/documents/groups/delete_document_item_group.py
 * ----------------------------------------------------------------
 * Status: Real Implementation
 * Stream: 1 (Groups)
 * Front-End: Stage 3 -> "Delete group/tab" action
 *
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @returns {Promise<Object>} A result confirming deletion => { success: true }
 */
export async function deleteDocumentItemGroup(projectDocumentId, stageId, groupId) {
  if (!projectDocumentId || !stageId || !groupId) {
    throw new Error("deleteDocumentItemGroup requires projectDocumentId, stageId, groupId");
  }
  // build the PK
  const fullPk = `${projectDocumentId}STG#${stageId}#GRP#${groupId}`;

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-item-groups/delete`;
  const body = {
    project_document_stage_group_id: fullPk
  };

  try {
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
      throw new Error("Unauthorized /document-item-groups/delete => token invalid");
    }
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      if (resp.status === 404) {
        throw new Error("Group not found");
      } else if (resp.status === 409 && errData.error === "Group not empty") {
        throw new Error(`Cannot delete group. It has ${errData.itemCount} items.`);
      }
      throw new Error(errData.error || "Error deleting item group");
    }

    const data = await resp.json();
    // Expect data.success = true
    return data;
  } catch (err) {
    console.error("deleteDocumentItemGroup error:", err);
    throw err;
  }
}


/**
 * Create a new document item (question) in a specific group.
 * Lambda: backend/services/lambdas/documents/create_document_item.py
 * 
 * This is triggered by adding an item via the UI, not importing questions / items.
 * 
 * createDocumentItem
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 2 (Items)
 * Front-End: Stage 3 -> Single item creation (Add Row)
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {Object} itemData
 * @returns {Promise<Object>} Newly created item object
 */
export async function createDocumentItem(projectDocumentId, stageId, groupId, itemData) {
  console.log("[documents.js] createDocumentItem() called with:", projectDocumentId, stageId, groupId, itemData);

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-items/create`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        project_document_id: projectDocumentId,
        stage_id: stageId,
        group_id: groupId,
        item_data: itemData
      })
    });

    if (resp.status === 401) {
      logout();
      throw new Error("Unauthorized /document-items/create => token invalid");
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error creating document item: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log("[documents.js] Document item created successfully:", data);
    
    // Invalidate document items cache since we created a new item
    const { invalidateDocumentItemsCache } = await import("../utils/request-deduplication.js");
    invalidateDocumentItemsCache(projectDocumentId, stageId);
    
    return data.item;
  } catch (err) {
    console.error("[documents.js] Error in createDocumentItem:", err);
    throw err;
  }
}

/**
 * updateDocumentItemAttribute
 * Lambda: backend/services/lambdas/documents/update_document_item.py
 * 
 * A critical endpoint for updating values in the grid.
 * 
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 2 (Items)
 * Front-End: Stage 3 -> Single cell edit in the grid
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {string} itemSortKey
 * @param {string} fieldName
 * @param {any} newValue
 * @returns {Promise<Object>} Updated item
 */
export async function updateDocumentItemAttribute(
  projectDocumentId,
  stageId,
  groupId,
  itemSortKey,
  fieldName,
  newValue
) {
  console.log("[documents.js] updateDocumentItemAttribute() called with:", {
    projectDocumentId, stageId, groupId, itemSortKey, fieldName, newValue
  });

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-items/update`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        project_document_id: projectDocumentId,
        stage_id: stageId,
        group_id: groupId,
        project_document_stage_group_id_item_id: itemSortKey,
        field_name: fieldName,
        new_value: newValue
      })
    });

    if (resp.status === 401) {
      logout();
      throw new Error("Unauthorized /document-items/update => token invalid");
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error updating document item attribute: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log("[documents.js] Document item attribute updated successfully:", data);
    
    // Invalidate document items cache since we updated an item
    const { invalidateDocumentItemsCache } = await import("../utils/request-deduplication.js");
    invalidateDocumentItemsCache(projectDocumentId, stageId);
    
    return data.item;
  } catch (err) {
    console.error("[documents.js] Error in updateDocumentItemAttribute:", err);
    throw err;
  }
}


/**
 * Fetches document item revision history from S3 via the back-end Lambda.
 * Lambda: backend/services/lambdas/documents/fetch_document_item_history.py
 * 
 * @param {string} projectDocumentId - The project document ID (e.g., "IAG#SM2#doc_123")
 * @param {string} stageGroupItemId - The full sort key (e.g., "STG#stage_id#GRP#group_id#ITEM#item_id")
 * @param {number} [targetRevision] - Optional specific revision to reconstruct (defaults to latest)
 * @returns {Promise<Object>} - Object containing revisionSummaries and reconstructedRevision
 */
export async function fetchItemHistoryFromS3(projectDocumentId, stageGroupItemId, targetRevision) {
  console.log("[documents.js] fetchItemHistoryFromS3() => retrieving revision history from S3 for:", {
    projectDocumentId,
    stageGroupItemId,
    targetRevision
  });

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-items/history`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        project_document_id: projectDocumentId,
        stage_group_item_id: stageGroupItemId,
        target_revision: targetRevision
      })
    });

    if (resp.status === 401) {
      logout();
      throw new Error("Unauthorized /document-items/history => token invalid");
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error fetching document item history: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log("[documents.js] Item history retrieved successfully:", data);
    return data;
  } catch (err) {
    console.error("[documents.js] Error in fetchItemHistoryFromS3:", err);
    throw err;
  }
}

/**
 * lockDocumentItem
 * Lambda: backend/services/lambdas/documents/lock_document_item.py
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 2 (Items)
 * Front-End: Stage 3 -> User starts editing a cell
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {string} itemSortKey
 * @param {string} username
 * @returns {Promise<Object>} Lock result with updated item data
 */
export async function _lockDocumentItem(projectDocumentId, stageId, groupId, itemSortKey, username) {
  console.log("[documents.js] _lockDocumentItem() called with:", {
    projectDocumentId, stageId, groupId, itemSortKey, username
  });

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-items/lock`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        project_document_id: projectDocumentId,
        stage_id: stageId,
        group_id: groupId,
        project_document_stage_group_id_item_id: itemSortKey,
        username: username
      })
    });

    if (resp.status === 401) {
      logout();
      throw new Error("Unauthorized /document-items/lock => token invalid");
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error locking document item: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log("[documents.js] Document item locked successfully:", data);
    return data.item;
  } catch (err) {
    console.error("[documents.js] Error in lockDocumentItem:", err);
    throw err;
  }
}

/**
 * unlockDocumentItem
 * Lambda: backend/services/lambdas/documents/unlock_document_item.py
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 2 (Items)
 * Front-End: Stage 3 -> User finishes editing a cell
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {string} itemSortKey
 * @param {string} username
 * @returns {Promise<Object>} Unlock result with updated item data
 */
export async function _unlockDocumentItem(projectDocumentId, stageId, groupId, itemSortKey, username) {
  console.log("[documents.js] _unlockDocumentItem() called with:", {
    projectDocumentId, stageId, groupId, itemSortKey, username
  });

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-items/unlock`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        project_document_id: projectDocumentId,
        stage_id: stageId,
        group_id: groupId,
        project_document_stage_group_id_item_id: itemSortKey,
        username: username
      })
    });

    if (resp.status === 401) {
      logout();
      throw new Error("Unauthorized /document-items/unlock => token invalid");
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error unlocking document item: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log("[documents.js] Document item unlocked successfully:", data);
    return data.item;
  } catch (err) {
    console.error("[documents.js] Error in unlockDocumentItem:", err);
    throw err;
  }
}

/**
 * isDocumentItemLocked
 * Lambda: backend/services/lambdas/documents/is_document_item_locked.py
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 2 (Items)
 * Front-End: Stage 3 -> Check if item is locked before attempting to edit
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {string} itemSortKey
 * @returns {Promise<Object>} Object with lock status {locked: boolean, lockedBy: string|null, lockedDatetime: string|null}
 */
export async function isDocumentItemLocked(projectDocumentId, stageId, groupId, itemSortKey) {
  console.log("[documents.js] isDocumentItemLocked() called with:", {
    projectDocumentId, stageId, groupId, itemSortKey
  });

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-items/is-locked`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        project_document_id: projectDocumentId,
        stage_id: stageId,
        group_id: groupId,
        project_document_stage_group_id_item_id: itemSortKey
      })
    });

    if (resp.status === 401) {
      logout();
      throw new Error("Unauthorized /document-items/is-locked => token invalid");
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error checking document item lock status: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log("[documents.js] Document item lock status checked successfully:", data);
    return {
      locked: !!data.locked_by,
      lockedBy: data.locked_by || null,
      lockedDatetime: data.locked_datetime || null
    };
  } catch (err) {
    console.error("[documents.js] Error in isDocumentItemLocked:", err);
    throw err;
  }
}

/**
 * lockOrUnlockDocumentItem
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 2 (Items) or partial concurrency flow
 * Front-End: Stage 3 -> row-level lock or unlock on single row edit
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {string} itemSortKey
 * @param {boolean} lock
 * @param {string} username
 * @returns {Promise<Object>} Updated item with lock status
 */
export async function lockOrUnlockDocumentItem(
  projectDocumentId,
  stageId,
  groupId,
  itemSortKey,
  lock,
  username
) {
  console.log("[documents.js] lockOrUnlockDocumentItem() called with:", {
    projectDocumentId, stageId, groupId, itemSortKey, lock, username
  });

  // Delegate to the appropriate function based on the lock parameter
  if (lock) {
    return _lockDocumentItem(projectDocumentId, stageId, groupId, itemSortKey, username);
  } else {
    return _unlockDocumentItem(projectDocumentId, stageId, groupId, itemSortKey, username);
  }
}


/**
 * performBulkOperation
 * Lambda: backend/services/lambdas/documents/update_document_items.py
 * ----------------------------------------------------------------
 * Base function for all bulk operations on document items
 * 
 * @param {string} projectDocumentId - The project document ID
 * @param {Array} operations - Array of operation objects
 * @returns {Promise<Object>} - Results of the bulk operation
 */
async function _performBulkOperation(projectDocumentId, operations) {
  console.log("[documents.js] _performBulkOperation() with operations:", operations.length);

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/document-items/bulk-update`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        project_document_id: projectDocumentId,
        operations: operations
      })
    });

    if (resp.status === 401) {
      logout();
      throw new Error("Unauthorized /document-items/bulk-update => token invalid");
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Error performing bulk operation: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log("[documents.js] Bulk operation completed successfully:", data);
    return data;
  } catch (err) {
    console.error("[documents.js] Error in performBulkOperation:", err);
    throw err;
  }
}
/**
 * bulkDeleteDocumentItems
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 3 (Bulk)
 * Front-End: Stage 3 -> Multi-select => "Delete Rows"
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {Array<string>} itemSortKeys
 * @returns {Promise<Object>} e.g. { message: "...", deletedCount: number }
 */
export async function bulkDeleteDocumentItems(projectDocumentId, stageId, groupId, itemSortKeys) {
  console.log("[documents.js] bulkDeleteDocumentItems() called with:", {
    projectDocumentId, stageId, groupId, itemCount: itemSortKeys.length
  });

  // Create operations array for the bulk operation
  const operations = itemSortKeys.map(sortKey => ({
    sortKey,
    opType: "DELETE"
  }));

  try {
    const result = await _performBulkOperation(projectDocumentId, operations);

    // Invalidate document items cache since we deleted items
    const { invalidateDocumentItemsCache } = await import("../utils/request-deduplication.js");
    invalidateDocumentItemsCache(projectDocumentId, stageId);

    // Format response for backward compatibility
    return {
      message: `Successfully deleted ${result.summary.succeeded} items. ${result.summary.failed} failed, ${result.summary.notFound} not found, ${result.summary.locked} locked.`,
      deletedCount: result.summary.succeeded,
      notFoundCount: result.summary.notFound,
      lockedCount: result.summary.locked,
      failedCount: result.summary.failed,
      results: result.results
    };
  } catch (err) {
    console.error("[documents.js] Error in bulkDeleteDocumentItems:", err);
    throw err;
  }
}

/**
 * bulkUnlockDocumentItems
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 3 (Bulk)
 * Front-End: Stage 3 -> Multi-select => "Unlock Rows"
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {Array<string>} itemSortKeys
 * @param {string} currentUsername
 * @returns {Promise<Object>} e.g. { success: boolean, updatedItems: [...] }
 */
export async function bulkUnlockDocumentItems(projectDocumentId, stageId, groupId, itemSortKeys, currentUsername) {
  console.log("[documents.js] bulkUnlockDocumentItems() called with:", {
    projectDocumentId, stageId, groupId, itemCount: itemSortKeys.length, currentUsername
  });

  // Create operations array for the bulk operation
  const operations = itemSortKeys.map(sortKey => ({
    sortKey,
    opType: "UNLOCK"
  }));

  try {
    const result = await _performBulkOperation(projectDocumentId, operations);

    // Extract updated items from the results
    const updatedItems = result.results.succeeded
      .filter(op => op.item)
      .map(op => op.item);

    // Format response for backward compatibility
    return {
      success: result.summary.succeeded > 0,
      updatedItems: updatedItems,
      unlockedCount: result.summary.succeeded,
      notFoundCount: result.summary.notFound,
      failedCount: result.summary.failed,
      results: result.results
    };
  } catch (err) {
    console.error("[documents.js] Error in bulkUnlockDocumentItems:", err);
    throw err;
  }
}

// Add to documents.js API file

/**
 * Bulk assign content configuration to document items
 * Replaces the previous bulkAssignModule function
 * 
 * @param {string} projectDocumentId - Project document ID
 * @param {string} stageId - Stage ID
 * @param {string} groupId - Group ID
 * @param {Array} itemSortKeys - Array of item sort keys
 * @param {Object} contentConfig - Content configuration object with domain, unit, document_topics, and document_types
 * @returns {Promise} Promise resolving to the bulk operation result
 */
export async function bulkAssignContent(
  projectDocumentId,
  stageId,
  groupId,
  itemSortKeys,
  contentConfig
) {
  console.log("[documents.js] bulkAssignContent called with",
    projectDocumentId, stageId, groupId, itemSortKeys.length, "items");

  try {
    // Create operations array for the bulk operation
    const operations = itemSortKeys.map(sortKey => ({
      opType: "UPDATE",
      sortKey: sortKey,
      fields: {
        content: JSON.stringify(contentConfig) // Stringify the content config for storage
      }
    }));

    // Use the existing performBulkOperation helper
    const result = await _performBulkOperation(projectDocumentId, operations);

    // Extract updated items from the results (similar to bulkUnlockDocumentItems)
    const updatedItems = result.results.succeeded
      .filter(op => op.item)
      .map(op => op.item);

    // Format response for backward compatibility
    return {
      success: result.summary.succeeded > 0,
      updatedItems: updatedItems,
      updatedCount: result.summary.succeeded,
      notFoundCount: result.summary.notFound,
      failedCount: result.summary.failed,
      results: result.results
    };
  } catch (err) {
    console.error("[documents.js] Error in bulkAssignContent:", err);
    throw err;
  }
}

/**
 * bulkAssignOwner
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 3 (Bulk)
 * Front-End: Stage 3 -> Multi-select => "Assign Owner"
 * 
 * @param {string} projectDocumentId
 * @param {string} stageId
 * @param {string} groupId
 * @param {Array<string>} itemSortKeys
 * @param {string} newOwner
 * @returns {Promise<Object>} e.g. { message: "...", updatedItems: [...] }
 */
export async function bulkAssignOwner(projectDocumentId, stageId, groupId, itemSortKeys, newOwner) {
  console.log("[documents.js] bulkAssignOwner() called with:", {
    projectDocumentId, stageId, groupId, itemCount: itemSortKeys.length, newOwner
  });

  // Create operations array for the bulk operation
  const operations = itemSortKeys.map(sortKey => ({
    sortKey,
    opType: "ASSIGN_OWNER",
    ownerUsername: newOwner
  }));

  try {
    const result = await _performBulkOperation(projectDocumentId, operations);

    // Extract updated items from the results
    const updatedItems = result.results.succeeded
      .filter(op => op.item)
      .map(op => op.item);

    // Format response for backward compatibility
    return {
      message: `Successfully assigned owner to ${result.summary.succeeded} items. ${result.summary.failed} failed, ${result.summary.notFound} not found, ${result.summary.locked} locked.`,
      updatedItems: updatedItems,
      updatedCount: result.summary.succeeded,
      notFoundCount: result.summary.notFound,
      lockedCount: result.summary.locked,
      failedCount: result.summary.failed,
      results: result.results
    };
  } catch (err) {
    console.error("[documents.js] Error in bulkAssignOwner:", err);
    throw err;
  }
}


/**
 * bulkMoveToSheet
 * ----------------------------------------------------------------
 * Status: Real (Implemented)
 * Stream: 3 (Bulk)
 * Front-End: Stage 3 -> Multi-select => "Move to Sheet"
 * 
 * @param {string} projectDocumentId
 * @param {string} fromStageId
 * @param {string} fromGroupId
 * @param {string} toStageId
 * @param {string} toGroupId
 * @param {Array<string>} itemSortKeys
 * @returns {Promise<Object>} e.g. { message: "...", movedCount: number, movedItems: [...] }
 */
export async function bulkMoveToSheet(
  projectDocumentId,
  fromStageId,
  fromGroupId,
  toStageId,
  toGroupId,
  itemSortKeys
) {
  console.log("[documents.js] bulkMoveToSheet() called with:", {
    projectDocumentId, fromStageId, fromGroupId, toStageId, toGroupId, itemCount: itemSortKeys.length
  });

  // Create operations array for the bulk operation
  const operations = itemSortKeys.map(sortKey => ({
    sortKey,
    opType: "MOVE",
    newGroupId: toGroupId
  }));

  try {
    const result = await _performBulkOperation(projectDocumentId, operations);

    // Format response for backward compatibility
    return {
      message: `Successfully moved ${result.summary.succeeded} items to ${toGroupId}. ${result.summary.failed} failed, ${result.summary.notFound} not found, ${result.summary.locked} locked.`,
      movedCount: result.summary.succeeded,
      notFoundCount: result.summary.notFound,
      lockedCount: result.summary.locked,
      failedCount: result.summary.failed,
      results: result.results,
      movedItems: result.results.succeeded.map(item => ({
        originalSortKey: item.sortKey,
        newSortKey: item.newSortKey,
        toGroupId: toGroupId
      }))
    };
  } catch (err) {
    console.error("[documents.js] Error in bulkMoveToSheet:", err);
    throw err;
  }
}

export async function runAiAnswers(projectDocumentId, stageId, groupId, itemSortKeys, mode = "Standard") {
  console.log("[documents.js] skeleton placeholder runAiAnswers() called with:", {
    projectDocumentId, stageId, groupId, itemCount: itemSortKeys.length, mode
  });
  // Note: this needs to go through JobController.startProcess(...) and kick off a job, polling etc.
  return Promise.resolve({ message: "Not implemented" });
}

/**
 * List documents with optional filtering by owner, status, account, and project
 * Lambda: backend/services/lambdas/documents/list_documents.py
 * ---------------------------------------------------------------- 
 * Status: Integrated (Real)
 * Stream: N/A (Document listing)
 * Front-End: DocumentsModal for document browsing
 * 
 * @param {Object} filters Filtering criteria
 * @param {string} [filters.owner_username] Username to filter by (admin only)
 * @param {Array<string>} [filters.status_list] List of statuses to include
 * @param {string} [filters.account_id] Account ID to filter by
 * @param {string} [filters.project_id] Composite project ID to filter by
 * @param {string} [filters.plain_project_id] Plain project ID (used with account_id)
 * @param {number} [filters.page_size] Number of results per page
 * @param {Object} [filters.last_evaluated_key] Pagination key from previous request
 * @returns {Promise<Object>} Document list with pagination info
 */
export async function listDocuments(filters = {}) {
  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/documents/list`;

  console.log("[documents.js] listDocuments() called with filters:", filters);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(filters)
  });

  if (resp.status === 401) {
    logout();
    throw new Error("Unauthorized /documents/list => token invalid");
  }
  
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Error listing documents: HTTP ${resp.status}`);
  }
  
  const data = await resp.json();
  console.log("[documents.js] Documents listed successfully:", data);
  return data;
}

/**
 * Get documents filtered by account and/or project
 * Lambda: backend/services/lambdas/documents/list_documents.py
 * ----------------------------------------------------------------
 * Status: Integrated (Real)
 * Stream: N/A (Document filtering)
 * Front-End: DocumentsModal with account/project filtering
 * 
 * @param {string} [accountId] Account ID to filter by
 * @param {string} [projectId] Project ID to filter by (plain or composite format)
 * @param {Object} [options] Additional filtering options
 * @param {Array<string>} [options.status_list] List of statuses to include
 * @param {string} [options.owner_username] Username to filter by (admin only)
 * @returns {Promise<Object>} Filtered document list
 */
export async function getDocumentsByAccountProject(accountId, projectId, options = {}) {
  console.log("[documents.js] getDocumentsByAccountProject() called with:", { accountId, projectId, options });

  if (!accountId && !projectId) {
    throw new Error("At least one filter criterion (accountId or projectId) must be provided");
  }

  const filters = { ...options };
  
  if (accountId) {
    filters.account_id = accountId;
  }
  
  if (projectId) {
    // Handle both composite and plain project ID formats
    if (accountId && !projectId.includes('#')) {
      // Convert to composite format if we have account and plain project
      filters.project_id = `${accountId}#${projectId}`;
    } else {
      filters.project_id = projectId;
    }
  }

  try {
    return await listDocuments(filters);
  } catch (error) {
    console.error("[documents.js] Error filtering documents:", error);
    throw new Error(`Failed to filter documents: ${error.message}`);
  }
}

/**
 * Delete a document and all associated document items
 * Lambda: backend/services/lambdas/documents/delete_document.py
 * ----------------------------------------------------------------
 * Status: Integrated (Real)
 * Stream: N/A (Document deletion)
 * Front-End: DocumentsModal delete functionality
 * 
 * @param {string} documentId Document ID to delete (required)
 * @param {string} confirmationToken Confirmation token ("DELETE_CONFIRMED")
 * @returns {Promise<Object>} Deletion result with summary
 */
export async function deleteDocument(documentId, confirmationToken = "DELETE_CONFIRMED") {
  console.log("[documents.js] deleteDocument() called with:", { documentId, confirmationToken });

  if (!documentId) {
    throw new Error("Document ID is required for deletion");
  }

  if (!confirmationToken) {
    throw new Error("Deletion confirmation token is required to prevent accidental deletions");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/documents/delete`;

  const body = {
    document_id: documentId,
    confirmation_token: confirmationToken
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
      // Handle authentication error
      console.error("[documents.js] Authentication failed during document deletion");
      throw new Error("Authentication required. Please log in again.");
    }

    if (response.status === 403) {
      // Handle permission error
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Permission denied. You can only delete documents you own.");
    }

    if (response.status === 404) {
      // Handle not found error
      throw new Error("Document not found or access denied");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to delete document: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log("[documents.js] Document deleted successfully:", result);
    return result;

  } catch (error) {
    console.error("[documents.js] Error deleting document:", error);
    
    // Re-throw with more context for different error types
    if (error.message.includes("Authentication")) {
      throw new Error(`Authentication failed: ${error.message}`);
    } else if (error.message.includes("Permission")) {
      throw new Error(`Permission denied: ${error.message}`);
    } else if (error.message.includes("not found")) {
      throw new Error(`Document not found: ${error.message}`);
    } else {
      throw new Error(`Failed to delete document ${documentId}: ${error.message}`);
    }
  }
}
