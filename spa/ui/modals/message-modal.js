// File: ui/modals/message-modal.js
/**
 * MessageModal displays a general message.
 * We add a high z-index for Issue #9 so it always appears above other modals.
 */
export class MessageModal {
  constructor() {
    // Reduced logging noise - constructor called frequently
    this.modalEl = null;
    this.overlayEl = null;
    this._buildDOM();
  }

  _buildDOM() {
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "overlay";
    this.overlayEl.style.display = "none";
    // For Issue #9:
    this.overlayEl.style.zIndex = "9000";

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--simple";
    this.modalEl.style.zIndex = "10001";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close message modal">&times;</button>
      <h2 id="messageModalTitle">Message</h2>
      <p id="messageModalMessage"></p>
      <!-- Single primary action button in a group -->
      <div class="button-group">
        <button class="btn btn--primary" id="messageModalOkBtn" aria-label="OK">OK</button>
      </div>
    `;

    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.modalEl);
    this.modalEl.style.display = "none";

    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => this.hide());
    const okBtn = this.modalEl.querySelector("#messageModalOkBtn");
    okBtn.addEventListener("click", () => {
      // Reduced logging noise - OK button clicks are frequent
      this.hide();
    });
    this.overlayEl.addEventListener("click", () => this.hide());
  }

  show({ title, message }) {
    // Only log if there's an actual message to reduce noise
    if (title || message) {
      console.log("[MessageModal] Showing:", title || "Message");
    }
    const titleEl = this.modalEl.querySelector("#messageModalTitle");
    const msgEl = this.modalEl.querySelector("#messageModalMessage");
    titleEl.textContent = title || "Message";

    // Format message with proper bullet points and line breaks
    if (typeof message === 'string' && message) {
      // Convert bullet points and format line breaks
      let formattedMessage = message
        // Convert • bullet points to proper HTML list items
        .replace(/• /g, '<li>')
        // Add closing list item tags before line breaks
        .replace(/\n(?=• )/g, '</li>\n')
        // Add final closing tag if message ends with bullet point
        .replace(/(<li>[^<]*?)$/g, '$1</li>')
        // Convert standalone line breaks to <br> tags
        .replace(/\n(?!<li>)/g, '<br>')
        // Wrap list items in proper <ul> tags
        .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
      
      // Clean up any double ul tags
      formattedMessage = formattedMessage.replace(/<\/ul>\s*<ul>/g, '');
      
      msgEl.innerHTML = formattedMessage;
    } else {
      msgEl.textContent = message || "";
    }

    this.overlayEl.style.display = "block";
    this.modalEl.style.display = "block";
  }

  hide() {
    console.log("[MessageModal] hide() called");
    this.overlayEl.style.display = "none";
    this.modalEl.style.display = "none";
  }
}
