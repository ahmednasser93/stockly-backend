# Configuration API Reference for Webapp

This document provides detailed API endpoints for managing configuration settings in the Stockly API. Use this reference to implement configuration management in your webapp.

**Base URL:** `https://stockly-api.ahmednasser1993.workers.dev`

---

## Table of Contents

1. [Admin Configuration API](#admin-configuration-api)
   - [Get Admin Config](#1-get-admin-config)
   - [Update Admin Config](#2-update-admin-config)
   - [Update Polling Interval](#3-update-polling-interval)
   - [Update Feature Flags](#4-update-feature-flags)
   - [Update Alert Throttle](#5-update-alert-throttle)

2. [User Settings API](#user-settings-api)
   - [Get User Settings](#1-get-user-settings)
   - [Update User Settings](#2-update-user-settings)
   - [Update Refresh Interval](#3-update-refresh-interval)

3. [User Preferences API](#user-preferences-api)
   - [Get User Preferences](#1-get-user-preferences)
   - [Update User Preferences](#2-update-user-preferences)
   - [Update Notification Enabled](#3-update-notification-enabled)
   - [Update Quiet Hours](#4-update-quiet-hours)
   - [Update Allowed Symbols](#5-update-allowed-symbols)
   - [Update Max Daily Notifications](#6-update-max-daily-notifications)

4. [Error Responses](#error-responses)
5. [TypeScript Types](#typescript-types)

---

## Admin Configuration API

Admin configuration is system-wide and affects all users. Stored in KV namespace.

### 1. Get Admin Config

**Endpoint:** `GET /config/get`  
**Description:** Retrieves the current admin configuration including polling interval, feature flags, and alert throttling settings.

**Request:**
```http
GET /config/get HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
```

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 30,
  "kvWriteIntervalSec": 3600,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 100,
    "windowSeconds": 60
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
}
```

**Field Descriptions:**
- `pollingIntervalSec` (number): How often stock data is refreshed from Financial Modeling Prep API (in seconds). Default: 30 seconds.
- `kvWriteIntervalSec` (number): How often alert states are flushed to KV storage (in seconds). Controls batched KV writes for performance. Default: 3600 seconds (1 hour). Range: 60-86400 (1 minute to 24 hours).
- `primaryProvider` (string): Name of primary data provider. Reserved for future use.
- `backupProvider` (string): Name of backup data provider. Reserved for future use.
- `alertThrottle` (object): Alert throttling settings.
  - `maxAlerts` (number): Maximum number of alerts that can be triggered in the window. Default: 100.
  - `windowSeconds` (number): Time window in seconds for throttling. Default: 60.
- `featureFlags` (object): Feature toggle flags.
  - `alerting` (boolean): Enable/disable the alerting system. Default: true.
  - `sandboxMode` (boolean): Enable sandbox mode. Reserved for future use. Default: false.
  - `simulateProviderFailure` (boolean): When enabled, API returns stale cached data instead of calling external providers. Useful for testing fallback behavior. Default: false.

---

### 2. Update Admin Config

**Endpoint:** `POST /config/update`  
**Description:** Updates admin configuration. You can update any combination of fields. Partial updates are supported.

**Request:**
```http
POST /config/update HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "pollingIntervalSec": 60,
  "featureFlags": {
    "alerting": true,
    "simulateProviderFailure": false
  },
  "alertThrottle": {
    "maxAlerts": 150,
    "windowSeconds": 120
  }
}
```

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 60,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 150,
    "windowSeconds": 120
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
}
```

**Request Body Fields:**
All fields are optional. Only include fields you want to update.

- `pollingIntervalSec` (number, optional): Stock data refresh interval in seconds. Must be a positive integer.
- `kvWriteIntervalSec` (number, optional): KV write interval in seconds. Range: 60-86400 (1 minute to 24 hours). Default: 3600 (1 hour).
- `primaryProvider` (string, optional): Primary provider name.
- `backupProvider` (string, optional): Backup provider name.
- `alertThrottle` (object, optional): Alert throttling settings.
  - `maxAlerts` (number, optional): Maximum alerts in window.
  - `windowSeconds` (number, optional): Time window in seconds.
- `featureFlags` (object, optional): Feature flags.
  - `alerting` (boolean, optional): Enable/disable alerting.
  - `sandboxMode` (boolean, optional): Enable/disable sandbox mode.
  - `simulateProviderFailure` (boolean, optional): Enable/disable provider failure simulation.

**Notes:**
- Partial updates are merged with existing configuration.
- Nested objects (like `featureFlags` and `alertThrottle`) are merged, not replaced.
- If a field is not provided, it retains its current value.

---

### 3. Update Polling Interval

**Endpoint:** `POST /config/update`  
**Description:** Updates the polling interval (how often stock data is refreshed from FMP API).

---

### 4. Update KV Write Interval

**Endpoint:** `POST /config/update`  
**Description:** Updates the KV write interval (how often alert states are flushed to KV storage).

**Request:**
```http
POST /config/update HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "kvWriteIntervalSec": 1800
}
```

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 30,
  "kvWriteIntervalSec": 1800,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 100,
    "windowSeconds": 60
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
}
```

**Field Details:**
- **Name:** `kvWriteIntervalSec`
- **Type:** `number` (integer, seconds)
- **Range:** `60` to `86400` (1 minute to 24 hours)
- **Default:** `3600` (1 hour)
- **Usage:** Controls how often alert states are flushed from memory cache to KV storage. Lower values = more frequent KV writes (higher costs, fresher data). Higher values = less frequent KV writes (lower costs, more batched).

**Common Values:**
- `900` (15 minutes) - More frequent updates
- `1800` (30 minutes) - Balanced
- `3600` (1 hour) - Default, recommended for production
- `7200` (2 hours) - Lower costs, good for high volume

---

### 5. Update Feature Flags

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 45,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 100,
    "windowSeconds": 60
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
}
```

**Field Details:**
- **Name:** `pollingIntervalSec`
- **Type:** `number`
- **Range:** Any positive integer (recommended: 10-300 seconds)
- **Default:** `30` seconds
- **Usage:** Controls how often stock data is refreshed from Financial Modeling Prep API. Lower values mean fresher data but more API calls.

---

### 4. Update Feature Flags

**Endpoint:** `POST /config/update`  
**Description:** Updates feature flags. You can update one or all flags.

**Request:**
```http
POST /config/update HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": true
  }
}
```

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 30,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 100,
    "windowSeconds": 60
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": true
  }
}
```

**Update Single Flag:**
```http
POST /config/update HTTP/1.1
Content-Type: application/json

{
  "featureFlags": {
    "simulateProviderFailure": true
  }
}
```

**Field Details:**
- `featureFlags.alerting` (boolean): Enable/disable the entire alerting system. When `false`, alerts are not evaluated or sent.
- `featureFlags.sandboxMode` (boolean): Enable sandbox mode (reserved for future use).
- `featureFlags.simulateProviderFailure` (boolean): When `true`, stock endpoints return stale cached data from D1 database instead of calling Financial Modeling Prep API. Useful for testing fallback behavior.

---

### 5. Update Alert Throttle

**Endpoint:** `POST /config/update`  
**Description:** Updates alert throttling settings.

**Request:**
```http
POST /config/update HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "alertThrottle": {
    "maxAlerts": 200,
    "windowSeconds": 120
  }
}
```

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 30,
  "primaryProvider": "alpha-feed",
  "backupProvider": "beta-feed",
  "alertThrottle": {
    "maxAlerts": 200,
    "windowSeconds": 120
  },
  "featureFlags": {
    "alerting": true,
    "sandboxMode": false,
    "simulateProviderFailure": false
  }
}
```

**Field Details:**
- `alertThrottle.maxAlerts` (number): Maximum number of alerts that can be triggered within the time window. Default: 100.
- `alertThrottle.windowSeconds` (number): Time window in seconds for throttling. Default: 60.

**Note:** Currently reserved for future use in alert throttling logic.

---

## User Settings API

User settings are per-user and stored in D1 database. Each user has their own settings.

### 1. Get User Settings

**Endpoint:** `GET /v1/api/settings/:userId`  
**Description:** Retrieves user-specific settings including refresh interval preference.

**Request:**
```http
GET /v1/api/settings/user123 HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
```

**Response:** `200 OK`
```json
{
  "userId": "user123",
  "refreshIntervalMinutes": 5,
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**If user not found, returns default:**
```json
{
  "userId": "user123",
  "refreshIntervalMinutes": 5,
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Field Descriptions:**
- `userId` (string): The user ID.
- `refreshIntervalMinutes` (number): Client-side refresh interval preference in minutes. Default: 5 minutes.
- `updatedAt` (string): ISO 8601 timestamp of last update.

**Important Note:** This is a **client-side preference only**. The API stores it but does NOT use it server-side. Clients should read this value and implement their own polling logic to refresh stock data at this interval.

---

### 2. Update User Settings

**Endpoint:** `PUT /v1/api/settings`  
**Description:** Creates or updates user-specific settings.

**Request:**
```http
PUT /v1/api/settings HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "userId": "user123",
  "refreshIntervalMinutes": 10
}
```

**Response (Updated):** `200 OK`
```json
{
  "success": true,
  "message": "Settings updated",
  "settings": {
    "userId": "user123",
    "refreshIntervalMinutes": 10,
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Response (Created):** `201 Created`
```json
{
  "success": true,
  "message": "Settings created",
  "settings": {
    "userId": "user123",
    "refreshIntervalMinutes": 10,
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Request Body Fields:**
- `userId` (string, required): The user ID. Must be a non-empty string.
- `refreshIntervalMinutes` (number, required): Client-side refresh interval in minutes. Must be between 1 and 720 (1 minute to 12 hours).

**Validation:**
- `userId`: Required, must be a string.
- `refreshIntervalMinutes`: Required, must be a number between 1 and 720.

**Error Response:** `400 Bad Request`
```json
{
  "error": "refreshIntervalMinutes must be a number between 1 and 720 (minutes)"
}
```

---

### 3. Update Refresh Interval

**Endpoint:** `PUT /v1/api/settings`  
**Description:** Updates the user's refresh interval preference.

**Request:**
```http
PUT /v1/api/settings HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "userId": "user123",
  "refreshIntervalMinutes": 15
}
```

**Response:** `200 OK` or `201 Created`
```json
{
  "success": true,
  "message": "Settings updated",
  "settings": {
    "userId": "user123",
    "refreshIntervalMinutes": 15,
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Field Details:**
- **Name:** `refreshIntervalMinutes`
- **Type:** `number`
- **Range:** `1` to `720` (1 minute to 12 hours)
- **Default:** `5` minutes
- **Usage:** Client-side preference for how often the app should refresh stock data. The webapp should read this value and poll the stock endpoints at this interval.

---

## User Preferences API

User preferences are per-user notification settings stored in D1 database.

### 1. Get User Preferences

**Endpoint:** `GET /v1/api/preferences/:userId`  
**Description:** Retrieves user-specific notification preferences.

**Request:**
```http
GET /v1/api/preferences/user123 HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
```

**Response:** `200 OK`
```json
{
  "userId": "user123",
  "enabled": true,
  "quietStart": "22:00",
  "quietEnd": "08:00",
  "allowedSymbols": ["AAPL", "MSFT", "GOOGL"],
  "maxDaily": 10,
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**If user not found, returns default:**
```json
{
  "userId": "user123",
  "enabled": true,
  "quietStart": null,
  "quietEnd": null,
  "allowedSymbols": null,
  "maxDaily": null,
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Field Descriptions:**
- `userId` (string): The user ID.
- `enabled` (boolean): Whether notifications are enabled. Default: `true`.
- `quietStart` (string | null): Start time of quiet hours in "HH:MM" format (24-hour). During this time, no notifications are sent. Default: `null`.
- `quietEnd` (string | null): End time of quiet hours in "HH:MM" format (24-hour). Default: `null`.
- `allowedSymbols` (string[] | null): Array of stock symbols for which notifications are allowed. If `null`, all symbols are allowed. Default: `null`.
- `maxDaily` (number | null): Maximum number of notifications per day. If `null`, no limit. Default: `null`.
- `updatedAt` (string): ISO 8601 timestamp of last update.

**Note:** Currently, these preferences are stored but not actively enforced in the alert cron job. They are reserved for future notification filtering logic.

---

### 2. Update User Preferences

**Endpoint:** `PUT /v1/api/preferences`  
**Description:** Creates or updates user-specific notification preferences.

**Request:**
```http
PUT /v1/api/preferences HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "userId": "user123",
  "enabled": true,
  "quietStart": "22:00",
  "quietEnd": "08:00",
  "allowedSymbols": ["AAPL", "MSFT"],
  "maxDaily": 10
}
```

**Response (Updated):** `200 OK`
```json
{
  "success": true,
  "message": "Preferences updated"
}
```

**Response (Created):** `201 Created`
```json
{
  "success": true,
  "message": "Preferences created"
}
```

**Request Body Fields:**
- `userId` (string, required): The user ID. Must be a non-empty string.
- `enabled` (boolean, required): Whether notifications are enabled.
- `quietStart` (string | null, optional): Start time of quiet hours in "HH:MM" format. If `null`, no quiet start time.
- `quietEnd` (string | null, optional): End time of quiet hours in "HH:MM" format. If `null`, no quiet end time.
- `allowedSymbols` (string[] | null, optional): Array of stock symbols. If `null` or empty array, all symbols are allowed.
- `maxDaily` (number | null, optional): Maximum notifications per day. If `null`, no limit. Must be non-negative.

**Validation:**
- `userId`: Required, must be a string.
- `enabled`: Required, must be a boolean.
- `quietStart`: Optional, if provided must be a string in "HH:MM" format (24-hour).
- `quietEnd`: Optional, if provided must be a string in "HH:MM" format (24-hour).
- `allowedSymbols`: Optional, if provided must be an array of strings.
- `maxDaily`: Optional, if provided must be a non-negative number.

**Error Responses:** `400 Bad Request`
```json
{
  "error": "enabled must be a boolean"
}
```

```json
{
  "error": "quietStart must be a string (HH:MM format)"
}
```

```json
{
  "error": "maxDaily must be a non-negative number"
}
```

---

### 3. Update Notification Enabled

**Endpoint:** `PUT /v1/api/preferences`  
**Description:** Enable or disable notifications for a user.

**Request:**
```http
PUT /v1/api/preferences HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "userId": "user123",
  "enabled": false,
  "quietStart": null,
  "quietEnd": null,
  "allowedSymbols": null,
  "maxDaily": null
}
```

**Response:** `200 OK` or `201 Created`
```json
{
  "success": true,
  "message": "Preferences updated"
}
```

**Field Details:**
- **Name:** `enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Usage:** When `false`, notifications are disabled for the user. When `true`, notifications are enabled (subject to other preference filters).

---

### 4. Update Quiet Hours

**Endpoint:** `PUT /v1/api/preferences`  
**Description:** Set quiet hours during which notifications are not sent.

**Request:**
```http
PUT /v1/api/preferences HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "userId": "user123",
  "enabled": true,
  "quietStart": "22:00",
  "quietEnd": "08:00",
  "allowedSymbols": null,
  "maxDaily": null
}
```

**Response:** `200 OK` or `201 Created`
```json
{
  "success": true,
  "message": "Preferences updated"
}
```

**Field Details:**
- **Name:** `quietStart` / `quietEnd`
- **Type:** `string | null`
- **Format:** `"HH:MM"` (24-hour format, e.g., `"22:00"`, `"08:00"`)
- **Default:** `null`
- **Usage:** Defines a time window during which notifications are not sent. Set to `null` to disable quiet hours.

**Example Values:**
- `"22:00"` - 10:00 PM
- `"08:00"` - 8:00 AM
- `null` - No quiet hours

---

### 5. Update Allowed Symbols

**Endpoint:** `PUT /v1/api/preferences`  
**Description:** Set which stock symbols are allowed for notifications.

**Request:**
```http
PUT /v1/api/preferences HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "userId": "user123",
  "enabled": true,
  "quietStart": null,
  "quietEnd": null,
  "allowedSymbols": ["AAPL", "MSFT", "GOOGL"],
  "maxDaily": null
}
```

**Response:** `200 OK` or `201 Created`
```json
{
  "success": true,
  "message": "Preferences updated"
}
```

**To allow all symbols:**
```json
{
  "userId": "user123",
  "enabled": true,
  "quietStart": null,
  "quietEnd": null,
  "allowedSymbols": null,
  "maxDaily": null
}
```

**Field Details:**
- **Name:** `allowedSymbols`
- **Type:** `string[] | null`
- **Default:** `null`
- **Usage:** Array of stock symbols (e.g., `["AAPL", "MSFT"]`). If `null` or empty array, all symbols are allowed. Only notifications for symbols in this list will be sent.

---

### 6. Update Max Daily Notifications

**Endpoint:** `PUT /v1/api/preferences`  
**Description:** Set the maximum number of notifications per day.

**Request:**
```http
PUT /v1/api/preferences HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
Content-Type: application/json

{
  "userId": "user123",
  "enabled": true,
  "quietStart": null,
  "quietEnd": null,
  "allowedSymbols": null,
  "maxDaily": 20
}
```

**Response:** `200 OK` or `201 Created`
```json
{
  "success": true,
  "message": "Preferences updated"
}
```

**To remove limit:**
```json
{
  "userId": "user123",
  "enabled": true,
  "quietStart": null,
  "quietEnd": null,
  "allowedSymbols": null,
  "maxDaily": null
}
```

**Field Details:**
- **Name:** `maxDaily`
- **Type:** `number | null`
- **Range:** Non-negative integer
- **Default:** `null`
- **Usage:** Maximum number of notifications per day. If `null`, no limit. Once the limit is reached, no more notifications will be sent until the next day.

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
Invalid request format or validation error.

```json
{
  "error": "userId is required and must be a string"
}
```

### 500 Internal Server Error
Server-side error.

```json
{
  "error": "Failed to update settings"
}
```

### 404 Not Found
Endpoint not found.

```json
{
  "error": "Not Found"
}
```

---

## TypeScript Types

Use these TypeScript interfaces in your webapp:

```typescript
// Admin Configuration
interface AdminConfig {
  pollingIntervalSec: number;
  kvWriteIntervalSec: number;
  primaryProvider: string;
  backupProvider: string;
  alertThrottle: {
    maxAlerts: number;
    windowSeconds: number;
  };
  featureFlags: {
    alerting: boolean;
    sandboxMode: boolean;
    simulateProviderFailure: boolean;
  };
}

// User Settings
interface UserSettings {
  userId: string;
  refreshIntervalMinutes: number;
  updatedAt: string;
}

// User Preferences
interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  allowedSymbols: string[] | null;
  maxDaily: number | null;
  updatedAt: string;
}

// Request/Response Types
interface UpdateAdminConfigRequest {
  pollingIntervalSec?: number;
  kvWriteIntervalSec?: number;
  primaryProvider?: string;
  backupProvider?: string;
  alertThrottle?: {
    maxAlerts?: number;
    windowSeconds?: number;
  };
  featureFlags?: {
    alerting?: boolean;
    sandboxMode?: boolean;
    simulateProviderFailure?: boolean;
  };
}

interface UpdateUserSettingsRequest {
  userId: string;
  refreshIntervalMinutes: number;
}

interface UpdatePreferencesRequest {
  userId: string;
  enabled: boolean;
  quietStart?: string | null;
  quietEnd?: string | null;
  allowedSymbols?: string[] | null;
  maxDaily?: number | null;
}

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  [key: string]: any;
}

interface ErrorResponse {
  error: string;
}
```

---

## Example API Client

Here's a simple example API client you can use in your webapp:

```typescript
const API_BASE_URL = 'https://stockly-api.ahmednasser1993.workers.dev';

// Admin Config
async function getAdminConfig(): Promise<AdminConfig> {
  const response = await fetch(`${API_BASE_URL}/config/get`);
  if (!response.ok) throw new Error('Failed to get admin config');
  return response.json();
}

async function updateAdminConfig(updates: UpdateAdminConfigRequest): Promise<AdminConfig> {
  const response = await fetch(`${API_BASE_URL}/config/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update admin config');
  return response.json();
}

// User Settings
async function getUserSettings(userId: string): Promise<UserSettings> {
  const response = await fetch(`${API_BASE_URL}/v1/api/settings/${userId}`);
  if (!response.ok) throw new Error('Failed to get user settings');
  return response.json();
}

async function updateUserSettings(request: UpdateUserSettingsRequest): Promise<ApiResponse<UserSettings>> {
  const response = await fetch(`${API_BASE_URL}/v1/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to update user settings');
  return response.json();
}

// User Preferences
async function getUserPreferences(userId: string): Promise<NotificationPreferences> {
  const response = await fetch(`${API_BASE_URL}/v1/api/preferences/${userId}`);
  if (!response.ok) throw new Error('Failed to get user preferences');
  return response.json();
}

async function updateUserPreferences(request: UpdatePreferencesRequest): Promise<ApiResponse<void>> {
  const response = await fetch(`${API_BASE_URL}/v1/api/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to update user preferences');
  return response.json();
}

// Usage Examples
async function example() {
  // Update polling interval
  await updateAdminConfig({ pollingIntervalSec: 60 });
  
  // Update KV write interval
  await updateAdminConfig({ kvWriteIntervalSec: 1800 }); // 30 minutes
  
  // Update user refresh interval
  await updateUserSettings({ userId: 'user123', refreshIntervalMinutes: 10 });
  
  // Update user preferences
  await updateUserPreferences({
    userId: 'user123',
    enabled: true,
    quietStart: '22:00',
    quietEnd: '08:00',
    allowedSymbols: ['AAPL', 'MSFT'],
    maxDaily: 10,
  });
}
```

---

## Important Notes

1. **Admin Config vs User Settings:**
   - `pollingIntervalSec` (admin) controls **server-side** cache refresh from FMP API
   - `refreshIntervalMinutes` (user) is a **client-side preference** only (API stores it but doesn't use it)

2. **Partial Updates:**
   - Admin config (`POST /config/update`) supports partial updates. Only include fields you want to change.
   - User settings and preferences require all required fields, but optional fields can be omitted.

3. **Validation:**
   - All endpoints validate input and return `400 Bad Request` for invalid data.
   - Check error messages in the response body for specific validation failures.

4. **CORS:**
   - All endpoints support CORS and can be called from web browsers.

5. **Feature Flags:**
   - `simulateProviderFailure`: When enabled, all stock endpoints return stale data from D1 database instead of calling FMP API. Useful for testing fallback behavior.

---

## Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/config/get` | GET | Get admin configuration |
| `/config/update` | POST | Update admin configuration (partial updates supported) |
| `/v1/api/settings/:userId` | GET | Get user settings |
| `/v1/api/settings` | PUT | Update user settings |
| `/v1/api/preferences/:userId` | GET | Get user preferences |
| `/v1/api/preferences` | PUT | Update user preferences |

