#!/bin/bash
# Query Loki to see what logs are actually stored

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Query Loki for Logs                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Load credentials
if [ -f ".dev.vars" ]; then
    source .dev.vars
else
    echo -e "${RED}✗ .dev.vars file not found${NC}"
    exit 1
fi

LOKI_BASE="${LOKI_URL%/}"
QUERY_ENDPOINT="${LOKI_BASE}/loki/api/v1"

echo -e "${YELLOW}Querying Loki at: $LOKI_BASE${NC}\n"

# Query 1: Get all labels
echo -e "${YELLOW}[1/4] Getting available labels...${NC}"
LABELS_RESPONSE=$(curl -s -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  "${QUERY_ENDPOINT}/labels")

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Labels retrieved${NC}"
    echo "$LABELS_RESPONSE" | jq '.data[]' | head -20
else
    echo -e "${RED}✗ Failed to get labels${NC}"
fi
echo ""

# Query 2: Get label values for "service"
echo -e "${YELLOW}[2/4] Getting values for label 'service'...${NC}"
SERVICE_VALUES=$(curl -s -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  "${QUERY_ENDPOINT}/label/service/values")

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Service label values:${NC}"
    echo "$SERVICE_VALUES" | jq '.data[]'
else
    echo -e "${RED}✗ Failed to get service values${NC}"
fi
echo ""

# Query 3: Query recent logs (last 1 hour)
echo -e "${YELLOW}[3/4] Querying recent logs (last 1 hour)...${NC}"
END_TIME=$(date +%s)
START_TIME=$((END_TIME - 3600)) # 1 hour ago

QUERY_RESPONSE=$(curl -s -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  "${QUERY_ENDPOINT}/query_range?query={service=\"stockly-api\"}&start=${START_TIME}000000000&end=${END_TIME}000000000&limit=10")

if [ $? -eq 0 ]; then
    RESULT_COUNT=$(echo "$QUERY_RESPONSE" | jq '.data.result | length')
    if [ "$RESULT_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $RESULT_COUNT log streams${NC}"
        echo "$QUERY_RESPONSE" | jq '.data.result[0] | {stream: .stream, entries: (.values | length)}'
        echo ""
        echo -e "${YELLOW}Sample log entry:${NC}"
        echo "$QUERY_RESPONSE" | jq -r '.data.result[0].values[0][1]' | jq . | head -10
    else
        echo -e "${YELLOW}⚠ No logs found with {service=\"stockly-api\"}${NC}"
        echo ""
        echo -e "${YELLOW}Trying broader query: {}${NC}"
        BROAD_QUERY=$(curl -s -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
          "${QUERY_ENDPOINT}/query_range?query={}&start=${START_TIME}000000000&end=${END_TIME}000000000&limit=5")
        BROAD_COUNT=$(echo "$BROAD_QUERY" | jq '.data.result | length')
        if [ "$BROAD_COUNT" -gt 0 ]; then
            echo -e "${GREEN}✓ Found $BROAD_COUNT log streams (any service)${NC}"
            echo "$BROAD_QUERY" | jq '.data.result[] | .stream' | head -5
        else
            echo -e "${RED}✗ No logs found at all in the last hour${NC}"
        fi
    fi
else
    echo -e "${RED}✗ Query failed${NC}"
fi
echo ""

# Query 4: Send a test log and immediately query it
echo -e "${YELLOW}[4/4] Sending test log and querying immediately...${NC}"
TIMESTAMP_NS=$(($(date +%s) * 1000000000))
TEST_LOG='{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'","service":"stockly-api","level":"INFO","traceId":"query-test-'$(date +%s)'","message":"Query test log","type":"general"}'

PAYLOAD=$(cat <<EOF
{
  "streams": [{
    "stream": {"service": "stockly-api", "test": "query-test"},
    "values": [["$TIMESTAMP_NS", $(echo "$TEST_LOG" | jq -c . | jq -Rs .)]]
  }]
}
EOF
)

# Send log
curl -s -X POST "${QUERY_ENDPOINT}/push" \
  -H "Content-Type: application/json" \
  -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  -d "$PAYLOAD" > /dev/null

echo "  Test log sent, waiting 3 seconds..."
sleep 3

# Query it back
QUERY_TEST=$(curl -s -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  "${QUERY_ENDPOINT}/query_range?query={service=\"stockly-api\",test=\"query-test\"}&start=$((TIMESTAMP_NS - 1000000000))&end=$((TIMESTAMP_NS + 1000000000))&limit=1")

TEST_COUNT=$(echo "$QUERY_TEST" | jq '.data.result | length')
if [ "$TEST_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Test log found!${NC}"
    echo "$QUERY_TEST" | jq -r '.data.result[0].values[0][1]' | jq .
else
    echo -e "${YELLOW}⚠ Test log not found yet (may need more time to index)${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Summary                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

echo -e "${YELLOW}Grafana Query Tips:${NC}"
echo "  1. Go to: Explore → Loki"
echo "  2. Try these queries:"
echo "     • {service=\"stockly-api\"}"
echo "     • {} (all logs)"
echo "     • {test=\"connection-test\"}"
echo "  3. Set time range: Last 15 minutes or Last 1 hour"
echo "  4. Check if logs exist with: {service=~\"stockly.*\"}"
echo ""

