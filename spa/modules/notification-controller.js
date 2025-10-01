// file: modules/notification-controller.js
import { fetchNotifications, markNotificationsAsRead } from "../api/notifications.js";
import { getTenantShard, getStorageLimits } from "../utils/config.js";

export class NotificationController {
  constructor(store) {
    this.store = store;
    this.notifications = this.loadNotificationsFromStore() || [];
    this.intervalId = null;
    this.storageLimits = getStorageLimits();
    
    // Initialize with stored notifications, but fetch from server soon after if authenticated
    setTimeout(() => {
      if (localStorage.getItem('authToken')) {
        this.fetchNotificationsFromServer();
      }
    }, 1000); // Short delay to allow other components to initialize
    
    // Listen for logout events to stop polling
    document.addEventListener("userLoggedOut", () => {
      this.stopPolling();
    });
  }

  isTokenExpired() {
    const expiry = localStorage.getItem("tokenExpiration"); // e.g., store token expiry as a millisecond timestamp
    if (!expiry) return true;
    return Date.now() > parseInt(expiry, 10);
  }

  loadNotificationsFromStore() {
    return this.store.get("notifications") || [];
  }

  saveNotificationsToStore() {
    this.store.set("notifications", this.notifications);
    // Update unread count
    const unreadCount = this.notifications.length;
    this.store.set("notificationsCount", unreadCount);
  }

  /**
   * Add a notification locally
   * This is used both for server-fetched notifications and locally generated ones
   */
  addNotification(notification) {
    // Skip if this notification already exists (check by ID)
    if (notification.notification_id && 
        this.notifications.some(n => n.notification_id === notification.notification_id)) {
      return;
    }
    
    // If no server ID, generate a local one with current timestamp for proper sorting
    const currentTimestamp = new Date().toISOString();
    const newNotification = {
      notification_id: notification.notification_id || `${currentTimestamp}_${Math.random().toString(36).slice(2)}`,
      timestamp: notification.timestamp || Date.now(),
      ...notification
    };
  
    // Add the notification to the array
    this.notifications.push(newNotification);
    
    // Enforce notification limits
    this.enforceNotificationLimits();
    
    // Sort notifications by timestamp (descending order - newest first)
    this.notifications.sort((a, b) => {
      // Extract timestamp from notification_id
      const getTimestamp = (id) => {
        if (!id || typeof id !== 'string') return 0;
        const parts = id.split('_');
        if (parts.length > 0) {
          try {
            return new Date(parts[0]).getTime();
          } catch (e) {
            return 0;
          }
        }
        return 0;
      };
      
      return getTimestamp(b.notification_id) - getTimestamp(a.notification_id);
    });
    
    this.saveNotificationsToStore();
    this.emitNotificationEvent(newNotification);
  }
  
  /**
   * Enforce notification storage limits to prevent unbounded growth
   */
  enforceNotificationLimits() {
    const maxNotifications = this.storageLimits.MAX_NOTIFICATIONS;
    
    if (this.notifications.length > maxNotifications) {
      // Keep only the most recent notifications
      this.notifications = this.notifications.slice(0, maxNotifications);
      console.log(`[NotificationController] Limited notifications to ${maxNotifications} items`);
    }
  }

  emitNotificationEvent(notification) {
    // Dispatch custom event for real-time updates
    const event = new CustomEvent('vquery:notification', {
      detail: notification
    });
    window.dispatchEvent(event);
  }

  /**
   * Fetch notifications from server
   * @param {number} limit - Maximum number of notifications to retrieve
   * @returns {Promise<Array>} - Array of notification objects
   */
  async fetchNotificationsFromServer(limit = 20) {
    // Get the tenant shard from config
    const tenantShard = getTenantShard();
    
    // Use the configured notification limit
    const maxLimit = Math.min(limit, this.storageLimits.MAX_NOTIFICATIONS);
    
    try {
      const result = await fetchNotifications({ 
        tenantShard, 
        limit: maxLimit 
      });
      
      if (result.notifications && Array.isArray(result.notifications)) {
        // Clear existing notifications
        this.notifications = [];
        
        // Add each server notification to our local collection
        result.notifications.forEach(notification => {
          this.addNotification(notification);
        });
  
        // Ensure notifications are sorted by timestamp (descending)
        this.notifications.sort((a, b) => {
          // Extract timestamp from notification_id
          const getTimestamp = (id) => {
            if (!id || typeof id !== 'string') return 0;
            const parts = id.split('_');
            if (parts.length > 0) {
              try {
                return new Date(parts[0]).getTime();
              } catch (e) {
                return 0;
              }
            }
            return 0;
          };
          
          return getTimestamp(b.notification_id) - getTimestamp(a.notification_id);
        });
  
        this.saveNotificationsToStore();
      }
  
      // After updating the notifications and store, trigger badge update:
      if (window.topBar && typeof window.topBar.updateNotificationCountBadge === 'function') {
        window.topBar.updateNotificationCountBadge();
      }
      
      return this.notifications;
    } catch (error) {
      console.error('[NotificationController] Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Mark multiple notifications as read on the server
   * @param {Array<string>} notificationIds - Array of notification IDs to mark as read
   * @returns {Promise<object>} - Result of the operation
   */
  async markMultipleAsRead(notificationIds) {
    // Get the tenant shard from config
    const tenantShard = getTenantShard();
    
    try {
      const result = await markNotificationsAsRead({
        tenantShard,
        notificationIds
      });
      
      this.saveNotificationsToStore();
      
      return result;
    } catch (error) {
      console.error('[NotificationController] Error marking notifications as read:', error);
      return { success: false, error: error.toString() };
    }
  }

  /**
   * Mark a single notification as read (both locally and on server)
   * @param {string} notificationId - The notification ID to mark as read
   */
  async markAsRead(notificationId) {
    // Update locally first for UI responsiveness

    // Then update on server if authenticated and it has a server ID
    if (localStorage.getItem('authToken') && notificationId && notificationId.length > 10) {
      await this.markMultipleAsRead([notificationId]);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead() {
    // Update locally first
    this.notifications = [];
    this.saveNotificationsToStore();
    
    // Then update on server if authenticated
    if (localStorage.getItem('authToken')) {
      const unreadIds = this.notifications
        .filter(n => n.notification_id && n.notification_id.length > 10) // Filter for "real" server IDs
        .map(n => n.notification_id);
        
      if (unreadIds.length > 0) {
        await this.markMultipleAsRead(unreadIds);
      }
    }

    // If your TopBar instance is accessible globally, update its badge:
    if (window.topBar && typeof window.topBar.updateNotificationCountBadge === 'function') {
      window.topBar.updateNotificationCountBadge();
    }
  }

  getNotifications() {
    return [...this.notifications];
  }

  handleJobCompletion(jobId, result) {
    // Example of creating a job completion notification
    this.addNotification({
      type: 'job_completion',
      message: `Job ${jobId} has completed`,
      entityType: 'job',
      entityId: jobId,
      metadata: {
        result,
        taskType: result.request_type
      }
    });
  }

  handleJobFailure(jobId, errorMessage) {
    this.addNotification({
      type: 'job_failure',
      message: `Job ${jobId} failed: ${errorMessage || "Unknown error"}`,
      entityType: 'job',
      entityId: jobId
    });
  }

  async handleNotificationClick(notification) {
    switch (notification.entityType) {
      case 'job': {
        // Handle job-related notification
        const tabManager = window.tabManager; // Access global reference
        const jobController = window.jobController;

        // First check if the tab is already open
        const tabId = jobController.getTabIdForJob(notification.entityId);
        if (tabId) {
          const tab = tabManager.findTabById(tabId);
          if (tab) {
            tabManager.focusTab(tab);
            return;
          }
        }

        // If not found, load the job details and create new tab
        try {
          const jobDetails = await jobController.getJobDetails(notification.entityId);
          tabManager.openJobResultTab(jobDetails);
        } catch (err) {
          console.error('Failed to load job details:', err);
        }
        break;
      }
      
      case 'document': {
        // Handle document-related notification
        const tabManager = window.tabManager;
        
        if (!tabManager) {
          console.error('TabManager not available');
          return;
        }
        
        try {
          // Check if notification metadata contains necessary document information
          const documentId = notification.entityId;
          let projectId = notification.metadata?.projectId;
          
          if (!documentId) {
            console.error('Document notification missing entityId');
            return;
          }
          
          if (!projectId) {
            console.warn('Document notification missing projectId in metadata, using default if available');
            // Try to use a default project if available from user data
            const user = this.store.get("user");
            const defaultProject = user?.authorized_projects?.[0];
            
            if (!defaultProject) {
              console.error('No project ID available for document loading');
              return;
            }
            
            projectId = defaultProject;
          }
          
          // Use the TabManager's loadDocument method with both required parameters
          const tabIndex = await tabManager.loadDocument(documentId, projectId);
          
          if (tabIndex >= 0) {
            // Document loaded successfully
          } else {
            console.error('Failed to load document in tab');
          }
        } catch (err) {
          console.error('Failed to load document:', err);
        }
        break;
      }

      case 'corpus_document': {
        // Handle corpus document notifications
        const tabManager = window.tabManager;
        const corpusManager = window.corpusManager; // Assuming you have this
        
        if (!tabManager || !corpusManager) {
          console.error('TabManager or CorpusManager not available');
          return;
        }
        
        try {
          // Check if notification metadata contains necessary document information
          const documentKey = notification.metadata?.document_key || notification.entityId;
          const versionId = notification.metadata?.version_id;
          
          if (!documentKey) {
            console.error('Corpus document notification missing document key');
            return;
          }
          
          // Open corpus management and navigate to the document
          if (window.showCorpusManagement) {
            window.showCorpusManagement();
            
            // If your corpus manager has a method to focus on a specific document, call it
            if (corpusManager.openDocument) {
              await corpusManager.openDocument(documentKey, versionId);
            }
          }
        } catch (err) {
          console.error('Failed to open corpus document:', err);
        }
        break;
      }

      default:
        console.log(`No handler for entity type: ${notification.entityType}`);

    }
  }

  // Start polling for new notifications
  startPolling(intervalMs = 60000) {
    // Skip if not authenticated
    if (!localStorage.getItem('authToken')) {
      // Removed verbose logging for authentication check
      return;
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    this.intervalId = setInterval(() => {
      this.pollForNewNotifications();
    }, intervalMs);
    
    // Removed verbose logging for polling start
  }

  // Stop polling for notifications
  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      // Removed verbose logging for polling stop
    }
  }

  // Poll for new notifications
  async pollForNewNotifications() {
    if (!localStorage.getItem('authToken') || this.isTokenExpired()) {
      // Silently stop polling when token is expired or missing
      this.stopPolling();
      return;
    }
    
    try {
      await this.fetchNotificationsFromServer();
    } catch (err) {
      console.error('[NotificationController] Failed to poll notifications:', err);
    }
  }
}

// Example notification types:
export const NOTIFICATION_TYPES = {
  JOB_COMPLETION: 'job_completion',
  DOCUMENT_SHARED: 'document_shared',
  MENTION: 'mention',
  SYSTEM_UPDATE: 'system_update'
};