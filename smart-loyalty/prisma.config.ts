import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma ORM 7 CLI configuration.
 * Datasource URLs live here (not in schema.prisma).
 *
 * Phase 1B.1: placeholder URL is enough for `prisma validate` / `prisma generate`.
 * Do not connect to a real database or run migrations in this phase.
 */
const datasourceUrl =
  process.env.DATABASE_URL ??
  "postgresql://prisma:prisma@127.0.0.1:5432/smart_loyalty_placeholder?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prefer DATABASE_URL (pooled). For migrate deploy later, point CLI at DIRECT_URL.
    url: process.env.DIRECT_URL ?? datasourceUrl,
  },
});
