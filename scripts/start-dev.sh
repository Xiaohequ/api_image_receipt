#!/bin/bash

# Receipt Analyzer API - Development Startup Script
# This script starts the application in development mode with hot reload

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

print_dev() {
    echo -e "${BLUE}[DEV]${NC} $1"
}

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from .env.example..."
    cp .env.example .env
    print_dev "Development environment configured. You can modify .env as needed."
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p uploads logs temp/uploads

# Set development environment
export NODE_ENV=development

print_dev "Starting Receipt Analyzer API in development mode..."
print_dev "Hot reload enabled - changes will be automatically detected"
print_dev "API will be available at: http://localhost:3000"
print_dev "Health check: http://localhost:3000/health"

# Start development server with hot reload
npm run dev