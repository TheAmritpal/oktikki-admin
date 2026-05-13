import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher, Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { liveStreaming, user, liveStreamingWatch } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, XCircle } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [];

  if (pagination.search) {
    conditions.push(
      or(
        like(user.firstName, `%${pagination.search}%`),
        like(user.lastName, `%${pagination.search}%`),
        like(user.username, `%${pagination.search}%`)
      )!
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status === "active") {
    conditions.push(eq(liveStreaming.duration, 0));
  } else if (status === "ended") {
    conditions.push(sql`${liveStreaming.duration} > 0`);
  } else if (status === "all" || !status) {
    // show all
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "earn_coin" ? liveStreaming.earnCoin
    : pagination.sort === "duration" ? liveStreaming.duration
    : liveStreaming.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const viewerCountSubquery = db
    .select({ count: count() })
    .from(liveStreamingWatch)
    .where(eq(liveStreamingWatch.liveStreamingId, liveStreaming.id));

  const [streams, [{ total }]] = await Promise.all([
    db.select({
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
      viewerCount: sql<number>`(SELECT COUNT(*) FROM ${liveStreamingWatch} WHERE ${liveStreamingWatch.liveStreamingId} = ${liveStreaming.id})`,
    })
      .from(liveStreaming)
      .leftJoin(user, eq(liveStreaming.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(liveStreaming).leftJoin(user, eq(liveStreaming.userId, user.id)).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    streams,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "end_live") {
    const streamId = Number(formData.get("streamId"));
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
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function LiveStreamsListPage() {
  const { streams, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    streamId: number;
  }>({ open: false, title: "", description: "", streamId: 0 });

  const currentStatus = searchParams.get("status") || "all";

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

  const handleFilterChange = (name: string, value: string) => {
    setSearchParams((prev) => {
      if (value && value !== "all") prev.set(name, value);
      else prev.delete(name);
      prev.set("page", "1");
      return prev;
    });
  };

  const handleConfirm = () => {
    fetcher.submit(
      { intent: "end_live", streamId: String(confirmDialog.streamId) },
      { method: "post" }
    );
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "userFirstName",
      header: "Streamer",
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
            {row.original.username && (
              <span className="text-muted-foreground ml-1">@{row.original.username}</span>
            )}
          </span>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.duration === 0 ? "live" : "ended"} />
      ),
    },
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
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDuration(row.original.duration)}
        </span>
      ),
    },
    {
      accessorKey: "viewerCount",
      header: "Viewers",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.viewerCount.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "earnCoin",
      header: "Earned Coins",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.earnCoin.toLocaleString()}</span>
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
            <DropdownMenuItem asChild>
              <Link to={`/admin/live-streams/${row.original.id}`}>
                <Eye className="mr-2 h-4 w-4" /> View Details
              </Link>
            </DropdownMenuItem>
            {row.original.duration === 0 && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() =>
                  setConfirmDialog({
                    open: true,
                    title: "End Live Stream",
                    description: `Are you sure you want to force-end this live stream? The streamer will be disconnected.`,
                    streamId: row.original.id,
                  })
                }
              >
                <XCircle className="mr-2 h-4 w-4" /> End Live
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Live Streams</h2>
        <p className="text-muted-foreground">
          Monitor and manage live streams. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by streamer name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All" },
              { value: "active", label: "Live" },
              { value: "ended", label: "Ended" },
            ],
          },
        ]}
        filterValues={{ status: currentStatus }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={streams}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No live streams found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant="danger"
      />
    </div>
  );
}
