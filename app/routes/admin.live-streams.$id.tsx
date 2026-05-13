import { useState } from "react";
import { useLoaderData, useFetcher, useParams, Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { liveStreaming, liveStreamingWatch, user, giftSend } from "~/db/schema";
import { count, eq, and, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { DataTable } from "~/components/data-table";
import { UserAvatar } from "~/components/user-avatar";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { ArrowLeft, Eye, EyeOff, XCircle, Radio, Users, Coins, Clock, UserCheck } from "lucide-react";

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const streamId = Number(params.id);

  const [stream] = await db
    .select({
      id: liveStreaming.id,
      userId: liveStreaming.userId,
      startedAt: liveStreaming.startedAt,
      endedAt: liveStreaming.endedAt,
      duration: liveStreaming.duration,
      earnCoin: liveStreaming.earnCoin,
      created: liveStreaming.created,
      userFirstName: user.firstName,
      userLastName: user.lastName,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    })
    .from(liveStreaming)
    .leftJoin(user, eq(liveStreaming.userId, user.id))
    .where(eq(liveStreaming.id, streamId))
    .limit(1);

  if (!stream) {
    throw new Response("Stream not found", { status: 404 });
  }

  const viewers = await db
    .select({
      id: liveStreamingWatch.id,
      userId: liveStreamingWatch.userId,
      coin: liveStreamingWatch.coin,
      block: liveStreamingWatch.block,
      startedAt: liveStreamingWatch.startedAt,
      endedAt: liveStreamingWatch.endedAt,
      duration: liveStreamingWatch.duration,
      created: liveStreamingWatch.created,
      userFirstName: user.firstName,
      userLastName: user.lastName,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    })
    .from(liveStreamingWatch)
    .leftJoin(user, eq(liveStreamingWatch.userId, user.id))
    .where(eq(liveStreamingWatch.liveStreamingId, streamId))
    .orderBy(desc(liveStreamingWatch.created));

  const gifts = await db
    .select({
      id: giftSend.id,
      senderId: giftSend.senderId,
      giftTitle: giftSend.title,
      coin: giftSend.coin,
      totalCoins: giftSend.totalCoins,
      created: giftSend.created,
      senderFirstName: user.firstName,
      senderLastName: user.lastName,
      senderUsername: user.username,
      senderProfilePic: user.profilePicSmall,
    })
    .from(giftSend)
    .leftJoin(user, eq(giftSend.senderId, user.id))
    .where(eq(giftSend.liveStreamingId, streamId))
    .orderBy(desc(giftSend.created));

  const viewerStats = {
    total: viewers.length,
    blocked: viewers.filter((v) => v.block === 1).length,
    totalCoins: viewers.reduce((sum, v) => sum + v.coin, 0),
    uniqueViewers: new Set(viewers.map((v) => v.userId)).size,
  };

  return {
    session,
    stream,
    viewers,
    gifts,
    viewerStats,
  };
}

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const streamId = Number(params.id);

  if (intent === "block_viewer") {
    const watchId = Number(formData.get("watchId"));

    await db
      .update(liveStreamingWatch)
      .set({ block: 1 })
      .where(eq(liveStreamingWatch.id, watchId));

    await logAudit({
      adminId: session.adminId,
      action: "block_stream_viewer",
      entityType: "live_streaming_watch",
      entityId: watchId,
      newValues: { block: 1 },
      request,
    });

    return { success: true, intent: "block_viewer" };
  }

  if (intent === "unblock_viewer") {
    const watchId = Number(formData.get("watchId"));

    await db
      .update(liveStreamingWatch)
      .set({ block: 0 })
      .where(eq(liveStreamingWatch.id, watchId));

    await logAudit({
      adminId: session.adminId,
      action: "unblock_stream_viewer",
      entityType: "live_streaming_watch",
      entityId: watchId,
      newValues: { block: 0 },
      request,
    });

    return { success: true, intent: "unblock_viewer" };
  }

  if (intent === "end_live") {
    const now = new Date();
    const [stream] = await db
      .select({ startedAt: liveStreaming.startedAt })
      .from(liveStreaming)
      .where(eq(liveStreaming.id, streamId))
      .limit(1);

    if (!stream) {
      return { errors: { general: ["Stream not found"] } };
    }

    const duration = Math.floor((now.getTime() - new Date(stream.startedAt).getTime()) / 1000);

    await db
      .update(liveStreaming)
      .set({ endedAt: now, duration })
      .where(eq(liveStreaming.id, streamId));

    await logAudit({
      adminId: session.adminId,
      action: "end_live_stream",
      entityType: "live_streaming",
      entityId: streamId,
      newValues: { endedAt: now.toISOString(), duration },
      request,
    });

    return { success: true, intent: "end_live" };
  }

  return { errors: { general: ["Unknown action"] } };
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Still live";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function LiveStreamDetailPage() {
  const { stream, viewers, gifts, viewerStats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const params = useParams();

  const isLive = stream.duration === 0;

  const viewerColumns: ColumnDef<any>[] = [
    {
      accessorKey: "userFirstName",
      header: "Viewer",
      cell: ({ row }) => (
        <Link
          to={`/admin/users/${row.original.userId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <UserAvatar
            src={row.original.profilePicSmall}
            name={`${row.original.userFirstName} ${row.original.userLastName}`}
            size="sm"
          />
          <span className="font-medium truncate max-w-[150px]">
            {row.original.userFirstName} {row.original.userLastName}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: "coin",
      header: "Coins Spent",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.coin.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "block",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.block === 1 ? "blocked" : "active"} />
      ),
    },
    {
      accessorKey: "duration",
      header: "Watch Duration",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDuration(row.original.duration)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.block === 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                fetcher.submit(
                  { intent: "unblock_viewer", watchId: String(row.original.id) },
                  { method: "post" }
                )
              }
            >
              <Eye className="mr-1 h-3 w-3" /> Unblock
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-destructive"
              onClick={() =>
                fetcher.submit(
                  { intent: "block_viewer", watchId: String(row.original.id) },
                  { method: "post" }
                )
              }
            >
              <EyeOff className="mr-1 h-3 w-3" /> Block
            </Button>
          )}
        </div>
      ),
    },
  ];

  const giftColumns: ColumnDef<any>[] = [
    {
      accessorKey: "senderFirstName",
      header: "Sender",
      cell: ({ row }) => (
        <Link
          to={`/admin/users/${row.original.senderId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <UserAvatar
            src={row.original.senderProfilePic}
            name={`${row.original.senderFirstName} ${row.original.senderLastName}`}
            size="sm"
          />
          <span className="font-medium">
            {row.original.senderFirstName} {row.original.senderLastName}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: "giftTitle",
      header: "Gift",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.giftTitle}</span>
      ),
    },
    {
      accessorKey: "coin",
      header: "Coins",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.totalCoins?.toLocaleString() || row.original.coin.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "created",
      header: "Sent At",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/live-streams">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Live Stream Details</h2>
          <p className="text-muted-foreground">
            Stream #{params.id} by {stream.userFirstName} {stream.userLastName}
          </p>
        </div>
      </div>

      {/* Stream Info Card */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Streamer</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link
              to={`/admin/users/${stream.userId}`}
              className="flex items-center gap-2"
            >
              <UserAvatar
                src={stream.profilePicSmall}
                name={`${stream.userFirstName} ${stream.userLastName}`}
                size="sm"
              />
              <div className="flex flex-col">
                <span className="font-semibold">
                  {stream.userFirstName} {stream.userLastName}
                </span>
                {stream.username && (
                  <span className="text-xs text-muted-foreground">@{stream.username}</span>
                )}
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Radio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatusBadge status={isLive ? "live" : "ended"} />
            {isLive && (
              <Button
                variant="destructive"
                size="sm"
                className="ml-3"
                onClick={() =>
                  fetcher.submit(
                    { intent: "end_live", streamId: String(stream.id) },
                    { method: "post" }
                  )
                }
              >
                <XCircle className="h-4 w-4 mr-1" /> End Live
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatDuration(stream.duration)}</p>
            <p className="text-xs text-muted-foreground">
              Started {new Date(stream.startedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Earned Coins</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stream.earnCoin.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stream Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Stream Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Total Viewers</span>
              <span className="text-xl font-bold">{viewerStats.total}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Unique Viewers</span>
              <span className="text-xl font-bold">{viewerStats.uniqueViewers}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Coins from Viewers</span>
              <span className="text-xl font-bold">{viewerStats.totalCoins.toLocaleString()}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Blocked Viewers</span>
              <span className="text-xl font-bold">{viewerStats.blocked}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Viewers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Viewers
            <Badge variant="secondary" className="ml-2">{viewers.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={viewerColumns}
            data={viewers}
            page={1}
            totalPages={1}
            total={viewers.length}
            onPageChange={() => {}}
            emptyMessage="No viewers recorded."
          />
        </CardContent>
      </Card>

      {/* Gift History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Gift History
            <Badge variant="secondary" className="ml-2">{gifts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={giftColumns}
            data={gifts}
            page={1}
            totalPages={1}
            total={gifts.length}
            onPageChange={() => {}}
            emptyMessage="No gifts sent during this stream."
          />
        </CardContent>
      </Card>
    </div>
  );
}


