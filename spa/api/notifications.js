// File: api/notifications.js
import { getAuthHeader, logout } from "./auth.js";
import { getBaseUrl, getTenantShard } from "../utils/config.js";

/**
 * Fetch notifications from server
 * Lambda: backend/services/lambdas/notifications/notifications_list.py
 * @param {object} options - Options for fetching notifications
 * @param {string} options.tenantShard - The tenant shard to fetch notifications for
 * @param {number} options.limit - Maximum number of notifications to retrieve
 * @param {object} options.lastEvaluatedKey - Key for pagination
 * @returns {Promise<object>} - Object containing notifications array and pagination info
 */
export async function fetchNotifications({ tenantShard, limit = 20, lastEvaluatedKey = null }) {
  console.log("[notificationsApi] Fetching notifications with params:", { tenantShard, limit, lastEvaluatedKey });
  
  // Ensure we have a tenant shard, get from config if not provided
  const tenant = tenantShard || getTenantShard();
  
  // Check if user is authenticated before making the request
  if (!localStorage.getItem("authToken")) {
    console.log("[notificationsApi] No auth token available, skipping notification fetch");
    return { notifications: [], count: 0, has_more: false };
  }
  
  // Use deduplication to prevent multiple identical calls
  const { deduplicateRequest } = await import("../utils/request-deduplication.js");
  
  return deduplicateRequest(
    'fetchNotifications',
    { tenant_shard: tenant, limit, last_evaluated_key: lastEvaluatedKey },
    async () => {
      try {
        const baseUrl = getBaseUrl("main");
        console.log("[notificationsApi] Using base URL:", baseUrl);
        
        const url = `${baseUrl}/notifications/list-notifs`;
        
        const requestBody = {
          tenant_shard: tenant,
          limit: limit
        };
        
        if (lastEvaluatedKey) {
          requestBody.last_evaluated_key = lastEvaluatedKey;
        }
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader()
          },
          body: JSON.stringify(requestBody)
        });
        
        if (response.status === 401) {
          logout();
          throw new Error("Unauthorized: token invalid");
        }
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Error fetching notifications: HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data;
      } catch (error) {
        console.error("[notificationsApi] Error fetching notifications:", error);
        return { notifications: [], count: 0, has_more: false };
      }
    },
    15000 // Cache for 15 seconds since notifications are live data but not as critical as jobs
  );
}

/**
 * Mark multiple notifications as read
 * Lambda: backend/services/lambdas/notifications/notifications_read.py
 * @param {object} options - Options for marking notifications
 * @param {string} options.tenantShard - The tenant shard the notifications belong to
 * @param {string[]} options.notificationIds - Array of notification IDs to mark as read
 * @returns {Promise<object>} - Result of the operation with success/failure counts
 */
export async function markNotificationsAsRead({ tenantShard, notificationIds }) {
  console.log("[notificationsApi] Marking notifications as read:", { tenantShard, notificationIds });
  
  // Ensure we have a tenant shard, get from config if not provided
  const tenant = tenantShard || getTenantShard();
  
  // Check if user is authenticated before making the request
  if (!localStorage.getItem("authToken")) {
    console.log("[notificationsApi] No auth token available, skipping mark as read");
    return { success: false, error: 'No auth token' };
  }
  
  try {
    const baseUrl = getBaseUrl("main");
    
    const url = `${baseUrl}/notifications/mark-read`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader()
      },
      body: JSON.stringify({
        tenant_shard: tenant,
        notification_ids: notificationIds
      })
    });
    
    if (response.status === 401) {
      logout();
      throw new Error("Unauthorized: token invalid");
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error marking notifications as read: HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    // Invalidate notification cache since we marked notifications as read
    const { invalidateNotificationsCache } = await import("../utils/request-deduplication.js");
    invalidateNotificationsCache();
    
    return result;
  } catch (error) {
    console.error("[notificationsApi] Error marking notifications as read:", error);
    return { success: false, error: error.toString() };
  }
}