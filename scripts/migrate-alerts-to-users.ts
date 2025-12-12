/**
 * Migration script to associate existing alerts with users
 * 
 * This script attempts to link alerts to users via push tokens.
 * If an alert's target (push token) exists in user_push_tokens,
 * the alert will be associated with that user.
 * 
 * Alerts without matching push tokens will remain with user_id = NULL
 * (or can be deleted/assigned to an admin user if needed).
 * 
 * Usage:
 *   npx tsx api/scripts/migrate-alerts-to-users.ts
 * 
 * Or with wrangler:
 *   wrangler d1 execute stockly --file=api/scripts/migrate-alerts-to-users.sql
 */

import { execSync } from "child_process";

const SQL_MIGRATION = `
-- Migration script to associate existing alerts with users via push tokens
-- This links alerts to users by matching alert.target (push token) with user_push_tokens.push_token

-- Step 1: Update alerts that have matching push tokens
UPDATE alerts
SET user_id = (
  SELECT user_id
  FROM user_push_tokens
  WHERE user_push_tokens.push_token = alerts.target
  LIMIT 1
)
WHERE user_id IS NULL
  AND target IS NOT NULL
  AND target != ''
  AND EXISTS (
    SELECT 1
    FROM user_push_tokens
    WHERE user_push_tokens.push_token = alerts.target
  );

-- Step 2: Count results
-- You can run this query separately to see the migration results:
-- SELECT 
--   COUNT(*) as total_alerts,
--   COUNT(user_id) as alerts_with_user,
--   COUNT(*) - COUNT(user_id) as orphaned_alerts
-- FROM alerts;
`;

console.log("Migration SQL:");
console.log(SQL_MIGRATION);
console.log("\nTo execute this migration, run:");
console.log("wrangler d1 execute stockly --command=\"" + SQL_MIGRATION.replace(/\n/g, " ") + "\"");
console.log("\nOr save the SQL to a file and run:");
console.log("wrangler d1 execute stockly --file=migration.sql");
