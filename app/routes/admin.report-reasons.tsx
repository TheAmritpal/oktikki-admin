import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { reportReason } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { DataTable } from "~/components/data-table";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);

  const reasons = await db.select()
    .from(reportReason)
    .orderBy(desc(reportReason.created));

  return {
    session,
    reasons,
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const title = String(formData.get("title") || "").trim();
    if (!title) return { errors: { title: ["Title is required"] } };

    await db.insert(reportReason).values({ title, created: new Date() });
    await logAudit({
      adminId: session.adminId,
      action: "create_report_reason",
      entityType: "report_reason",
      newValues: { title },
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "delete") {
    const reasonId = Number(formData.get("reasonId"));

    const [oldReason] = await db.select().from(reportReason).where(eq(reportReason.id, reasonId)).limit(1);
    await db.delete(reportReason).where(eq(reportReason.id, reasonId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_report_reason",
      entityType: "report_reason",
      entityId: reasonId,
      oldValues: { title: oldReason?.title },
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type ReportReasonRow = {
  id: number;
  title: string;
  created: Date;
};

export default function ReportReasonsPage() {
  const { reasons } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    reasonId: number;
  }>({ open: false, title: "", description: "", reasonId: 0 });

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    fetcher.submit({ intent: "create", title }, { method: "post" });
    setAddDialogOpen(false);
    setNewTitle("");
  };

  const handleDelete = () => {
    fetcher.submit({ intent: "delete", reasonId: String(confirmDialog.reasonId) }, { method: "post" });
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<ReportReasonRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
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
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => setConfirmDialog({
            open: true,
            title: "Delete Report Reason",
            description: `Are you sure you want to delete "${row.original.title}"? This action cannot be undone.`,
            reasonId: row.original.id,
          })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Report Reasons</h2>
          <p className="text-muted-foreground">
            Manage the reasons users can select when reporting content. {reasons.length} total reasons.
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Reason
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={reasons}
        page={1}
        totalPages={1}
        total={reasons.length}
        onPageChange={() => {}}
        emptyMessage="No report reasons found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleDelete}
        variant="danger"
        confirmLabel="Delete"
      />

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Report Reason</DialogTitle>
            <DialogDescription>
              Create a new reason that users can select when reporting videos or other users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason-title">Title</Label>
              <Input
                id="reason-title"
                placeholder="e.g. Inappropriate content"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}