# Checkout web

The public Stillroom checkout used by the example service stack. It sends one
browser request to `checkout-api` for each explicit order attempt.

This is canonical deployed storefront code. The hosted build runs as a static
ChatGPT Sites application and talks directly to the configured checkout API.

## Local development

Copy `.env.example` to `.env.local`, then run from the repository root:

```sh
vp install
vp run checkout-web#dev
```

The app runs at `http://localhost:5174`. Configure the API with
`CHECKOUT_WEB_ORIGIN=http://localhost:5174` so its exact-origin CORS policy
accepts the request.

## Validate

```sh
vp run checkout-web#test
vp run checkout-web#build
```

`VITE_CHECKOUT_API_URL` must be the public checkout API origin in hosted builds.
Keep the deployed value in the hosting provider and local values in an
uncommitted `.env.local` file.

## Key files

- [`src/main.tsx`](src/main.tsx): browser entrypoint.
- [`src/app.tsx`](src/app.tsx): storefront application flow.
- [`src/checkout-api.ts`](src/checkout-api.ts): typed checkout request.
- [`src/config.ts`](src/config.ts): environment validation.
- [`src/worker.ts`](src/worker.ts): static asset worker.
