// ui/components/status-indicator.js
export class StatusIndicator {
    constructor() {
        this._buildDOM();
    }

    _buildDOM() {
        // Create a container element for the status UI
        this.container = document.createElement('div');
        this.container.className = 'status-container';

        // Set up the inner HTML structure for the status component (NO buttons)
        this.container.innerHTML = `
        <div class="status-label-row">
          <span class="status-label">Status:</span>&nbsp;
          <span class="status-indicator">Not started</span>
        </div>
        <div class="progress-container">
          <div class="progress-bar" style="width: 0%;"></div>
        </div>
        <div class="step-counter"></div>
      `;

        // Store references to sub-elements
        this.statusIndicatorEl = this.container.querySelector('.status-indicator');
        this.progressBarEl = this.container.querySelector('.progress-bar');
        this.stepCounterEl = this.container.querySelector('.step-counter');
    }

    /**
     * Returns the root container element of the status component.
     */
    getElement() {
        return this.container;
    }

    /**
     * Updates the UI based on the new status.
     * @param {string} status - The new status (e.g., 'PROCESSING', 'COMPLETED', etc.)
     * @param {number|null} stepsCompleted - Number of completed steps
     * @param {number|null} stepsTotal - Total number of steps
     * @param {string|null} customText - Optional custom text to display
     */
    update(status, stepsCompleted, stepsTotal, customText = null) {
        // Remove any previously applied status classes
        this.statusIndicatorEl.classList.remove(
            'status-not-started',
            'status-started',
            'status-processing',
            'status-completed',
            'status-failed',
            'status-error'
        );

        let statusText, statusClass;
        let progressPercent = 0;

        switch (status.toUpperCase()) {
            case 'STARTED':
                statusText = customText || 'Starting...';
                statusClass = 'status-started';
                progressPercent = 5;
                break;
            case 'PROCESSING':
                statusText = customText || 'Processing...';
                statusClass = 'status-processing';
                if (stepsCompleted !== null && stepsTotal !== null && stepsTotal > 0) {
                    progressPercent = Math.min(Math.round((stepsCompleted / stepsTotal) * 100), 95);
                } else {
                    progressPercent = 50;
                }
                break;
            case 'COMPLETED':
                statusText = customText || 'Completed';
                statusClass = 'status-completed';
                progressPercent = 100;
                break;
            case 'FAILED':
                statusText = customText || 'Failed';
                statusClass = 'status-failed';
                progressPercent = 100;
                break;
            case 'CANCELLED':
                statusText = customText || 'Cancelled';
                statusClass = 'status-failed';
                progressPercent = 100;
                break;
            case 'REQUEST_ERROR':
                statusText = customText || 'Connection Error';
                statusClass = 'status-error';
                progressPercent = 100;
                break;
            default:
                statusText = customText || 'Not started';
                statusClass = 'status-not-started';
                progressPercent = 0;
        }

        // Update the status label and CSS class
        this.statusIndicatorEl.textContent = statusText;
        this.statusIndicatorEl.classList.add(statusClass);

        // Update the progress bar width
        this.progressBarEl.style.width = `${progressPercent}%`;

        // Update the step counter if available
        if (stepsCompleted !== null && stepsCompleted !== undefined && 
            stepsTotal !== null && stepsTotal !== undefined) {
            this.stepCounterEl.textContent = `Step ${stepsCompleted} of ${stepsTotal}`;
            this.stepCounterEl.style.display = 'block';
        } else {
            this.stepCounterEl.style.display = 'none';
        }
    }
}