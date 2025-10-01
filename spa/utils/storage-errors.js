// utils/storage-errors.js

/**
 * Custom error class for tab limit exceeded scenarios
 */
export class TabLimitExceededError extends Error {
  constructor(currentTabs, maxTabs, message) {
    const defaultMessage = `Cannot open new tab. Maximum of ${maxTabs} tabs allowed (currently have ${currentTabs}). Please close some tabs first.`;
    super(message || defaultMessage);
    
    this.name = 'TabLimitExceededError';
    this.currentTabs = currentTabs;
    this.maxTabs = maxTabs;
    this.userFriendly = true;
    
    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TabLimitExceededError);
    }
  }
  
  /**
   * Get user-friendly error message with actionable advice
   */
  getUserMessage() {
    return {
      title: 'Too Many Tabs Open',
      message: this.message,
      details: `You have ${this.currentTabs} tabs open. The maximum allowed is ${this.maxTabs}.`,
      actionAdvice: 'Close some tabs by clicking the ✕ button on tab headers, then try again.'
    };
  }
}

/**
 * Custom error class for storage limit exceeded scenarios
 */
export class StorageLimitExceededError extends Error {
  constructor(currentSize, limitSize, limitType = 'error', message) {
    const sizeType = limitType === 'warning' ? 'approaching' : 'exceeded';
    const defaultMessage = `Storage ${sizeType}: ${formatBytes(currentSize)} used (limit: ${formatBytes(limitSize)}). Please close some tabs or clear old data.`;
    super(message || defaultMessage);
    
    this.name = 'StorageLimitExceededError';
    this.currentSize = currentSize;
    this.limitSize = limitSize;
    this.limitType = limitType; // 'warning' or 'error'
    this.userFriendly = true;
    
    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StorageLimitExceededError);
    }
  }
  
  /**
   * Get user-friendly error message with actionable advice
   */
  getUserMessage() {
    const isWarning = this.limitType === 'warning';
    const title = isWarning ? 'Storage Usage Warning' : 'Storage Limit Exceeded';
    const severity = isWarning ? 'approaching' : 'exceeded';
    
    return {
      title,
      message: this.message,
      details: `Current usage: ${formatBytes(this.currentSize)} / ${formatBytes(this.limitSize)}`,
      actionAdvice: isWarning 
        ? 'Consider closing some tabs to free up storage space.'
        : 'Close some tabs or clear browser data to continue. Check the storage analyzer for detailed cleanup recommendations.'
    };
  }
  
  /**
   * Check if this is a warning vs hard error
   */
  isWarning() {
    return this.limitType === 'warning';
  }
}

/**
 * Format bytes into human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Factory function to create tab limit errors
 */
export function createTabLimitError(currentTabs, maxTabs, customMessage) {
  return new TabLimitExceededError(currentTabs, maxTabs, customMessage);
}

/**
 * Factory function to create storage limit errors
 */
export function createStorageLimitError(currentSize, limitSize, limitType = 'error', customMessage) {
  return new StorageLimitExceededError(currentSize, limitSize, limitType, customMessage);
}

/**
 * Check if an error is a storage-related error that should be shown to the user
 */
export function isUserFriendlyStorageError(error) {
  return error && (error.userFriendly === true || 
                   error instanceof TabLimitExceededError ||
                   error instanceof StorageLimitExceededError);
}