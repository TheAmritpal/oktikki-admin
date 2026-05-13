import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { walletActionSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Plus, Minus, ArrowUpRight } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const conditions = [];
  if (pagination.search) {
    const s = `%${pagination.search}%`;
    conditions.push(
      or(
        like(user.username, s),
        like(user.email, s),
        like(user.firstName, s),
        like(user.lastName, s)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "username" ? user.username
    : pagination.sort === "wallet" ? user.wallet
    : pagination.sort === "totalFlems" ? user.totalFlems
    : pagination.sort === "level" ? user.level
    : user.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [users, [{ total }]] = await Promise.all([
    db.select({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      profilePicSmall: user.profilePicSmall,
      role: user.role,
      wallet: user.wallet,
      totalFlems: user.totalFlems || 0,
      level: user.level,
      formattedLevel: user.formattedLevel,
      active: user.active,
      verified: user.verified,
      created: user.created,
    })
      .from(user)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(user).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);
  const typedUsers = users.map((u: any) => ({
    ...u,
    totalFlems: u.totalFlems || 0,
  }));

  return {
    session,
    users: typedUsers,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "add_balance" || intent === "remove_balance") {
    const data = {
      userId: Number(formData.get("userId")),
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason") || ""),
      intent: intent as "add_balance" | "remove_balance",
    };
    const result = walletActionSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldUser] = await db.select({
      wallet: user.wallet,
    }).from(user).where(eq(user.id, result.data.userId)).limit(1);

    if (!oldUser) return { errors: { general: ["User not found"] } };

    const actualAmount = result.data.intent === "add_balance" ? result.data.amount : -result.data.amount;
    const newWallet = oldUser.wallet + actualAmount;

    if (newWallet < 0) return { errors: { amount: ["Insufficient wallet balance for removal"] } };

    await db.update(user).set({ wallet: newWallet }).where(eq(user.id, result.data.userId));

    await logAudit({
      adminId: session.adminId,
      action: result.data.intent === "add_balance" ? "add_balance" : "remove_balance",
      entityType: "user",
      entityId: result.data.userId,
      oldValues: { wallet: oldUser.wallet },
      newValues: { wallet: newWallet, reason: result.data.reason },
      request,
    });

    return { success: true, intent: result.data.intent, newWallet };
  }

  return { errors: { general: ["Unknown action"] } };
}

type UserRow = {
  id: number;
  firstName: string;
  lastName: string;
  username: string | null;
  email: string | null;
  profilePicSmall: string;
  role: string;
  wallet: number;
  totalFlems: number;
  level: number;
  formattedLevel: string;
  active: number;
  verified: number;
  created: Date;
};

export default function WalletsPage() {
  const { users, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    userId: number;
    amount: number;
    reason: string;
  }>({ open: false, title: "", description: "", intent: "", userId: 0, amount: 0, reason: "" });

  const [walletDialog, setWalletDialog] = useState<{
    open: boolean;
    userId: number;
    userName: string;
    intent: "add_balance" | "remove_balance";
  }>({ open: false, userId: 0, userName: "", intent: "add_balance" });

  const [walletForm, setWalletForm] = useState({ amount: "", reason: "" });

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

  const handleWalletAction = (intent: "add_balance" | "remove_balance", userId: number, userName: string) => {
    setWalletDialog({ open: true, userId, userName, intent });
    setWalletForm({ amount: "", reason: "" });
  };

  const handleWalletSubmit = () => {
    const { userId, intent } = walletDialog;
    fetcher.submit({
      intent,
      userId: String(userId),
      amount: String(walletForm.amount),
      reason: walletForm.reason,
    }, { method: "post" });
    setWalletDialog((prev) => ({ ...prev, open: false }));
    setWalletForm({ amount: "", reason: "" });
  };

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "firstName",
      header: "User",
      cell: ({ row }) => (
        <Link to={`/admin/users/${row.original.id}`} className="flex items-center gap-3 hover:underline">
          <UserAvatar
            src={row.original.profilePicSmall}
            name={`${row.original.firstName} ${row.original.lastName}`}
            verified={row.original.verified === 1}
            size="sm"
          />
          <div className="min-w-0">
            <p className="font-medium truncate">{row.original.firstName} {row.original.lastName}</p>
            {row.original.username && (
              <p className="text-xs text-muted-foreground">@{row.original.username}</p>
            )}
          </div>
        </Link>
      ),
    },
    {
      accessorKey: "wallet",
      header: "Wallet Balance",
      cell: ({ row }) => (
        <span className="font-medium text-green-600 dark:text-green-400">{row.original.wallet.toLocaleString()} coins</span>
      ),
    },
    {
      accessorKey: "totalFlems",
      header: "Total Flames",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-orange-600 dark:text-orange-400">{row.original.totalFlems.toLocaleString()}</span>
        </div>
      ),
    },
    {
      accessorKey: "level",
      header: "Level",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">Lvl {row.original.level}</span>
          <span className="text-xs text-muted-foreground">{row.original.formattedLevel}</span>
        </div>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.active === 1 ? "active" : "blocked"} />
      ),
    },
    {
      accessorKey: "created",
      header: "Joined",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleWalletAction("add_balance", row.original.id, `${row.original.firstName} ${row.original.lastName}`)}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleWalletAction("remove_balance", row.original.id, `${row.original.firstName} ${row.original.lastName}`)}
          >
            <Minus className="h-3 w-3 mr-1" /> Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Wallets</h2>
        <p className="text-muted-foreground">
          Manage user wallets and flames. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username, email, or name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={users}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No users found."
      />

      <Dialog open={walletDialog.open} onOpenChange={(open) => setWalletDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {walletDialog.intent === "add_balance" ? "Add Balance" : "Remove Balance"}
            </DialogTitle>
            <DialogDescription>
              {walletDialog.intent === "add_balance"
                ? `Add coins to ${walletDialog.userName}'s wallet`
                : `Remove coins from ${walletDialog.userName}'s wallet`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-amount">Amount (coins)</Label>
              <Input
                id="wallet-amount"
                type="number"
                min="1"
                value={walletForm.amount}
                onChange={(e) => setWalletForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Enter amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-reason">Reason</Label>
              <Input
                id="wallet-reason"
                value={walletForm.reason}
                onChange={(e) => setWalletForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter reason for this action"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalletDialog((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={handleWalletSubmit}
              disabled={!walletForm.amount || !walletForm.reason}
            >
              {walletDialog.intent === "add_balance" ? (
                <><Plus className="mr-2 h-4 w-4" /> Add Balance</>
              ) : (
                <><Minus className="mr-2 h-4 w-4" /> Remove Balance</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
