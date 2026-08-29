import { JsonSchema, Schema } from "effect";
import { PanelSpec } from "./panels.ts";

export const PanelSpecJsonSchemaDocument = Schema.toJsonSchemaDocument(PanelSpec, {
  additionalProperties: false,
  generateDescriptions: true,
});

export const PanelSpecJsonSchema = {
  $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
  ...PanelSpecJsonSchemaDocument.schema,
  ...(Object.keys(PanelSpecJsonSchemaDocument.definitions).length > 0
    ? { $defs: PanelSpecJsonSchemaDocument.definitions }
    : {}),
};
