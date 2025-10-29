#!/bin/bash

# Receipt Analyzer API - Docker Startup Script
# This script manages Docker containers for the application

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_docker() {
    echo -e "${BLUE}[DOCKER]${NC} $1"
}

# Default environment
ENVIRONMENT=${1:-development}

# Function to show usage
show_usage() {
    echo "Usage: $0 [environment] [command]"
    echo ""
    echo "Environments:"
    echo "  development  - Start development environment (default)"
    echo "  production   - Start production environment"
    echo ""
    echo "Commands:"
    echo "  up           - Start containers (default)"
    echo "  down         - Stop containers"
    echo "  restart      - Restart containers"
    echo "  logs         - Show container logs"
    echo "  status       - Show container status"
    echo "  clean        - Remove containers and volumes"
    echo ""
    echo "Examples:"
    echo "  $0                          # Start development environment"
    echo "  $0 development up           # Start development environment"
    echo "  $0 production up            # Start production environment"
    echo "  $0 development logs         # Show development logs"
    echo "  $0 production down          # Stop production environment"
}

# Parse command
COMMAND=${2:-up}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Function to start development environment
start_development() {
    print_docker "Starting development environment..."
    
    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from .env.example..."
        cp .env.example .env
    fi
    
    # Start containers
    docker-compose up -d
    
    print_status "Development environment started successfully!"
    print_status "API: http://localhost:3000"
    print_status "MongoDB: localhost:27017"
    print_status "Redis: localhost:6379"
    print_status ""
    print_status "To view logs: docker-compose logs -f"
    print_status "To stop: docker-compose down"
}

# Function to start production environment
start_production() {
    print_docker "Starting production environment..."
    
    # Check for required environment variables
    if [ ! -f .env.production ]; then
        print_error ".env.production file not found. Please create it with production settings."
        exit 1
    fi
    
    # Start containers with production configuration
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d
    
    print_status "Production environment started successfully!"
    print_status "API: http://localhost:3000"
    print_status ""
    print_status "To view logs: docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
    print_status "To stop: docker-compose -f docker-compose.yml -f docker-compose.prod.yml down"
}

# Function to stop containers
stop_containers() {
    if [ "$ENVIRONMENT" = "production" ]; then
        print_docker "Stopping production environment..."
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
    else
        print_docker "Stopping development environment..."
        docker-compose down
    fi
    print_status "Containers stopped successfully!"
}

# Function to restart containers
restart_containers() {
    print_docker "Restarting $ENVIRONMENT environment..."
    stop_containers
    sleep 2
    if [ "$ENVIRONMENT" = "production" ]; then
        start_production
    else
        start_development
    fi
}

# Function to show logs
show_logs() {
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
    else
        docker-compose logs -f
    fi
}

# Function to show status
show_status() {
    print_docker "Container status for $ENVIRONMENT environment:"
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
    else
        docker-compose ps
    fi
}

# Function to clean up
clean_containers() {
    print_warning "This will remove all containers and volumes. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        if [ "$ENVIRONMENT" = "production" ]; then
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml down -v --remove-orphans
        else
            docker-compose down -v --remove-orphans
        fi
        print_status "Cleanup completed!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Main execution
case $COMMAND in
    up)
        if [ "$ENVIRONMENT" = "production" ]; then
            start_production
        else
            start_development
        fi
        ;;
    down)
        stop_containers
        ;;
    restart)
        restart_containers
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    clean)
        clean_containers
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac