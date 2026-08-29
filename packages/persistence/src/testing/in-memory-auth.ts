import { Account, HostedSession } from "@groundtruth/domain";
import { DateTime, Effect, Layer, Option, Ref } from "effect";
import { persistenceError } from "../errors.ts";
import type { IdGeneratorShape } from "../ids.ts";
import { AuthHandoffRepository, HostedSessionRepository } from "../repositories/services.ts";
import { type RepositoriesMemoryState, updateMap } from "./in-memory-state.ts";

const before = (left: DateTime.Utc, right: DateTime.Utc) =>
  DateTime.toEpochMillis(left) < DateTime.toEpochMillis(right);

const authError = (operation: string, message: string) =>
  persistenceError("postgres", operation, message, false);

type RedeemResult =
  | { readonly _tag: "invalid" }
  | { readonly _tag: "duplicate-session" }
  | {
      readonly _tag: "redeemed";
      readonly value: {
        readonly returnPath: string;
        readonly account: Account;
        readonly session: HostedSession;
      };
    };

export const makeAuthRepositoriesMemory = (
  state: Ref.Ref<RepositoriesMemoryState>,
  ids: IdGeneratorShape,
) => {
  const handoffRepository = AuthHandoffRepository.of({
    issue: (input) =>
      Ref.modify(state, (current) => {
        if (current.authHandoffs.has(input.codeHash)) return [false, current];
        const authHandoffs = updateMap(current.authHandoffs, input.codeHash, {
          ...input,
          redeemedAt: null,
        });
        return [true, { ...current, authHandoffs }];
      }).pipe(
        Effect.flatMap((inserted) =>
          inserted
            ? Effect.void
            : Effect.fail(authError("issue-auth-handoff", "handoff code already exists")),
        ),
      ),
    redeem: (input) =>
      Effect.gen(function* () {
        const generatedAccountId = yield* ids.user;
        const result = yield* Ref.modify<RepositoriesMemoryState, RedeemResult>(
          state,
          (current) => {
            const handoff = current.authHandoffs.get(input.codeHash);
            if (
              handoff === undefined ||
              handoff.redeemedAt !== null ||
              !before(input.redeemedAt, handoff.expiresAt)
            ) {
              return [{ _tag: "invalid" as const }, current];
            }
            const duplicateSession =
              current.hostedSessions.has(input.sessionId) ||
              [...current.hostedSessions.values()].some(
                ({ tokenHash }) => tokenHash === input.tokenHash,
              );
            if (duplicateSession) return [{ _tag: "duplicate-session" as const }, current];

            const existingAccount = [...current.accounts.values()].find(
              ({ hostedSubject }) => hostedSubject === handoff.hostedSubject,
            );
            const account = new Account({
              id: existingAccount?.id ?? generatedAccountId,
              hostedSubject: handoff.hostedSubject,
              email: handoff.email,
              displayName: handoff.displayName,
              createdAt: existingAccount?.createdAt ?? input.redeemedAt,
              lastSeenAt: input.redeemedAt,
            });
            const session = new HostedSession({
              id: input.sessionId,
              userId: account.id,
              createdAt: input.redeemedAt,
              lastSeenAt: input.redeemedAt,
              expiresAt: input.sessionExpiresAt,
            });
            const authHandoffs = updateMap(current.authHandoffs, input.codeHash, {
              ...handoff,
              redeemedAt: input.redeemedAt,
            });
            const accounts = updateMap(current.accounts, account.id, account);
            const hostedSessions = updateMap(current.hostedSessions, session.id, {
              session,
              tokenHash: input.tokenHash,
              revokedAt: null,
            });
            return [
              {
                _tag: "redeemed" as const,
                value: {
                  returnPath: handoff.returnPath,
                  account,
                  session,
                },
              },
              { ...current, authHandoffs, accounts, hostedSessions },
            ];
          },
        );
        if (result._tag === "invalid") return Option.none();
        if (result._tag === "duplicate-session") {
          return yield* Effect.fail(
            authError("redeem-auth-handoff", "session id or token already exists"),
          );
        }
        return Option.some(result.value);
      }),
  });

  const sessionRepository = HostedSessionRepository.of({
    findActiveByTokenHash: (tokenHash, now) =>
      Ref.modify(state, (current) => {
        const match = [...current.hostedSessions.entries()].find(
          ([, stored]) =>
            stored.tokenHash === tokenHash &&
            stored.revokedAt === null &&
            before(now, stored.session.expiresAt),
        );
        if (match === undefined) return [Option.none(), current];
        const [id, stored] = match;
        const account = current.accounts.get(stored.session.userId);
        if (account === undefined) return [Option.none(), current];
        const session = new HostedSession({
          id: stored.session.id,
          userId: stored.session.userId,
          createdAt: stored.session.createdAt,
          lastSeenAt: now,
          expiresAt: stored.session.expiresAt,
        });
        const hostedSessions = updateMap(current.hostedSessions, id, { ...stored, session });
        return [Option.some({ account, session }), { ...current, hostedSessions }];
      }),
    revokeByTokenHash: (tokenHash, now) =>
      Ref.modify(state, (current) => {
        const match = [...current.hostedSessions.entries()].find(
          ([, stored]) => stored.tokenHash === tokenHash && stored.revokedAt === null,
        );
        if (match === undefined) return [false, current];
        const [id, stored] = match;
        const hostedSessions = updateMap(current.hostedSessions, id, {
          ...stored,
          revokedAt: now,
        });
        return [true, { ...current, hostedSessions }];
      }),
    purgeExpired: (now) =>
      Ref.modify(state, (current) => {
        const authHandoffs = new Map(
          [...current.authHandoffs].filter(
            ([, handoff]) => handoff.redeemedAt === null && !before(handoff.expiresAt, now),
          ),
        );
        const hostedSessions = new Map(
          [...current.hostedSessions].filter(
            ([, stored]) => stored.revokedAt === null && !before(stored.session.expiresAt, now),
          ),
        );
        return [
          {
            handoffs: current.authHandoffs.size - authHandoffs.size,
            sessions: current.hostedSessions.size - hostedSessions.size,
          },
          { ...current, authHandoffs, hostedSessions },
        ];
      }),
  });

  return Layer.mergeAll(
    Layer.succeed(AuthHandoffRepository, handoffRepository),
    Layer.succeed(HostedSessionRepository, sessionRepository),
  );
};
