import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { reportVideo, video, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, XCircle, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(reportVideo.reportReasonTitle, `%${pagination.search}%`),
        like(reportVideo.description, `%${pagination.search}%`),
        like(video.description, `%${pagination.search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "reportReasonTitle" ? reportVideo.reportReasonTitle
    : reportVideo.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [reports, [{ total }]] = await Promise.all([
    db.select({
      id: reportVideo.id,
      videoId: reportVideo.videoId,
      userId: reportVideo.userId,
      reportReasonTitle: reportVideo.reportReasonTitle,
      reportReasonId: reportVideo.reportReasonId,
      description: reportVideo.description,
      created: reportVideo.created,
      videoThum: video.thum,
      videoDescription: video.description,
      reporterUsername: user.username,
      reporterFirstName: user.firstName,
      reporterLastName: user.lastName,
    })
      .from(reportVideo)
      .innerJoin(video, eq(reportVideo.videoId, video.id))
      .innerJoin(user, eq(reportVideo.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() })
      .from(reportVideo)
      .innerJoin(video, eq(reportVideo.videoId, video.id))
      .innerJoin(user, eq(reportVideo.userId, user.id))
      .where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    reports,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "dismiss") {
    const reportId = Number(formData.get("reportId"));
    await db.delete(reportVideo).where(eq(reportVideo.id, reportId));
    await logAudit({
      adminId: session.adminId,
      action: "dismiss_report_video",
      entityType: "report_video",
      entityId: reportId,
      request,
    });
    return { success: true, intent: "dismiss" };
  }

  if (intent === "delete_video") {
    const videoId = Number(formData.get("videoId"));
    const reportId = Number(formData.get("reportId"));

    await db.delete(reportVideo).where(eq(reportVideo.videoId, videoId));
    await db.delete(video).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_reported_video",
      entityType: "video",
      entityId: videoId,
      request,
    });
    return { success: true, intent: "delete_video" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type ReportVideoRow = {
  id: number;
  videoId: number;
  userId: number;
  reportReasonTitle: string;
  reportReasonId: number;
  description: string;
  created: Date;
  videoThum: string;
  videoDescription: string;
  reporterUsername: string | null;
  reporterFirstName: string;
  reporterLastName: string;
};

export default function ReportedVideosPage() {
  const { reports, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    reportId: number;
    videoId?: number;
  }>({ open: false, title: "", description: "", intent: "", reportId: 0 });

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

  const handleConfirm = () => {
    const { intent, reportId, videoId } = confirmDialog;
    if (intent === "dismiss") {
      fetcher.submit({ intent: "dismiss", reportId: String(reportId) }, { method: "post" });
    } else if (intent === "delete_video" && videoId !== undefined) {
      fetcher.submit({ intent: "delete_video", reportId: String(reportId), videoId: String(videoId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<ReportVideoRow>[] = [
    {
      accessorKey: "videoThum",
      header: "Thumbnail",
      cell: ({ row }) => (
        row.original.videoThum ? (
          <img src={row.original.videoThum} alt="" className="h-10 w-14 rounded object-cover" />
        ) : (
          <div className="h-10 w-14 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">N/A</div>
        )
      ),
    },
    {
      accessorKey: "videoDescription",
      header: "Video Description",
      cell: ({ row }) => (
        <Link to={`/admin/videos/${row.original.videoId}`} className="text-sm hover:underline line-clamp-2 max-w-[200px]">
          {row.original.videoDescription || "—"}
        </Link>
      ),
    },
    {
      accessorKey: "reporterUsername",
      header: "Reporter",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.reporterUsername
            ? `@${row.original.reporterUsername}`
            : `${row.original.reporterFirstName} ${row.original.reporterLastName}`}
        </span>
      ),
    },
    {
      accessorKey: "reportReasonTitle",
      header: "Reason",
      cell: ({ row }) => (
        <StatusBadge status={row.original.reportReasonTitle} />
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm line-clamp-2 max-w-[200px]">{row.original.description || "—"}</span>
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
              <Link to={`/admin/videos/${row.original.videoId}`}>
                <Eye className="mr-2 h-4 w-4" /> View Video
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: "Dismiss Report",
                description: "Are you sure you want to dismiss this report? The video will remain on the platform.",
                intent: "dismiss",
                reportId: row.original.id,
              })}
            >
              <XCircle className="mr-2 h-4 w-4" /> Dismiss
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Video",
                description: "Are you sure you want to delete this video and all related reports? This action cannot be undone.",
                intent: "delete_video",
                reportId: row.original.id,
                videoId: row.original.videoId,
              })}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete Video
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reported Videos</h2>
        <p className="text-muted-foreground">
          Review and manage video reports. {pagination.total.toLocaleString()} total reports.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by reason, description, or video..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={reports}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No reported videos found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "delete_video" ? "danger" : "default"}
        confirmLabel={confirmDialog.intent === "dismiss" ? "Dismiss" : "Delete"}
      />
    </div>
  );
}