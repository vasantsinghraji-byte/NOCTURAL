#!/bin/bash

# Nocturnal Healthcare Platform - Deployment Script
# Usage: ./scripts/deploy.sh [environment] [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
VERSION=${2:-latest}
PROJECT_NAME="nocturnal"
DOCKER_REGISTRY="ghcr.io"
IMAGE_NAME="${DOCKER_REGISTRY}/${PROJECT_NAME}"

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}Nocturnal Deployment Script${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Version: ${YELLOW}${VERSION}${NC}"
echo ""

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    echo -e "${RED}Error: Invalid environment. Use: development, staging, or production${NC}"
    exit 1
fi

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        exit 1
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed${NC}"
        exit 1
    fi

    # Check environment file
    if [ ! -f ".env.${ENVIRONMENT}" ]; then
        echo -e "${RED}Error: .env.${ENVIRONMENT} file not found${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Prerequisites check passed${NC}\n"
}

# Function to backup current deployment
backup_deployment() {
    echo -e "${YELLOW}Creating backup...${NC}"

    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    # Backup database
    if docker ps | grep -q "${PROJECT_NAME}-mongodb"; then
        docker exec "${PROJECT_NAME}-mongodb" mongodump --out /tmp/backup
        docker cp "${PROJECT_NAME}-mongodb:/tmp/backup" "$BACKUP_DIR/mongodb"
        echo -e "${GREEN}✓ Database backup created${NC}"
    fi

    # Backup uploads
    if [ -d "uploads" ]; then
        cp -r uploads "$BACKUP_DIR/"
        echo -e "${GREEN}✓ Uploads backup created${NC}"
    fi

    echo -e "${GREEN}✓ Backup completed: $BACKUP_DIR${NC}\n"
}

# Function to pull latest images
pull_images() {
    echo -e "${YELLOW}Pulling Docker images...${NC}"

    if [ "$ENVIRONMENT" == "development" ]; then
        docker-compose pull || true
    else
        docker pull "${IMAGE_NAME}:${VERSION}" || {
            echo -e "${RED}Error: Failed to pull image${NC}"
            exit 1
        }
    fi

    echo -e "${GREEN}✓ Images pulled successfully${NC}\n"
}

# Function to run database migrations
run_migrations() {
    echo -e "${YELLOW}Running database migrations...${NC}"

    docker-compose run --rm api npm run db:migrate || {
        echo -e "${RED}Error: Migrations failed${NC}"
        exit 1
    }

    echo -e "${GREEN}✓ Migrations completed${NC}\n"
}

# Function to deploy
deploy() {
    echo -e "${YELLOW}Deploying ${ENVIRONMENT} environment...${NC}"

    # Stop current containers
    docker-compose down || true

    # Start new containers
    if [ "$ENVIRONMENT" == "production" ]; then
        docker-compose -f docker-compose.prod.yml up -d
    else
        docker-compose up -d
    fi

    echo -e "${GREEN}✓ Deployment started${NC}\n"
}

# Function to health check
health_check() {
    echo -e "${YELLOW}Running health checks...${NC}"

    MAX_ATTEMPTS=30
    ATTEMPT=0

    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if curl -f http://localhost:5000/api/v1/health &> /dev/null; then
            echo -e "${GREEN}✓ Health check passed${NC}\n"
            return 0
        fi

        ATTEMPT=$((ATTEMPT + 1))
        echo -e "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
        sleep 2
    done

    echo -e "${RED}Error: Health check failed${NC}"
    return 1
}

# Function to show deployment status
show_status() {
    echo -e "${YELLOW}Deployment Status:${NC}"
    docker-compose ps
    echo ""
}

# Function to rollback
rollback() {
    echo -e "${RED}Rolling back deployment...${NC}"

    # Find latest backup
    LATEST_BACKUP=$(ls -t backups/ | head -1)

    if [ -z "$LATEST_BACKUP" ]; then
        echo -e "${RED}Error: No backup found${NC}"
        exit 1
    fi

    echo -e "Using backup: ${YELLOW}$LATEST_BACKUP${NC}"

    # Stop containers
    docker-compose down

    # Restore database
    if [ -d "backups/$LATEST_BACKUP/mongodb" ]; then
        docker-compose up -d mongodb
        sleep 5
        docker cp "backups/$LATEST_BACKUP/mongodb" "${PROJECT_NAME}-mongodb:/tmp/restore"
        docker exec "${PROJECT_NAME}-mongodb" mongorestore /tmp/restore
    fi

    # Restore uploads
    if [ -d "backups/$LATEST_BACKUP/uploads" ]; then
        rm -rf uploads
        cp -r "backups/$LATEST_BACKUP/uploads" .
    fi

    # Start with previous version
    docker-compose up -d

    echo -e "${GREEN}✓ Rollback completed${NC}"
}

# Main deployment flow
main() {
    check_prerequisites

    if [ "$ENVIRONMENT" == "production" ]; then
        read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Deployment cancelled"
            exit 0
        fi
    fi

    backup_deployment
    pull_images
    deploy

    if health_check; then
        run_migrations
        show_status
        echo -e "${GREEN}=====================================${NC}"
        echo -e "${GREEN}Deployment completed successfully!${NC}"
        echo -e "${GREEN}=====================================${NC}"
    else
        echo -e "${RED}=====================================${NC}"
        echo -e "${RED}Deployment failed!${NC}"
        echo -e "${RED}=====================================${NC}"

        read -p "Do you want to rollback? (yes/no): " rollback_confirm
        if [ "$rollback_confirm" == "yes" ]; then
            rollback
        fi

        exit 1
    fi
}

# Handle script arguments
case "${3:-deploy}" in
    rollback)
        rollback
        ;;
    status)
        show_status
        ;;
    *)
        main
        ;;
esac
