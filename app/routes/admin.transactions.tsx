import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { transaction, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { refundTransactionSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { MoreHorizontal, RotateCcw } from "lucide-react";

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  buy_coins: "Buy Coins",
  send_gift: "Send Gift",
  receive_gift: "Receive Gift",
  withdraw_request: "Withdraw Request",
  withdraw_complete: "Withdraw Complete",
  video_promotion: "Video Promotion",
  other_earnings: "Other Earnings",
};

const TRANSACTION_DIRECTION_LABELS: Record<string, string> = {
  debit: "Debit",
  credit: "Credit",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
};

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const typeFilter = url.searchParams.get("type") || "";
  const directionFilter = url.searchParams.get("direction") || "";
  const statusFilter = url.searchParams.get("status") || "";

  const conditions = [];
  if (pagination.search) {
    const s = `%${pagination.search}%`;
    conditions.push(
      or(
        like(user.username, s),
        like(transaction.title, s)
      )!
    );
  }
  if (typeFilter) conditions.push(sql`${transaction.transactionType} = ${typeFilter}`);
  if (directionFilter) conditions.push(sql`${transaction.transactionDirection} = ${directionFilter}`);
  if (statusFilter) conditions.push(sql`${transaction.status} = ${statusFilter}`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "amount" ? transaction.amount
    : pagination.sort === "type" ? transaction.transactionType
    : transaction.createdAt;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [transactions, [{ total }]] = await Promise.all([
    db.select({
      id: transaction.id,
      userId: transaction.userId,
      title: transaction.title,
      transactionType: transaction.transactionType,
      transactionDirection: transaction.transactionDirection,
      amount: transaction.amount,
      usdValue: transaction.usdValue,
      receiverId: transaction.receiverId,
      videoId: transaction.videoId,
      status: transaction.status,
      createdAt: transaction.createdAt,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    })
      .from(transaction)
      .leftJoin(user, eq(transaction.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(transaction)
      .leftJoin(user, eq(transaction.userId, user.id))
      .where(whereClause),
  ]);

  const typedTransactions = transactions.map((tx: any) => ({
    ...tx,
    usdValue: tx.usdValue ? parseFloat(String(tx.usdValue)) : null,
  }));

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    transactions: typedTransactions,
    pagination: { ...pagination, total, totalPages },
    filters: { type: typeFilter, direction: directionFilter, status: statusFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "refund") {
    const transactionId = Number(formData.get("transactionId"));
    const reason = String(formData.get("reason") || "");
    const result = refundTransactionSchema.safeParse({ transactionId, reason, intent: "refund" });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [originalTx] = await db.select({
      id: transaction.id,
      userId: transaction.userId,
      title: transaction.title,
      transactionType: transaction.transactionType,
      transactionDirection: transaction.transactionDirection,
      amount: transaction.amount,
      usdValue: transaction.usdValue,
      receiverId: transaction.receiverId,
    }).from(transaction).where(eq(transaction.id, result.data.transactionId)).limit(1);

    if (!originalTx) return { errors: { general: ["Transaction not found"] } };

    const reverseDirection = originalTx.transactionDirection === "debit" ? "credit" : "debit";
    const refundAmount = originalTx.amount;
    const newUserId = originalTx.transactionDirection === "debit" ? originalTx.userId : originalTx.receiverId;

    const insertValues: any = {
      userId: newUserId,
      title: `Refund: ${originalTx.title} (Tx #${originalTx.id}) - ${result.data.reason}`,
      transactionType: "other_earnings",
      transactionDirection: reverseDirection,
      amount: refundAmount,
      status: "completed",
    };

    if (originalTx.usdValue !== null) {
      insertValues.usdValue = originalTx.usdValue;
    }

    if (originalTx.transactionDirection === "credit") {
      insertValues.receiverId = originalTx.userId;
    }

    await db.insert(transaction).values(insertValues);

    await logAudit({
      adminId: session.adminId,
      action: "refund_transaction",
      entityType: "transaction",
      entityId: originalTx.id,
      oldValues: { transactionType: originalTx.transactionType, amount: originalTx.amount },
      newValues: { refundAmount, reason: result.data.reason },
      request,
    });

    return { success: true, intent: "refund" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type TransactionRow = {
  id: number;
  userId: number;
  title: string;
  transactionType: string;
  transactionDirection: string;
  amount: number;
  usdValue: number | null;
  receiverId: number | null;
  videoId: number | null;
  status: string;
  createdAt: Date;
  username: string | null;
  profilePicSmall: string | null;
};

export default function TransactionsPage() {
  const { transactions, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    transactionId: number;
    amount: number;
    direction: string;
  }>({ open: false, title: "", description: "", intent: "", transactionId: 0, amount: 0, direction: "" });

  const [refundDialog, setRefundDialog] = useState<{
    open: boolean;
    transactionId: number;
    amount: number;
    direction: string;
    reason: string;
  }>({ open: false, transactionId: 0, amount: 0, direction: "", reason: "" });

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
      prev.delete("type");
      prev.delete("direction");
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

  const handleRefundClick = (tx: TransactionRow) => {
    setRefundDialog({
      open: true,
      transactionId: tx.id,
      amount: tx.amount,
      direction: tx.transactionDirection,
      reason: "",
    });
  };

  const handleRefundConfirm = () => {
    const { transactionId, reason } = refundDialog;
    fetcher.submit({ intent: "refund", transactionId: String(transactionId), reason }, { method: "post" });
    setRefundDialog({ open: false, transactionId: 0, amount: 0, direction: "", reason: "" });
  };

  const columns: ColumnDef<TransactionRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="text-sm font-mono">#{row.original.id}</span>
      ),
    },
    {
      accessorKey: "userId",
      header: "User",
      cell: ({ row }) => (
        row.original.username ? (
          <Link to={`/admin/users/${row.original.userId}`} className="flex items-center gap-2 hover:underline">
            <UserAvatar
              src={row.original.profilePicSmall}
              name={row.original.username}
              size="sm"
            />
            <span className="text-sm font-medium">@{row.original.username}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.userId}</span>
        )
      ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate text-sm">{row.original.title}</div>
      ),
    },
    {
      accessorKey: "transactionType",
      header: "Type",
      cell: ({ row }) => (
        <StatusBadge status={TRANSACTION_TYPE_LABELS[row.original.transactionType] || row.original.transactionType} />
      ),
    },
    {
      accessorKey: "transactionDirection",
      header: "Direction",
      cell: ({ row }) => (
        <span className={`text-sm font-medium ${row.original.transactionDirection === "debit" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
          {TRANSACTION_DIRECTION_LABELS[row.original.transactionDirection]}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.amount.toLocaleString()} coins</span>
      ),
    },
    {
      accessorKey: "usdValue",
      header: "USD Value",
      cell: ({ row }) => (
        row.original.usdValue ? (
          <span className="text-sm">${Number(row.original.usdValue).toFixed(2)}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={STATUS_LABELS[row.original.status] || row.original.status} />
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleString()}
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
              onClick={() => handleRefundClick(row.original)}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Refund
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
        <p className="text-muted-foreground">
          View and manage all wallet transactions. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username or title..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "type",
            label: "Type",
            options: [
              { value: "all", label: "All Types" },
              { value: "buy_coins", label: "Buy Coins" },
              { value: "send_gift", label: "Send Gift" },
              { value: "receive_gift", label: "Receive Gift" },
              { value: "withdraw_request", label: "Withdraw Request" },
              { value: "withdraw_complete", label: "Withdraw Complete" },
              { value: "video_promotion", label: "Video Promotion" },
              { value: "other_earnings", label: "Other Earnings" },
            ],
          },
          {
            name: "direction",
            label: "Direction",
            options: [
              { value: "all", label: "All" },
              { value: "debit", label: "Debit" },
              { value: "credit", label: "Credit" },
            ],
          },
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "completed", label: "Completed" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Failed" },
            ],
          },
        ]}
        filterValues={{
          type: filters.type || "all",
          direction: filters.direction || "all",
          status: filters.status || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={transactions}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No transactions found."
      />

      <Dialog open={refundDialog.open} onOpenChange={(open) => setRefundDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Transaction</DialogTitle>
            <DialogDescription>
              This will create a {refundDialog.direction === "debit" ? "credit" : "debit"} transaction of {refundDialog.amount.toLocaleString()} coins to reverse transaction #{refundDialog.transactionId}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason</Label>
              <Input
                id="refund-reason"
                value={refundDialog.reason}
                onChange={(e) => setRefundDialog((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter reason for refund"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialog((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={handleRefundConfirm}
              disabled={!refundDialog.reason}
            >
              Process Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
