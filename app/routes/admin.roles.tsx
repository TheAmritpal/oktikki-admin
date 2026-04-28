import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { role, rolePermission, permission } from "~/db/schema";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { createRoleSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Checkbox } from "~/components/ui/checkbox";
import { MoreHorizontal, Trash2, Plus, Shield } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);

  const roles = await db.select({
    id: role.id,
    name: role.name,
    description: role.description,
    created: role.created,
  }).from(role);

  // Get permission count per role
  const permCounts = await db.select({
    roleId: rolePermission.roleId,
    count: count(),
  }).from(rolePermission).groupBy(rolePermission.roleId);

  const permCountMap = new Map(permCounts.map((p) => [p.roleId, p.count]));

  const rolesWithCount = roles.map((r) => ({
    ...r,
    permissionCount: permCountMap.get(r.id) || 0,
  }));

  // Get all permissions for the edit dialog
  const allPermissions = await db.select({
    id: permission.id,
    name: permission.name,
    description: permission.description,
    module: permission.module,
  }).from(permission);

  // Get all role-permission mappings for pre-populating the edit dialog
  const allRolePerms = await db.select({
    roleId: rolePermission.roleId,
    permissionId: rolePermission.permissionId,
  }).from(rolePermission);

  const rolePermMap = new Map<number, number[]>();
  for (const rp of allRolePerms) {
    const roleId = Number(rp.roleId);
    const permId = Number(rp.permissionId);
    if (!rolePermMap.has(roleId)) rolePermMap.set(roleId, []);
    rolePermMap.get(roleId)!.push(permId);
  }

  return {
    session,
    roles: rolesWithCount,
    allPermissions,
    rolePermMap: Object.fromEntries(rolePermMap),
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const data = {
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || "") || undefined,
    };

    const result = createRoleSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    await db.insert(role).values({
      name: result.data.name,
      description: result.data.description || null,
    });

    await logAudit({
      adminId: session.adminId,
      action: "create_role",
      entityType: "role",
      newValues: result.data,
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "updatePermissions") {
    const roleId = Number(formData.get("roleId"));
    const permissionIds = String(formData.get("permissionIds") || "")
      .split(",")
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    // Delete existing permissions for this role
    await db.delete(rolePermission).where(eq(rolePermission.roleId, roleId));

    // Insert new permissions
    if (permissionIds.length > 0) {
      await db.insert(rolePermission).values(
        permissionIds.map((permId) => ({
          roleId,
          permissionId: permId,
        }))
      );
    }

    await logAudit({
      adminId: session.adminId,
      action: "update_role_permissions",
      entityType: "role",
      entityId: roleId,
      newValues: { permissionIds },
      request,
    });
    return { success: true, intent: "updatePermissions" };
  }

  if (intent === "delete") {
    const roleId = Number(formData.get("roleId"));

    // Delete role permissions first
    await db.delete(rolePermission).where(eq(rolePermission.roleId, roleId));
    await db.delete(role).where(eq(role.id, roleId));

    await logAudit({
      adminId: session.adminId,
      action: "delete_role",
      entityType: "role",
      entityId: roleId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type RoleRow = {
  id: number;
  name: string;
  description: string | null;
  permissionCount: number;
  created: Date;
};

export default function RolesListPage() {
  const { roles, allPermissions, rolePermMap } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    roleId: number;
  }>({ open: false, title: "", description: "", intent: "", roleId: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [editPermsOpen, setEditPermsOpen] = useState(false);
  const [editPermsRoleId, setEditPermsRoleId] = useState(0);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<number>>(new Set());

  const handleConfirm = () => {
    const { intent, roleId } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", roleId: String(roleId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleCreate = () => {
    fetcher.submit(
      { intent: "create", name: createForm.name, description: createForm.description },
      { method: "post" }
    );
    setCreateOpen(false);
    setCreateForm({ name: "", description: "" });
  };

  const openEditPermissions = (roleId: number) => {
    const currentPermIds = rolePermMap[roleId] || [];
    setSelectedPermIds(new Set(currentPermIds));
    setEditPermsRoleId(roleId);
    setEditPermsOpen(true);
  };

  const togglePermission = (permId: number) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const handleSavePermissions = () => {
    fetcher.submit(
      {
        intent: "updatePermissions",
        roleId: String(editPermsRoleId),
        permissionIds: Array.from(selectedPermIds).join(","),
      },
      { method: "post" }
    );
    setEditPermsOpen(false);
  };

  // Group permissions by module
  const permissionsByModule = allPermissions.reduce<Record<string, typeof allPermissions>>((acc, perm) => {
    const mod = perm.module || "general";
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(perm);
    return acc;
  }, {});

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.description || "—"}</span>
      ),
    },
    {
      accessorKey: "permissionCount",
      header: "Permissions",
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.permissionCount}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEditPermissions(row.original.id)}>
              <Shield className="mr-2 h-4 w-4" /> Edit Permissions
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Role",
                description: `Are you sure you want to permanently delete the role "${row.original.name}"? This will also remove all associated permission assignments.`,
                intent: "delete",
                roleId: row.original.id,
              })}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Roles</h2>
          <p className="text-muted-foreground">
            Manage admin roles and permissions. {roles.length.toLocaleString()} total roles.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Role
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={roles}
        page={1}
        totalPages={1}
        total={roles.length}
        onPageChange={() => {}}
        emptyMessage="No roles found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant="danger"
      />

      {/* Create Role Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Role</DialogTitle>
            <DialogDescription>
              Create a new admin role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                placeholder="e.g. moderator"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-description">Description</Label>
              <Textarea
                id="role-description"
                placeholder="Role description (optional)"
                value={createForm.description}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!createForm.name.trim()}>
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={editPermsOpen} onOpenChange={setEditPermsOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
            <DialogDescription>
              Assign permissions to this role by checking the boxes below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {Object.entries(permissionsByModule).map(([module, perms]) => (
              <div key={module}>
                <h4 className="text-sm font-semibold mb-2 capitalize">{module}</h4>
                <div className="space-y-2">
                  {perms.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedPermIds.has(perm.id)}
                        onCheckedChange={() => togglePermission(perm.id)}
                      />
                      <div>
                        <span className="text-sm">{perm.name}</span>
                        {perm.description && (
                          <p className="text-xs text-muted-foreground">{perm.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(permissionsByModule).length === 0 && (
              <p className="text-sm text-muted-foreground">No permissions available. Seed permissions first.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPermsOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePermissions}>
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}