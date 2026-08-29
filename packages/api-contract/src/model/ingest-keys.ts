import { IngestKeyId, IngestKeyMetadata, IngestKeyName } from "@groundtruth/domain";
import { Schema } from "effect";

export const IngestKeySecret = Schema.String.check(
  Schema.isPattern(/^gtik_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/),
).pipe(
  Schema.brand("IngestKeySecret"),
  Schema.annotate({
    description: "Opaque ingest credential returned as plaintext only when created",
  }),
);
export type IngestKeySecret = typeof IngestKeySecret.Type;

export class IngestKeyList extends Schema.Class<IngestKeyList>("Groundtruth/Api/IngestKeyList")({
  items: Schema.Array(IngestKeyMetadata),
}) {}

export class CreateIngestKeyRequest extends Schema.Class<CreateIngestKeyRequest>(
  "Groundtruth/Api/CreateIngestKeyRequest",
)({
  name: IngestKeyName,
}) {}

export class CreatedIngestKey extends Schema.Class<CreatedIngestKey>(
  "Groundtruth/Api/CreatedIngestKey",
)({
  metadata: IngestKeyMetadata,
  key: IngestKeySecret,
}) {}

export const IngestKeyPath = {
  ingestKeyId: IngestKeyId,
} as const;
