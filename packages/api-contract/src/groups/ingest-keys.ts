import { IngestKeyMetadata } from "@groundtruth/domain";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { MutationErrors, ReadErrors } from "../errors.ts";
import { ProjectPath } from "../model/common.ts";
import {
  CreatedIngestKey,
  CreateIngestKeyRequest,
  IngestKeyList,
  IngestKeyPath,
} from "../model/ingest-keys.ts";
import { GroundtruthAccess } from "../middleware.ts";

export class IngestKeysApi extends HttpApiGroup.make("ingestKeys")
  .add(
    HttpApiEndpoint.get("listIngestKeys", "/:projectId/ingest-keys", {
      params: ProjectPath,
      success: IngestKeyList,
      error: ReadErrors,
    }),
    HttpApiEndpoint.post("createIngestKey", "/:projectId/ingest-keys", {
      params: ProjectPath,
      payload: CreateIngestKeyRequest,
      success: CreatedIngestKey.pipe(HttpApiSchema.status(201)),
      error: MutationErrors,
    }),
    HttpApiEndpoint.delete("revokeIngestKey", "/:projectId/ingest-keys/:ingestKeyId", {
      params: { ...ProjectPath, ...IngestKeyPath },
      success: IngestKeyMetadata,
      error: MutationErrors,
    }),
  )
  .middleware(GroundtruthAccess)
  .prefix("/v1/projects")
  .annotateMerge(
    OpenApi.annotations({
      title: "Ingest keys",
      description: "Per-project OpenTelemetry ingest credentials",
    }),
  ) {}
