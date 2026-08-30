import { Clock, Context, Deferred, Effect, Exit, Layer, Metric, Ref } from "effect";
import { CheckoutRequest, CheckoutResponse } from "./contracts.js";
import { CheckoutConflict, PaymentUnavailable } from "./errors.js";
import { retryImmediately } from "./lib/retry.js";
import { checkoutDuration, replicas, serverRequests } from "./metrics.js";
import { PaymentsClient } from "./payments-client.js";
import { metricUserId } from "./telemetry-cardinality.js";

const successfulRequestLimit = 256;

type IdempotencyEntry =
  | {
      readonly _tag: "Pending";
      readonly completion: Deferred.Deferred<CheckoutResponse, PaymentUnavailable>;
      readonly fingerprint: RequestFingerprint;
    }
  | {
      readonly _tag: "Succeeded";
      readonly fingerprint: RequestFingerprint;
      readonly response: CheckoutResponse;
    };

type IdempotencyDecision =
  | { readonly _tag: "Await"; readonly entry: IdempotencyEntry }
  | { readonly _tag: "Conflict" }
  | {
      readonly _tag: "Execute";
      readonly completion: Deferred.Deferred<CheckoutResponse, PaymentUnavailable>;
    };

interface RequestFingerprint {
  readonly amountCents: number;
  readonly itemCount: number;
}

const requestKey = (request: CheckoutRequest) => `${request.userId}\u0000${request.requestId}`;

const requestFingerprint = (request: CheckoutRequest): RequestFingerprint => ({
  amountCents: request.amountCents,
  itemCount: request.itemCount,
});

const matchesRequest = (entry: IdempotencyEntry, request: CheckoutRequest) =>
  entry.fingerprint.amountCents === request.amountCents &&
  entry.fingerprint.itemCount === request.itemCount;

const cacheSuccess = (
  entries: ReadonlyMap<string, IdempotencyEntry>,
  key: string,
  fingerprint: RequestFingerprint,
  response: CheckoutResponse,
) => {
  const updated = new Map(entries);
  updated.set(key, { _tag: "Succeeded", fingerprint, response });

  let successfulEntries = 0;
  for (const entry of updated.values()) {
    if (entry._tag === "Succeeded") successfulEntries += 1;
  }

  for (const [entryKey, entry] of updated) {
    if (successfulEntries <= successfulRequestLimit) break;
    if (entry._tag === "Succeeded") {
      updated.delete(entryKey);
      successfulEntries -= 1;
    }
  }

  return updated;
};

const recordRequest = (
  request: CheckoutRequest,
  durationMs: number,
  status: "200" | "409" | "503",
) => {
  const attributes = {
    retry: "false",
    route: "/v1/checkout",
    status,
    "user.id": metricUserId(request.userId),
  };

  return Effect.all(
    [
      Metric.update(Metric.withAttributes(serverRequests, attributes), 1),
      Metric.update(Metric.withAttributes(checkoutDuration, attributes), durationMs),
    ],
    { discard: true },
  );
};

export class CheckoutService extends Context.Service<
  CheckoutService,
  {
    readonly checkout: (
      request: CheckoutRequest,
    ) => Effect.Effect<CheckoutResponse, CheckoutConflict | PaymentUnavailable>;
  }
>()("groundtruth/checkout-api/CheckoutService") {
  static readonly layer = Layer.effect(
    CheckoutService,
    Effect.gen(function* () {
      const payments = yield* PaymentsClient;
      yield* Metric.update(replicas, 1);
      const idempotencyEntries = yield* Ref.make<ReadonlyMap<string, IdempotencyEntry>>(new Map());

      const process = Effect.fn("checkout.authorize")(function* (request: CheckoutRequest) {
        const authorization = yield* retryImmediately((attempt) =>
          payments.authorize({
            amountCents: request.amountCents,
            attempt,
            requestId: request.requestId,
            userId: request.userId,
          }),
        );

        yield* Effect.logInfo("Checkout confirmed").pipe(
          Effect.annotateLogs({
            requestId: request.requestId,
            userId: request.userId,
          }),
        );

        return CheckoutResponse.make({
          authorizationId: authorization.authorizationId,
          requestId: request.requestId,
          status: "confirmed",
        });
      });

      const idempotentProcess = Effect.fn("checkout.idempotent")(function* (
        request: CheckoutRequest,
      ) {
        const key = requestKey(request);
        const fingerprint = requestFingerprint(request);
        const candidate = yield* Deferred.make<CheckoutResponse, PaymentUnavailable>();
        const decision = yield* Ref.modify<
          ReadonlyMap<string, IdempotencyEntry>,
          IdempotencyDecision
        >(idempotencyEntries, (entries) => {
          const existing = entries.get(key);
          if (existing !== undefined) {
            return [
              matchesRequest(existing, request)
                ? { _tag: "Await", entry: existing }
                : { _tag: "Conflict" },
              entries,
            ];
          }

          const updated = new Map(entries);
          updated.set(key, { _tag: "Pending", completion: candidate, fingerprint });
          return [{ _tag: "Execute", completion: candidate }, updated];
        });

        if (decision._tag === "Conflict") {
          return yield* new CheckoutConflict({ requestId: request.requestId });
        }

        if (decision._tag === "Await") {
          return decision.entry._tag === "Succeeded"
            ? decision.entry.response
            : yield* Deferred.await(decision.entry.completion);
        }

        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const result = yield* Effect.exit(restore(process(request)));

            if (Exit.isSuccess(result)) {
              yield* Ref.update(idempotencyEntries, (entries) =>
                cacheSuccess(entries, key, fingerprint, result.value),
              );
            } else {
              yield* Ref.update(idempotencyEntries, (entries) => {
                const current = entries.get(key);
                if (current?._tag !== "Pending" || current.completion !== decision.completion) {
                  return entries;
                }
                const updated = new Map(entries);
                updated.delete(key);
                return updated;
              });
            }

            yield* Deferred.done(decision.completion, result);
            return yield* Deferred.await(decision.completion);
          }),
        );
      });

      const checkout = Effect.fn("checkout.process")(function* (request: CheckoutRequest) {
        const startedAt = yield* Clock.currentTimeMillis;
        yield* Effect.annotateCurrentSpan({
          "checkout.item_count": request.itemCount,
          "checkout.request_id": request.requestId,
          "user.id": request.userId,
        });

        return yield* idempotentProcess(request).pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.gen(function* () {
                const finishedAt = yield* Clock.currentTimeMillis;
                yield* recordRequest(
                  request,
                  finishedAt - startedAt,
                  error instanceof CheckoutConflict ? "409" : "503",
                );
                return yield* error;
              }),
            onSuccess: (response) =>
              Effect.gen(function* () {
                const finishedAt = yield* Clock.currentTimeMillis;
                yield* recordRequest(request, finishedAt - startedAt, "200");
                return response;
              }),
          }),
        );
      });

      return CheckoutService.of({ checkout });
    }),
  );
}
