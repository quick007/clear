import {
  GroundtruthAccess,
  GroundtruthApi,
  type PublicStatusResponse,
} from "@groundtruth/api-contract";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";

import { getConsoleConfig } from "../config";
import { normalizeConsoleEffect } from "../errors";

export interface PublicApiClient {
  readonly getStatus: (signal?: AbortSignal) => Promise<PublicStatusResponse>;
}

export const makePublicApiClient = async (
  options: { readonly baseUrl?: string } = {},
): Promise<PublicApiClient> => {
  const accessLayer = HttpApiMiddleware.layerClient(GroundtruthAccess, ({ request, next }) =>
    next(request),
  );
  const clientLayer = Layer.mergeAll(FetchHttpClient.layer, accessLayer);
  const requestInitLayer = Layer.succeed(FetchHttpClient.RequestInit, {
    credentials: "omit",
  });
  const baseUrl =
    options.baseUrl ??
    (await Effect.runPromise(
      Effect.sync(() => getConsoleConfig().apiOrigin).pipe(
        normalizeConsoleEffect("Console configuration failed"),
      ),
    ));
  const client = await Effect.runPromise(
    HttpApiClient.make(GroundtruthApi, { baseUrl }).pipe(
      normalizeConsoleEffect("Public status client setup failed"),
      Effect.provide(clientLayer),
    ),
  );

  return {
    getStatus: (signal) =>
      Effect.runPromise(
        client.publicStatus
          .getStatus({})
          .pipe(
            normalizeConsoleEffect("Public status request failed"),
            Effect.provide(requestInitLayer),
          ),
        { signal },
      ),
  };
};

let publicApiClient: Promise<PublicApiClient> | undefined;

export const getPublicApiClient = () => (publicApiClient ??= makePublicApiClient());
