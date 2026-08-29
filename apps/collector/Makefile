COLLECTOR_BUILDER_VERSION := v0.159.0

.PHONY: build generate integration test validate

generate:
	go run go.opentelemetry.io/collector/cmd/builder@$(COLLECTOR_BUILDER_VERSION) --config builder-config.yaml

build: generate
	mkdir -p bin
	cd dist && CGO_ENABLED=0 go build -trimpath -o ../bin/clear-collector .

test:
	go test ./...

integration: build
	GROUNDTRUTH_COLLECTOR_BINARY=$$(pwd)/bin/clear-collector go test -count=1 ./integration

validate: build
	GROUNDTRUTH_BACKEND_ENDPOINT=http://127.0.0.1:4000 \
	GROUNDTRUTH_SERVICE_TOKEN=local-service-token \
	./bin/clear-collector validate --config=config/local.yaml
