import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as authSchema from "@/lib/db/auth-schema";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();

/**
 * Better Auth instance (email + password) backed by Drizzle/Postgres. Only the
 * configured ADMIN_EMAIL may ever create an account, so the single admin is the
 * only possible user. `null` when the DB isn't configured (auth then 503s).
 */
export const auth = db
  ? betterAuth({
      secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL,
      database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
      emailAndPassword: { enabled: true },
      databaseHooks: {
        user: {
          create: {
            before: async (newUser) => {
              if (!ADMIN_EMAIL || newUser.email.toLowerCase() !== ADMIN_EMAIL) {
                throw new Error("Sign-ups are disabled.");
              }
              return { data: newUser };
            },
          },
        },
      },
      plugins: [nextCookies()],
    })
  : null;
