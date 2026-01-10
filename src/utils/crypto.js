// ========================================
// WEB CRYPTO API INTEGRATION
// ========================================

/**
 * Checks if Web Crypto API is available
 * @returns {boolean} - True if Web Crypto API is supported
 */
export function isCryptoSupported() {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' && 
         typeof crypto.getRandomValues !== 'undefined';
}

/**
 * Generates cryptographically secure random bytes
 * @param {number} length - Number of bytes to generate
 * @returns {Uint8Array} - Random bytes
 * @throws {Error} - If crypto is not supported
 */
export function generateRandomBytes(length) {
  if (!isCryptoSupported()) {
    throw new Error('Web Crypto API is not supported in this environment');
  }
  
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Converts bytes to base64 string
 * @param {Uint8Array} bytes - Bytes to convert
 * @returns {string} - Base64 encoded string
 */
export function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Converts base64 string to bytes
 * @param {string} base64 - Base64 string to convert
 * @returns {Uint8Array} - Decoded bytes
 */
export function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a cryptographically secure random string
 * @param {number} length - Length of the string
 * @param {string} charset - Character set to use (default: alphanumeric)
 * @returns {string} - Random string
 */
export function generateRandomString(length, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const randomBytes = generateRandomBytes(length);
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += charset[randomBytes[i] % charset.length];
  }
  
  return result;
}

/**
 * Generates a secure token for password reset
 * @param {number} length - Token length (default: 32)
 * @returns {string} - Secure token
 */
export function generateSecureToken(length = 32) {
  return generateRandomString(length);
}

/**
 * Hashes data using SHA-256
 * @param {string} data - Data to hash
 * @returns {Promise<string>} - Base64 encoded hash
 */
export async function sha256Hash(data) {
  if (!isCryptoSupported()) {
    throw new Error('Web Crypto API is not supported in this environment');
  }
  
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  return bytesToBase64(hashArray);
}

/**
 * Derives a key from password using PBKDF2
 * @param {string} password - Password to derive from
 * @param {string} salt - Salt for key derivation
 * @param {number} iterations - Number of iterations (default: 100000)
 * @returns {Promise<string>} - Base64 encoded derived key
 */
export async function deriveKey(password, salt, iterations = 100000) {
  if (!isCryptoSupported()) {
    throw new Error('Web Crypto API is not supported in this environment');
  }
  
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = base64ToBytes(salt);
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 32 bytes
  );
  
  const derivedArray = new Uint8Array(derivedBits);
  return bytesToBase64(derivedArray);
}

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings are equal
 */
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Securely clears sensitive data from memory (best effort)
 * @param {string|Array} data - Data to clear
 */
export function secureClear(data) {
  if (typeof data === 'string') {
    // Can't actually clear strings in JavaScript, but we can try
    data = null;
  } else if (Array.isArray(data) || data instanceof Uint8Array) {
    // Clear array contents
    for (let i = 0; i < data.length; i++) {
      data[i] = 0;
    }
  }
}

/**
 * Validates that a string is a valid base64 encoding
 * @param {string} str - String to validate
 * @returns {boolean} - True if valid base64
 */
export function isValidBase64(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }
  
  try {
    return btoa(atob(str)) === str;
  } catch (err) {
    return false;
  }
}

/**
 * Creates a fingerprint of the current browser/device for additional security
 * @returns {Promise<string>} - Device fingerprint hash
 */
export async function createDeviceFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.platform,
    navigator.cookieEnabled.toString()
  ];
  
  const fingerprint = components.join('|');
  return await sha256Hash(fingerprint);
}

/**
 * Crypto utility class for centralized crypto operations
 */
export class CryptoUtils {
  constructor() {
    if (!isCryptoSupported()) {
      console.warn('Web Crypto API is not fully supported. Some security features may be limited.');
    }
  }
  
  /**
   * Generates a secure salt
   * @param {number} length - Salt length in bytes
   * @returns {string} - Base64 encoded salt
   */
  generateSalt(length = 16) {
    const bytes = generateRandomBytes(length);
    return bytesToBase64(bytes);
  }
  
  /**
   * Hashes password with salt
   * @param {string} password - Password to hash
   * @param {string} salt - Salt to use
   * @returns {Promise<string>} - Base64 encoded hash
   */
  async hashPassword(password, salt) {
    return await sha256Hash(password + salt);
  }
  
  /**
   * Verifies password against hash
   * @param {string} password - Password to verify
   * @param {string} hash - Stored hash
   * @param {string} salt - Salt used for hashing
   * @returns {Promise<boolean>} - True if password matches
   */
  async verifyPassword(password, hash, salt) {
    const computedHash = await this.hashPassword(password, salt);
    return timingSafeEqual(computedHash, hash);
  }
  
  /**
   * Generates a secure reset token
   * @returns {string} - Reset token
   */
  generateResetToken() {
    return generateSecureToken(32);
  }
  
  /**
   * Creates a session token
   * @param {string} userId - User ID
   * @returns {Promise<string>} - Session token
   */
  async createSessionToken(userId) {
    const timestamp = Date.now().toString();
    const randomPart = generateSecureToken(16);
    const tokenData = `${userId}:${timestamp}:${randomPart}`;
    
    return await sha256Hash(tokenData);
  }
}

/**
 * Global crypto utils instance
 */
export const cryptoUtils = new CryptoUtils();