#!/bin/bash
# Test Loki Connection Directly
# This script tests the connection to Grafana Loki Cloud without running the worker

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Loki Cloud Connection Test          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Load credentials from .dev.vars if it exists
if [ -f ".dev.vars" ]; then
    echo -e "${YELLOW}Loading credentials from .dev.vars...${NC}"
    source .dev.vars
else
    echo -e "${YELLOW}No .dev.vars file found.${NC}"
    echo "Please enter your Loki credentials:"
    read -p "LOKI_URL: " LOKI_URL
    read -p "LOKI_USERNAME: " LOKI_USERNAME
    read -sp "LOKI_PASSWORD: " LOKI_PASSWORD
    echo ""
fi

# Validate credentials
if [ -z "$LOKI_URL" ] || [ -z "$LOKI_USERNAME" ] || [ -z "$LOKI_PASSWORD" ]; then
    echo -e "${RED}✗ Missing required credentials${NC}"
    echo "Please set LOKI_URL, LOKI_USERNAME, and LOKI_PASSWORD"
    exit 1
fi

echo -e "${GREEN}✓ Credentials loaded${NC}\n"

# Prepare Loki endpoint
LOKI_ENDPOINT="${LOKI_URL%/}/loki/api/v1/push"
echo -e "${YELLOW}Configuration:${NC}"
echo "  Loki URL: $LOKI_URL"
echo "  Endpoint: $LOKI_ENDPOINT"
echo "  Username: $LOKI_USERNAME"
echo "  Password: ${LOKI_PASSWORD:0:10}... (hidden)"
echo ""

# Create test log entry
TIMESTAMP_NS=$(($(date +%s) * 1000000000))
TEST_MESSAGE="Test log entry from connection test script"
TEST_LOG_ENTRY_JSON=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "service": "stockly-api",
  "level": "INFO",
  "traceId": "test-connection-$(date +%s)",
  "userId": null,
  "path": "/test/loki-connection",
  "message": "$TEST_MESSAGE",
  "type": "general",
  "test": true
}
EOF
)

# Stringify the log entry (Loki expects the log line as a JSON string)
TEST_LOG_ENTRY_STRING=$(echo "$TEST_LOG_ENTRY_JSON" | jq -c . | jq -Rs .)

# Prepare Loki payload
PAYLOAD=$(cat <<EOF
{
  "streams": [
    {
      "stream": {
        "service": "stockly-api",
        "test": "connection-test",
        "source": "manual-script"
      },
      "values": [
        ["$TIMESTAMP_NS", $TEST_LOG_ENTRY_STRING]
      ]
    }
  ]
}
EOF
)

echo -e "${YELLOW}Test Payload:${NC}"
echo "$PAYLOAD" | jq .
echo ""

# Test 1: Basic Connection Test
echo -e "${YELLOW}[1/3] Testing Basic Connection...${NC}"
HTTP_CODE=$(curl -s -o /tmp/loki_response.txt -w "%{http_code}" \
  -X POST "$LOKI_ENDPOINT" \
  -H "Content-Type: application/json" \
  -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" -eq 204 ]; then
    echo -e "${GREEN}  ✓ Connection successful! (HTTP $HTTP_CODE)${NC}"
    echo "  Logs should appear in Grafana within 5-10 seconds"
else
    echo -e "${RED}  ✗ Connection failed (HTTP $HTTP_CODE)${NC}"
    echo "  Response:"
    cat /tmp/loki_response.txt
    echo ""
    exit 1
fi
echo ""

# Test 2: Verify Endpoint Accessibility
echo -e "${YELLOW}[2/3] Testing Endpoint Accessibility...${NC}"
BASE_URL="${LOKI_URL%/}"
if curl -s -f -u "$LOKI_USERNAME:$LOKI_PASSWORD" "$BASE_URL/ready" > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Loki endpoint is accessible${NC}"
else
    echo -e "${YELLOW}  ⚠ Ready endpoint check failed (this is OK, not all Loki instances have /ready)${NC}"
fi
echo ""

# Test 3: Query Test Log
echo -e "${YELLOW}[3/3] Verifying Log Was Received...${NC}"
echo "  Waiting 5 seconds for log to be indexed..."
sleep 5

# Try to query the log back (if query API is available)
QUERY_ENDPOINT="${LOKI_URL%/}/loki/api/v1/query_range"
QUERY_URL="${QUERY_ENDPOINT}?query={service=\"stockly-api\",test=\"connection-test\"}&limit=1"

QUERY_RESPONSE=$(curl -s -u "$LOKI_USERNAME:$LOKI_PASSWORD" "$QUERY_URL" 2>/dev/null)

if echo "$QUERY_RESPONSE" | jq -e '.data.result | length > 0' > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Log successfully retrieved from Loki!${NC}"
    echo "  Query result:"
    echo "$QUERY_RESPONSE" | jq '.data.result[0]' | head -10
else
    echo -e "${YELLOW}  ⚠ Could not query log back (this is OK - logs may take longer to index)${NC}"
    echo "  The log was sent successfully, but querying may require more time"
fi
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Test Summary                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}✓ Loki connection test completed${NC}\n"

echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Check Grafana Cloud for the test log"
echo "  2. Query: {service=\"stockly-api\", test=\"connection-test\"}"
echo "  3. Look for message: \"$TEST_MESSAGE\""
echo "  4. If you see the log, your connection is working!"
echo ""
echo -e "${YELLOW}To test with your Worker:${NC}"
echo "  1. Deploy with secrets: wrangler secret put LOKI_URL"
echo "  2. Make API calls to generate logs"
echo "  3. Check Grafana for logs with {service=\"stockly-api\"}"
echo ""

# Cleanup
rm -f /tmp/loki_response.txt

