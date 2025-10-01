// state/store.js

// Use a "Store" object or class to manage global state (open tabs, user session, permissions, 
// etc.). Store can automatically persist to localStorage so the user's open documents/tabs, or 
// any other preferences, are saved across page refreshes.

// A Store class for global state management with subscriptions and optional middleware.

import { checkStorageLimits, getStorageStats } from '../utils/storage-monitor.js';
import { createStorageLimitError } from '../utils/storage-errors.js';

export class Store {
  constructor(storageKey = "app-state") {
    // Store constructor initialized
    this.state = {}; // In-memory state
    this.subscribers = []; // Array of { key, callback, id }
    this.middlewares = []; // Middleware functions
    this.storageKey = storageKey; // LocalStorage key namespace
    this.subscriptionIdCounter = 0; // For tracking subscriptions
    
    // Add debounced saving for performance
    this.saveTimeout = null;
    this.saveDelay = 300; // 300ms debounce
    this.isDirty = false;
    
    this.loadState(); // Load persisted state

    // Ensure we have a 'permissions' key in state
    // if it doesn't exist. We'll do it once. If the user object
    // also has permissions, Security class merges them as needed.
    if (!this.state.permissions) {
      this.state.permissions = {
        system: [],
        authorized_accounts: [],
        authorized_projects: [],
      };
      // Initialized empty state.permissions for Phase 1 changes
    }
  }

  /**
   * Add a middleware function for value transformation or logging.
   */
  use(middlewareFn) {
    //console.log("[Store] Adding middleware.");
    this.middlewares.push(middlewareFn);
  }

  /**
   * Subscribe to changes on a specific key.
   * @param {string} key
   * @param {function} callback
   * @returns {number} subscription ID for unsubscribing
   */
  subscribe(key, callback) {
    //console.log(`[Store] Subscribing to key="${key}"`);
    const subscriptionId = ++this.subscriptionIdCounter;
    this.subscribers.push({ key, callback, id: subscriptionId });
    return subscriptionId;
  }

  /**
   * Unsubscribe from changes on a specific key by callback or subscription ID.
   * @param {string} key
   * @param {function|number} callbackOrId - Either the callback function or subscription ID
   * @returns {boolean} true if unsubscribed successfully
   */
  unsubscribe(key, callbackOrId) {
    const initialLength = this.subscribers.length;
    
    if (typeof callbackOrId === 'number') {
      // Unsubscribe by ID
      this.subscribers = this.subscribers.filter(sub => 
        !(sub.key === key && sub.id === callbackOrId)
      );
    } else if (typeof callbackOrId === 'function') {
      // Unsubscribe by callback function
      this.subscribers = this.subscribers.filter(sub => 
        !(sub.key === key && sub.callback === callbackOrId)
      );
    } else {
      // Unsubscribe all for this key
      this.subscribers = this.subscribers.filter(sub => sub.key !== key);
    }
    
    const removed = initialLength - this.subscribers.length;
    //console.log(`[Store] Unsubscribed ${removed} subscription(s) for key="${key}"`);
    return removed > 0;
  }

  /**
   * Notify all subscribers watching a specific key.
   * @param {string} key
   */
  notify(key) {
    //console.log(`[Store] notify("${key}")`);
    const value = this.state[key];
    this.subscribers
      .filter(sub => sub.key === key)
      .forEach(sub => {
        try {
          sub.callback(value);
        } catch (error) {
          console.error(`[Store] Error in subscription callback for key "${key}":`, error);
        }
      });
  }

  /**
   * Set a value in the store, run middleware, update state, persist, and notify.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    //console.log(`[Store] set("${key}")`);
    
    let nextValue = value;
  
    // Run middleware if any
    this.middlewares.forEach(fn => {
      nextValue = fn(key, nextValue, this.state);
    });
  
    // Assign to state
    this.state[key] = nextValue;
  
    // Save to localStorage (debounced)
    this.scheduleSave();
  
    // Notify subscribers
    this.notify(key);
  }
  
  /**
   * Schedule a debounced save to prevent excessive localStorage writes
   */
  scheduleSave() {
    this.isDirty = true;
    
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // Schedule debounced save
    this.saveTimeout = setTimeout(() => {
      this.performSave();
      this.saveTimeout = null;
    }, this.saveDelay);
  }
  
  /**
   * Force immediate save (for critical operations)
   */
  saveStateImmediate() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.performSave();
  }
  
  /**
   * Perform the actual save operation
   */
  performSave() {
    if (!this.isDirty) return;
    
    try {
      // Check storage limits before saving
      this.checkStorageBeforeSave();
      this.saveState();
      this.isDirty = false;
    } catch (error) {
      console.error('[Store] Save failed due to storage limits:', error);
      // For warnings, still save but notify user
      if (error.isWarning && error.isWarning()) {
        console.warn('[Store] Storage warning during save:', error.message);
        this.saveState();
        this.isDirty = false;
        // Could emit an event here for UI to show warning
        this.notifyStorageWarning(error);
      } else {
        // For hard errors, don't save and re-throw
        throw error;
      }
    }
  }
  
  /**
   * Check storage limits before saving
   */
  checkStorageBeforeSave() {
    try {
      // Estimate the size of the data we're about to save
      const stateString = JSON.stringify(this.state, this.getCircularReplacer());
      const estimatedSize = new Blob([stateString]).size;
      
      // Check limits with estimated additional size
      checkStorageLimits(estimatedSize);
    } catch (error) {
      // Re-throw storage limit errors
      throw error;
    }
  }
  
  /**
   * Get storage statistics for the current store
   */
  getStorageStats() {
    return getStorageStats();
  }
  
  /**
   * Notify subscribers about storage warnings (non-blocking)
   */
  notifyStorageWarning(error) {
    // Emit to any storage warning subscribers
    const value = error.getUserMessage();
    this.subscribers
      .filter(sub => sub.key === '_storageWarning')
      .forEach(sub => {
        try {
          sub.callback(value);
        } catch (callbackError) {
          console.error('[Store] Error in storage warning callback:', callbackError);
        }
      });
  }
  
  /**
   * Subscribe to storage warnings
   */
  subscribeToStorageWarnings(callback) {
    return this.subscribe('_storageWarning', callback);
  }
  
  /**
   * Get a circular reference replacer for JSON.stringify
   */
  getCircularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      // Skip known problematic properties
      if (key === '__parent' || key === '__document' || key === '__internalSaveHook' || 
          key === 'formInstance' || key === 'analysisLMFramework') {
        return undefined;
      }
      
      // Handle general circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }
  

  /**
   * Get a value by key from the store.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Helper method for removing an item from an array in the store
   * @param {string} key 
   * @param {*} predicate 
   */
  removeFromArray(key, predicate) {
    const arr = this.get(key) || [];
    const newArr = arr.filter((item) => !predicate(item));
    this.set(key, newArr);
  }
  
  /**
   * Load the state from localStorage.
   */
  loadState() {
    // Loading state from localStorage
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.state = JSON.parse(saved);
      }
    } catch (error) {
      console.error("Failed to load state from localStorage:", error);
    }
  }

  /**
   * Process docTaskInstance to remove circular references without losing the entire object
   * @param {Object} docTaskInstance - The docTaskInstance to clean
   * @returns {Object} - A cleaned version of docTaskInstance
   */
  _cleanDocTaskInstance(docTaskInstance) {
    if (!docTaskInstance || typeof docTaskInstance !== 'object') {
      return docTaskInstance;
    }
    
    // Create a shallow copy of the object to avoid modifying the original
    const cleanedInstance = { ...docTaskInstance };
    
    // Remove properties that typically cause circular references
    delete cleanedInstance.__parent;
    delete cleanedInstance.__document;
    delete cleanedInstance.__internalSaveHook;
    
    // Clean nested stages if they exist
    if (cleanedInstance.stages && Array.isArray(cleanedInstance.stages)) {
      cleanedInstance.stages = cleanedInstance.stages.map(stage => {
        const cleanStage = { ...stage };
        // Remove formInstance which often has circular references
        delete cleanStage.formInstance;
        return cleanStage;
      });
    }
    
    return cleanedInstance;
  }

  /**
   * Process openTabs to ensure docTaskInstance is properly handled
   * @param {Array} tabs - The tabs array to clean
   * @returns {Array} - A cleaned version of the tabs array
   */
  _cleanTabsForStorage(tabs) {
    if (!tabs || !Array.isArray(tabs)) {
      return tabs;
    }
    
    return tabs.map(tab => {
      // If this isn't a framework doc tab, return as is
      if (!tab.isFrameworkDoc || !tab.docTaskInstance) {
        return tab;
      }
      
      // Create a shallow copy to avoid modifying the original
      const cleanedTab = { ...tab };
      
      // Clean the docTaskInstance
      cleanedTab.docTaskInstance = this._cleanDocTaskInstance(tab.docTaskInstance);
      
      return cleanedTab;
    });
  }

  /**
   * Save the state to localStorage.
   */
  saveState() {
    try {
      // Create a deep copy of the state to avoid modifying the original
      const stateCopy = JSON.parse(JSON.stringify(this.state, (key, value) => {
        // If we encounter a circular reference, return '[Circular]'
        if (key === '__parent' || key === '__document' || key === '__internalSaveHook') {
          return undefined;
        }
        return value;
      }));
      
      // Special handling for openTabs to preserve docTaskInstance while removing circular refs
      if (stateCopy.openTabs && Array.isArray(stateCopy.openTabs)) {
        stateCopy.openTabs = this._cleanTabsForStorage(stateCopy.openTabs);
      }
      
      // Serialize and save
      localStorage.setItem(this.storageKey, JSON.stringify(stateCopy));
      //console.log(`[Store] Successfully saved state to localStorage (${this.storageKey})`);
    } catch (error) {
      console.error("Failed to save state to localStorage:", error);
      
      // Fallback approach with more aggressive cleaning
      try {
        console.log("[Store] Attempting fallback serialization approach");
        
        const serialized = JSON.stringify(this.state, this.getCircularReplacer());
        localStorage.setItem(this.storageKey, serialized);
        console.log(`[Store] Successfully saved state using fallback approach (${this.storageKey})`);
      } catch (fallbackError) {
        console.error("Failed to save state even with fallback approach:", fallbackError);
      }
    }
  }

  /**
   * Clears in-memory and localStorage for this user's store.
   */
  clear() {
    // Clearing store and localStorage
    localStorage.removeItem(this.storageKey);
    this.state = {};
    this.subscribers = []; // Clear all subscriptions
  }
}