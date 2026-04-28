import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { coupon } from "~/db/schema";
import { count, eq, like, or, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { createCouponSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(coupon.couponCode, `%${pagination.search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "couponCode" ? coupon.couponCode
    : pagination.sort === "discount" ? coupon.discount
    : coupon.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [coupons, [{ total }]] = await Promise.all([
    db.select({
      id: coupon.id,
      couponCode: coupon.couponCode,
      discount: coupon.discount,
      limitUsers: coupon.limitUsers,
      expiryDate: coupon.expiryDate,
      created: coupon.created,
    })
      .from(coupon)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(coupon).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    coupons,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const data = {
      couponCode: String(formData.get("couponCode") || ""),
      discount: Number(formData.get("discount") || 0),
      limitUsers: formData.get("limitUsers") ? Number(formData.get("limitUsers")) : undefined,
      expiryDate: formData.get("expiryDate") ? String(formData.get("expiryDate")) : undefined,
    };
    const result = createCouponSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [newCoupon] = await db.insert(coupon).values({
      couponCode: result.data.couponCode,
      discount: result.data.discount,
      limitUsers: result.data.limitUsers ?? 0,
      expiryDate: result.data.expiryDate ? new Date(result.data.expiryDate) : new Date("2099-12-31"),
      created: new Date(),
    }).$returningId();

    await logAudit({
      adminId: session.adminId,
      action: "create_coupon",
      entityType: "coupon",
      entityId: newCoupon?.id,
      newValues: result.data,
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "delete") {
    const couponId = Number(formData.get("couponId"));
    await db.delete(coupon).where(eq(coupon.id, couponId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_coupon",
      entityType: "coupon",
      entityId: couponId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type CouponRow = {
  id: number;
  couponCode: string;
  discount: number;
  limitUsers: number;
  expiryDate: Date;
  created: Date;
};

export default function CouponsListPage() {
  const { coupons, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    couponId: number;
  }>({ open: false, title: "", description: "", intent: "", couponId: 0 });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [formState, setFormState] = useState({
    couponCode: "",
    discount: "",
    limitUsers: "",
    expiryDate: "",
  });

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
    const { intent, couponId } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", couponId: String(couponId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleCreate = () => {
    fetcher.submit(
      {
        intent: "create",
        couponCode: formState.couponCode,
        discount: formState.discount,
        limitUsers: formState.limitUsers,
        expiryDate: formState.expiryDate,
      },
      { method: "post" }
    );
    setCreateDialogOpen(false);
    setFormState({ couponCode: "", discount: "", limitUsers: "", expiryDate: "" });
  };

  const columns: ColumnDef<CouponRow>[] = [
    {
      accessorKey: "couponCode",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.couponCode}</span>
      ),
    },
    {
      accessorKey: "discount",
      header: "Discount",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.discount}%</span>
      ),
    },
    {
      accessorKey: "limitUsers",
      header: "Limit Users",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.limitUsers || "Unlimited"}</span>
      ),
    },
    {
      accessorKey: "expiryDate",
      header: "Expiry Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.expiryDate).toLocaleDateString()}
        </span>
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
                title: "Delete Coupon",
                description: `Are you sure you want to permanently delete coupon "${row.original.couponCode}"? This action cannot be undone.`,
                intent: "delete",
                couponId: row.original.id,
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
          <h2 className="text-2xl font-bold tracking-tight">Coupons</h2>
          <p className="text-muted-foreground">
            Manage discount coupons. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Coupon
        </Button>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by coupon code..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={coupons}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No coupons found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant="danger"
      />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Coupon</DialogTitle>
            <DialogDescription>
              Create a new discount coupon for the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="couponCode">Coupon Code</Label>
              <Input
                id="couponCode"
                placeholder="e.g. SUMMER2025"
                value={formState.couponCode}
                onChange={(e) => setFormState((prev) => ({ ...prev, couponCode: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount">Discount (%)</Label>
              <Input
                id="discount"
                type="number"
                min="1"
                placeholder="e.g. 10"
                value={formState.discount}
                onChange={(e) => setFormState((prev) => ({ ...prev, discount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="limitUsers">Limit Users (optional)</Label>
              <Input
                id="limitUsers"
                type="number"
                min="1"
                placeholder="e.g. 100"
                value={formState.limitUsers}
                onChange={(e) => setFormState((prev) => ({ ...prev, limitUsers: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date (optional)</Label>
              <Input
                id="expiryDate"
                type="date"
                value={formState.expiryDate}
                onChange={(e) => setFormState((prev) => ({ ...prev, expiryDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!formState.couponCode || !formState.discount || Number(formState.discount) <= 0}
            >
              Create Coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}