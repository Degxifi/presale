import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Auth is usable when the DB (and thus Better Auth) is configured. */
export const isAdminConfigured = () => Boolean(auth);

/** Raw session (any logged-in user) or null. */
export async function getSession() {
  if (!auth) return null;
  return auth.api.getSession({ headers: await headers() });
}

type WithRole = { role?: string };

/** True if a session user has the admin role (DB-stored). */
export function isAdmin(session: Awaited<ReturnType<typeof getSession>>): boolean {
  return (session?.user as WithRole | undefined)?.role === "admin";
}

/** Session only if the user is an admin; otherwise null. */
export async function getAdminSession() {
  const session = await getSession();
  return session && isAdmin(session) ? session : null;
}
