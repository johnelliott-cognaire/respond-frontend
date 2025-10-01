// File: ui/modals/login-modal.js

import { login } from "../../api/auth.js";
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";

export class LoginModal extends AsyncFormModal {
  constructor() {
    super();
    console.log("[LoginModalEnhanced] Constructor called");
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.passwordResetModal = null; // Will be loaded dynamically if needed
    this._buildDOM();
  }

  show() {
    // Check if subtenant is validated before showing
    const subtenant = localStorage.getItem('subtenant');
    if (!subtenant) {
      console.error('[LoginModalEnhanced] No validated subtenant - cannot show login modal');
      this.errorModal.show({
        title: "Login Unavailable",
        message: "Organization context is not available. Please refresh the page and ensure your URL includes ?s=your-organization-code"
      });
      return;
    }

    super.show();
    this._updateButtonState();
    this._focusUsernameField();
    this._clearPreviousErrors();
  }

  _updateButtonState() {
    const subtenant = localStorage.getItem('subtenant');
    const submitBtn = this.modalEl.querySelector("#loginSubmitBtn");

    if (submitBtn) {
      if (!subtenant) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Organization Required";
        submitBtn.title = "Please ensure your URL includes ?s=your-organization-code";
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
        submitBtn.title = "";
      }
    }
  }

  _focusUsernameField() {
    const usernameField = this.modalEl.querySelector("#loginUsername");
    if (usernameField) {
      setTimeout(() => usernameField.focus(), 100);
    }
  }

  _clearPreviousErrors() {
    const errorEl = this.modalEl.querySelector("#loginError");
    if (errorEl) {
      errorEl.style.display = "none";
      errorEl.innerHTML = "";
    }
  }

  _showError(message, type = 'error') {
    const errorEl = this.modalEl.querySelector("#loginError");
    errorEl.className = `inline-error ${type}`;
    errorEl.innerHTML = message;
    errorEl.style.display = "block";
  }

  _showWarning(message) {
    this._showError(message, 'warning');
  }

  _handleSecurityError(error, errorCode) {
    const errorEl = this.modalEl.querySelector("#loginError");

    switch (errorCode) {
      case 'PASSWORD_EXPIRED':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-clock"></i>
          <strong>Password Expired</strong>
          <p>${error.error || error.message || 'Your password has expired and must be changed before you can continue.'}</p>
          <div style="margin-top: 12px;">
            <button class="btn btn--primary" id="resetPasswordBtn">
              <i class="fas fa-key"></i> Reset Password Now
            </button>
          </div>
        </div>
      `;

        // Add event listener for password reset
        const resetBtn = errorEl.querySelector("#resetPasswordBtn");
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            this._showPasswordResetForm(
              error.username || this.modalEl.querySelector("#loginUsername").value,
              error.subtenant || localStorage.getItem('subtenant')
            );
          });
        }
        break;

      case 'ACCOUNT_LOCKED':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-lock"></i>
          <strong>Account Locked</strong>
          <p>${error.error || error.message}</p>
          <p>Please contact your administrator to unlock your account.</p>
        </div>
      `;
        break;

      case 'NO_APP_ACCESS':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-ban"></i>
          <strong>Access Denied</strong>
          <p>${error.error || error.message}</p>
          <p>Please contact your administrator for application access.</p>
        </div>
      `;
        break;

      default:
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Login Failed</strong>
          <p>${error.error || error.message}</p>
        </div>
      `;
    }

    errorEl.className = "inline-error security";
    errorEl.style.display = "block";
  }

  async _showPasswordResetForm(username, subtenant) {
    // Dynamically import password reset modal if not already loaded
    if (!this.passwordResetModal) {
      try {
        const { PasswordResetModal } = await import('./password-reset-modal.js');
        this.passwordResetModal = new PasswordResetModal();
      } catch (error) {
        console.error('Failed to load password reset modal:', error);
        this._showError('Password reset functionality is not available.');
        return;
      }
    }

    this.hide();
    this.passwordResetModal.show({ username, subtenant, mode: 'expired_password' });
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--form modal--narrow";
    this.modalEl.id = "loginModalEnhanced";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close login modal">&times;</button>
      <h2>Sign In</h2>
      <form id="loginFormEnhanced" class="async-form">
        <div class="form-group">
          <label for="loginUsername">Username</label>
          <input 
            type="text" 
            id="loginUsername" 
            placeholder="Enter username"
            required 
            autocomplete="username"
            aria-label="Enter your username"
          />
        </div>
        <div class="form-group">
          <label for="loginPassword">Password</label>
          <div class="password-input-group">
            <input 
              type="password" 
              id="loginPassword" 
              placeholder="Enter password"
              required 
              autocomplete="current-password"
              aria-label="Enter your password"
            />
            <button type="button" class="toggle-password" id="togglePassword" aria-label="Toggle password visibility">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
        
        <div class="inline-error" id="loginError" style="display:none;"></div>
        
        <div class="button-group">
          <button type="button" class="btn" id="loginCancelBtn" aria-label="Cancel login">
            Cancel
          </button>
          <button type="submit" class="btn btn--primary" id="loginSubmitBtn" aria-label="Submit login">
            Sign In
          </button>
        </div>
        
        <div class="login-help">
          <a href="#" id="forgotPasswordLink">Forgot your password?</a>
        </div>
      </form>
    `;
    this.modalEl.style.display = "none";
    document.body.appendChild(this.modalEl);

    this._addEventListeners();
  }

  _addEventListeners() {
    // Close button
    const closeBtn = this.modalEl.querySelector(".modal__close");
    closeBtn.addEventListener("click", () => {
      console.log("[LoginModalEnhanced] Close button clicked");
      this.hide();
    });

    // Cancel button
    const cancelBtn = this.modalEl.querySelector("#loginCancelBtn");
    cancelBtn.addEventListener("click", () => {
      console.log("[LoginModalEnhanced] Cancel button clicked");
      this.hide();
    });

    // Password visibility toggle
    const togglePassword = this.modalEl.querySelector("#togglePassword");
    const passwordField = this.modalEl.querySelector("#loginPassword");

    togglePassword.addEventListener("click", () => {
      const type = passwordField.getAttribute("type") === "password" ? "text" : "password";
      passwordField.setAttribute("type", type);

      const icon = togglePassword.querySelector("i");
      icon.className = type === "password" ? "fas fa-eye" : "fas fa-eye-slash";
    });

    // Forgot password link
    const forgotPasswordLink = this.modalEl.querySelector("#forgotPasswordLink");
    forgotPasswordLink.addEventListener("click", async (e) => {
      e.preventDefault();

      const username = this.modalEl.querySelector("#loginUsername").value.trim();
      const subtenant = localStorage.getItem('subtenant');

      if (!username) {
        this._showError('Please enter your username first.');
        return;
      }

      await this._showPasswordResetForm(username, subtenant);
    });

    // Form submission
    const loginForm = this.modalEl.querySelector("#loginFormEnhanced");
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this._handleFormSubmission();
    });

    // Enter key handling for better UX
    this.modalEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.target.matches("button")) {
        e.preventDefault();
        const form = this.modalEl.querySelector("#loginFormEnhanced");
        form.dispatchEvent(new Event('submit'));
      }
    });
  }

  async _handleFormSubmission() {
    // Check subtenant before proceeding
    const subtenant = localStorage.getItem('subtenant');
    if (!subtenant) {
      this._showError("Organization context not available. Please refresh the page.");
      return;
    }

    console.log("[LoginModalEnhanced] Login form submitted");
    this._clearPreviousErrors();
    this.lockFields();
    this.lockButtons();

    const username = this.modalEl.querySelector("#loginUsername").value.trim();
    const password = this.modalEl.querySelector("#loginPassword").value;

    // Basic client-side validation
    if (!username) {
      this._showError("Username is required.");
      this.unlockFields();
      this.unlockButtons();
      return;
    }

    if (!password) {
      this._showError("Password is required.");
      this.unlockFields();
      this.unlockButtons();
      return;
    }

    try {
      const resp = await login(username, password);
      console.log("[LoginModalEnhanced] Login successful, response:", resp);

      // Check for password warning
      if (resp.password_warning) {
        this._showWarning(`
        <i class="fas fa-exclamation-triangle"></i>
        ${resp.password_warning}
        <button class="btn btn--small btn--secondary" id="changePasswordBtn">
          Change Password
        </button>
      `);

        // Add event listener for change password button
        const changeBtn = this.modalEl.querySelector("#changePasswordBtn");
        if (changeBtn) {
          changeBtn.addEventListener('click', () => {
            this._showPasswordResetForm(username, subtenant);
          });
        }

        // Auto-hide warning after 5 seconds and proceed with login
        setTimeout(() => {
          this.hide();
          document.dispatchEvent(new Event("userLoggedIn"));
        }, 5000);
      } else {
        this.hide();
        document.dispatchEvent(new Event("userLoggedIn"));
      }

    } catch (err) {
      console.error("[LoginModalEnhanced] Login failed:", err);
      console.log("[LoginModalEnhanced] Error details:", {
        status: err.status,
        response: err.response,
        errorCode: err.errorCode,
        message: err.message
      });

      // Handle standardized auth responses
      if (err.response && err.response.auth_status) {
        this._handleStandardizedAuthError(err.response, err.status);
      } else if (err.status === 429) {
        // Rate limiting
        this._showError(`
        <i class="fas fa-clock"></i>
        <strong>Too Many Attempts</strong>
        <p>Too many login attempts. Please wait before trying again.</p>
        ${err.response?.retry_after ? `<p>Retry after: ${Math.ceil(err.response.retry_after / 60)} minutes</p>` : ''}
      `);
      } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
        // Network/CORS error
        this._showError(`
        <i class="fas fa-exclamation-triangle"></i>
        <strong>Connection Error</strong>
        <p>Unable to connect to the authentication server. This may be due to:</p>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li>Network connectivity issues</li>
          <li>Server configuration problems</li>
          <li>Authentication service unavailable</li>
        </ul>
        <p>Please try again or contact your administrator.</p>
      `);
      } else {
        // Fallback for any other errors
        this._showError("Login failed: " + (err.message || 'Please check your username and password.'));
      }
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }

  /**
   * Handle standardized authentication error responses
   */
  _handleStandardizedAuthError(response, httpStatus) {
    const errorEl = this.modalEl.querySelector("#loginError");
    const authStatus = response.auth_status;
    const message = response.message;

    switch (authStatus) {
      case 'PASSWORD_EXPIRED':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-clock"></i>
          <strong>Password Expired</strong>
          <p>${message}</p>
          <div style="margin-top: 12px;">
            <button class="btn btn--primary" id="resetPasswordBtn">
              <i class="fas fa-key"></i> Reset Password Now
            </button>
          </div>
        </div>
      `;

        // Add event listener for password reset
        const resetBtn = errorEl.querySelector("#resetPasswordBtn");
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            this._showPasswordResetForm(
              response.username || this.modalEl.querySelector("#loginUsername").value,
              response.subtenant || localStorage.getItem('subtenant')
            );
          });
        }
        break;

      case 'ACCOUNT_LOCKED':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-lock"></i>
          <strong>Account Locked</strong>
          <p>${message}</p>
          <p>Please contact your administrator to unlock your account.</p>
        </div>
      `;
        break;

      case 'ACCOUNT_DISABLED':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-ban"></i>
          <strong>Account Disabled</strong>
          <p>${message}</p>
          <p>Please contact your administrator for assistance.</p>
        </div>
      `;
        break;

      case 'NO_APP_ACCESS':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-ban"></i>
          <strong>Access Denied</strong>
          <p>${message}</p>
          <p>Please contact your administrator for application access.</p>
        </div>
      `;
        break;

      case 'INVALID_CREDENTIALS':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Login Failed</strong>
          <p>Invalid username or password.</p>
          <p>Please check your credentials and try again.</p>
        </div>
      `;
        break;

      case 'RATE_LIMITED':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-clock"></i>
          <strong>Too Many Attempts</strong>
          <p>${message}</p>
          <p>Please wait before trying again.</p>
        </div>
      `;
        break;

      case 'INTERNAL_ERROR':
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Service Error</strong>
          <p>${message}</p>
          <p>Please try again later or contact support if the problem persists.</p>
        </div>
      `;
        break;

      default:
        errorEl.innerHTML = `
        <div class="security-error">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Login Failed</strong>
          <p>${message || 'An unknown error occurred.'}</p>
        </div>
      `;
    }

    errorEl.className = "inline-error security";
    errorEl.style.display = "block";
  }

  /**
   * Enhanced _handleSecurityError method for backwards compatibility
   */
  _handleSecurityError(error, errorCode) {
    // Convert legacy error codes to standardized format
    const standardizedResponse = {
      auth_status: errorCode,
      message: error.error || error.message || 'An error occurred',
      username: error.username,
      subtenant: error.subtenant
    };

    this._handleStandardizedAuthError(standardizedResponse, null);
  }

}