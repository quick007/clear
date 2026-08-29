FROM golang:1.25.14-alpine3.24@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59 AS build

ARG COLLECTOR_BUILDER_VERSION=v0.159.0

WORKDIR /src/apps/collector
COPY apps/collector/go.mod apps/collector/go.sum ./
RUN go mod download
COPY apps/collector/ ./
RUN go run go.opentelemetry.io/collector/cmd/builder@${COLLECTOR_BUILDER_VERSION} --config builder-config.yaml

FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

RUN apk add --no-cache --upgrade \
  'libcrypto3>=3.5.8-r0' \
  'libssl3>=3.5.8-r0'

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /src/apps/collector/dist/clear-collector /usr/local/bin/clear-collector
COPY --from=build /src/apps/collector/config/ /etc/groundtruth/

USER 65532:65532
EXPOSE 4317 4318 13133

# Check every 10 seconds, allow 2 seconds per check, and allow 5 seconds for startup.
HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:13133/healthz >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/clear-collector"]
CMD ["--config=/etc/groundtruth/local.yaml"]
