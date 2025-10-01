// utils/config.js
//
// This file contains all environment-specific configuration.
// In production, this entire file will be replaced by the deployment process.
//

// API URLs for different endpoints and tenants
const API_URLS = {
  dev1: {
    main: "https://zctxog7whh.execute-api.us-east-1.amazonaws.com/dev",
    auth: "https://vdnrscy6rd.execute-api.us-east-1.amazonaws.com/dev",
    extended: "https://66kok9krpf.execute-api.us-east-1.amazonaws.com/dev",
    public: "https://o6tbb8ovp7.execute-api.us-east-1.amazonaws.com/public",
    assist: "https://so0q8ti6ja.execute-api.us-east-1.amazonaws.com/dev"
  },
  dev2: {
    main: "https://ru41vk3rv6.execute-api.us-east-1.amazonaws.com/dev",
    auth: "https://ru41vk3rv6.execute-api.us-east-1.amazonaws.com/dev",
    extended: "https://s5dfdsshih.execute-api.us-east-1.amazonaws.com/dev",
    public: "https://2vm7rdc5j2.execute-api.us-east-1.amazonaws.com/public",
    assist: "https://so0q8ti6ja.execute-api.us-east-1.amazonaws.com/dev"
  },
  // Default tenant (fallback)
  default: {
    main: "https://zctxog7whh.execute-api.us-east-1.amazonaws.com/dev",
    auth: "https://vdnrscy6rd.execute-api.us-east-1.amazonaws.com/dev",
    extended: "https://66kok9krpf.execute-api.us-east-1.amazonaws.com/dev",
    public: "https://o6tbb8ovp7.execute-api.us-east-1.amazonaws.com/public",
    assist: "https://so0q8ti6ja.execute-api.us-east-1.amazonaws.com/dev"
  }
};

// Environment configuration
const ENV_CONFIG = {
  tenant: "dev",
  maxShards: 5,
  env: "development"
};

// Sample corpus configuration
const CORPUS_CONFIG = {
  "corpora": [
    {
      "corpus_id": "default",
      "display_name": "Default Corpus",
      "description": "The default document corpus"
    }
  ]
};

/**
 * Extract tenant name from current URL
 * @returns {string} - The tenant name
 */
function extractTenantFromUrl() {
  // Try to get tenant from subdomain (e.g., 'dev2' from dev2.cognairerespond.com)
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // If we have a subdomain (more than 2 parts), use the first part as tenant
  if (parts.length > 2 && parts[0] !== 'www') {
    return parts[0];
  }

  // Fall back to querystring parameter
  const urlParams = new URLSearchParams(window.location.search);
  const tenantParam = urlParams.get('tenant');

  if (tenantParam) {
    return tenantParam;
  }

  // Final fallback
  return 'default';
}

/**
 * Get the base URL for the specified API
 * @param {string} api - API key ('main', 'auth', 'extended', or 'public')
 * @returns {string} - The base URL
 */
export function getBaseUrl(api = "main") {
  const tenant = extractTenantFromUrl();

  // Check if we have URLs for this tenant
  if (!API_URLS[tenant]) {
    console.warn(`[config] No API URLs configured for tenant '${tenant}', falling back to 'default'`);
    const fallbackTenant = 'default';

    if (!API_URLS[fallbackTenant] || !API_URLS[fallbackTenant][api]) {
      throw new Error(`No base URL configured for api='${api}' and tenant='${fallbackTenant}'.`);
    }

    return API_URLS[fallbackTenant][api];
  }

  // Check if we have this API endpoint for the tenant
  if (!API_URLS[tenant][api]) {
    throw new Error(`No base URL configured for api='${api}' and tenant='${tenant}'.`);
  }

  return API_URLS[tenant][api];
}

/**
 * Generate a shard ID following the same logic as the backend
 * @returns {number} Shard ID
 */
export function generateShardId() {
  return Math.floor(Math.random() * ENV_CONFIG.maxShards) + 1;
}

/**
 * Generate a tenant shard string
 * @returns {string} Tenant shard in format "tenant#shardId"
 */
export function generateTenantShard() {
  const shardId = generateShardId();
  return `${ENV_CONFIG.tenant}#${shardId}`;
}

/**
 * Get the tenant name without shard
 * @returns {string} Tenant name
 */
export function getTenant() {
  return ENV_CONFIG.tenant;
}

/**
 * Get the current tenant from URL (subdomain or querystring)
 * @returns {string} Current tenant name
 */
export function getCurrentTenant() {
  return extractTenantFromUrl();
}

/**
 * Get the tenant shard from localStorage or generate a new one
 * @returns {string} Tenant shard
 */
export function getTenantShard() {
  const storedShard = localStorage.getItem('tenantShard');
  if (storedShard) {
    return storedShard;
  }

  // Generate and store a new shard
  const newShard = generateTenantShard();
  localStorage.setItem('tenantShard', newShard);
  return newShard;
}

/**
 * Get the corpus configuration
 * @returns {object} Corpus configuration object
 */
export function getCorpusConfig() {
  return CORPUS_CONFIG;
}

/**
 * Get all configuration
 * @returns {object} The complete configuration object
 */
export function getConfig() {
  const tenant = extractTenantFromUrl();

  return {
    apiUrls: API_URLS,
    currentTenant: tenant,
    currentApiUrls: API_URLS[tenant] || API_URLS.default,
    env: ENV_CONFIG,
    corpus: CORPUS_CONFIG
  };
}

// Also export the constants for direct access if needed
export { API_URLS, CORPUS_CONFIG, ENV_CONFIG, FILE_UPLOAD_LIMITS };

// Storage and UI limits configuration
const STORAGE_LIMITS = {
  // Tab management
  MAX_TABS: 6,
  MAX_TAB_AGE_DAYS: 7,

  // Storage size limits (bytes)
  MAX_STORE_SIZE_WARNING: 1048576,  // 1MB warning threshold
  MAX_STORE_SIZE_ERROR: 2097152,    // 2MB error threshold

  // Notification limits
  MAX_NOTIFICATIONS: 50,

  // AnalysisLM cache limits
  MAX_PROCESS_DEFINITIONS: 10
};

// File upload limits configuration
const FILE_UPLOAD_LIMITS = {
  // Maximum file size for uploads (50MB)
  MAX_FILE_SIZE_BYTES: 52428800, // 50 * 1024 * 1024
  MAX_FILE_SIZE_MB: 50,

  // Human-readable display string
  MAX_FILE_SIZE_DISPLAY: '50 MB'
};

/**
 * Get storage and UI limits configuration
 * @returns {object} Storage limits configuration
 */
export function getStorageLimits() {
  return STORAGE_LIMITS;
}

/**
 * Get file upload limits configuration
 * @returns {object} File upload limits configuration
 */
export function getFileUploadLimits() {
  return FILE_UPLOAD_LIMITS;
}

// Export the entire config object as default
export default {
  apiUrls: API_URLS,
  env: ENV_CONFIG,
  corpus: CORPUS_CONFIG,
  storageLimits: STORAGE_LIMITS,
  fileUploadLimits: FILE_UPLOAD_LIMITS,
  getBaseUrl,
  getTenant,
  getCurrentTenant,
  getTenantShard,
  getCorpusConfig,
  getConfig,
  getStorageLimits,
  getFileUploadLimits
};