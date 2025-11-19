# Alerts & Devices System Documentation

This document explains how the alerts and devices system works, how they're related, and how to use the APIs for both webapp and mobile app teams.

---

## Overview

The Stockly API has two related but separate systems:

1. **Devices** - Registered mobile devices (push tokens)
2. **Alerts** - Price alerts that send notifications to devices

**Important:** Alerts and devices are linked by **push token**, NOT by userId. An alert's `target` field contains the push token directly.

---

## How the System Works

### 1. Device Registration Flow

```
Mobile App → Registers Push Token → API stores in user_push_tokens table
```

**Step-by-step:**
1. Mobile app gets FCM push token from device
2. Mobile app calls `POST /v1/api/push-token` with:
   - `userId` - User identifier
   - `token` - FCM push token
   - `deviceInfo` - Optional device description (e.g., "iPhone 14", "Samsung Galaxy")
3. API stores or updates the token in `user_push_tokens` table

### 2. Alert Creation Flow

```
User Creates Alert → API stores alert with push token in target field → Cron evaluates alerts
```

**Step-by-step:**
1. User wants to create an alert (e.g., "Notify me when AAPL goes above $150")
2. App calls `POST /v1/api/alerts` with:
   - `symbol` - Stock symbol (e.g., "AAPL")
   - `direction` - "above" or "below"
   - `threshold` - Price threshold (e.g., 150)
   - `channel` - Must be "notification"
   - `target` - **The push token** (not userId!)
3. API stores alert in `alerts` table with push token in `target` field

### 3. Alert Evaluation & Notification Flow

```
Cron (every 5 min) → Evaluates active alerts → Sends FCM notification → Logs result
```

**Step-by-step:**
1. Cron job runs every 5 minutes (`*/5 * * * *`)
2. Fetches all active alerts (`status = 'active'`)
3. Gets current stock prices from Financial Modeling Prep API
4. Evaluates each alert condition
5. For triggered alerts, sends FCM push notification to the token in `alert.target`
6. Logs the notification attempt in `notifications_log` table

---

## Database Schema

### `user_push_tokens` Table

Stores registered devices/push tokens:

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | TEXT (PK) | User identifier |
| `push_token` | TEXT | FCM push token (unique) |
| `device_info` | TEXT | Optional device description |
| `created_at` | TEXT | ISO 8601 timestamp |
| `updated_at` | TEXT | ISO 8601 timestamp |

**Index:** `idx_user_push_tokens_token` on `push_token`

### `alerts` Table

Stores price alerts:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | Alert UUID |
| `symbol` | TEXT | Stock ticker symbol |
| `direction` | TEXT | "above" or "below" |
| `threshold` | REAL | Price threshold |
| `status` | TEXT | "active" or "paused" |
| `channel` | TEXT | Always "notification" |
| `target` | TEXT | **Push token** (not userId!) |
| `notes` | TEXT | Optional user note |
| `created_at` | TEXT | ISO 8601 timestamp |
| `updated_at` | TEXT | ISO 8601 timestamp |

**Important:** The `target` field contains the **push token directly**, not the userId!

### Relationship

**There is NO foreign key relationship** between `alerts` and `user_push_tokens` tables.

They are linked by matching:
- `alerts.target` = `user_push_tokens.push_token`

---

## API Endpoints

### Device Management

#### 1. Register/Update Push Token

**Endpoint:** `POST /v1/api/push-token`  
**Description:** Register or update a device's push token.

**Request:**
```http
POST /v1/api/push-token HTTP/1.1
Content-Type: application/json

{
  "userId": "user123",
  "token": "cEMiqKriR8qsz4qnB-Ml7j:APA91bG2myuEw74AZMxl5sJEDIZ4aXV2xMNPPcjuUdVUynkavVFp9e3bYhrqy1tKG39QxrESS57KT6cKZJvUBflHhw_kQ3ExR7ixYCDdiLMX09NrBZDFHI8",
  "deviceInfo": "iPhone 14 Pro"
}
```

**Response:** `200 OK` (updated) or `201 Created` (new)
```json
{
  "success": true,
  "message": "Push token registered",
  "userId": "user123"
}
```

**Validation:**
- `userId`: Required, non-empty string
- `token`: Required, FCM token (minimum 20 characters)
- Old Expo tokens (`ExponentPushToken[...]`) are rejected with error

---

#### 2. Get User's Push Token

**Endpoint:** `GET /v1/api/push-token/:userId`  
**Description:** Retrieve a user's registered push token.

**Request:**
```http
GET /v1/api/push-token/user123 HTTP/1.1
```

**Response:** `200 OK`
```json
{
  "userId": "user123",
  "pushToken": "cEMiqKriR8qsz4qnB-Ml7j:APA91b...",
  "deviceInfo": "iPhone 14 Pro",
  "createdAt": "2025-11-15T16:36:43.118Z",
  "updatedAt": "2025-11-19T17:17:44.558Z"
}
```

**Response (not found):** `404 Not Found`
```json
{
  "error": "Push token not found"
}
```

---

#### 3. Get All Devices

**Endpoint:** `GET /v1/api/devices`  
**Description:** Get all registered devices with alert counts.

**Request:**
```http
GET /v1/api/devices HTTP/1.1
```

**Response:** `200 OK`
```json
{
  "devices": [
    {
      "userId": "user123",
      "pushToken": "cEMiqKriR8qsz4qnB-Ml7j:APA91b...",
      "deviceInfo": "iPhone 14 Pro",
      "alertCount": 3,
      "activeAlertCount": 2,
      "createdAt": "2025-11-15T16:36:43.118Z",
      "updatedAt": "2025-11-19T17:17:44.558Z"
    }
  ]
}
```

**Field Descriptions:**
- `userId`: User identifier
- `pushToken`: FCM push token for this device
- `deviceInfo`: Optional device description
- `alertCount`: **Total number of alerts** that use this push token (includes paused)
- `activeAlertCount`: **Number of active alerts** that use this push token
- `createdAt`: When device was first registered
- `updatedAt`: When push token was last updated

---

#### 4. Delete Device

**Endpoint:** `DELETE /v1/api/devices/:userId`  
**Description:** Delete a registered device (removes push token).

**Request:**
```http
DELETE /v1/api/devices/user123 HTTP/1.1
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Device deleted successfully",
  "userId": "user123"
}
```

**Note:** Deleting a device does NOT delete alerts. Alerts with the deleted token will fail to send notifications.

---

#### 5. Send Test Notification

**Endpoint:** `POST /v1/api/devices/:userId/test`  
**Description:** Send a test notification to a device.

**Request:**
```http
POST /v1/api/devices/user123/test HTTP/1.1
Content-Type: application/json

{
  "message": "This is a test notification!"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Test notification sent successfully",
  "userId": "user123"
}
```

---

### Alert Management

#### 1. List All Alerts

**Endpoint:** `GET /v1/api/alerts`  
**Description:** Get all alerts (active and paused).

**Request:**
```http
GET /v1/api/alerts HTTP/1.1
```

**Response:** `200 OK`
```json
{
  "alerts": [
    {
      "id": "43ffa50b-8353-46ae-a709-5684e8938559",
      "symbol": "AAPL",
      "direction": "above",
      "threshold": 150,
      "status": "active",
      "channel": "notification",
      "target": "cEMiqKriR8qsz4qnB-Ml7j:APA91b...",
      "notes": null,
      "createdAt": "2025-11-19T17:19:20.511Z",
      "updatedAt": "2025-11-19T17:19:20.511Z"
    }
  ]
}
```

**Important:** The `target` field contains the push token, not userId!

---

#### 2. Create Alert

**Endpoint:** `POST /v1/api/alerts`  
**Description:** Create a new price alert.

**Request:**
```http
POST /v1/api/alerts HTTP/1.1
Content-Type: application/json

{
  "symbol": "AAPL",
  "direction": "above",
  "threshold": 150,
  "channel": "notification",
  "target": "cEMiqKriR8qsz4qnB-Ml7j:APA91b...",
  "notes": "Alert me when Apple hits $150"
}
```

**Response:** `201 Created`
```json
{
  "id": "43ffa50b-8353-46ae-a709-5684e8938559",
  "symbol": "AAPL",
  "direction": "above",
  "threshold": 150,
  "status": "active",
  "channel": "notification",
  "target": "cEMiqKriR8qsz4qnB-Ml7j:APA91b...",
  "notes": "Alert me when Apple hits $150",
  "createdAt": "2025-11-19T17:19:20.511Z",
  "updatedAt": "2025-11-19T17:19:20.511Z"
}
```

**Validation:**
- `symbol`: Required, uppercase ticker symbol
- `direction`: Required, must be "above" or "below"
- `threshold`: Required, positive number
- `channel`: Required, must be "notification"
- `target`: Required, **must be a valid FCM push token** (not userId!)
- `notes`: Optional string

---

#### 3. Get Single Alert

**Endpoint:** `GET /v1/api/alerts/:id`  
**Description:** Get a specific alert by ID.

**Request:**
```http
GET /v1/api/alerts/43ffa50b-8353-46ae-a709-5684e8938559 HTTP/1.1
```

**Response:** `200 OK` (same format as create response)

**Response (not found):** `404 Not Found`
```json
{
  "error": "alert not found"
}
```

---

#### 4. Update Alert

**Endpoint:** `PUT /v1/api/alerts/:id`  
**Description:** Update an alert (partial updates supported).

**Request:**
```http
PUT /v1/api/alerts/43ffa50b-8353-46ae-a709-5684e8938559 HTTP/1.1
Content-Type: application/json

{
  "status": "paused",
  "threshold": 155
}
```

**Response:** `200 OK` (updated alert object)

---

#### 5. Delete Alert

**Endpoint:** `DELETE /v1/api/alerts/:id`  
**Description:** Delete an alert.

**Request:**
```http
DELETE /v1/api/alerts/43ffa50b-8353-46ae-a709-5684e8938559 HTTP/1.1
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

## Common Workflows

### Mobile App: Register Device

```typescript
// 1. Get FCM token from device
const fcmToken = await getFCMToken(); // Platform-specific

// 2. Register token with API
const response = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/push-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: currentUserId,
    token: fcmToken,
    deviceInfo: `${Platform.OS} ${Device.modelName}` // e.g., "iOS iPhone 14 Pro"
  })
});

const data = await response.json();
console.log('Device registered:', data);
```

---

### Mobile App: Create Alert

```typescript
// 1. First, get user's push token (if not already stored)
const tokenResponse = await fetch(
  `https://stockly-api.ahmednasser1993.workers.dev/v1/api/push-token/${userId}`
);
const tokenData = await tokenResponse.json();
const pushToken = tokenData.pushToken;

// 2. Create alert using push token
const alertResponse = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'AAPL',
    direction: 'above',
    threshold: 150,
    channel: 'notification',
    target: pushToken, // ⚠️ Use push token, not userId!
    notes: 'Notify me when Apple hits $150'
  })
});

const alert = await alertResponse.json();
console.log('Alert created:', alert);
```

---

### Webapp: Get All Devices with Alerts

```typescript
// Get all devices (includes alert counts)
const devicesResponse = await fetch(
  'https://stockly-api.ahmednasser1993.workers.dev/v1/api/devices'
);
const { devices } = await devicesResponse.json();

// For each device, you can see:
devices.forEach(device => {
  console.log(`User: ${device.userId}`);
  console.log(`Total alerts: ${device.alertCount}`);
  console.log(`Active alerts: ${device.activeAlertCount}`);
  console.log(`Device: ${device.deviceInfo}`);
});
```

---

### Webapp: Get Alerts for a Device

```typescript
// 1. Get device's push token
const deviceResponse = await fetch(
  `https://stockly-api.ahmednasser1993.workers.dev/v1/api/push-token/${userId}`
);
const device = await deviceResponse.json();
const pushToken = device.pushToken;

// 2. Get all alerts
const alertsResponse = await fetch(
  'https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts'
);
const { alerts } = await alertsResponse.json();

// 3. Filter alerts that match this device's push token
const deviceAlerts = alerts.filter(alert => alert.target === pushToken);

console.log(`User ${userId} has ${deviceAlerts.length} alerts`);
```

---

## Integration Expectations & Requirements

This section outlines what each team (webapp and mobile app) must implement to ensure the alerts/devices system works correctly end-to-end.

---

### Mobile App Team - Required Implementation

#### 1. Device Registration (REQUIRED)

**When:** On app startup, after login/authentication

**What to implement:**

✅ **Get FCM Push Token**
- Use Firebase Cloud Messaging (FCM) SDK
- Request notification permissions from user
- Get the FCM token

✅ **Register Token with API**
- Call `POST /v1/api/push-token` immediately after getting token
- Include `userId` from authentication
- Include `deviceInfo` (e.g., "iOS iPhone 14 Pro", "Android Samsung Galaxy S23")
- Handle errors gracefully (retry if needed)

✅ **Store Token Locally**
- Save token in local storage/AsyncStorage
- Check token on app resume/foreground
- Re-register if token changed

**Expected Behavior:**
```typescript
// On app start / after login
async function registerDevice(userId: string) {
  try {
    // Get FCM token
    const token = await messaging().getToken();
    
    // Register with API
    const response = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        token: token,
        deviceInfo: `${Platform.OS} ${Device.modelName}`
      })
    });
    
    if (response.ok) {
      await AsyncStorage.setItem('pushToken', token);
      console.log('Device registered successfully');
    }
  } catch (error) {
    console.error('Failed to register device:', error);
    // Retry logic here
  }
}
```

**Acceptance Criteria:**
- [ ] Device registered on first app launch after login
- [ ] Device re-registered if token changes
- [ ] Error handling for network failures
- [ ] Token stored locally for later use

---

#### 2. Token Refresh Handling (REQUIRED)

**When:** When FCM token is refreshed (can happen anytime)

**What to implement:**

✅ **Listen for Token Refresh**
- Implement FCM token refresh listener
- When token changes, update both:
  1. Device registration (`POST /v1/api/push-token`)
  2. All existing alerts (`PUT /v1/api/alerts/:id` with new token)

**Expected Behavior:**
```typescript
// Listen for token refresh
messaging().onTokenRefresh(async (newToken) => {
  const userId = await getCurrentUserId();
  const oldToken = await AsyncStorage.getItem('pushToken');
  
  // 1. Update device registration
  await registerDevice(userId);
  
  // 2. Update all existing alerts
  if (oldToken && oldToken !== newToken) {
    await updateAllAlertsWithNewToken(userId, oldToken, newToken);
  }
});

async function updateAllAlertsWithNewToken(userId: string, oldToken: string, newToken: string) {
  // Get user's alerts (by matching push token)
  const { alerts } = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts')
    .then(r => r.json());
  
  // Filter alerts that use old token
  const userAlerts = alerts.filter(alert => alert.target === oldToken);
  
  // Update each alert with new token
  for (const alert of userAlerts) {
    await fetch(`https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/${alert.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: newToken })
    });
  }
}
```

**Acceptance Criteria:**
- [ ] Token refresh listener implemented
- [ ] Device re-registered when token changes
- [ ] All existing alerts updated with new token
- [ ] User experience not interrupted

---

#### 3. Alert Creation (REQUIRED)

**When:** User creates a price alert in the mobile app

**What to implement:**

✅ **Get Push Token**
- Retrieve token from local storage (or fetch from API)
- Use `GET /v1/api/push-token/:userId` if not stored locally

✅ **Create Alert with Push Token**
- Call `POST /v1/api/alerts` with push token in `target` field
- **CRITICAL:** Use push token, NOT userId!

✅ **Handle Validation Errors**
- Token not registered → Prompt user to enable notifications
- Invalid token → Re-register device
- API errors → Show user-friendly error messages

**Expected Behavior:**
```typescript
async function createAlert(
  userId: string,
  symbol: string,
  direction: 'above' | 'below',
  threshold: number
) {
  // 1. Get push token (from storage or API)
  let pushToken = await AsyncStorage.getItem('pushToken');
  
  if (!pushToken) {
    // Fetch from API if not in storage
    const tokenResponse = await fetch(
      `https://stockly-api.ahmednasser1993.workers.dev/v1/api/push-token/${userId}`
    );
    if (!tokenResponse.ok) {
      throw new Error('Push token not registered. Please enable notifications.');
    }
    const tokenData = await tokenResponse.json();
    pushToken = tokenData.pushToken;
  }
  
  // 2. Create alert with push token (NOT userId!)
  const response = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: symbol.toUpperCase(),
      direction: direction,
      threshold: threshold,
      channel: 'notification',
      target: pushToken, // ⚠️ Push token, not userId!
      notes: `Alert when ${symbol} goes ${direction} $${threshold}`
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create alert');
  }
  
  return response.json();
}
```

**Acceptance Criteria:**
- [ ] Alert created with push token (not userId)
- [ ] Error handling for missing token
- [ ] User-friendly error messages
- [ ] Alert appears in user's alert list immediately

---

#### 4. Alert Management (REQUIRED)

**When:** User views, updates, or deletes alerts

**What to implement:**

✅ **List User's Alerts**
- Get all alerts: `GET /v1/api/alerts`
- Filter by matching `alert.target` with user's push token
- Show active vs paused status
- Display alert details (symbol, direction, threshold)

✅ **Update Alert**
- Support pausing/activating alerts
- Support updating threshold
- Call `PUT /v1/api/alerts/:id` with updates

✅ **Delete Alert**
- Call `DELETE /v1/api/alerts/:id`
- Remove from UI after successful deletion

**Expected Behavior:**
```typescript
async function getUserAlerts(userId: string) {
  // 1. Get user's push token
  const pushToken = await AsyncStorage.getItem('pushToken') ||
    await fetchPushTokenFromAPI(userId);
  
  // 2. Get all alerts
  const { alerts } = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts')
    .then(r => r.json());
  
  // 3. Filter alerts that match user's push token
  return alerts.filter(alert => alert.target === pushToken);
}

async function pauseAlert(alertId: string) {
  const response = await fetch(
    `https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/${alertId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' })
    }
  );
  return response.json();
}
```

**Acceptance Criteria:**
- [ ] User sees only their alerts (filtered by push token)
- [ ] Can pause/activate alerts
- [ ] Can update alert threshold
- [ ] Can delete alerts
- [ ] UI updates immediately after changes

---

#### 5. Notification Handling (REQUIRED)

**When:** App receives push notifications

**What to implement:**

✅ **Handle Foreground Notifications**
- Display notification in-app when app is open
- Show alert details (symbol, price, threshold)

✅ **Handle Background Notifications**
- System notification appears when app is in background
- Tapping notification opens app to alert details

✅ **Handle Notification Data**
- Parse notification payload:
  ```json
  {
    "alertId": "...",
    "symbol": "AAPL",
    "price": 155.23,
    "threshold": 150,
    "direction": "above"
  }
  ```
- Navigate to relevant alert or stock detail screen

**Expected Behavior:**
```typescript
// Handle foreground notifications
messaging().onMessage(async (remoteMessage) => {
  const { alertId, symbol, price, threshold, direction } = remoteMessage.data;
  
  // Show in-app notification
  showInAppNotification({
    title: `${symbol} Alert`,
    body: `${symbol} is now $${price.toFixed(2)} (${direction} your target of $${threshold.toFixed(2)})`,
    onPress: () => navigateToAlert(alertId)
  });
});

// Handle background/quit notifications
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // Handle notification data
  const { alertId } = remoteMessage.data;
  // Update local state, cache, etc.
});
```

**Acceptance Criteria:**
- [ ] Foreground notifications displayed in-app
- [ ] Background notifications show system notification
- [ ] Tapping notification navigates to correct screen
- [ ] Notification data parsed and used correctly

---

### Webapp Team - Required Implementation

#### 1. Devices Management Page (REQUIRED)

**What to implement:**

✅ **Display All Registered Devices**
- Call `GET /v1/api/devices`
- Show device list with:
  - User ID
  - Device info (e.g., "iPhone 14 Pro")
  - Alert counts (`alertCount`, `activeAlertCount`)
  - Registration date
  - Last updated date

✅ **Send Test Notifications**
- Button/link to send test notification per device
- Call `POST /v1/api/devices/:userId/test`
- Show success/error feedback

✅ **Delete Device**
- Delete button with confirmation
- Call `DELETE /v1/api/devices/:userId`
- Warn user that alerts will stop working
- Optionally list affected alerts

**Expected UI:**
```
Devices Management
==================

User ID: user123
Device: iPhone 14 Pro
Alerts: 3 total (2 active)
Registered: Nov 15, 2025
Last Updated: Nov 19, 2025
[Send Test] [Delete Device]

User ID: user456
Device: Android Samsung Galaxy
Alerts: 1 total (1 active)
Registered: Nov 18, 2025
Last Updated: Nov 19, 2025
[Send Test] [Delete Device]
```

**Acceptance Criteria:**
- [ ] All devices displayed with alert counts
- [ ] Test notification button works
- [ ] Delete device with confirmation
- [ ] Error handling for API failures

---

#### 2. Alerts Management Page (REQUIRED)

**What to implement:**

✅ **Display All Alerts**
- Call `GET /v1/api/alerts`
- Show alert list with:
  - Symbol
  - Direction (above/below)
  - Threshold
  - Status (active/paused)
  - Associated device (match by push token)
  - Created date

✅ **Link Alerts to Devices**
- Match alerts to devices by comparing:
  - `alert.target` (push token)
  - `device.pushToken`
- Show which user/device each alert belongs to

✅ **Alert Actions**
- Create new alert (requires device push token)
- Update alert (pause, change threshold)
- Delete alert
- Filter by status (active/paused)

**Expected UI:**
```
Alerts Management
=================

AAPL - Above $150 - Active
  → Device: user123 (iPhone 14 Pro)
  [Pause] [Edit] [Delete]

MSFT - Below $350 - Paused
  → Device: user123 (iPhone 14 Pro)
  [Activate] [Edit] [Delete]

GOOGL - Above $140 - Active
  → Device: user456 (Android Samsung)
  [Pause] [Edit] [Delete]
```

**Expected Behavior:**
```typescript
// Get devices and alerts, then match them
async function getAlertsWithDevices() {
  // 1. Get all devices
  const { devices } = await fetch('/v1/api/devices').then(r => r.json());
  
  // 2. Get all alerts
  const { alerts } = await fetch('/v1/api/alerts').then(r => r.json());
  
  // 3. Match alerts to devices
  const alertsWithDevices = alerts.map(alert => {
    const device = devices.find(d => d.pushToken === alert.target);
    return {
      ...alert,
      device: device ? {
        userId: device.userId,
        deviceInfo: device.deviceInfo,
        alertCount: device.alertCount
      } : null
    };
  });
  
  return alertsWithDevices;
}
```

**Acceptance Criteria:**
- [ ] All alerts displayed
- [ ] Each alert shows associated device/user
- [ ] Can filter by active/paused
- [ ] Can create, update, delete alerts
- [ ] Alerts without matching devices show warning

---

#### 3. Device-Alert Relationship Display (REQUIRED)

**What to implement:**

✅ **Show Alerts Per Device**
- For each device, show:
  - List of all alerts using that device's push token
  - Active vs paused count
  - Ability to manage alerts from device view

✅ **Show Devices Per Alert**
- For each alert, show:
  - Which device/user it belongs to
  - Device info and status
  - Link to device management

✅ **Visual Indicators**
- Highlight devices with no alerts
- Highlight alerts with no matching device (orphaned alerts)
- Show token mismatch warnings

**Expected Behavior:**
```typescript
// Get device with its alerts
async function getDeviceWithAlerts(userId: string) {
  // 1. Get device
  const device = await fetch(`/v1/api/push-token/${userId}`).then(r => r.json());
  
  // 2. Get all alerts
  const { alerts } = await fetch('/v1/api/alerts').then(r => r.json());
  
  // 3. Filter alerts for this device
  const deviceAlerts = alerts.filter(alert => alert.target === device.pushToken);
  
  return {
    device,
    alerts: deviceAlerts,
    activeCount: deviceAlerts.filter(a => a.status === 'active').length
  };
}
```

**Acceptance Criteria:**
- [ ] Devices show their alerts
- [ ] Alerts show their device
- [ ] Orphaned alerts clearly marked
- [ ] Token mismatches detected and warned

---

#### 4. Alert Creation Workflow (REQUIRED)

**What to implement:**

✅ **Select Device/User**
- Show list of registered devices
- User selects which device should receive notifications
- Or automatically use current user's device

✅ **Create Alert with Push Token**
- Get selected device's push token
- Use push token (not userId) in `target` field
- Validate alert data before submission

✅ **Error Handling**
- Device not registered → Show error, prompt to register
- Invalid push token → Show error, suggest re-registering device
- API errors → Display user-friendly messages

**Expected UI Flow:**
```
Create Alert
============

1. Select Device:
   [ ] user123 - iPhone 14 Pro (2 alerts)
   [ ] user456 - Android Samsung (1 alert)

2. Alert Details:
   Symbol: [AAPL]
   Direction: [Above ▼] [Below]
   Threshold: [$150]
   
3. [Create Alert]

When submitted:
POST /v1/api/alerts
{
  "symbol": "AAPL",
  "direction": "above",
  "threshold": 150,
  "channel": "notification",
  "target": "cEMiqKriR8qsz4qnB-Ml7j:APA91b...", // Selected device's push token
  "notes": "Alert when Apple hits $150"
}
```

**Acceptance Criteria:**
- [ ] Device selection works
- [ ] Push token correctly used in alert creation
- [ ] Validation errors shown clearly
- [ ] Success feedback after creation

---

#### 5. Token Mismatch Detection & Handling (REQUIRED)

**What to implement:**

✅ **Detect Orphaned Alerts**
- Alerts with push tokens that don't match any registered device
- Show warning/error for these alerts
- Option to clean up or update

✅ **Detect Token Mismatches**
- Device registered but alerts use different token
- Show warning that alerts won't work
- Option to update alerts to use current token

✅ **Auto-Fix Suggestions**
- Suggest updating alerts when device token changes
- Provide "Update All Alerts" button
- Show preview of changes before applying

**Expected Behavior:**
```typescript
async function detectTokenMismatches() {
  const { devices } = await fetch('/v1/api/devices').then(r => r.json());
  const { alerts } = await fetch('/v1/api/alerts').then(r => r.json());
  
  const issues = [];
  
  // Check for orphaned alerts (no matching device)
  for (const alert of alerts) {
    const device = devices.find(d => d.pushToken === alert.target);
    if (!device) {
      issues.push({
        type: 'orphaned_alert',
        alertId: alert.id,
        message: `Alert ${alert.symbol} has push token not registered to any device`
      });
    }
  }
  
  // Check for token mismatches (device has different token than alerts)
  for (const device of devices) {
    const deviceAlerts = alerts.filter(a => a.target === device.pushToken);
    if (deviceAlerts.length === 0 && device.alertCount > 0) {
      // Device says it has alerts, but no alerts match - token mismatch
      issues.push({
        type: 'token_mismatch',
        userId: device.userId,
        message: `Device ${device.userId} token doesn't match any alerts`
      });
    }
  }
  
  return issues;
}
```

**Acceptance Criteria:**
- [ ] Orphaned alerts detected and shown
- [ ] Token mismatches detected
- [ ] Auto-fix options available
- [ ] User can manually update tokens

---

### Integration Testing Checklist

Both teams must verify the following integration points:

#### Mobile App Testing

- [ ] **Device Registration**
  - [ ] Device registers on first app launch
  - [ ] Device re-registers on token refresh
  - [ ] Error handling works for network failures
  - [ ] Token stored locally and retrieved correctly

- [ ] **Alert Creation**
  - [ ] Can create alert with push token
  - [ ] Alert appears in list immediately
  - [ ] Alert uses correct push token (not userId)
  - [ ] Validation errors shown for invalid data

- [ ] **Alert Management**
  - [ ] Can view user's alerts (filtered by token)
  - [ ] Can pause/activate alerts
  - [ ] Can update alert threshold
  - [ ] Can delete alerts

- [ ] **Notifications**
  - [ ] Receives notifications when alert triggers
  - [ ] Foreground notifications display in-app
  - [ ] Background notifications show system notification
  - [ ] Tapping notification navigates correctly

- [ ] **Token Refresh**
  - [ ] Token refresh updates device registration
  - [ ] Token refresh updates all existing alerts
  - [ ] User experience not interrupted

#### Webapp Testing

- [ ] **Devices Page**
  - [ ] Shows all registered devices
  - [ ] Shows alert counts per device
  - [ ] Can send test notifications
  - [ ] Can delete devices

- [ ] **Alerts Page**
  - [ ] Shows all alerts
  - [ ] Shows which device each alert belongs to
  - [ ] Can create alerts with device selection
  - [ ] Can update/delete alerts

- [ ] **Device-Alert Linking**
  - [ ] Alerts correctly matched to devices
  - [ ] Orphaned alerts detected
  - [ ] Token mismatches detected
  - [ ] Fix suggestions work

- [ ] **Error Handling**
  - [ ] Handles missing devices gracefully
  - [ ] Handles invalid tokens
  - [ ] Shows user-friendly error messages
  - [ ] Provides recovery options

---

### Full Integration Cycle

#### Complete User Flow

**1. Mobile App: User Login**
```
User logs in
  → App gets FCM token
  → App registers token: POST /v1/api/push-token
  → Token stored locally
  → ✅ Device registered
```

**2. Mobile App: User Creates Alert**
```
User creates alert
  → App gets push token from storage
  → App creates alert: POST /v1/api/alerts (target = push token)
  → ✅ Alert created and active
```

**3. Background: Cron Evaluation**
```
Every 5 minutes:
  → Cron evaluates active alerts
  → Alert triggers (price crossed threshold)
  → API sends FCM notification to alert.target (push token)
  → ✅ User receives notification
```

**4. Mobile App: User Receives Notification**
```
Notification received
  → App handles notification
  → App navigates to alert/stock detail
  → User sees alert was triggered
  → ✅ User informed of price change
```

**5. Webapp: Admin Views Devices**
```
Admin opens devices page
  → Webapp calls GET /v1/api/devices
  → Shows all devices with alert counts
  → Admin can send test notifications
  → ✅ Admin can manage devices
```

**6. Webapp: Admin Views Alerts**
```
Admin opens alerts page
  → Webapp calls GET /v1/api/alerts
  → Matches alerts to devices (by push token)
  → Shows which device each alert belongs to
  → ✅ Admin can manage alerts
```

**7. Token Refresh (Mobile App)**
```
FCM token refreshes
  → App detects token change
  → App re-registers: POST /v1/api/push-token (new token)
  → App updates all alerts: PUT /v1/api/alerts/:id (new token)
  → ✅ All alerts updated, notifications continue working
```

---

### Success Criteria

#### Mobile App

✅ **Device Registration**
- Device automatically registered on app start
- Token refresh handled automatically
- No user intervention required for registration

✅ **Alert Functionality**
- Users can create alerts easily
- Alerts use correct push tokens
- Users receive notifications when alerts trigger
- Alert management (pause/delete) works seamlessly

✅ **User Experience**
- No confusing error messages about tokens
- Clear feedback when alerts are created
- Notifications work reliably

#### Webapp

✅ **Device Management**
- Admin can see all registered devices
- Alert counts show for each device
- Test notifications can be sent
- Devices can be deleted (with warnings)

✅ **Alert Management**
- Admin can see all alerts
- Alerts correctly linked to devices
- Can create alerts for any device
- Can update/delete alerts

✅ **Data Integrity**
- Orphaned alerts detected
- Token mismatches identified
- Auto-fix options available

---

### Common Integration Issues & Solutions

#### Issue 1: Alerts Created But Not Receiving Notifications

**Possible Causes:**
- Alert uses wrong push token
- Device token not registered
- Alert status is "paused"
- FCM service not configured

**Solutions:**
1. Verify device registration: `GET /v1/api/push-token/:userId`
2. Verify alert target matches device push token
3. Check alert status is "active"
4. Check notification logs: `GET /v1/api/notifications/failed`

---

#### Issue 2: Device Shows 0 Alerts But User Has Alerts

**Possible Causes:**
- Alerts created with different push token
- Token mismatch between device and alerts

**Solutions:**
1. Get device's current token: `GET /v1/api/push-token/:userId`
2. Get all alerts: `GET /v1/api/alerts`
3. Check if any alerts match token
4. Update alerts if token mismatch found

---

#### Issue 3: Token Refresh Breaks Notifications

**Possible Causes:**
- Token refreshed but alerts not updated
- Old token still in alert.target field

**Solutions:**
1. Mobile app must update all alerts when token changes
2. Implement token refresh listener
3. Batch update alerts after token refresh

---

### Delivery Checklist

Before considering integration complete:

#### Mobile App
- [ ] Device registration implemented and tested
- [ ] Token refresh handling implemented
- [ ] Alert creation uses push tokens correctly
- [ ] Alert management (CRUD) works
- [ ] Notification handling implemented
- [ ] Error handling comprehensive
- [ ] User-facing errors are clear

#### Webapp
- [ ] Devices management page implemented
- [ ] Alerts management page implemented
- [ ] Device-alert linking works correctly
- [ ] Orphaned alerts detected
- [ ] Token mismatch detection works
- [ ] Test notifications work
- [ ] Error handling comprehensive

---

## Important Notes

### ⚠️ Critical: Push Token vs UserId

**Alerts store push tokens directly, NOT userIds!**

- ❌ **WRONG:** `{ target: "user123" }`
- ✅ **CORRECT:** `{ target: "cEMiqKriR8qsz4qnB-Ml7j:APA91b..." }`

**Why?**
- Push tokens can change (user reinstalls app, gets new device)
- Multiple users could theoretically share a device (less common)
- Direct token storage allows immediate notification delivery

**Implication:**
- To link alerts to devices, you must match `alerts.target` = `user_push_tokens.push_token`

---

### Push Token Updates

When a user's push token changes:
1. Mobile app calls `POST /v1/api/push-token` with new token
2. Old token is replaced in `user_push_tokens` table
3. **Existing alerts still have the old token** in their `target` field
4. Those alerts will fail to send notifications until updated

**Solution:** Mobile app should update all existing alerts when token changes:

```typescript
// When push token changes
const newToken = await getNewFCMToken();
await registerPushToken(userId, newToken);

// Update all existing alerts
const { alerts } = await getAllAlerts();
for (const alert of alerts) {
  if (alert.target === oldToken) {
    await updateAlert(alert.id, { target: newToken });
  }
}
```

---

### Alert Status

- **`active`**: Alert is monitored and will trigger notifications
- **`paused`**: Alert is stored but NOT monitored (no notifications sent)

Cron job only evaluates alerts with `status = 'active'`.

---

### Notification Logging

All notification attempts are logged in `notifications_log` table:
- Success notifications
- Failed notifications (with error messages)
- Skipped notifications (old Expo tokens, etc.)

**Endpoint:** `GET /v1/api/notifications/recent` - Get recent notifications  
**Endpoint:** `GET /v1/api/notifications/failed` - Get failed notifications

---

## TypeScript Types

```typescript
// Device
interface Device {
  userId: string;
  pushToken: string;
  deviceInfo: string | null;
  alertCount: number;           // Total alerts for this device
  activeAlertCount: number;     // Active alerts for this device
  createdAt: string;
  updatedAt: string;
}

// Alert
interface Alert {
  id: string;
  symbol: string;
  direction: "above" | "below";
  threshold: number;
  status: "active" | "paused";
  channel: "notification";
  target: string;               // ⚠️ Push token, not userId!
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Push Token Registration
interface PushTokenPayload {
  userId: string;
  token: string;
  deviceInfo?: string;
}

// Alert Creation
interface CreateAlertPayload {
  symbol: string;
  direction: "above" | "below";
  threshold: number;
  channel: "notification";
  target: string;               // ⚠️ Push token!
  notes?: string;
}
```

---

## Troubleshooting

### Problem: Alerts not showing in `/v1/api/devices` response

**Cause:** The `/v1/api/devices` endpoint now includes `alertCount` and `activeAlertCount`, but you need to check the actual alerts.

**Solution:**
1. Get device's push token: `GET /v1/api/push-token/:userId`
2. Get all alerts: `GET /v1/api/alerts`
3. Filter alerts where `alert.target === device.pushToken`

---

### Problem: Alerts created but notifications not sending

**Possible causes:**
1. Alert `status` is `"paused"` instead of `"active"`
2. Push token in `alert.target` doesn't match any registered device
3. Old Expo token (starts with `ExponentPushToken[`)
4. FCM service account not configured
5. Token is invalid/expired

**Debug steps:**
1. Check alert status: `GET /v1/api/alerts/:id`
2. Check if device exists: `GET /v1/api/push-token/:userId`
3. Verify token matches: `alert.target === device.pushToken`
4. Check notification logs: `GET /v1/api/notifications/failed`

---

### Problem: Device shows `alertCount: 0` but user has alerts

**Cause:** The alerts were created with a different push token (or old token).

**Solution:**
1. Get device's current push token
2. Search alerts by token: `GET /v1/api/alerts` then filter by `target`
3. If token mismatch, update alerts to use current token

---

## Best Practices

### Mobile App

1. **Register token on app start:**
   ```typescript
   useEffect(() => {
     const registerToken = async () => {
       const token = await getFCMToken();
       await registerPushToken(userId, token);
     };
     registerToken();
   }, []);
   ```

2. **Update alerts when token changes:**
   - Listen for token refresh events
   - Update all existing alerts with new token

3. **Handle token refresh gracefully:**
   - Token may change when app is reinstalled
   - Always register the latest token

### Webapp

1. **Show device-alert relationship:**
   - Get devices: `GET /v1/api/devices`
   - Get alerts: `GET /v1/api/alerts`
   - Match them by `device.pushToken === alert.target`

2. **Handle device deletion:**
   - Warn user that alerts will stop working
   - Optionally delete alerts or update them

3. **Display alert counts:**
   - Use `alertCount` and `activeAlertCount` from devices endpoint

---

## Migration Notes

### From Expo to FCM

The system migrated from Expo Push Tokens to FCM (Firebase Cloud Messaging):

- ❌ **Old Expo tokens:** `ExponentPushToken[...]` - No longer supported
- ✅ **New FCM tokens:** `cEMiqKriR8qsz4qnB-Ml7j:APA91b...` - Supported

**Old tokens are rejected** when registering push tokens.

**Old alerts with Expo tokens** are skipped during cron evaluation (logged as errors).

---

## Example: Complete Mobile App Integration

```typescript
// Mobile App Flow

// 1. App starts - register push token
async function onAppStart(userId: string) {
  try {
    const fcmToken = await getFCMToken();
    await registerPushToken(userId, fcmToken, deviceInfo);
    await Storage.setItem('pushToken', fcmToken);
  } catch (error) {
    console.error('Failed to register push token:', error);
  }
}

// 2. Create alert
async function createPriceAlert(
  userId: string,
  symbol: string,
  direction: 'above' | 'below',
  threshold: number
) {
  // Get stored push token (or fetch from API)
  const pushToken = await Storage.getItem('pushToken') || 
    await fetchPushToken(userId);
  
  const response = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: symbol.toUpperCase(),
      direction,
      threshold,
      channel: 'notification',
      target: pushToken, // ⚠️ Use push token!
      notes: `Alert when ${symbol} goes ${direction} $${threshold}`
    })
  });
  
  return response.json();
}

// 3. List user's alerts
async function getUserAlerts(userId: string) {
  const pushToken = await Storage.getItem('pushToken') || 
    await fetchPushToken(userId);
  
  const { alerts } = await fetch('https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts')
    .then(r => r.json());
  
  // Filter alerts for this user's device
  return alerts.filter(alert => alert.target === pushToken);
}

// 4. Handle token refresh
async function onTokenRefresh(userId: string, newToken: string) {
  // Update registration
  await registerPushToken(userId, newToken);
  
  // Update all existing alerts
  const { alerts } = await getUserAlerts(userId);
  const oldToken = await Storage.getItem('pushToken');
  
  for (const alert of alerts) {
    if (alert.target === oldToken) {
      await fetch(`https://stockly-api.ahmednasser1993.workers.dev/v1/api/alerts/${alert.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: newToken })
      });
    }
  }
  
  await Storage.setItem('pushToken', newToken);
}
```

---

## Summary

### Key Points

1. **Devices are registered** via `POST /v1/api/push-token` (one per userId)
2. **Alerts store push tokens** directly in `target` field (not userId)
3. **Relationship:** Match `alerts.target` = `user_push_tokens.push_token`
4. **Devices endpoint** now shows `alertCount` and `activeAlertCount`
5. **Token updates** require updating existing alerts manually

### Endpoints Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/api/push-token` | POST | Register/update device push token |
| `/v1/api/push-token/:userId` | GET | Get user's push token |
| `/v1/api/devices` | GET | Get all devices with alert counts |
| `/v1/api/devices/:userId` | DELETE | Delete device |
| `/v1/api/devices/:userId/test` | POST | Send test notification |
| `/v1/api/alerts` | GET | List all alerts |
| `/v1/api/alerts` | POST | Create alert (target = push token!) |
| `/v1/api/alerts/:id` | GET | Get single alert |
| `/v1/api/alerts/:id` | PUT | Update alert |
| `/v1/api/alerts/:id` | DELETE | Delete alert |

---

**Last Updated:** November 2025  
**API Version:** 1.0

