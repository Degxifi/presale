import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Drizzle client over Supabase Postgres (postgres.js). `prepare: false` is
 * required for the Supabase transaction pooler (Supavisor doesn't support
 * prepared statements). DATABASE_URL is server-only.
 *
 * `db` is null when unconfigured so the app still builds/runs without a DB
 * (queries fall back to empty/zero state).
 */

const connectionString = process.env.DATABASE_URL;

export const isDbConfigured = () => Boolean(connectionString);

const client = connectionString
  ? postgres(connectionString, { prepare: false })
  : null;

export const db = client ? drizzle(client, { schema }) : null;
