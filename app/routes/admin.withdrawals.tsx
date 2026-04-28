import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { withdrawRequest, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { withdrawalActionSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, CheckCircle2, XCircle } from "lucide-react";

const WITHDRAWAL_STATUS_MAP: Record<number, string> = {
  0: "pending",
  1: "approved",
  2: "rejected",
};

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const statusFilter = url.searchParams.get("status") || "0";

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(user.username, `%${pagination.search}%`),
        like(withdrawRequest.email, `%${pagination.search}%`)
      )!
    );
  }
  if (statusFilter !== "all") {
    conditions.push(eq(withdrawRequest.status, Number(statusFilter)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "amount" ? withdrawRequest.amount
    : pagination.sort === "coin" ? withdrawRequest.coin
    : withdrawRequest.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [withdrawals, [{ total }]] = await Promise.all([
    db.select({
      id: withdrawRequest.id,
      userId: withdrawRequest.userId,
      amount: withdrawRequest.amount,
      coin: withdrawRequest.coin,
      email: withdrawRequest.email,
      status: withdrawRequest.status,
      created: withdrawRequest.created,
      username: user.username,
    })
      .from(withdrawRequest)
      .leftJoin(user, eq(withdrawRequest.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(withdrawRequest)
      .leftJoin(user, eq(withdrawRequest.userId, user.id))
      .where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    withdrawals,
    pagination: { ...pagination, total, totalPages },
    filters: { status: statusFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "approve") {
    const withdrawalId = Number(formData.get("withdrawalId"));
    const result = withdrawalActionSchema.safeParse({ status: "approved", intent: "approve" });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [wr] = await db.select({
      userId: withdrawRequest.userId,
      amount: withdrawRequest.amount,
      status: withdrawRequest.status,
      coin: withdrawRequest.coin,
    }).from(withdrawRequest).where(eq(withdrawRequest.id, withdrawalId)).limit(1);

    if (!wr) return { errors: { general: ["Withdrawal request not found"] } };

    await db.update(withdrawRequest).set({ status: 1, updated: new Date() }).where(eq(withdrawRequest.id, withdrawalId));

    // Deduct from user wallet
    await db.update(user).set({ wallet: sql`wallet - ${wr.coin}` }).where(eq(user.id, wr.userId));

    await logAudit({
      adminId: session.adminId,
      action: "approve_withdrawal",
      entityType: "withdraw_request",
      entityId: withdrawalId,
      oldValues: { status: wr.status },
      newValues: { status: 1 },
      request,
    });
    return { success: true, intent: "approve" };
  }

  if (intent === "reject") {
    const withdrawalId = Number(formData.get("withdrawalId"));
    const reason = String(formData.get("reason") || "");
    const result = withdrawalActionSchema.safeParse({ status: "rejected", reason: reason || undefined, intent: "reject" });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [wr] = await db.select({
      status: withdrawRequest.status,
    }).from(withdrawRequest).where(eq(withdrawRequest.id, withdrawalId)).limit(1);

    if (!wr) return { errors: { general: ["Withdrawal request not found"] } };

    await db.update(withdrawRequest).set({ status: 2, updated: new Date() }).where(eq(withdrawRequest.id, withdrawalId));

    await logAudit({
      adminId: session.adminId,
      action: "reject_withdrawal",
      entityType: "withdraw_request",
      entityId: withdrawalId,
      oldValues: { status: wr.status },
      newValues: { status: 2, reason },
      request,
    });
    return { success: true, intent: "reject" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type WithdrawalRow = {
  id: number;
  userId: number;
  amount: number;
  coin: number;
  email: string;
  status: number;
  created: Date;
  username: string | null;
};

export default function WithdrawalsListPage() {
  const { withdrawals, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    withdrawalId: number;
  }>({ open: false, title: "", description: "", intent: "", withdrawalId: 0 });
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    withdrawalId: number;
    reason: string;
  }>({ open: false, withdrawalId: 0, reason: "" });

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

  const handleApproveConfirm = () => {
    const { withdrawalId } = confirmDialog;
    fetcher.submit({ intent: "approve", withdrawalId: String(withdrawalId) }, { method: "post" });
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleRejectConfirm = () => {
    const { withdrawalId, reason } = rejectDialog;
    fetcher.submit({ intent: "reject", withdrawalId: String(withdrawalId), reason }, { method: "post" });
    setRejectDialog({ open: false, withdrawalId: 0, reason: "" });
  };

  const columns: ColumnDef<WithdrawalRow>[] = [
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
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-medium">${Number(row.original.amount).toFixed(2)}</span>
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
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.email || "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={WITHDRAWAL_STATUS_MAP[row.original.status] || "pending"} />
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
        row.original.status === 0 ? (
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
                  title: "Approve Withdrawal",
                  description: `Are you sure you want to approve withdrawal #${row.original.id} for $${Number(row.original.amount).toFixed(2)} (${row.original.coin.toLocaleString()} coins)? This will deduct coins from the user's wallet.`,
                  intent: "approve",
                  withdrawalId: row.original.id,
                })}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setRejectDialog({
                  open: true,
                  withdrawalId: row.original.id,
                  reason: "",
                })}
              >
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Withdrawals</h2>
        <p className="text-muted-foreground">
          Manage withdrawal requests. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username or email..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "0", label: "Pending" },
              { value: "1", label: "Approved" },
              { value: "2", label: "Rejected" },
            ],
          },
        ]}
        filterValues={{
          status: filters.status || "0",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={withdrawals}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No withdrawal requests found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleApproveConfirm}
        variant="default"
        confirmLabel="Approve"
      />

      <ConfirmDialog
        open={rejectDialog.open}
        onOpenChange={(open) => setRejectDialog((prev) => ({ ...prev, open }))}
        title="Reject Withdrawal"
        description="Are you sure you want to reject this withdrawal request? The user will be notified."
        onConfirm={handleRejectConfirm}
        variant="danger"
        confirmLabel="Reject"
      />
    </div>
  );
}