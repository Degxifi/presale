import { defineConfig } from "drizzle-kit";

// Migrations apply to Supabase Postgres. Set DATABASE_URL (Transaction pooler
// URI) before running `pnpm db:migrate` / `pnpm db:push`. `db:generate` (SQL
// from schema) needs no DB connection.
export default defineConfig({
  schema: ["./lib/db/schema.ts", "./lib/db/auth-schema.ts"],
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
