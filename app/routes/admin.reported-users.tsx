import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { reportUser, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, inArray } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, XCircle, ShieldOff } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(reportUser.reportReasonTitle, `%${pagination.search}%`),
        like(reportUser.description, `%${pagination.search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "reportReasonTitle" ? reportUser.reportReasonTitle
    : reportUser.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [reports, [{ total }]] = await Promise.all([
    db.select()
      .from(reportUser)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(reportUser).where(whereClause),
  ]);

  // Fetch reporter and reported user info separately
  const allUserIds = [...new Set([
    ...reports.map((r) => r.userId),
    ...reports.map((r) => r.reportUserId),
  ])];

  const users = allUserIds.length > 0
    ? await db.select({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicSmall: user.profilePicSmall,
        active: user.active,
      }).from(user).where(inArray(user.id, allUserIds))
    : [];

  const userMap = new Map(users.map((u) => [u.id, u]));

  const enrichedReports = reports.map((r) => ({
    ...r,
    reporter: userMap.get(r.userId) || null,
    reportedUserInfo: userMap.get(r.reportUserId) || null,
  }));

  const totalPages = getTotalPages(total, pagination.limit);

  // If searching, also match by username
  let filteredReports = enrichedReports;
  if (pagination.search) {
    const searchLower = pagination.search.toLowerCase();
    const matchingUserIds = new Set(
      users.filter((u) =>
        (u.username && u.username.toLowerCase().includes(searchLower)) ||
        u.firstName.toLowerCase().includes(searchLower) ||
        u.lastName.toLowerCase().includes(searchLower)
      ).map((u) => u.id)
    );

    if (matchingUserIds.size > 0) {
      // Include reports where reporter or reported user matches, OR where report fields match
      filteredReports = enrichedReports.filter((r) => {
        const reportFieldMatch = r.reportReasonTitle.toLowerCase().includes(searchLower) ||
          r.description.toLowerCase().includes(searchLower);
        const userMatch = matchingUserIds.has(r.userId) || matchingUserIds.has(r.reportUserId);
        return reportFieldMatch || userMatch;
      });
    }
  }

  return {
    session,
    reports: filteredReports,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "dismiss") {
    const reportId = Number(formData.get("reportId"));
    await db.delete(reportUser).where(eq(reportUser.id, reportId));
    await logAudit({
      adminId: session.adminId,
      action: "dismiss_report_user",
      entityType: "report_user",
      entityId: reportId,
      request,
    });
    return { success: true, intent: "dismiss" };
  }

  if (intent === "block_user") {
    const reportId = Number(formData.get("reportId"));
    const userId = Number(formData.get("userId"));

    const [oldUser] = await db.select({ active: user.active }).from(user).where(eq(user.id, userId)).limit(1);
    await db.update(user).set({ active: 0 }).where(eq(user.id, userId));
    await db.delete(reportUser).where(eq(reportUser.id, reportId));

    await logAudit({
      adminId: session.adminId,
      action: "block_reported_user",
      entityType: "user",
      entityId: userId,
      oldValues: { active: oldUser?.active },
      newValues: { active: 0 },
      request,
    });
    return { success: true, intent: "block_user" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type ReportUserRow = {
  id: number;
  userId: number;
  reportUserId: number;
  reportReasonTitle: string;
  reportReasonId: number;
  description: string;
  created: Date;
  reporter: {
    id: number;
    username: string | null;
    firstName: string;
    lastName: string;
    profilePicSmall: string;
    active: number;
  } | null;
  reportedUserInfo: {
    id: number;
    username: string | null;
    firstName: string;
    lastName: string;
    profilePicSmall: string;
    active: number;
  } | null;
};

export default function ReportedUsersPage() {
  const { reports, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    reportId: number;
    userId?: number;
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
    const { intent, reportId, userId } = confirmDialog;
    if (intent === "dismiss") {
      fetcher.submit({ intent: "dismiss", reportId: String(reportId) }, { method: "post" });
    } else if (intent === "block_user" && userId !== undefined) {
      fetcher.submit({ intent: "block_user", reportId: String(reportId), userId: String(userId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<ReportUserRow>[] = [
    {
      accessorKey: "reportedUserInfo",
      header: "Reported User",
      cell: ({ row }) => {
        const reported = row.original.reportedUserInfo;
        if (!reported) return <span className="text-sm text-muted-foreground">Unknown</span>;
        return (
          <Link to={`/admin/users/${reported.id}`} className="text-sm hover:underline">
            {reported.username ? `@${reported.username}` : `${reported.firstName} ${reported.lastName}`}
          </Link>
        );
      },
    },
    {
      accessorKey: "reporter",
      header: "Reporter",
      cell: ({ row }) => {
        const reporter = row.original.reporter;
        if (!reporter) return <span className="text-sm text-muted-foreground">Unknown</span>;
        return (
          <span className="text-sm">
            {reporter.username ? `@${reporter.username}` : `${reporter.firstName} ${reporter.lastName}`}
          </span>
        );
      },
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
      cell: ({ row }) => {
        const reported = row.original.reportedUserInfo;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {reported && (
                <DropdownMenuItem asChild>
                  <Link to={`/admin/users/${reported.id}`}>
                    <Eye className="mr-2 h-4 w-4" /> View User
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setConfirmDialog({
                  open: true,
                  title: "Dismiss Report",
                  description: "Are you sure you want to dismiss this report? No action will be taken against the reported user.",
                  intent: "dismiss",
                  reportId: row.original.id,
                })}
              >
                <XCircle className="mr-2 h-4 w-4" /> Dismiss
              </DropdownMenuItem>
              {reported && reported.active === 1 && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: "Block User",
                    description: `Are you sure you want to block @${reported.username || `${reported.firstName} ${reported.lastName}`}? They will lose access to the app and this report will be dismissed.`,
                    intent: "block_user",
                    reportId: row.original.id,
                    userId: reported.id,
                  })}
                >
                  <ShieldOff className="mr-2 h-4 w-4" /> Block User
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reported Users</h2>
        <p className="text-muted-foreground">
          Review and manage user reports. {pagination.total.toLocaleString()} total reports.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by reason, description, or username..."
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
        emptyMessage="No reported users found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "block_user" ? "danger" : "default"}
        confirmLabel={confirmDialog.intent === "dismiss" ? "Dismiss" : "Block"}
      />
    </div>
  );
}