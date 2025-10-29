@echo off
REM Receipt Analyzer API - Windows Startup Script
REM This script starts the application with proper environment setup

setlocal enabledelayedexpansion

echo [INFO] Starting Receipt Analyzer API...

REM Check if .env file exists
if not exist .env (
    echo [WARNING] .env file not found. Creating from .env.example...
    copy .env.example .env
    echo [WARNING] Please update .env file with your configuration before running the application.
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

REM Build the application
echo [INFO] Building the application...
npm run build

REM Check if build was successful
if not exist dist (
    echo [ERROR] Build failed. Please check for compilation errors.
    exit /b 1
)

REM Start the application
echo [INFO] Starting Receipt Analyzer API...
if not defined NODE_ENV set NODE_ENV=production
npm start