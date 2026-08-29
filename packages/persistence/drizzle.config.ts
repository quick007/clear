import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.GROUNDTRUTH_POSTGRES_URL ??
      process.env.DATABASE_URL ??
      "postgres://groundtruth:groundtruth@localhost:5432/groundtruth",
  },
  strict: true,
  verbose: true,
});
