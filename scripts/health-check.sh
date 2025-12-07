#!/bin/bash

###############################################################################
# Nocturnal Health Check Script
# Checks health of all services and sends alerts if needed
# Usage: ./scripts/health-check.sh [environment]
###############################################################################

set -e

# Configuration
ENVIRONMENT=${1:-production}
API_URL=${API_URL:-"https://nocturnal.com"}
SLACK_WEBHOOK=${SLACK_WEBHOOK:-""}
PAGERDUTY_KEY=${PAGERDUTY_KEY:-""}

# Health check endpoints
ENDPOINTS=(
    "/api/health"
    "/api/v1/health"
    "/api/admin/health"
)

# Service checks
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/nocturnal"}
REDIS_HOST=${REDIS_HOST:-"localhost"}
REDIS_PORT=${REDIS_PORT:-"6379"}

# Thresholds
MAX_RESPONSE_TIME=3
MIN_SUCCESS_RATE=95

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Global status
ALL_CHECKS_PASSED=true

# Function to send Slack notification
send_slack_notification() {
    local message=$1
    local color=$2

    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
                \"text\": \"🚨 Nocturnal Health Check Alert\",
                \"attachments\": [{
                    \"color\": \"${color}\",
                    \"text\": \"${message}\",
                    \"fields\": [{
                        \"title\": \"Environment\",
                        \"value\": \"${ENVIRONMENT}\",
                        \"short\": true
                    }, {
                        \"title\": \"Time\",
                        \"value\": \"$(date)\",
                        \"short\": true
                    }]
                }]
            }" \
            --silent --output /dev/null
    fi
}

# Function to send PagerDuty alert
send_pagerduty_alert() {
    local message=$1

    if [ -n "$PAGERDUTY_KEY" ]; then
        curl -X POST "https://events.pagerduty.com/v2/enqueue" \
            -H 'Content-Type: application/json' \
            -d "{
                \"routing_key\": \"${PAGERDUTY_KEY}\",
                \"event_action\": \"trigger\",
                \"payload\": {
                    \"summary\": \"Nocturnal Health Check Failed\",
                    \"severity\": \"error\",
                    \"source\": \"${ENVIRONMENT}\",
                    \"custom_details\": {
                        \"message\": \"${message}\"
                    }
                }
            }" \
            --silent --output /dev/null
    fi
}

# Function to check API endpoint
check_api_endpoint() {
    local endpoint=$1
    local url="${API_URL}${endpoint}"

    echo -n "Checking ${endpoint}... "

    # Make request and measure response time
    START_TIME=$(date +%s%N)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${url}")
    END_TIME=$(date +%s%N)

    RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 )) # Convert to milliseconds

    if [ "$HTTP_CODE" = "200" ]; then
        if [ "$RESPONSE_TIME" -lt "$((MAX_RESPONSE_TIME * 1000))" ]; then
            echo -e "${GREEN}✅ OK${NC} (${RESPONSE_TIME}ms)"
        else
            echo -e "${YELLOW}⚠️  SLOW${NC} (${RESPONSE_TIME}ms)"
            ALL_CHECKS_PASSED=false
            send_slack_notification "Endpoint ${endpoint} is slow (${RESPONSE_TIME}ms)" "warning"
        fi
    else
        echo -e "${RED}❌ FAILED${NC} (HTTP ${HTTP_CODE})"
        ALL_CHECKS_PASSED=false
        send_slack_notification "Endpoint ${endpoint} returned HTTP ${HTTP_CODE}" "danger"
        send_pagerduty_alert "API endpoint ${endpoint} is down (HTTP ${HTTP_CODE})"
    fi
}

# Function to check MongoDB
check_mongodb() {
    echo -n "Checking MongoDB... "

    if mongosh "${MONGODB_URI}" --eval "db.serverStatus()" --quiet > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"

        # Check database size
        DB_SIZE=$(mongosh "${MONGODB_URI}" --eval "db.stats().dataSize" --quiet)
        echo "  Database size: $(numfmt --to=iec-i --suffix=B $DB_SIZE)"

        # Check collection counts
        echo "  Collections:"
        mongosh "${MONGODB_URI}" --eval "
            print('    Users: ' + db.users.countDocuments());
            print('    Duties: ' + db.duties.countDocuments());
            print('    Applications: ' + db.applications.countDocuments());
        " --quiet
    else
        echo -e "${RED}❌ FAILED${NC}"
        ALL_CHECKS_PASSED=false
        send_slack_notification "MongoDB is down or unreachable" "danger"
        send_pagerduty_alert "MongoDB database is down"
    fi
}

# Function to check Redis
check_redis() {
    echo -n "Checking Redis... "

    if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"

        # Check Redis memory
        REDIS_MEMORY=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        echo "  Memory used: ${REDIS_MEMORY}"

        # Check Redis keys
        REDIS_KEYS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" DBSIZE | cut -d: -f2)
        echo "  Keys: ${REDIS_KEYS}"
    else
        echo -e "${YELLOW}⚠️  NOT AVAILABLE${NC}"
        # Redis is optional, so don't fail entire check
    fi
}

# Function to check disk space
check_disk_space() {
    echo -n "Checking disk space... "

    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

    if [ "$DISK_USAGE" -lt 80 ]; then
        echo -e "${GREEN}✅ OK${NC} (${DISK_USAGE}% used)"
    elif [ "$DISK_USAGE" -lt 90 ]; then
        echo -e "${YELLOW}⚠️  WARNING${NC} (${DISK_USAGE}% used)"
        send_slack_notification "Disk space is running low (${DISK_USAGE}% used)" "warning"
    else
        echo -e "${RED}❌ CRITICAL${NC} (${DISK_USAGE}% used)"
        ALL_CHECKS_PASSED=false
        send_slack_notification "Disk space is critically low (${DISK_USAGE}% used)" "danger"
        send_pagerduty_alert "Disk space critically low (${DISK_USAGE}% used)"
    fi
}

# Function to check memory
check_memory() {
    echo -n "Checking memory... "

    if command -v free > /dev/null; then
        MEMORY_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')

        if [ "$MEMORY_USAGE" -lt 80 ]; then
            echo -e "${GREEN}✅ OK${NC} (${MEMORY_USAGE}% used)"
        elif [ "$MEMORY_USAGE" -lt 90 ]; then
            echo -e "${YELLOW}⚠️  WARNING${NC} (${MEMORY_USAGE}% used)"
            send_slack_notification "Memory usage is high (${MEMORY_USAGE}% used)" "warning"
        else
            echo -e "${RED}❌ CRITICAL${NC} (${MEMORY_USAGE}% used)"
            ALL_CHECKS_PASSED=false
            send_slack_notification "Memory usage is critically high (${MEMORY_USAGE}% used)" "danger"
        fi
    else
        echo -e "${YELLOW}⚠️  SKIPPED${NC} (free command not available)"
    fi
}

# Function to check SSL certificate
check_ssl_certificate() {
    echo -n "Checking SSL certificate... "

    DOMAIN=$(echo "$API_URL" | sed -e 's|^[^/]*//||' -e 's|/.*$||')

    if command -v openssl > /dev/null; then
        EXPIRY_DATE=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN":443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
        EXPIRY_TIMESTAMP=$(date -d "$EXPIRY_DATE" +%s)
        CURRENT_TIMESTAMP=$(date +%s)
        DAYS_UNTIL_EXPIRY=$(( (EXPIRY_TIMESTAMP - CURRENT_TIMESTAMP) / 86400 ))

        if [ "$DAYS_UNTIL_EXPIRY" -gt 30 ]; then
            echo -e "${GREEN}✅ OK${NC} (expires in ${DAYS_UNTIL_EXPIRY} days)"
        elif [ "$DAYS_UNTIL_EXPIRY" -gt 7 ]; then
            echo -e "${YELLOW}⚠️  WARNING${NC} (expires in ${DAYS_UNTIL_EXPIRY} days)"
            send_slack_notification "SSL certificate expires soon (${DAYS_UNTIL_EXPIRY} days)" "warning"
        else
            echo -e "${RED}❌ CRITICAL${NC} (expires in ${DAYS_UNTIL_EXPIRY} days)"
            ALL_CHECKS_PASSED=false
            send_slack_notification "SSL certificate expires very soon (${DAYS_UNTIL_EXPIRY} days)" "danger"
            send_pagerduty_alert "SSL certificate expires in ${DAYS_UNTIL_EXPIRY} days"
        fi
    else
        echo -e "${YELLOW}⚠️  SKIPPED${NC} (openssl not available)"
    fi
}

# Main execution
main() {
    echo "========================================="
    echo "Nocturnal Health Check"
    echo "Environment: ${ENVIRONMENT}"
    echo "Date: $(date)"
    echo "========================================="
    echo ""

    # Run all checks
    echo "API Endpoints:"
    for endpoint in "${ENDPOINTS[@]}"; do
        check_api_endpoint "$endpoint"
    done
    echo ""

    echo "Services:"
    check_mongodb
    check_redis
    echo ""

    echo "System Resources:"
    check_disk_space
    check_memory
    echo ""

    echo "Security:"
    check_ssl_certificate
    echo ""

    # Final status
    echo "========================================="
    if [ "$ALL_CHECKS_PASSED" = true ]; then
        echo -e "${GREEN}✅ All health checks passed${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some health checks failed${NC}"
        exit 1
    fi
}

# Run main function
main
