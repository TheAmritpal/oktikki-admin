import { useState } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { blockUserSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { UserAvatar } from "~/components/user-avatar";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, ShieldOff, ShieldCheck, Trash2, ChevronLeft } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const statusFilter = url.searchParams.get("status") || "";
  const roleFilter = url.searchParams.get("role") || "";
  const verifiedFilter = url.searchParams.get("verified") || "";

  const conditions = [];
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
  if (statusFilter === "active") conditions.push(eq(user.active, 1));
  if (statusFilter === "blocked") conditions.push(eq(user.active, 0));
  if (roleFilter) conditions.push(sql`${user.role} = ${roleFilter}`);
  if (verifiedFilter === "1") conditions.push(eq(user.verified, 1));
  if (verifiedFilter === "0") conditions.push(eq(user.verified, 0));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "username" ? user.username
    : pagination.sort === "wallet" ? user.wallet
    : pagination.sort === "email" ? user.email
    : user.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [users, [{ total }]] = await Promise.all([
    db.select({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      profilePicSmall: user.profilePicSmall,
      role: user.role,
      wallet: user.wallet,
      active: user.active,
      verified: user.verified,
      created: user.created,
    })
      .from(user)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(user).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    users,
    pagination: { ...pagination, total, totalPages },
    filters: { status: statusFilter, role: roleFilter, verified: verifiedFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "block") {
    const userId = Number(formData.get("userId"));
    const blockValue = Number(formData.get("block"));
    const result = blockUserSchema.safeParse({ block: blockValue, intent: "block" });
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldUser] = await db.select({ active: user.active }).from(user).where(eq(user.id, userId)).limit(1);
    await db.update(user).set({ active: blockValue }).where(eq(user.id, userId));
    await logAudit({
      adminId: session.adminId,
      action: blockValue === 0 ? "block_user" : "unblock_user",
      entityType: "user",
      entityId: userId,
      oldValues: { active: oldUser?.active },
      newValues: { active: blockValue },
      request,
    });
    return { success: true, intent: "block", block: blockValue };
  }

  if (intent === "delete") {
    const userId = Number(formData.get("userId"));
    await db.delete(user).where(eq(user.id, userId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_user",
      entityType: "user",
      entityId: userId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

const ROLE_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "user", label: "User" },
  { value: "svip", label: "SVIP" },
  { value: "svip2", label: "SVIP 2" },
  { value: "svip3", label: "SVIP 3" },
  { value: "host", label: "Host" },
  { value: "coin_seller", label: "Coin Seller" },
  { value: "sub_agency", label: "Sub Agency" },
  { value: "agency", label: "Agency" },
  { value: "bd", label: "BD" },
  { value: "bd_head", label: "BD Head" },
  { value: "official", label: "Official" },
];

type UserRow = {
  id: number;
  firstName: string;
  lastName: string;
  username: string | null;
  email: string | null;
  profilePicSmall: string;
  role: string;
  wallet: number;
  active: number;
  verified: number;
  created: Date;
};

export default function UsersListPage() {
  const { users, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    userId: number;
    blockValue?: number;
  }>({ open: false, title: "", description: "", intent: "", userId: 0 });

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
      prev.delete("role");
      prev.delete("verified");
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
    const { intent, userId, blockValue } = confirmDialog;
    if (intent === "block" && blockValue !== undefined) {
      fetcher.submit({ intent: "block", userId: String(userId), block: String(blockValue) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete", userId: String(userId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "firstName",
      header: "User",
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
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <StatusBadge status={row.original.role} />
      ),
    },
    {
      accessorKey: "wallet",
      header: "Wallet",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.wallet.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.active === 1 ? "active" : "blocked"} />
      ),
    },
    {
      accessorKey: "verified",
      header: "Verified",
      cell: ({ row }) => (
        row.original.verified === 1 ? (
          <span className="text-green-600 dark:text-green-400 text-sm font-medium">Verified</span>
        ) : (
          <span className="text-muted-foreground text-sm">Unverified</span>
        )
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
              <Eye className="mr-2 h-4 w-4" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: row.original.active === 1 ? "Block User" : "Unblock User",
                description: row.original.active === 1
                  ? `Are you sure you want to block ${row.original.firstName} ${row.original.lastName}? They will not be able to access the app.`
                  : `Are you sure you want to unblock ${row.original.firstName} ${row.original.lastName}? They will regain access to the app.`,
                intent: "block",
                userId: row.original.id,
                blockValue: row.original.active === 1 ? 0 : 1,
              })}
            >
              {row.original.active === 1 ? (
                <><ShieldOff className="mr-2 h-4 w-4" /> Block</>
              ) : (
                <><ShieldCheck className="mr-2 h-4 w-4" /> Unblock</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete User",
                description: `Are you sure you want to permanently delete ${row.original.firstName} ${row.original.lastName}? This action cannot be undone and will remove all their data.`,
                intent: "delete",
                userId: row.original.id,
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
        <h2 className="text-2xl font-bold tracking-tight">Users</h2>
        <p className="text-muted-foreground">
          Manage platform users. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username, email, or name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "blocked", label: "Blocked" },
            ],
          },
          {
            name: "role",
            label: "Role",
            options: ROLE_OPTIONS,
          },
          {
            name: "verified",
            label: "Verified",
            options: [
              { value: "all", label: "All" },
              { value: "1", label: "Verified" },
              { value: "0", label: "Unverified" },
            ],
          },
        ]}
        filterValues={{
          status: filters.status || "all",
          role: filters.role || "all",
          verified: filters.verified || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={users}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No users found."
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