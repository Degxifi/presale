import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

const notConfigured = () =>
  new Response("Auth is not configured (set DATABASE_URL).", { status: 503 });

export const { GET, POST } = auth
  ? toNextJsHandler(auth)
  : { GET: notConfigured, POST: notConfigured };
