.PHONY: dev build up down logs status deploy-check

dev:            ## Uruchom lokalnie (development)
	docker compose up --build

build:          ## Zbuduj obrazy
	docker compose build

up:             ## Uruchom w tle
	docker compose up -d --build

down:           ## Zatrzymaj
	docker compose down

logs:           ## Pokaz logi
	docker compose logs -f

status:         ## Status kontenerow
	docker compose ps

deploy-check:   ## Sprawdz czy gotowe do deploy
	docker compose build
	docker compose up -d
	sleep 5
	docker compose ps
	curl -f http://localhost:3002/health || (docker compose down && exit 1)
	docker compose down
	@echo "Deploy check OK"
