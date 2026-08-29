import type {
  DisplayName,
  EmailAddress,
  HostedSubject,
  SessionId,
  UserId,
} from "@groundtruth/domain";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").$type<UserId>().primaryKey(),
    hostedSubject: text("hosted_subject").$type<HostedSubject>().notNull(),
    email: text("email").$type<EmailAddress>().notNull(),
    displayName: text("display_name").$type<DisplayName>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("accounts_hosted_subject_unique").on(table.hostedSubject)],
);

export const hostedSessions = pgTable(
  "hosted_sessions",
  {
    id: uuid("id").$type<SessionId>().primaryKey(),
    accountId: uuid("account_id")
      .$type<UserId>()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("hosted_sessions_token_hash_unique").on(table.tokenHash),
    index("hosted_sessions_account_expires_idx").on(table.accountId, table.expiresAt),
  ],
);

export const authHandoffCodes = pgTable(
  "auth_handoff_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    hostedSubject: text("hosted_subject").$type<HostedSubject>().notNull(),
    email: text("email").$type<EmailAddress>().notNull(),
    displayName: text("display_name").$type<DisplayName>(),
    returnPath: text("return_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("auth_handoff_codes_expires_idx").on(table.expiresAt)],
);
