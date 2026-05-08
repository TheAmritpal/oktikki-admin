import { useState, useEffect, useRef } from "react";
import { Link, useLoaderData, useSearchParams, useFetcher, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth, hashPassword } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { blockUserSchema, createUserSchema, updateUserSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { UserAvatar } from "~/components/user-avatar";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { MoreHorizontal, Eye, ShieldOff, ShieldCheck, Trash2, Plus, Pencil } from "lucide-react";

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

  if (intent === "load_for_edit") {
    const userId = Number(formData.get("userId"));
    const [userData] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!userData) return { errors: { general: ["User not found"] } };
    return { intent: "load_for_edit", user: userData };
  }

  if (intent === "create") {
    const data = {
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      username: String(formData.get("username") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      password: String(formData.get("password") || ""),
      gender: String(formData.get("gender") || ""),
      role: String(formData.get("role") || "user"),
      verified: Number(formData.get("verified") || 0),
      active: Number(formData.get("active") || 1),
      dob: String(formData.get("dob") || ""),
      bio: String(formData.get("bio") || ""),
      website: String(formData.get("website") || ""),
      country: String(formData.get("country") || ""),
      wallet: Number(formData.get("wallet") || 0),
    };
    const result = createUserSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const hashedPassword = await hashPassword(result.data.password);
    const referralCode =
      (result.data.username || "USR") +
      Math.random().toString(36).substring(2, 8).toUpperCase();

    const insertResult = await db.insert(user).values({
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      username: result.data.username || null,
      email: result.data.email || null,
      phone: result.data.phone || null,
      password: hashedPassword,
      gender: result.data.gender,
      role: result.data.role,
      verified: result.data.verified,
      active: result.data.active,
      dob: result.data.dob ? new Date(result.data.dob) : new Date("2000-01-01"),
      bio: result.data.bio || "",
      website: result.data.website || "",
      country: result.data.country || "",
      wallet: result.data.wallet,
      socialId: "",
      profilePic: "default.png",
      profilePicSmall: "default.png",
      profileGif: "",
      profileVideo: "",
      social: "",
      deviceToken: "",
      token: crypto.randomUUID(),
      lat: "",
      long: "",
      online: 0,
      authToken: "",
      version: "",
      device: "",
      ip: "",
      city: "",
      state: "",
      region: "",
      locationString: "",
      countryId: 0,
      paypal: "",
      private: 1,
      profileView: 1,
      resetWalletDatetime: new Date(),
      referralCode,
      registerWith: "email",
      stripeCustomerId: "",
      created: new Date(),
      parent: 0,
      business: 0,
    });

    const newUserId = insertResult[0].insertId;
    await logAudit({
      adminId: session.adminId,
      action: "create_user",
      entityType: "user",
      entityId: newUserId,
      newValues: { email: result.data.email, role: result.data.role },
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "edit") {
    const editUserId = Number(formData.get("userId"));
    const data = {
      userId: editUserId,
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      username: String(formData.get("username") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      password: String(formData.get("password") || ""),
      gender: String(formData.get("gender") || ""),
      role: String(formData.get("role") || "user"),
      verified: Number(formData.get("verified")),
      active: Number(formData.get("active")),
      dob: String(formData.get("dob") || ""),
      bio: String(formData.get("bio") || ""),
      website: String(formData.get("website") || ""),
      country: String(formData.get("country") || ""),
      wallet: Number(formData.get("wallet")),
    };
    const result = updateUserSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, result.data.userId))
      .limit(1);

    const updateData: Record<string, unknown> = {
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      username: result.data.username || null,
      email: result.data.email || null,
      phone: result.data.phone || null,
      gender: result.data.gender,
      role: result.data.role,
      verified: result.data.verified,
      active: result.data.active,
      wallet: result.data.wallet,
      dob: result.data.dob || null,
      bio: result.data.bio ?? "",
      website: result.data.website ?? "",
      country: result.data.country ?? "",
    };

    if (result.data.password) {
      updateData.password = await hashPassword(result.data.password);
    }

    await db
      .update(user)
      .set(updateData)
      .where(eq(user.id, result.data.userId));

    await logAudit({
      adminId: session.adminId,
      action: "edit_user",
      entityType: "user",
      entityId: result.data.userId,
      oldValues: oldUser
        ? {
            firstName: oldUser.firstName,
            lastName: oldUser.lastName,
            email: oldUser.email,
            role: oldUser.role,
          }
        : undefined,
      newValues: {
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        email: result.data.email,
        role: result.data.role,
      },
      request,
    });
    return { success: true, intent: "edit" };
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

  // Add User dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    gender: "",
    role: "user",
    verified: 0,
    active: 1,
    dob: "",
    bio: "",
    website: "",
    country: "",
    wallet: 0,
  });

  // Edit User dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    userId: 0,
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    gender: "",
    role: "user",
    verified: 0,
    active: 1,
    dob: "",
    bio: "",
    website: "",
    country: "",
    wallet: 0,
  });

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

  // Detect when load_for_edit returns user data
  useEffect(() => {
    if (fetcher.data?.intent === "load_for_edit" && fetcher.data?.user) {
      const u = fetcher.data.user as any;
      setEditForm({
        userId: u.id,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        username: u.username || "",
        email: u.email || "",
        phone: u.phone || "",
        password: "",
        gender: u.gender || "",
        role: u.role || "user",
        verified: u.verified ?? 0,
        active: u.active ?? 1,
        dob: u.dob ? new Date(u.dob).toISOString().split("T")[0] : "",
        bio: u.bio || "",
        website: u.website || "",
        country: u.country || "",
        wallet: u.wallet ?? 0,
      });
      setEditDialogOpen(true);
    }
  }, [fetcher.data]);

  const handleAddSubmit = () => {
    fetcher.submit(
      { intent: "create", ...addForm, verified: String(addForm.verified), active: String(addForm.active), wallet: String(addForm.wallet) },
      { method: "post" }
    );
    setAddDialogOpen(false);
    resetAddForm();
  };

  const handleEditSubmit = () => {
    fetcher.submit(
      { intent: "edit", ...editForm, verified: String(editForm.verified), active: String(editForm.active), wallet: String(editForm.wallet), userId: String(editForm.userId) },
      { method: "post" }
    );
    setEditDialogOpen(false);
  };

  const resetAddForm = () => {
    setAddForm({
      firstName: "",
      lastName: "",
      username: "",
      email: "",
      phone: "",
      password: "",
      gender: "",
      role: "user",
      verified: 0,
      active: 1,
      dob: "",
      bio: "",
      website: "",
      country: "",
      wallet: 0,
    });
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
              onClick={() => {
                fetcher.submit({ intent: "load_for_edit", userId: String(row.original.id) }, { method: "post" });
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage platform users. {pagination.total.toLocaleString()} total records.
          </p>
        </div>

        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add User
        </Button>
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

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new platform user account.
            </DialogDescription>
          </DialogHeader>
          <UserFormFields
            form={addForm}
            setForm={setAddForm}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetAddForm(); }}>Cancel</Button>
            <Button
              onClick={handleAddSubmit}
              disabled={!addForm.firstName || !addForm.lastName || !addForm.password || addForm.password.length < 6 || !addForm.gender}
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user account details. Leave password blank to keep unchanged.
            </DialogDescription>
          </DialogHeader>
          <UserFormFields
            form={editForm}
            setForm={setEditForm}
            showPasswordOptional
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditSubmit}
              disabled={!editForm.firstName || !editForm.lastName || !editForm.gender}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Shared form fields for add/edit dialogs ── */

interface UserFormData {
  userId?: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  gender: string;
  role: string;
  verified: number;
  active: number;
  dob: string;
  bio: string;
  website: string;
  country: string;
  wallet: number;
}

function UserFormFields<T extends Record<string, string | number>>({
  form,
  setForm,
  showPasswordOptional = false,
}: {
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
  showPasswordOptional?: boolean;
}) {
  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="grid gap-4 py-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="uf-firstName">First Name *</Label>
        <Input
          id="uf-firstName"
          value={form.firstName}
          onChange={(e) => updateField("firstName", e.target.value)}
          placeholder="First name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-lastName">Last Name *</Label>
        <Input
          id="uf-lastName"
          value={form.lastName}
          onChange={(e) => updateField("lastName", e.target.value)}
          placeholder="Last name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-username">Username</Label>
        <Input
          id="uf-username"
          value={form.username}
          onChange={(e) => updateField("username", e.target.value)}
          placeholder="Username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-email">Email</Label>
        <Input
          id="uf-email"
          type="email"
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
          placeholder="Email address"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-phone">Phone</Label>
        <Input
          id="uf-phone"
          value={form.phone}
          onChange={(e) => updateField("phone", e.target.value)}
          placeholder="Phone number"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-password">
          Password{showPasswordOptional ? "" : " *"}
        </Label>
        <Input
          id="uf-password"
          type="password"
          value={form.password}
          onChange={(e) => updateField("password", e.target.value)}
          placeholder={showPasswordOptional ? "Leave blank to keep unchanged" : "Minimum 6 characters"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-gender">Gender *</Label>
        <Select value={String(form.gender)} onValueChange={(v) => updateField("gender", v)}>
          <SelectTrigger id="uf-gender">
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-role">Role</Label>
        <Select value={String(form.role)} onValueChange={(v) => updateField("role", v)}>
          <SelectTrigger id="uf-role">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.filter((r) => r.value !== "all").map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-verified">Verified</Label>
        <Select
          value={String(form.verified)}
          onValueChange={(v) => updateField("verified", Number(v))}
        >
          <SelectTrigger id="uf-verified">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Verified</SelectItem>
            <SelectItem value="0">Unverified</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-active">Status</Label>
        <Select
          value={String(form.active)}
          onValueChange={(v) => updateField("active", Number(v))}
        >
          <SelectTrigger id="uf-active">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Active</SelectItem>
            <SelectItem value="0">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-wallet">Wallet (coins)</Label>
        <Input
          id="uf-wallet"
          type="number"
          min="0"
          value={form.wallet}
          onChange={(e) => updateField("wallet", Number(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-dob">Date of Birth</Label>
        <Input
          id="uf-dob"
          type="date"
          value={form.dob}
          onChange={(e) => updateField("dob", e.target.value)}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="uf-bio">Bio</Label>
        <Input
          id="uf-bio"
          value={form.bio}
          onChange={(e) => updateField("bio", e.target.value)}
          placeholder="Short bio"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-website">Website</Label>
        <Input
          id="uf-website"
          value={form.website}
          onChange={(e) => updateField("website", e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="uf-country">Country</Label>
        <Input
          id="uf-country"
          value={form.country}
          onChange={(e) => updateField("country", e.target.value)}
          placeholder="Country"
        />
      </div>
    </div>
  );
}