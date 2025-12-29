#!/bin/bash
# Script to list all tables in the Stockly database
# Usage: ./list-tables.sh [--remote|--local]

set -e

# Default to remote if no argument provided
MODE="${1:---remote}"

if [ "$MODE" = "--local" ]; then
    echo "🔍 Listing tables in LOCAL database..."
    wrangler d1 execute stockly --command "
        SELECT name 
        FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name;
    "
elif [ "$MODE" = "--remote" ]; then
    echo "🔍 Listing tables in REMOTE database..."
    wrangler d1 execute stockly --remote --command "
        SELECT name 
        FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name;
    "
else
    echo "Usage: $0 [--remote|--local]"
    echo "  --remote  Query remote production database (default)"
    echo "  --local    Query local development database"
    exit 1
fi


