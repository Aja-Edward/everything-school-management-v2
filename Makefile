.PHONY: help install install-backend install-frontend run run-backend run-frontend \
        migrate makemigrations createsuperuser shell dbshell \
        build lint lint-backend lint-frontend type-check test \
        clean clean-pyc clean-node docker-up docker-down docker-build docker-clean \
        venv freeze collectstatic

# Default target
help:
	@echo "School App - Available Commands"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make venv              - Create Python virtual environment"
	@echo "  make install           - Install all dependencies (frontend + backend)"
	@echo "  make install-backend   - Install Python dependencies"
	@echo "  make install-frontend  - Install Node.js dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make run               - Run both frontend and backend servers"
	@echo "  make run-backend       - Run Django development server"
	@echo "  make run-frontend      - Run Vite development server"
	@echo ""
	@echo "Database:"
	@echo "  make migrate           - Apply database migrations"
	@echo "  make makemigrations    - Create new migrations"
	@echo "  make createsuperuser   - Create Django superuser"
	@echo "  make shell             - Open Django shell"
	@echo "  make dbshell           - Open database shell"
	@echo ""
	@echo "Build & Quality:"
	@echo "  make build             - Build frontend for production"
	@echo "  make lint              - Run linters for both frontend and backend"
	@echo "  make lint-frontend     - Run ESLint on frontend"
	@echo "  make type-check        - Run TypeScript type checking"
	@echo "  make collectstatic     - Collect Django static files"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up         - Start Docker containers"
	@echo "  make docker-down       - Stop Docker containers"
	@echo "  make docker-build      - Build Docker images"
	@echo "  make docker-clean      - Clean up Docker containers and networks"
	@echo "  make docker-dev        - Start Docker dev environment"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean             - Remove all generated files"
	@echo "  make clean-pyc         - Remove Python cache files"
	@echo "  make clean-node        - Remove node_modules"
	@echo ""
	@echo "Utilities:"
	@echo "  make freeze            - Update requirements.txt"

# ============================================================================
# Setup & Installation
# ============================================================================

venv:
	python3 -m venv backend/venv
	@echo "Virtual environment created. Activate with:"
	@echo "  source backend/venv/bin/activate"

install: install-backend install-frontend

install-backend:
	cd backend && pip install -r requirements.txt

install-frontend:
	cd frontend && pnpm install

# ============================================================================
# Development Servers
# ============================================================================

run:
	@echo "Starting both servers..."
	@make -j2 run-backend run-frontend

run-backend:
	cd backend && python manage.py runserver

run-frontend:
	cd frontend && pnpm dev

# ============================================================================
# Database Operations
# ============================================================================

migrate:
	cd backend && python manage.py migrate

makemigrations:
	cd backend && python manage.py makemigrations

createsuperuser:
	cd backend && python manage.py createsuperuser

shell:
	cd backend && python manage.py shell

dbshell:
	cd backend && python manage.py dbshell

# ============================================================================
# Build & Quality
# ============================================================================

build:
	cd frontend && pnpm build

lint: lint-frontend

lint-frontend:
	cd frontend && pnpm lint

type-check:
	cd frontend && pnpm type-check

collectstatic:
	cd backend && python manage.py collectstatic --noinput

# ============================================================================
# Docker
# ============================================================================

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-build:
	docker-compose build

docker-clean:
	docker-compose -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
	docker network prune -f

docker-dev:
	docker-compose -f docker-compose.dev.yml up

docker-prod:
	docker-compose -f docker-compose-production.yml up -d

# ============================================================================
# Cleanup
# ============================================================================

clean: clean-pyc clean-node

clean-pyc:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyo" -delete

clean-node:
	rm -rf frontend/node_modules
	rm -rf frontend/dist

# ============================================================================
# Utilities
# ============================================================================

freeze:
	cd backend && pip freeze > requirements.txt
