import { useLoaderData } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { permission } from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { DataTable } from "~/components/data-table";
import { StatusBadge } from "~/components/status-badge";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);

  const permissions = await db.select({
    id: permission.id,
    name: permission.name,
    description: permission.description,
    module: permission.module,
    created: permission.created,
  }).from(permission);

  // Group permissions by module
  const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, perm) => {
    const mod = perm.module || "general";
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(perm);
    return acc;
  }, {});

  return {
    session,
    permissions,
    grouped,
  };
}

type PermissionRow = {
  id: number;
  name: string;
  description: string | null;
  module: string | null;
  created: Date;
};

export default function PermissionsPage() {
  const { permissions, grouped } = useLoaderData<typeof loader>();

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "module",
      header: "Module",
      cell: ({ row }) => (
        <StatusBadge status={row.original.module || "general"} />
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.description || "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Permissions</h2>
        <p className="text-muted-foreground">
          View all available permissions. {permissions.length.toLocaleString()} total permissions across {Object.keys(grouped).length} modules.
        </p>
      </div>

      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped).map(([module, perms]) => (
          <div key={module} className="space-y-2">
            <h3 className="text-lg font-semibold capitalize">{module}</h3>
            <DataTable
              columns={columns}
              data={perms}
              page={1}
              totalPages={1}
              total={perms.length}
              onPageChange={() => {}}
              emptyMessage="No permissions in this module."
            />
          </div>
        ))
      ) : (
        <DataTable
          columns={columns}
          data={permissions}
          page={1}
          totalPages={1}
          total={permissions.length}
          onPageChange={() => {}}
          emptyMessage="No permissions found. Seed the database with permissions first."
        />
      )}
    </div>
  );
}