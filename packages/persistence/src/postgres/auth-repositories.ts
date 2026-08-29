import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import { DateTime, Effect, Layer, Option } from "effect";
import { IdGenerator } from "../ids.ts";
import { AuthHandoffRepository, HostedSessionRepository } from "../repositories/services.ts";
import { accounts, authHandoffCodes, hostedSessions } from "../schema/accounts.ts";
import { PostgresDatabase } from "./database.ts";
import { accountFromRow, hostedSessionFromRow } from "./mappers.ts";

const makeAuthHandoffRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;
  const ids = yield* IdGenerator;

  return AuthHandoffRepository.of({
    issue: (input) =>
      postgres
        .execute("issue-auth-handoff", () =>
          postgres.db.insert(authHandoffCodes).values({
            ...input,
            createdAt: DateTime.toDateUtc(input.createdAt),
            expiresAt: DateTime.toDateUtc(input.expiresAt),
          }),
        )
        .pipe(Effect.asVoid),
    redeem: (input) =>
      Effect.gen(function* () {
        const accountId = yield* ids.user;
        const redeemedAt = DateTime.toDateUtc(input.redeemedAt);
        const sessionExpiresAt = DateTime.toDateUtc(input.sessionExpiresAt);
        return yield* postgres.execute("redeem-auth-handoff", () =>
          postgres.db.transaction(async (transaction) => {
            const redeemed = await transaction
              .update(authHandoffCodes)
              .set({ redeemedAt })
              .where(
                and(
                  eq(authHandoffCodes.codeHash, input.codeHash),
                  isNull(authHandoffCodes.redeemedAt),
                  gt(authHandoffCodes.expiresAt, redeemedAt),
                ),
              )
              .returning();
            const handoff = redeemed[0];
            if (handoff === undefined) {
              return Option.none();
            }

            const accountRows = await transaction
              .insert(accounts)
              .values({
                id: accountId,
                hostedSubject: handoff.hostedSubject,
                email: handoff.email,
                displayName: handoff.displayName,
                createdAt: redeemedAt,
                lastSeenAt: redeemedAt,
              })
              .onConflictDoUpdate({
                target: accounts.hostedSubject,
                set: {
                  email: handoff.email,
                  displayName: handoff.displayName,
                  lastSeenAt: redeemedAt,
                },
              })
              .returning();
            const account = accountRows[0]!;
            const sessionRows = await transaction
              .insert(hostedSessions)
              .values({
                id: input.sessionId,
                accountId: account.id,
                tokenHash: input.tokenHash,
                createdAt: redeemedAt,
                lastSeenAt: redeemedAt,
                expiresAt: sessionExpiresAt,
              })
              .returning();
            return Option.some({
              returnPath: handoff.returnPath,
              account: accountFromRow(account),
              session: hostedSessionFromRow(sessionRows[0]!),
            });
          }),
        );
      }),
  });
});

const makeHostedSessionRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;

  return HostedSessionRepository.of({
    findActiveByTokenHash: (tokenHash, now) => {
      const seenAt = DateTime.toDateUtc(now);
      return postgres.execute("find-active-session", () =>
        postgres.db.transaction(async (transaction) => {
          const row = await transaction.query.hostedSessions.findFirst({
            where: {
              tokenHash: { eq: tokenHash },
              revokedAt: { isNull: true },
              expiresAt: { gt: seenAt },
            },
            with: { account: true },
          });
          if (row === undefined) {
            return Option.none();
          }
          const updated = await transaction
            .update(hostedSessions)
            .set({ lastSeenAt: seenAt })
            .where(
              and(
                eq(hostedSessions.id, row.id),
                isNull(hostedSessions.revokedAt),
                gt(hostedSessions.expiresAt, seenAt),
              ),
            )
            .returning();
          if (updated[0] === undefined) {
            return Option.none();
          }
          return Option.some({
            account: accountFromRow(row.account),
            session: hostedSessionFromRow(updated[0]),
          });
        }),
      );
    },
    revokeByTokenHash: (tokenHash, now) => {
      const revokedAt = DateTime.toDateUtc(now);
      return postgres
        .execute("revoke-session", () =>
          postgres.db
            .update(hostedSessions)
            .set({ revokedAt })
            .where(and(eq(hostedSessions.tokenHash, tokenHash), isNull(hostedSessions.revokedAt)))
            .returning({ id: hostedSessions.id }),
        )
        .pipe(Effect.map((rows) => rows.length === 1));
    },
    purgeExpired: (now) => {
      const cutoff = DateTime.toDateUtc(now);
      return postgres.execute("purge-auth-state", () =>
        postgres.db.transaction(async (transaction) => {
          const handoffs = await transaction
            .delete(authHandoffCodes)
            .where(
              or(lt(authHandoffCodes.expiresAt, cutoff), isNotNull(authHandoffCodes.redeemedAt)),
            )
            .returning({ codeHash: authHandoffCodes.codeHash });
          const sessions = await transaction
            .delete(hostedSessions)
            .where(or(lt(hostedSessions.expiresAt, cutoff), isNotNull(hostedSessions.revokedAt)))
            .returning({ id: hostedSessions.id });
          return { handoffs: handoffs.length, sessions: sessions.length };
        }),
      );
    },
  });
});

export const AuthRepositoriesLive = Layer.mergeAll(
  Layer.effect(AuthHandoffRepository, makeAuthHandoffRepository),
  Layer.effect(HostedSessionRepository, makeHostedSessionRepository),
);
