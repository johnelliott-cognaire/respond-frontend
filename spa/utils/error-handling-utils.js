// utils/error-handling.js

/**
 * Centralized error handling and user notification functions
 * Used to ensure consistent error handling and user feedback across the application
 */

/**
 * Show a user-friendly error message
 * Uses ErrorModal if available, or falls back to console.error
 * 
 * @param {Object} options Error options
 * @param {string} options.title Error title
 * @param {string} options.message Error message
 * @param {string} options.details Detailed error info (optional)
 * @param {Object} errorModalInstance ErrorModal instance
 * @param {Function} callback Optional callback function to run after error is shown
 */
export function showUserError({ title, message, details }, errorModalInstance, callback = null) {
    console.error(`${title}: ${message}`);
    
    if (details) {
      console.error("Error details:", details);
    }
  
    // First, try using the ErrorModal if available
    if (errorModalInstance && typeof errorModalInstance.show === 'function') {
      errorModalInstance.show({
        title,
        message,
        details,
        onClose: callback
      });
      return;
    }
  
    // Fall back to browser alert if no ErrorModal
    window.alert(`${title}: ${message}`);
    
    // Run callback if provided
    if (callback && typeof callback === 'function') {
      callback();
    }
  }
  
  /**
   * Show a success notification
   * Uses MessageModal for successful operations
   * 
   * @param {Object} options Success options
   * @param {string} options.title Success title
   * @param {string} options.message Success message
   * @param {Object} messageModalInstance MessageModal instance
   * @param {Function} callback Optional callback function to run after message is shown
   */
  export function showSuccessNotification({ title, message }, messageModalInstance, callback = null) {
    console.log(`${title}: ${message}`);
  
    // First, try using the MessageModal if available
    if (messageModalInstance && typeof messageModalInstance.show === 'function') {
      messageModalInstance.show({
        title,
        message,
        onClose: callback
      });
      return;
    }
  
    // Fall back to browser alert if no MessageModal
    window.alert(`${title}: ${message}`);
    
    // Run callback if provided
    if (callback && typeof callback === 'function') {
      callback();
    }
  }
  
  /**
   * Wrap an async operation with error handling
   * This simplifies error handling for promise-based operations
   * 
   * @param {Function} operation Promise-returning operation to execute
   * @param {Object} options Options for error handling
   * @param {string} options.successTitle Title for success message
   * @param {string} options.successMessage Message for success notification
   * @param {string} options.errorTitle Title for error message
   * @param {Object} modalInstances Modal instances for notifications
   * @param {Object} modalInstances.errorModal ErrorModal instance
   * @param {Object} modalInstances.messageModal MessageModal instance
   * @returns {Promise} The result of the operation if successful
   */
  export async function withErrorHandling(operation, options, modalInstances) {
    try {
      const result = await operation();
      
      // Show success message if configured
      if (options.successTitle && options.successMessage) {
        showSuccessNotification({
          title: options.successTitle,
          message: options.successMessage
        }, modalInstances.messageModal);
      }
      
      return result;
    } catch (err) {
      // Show error message
      showUserError({
        title: options.errorTitle || "Error",
        message: err.message || "An unexpected error occurred.",
        details: err.stack
      }, modalInstances.errorModal);
      
      // Re-throw if specified
      if (options.rethrow) {
        throw err;
      }
      
      // Return null or default value
      return options.defaultValue || null;
    }
  }
  
  /**
   * Helper to handle the results of bulk operations
   * Provides consistent user feedback for success/partial/failure cases
   *
   * @param {Object} result The result from a bulk operation API call
   * @param {Function} updateFn Function to update items in the UI
   * @param {Function} removeFn Function to remove items from the UI
   * @param {string} operationName Name of the operation for messages
   * @param {Object} options Additional options
   * @param {boolean} options.autoRemove Whether to automatically remove items (for delete operations)
   * @param {Object} modalInstances Modal instances for notifications
   */
  export async function handleBulkOperationResults(
    result,
    updateFn,
    removeFn,
    operationName,
    options = { autoRemove: false },
    modalInstances = {}
  ) {
    const { errorModal, messageModal } = modalInstances;
    
    try {
      // Check if we have a valid result
      if (!result) {
        showUserError({
          title: `${operationName} Failed`,
          message: `The ${operationName.toLowerCase()} operation failed to complete.`
        }, errorModal);
        return;
      }
      
      // Check for items to update
      if (result.updatedItems && result.updatedItems.length > 0 && updateFn) {
        updateFn(result.updatedItems);
      }
      
      // Check for items to remove
      if (options.autoRemove && result.removedItems && result.removedItems.length > 0 && removeFn) {
        removeFn(result.removedItems);
      }
      
      // Calculate success count
      const successCount = (result.updatedCount || 0) + (result.removedCount || 0);
      const totalCount = (result.totalCount || 0);
      
      // Determine success message based on operation completion
      if (successCount === totalCount) {
        // All items were processed successfully
        showSuccessNotification({
          title: `${operationName} Successful`,
          message: `${operationName} completed successfully for ${successCount} item(s).`
        }, messageModal);
      } else if (successCount > 0) {
        // Partially successful
        showUserError({
          title: `${operationName} Partially Completed`,
          message: `${operationName} completed for ${successCount} of ${totalCount} item(s).`
        }, errorModal);
      } else {
        // No items were processed
        showUserError({
          title: `${operationName} Failed`,
          message: `No items were ${operationName.toLowerCase()}ed. Please try again.`
        }, errorModal);
      }
      
      // Handle specific error cases
      if (result.results) {
        // Handle locked items
        if (result.results.locked && result.results.locked.length > 0) {
          const lockedCount = result.results.locked.length;
          showUserError({
            title: "Items Locked",
            message: `${lockedCount} item(s) could not be ${operationName.toLowerCase()}ed because they are locked by another user.`
          }, errorModal);
        }
        
        // Handle failed items with specific errors
        if (result.results.failed && result.results.failed.length > 0) {
          const failedCount = result.results.failed.length;
          showUserError({
            title: "Operation Failed for Some Items",
            message: `${failedCount} item(s) encountered errors during the ${operationName.toLowerCase()} operation.`
          }, errorModal);
        }
      }
    } catch (err) {
      console.error(`Error in handleBulkOperationResults for ${operationName}:`, err);
      showUserError({
        title: `Error Processing ${operationName} Results`,
        message: err.message || "An unexpected error occurred while processing the operation results.",
        details: err.stack
      }, errorModal);
    }
  }