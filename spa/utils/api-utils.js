// utils/api-utils.js

import { showUserError, showSuccessNotification } from "./error-handling-utils.js";
import { handleAuthError } from "./auth-error-handler.js";

export function parseApiError(errObj) {
  let errorMessage = errObj.error || errObj.message || "Unknown error";
  if (Array.isArray(errObj.validation_messages)) {
    errorMessage += " (" + errObj.validation_messages.join(", ") + ")";
  }
  return errorMessage;
}

/**
 * Enhanced fetch wrapper that handles authentication errors
 * @param {string} url The URL to fetch
 * @param {object} options Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export async function fetchWithAuth(url, options = {}) {
  try {
    const response = await fetch(url, options);
    
    if (response.status === 401) {
      // Try to parse the response for error details
      let errorData = {};
      try {
        errorData = await response.json();
      } catch {
        // Response might not be JSON
      }
      
      const error = new Error(errorData.error || errorData.message || 'Authentication failed');
      error.status = 401;
      error.response = errorData;
      
      // Use centralized auth error handler
      if (handleAuthError(error, response)) {
        // Auth error was handled (modal shown), still throw to stop execution
        throw error;
      }
      
      throw error;
    }
    
    return response;
  } catch (error) {
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your connection and try again.');
    }
    throw error;
  }
}

/**
 * Custom permission error example
 */
export class PermissionError extends Error {
  constructor(message, requiredPermission, context) {
    super(message);
    this.name = "PermissionError";
    this.requiredPermission = requiredPermission;
    this.context = context;
  }
}


/**
 * Resolves subtenant from URL query string (?s=acme) or subdomain (acme.cognaire.com)
 * Returns null if none found
 */
export function resolveSubtenantFromUrl() {
  try {
    const url = new URL(window.location.href);

    // 1. Check query param: ?s=acme
    const subtenantFromQuery = url.searchParams.get("s");
    if (subtenantFromQuery && /^[a-zA-Z0-9_-]+$/.test(subtenantFromQuery)) {
      return subtenantFromQuery.toLowerCase();
    }

    // 2. Fallback: Extract first subdomain from hostname
    const hostnameParts = window.location.hostname.split(".");
    if (hostnameParts.length >= 3) {
      // e.g. acme.cognaire.com or acme-test.cognaire.com => return 'acme'
      const firstPart = hostnameParts[0];
      return firstPart.split("-")[0].toLowerCase(); // remove suffix if present (like 'acme-test')
    }

    return null;
  } catch (err) {
    console.warn("[utils] Failed to resolve subtenant from URL:", err);
    return null;
  }
}



/**
 * Creates a user-friendly message from bulk operation results
 * 
 * @param {Object} results - The results object from a bulk operation
 * @param {string} operationName - The name of the operation (e.g., "delete", "move")
 * @param {Object} options - Optional configuration
 * @param {number} options.maxErrorsToShow - Maximum number of individual errors to show (default: 5)
 * @param {boolean} options.showItemIds - Whether to include item IDs in the message (default: false)
 * @returns {Object} Object with message and alertType properties
 */
export function createBulkOperationMessage(results, operationName, options = {}) {
  const { maxErrorsToShow = 5, showItemIds = false } = options;
  
  // Check if results have the new structure (with "results" and "summary" fields)
  // or the old structure (with summary at the top level)
  const resultsList = results.results || results;
  const summary = results.summary || results;
  
  // Build the main message based on success count
  const successCount = summary.succeeded || 0;
  const failedCount = summary.failed || 0;
  const lockedCount = summary.locked || 0;
  const notFoundCount = summary.notFound || 0;
  const totalCount = summary.totalOperations || 
    (successCount + failedCount + lockedCount + notFoundCount);
  
  // Determine alert type based on success/failure ratio
  let alertType = 'success';
  if (successCount === 0) {
    alertType = 'danger';
  } else if (failedCount > 0 || lockedCount > 0 || notFoundCount > 0) {
    alertType = 'warning';
  }
  
  // Create the main message
  let message = `${operationName} operation: `;
  
  if (successCount === totalCount) {
    message += `All ${totalCount} items processed successfully.`;
    return { message, alertType };
  }
  
  // Partial success message
  message += `${successCount} of ${totalCount} items processed successfully.`;
  
  // Add details about failures
  const detailsList = [];
  
  if (lockedCount > 0) {
    detailsList.push(`${lockedCount} ${lockedCount === 1 ? 'item was' : 'items were'} locked by other users`);
    
    // Add locked by details if available
    if (resultsList.locked && resultsList.locked.length > 0) {
      const lockedByMap = new Map();
      resultsList.locked.forEach(item => {
        const lockedBy = item.lockedBy || 'unknown';
        lockedByMap.set(lockedBy, (lockedByMap.get(lockedBy) || 0) + 1);
      });
      
      const lockedByDetails = [];
      lockedByMap.forEach((count, user) => {
        lockedByDetails.push(`${count} by ${user}`);
      });
      
      if (lockedByDetails.length > 0) {
        detailsList[detailsList.length - 1] += ` (${lockedByDetails.join(', ')})`;
      }
    }
  }
  
  if (notFoundCount > 0) {
    detailsList.push(`${notFoundCount} ${notFoundCount === 1 ? 'item was' : 'items were'} not found`);
  }
  
  if (failedCount > 0) {
    detailsList.push(`${failedCount} ${failedCount === 1 ? 'operation' : 'operations'} failed`);
    
    // List some specific errors if available
    if (resultsList.failed && resultsList.failed.length > 0) {
      // Group errors by error message
      const errorMap = new Map();
      resultsList.failed.forEach(item => {
        const error = item.error || 'Unknown error';
        if (!errorMap.has(error)) {
          errorMap.set(error, []);
        }
        errorMap.get(error).push(item.sortKey);
      });
      
      // Build error details
      const errorDetails = [];
      let errorCount = 0;
      
      errorMap.forEach((items, error) => {
        if (errorCount < maxErrorsToShow) {
          let errorMsg = `${error} (${items.length} ${items.length === 1 ? 'item' : 'items'})`;
          
          // Include item IDs if requested and there aren't too many
          if (showItemIds && items.length <= 3) {
            const shortIds = items.map(sortKey => extractItemShortId(sortKey));
            errorMsg += `: ${shortIds.join(', ')}`;
          }
          
          errorDetails.push(errorMsg);
          errorCount++;
        }
      });
      
      if (errorDetails.length > 0) {
        if (errorMap.size > maxErrorsToShow) {
          errorDetails.push(`...and ${errorMap.size - maxErrorsToShow} more error types`);
        }
        detailsList.push(`Errors: ${errorDetails.join('; ')}`);
      }
    }
  }
  
  // Add details to message
  if (detailsList.length > 0) {
    message += ` ${detailsList.join('. ')}.`;
  }
  
  return { message, alertType };
}

/**
 * Extracts a short item ID from a sort key
 * Format: STG#stage_id#GRP#group_id#ITEM#item_id -> item_id
 * 
 * @param {string} sortKey - The sort key
 * @returns {string} The short item ID
 */
function extractItemShortId(sortKey) {
  if (!sortKey) return 'unknown';
  
  const parts = sortKey.split('#');
  if (parts.length >= 6) {
    return parts[5];
  }
  
  return sortKey.substring(sortKey.lastIndexOf('#') + 1);
}


/**
 * Displays a notification message for bulk operation results
 * 
 * @param {Object} results - The results object from a bulk operation
 * @param {string} operationName - The name of the operation
 * @param {Object} options - Options for message creation
 */
export function showBulkOperationNotification(results, operationName, options = {}) {
  const { message, alertType } = createBulkOperationMessage(results, operationName, options);
  
  // Check if Shoelace alert component is available
  if (customElements.get('sl-alert')) {
    const alert = document.createElement('sl-alert');
    alert.variant = alertType;
    alert.closable = true;
    alert.duration = alertType === 'success' ? 5000 : 10000; // Show errors longer
    
    const icon = alertType === 'success' ? 'check-circle' : 
                 alertType === 'warning' ? 'exclamation-triangle' : 'exclamation-octagon';
    
    alert.innerHTML = `
      <sl-icon slot="icon" name="${icon}"></sl-icon>
      ${message}
    `;
    
    document.body.appendChild(alert);
    alert.toast();
    return alert;
  } else {
    // Fallback to console.log and alert for environments without Shoelace
    console.log(`[${alertType.toUpperCase()}] ${message}`);
    
    if (alertType !== 'success') {
      // Only show alerts for warnings and errors
      alert(message);
    }
    
    return null;
  }
}

/**
 * Helper to handle bulk operation results with proper notifications
 * 
 * @param {Object} results - The results from the bulk operation
 * @param {Function} updateGrid - Function to update the grid UI
 * @param {Function} removeFromGrid - Function to remove items from the grid
 * @param {string} operationName - Name of the operation for messages
 * @param {Object} options - Additional options
 * @param {Object} modalInstances - ErrorModal and MessageModal instances
 * @returns {Promise<void>}
 */
export async function handleBulkOperationResults(
  results, 
  updateGrid, 
  removeFromGrid, 
  operationName, 
  options = {},
  modalInstances = {}
) {
  const { autoRemove = false } = options;
  const { errorModal, messageModal } = modalInstances;
  
  // Create a user-friendly message based on results
  let title = `${operationName} Operation`;
  let message = "";
  let hasErrors = false;
  
  // Get the appropriate result objects based on the response structure
  const succeededItems = results.results?.succeeded || results.succeeded || [];
  const failedItems = results.results?.failed || results.failed || [];
  const lockedItems = results.results?.locked || results.locked || [];
  const notFoundItems = results.results?.notFound || results.notFound || [];
  
  // Get counts based on the response structure
  const successCount = results.summary?.succeeded || succeededItems.length || 0;
  const failedCount = results.summary?.failed || failedItems.length || 0;
  const lockedCount = results.summary?.locked || lockedItems.length || 0;
  const notFoundCount = results.summary?.notFound || notFoundItems.length || 0;
  const totalCount = results.summary?.totalOperations || 
    (successCount + failedCount + lockedCount + notFoundCount);
  
  if (successCount === totalCount) {
    // Complete success
    message = `Successfully completed ${operationName.toLowerCase()} operation on all ${totalCount} items.`;
    
    // Show success message via modal
    if (messageModal && typeof messageModal.show === 'function') {
      messageModal.show({
        title,
        message
      });
    } else {
      // Fallback if no modal is available
      console.log(`${title}: ${message}`);
      // Optional: Use alert for important success messages
      // alert(`${title}: ${message}`);
    }
  } else if (successCount > 0) {
    // Partial success
    hasErrors = true;
    message = `Completed ${operationName.toLowerCase()} operation on ${successCount} of ${totalCount} items.`;
    
    // Add details about failures
    const details = [];
    
    if (lockedCount > 0) {
      details.push(`${lockedCount} item(s) were locked by other users`);
    }
    
    if (notFoundCount > 0) {
      details.push(`${notFoundCount} item(s) were not found`);
    }
    
    if (failedCount > 0) {
      details.push(`${failedCount} operation(s) failed`);
    }
    
    if (details.length > 0) {
      message += ` ${details.join(". ")}.`;
    }
    
    // Show partial success as an error message to highlight the issues
    showUserError({
      title: `${title} - Partial Success`,
      message,
      details: JSON.stringify(results, null, 2)
    }, errorModal);
  } else {
    // Complete failure
    hasErrors = true;
    message = `Failed to complete ${operationName.toLowerCase()} operation on any items.`;
    
    // Add details about failures
    const details = [];
    
    if (lockedCount > 0) {
      details.push(`${lockedCount} item(s) were locked by other users`);
    }
    
    if (notFoundCount > 0) {
      details.push(`${notFoundCount} item(s) were not found`);
    }
    
    if (failedCount > 0) {
      details.push(`${failedCount} operation(s) failed`);
    }
    
    if (details.length > 0) {
      message += ` ${details.join(". ")}.`;
    }
    
    // Show error message
    showUserError({
      title: `${title} - Failed`,
      message,
      details: JSON.stringify(results, null, 2)
    }, errorModal);
  }
  
  if (autoRemove) {
    // Handle items that should be removed from the grid
    const itemsToRemove = [
      ...(succeededItems.map(item => item.sortKey) || []),
      ...(notFoundItems.map(item => item.sortKey) || [])
    ];
    
    if (itemsToRemove.length > 0 && typeof removeFromGrid === 'function') {
      removeFromGrid(itemsToRemove);
    }
  } else {
    // Handle items that were updated and should reflect changes in the grid
    const updatedItems = succeededItems
      .filter(item => item.item)
      .map(item => item.item);
    
    if (updatedItems.length > 0 && typeof updateGrid === 'function') {
      updateGrid(updatedItems);
    }
  }
}