@echo off
REM Receipt Analyzer API - Windows Docker Startup Script
REM This script manages Docker containers for the application

setlocal enabledelayedexpansion

REM Default environment
set ENVIRONMENT=%1
if "%ENVIRONMENT%"=="" set ENVIRONMENT=development

REM Default command
set COMMAND=%2
if "%COMMAND%"=="" set COMMAND=up

REM Function to show usage
if "%1"=="help" goto :show_usage
if "%1"=="--help" goto :show_usage
if "%1"=="-h" goto :show_usage

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed. Please install Docker first.
    exit /b 1
)

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

REM Execute command based on parameters
if "%COMMAND%"=="up" goto :start_containers
if "%COMMAND%"=="down" goto :stop_containers
if "%COMMAND%"=="restart" goto :restart_containers
if "%COMMAND%"=="logs" goto :show_logs
if "%COMMAND%"=="status" goto :show_status
if "%COMMAND%"=="clean" goto :clean_containers

echo [ERROR] Unknown command: %COMMAND%
goto :show_usage

:start_containers
if "%ENVIRONMENT%"=="production" (
    echo [DOCKER] Starting production environment...
    
    if not exist .env.production (
        echo [ERROR] .env.production file not found. Please create it with production settings.
        exit /b 1
    )
    
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d
    echo [INFO] Production environment started successfully!
    echo [INFO] API: http://localhost:3000
) else (
    echo [DOCKER] Starting development environment...
    
    if not exist .env (
        echo [WARNING] .env file not found. Creating from .env.example...
        copy .env.example .env
    )
    
    docker-compose up -d
    echo [INFO] Development environment started successfully!
    echo [INFO] API: http://localhost:3000
    echo [INFO] MongoDB: localhost:27017
    echo [INFO] Redis: localhost:6379
    echo [INFO] To view logs: docker-compose logs -f
    echo [INFO] To stop: docker-compose down
)
goto :end

:stop_containers
if "%ENVIRONMENT%"=="production" (
    echo [DOCKER] Stopping production environment...
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
) else (
    echo [DOCKER] Stopping development environment...
    docker-compose down
)
echo [INFO] Containers stopped successfully!
goto :end

:restart_containers
echo [DOCKER] Restarting %ENVIRONMENT% environment...
call :stop_containers
timeout /t 2 /nobreak >nul
call :start_containers
goto :end

:show_logs
if "%ENVIRONMENT%"=="production" (
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
) else (
    docker-compose logs -f
)
goto :end

:show_status
echo [DOCKER] Container status for %ENVIRONMENT% environment:
if "%ENVIRONMENT%"=="production" (
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
) else (
    docker-compose ps
)
goto :end

:clean_containers
echo [WARNING] This will remove all containers and volumes. Are you sure? (Y/N)
set /p response=
if /i "%response%"=="Y" (
    if "%ENVIRONMENT%"=="production" (
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml down -v --remove-orphans
    ) else (
        docker-compose down -v --remove-orphans
    )
    echo [INFO] Cleanup completed!
) else (
    echo [INFO] Cleanup cancelled.
)
goto :end

:show_usage
echo Usage: %0 [environment] [command]
echo.
echo Environments:
echo   development  - Start development environment (default)
echo   production   - Start production environment
echo.
echo Commands:
echo   up           - Start containers (default)
echo   down         - Stop containers
echo   restart      - Restart containers
echo   logs         - Show container logs
echo   status       - Show container status
echo   clean        - Remove containers and volumes
echo.
echo Examples:
echo   %0                          # Start development environment
echo   %0 development up           # Start development environment
echo   %0 production up            # Start production environment
echo   %0 development logs         # Show development logs
echo   %0 production down          # Stop production environment
goto :end

:end