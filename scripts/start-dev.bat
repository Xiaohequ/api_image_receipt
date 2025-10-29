@echo off
REM Receipt Analyzer API - Windows Development Startup Script
REM This script starts the application in development mode with hot reload

setlocal enabledelayedexpansion

echo [DEV] Starting Receipt Analyzer API in development mode...

REM Check if .env file exists
if not exist .env (
    echo [WARNING] .env file not found. Creating from .env.example...
    copy .env.example .env
    echo [DEV] Development environment configured. You can modify .env as needed.
)

REM Check if node_modules exists
if not exist node_modules (
    echo [INFO] Installing dependencies...
    npm install
)

REM Create necessary directories
echo [INFO] Creating necessary directories...
if not exist uploads mkdir uploads
if not exist logs mkdir logs
if not exist temp\uploads mkdir temp\uploads

REM Set development environment
set NODE_ENV=development

echo [DEV] Hot reload enabled - changes will be automatically detected
echo [DEV] API will be available at: http://localhost:3000
echo [DEV] Health check: http://localhost:3000/health

REM Start development server with hot reload
npm run dev