#!/bin/bash
# Quick Loki Logging Test Script

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Loki Logging Integration Test       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Configuration
BASE_URL="${1:-http://localhost:8787}"
TIMESTAMP=$(date +%s)

echo -e "${YELLOW}Configuration:${NC}"
echo "  Base URL: $BASE_URL"
echo "  Timestamp: $TIMESTAMP"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking server...${NC}"
if ! curl -s -f "$BASE_URL/v1/api/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Server is not running at $BASE_URL${NC}"
    echo -e "${YELLOW}Start the server with: npm run dev${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}\n"

# Test 1: Health Check
echo -e "${YELLOW}[1/4] Testing Health Endpoint${NC}"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/v1/api/health")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}  ✓ Health check passed (HTTP $http_code)${NC}"
    echo "  Response: $body"
else
    echo -e "${RED}  ✗ Health check failed (HTTP $http_code)${NC}"
fi
echo ""

# Test 2: Get Stock Quote (generates API call logs)
echo -e "${YELLOW}[2/4] Testing Stock Quote (API Call Logs)${NC}"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/v1/api/get-stock?symbol=AAPL")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}  ✓ Stock quote retrieved (HTTP $http_code)${NC}"
    echo "  This should generate API call logs in Loki"
else
    echo -e "${RED}  ✗ Stock quote failed (HTTP $http_code)${NC}"
fi
echo ""

# Test 3: Search Stocks (generates D1 operation logs)
echo -e "${YELLOW}[3/4] Testing Stock Search (D1 Operation Logs)${NC}"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/v1/api/search-stock?query=apple")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}  ✓ Stock search completed (HTTP $http_code)${NC}"
    echo "  This should generate D1 operation logs in Loki"
else
    echo -e "${RED}  ✗ Stock search failed (HTTP $http_code)${NC}"
fi
echo ""

# Test 4: Direct Loki API Test (if credentials are available)
echo -e "${YELLOW}[4/4] Testing Direct Loki API${NC}"
if [ -f ".dev.vars" ]; then
    source .dev.vars
    if [ -n "$LOKI_URL" ] && [ -n "$LOKI_USERNAME" ] && [ -n "$LOKI_PASSWORD" ]; then
        loki_url="${LOKI_URL%/}/loki/api/v1/push"
        test_payload=$(cat <<EOF
{
  "streams": [
    {
      "stream": {
        "service": "stockly-api",
        "test": "manual",
        "timestamp": "$TIMESTAMP"
      },
      "values": [
        ["$(date +%s)000000000", "{\"message\":\"Manual test log entry\",\"level\":\"INFO\",\"test\":true}"]
      ]
    }
  ]
}
EOF
)
        
        loki_response=$(curl -s -w "\n%{http_code}" -X POST "$loki_url" \
          -H "Content-Type: application/json" \
          -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
          -d "$test_payload")
        
        loki_http_code=$(echo "$loki_response" | tail -n1)
        
        if [ "$loki_http_code" -eq 204 ]; then
            echo -e "${GREEN}  ✓ Direct Loki API test passed (HTTP $loki_http_code)${NC}"
            echo "  Logs should appear in Grafana within 5-10 seconds"
        else
            echo -e "${RED}  ✗ Direct Loki API test failed (HTTP $loki_http_code)${NC}"
            echo "  Response: $(echo "$loki_response" | sed '$d')"
        fi
    else
        echo -e "${YELLOW}  ⚠ Loki credentials not found in .dev.vars${NC}"
        echo "  Skipping direct Loki API test"
    fi
else
    echo -e "${YELLOW}  ⚠ .dev.vars file not found${NC}"
    echo "  Create it with LOKI_URL, LOKI_USERNAME, and LOKI_PASSWORD"
fi
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Test Summary                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Check console output for '[Loki Shipper]' messages"
echo "  2. Wait 5-10 seconds for logs to appear in Grafana"
echo "  3. Query Loki in Grafana: {service=\"stockly-api\"}"
echo "  4. Check for logs with timestamp: $TIMESTAMP"
echo ""
echo -e "${YELLOW}Grafana Query Examples:${NC}"
echo "  • All logs: {service=\"stockly-api\"}"
echo "  • Errors only: {service=\"stockly-api\", level=\"ERROR\"}"
echo "  • API calls: {service=\"stockly-api\"} |= \"api_call\""
echo "  • D1 operations: {service=\"stockly-api\"} |= \"data_operation\""
echo ""

