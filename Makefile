# ============================================================
# ARIA — Project orchestration
# ============================================================
# Run `make help` for the full list of targets.
# ============================================================

# Use bash for sane shell semantics
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# ---- Config -------------------------------------------------
COMPOSE        ?= docker compose
BACKEND_DIR    := backend
FRONTEND_DIR   := frontend
VENV           := $(BACKEND_DIR)/.venv
VENV_BIN       := $(abspath $(VENV))/bin
PY             := $(VENV_BIN)/python
PIP            := $(VENV_BIN)/pip

# Pretty colors
C_RESET  := \033[0m
C_BOLD   := \033[1m
C_CYAN   := \033[36m
C_GREEN  := \033[32m
C_YELLOW := \033[33m

# ---- Help ---------------------------------------------------
.PHONY: help
help: ## Show this help message
	@printf "$(C_BOLD)ARIA$(C_RESET) — make targets\n\n"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_.-]+:.*##/ {printf "  $(C_CYAN)%-22s$(C_RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\n$(C_BOLD)Quickstart$(C_RESET): make install && make up\n\n"

# ============================================================
# Install / setup
# ============================================================
.PHONY: install install.backend install.frontend install.hooks

install: install.backend install.frontend ## Install host deps for backend (.venv) + frontend (node_modules)
	@printf "$(C_GREEN)✓ All host deps installed$(C_RESET)\n"

install.backend: ## Create backend venv and install requirements + dev tools
	@printf "$(C_CYAN)→ Backend venv$(C_RESET)\n"
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) install --upgrade pip --quiet
	@$(PIP) install -r $(BACKEND_DIR)/requirements.txt --quiet
	@$(PIP) install -r $(BACKEND_DIR)/requirements-dev.txt --quiet
	@printf "$(C_GREEN)  ✓ $(VENV) ready (point VS Code Python interpreter here)$(C_RESET)\n"

install.frontend: ## Install frontend npm deps locally (so VS Code can resolve types)
	@printf "$(C_CYAN)→ Frontend npm install$(C_RESET)\n"
	@cd $(FRONTEND_DIR) && npm install --no-audit --no-fund

# ============================================================
# Dev — Docker stack with hot reload
# ============================================================
.PHONY: up up.backend up.frontend down restart logs ps build rebuild

up: ## Start all services (db, migrate, simulator, backend, frontend) — hot reload enabled
	$(COMPOSE) up -d
	@printf "\n$(C_GREEN)✓ Stack up$(C_RESET)\n"
	@printf "  • Frontend  $(C_CYAN)http://localhost:5173$(C_RESET)\n"
	@printf "  • Backend   $(C_CYAN)http://localhost:8000$(C_RESET)  (docs: /docs)\n"

up.backend: ## Start only db + migrate + backend (no simulator/frontend)
	$(COMPOSE) up -d timescaledb migrate backend

up.frontend: ## Start only the frontend container
	$(COMPOSE) up -d frontend

down: ## Stop all services
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) restart

logs: ## Tail logs from all services (Ctrl-C to stop)
	$(COMPOSE) logs -f --tail=50

ps: ## Show service status
	$(COMPOSE) ps

build: ## Build all docker images
	$(COMPOSE) build

rebuild: ## Force rebuild without cache
	$(COMPOSE) build --no-cache

# ============================================================
# Database
# ============================================================
.PHONY: db.shell db.reset migrate db.seed.p02

db.shell: ## Open a psql shell into the database
	$(COMPOSE) exec timescaledb psql -U $${POSTGRES_USER:-aria} -d $${POSTGRES_DB:-aria}

db.reset: ## ⚠️  Drop the database volume and re-run migrations (destroys all data)
	@printf "$(C_YELLOW)This will destroy all data. Press Ctrl-C to abort or Enter to continue.$(C_RESET)\n"
	@read _
	$(COMPOSE) down -v
	$(COMPOSE) up -d timescaledb
	$(COMPOSE) up migrate

migrate: ## Re-run database migrations
	$(COMPOSE) up migrate

db.seed.p02: ## Restore the canonical P-02 KB row (idempotent — safe to re-run after KB drift)
	@printf "$(C_CYAN)→ Re-seeding equipment_kb for P-02$(C_RESET)\n"
	@$(COMPOSE) exec -T timescaledb psql -U $${POSTGRES_USER:-aria} -d $${POSTGRES_DB:-aria} \
		< $(BACKEND_DIR)/infrastructure/database/seeds/p02_kb.sql
	@printf "$(C_GREEN)  ✓ P-02 KB restored$(C_RESET)\n"

# ============================================================
# Backend quality gates
# ============================================================
.PHONY: backend.format backend.format.check backend.lint backend.typecheck backend.test backend.check

backend.format: ## Auto-format backend with black
	cd $(BACKEND_DIR) && $(VENV_BIN)/black --config pyproject.toml .

backend.format.check: ## Check backend formatting (CI mode)
	cd $(BACKEND_DIR) && $(VENV_BIN)/black --check --config pyproject.toml .

backend.lint: ## Lint backend with flake8
	cd $(BACKEND_DIR) && $(VENV_BIN)/flake8 .

backend.typecheck: ## Type-check backend with pyright
	cd $(BACKEND_DIR) && $(VENV_BIN)/pyright

backend.test: ## Run backend pytest suite
	cd $(BACKEND_DIR) && PYTHONPATH=. $(VENV_BIN)/pytest -m "not e2e and not integration"

backend.check: backend.format.check backend.lint backend.typecheck ## Run all backend checks

# ============================================================
# Frontend quality gates
# ============================================================
.PHONY: frontend.format frontend.lint frontend.check frontend.typecheck frontend.test frontend.build

frontend.format: ## Auto-format frontend with biome
	cd $(FRONTEND_DIR) && npm run format

frontend.lint: ## Lint frontend with biome
	cd $(FRONTEND_DIR) && npm run lint

frontend.check: ## Run biome check (lint + format) and auto-fix
	cd $(FRONTEND_DIR) && npm run check:fix

frontend.typecheck: ## Type-check frontend with tsc
	cd $(FRONTEND_DIR) && npm run typecheck

frontend.build: ## Production build (vite)
	cd $(FRONTEND_DIR) && npm run build

# ============================================================
# Combined targets
# ============================================================
.PHONY: format lint typecheck check test e2e clean backend.smoke.mcp

format: backend.format frontend.format ## Auto-format both backend and frontend

lint: backend.lint frontend.lint ## Lint both backend and frontend

typecheck: backend.typecheck frontend.typecheck ## Type-check both backend and frontend

check: backend.check frontend.check frontend.typecheck ## Run all quality gates (CI parity)

test: backend.test ## Run all unit tests
	@printf "$(C_YELLOW)Note: frontend has no test suite yet$(C_RESET)\n"

e2e: ## Run backend E2E smoke test (requires stack to be up)
	bash $(BACKEND_DIR)/tests/e2e_smoke.sh

backend.smoke.mcp: ## Run MCP server E2E smoke (requires stack + canonical KB; see issue #69)
	cd $(BACKEND_DIR) && PYTHONPATH=. $(VENV_BIN)/python tests/e2e/aria_mcp_smoke.py

backend.smoke.tools: ## Run per-tool MCPClient isolation smoke on P-02 (issue #15; requires stack + canonical KB)
	cd $(BACKEND_DIR) && PYTHONPATH=. $(VENV_BIN)/python tests/integration/aria_mcp/tools_p02_isolation.py

clean: ## Remove caches and build artifacts
	@find . -type d \( -name __pycache__ -o -name .pytest_cache -o -name .mypy_cache -o -name .ruff_cache \) -prune -exec rm -rf {} +
	@rm -rf $(BACKEND_DIR)/coverage.xml $(BACKEND_DIR)/htmlcov $(FRONTEND_DIR)/dist
	@printf "$(C_GREEN)✓ Cleaned$(C_RESET)\n"
