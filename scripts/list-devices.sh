#!/bin/bash
# Script to list all devices from the Stockly database
# Usage: ./list-devices.sh [--remote|--local]

set -e

# Default to remote if no argument provided
MODE="${1:---remote}"

if [ "$MODE" = "--local" ]; then
    echo "🔍 Querying LOCAL database for all devices..."
    wrangler d1 execute stockly --command "
        SELECT 
            upt.user_id, 
            upt.push_token, 
            upt.device_info,
            upt.device_type,
            upt.username,
            upt.created_at, 
            upt.updated_at
        FROM user_push_tokens upt
        ORDER BY upt.updated_at DESC;
    "
elif [ "$MODE" = "--remote" ]; then
    echo "🔍 Querying REMOTE database for all devices..."
    wrangler d1 execute stockly --remote --command "
        SELECT 
            upt.user_id, 
            upt.push_token, 
            upt.device_info,
            upt.device_type,
            upt.username,
            upt.created_at, 
            upt.updated_at
        FROM user_push_tokens upt
        ORDER BY upt.updated_at DESC;
    "
else
    echo "Usage: $0 [--remote|--local]"
    echo "  --remote  Query remote production database (default)"
    echo "  --local    Query local development database"
    exit 1
fi

