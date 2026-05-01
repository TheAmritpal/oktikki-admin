import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { hashtag, hashtagVideo } from "~/db/schema";
import { count, eq, like, or, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Pencil, Plus } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [];
  if (pagination.search) {
    conditions.push(like(hashtag.name, `%${pagination.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "name" ? hashtag.name : hashtag.id;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [hashtags, [{ total }]] = await Promise.all([
    db.select({
      id: hashtag.id,
      name: hashtag.name,
      videosCount: count(hashtagVideo.id),
    })
      .from(hashtag)
      .leftJoin(hashtagVideo, eq(hashtagVideo.hashtagId, hashtag.id))
      .where(whereClause)
      .groupBy(hashtag.id, hashtag.name)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(hashtag).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    hashtags,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const name = String(formData.get("name"));
    if (!name.trim()) return { errors: { name: ["Hashtag name is required"] } };

    await db.insert(hashtag).values({ name: name.trim() });
    await logAudit({
      adminId: session.adminId,
      action: "create_hashtag",
      entityType: "hashtag",
      newValues: { name: name.trim() },
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "update") {
    const hashtagId = Number(formData.get("hashtagId"));
    const name = String(formData.get("name"));
    if (!name.trim()) return { errors: { name: ["Hashtag name is required"] } };

    await db.update(hashtag).set({ name: name.trim() }).where(eq(hashtag.id, hashtagId));
    await logAudit({
      adminId: session.adminId,
      action: "update_hashtag",
      entityType: "hashtag",
      entityId: hashtagId,
      newValues: { name: name.trim() },
      request,
    });
    return { success: true, intent: "update" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type HashtagRow = {
  id: number;
  name: string;
  videosCount: number;
};

export default function HashtagsListPage() {
  const { hashtags, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogHashtagId, setDialogHashtagId] = useState<number>(0);
  const [dialogName, setDialogName] = useState("");

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogHashtagId(0);
    setDialogName("");
    setDialogOpen(true);
  };

  const openEditDialog = (id: number, name: string) => {
    setDialogMode("edit");
    setDialogHashtagId(id);
    setDialogName(name);
    setDialogOpen(true);
  };

  const handleDialogSubmit = () => {
    if (!dialogName.trim()) return;
    if (dialogMode === "create") {
      fetcher.submit({ intent: "create", name: dialogName.trim() }, { method: "post" });
    } else {
      fetcher.submit({ intent: "update", hashtagId: String(dialogHashtagId), name: dialogName.trim() }, { method: "post" });
    }
    setDialogOpen(false);
    setDialogName("");
  };

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

  const columns: ColumnDef<HashtagRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">#{row.original.name}</span>
      ),
    },
    {
      accessorKey: "videosCount",
      header: "Videos Count",
      cell: ({ row }) => (
        <span>{row.original.videosCount.toLocaleString()}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(row.original.id, row.original.name)}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hashtags</h2>
          <p className="text-muted-foreground">
            Manage platform hashtags. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" /> Add Hashtag
        </Button>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[]}
        filterValues={{}}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={hashtags}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No hashtags found."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Add Hashtag" : "Edit Hashtag"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create" ? "Create a new hashtag for the platform." : "Update the hashtag name."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="hashtag-name">Name</Label>
              <Input
                id="hashtag-name"
                placeholder="Enter hashtag name"
                value={dialogName}
                onChange={(e) => setDialogName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDialogSubmit} disabled={!dialogName.trim()}>
              {dialogMode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}