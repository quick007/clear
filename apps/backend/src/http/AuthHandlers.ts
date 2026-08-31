import {
  BadRequest,
  CurrentSession,
  GroundtruthApi,
  HandoffCreated,
  SessionView,
  Unauthorized,
} from "@groundtruth/api-contract";
import { DateTime, Effect, Redacted } from "effect";
import { Cookies, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi";
import { AuthPrincipal, AuthService } from "../auth/AuthService.js";
import { BackendConfig } from "../config/BackendConfig.js";
import { IdentityService } from "../identity/IdentityService.js";
import { sessionCookieName } from "./SecurityRoutes.js";

const sessionMaxAge = "7 days";
const handoffNonceMaxAge = "1 minute";
export const handoffNonceCookieName = "groundtruth_handoff_nonce";

const unauthorized = (message: string) => new Unauthorized({ message });

const expiredSessionCookie = (secure: boolean) =>
  Cookies.serializeCookie(
    Cookies.makeCookieUnsafe(sessionCookieName, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: "0 seconds",
      path: "/",
      sameSite: "lax",
      secure,
    }),
  );

const handoffNonceCookieOptions = (config: BackendConfig["Service"]) => {
  const hostname = new URL(config.consoleOrigin).hostname;
  const domain =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
      ? undefined
      : hostname;
  return {
    ...(domain === undefined ? {} : { domain }),
    httpOnly: true,
    maxAge: handoffNonceMaxAge,
    path: "/v1/auth/chatgpt/callback",
    sameSite: "lax" as const,
    secure: config.cookieSecure,
  };
};

const completeHandoffResponse = (
  location: string,
  sessionToken: string,
  config: BackendConfig["Service"],
) =>
  HttpServerResponse.redirect(location, { status: 303 }).pipe(
    HttpServerResponse.setCookiesUnsafe([
      [
        sessionCookieName,
        sessionToken,
        {
          httpOnly: true,
          maxAge: sessionMaxAge,
          path: "/",
          sameSite: "lax",
          secure: config.cookieSecure,
        },
      ],
      [
        handoffNonceCookieName,
        "",
        {
          ...handoffNonceCookieOptions(config),
          expires: new Date(0),
          maxAge: "0 seconds",
        },
      ],
    ]),
  );

export const AuthHandlers = HttpApiBuilder.group(GroundtruthApi, "auth", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const config = yield* BackendConfig;
    const identity = yield* IdentityService;

    return handlers
      .handle("createHandoff", ({ payload }) =>
        Effect.gen(function* () {
          const resolved = yield* identity.resolveHostedIdentity(
            payload.subject,
            payload.email,
            payload.displayName,
          );
          const handoff = yield* auth
            .issueHandoff(
              new AuthPrincipal({
                hostedSubject: String(resolved.account.hostedSubject),
                email: String(resolved.account.email),
                displayName: resolved.account.displayName,
              }),
              payload.returnPath ?? "/",
              payload.browserNonce,
            )
            .pipe(
              Effect.catchTag(
                "InvalidReturnPath",
                () => new BadRequest({ message: "Return path is invalid" }),
              ),
            );
          return new HandoffCreated({
            code: handoff.code,
            expiresAt: DateTime.fromDateUnsafe(new Date(handoff.expiresAt)),
          });
        }),
      )
      .handle("completeHandoff", ({ query, request }) =>
        Effect.gen(function* () {
          const browserNonce = request.cookies[handoffNonceCookieName];
          if (browserNonce === undefined) {
            return yield* new BadRequest({ message: "Handoff nonce is missing or invalid" });
          }
          const redeemed = yield* auth
            .redeemHandoff(query.code, Redacted.make(browserNonce))
            .pipe(
              Effect.catchTag(
                "InvalidHandoffCode",
                () => new BadRequest({ message: "Handoff code is invalid or expired" }),
              ),
            );
          if (query.returnPath !== undefined && query.returnPath !== redeemed.returnPath) {
            return yield* new BadRequest({
              message: "Return path does not match the handoff",
            });
          }
          return completeHandoffResponse(
            new URL(redeemed.returnPath, config.consoleOrigin).toString(),
            redeemed.sessionToken,
            config,
          );
        }),
      )
      .handle("getSession", ({ request }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession;
          if (session._tag === "sandbox") {
            const project = yield* identity.projectForSandboxSession(session);
            const token = request.cookies[sessionCookieName];
            const hosted =
              token === undefined
                ? null
                : yield* auth.authenticate(token).pipe(
                    Effect.flatMap((record) => identity.sessionView(record)),
                    Effect.catchTags({
                      ServiceUnavailable: () => Effect.succeed(null),
                      SessionNotFound: () => Effect.succeed(null),
                    }),
                  );
            return new SessionView({
              session,
              account: hosted?.account ?? null,
              projects: [project, ...(hosted?.projects ?? [])],
              activeProjectId: project.id,
            });
          }

          const token = request.cookies[sessionCookieName];
          if (token === undefined) {
            return yield* unauthorized("Session cookie is missing");
          }
          const record = yield* auth
            .authenticate(token)
            .pipe(
              Effect.catchTag("SessionNotFound", () =>
                unauthorized("Session is invalid or expired"),
              ),
            );
          return yield* identity.sessionView(record);
        }),
      )
      .handle("logout", ({ request }) =>
        Effect.gen(function* () {
          const token = request.cookies[sessionCookieName];
          if (token !== undefined) {
            yield* auth.logout(token);
          }
          return HttpApiSchema.withHeaders({
            body: undefined,
            headers: {
              "set-cookie": expiredSessionCookie(config.cookieSecure),
            },
          });
        }),
      );
  }),
);
