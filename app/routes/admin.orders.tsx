import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { order, user } from "~/db/schema";
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
import { MoreHorizontal, ArrowRight, XCircle } from "lucide-react";

const ORDER_STATUS_MAP: Record<number, string> = {
  0: "pending",
  1: "processing",
  2: "shipped",
  3: "delivered",
  4: "cancelled",
};

const ORDER_STATUS_LABELS: Record<number, string> = {
  0: "Pending",
  1: "Processing",
  2: "Shipped",
  3: "Delivered",
  4: "Cancelled",
};

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const statusFilter = url.searchParams.get("status") || "";

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(order.productTitle, `%${pagination.search}%`),
        like(user.username, `%${pagination.search}%`)
      )!
    );
  }
  if (statusFilter !== "" && statusFilter !== "all") {
    conditions.push(eq(order.status, Number(statusFilter)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "productTitle" ? order.productTitle
    : pagination.sort === "total" ? order.total
    : order.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [orders, [{ total }]] = await Promise.all([
    db.select({
      id: order.id,
      productTitle: order.productTitle,
      total: order.total,
      status: order.status,
      userId: order.userId,
      created: order.created,
      username: user.username,
    })
      .from(order)
      .leftJoin(user, eq(order.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(order)
      .leftJoin(user, eq(order.userId, user.id))
      .where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    orders,
    pagination: { ...pagination, total, totalPages },
    filters: { status: statusFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "update_status") {
    const orderId = Number(formData.get("orderId"));
    const newStatus = Number(formData.get("status"));

    const [oldOrder] = await db.select({ status: order.status }).from(order).where(eq(order.id, orderId)).limit(1);
    if (!oldOrder) return { errors: { general: ["Order not found"] } };

    await db.update(order).set({ status: newStatus }).where(eq(order.id, orderId));
    await logAudit({
      adminId: session.adminId,
      action: `update_order_status_${ORDER_STATUS_MAP[newStatus] || newStatus}`,
      entityType: "order",
      entityId: orderId,
      oldValues: { status: oldOrder.status, statusLabel: ORDER_STATUS_MAP[oldOrder.status] },
      newValues: { status: newStatus, statusLabel: ORDER_STATUS_MAP[newStatus] },
      request,
    });
    return { success: true, intent: "update_status", status: newStatus };
  }

  return { errors: { general: ["Unknown action"] } };
}

type OrderRow = {
  id: number;
  productTitle: string;
  total: number;
  status: number;
  userId: number;
  created: Date;
  username: string | null;
};

export default function OrdersListPage() {
  const { orders, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    orderId: number;
    newStatus: number;
  }>({ open: false, title: "", description: "", intent: "", orderId: 0, newStatus: 0 });

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
      prev.delete("status");
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
    const { orderId, newStatus } = confirmDialog;
    fetcher.submit({ intent: "update_status", orderId: String(orderId), status: String(newStatus) }, { method: "post" });
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const getNextStatus = (currentStatus: number): number | null => {
    if (currentStatus === 0) return 1; // pending -> processing
    if (currentStatus === 1) return 2; // processing -> shipped
    if (currentStatus === 2) return 3; // shipped -> delivered
    return null;
  };

  const columns: ColumnDef<OrderRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "productTitle",
      header: "Product Title",
      cell: ({ row }) => (
        <span className="text-sm line-clamp-1 max-w-[200px]">{row.original.productTitle || "—"}</span>
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
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => (
        <span className="font-medium">${Number(row.original.total).toFixed(2)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={ORDER_STATUS_MAP[row.original.status] || "pending"} />
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
        const nextStatus = getNextStatus(row.original.status);
        const canCancel = row.original.status < 3 && row.original.status !== 4;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {nextStatus !== null && (
                <DropdownMenuItem
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: `Update Order Status`,
                    description: `Are you sure you want to update order #${row.original.id} from "${ORDER_STATUS_LABELS[row.original.status]}" to "${ORDER_STATUS_LABELS[nextStatus]}"?`,
                    intent: "update_status",
                    orderId: row.original.id,
                    newStatus: nextStatus,
                  })}
                >
                  <ArrowRight className="mr-2 h-4 w-4" /> Mark as {ORDER_STATUS_LABELS[nextStatus]}
                </DropdownMenuItem>
              )}
              {canCancel && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: "Cancel Order",
                    description: `Are you sure you want to cancel order #${row.original.id}? This action cannot be undone.`,
                    intent: "update_status",
                    orderId: row.original.id,
                    newStatus: 4,
                  })}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Cancel Order
                </DropdownMenuItem>
              )}
              {!nextStatus && !canCancel && (
                <DropdownMenuItem disabled>
                  No actions available
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
        <p className="text-muted-foreground">
          Manage e-commerce orders. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by product title or username..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "0", label: "Pending" },
              { value: "1", label: "Processing" },
              { value: "2", label: "Shipped" },
              { value: "3", label: "Delivered" },
              { value: "4", label: "Cancelled" },
            ],
          },
        ]}
        filterValues={{
          status: filters.status || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={orders}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No orders found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.newStatus === 4 ? "danger" : "default"}
      />
    </div>
  );
}