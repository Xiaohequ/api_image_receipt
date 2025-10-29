# Receipt Analyzer API - Makefile
# Common operations for development and deployment

.PHONY: help install build start dev test clean docker-up docker-down docker-logs setup-env

# Default target
help:
	@echo "Receipt Analyzer API - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  install     - Install dependencies"
	@echo "  build       - Build the application"
	@echo "  start       - Start production server"
	@echo "  dev         - Start development server with hot reload"
	@echo "  test        - Run tests"
	@echo ""
	@echo "Docker:"
	@echo "  docker-up   - Start Docker containers (development)"
	@echo "  docker-down - Stop Docker containers"
	@echo "  docker-logs - Show Docker logs"
	@echo "  docker-prod - Start production Docker environment"
	@echo ""
	@echo "Setup:"
	@echo "  setup-env   - Setup environment configuration"
	@echo "  setup-dirs  - Create necessary directories"
	@echo "  clean       - Clean build artifacts and temporary files"
	@echo ""
	@echo "Maintenance:"
	@echo "  lint        - Run ESLint"
	@echo "  lint-fix    - Fix ESLint issues"
	@echo "  health      - Check application health"

# Development commands
install:
	npm install

build:
	npm run build

start: build
	npm start

dev:
	npm run dev

test:
	npm test

# Docker commands
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

docker-clean:
	docker-compose down -v --remove-orphans
	docker system prune -f

# Setup commands
setup-env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file from .env.example"; \
		echo "Please update .env with your configuration"; \
	else \
		echo ".env file already exists"; \
	fi

setup-dirs:
	mkdir -p uploads logs temp/uploads
	@echo "Created necessary directories"

# Maintenance commands
lint:
	npm run lint

lint-fix:
	npm run lint:fix

clean:
	rm -rf dist
	rm -rf node_modules/.cache
	rm -rf uploads/*
	rm -rf logs/*
	rm -rf temp/*
	@echo "Cleaned build artifacts and temporary files"

# Health check
health:
	@echo "Checking application health..."
	@curl -s http://localhost:3000/health || echo "Application not running or not healthy"

# Full setup for new installation
setup: install setup-env setup-dirs build
	@echo "Setup complete! You can now run 'make dev' to start development server"

# Production deployment
deploy-prod: build docker-prod
	@echo "Production deployment started"
	@echo "Check logs with: make docker-logs"