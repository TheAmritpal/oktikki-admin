import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { officialNotification } from "~/db/schema";
import { count, like, and, eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { StatusBadge } from "~/components/status-badge";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [];
  if (pagination.search) {
    conditions.push(like(officialNotification.title, `%${pagination.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [notifications, [{ total }]] = await Promise.all([
    db.select({
      id: officialNotification.id,
      title: officialNotification.title,
      message: officialNotification.message,
      type: officialNotification.type,
      url: officialNotification.url,
      targetUserId: officialNotification.targetUserId,
      isRead: officialNotification.isRead,
      created: officialNotification.created,
    })
      .from(officialNotification)
      .where(whereClause)
      .orderBy(desc(officialNotification.created))
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(officialNotification).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    notifications,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "delete") {
    const notificationId = Number(formData.get("notificationId"));
    await db.delete(officialNotification).where(eq(officialNotification.id, notificationId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_notification",
      entityType: "official_notification",
      entityId: notificationId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type NotificationRow = {
  id: number;
  title: string;
  message: string;
  type: string | null;
  url: string | null;
  targetUserId: number | null;
  isRead: number | null;
  created: Date;
};

export default function NotificationsListPage() {
  const { notifications, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    notificationId: number;
  }>({ open: false, title: "", description: "", intent: "", notificationId: 0 });

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
    const { intent, notificationId } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", notificationId: String(notificationId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<NotificationRow>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "message",
      header: "Message",
      cell: ({ row }) => (
        <span className="line-clamp-2 text-sm">{row.original.message}</span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <StatusBadge status={row.original.type || "text"} />
      ),
    },
    {
      accessorKey: "targetUserId",
      header: "Target",
      cell: ({ row }) => (
        row.original.targetUserId ? (
          <span className="text-sm">User #{row.original.targetUserId}</span>
        ) : (
          <StatusBadge status="all" />
        )
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
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Notification",
                description: `Are you sure you want to permanently delete the notification "${row.original.title}"? This action cannot be undone.`,
                intent: "delete",
                notificationId: row.original.id,
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
        <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
        <p className="text-muted-foreground">
          Manage official notifications. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by title..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[]}
        filterValues={{}}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={notifications}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No notifications found."
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