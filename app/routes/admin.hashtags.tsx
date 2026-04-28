import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { hashtag, hashtagVideo } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";

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
      videosCount: sql<number>`(SELECT COUNT(*) FROM ${hashtagVideo} WHERE ${hashtagVideo.hashtagId} = ${hashtag.id})`,
    })
      .from(hashtag)
      .where(whereClause)
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

  if (intent === "delete") {
    const hashtagId = Number(formData.get("hashtagId"));
    await db.delete(hashtag).where(eq(hashtag.id, hashtagId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_hashtag",
      entityType: "hashtag",
      entityId: hashtagId,
      request,
    });
    return { success: true, intent: "delete" };
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
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    hashtagId: number;
  }>({ open: false, title: "", description: "", intent: "", hashtagId: 0 });

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
    const { intent, hashtagId } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", hashtagId: String(hashtagId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
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
                title: "Delete Hashtag",
                description: `Are you sure you want to permanently delete the hashtag "#${row.original.name}"? This action cannot be undone.`,
                intent: "delete",
                hashtagId: row.original.id,
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
        <h2 className="text-2xl font-bold tracking-tight">Hashtags</h2>
        <p className="text-muted-foreground">
          Manage platform hashtags. {pagination.total.toLocaleString()} total records.
        </p>
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

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant="danger"
      />
    </div>
  );
}