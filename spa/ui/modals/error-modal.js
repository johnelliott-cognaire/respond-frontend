// File: ui/modals/error-modal.js
/**
 * ErrorModal displays error messages in a modal window.
 * Enhanced to handle long error messages with scrolling and details toggle.
 */
export class ErrorModal {
  constructor() {
    this.modalEl = null;
    this.overlayEl = null;
    this._buildDOM();
  }

  _buildDOM() {
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "overlay";
    this.overlayEl.style.display = "none";
    this.overlayEl.style.zIndex = "9000";

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--simple error-modal";
    this.modalEl.style.zIndex = "10001"; // sits above overlay
    
    // Improve styling for error modal
    this.modalEl.style.maxWidth = "600px";
    this.modalEl.style.maxHeight = "80vh"; // Cap the height to prevent overflowing viewport

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close error modal">&times;</button>
      <h2 id="errorModalTitle" style="color: #f44336;">Error</h2>
      
      <!-- Scrollable container for error message -->
      <div id="errorModalMessageContainer" style="
        max-height: 60vh; 
        overflow-y: auto; 
        margin-bottom: 1rem;
        padding: 0.5rem;
        border: 1px solid #eee;
        border-radius: 4px;
      ">
        <p id="errorModalMessage"></p>
      </div>
      
      <!-- Optional technical details section -->
      <div id="errorModalDetails" style="display: none;">
        <div style="
          font-family: monospace;
          font-size: 0.85rem;
          background: #f5f5f5;
          padding: 0.5rem;
          border-radius: 4px;
          margin-bottom: 1rem;
          white-space: pre-wrap;
          overflow-x: auto;
          max-height: 200px;
          overflow-y: auto;
        " id="errorModalDetailsContent"></div>
      </div>
      
      <div class="button-group">
        <button class="btn secondary" id="errorModalToggleDetails" style="display: none;">Show Technical Details</button>
        <button class="btn btn--primary" id="errorModalOkBtn" aria-label="OK">OK</button>
      </div>
    `;

    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.modalEl);
    this.modalEl.style.display = "none";

    // Get references to all interactive elements
    const closeBtn = this.modalEl.querySelector(".modal__close");
    const okBtn = this.modalEl.querySelector("#errorModalOkBtn");
    const toggleDetailsBtn = this.modalEl.querySelector("#errorModalToggleDetails");
    const detailsContainer = this.modalEl.querySelector("#errorModalDetails");

    // Add event listeners
    closeBtn.addEventListener("click", () => this.hide());
    okBtn.addEventListener("click", () => this.hide());
    this.overlayEl.addEventListener("click", () => this.hide());
    
    // Toggle technical details when button is clicked
    toggleDetailsBtn.addEventListener("click", () => {
      const isShowing = detailsContainer.style.display !== "none";
      detailsContainer.style.display = isShowing ? "none" : "block";
      toggleDetailsBtn.textContent = isShowing ? "Show Technical Details" : "Hide Technical Details";
    });
  }

  /**
   * Show the error modal with the provided title and message
   * @param {object} options Configuration options
   * @param {string} options.title Modal title
   * @param {string} options.message Error message to display
   * @param {string} options.details Optional technical details (if provided, shows toggle button)
   */
  show({ title, message, details }) {
    console.log("[ErrorModal] show() called with title:", title, "message length:", message?.length || 0);
    
    const titleEl = this.modalEl.querySelector("#errorModalTitle");
    const msgEl = this.modalEl.querySelector("#errorModalMessage");
    const detailsEl = this.modalEl.querySelector("#errorModalDetailsContent");
    const toggleDetailsBtn = this.modalEl.querySelector("#errorModalToggleDetails");
    const detailsContainer = this.modalEl.querySelector("#errorModalDetails");
    
    // Set title and main message
    titleEl.textContent = title || "Error";
    
    // Handle message formatting
    if (message) {
      msgEl.textContent = message;
    } else {
      msgEl.textContent = "An unexpected error occurred.";
    }
    
    // Handle technical details if provided
    if (details) {
      detailsEl.textContent = details;
      toggleDetailsBtn.style.display = "inline-block";
      detailsContainer.style.display = "none"; // Start with details hidden
      toggleDetailsBtn.textContent = "Show Technical Details";
    } else {
      toggleDetailsBtn.style.display = "none";
      detailsContainer.style.display = "none";
    }
    
    // Show the modal
    this.overlayEl.style.display = "block";
    this.modalEl.style.display = "block";
  }

  hide() {
    console.log("[ErrorModal] hide() called");
    this.overlayEl.style.display = "none";
    this.modalEl.style.display = "none";
  }
}