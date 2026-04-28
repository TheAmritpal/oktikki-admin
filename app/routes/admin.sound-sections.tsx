import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { soundSection, sound } from "~/db/schema";
import { count, eq, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { DataTable } from "~/components/data-table";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Plus } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);

  const sections = await db.select({
    id: soundSection.id,
    name: soundSection.name,
    soundCount: sql<number>`(
      SELECT COUNT(*) FROM ${sound} WHERE ${sound.soundSectionId} = ${soundSection.id}
    )`,
  }).from(soundSection);

  return {
    session,
    sections,
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const name = String(formData.get("name") || "").trim();
    if (!name) return { errors: { name: ["Name is required"] } };

    const result = await db.insert(soundSection).values({ name });
    await logAudit({
      adminId: session.adminId,
      action: "create_sound_section",
      entityType: "sound_section",
      newValues: { name },
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "delete") {
    const sectionId = Number(formData.get("sectionId"));
    const [oldSection] = await db.select({ name: soundSection.name }).from(soundSection).where(eq(soundSection.id, sectionId)).limit(1);
    await db.delete(soundSection).where(eq(soundSection.id, sectionId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_sound_section",
      entityType: "sound_section",
      entityId: sectionId,
      oldValues: { name: oldSection?.name },
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type SectionRow = {
  id: number;
  name: string;
  soundCount: number;
};

export default function SoundSectionsPage() {
  const { sections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    sectionId: number;
  }>({ open: false, title: "", description: "", sectionId: 0 });

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const handleConfirmDelete = () => {
    fetcher.submit({ intent: "delete", sectionId: String(confirmDialog.sectionId) }, { method: "post" });
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleCreate = () => {
    if (newName.trim()) {
      fetcher.submit({ intent: "create", name: newName.trim() }, { method: "post" });
      setAddOpen(false);
      setNewName("");
    }
  };

  const columns: ColumnDef<SectionRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "soundCount",
      header: "Sounds Count",
      cell: ({ row }) => (
        <span className="font-medium">{(row.original.soundCount as number).toLocaleString()}</span>
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
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Sound Section",
                description: `Are you sure you want to permanently delete "${row.original.name}"? This action cannot be undone. Sounds in this section will lose their section assignment.`,
                sectionId: row.original.id,
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
          <h2 className="text-2xl font-bold tracking-tight">Sound Sections</h2>
          <p className="text-muted-foreground">
            Manage sound sections. {sections.length.toLocaleString()} total sections.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Section
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={sections}
        page={1}
        totalPages={1}
        total={sections.length}
        onPageChange={() => {}}
        emptyMessage="No sound sections found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirmDelete}
        variant="danger"
      />

      {/* Add Section Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sound Section</DialogTitle>
            <DialogDescription>
              Create a new sound section to organize sounds on the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="section-name">Section Name</Label>
              <Input
                id="section-name"
                placeholder="Enter section name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}