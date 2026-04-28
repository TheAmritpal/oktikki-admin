import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { user, userDocument } from "~/db/schema";
import { eq, count, desc, like, or, and } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { StatusBadge } from "~/components/status-badge";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, CheckCircle2, XCircle } from "lucide-react";

function docStatus(approveValue: number | null): "pending" | "approved" | "rejected" {
  if (approveValue === 1) return "approved";
  if (approveValue === 2) return "rejected";
  return "pending";
}

function overallDocStatus(doc: {
  identificationApprove: number | null;
  vehicleRegistrationApprove: number | null;
  drivingLicenseApprove: number | null;
  vehicleInsuranceApprove: number | null;
}): "pending" | "approved" | "rejected" {
  const statuses = [
    docStatus(doc.identificationApprove),
    docStatus(doc.vehicleRegistrationApprove),
    docStatus(doc.drivingLicenseApprove),
    docStatus(doc.vehicleInsuranceApprove),
  ];
  if (statuses.every((s) => s === "approved")) return "approved";
  if (statuses.some((s) => s === "rejected")) return "rejected";
  return "pending";
}

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const statusFilter = url.searchParams.get("status") || "";

  const conditions = [eq(user.business, 1)];

  if (pagination.search) {
    conditions.push(
      or(
        like(user.username, `%${pagination.search}%`),
        like(user.email, `%${pagination.search}%`),
        like(user.firstName, `%${pagination.search}%`),
        like(user.lastName, `%${pagination.search}%`)
      )!
    );
  }

  const whereClause = and(...conditions);

  const [businessUsers, [{ total }]] = await Promise.all([
    db.select({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      profilePicSmall: user.profilePicSmall,
      active: user.active,
      verified: user.verified,
      created: user.created,
    })
      .from(user)
      .where(whereClause)
      .orderBy(desc(user.created))
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(user).where(whereClause),
  ]);

  const userIds = businessUsers.map((u) => u.id);

  const documents = userIds.length > 0
    ? await db.select({
        id: userDocument.id,
        userId: userDocument.userId,
        identificationApprove: userDocument.identificationApprove,
        vehicleRegistrationApprove: userDocument.vehicleRegistrationApprove,
        drivingLicenseApprove: userDocument.drivingLicenseApprove,
        vehicleInsuranceApprove: userDocument.vehicleInsuranceApprove,
      })
        .from(userDocument)
        .where(or(...userIds.map((id) => eq(userDocument.userId, id))))
    : [];

  const docMap = new Map(documents.map((d) => [d.userId, d]));

  const rows = businessUsers.map((u) => {
    const doc = docMap.get(u.id);
    const docStatusValue = doc ? overallDocStatus(doc) : "pending";
    return { ...u, docStatus: docStatusValue };
  });

  const filteredRows = statusFilter
    ? rows.filter((r) => r.docStatus === statusFilter)
    : rows;

  const filteredTotal = statusFilter ? filteredRows.length : total;
  const totalPages = getTotalPages(statusFilter ? filteredRows.length : total, pagination.limit);

  return {
    session,
    businesses: statusFilter ? filteredRows : rows,
    pagination: { ...pagination, total: filteredTotal, totalPages },
    filters: { status: statusFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  const APPROVE_FIELDS = [
    "identificationApprove",
    "vehicleRegistrationApprove",
    "drivingLicenseApprove",
    "vehicleInsuranceApprove",
  ] as const;

  if (intent === "approve") {
    const documentId = Number(formData.get("documentId"));
    const userId = Number(formData.get("userId"));

    const [oldDoc] = await db
      .select({
        identificationApprove: userDocument.identificationApprove,
        vehicleRegistrationApprove: userDocument.vehicleRegistrationApprove,
        drivingLicenseApprove: userDocument.drivingLicenseApprove,
        vehicleInsuranceApprove: userDocument.vehicleInsuranceApprove,
      })
      .from(userDocument)
      .where(eq(userDocument.id, documentId))
      .limit(1);

    const updateFields: Record<string, number> = {};
    for (const field of APPROVE_FIELDS) {
      updateFields[field] = 1;
    }

    await db.update(userDocument).set(updateFields).where(eq(userDocument.id, documentId));

    await logAudit({
      adminId: session.adminId,
      action: "approve_business",
      entityType: "userDocument",
      entityId: documentId,
      oldValues: oldDoc ?? {},
      newValues: updateFields,
      request,
    });

    return { success: true, intent: "approve" };
  }

  if (intent === "reject") {
    const documentId = Number(formData.get("documentId"));
    const userId = Number(formData.get("userId"));

    const [oldDoc] = await db
      .select({
        identificationApprove: userDocument.identificationApprove,
        vehicleRegistrationApprove: userDocument.vehicleRegistrationApprove,
        drivingLicenseApprove: userDocument.drivingLicenseApprove,
        vehicleInsuranceApprove: userDocument.vehicleInsuranceApprove,
      })
      .from(userDocument)
      .where(eq(userDocument.id, documentId))
      .limit(1);

    const updateFields: Record<string, number> = {};
    for (const field of APPROVE_FIELDS) {
      updateFields[field] = 2;
    }

    await db.update(userDocument).set(updateFields).where(eq(userDocument.id, documentId));

    await logAudit({
      adminId: session.adminId,
      action: "reject_business",
      entityType: "userDocument",
      entityId: documentId,
      oldValues: oldDoc ?? {},
      newValues: updateFields,
      request,
    });

    return { success: true, intent: "reject" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type BusinessRow = {
  id: number;
  firstName: string;
  lastName: string;
  username: string | null;
  email: string | null;
  profilePicSmall: string;
  active: number;
  verified: number;
  created: Date;
  docStatus: "pending" | "approved" | "rejected";
};

export default function BusinessSubmissionsPage() {
  const { businesses, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    documentId: number;
    userId: number;
  }>({ open: false, title: "", description: "", intent: "", documentId: 0, userId: 0 });

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
    const { intent, documentId, userId } = confirmDialog;
    fetcher.submit(
      { intent, documentId: String(documentId), userId: String(userId) },
      { method: "post" }
    );
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<BusinessRow>[] = [
    {
      accessorKey: "firstName",
      header: "Business User",
      cell: ({ row }) => (
        <Link to={`/admin/users/${row.original.id}`} className="flex items-center gap-3 hover:underline">
          <UserAvatar
            src={row.original.profilePicSmall}
            name={`${row.original.firstName} ${row.original.lastName}`}
            verified={row.original.verified === 1}
            size="sm"
          />
          <div className="min-w-0">
            <p className="font-medium truncate">{row.original.firstName} {row.original.lastName}</p>
            {row.original.username && (
              <p className="text-xs text-muted-foreground">@{row.original.username}</p>
            )}
          </div>
        </Link>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.email || "—"}</span>
      ),
    },
    {
      accessorKey: "docStatus",
      header: "Document Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.docStatus} />
      ),
    },
    {
      accessorKey: "active",
      header: "Account Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.active === 1 ? "active" : "blocked"} />
      ),
    },
    {
      accessorKey: "created",
      header: "Joined",
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
            <DropdownMenuItem onClick={() => navigate(`/admin/users/${row.original.id}`)}>
              <Eye className="mr-2 h-4 w-4" /> View User
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: "Approve Business",
                description: `Are you sure you want to approve the business documents for ${row.original.firstName} ${row.original.lastName}? All documents will be marked as approved.`,
                intent: "approve",
                documentId: 0,
                userId: row.original.id,
              })}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Reject Business",
                description: `Are you sure you want to reject the business documents for ${row.original.firstName} ${row.original.lastName}? All documents will be marked as rejected.`,
                intent: "reject",
                documentId: 0,
                userId: row.original.id,
              })}
            >
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Business Submissions</h2>
        <p className="text-muted-foreground">
          Review and manage business account submissions. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username, email, or name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "status",
            label: "Document Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ],
          },
        ]}
        filterValues={{
          status: filters.status || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={businesses}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No business submissions found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "reject" ? "danger" : "default"}
      />
    </div>
  );
}