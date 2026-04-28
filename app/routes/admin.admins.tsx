import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { admin, adminRole, role } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, hashPassword } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { createAdminSchema, changePasswordSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, KeyRound, ShieldOff, ShieldCheck, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);

  const admins = await db.select({
    id: admin.id,
    firstName: admin.firstName,
    lastName: admin.lastName,
    email: admin.email,
    role: admin.role,
    active: admin.active,
    created: admin.created,
    roleName: role.name,
  })
    .from(admin)
    .leftJoin(adminRole, eq(admin.id, adminRole.adminId))
    .leftJoin(role, eq(adminRole.roleId, role.id))
    .orderBy(desc(admin.created));

  const roles = await db.select().from(role);

  return {
    session,
    admins,
    roles,
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const roleId = Number(formData.get("roleId") || 0);

    const validation = createAdminSchema.safeParse({ email, password, roleId });
    if (!validation.success) return { errors: validation.error.flatten().fieldErrors };

    const hashedPassword = await hashPassword(password);

    const insertResult = await db.insert(admin).values({
      firstName: "Admin",
      lastName: "",
      email,
      password: hashedPassword,
      role: "admin",
      active: 1,
      created: new Date(),
    });

    const newAdminId = insertResult[0].insertId;

    if (roleId && newAdminId) {
      await db.insert(adminRole).values({
        adminId: newAdminId,
        roleId,
      });
    }

    await logAudit({
      adminId: session.adminId,
      action: "create_admin",
      entityType: "admin",
      entityId: newAdminId,
      newValues: { email, roleId },
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "delete") {
    const adminId = Number(formData.get("adminId"));

    if (adminId === session.adminId) {
      return { errors: { general: ["You cannot delete your own account."] } };
    }

    await db.delete(adminRole).where(eq(adminRole.adminId, adminId));
    await db.delete(admin).where(eq(admin.id, adminId));

    await logAudit({
      adminId: session.adminId,
      action: "delete_admin",
      entityType: "admin",
      entityId: adminId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  if (intent === "toggle_active") {
    const adminId = Number(formData.get("adminId"));
    const activeValue = Number(formData.get("active"));

    if (adminId === session.adminId) {
      return { errors: { general: ["You cannot deactivate your own account."] } };
    }

    const [oldAdmin] = await db.select({ active: admin.active }).from(admin).where(eq(admin.id, adminId)).limit(1);
    await db.update(admin).set({ active: activeValue }).where(eq(admin.id, adminId));

    await logAudit({
      adminId: session.adminId,
      action: activeValue === 1 ? "activate_admin" : "deactivate_admin",
      entityType: "admin",
      entityId: adminId,
      oldValues: { active: oldAdmin?.active },
      newValues: { active: activeValue },
      request,
    });
    return { success: true, intent: "toggle_active" };
  }

  if (intent === "change_password") {
    const adminId = Number(formData.get("adminId"));
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    const result = changePasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const hashedPassword = await hashPassword(newPassword);
    await db.update(admin).set({ password: hashedPassword }).where(eq(admin.id, adminId));

    await logAudit({
      adminId: session.adminId,
      action: "change_admin_password",
      entityType: "admin",
      entityId: adminId,
      request,
    });
    return { success: true, intent: "change_password" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type AdminRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  active: number;
  created: Date;
  roleName: string | null;
};

export default function AdminsPage() {
  const { admins, roles, session } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoleId, setNewRoleId] = useState("");
  const [changePasswordDialog, setChangePasswordDialog] = useState<{
    open: boolean;
    adminId: number;
  }>({ open: false, adminId: 0 });
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    adminId: number;
    activeValue?: number;
  }>({ open: false, title: "", description: "", intent: "", adminId: 0 });

  const handleCreate = () => {
    fetcher.submit(
      { intent: "create", email: newEmail, password: newPassword, roleId: newRoleId },
      { method: "post" }
    );
    setAddDialogOpen(false);
    setNewEmail("");
    setNewPassword("");
    setNewRoleId("");
  };

  const handleChangePassword = () => {
    fetcher.submit(
      { intent: "change_password", adminId: String(changePasswordDialog.adminId), newPassword: newPwd, confirmPassword: confirmPwd },
      { method: "post" }
    );
    setChangePasswordDialog({ open: false, adminId: 0 });
    setNewPwd("");
    setConfirmPwd("");
  };

  const handleConfirm = () => {
    const { intent, adminId, activeValue } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", adminId: String(adminId) }, { method: "post" });
    } else if (intent === "toggle_active" && activeValue !== undefined) {
      fetcher.submit({ intent: "toggle_active", adminId: String(adminId), active: String(activeValue) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<AdminRow>[] = [
    {
      accessorKey: "firstName",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.firstName} {row.original.lastName}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.email}</span>
      ),
    },
    {
      accessorKey: "roleName",
      header: "Role",
      cell: ({ row }) => (
        <StatusBadge status={row.original.roleName || row.original.role} />
      ),
    },
    {
      accessorKey: "active",
      header: "Active",
      cell: ({ row }) => (
        <StatusBadge status={row.original.active === 1 ? "active" : "blocked"} />
      ),
    },
    {
      accessorKey: "created",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const isSelf = row.original.id === session.adminId;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setChangePasswordDialog({ open: true, adminId: row.original.id })}
              >
                <KeyRound className="mr-2 h-4 w-4" /> Change Password
              </DropdownMenuItem>
              {!isSelf && (
                <>
                  <DropdownMenuItem
                    onClick={() => setConfirmDialog({
                      open: true,
                      title: row.original.active === 1 ? "Deactivate Admin" : "Activate Admin",
                      description: row.original.active === 1
                        ? `Are you sure you want to deactivate ${row.original.firstName} ${row.original.lastName}? They will lose access to the admin panel.`
                        : `Are you sure you want to activate ${row.original.firstName} ${row.original.lastName}? They will regain access to the admin panel.`,
                      intent: "toggle_active",
                      adminId: row.original.id,
                      activeValue: row.original.active === 1 ? 0 : 1,
                    })}
                  >
                    {row.original.active === 1 ? (
                      <><ShieldOff className="mr-2 h-4 w-4" /> Deactivate</>
                    ) : (
                      <><ShieldCheck className="mr-2 h-4 w-4" /> Activate</>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDialog({
                      open: true,
                      title: "Delete Admin",
                      description: `Are you sure you want to permanently delete ${row.original.firstName} ${row.original.lastName}? This action cannot be undone.`,
                      intent: "delete",
                      adminId: row.original.id,
                    })}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Management</h2>
          <p className="text-muted-foreground">
            Manage admin accounts and roles. {admins.length} total admins.
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Admin
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={admins}
        page={1}
        totalPages={1}
        total={admins.length}
        onPageChange={() => {}}
        emptyMessage="No admins found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "delete" ? "danger" : "default"}
        confirmLabel={confirmDialog.intent === "delete" ? "Delete" : confirmDialog.intent === "toggle_active" && confirmDialog.activeValue === 0 ? "Deactivate" : "Activate"}
      />

      {/* Add Admin Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Admin</DialogTitle>
            <DialogDescription>
              Create a new admin account with an assigned role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="admin@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-role">Role</Label>
              <Select value={newRoleId} onValueChange={setNewRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newEmail || !newPassword || newPassword.length < 6}
            >
              Create Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordDialog.open} onOpenChange={(open) => setChangePasswordDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for this admin account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-pwd">New Password</Label>
              <Input
                id="new-pwd"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pwd">Confirm Password</Label>
              <Input
                id="confirm-pwd"
                type="password"
                placeholder="Re-enter the new password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangePasswordDialog({ open: false, adminId: 0 }); setNewPwd(""); setConfirmPwd(""); }}>Cancel</Button>
            <Button
              onClick={handleChangePassword}
              disabled={!newPwd || newPwd.length < 6 || newPwd !== confirmPwd}
            >
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}