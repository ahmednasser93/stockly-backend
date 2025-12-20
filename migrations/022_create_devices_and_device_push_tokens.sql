-- Migration 022: Create devices and device_push_tokens tables
-- This migration creates the new schema for separating device information from push tokens
-- This enables multiple push tokens per device and better device lifecycle management

-- Devices table: Core device information
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_identifier TEXT, -- Unique device identifier (hash of user_id + device_info)
  device_name TEXT, -- User-friendly name (optional, for future use)
  device_info TEXT, -- Full device info string (e.g., "OPPO CPH2305 (Android 14)")
  device_type TEXT, -- 'android', 'ios', 'web', 'unknown'
  is_active BOOLEAN DEFAULT 1, -- Whether device is currently active
  last_seen_at TEXT, -- Last time device was seen/used
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Device push tokens: Multiple tokens per device
CREATE TABLE IF NOT EXISTS device_push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  push_token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT 1, -- Whether this token is currently valid
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Indexes for devices table
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_identifier ON devices(device_identifier);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_is_active ON devices(is_active);
CREATE INDEX IF NOT EXISTS idx_devices_user_device_info ON devices(user_id, device_info);

-- Indexes for device_push_tokens table
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_device_id ON device_push_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_push_token ON device_push_tokens(push_token);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_is_active ON device_push_tokens(is_active);

