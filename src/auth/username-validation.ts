/**
 * Username Validation Utilities
 * 
 * Handles username format validation, reserved words checking, and normalization
 */

/**
 * Reserved words that cannot be used as usernames
 */
export const RESERVED_WORDS = [
  "admin",
  "administrator",
  "root",
  "api",
  "www",
  "mail",
  "support",
  "help",
  "system",
  "test",
  "testing",
  "dev",
  "development",
  "prod",
  "production",
  "staging",
  "null",
  "undefined",
  "true",
  "false",
  "stockly",
  "stocklyapp",
  "stocklyapi",
];

/**
 * Username format validation result
 */
export interface UsernameValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate username format
 * Rules:
 * - Alphanumeric (a-z, A-Z, 0-9), underscore (_), hyphen (-) only
 * - Must start with letter or number (not underscore/hyphen)
 * - Cannot end with underscore or hyphen
 * - No consecutive special characters (__, --, _-, -_)
 * - Length: 3-20 characters
 * 
 * @param username - Username to validate
 * @returns Validation result with error message if invalid
 */
export function validateUsernameFormat(
  username: string
): UsernameValidationResult {
  // Check length
  if (username.length < 3) {
    return {
      valid: false,
      error: "Username must be at least 3 characters long",
    };
  }

  if (username.length > 20) {
    return {
      valid: false,
      error: "Username must be at most 20 characters long",
    };
  }

  // Check if starts with letter or number
  if (!/^[a-zA-Z0-9]/.test(username)) {
    return {
      valid: false,
      error: "Username must start with a letter or number",
    };
  }

  // Check if ends with letter or number
  if (!/[a-zA-Z0-9]$/.test(username)) {
    return {
      valid: false,
      error: "Username must end with a letter or number",
    };
  }

  // Check for valid characters only (alphanumeric, underscore, hyphen)
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return {
      valid: false,
      error: "Username can only contain letters, numbers, underscores, and hyphens",
    };
  }

  // Check for consecutive special characters
  if (/[_-]{2,}/.test(username)) {
    return {
      valid: false,
      error: "Username cannot contain consecutive special characters",
    };
  }



  return { valid: true };
}

/**
 * Check if username is a reserved word
 * @param username - Username to check
 * @returns true if username is reserved, false otherwise
 */
export function isReservedWord(username: string): boolean {
  const normalized = normalizeUsername(username);
  return RESERVED_WORDS.includes(normalized);
}

/**
 * Normalize username for storage and comparison
 * - Converts to lowercase
 * - Trims whitespace
 * 
 * @param username - Username to normalize
 * @returns Normalized username
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Comprehensive username validation
 * Checks format, reserved words, and returns detailed error
 * 
 * @param username - Username to validate
 * @returns Validation result with specific error reason
 */
export function validateUsername(
  username: string
): UsernameValidationResult & { reason?: "format" | "reserved" } {
  // Normalize for reserved word check
  const normalized = normalizeUsername(username);

  // Check reserved words
  if (isReservedWord(normalized)) {
    return {
      valid: false,
      error: "This username is reserved and cannot be used",
      reason: "reserved",
    };
  }

  // Check format
  const formatResult = validateUsernameFormat(username);
  if (!formatResult.valid) {
    return {
      ...formatResult,
      reason: "format",
    };
  }

  return { valid: true };
}
