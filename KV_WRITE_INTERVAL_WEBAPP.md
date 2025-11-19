# KV Write Interval Configuration - Webapp Implementation Guide

This guide provides everything you need to implement the KV Write Interval configuration control in the webapp settings page.

---

## Overview

The `kvWriteIntervalSec` setting controls how often alert states are flushed from memory cache to KV storage. This is a performance optimization that batches KV writes instead of writing on every alert evaluation.

- **Endpoint:** `POST /config/update`
- **Field Name:** `kvWriteIntervalSec`
- **Type:** `number` (integer, in seconds)
- **Default:** `3600` (1 hour)
- **Range:** `60` to `86400` (1 minute to 24 hours)

---

## API Endpoint

### Update KV Write Interval

**Endpoint:** `POST /config/update`  
**Description:** Updates the KV write interval. This can be updated along with other admin config settings.

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

**Get Current Value:**
```http
GET /config/get HTTP/1.1
Host: stockly-api.ahmednasser1993.workers.dev
```

**Response:** `200 OK`
```json
{
  "pollingIntervalSec": 30,
  "kvWriteIntervalSec": 3600,
  // ... other fields
}
```

---

## TypeScript Types

Update your `AdminConfig` interface:

```typescript
interface AdminConfig {
  pollingIntervalSec: number;
  kvWriteIntervalSec: number;  // NEW FIELD
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

interface UpdateAdminConfigRequest {
  pollingIntervalSec?: number;
  kvWriteIntervalSec?: number;  // NEW FIELD (optional for partial updates)
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
```

---

## Implementation in Settings Page

### 1. Add Field to Admin Configuration Section

Add a new input field in the Admin Configuration section of your settings page:

```tsx
// In your SettingsPage component

<div className="admin-config-section">
  <h3>Admin Configuration</h3>
  
  {/* Existing Polling Interval field */}
  <div className="form-field">
    <label htmlFor="pollingIntervalSec">
      Polling Interval (seconds)
    </label>
    <input
      type="number"
      id="pollingIntervalSec"
      min={10}
      max={300}
      value={config.pollingIntervalSec}
      onChange={(e) => setConfig({
        ...config,
        pollingIntervalSec: Number(e.target.value)
      })}
    />
    <small>How often stock data is refreshed from FMP API (10-300 seconds)</small>
  </div>

  {/* NEW: KV Write Interval field */}
  <div className="form-field">
    <label htmlFor="kvWriteIntervalSec">
      KV Write Interval (seconds)
    </label>
    <input
      type="number"
      id="kvWriteIntervalSec"
      min={60}
      max={86400}
      value={config.kvWriteIntervalSec}
      onChange={(e) => setConfig({
        ...config,
        kvWriteIntervalSec: Number(e.target.value)
      })}
    />
    <small>
      How often alert states are flushed to KV storage (60-86400 seconds, default: 3600 = 1 hour)
    </small>
  </div>

  {/* Rest of admin config fields... */}
</div>
```

### 2. Format Display (Optional)

You may want to display the value in a more user-friendly format:

```tsx
// Helper function to format seconds to human-readable format
function formatInterval(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
}

// In your component
<div className="form-field">
  <label htmlFor="kvWriteIntervalSec">
    KV Write Interval
    {config.kvWriteIntervalSec && (
      <span className="current-value">
        (Currently: {formatInterval(config.kvWriteIntervalSec)})
      </span>
    )}
  </label>
  <input
    type="number"
    id="kvWriteIntervalSec"
    min={60}
    max={86400}
    step={60}  // Increment by 60 seconds (1 minute)
    value={config.kvWriteIntervalSec}
    onChange={(e) => setConfig({
      ...config,
      kvWriteIntervalSec: Number(e.target.value)
    })}
  />
  <small>
    How often alert states are flushed to KV storage.
    <br />
    Range: 60-86400 seconds (1 minute to 24 hours)
    <br />
    Recommended: 1800-7200 seconds (30 minutes to 2 hours)
  </small>
</div>
```

### 3. Update Save Handler

Your existing save handler should already work if you're updating the entire config object:

```typescript
async function handleSaveAllSettings() {
  try {
    // Update admin config (includes kvWriteIntervalSec)
    await updateAdminConfig({
      pollingIntervalSec: config.pollingIntervalSec,
      kvWriteIntervalSec: config.kvWriteIntervalSec,  // Include this field
      featureFlags: config.featureFlags,
      alertThrottle: config.alertThrottle,
    });

    // Update user settings
    await updateUserSettings({
      userId: currentUserId,
      refreshIntervalMinutes: userSettings.refreshIntervalMinutes,
    });

    // Update user preferences
    await updateUserPreferences({
      userId: currentUserId,
      enabled: preferences.enabled,
      quietStart: preferences.quietStart,
      quietEnd: preferences.quietEnd,
      allowedSymbols: preferences.allowedSymbols,
      maxDaily: preferences.maxDaily,
    });

    setStatusMessage({ type: 'success', text: 'All settings saved successfully!' });
  } catch (error) {
    setStatusMessage({ type: 'error', text: 'Failed to save settings' });
  }
}
```

---

## Validation

### Client-Side Validation

Add validation when the user changes the value:

```typescript
function validateKvWriteInterval(value: number): string | null {
  if (value < 60) {
    return 'Minimum value is 60 seconds (1 minute)';
  }
  if (value > 86400) {
    return 'Maximum value is 86400 seconds (24 hours)';
  }
  if (!Number.isInteger(value)) {
    return 'Value must be a whole number';
  }
  return null;
}

// In your component
const [kvWriteIntervalError, setKvWriteIntervalError] = useState<string | null>(null);

<input
  type="number"
  id="kvWriteIntervalSec"
  min={60}
  max={86400}
  step={60}
  value={config.kvWriteIntervalSec}
  onChange={(e) => {
    const value = Number(e.target.value);
    const error = validateKvWriteInterval(value);
    setKvWriteIntervalError(error);
    if (!error) {
      setConfig({
        ...config,
        kvWriteIntervalSec: value
      });
    }
  }}
/>
{kvWriteIntervalError && (
  <div className="error-message">{kvWriteIntervalError}</div>
)}
```

---

## Common Values & Recommendations

### Preset Values (Optional)

You could add preset buttons for common values:

```tsx
<div className="form-field">
  <label htmlFor="kvWriteIntervalSec">KV Write Interval (seconds)</label>
  <input
    type="number"
    id="kvWriteIntervalSec"
    min={60}
    max={86400}
    value={config.kvWriteIntervalSec}
    onChange={(e) => setConfig({
      ...config,
      kvWriteIntervalSec: Number(e.target.value)
    })}
  />
  
  {/* Preset buttons */}
  <div className="preset-buttons">
    <button
      type="button"
      onClick={() => setConfig({ ...config, kvWriteIntervalSec: 900 })}
    >
      15 min
    </button>
    <button
      type="button"
      onClick={() => setConfig({ ...config, kvWriteIntervalSec: 1800 })}
    >
      30 min
    </button>
    <button
      type="button"
      onClick={() => setConfig({ ...config, kvWriteIntervalSec: 3600 })}
    >
      1 hour (default)
    </button>
    <button
      type="button"
      onClick={() => setConfig({ ...config, kvWriteIntervalSec: 7200 })}
    >
      2 hours
    </button>
  </div>
  
  <small>
    How often alert states are flushed to KV storage.
    Lower values = more frequent KV writes (higher costs, fresher data).
    Higher values = less frequent KV writes (lower costs, more batched).
  </small>
</div>
```

### Recommended Values

| Use Case | Recommended Value | Reason |
|----------|------------------|---------|
| **Production (Default)** | `3600` (1 hour) | Good balance between cost and freshness |
| **High Volume** | `7200` (2 hours) | Reduce KV write costs with many alerts |
| **Low Volume** | `1800` (30 minutes) | More frequent updates, still cost-effective |
| **Testing** | `300` (5 minutes) | Faster testing, but higher costs |
| **Minimum** | `60` (1 minute) | Maximum freshness, highest costs |

---

## Example: Complete Settings Page Integration

```tsx
import { useState, useEffect } from 'react';
import { getAdminConfig, updateAdminConfig } from './api/adminConfig';

function SettingsPage() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const adminConfig = await getAdminConfig();
      setConfig(adminConfig);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig() {
    if (!config) return;
    
    try {
      await updateAdminConfig({
        pollingIntervalSec: config.pollingIntervalSec,
        kvWriteIntervalSec: config.kvWriteIntervalSec,
        featureFlags: config.featureFlags,
        alertThrottle: config.alertThrottle,
      });
      alert('Settings saved successfully!');
    } catch (error) {
      alert('Failed to save settings');
    }
  }

  if (loading || !config) {
    return <div>Loading...</div>;
  }

  return (
    <div className="settings-page">
      <h2>Admin Configuration</h2>
      
      <div className="form-section">
        <div className="form-field">
          <label htmlFor="pollingIntervalSec">
            Polling Interval (seconds)
          </label>
          <input
            type="number"
            id="pollingIntervalSec"
            min={10}
            max={300}
            value={config.pollingIntervalSec}
            onChange={(e) => setConfig({
              ...config,
              pollingIntervalSec: Number(e.target.value)
            })}
          />
          <small>How often stock data is refreshed from FMP API</small>
        </div>

        <div className="form-field">
          <label htmlFor="kvWriteIntervalSec">
            KV Write Interval (seconds)
          </label>
          <input
            type="number"
            id="kvWriteIntervalSec"
            min={60}
            max={86400}
            step={60}
            value={config.kvWriteIntervalSec}
            onChange={(e) => setConfig({
              ...config,
              kvWriteIntervalSec: Number(e.target.value)
            })}
          />
          <small>
            How often alert states are flushed to KV storage.
            Current: {formatInterval(config.kvWriteIntervalSec)}.
            Range: 60-86400 seconds.
          </small>
        </div>

        {/* Other fields... */}
      </div>

      <button onClick={handleSaveConfig}>Save Settings</button>
    </div>
  );
}
```

---

## Testing

### Test Cases

1. **Get Current Value:**
   ```typescript
   const config = await getAdminConfig();
   console.log(config.kvWriteIntervalSec); // Should return default: 3600
   ```

2. **Update Value:**
   ```typescript
   await updateAdminConfig({ kvWriteIntervalSec: 1800 });
   const updated = await getAdminConfig();
   console.log(updated.kvWriteIntervalSec); // Should return: 1800
   ```

3. **Partial Update:**
   ```typescript
   // Only update kvWriteIntervalSec, other fields remain unchanged
   await updateAdminConfig({ kvWriteIntervalSec: 7200 });
   ```

4. **Validation:**
   ```typescript
   // Try invalid values (should fail on server, but client should validate too)
   await updateAdminConfig({ kvWriteIntervalSec: 30 }); // Too low
   await updateAdminConfig({ kvWriteIntervalSec: 100000 }); // Too high
   ```

---

## Important Notes

1. **Backward Compatibility:**
   - If `kvWriteIntervalSec` is not provided in the config, the API defaults to `3600` (1 hour)
   - Existing configs without this field will automatically use the default value

2. **Effect on Performance:**
   - Lower values = More frequent KV writes = Higher costs, fresher data
   - Higher values = Less frequent KV writes = Lower costs, more batched
   - Changes take effect immediately on the next cron run (every 5 minutes)

3. **Best Practices:**
   - For production: Use 1800-7200 seconds (30 minutes to 2 hours)
   - Don't set below 300 seconds (5 minutes) unless testing
   - Monitor KV usage after changing this value

---

## Summary

**Field Name:** `kvWriteIntervalSec`  
**Type:** `number` (integer, seconds)  
**Default:** `3600` (1 hour)  
**Range:** `60` - `86400` (1 minute to 24 hours)  
**Endpoint:** `POST /config/update`  
**Get Endpoint:** `GET /config/get`

Add this field to your Admin Configuration section in the settings page, and include it when saving admin config updates.

