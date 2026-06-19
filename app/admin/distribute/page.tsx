import { getSession, isAdmin, isAdminConfigured } from "@/lib/admin/guard";
import { AdminShell } from "../_components/admin-shell";
import { AdminLogin } from "../_components/admin-login";
import { DistributionPanel } from "./_components/distribution-panel";

export const dynamic = "force-dynamic";

export default async function DistributePage() {
  const session = await getSession();
  if (!session) {
    return (
      <AdminShell>
        <AdminLogin configured={isAdminConfigured()} />
      </AdminShell>
    );
  }
  if (!isAdmin(session)) {
    return (
      <AdminShell email={session.user.email}>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Your account doesn&apos;t have admin access yet — ask an existing admin
          to grant it.
        </div>
      </AdminShell>
    );
  }
  return (
    <AdminShell email={session.user.email}>
      <DistributionPanel />
    </AdminShell>
  );
}
