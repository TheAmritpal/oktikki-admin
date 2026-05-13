import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { giftSend, platformFee, user as userTable, gift } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { rollbackGiftSchema } from "~/lib/validation";
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
import { MoreHorizontal, RotateCcw, Gift } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const contextFilter = url.searchParams.get("context") || "";
  const minCoinFilter = url.searchParams.get("minCoin") || "";
  const maxCoinFilter = url.searchParams.get("maxCoin") || "";

  const conditions = [];
  if (pagination.search) {
    const s = `%${pagination.search}%`;
    conditions.push(
      or(
        like(userTable.username, s),
        like(giftSend.title, s)
      )!
    );
  }
  if (contextFilter === "video") conditions.push(eq(giftSend.videoId, sql`${giftSend.videoId} > 0`));
  if (contextFilter === "live") conditions.push(eq(giftSend.liveStreamingId, sql`${giftSend.liveStreamingId} > 0`));
  if (minCoinFilter) conditions.push(sql`${giftSend.coin} >= ${Number(minCoinFilter)}`);
  if (maxCoinFilter) conditions.push(sql`${giftSend.coin} <= ${Number(maxCoinFilter)}`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "coin" ? giftSend.coin
    : pagination.sort === "title" ? giftSend.title
    : giftSend.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const giftsWithoutReceivers = await db.select({
      id: giftSend.id,
      giftId: giftSend.giftId,
      title: giftSend.title,
      coin: giftSend.coin,
      image: giftSend.image,
      senderId: giftSend.senderId,
      receiverId: giftSend.receiverId,
      videoId: giftSend.videoId,
      liveStreamingId: giftSend.liveStreamingId,
      totalCoins: giftSend.totalCoins,
      created: giftSend.created,
      senderUsername: userTable.username,
      senderProfilePic: userTable.profilePicSmall,
      feePercentage: platformFee.feePercentage,
    })
      .from(giftSend)
      .leftJoin(platformFee, eq(giftSend.id, platformFee.giftSendId))
      .leftJoin(userTable, eq(giftSend.senderId, userTable.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit));

  const [{ total }] = await db.select({ total: count() }).from(giftSend)
    .leftJoin(platformFee, eq(giftSend.id, platformFee.giftSendId))
    .leftJoin(userTable, eq(giftSend.senderId, userTable.id))
    .where(whereClause);

  const receiverIds = giftsWithoutReceivers.map(g => g.receiverId);
  const receiversMap = receiverIds.length > 0 ? new Map(
    (await db.select({
      id: userTable.id,
      username: userTable.username,
      profilePicSmall: userTable.profilePicSmall,
    }).from(userTable).where(sql`${userTable.id} IN ${receiverIds}`)).map(u => [u.id, u])
  ) : new Map();

  const giftTransactions = giftsWithoutReceivers.map(g => ({
    ...g,
    receiverUsername: receiversMap.get(g.receiverId)?.username || null,
    receiverProfilePic: receiversMap.get(g.receiverId)?.profilePicSmall || null,
  }));

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    giftTransactions: giftTransactions as any[],
    pagination: { ...pagination, total, totalPages },
    filters: { context: contextFilter, minCoin: minCoinFilter, maxCoin: maxCoinFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "rollback") {
    const giftSendId = Number(formData.get("giftSendId"));
    const reason = String(formData.get("reason") || "");
    const result = rollbackGiftSchema.safeParse({ giftSendId, reason, intent: "rollback" });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [giftSendRecord] = await db.select({
      id: giftSend.id,
      senderId: giftSend.senderId,
      receiverId: giftSend.receiverId,
      coin: giftSend.coin,
      totalCoins: giftSend.totalCoins,
      title: giftSend.title,
    }).from(giftSend).where(eq(giftSend.id, result.data.giftSendId)).limit(1);

    if (!giftSendRecord) return { errors: { general: ["Gift transaction not found"] } };

    const amountToReturn = giftSendRecord.totalCoins || giftSendRecord.coin;

    await db.delete(giftSend).where(eq(giftSend.id, result.data.giftSendId));
    await db.delete(platformFee).where(eq(platformFee.giftSendId, result.data.giftSendId));

    await db.update(userTable).set({ wallet: sql`wallet + ${amountToReturn}` }).where(eq(userTable.id, giftSendRecord.senderId));
    await db.update(userTable).set({ wallet: sql`wallet - ${giftSendRecord.coin}` }).where(eq(userTable.id, giftSendRecord.receiverId));

    await logAudit({
      adminId: session.adminId,
      action: "rollback_gift",
      entityType: "giftSend",
      entityId: result.data.giftSendId,
      oldValues: { senderId: giftSendRecord.senderId, receiverId: giftSendRecord.receiverId, coin: giftSendRecord.coin },
      newValues: { reason: result.data.reason, amountReturned: amountToReturn },
      request,
    });

    return { success: true, intent: "rollback" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type GiftTransactionRow = {
  id: number;
  giftId: number;
  title: string;
  coin: number;
  image: string;
  senderId: number;
  receiverId: number;
  videoId: number;
  liveStreamingId: number;
  totalCoins: number;
  created: Date;
  senderUsername: string | null;
  senderProfilePic: string | null;
  receiverUsername: string | null;
  receiverProfilePic: string | null;
  feePercentage: number | null;
};

export default function GiftTransactionsPage() {
  const { giftTransactions, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    giftSendId: number;
  }>({ open: false, title: "", description: "", intent: "", giftSendId: 0 });

  const [rollbackDialog, setRollbackDialog] = useState<{
    open: boolean;
    giftSendId: number;
    coin: number;
    senderUsername: string;
    receiverUsername: string;
    reason: string;
  }>({ open: false, giftSendId: 0, coin: 0, senderUsername: "", receiverUsername: "", reason: "" });

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
      prev.delete("context");
      prev.delete("minCoin");
      prev.delete("maxCoin");
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

  const handleRollbackClick = (tx: GiftTransactionRow) => {
    setRollbackDialog({
      open: true,
      giftSendId: tx.id,
      coin: tx.coin,
      senderUsername: tx.senderUsername || `User #${tx.senderId}`,
      receiverUsername: tx.receiverUsername || `User #${tx.receiverId}`,
      reason: "",
    });
  };

  const handleRollbackConfirm = () => {
    const { giftSendId, reason } = rollbackDialog;
    fetcher.submit({ intent: "rollback", giftSendId: String(giftSendId), reason }, { method: "post" });
    setRollbackDialog({ open: false, giftSendId: 0, coin: 0, senderUsername: "", receiverUsername: "", reason: "" });
  };

  const columns: ColumnDef<GiftTransactionRow>[] = [
    {
      accessorKey: "image",
      header: "Gift",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-muted-foreground" />
          {row.original.image ? (
            <img src={row.original.image} alt={row.original.title} className="h-8 w-8 rounded object-cover" />
          ) : (
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs">N/A</div>
          )}
          <span className="text-sm font-medium">{row.original.title}</span>
        </div>
      ),
    },
    {
      accessorKey: "senderUsername",
      header: "Sender",
      cell: ({ row }) => (
        row.original.senderUsername ? (
          <Link to={`/admin/users/${row.original.senderId}`} className="flex items-center gap-2 hover:underline">
            <UserAvatar
              src={row.original.senderProfilePic}
              name={row.original.senderUsername}
              size="sm"
            />
            <span className="text-sm font-medium">@{row.original.senderUsername}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.senderId}</span>
        )
      ),
    },
    {
      accessorKey: "receiverUsername",
      header: "Receiver",
      cell: ({ row }) => (
        row.original.receiverUsername ? (
          <Link to={`/admin/users/${row.original.receiverId}`} className="flex items-center gap-2 hover:underline">
            <UserAvatar
              src={row.original.receiverProfilePic}
              name={row.original.receiverUsername}
              size="sm"
            />
            <span className="text-sm font-medium">@{row.original.receiverUsername}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.receiverId}</span>
        )
      ),
    },
    {
      accessorKey: "coin",
      header: "Coins (Total)",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.totalCoins || row.original.coin.toLocaleString()}</span>
          {row.original.feePercentage && (
            <span className="text-xs text-muted-foreground">
              {row.original.coin} coins ({100 - Number(row.original.feePercentage)}% to receiver)
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "videoId",
      header: "Context",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.videoId > 0 ? (
            <Link to={`/admin/videos/${row.original.videoId}`} className="text-primary hover:underline">
              Video #{row.original.videoId}
            </Link>
          ) : row.original.liveStreamingId > 0 ? (
            <Link to={`/admin/live-streams/${row.original.liveStreamingId}`} className="text-primary hover:underline">
              Live #{row.original.liveStreamingId}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "created",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created).toLocaleString()}
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
              className="text-destructive focus:text-destructive"
              onClick={() => handleRollbackClick(row.original)}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Rollback Gift
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Gift Transactions</h2>
        <p className="text-muted-foreground">
          View and manage all gift transactions. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username or gift name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "context",
            label: "Context",
            options: [
              { value: "all", label: "All" },
              { value: "video", label: "Video" },
              { value: "live", label: "Live Stream" },
            ],
          },
        ]}
        filterValues={{
          context: filters.context || "all",
        }}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={giftTransactions}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No gift transactions found."
      />

      <Dialog open={rollbackDialog.open} onOpenChange={(open) => setRollbackDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback Gift Transaction</DialogTitle>
            <DialogDescription>
              This will delete this gift transaction, return {rollbackDialog.coin.toLocaleString()} coins to @{rollbackDialog.senderUsername},
              and deduct {rollbackDialog.coin.toLocaleString()} coins from @{rollbackDialog.receiverUsername}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rollback-reason">Reason</Label>
              <Input
                id="rollback-reason"
                value={rollbackDialog.reason}
                onChange={(e) => setRollbackDialog((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter reason for rollback"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackDialog((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRollbackConfirm}
              disabled={!rollbackDialog.reason}
            >
              Rollback Gift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
