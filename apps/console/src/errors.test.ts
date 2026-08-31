import { CreatePanelRequest, Unauthorized } from "@groundtruth/api-contract";
import { AccessDenied, ProjectId, QuotaExceeded } from "@groundtruth/domain";
import { Effect, Schema } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ConsoleAccessDenied,
  ConsoleAuthenticationRequired,
  ConsoleInvalidResponse,
  ConsoleInvalidRequest,
  ConsoleNoActiveProject,
  ConsoleNotFound,
  ConsoleOutcomeUnknown,
  ConsoleRateLimited,
  ConsoleUnavailable,
  ConsoleUnexpected,
  mutationOutcomeIsUnknown,
  normalizeConsoleEffect,
  normalizeConsoleFailure,
  normalizeConsoleMutationEffect,
  normalizeConsoleMutationFailure,
  presentConsoleFailure,
  recoveryActionForConsoleFailure,
  reportConsoleFailure,
  shouldRetryConsoleFailure,
} from "./errors";

describe("normalizeConsoleFailure", () => {
  it("preserves authentication as a typed browser failure", () => {
    expect(
      normalizeConsoleFailure(new Unauthorized({ message: "missing session" })),
    ).toBeInstanceOf(ConsoleAuthenticationRequired);
  });

  it("maps domain authorization without exposing server text", () => {
    const failure = normalizeConsoleFailure(
      new AccessDenied({
        action: "read",
        message: "internal policy detail",
        projectId: ProjectId.make("01890f6e-7c00-7000-8000-000000000001"),
      }),
    );
    expect(failure).toBeInstanceOf(ConsoleAccessDenied);
    expect(presentConsoleFailure(failure).message).toBe("You do not have access to this project.");
  });

  it("does not automatically retry quota failures", () => {
    const failure = normalizeConsoleFailure(
      new QuotaExceeded({ message: "quota", quota: "requests", limit: 10, observed: 11 }),
    );
    expect(failure).toBeInstanceOf(ConsoleRateLimited);
    expect(shouldRetryConsoleFailure(0, failure)).toBe(false);
  });

  it("turns unknown failures into safe unexpected failures", async () => {
    const rejected = await Effect.runPromise(
      Effect.flip(
        Effect.fail(new Error("secret diagnostic")).pipe(Effect.mapError(normalizeConsoleFailure)),
      ),
    );
    expect(rejected).toBeInstanceOf(ConsoleUnexpected);
    expect(presentConsoleFailure(rejected).message).not.toContain("secret diagnostic");
  });

  it("classifies a local request encoding failure as an invalid request", async () => {
    const schemaError = await Effect.runPromise(
      Effect.flip(Schema.encodeUnknownEffect(CreatePanelRequest)({ dashboardId: "invalid" })),
    );

    expect(normalizeConsoleFailure(schemaError)).toBeInstanceOf(ConsoleInvalidRequest);
  });

  it("records an unexpected original cause without adding it to safe copy", () => {
    const diagnostic = new Error("private diagnostic");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    Effect.runSync(reportConsoleFailure("test boundary", diagnostic));

    expect(consoleError).toHaveBeenCalledWith(
      "[Clear] test boundary",
      expect.objectContaining({ cause: diagnostic }),
    );
    expect(presentConsoleFailure(diagnostic).message).not.toContain("private diagnostic");
    consoleError.mockRestore();
  });

  it("does not report expected access failures as production defects", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    Effect.runSync(reportConsoleFailure("test request", new ConsoleAccessDenied()));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("turns defects into a typed failure after recording their original cause", async () => {
    const defect = new Error("private defect");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const failure = await Effect.runPromise(
      Effect.flip(Effect.die(defect).pipe(normalizeConsoleEffect("test request"))),
    );

    expect(failure).toBeInstanceOf(ConsoleUnexpected);
    expect(consoleError).toHaveBeenCalledWith(
      "[Clear] test request",
      expect.objectContaining({ cause: defect }),
    );
    consoleError.mockRestore();
  });
});

describe("recoveryActionForConsoleFailure", () => {
  it("sends an expired session through the login handoff", () => {
    expect(
      recoveryActionForConsoleFailure(new ConsoleAuthenticationRequired(), {
        returnPath: "/incidents/incident-1?tab=timeline",
      }),
    ).toEqual({
      _tag: "Link",
      href: "/sign-in?returnPath=%2Fincidents%2Fincident-1%3Ftab%3Dtimeline%26hosted%3Dtrue",
      label: "Log in again",
    });
  });

  it("gives missing projects a creation path instead of a retry", () => {
    expect(
      recoveryActionForConsoleFailure(new ConsoleNoActiveProject(), {
        returnPath: "/connect",
      }),
    ).toEqual({
      _tag: "Link",
      href: "/sign-in?returnPath=%2Fconnect%3Fhosted%3Dtrue",
      label: "Log in to create a project",
    });
  });

  it("uses the page-specific destination for missing data", () => {
    expect(
      recoveryActionForConsoleFailure(new ConsoleNotFound({ resource: "incident" }), {
        notFound: { href: "/incidents", label: "Back to incidents" },
      }),
    ).toEqual({ _tag: "Link", href: "/incidents", label: "Back to incidents" });
  });

  it("leaves an inaccessible workspace instead of repeating the denied request", () => {
    expect(recoveryActionForConsoleFailure(new ConsoleAccessDenied())).toEqual({
      _tag: "Link",
      href: "/",
      label: "Return home",
    });
  });

  it("does not offer a futile retry for invalid requests", () => {
    expect(recoveryActionForConsoleFailure(new ConsoleInvalidRequest())).toEqual({
      _tag: "None",
    });
  });

  it("retries only retryable service failures", () => {
    expect(recoveryActionForConsoleFailure(new ConsoleUnavailable({ retryable: true }))).toEqual({
      _tag: "Retry",
      label: "Try again",
    });
    expect(recoveryActionForConsoleFailure(new ConsoleUnavailable({ retryable: false }))).toEqual({
      _tag: "None",
    });
  });

  it("waits out a request limit without offering an immediate retry", () => {
    expect(recoveryActionForConsoleFailure(new ConsoleRateLimited())).toEqual({
      _tag: "None",
    });
  });
});

describe("mutation outcome safety", () => {
  it("turns an ambiguous response failure into an unknown write outcome", () => {
    const failure = normalizeConsoleMutationFailure(new ConsoleInvalidResponse());

    expect(failure).toBeInstanceOf(ConsoleOutcomeUnknown);
    expect(mutationOutcomeIsUnknown(failure)).toBe(true);
    expect(presentConsoleFailure(failure).message).toContain("may have completed");
  });

  it("preserves a deterministic request rejection", () => {
    const failure = normalizeConsoleMutationFailure(new ConsoleInvalidRequest());

    expect(failure).toBeInstanceOf(ConsoleInvalidRequest);
    expect(mutationOutcomeIsUnknown(failure)).toBe(false);
  });

  it("contains a post-dispatch defect as an unknown write outcome", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = await Effect.runPromise(
      Effect.flip(
        Effect.die(new Error("response handler defect")).pipe(
          normalizeConsoleMutationEffect("Create alert failed"),
        ),
      ),
    );

    expect(failure).toBeInstanceOf(ConsoleOutcomeUnknown);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
