// File: api/projects-accounts.js

import { getAuthHeader } from "./auth.js";
import { parseApiError } from "../utils/api-utils.js";
import { getBaseUrl } from "../utils/config.js";
import { Security } from "../state/security.js";
import { verifyPermission, getFreshSecurity } from "../utils/security-utils.js";

const EXTENDED_API_BASE_URL = getBaseUrl("extended");

/**
 * getAccount
 * Lambda: backend/services/lambdas/admin/get_account.py
 * Retrieves an account by accountId, verifying permission via Security.
 * Uses the /accounts/get endpoint at the extended base URL.
 */
export async function getAccount(accountId, store) {
  console.log("[projects-accounts] getAccount =>", accountId);

  verifyPermission(
    store, 
    'canAccessAccount', 
    accountId, 
    `Access denied. You do not have permission to access account=${accountId}`
  );

  try {
    const url = `${EXTENDED_API_BASE_URL}/accounts/get`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({ account_id: accountId })
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = parseApiError(errJson);
      throw new Error(msg);
    }
    return await response.json();
  } catch (err) {
    console.error("[projects-accounts] getAccount => error:", err);
    throw err;
  }
}

/**
 * updateAccount
 * Lambda: backend/services/lambdas/admin/update_account.py
 * Updates an account. Requires permission => canEditAccount().
 * Uses /accounts/update at the extended base URL.
 */
export async function updateAccount(accountData, store) {
  console.log("[projects-accounts] updateAccount =>", accountData);

  verifyPermission(
    store,
    'canEditAccount',
    accountData.account_id,
    `Access denied. You do not have permission to edit account=${accountData.account_id}`
  );

  try {
    const url = `${EXTENDED_API_BASE_URL}/accounts/update`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify(accountData)
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = parseApiError(errJson);
      throw new Error(msg);
    }
    return await response.json();
  } catch (err) {
    console.error("[projects-accounts] updateAccount => error:", err);
    throw err;
  }
}

/**
 * getProject
 * Lambda: backend/services/lambdas/admin/get_project.py
 * Retrieves a project. Verifies user canAccessProject(projectId).
 * Calls /projects/get at extended base URL.
 * 
 * @param {string} projectId - The project ID
 * @param {object} store - The application store
 * @param {string|null} accountId - The account ID this project belongs to
 * @returns {Promise<object>} The project data
 */
export async function getProject(projectId, store, accountId = null) {
  
  // If no accountId provided, try to get it from user's authorized_projects
  if (!accountId) {
    const user = store.get('user');
    if (user && Array.isArray(user.authorized_projects)) {
      // Find project entry that includes this projectId
      const projectEntry = user.authorized_projects.find(p => p.includes(projectId));
      if (projectEntry && projectEntry.includes('#')) {
        accountId = projectEntry.split('#')[0];
      }
    }
    
    // If still no accountId, we can't proceed
    if (!accountId) {
      throw new Error(`Cannot determine account_id for project ${projectId}. Please provide account_id.`);
    }
  }

  const composite = `${accountId}#${projectId}`;

  // Centralized permission check with standardized error handling
  verifyPermission(
    store, 
    'canAccessProject', 
    composite, 
    `Access denied. You do not have permission to view project=${composite}`
  );

  // Use deduplication to prevent multiple identical calls
  const { deduplicateRequest } = await import("../utils/request-deduplication.js");
  
  return deduplicateRequest(
    'getProject',
    { account_id: accountId, project_id: projectId },
    async () => {
      try {
        const url = `${EXTENDED_API_BASE_URL}/projects/get`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader()
          },
          body: JSON.stringify({ 
            account_id: accountId,
            project_id: projectId
          })
        });
        
        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const msg = parseApiError(errJson);
          throw new Error(msg);
        }

        const project = await response.json();
        return {
          ...project,
          composite,
        };
      } catch (err) {
        console.error("[projects-accounts] getProject error:", err);
        throw err;
      }
    },
    10000 // Cache for 10 seconds since project data doesn't change frequently
  );
}



/**
 * updateProject
 * Lambda: backend/services/lambdas/admin/update_project.py
 * Updates a project. Verifies user canEditProject(project_id).
 * Calls /projects/update at extended base URL.
 */
export async function updateProject(projectData, store) {
  console.log("[projects-accounts] updateProject =>", projectData);

  verifyPermission(
    store,
    'canEditProject',
    projectData.project_id,
    `Access denied. You do not have permission to edit project=${projectData.project_id}`
  );

  try {
    // Create a flat payload with only the fields the Lambda expects
    const payload = {
      project_id: projectData.project_id,
      name: projectData.name,
      account_id: projectData.account_id
    };
    
    // If code is present, map it to project_code as expected by the server
    if (projectData.code !== undefined) {
      payload.project_code = projectData.code;
    }
    
    // Explicitly include corpus if present
    if (projectData.corpus !== undefined) {
      payload.corpus = projectData.corpus;
    }
    
    // Add any additional fields that aren't already handled
    Object.entries(projectData).forEach(([key, value]) => {
      if (!['project_id', 'name', 'code', 'account_id', 'corpus'].includes(key)) {
        payload[key] = value;
      }
    });

    console.log("[projects-accounts] Sending payload to server:", payload);
    
    const url = `${EXTENDED_API_BASE_URL}/projects/update`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)  // This will be a flat object now
    });
    
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = parseApiError(errJson);
      throw new Error(msg);
    }
    return await response.json();
  } catch (err) {
    console.error("[projects-accounts] updateProject => error:", err);
    throw err;
  }
}

/**
 * fetchAccounts
 * Lambda: backend/services/lambdas/admin/list_accounts.py
 * Lists accounts using /accounts/list. Accepts optional filters: { owner, name }.
 */
export async function fetchAccounts(filters = {}) {
  console.log("[projects-accounts] fetchAccounts => filters:", filters);
  try {
    const url = `${EXTENDED_API_BASE_URL}/accounts/list`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify(filters)
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = parseApiError(errJson);
      throw new Error(msg);
    }
    const data = await response.json();
    return data.accounts || [];
  } catch (err) {
    console.error("[projects-accounts] fetchAccounts => error:", err);
    throw err;
  }
}

/**
 * fetchAccountUsers
 * Lambda: backend/services/lambdas/admin/list_users.py
 * Gets all users who have authorized_accounts containing accountId.
 */
export async function fetchAccountUsers(accountId) {
  console.log("[projects-accounts] fetchAccountUsers => accountId:", accountId);
  try {
    const url = `${EXTENDED_API_BASE_URL}/users/list`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        account_id: accountId
      })
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = parseApiError(errJson);
      throw new Error(msg);
    }
    const data = await response.json();
    return data.users || [];
  } catch (err) {
    console.error("[projects-accounts] fetchAccountUsers => error:", err);
    throw err;
  }
}

/**
 * fetchProjects
 * Lambda: backend/services/lambdas/admin/list_projects.py
 * List projects for an account or all projects if no account specified.
 * Behavior is now consistent with fetchAccounts:
 * - For system admins, will return all projects (if no accountId) or projects for a specific account
 * - For regular users, returns only projects in authorized_projects list
 */
export async function fetchProjects(accountId, searchValue) {
  console.log("[projects-accounts] fetchProjects => accountId:", accountId, " searchValue:", searchValue);

  try {
    const url = `${EXTENDED_API_BASE_URL}/projects/list`;
    const body = {};
    
    // Only include account_id if it's provided
    if (accountId) {
      body.account_id = accountId;
    }
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = parseApiError(errJson);
      console.error("[projects-accounts] fetchProjects error:", msg);
      throw new Error(msg);
    }

    const data = await response.json();
    let projects = data.projects || [];

    // If searchValue is provided, do client-side filtering
    if (searchValue) {
      const svLower = searchValue.toLowerCase();
      projects = projects.filter(p => 
        (p.name && p.name.toLowerCase().includes(svLower)) ||
        (p.code && p.code.toLowerCase().includes(svLower)) ||
        (p.project_id && p.project_id.toLowerCase().includes(svLower))
      );
    }
    
    console.log("[projects-accounts] fetched projects =>", projects.length, "projects");
    return projects;
  } catch (err) {
    console.error("[projects-accounts] fetchProjects => error:", err);
    throw err;
  }
}
