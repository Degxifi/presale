"use client";

import { useEffect, useState } from "react";

type AdminUser = { id: string; email: string; role: string; createdAt: string };

async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/users", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { users: AdminUser[] };
  return data.users ?? [];
}

/**
 * Read-only roster. Roles are NOT changeable from the dashboard for security —
 * admin is granted directly in the database (set `user.role = 'admin'`).
 */
export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    let active = true;
    fetchUsers().then((u) => {
      if (active) setUsers(u);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Admins &amp; users</h2>
      <p className="mt-1 text-sm text-muted">
        Read-only. For security, admin is granted directly in the database
        (&nbsp;<code>user.role = &apos;admin&apos;</code>&nbsp;).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-4 text-muted">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2">
                    <span
                      className={u.role === "admin" ? "text-accent" : "text-muted"}
                    >
                      {u.role}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
