// ========================================
// MIGRATION SERVICE
// ========================================

/**
 * Migration service for handling data migration from Moodly to FitMood
 */
export class MigrationService {
  constructor() {
    this.oldPrefix = 'moodly_';
    this.newPrefix = 'fitmood_';
    this.migrationKey = 'fitmood_migration_status';
  }
  
  /**
   * Checks if migration has already been completed
   * @returns {boolean} - True if migration is complete
   */
  isMigrationComplete() {
    return localStorage.getItem(this.migrationKey) === 'completed';
  }
  
  /**
   * Migrates all localStorage keys from moodly_ to fitmood_ prefix
   * @returns {Promise<MigrationResult>} - Migration result
   */
  async migrateStorageKeys() {
    try {
      if (this.isMigrationComplete()) {
        return {
          success: true,
          migratedKeys: [],
          message: 'Migration already completed'
        };
      }
      
      const migratedKeys = [];
      const errors = [];
      
      // Get all localStorage keys that start with old prefix
      const keysToMigrate = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.oldPrefix)) {
          keysToMigrate.push(key);
        }
      }
      
      // Migrate each key
      for (const oldKey of keysToMigrate) {
        try {
          const value = localStorage.getItem(oldKey);
          if (value !== null) {
            const newKey = oldKey.replace(this.oldPrefix, this.newPrefix);
            
            // Check if new key already exists
            if (localStorage.getItem(newKey) !== null) {
              console.warn(`Key ${newKey} already exists, skipping migration of ${oldKey}`);
              continue;
            }
            
            // Migrate the data
            localStorage.setItem(newKey, value);
            migratedKeys.push({ oldKey, newKey });
          }
        } catch (error) {
          errors.push(`Failed to migrate ${oldKey}: ${error.message}`);
        }
      }
      
      // Mark migration as complete
      localStorage.setItem(this.migrationKey, 'completed');
      localStorage.setItem(`${this.newPrefix}migration_date`, new Date().toISOString());
      
      return {
        success: true,
        migratedKeys,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully migrated ${migratedKeys.length} keys`
      };
    } catch (error) {
      return {
        success: false,
        migratedKeys: [],
        errors: [error.message],
        message: 'Migration failed'
      };
    }
  }
  
  /**
   * Cleans up old localStorage keys after successful migration
   * @returns {CleanupResult} - Cleanup result
   */
  cleanupOldKeys() {
    try {
      if (!this.isMigrationComplete()) {
        return {
          success: false,
          message: 'Cannot cleanup - migration not completed',
          cleanedKeys: []
        };
      }
      
      const cleanedKeys = [];
      const keysToDelete = [];
      
      // Find all old keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.oldPrefix)) {
          keysToDelete.push(key);
        }
      }
      
      // Delete old keys
      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
        cleanedKeys.push(key);
      });
      
      return {
        success: true,
        cleanedKeys,
        message: `Cleaned up ${cleanedKeys.length} old keys`
      };
    } catch (error) {
      return {
        success: false,
        cleanedKeys: [],
        message: `Cleanup failed: ${error.message}`
      };
    }
  }
  
  /**
   * Prompts existing users to set up a password
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} - True if user needs password setup
   */
  async promptPasswordSetup(userId) {
    try {
      const passwordSetupKey = `${this.newPrefix}password_setup_${userId}`;
      const setupStatus = localStorage.getItem(passwordSetupKey);
      
      if (setupStatus === 'completed') {
        return false; // No prompt needed
      }
      
      // Check if user exists in new system with password
      const userKey = `${this.newPrefix}user`;
      const userData = localStorage.getItem(userKey);
      
      if (userData) {
        const user = JSON.parse(userData);
        if (user.userId === userId && user.hasPassword) {
          // Mark as completed
          localStorage.setItem(passwordSetupKey, 'completed');
          return false;
        }
      }
      
      // Check if this is a migrated user (has old data but no password)
      const migrationComplete = this.isMigrationComplete();
      if (migrationComplete) {
        // Check if user has any migrated data
        const hasMigratedData = this.checkForMigratedUserData(userId);
        if (hasMigratedData) {
          return true; // This is a migrated user who needs password setup
        }
      }
      
      return false; // New user, no prompt needed
    } catch (error) {
      console.error('Error checking password setup status:', error);
      return false; // Default to not showing prompt on error
    }
  }
  
  /**
   * Checks if user has migrated data
   * @param {string} userId - User ID
   * @returns {boolean} - True if user has migrated data
   */
  checkForMigratedUserData(userId) {
    try {
      // Check for common user data keys that would indicate a migrated user
      const commonKeys = ['user', 'dark_mode', 'habits', 'custom_emojis'];
      
      for (const key of commonKeys) {
        const newKey = `${this.newPrefix}${key}`;
        const value = localStorage.getItem(newKey);
        
        if (value) {
          // If it's user data, check if it matches the userId
          if (key === 'user') {
            try {
              const userData = JSON.parse(value);
              if (userData.userId === userId) {
                return true;
              }
            } catch (e) {
              // Ignore parse errors
            }
          } else {
            // Other data exists, likely migrated
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking for migrated user data:', error);
      return false;
    }
  }
  
  /**
   * Marks password setup as completed for a user
   * @param {string} userId - User ID
   */
  markPasswordSetupComplete(userId) {
    const passwordSetupKey = `${this.newPrefix}password_setup_${userId}`;
    localStorage.setItem(passwordSetupKey, 'completed');
  }
  
  /**
   * Gets migration statistics
   * @returns {MigrationStats} - Migration statistics
   */
  getMigrationStats() {
    const isComplete = this.isMigrationComplete();
    const migrationDate = localStorage.getItem(`${this.newPrefix}migration_date`);
    
    // Count current keys with each prefix
    let oldKeysCount = 0;
    let newKeysCount = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        if (key.startsWith(this.oldPrefix)) {
          oldKeysCount++;
        } else if (key.startsWith(this.newPrefix)) {
          newKeysCount++;
        }
      }
    }
    
    return {
      isComplete,
      migrationDate: migrationDate ? new Date(migrationDate) : null,
      oldKeysCount,
      newKeysCount,
      needsCleanup: isComplete && oldKeysCount > 0
    };
  }
  
  /**
   * Performs a complete migration workflow
   * @returns {Promise<MigrationWorkflowResult>} - Complete migration result
   */
  async performCompleteMigration() {
    try {
      // Step 1: Migrate keys
      const migrationResult = await this.migrateStorageKeys();
      
      if (!migrationResult.success) {
        return {
          success: false,
          step: 'migration',
          error: migrationResult.errors?.[0] || 'Migration failed',
          migrationResult
        };
      }
      
      // Step 2: Clean up old keys (optional, can be done later)
      const cleanupResult = this.cleanupOldKeys();
      
      return {
        success: true,
        step: 'complete',
        migrationResult,
        cleanupResult,
        message: 'Migration completed successfully'
      };
    } catch (error) {
      return {
        success: false,
        step: 'error',
        error: error.message,
        message: 'Migration workflow failed'
      };
    }
  }
  
  /**
   * Validates data integrity after migration
   * @returns {ValidationResult} - Validation result
   */
  validateMigration() {
    try {
      const issues = [];
      const stats = this.getMigrationStats();
      
      if (!stats.isComplete) {
        issues.push('Migration not marked as complete');
      }
      
      if (stats.oldKeysCount > 0 && stats.newKeysCount === 0) {
        issues.push('Old keys exist but no new keys found');
      }
      
      // Check critical keys
      const criticalKeys = ['user', 'dark_mode'];
      for (const key of criticalKeys) {
        const oldKey = this.oldPrefix + key;
        const newKey = this.newPrefix + key;
        
        const oldValue = localStorage.getItem(oldKey);
        const newValue = localStorage.getItem(newKey);
        
        if (oldValue && !newValue) {
          issues.push(`Critical key ${key} not migrated properly`);
        }
      }
      
      return {
        isValid: issues.length === 0,
        issues,
        stats
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [`Validation error: ${error.message}`],
        stats: null
      };
    }
  }
}

/**
 * Global migration service instance
 */
export const migrationService = new MigrationService();

/**
 * Utility function to get the appropriate storage key
 * @param {string} key - The key without prefix
 * @returns {string} - The key with appropriate prefix
 */
export function getStorageKey(key) {
  const service = new MigrationService();
  return service.newPrefix + key;
}

/**
 * Utility function to safely get item from localStorage with migration support
 * @param {string} key - The key without prefix
 * @returns {string|null} - The stored value or null
 */
export function getStorageItem(key) {
  const service = new MigrationService();
  const newKey = service.newPrefix + key;
  const oldKey = service.oldPrefix + key;
  
  // Try new key first
  let value = localStorage.getItem(newKey);
  
  // If not found and migration not complete, try old key
  if (value === null && !service.isMigrationComplete()) {
    value = localStorage.getItem(oldKey);
    
    // If found in old key, migrate it
    if (value !== null) {
      localStorage.setItem(newKey, value);
    }
  }
  
  return value;
}

/**
 * Utility function to safely set item in localStorage with new prefix
 * @param {string} key - The key without prefix
 * @param {string} value - The value to store
 */
export function setStorageItem(key, value) {
  const service = new MigrationService();
  const newKey = service.newPrefix + key;
  localStorage.setItem(newKey, value);
}