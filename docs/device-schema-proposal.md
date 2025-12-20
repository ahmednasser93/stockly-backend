# Device Schema Refactoring Proposal

## Current Design Issues

The current system uses `user_push_tokens` table which mixes multiple concerns:

1. **Push Token Management** (for FCM notifications)
2. **Device Information** (device_info, device_type)
3. **User Association** (user_id, username)

### Current Schema
```sql
CREATE TABLE user_push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  push_token TEXT NOT NULL UNIQUE,
  device_info TEXT,
  device_type TEXT,
  username TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Problems with Current Design

1. **Semantic Confusion**: The table name suggests it's only for push tokens, but it stores device information too
2. **One-to-One Assumption**: Assumes one push token = one device, but in reality:
   - A device can have multiple push tokens (app reinstalls, token refreshes)
   - A push token can become invalid while the device still exists
3. **Data Duplication**: `username` is stored redundantly (can be derived from `user_id`)
4. **Limited Extensibility**: Hard to add device-specific fields (device_name, last_seen, is_active, etc.)

## Proposed Better Design

### Option 1: Separate Devices and Push Tokens (Recommended)

```sql
-- Devices table: Core device information
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_identifier TEXT, -- Unique device identifier (e.g., Android ID, iOS UUID)
  device_name TEXT, -- User-friendly name (e.g., "My iPhone", "Work Android")
  device_info TEXT, -- Full device info string (e.g., "OPPO CPH2305 (Android 14)")
  device_type TEXT, -- 'android', 'ios', 'web', 'unknown'
  is_active BOOLEAN DEFAULT 1, -- Whether device is currently active
  last_seen_at TEXT, -- Last time device was seen/used
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Device push tokens: Multiple tokens per device
CREATE TABLE device_push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  push_token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT 1, -- Whether this token is currently valid
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_device_type ON devices(device_type);
CREATE INDEX idx_devices_is_active ON devices(is_active);
CREATE INDEX idx_device_push_tokens_device_id ON device_push_tokens(device_id);
CREATE INDEX idx_device_push_tokens_push_token ON device_push_tokens(push_token);
CREATE INDEX idx_device_push_tokens_is_active ON device_push_tokens(is_active);
```

### Benefits of New Design

1. **Separation of Concerns**: Devices and push tokens are separate entities
2. **Multiple Tokens per Device**: Supports token rotation and app reinstalls
3. **Better Device Management**: Can track device lifecycle independently of tokens
4. **Extensible**: Easy to add device-specific features (device names, last seen, etc.)
5. **Cleaner Queries**: More intuitive joins and queries
6. **Data Integrity**: Foreign keys ensure referential integrity

### Migration Strategy

1. Create new tables (`devices`, `device_push_tokens`)
2. Migrate data from `user_push_tokens`:
   - Group by `user_id` + `device_info` to identify unique devices
   - Create device records
   - Create push token records linked to devices
3. Update all API endpoints to use new schema
4. Keep old table for backward compatibility during transition
5. Remove old table after migration is complete

### Example Queries with New Schema

```sql
-- Get all devices for a user with their active push tokens
SELECT 
  d.id,
  d.device_name,
  d.device_info,
  d.device_type,
  d.is_active,
  d.last_seen_at,
  COUNT(dpt.id) as active_token_count
FROM devices d
LEFT JOIN device_push_tokens dpt ON d.id = dpt.device_id AND dpt.is_active = 1
WHERE d.user_id = ?
GROUP BY d.id;

-- Get all active push tokens for notifications
SELECT 
  dpt.push_token,
  d.device_type,
  u.username
FROM device_push_tokens dpt
JOIN devices d ON dpt.device_id = d.id
JOIN users u ON d.user_id = u.id
WHERE dpt.is_active = 1 AND d.is_active = 1;
```

## Option 2: Keep Current Design but Rename Table

If refactoring is too complex, at minimum rename the table:

```sql
-- Rename to better reflect its purpose
ALTER TABLE user_push_tokens RENAME TO user_devices;
```

This is a minimal change that improves clarity without requiring major refactoring.

