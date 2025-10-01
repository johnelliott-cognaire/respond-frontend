// state/security.js
/**
 * Security Class - Consolidated Permissions Architecture
 * 
 * This version eliminates the dual permission structures and provides a single
 * source of truth for all permission checking.
 */

export class Security {
  // Define access level constants
  static DocumentAccess = {
    NONE: 'NONE',
    READ: 'READ',
    EDIT: 'EDIT'
  };

  /**
   * @param {Store} store - The global application state store
   */
  constructor(store) {
    // Defensive check for store
    if (!store) {
      console.warn("[Security] No store provided to Security constructor, creating with empty permissions");
      this.store = null;
    } else {
      this.store = store;
    }

    // Single unified permissions structure
    this.permissions = {
      system: [],              // System-level permissions (SYSTEM_ADMIN, etc.)
      corpus: {},              // Corpus-specific permissions
      docchain: [],            // DocChain process permissions
      accounts: [],            // Authorized account IDs
      projects: [],            // Authorized project IDs
    };

    // Add a cache for document access results
    this._documentAccessCache = new Map();
    
    // Load permissions from store on initialization
    this.loadPermissionsFromStore();
  }

  /**
   * Add backward compatibility getters to the permissions object
   * This MUST be called whenever the permissions object is recreated
   */
  _addBackwardCompatibilityGetters() {
    // Create closure to capture correct 'this'
    const self = this;
    
    // Define the getters using Object.defineProperties
    Object.defineProperties(this.permissions, {
      'authorized_accounts': { 
        get: function() { return self.permissions.accounts; },
        configurable: true  // Allow redefining - important!
      },
      'authorized_projects': { 
        get: function() { return self.permissions.projects; },
        configurable: true
      },
      'system_permissions': { 
        get: function() { return self.permissions.system; },
        configurable: true
      }
    });
  }

  /**
   * Clear the document access cache
   * Call this when user permissions change
   */
  clearDocumentAccessCache() {
    this._documentAccessCache = new Map();
  }

  /**
   * loadPermissionsFromStore()
   * Load all permissions from the store's user object into our unified structure
   */
  loadPermissionsFromStore() {
    // Handle case where store is not available
    if (!this.store) {
      console.warn("[Security] No store available in loadPermissionsFromStore");
      this._addBackwardCompatibilityGetters();
      return;
    }
    
    const user = this.store.get("user");
    
    if (!user) {
      // Make sure we still have the compatibility getters even with empty permissions
      this._addBackwardCompatibilityGetters();
      return;
    }

    // Extract system permissions - prioritize system_permissions over system
    let systemPerms = [];
    if (user.permissions) {
      if (Array.isArray(user.permissions.system_permissions)) {
        systemPerms = user.permissions.system_permissions;
      } else if (Array.isArray(user.permissions.system)) {
        systemPerms = user.permissions.system;
      }
    }


    // Extract corpus permissions
    const corpusPerms = (user.permissions && typeof user.permissions.corpus_permissions === 'object')
      ? user.permissions.corpus_permissions
      : {};

    // Extract docchain permissions
    const docchainPerms = (user.permissions && Array.isArray(user.permissions.docchain_permissions))
      ? user.permissions.docchain_permissions
      : [];

    // Extract authorized accounts - prioritize permissions structure but fall back to top level
    const accountsPerms = (user.permissions && Array.isArray(user.permissions.authorized_accounts))
      ? user.permissions.authorized_accounts
      : (Array.isArray(user.authorized_accounts))
        ? user.authorized_accounts
        : [];

    // Extract authorized projects - prioritize permissions structure but fall back to top level
    const projectsPerms = (user.permissions && Array.isArray(user.permissions.authorized_projects))
      ? user.permissions.authorized_projects
      : (Array.isArray(user.authorized_projects))
        ? user.authorized_projects
        : [];

    // Update our unified structure
    this.permissions = {
      system: systemPerms,
      corpus: corpusPerms,
      docchain: docchainPerms,
      accounts: accountsPerms,
      projects: projectsPerms,
    };

    // FINAL DEBUG LOGGING FOR PERMISSION ASSIGNMENT
    console.log(`[Security] ✅ Permissions updated in unified structure:`);
    console.log(`[Security] 🔍 this.permissions.system:`, this.permissions.system);
    console.log(`[Security] 🔍 SYSTEM_ADMIN check after assignment:`, this.permissions.system.includes('SYSTEM_ADMIN'));
    console.log(`[Security] 🔍 this.permissions.corpus:`, this.permissions.corpus);
    console.log(`[Security] 🔍 this.permissions.accounts:`, this.permissions.accounts);
    console.log(`[Security] 🔍 this.permissions.projects:`, this.permissions.projects);

    // Important: Add backward compatibility getters AFTER recreating permissions object
    this._addBackwardCompatibilityGetters();

    this.clearDocumentAccessCache();
    
    // Only log authentication flow information for important cases
    if (this.permissions.system.includes("SYSTEM_ADMIN") || this.permissions.system.includes("APP_ADMIN")) {
      console.log("[Security] Admin permissions loaded:", {
        "system_count": this.permissions.system.length,
        "accounts_count": this.permissions.accounts.length,
        "projects_count": this.permissions.projects.length,
        "has_SYSTEM_ADMIN": this.permissions.system.includes("SYSTEM_ADMIN"),
      });
    }
  }

  /**
   * hasSystemPermission(permissionOrArray)
   * Checks if the user has at least one of the specified system permission(s).
   * @param {string | string[]} permissionOrArray
   * @returns {boolean}
   */
  hasSystemPermission(permissionOrArray) {
    if (!Array.isArray(this.permissions.system) || this.permissions.system.length === 0) {
      return false;
    }

    // HIERARCHICAL PERMISSION SYSTEM - SYSTEM_ADMIN has access to everything
    if (this.permissions.system.includes('SYSTEM_ADMIN')) {
      return true;
    }

    if (Array.isArray(permissionOrArray)) {
      // If passed an array, return true if user has ANY of them
      return permissionOrArray.some(perm => this.permissions.system.includes(perm));
    } else {
      // Single permission
      return this.permissions.system.includes(permissionOrArray);
    }
  }

  /**
   * hasAnyPermission(permissions)
   * Router-compatible method to check if user has any of the specified permissions.
   * SYSTEM_ADMIN has access to everything.
   * @param {string[]} permissions - Array of permission names to check
   * @returns {boolean}
   */
  hasAnyPermission(permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      console.warn('[Security] hasAnyPermission called with invalid permissions:', permissions);
      return false;
    }

    // SYSTEM_ADMIN has access to everything - fail-fast bypass
    if (this.hasSystemPermission('SYSTEM_ADMIN')) {
      return true;
    }

    // Check if user has any of the requested permissions
    const hasPermission = this.hasSystemPermission(permissions);
    
    if (!hasPermission) {
      console.warn(`[Security] Permission denied - Required any of: [${permissions.join(', ')}], User has: [${this.permissions.system.join(', ')}]`);
    }
    
    return hasPermission;
  }

  /**
   * hasAllPermissions(permissions)
   * Router-compatible method to check if user has all of the specified permissions.
   * SYSTEM_ADMIN has access to everything.
   * @param {string[]} permissions - Array of permission names to check
   * @returns {boolean}
   */
  hasAllPermissions(permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      console.warn('[Security] hasAllPermissions called with invalid permissions:', permissions);
      return false;
    }

    // SYSTEM_ADMIN has access to everything - fail-fast bypass
    if (this.hasSystemPermission('SYSTEM_ADMIN')) {
      return true;
    }

    // Check if user has all of the requested permissions
    const hasAllPerms = permissions.every(perm => this.permissions.system.includes(perm));
    
    if (!hasAllPerms) {
      const userPerms = this.permissions.system;
      const missingPerms = permissions.filter(perm => !userPerms.includes(perm));
      console.warn(`[Security] Permission denied - Required all of: [${permissions.join(', ')}], User missing: [${missingPerms.join(', ')}], User has: [${userPerms.join(', ')}]`);
    }
    
    return hasAllPerms;
  }

  /**
   * hasRouterPermission(permissions, enforcePermissions)
   * Router-specific method that respects the enforcePermissions flag.
   * Centralizes all router permission logic in security.js for consistency.
   * @param {string[]} permissions - Array of permission names to check
   * @param {boolean} enforcePermissions - Whether to actually enforce permissions
   * @param {string} routeId - Route ID for logging
   * @returns {Object} {allowed: boolean, reason?: string, requiredPermissions?: string[]}
   */
  hasRouterPermission(permissions, enforcePermissions = false, routeId = 'unknown') {
    // COMPREHENSIVE DEBUG LOGGING FOR SYSTEM_ADMIN BYPASS ISSUE
    console.log(`[Security] 🔍 hasRouterPermission called:`, {
      routeId,
      permissions,
      enforcePermissions,
      currentUserPermissions: this.permissions.system,
      hasSystemAdminCheck: this.hasSystemPermission('SYSTEM_ADMIN')
    });

    // If enforcement is disabled, always allow (let security.js handle it at UI level)
    if (!enforcePermissions) {
      if (permissions && permissions.length > 0) {
        console.log(`[Security] 📋 Router permission data available but enforcement DISABLED for route: ${routeId}, Available permissions:`, permissions);
      }
      console.log(`[Security] 🟢 Permission enforcement DISABLED - allowing access to route: ${routeId}`);
      return { allowed: true };
    }

    // If no permissions specified, allow access
    if (!permissions || permissions.length === 0) {
      console.log(`[Security] 🟢 No permissions required - allowing access to route: ${routeId}`);
      return { allowed: true };
    }

    // SYSTEM_ADMIN has access to everything - hierarchical bypass
    const hasSystemAdmin = this.hasSystemPermission('SYSTEM_ADMIN');
    if (hasSystemAdmin) {
      return { allowed: true };
    }

    // Check if user has the required permissions
    const hasPermission = this.hasSystemPermission(permissions);
    if (!hasPermission) {
      console.warn(`[Security] Access denied to route ${routeId}. Required: ${permissions.join(', ')}, User has: ${this.permissions.system.join(', ')}`);
      return {
        allowed: false,
        reason: 'Insufficient permissions',
        requiredPermissions: permissions
      };
    }
    
    console.log(`[Security] ✅ Router permission check PASSED for route: ${routeId}`);
    return { allowed: true };
  }

  /**
   * Check if user can access a specific document
   * @param {string} docId - Document ID
   * @param {Object} docMetadata - Document metadata including owner and project info
   * @param {string} docMetadata.owner_username - Username of document owner
   * @param {string} docMetadata.project_id - Project ID the document belongs to (format: "acct_XYZ#proj_ABC")
   * @returns {string} - Returns one of: 'NONE', 'READ', or 'EDIT'
   */
  canAccessDocument(docId, docMetadata) {
    // Return cached result if available
    const cacheKey = `${docId}`;
    if (this._documentAccessCache.has(cacheKey)) {
      return this._documentAccessCache.get(cacheKey);
    }

    let accessLevel = Security.DocumentAccess.NONE;

    // Check system-level permissions first
    if (this.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN'])) {
      accessLevel = Security.DocumentAccess.EDIT;
      this._documentAccessCache.set(cacheKey, accessLevel);
      return accessLevel;
    }

    // If no document metadata provided, we can't determine access
    if (!docMetadata) {
      console.warn(`[Security] canAccessDocument: No metadata provided for document ${docId}`);
      return Security.DocumentAccess.NONE;
    }

    // Check document ownership
    if (docMetadata.owner_username === this.store?.get('user')?.username) {
      accessLevel = Security.DocumentAccess.EDIT;
      this._documentAccessCache.set(cacheKey, accessLevel);
      return accessLevel;
    }

    // Check project-based access
    if (docMetadata.project_id) {
      const hasProjectAccess = this.permissions.projects.includes(docMetadata.project_id);
      
      if (hasProjectAccess) {
        // If user has PROJECT_EDITOR and project access, they get edit rights
        if (this.hasSystemPermission('PROJECT_EDITOR')) {
          accessLevel = Security.DocumentAccess.EDIT;
        }
        // If user has PROJECT_VIEWER and project access, they get read rights
        else if (this.hasSystemPermission('PROJECT_VIEWER')) {
          accessLevel = Security.DocumentAccess.READ;
        }
      }
    }

    // Cache and return the result
    this._documentAccessCache.set(cacheKey, accessLevel);
    return accessLevel;
  }

  /**
   * Convenience method for checking if user can edit a document
   * @param {string} docId - Document ID
   * @param {Object} docMetadata - Document metadata
   * @returns {boolean}
   */
  canEditDocument(docId, docMetadata) {
    return this.canAccessDocument(docId, docMetadata) === Security.DocumentAccess.EDIT;
  }

  /**
   * Convenience method for checking if user can view a document
   * @param {string} docId - Document ID
   * @param {Object} docMetadata - Document metadata
   * @returns {boolean}
   */
  canViewDocument(docId, docMetadata) {
    const access = this.canAccessDocument(docId, docMetadata);
    return access === Security.DocumentAccess.READ || access === Security.DocumentAccess.EDIT;
  }

  /**
   * canAccessAccount(accountId, accountMetadata)
   * @param {string} accountId
   * @param {Object} accountMetadata - Optional metadata about the account (including owner)
   * @returns {boolean}
   */
  canAccessAccount(accountId, accountMetadata = null) {
    if (!accountId) return false;

    // SYSTEM_ADMIN or APP_ADMIN always has access
    if (this.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
      return true;
    }
    
    // Check if current user is owner
    if (accountMetadata && accountMetadata.owner) {
      const currentUsername = this.store?.get('user')?.username;
      if (currentUsername && accountMetadata.owner === currentUsername) {
        console.log(`[Security] User ${currentUsername} is the owner of account ${accountId} => can access`);
        return true;
      }
    }

    // Add defensive check for accounts array
    if (!this.permissions.accounts) {
      console.warn("[Security] canAccessAccount: accounts array is undefined");
      return false;
    }

    // Check authorized accounts list
    return this.permissions.accounts.includes(accountId);
  }

  /**
   * canEditAccount(accountId, accountMetadata)
   * @param {string} accountId
   * @param {Object} accountMetadata - Optional metadata about the account (including owner)
   * @returns {boolean}
   */
  canEditAccount(accountId, accountMetadata = null) {

    // SYSTEM_ADMIN or APP_ADMIN can always edit
    if (this.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
      return true;
    }

    // Check if current user is owner
    if (accountMetadata && accountMetadata.owner) {
      const currentUsername = this.store?.get('user')?.username;
      if (currentUsername && accountMetadata.owner === currentUsername) {
        console.log(`[Security] User ${currentUsername} is the owner of account ${accountId} => can edit`);
        return true;
      }
    }

    // Otherwise, user must have 'ACCOUNT_EDITOR' + be authorized for that account
    const hasEditorPerm = this.hasSystemPermission("ACCOUNT_EDITOR");
    
    // Add defensive check for accounts array
    if (!this.permissions.accounts) {
      console.warn("[Security] canEditAccount: accounts array is undefined");
      return false;
    }
    
    const canAccess = this.permissions.accounts.includes(accountId);

    return hasEditorPerm && canAccess;
  }

  /**
   * canAccessProject(projectId, projectMetadata)
   * @param {string} projectId  (format: "acct_23X#proj_001")
   * @param {Object} projectMetadata - Optional metadata about the project (including created_by)
   * @returns {boolean}
   */
  canAccessProject(projectId, projectMetadata = null) {
    if (!projectId) return false;

    // SYSTEM_ADMIN or APP_ADMIN always has access
    if (this.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
      return true;
    }
    
    // Check if current user is creator/owner
    if (projectMetadata && projectMetadata.created_by) {
      const currentUsername = this.store?.get('user')?.username;
      if (currentUsername && projectMetadata.created_by === currentUsername) {
        console.log(`[Security] User ${currentUsername} is the creator of project ${projectId} => can access`);
        return true;
      }
    }

    // Add defensive check for projects array
    if (!this.permissions.projects) {
      console.warn("[Security] canAccessProject: projects array is undefined");
      return false;
    }

    // Check authorized projects list
    return this.permissions.projects.includes(projectId);
  }

  /**
   * canEditProject(projectId, projectMetadata)
   * @param {string} projectId
   * @param {Object} projectMetadata - Optional metadata about the project (including created_by)
   * @returns {boolean}
   */
  canEditProject(projectId, projectMetadata = null) {

    // SYSTEM_ADMIN or APP_ADMIN can always edit
    if (this.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
      return true;
    }

    // Check if current user is creator/owner
    if (projectMetadata && projectMetadata.created_by) {
      const currentUsername = this.store?.get('user')?.username;
      if (currentUsername && projectMetadata.created_by === currentUsername) {
        console.log(`[Security] User ${currentUsername} is the creator of project ${projectId} => can edit`);
        return true;
      }
    }

    // Add defensive checks for arrays
    if (!this.permissions.projects) {
      console.warn("[Security] canEditProject: projects array is undefined");
      return false;
    }

    // If user has PROJECT_EDITOR and is authorized for that project
    const isProjectEditor = this.hasSystemPermission("PROJECT_EDITOR");
    const canAccessThisProject = this.permissions.projects.includes(projectId);
    if (isProjectEditor && canAccessThisProject) {
      return true;
    }

    // If user is ACCOUNT_EDITOR for the account portion
    // projectId looks like: "acct_23X#proj_001"
    const [acctId] = projectId.split("#");
    
    if (!this.permissions.accounts) {
      console.warn("[Security] canEditProject: accounts array is undefined");
      return false;
    }
    
    if (this.hasSystemPermission("ACCOUNT_EDITOR") && 
        this.permissions.accounts.includes(acctId)) {
      return true;
    }

    return false;
  }

  /**
   * canGrantAccountAccess(accountId, accountMetadata)
   * @param {string} accountId
   * @param {Object} accountMetadata - Optional metadata about the account (including owner)
   * @returns {boolean}
   */
  canGrantAccountAccess(accountId, accountMetadata = null) {

    if (this.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
      return true;
    }

    // Check if current user is owner
    if (accountMetadata && accountMetadata.owner) {
      const currentUsername = this.store?.get('user')?.username;
      if (currentUsername && accountMetadata.owner === currentUsername) {
        console.log(`[Security] User ${currentUsername} is the owner of account ${accountId} => can grant access`);
        return true;
      }
    }

    // Add defensive check for accounts array
    if (!this.permissions.accounts) {
      console.warn("[Security] canGrantAccountAccess: accounts array is undefined");
      return false;
    }

    // If user is an ACCOUNT_EDITOR and can edit the account in question
    if (this.hasSystemPermission("ACCOUNT_EDITOR") &&
        this.permissions.accounts.includes(accountId)) {
      return true;
    }

    return false;
  }

  /**
   * canGrantProjectAccess(projectId, projectMetadata)
   * @param {string} projectId
   * @param {Object} projectMetadata - Optional metadata about the project (including created_by)
   * @returns {boolean}
   */
  canGrantProjectAccess(projectId, projectMetadata = null) {

    if (this.hasSystemPermission(["SYSTEM_ADMIN", "APP_ADMIN"])) {
      return true;
    }

    // Check if current user is creator/owner
    if (projectMetadata && projectMetadata.created_by) {
      const currentUsername = this.store?.get('user')?.username;
      if (currentUsername && projectMetadata.created_by === currentUsername) {
        console.log(`[Security] User ${currentUsername} is the creator of project ${projectId} => can grant access`);
        return true;
      }
    }

    // PROJECT_EDITOR => must have that system perm plus the project in authorized_projects
    const isProjEditor = this.hasSystemPermission("PROJECT_EDITOR") &&
      this.canAccessProject(projectId);

    // or if user is ACCOUNT_EDITOR for the parent account
    // parse out "acct_XYZ#proj_ABC"
    const [acctId] = projectId.split("#");
    
    // Add defensive check for accounts array
    if (!this.permissions.accounts) {
      console.warn("[Security] canGrantProjectAccess: accounts array is undefined");
      return false;
    }
    
    const isAcctEditor = this.hasSystemPermission("ACCOUNT_EDITOR") &&
      this.permissions.accounts.includes(acctId);

    return isProjEditor || isAcctEditor;
  }

  /**
   * canAssignSystemPermission(permission)
   * @param {string} permission
   * @returns {boolean}
   */
  canAssignSystemPermission(permission) {

    // SYSTEM_ADMIN can assign anything
    if (this.hasSystemPermission("SYSTEM_ADMIN")) {
      return true;
    }

    // APP_ADMIN can assign lower-level perms
    if (this.hasSystemPermission("APP_ADMIN")) {
      if (["ACCOUNT_EDITOR", "ACCOUNT_VIEWER", "PROJECT_EDITOR", "PROJECT_VIEWER"].includes(permission)) {
        return true;
      }
      return false;
    }

    // ACCOUNT_EDITOR can assign only PROJECT_EDITOR/VIEWER
    if (this.hasSystemPermission("ACCOUNT_EDITOR")) {
      if (["PROJECT_EDITOR", "PROJECT_VIEWER"].includes(permission)) {
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * getAccessibleAccounts()
   * @returns {string[]} - array of account IDs that the user can access
   */
  getAccessibleAccounts() {
    
    // Add defensive check for accounts array
    if (!this.permissions.accounts) {
      console.warn("[Security] getAccessibleAccounts: accounts array is undefined");
      return [];
    }
    
    return [...this.permissions.accounts]; // Return a copy of the array
  }

  /**
   * getAccessibleProjects(accountId)
   * @param {string} accountId
   * @returns {string[]}
   */
  getAccessibleProjects(accountId) {
    
    // Add defensive check for projects array
    if (!this.permissions.projects) {
      console.warn("[Security] getAccessibleProjects: projects array is undefined");
      return [];
    }
    
    return this.permissions.projects.filter((projId) => {
      const [acct] = projId.split("#");
      return acct === accountId;
    });
  }

  /**
   * Check if user has specific permission for a corpus
   * @param {string} corpusId - The corpus identifier
   * @param {string} permissionType - The permission type to check for
   * @returns {boolean} Whether the user has the permission
   */
  hasCorpusPermission(corpusId, permissionType) {
    // SYSTEM_ADMIN has all permissions
    if (this.hasSystemPermission('SYSTEM_ADMIN')) return true;
    
    // Add defensive check for corpus object
    if (!this.permissions.corpus) {
      console.warn("[Security] hasCorpusPermission: corpus object is undefined");
      return false;
    }
    
    const corpusPerms = this.permissions.corpus[corpusId] || [];
    return corpusPerms.includes(permissionType);
  }

  /**
   * Check if user can manage corpus permissions
   * @returns {boolean} Whether user can manage corpus permissions
   */
  canManageCorpusPermissions() {
    return this.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN']);
  }

  /**
   * Check if user has permission to run a specific DocChain process
   * @param {string} processId - The process definition ID
   * @returns {boolean} Whether the user can run this process
   */
  hasDocChainPermission(processId) {
    // SYSTEM_ADMIN has all permissions
    // Temporarily commenting this out to align with the back-end
    //if (this.hasSystemPermission('SYSTEM_ADMIN')) return true;
    
    // Add defensive check for docchain array
    if (!this.permissions.docchain) {
      console.warn("[Security] hasDocChainPermission: docchain array is undefined");
      return false;
    }
    
    return this.permissions.docchain.includes(processId);
  }

  /**
   * Check if user can manage DocChain permissions
   * @returns {boolean} Whether user can manage DocChain permissions
   */
  canManageDocChainPermissions() {
    return this.hasSystemPermission(['SYSTEM_ADMIN', 'APP_ADMIN']);
  }

  /**
   * Validate if user can perform document operation (enhanced for AI integration)
   * @param {string} documentId - Document ID
   * @param {Object} docMetadata - Document metadata
   * @param {string} operation - Operation type: 'VIEW', 'EDIT', 'AI_SINGLE', 'AI_BATCH'
   * @param {string} corpusId - Corpus ID (required for AI operations)
   * @returns {Object} { allowed: boolean, message: string }
   */
  validateDocumentOperation(documentId, docMetadata, operation = 'EDIT', corpusId = null) {
    // Only log AI operations and authentication failures
    
    // Check basic document access first
    const docAccess = this.canAccessDocument(documentId, docMetadata);
    
    if (operation === 'VIEW') {
      if (docAccess === Security.DocumentAccess.NONE) {
        return {
          allowed: false,
          message: this.getRequiredPermissionsMessage('document_view', docMetadata)
        };
      }
      return { allowed: true, message: 'Access granted' };
    }
    
    if (operation === 'EDIT') {
      if (docAccess !== Security.DocumentAccess.EDIT) {
        return {
          allowed: false,
          message: this.getRequiredPermissionsMessage('document_edit', docMetadata)
        };
      }
      return { allowed: true, message: 'Edit access granted' };
    }
    
    // AI operations require both document edit AND corpus permissions
    if (operation === 'AI_SINGLE' || operation === 'AI_BATCH') {
      console.log(`[Security] AI operation ${operation} requested for doc ${documentId} with corpus ${corpusId}`);
      
      // Must have document edit access
      if (docAccess !== Security.DocumentAccess.EDIT) {
        console.warn(`[Security] AI operation denied - insufficient document access: ${docAccess}`);
        return {
          allowed: false,
          message: this.getRequiredPermissionsMessage('document_edit', docMetadata)
        };
      }
      
      // Must have corpus permission
      if (!corpusId) {
        console.warn(`[Security] AI operation denied - no corpus ID provided`);
        return {
          allowed: false,
          message: 'Corpus ID is required for AI operations'
        };
      }
      
      const requiredCorpusPermission = operation === 'AI_BATCH' ? 'BATCH' : 'AD_HOC';
      
      if (!this.hasCorpusPermission(corpusId, requiredCorpusPermission)) {
        console.warn(`[Security] AI operation denied - insufficient corpus permission: ${requiredCorpusPermission} for ${corpusId}`);
        return {
          allowed: false,
          message: this.getRequiredPermissionsMessage('corpus_ai', { corpusId, permissionType: requiredCorpusPermission })
        };
      }
      
      console.log(`[Security] AI operation ${operation} authorized for corpus ${corpusId}`);
      return { allowed: true, message: `AI ${operation} access granted` };
    }
    
    return {
      allowed: false,
      message: `Unknown operation: ${operation}`
    };
  }

  /**
   * Generate user-friendly permission requirement messages
   * @param {string} operationType - Type of operation
   * @param {Object} context - Context object with relevant information
   * @returns {string} User-friendly error message
   */
  getRequiredPermissionsMessage(operationType, context = {}) {
    const currentUser = this.store?.get('user')?.username || 'Unknown';
    
    switch (operationType) {
      case 'document_view':
        if (context.project_id) {
          return `You need PROJECT_VIEWER or PROJECT_EDITOR permission and access to project '${context.project_id}' to view this document. Contact your administrator to request access.`;
        }
        return 'You need PROJECT_VIEWER or PROJECT_EDITOR permission to view documents. Contact your administrator to request access.';
        
      case 'document_edit':
        if (context.project_id) {
          return `You need PROJECT_EDITOR permission and access to project '${context.project_id}' to edit this document. Contact your administrator to request access.`;
        }
        return 'You need PROJECT_EDITOR permission to edit documents. Contact your administrator to request access.';
        
      case 'corpus_ai':
        const { corpusId, permissionType } = context;
        const operationName = permissionType === 'BATCH' ? 'bulk AI answer generation' : 'single question AI';
        return `You need ${permissionType} permission for '${corpusId}' corpus to use ${operationName}. Contact your administrator to request this corpus permission.`;
        
      case 'project_create':
        return 'You need PROJECT_EDITOR permission and access to the target account to create documents. Contact your administrator to request access.';
        
      default:
        return 'You do not have sufficient permissions for this operation. Contact your administrator for assistance.';
    }
  }

  /**
   * Check if user has the minimum required permissions for basic app usage
   * @returns {Object} { hasAccess: boolean, missingPermissions: string[] }
   */
  validateMinimumAppAccess() {
    const missingPermissions = [];
    
    // Must have APP_ACCESS
    if (!this.hasSystemPermission('APP_ACCESS')) {
      missingPermissions.push('APP_ACCESS - Basic application access');
    }
    
    // Must have at least one of the working permissions
    const workingPermissions = ['PROJECT_VIEWER', 'PROJECT_EDITOR', 'ACCOUNT_VIEWER', 'ACCOUNT_EDITOR'];
    if (!this.hasSystemPermission(workingPermissions)) {
      missingPermissions.push('At least one of: PROJECT_VIEWER, PROJECT_EDITOR, ACCOUNT_VIEWER, or ACCOUNT_EDITOR');
    }
    
    return {
      hasAccess: missingPermissions.length === 0,
      missingPermissions
    };
  }

  /**
   * Show a standardized permission error modal with helpful information
   * @param {Object} errorModal - The error modal instance to use
   * @param {string} operationType - The type of operation attempted
   * @param {Object} context - Additional context for the error message
   * @param {string} validationMessage - The specific validation message from permission check
   */
  showPermissionError(errorModal, operationType, context = {}, validationMessage = null) {
    const currentUser = this.store?.get('user')?.username || 'Unknown';
    
    // Use the validation message if provided, otherwise generate one
    const message = validationMessage || this.getRequiredPermissionsMessage(operationType, context);
    
    // Enhanced title based on operation type
    let title = "Permission Denied";
    switch (operationType) {
      case 'document_view':
      case 'document_edit':
        title = "Document Access Denied";
        break;
      case 'corpus_ai':
        title = "AI Operations Not Permitted";
        break;
      case 'project_create':
        title = "Project Creation Denied";
        break;
      default:
        title = "Access Denied";
        break;
    }
    
    // Show the error modal with enhanced messaging
    if (errorModal) {
      errorModal.show({
        title: title,
        message: message,
        details: `User: ${currentUser}\nOperation: ${operationType}\nTimestamp: ${new Date().toISOString()}`
      });
    } else {
      console.error(`[Security] Permission denied for ${currentUser}: ${message}`);
      
      // Fallback to alert if no modal available (should not happen in normal usage)
      alert(`${title}\n\n${message}`);
    }
  }

  /**
   * Get user-friendly suggestions for obtaining required permissions
   * @param {string} operationType - The type of operation
   * @returns {string} Helpful suggestions for the user
   */
  getPermissionSuggestions(operationType) {
    const suggestions = {
      'document_view': 'Request PROJECT_VIEWER or PROJECT_EDITOR role from your administrator, or ask the document owner to share access.',
      'document_edit': 'Request PROJECT_EDITOR role from your administrator, or ask the document owner to grant edit access.',
      'corpus_ai': 'Request the appropriate corpus permissions (AD_HOC for single questions, BATCH for multiple questions) from your administrator.',
      'project_create': 'Request PROJECT_EDITOR role and access to the target account from your administrator.',
      'account_access': 'Request ACCOUNT_VIEWER or ACCOUNT_EDITOR role and access to the specific account from your administrator.',
      'system_admin': 'Contact your Cognaire system administrator for elevated permissions.'
    };
    
    return suggestions[operationType] || 'Contact your administrator to request the appropriate permissions for this operation.';
  }

  /**
   * STATIC HELPER
   * Helper to process user data and add to store
   * 
   * @param {Store} store - The application store
   * @param {Object} userData - User data to process
   */
  static storeUser(store, userData) {
    if (!userData) return;

    // Create a clean user object
    const processedUser = {
      username: userData.username || "guest",
      permissions: {} // Will be populated below
    };

    // Process permissions from string or object
    let permissionsObj = {};
    if (userData.permissions) {
      if (typeof userData.permissions === "string") {
        try {
          // Try to parse as JSON first
          try {
            permissionsObj = JSON.parse(userData.permissions);
          } catch (jsonErr) {
            // If that fails, try base64 decode
            const decoded = atob(userData.permissions);
            permissionsObj = JSON.parse(decoded);
          }
        } catch (err) {
          console.warn("[Security.storeUser] Could not parse permissions string:", err);
          permissionsObj = {}; // Reset on error
        }
      } else if (typeof userData.permissions === "object") {
        permissionsObj = userData.permissions;
      }
    }

    // Normalize the permissions object with consistent naming
    processedUser.permissions = {
      // System permissions (prioritize system_permissions over system)
      system_permissions: Array.isArray(permissionsObj.system_permissions) 
        ? permissionsObj.system_permissions 
        : Array.isArray(permissionsObj.system)
          ? permissionsObj.system
          : [],
          
      // Other permission types  
      corpus_permissions: typeof permissionsObj.corpus_permissions === 'object'
        ? permissionsObj.corpus_permissions
        : {},
        
      docchain_permissions: Array.isArray(permissionsObj.docchain_permissions)
        ? permissionsObj.docchain_permissions
        : [],
        
      // Authorized accounts (from permissions object or top-level)
      authorized_accounts: Array.isArray(permissionsObj.authorized_accounts)
        ? permissionsObj.authorized_accounts
        : Array.isArray(userData.authorized_accounts)
          ? userData.authorized_accounts
          : [],
          
      // Authorized projects (from permissions object or top-level)
      authorized_projects: Array.isArray(permissionsObj.authorized_projects)
        ? permissionsObj.authorized_projects
        : Array.isArray(userData.authorized_projects)
          ? userData.authorized_projects
          : []
    };

    // For backward compatibility, also include at top level
    processedUser.authorized_projects = [...processedUser.permissions.authorized_projects];
    processedUser.authorized_accounts = [...processedUser.permissions.authorized_accounts];

    // Log only for authentication flow tracking
    if (processedUser.permissions.system_permissions.includes("SYSTEM_ADMIN") || 
        processedUser.permissions.system_permissions.includes("APP_ADMIN")) {
      console.log("[Security.storeUser] Admin user authenticated:", {
        username: processedUser.username,
        "system_permissions_count": processedUser.permissions.system_permissions.length
      });
    } else if (processedUser.authorized_projects.length > 0 || processedUser.authorized_accounts.length > 0) {
      console.log("[Security.storeUser] User authenticated with project/account access:", {
        username: processedUser.username,
        "project_count": processedUser.authorized_projects.length,
        "account_count": processedUser.authorized_accounts.length
      });
    }

    // Set user in store
    store.set("user", processedUser);
    
    // IMPORTANT: Remove or reset the legacy empty permissions structure
    // to prevent confusion with the permissions inside user object
    store.set("permissions", null);
  }
}

/**
 * Get a fresh Security instance with current store state
 * @param {Store} store - The application store
 * @returns {Security} A new Security instance
 */
export function getFreshSecurity(store) {
  return new Security(store);
}