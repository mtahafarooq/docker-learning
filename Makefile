# Convenience wrappers around docker compose. Run `make` to see everything.
# (Every recipe line below must start with a TAB.)

APP_PORT ?= 8080
REPLICAS ?= 3

.PHONY: help up down logs ps scale unscale psql redis-cli clean rebuild health hit

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Build (if needed) and start the whole stack in the background
	docker compose up -d --build

down: ## Stop and remove containers + network (keeps data volumes)
	docker compose down

logs: ## Tail logs from all services
	docker compose logs -f --tail=50

ps: ## Show running containers
	docker compose ps

scale: ## Scale the backend: make scale REPLICAS=4
	docker compose up -d --scale backend=$(REPLICAS) --no-recreate

unscale: ## Go back to a single backend
	docker compose up -d --scale backend=1 --no-recreate

psql: ## Open a psql shell inside the postgres container
	docker compose exec postgres psql -U app -d app

redis-cli: ## Open a redis-cli shell inside the redis container
	docker compose exec redis redis-cli

health: ## Curl the gateway health endpoint
	@curl -s http://localhost:$(APP_PORT)/health

hit: ## Fire 6 requests through nginx and show which replica answered
	@for i in 1 2 3 4 5 6; do \
		curl -s http://localhost:$(APP_PORT)/ | sed 's/.*"instance":"\([^"]*\)".*/\1/'; \
		echo; \
	done

rebuild: ## Rebuild the backend image from scratch (no cache)
	docker compose build --no-cache backend

clean: ## Remove containers, network AND volumes (DESTROYS DB DATA)
	docker compose down -v --remove-orphans
