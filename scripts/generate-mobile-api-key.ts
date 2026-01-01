/**
 * Generate Mobile App API Key
 * 
 * This script generates a secure API key for mobile app authentication.
 * Run this script to generate a new API key, then add it to:
 * - Backend environment variables (MOBILE_APP_API_KEY)
 * - Mobile app configuration
 */

/**
 * Generate a secure random API key
 * Format: 64-character hexadecimal string
 */
function generateApiKey(): string {
  const array = new Uint8Array(32); // 32 bytes = 64 hex characters
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Generate and display the API key
const apiKey = generateApiKey();

console.log('\n========================================');
console.log('Mobile App API Key Generated');
console.log('========================================\n');
console.log('API Key:', apiKey);
console.log('\nAdd this to your environment variables:');
console.log('MOBILE_APP_API_KEY=' + apiKey);
console.log('\nAlso add it to your mobile app configuration.\n');
console.log('========================================\n');

// Export for use in other scripts if needed
export { generateApiKey };
