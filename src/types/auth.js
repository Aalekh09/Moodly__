// ========================================
// AUTHENTICATION TYPES AND INTERFACES
// ========================================

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the validation passed
 * @property {string[]} errors - Array of validation error messages
 * @property {number} strength - Password strength score (0-100)
 */

/**
 * @typedef {Object} AuthResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {UserData} [user] - User data if successful
 * @property {string} [error] - Error message if failed
 * @property {string} [token] - Authentication token if applicable
 */

/**
 * @typedef {Object} ResetResult
 * @property {boolean} success - Whether the reset operation succeeded
 * @property {string} [message] - Success or error message
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} UserData
 * @property {string} userId - Unique user identifier
 * @property {string} name - User's full name
 * @property {string} email - User's email address
 * @property {string} phone - User's phone number
 * @property {'user'|'admin'} role - User's role
 * @property {string} createdAt - ISO date string of account creation
 * @property {string} [lastLogin] - ISO date string of last login
 * @property {'pending'|'completed'} [migrationStatus] - Migration status for existing users
 */

/**
 * @typedef {Object} EnhancedUser
 * @property {string} userId - Unique user identifier
 * @property {string} name - User's full name
 * @property {string} email - User's email address
 * @property {string} phone - User's phone number
 * @property {string} passwordHash - Hashed password
 * @property {string} salt - Password salt
 * @property {'user'|'admin'} role - User's role
 * @property {string} createdAt - ISO date string of account creation
 * @property {string} [lastLogin] - ISO date string of last login
 * @property {string} [passwordResetToken] - Password reset token
 * @property {string} [passwordResetExpiry] - Password reset token expiry
 * @property {'pending'|'completed'} [migrationStatus] - Migration status
 */

/**
 * @typedef {Object} PasswordSecurity
 * @property {number} minLength - Minimum password length
 * @property {boolean} requireSpecialChar - Whether special characters are required
 * @property {boolean} requireNumber - Whether numbers are required
 * @property {boolean} requireUppercase - Whether uppercase letters are required
 * @property {string} hashAlgorithm - Hashing algorithm to use
 * @property {number} saltLength - Length of salt in bytes
 */

/**
 * @typedef {Object} MigrationResult
 * @property {boolean} success - Whether migration succeeded
 * @property {Array<{oldKey: string, newKey: string}>} migratedKeys - Keys that were migrated
 * @property {string[]} [errors] - Any errors that occurred
 * @property {string} message - Result message
 */

/**
 * @typedef {Object} CleanupResult
 * @property {boolean} success - Whether cleanup succeeded
 * @property {string[]} cleanedKeys - Keys that were cleaned up
 * @property {string} message - Result message
 */

/**
 * @typedef {Object} MigrationStats
 * @property {boolean} isComplete - Whether migration is complete
 * @property {Date|null} migrationDate - When migration was completed
 * @property {number} oldKeysCount - Number of old keys remaining
 * @property {number} newKeysCount - Number of new keys present
 * @property {boolean} needsCleanup - Whether cleanup is needed
 */

/**
 * @typedef {Object} MigrationWorkflowResult
 * @property {boolean} success - Whether the workflow succeeded
 * @property {string} step - Current step in workflow
 * @property {string} [error] - Error message if failed
 * @property {MigrationResult} [migrationResult] - Migration step result
 * @property {CleanupResult} [cleanupResult] - Cleanup step result
 * @property {string} message - Workflow result message
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {string[]} issues - Validation issues found
 * @property {MigrationStats|null} stats - Migration statistics
 */

/**
 * @typedef {Object} ContactInfo
 * @property {string} phone - Contact phone number
 * @property {ContactAddress} address - Business address
 * @property {string} [businessHours] - Business hours
 * @property {string} [email] - Contact email
 */

/**
 * @typedef {Object} ContactAddress
 * @property {string} street - Street address
 * @property {string} city - City
 * @property {string} state - State/Province
 * @property {string} zipCode - ZIP/Postal code
 * @property {string} country - Country
 */

/**
 * @typedef {Object} ContactDisplayProps
 * @property {ContactInfo} contactInfo - Contact information to display
 * @property {'light'|'dark'} theme - Theme mode
 */

/**
 * Authentication service interface
 * @interface AuthenticationService
 */
export const AuthenticationServiceInterface = {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.name - User's full name
   * @param {string} userData.email - User's email address
   * @param {string} userData.phone - User's phone number
   * @param {string} userData.password - User's password
   * @returns {Promise<AuthResult>} Registration result
   */
  register: async (userData) => {},
  
  /**
   * Login with email/phone and password
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.identifier - Email or phone number
   * @param {string} credentials.password - User's password
   * @returns {Promise<AuthResult>} Login result
   */
  login: async (credentials) => {},
  
  /**
   * Request password reset
   * @param {string} identifier - Email or phone number
   * @returns {Promise<ResetResult>} Reset request result
   */
  requestPasswordReset: async (identifier) => {},
  
  /**
   * Reset password with token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<ResetResult>} Reset result
   */
  resetPassword: async (token, newPassword) => {},
  
  /**
   * Validate password
   * @param {string} password - Password to validate
   * @returns {ValidationResult} Validation result
   */
  validatePassword: (password) => {}
};

/**
 * Migration service interface
 * @interface MigrationService
 */
export const MigrationServiceInterface = {
  /**
   * Migrate localStorage keys
   * @returns {Promise<MigrationResult>} Migration result
   */
  migrateStorageKeys: async () => {},
  
  /**
   * Prompt existing users to set password
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Whether prompt is needed
   */
  promptPasswordSetup: async (userId) => {},
  
  /**
   * Clean up old storage keys
   * @returns {void}
   */
  cleanupOldKeys: () => {}
};

// Export types for JSDoc usage
export const Types = {
  ValidationResult: 'ValidationResult',
  AuthResult: 'AuthResult',
  ResetResult: 'ResetResult',
  UserData: 'UserData',
  EnhancedUser: 'EnhancedUser',
  PasswordSecurity: 'PasswordSecurity',
  MigrationResult: 'MigrationResult',
  CleanupResult: 'CleanupResult',
  MigrationStats: 'MigrationStats',
  MigrationWorkflowResult: 'MigrationWorkflowResult',
  ContactInfo: 'ContactInfo',
  ContactAddress: 'ContactAddress',
  ContactDisplayProps: 'ContactDisplayProps'
};