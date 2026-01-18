// ========================================
// AUTHENTICATION UTILITIES
// ========================================

/**
 * Password validation configuration
 */
export const PASSWORD_CONFIG = {
  minLength: 8,
  requireSpecialChar: true,
  requireNumber: false,
  requireUppercase: false,
  hashAlgorithm: 'SHA-256',
  saltLength: 16
};

/**
 * Validates password against security requirements
 * @param {string} password - The password to validate
 * @returns {ValidationResult} - Validation result with success flag and messages
 */
export function validatePassword(password) {
  const errors = [];
  
  if (!password || password.length < PASSWORD_CONFIG.minLength) {
    errors.push(`Password must be at least ${PASSWORD_CONFIG.minLength} characters long`);
  }
  
  if (PASSWORD_CONFIG.requireSpecialChar) {
    const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
    if (!specialCharRegex.test(password)) {
      errors.push('Password must contain at least one special character');
    }
  }
  
  if (PASSWORD_CONFIG.requireNumber) {
    const numberRegex = /\d/;
    if (!numberRegex.test(password)) {
      errors.push('Password must contain at least one number');
    }
  }
  
  if (PASSWORD_CONFIG.requireUppercase) {
    const uppercaseRegex = /[A-Z]/;
    if (!uppercaseRegex.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password)
  };
}

/**
 * Calculates password strength score (0-100)
 * @param {string} password - The password to evaluate
 * @returns {number} - Strength score from 0 to 100
 */
function calculatePasswordStrength(password) {
  if (!password) return 0;
  
  let score = 0;
  
  // Length bonus
  score += Math.min(password.length * 4, 25);
  
  // Character variety bonuses
  if (/[a-z]/.test(password)) score += 5;
  if (/[A-Z]/.test(password)) score += 5;
  if (/\d/.test(password)) score += 5;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 10;
  
  // Length bonuses
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 15;
  if (password.length >= 16) score += 20;
  
  // Penalty for common patterns
  if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated characters
  if (/123|abc|qwe/i.test(password)) score -= 10; // Sequential patterns
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Generates a cryptographically secure salt
 * @returns {string} - Base64 encoded salt
 */
export function generateSalt() {
  const array = new Uint8Array(PASSWORD_CONFIG.saltLength);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Hashes a password with salt using Web Crypto API
 * @param {string} password - The password to hash
 * @param {string} salt - The salt to use
 * @returns {Promise<string>} - Base64 encoded hash
 */
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  
  const hashBuffer = await crypto.subtle.digest(PASSWORD_CONFIG.hashAlgorithm, data);
  const hashArray = new Uint8Array(hashBuffer);
  
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Verifies a password against a stored hash
 * @param {string} password - The password to verify
 * @param {string} storedHash - The stored hash
 * @param {string} salt - The salt used for hashing
 * @returns {Promise<boolean>} - True if password matches
 */
export async function verifyPassword(password, storedHash, salt) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === storedHash;
}

/**
 * Determines if an identifier is an email or phone number
 * @param {string} identifier - The identifier to check
 * @returns {'email'|'phone'|'unknown'} - The type of identifier
 */
export function getIdentifierType(identifier) {
  if (!identifier) return 'unknown';
  
  // Email pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(identifier)) {
    return 'email';
  }
  
  // Phone pattern (basic - supports various formats)
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  const cleanPhone = identifier.replace(/[\s\-\(\)\.]/g, '');
  if (phoneRegex.test(cleanPhone)) {
    return 'phone';
  }
  
  return 'unknown';
}

/**
 * Normalizes phone numbers for consistent storage and comparison
 * @param {string} phone - The phone number to normalize
 * @returns {string} - Normalized phone number
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // If it starts with +, keep it, otherwise assume it's a domestic number
  if (!normalized.startsWith('+')) {
    // For US numbers, add +1 if it's 10 digits
    if (normalized.length === 10) {
      normalized = '+1' + normalized;
    }
  }
  
  return normalized;
}

/**
 * Authentication service class
 */
export class AuthenticationService {
  constructor(apiCall) {
    this.apiCall = apiCall;
  }
  
  /**
   * Registers a new user with password
   * @param {Object} userData - User registration data
   * @param {string} userData.name - User's full name
   * @param {string} userData.email - User's email address
   * @param {string} userData.phone - User's phone number
   * @param {string} userData.password - User's password
   * @returns {Promise<AuthResult>} - Registration result
   */
  async register(userData) {
    try {
      // Validate password
      const passwordValidation = validatePassword(userData.password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: passwordValidation.errors.join('. ')
        };
      }
      
      // Generate salt and hash password
      const salt = generateSalt();
      const passwordHash = await hashPassword(userData.password, salt);
      
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(userData.phone);
      
      // Call backend registration
      const result = await this.apiCall('register', {
        name: userData.name,
        email: userData.email.toLowerCase().trim(),
        phone: normalizedPhone,
        passwordHash,
        salt
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Registration failed'
      };
    }
  }
  
  /**
   * Logs in a user with email/phone and password
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.identifier - Email or phone number
   * @param {string} credentials.password - User's password
   * @returns {Promise<AuthResult>} - Login result
   */
  async login(credentials) {
    try {
      const identifierType = getIdentifierType(credentials.identifier);
      
      if (identifierType === 'unknown') {
        return {
          success: false,
          error: 'Please enter a valid email address or phone number'
        };
      }
      
      // Normalize identifier
      let normalizedIdentifier = credentials.identifier.trim();
      if (identifierType === 'email') {
        normalizedIdentifier = normalizedIdentifier.toLowerCase();
      } else if (identifierType === 'phone') {
        normalizedIdentifier = normalizePhoneNumber(normalizedIdentifier);
      }
      
      // Call backend login
      const result = await this.apiCall('login', {
        identifier: normalizedIdentifier,
        identifierType,
        password: credentials.password
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: 'Invalid login credentials'
      };
    }
  }
  
  /**
   * Requests a password reset
   * @param {string} identifier - Email or phone number
   * @returns {Promise<ResetResult>} - Reset request result
   */
  async requestPasswordReset(identifier) {
    try {
      const identifierType = getIdentifierType(identifier);
      
      if (identifierType === 'unknown') {
        return {
          success: false,
          error: 'Please enter a valid email address or phone number'
        };
      }
      
      // Normalize identifier
      let normalizedIdentifier = identifier.trim();
      if (identifierType === 'email') {
        normalizedIdentifier = normalizedIdentifier.toLowerCase();
      } else if (identifierType === 'phone') {
        normalizedIdentifier = normalizePhoneNumber(normalizedIdentifier);
      }
      
      const result = await this.apiCall('requestPasswordReset', {
        identifier: normalizedIdentifier,
        identifierType
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Password reset request failed'
      };
    }
  }
  
  /**
   * Resets password with token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<ResetResult>} - Reset result
   */
  async resetPassword(token, newPassword) {
    try {
      // Validate new password
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: passwordValidation.errors.join('. ')
        };
      }
      
      // Generate new salt and hash
      const salt = generateSalt();
      const passwordHash = await hashPassword(newPassword, salt);
      
      const result = await this.apiCall('resetPassword', {
        token,
        passwordHash,
        salt
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Password reset failed'
      };
    }
  }
}