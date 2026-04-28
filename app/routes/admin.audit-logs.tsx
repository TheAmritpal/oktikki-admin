import { useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { db } from "~/db/index.server";
import { auditLog, admin } from "~/db/schema";
import { count, like, or, and, desc, eq, gte, lte } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ChevronDown, ChevronUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const actionFilter = url.searchParams.get("action") || "";
  const entityTypeFilter = url.searchParams.get("entityType") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(auditLog.action, `%${pagination.search}%`),
        like(auditLog.entityType, `%${pagination.search}%`)
      )!
    );
  }
  if (actionFilter) {
    conditions.push(like(auditLog.action, `%${actionFilter}%`));
  }
  if (entityTypeFilter) {
    conditions.push(eq(auditLog.entityType, entityTypeFilter));
  }
  if (dateFrom) {
    conditions.push(gte(auditLog.created, new Date(dateFrom)));
  }
  if (dateTo) {
    conditions.push(lte(auditLog.created, new Date(dateTo + "T23:59:59")));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, [{ total }]] = await Promise.all([
    db.select({
      id: auditLog.id,
      adminId: auditLog.adminId,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      oldValues: auditLog.oldValues,
      newValues: auditLog.newValues,
      ipAddress: auditLog.ipAddress,
      created: auditLog.created,
    })
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.created))
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(auditLog).where(whereClause),
  ]);

  // Fetch admin emails separately for the logs we retrieved
  const adminIds = [...new Set(logs.map((l) => l.adminId).filter((id): id is number => id !== null))];
  const admins = adminIds.length > 0
    ? await db.select({ id: admin.id, email: admin.email }).from(admin).where(
        or(...adminIds.map((id) => eq(admin.id, id)))
      )
    : [];

  const adminEmailMap = new Map(admins.map((a) => [a.id, a.email]));

  const logsWithAdmin = logs.map((l) => ({
    ...l,
    adminEmail: l.adminId ? adminEmailMap.get(l.adminId) || "Unknown" : "System",
  }));

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    logs: logsWithAdmin,
    pagination: { ...pagination, total, totalPages },
    filters: { action: actionFilter, entityType: entityTypeFilter },
  };
}

type AuditLogRow = {
  id: number;
  adminId: number | null;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: number | null;
  oldValues: string | null;
  newValues: string | null;
  ipAddress: string | null;
  created: Date;
};

const ENTITY_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "user", label: "User" },
  { value: "video", label: "Video" },
  { value: "banner", label: "Banner" },
  { value: "setting", label: "Setting" },
  { value: "role", label: "Role" },
  { value: "official_notification", label: "Notification" },
  { value: "coupon", label: "Coupon" },
  { value: "category", label: "Category" },
  { value: "admin", label: "Admin" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "block", label: "Block" },
  { value: "send", label: "Send" },
];

export default function AuditLogsPage() {
  const { logs, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

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
      prev.delete("action");
      prev.delete("entityType");
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

  const toggleRow = (id: number) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Audit Logs</h2>
        <p className="text-muted-foreground">
          View admin activity logs. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by action or entity type..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "action",
            label: "Action",
            options: ACTION_OPTIONS,
          },
          {
            name: "entityType",
            label: "Entity Type",
            options: ENTITY_TYPE_OPTIONS,
          },
        ]}
        filterValues={{
          action: filters.action || "all",
          entityType: filters.entityType || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No audit logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <>
                  <TableRow key={log.id}>
                    <TableCell>
                      <span className="text-sm font-medium">{log.adminEmail}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.action.replace(/_/g, " ")} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{log.entityType}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {log.entityId ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {new Date(log.created || new Date()).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">
                        {log.ipAddress || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleRow(log.id)}
                      >
                        {expandedRow === log.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedRow === log.id && (
                    <TableRow key={`${log.id}-expanded`}>
                      <TableCell colSpan={7} className="p-0">
                        <div className="bg-muted/50 px-6 py-4 space-y-3">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">OLD VALUES</p>
                              <pre className="text-xs bg-background rounded p-3 overflow-auto max-h-40">
                                {log.oldValues ? (typeof log.oldValues === "string" ? log.oldValues : JSON.stringify(log.oldValues, null, 2)) : "—"}
                              </pre>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">NEW VALUES</p>
                              <pre className="text-xs bg-background rounded p-3 overflow-auto max-h-40">
                                {log.newValues ? (typeof log.newValues === "string" ? log.newValues : JSON.stringify(log.newValues, null, 2)) : "—"}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Total: {pagination.total} records
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}