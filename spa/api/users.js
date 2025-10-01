// File: api/users.js

import { parseApiError, fetchWithAuth } from "../utils/api-utils.js";
import { getBaseUrl } from "../utils/config.js";
import { getAuthHeader } from "./auth.js";

/**
 * A standard base URL for extended user operations:
 */
const EXTENDED_API_BASE_URL = getBaseUrl("extended");

/**
 * Lists all users, optionally filtered by permission, account, project, etc.
 * Lambda: backend/services/lambdas/admin/list_users.py
 * 
 * Note the client-side filtering in listUsersWithCorpusPermissions(..) below
 */
export async function listUsers(filter = {}) {
  console.log("[usersApi] listUsers => filter:", filter);
  const url = `${EXTENDED_API_BASE_URL}/users/list`;
  const resp = await fetchWithAuth(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(filter)
  });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    const msg = parseApiError(errData);
    console.error("[usersApi] listUsers => error:", msg);
    throw new Error(msg);
  }
  const data = await resp.json();
  // Expect { users: [...], scanned_count, last_evaluated_key, etc. }
  return data;
}

/**
 * Returns users eligible for the requested capability in this project.
 * 
 * MANUAL means they can edit questions
 * AD_HOC means they can AI-generate one answer at a time
 * BATCH means they can run a large batch of AI answers
 *
 * @param {Object} opts
 *   accountId     – required
 *   projectId     – required
 *   corpusId      – optional (defaults "rfp")
 *   filterType    – "MANUAL" | "AD_HOC" | "BATCH"
 *
 * @returns {Array<User>}
 */
export async function listUsersWithCorpusPermissions(opts) {
  const {
    accountId,
    projectId,
    corpusId = "rfp",
    filterType = "MANUAL"
  } = opts;

  // 1️⃣  Fetch everyone explicitly authorised on the project
  const { users = [] } = await listUsers({
    account_id: accountId,
    project_id: projectId
  });

  // 2️⃣  Apply permission logic in memory
  return users.filter(u => {
    if (!_hasProjectEdit(u, projectId)) return false;

    switch (filterType) {
      case "BATCH":
        return hasCorpusFlag(u, corpusId, "BATCH");
      case "AD_HOC":
        return hasCorpusFlag(u, corpusId, "AD_HOC");
      case "MANUAL":
      default:
        return true;          // project‑edit is enough
    }
  });
}

function _parsePerms(user) {
  try {
    return typeof user.permissions === "string"
      ? JSON.parse(user.permissions)
      : user.permissions || {};
  } catch {
    return {};
  }
}

function _hasProjectEdit(user, projectId) {
  const p = _parsePerms(user);
  return (
    p.project_permissions?.[projectId]?.includes("PROJECT_EDITOR") ||
    p.project_permissions?.[projectId]?.includes("PROJECT_ADMIN") ||   // if used
    p.system_permissions?.includes("SYSTEM_ADMIN")
  );
}

export function hasCorpusFlag(user, corpusId, flag) {
  const p = _parsePerms(user);
  return p.corpus_permissions?.[corpusId]?.includes(flag);
}

/**
 * getUser => fetch a single user by username
 * Lambda: backend/services/lambdas/admin/get_user.py
 */
export async function getUser(username) {
  console.log("[usersApi] getUser => username:", username);
  const url = `${EXTENDED_API_BASE_URL}/users/get`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify({ username })
  });
  if (resp.status === 401) {
    logout();
    throw new Error("Unauthorized /users/get => token invalid");
  }
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    const msg = parseApiError(errData);
    console.error("[usersApi] getUser => error:", msg);
    throw new Error(msg);
  }
  return await resp.json(); // e.g. { username, email, permissions, etc. }
}

/**
 * Updates user permissions, including system, accounts, projects.
 * Lambda: backend/services/lambdas/admin/update_user.py
 */
export async function updateUserPermissions(username, newPermissions) {
  console.log("[usersApi] updateUserPermissions => username:", username, "newPermissions:", newPermissions);
  const url = `${EXTENDED_API_BASE_URL}/users/update`;
  // IMPORTANT: Log the actual object being passed to us
  console.log("[usersApi] updateUserPermissions => received raw payload:", JSON.stringify(newPermissions));

  // Build the payload with all required fields
  const payload = {
    username,
    // Include all permission types to ensure nothing is dropped
    system_permissions: newPermissions.system_permissions || newPermissions.system || [],
    corpus_permissions: newPermissions.corpus_permissions || {},
    docchain_permissions: newPermissions.docchain_permissions || [],
    authorized_accounts: newPermissions.authorized_accounts || [],
    authorized_projects: newPermissions.authorized_projects || [],
    email: newPermissions.email
  };

  // IMPORTANT: Log the exact payload we're sending to the API
  console.log("[usersApi] updateUserPermissions => sending exact payload:", JSON.stringify(payload));

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(payload)
  });

  if (resp.status === 401) {
    logout();
    throw new Error("Unauthorized /users/update => token invalid");
  }

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    const msg = parseApiError(errData);
    console.error("[usersApi] updateUserPermissions => error:", msg);
    throw new Error(msg);
  }
  const responseData = await resp.json();
  console.log("[usersApi] updateUserPermissions => API response:", responseData);
  return responseData;
}


/**
 * Adds account access for the user.
 */
export async function addAccountAccess(username, accountId) {
  console.log("[usersApi] addAccountAccess => username:", username, "accountId:", accountId);

  const userData = await getUser(username);

  // Get account list with fallbacks
  const acctList = userData.authorized_accounts || userData.permissions?.authorized_accounts || [];

  if (!acctList.includes(accountId)) {
    acctList.push(accountId);
  }

  return updateUserPermissions(username, {
    // Use system_permissions field to match Lambda expectation
    system_permissions: userData.permissions?.system_permissions ||
      userData.permissions?.system || [],
    corpus_permissions: userData.permissions?.corpus_permissions || {},
    docchain_permissions: userData.permissions?.docchain_permissions || [],
    authorized_accounts: acctList,
    authorized_projects: userData.authorized_projects ||
      userData.permissions?.authorized_projects || []
  });
}

/**
 * Adds project access for the user.
 */
export async function addProjectAccess(username, projectId) {
  console.log("[usersApi] addProjectAccess => username:", username, "projectId:", projectId);

  const userData = await getUser(username);

  // Get project list with fallbacks
  const projList = userData.authorized_projects ||
    userData.permissions?.authorized_projects || [];

  if (!projList.includes(projectId)) {
    projList.push(projectId);
  }

  return updateUserPermissions(username, {
    // Use system_permissions field to match Lambda expectation
    system_permissions: userData.permissions?.system_permissions ||
      userData.permissions?.system || [],
    corpus_permissions: userData.permissions?.corpus_permissions || {},
    docchain_permissions: userData.permissions?.docchain_permissions || [],
    authorized_accounts: userData.authorized_accounts ||
      userData.permissions?.authorized_accounts || [],
    authorized_projects: projList
  });
}

/**
 * Duplicates permissions from source user to target user
 * Lambda: backend/services/lambdas/admin/duplicate_permissions.py
 */
export async function duplicatePermissions(
  sourceUsername,
  targetUsername,
  options = { copySystem: true, copyAccounts: true, copyProjects: true }
) {
  console.log("[usersApi] duplicatePermissions => source:", sourceUsername, "target:", targetUsername, "options:", options);

  const url = `${EXTENDED_API_BASE_URL}/users/duplicate-permissions`;
  const payload = {
    source_username: sourceUsername,
    target_username: targetUsername,
    copy_options: options
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader()
    },
    body: JSON.stringify(payload)
  });
  if (resp.status === 401) {
    logout();
    throw new Error("Unauthorized /users/duplicate-permissions => token invalid");
  }
  if (!resp.ok) {
    const errJson = await resp.json().catch(() => ({}));
    const msg = parseApiError(errJson);
    console.error("[usersApi] duplicatePermissions => error:", msg);
    throw new Error(msg);
  }
  return await resp.json();
}
