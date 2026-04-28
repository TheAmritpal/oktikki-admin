import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { sound, soundSection } from "~/db/schema";
import { count, eq, like, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Eye, CheckCircle2, XCircle } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const publishFilter = url.searchParams.get("publish") || "";

  const conditions = [];
  if (pagination.search) {
    conditions.push(like(sound.name, `%${pagination.search}%`));
  }
  if (publishFilter === "1") conditions.push(eq(sound.publish, 1));
  if (publishFilter === "0") conditions.push(eq(sound.publish, 0));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "name" ? sound.name
    : sound.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [sounds, [{ total }]] = await Promise.all([
    db.select({
      id: sound.id,
      name: sound.name,
      description: sound.description,
      duration: sound.duration,
      publish: sound.publish,
      soundSectionId: sound.soundSectionId,
      created: sound.created,
      sectionName: soundSection.name,
    })
      .from(sound)
      .leftJoin(soundSection, eq(sound.soundSectionId, soundSection.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(sound).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    sounds,
    pagination: { ...pagination, total, totalPages },
    filters: { publish: publishFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "delete") {
    const soundId = Number(formData.get("soundId"));
    await db.delete(sound).where(eq(sound.id, soundId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_sound",
      entityType: "sound",
      entityId: soundId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  if (intent === "publish") {
    const soundId = Number(formData.get("soundId"));
    const publishValue = Number(formData.get("publish"));

    const [oldSound] = await db.select({ publish: sound.publish }).from(sound).where(eq(sound.id, soundId)).limit(1);
    await db.update(sound).set({ publish: publishValue }).where(eq(sound.id, soundId));
    await logAudit({
      adminId: session.adminId,
      action: publishValue === 1 ? "publish_sound" : "unpublish_sound",
      entityType: "sound",
      entityId: soundId,
      oldValues: { publish: oldSound?.publish },
      newValues: { publish: publishValue },
      request,
    });
    return { success: true, intent: "publish", publish: publishValue };
  }

  return { errors: { general: ["Unknown action"] } };
}

type SoundRow = {
  id: number;
  name: string;
  description: string;
  duration: string;
  publish: number;
  soundSectionId: number;
  created: Date;
  sectionName: string | null;
};

export default function SoundsListPage() {
  const { sounds, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    soundId: number;
    publishValue?: number;
  }>({ open: false, title: "", description: "", intent: "", soundId: 0 });

  const handleSearch = (value: string) => {
    setSearchParams((prev) => {
      if (value) prev.set("search", value);
      else prev.delete("search");
      prev.set("page", "1");
      return prev;
    });
  };

  const handleFilterChange = (name: string, value: string) => {
    setSearchParams((prev) => {
      if (value && value !== "all") prev.set(name, value);
      else prev.delete(name);
      prev.set("page", "1");
      return prev;
    });
  };

  const handleClear = () => {
    setSearchParams((prev) => {
      prev.delete("search");
      prev.delete("publish");
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
    const { intent, soundId, publishValue } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", soundId: String(soundId) }, { method: "post" });
    } else if (intent === "publish" && publishValue !== undefined) {
      fetcher.submit({ intent: "publish", soundId: String(soundId), publish: String(publishValue) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<SoundRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.id}</span>
      ),
    },
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
        <span className="line-clamp-2 text-sm">{row.original.description || "—"}</span>
      ),
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.duration || "—"}</span>
      ),
    },
    {
      accessorKey: "publish",
      header: "Publish Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.publish === 1 ? "active" : "blocked"} />
      ),
    },
    {
      accessorKey: "sectionName",
      header: "Section",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.sectionName || "—"}</span>
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
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: row.original.publish === 1 ? "Unpublish Sound" : "Publish Sound",
                description: row.original.publish === 1
                  ? "Are you sure you want to unpublish this sound? It will no longer be available to users."
                  : "Are you sure you want to publish this sound? It will become available to users.",
                intent: "publish",
                soundId: row.original.id,
                publishValue: row.original.publish === 1 ? 0 : 1,
              })}
            >
              {row.original.publish === 1 ? (
                <><XCircle className="mr-2 h-4 w-4" /> Unpublish</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" /> Publish</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Sound",
                description: "Are you sure you want to permanently delete this sound? This action cannot be undone.",
                intent: "delete",
                soundId: row.original.id,
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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Sounds</h2>
        <p className="text-muted-foreground">
          Manage platform sounds. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "publish",
            label: "Publish Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "1", label: "Published" },
              { value: "0", label: "Unpublished" },
            ],
          },
        ]}
        filterValues={{
          publish: filters.publish || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={sounds}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No sounds found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "delete" ? "danger" : "default"}
      />
    </div>
  );
}