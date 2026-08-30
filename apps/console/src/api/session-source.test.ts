import { Unauthorized } from "@groundtruth/api-contract";
import { ProjectId } from "@groundtruth/domain";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConsoleUnavailable } from "../errors";
import type { BrowserApiClient } from "./client";
import { makeToolSessionSource } from "./session-source";

const projectId = ProjectId.make("01890f6e-7c00-7000-8000-000000000001");

const sandboxSession = {
  activeProjectId: projectId,
  projects: [{ id: projectId }],
  session: { _tag: "sandbox" },
};

const makeApi = (getSession: ReturnType<typeof vi.fn>) => {
  const createSession = vi.fn(() =>
    Effect.succeed({ session: { id: "01890f6e-7c00-7000-8000-000000000002" } }),
  );
  const setSandboxSessionId = vi.fn();
  const api = {
    access: {
      get: () => ({ sandboxSessionId: null }),
      setSandboxSessionId,
    },
    client: {
      auth: { getSession },
      overview: { getOverview: () => Effect.succeed({ openIncident: null }) },
      sandbox: { createSession },
    },
    run: <A, E>(operation: Effect.Effect<A, E>) => Effect.runPromise(operation),
  } as unknown as BrowserApiClient;
  return { api, createSession, setSandboxSessionId };
};

describe("makeToolSessionSource", () => {
  it("creates a sandbox only when the API reports no authenticated session", async () => {
    const getSession = vi
      .fn()
      .mockReturnValueOnce(Effect.fail(new Unauthorized({ message: "no session" })))
      .mockReturnValueOnce(Effect.succeed(sandboxSession));
    const { api, createSession, setSandboxSessionId } = makeApi(getSession);

    const source = await makeToolSessionSource(api);

    expect(source.getSnapshot()).toMatchObject({ mode: "sandbox", projectId });
    expect(createSession).toHaveBeenCalledOnce();
    expect(setSandboxSessionId).toHaveBeenCalledWith("01890f6e-7c00-7000-8000-000000000002");
  });

  it("surfaces availability failures without replacing the session", async () => {
    const getSession = vi.fn(() => Effect.fail(new ConsoleUnavailable({ retryable: true })));
    const { api, createSession } = makeApi(getSession);

    await expect(makeToolSessionSource(api)).rejects.toBeInstanceOf(ConsoleUnavailable);
    expect(createSession).not.toHaveBeenCalled();
  });
});
