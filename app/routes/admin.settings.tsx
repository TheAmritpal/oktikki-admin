import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { setting } from "~/db/schema";
import { count, like, and, eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { updateSettingsSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Plus, Pencil } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [];
  if (pagination.search) {
    conditions.push(like(setting.type, `%${pagination.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [settings, [{ total }]] = await Promise.all([
    db.select({
      id: setting.id,
      type: setting.type,
      value: setting.value,
      created: setting.created,
    })
      .from(setting)
      .where(whereClause)
      .orderBy(desc(setting.created))
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(setting).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    settings,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const data = {
      type: String(formData.get("type") || ""),
      value: String(formData.get("value") || "") || undefined,
    };

    const result = updateSettingsSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    await db.insert(setting).values({
      type: result.data.type,
      value: result.data.value || "",
      created: new Date(),
    });

    await logAudit({
      adminId: session.adminId,
      action: "create_setting",
      entityType: "setting",
      newValues: result.data,
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "update") {
    const settingId = Number(formData.get("settingId"));
    const data = {
      type: String(formData.get("type") || ""),
      value: String(formData.get("value") || "") || undefined,
    };

    const result = updateSettingsSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldSetting] = await db.select({ type: setting.type, value: setting.value }).from(setting).where(eq(setting.id, settingId)).limit(1);
    await db.update(setting).set({ type: result.data.type, value: result.data.value || "" }).where(eq(setting.id, settingId));
    await logAudit({
      adminId: session.adminId,
      action: "update_setting",
      entityType: "setting",
      entityId: settingId,
      oldValues: { type: oldSetting?.type, value: oldSetting?.value },
      newValues: result.data,
      request,
    });
    return { success: true, intent: "update" };
  }

  if (intent === "delete") {
    const settingId = Number(formData.get("settingId"));
    await db.delete(setting).where(eq(setting.id, settingId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_setting",
      entityType: "setting",
      entityId: settingId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type SettingRow = {
  id: number;
  type: string;
  value: string;
  created: Date;
};

export default function SettingsPage() {
  const { settings, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    settingId: number;
  }>({ open: false, title: "", description: "", intent: "", settingId: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ type: "", value: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ settingId: 0, type: "", value: "" });

  const handleSearch = (value: string) => {
    setSearchParams((prev) => {
      if (value) prev.set("search", value);
      else prev.delete("search");
      prev.set("page", "1");
      return prev;
    });
  };

  const handleClear = () => {
    setSearchParams((prev) => {
      prev.delete("search");
      prev.set("page", "1");
      return prev;
    });
  };

  const handlePageChange = (page: number) => {
    setSearchParams((prev) => {
      prev.set("page", String(page));
      return prev;
    });
  };

  const handleConfirm = () => {
    const { intent, settingId } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", settingId: String(settingId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleCreate = () => {
    fetcher.submit(
      { intent: "create", type: createForm.type, value: createForm.value },
      { method: "post" }
    );
    setCreateOpen(false);
    setCreateForm({ type: "", value: "" });
  };

  const handleEdit = () => {
    fetcher.submit(
      { intent: "update", settingId: String(editForm.settingId), type: editForm.type, value: editForm.value },
      { method: "post" }
    );
    setEditOpen(false);
    setEditForm({ settingId: 0, type: "", value: "" });
  };

  const openEditDialog = (s: SettingRow) => {
    setEditForm({ settingId: s.id, type: s.type, value: s.value });
    setEditOpen(true);
  };

  const columns: ColumnDef<SettingRow>[] = [
    {
      accessorKey: "type",
      header: "Key",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.type}</span>
      ),
    },
    {
      accessorKey: "value",
      header: "Value",
      cell: ({ row }) => (
        <span className="line-clamp-2 text-sm">{row.original.value}</span>
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
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Setting",
                description: `Are you sure you want to permanently delete the setting "${row.original.type}"? This action cannot be undone.`,
                intent: "delete",
                settingId: row.original.id,
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
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">
            Manage platform settings. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Setting
        </Button>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by key..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[]}
        filterValues={{}}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={settings}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No settings found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant="danger"
      />

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Setting</DialogTitle>
            <DialogDescription>
              Create a new platform setting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="setting-type">Key</Label>
              <Input
                id="setting-type"
                placeholder="e.g. app_name"
                value={createForm.type}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, type: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setting-value">Value</Label>
              <Textarea
                id="setting-value"
                placeholder="Setting value"
                value={createForm.value}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, value: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!createForm.type.trim()}>
              Create Setting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Setting</DialogTitle>
            <DialogDescription>
              Update the setting value for &quot;{editForm.type}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-setting-type">Key</Label>
              <Input
                id="edit-setting-type"
                value={editForm.type}
                onChange={(e) => setEditForm((prev) => ({ ...prev, type: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-setting-value">Value</Label>
              <Textarea
                id="edit-setting-value"
                value={editForm.value}
                onChange={(e) => setEditForm((prev) => ({ ...prev, value: e.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={!editForm.type.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}