import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { promotion, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Power, PowerOff, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const activeFilter = url.searchParams.get("active") || "";

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(promotion.websiteUrl, `%${pagination.search}%`),
        like(user.username, `%${pagination.search}%`)
      )!
    );
  }
  if (activeFilter === "1") conditions.push(eq(promotion.active, 1));
  if (activeFilter === "0") conditions.push(eq(promotion.active, 0));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "coin" ? promotion.coin
    : pagination.sort === "websiteUrl" ? promotion.websiteUrl
    : promotion.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [promotions, [{ total }]] = await Promise.all([
    db.select({
      id: promotion.id,
      userId: promotion.userId,
      websiteUrl: promotion.websiteUrl,
      coin: promotion.coin,
      active: promotion.active,
      created: promotion.created,
      username: user.username,
    })
      .from(promotion)
      .leftJoin(user, eq(promotion.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(promotion)
      .leftJoin(user, eq(promotion.userId, user.id))
      .where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    promotions,
    pagination: { ...pagination, total, totalPages },
    filters: { active: activeFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "toggle_active") {
    const promotionId = Number(formData.get("promotionId"));
    const activeValue = Number(formData.get("active"));

    const [oldPromo] = await db.select({ active: promotion.active }).from(promotion).where(eq(promotion.id, promotionId)).limit(1);
    await db.update(promotion).set({ active: activeValue }).where(eq(promotion.id, promotionId));
    await logAudit({
      adminId: session.adminId,
      action: activeValue === 1 ? "activate_promotion" : "deactivate_promotion",
      entityType: "promotion",
      entityId: promotionId,
      oldValues: { active: oldPromo?.active },
      newValues: { active: activeValue },
      request,
    });
    return { success: true, intent: "toggle_active", active: activeValue };
  }

  if (intent === "delete") {
    const promotionId = Number(formData.get("promotionId"));
    await db.delete(promotion).where(eq(promotion.id, promotionId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_promotion",
      entityType: "promotion",
      entityId: promotionId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type PromotionRow = {
  id: number;
  userId: number;
  websiteUrl: string;
  coin: number;
  active: number;
  created: Date;
  username: string | null;
};

export default function PromotionsListPage() {
  const { promotions, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    promotionId: number;
    activeValue?: number;
  }>({ open: false, title: "", description: "", intent: "", promotionId: 0 });

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
      prev.delete("active");
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
    const { intent, promotionId, activeValue } = confirmDialog;
    if (intent === "toggle_active" && activeValue !== undefined) {
      fetcher.submit({ intent: "toggle_active", promotionId: String(promotionId), active: String(activeValue) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete", promotionId: String(promotionId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<PromotionRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "username",
      header: "User",
      cell: ({ row }) => (
        row.original.username ? (
          <Link to={`/admin/users/${row.original.userId}`} className="text-sm font-medium text-primary hover:underline">
            @{row.original.username}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.userId}</span>
        )
      ),
    },
    {
      accessorKey: "websiteUrl",
      header: "Website URL",
      cell: ({ row }) => (
        <span className="text-sm line-clamp-1 max-w-[200px]">{row.original.websiteUrl || "—"}</span>
      ),
    },
    {
      accessorKey: "coin",
      header: "Coin",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.coin.toLocaleString()}</span>
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
                title: row.original.active === 1 ? "Deactivate Promotion" : "Activate Promotion",
                description: row.original.active === 1
                  ? `Are you sure you want to deactivate promotion #${row.original.id}? It will no longer be shown to users.`
                  : `Are you sure you want to activate promotion #${row.original.id}? It will be shown to users.`,
                intent: "toggle_active",
                promotionId: row.original.id,
                activeValue: row.original.active === 1 ? 0 : 1,
              })}
            >
              {row.original.active === 1 ? (
                <><PowerOff className="mr-2 h-4 w-4" /> Deactivate</>
              ) : (
                <><Power className="mr-2 h-4 w-4" /> Activate</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Promotion",
                description: `Are you sure you want to permanently delete promotion #${row.original.id}? This action cannot be undone.`,
                intent: "delete",
                promotionId: row.original.id,
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
        <h2 className="text-2xl font-bold tracking-tight">Promotions</h2>
        <p className="text-muted-foreground">
          Manage video promotions. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by website URL or username..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "active",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "1", label: "Active" },
              { value: "0", label: "Inactive" },
            ],
          },
        ]}
        filterValues={{
          active: filters.active || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={promotions}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No promotions found."
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