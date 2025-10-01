// api/usergroups.js
import { getAuthHeader, logout } from "../api/auth.js";
import { getBaseUrl } from "../utils/config.js";

// In-memory cache
const memoryCache = {
  listUserGroups: {
    true: null,  // accessible only
    false: null, // all groups
  },
  cacheTimestamp: {
    true: 0,
    false: 0
  }
};

// Cache timeout - 1 hour in milliseconds
const CACHE_TIMEOUT = 60 * 60 * 1000;

/**
 * Retrieves cached user groups data
 * 
 * @param {boolean} accessibleOnly Whether to return only accessible groups
 * @returns {Object|null} Cached data or null if not cached or expired
 */
function _getCachedGroups(accessibleOnly) {
  const key = accessibleOnly ? 'true' : 'false';

  // Check if we have in-memory cache
  if (memoryCache.listUserGroups[key] &&
    Date.now() - memoryCache.cacheTimestamp[key] < CACHE_TIMEOUT) {
    return memoryCache.listUserGroups[key];
  }

  // Otherwise check localStorage
  try {
    const cacheKey = `usergroups_cache_${key}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
      const parsed = JSON.parse(cachedData);

      // Check if cache is valid
      if (parsed.timestamp &&
        Date.now() - parsed.timestamp < CACHE_TIMEOUT) {

        // Update memory cache
        memoryCache.listUserGroups[key] = parsed.data;
        memoryCache.cacheTimestamp[key] = parsed.timestamp;

        return parsed.data;
      }
    }
  } catch (err) {
    console.error('[usergroups.js] Error reading from localStorage cache:', err);
  }

  return null;
}

/**
 * Caches user groups data both in memory and localStorage
 * 
 * @param {boolean} accessibleOnly Whether it's only accessible groups
 * @param {Object} data The data to cache
 */
function _cacheGroups(accessibleOnly, data) {
  const key = accessibleOnly ? 'true' : 'false';
  const timestamp = Date.now();

  // Update memory cache
  memoryCache.listUserGroups[key] = data;
  memoryCache.cacheTimestamp[key] = timestamp;

  // Update localStorage cache
  try {
    const cacheKey = `usergroups_cache_${key}`;
    const cacheData = {
      timestamp,
      data
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (err) {
    console.error('[usergroups.js] Error writing to localStorage cache:', err);
  }
}

/**
 * Clears all user groups cache
 */
export function clearUserGroupsCache() {
  // Clear memory cache
  memoryCache.listUserGroups.true = null;
  memoryCache.listUserGroups.false = null;
  memoryCache.cacheTimestamp.true = 0;
  memoryCache.cacheTimestamp.false = 0;

  // Clear localStorage cache
  try {
    localStorage.removeItem('usergroups_cache_true');
    localStorage.removeItem('usergroups_cache_false');
    console.log('[usergroups.js] User groups cache cleared');
  } catch (err) {
    console.error('[usergroups.js] Error clearing localStorage cache:', err);
  }
}

/**
 * Uniform error‑handling wrapper used by every call in this module.
 * If the response is not OK (2xx) it attempts to parse the API error
 * payload and throws a normalised Error so that calling UI components
 * can decide how to surface the fault.
 *
 * @param {Response} response   fetch() Response object
 * @param {string}  endpoint    Relative endpoint path (for log context)
 * @throws {Error}              Always throws – never returns
 */
async function _handleApiError(response, endpoint) {
  // Expired / missing token – force logout so the app can redirect to login
  if (response.status === 401) {
    logout();
    throw new Error(`Unauthorized ${endpoint} ⇒ token invalid or expired`);
  }

  let message = `HTTP ${response.status}`;
  let errorData = null;

  try {
    errorData = await response.json();
    message = errorData.error || message;
  } catch (_) {
    /* silently swallow JSON parse failure */
  }

  const error = new Error(message);
  if (errorData) {
    error.response = { data: errorData };
  }
  throw error;
}

/**
 * GET ALL USER GROUPS
 * Lambda: backend/services/lambdas/admin/usergroups/list_user_groups.py
 * ------------------------------------------------------------
 * @param {boolean} [accessibleOnly=true] Whether to return only groups accessible to the user
 * @returns {Promise<{groups:Array<{name:string,members:Array<{username:string,added_by:string,added_datetime:string}>}>,totalCount:number}>}
 *          Example: { groups:[{name:"SearchTeam",members:[{username:"alice",added_by:"admin",added_datetime:"2025-01-01T10:00:00Z"}]}], totalCount:1 }
 */
export async function listUserGroups(accessibleOnly = true) {
  console.log(`[usergroups.js] listUserGroups(accessibleOnly=${accessibleOnly})`);

  // Check cache first
  const cachedData = _getCachedGroups(accessibleOnly);
  if (cachedData) {
    console.log(`[usergroups.js] Using cached user groups data for accessibleOnly=${accessibleOnly}`);
    return cachedData;
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/user-groups/list`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessibleOnly }),
    });

    if (!resp.ok) return _handleApiError(resp, "/user-groups/list");

    const data = await resp.json();

    // Cache the response
    _cacheGroups(accessibleOnly, data);

    return data;
  } catch (err) {
    if (err.message === "Failed to fetch") {
      throw new Error("Network error: could not retrieve user groups.");
    }
    throw err;
  }
}

/**
 * CREATE A NEW USER GROUP (admin‑only)
 * Lambda: backend/services/lambdas/admin/usergroups/create_user_group.py
 * ------------------------------------------------------------
 * @param   {Object}  params
 * @param   {string}  params.name       Unique group name (un‑prefixed)
 * @param   {string[]} [params.members] Initial list of usernames (optional)
 * @returns {Promise<{success:boolean,group:{name:string,members:string[],created:string}}>} 
 */
export async function createUserGroup({ name, members = [] }) {
  console.log(`[usergroups.js] createUserGroup(name=${name}, members=[${members.join(', ')}])`);

  if (!name || typeof name !== "string") {
    throw new Error("'name' is required and must be a string");
  }
  if (!Array.isArray(members)) {
    throw new Error("'members' must be an array of usernames");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/user-groups/create`;
  const body = { name, members };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return _handleApiError(resp, "/user-groups/create");

    const data = await resp.json();

    // Clear cache since we've modified the groups
    clearUserGroupsCache();

    return data;
  } catch (err) {
    if (err.message === "Failed to fetch") {
      throw new Error("Network error: could not create user group.");
    }
    throw err;
  }
}

/**
 * UPDATE AN EXISTING GROUP – replaces membership list atomically.
 * Lambda: backend/services/lambdas/admin/usergroups/update_user_group.py
 * This method is retained for bulk operations only. For single-member
 * operations, use addGroupMember or removeGroupMember instead.
 * ------------------------------------------------------------
 * @param   {Object}  params
 * @param   {string}  params.name       Existing group name
 * @param   {string[]} params.members  New complete member list
 * @returns {Promise<{success:boolean,group:{name:string,members:string[],updated:string,membersAdded:number,membersRemoved:number}}>} 
 */
export async function updateUserGroup({ name, members }) {
  console.log(`[usergroups.js] updateUserGroup(name=${name}, members=[${members.join(', ')}])`);

  if (!name || typeof name !== "string") {
    throw new Error("'name' is required and must be a string");
  }
  if (!Array.isArray(members)) {
    throw new Error("'members' must be an array of usernames");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/user-groups/update`;
  const body = { name, members };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return _handleApiError(resp, "/user-groups/update");

    const data = await resp.json();

    // Clear cache since we've modified the groups
    clearUserGroupsCache();

    return data;
  } catch (err) {
    if (err.message === "Failed to fetch") {
      throw new Error("Network error: could not update user group.");
    }
    throw err;
  }
}

/**
 * ADD A SINGLE USER TO A GROUP (admin‑only)
 * Lambda: backend/services/lambdas/admin/usergroups/add_group_member.py
 * This is more efficient than updateUserGroup for large groups.
 * ------------------------------------------------------------
 * @param   {Object}  params
 * @param   {string}  params.name     Group name
 * @param   {string}  params.username Username to add
 * @returns {Promise<{success:boolean,group:{name:string,added:string,timestamp:string}}>}
 */
export async function addGroupMember({ name, username }) {
  console.log(`[usergroups.js] addGroupMember(name=${name}, username=${username})`);

  if (!name || typeof name !== "string") {
    throw new Error("'name' is required and must be a string");
  }
  if (!username || typeof username !== "string") {
    throw new Error("'username' is required and must be a string");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/user-groups/members/add`;
  const body = { name, username };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return _handleApiError(resp, "/user-groups/members/add");

    const data = await resp.json();

    // Clear cache since we've modified the groups
    clearUserGroupsCache();

    return data;
  } catch (err) {
    if (err.message === "Failed to fetch") {
      throw new Error("Network error: could not add user to group.");
    }
    throw err;
  }
}

/**
 * REMOVE A SINGLE USER FROM A GROUP (admin‑only)
 * Lambda: backend/services/lambdas/admin/usergroups/remove_group_member.py
 * This is more efficient than updateUserGroup for large groups.
 * ------------------------------------------------------------
 * @param   {Object}  params
 * @param   {string}  params.name     Group name
 * @param   {string}  params.username Username to remove
 * @returns {Promise<{success:boolean,group:{name:string,removed:string,timestamp:string,is_empty:boolean}}>}
 */
export async function removeGroupMember({ name, username }) {
  console.log(`[usergroups.js] removeGroupMember(name=${name}, username=${username})`);

  if (!name || typeof name !== "string") {
    throw new Error("'name' is required and must be a string");
  }
  if (!username || typeof username !== "string") {
    throw new Error("'username' is required and must be a string");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/user-groups/members/remove`;
  const body = { name, username };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return _handleApiError(resp, "/user-groups/members/remove");

    const data = await resp.json();

    // Clear cache since we've modified the groups
    clearUserGroupsCache();

    return data;
  } catch (err) {
    if (err.message === "Failed to fetch") {
      throw new Error("Network error: could not remove user from group.");
    }
    throw err;
  }
}

/**
 * DELETE A USER GROUP (admin‑only). Will fail with 409 if the group
 * still has documents awaiting approval.
 * Lambda: backend/services/lambdas/admin/usergroups/delete_user_group.py
 * ------------------------------------------------------------
 * @param   {Object}  params
 * @param   {string}  params.name   Group name to delete
 * @returns {Promise<{success:boolean,message:string,deleted:string}>}
 */
export async function deleteUserGroup({ name }) {
  console.log(`[usergroups.js] deleteUserGroup(name=${name})`);

  if (!name || typeof name !== "string") {
    throw new Error("'name' is required and must be a string");
  }

  const baseUrl = getBaseUrl("extended");
  const url = `${baseUrl}/user-groups/delete`;
  const body = { name };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) return _handleApiError(resp, "/user-groups/delete");

    const data = await resp.json();

    // Clear cache since we've modified the groups
    clearUserGroupsCache();

    return data;
  } catch (err) {
    if (err.message === "Failed to fetch") {
      throw new Error("Network error: could not delete user group.");
    }
    throw err;
  }
}

// Consolidated export (optional syntactic sugar)
export default {
  listUserGroups,
  createUserGroup,
  updateUserGroup,
  addGroupMember,
  removeGroupMember,
  deleteUserGroup,
  clearUserGroupsCache
};