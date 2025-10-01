// File: utils/modal-origin-tracker.js
/**
 * Modal Origin Tracker
 *
 * Provides reusable origin tracking for modals to enable URL reversion
 * when modals are closed. Supports modal stacking and complex navigation flows.
 */

/**
 * Modal Origin Tracker - Singleton class for managing modal origin URLs
 */
class ModalOriginTrackerClass {
    constructor() {
        // Stack to track modal origins (LIFO - Last In, First Out)
        this.originStack = [];

        // Map of modal ID to stack position for efficient lookups
        this.modalToStackIndex = new Map();

        // Debug logging flag
        this.debug = true;
    }

    /**
     * Generate a unique modal ID for tracking purposes
     * @returns {string} Unique modal ID
     */
    generateModalId() {
        return `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Push an origin URL onto the stack when a modal opens
     * @param {string} modalId - Unique identifier for the modal
     * @param {string} originUrl - The URL to return to when this modal closes
     */
    pushOrigin(modalId, originUrl) {
        if (!modalId || !originUrl) {
            console.warn('[ModalOriginTracker] Invalid parameters for pushOrigin:', { modalId, originUrl });
            return;
        }

        const stackItem = {
            modalId,
            originUrl,
            timestamp: Date.now(),
            stackIndex: this.originStack.length
        };

        this.originStack.push(stackItem);
        this.modalToStackIndex.set(modalId, stackItem.stackIndex);

        if (this.debug) {
            console.log(`[ModalOriginTracker] 📌 Pushed origin for modal ${modalId}:`, originUrl);
            console.log(`[ModalOriginTracker] 📋 Current stack size:`, this.originStack.length);
        }
    }

    /**
     * Pop the most recent origin for a specific modal
     * @param {string} modalId - The modal ID to pop origin for
     * @returns {string|null} The origin URL to restore, or null if not found
     */
    popOrigin(modalId) {
        if (!modalId) {
            console.warn('[ModalOriginTracker] No modal ID provided for popOrigin');
            return null;
        }

        const stackIndex = this.modalToStackIndex.get(modalId);
        if (stackIndex === undefined) {
            if (this.debug) {
                console.log(`[ModalOriginTracker] 🔍 No origin found for modal ${modalId}`);
            }
            return null;
        }

        // Find and remove the stack item
        const stackItem = this.originStack[stackIndex];
        if (!stackItem) {
            console.warn(`[ModalOriginTracker] Stack item not found at index ${stackIndex}`);
            return null;
        }

        // Remove from stack and index map
        this.originStack.splice(stackIndex, 1);
        this.modalToStackIndex.delete(modalId);

        // Update stack indices for items that shifted down
        this._updateStackIndices();

        if (this.debug) {
            console.log(`[ModalOriginTracker] 🔙 Popped origin for modal ${modalId}:`, stackItem.originUrl);
            console.log(`[ModalOriginTracker] 📋 Remaining stack size:`, this.originStack.length);
        }

        return stackItem.originUrl;
    }

    /**
     * Get the origin URL for a specific modal without removing it
     * @param {string} modalId - The modal ID to get origin for
     * @returns {string|null} The origin URL, or null if not found
     */
    getOriginForModal(modalId) {
        const stackIndex = this.modalToStackIndex.get(modalId);
        if (stackIndex === undefined) {
            return null;
        }

        const stackItem = this.originStack[stackIndex];
        return stackItem ? stackItem.originUrl : null;
    }

    /**
     * Get the most recent origin URL (top of stack)
     * @returns {string|null} The most recent origin URL, or null if stack is empty
     */
    getLatestOrigin() {
        if (this.originStack.length === 0) {
            return null;
        }

        const latestItem = this.originStack[this.originStack.length - 1];
        return latestItem.originUrl;
    }

    /**
     * Check if a modal has an origin tracked
     * @param {string} modalId - The modal ID to check
     * @returns {boolean} True if modal has tracked origin
     */
    hasOrigin(modalId) {
        return this.modalToStackIndex.has(modalId);
    }

    /**
     * Remove all origins for cleanup
     */
    clearAllOrigins() {
        const clearedCount = this.originStack.length;
        this.originStack = [];
        this.modalToStackIndex.clear();

        if (this.debug && clearedCount > 0) {
            console.log(`[ModalOriginTracker] 🧹 Cleared ${clearedCount} origin(s) from stack`);
        }
    }

    /**
     * Get current stack state for debugging
     * @returns {Array} Current origin stack
     */
    getStackState() {
        return this.originStack.map(item => ({
            modalId: item.modalId,
            originUrl: item.originUrl,
            timestamp: item.timestamp,
            age: Date.now() - item.timestamp
        }));
    }

    /**
     * Enable or disable debug logging
     * @param {boolean} enabled - Whether to enable debug logging
     */
    setDebugLogging(enabled) {
        this.debug = !!enabled;
    }

    /**
     * Update stack indices after an item is removed
     * @private
     */
    _updateStackIndices() {
        this.modalToStackIndex.clear();

        this.originStack.forEach((item, index) => {
            item.stackIndex = index;
            this.modalToStackIndex.set(item.modalId, index);
        });
    }

    /**
     * Clean up old origins (older than 1 hour) to prevent memory leaks
     */
    cleanupOldOrigins() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const originalLength = this.originStack.length;

        this.originStack = this.originStack.filter(item => item.timestamp > oneHourAgo);

        const removedCount = originalLength - this.originStack.length;
        if (removedCount > 0) {
            this._updateStackIndices();

            if (this.debug) {
                console.log(`[ModalOriginTracker] 🧹 Cleaned up ${removedCount} old origin(s)`);
            }
        }
    }
}

// Create and export singleton instance
export const ModalOriginTracker = new ModalOriginTrackerClass();

// Clean up old origins every 30 minutes
setInterval(() => {
    ModalOriginTracker.cleanupOldOrigins();
}, 30 * 60 * 1000);

// Export the class as well for testing purposes
export { ModalOriginTrackerClass };