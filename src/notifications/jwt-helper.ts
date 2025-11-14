/**
 * JWT Helper for Google Cloud Service Account
 * Generates JWT tokens for OAuth2 authentication
 */

/**
 * Base64 URL encode
 */
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Convert PEM private key to ArrayBuffer
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Remove PEM headers and whitespace
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  // Convert base64 to binary
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate JWT for Google Cloud Service Account
 */
export async function generateGoogleJWT(
  serviceAccount: {
    private_key: string;
    client_email: string;
    project_id: string;
  },
  scope: string = "https://www.googleapis.com/auth/firebase.messaging"
): Promise<string> {
  const { private_key, client_email } = serviceAccount;

  // JWT Header
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  // JWT Payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: client_email,
    sub: client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600, // 1 hour
    scope: scope,
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const data = `${encodedHeader}.${encodedPayload}`;
  const dataBuffer = new TextEncoder().encode(data);

  // Import private key
  const keyBuffer = pemToArrayBuffer(private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  // Sign
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    dataBuffer
  );

  // Encode signature
  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  // Return complete JWT
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Exchange JWT for Google OAuth2 access token
 */
export async function getGoogleAccessTokenFromJWT(jwt: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("No access_token in response");
  }

  return data.access_token;
}

