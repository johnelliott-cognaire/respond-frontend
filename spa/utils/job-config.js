/**
 * utils/job-config.js
 * 
 * Default job configuration
 */
const DEFAULT_JOB_CONFIG = {
    MAX_PARALLEL_JOBS: 2,  // Maximum number of jobs to run in parallel
    JOB_TIMEOUT_MS: 12 * 60 * 60 * 1000,  // 12 hours
    POLL_INTERVAL_MS: 5000  // Poll every 5 seconds
  };
  
  /**
   * Get job configuration
   * Can be extended to read from localStorage or other sources
   */
  export function getJobConfig() {
    // Read from stored config if it exists
    try {
      const storedConfig = localStorage.getItem('jobConfig');
      if (storedConfig) {
        return JSON.parse(storedConfig);
      }
    } catch (err) {
      console.warn('Error reading job config from storage:', err);
    }
    
    // Return default config
    return DEFAULT_JOB_CONFIG;
  }
  
  /**
   * Save job configuration
   * @param {Object} config - Configuration to save
   */
  export function saveJobConfig(config) {
    try {
      localStorage.setItem('jobConfig', JSON.stringify({
        ...DEFAULT_JOB_CONFIG,
        ...config
      }));
      return true;
    } catch (err) {
      console.error('Error saving job config:', err);
      return false;
    }
  }