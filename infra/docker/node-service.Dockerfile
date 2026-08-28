# syntax=docker/dockerfile:1.7

FROM ghcr.io/voidzero-dev/vite-plus:0.3.0 AS build

WORKDIR /workspace

COPY --chown=vp:vp . .

RUN vp install --frozen-lockfile
RUN vp run -r build

FROM node:24.8.0-bookworm-slim AS runtime

ENV CI=1 \
    NODE_ENV=production

WORKDIR /workspace

COPY --chown=node:node --from=build /workspace /workspace

USER node

STOPSIGNAL SIGTERM
