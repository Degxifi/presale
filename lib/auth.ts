import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import * as authSchema from "@/lib/db/auth-schema";

/**
 * Better Auth (email + password) over Drizzle/Postgres. Roles live in the DB
 * (`user.role`), so there can be multiple admins. The first registered user
 * becomes the founding admin; everyone else starts as 'user'. There is
 * INTENTIONALLY no in-app role-change endpoint — promoting another admin is
 * done directly in the database: `UPDATE "user" SET role='admin' WHERE email=…`.
 * `null` when the DB isn't configured (auth then 503s).
 */
export const auth = db
  ? betterAuth({
      secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL,
      database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
      emailAndPassword: { enabled: true },
      user: {
        additionalFields: {
          // exposed in the session; not client-settable (set server-side only)
          role: {
            type: "string",
            required: false,
            input: false,
            defaultValue: "user",
          },
        },
      },
      databaseHooks: {
        user: {
          create: {
            before: async (newUser) => {
              // First user to register becomes the founding admin; promote
              // others via a direct DB update (roles are DB-stored).
              let role = "user";
              if (db) {
                const [row] = await db
                  .select({ c: count() })
                  .from(authSchema.user);
                if (!row || Number(row.c) === 0) role = "admin";
              }
              return { data: { ...newUser, role } };
            },
          },
        },
      },
      plugins: [nextCookies()],
    })
  : null;
