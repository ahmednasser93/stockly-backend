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
            d.id as device_id,
            d.user_id, 
            d.device_info,
            d.device_type,
            u.username,
            dpt.push_token,
            d.created_at, 
            d.updated_at,
            d.is_active
        FROM devices d
        INNER JOIN device_push_tokens dpt ON d.id = dpt.device_id
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.is_active = 1 AND dpt.is_active = 1
        ORDER BY d.updated_at DESC;
    "
elif [ "$MODE" = "--remote" ]; then
    echo "🔍 Querying REMOTE database for all devices..."
    wrangler d1 execute stockly --remote --command "
        SELECT 
            d.id as device_id,
            d.user_id, 
            d.device_info,
            d.device_type,
            u.username,
            dpt.push_token,
            d.created_at, 
            d.updated_at,
            d.is_active
        FROM devices d
        INNER JOIN device_push_tokens dpt ON d.id = dpt.device_id
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.is_active = 1 AND dpt.is_active = 1
        ORDER BY d.updated_at DESC;
    "
else
    echo "Usage: $0 [--remote|--local]"
    echo "  --remote  Query remote production database (default)"
    echo "  --local    Query local development database"
    exit 1
fi

