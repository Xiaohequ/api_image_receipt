#!/bin/bash

# Receipt Analyzer API - Startup Script
# This script starts the application with proper environment setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from .env.example..."
    cp .env.example .env
    print_warning "Please update .env file with your configuration before running the application."
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p uploads logs temp/uploads

# Build the application
print_status "Building the application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    print_error "Build failed. Please check for compilation errors."
    exit 1
fi

# Start the application
print_status "Starting Receipt Analyzer API..."
NODE_ENV=${NODE_ENV:-production} npm start