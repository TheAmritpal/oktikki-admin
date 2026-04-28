import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { gift } from "~/db/schema";
import { count, eq, like, or, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Star, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(gift.title, `%${pagination.search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "title" ? gift.title
    : pagination.sort === "coin" ? gift.coin
    : pagination.sort === "position" ? gift.position
    : gift.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [gifts, [{ total }]] = await Promise.all([
    db.select({
      id: gift.id,
      title: gift.title,
      image: gift.image,
      coin: gift.coin,
      icon: gift.icon,
      position: gift.position,
      featured: gift.featured,
      created: gift.created,
    })
      .from(gift)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(gift).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    gifts,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "toggle_featured") {
    const giftId = Number(formData.get("giftId"));
    const featuredValue = Number(formData.get("featured"));

    const [oldGift] = await db.select({ featured: gift.featured }).from(gift).where(eq(gift.id, giftId)).limit(1);
    await db.update(gift).set({ featured: featuredValue }).where(eq(gift.id, giftId));
    await logAudit({
      adminId: session.adminId,
      action: featuredValue === 1 ? "feature_gift" : "unfeature_gift",
      entityType: "gift",
      entityId: giftId,
      oldValues: { featured: oldGift?.featured },
      newValues: { featured: featuredValue },
      request,
    });
    return { success: true, intent: "toggle_featured", featured: featuredValue };
  }

  if (intent === "delete") {
    const giftId = Number(formData.get("giftId"));
    await db.delete(gift).where(eq(gift.id, giftId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_gift",
      entityType: "gift",
      entityId: giftId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type GiftRow = {
  id: number;
  title: string;
  image: string;
  coin: number;
  icon: string;
  position: string;
  featured: number;
  created: Date;
};

export default function GiftsListPage() {
  const { gifts, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    giftId: number;
    featuredValue?: number;
  }>({ open: false, title: "", description: "", intent: "", giftId: 0 });

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
    const { intent, giftId, featuredValue } = confirmDialog;
    if (intent === "toggle_featured" && featuredValue !== undefined) {
      fetcher.submit({ intent: "toggle_featured", giftId: String(giftId), featured: String(featuredValue) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete", giftId: String(giftId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<GiftRow>[] = [
    {
      accessorKey: "image",
      header: "Image",
      cell: ({ row }) => (
        row.original.image ? (
          <img src={row.original.image} alt={row.original.title} className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">N/A</div>
        )
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
      accessorKey: "coin",
      header: "Coin Price",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.coin.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "featured",
      header: "Featured",
      cell: ({ row }) => (
        <StatusBadge status={row.original.featured === 1 ? "active" : "blocked"} />
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
                title: row.original.featured === 1 ? "Unfeature Gift" : "Feature Gift",
                description: row.original.featured === 1
                  ? `Are you sure you want to remove "${row.original.title}" from featured gifts?`
                  : `Are you sure you want to feature "${row.original.title}"? It will be highlighted to users.`,
                intent: "toggle_featured",
                giftId: row.original.id,
                featuredValue: row.original.featured === 1 ? 0 : 1,
              })}
            >
              {row.original.featured === 1 ? (
                <><Star className="mr-2 h-4 w-4" /> Unfeature</>
              ) : (
                <><Star className="mr-2 h-4 w-4" /> Feature</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Gift",
                description: `Are you sure you want to permanently delete gift "${row.original.title}"? This action cannot be undone.`,
                intent: "delete",
                giftId: row.original.id,
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
        <h2 className="text-2xl font-bold tracking-tight">Gifts</h2>
        <p className="text-muted-foreground">
          Manage virtual gifts. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by title..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={gifts}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No gifts found."
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