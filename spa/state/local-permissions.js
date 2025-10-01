// File: state/local-permissions.js

import { Security } from "./security.js";

/**
 * Updates the user's permissions in localStorage and Store after resource creation/update
 * @param {Object} store - The application store instance
 * @param {string} resourceType - 'account' or 'project'
 * @param {Object} resourceData - The resource data returned from the API
 */
export function syncUserPermissions(store, resourceType, resourceData) {
  if (!store || !resourceType || !resourceData) {
    console.error("[permissions-sync] Missing required parameters");
    return;
  }

  console.log(`[permissions-sync] Syncing user permissions for ${resourceType}:`, resourceData);

  try {
    // Get current user from store
    const user = store.get("user");
    if (!user || !user.username) {
      console.warn("[permissions-sync] No user in store, cannot sync permissions");
      return;
    }

    // Get current permissions from localStorage
    let authorizedAccounts = JSON.parse(localStorage.getItem("authorized_accounts") || "[]");
    let authorizedProjects = JSON.parse(localStorage.getItem("authorized_projects") || "[]");

    if (resourceType === "account" && resourceData.account_id) {
      // Add the new account to authorized_accounts if not already present
      if (!authorizedAccounts.includes(resourceData.account_id)) {
        authorizedAccounts.push(resourceData.account_id);
        localStorage.setItem("authorized_accounts", JSON.stringify(authorizedAccounts));
        console.log(`[permissions-sync] Added account ${resourceData.account_id} to localStorage`);
      }
    } 
    else if (resourceType === "project" && resourceData.project_id && resourceData.account_id) {
      // For projects, the format is "account_id#project_id"
      const projectKey = `${resourceData.account_id}#${resourceData.project_id}`;
      
      // Add the new project to authorized_projects if not already present
      if (!authorizedProjects.includes(projectKey)) {
        authorizedProjects.push(projectKey);
        localStorage.setItem("authorized_projects", JSON.stringify(authorizedProjects));
        console.log(`[permissions-sync] Added project ${projectKey} to localStorage`);
      }
    }

    // Update user in Store by recreating userData and calling Security.storeUser
    const userData = {
      username: user.username,
      permissions: localStorage.getItem("permissions"),
      authorized_projects: authorizedProjects,
      authorized_accounts: authorizedAccounts
    };

    // Update the store with the new permissions
    Security.storeUser(store, userData);
    console.log("[permissions-sync] Updated store with new permissions");

  } catch (error) {
    console.error("[permissions-sync] Error synchronizing permissions:", error);
  }
}

/**
 * Updates the user's permissions after creating a new account
 * @param {Object} store - The application store instance
 * @param {Object} accountData - The account data returned from the API
 */
export function syncAfterAccountCreation(store, accountData) {
  return syncUserPermissions(store, "account", accountData);
}

/**
 * Updates the user's permissions after creating a new project
 * @param {Object} store - The application store instance
 * @param {Object} projectData - The project data returned from the API
 */
export function syncAfterProjectCreation(store, projectData) {
  return syncUserPermissions(store, "project", projectData);
}