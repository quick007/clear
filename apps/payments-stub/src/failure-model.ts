import { Clock, Context, Effect, Layer, Ref } from "effect";
import { PaymentsConfig } from "./config.js";
import { FailureRateUpdate, FailureState, PaymentAuthorizationRequest } from "./contracts.js";

const windowSizeMs = 1_000; // 1 second

interface InternalState {
  readonly failureRate: number;
  readonly requestsInWindow: number;
  readonly seed: string;
  readonly totalRequests: number;
  readonly windowStartedAt: number;
}

export interface FailureDecision {
  readonly effectiveFailureRate: number;
  readonly failed: boolean;
  readonly latencyMs: number;
  readonly requestsInWindow: number;
}

export const hashUnit = (input: string) => {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_296;
};

export const effectiveRate = (
  failureRate: number,
  requestsInWindow: number,
  expectedRps: number,
  overloadGain: number,
) => Math.min(0.98, failureRate + Math.max(0, requestsInWindow - expectedRps) * overloadGain);

export class FailureModel extends Context.Service<
  FailureModel,
  {
    readonly decide: (request: PaymentAuthorizationRequest) => Effect.Effect<FailureDecision>;
    readonly reset: Effect.Effect<FailureState>;
    readonly state: Effect.Effect<FailureState>;
    readonly update: (input: FailureRateUpdate) => Effect.Effect<FailureState>;
  }
>()("groundtruth/payments-stub/FailureModel") {
  static readonly layer = Layer.effect(
    FailureModel,
    Effect.gen(function* () {
      const config = yield* PaymentsConfig;
      const initial = (now: number): InternalState => ({
        failureRate: config.failureRate,
        requestsInWindow: 0,
        seed: config.failureSeed,
        totalRequests: 0,
        windowStartedAt: now,
      });
      const now = yield* Clock.currentTimeMillis;
      const stateRef = yield* Ref.make(initial(now));

      const view = (state: InternalState): FailureState =>
        FailureState.make({
          effectiveFailureRate: effectiveRate(
            state.failureRate,
            state.requestsInWindow,
            config.expectedRps,
            config.overloadGain,
          ),
          failureRate: state.failureRate,
          requestsInWindow: state.requestsInWindow,
          seed: state.seed,
          totalRequests: state.totalRequests,
          windowStartedAt: state.windowStartedAt,
        });

      return FailureModel.of({
        decide: (request) =>
          Effect.gen(function* () {
            const timestamp = yield* Clock.currentTimeMillis;
            return yield* Ref.modify(stateRef, (current) => {
              const state =
                timestamp - current.windowStartedAt >= windowSizeMs
                  ? {
                      ...current,
                      requestsInWindow: 0,
                      windowStartedAt: timestamp,
                    }
                  : current;
              const requestsInWindow = state.requestsInWindow + 1;
              const totalRequests = state.totalRequests + 1;
              const rate = effectiveRate(
                state.failureRate,
                requestsInWindow,
                config.expectedRps,
                config.overloadGain,
              );
              const sample = hashUnit(
                `${state.seed}:${request.requestId}:${request.attempt}:${totalRequests}`,
              );
              const jitter = Math.floor(
                hashUnit(`${state.seed}:latency:${totalRequests}`) * config.latencyJitterMs,
              );
              const overload = Math.max(0, requestsInWindow - config.expectedRps);

              return [
                {
                  effectiveFailureRate: rate,
                  failed: sample < rate,
                  latencyMs: config.baseLatencyMs + jitter + overload * config.overloadLatencyMs,
                  requestsInWindow,
                },
                { ...state, requestsInWindow, totalRequests },
              ];
            });
          }),
        reset: Effect.gen(function* () {
          const timestamp = yield* Clock.currentTimeMillis;
          const state = initial(timestamp);
          yield* Ref.set(stateRef, state);
          return view(state);
        }),
        state: Ref.get(stateRef).pipe(Effect.map(view)),
        update: (input) =>
          Effect.gen(function* () {
            const timestamp = yield* Clock.currentTimeMillis;
            const state: InternalState = {
              failureRate: input.failureRate,
              requestsInWindow: 0,
              seed: input.seed ?? (yield* Ref.get(stateRef)).seed,
              totalRequests: 0,
              windowStartedAt: timestamp,
            };
            yield* Ref.set(stateRef, state);
            return view(state);
          }),
      });
    }),
  );
}
