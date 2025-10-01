// utils/security-utils.js
import { Security } from "../state/security.js";

/**
 * Custom Error Classes for Security System
 */
class SecuritySystemError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

export class SecurityError extends SecuritySystemError {}
export class AuthenticationError extends SecuritySystemError {}
export class AuthorizationError extends SecuritySystemError {}
export class ValidationError extends SecuritySystemError {}

/**
 * Global Security Manager singleton
 * Used as a centralized place to store and refresh security objects
 */
class SecurityManager {
  constructor() {
    this.instance = null;
    this.store = null;
    this.lastStoreUpdateTime = 0;
    this.lastUsername = null;
  }
  
  /**
   * Initialize with a store reference
   * @param {Object} store - Application store
   * @returns {Security} - Initialized Security instance
   */
  initialize(store) {
    this.store = store;
    this.lastStoreUpdateTime = Date.now();
    
    const user = this.store.get("user");
    if (!user || !user.username) {
      throw new SecurityError("Authentication required. No valid user found in store.", {
        context: "SecurityManager initialization",
        hasStore: !!store,
        hasUser: !!user
      });
    }
    
    this.lastUsername = user.username;
    this.instance = new Security(store);
    console.log("[SecurityManager] Initialized with store for user:", this.lastUsername);
    return this.instance;
  }
  
  /**
   * Get a fresh Security instance, but only recreate if needed
   * @returns {Security} - Security instance
   */
  getSecurity() {
    if (!this.store) {
      throw new SecurityError("SecurityManager not initialized with store", {
        context: "getSecurity",
        timestamp: new Date().toISOString()
      });
    }
    
    const user = this.store.get("user");
    if (!user || !user.username) {
      throw new SecurityError("Authentication required. No valid user found when accessing security.", {
        context: "getSecurity",
        hasStore: true,
        hasUser: !!user,
        timestamp: new Date().toISOString()
      });
    }
    
    const currentUsername = user.username;
    const userChanged = currentUsername !== this.lastUsername;
    
    // Check if we need to refresh the Security instance
    if (!this.instance || userChanged) {
      console.log("[SecurityManager] Creating new Security instance due to:", 
        userChanged ? "user change" : "no existing instance");
      this.instance = new Security(this.store);
      this.lastUsername = currentUsername;
      this.lastStoreUpdateTime = Date.now();
    }
    
    return this.instance;
  }
  
  /**
   * Force refresh the security instance
   * Use this after permission changes
   * @returns {Security} - Fresh Security instance
   */
  refreshSecurity() {
    if (!this.store) {
      throw new SecurityError("SecurityManager not initialized with store", {
        context: "refreshSecurity",
        timestamp: new Date().toISOString()
      });
    }
    
    const user = this.store.get("user");
    if (!user || !user.username) {
      throw new SecurityError("Authentication required. No valid user found when refreshing security.", {
        context: "refreshSecurity",
        hasStore: true,
        hasUser: !!user,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log("[SecurityManager] Forcing security refresh");
    this.instance = new Security(this.store);
    this.lastUsername = user.username;
    this.lastStoreUpdateTime = Date.now();
    return this.instance;
  }
}

// Create a singleton instance
export const securityManager = new SecurityManager();

/**
 * Initialize the security manager from main.js
 * @param {Store} store - The application store
 */
export function initializeSecurityManager(store) {
  securityManager.initialize(store);
  
  // Make it globally available for direct access with both naming conventions
  window.securityManager = securityManager;
  window.SecurityManager = securityManager; // Also provide uppercase version for router compatibility
  
  console.log(`[SecurityManager] Made globally available as both window.securityManager and window.SecurityManager`);
}

/**
 * Get a fresh Security instance
 * @param {Store} store - The application store
 * @returns {Security} - A fresh Security instance
 */
export function getFreshSecurity(store) {
  // Validate store is provided
  if (!store) {
    throw new SecurityError("Store is required for security operations", {
      context: "getFreshSecurity",
      timestamp: new Date().toISOString()
    });
  }

  // Validate user is authenticated
  const user = store.get("user");
  if (!user || !user.username) {
    throw new AuthenticationError("Authentication required. User must be logged in to access security functions.", {
      context: "getFreshSecurity",
      hasStore: true,
      hasUser: !!user,
      timestamp: new Date().toISOString()
    });
  }

  // Use the security manager if available and initialized
  if (window.securityManager?.store) {
    return window.securityManager.getSecurity();
  }
  
  // Otherwise create a new standalone instance
  return new Security(store);
}

/**
 * Force refreshing the security instance
 * @param {Store} store - The application store (optional if manager is initialized)
 * @returns {Security} - A fresh Security instance
 */
export function refreshSecurity(store = null) {
  // Use the security manager if available and initialized
  if (window.securityManager?.store) {
    return window.securityManager.refreshSecurity();
  }
  
  // Otherwise create a new standalone instance with provided store
  if (store) {
    // Validate user is authenticated
    const user = store.get("user");
    if (!user || !user.username) {
      throw new AuthenticationError("Authentication required. User must be logged in to refresh security.", {
        context: "refreshSecurity",
        hasStore: true,
        hasUser: !!user,
        timestamp: new Date().toISOString()
      });
    }
    return new Security(store);
  }
  
  throw new SecurityError("Cannot refresh security - no store available", {
    context: "refreshSecurity",
    hasSecurityManager: !!window.securityManager?.store,
    timestamp: new Date().toISOString()
  });
}

/**
 * Check permission using either the global security manager or a local security instance
 * @param {Store} store - The application store
 * @param {string} permType - The type of permission check (e.g., 'canAccessProject')
 * @param {string} id - The resource ID
 * @param {object} params - Additional parameters for the permission check
 * @returns {boolean} - Whether the permission check passed
 */
function checkPermission(store, permType, id, params = {}) {
  // Validate inputs
  if (!store) {
    throw new ValidationError("Store is required for permission checking", {
      context: "checkPermission",
      permType,
      id
    });
  }

  if (!permType) {
    throw new ValidationError("Permission type is required for permission checking", {
      context: "checkPermission",
      id,
      availableTypes: ['canAccessProject', 'canEditProject', 'canAccessAccount', 'canEditAccount', 'hasSystemPermission']
    });
  }

  // Get the security instance to use (this will fail fast if user not authenticated)
  const security = getFreshSecurity(store);
  
  // Perform the appropriate permission check
  switch (permType) {
    case 'canAccessProject':
      if (!id) {
        throw new ValidationError("Project ID is required for project access check", {
          context: "checkPermission:canAccessProject"
        });
      }
      return security.canAccessProject(id, params.metadata);
    case 'canEditProject':
      if (!id) {
        throw new ValidationError("Project ID is required for project edit check", {
          context: "checkPermission:canEditProject"
        });
      }
      return security.canEditProject(id, params.metadata);
    case 'canAccessAccount':
      if (!id) {
        throw new ValidationError("Account ID is required for account access check", {
          context: "checkPermission:canAccessAccount"
        });
      }
      return security.canAccessAccount(id, params.metadata);
    case 'canEditAccount':
      if (!id) {
        throw new ValidationError("Account ID is required for account edit check", {
          context: "checkPermission:canEditAccount"
        });
      }
      return security.canEditAccount(id, params.metadata);
    case 'hasSystemPermission':
      if (!id) {
        throw new ValidationError("Permission name is required for system permission check", {
          context: "checkPermission:hasSystemPermission"
        });
      }
      return security.hasSystemPermission(id); // id is the permission here
    default:
      throw new ValidationError(`Unknown permission type: ${permType}`, {
        context: "checkPermission",
        permType,
        id,
        availableTypes: ['canAccessProject', 'canEditProject', 'canAccessAccount', 'canEditAccount', 'hasSystemPermission']
      });
  }
}

/**
 * Verify API permissions and throw standardized error if check fails
 * @param {Store} store - The application store
 * @param {string} permType - The type of permission check (e.g., 'canAccessProject')
 * @param {string} id - The resource ID
 * @param {string} errorMessage - The error message if permission check fails
 * @param {object} params - Additional parameters for the permission check
 * @throws {Error} - If permission check fails
 */
export function verifyPermission(store, permType, id, errorMessage, params = {}) {
  // Validate inputs
  if (!errorMessage) {
    throw new ValidationError("Error message is required for permission verification", {
      context: "verifyPermission",
      permType,
      id
    });
  }

  try {
    const hasPermission = checkPermission(store, permType, id, params);
    
    if (!hasPermission) {
      throw new AuthorizationError(errorMessage, {
        context: "verifyPermission",
        permType,
        id,
        params,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    // Re-throw security system errors as-is
    if (error instanceof SecuritySystemError) {
      throw error;
    }
    
    // Wrap other errors in AuthorizationError
    throw new AuthorizationError(`Permission verification failed: ${error.message}`, {
      context: "verifyPermission",
      permType,
      id,
      originalError: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Sync user permissions after creating/modifying a resource
 * @param {Store} store - The application store
 * @param {string} resourceType - 'account' or 'project'
 * @param {Object} resourceData - The resource data
 */
export function syncUserPermissions(store, resourceType, resourceData) {
  // Validate required parameters
  if (!store) {
    throw new ValidationError("Store is required for permission synchronization", {
      context: "syncUserPermissions"
    });
  }

  if (!resourceType) {
    throw new ValidationError("Resource type is required for permission synchronization", {
      context: "syncUserPermissions",
      supportedTypes: ["account", "project"]
    });
  }

  if (!resourceData) {
    throw new ValidationError("Resource data is required for permission synchronization", {
      context: "syncUserPermissions",
      resourceType
    });
  }

  console.log(`[security-utils] Syncing user permissions for ${resourceType}:`, resourceData);

  try {
    // Get current user and validate authentication
    const user = store.get("user");
    if (!user || !user.username) {
      throw new AuthenticationError("Authentication required. User must be logged in to sync permissions.", {
        context: "syncUserPermissions",
        resourceType,
        hasStore: true,
        hasUser: !!user
      });
    }

    // Validate resource type
    if (!["account", "project"].includes(resourceType)) {
      throw new ValidationError(`Invalid resource type: ${resourceType}`, {
        context: "syncUserPermissions", 
        resourceType,
        supportedTypes: ["account", "project"]
      });
    }

    // For account resources
    if (resourceType === "account") {
      if (!resourceData.account_id) {
        throw new ValidationError("Account ID is required for account permission synchronization", {
          context: "syncUserPermissions:account",
          resourceData
        });
      }
      // Make a copy of the current user object
      const updatedUser = JSON.parse(JSON.stringify(user));
      
      // Add the account to authorized_accounts arrays if not already there
      if (!updatedUser.permissions.authorized_accounts.includes(resourceData.account_id)) {
        updatedUser.permissions.authorized_accounts.push(resourceData.account_id);
        updatedUser.authorized_accounts.push(resourceData.account_id);
        
        // Update user in store
        store.set("user", updatedUser);
        
        // Update in localStorage for persistence
        localStorage.setItem("authorized_accounts", 
          JSON.stringify(updatedUser.permissions.authorized_accounts));
          
        console.log(`[security-utils] Added account ${resourceData.account_id} to permissions`);
      }
    }
    // For project resources
    else if (resourceType === "project") {
      if (!resourceData.project_id) {
        throw new ValidationError("Project ID is required for project permission synchronization", {
          context: "syncUserPermissions:project",
          resourceData
        });
      }
      
      if (!resourceData.account_id) {
        throw new ValidationError("Account ID is required for project permission synchronization", {
          context: "syncUserPermissions:project",
          resourceData
        });
      }
      const projectKey = `${resourceData.account_id}#${resourceData.project_id}`;
      
      // Make a copy of the current user object
      const updatedUser = JSON.parse(JSON.stringify(user));
      
      // Add the project to authorized_projects arrays if not already there
      if (!updatedUser.permissions.authorized_projects.includes(projectKey)) {
        updatedUser.permissions.authorized_projects.push(projectKey);
        updatedUser.authorized_projects.push(projectKey);
        
        // Update user in store
        store.set("user", updatedUser);
        
        // Update in localStorage for persistence
        localStorage.setItem("authorized_projects", 
          JSON.stringify(updatedUser.permissions.authorized_projects));
          
        console.log(`[security-utils] Added project ${projectKey} to permissions`);
      }
    }
    
    // Refresh the security instance
    refreshSecurity();
    
  } catch (error) {
    console.error("[security-utils] Error synchronizing permissions:", error);
    
    // Re-throw security system errors to maintain fail-fast behavior
    if (error instanceof SecuritySystemError) {
      throw error;
    }
    
    // Wrap other errors in ValidationError
    throw new ValidationError(`Failed to synchronize user permissions: ${error.message}`, {
      context: "syncUserPermissions",
      resourceType,
      resourceData,
      originalError: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Updates the user's permissions after creating a new account
 * @param {Object} store - The application store instance
 * @param {Object} accountData - The account data returned from the API
 */
export function syncAfterAccountCreation(store, accountData) {
  if (!accountData) {
    throw new ValidationError("Account data is required for account creation synchronization", {
      context: "syncAfterAccountCreation"
    });
  }
  return syncUserPermissions(store, "account", accountData);
}

/**
 * Updates the user's permissions after creating a new project
 * @param {Object} store - The application store instance
 * @param {Object} projectData - The project data returned from the API
 */
export function syncAfterProjectCreation(store, projectData) {
  if (!projectData) {
    throw new ValidationError("Project data is required for project creation synchronization", {
      context: "syncAfterProjectCreation"
    });
  }
  return syncUserPermissions(store, "project", projectData);
}