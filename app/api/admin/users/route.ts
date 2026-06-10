import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/guard";
import { listUsers } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

// Read-only. Roles are granted directly in the database for security — there is
// intentionally no endpoint to change a user's role from the app.
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ users: await listUsers() });
}
