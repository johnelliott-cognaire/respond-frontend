// File: utils/job-status-utils.js
/**
 * job-status-utils.js
 * Provides a standard aggregator for child statuses (DocumentItem -> Stage -> Document -> Tab -> Global).
 * 
 * Adheres to the precedence rules:
 * 1) If any child is "FAILED" => aggregate = "FAILED" (red)
 * 2) Else if any child is "RUNNING" => aggregate = "RUNNING" (amber)
 * 3) Else if all children are "COMPLETED" => aggregate = "COMPLETED" (green)
 * 4) Else if all children are either STOPPED or CANCELLED => aggregate = "STOPPED" (grey)
 * 5) Otherwise => aggregate = "NOT_APPLICABLE" (brand blue)
 */

export const JOB_STATUS = Object.freeze({
    FAILED: "FAILED",
    RUNNING: "RUNNING",
    STOPPED: "STOPPED",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED",
    NOT_APPLICABLE: "NOT_APPLICABLE"
});

/**
 * computeAggregateStatus
 * @param {string[]} childStatuses - array of status strings
 * @returns {string} - aggregated job status
 */
export function computeAggregateStatus(childStatuses) {
    // Normalize to upper-case
    const statuses = childStatuses.map(s => (s || "").toUpperCase().trim()).filter(Boolean);
    if (!statuses.length) {
        return JOB_STATUS.NOT_APPLICABLE;
    }

    // 1) Any "FAILED" => "FAILED"
    if (statuses.includes(JOB_STATUS.FAILED)) {
        return JOB_STATUS.FAILED;
    }

    // 2) Any "RUNNING" => "RUNNING"
    if (statuses.includes(JOB_STATUS.RUNNING)) {
        return JOB_STATUS.RUNNING;
    }

    // 3) If all are COMPLETED => COMPLETED
    if (statuses.every(s => s === JOB_STATUS.COMPLETED)) {
        return JOB_STATUS.COMPLETED;
    }

    // 4) If all are STOPPED or CANCELLED, then => STOPPED
    const allStoppedOrCancelled = statuses.every(s => s === JOB_STATUS.STOPPED || s === JOB_STATUS.CANCELLED);
    if (allStoppedOrCancelled) {
        // We'll unify the "STOPPED" and "CANCELLED" grouping as "STOPPED" color
        return JOB_STATUS.STOPPED;
    }

    // 5) Otherwise => NOT_APPLICABLE
    return JOB_STATUS.NOT_APPLICABLE;
}
