// utils/storage-monitor.js

import { getStorageLimits } from './config.js';
import { createStorageLimitError } from './storage-errors.js';

/**
 * Storage monitoring utilities for tracking localStorage usage and enforcing limits
 */
export class StorageMonitor {
  constructor() {
    this.limits = getStorageLimits();
  }
  
  /**
   * Calculate the total size of localStorage in bytes
   * @returns {number} Total size in bytes
   */
  calculateLocalStorageSize() {
    let totalSize = 0;
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (key && value) {
          // Calculate size of both key and value as UTF-16 strings
          totalSize += new Blob([key + value]).size;
        }
      }
    } catch (error) {
      console.error('[StorageMonitor] Error calculating localStorage size:', error);
      return 0;
    }
    
    return totalSize;
  }
  
  /**
   * Calculate the size of a specific localStorage item
   * @param {string} key - The localStorage key
   * @returns {number} Size in bytes
   */
  calculateItemSize(key) {
    try {
      const value = localStorage.getItem(key);
      if (!value) return 0;
      return new Blob([key + value]).size;
    } catch (error) {
      console.error(`[StorageMonitor] Error calculating size for key "${key}":`, error);
      return 0;
    }
  }
  
  /**
   * Get storage usage statistics
   * @returns {object} Storage statistics
   */
  getStorageStats() {
    const totalSize = this.calculateLocalStorageSize();
    const warningThreshold = this.limits.MAX_STORE_SIZE_WARNING;
    const errorThreshold = this.limits.MAX_STORE_SIZE_ERROR;
    
    return {
      totalSize,
      formattedSize: this.formatBytes(totalSize),
      warningThreshold,
      errorThreshold,
      isApproachingLimit: totalSize >= warningThreshold,
      isOverLimit: totalSize >= errorThreshold,
      percentageUsed: Math.round((totalSize / errorThreshold) * 100),
      remainingSpace: Math.max(0, errorThreshold - totalSize),
      itemCount: localStorage.length
    };
  }
  
  /**
   * Check storage limits and throw appropriate errors if exceeded
   * @param {number} additionalSize - Optional additional size to account for (bytes)
   * @throws {StorageLimitExceededError} If limits are exceeded
   */
  checkStorageLimits(additionalSize = 0) {
    const currentSize = this.calculateLocalStorageSize();
    const totalSize = currentSize + additionalSize;
    
    // Check hard limit first
    if (totalSize >= this.limits.MAX_STORE_SIZE_ERROR) {
      throw createStorageLimitError(totalSize, this.limits.MAX_STORE_SIZE_ERROR, 'error');
    }
    
    // Check warning threshold
    if (totalSize >= this.limits.MAX_STORE_SIZE_WARNING) {
      throw createStorageLimitError(totalSize, this.limits.MAX_STORE_SIZE_WARNING, 'warning');
    }
  }
  
  /**
   * Get detailed breakdown of localStorage usage by item
   * @returns {Array} Array of items with size information
   */
  getStorageBreakdown() {
    const items = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const size = this.calculateItemSize(key);
          const value = localStorage.getItem(key);
          
          items.push({
            key,
            size,
            formattedSize: this.formatBytes(size),
            valueLength: value ? value.length : 0,
            type: this.categorizeStorageItem(key)
          });
        }
      }
    } catch (error) {
      console.error('[StorageMonitor] Error getting storage breakdown:', error);
    }
    
    // Sort by size descending
    return items.sort((a, b) => b.size - a.size);
  }
  
  /**
   * Categorize storage items by type for better analysis
   * @param {string} key - The localStorage key
   * @returns {string} Category name
   */
  categorizeStorageItem(key) {
    if (key.startsWith('app-state-')) return 'Store Data';
    if (key.startsWith('analysisLMProcessDef_')) return 'Process Cache';
    if (key.startsWith('cognaire-respond-')) return 'Job Session';
    if (key.includes('auth') || key.includes('token')) return 'Authentication';
    if (key.includes('user') || key.includes('permission')) return 'User Data';
    if (key.includes('subtenant')) return 'Configuration';
    return 'Other';
  }
  
  /**
   * Get cleanup recommendations based on storage analysis
   * @returns {Array} Array of cleanup recommendations
   */
  getCleanupRecommendations() {
    const stats = this.getStorageStats();
    const breakdown = this.getStorageBreakdown();
    const recommendations = [];
    
    // Check for large store data (tabs)
    const storeData = breakdown.filter(item => item.type === 'Store Data');
    if (storeData.length > 0) {
      const totalStoreSize = storeData.reduce((sum, item) => sum + item.size, 0);
      if (totalStoreSize > 500000) { // 500KB
        recommendations.push({
          type: 'tabs',
          priority: 'high',
          action: 'Close unused tabs',
          description: `Store data is using ${this.formatBytes(totalStoreSize)}. Close tabs you're not actively using.`,
          savings: `Up to ${this.formatBytes(totalStoreSize * 0.8)}`
        });
      }
    }
    
    // Check for old process cache
    const processCache = breakdown.filter(item => item.type === 'Process Cache');
    if (processCache.length > this.limits.MAX_PROCESS_DEFINITIONS) {
      const excessCache = processCache.slice(this.limits.MAX_PROCESS_DEFINITIONS);
      const excessSize = excessCache.reduce((sum, item) => sum + item.size, 0);
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        action: 'Clear old process cache',
        description: `${processCache.length} cached process definitions found, ${excessCache.length} can be removed.`,
        savings: this.formatBytes(excessSize)
      });
    }
    
    // Check for large job session data
    const jobData = breakdown.filter(item => item.type === 'Job Session');
    if (jobData.length > 0) {
      const totalJobSize = jobData.reduce((sum, item) => sum + item.size, 0);
      if (totalJobSize > 200000) { // 200KB
        recommendations.push({
          type: 'jobs',
          priority: 'low',
          action: 'Clear completed job history',
          description: `Job session data is using ${this.formatBytes(totalJobSize)}.`,
          savings: `Up to ${this.formatBytes(totalJobSize * 0.5)}`
        });
      }
    }
    
    return recommendations.sort((a, b) => {
      const priority = { high: 3, medium: 2, low: 1 };
      return priority[b.priority] - priority[a.priority];
    });
  }
  
  /**
   * Format bytes into human-readable string
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Perform automatic cleanup of old data
   * @returns {object} Cleanup results
   */
  performAutomaticCleanup() {
    const results = {
      itemsRemoved: 0,
      bytesFreed: 0,
      actions: []
    };
    
    try {
      // Clean up old process cache
      const processKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('analysisLMProcessDef_')) {
          processKeys.push(key);
        }
      }
      
      // Remove excess process cache items (keep only the most recent MAX_PROCESS_DEFINITIONS)
      if (processKeys.length > this.limits.MAX_PROCESS_DEFINITIONS) {
        const excessKeys = processKeys.slice(this.limits.MAX_PROCESS_DEFINITIONS);
        let freedBytes = 0;
        
        excessKeys.forEach(key => {
          freedBytes += this.calculateItemSize(key);
          localStorage.removeItem(key);
        });
        
        results.itemsRemoved += excessKeys.length;
        results.bytesFreed += freedBytes;
        results.actions.push(`Removed ${excessKeys.length} old process cache items`);
      }
      
    } catch (error) {
      console.error('[StorageMonitor] Error during automatic cleanup:', error);
    }
    
    return results;
  }
}

// Create singleton instance
export const storageMonitor = new StorageMonitor();

// Export convenience functions
export function getStorageStats() {
  return storageMonitor.getStorageStats();
}

export function checkStorageLimits(additionalSize = 0) {
  return storageMonitor.checkStorageLimits(additionalSize);
}

export function getStorageBreakdown() {
  return storageMonitor.getStorageBreakdown();
}

export function getCleanupRecommendations() {
  return storageMonitor.getCleanupRecommendations();
}