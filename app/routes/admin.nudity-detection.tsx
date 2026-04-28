import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { video } from "~/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { StatusBadge } from "~/components/status-badge";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, CheckCircle2, ShieldOff, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const whereClause = eq(video.nudityFound, 1);

  const [videos, [{ total }]] = await Promise.all([
    db.select({
      id: video.id,
      userId: video.userId,
      description: video.description,
      thum: video.thum,
      view: video.view,
      block: video.block,
      nudityFound: video.nudityFound,
      created: video.created,
    })
      .from(video)
      .where(whereClause)
      .orderBy(desc(video.created))
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(video).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    videos,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "approve") {
    const videoId = Number(formData.get("videoId"));
    const [oldVideo] = await db.select({ nudityFound: video.nudityFound }).from(video).where(eq(video.id, videoId)).limit(1);
    await db.update(video).set({ nudityFound: 0 }).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: "approve_nudity_video",
      entityType: "video",
      entityId: videoId,
      oldValues: { nudityFound: oldVideo?.nudityFound },
      newValues: { nudityFound: 0 },
      request,
    });
    return { success: true, intent: "approve" };
  }

  if (intent === "block") {
    const videoId = Number(formData.get("videoId"));
    const [oldVideo] = await db.select({ block: video.block }).from(video).where(eq(video.id, videoId)).limit(1);
    await db.update(video).set({ block: 1 }).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: "block_nudity_video",
      entityType: "video",
      entityId: videoId,
      oldValues: { block: oldVideo?.block },
      newValues: { block: 1 },
      request,
    });
    return { success: true, intent: "block" };
  }

  if (intent === "delete") {
    const videoId = Number(formData.get("videoId"));
    await db.delete(video).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_nudity_video",
      entityType: "video",
      entityId: videoId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type VideoRow = {
  id: number;
  userId: number;
  description: string;
  thum: string;
  view: number;
  block: number;
  nudityFound: number;
  created: Date;
};

export default function NudityDetectionPage() {
  const { videos, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    videoId: number;
  }>({ open: false, title: "", description: "", intent: "", videoId: 0 });

  const handlePageChange = (page: number) => {
    setSearchParams((prev) => {
      prev.set("page", String(page));
      return prev;
    });
  };

  const handleConfirm = () => {
    const { intent, videoId } = confirmDialog;
    if (intent === "approve") {
      fetcher.submit({ intent: "approve", videoId: String(videoId) }, { method: "post" });
    } else if (intent === "block") {
      fetcher.submit({ intent: "block", videoId: String(videoId) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete", videoId: String(videoId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<VideoRow>[] = [
    {
      accessorKey: "thum",
      header: "Thumbnail",
      cell: ({ row }) => (
        row.original.thum && row.original.thum !== "NULL" ? (
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
      cell: ({ row }) => (
        <span className="text-sm">{row.original.view.toLocaleString()}</span>
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
      accessorKey: "created",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
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
              onClick={() => setConfirmDialog({
                open: true,
                title: "Approve Video",
                description: "Mark this video as approved (nudity flag will be removed). The video will be visible to users again.",
                intent: "approve",
                videoId: row.original.id,
              })}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: "Block Video",
                description: "Block this video. It will no longer be visible to users.",
                intent: "block",
                videoId: row.original.id,
              })}
            >
              <ShieldOff className="mr-2 h-4 w-4" /> Block
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Video",
                description: "Permanently delete this video? This action cannot be undone and will remove all associated data.",
                intent: "delete",
                videoId: row.original.id,
              })}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Nudity Detection</h2>
        <p className="text-muted-foreground">
          Review videos flagged for nudity. {pagination.total.toLocaleString()} flagged videos.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={videos}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No flagged videos found."
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