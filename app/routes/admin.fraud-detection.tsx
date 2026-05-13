import { useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { purchaseCoin, giftSend, user, withdrawRequest } from "~/db/schema";
import { count, eq, desc, asc, sql, and, lt, gte } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { StatusBadge } from "~/components/status-badge";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AlertTriangle, ShieldAlert, Bot, Repeat } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "fake_recharge";

  const offset = getOffset(pagination.page, pagination.limit);

  let fakeRecharges: any[] = [];
  let fakeTotal = 0;

  let multipleDevices: any[] = [];
  let deviceTotal = 0;

  let botActivity: any[] = [];
  let botTotal = 0;

  let suspiciousGifting: any[] = [];
  let suspiciousTotal = 0;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (tab === "fake_recharge") {
    const [fakeData, totalResult] = await Promise.all([
      db.select({
        id: purchaseCoin.id,
        userId: purchaseCoin.userId,
        title: purchaseCoin.title,
        coin: purchaseCoin.coin,
        price: purchaseCoin.price,
        transactionId: purchaseCoin.transactionId,
        device: purchaseCoin.device,
        created: purchaseCoin.created,
        username: user.username,
        profilePicSmall: user.profilePicSmall,
      })
        .from(purchaseCoin)
        .leftJoin(user, eq(purchaseCoin.userId, user.id))
        .where(
          sql`${purchaseCoin.transactionId} = '' OR ${purchaseCoin.price} <= 0`
        )
        .orderBy(desc(purchaseCoin.created))
        .limit(pagination.limit)
        .offset(offset),
      db.select({ total: count() }).from(purchaseCoin)
        .leftJoin(user, eq(purchaseCoin.userId, user.id))
        .where(
          sql`${purchaseCoin.transactionId} = '' OR ${purchaseCoin.price} <= 0`
        ),
    ]);
    fakeRecharges = fakeData;
    fakeTotal = totalResult[0]?.total || 0;
  }

  if (tab === "multiple_devices") {
    const allDevices = await db.select({
      device: purchaseCoin.device,
      userId: purchaseCoin.userId,
      created: purchaseCoin.created,
    })
      .from(purchaseCoin)
      .orderBy(desc(purchaseCoin.created));

    const deviceMap = new Map<string, { userIds: Set<number>; purchaseCount: number; lastPurchase: Date }>();
    for (const pc of allDevices) {
      if (!deviceMap.has(pc.device)) {
        deviceMap.set(pc.device, { userIds: new Set(), purchaseCount: 0, lastPurchase: pc.created });
      }
      const entry = deviceMap.get(pc.device)!;
      entry.userIds.add(pc.userId);
      entry.purchaseCount++;
    }

    const deviceArray = Array.from(deviceMap.entries())
      .filter(([_, data]) => data.userIds.size > 1)
      .map(([device, data]) => ({
        device,
        userCount: data.userIds.size,
        purchaseCount: data.purchaseCount,
        lastPurchase: data.lastPurchase,
      }))
      .sort((a, b) => b.userCount - a.userCount)
      .slice(offset, offset + pagination.limit);

    const allMultiDeviceCount = Array.from(deviceMap.values()).filter(d => d.userIds.size > 1).length;
    deviceTotal = allMultiDeviceCount;
    multipleDevices = deviceArray;
  }

  if (tab === "bot_activity") {
    const recentGifts = await db.select({
      senderId: giftSend.senderId,
      coin: giftSend.coin,
      created: giftSend.created,
    })
      .from(giftSend)
      .where(gte(giftSend.created, oneHourAgo));

    const senderStats = new Map<number, { count: number; totalCoins: number; lastGift: Date; firstGift: Date }>();
    for (const gift of recentGifts) {
      if (!senderStats.has(gift.senderId)) {
        senderStats.set(gift.senderId, { count: 0, totalCoins: 0, lastGift: gift.created, firstGift: gift.created });
      }
      const stat = senderStats.get(gift.senderId)!;
      stat.count++;
      stat.totalCoins += gift.coin;
      if (gift.created > stat.lastGift) stat.lastGift = gift.created;
      if (gift.created < stat.firstGift) stat.firstGift = gift.created;
    }

    const suspiciousArray = Array.from(senderStats.entries())
      .filter(([_, data]) => data.count > 100)
      .map(([senderId, data]) => ({ senderId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(offset, offset + pagination.limit);

    const userIds = suspiciousArray.map(s => s.senderId);
    const userData = userIds.length > 0 ? await db.select({
      id: user.id,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    }).from(user).where(sql`${user.id} IN ${userIds}`) : [];

    const userMap = new Map(userData.map(u => [u.id, u]));

    botActivity = suspiciousArray.map(s => ({
      ...s,
      username: userMap.get(s.senderId)?.username || null,
      profilePicSmall: userMap.get(s.senderId)?.profilePicSmall || null,
    }));
    botTotal = Array.from(senderStats.values()).filter(d => d.count > 100).length;
  }

  if (tab === "suspicious_gifting") {
    const weekGifts = await db.select({
      senderId: giftSend.senderId,
      receiverId: giftSend.receiverId,
      coin: giftSend.coin,
      created: giftSend.created,
    })
      .from(giftSend)
      .where(gte(giftSend.created, sevenDaysAgo));

    const senderTotalGifts = new Map<number, number>();
    const senderReceiverStats = new Map<string, { count: number; totalCoins: number; lastGift: Date; senderId: number; receiverId: number }>();

    for (const gift of weekGifts) {
      const total = senderTotalGifts.get(gift.senderId) || 0;
      senderTotalGifts.set(gift.senderId, total + 1);

      const key = `${gift.senderId}-${gift.receiverId}`;
      if (!senderReceiverStats.has(key)) {
        senderReceiverStats.set(key, { count: 0, totalCoins: 0, lastGift: gift.created, senderId: gift.senderId, receiverId: gift.receiverId });
      }
      const stat = senderReceiverStats.get(key)!;
      stat.count++;
      stat.totalCoins += gift.coin;
      if (gift.created > stat.lastGift) stat.lastGift = gift.created;
    }

    const suspiciousArray = Array.from(senderReceiverStats.values())
      .filter(stat => {
        const total = senderTotalGifts.get(stat.senderId) || 1;
        const ratio = (stat.count * 100.0) / total;
        return ratio >= 80;
      })
      .sort((a, b) => b.count - a.count)
      .slice(offset, offset + pagination.limit);

    const allUserIds = new Set<number>();
    suspiciousArray.forEach(s => {
      allUserIds.add(s.senderId);
      allUserIds.add(s.receiverId);
    });

    const userData = allUserIds.size > 0 ? await db.select({
      id: user.id,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    }).from(user).where(sql`${user.id} IN ${Array.from(allUserIds)}`) : [];

    const userMap = new Map(userData.map(u => [u.id, u]));

    suspiciousGifting = suspiciousArray.map(s => ({
      ...s,
      senderUsername: userMap.get(s.senderId)?.username || null,
      senderProfilePic: userMap.get(s.senderId)?.profilePicSmall || null,
      receiverUsername: userMap.get(s.receiverId)?.username || null,
      receiverProfilePic: userMap.get(s.receiverId)?.profilePicSmall || null,
      concentrationRatio: (s.count * 100.0) / (senderTotalGifts.get(s.senderId) || 1),
    }));
    suspiciousTotal = suspiciousArray.length + (offset > 0 ? offset : 0);
  }

  const totalPagesMap = {
    fake_recharge: getTotalPages(fakeTotal, pagination.limit),
    multiple_devices: getTotalPages(deviceTotal, pagination.limit),
    bot_activity: getTotalPages(botTotal, pagination.limit),
    suspicious_gifting: getTotalPages(suspiciousTotal, pagination.limit),
  };

  const totalMap = {
    fake_recharge: fakeTotal,
    multiple_devices: deviceTotal,
    bot_activity: botTotal,
    suspicious_gifting: suspiciousTotal,
  };

  const dataMap = {
    fake_recharge: fakeRecharges,
    multiple_devices: multipleDevices,
    bot_activity: botActivity,
    suspicious_gifting: suspiciousGifting,
  };

  return {
    session,
    dataMap,
    totalMap,
    totalPagesMap,
    activeTab: tab,
    pagination,
  };
}

type FakeRechargeRow = {
  id: number;
  userId: number;
  title: string;
  coin: number;
  price: number;
  transactionId: string;
  device: string;
  created: Date;
  username: string | null;
  profilePicSmall: string | null;
};

type MultipleDeviceRow = {
  device: string;
  userCount: number;
  purchaseCount: number;
  lastPurchase: Date;
};

type BotActivityRow = {
  senderId: number;
  username: string | null;
  profilePicSmall: string | null;
  giftCount: number;
  totalCoins: number;
  lastGiftDate: Date;
  firstGiftDate: Date;
};

type SuspiciousGiftingRow = {
  senderId: number;
  senderUsername: string | null;
  senderProfilePic: string | null;
  receiverId: number;
  receiverUsername: string | null;
  receiverProfilePic: string | null;
  giftCount: number;
  totalCoins: number;
  lastGiftDate: Date;
  concentrationRatio: number;
};

export default function FraudDetectionPage() {
  const { dataMap, totalMap, totalPagesMap, activeTab, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => {
      prev.set("tab", value);
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

  const fakeRechargeColumns: ColumnDef<FakeRechargeRow>[] = [
    {
      accessorKey: "username",
      header: "User",
      cell: ({ row }) => (
        row.original.username ? (
          <Link to={`/admin/users/${row.original.userId}`} className="flex items-center gap-2 hover:underline">
            <UserAvatar src={row.original.profilePicSmall} name={row.original.username} size="sm" />
            <span className="text-sm font-medium">@{row.original.username}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.userId}</span>
        )
      ),
    },
    {
      accessorKey: "title",
      header: "Package",
      cell: ({ row }) => <span className="text-sm">{row.original.title}</span>,
    },
    {
      accessorKey: "coin",
      header: "Coins",
      cell: ({ row }) => <span className="font-medium">{row.original.coin.toLocaleString()}</span>,
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => (
        <span className="text-red-600 dark:text-red-400 font-medium">${Number(row.original.price).toFixed(2)}</span>
      ),
    },
    {
      accessorKey: "transactionId",
      header: "Transaction ID",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.transactionId || "—"}</span>
      ),
    },
    {
      accessorKey: "device",
      header: "Device",
      cell: ({ row }) => <StatusBadge status={row.original.device} />,
    },
    {
      accessorKey: "created",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{new Date(row.original.created).toLocaleString()}</span>
      ),
    },
  ];

  const multipleDevicesColumns: ColumnDef<MultipleDeviceRow>[] = [
    {
      accessorKey: "device",
      header: "Device",
      cell: ({ row }) => <StatusBadge status={row.original.device} />,
    },
    {
      accessorKey: "userCount",
      header: "User Count",
      cell: ({ row }) => (
        <span className="font-medium text-red-600 dark:text-red-400">{row.original.userCount}</span>
      ),
    },
    {
      accessorKey: "purchaseCount",
      header: "Total Purchases",
      cell: ({ row }) => <span className="font-medium">{row.original.purchaseCount.toLocaleString()}</span>,
    },
    {
      accessorKey: "lastPurchase",
      header: "Last Purchase",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{new Date(row.original.lastPurchase).toLocaleString()}</span>
      ),
    },
  ];

  const botActivityColumns: ColumnDef<BotActivityRow>[] = [
    {
      accessorKey: "username",
      header: "User",
      cell: ({ row }) => (
        row.original.username ? (
          <Link to={`/admin/users/${row.original.senderId}`} className="flex items-center gap-2 hover:underline">
            <UserAvatar src={row.original.profilePicSmall} name={row.original.username} size="sm" />
            <span className="text-sm font-medium">@{row.original.username}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.senderId}</span>
        )
      ),
    },
    {
      accessorKey: "giftCount",
      header: "Gifts (1hr)",
      cell: ({ row }) => (
        <span className="font-medium text-red-600 dark:text-red-400">{row.original.giftCount.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "totalCoins",
      header: "Total Coins",
      cell: ({ row }) => <span className="font-medium">{row.original.totalCoins.toLocaleString()}</span>,
    },
    {
      accessorKey: "lastGiftDate",
      header: "Last Gift",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{new Date(row.original.lastGiftDate).toLocaleString()}</span>
      ),
    },
  ];

  const suspiciousGiftingColumns: ColumnDef<SuspiciousGiftingRow>[] = [
    {
      accessorKey: "senderUsername",
      header: "Sender",
      cell: ({ row }) => (
        row.original.senderUsername ? (
          <Link to={`/admin/users/${row.original.senderId}`} className="flex items-center gap-2 hover:underline">
            <UserAvatar src={row.original.senderProfilePic} name={row.original.senderUsername} size="sm" />
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
            <UserAvatar src={row.original.receiverProfilePic} name={row.original.receiverUsername} size="sm" />
            <span className="text-sm font-medium">@{row.original.receiverUsername}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.receiverId}</span>
        )
      ),
    },
    {
      accessorKey: "giftCount",
      header: "Gift Count",
      cell: ({ row }) => <span className="font-medium">{row.original.giftCount.toLocaleString()}</span>,
    },
    {
      accessorKey: "totalCoins",
      header: "Total Coins",
      cell: ({ row }) => <span className="font-medium">{row.original.totalCoins.toLocaleString()}</span>,
    },
    {
      accessorKey: "concentrationRatio",
      header: "Concentration",
      cell: ({ row }) => (
        <span className="font-medium text-orange-600 dark:text-orange-400">{row.original.concentrationRatio.toFixed(1)}%</span>
      ),
    },
    {
      accessorKey: "lastGiftDate",
      header: "Last Gift",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{new Date(row.original.lastGiftDate).toLocaleString()}</span>
      ),
    },
  ];

  const columnsMap = {
    fake_recharge: fakeRechargeColumns,
    multiple_devices: multipleDevicesColumns,
    bot_activity: botActivityColumns,
    suspicious_gifting: suspiciousGiftingColumns,
  };

  const emptyMessages = {
    fake_recharge: "No fake recharge patterns found.",
    multiple_devices: "No multiple device patterns found.",
    bot_activity: "No bot activity detected.",
    suspicious_gifting: "No suspicious gifting patterns found.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Fraud Detection</h2>
        <p className="text-muted-foreground">
          Monitor suspicious activity and potential fraud patterns.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="fake_recharge" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Fake Recharge
          </TabsTrigger>
          <TabsTrigger value="multiple_devices" className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Multiple Devices
          </TabsTrigger>
          <TabsTrigger value="bot_activity" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Bot Activity
          </TabsTrigger>
          <TabsTrigger value="suspicious_gifting" className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Suspicious Gifting
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fake_recharge" className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-900 dark:text-amber-100">Fake Recharge Detection</h4>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Identifies recharges with missing transaction IDs or zero/negative prices. These may indicate fake purchases, chargeback risks, or payment gateway errors.
                </p>
              </div>
            </div>
          </div>
          <DataTable
            columns={columnsMap.fake_recharge}
            data={dataMap.fake_recharge}
            page={pagination.page}
            totalPages={totalPagesMap.fake_recharge}
            total={totalMap.fake_recharge}
            onPageChange={handlePageChange}
            emptyMessage={emptyMessages.fake_recharge}
          />
        </TabsContent>

        <TabsContent value="multiple_devices" className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100">Multiple Device Detection</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Detects devices used by multiple different user accounts for coin purchases. This may indicate account farming, bot networks, or fraudulent behavior.
                </p>
              </div>
            </div>
          </div>
          <DataTable
            columns={columnsMap.multiple_devices}
            data={dataMap.multiple_devices}
            page={pagination.page}
            totalPages={totalPagesMap.multiple_devices}
            total={totalMap.multiple_devices}
            onPageChange={handlePageChange}
            emptyMessage={emptyMessages.multiple_devices}
          />
        </TabsContent>

        <TabsContent value="bot_activity" className="space-y-4">
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Bot className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-900 dark:text-red-100">Bot Activity Detection</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Identifies users sending over 100 gifts per hour. This high-frequency gifting pattern suggests automated bot behavior or coordinated manipulation.
                </p>
              </div>
            </div>
          </div>
          <DataTable
            columns={columnsMap.bot_activity}
            data={dataMap.bot_activity}
            page={pagination.page}
            totalPages={totalPagesMap.bot_activity}
            total={totalMap.bot_activity}
            onPageChange={handlePageChange}
            emptyMessage={emptyMessages.bot_activity}
          />
        </TabsContent>

        <TabsContent value="suspicious_gifting" className="space-y-4">
          <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Repeat className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-purple-900 dark:text-purple-100">Suspicious Gifting Detection</h4>
                <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                  Finds users where 80%+ of their gifts go to a single receiver over the past 7 days. May indicate circular gifting, laundering, or fake engagement.
                </p>
              </div>
            </div>
          </div>
          <DataTable
            columns={columnsMap.suspicious_gifting}
            data={dataMap.suspicious_gifting}
            page={pagination.page}
            totalPages={totalPagesMap.suspicious_gifting}
            total={totalMap.suspicious_gifting}
            onPageChange={handlePageChange}
            emptyMessage={emptyMessages.suspicious_gifting}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
