import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import {
  video,
  user,
  sound,
  videoLike,
  videoComment,
} from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Eye,
  ShieldOff,
  ShieldCheck,
  Trash2,
  Star,
  StarOff,
  Heart,
  MessageCircle,
  Clock,
  ArrowRightLeft,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

type VideoRow = {
  id: number;
  description: string;
  videoUrl: string;
  thum: string;
  view: number;
  block: number;
  promote: number;
  duration: number;
  privacyType: string;
  share: number;
  created: Date;
  userId: number;
  username: string | null;
  profilePicSmall: string;
  soundName: string | null;
  soundThum: string | null;
  likeCount: number;
  commentCount: number;
};

// ── Loader ───────────────────────────────────────────────────

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const blockFilter = url.searchParams.get("block") || "";
  const promoteFilter = url.searchParams.get("promote") || "";
  const privacyFilter = url.searchParams.get("privacy") || "";

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(video.description, `%${pagination.search}%`),
        like(user.username, `%${pagination.search}%`),
        like(sound.name, `%${pagination.search}%`)
      )!
    );
  }
  if (blockFilter === "active") conditions.push(eq(video.block, 0));
  if (blockFilter === "blocked") conditions.push(eq(video.block, 1));
  if (promoteFilter === "1") conditions.push(eq(video.promote, 1));
  if (promoteFilter === "0") conditions.push(eq(video.promote, 0));
  if (privacyFilter) conditions.push(eq(video.privacyType, privacyFilter));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortMap: Record<string, any> = {
    view: video.view,
    description: video.description,
    duration: video.duration,
    share: video.share,
  };
  const sortColumn = sortMap[pagination.sort] || video.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  // Subqueries for like & comment counts per video
  const likeCountSubquery = db
    .select({
      videoId: videoLike.videoId,
      count: sql<number>`count(*)`.as("like_count"),
    })
    .from(videoLike)
    .where(eq(videoLike.like, 1))
    .groupBy(videoLike.videoId)
    .as("like_counts");

  const commentCountSubquery = db
    .select({
      videoId: videoComment.videoId,
      count: sql<number>`count(*)`.as("comment_count"),
    })
    .from(videoComment)
    .groupBy(videoComment.videoId)
    .as("comment_counts");

  const [videos, [{ total }]] = await Promise.all([
    db
      .select({
        id: video.id,
        description: video.description,
        videoUrl: video.video,
        thum: video.thum,
        view: video.view,
        block: video.block,
        promote: video.promote,
        duration: video.duration,
        privacyType: video.privacyType,
        share: video.share,
        created: video.created,
        userId: video.userId,
        username: user.username,
        profilePicSmall: user.profilePicSmall,
        soundName: sound.name,
        soundThum: sound.thum,
        likeCount: sql<number>`COALESCE(${likeCountSubquery.count}, 0)`.mapWith(Number),
        commentCount: sql<number>`COALESCE(${commentCountSubquery.count}, 0)`.mapWith(Number),
      })
      .from(video)
      .leftJoin(user, eq(video.userId, user.id))
      .leftJoin(sound, eq(video.soundId, sound.id))
      .leftJoin(likeCountSubquery, eq(video.id, likeCountSubquery.videoId))
      .leftJoin(commentCountSubquery, eq(video.id, commentCountSubquery.videoId))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(video).leftJoin(user, eq(video.userId, user.id)).leftJoin(sound, eq(video.soundId, sound.id)).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    videos,
    pagination: { ...pagination, total, totalPages },
    filters: { block: blockFilter, promote: promoteFilter, privacy: privacyFilter },
  };
}

// ── Action ───────────────────────────────────────────────────

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "block") {
    const videoId = Number(formData.get("videoId"));
    const blockValue = Number(formData.get("block"));

    const [oldVideo] = await db
      .select({ block: video.block })
      .from(video)
      .where(eq(video.id, videoId))
      .limit(1);
    await db.update(video).set({ block: blockValue }).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: blockValue === 1 ? "block_video" : "unblock_video",
      entityType: "video",
      entityId: videoId,
      oldValues: { block: oldVideo?.block },
      newValues: { block: blockValue },
      request,
    });
    return { success: true, intent: "block", block: blockValue };
  }

  if (intent === "delete") {
    const videoId = Number(formData.get("videoId"));
    await db.delete(video).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_video",
      entityType: "video",
      entityId: videoId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  if (intent === "promote") {
    const videoId = Number(formData.get("videoId"));
    const promoteValue = Number(formData.get("promote"));

    const [oldVideo] = await db
      .select({ promote: video.promote })
      .from(video)
      .where(eq(video.id, videoId))
      .limit(1);
    await db.update(video).set({ promote: promoteValue }).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: promoteValue === 1 ? "promote_video" : "unpromote_video",
      entityType: "video",
      entityId: videoId,
      oldValues: { promote: oldVideo?.promote },
      newValues: { promote: promoteValue },
      request,
    });
    return { success: true, intent: "promote", promote: promoteValue };
  }

  return { errors: { general: ["Unknown action"] } };
}

// ── Page Component ───────────────────────────────────────────

export default function VideosListPage() {
  const { videos, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    videoId: number;
    blockValue?: number;
    promoteValue?: number;
  }>({ open: false, title: "", description: "", intent: "", videoId: 0 });

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
      prev.delete("block");
      prev.delete("promote");
      prev.delete("privacy");
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

  const handleConfirm = () => {
    const { intent, videoId, blockValue, promoteValue } = confirmDialog;
    if (intent === "block" && blockValue !== undefined) {
      fetcher.submit(
        { intent: "block", videoId: String(videoId), block: String(blockValue) },
        { method: "post" }
      );
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete", videoId: String(videoId) }, { method: "post" });
    } else if (intent === "promote" && promoteValue !== undefined) {
      fetcher.submit(
        { intent: "promote", videoId: String(videoId), promote: String(promoteValue) },
        { method: "post" }
      );
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "thum",
      header: "Thumb",
      cell: ({ row }) =>
        row.original.thum ? (
          <Link to={`/admin/videos/${row.original.id}`}>
            <img
              src={row.original.thum}
              alt=""
              className="h-14 w-10 rounded object-cover"
            />
          </Link>
        ) : (
          <div className="flex h-14 w-10 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
            N/A
          </div>
        ),
    },
    {
      accessorKey: "description",
      header: "Description / Owner",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[220px]">
          <Link
            to={`/admin/videos/${row.original.id}`}
            className="line-clamp-2 text-sm font-medium hover:underline"
          >
            {row.original.description || "—"}
          </Link>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {row.original.username ? (
              <Link
                to={`/admin/users/${row.original.userId}`}
                className="text-primary hover:underline"
              >
                @{row.original.username}
              </Link>
            ) : (
              "Unknown"
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-3 w-3" />
          {Number(row.original.duration).toFixed(1)}s
        </span>
      ),
    },
    {
      accessorKey: "view",
      header: "Views",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {(row.original.view as number).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "likeCount",
      header: "Likes",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <Heart className="h-3 w-3 text-rose-500" />
          {row.original.likeCount.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "commentCount",
      header: "Comments",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <MessageCircle className="h-3 w-3 text-blue-500" />
          {row.original.commentCount.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "share",
      header: "Shares",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {(row.original.share as number).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "privacyType",
      header: "Privacy",
      cell: ({ row }) => (
        <span className="text-xs capitalize rounded bg-muted px-1.5 py-0.5">
          {row.original.privacyType}
        </span>
      ),
    },
    {
      accessorKey: "soundName",
      header: "Sound",
      cell: ({ row }) =>
        row.original.soundName ? (
          <span className="line-clamp-1 text-xs max-w-[120px]">
            {row.original.soundName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "block",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <StatusBadge status={row.original.block === 1 ? "blocked" : "active"} />
          {row.original.promote === 1 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <Star className="h-2.5 w-2.5" /> Promoted
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "created",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {new Date(row.original.created).toLocaleDateString()}
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
              onClick={() => navigate(`/admin/videos/${row.original.id}`)}
            >
              <Eye className="mr-2 h-4 w-4" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  title:
                    row.original.block === 1 ? "Unblock Video" : "Block Video",
                  description:
                    row.original.block === 1
                      ? "Are you sure you want to unblock this video? It will be visible to users again."
                      : "Are you sure you want to block this video? It will be hidden from users.",
                  intent: "block",
                  videoId: row.original.id,
                  blockValue: row.original.block === 1 ? 0 : 1,
                })
              }
            >
              {row.original.block === 1 ? (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Unblock
                </>
              ) : (
                <>
                  <ShieldOff className="mr-2 h-4 w-4" /> Block
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  title:
                    row.original.promote === 1
                      ? "Unpromote Video"
                      : "Promote Video",
                  description:
                    row.original.promote === 1
                      ? "Are you sure you want to remove promotion from this video?"
                      : "Are you sure you want to promote this video? It will get more visibility.",
                  intent: "promote",
                  videoId: row.original.id,
                  promoteValue: row.original.promote === 1 ? 0 : 1,
                })
              }
            >
              {row.original.promote === 1 ? (
                <>
                  <StarOff className="mr-2 h-4 w-4" /> Unpromote
                </>
              ) : (
                <>
                  <Star className="mr-2 h-4 w-4" /> Promote
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  title: "Delete Video",
                  description:
                    "Are you sure you want to permanently delete this video? This action cannot be undone.",
                  intent: "delete",
                  videoId: row.original.id,
                })
              }
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                navigate(`/admin/video-reassignment?videoId=${row.original.id}`)
              }
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Reassign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Videos</h2>
        <p className="text-muted-foreground">
          Manage platform videos. {pagination.total.toLocaleString()} total
          records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by description, username, or sound..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "block",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "blocked", label: "Blocked" },
            ],
          },
          {
            name: "promote",
            label: "Promoted",
            options: [
              { value: "all", label: "All" },
              { value: "1", label: "Promoted" },
              { value: "0", label: "Not Promoted" },
            ],
          },
          {
            name: "privacy",
            label: "Privacy",
            options: [
              { value: "all", label: "All Privacy" },
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
              { value: "friends", label: "Friends" },
            ],
          },
        ]}
        filterValues={{
          block: filters.block || "all",
          promote: filters.promote || "all",
          privacy: filters.privacy || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={videos}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No videos found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "delete" ? "danger" : "default"}
      />
    </div>
  );
}
