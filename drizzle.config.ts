import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit only auto-loads `.env`, but this project keeps secrets in
// `.env.local` (the Next.js convention). drizzle-kit evaluates this config in
// its own process that never reads `.env.local`, so without this DATABASE_URL
// is empty and you get: "Please provide required params for Postgres driver".
// Load `.env.local` explicitly here (a no-op for vars the runtime already set).
function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("="); // split on the first '=' only (URLs contain '=')
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local missing — drizzle-kit will surface the empty-url error below.
  }
}
loadEnvLocal();

// Migrations apply to Supabase Postgres. DATABASE_URL (Transaction pooler URI)
// is read from `.env.local` above. `db:generate` (SQL from schema) needs no DB.
export default defineConfig({
  schema: ["./lib/db/schema.ts", "./lib/db/auth-schema.ts"],
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
