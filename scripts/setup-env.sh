#!/bin/bash

# Receipt Analyzer API - Environment Setup Script
# This script helps configure environment variables for different environments

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

print_setup() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

# Function to generate random string
generate_random() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

# Function to setup development environment
setup_development() {
    print_setup "Setting up development environment..."
    
    if [ -f .env ]; then
        print_warning ".env file already exists. Creating backup..."
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    fi
    
    cp .env.example .env
    
    # Update development-specific values
    sed -i 's/NODE_ENV=development/NODE_ENV=development/' .env
    sed -i 's/LOG_LEVEL=info/LOG_LEVEL=debug/' .env
    sed -i 's/ENABLE_INPUT_SANITIZATION=true/ENABLE_INPUT_SANITIZATION=true/' .env
    sed -i 's/LOG_SENSITIVE_DATA=false/LOG_SENSITIVE_DATA=false/' .env
    
    # Generate development API key
    DEV_API_KEY="dev-$(generate_random)"
    sed -i "s/API_KEYS=/API_KEYS=${DEV_API_KEY}:dev-client:Development Client/" .env
    
    print_status "Development environment configured!"
    print_status "Development API Key: $DEV_API_KEY"
    print_status "You can modify .env file for additional customization."
}

# Function to setup production environment
setup_production() {
    print_setup "Setting up production environment..."
    
    if [ -f .env.production ]; then
        print_warning ".env.production file already exists. Creating backup..."
        cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)
    fi
    
    cp .env.example .env.production
    
    # Generate secure values for production
    JWT_SECRET=$(generate_random)
    MONGO_PASSWORD=$(generate_random)
    REDIS_PASSWORD=$(generate_random)
    API_KEY=$(generate_random)
    
    # Update production values
    sed -i 's/NODE_ENV=development/NODE_ENV=production/' .env.production
    sed -i 's/LOG_LEVEL=info/LOG_LEVEL=warn/' .env.production
    sed -i "s/JWT_SECRET=your-super-secret-jwt-key-change-in-production/JWT_SECRET=${JWT_SECRET}/" .env.production
    sed -i "s/API_KEYS=/API_KEYS=${API_KEY}:prod-client:Production Client/" .env.production
    sed -i 's/LOG_SENSITIVE_DATA=false/LOG_SENSITIVE_DATA=false/' .env.production
    
    # Add production-specific variables
    echo "" >> .env.production
    echo "# Production Database Credentials" >> .env.production
    echo "MONGO_ROOT_USERNAME=admin" >> .env.production
    echo "MONGO_ROOT_PASSWORD=${MONGO_PASSWORD}" >> .env.production
    echo "REDIS_PASSWORD=${REDIS_PASSWORD}" >> .env.production
    
    print_status "Production environment configured!"
    print_warning "IMPORTANT: Store these credentials securely!"
    print_warning "MongoDB Password: $MONGO_PASSWORD"
    print_warning "Redis Password: $REDIS_PASSWORD"
    print_warning "JWT Secret: $JWT_SECRET"
    print_warning "Production API Key: $API_KEY"
    print_status "Configuration saved to .env.production"
}

# Function to setup testing environment
setup_testing() {
    print_setup "Setting up testing environment..."
    
    if [ -f .env.test ]; then
        print_warning ".env.test file already exists. Creating backup..."
        cp .env.test .env.test.backup.$(date +%Y%m%d_%H%M%S)
    fi
    
    cp .env.example .env.test
    
    # Update testing values
    sed -i 's/NODE_ENV=development/NODE_ENV=test/' .env.test
    sed -i 's/LOG_LEVEL=info/LOG_LEVEL=error/' .env.test
    sed -i 's/MONGODB_URI=mongodb:\/\/localhost:27017\/receipt-analyzer/MONGODB_URI=mongodb:\/\/localhost:27017\/receipt-analyzer-test/' .env.test
    sed -i 's/REDIS_PORT=6379/REDIS_PORT=6380/' .env.test
    
    # Generate test API key
    TEST_API_KEY="test-$(generate_random)"
    sed -i "s/API_KEYS=/API_KEYS=${TEST_API_KEY}:test-client:Test Client/" .env.test
    
    print_status "Testing environment configured!"
    print_status "Test API Key: $TEST_API_KEY"
    print_status "Configuration saved to .env.test"
}

# Function to validate environment
validate_environment() {
    local env_file=$1
    print_setup "Validating environment configuration: $env_file"
    
    if [ ! -f "$env_file" ]; then
        print_error "Environment file $env_file not found!"
        return 1
    fi
    
    # Check required variables
    required_vars=("NODE_ENV" "PORT" "MONGODB_URI" "REDIS_HOST" "JWT_SECRET")
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$env_file"; then
            print_error "Required variable $var not found in $env_file"
            return 1
        fi
    done
    
    print_status "Environment configuration is valid!"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [environment]"
    echo ""
    echo "Environments:"
    echo "  development  - Setup development environment (.env)"
    echo "  production   - Setup production environment (.env.production)"
    echo "  testing      - Setup testing environment (.env.test)"
    echo "  validate     - Validate existing environment files"
    echo ""
    echo "Examples:"
    echo "  $0 development"
    echo "  $0 production"
    echo "  $0 validate"
}

# Main execution
ENVIRONMENT=${1:-development}

case $ENVIRONMENT in
    development|dev)
        setup_development
        ;;
    production|prod)
        setup_production
        ;;
    testing|test)
        setup_testing
        ;;
    validate)
        validate_environment ".env"
        if [ -f ".env.production" ]; then
            validate_environment ".env.production"
        fi
        if [ -f ".env.test" ]; then
            validate_environment ".env.test"
        fi
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown environment: $ENVIRONMENT"
        show_usage
        exit 1
        ;;
esac