# Third-party notices

Clear is distributed under the MIT License. It includes or depends on third-party open source software whose own licenses continue to apply.

This notice summarizes direct runtime dependencies shipped in the applications and container images. Exact versions are recorded in `pnpm-lock.yaml` and `apps/collector/go.sum`. Installed packages include their complete license texts.

## User interface

| Project                                                         | License          | Source                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React and React DOM                                             | MIT              | [facebook/react](https://github.com/facebook/react)                                                                                                                                                                    |
| Base UI                                                         | MIT              | [mui/base-ui](https://github.com/mui/base-ui)                                                                                                                                                                          |
| StyleX                                                          | MIT              | [facebook/stylex](https://github.com/facebook/stylex)                                                                                                                                                                  |
| TanStack Query and TanStack Router                              | MIT              | [TanStack/query](https://github.com/TanStack/query), [TanStack/router](https://github.com/TanStack/router)                                                                                                             |
| Hugeicons React and free icon set                               | MIT              | [hugeicons/hugeicons](https://github.com/hugeicons/hugeicons)                                                                                                                                                          |
| Paper Shaders                                                   | Apache-2.0       | [paper-design/shaders](https://github.com/paper-design/shaders), [bundled license](apps/console/public/licenses/PAPER_SHADERS_APACHE-2.0.txt), [bundled notice](apps/console/public/licenses/PAPER_SHADERS_NOTICE.txt) |
| Recharts                                                        | MIT              | [recharts/recharts](https://github.com/recharts/recharts)                                                                                                                                                              |
| IBM Plex Sans and IBM Plex Mono, distributed through Fontsource | OFL-1.1          | [IBM/plex](https://github.com/IBM/plex), [fontsource/font-files](https://github.com/fontsource/font-files), [bundled license and copyright](apps/console/public/licenses/IBM_PLEX_OFL-1.1.txt)                         |
| Ridge Weekender product image                                   | Unsplash License | [Unsplash source image](https://images.unsplash.com/photo-1553062407-98eeb64c6a62) and [Unsplash License](https://unsplash.com/license)                                                                                |

IBM Plex font files are redistributed under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/). Paper Shaders is redistributed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). The Ridge Weekender image is a local, optimized derivative of the linked Unsplash source and is covered by the Unsplash License.

## TypeScript services

| Project                                                                            | License    | Source                                                                                |
| ---------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| Effect, Effect Platform, and Effect OpenTelemetry                                  | MIT        | [Effect-TS/effect](https://github.com/Effect-TS/effect)                               |
| OpenTelemetry JavaScript API, SDKs, exporters, resources, and semantic conventions | Apache-2.0 | [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) |
| ClickHouse JavaScript client                                                       | Apache-2.0 | [ClickHouse/clickhouse-js](https://github.com/ClickHouse/clickhouse-js)               |
| Drizzle ORM                                                                        | Apache-2.0 | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)               |
| node-postgres                                                                      | MIT        | [brianc/node-postgres](https://github.com/brianc/node-postgres)                       |

## Collector

The Clear Collector distribution is built from the [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) and [OpenTelemetry Collector Contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib) projects under Apache-2.0. Its direct runtime dependencies also include [gRPC-Go](https://github.com/grpc/grpc-go) under Apache-2.0, plus [Protocol Buffers for Go](https://github.com/protocolbuffers/protobuf-go) and [google/uuid](https://github.com/google/uuid) under BSD-3-Clause.

This file is informational and does not replace the license texts included with each dependency.
