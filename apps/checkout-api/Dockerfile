FROM ghcr.io/voidzero-dev/vite-plus:0.3.0@sha256:bca24ac970b21298430ad281f306dbe0a17be3fd1d6c9ec5f2cc73da65740b88 AS build

WORKDIR /app

COPY --chown=vp:vp . .
RUN vp install --frozen-lockfile
RUN vp -C apps/checkout-api exec tsc -p tsconfig.build.json
RUN vp exec pnpm --filter @groundtruth/checkout-api deploy --prod --legacy /app/output

FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/output ./

EXPOSE 4101
USER node

# Probe every 30 seconds with a 3 second timeout after a 10 second warmup.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '4101') + '/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
