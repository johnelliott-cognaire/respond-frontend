/**
 * frontend/spa/utils/validation-utils.js
 * 
 * Client-side validation utilities matching backend password_utils.py rules
 */

export class ValidationUtils {
  // Password validation constants matching backend
  static PASSWORD_MIN_LENGTH = 12;
  static PASSWORD_MAX_LENGTH = 128;

  // Username validation constants
  static USERNAME_MIN_LENGTH = 3;
  static USERNAME_MAX_LENGTH = 50;

  // Common weak passwords (matching Python backend)
  static COMMON_PASSWORDS = new Set([
    'password123!',
    'welcome123!',
    'admin1234!',
    'qwerty123!',
    'letmein123!',
    'summer2022!',
    'summer2023!',
    'summer2024!',
    'summer2025!',
    'winter2023#',
    'october2020$',
    'monkey123!',
    'football123!',
    'dragon123!',
    'sunshine123#',
    'password2023$',
    'password2024$',
    'password2025$',
    'iloveyou123!',
    'adminaccess1#',
    'trustno1@2022',
    'trustno1@2023',
    'trustno1@2024',
    'trustno1@2025',
    'changemenow1!'
  ]);

  /**
   * Validate password strength and return errors
   * @param {string} password - Password to validate
   * @param {string} username - Username to check against (optional)
   * @returns {Array<string>} Array of error messages
   */
  static validatePassword(password, username = null) {
    const errors = [];

    if (!password) {
      errors.push("Password is required");
      return errors;
    }

    // Length checks
    if (password.length < this.PASSWORD_MIN_LENGTH) {
      errors.push(`Password must be at least ${this.PASSWORD_MIN_LENGTH} characters long`);
    }

    if (password.length > this.PASSWORD_MAX_LENGTH) {
      errors.push(`Password must not exceed ${this.PASSWORD_MAX_LENGTH} characters`);
    }

    // Character type requirements
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

    // Check for username in password
    if (username && username.toLowerCase() && password.toLowerCase().includes(username.toLowerCase())) {
      errors.push("Password must not contain your username");
    }

    // Check against common passwords
    if (this.COMMON_PASSWORDS.has(password.toLowerCase())) {
      errors.push("Password is too common. Please choose a more unique password");
    }

    // Check for repeated characters (3 or more in a row)
    if (/(.)\1{2,}/.test(password)) {
      errors.push("Password must not contain 3 or more repeated characters in a row");
    }

    // Check for sequential characters and keyboard patterns
    if (this._hasSequentialChars(password)) {
      errors.push("Password must not contain sequential characters (e.g., 123, 321, abcd) or keyboard patterns (e.g., qwerty, asdf)");
    }

    return errors;
  }

  /**
   * Check for sequential characters and keyboard patterns in password
   * @private
   */
  static _hasSequentialChars(password) {
    const lower = password.toLowerCase();

    // Check for 3+ sequential numbers (both ascending and descending)
    for (let i = 0; i <= lower.length - 3; i++) {
      const slice = lower.slice(i, i + 3);
      if (/^\d{3}$/.test(slice)) {
        const nums = slice.split('').map(Number);
        // Check ascending (123)
        if (nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1) {
          return true;
        }
        // Check descending (321)
        if (nums[1] === nums[0] - 1 && nums[2] === nums[1] - 1) {
          return true;
        }
      }
    }

    // Check for 4+ ascending sequential letters only
    for (let i = 0; i <= lower.length - 4; i++) {
      const slice = lower.slice(i, i + 4);
      if (/^[a-z]{4}$/.test(slice)) {
        const codes = slice.split('').map(c => c.charCodeAt(0));
        if (codes[1] === codes[0] + 1 && codes[2] === codes[1] + 1 && codes[3] === codes[2] + 1) {
          return true;
        }
      }
    }

    // Check for keyboard patterns (actual keyboard layout sequences)
    const keyboardPatterns = [
      'qwerty', 'qwertyui', 'qwertyuio', 'qwertyuiop',
      'asdf', 'asdfg', 'asdfgh', 'asdfghj', 'asdfghjk', 'asdfghjkl',
      'zxcv', 'zxcvb', 'zxcvbn', 'zxcvbnm',
      'qazwsx', 'qazwsxedc', 'qweasd', 'qweasdzxc',
      'plmokn', 'plmoknijb', 'lkjhgf', 'lkjhgfds',
      'mnbvcx', 'mnbvcxz', 'poiuyt', 'poiuytr'
    ];

    for (const pattern of keyboardPatterns) {
      if (lower.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate password strength score
   * @param {string} password - Password to evaluate
   * @returns {Object} { score: 0-100, level: 'weak'|'medium'|'strong' }
   */
  static calculatePasswordStrength(password) {
    let score = 0;
    const errors = this.validatePassword(password);

    // Base score from length
    if (password.length >= 12) score += 25;
    else if (password.length >= 8) score += 15;

    // Character variety
    if (/[a-z]/.test(password)) score += 15;
    if (/[A-Z]/.test(password)) score += 15;
    if (/\d/.test(password)) score += 15;
    if (/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'\/~`]/.test(password)) score += 15;

    // Bonus for extra length
    if (password.length >= 16) score += 10;
    if (password.length >= 20) score += 5;

    // Deduct for errors
    score -= errors.length * 15;

    // Cap between 0 and 100
    score = Math.max(0, Math.min(100, score));

    // Determine level
    let level = 'weak';
    if (score >= 80) level = 'strong';
    else if (score >= 60) level = 'medium';

    return { score, level };
  }

  /**
   * Validate username format
   * @param {string} username - Username to validate
   * @returns {Array<string>} Array of error messages
   */
  static validateUsername(username) {
    const errors = [];

    if (!username) {
      errors.push("Username is required");
      return errors;
    }

    if (username.length < this.USERNAME_MIN_LENGTH || username.length > this.USERNAME_MAX_LENGTH) {
      errors.push(`Username must be between ${this.USERNAME_MIN_LENGTH} and ${this.USERNAME_MAX_LENGTH} characters`);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push("Username can only contain letters, numbers, underscores, and hyphens");
    }

    const reserved = ['admin', 'root', 'system', 'api', 'test', 'guest', 'null', 'undefined'];
    if (reserved.includes(username.toLowerCase())) {
      errors.push("Username is reserved and cannot be used");
    }

    return errors;
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {Array<string>} Array of error messages
   */
  static validateEmail(email) {
    const errors = [];

    if (!email) {
      errors.push("Email address is required");
      return errors;
    }

    if (email.length > 320) {
      errors.push("Email address is too long");
      return errors;
    }

    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(email)) {
      errors.push("Email address format is invalid");
    }

    // Check for common typos
    const domain = email.split('@')[1]?.toLowerCase();
    const typoSuggestions = {
      'gmial.com': 'gmail.com',
      'gmai.com': 'gmail.com',
      'yahooo.com': 'yahoo.com',
      'hotmial.com': 'hotmail.com'
    };

    if (domain && typoSuggestions[domain]) {
      errors.push(`Did you mean ${email.split('@')[0]}@${typoSuggestions[domain]}?`);
    }

    return errors;
  }

  /**
   * Create a real-time validation component
   * @param {HTMLElement} inputElement - Input element to validate
   * @param {string} validationType - Type of validation ('password', 'username', 'email')
   * @param {Object} options - Additional options
   * @returns {Object} Validation component with update and destroy methods
   */
  static createRealtimeValidator(inputElement, validationType, options = {}) {
    const feedbackElement = document.createElement('div');
    feedbackElement.className = 'validation-feedback';

    // Insert feedback element after the input or its container
    const container = inputElement.closest('.form-group') || inputElement.parentElement;
    const nextSibling = inputElement.nextSibling;

    // Find where to insert the feedback
    if (inputElement.parentElement.classList.contains('password-input-group')) {
      // For password fields with toggle button, insert after the container
      inputElement.parentElement.insertAdjacentElement('afterend', feedbackElement);
    } else if (nextSibling && nextSibling.classList && nextSibling.classList.contains('field-help')) {
      // Insert after field-help if it exists
      nextSibling.insertAdjacentElement('afterend', feedbackElement);
    } else {
      // Otherwise insert directly after the input
      inputElement.insertAdjacentElement('afterend', feedbackElement);
    }

    let debounceTimer = null;

    const validate = () => {
      const value = inputElement.value;
      let errors = [];

      switch (validationType) {
        case 'password':
          errors = this.validatePassword(value, options.username);
          break;
        case 'username':
          errors = this.validateUsername(value);
          break;
        case 'email':
          errors = this.validateEmail(value);
          break;
      }

      // Update UI
      if (value && errors.length > 0) {
        feedbackElement.className = 'validation-feedback validation-feedback--error';
        feedbackElement.innerHTML = `
          <ul class="validation-errors-list">
            ${errors.map(err => `<li>${err}</li>`).join('')}
          </ul>
        `;
        inputElement.classList.add('input--error');
        inputElement.classList.remove('input--valid');
      } else if (value && errors.length === 0) {
        feedbackElement.className = 'validation-feedback validation-feedback--success';
        feedbackElement.innerHTML = '<i class="fas fa-check-circle"></i> Valid';
        inputElement.classList.add('input--valid');
        inputElement.classList.remove('input--error');
      } else {
        feedbackElement.innerHTML = '';
        inputElement.classList.remove('input--error', 'input--valid');
      }

      // For password fields, also update strength indicator if present
      if (validationType === 'password' && options.strengthIndicator) {
        const strength = this.calculatePasswordStrength(value);
        if (value) {
          options.strengthIndicator.innerHTML = `
            <div class="strength-bar">
              <div class="strength-fill strength-${strength.level}" style="width: ${strength.score}%"></div>
            </div>
            <div class="strength-text">Password strength: ${strength.level.toUpperCase()}</div>
          `;
        } else {
          options.strengthIndicator.innerHTML = '';
        }
      }

      return errors;
    };

    const handleInput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(validate, 300);
    };

    inputElement.addEventListener('input', handleInput);
    inputElement.addEventListener('blur', validate);

    return {
      validate,
      destroy: () => {
        inputElement.removeEventListener('input', handleInput);
        inputElement.removeEventListener('blur', validate);
        feedbackElement.remove();
        clearTimeout(debounceTimer);
      },
      updateOptions: (newOptions) => {
        Object.assign(options, newOptions);
        validate();
      }
    };
  }
}