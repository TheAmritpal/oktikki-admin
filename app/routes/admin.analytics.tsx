import { requireAuth } from "~/lib/auth.server";
import { db } from "~/db/index.server";
import { user, video, withdrawRequest, order, transaction, giftSend, reportVideo, verificationRequest } from "~/db/schema";
import { count, sql, gte, and, lte, desc, eq } from "drizzle-orm";
import { BarChart3, Users, Video, TrendingUp, DollarSign, AlertTriangle, CheckCircle2, Package } from "lucide-react";
import { StatCard } from "~/components/stat-card";
import { useLoaderData } from "react-router";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const url = new URL(request.url);

  const daysParam = url.searchParams.get("days") || "30";
  const days = Number(daysParam);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Overview stats
    const [
      [{ totalUsers }],
      [{ totalVideos }],
      [{ pendingWithdrawals }],
      [{ pendingVerifications }],
    ] = await Promise.all([
      db.select({ totalUsers: count() }).from(user),
      db.select({ totalVideos: count() }).from(video),
      db.select({ pendingWithdrawals: count() }).from(withdrawRequest).where(eq(withdrawRequest.status, 0)),
      db.select({ pendingVerifications: count() }).from(verificationRequest).where(eq(verificationRequest.verified, 0)),
    ]);

    // Time-series: Daily new users
    const userGrowth = await db
      .select({
        date: sql<string>`DATE(${user.created})`.as("date"),
        count: count().as("count"),
      })
      .from(user)
      .where(gte(user.created, startDate))
      .groupBy(sql`DATE(${user.created})`)
      .orderBy(sql`DATE(${user.created})`);

    // Time-series: Daily video uploads
    const videoGrowth = await db
      .select({
        date: sql<string>`DATE(${video.created})`.as("date"),
        count: count().as("count"),
      })
      .from(video)
      .where(gte(video.created, startDate))
      .groupBy(sql`DATE(${video.created})`)
      .orderBy(sql`DATE(${video.created})`);

    // Transaction types breakdown
    const transactionBreakdown = await db
      .select({
        transactionType: transaction.transactionType,
        total: sql<number>`SUM(${transaction.amount})`.as("total"),
        count: count().as("count"),
      })
      .from(transaction)
      .where(gte(transaction.createdAt, startDate))
      .groupBy(transaction.transactionType);

    // Report counts
    const [{ reportCount }] = await db
      .select({ reportCount: count() })
      .from(reportVideo);

    // Top gift senders
    const topGifts = await db
      .select({
        senderId: giftSend.senderId,
        totalCoins: sql<number>`SUM(${giftSend.coin})`.as("totalCoins"),
        count: count().as("count"),
      })
      .from(giftSend)
      .where(gte(giftSend.created, startDate))
      .groupBy(giftSend.senderId)
      .orderBy(sql`SUM(${giftSend.coin}) DESC`)
      .limit(10);

    return {
      session,
      stats: {
        totalUsers,
        totalVideos,
        pendingWithdrawals,
        pendingVerifications,
        reportCount,
      },
      userGrowth,
      videoGrowth,
      transactionBreakdown,
      topGifts,
      days,
    };
  } catch {
    return {
      session,
      stats: {
        totalUsers: 0,
        totalVideos: 0,
        pendingWithdrawals: 0,
        pendingVerifications: 0,
        reportCount: 0,
      },
      userGrowth: [],
      videoGrowth: [],
      transactionBreakdown: [],
      topGifts: [],
      days: 30,
    };
  }
}

export default function AnalyticsPage() {
  const { stats, userGrowth, videoGrowth, transactionBreakdown, topGifts, days } = useLoaderData<typeof loader>();

  const maxUserGrowth = Math.max(...userGrowth.map((d) => d.count), 1);
  const maxVideoGrowth = Math.max(...videoGrowth.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
          <p className="text-muted-foreground">
            Platform analytics and insights for the last {days} days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {["7", "30", "90"].map((d) => (
            <a
              key={d}
              href={`?days=${d}`}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                String(days) === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {d}d
            </a>
          ))}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Total Users" value={stats.totalUsers.toLocaleString()} icon={Users} />
        <StatCard title="Total Videos" value={stats.totalVideos.toLocaleString()} icon={Video} />
        <StatCard title="Pending Withdrawals" value={stats.pendingWithdrawals.toLocaleString()} icon={DollarSign} />
        <StatCard title="Pending Verifications" value={stats.pendingVerifications.toLocaleString()} icon={CheckCircle2} />
        <StatCard title="Reports" value={stats.reportCount.toLocaleString()} icon={AlertTriangle} />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* User Growth Chart */}
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> New Users
          </h3>
          <div className="h-48 flex items-end gap-1">
            {userGrowth.length > 0 ? (
              userGrowth.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-primary/80 hover:bg-primary rounded-t-sm transition-colors relative group"
                  style={{ height: `${(d.count / maxUserGrowth) * 100}%`, minHeight: "2px" }}
                  title={`${d.date}: ${d.count} users`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap">
                    {d.count}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm w-full text-center self-center">No data for this period</p>
            )}
          </div>
          {userGrowth.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {userGrowth[0]?.date} — {userGrowth[userGrowth.length - 1]?.date}
            </p>
          )}
        </div>

        {/* Video Uploads Chart */}
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Video Uploads
          </h3>
          <div className="h-48 flex items-end gap-1">
            {videoGrowth.length > 0 ? (
              videoGrowth.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-primary/80 hover:bg-primary rounded-t-sm transition-colors relative group"
                  style={{ height: `${(d.count / maxVideoGrowth) * 100}%`, minHeight: "2px" }}
                  title={`${d.date}: ${d.count} videos`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap">
                    {d.count}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm w-full text-center self-center">No data for this period</p>
            )}
          </div>
          {videoGrowth.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {videoGrowth[0]?.date} — {videoGrowth[videoGrowth.length - 1]?.date}
            </p>
          )}
        </div>
      </div>

      {/* Transaction Breakdown */}
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold mb-4">Transaction Breakdown</h3>
        {transactionBreakdown.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {transactionBreakdown.map((t) => (
              <div key={t.transactionType} className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground capitalize">
                  {String(t.transactionType).replace(/_/g, " ")}
                </p>
                <p className="text-xl font-bold">{Number(t.total).toLocaleString()} coins</p>
                <p className="text-xs text-muted-foreground">{t.count} transactions</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No transaction data for this period.</p>
        )}
      </div>

      {/* Top Gift Senders */}
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Package className="h-4 w-4" /> Top Gift Senders
        </h3>
        {topGifts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Rank</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">User ID</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Total Coins</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Gifts Sent</th>
                </tr>
              </thead>
              <tbody>
                {topGifts.map((g, i) => (
                  <tr key={g.senderId} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-3">{i + 1}</td>
                    <td className="py-2 px-3">
                      <a href={`/admin/users/${g.senderId}`} className="text-primary hover:underline">
                        User #{g.senderId}
                      </a>
                    </td>
                    <td className="py-2 px-3 text-right font-medium">{Number(g.totalCoins).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No gift data for this period.</p>
        )}
      </div>
    </div>
  );
}