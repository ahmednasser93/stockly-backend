-- Datalake Abstraction System Database Schema
-- Creates tables for managing datalakes, API endpoints, and their mappings

-- 1. Datalakes table: Stores configuration for each datalake (FMP, custom, etc.)
CREATE TABLE IF NOT EXISTS datalakes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  api_key TEXT,
  auth_type TEXT DEFAULT 'query_param', -- 'query_param', 'header', 'none'
  auth_key_name TEXT DEFAULT 'apikey', -- name of the key parameter/header
  is_active BOOLEAN DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 2. API Endpoints table: Stores all API endpoints that can be routed to different datalakes
CREATE TABLE IF NOT EXISTS api_endpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- e.g., 'quote', 'profile', 'key-executives'
  description TEXT,
  endpoint_path TEXT NOT NULL, -- e.g., '/quote', '/profile'
  http_method TEXT DEFAULT 'GET',
  requires_symbol BOOLEAN DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- 3. Datalake API Mappings table: Maps API endpoints to datalakes and tracks which is selected
CREATE TABLE IF NOT EXISTS datalake_api_mappings (
  id TEXT PRIMARY KEY,
  api_endpoint_id TEXT NOT NULL,
  datalake_id TEXT NOT NULL,
  is_selected BOOLEAN DEFAULT 0, -- Only one can be selected per api_endpoint_id
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (api_endpoint_id) REFERENCES api_endpoints(id),
  FOREIGN KEY (datalake_id) REFERENCES datalakes(id),
  UNIQUE(api_endpoint_id, datalake_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_datalake_api_mappings_endpoint ON datalake_api_mappings(api_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_datalake_api_mappings_datalake ON datalake_api_mappings(datalake_id);
CREATE INDEX IF NOT EXISTS idx_datalake_api_mappings_selected ON datalake_api_mappings(api_endpoint_id, is_selected) WHERE is_selected = 1;
