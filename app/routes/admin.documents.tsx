import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { userDocument, user } from "~/db/schema";
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
import { MoreHorizontal, CheckCircle2, XCircle } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const statusFilter = url.searchParams.get("status") || "";

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

  // Filter by document approval status
  if (statusFilter === "pending") {
    conditions.push(eq(userDocument.identificationApprove, 0));
  } else if (statusFilter === "approved") {
    conditions.push(eq(userDocument.identificationApprove, 1));
  } else if (statusFilter === "rejected") {
    conditions.push(eq(userDocument.identificationApprove, 2));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = userDocument.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [documents, [{ total }]] = await Promise.all([
    db.select({
      id: userDocument.id,
      userId: userDocument.userId,
      identification: userDocument.identification,
      identificationApprove: userDocument.identificationApprove,
      vehicleRegistration: userDocument.vehicleRegistration,
      vehicleRegistrationApprove: userDocument.vehicleRegistrationApprove,
      drivingLicense: userDocument.drivingLicense,
      drivingLicenseApprove: userDocument.drivingLicenseApprove,
      vehicleInsurance: userDocument.vehicleInsurance,
      vehicleInsuranceApprove: userDocument.vehicleInsuranceApprove,
      updated: userDocument.updated,
      created: userDocument.created,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
    })
      .from(userDocument)
      .innerJoin(user, eq(userDocument.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() })
      .from(userDocument)
      .innerJoin(user, eq(userDocument.userId, user.id))
      .where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    documents,
    pagination: { ...pagination, total, totalPages },
    filters: { status: statusFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "approve_doc" || intent === "reject_doc") {
    const documentId = Number(formData.get("documentId"));
    const docType = String(formData.get("docType"));
    const approveValue = intent === "approve_doc" ? 1 : 2;

    const [oldDoc] = await db.select().from(userDocument).where(eq(userDocument.id, documentId)).limit(1);

    // Update the specific document type approval status
    if (docType === "identification") {
      await db.update(userDocument).set({ identificationApprove: approveValue }).where(eq(userDocument.id, documentId));
    } else if (docType === "vehicleRegistration") {
      await db.update(userDocument).set({ vehicleRegistrationApprove: approveValue }).where(eq(userDocument.id, documentId));
    } else if (docType === "drivingLicense") {
      await db.update(userDocument).set({ drivingLicenseApprove: approveValue }).where(eq(userDocument.id, documentId));
    } else if (docType === "vehicleInsurance") {
      await db.update(userDocument).set({ vehicleInsuranceApprove: approveValue }).where(eq(userDocument.id, documentId));
    }

    const approveFieldMap: Record<string, string> = {
      identification: "identificationApprove",
      vehicleRegistration: "vehicleRegistrationApprove",
      drivingLicense: "drivingLicenseApprove",
      vehicleInsurance: "vehicleInsuranceApprove",
    };

    await logAudit({
      adminId: session.adminId,
      action: intent === "approve_doc" ? "approve_document" : "reject_document",
      entityType: "user_document",
      entityId: documentId,
      oldValues: oldDoc ? { [docType]: (oldDoc as any)[approveFieldMap[docType]] } : undefined,
      newValues: { [docType]: approveValue },
      request,
    });
    return { success: true, intent };
  }

  if (intent === "approve_all") {
    const documentId = Number(formData.get("documentId"));

    await db.update(userDocument)
      .set({
        identificationApprove: 1,
        vehicleRegistrationApprove: 1,
        drivingLicenseApprove: 1,
        vehicleInsuranceApprove: 1,
      })
      .where(eq(userDocument.id, documentId));

    await logAudit({
      adminId: session.adminId,
      action: "approve_all_documents",
      entityType: "user_document",
      entityId: documentId,
      request,
    });
    return { success: true, intent: "approve_all" };
  }

  if (intent === "reject_all") {
    const documentId = Number(formData.get("documentId"));

    await db.update(userDocument)
      .set({
        identificationApprove: 2,
        vehicleRegistrationApprove: 2,
        drivingLicenseApprove: 2,
        vehicleInsuranceApprove: 2,
      })
      .where(eq(userDocument.id, documentId));

    await logAudit({
      adminId: session.adminId,
      action: "reject_all_documents",
      entityType: "user_document",
      entityId: documentId,
      request,
    });
    return { success: true, intent: "reject_all" };
  }

  return { errors: { general: ["Unknown action"] } };
}

const DOC_STATUS: Record<number, string> = {
  0: "pending",
  1: "approved",
  2: "rejected",
};

function DocBadge({ value }: { value: number }) {
  return <StatusBadge status={DOC_STATUS[value] || "pending"} />;
}

type DocumentRow = {
  id: number;
  userId: number;
  identification: string;
  identificationApprove: number;
  vehicleRegistration: string;
  vehicleRegistrationApprove: number;
  drivingLicense: string;
  drivingLicenseApprove: number;
  vehicleInsurance: string;
  vehicleInsuranceApprove: number;
  updated: Date;
  created: Date;
  username: string | null;
  firstName: string;
  lastName: string;
};

export default function DocumentsPage() {
  const { documents, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    documentId: number;
    docType?: string;
  }>({ open: false, title: "", description: "", intent: "", documentId: 0 });

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
    const { intent, documentId, docType } = confirmDialog;
    if (intent === "approve_all" || intent === "reject_all") {
      fetcher.submit({ intent, documentId: String(documentId) }, { method: "post" });
    } else if (docType) {
      fetcher.submit({ intent, documentId: String(documentId), docType }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<DocumentRow>[] = [
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
      accessorKey: "identificationApprove",
      header: "Identification",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <DocBadge value={row.original.identificationApprove} />
          {row.original.identification && (
            <a href={row.original.identification} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View</a>
          )}
        </div>
      ),
    },
    {
      accessorKey: "vehicleRegistrationApprove",
      header: "Vehicle Reg.",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <DocBadge value={row.original.vehicleRegistrationApprove} />
          {row.original.vehicleRegistration && (
            <a href={row.original.vehicleRegistration} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View</a>
          )}
        </div>
      ),
    },
    {
      accessorKey: "drivingLicenseApprove",
      header: "Driving License",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <DocBadge value={row.original.drivingLicenseApprove} />
          {row.original.drivingLicense && (
            <a href={row.original.drivingLicense} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View</a>
          )}
        </div>
      ),
    },
    {
      accessorKey: "vehicleInsuranceApprove",
      header: "Insurance",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <DocBadge value={row.original.vehicleInsuranceApprove} />
          {row.original.vehicleInsurance && (
            <a href={row.original.vehicleInsurance} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View</a>
          )}
        </div>
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
            {row.original.identificationApprove === 0 && (
              <>
                <DropdownMenuItem
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: "Approve Identification",
                    description: "Are you sure you want to approve this user's identification document?",
                    intent: "approve_doc",
                    documentId: row.original.id,
                    docType: "identification",
                  })}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" /> Approve ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setConfirmDialog({
                    open: true,
                    title: "Reject Identification",
                    description: "Are you sure you want to reject this user's identification document?",
                    intent: "reject_doc",
                    documentId: row.original.id,
                    docType: "identification",
                  })}
                >
                  <XCircle className="mr-2 h-4 w-4 text-destructive" /> Reject ID
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: "Approve All Documents",
                description: "Are you sure you want to approve all documents for this user?",
                intent: "approve_all",
                documentId: row.original.id,
              })}
            >
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" /> Approve All
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Reject All Documents",
                description: "Are you sure you want to reject all documents for this user?",
                intent: "reject_all",
                documentId: row.original.id,
              })}
            >
              <XCircle className="mr-2 h-4 w-4" /> Reject All
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">User Documents</h2>
        <p className="text-muted-foreground">
          Review and manage user-submitted documents. {pagination.total.toLocaleString()} total records.
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
        data={documents}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No documents found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent.includes("reject") ? "danger" : "default"}
        confirmLabel={confirmDialog.intent.includes("approve") ? "Approve" : "Reject"}
      />
    </div>
  );
}