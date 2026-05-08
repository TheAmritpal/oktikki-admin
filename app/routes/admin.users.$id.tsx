import { useState } from "react";
import { Link, useLoaderData, useFetcher, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { redirect } from "react-router";
import { db } from "~/db/index.server";
import { user, video, follower, order, transaction, liveStreaming } from "~/db/schema";
import { eq, count, desc, and, sql } from "drizzle-orm";
import { requireAuth, hashPassword } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { blockUserSchema, rechargeWalletSchema, updateUserSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { StatCard } from "~/components/stat-card";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { UserAvatar } from "~/components/user-avatar";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ArrowLeft, ShieldOff, ShieldCheck, Trash2, Wallet, CheckCircle2, XCircle, Pencil } from "lucide-react";

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const userId = Number(params.id);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "profile";

  const [userData] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!userData) {
    throw new Response("User not found", { status: 404 });
  }

  let tabData: Record<string, unknown> = {};

  if (tab === "videos") {
    const page = Number(url.searchParams.get("vpage")) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const [videos, [{ total: videoCount }]] = await Promise.all([
      db.select({
        id: video.id,
        description: video.description,
        video: video.video,
        thum: video.thum,
        view: video.view,
        block: video.block,
        created: video.created,
      }).from(video).where(eq(video.userId, userId))
        .orderBy(desc(video.created)).limit(limit).offset(offset),
      db.select({ total: count() }).from(video).where(eq(video.userId, userId)),
    ]);
    tabData = { videos, videoCount, videoPage: page, videoTotalPages: Math.ceil(videoCount / limit) };
  }

  if (tab === "followers") {
    const [followerResult, followingResult] = await Promise.all([
      db.select({ total: count() }).from(follower).where(eq(follower.receiverId, userId)),
      db.select({ total: count() }).from(follower).where(eq(follower.senderId, userId)),
    ]);
    tabData = {
      followerCount: followerResult[0]?.total ?? 0,
      followingCount: followingResult[0]?.total ?? 0,
    };
  }

  if (tab === "orders") {
    const page = Number(url.searchParams.get("opage")) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const [orders, [{ total: orderCount }]] = await Promise.all([
      db.select({
        id: order.id,
        productTitle: order.productTitle,
        total: order.total,
        status: order.status,
        created: order.created,
      }).from(order).where(eq(order.userId, userId))
        .orderBy(desc(order.created)).limit(limit).offset(offset),
      db.select({ total: count() }).from(order).where(eq(order.userId, userId)),
    ]);
    tabData = { orders, orderCount, orderPage: page, orderTotalPages: Math.ceil(orderCount / limit) };
  }

  if (tab === "wallet") {
    const page = Number(url.searchParams.get("wpage")) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const [transactions, [{ total: txCount }]] = await Promise.all([
      db.select({
        id: transaction.id,
        title: transaction.title,
        transactionType: transaction.transactionType,
        transactionDirection: transaction.transactionDirection,
        amount: transaction.amount,
        status: transaction.status,
        createdAt: transaction.createdAt,
      }).from(transaction).where(eq(transaction.userId, userId))
        .orderBy(desc(transaction.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(transaction).where(eq(transaction.userId, userId)),
    ]);
    tabData = { transactions, txCount, txPage: page, txTotalPages: Math.ceil(txCount / limit) };
  }

  if (tab === "activity") {
    const page = Number(url.searchParams.get("apage")) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const [streams, [{ total: streamCount }]] = await Promise.all([
      db.select({
        id: liveStreaming.id,
        startedAt: liveStreaming.startedAt,
        duration: liveStreaming.duration,
        earnCoin: liveStreaming.earnCoin,
      }).from(liveStreaming).where(eq(liveStreaming.userId, userId))
        .orderBy(desc(liveStreaming.created)).limit(limit).offset(offset),
      db.select({ total: count() }).from(liveStreaming).where(eq(liveStreaming.userId, userId)),
    ]);
    tabData = { streams, streamCount, streamPage: page, streamTotalPages: Math.ceil(streamCount / limit) };
  }

  return {
    session,
    user: userData,
    tab,
    ...tabData,
  };
}

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const userId = Number(params.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "block") {
    const blockValue = Number(formData.get("block"));
    const result = blockUserSchema.safeParse({ block: blockValue, intent: "block" });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldUser] = await db.select({ active: user.active }).from(user).where(eq(user.id, userId)).limit(1);
    await db.update(user).set({ active: blockValue }).where(eq(user.id, userId));
    await logAudit({
      adminId: session.adminId,
      action: blockValue === 0 ? "block_user" : "unblock_user",
      entityType: "user",
      entityId: userId,
      oldValues: { active: oldUser?.active },
      newValues: { active: blockValue },
      request,
    });
    return { success: true, intent: "block", block: blockValue };
  }

  if (intent === "delete") {
    await db.delete(user).where(eq(user.id, userId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_user",
      entityType: "user",
      entityId: userId,
      request,
    });
    throw redirect("/admin/users");
  }

  if (intent === "recharge") {
    const amount = Number(formData.get("amount"));
    const rechargeResult = rechargeWalletSchema.safeParse({ amount, intent: "recharge" });
    if (!rechargeResult.success) return { errors: rechargeResult.error.flatten().fieldErrors };

    const [oldUser] = await db.select({ wallet: user.wallet }).from(user).where(eq(user.id, userId)).limit(1);
    const newWallet = (oldUser?.wallet ?? 0) + amount;
    await db.update(user).set({ wallet: newWallet }).where(eq(user.id, userId));

    await db.insert(transaction).values({
      userId,
      title: "Wallet recharge by admin",
      transactionType: "other_earnings",
      transactionDirection: "credit",
      amount,
      status: "completed",
    });

    await logAudit({
      adminId: session.adminId,
      action: "recharge_wallet",
      entityType: "user",
      entityId: userId,
      oldValues: { wallet: oldUser?.wallet },
      newValues: { wallet: newWallet },
      request,
    });
    return { success: true, intent: "recharge", newWallet };
  }

  if (intent === "edit") {
    const data = {
      userId,
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      username: String(formData.get("username") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      password: String(formData.get("password") || ""),
      gender: String(formData.get("gender") || ""),
      role: String(formData.get("role") || "user"),
      verified: Number(formData.get("verified")),
      active: Number(formData.get("active")),
      dob: String(formData.get("dob") || ""),
      bio: String(formData.get("bio") || ""),
      website: String(formData.get("website") || ""),
      country: String(formData.get("country") || ""),
      wallet: Number(formData.get("wallet")),
    };
    const result = updateUserSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

    const updateData: Record<string, unknown> = {
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      username: result.data.username || null,
      email: result.data.email || null,
      phone: result.data.phone || null,
      gender: result.data.gender,
      role: result.data.role,
      verified: result.data.verified,
      active: result.data.active,
      wallet: result.data.wallet,
      dob: result.data.dob || null,
      bio: result.data.bio ?? "",
      website: result.data.website ?? "",
      country: result.data.country ?? "",
    };

    if (result.data.password) {
      updateData.password = await hashPassword(result.data.password);
    }

    await db.update(user).set(updateData).where(eq(user.id, userId));

    await logAudit({
      adminId: session.adminId,
      action: "edit_user",
      entityType: "user",
      entityId: userId,
      oldValues: oldUser
        ? {
            firstName: oldUser.firstName,
            lastName: oldUser.lastName,
            email: oldUser.email,
            role: oldUser.role,
          }
        : undefined,
      newValues: {
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        email: result.data.email,
        role: result.data.role,
      },
      request,
    });
    return { success: true, intent: "edit" };
  }

  return { errors: { general: ["Unknown action"] } };
}

const ORDER_STATUS_MAP: Record<number, string> = {
  0: "pending",
  1: "processing",
  2: "shipped",
  3: "delivered",
  4: "cancelled",
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function UserDetailPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const userData = data.user;
  const currentTab = data.tab;

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    blockValue?: number;
  }>({ open: false, title: "", description: "", intent: "" });

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string | number>>({});

  const openEditDialog = () => {
    setEditForm({
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      username: userData.username || "",
      email: userData.email || "",
      phone: userData.phone || "",
      password: "",
      gender: userData.gender || "",
      role: userData.role || "user",
      verified: userData.verified ?? 0,
      active: userData.active ?? 1,
      dob: userData.dob ? new Date(userData.dob).toISOString().split("T")[0] : "",
      bio: userData.bio || "",
      website: userData.website || "",
      country: userData.country || "",
      wallet: userData.wallet ?? 0,
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    fetcher.submit(
      {
        intent: "edit",
        ...editForm,
        verified: String(editForm.verified),
        active: String(editForm.active),
        wallet: String(editForm.wallet),
      },
      { method: "post" }
    );
    setEditDialogOpen(false);
  };

  const handleTabChange = (tab: string) => {
    setSearchParams((prev) => {
      prev.set("tab", tab);
      return prev;
    });
  };

  const handleConfirm = () => {
    const { intent, blockValue } = confirmState;
    if (intent === "block" && blockValue !== undefined) {
      fetcher.submit({ intent: "block", block: String(blockValue) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete" }, { method: "post" });
    }
    setConfirmState((prev) => ({ ...prev, open: false }));
  };

  const handleRecharge = () => {
    const amount = Number(rechargeAmount);
    if (amount > 0) {
      fetcher.submit({ intent: "recharge", amount: String(amount) }, { method: "post" });
      setRechargeOpen(false);
      setRechargeAmount("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <UserAvatar
            src={userData.profilePic}
            name={`${userData.firstName} ${userData.lastName}`}
            verified={userData.verified === 1}
            size="lg"
          />
          <div>
            <h2 className="text-2xl font-bold">{userData.firstName} {userData.lastName}</h2>
            {userData.username && (
              <p className="text-muted-foreground">@{userData.username}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={userData.active === 1 ? "active" : "blocked"} />
              <StatusBadge status={userData.role} />
              {userData.verified === 1 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openEditDialog}
          >
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          <Button
            variant={userData.active === 1 ? "outline" : "default"}
            size="sm"
            onClick={() => setConfirmState({
              open: true,
              title: userData.active === 1 ? "Block User" : "Unblock User",
              description: userData.active === 1
                ? `Are you sure you want to block ${userData.firstName}? They will lose access to the app.`
                : `Are you sure you want to unblock ${userData.firstName}? They will regain access.`,
              intent: "block",
              blockValue: userData.active === 1 ? 0 : 1,
            })}
          >
            {userData.active === 1 ? (
              <><ShieldOff className="mr-1 h-4 w-4" /> Block</>
            ) : (
              <><ShieldCheck className="mr-1 h-4 w-4" /> Unblock</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRechargeOpen(true)}
          >
            <Wallet className="mr-1 h-4 w-4" /> Recharge
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmState({
              open: true,
              title: "Delete User",
              description: `Are you sure you want to permanently delete ${userData.firstName} ${userData.lastName}? This cannot be undone.`,
              intent: "delete",
            })}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="followers">Followers</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">First Name</p>
                  <p className="font-medium">{userData.firstName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Name</p>
                  <p className="font-medium">{userData.lastName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Username</p>
                  <p className="font-medium">{userData.username || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{userData.email || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{userData.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gender</p>
                  <p className="font-medium capitalize">{userData.gender}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date of Birth</p>
                  <p className="font-medium">{userData.dob ? new Date(userData.dob).toLocaleDateString() : "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Role</p>
                  <p className="font-medium">{userData.role}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Wallet</p>
                  <p className="font-medium">{userData.wallet.toLocaleString()} coins</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Referral Code</p>
                  <p className="font-medium">{userData.referralCode || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bio</p>
                  <p className="font-medium">{userData.bio || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <p className="font-medium">{userData.website || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Country</p>
                  <p className="font-medium">{userData.country || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Joined</p>
                  <p className="font-medium">{new Date(userData.created).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Videos Tab */}
        <TabsContent value="videos" className="mt-4">
          {data.tab === "videos" && "videos" in data ? (
            <VideosTab
              videos={(data as any).videos}
              videoCount={(data as any).videoCount}
              videoPage={(data as any).videoPage}
              videoTotalPages={(data as any).videoTotalPages}
              onVideoPageChange={(page: number) => {
                setSearchParams((prev) => {
                  prev.set("vpage", String(page));
                  return prev;
                });
              }}
            />
          ) : (
            <p className="text-muted-foreground py-8 text-center">Switch to this tab to load videos.</p>
          )}
        </TabsContent>

        {/* Followers Tab */}
        <TabsContent value="followers" className="mt-4">
          {data.tab === "followers" && "followerCount" in data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <StatCard
                title="Followers"
                value={((data as any).followerCount as number).toLocaleString()}
                icon={CheckCircle2}
              />
              <StatCard
                title="Following"
                value={((data as any).followingCount as number).toLocaleString()}
                icon={CheckCircle2}
              />
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">Switch to this tab to load follower data.</p>
          )}
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-4">
          {data.tab === "orders" && "orders" in data ? (
            <OrdersTab
              orders={(data as any).orders}
              orderCount={(data as any).orderCount}
              orderPage={(data as any).orderPage}
              orderTotalPages={(data as any).orderTotalPages}
              onOrderPageChange={(page: number) => {
                setSearchParams((prev) => {
                  prev.set("opage", String(page));
                  return prev;
                });
              }}
            />
          ) : (
            <p className="text-muted-foreground py-8 text-center">Switch to this tab to load orders.</p>
          )}
        </TabsContent>

        {/* Wallet Tab */}
        <TabsContent value="wallet" className="mt-4 space-y-4">
          <StatCard
            title="Current Balance"
            value={`${userData.wallet.toLocaleString()} coins`}
            icon={Wallet}
          />
          <Button variant="outline" size="sm" onClick={() => setRechargeOpen(true)}>
            <Wallet className="mr-1 h-4 w-4" /> Recharge Wallet
          </Button>
          {data.tab === "wallet" && "transactions" in data ? (
            <WalletTab
              transactions={(data as any).transactions}
              txCount={(data as any).txCount}
              txPage={(data as any).txPage}
              txTotalPages={(data as any).txTotalPages}
              onTxPageChange={(page: number) => {
                setSearchParams((prev) => {
                  prev.set("wpage", String(page));
                  return prev;
                });
              }}
            />
          ) : (
            <p className="text-muted-foreground py-8 text-center">Switch to this tab to load transaction history.</p>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-4">
          {data.tab === "activity" && "streams" in data ? (
            <ActivityTab
              streams={(data as any).streams}
              streamCount={(data as any).streamCount}
              streamPage={(data as any).streamPage}
              streamTotalPages={(data as any).streamTotalPages}
              onStreamPageChange={(page: number) => {
                setSearchParams((prev) => {
                  prev.set("apage", String(page));
                  return prev;
                });
              }}
            />
          ) : (
            <p className="text-muted-foreground py-8 text-center">Switch to this tab to load activity data.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={handleConfirm}
        variant={confirmState.intent === "delete" ? "danger" : "default"}
      />

      {/* Recharge Dialog */}
      <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recharge Wallet</DialogTitle>
            <DialogDescription>
              Add coins to {userData.firstName}&apos;s wallet. Current balance: {userData.wallet.toLocaleString()} coins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recharge-amount">Amount (coins)</Label>
              <Input
                id="recharge-amount"
                type="number"
                min="1"
                placeholder="Enter amount"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechargeOpen(false)}>Cancel</Button>
            <Button onClick={handleRecharge} disabled={!rechargeAmount || Number(rechargeAmount) <= 0}>
              Recharge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user account details. Leave password blank to keep unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ed-fn">First Name *</Label>
              <Input id="ed-fn" value={String(editForm.firstName || "")} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="First name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-ln">Last Name *</Label>
              <Input id="ed-ln" value={String(editForm.lastName || "")} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Last name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-un">Username</Label>
              <Input id="ed-un" value={String(editForm.username || "")} onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))} placeholder="Username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-em">Email</Label>
              <Input id="ed-em" type="email" value={String(editForm.email || "")} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-ph">Phone</Label>
              <Input id="ed-ph" value={String(editForm.phone || "")} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-pw">Password</Label>
              <Input id="ed-pw" type="password" value={String(editForm.password || "")} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))} placeholder="Leave blank to keep unchanged" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-gender">Gender *</Label>
              <Select value={String(editForm.gender || "")} onValueChange={(v) => setEditForm((p) => ({ ...p, gender: v }))}>
                <SelectTrigger id="ed-gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-role">Role</Label>
              <Select value={String(editForm.role || "user")} onValueChange={(v) => setEditForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger id="ed-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="svip">SVIP</SelectItem>
                  <SelectItem value="svip2">SVIP 2</SelectItem>
                  <SelectItem value="svip3">SVIP 3</SelectItem>
                  <SelectItem value="host">Host</SelectItem>
                  <SelectItem value="coin_seller">Coin Seller</SelectItem>
                  <SelectItem value="sub_agency">Sub Agency</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                  <SelectItem value="bd">BD</SelectItem>
                  <SelectItem value="bd_head">BD Head</SelectItem>
                  <SelectItem value="official">Official</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-ver">Verified</Label>
              <Select value={String(editForm.verified ?? 0)} onValueChange={(v) => setEditForm((p) => ({ ...p, verified: Number(v) }))}>
                <SelectTrigger id="ed-ver"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Verified</SelectItem>
                  <SelectItem value="0">Unverified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-act">Status</Label>
              <Select value={String(editForm.active ?? 1)} onValueChange={(v) => setEditForm((p) => ({ ...p, active: Number(v) }))}>
                <SelectTrigger id="ed-act"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Active</SelectItem>
                  <SelectItem value="0">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-wal">Wallet (coins)</Label>
              <Input id="ed-wal" type="number" min="0" value={String(editForm.wallet ?? 0)} onChange={(e) => setEditForm((p) => ({ ...p, wallet: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-dob">Date of Birth</Label>
              <Input id="ed-dob" type="date" value={String(editForm.dob || "")} onChange={(e) => setEditForm((p) => ({ ...p, dob: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ed-bio">Bio</Label>
              <Input id="ed-bio" value={String(editForm.bio || "")} onChange={(e) => setEditForm((p) => ({ ...p, bio: e.target.value }))} placeholder="Short bio" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-web">Website</Label>
              <Input id="ed-web" value={String(editForm.website || "")} onChange={(e) => setEditForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-cnt">Country</Label>
              <Input id="ed-cnt" value={String(editForm.country || "")} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))} placeholder="Country" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditSubmit}
              disabled={!editForm.firstName || !editForm.lastName || !editForm.gender}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sub-components for each tab ── */

function VideosTab({ videos, videoCount, videoPage, videoTotalPages, onVideoPageChange }: {
  videos: any[];
  videoCount: number;
  videoPage: number;
  videoTotalPages: number;
  onVideoPageChange: (page: number) => void;
}) {
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "thum",
      header: "Thumbnail",
      cell: ({ row }) => (
        row.original.thum ? (
          <img src={row.original.thum} alt="" className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">N/A</div>
        )
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
      accessorKey: "view",
      header: "Views",
      cell: ({ row }) => <span>{(row.original.view as number).toLocaleString()}</span>,
    },
    {
      accessorKey: "block",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.block === 1 ? "blocked" : "active"} />
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
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{videoCount} videos</p>
      <DataTable
        columns={columns}
        data={videos}
        page={videoPage}
        totalPages={videoTotalPages}
        total={videoCount}
        onPageChange={onVideoPageChange}
        emptyMessage="No videos found."
      />
    </div>
  );
}

function OrdersTab({ orders, orderCount, orderPage, orderTotalPages, onOrderPageChange }: {
  orders: any[];
  orderCount: number;
  orderPage: number;
  orderTotalPages: number;
  onOrderPageChange: (page: number) => void;
}) {
  const columns: ColumnDef<any>[] = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "productTitle",
      header: "Product",
      cell: ({ row }) => (
        <span className="line-clamp-1 text-sm">{row.original.productTitle}</span>
      ),
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => <span>${Number(row.original.total).toFixed(2)}</span>,
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
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{orderCount} orders</p>
      <DataTable
        columns={columns}
        data={orders}
        page={orderPage}
        totalPages={orderTotalPages}
        total={orderCount}
        onPageChange={onOrderPageChange}
        emptyMessage="No orders found."
      />
    </div>
  );
}

function WalletTab({ transactions, txCount, txPage, txTotalPages, onTxPageChange }: {
  transactions: any[];
  txCount: number;
  txPage: number;
  txTotalPages: number;
  onTxPageChange: (page: number) => void;
}) {
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="line-clamp-1 text-sm">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "transactionType",
      header: "Type",
      cell: ({ row }) => (
        <StatusBadge status={String(row.original.transactionType).replace(/_/g, " ")} />
      ),
    },
    {
      accessorKey: "transactionDirection",
      header: "Direction",
      cell: ({ row }) => (
        <span className={`text-sm font-medium ${
          row.original.transactionDirection === "credit"
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        }`}>
          {row.original.transactionDirection === "credit" ? "+" : "-"}{(row.original.amount as number).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <span>{(row.original.amount as number).toLocaleString()}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{txCount} transactions</p>
      <DataTable
        columns={columns}
        data={transactions}
        page={txPage}
        totalPages={txTotalPages}
        total={txCount}
        onPageChange={onTxPageChange}
        emptyMessage="No transactions found."
      />
    </div>
  );
}

function ActivityTab({ streams, streamCount, streamPage, streamTotalPages, onStreamPageChange }: {
  streams: any[];
  streamCount: number;
  streamPage: number;
  streamTotalPages: number;
  onStreamPageChange: (page: number) => void;
}) {
  const columns: ColumnDef<any>[] = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "startedAt",
      header: "Started",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.startedAt).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => <span>{formatDuration(row.original.duration)}</span>,
    },
    {
      accessorKey: "earnCoin",
      header: "Coins Earned",
      cell: ({ row }) => <span>{(row.original.earnCoin as number).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{streamCount} streams</p>
      <DataTable
        columns={columns}
        data={streams}
        page={streamPage}
        totalPages={streamTotalPages}
        total={streamCount}
        onPageChange={onStreamPageChange}
        emptyMessage="No streaming activity found."
      />
    </div>
  );
}