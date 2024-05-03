# 3manuek basic Makefile

.PHONY: dev

dev:
	hugo serve --environment development --bind 0.0.0.0

.PHONY: build

build:
	hugo

.PHONY: deploy

deploy:
	hugo --environment production	

.PHONY: clean

clean:
	rm -rf ./public