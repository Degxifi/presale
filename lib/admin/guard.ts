import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** True if auth + an admin email are configured. */
export const isAdminConfigured = () =>
  Boolean(auth && process.env.ADMIN_EMAIL);

/**
 * Returns the session only if the request is the configured admin
 * (logged in AND email === ADMIN_EMAIL); otherwise null.
 */
export async function getAdminSession() {
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  return adminEmail && session.user.email.toLowerCase() === adminEmail
    ? session
    : null;
}
