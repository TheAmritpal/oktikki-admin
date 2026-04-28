import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { verificationRequest, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { verificationActionSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const statusFilter = url.searchParams.get("status") || "0";

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(user.username, `%${pagination.search}%`),
        like(user.firstName, `%${pagination.search}%`),
        like(user.lastName, `%${pagination.search}%`)
      )!
    );
  }
  if (statusFilter === "0" || statusFilter === "1" || statusFilter === "2") {
    conditions.push(eq(verificationRequest.verified, Number(statusFilter)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = verificationRequest.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [requests, [{ total }]] = await Promise.all([
    db.select({
      id: verificationRequest.id,
      userId: verificationRequest.userId,
      attachment: verificationRequest.attachment,
      verified: verificationRequest.verified,
      updateTime: verificationRequest.updateTime,
      created: verificationRequest.created,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
    })
      .from(verificationRequest)
      .innerJoin(user, eq(verificationRequest.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() })
      .from(verificationRequest)
      .innerJoin(user, eq(verificationRequest.userId, user.id))
      .where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    requests,
    pagination: { ...pagination, total, totalPages },
    filters: { status: statusFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "approve" || intent === "reject") {
    const requestId = Number(formData.get("requestId"));
    const status = intent === "approve" ? "approved" : "rejected";
    const reason = String(formData.get("reason") || "");

    const result = verificationActionSchema.safeParse({ status, reason });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const verifiedValue = intent === "approve" ? 1 : 2;

    const [oldRequest] = await db.select()
      .from(verificationRequest)
      .where(eq(verificationRequest.id, requestId))
      .limit(1);

    await db.update(verificationRequest)
      .set({ verified: verifiedValue, updateTime: new Date() })
      .where(eq(verificationRequest.id, requestId));

    if (intent === "approve" && oldRequest) {
      await db.update(user)
        .set({ verified: 1 })
        .where(eq(user.id, oldRequest.userId));
    }

    await logAudit({
      adminId: session.adminId,
      action: intent === "approve" ? "approve_verification" : "reject_verification",
      entityType: "verification_request",
      entityId: requestId,
      oldValues: { verified: oldRequest?.verified },
      newValues: { verified: verifiedValue },
      request,
    });
    return { success: true, intent };
  }

  return { errors: { general: ["Unknown action"] } };
}

const VERIFIED_STATUS: Record<number, string> = {
  0: "pending",
  1: "approved",
  2: "rejected",
};

type VerificationRow = {
  id: number;
  userId: number;
  attachment: string;
  verified: number;
  updateTime: Date;
  created: string;
  username: string | null;
  firstName: string;
  lastName: string;
};

export default function VerificationRequestsPage() {
  const { requests, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    requestId: number;
  }>({ open: false, title: "", description: "", intent: "", requestId: 0 });

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

  const handleConfirm = () => {
    const { intent, requestId } = confirmDialog;
    fetcher.submit({ intent, requestId: String(requestId) }, { method: "post" });
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<VerificationRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "username",
      header: "User",
      cell: ({ row }) => (
        <Link to={`/admin/users/${row.original.userId}`} className="text-sm hover:underline">
          {row.original.username
            ? `@${row.original.username}`
            : `${row.original.firstName} ${row.original.lastName}`}
        </Link>
      ),
    },
    {
      accessorKey: "attachment",
      header: "Attachment",
      cell: ({ row }) => {
        const attachment = row.original.attachment;
        if (!attachment) return <span className="text-muted-foreground text-sm">No attachment</span>;
        return (
          <a
            href={attachment}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm"
          >
            View File
          </a>
        );
      },
    },
    {
      accessorKey: "verified",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={VERIFIED_STATUS[row.original.verified] || "pending"} />
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
      cell: ({ row }) => {
        const isPending = row.original.verified === 0;
        return (
          <div className="flex items-center gap-2">
            {isPending && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-green-600 hover:text-green-700 dark:text-green-400"
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: "Approve Verification",
                    description: `Are you sure you want to approve the verification request from ${row.original.username ? `@${row.original.username}` : `${row.original.firstName} ${row.original.lastName}`}? The user will be marked as verified.`,
                    intent: "approve",
                    requestId: row.original.id,
                  })}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: "Reject Verification",
                    description: `Are you sure you want to reject the verification request from ${row.original.username ? `@${row.original.username}` : `${row.original.firstName} ${row.original.lastName}`}?`,
                    intent: "reject",
                    requestId: row.original.id,
                  })}
                >
                  <XCircle className="mr-1 h-4 w-4" /> Reject
                </Button>
              </>
            )}
            {row.original.verified === 1 && (
              <StatusBadge status="approved" />
            )}
            {row.original.verified === 2 && (
              <StatusBadge status="rejected" />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Verification Requests</h2>
        <p className="text-muted-foreground">
          Review and manage user verification requests. {pagination.total.toLocaleString()} total requests.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username or name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "0", label: "Pending" },
              { value: "1", label: "Approved" },
              { value: "2", label: "Rejected" },
            ],
          },
        ]}
        filterValues={{
          status: filters.status || "0",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={requests}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No verification requests found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "reject" ? "danger" : "default"}
        confirmLabel={confirmDialog.intent === "approve" ? "Approve" : "Reject"}
      />
    </div>
  );
}