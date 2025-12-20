#!/bin/bash
# Script to get all user information and usernames from the database

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "📊 Querying all user information from database..."
echo "=================================================="
echo ""

# Get all users with all their information
echo "👥 All Users (Full Information):"
echo "---------------------------------"
wrangler d1 execute stockly --remote --command="
SELECT 
  id,
  email,
  username,
  name,
  picture,
  datetime(created_at, 'unixepoch') as created_at,
  datetime(updated_at, 'unixepoch') as updated_at,
  datetime(last_login_at, 'unixepoch') as last_login_at
FROM users
ORDER BY created_at DESC;
"

echo ""
echo "📝 Users with Usernames:"
echo "------------------------"
wrangler d1 execute stockly --remote --command="
SELECT 
  id,
  email,
  username,
  name,
  datetime(created_at, 'unixepoch') as created_at
FROM users
WHERE username IS NOT NULL
ORDER BY username;
"

echo ""
echo "📧 Users without Usernames:"
echo "----------------------------"
wrangler d1 execute stockly --remote --command="
SELECT 
  id,
  email,
  name,
  datetime(created_at, 'unixepoch') as created_at
FROM users
WHERE username IS NULL
ORDER BY created_at DESC;
"

echo ""
echo "📊 User Statistics Summary:"
echo "---------------------------"
wrangler d1 execute stockly --remote --command="
SELECT 
  COUNT(*) as total_users,
  COUNT(username) as users_with_username,
  COUNT(*) - COUNT(username) as users_without_username,
  COUNT(DISTINCT email) as unique_emails
FROM users;
"
