// File: ui/modals/register-modal.js

import { registerUser } from "../../api/auth.js";
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";
import { ValidationUtils } from "../../utils/validation-utils.js";

export class RegisterModal extends AsyncFormModal {
  constructor() {
    super();
    console.log("[RegisterModalEnhanced] Constructor called");
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.validators = {};
    this.accessKeyFromUrl = this._getAccessKeyFromUrl();
    this._buildDOM();
  }

  /**
   * Extract access key from URL parameter 'key'
   */
  _getAccessKeyFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('key')?.trim() || null;
  }

  show() {
    // Check if subtenant is validated before showing
    const subtenant = localStorage.getItem('subtenant');
    if (!subtenant) {
      console.error('[RegisterModalEnhanced] No validated subtenant - cannot show register modal');
      this.errorModal.show({
        title: "Registration Unavailable",
        message: "Organization context is not available. Please refresh the page and ensure your URL includes ?s=your-organization-code"
      });
      return;
    }

    super.show();
    this._updateButtonState();
    this._populateAccessKeyFromUrl();
    this._focusFirstEmptyField();
  }

  _updateButtonState() {
    const subtenant = localStorage.getItem('subtenant');
    const submitBtn = this.modalEl.querySelector("#register-submit");

    if (submitBtn) {
      if (!subtenant) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Organization Required";
        submitBtn.title = "Please ensure your URL includes ?s=your-organization-code";
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
        submitBtn.title = "";
      }
    }
  }

  _populateAccessKeyFromUrl() {
    if (this.accessKeyFromUrl) {
      const accessKeyField = this.modalEl.querySelector("#register-api-key");
      if (accessKeyField) {
        accessKeyField.value = this.accessKeyFromUrl;
        // Make field readonly if populated from URL
        accessKeyField.readOnly = true;
        accessKeyField.style.backgroundColor = '#f8f9fa';
        accessKeyField.title = 'Access key automatically populated from URL';
      }
    }
  }

  _focusFirstEmptyField() {
    const fields = [
      '#register-username',
      '#register-email',
      '#register-password',
      '#register-confirm-password',
      '#register-api-key'
    ];

    for (const fieldSelector of fields) {
      const field = this.modalEl.querySelector(fieldSelector);
      if (field && !field.value.trim()) {
        field.focus();
        break;
      }
    }
  }


  _showValidationErrors(errors) {
    const errorEl = this.modalEl.querySelector("#registerError");
    if (errors.length > 0) {
      errorEl.innerHTML = `
        <div class="validation-errors">
          <strong>Please fix the following issues:</strong>
          <ul>
            ${errors.map(error => `<li>${error}</li>`).join('')}
          </ul>
        </div>
      `;
      errorEl.style.display = "block";
    } else {
      errorEl.style.display = "none";
    }
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--register";
    this.modalEl.id = "registerModalEnhanced";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close register modal">&times;</button>
      <h2>Create Account</h2>
      <form id="registerFormEnhanced" class="async-form register-form">
        <div class="register-form-content">
          <div class="register-form-main">
            <div class="form-row">
              <div class="form-group">
                <label for="register-username">Username *</label>
                <input 
                  type="text" 
                  id="register-username" 
                  placeholder="Enter username" 
                  required 
                  autocomplete="username"
                  aria-label="Enter your username"
                />
                <div class="field-help">3-50 characters, letters, numbers, underscores, and hyphens only</div>
              </div>
              
              <div class="form-group">
                <label for="register-email">Email Address *</label>
                <input 
                  type="email" 
                  id="register-email" 
                  placeholder="Enter email address" 
                  required 
                  autocomplete="email"
                  aria-label="Enter your email address"
                />
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="register-password">Password *</label>
                <input 
                  type="password" 
                  id="register-password" 
                  placeholder="Enter password" 
                  required 
                  autocomplete="new-password"
                  aria-label="Enter your password"
                />
                <div class="password-strength" id="password-strength"></div>
              </div>
              
              <div class="form-group">
                <label for="register-confirm-password">Confirm Password *</label>
                <input 
                  type="password" 
                  id="register-confirm-password" 
                  placeholder="Re-enter password" 
                  required 
                  autocomplete="new-password"
                  aria-label="Confirm your password"
                />
              </div>
            </div>
            
            <div class="form-group form-group--full">
              <label for="register-api-key">Access Key *</label>
              <input 
                type="text" 
                id="register-api-key" 
                placeholder="Enter your access key" 
                required 
                aria-label="Enter your access key"
              />
              <div class="field-help">This key was provided by your administrator</div>
            </div>

            <div class="inline-error" id="registerError" style="display:none;"></div>
            
            <div class="button-group">
              <button type="button" class="btn" id="register-cancel" aria-label="Cancel registration">
                Cancel
              </button>
              <button type="submit" class="btn btn--primary" id="register-submit" aria-label="Submit registration">
                Create Account
              </button>
            </div>
          </div>
          
          <div class="register-form-sidebar">
            <div class="password-requirements">
              <strong>Password Requirements:</strong>
              <ul>
                <li>At least 12 characters long</li>
                <li>Contains uppercase and lowercase letters</li>
                <li>Contains at least one number</li>
                <li>Contains at least one special character</li>
                <li>No more than 3 repeated characters in a row</li>
                <li>No sequential characters (123, abc, etc.)</li>
              </ul>
            </div>
          </div>
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
      console.log("[RegisterModalEnhanced] Close button clicked");
      this.hide();
    });

    // Cancel button
    const cancelBtn = this.modalEl.querySelector("#register-cancel");
    cancelBtn.addEventListener("click", () => {
      console.log("[RegisterModalEnhanced] Cancel button clicked");
      this.hide();
    });

    // Set up real-time validation
    const usernameField = this.modalEl.querySelector("#register-username");
    const emailField = this.modalEl.querySelector("#register-email");
    const passwordField = this.modalEl.querySelector("#register-password");
    const confirmPasswordField = this.modalEl.querySelector("#register-confirm-password");
    const strengthIndicator = this.modalEl.querySelector("#password-strength");

    // Username validation
    this.validators.username = ValidationUtils.createRealtimeValidator(
      usernameField,
      'username'
    );

    // Email validation
    this.validators.email = ValidationUtils.createRealtimeValidator(
      emailField,
      'email'
    );

    // Password validation with strength indicator
    this.validators.password = ValidationUtils.createRealtimeValidator(
      passwordField,
      'password',
      {
        username: usernameField.value,
        strengthIndicator: strengthIndicator
      }
    );

    // Update password validator when username changes
    usernameField.addEventListener('input', () => {
      if (this.validators.password) {
        this.validators.password.updateOptions({ username: usernameField.value });
      }
    });

    // Confirm password validation
    const validateConfirmPassword = () => {
      const password = passwordField.value;
      const confirmPassword = confirmPasswordField.value;
      let feedbackEl = confirmPasswordField.nextElementSibling;
      
      if (!feedbackEl || !feedbackEl.classList.contains('validation-feedback')) {
        feedbackEl = document.createElement('div');
        feedbackEl.className = 'validation-feedback';
        confirmPasswordField.insertAdjacentElement('afterend', feedbackEl);
      }

      if (confirmPassword && password !== confirmPassword) {
        feedbackEl.className = 'validation-feedback validation-feedback--error';
        feedbackEl.innerHTML = '<ul class="validation-errors-list"><li>Passwords don\'t match</li></ul>';
        confirmPasswordField.classList.add('input--error');
        confirmPasswordField.classList.remove('input--valid');
      } else if (confirmPassword && password === confirmPassword) {
        feedbackEl.className = 'validation-feedback validation-feedback--success';
        feedbackEl.innerHTML = '<i class="fas fa-check-circle"></i> Passwords match';
        confirmPasswordField.classList.add('input--valid');
        confirmPasswordField.classList.remove('input--error');
      } else {
        feedbackEl.innerHTML = '';
        confirmPasswordField.classList.remove('input--error', 'input--valid');
      }
    };

    confirmPasswordField.addEventListener('input', validateConfirmPassword);
    passwordField.addEventListener('input', validateConfirmPassword);

    // Form submission
    const registerForm = this.modalEl.querySelector("#registerFormEnhanced");
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this._handleFormSubmission();
    });
  }


  async _handleFormSubmission() {
    // Check subtenant before proceeding
    const subtenant = localStorage.getItem('subtenant');
    if (!subtenant) {
      const errorEl = this.modalEl.querySelector("#registerError");
      errorEl.textContent = "Organization context not available. Please refresh the page.";
      errorEl.style.display = "block";
      return;
    }

    console.log("[RegisterModalEnhanced] Registration form submitted");

    const username = this.modalEl.querySelector("#register-username").value.trim();
    const email = this.modalEl.querySelector("#register-email").value.trim();
    const password = this.modalEl.querySelector("#register-password").value;
    const confirmPassword = this.modalEl.querySelector("#register-confirm-password").value;
    const apiKey = this.modalEl.querySelector("#register-api-key").value.trim();

    // Comprehensive client-side validation using ValidationUtils
    const allErrors = [];

    // Username validation
    const usernameErrors = ValidationUtils.validateUsername(username);
    allErrors.push(...usernameErrors);

    // Email validation
    const emailErrors = ValidationUtils.validateEmail(email);
    allErrors.push(...emailErrors);

    // Password validation
    const passwordErrors = ValidationUtils.validatePassword(password, username);
    allErrors.push(...passwordErrors);

    // Password confirmation
    if (password !== confirmPassword) {
      allErrors.push("Passwords don't match");
    }

    // Access key validation
    if (!apiKey) {
      allErrors.push("Access key is required");
    }

    if (allErrors.length > 0) {
      this._showValidationErrors(allErrors);
      return;
    }

    this.lockFields();
    this.lockButtons();

    try {
      const result = await registerUser(username, password, email, apiKey);
      console.log("[RegisterModalEnhanced] Registration successful:", result);
      this.hide();

      this.messageModal.show({
        title: "Registration Successful",
        message: "Your account has been created successfully! You can now log in with your credentials."
      });

    } catch (error) {
      console.error("[RegisterModalEnhanced] Registration error:", error);

      // Handle specific error responses from server
      if (error.response && error.response.password_errors) {
        this._showValidationErrors(error.response.password_errors);
      } else {
        const errorEl = this.modalEl.querySelector("#registerError");
        errorEl.textContent = "Registration error: " + error.message;
        errorEl.style.display = "block";
      }
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }

  hide() {
    // Clean up validators when hiding modal
    Object.values(this.validators).forEach(validator => {
      if (validator && validator.destroy) {
        validator.destroy();
      }
    });
    this.validators = {};
    super.hide();
  }
}