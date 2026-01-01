/**
 * Client Authentication Middleware
 * Restricts backend API access to only mobile-app and webapp clients
 * All other requests return 403 Forbidden
 */

export interface ClientAuthConfig {
  allowedWebappOrigins: string[];
  mobileAppApiKey: string; // From env var MOBILE_APP_API_KEY
  publicEndpoints: string[]; // Endpoints that don't require client auth
}

export interface ClientAuthResult {
  isValid: boolean;
  clientType: 'webapp' | 'mobile-app' | 'unauthorized';
}

/**
 * Validate client authentication for incoming requests
 * 
 * Validation Logic:
 * 1. Check if pathname is in publicEndpoints → allow
 * 2. Check for X-Client-API-Key header:
 *    - If present and matches mobileAppApiKey → allow (mobile-app)
 *    - If present but doesn't match → reject (403)
 * 3. Check Origin header:
 *    - If present and in allowedWebappOrigins → allow (webapp)
 *    - If present but not allowed → reject (403)
 * 4. If neither header is present → reject (403)
 */
export function validateClientAuth(
  request: Request,
  config: ClientAuthConfig
): ClientAuthResult {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Check if endpoint is public (no auth required)
  if (config.publicEndpoints.some(endpoint => pathname === endpoint || pathname.startsWith(endpoint))) {
    return {
      isValid: true,
      clientType: 'webapp', // Public endpoints are accessible to all
    };
  }

  // Check for mobile app API key header
  const mobileApiKey = request.headers.get('X-Client-API-Key');
  if (mobileApiKey) {
    if (mobileApiKey === config.mobileAppApiKey && config.mobileAppApiKey) {
      return {
        isValid: true,
        clientType: 'mobile-app',
      };
    } else {
      // API key present but doesn't match
      return {
        isValid: false,
        clientType: 'unauthorized',
      };
    }
  }

  // Check for webapp Origin header
  const origin = request.headers.get('Origin');
  if (origin) {
    if (config.allowedWebappOrigins.includes(origin)) {
      return {
        isValid: true,
        clientType: 'webapp',
      };
    } else {
      // Origin present but not in allowed list
      return {
        isValid: false,
        clientType: 'unauthorized',
      };
    }
  }

  // No authentication headers present
  return {
    isValid: false,
    clientType: 'unauthorized',
  };
}
