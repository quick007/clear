import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { BadRequest, ResourceConflictError, ServiceUnavailable } from "../errors.ts";
import {
  CompleteHandoffQuery,
  CreateHandoffRequest,
  HandoffCreated,
  SessionView,
} from "../model/auth.ts";
import { GroundtruthAccess, SitesServiceAccess } from "../middleware.ts";

export const HandoffCreatedResponse = HandoffCreated.pipe(HttpApiSchema.status(201));

export const HandoffCompletedResponse = HttpApiSchema.WithHeaders(HttpApiSchema.Empty(303), {
  location: Schema.String,
  "set-cookie": Schema.String,
});

export const LogoutResponse = HttpApiSchema.WithHeaders(HttpApiSchema.NoContent, {
  "set-cookie": Schema.String,
});

const createHandoff = HttpApiEndpoint.post("createHandoff", "/handoffs", {
  payload: CreateHandoffRequest,
  success: HandoffCreatedResponse,
  error: [BadRequest, ResourceConflictError, ServiceUnavailable],
}).middleware(SitesServiceAccess);

const completeHandoff = HttpApiEndpoint.get("completeHandoff", "/chatgpt/callback", {
  query: CompleteHandoffQuery,
  success: HandoffCompletedResponse,
  error: [BadRequest, ResourceConflictError, ServiceUnavailable],
});

const getSession = HttpApiEndpoint.get("getSession", "/session", {
  success: SessionView,
  error: ServiceUnavailable,
}).middleware(GroundtruthAccess);

const logout = HttpApiEndpoint.post("logout", "/logout", {
  success: LogoutResponse,
  error: ServiceUnavailable,
}).middleware(GroundtruthAccess);

export class AuthApi extends HttpApiGroup.make("auth")
  .add(createHandoff, completeHandoff, getSession, logout)
  .prefix("/v1/auth")
  .annotateMerge(
    OpenApi.annotations({
      title: "Authentication",
      description: "ChatGPT identity handoff and browser sessions",
    }),
  ) {}
