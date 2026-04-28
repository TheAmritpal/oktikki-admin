import { requireAuth } from "~/lib/auth.server";
import { db } from "~/db/index.server";
import { user, video, withdrawRequest, verificationRequest, reportVideo, order, liveStreaming } from "~/db/schema";
import { count, eq, sql, gte, lt, and, desc } from "drizzle-orm";
import { BarChart3, Users, Video, Banknote, AlertTriangle, CheckCircle2, Package, Radio } from "lucide-react";
import { StatCard } from "~/components/stat-card";
import { UserAvatar } from "~/components/user-avatar";
import { StatusBadge } from "~/components/status-badge";
import { Link, useLoaderData } from "react-router";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  try {
    const [
      [{ totalUsers }],
      [{ todayUsers }],
      [{ yesterdayUsers }],
      [{ totalVideos }],
      [{ pendingWithdrawals }],
      [{ pendingVerifications }],
      [{ reportedVideos }],
      [{ todayOrders }],
      [{ activeStreams }],
      recentUsers,
    ] = await Promise.all([
      db.select({ totalUsers: count() }).from(user),
      db.select({ todayUsers: count() }).from(user).where(gte(user.created, todayStart)),
      db.select({ yesterdayUsers: count() }).from(user).where(
        and(gte(user.created, yesterdayStart), lt(user.created, todayStart))
      ),
      db.select({ totalVideos: count() }).from(video),
      db.select({ pendingWithdrawals: count() }).from(withdrawRequest).where(eq(withdrawRequest.status, 0)),
      db.select({ pendingVerifications: count() }).from(verificationRequest).where(eq(verificationRequest.verified, 0)),
      db.select({ reportedVideos: sql<number>`COUNT(DISTINCT ${reportVideo.videoId})` }).from(reportVideo),
      db.select({ todayOrders: count() }).from(order).where(gte(order.created, todayStart)),
      db.select({ activeStreams: count() }).from(liveStreaming).where(eq(liveStreaming.duration, 0)),
      db.select({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        profilePicSmall: user.profilePicSmall,
        active: user.active,
        verified: user.verified,
        created: user.created,
      }).from(user).orderBy(desc(user.created)).limit(5),
    ]);

    const userTrend = yesterdayUsers > 0
      ? Math.round(((todayUsers - yesterdayUsers) / yesterdayUsers) * 100)
      : todayUsers > 0 ? 100 : 0;

    return {
      session,
      stats: {
        totalUsers,
        todayUsers,
        totalVideos,
        pendingWithdrawals,
        pendingVerifications,
        reportedVideos,
        todayOrders,
        activeStreams,
        userTrend,
      },
      recentUsers,
    };
  } catch {
    return {
      session,
      stats: {
        totalUsers: 0, todayUsers: 0, totalVideos: 0,
        pendingWithdrawals: 0, pendingVerifications: 0, reportedVideos: 0,
        todayOrders: 0, activeStreams: 0, userTrend: 0,
      },
      recentUsers: [],
    };
  }
}

export default function DashboardPage() {
  const { stats, recentUsers } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your platform&apos;s key metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats.totalUsers.toLocaleString()}
          icon={Users}
          change={stats.userTrend}
          trend={stats.userTrend >= 0 ? "up" : "down"}
        />
        <StatCard
          title="Total Videos"
          value={stats.totalVideos.toLocaleString()}
          icon={Video}
        />
        <StatCard
          title="Pending Withdrawals"
          value={stats.pendingWithdrawals.toLocaleString()}
          icon={Banknote}
        />
        <StatCard
          title="Pending Verifications"
          value={stats.pendingVerifications.toLocaleString()}
          icon={CheckCircle2}
        />
        <StatCard
          title="Reported Videos"
          value={stats.reportedVideos.toLocaleString()}
          icon={AlertTriangle}
        />
        <StatCard
          title="Today&apos;s Orders"
          value={stats.todayOrders.toLocaleString()}
          icon={Package}
        />
        <StatCard
          title="Active Streams"
          value={stats.activeStreams.toLocaleString()}
          icon={Radio}
        />
        <StatCard
          title="Analytics"
          value="View"
          icon={BarChart3}
        />
      </div>

      {recentUsers.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Recent Registrations</h3>
            <Link to="/admin/users" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {recentUsers.map((u) => (
              <Link
                key={u.id}
                to={`/admin/users/${u.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <UserAvatar
                  src={u.profilePicSmall}
                  name={`${u.firstName} ${u.lastName}`}
                  verified={u.verified === 1}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {u.firstName} {u.lastName}
                    {u.username && (
                      <span className="text-muted-foreground ml-1">@{u.username}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.created).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={u.active === 1 ? "active" : "blocked"} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}