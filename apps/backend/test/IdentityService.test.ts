import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { DisplayName, EmailAddress, HostedSubject } from "@groundtruth/domain";
import { Effect } from "effect";
import { IdentityService } from "../src/identity/IdentityService.js";

describe("IdentityService", () => {
  it.effect("normalizes verified email into one durable hosted identity", () =>
    Effect.gen(function* () {
      const identity = yield* IdentityService;
      const first = yield* identity.resolveHostedIdentity(
        HostedSubject.make("chatgpt-user-1"),
        EmailAddress.make("Operator@Example.com"),
        DisplayName.make("Operator"),
      );
      const second = yield* identity.resolveHostedIdentity(
        HostedSubject.make("chatgpt-user-1"),
        EmailAddress.make("operator@example.com"),
        undefined,
      );

      assert.strictEqual(second.account.id, first.account.id);
      assert.strictEqual(second.projects[0]?.id, first.projects[0]?.id);
      assert.strictEqual(first.account.hostedSubject, "chatgpt-user-1");
      assert.strictEqual(first.projects[0]?.retentionDays, 1);
    }).pipe(Effect.provide(IdentityService.layerMemory), Effect.provide(NodeCrypto.layer)),
  );
});
