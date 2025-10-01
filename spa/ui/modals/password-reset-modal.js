// File: ui/modals/password-reset-modal.js - Fixed to use api/auth.js client layer

import { resetPassword } from "../../api/auth.js";
import { AsyncFormModal } from "./async-form-modal.js";
import { ErrorModal } from "./error-modal.js";
import { MessageModal } from "./message-modal.js";

export class PasswordResetModal extends AsyncFormModal {
  constructor() {
    super();
    console.log("[PasswordResetModal] Constructor called");
    this.errorModal = new ErrorModal();
    this.messageModal = new MessageModal();
    this.mode = 'self_reset'; // 'self_reset', 'expired_password', 'admin_reset'
    this.prefilledData = {};
    this._buildDOM();
  }

  /**
   * Show modal with specific mode and data
   * @param {Object} options - { username, subtenant, mode, adminToken }
   */
  show(options = {}) {
    this.mode = options.mode || 'self_reset';
    this.prefilledData = {
      username: options.username || '',
      subtenant: options.subtenant || localStorage.getItem('subtenant'),
      adminToken: options.adminToken || null
    };

    super.show();
    this._updateModalForMode();
    this._populateFields();
    this._focusFirstField();
  }

  _updateModalForMode() {
    const title = this.modalEl.querySelector('h2');

    switch (this.mode) {
      case 'expired_password':
        title.textContent = 'Password Expired - Reset Required';
        this._showExpiredPasswordForm();
        break;
      case 'admin_reset':
        title.textContent = 'Reset User Password (Admin)';
        this._showAdminResetForm();
        break;
      default:
        title.textContent = 'Reset Password';
        this._showSelfResetForm();
    }
  }

  _showSelfResetForm() {
    const formContent = this.modalEl.querySelector('#formContent');
    formContent.innerHTML = `
      <div class="password-reset-form-row">
        <div class="form-group">
          <label for="reset-username">Username</label>
          <input 
            type="text" 
            id="reset-username" 
            class="doc-input"
            placeholder="Enter your username"
            required 
            autocomplete="username"
          />
        </div>
        
        <div class="form-group">
          <label for="reset-current-password">Current Password</label>
          <input 
            type="password" 
            id="reset-current-password" 
            class="doc-input"
            placeholder="Enter your current password"
            required 
            autocomplete="current-password"
          />
          <div class="field-help">Required for security verification</div>
        </div>
      </div>
      
      <div class="password-reset-form-row">
        <div class="form-group">
          <label for="reset-new-password">New Password</label>
          <input 
            type="password" 
            id="reset-new-password" 
            class="doc-input"
            placeholder="Enter new password"
            required 
            autocomplete="new-password"
          />
          <div class="password-strength" id="password-strength"></div>
        </div>
        
        <div class="form-group">
          <label for="reset-confirm-password">Confirm New Password</label>
          <input 
            type="password" 
            id="reset-confirm-password" 
            class="doc-input"
            placeholder="Confirm new password"
            required 
            autocomplete="new-password"
          />
        </div>
      </div>
    `;

    this._addPasswordStrengthIndicator();
  }

  _showExpiredPasswordForm() {
    const formContent = this.modalEl.querySelector('#formContent');
    formContent.innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle"></i>
        <div>
          <p>Your password has expired and must be changed before you can continue.</p>
          <p><strong>Note:</strong> If you don't remember your current password, please contact your administrator to request a temporary password.</p>
        </div>
      </div>
      
      <div class="password-reset-form-row">
        <div class="form-group">
          <label for="reset-username">Username</label>
          <input 
            type="text" 
            id="reset-username" 
            class="doc-input readonly-field"
            readonly
          />
        </div>
        
        <div class="form-group">
          <label for="reset-current-password">Current Password</label>
          <input 
            type="password" 
            id="reset-current-password" 
            class="doc-input"
            placeholder="Enter your current password"
            required 
            autocomplete="current-password"
          />
        </div>
      </div>
      
      <div class="password-reset-form-row">
        <div class="form-group">
          <label for="reset-new-password">New Password</label>
          <input 
            type="password" 
            id="reset-new-password" 
            class="doc-input"
            placeholder="Enter new password"
            required 
            autocomplete="new-password"
          />
          <div class="password-strength" id="password-strength"></div>
        </div>
        
        <div class="form-group">
          <label for="reset-confirm-password">Confirm New Password</label>
          <input 
            type="password" 
            id="reset-confirm-password" 
            class="doc-input"
            placeholder="Confirm new password"
            required 
            autocomplete="new-password"
          />
        </div>
      </div>
    `;

    this._addPasswordStrengthIndicator();
  }

  _showAdminResetForm() {
    const formContent = this.modalEl.querySelector('#formContent');
    formContent.innerHTML = `
      <div class="alert alert-info">
        <i class="fas fa-info-circle"></i>
        <div>As an administrator, you can reset this user's password or generate a temporary password.</div>
      </div>
      
      <div class="form-group password-reset-form-group--full">
        <label for="reset-target-username">Target Username</label>
        <input 
          type="text" 
          id="reset-target-username" 
          class="doc-input"
          placeholder="Enter username to reset"
          required 
        />
      </div>
      
      <div class="form-group password-reset-form-group--full">
        <label>Reset Type</label>
        <div class="radio-group">
          <label>
            <input type="radio" name="resetType" value="temporary" checked />
            Generate temporary password (user must change on next login)
          </label>
          <label>
            <input type="radio" name="resetType" value="unlock" />
            Unlock account and optionally set new password
          </label>
        </div>
      </div>
      
      <div class="form-group password-reset-form-group--full" id="newPasswordGroup" style="display: none;">
        <label for="reset-new-password">New Password (Optional for unlock)</label>
        <input 
          type="password" 
          id="reset-new-password" 
          class="doc-input"
          placeholder="Leave blank to only unlock account"
          autocomplete="new-password"
        />
        <div class="password-strength" id="password-strength"></div>
      </div>
    `;

    // Add event listener for reset type change
    const radioButtons = formContent.querySelectorAll('input[name="resetType"]');
    const newPasswordGroup = formContent.querySelector('#newPasswordGroup');

    radioButtons.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === 'unlock') {
          newPasswordGroup.style.display = 'block';
          this._addPasswordStrengthIndicator();
        } else {
          newPasswordGroup.style.display = 'none';
        }
      });
    });
  }

  _addPasswordStrengthIndicator() {
    const passwordField = this.modalEl.querySelector("#reset-new-password");
    const strengthIndicator = this.modalEl.querySelector("#password-strength");

    if (!passwordField || !strengthIndicator) return;

    // Remove existing event listeners to prevent duplicates
    const newPasswordField = passwordField.cloneNode(true);
    passwordField.parentNode.replaceChild(newPasswordField, passwordField);

    newPasswordField.addEventListener("input", () => {
      const password = newPasswordField.value;
      const errors = this._validatePasswordStrength(password);

      if (password.length === 0) {
        strengthIndicator.innerHTML = '';
        return;
      }

      const strength = this._calculatePasswordStrength(password, errors);
      const strengthClass = strength >= 80 ? 'strong' : strength >= 60 ? 'medium' : 'weak';

      strengthIndicator.innerHTML = `
        <div class="strength-bar">
          <div class="strength-fill strength-${strengthClass}" style="width: ${strength}%"></div>
        </div>
        <div class="strength-text">Password strength: ${strengthClass.toUpperCase()}</div>
      `;
    });
  }

  _validatePasswordStrength(password) {
    const errors = [];

    if (password.length < 12) {
      errors.push("Password must be at least 12 characters long");
    }

    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (!/\d/.test(password)) {
      errors.push("Password must contain at least one digit");
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'\/~`]/.test(password)) {
      errors.push("Password must contain at least one special character");
    }

    return errors;
  }

  _calculatePasswordStrength(password, errors) {
    let strength = 0;

    if (password.length >= 12) strength += 25;
    else if (password.length >= 8) strength += 15;

    if (/[a-z]/.test(password)) strength += 15;
    if (/[A-Z]/.test(password)) strength += 15;
    if (/\d/.test(password)) strength += 15;
    if (/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'\/~`]/.test(password)) strength += 15;

    if (password.length >= 16) strength += 10;

    strength -= errors.length * 15;

    return Math.max(0, Math.min(100, strength));
  }

  _populateFields() {
    if (this.prefilledData.username) {
      const usernameField = this.modalEl.querySelector('#reset-username') ||
        this.modalEl.querySelector('#reset-target-username');
      if (usernameField) {
        usernameField.value = this.prefilledData.username;
      }
    }
  }

  _focusFirstField() {
    const firstInput = this.modalEl.querySelector('input:not([readonly]):not([disabled])');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }

  _buildDOM() {
    if (!this.overlayEl) {
      this._buildOverlay();
    }
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal modal--password-reset";
    this.modalEl.id = "passwordResetModal";

    this.modalEl.innerHTML = `
      <button class="modal__close" aria-label="Close password reset modal">&times;</button>
      <h2>Reset Password</h2>
      <form id="passwordResetForm" class="async-form password-reset-form">
        <div class="password-reset-content">
          <div class="password-reset-main">
            <div id="formContent">
              <!-- Dynamic content based on mode -->
            </div>

            <div class="inline-error" id="resetError" style="display:none;"></div>
            
            <div class="button-group">
              <button type="button" class="btn" id="reset-cancel">
                Cancel
              </button>
              <button type="submit" class="btn btn--primary" id="reset-submit">
                Reset Password
              </button>
            </div>
          </div>
          
          <div class="password-reset-sidebar">
            <div class="password-requirements">
              <strong>Password Requirements:</strong>
              <ul>
                <li>At least 12 characters long</li>
                <li>Contains uppercase and lowercase letters</li>
                <li>Contains at least one number</li>
                <li>Contains at least one special character</li>
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
      console.log("[PasswordResetModal] Close button clicked");
      this.hide();
    });

    // Cancel button
    const cancelBtn = this.modalEl.querySelector("#reset-cancel");
    cancelBtn.addEventListener("click", () => {
      console.log("[PasswordResetModal] Cancel button clicked");
      this.hide();
    });

    // Form submission
    const resetForm = this.modalEl.querySelector("#passwordResetForm");
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this._handleFormSubmission();
    });
  }

  async _handleFormSubmission() {
    console.log("[PasswordResetModal] Form submitted, mode:", this.mode);
    this._clearErrors();
    this.lockFields();
    this.lockButtons();

    try {
      let result;

      switch (this.mode) {
        case 'self_reset':
        case 'expired_password':
          result = await this._handleSelfReset();
          break;
        case 'admin_reset':
          result = await this._handleAdminReset();
          break;
        default:
          throw new Error('Invalid reset mode');
      }

      if (result && (result.success || result.message || result.temporary_password)) {
        this.hide();

        if (result.temporary_password) {
          this.messageModal.show({
            title: "Password Reset Successful",
            message: `
              <div class="temp-password-result">
                <p>A temporary password has been generated:</p>
                <div class="temp-password-display">
                  <code>${result.temporary_password}</code>
                  <button type="button" class="copy-btn" onclick="navigator.clipboard.writeText('${result.temporary_password}')">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
                <p><strong>Important:</strong> The user must change this password on their next login.</p>
              </div>
            `
          });
        } else {
          this.messageModal.show({
            title: "Password Reset Successful",
            message: result.message || "Password has been reset successfully. You can now log in with your new password."
          });
        }

        // If this was an expired password reset, automatically redirect to login
        if (this.mode === 'expired_password') {
          setTimeout(() => {
            // Dispatch event to trigger login modal or page refresh
            document.dispatchEvent(new CustomEvent('passwordResetComplete', {
              detail: { username: this.prefilledData.username }
            }));
          }, 2000);
        }
      }

    } catch (error) {
      console.error("[PasswordResetModal] Reset failed:", error);

      // Enhanced error handling using the same patterns as LoginModal
      if (error.response && error.response.error_code) {
        this._showEnhancedError(error);
      } else if (error.status === 401) {
        this._showError("Authentication failed. Please check your current password.");
      } else if (error.status === 403) {
        this._showError("You do not have permission to perform this action.");
      } else if (error.status === 429) {
        this._showError("Too many reset attempts. Please wait before trying again.");
      } else {
        this._showError(error.message || "Password reset failed. Please try again.");
      }
    } finally {
      this.unlockFields();
      this.unlockButtons();
    }
  }

  async _handleSelfReset() {
    const username = this.modalEl.querySelector('#reset-username').value.trim();
    const currentPassword = this.modalEl.querySelector('#reset-current-password').value;
    const newPassword = this.modalEl.querySelector('#reset-new-password').value;
    const confirmPassword = this.modalEl.querySelector('#reset-confirm-password').value;

    // Validation
    if (!username || !currentPassword || !newPassword || !confirmPassword) {
      throw new Error("All fields are required");
    }

    if (newPassword !== confirmPassword) {
      throw new Error("New passwords don't match");
    }

    const passwordErrors = this._validatePasswordStrength(newPassword);
    if (passwordErrors.length > 0) {
      throw new Error("Password requirements not met: " + passwordErrors.join(", "));
    }

    // Use the enhanced resetPassword function from api/auth.js
    return await resetPassword({
      type: 'user_reset',
      username: username,
      current_password: currentPassword,
      new_password: newPassword,
      subtenant: this.prefilledData.subtenant
    });
  }

  async _handleAdminReset() {
    const targetUsername = this.modalEl.querySelector('#reset-target-username').value.trim();
    const resetType = this.modalEl.querySelector('input[name="resetType"]:checked').value;
    const newPassword = this.modalEl.querySelector('#reset-new-password')?.value || '';

    if (!targetUsername) {
      throw new Error("Target username is required");
    }

    if (resetType === 'unlock' && newPassword) {
      const passwordErrors = this._validatePasswordStrength(newPassword);
      if (passwordErrors.length > 0) {
        throw new Error("Password requirements not met: " + passwordErrors.join(", "));
      }
    }

    // Prepare the reset data
    const resetData = {
      type: 'admin_reset',
      target_username: targetUsername,
      reset_type: resetType,
      subtenant: this.prefilledData.subtenant
    };

    // Add new password if provided
    if (newPassword) {
      resetData.new_password = newPassword;
    }

    // Use the enhanced resetPassword function from api/auth.js
    return await resetPassword(resetData);
  }

  _clearErrors() {
    const errorEl = this.modalEl.querySelector("#resetError");
    errorEl.style.display = "none";
    errorEl.innerHTML = "";
    errorEl.className = "inline-error";
  }

  _showError(message) {
    const errorEl = this.modalEl.querySelector("#resetError");
    errorEl.textContent = message;
    errorEl.className = "inline-error";
    errorEl.style.display = "block";
  }

  _showEnhancedError(error) {
    const errorEl = this.modalEl.querySelector("#resetError");
    const errorCode = error.response?.error_code;

    switch (errorCode) {
      case 'PASSWORD_EXPIRED':
        errorEl.innerHTML = `
          <div class="security-error">
            <i class="fas fa-clock"></i>
            <strong>Password Expired</strong>
            <p>${error.message}</p>
          </div>
        `;
        break;

      case 'ACCOUNT_LOCKED':
        errorEl.innerHTML = `
          <div class="security-error">
            <i class="fas fa-lock"></i>
            <strong>Account Locked</strong>
            <p>${error.message}</p>
            <p>Please contact your administrator to unlock your account.</p>
          </div>
        `;
        break;

      case 'INVALID_CURRENT_PASSWORD':
        errorEl.innerHTML = `
          <div class="security-error">
            <i class="fas fa-key"></i>
            <strong>Invalid Current Password</strong>
            <p>The current password you entered is incorrect.</p>
          </div>
        `;
        break;

      case 'PASSWORD_POLICY_VIOLATION':
        errorEl.innerHTML = `
          <div class="security-error">
            <i class="fas fa-shield-alt"></i>
            <strong>Password Policy Violation</strong>
            <p>${error.message}</p>
          </div>
        `;
        break;

      default:
        errorEl.innerHTML = `
          <div class="security-error">
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Reset Failed</strong>
            <p>${error.message}</p>
          </div>
        `;
    }

    errorEl.className = "inline-error security";
    errorEl.style.display = "block";
  }
}