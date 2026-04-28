import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { banner } from "~/db/schema";
import { count, like, and, eq, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { createBannerSchema } from "~/lib/validation";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { StatusBadge } from "~/components/status-badge";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { MoreHorizontal, Trash2, Plus, RefreshCw } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const statusFilter = url.searchParams.get("status") || "";

  const conditions = [];
  if (pagination.search) {
    conditions.push(like(banner.title, `%${pagination.search}%`));
  }
  if (statusFilter) {
    conditions.push(eq(banner.status, statusFilter as "ongoing" | "upcoming" | "finished"));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "sortOrder" ? banner.sortOrder : banner.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [banners, [{ total }]] = await Promise.all([
    db.select({
      id: banner.id,
      title: banner.title,
      description: banner.description,
      imageUrl: banner.imageUrl,
      redirectUrl: banner.redirectUrl,
      status: banner.status,
      sortOrder: banner.sortOrder,
      startDate: banner.startDate,
      endDate: banner.endDate,
      created: banner.created,
    })
      .from(banner)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(banner).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    banners,
    pagination: { ...pagination, total, totalPages },
    filters: { status: statusFilter },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const data = {
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || "") || undefined,
      redirectUrl: String(formData.get("redirectUrl") || "") || undefined,
      status: String(formData.get("status") || "upcoming") as "ongoing" | "upcoming" | "finished",
      startDate: String(formData.get("startDate") || "") || undefined,
      endDate: String(formData.get("endDate") || "") || undefined,
    };

    const result = createBannerSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    await db.insert(banner).values({
      title: result.data.title,
      description: result.data.description || null,
      imageUrl: "",
      redirectUrl: result.data.redirectUrl || null,
      status: result.data.status,
      sortOrder: 0,
      startDate: result.data.startDate ? new Date(result.data.startDate) : null,
      endDate: result.data.endDate ? new Date(result.data.endDate) : null,
      created: new Date(),
      modified: new Date(),
    });

    await logAudit({
      adminId: session.adminId,
      action: "create_banner",
      entityType: "banner",
      newValues: result.data,
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "updateStatus") {
    const bannerId = Number(formData.get("bannerId"));
    const newStatus = String(formData.get("status")) as "ongoing" | "upcoming" | "finished";

    const [oldBanner] = await db.select({ status: banner.status }).from(banner).where(eq(banner.id, bannerId)).limit(1);
    await db.update(banner).set({ status: newStatus }).where(eq(banner.id, bannerId));
    await logAudit({
      adminId: session.adminId,
      action: "update_banner_status",
      entityType: "banner",
      entityId: bannerId,
      oldValues: { status: oldBanner?.status },
      newValues: { status: newStatus },
      request,
    });
    return { success: true, intent: "updateStatus" };
  }

  if (intent === "delete") {
    const bannerId = Number(formData.get("bannerId"));
    await db.delete(banner).where(eq(banner.id, bannerId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_banner",
      entityType: "banner",
      entityId: bannerId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type BannerRow = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string;
  redirectUrl: string | null;
  status: string;
  sortOrder: number;
  startDate: Date | null;
  endDate: Date | null;
  created: Date;
};

export default function BannersListPage() {
  const { banners, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    bannerId: number;
    newStatus?: string;
  }>({ open: false, title: "", description: "", intent: "", bannerId: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [formState, setFormState] = useState({
    title: "",
    description: "",
    redirectUrl: "",
    status: "upcoming" as "ongoing" | "upcoming" | "finished",
    startDate: "",
    endDate: "",
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
    const { intent, bannerId, newStatus } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", bannerId: String(bannerId) }, { method: "post" });
    } else if (intent === "updateStatus" && newStatus) {
      fetcher.submit({ intent: "updateStatus", bannerId: String(bannerId), status: newStatus }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const handleCreate = () => {
    fetcher.submit(
      {
        intent: "create",
        title: formState.title,
        description: formState.description,
        redirectUrl: formState.redirectUrl,
        status: formState.status,
        startDate: formState.startDate,
        endDate: formState.endDate,
      },
      { method: "post" }
    );
    setCreateOpen(false);
    setFormState({ title: "", description: "", redirectUrl: "", status: "upcoming", startDate: "", endDate: "" });
  };

  const nextStatusMap: Record<string, string> = {
    upcoming: "ongoing",
    ongoing: "finished",
    finished: "upcoming",
  };

  const columns: ColumnDef<BannerRow>[] = [
    {
      accessorKey: "imageUrl",
      header: "Image",
      cell: ({ row }) => (
        row.original.imageUrl ? (
          <img src={row.original.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />
        ) : (
          <div className="h-10 w-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">N/A</div>
        )
      ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} />
      ),
    },
    {
      accessorKey: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.startDate ? new Date(row.original.startDate).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      accessorKey: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.endDate ? new Date(row.original.endDate).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      accessorKey: "sortOrder",
      header: "Sort Order",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.sortOrder}</span>
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
              onClick={() => setConfirmDialog({
                open: true,
                title: "Change Banner Status",
                description: `Change status from "${row.original.status}" to "${nextStatusMap[row.original.status]}"?`,
                intent: "updateStatus",
                bannerId: row.original.id,
                newStatus: nextStatusMap[row.original.status],
              })}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Change Status
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Banner",
                description: `Are you sure you want to permanently delete the banner "${row.original.title}"? This action cannot be undone.`,
                intent: "delete",
                bannerId: row.original.id,
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
          <h2 className="text-2xl font-bold tracking-tight">Banners</h2>
          <p className="text-muted-foreground">
            Manage banners. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Banner
        </Button>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by title..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "ongoing", label: "Ongoing" },
              { value: "upcoming", label: "Upcoming" },
              { value: "finished", label: "Finished" },
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
        data={banners}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No banners found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "delete" ? "danger" : "default"}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Banner</DialogTitle>
            <DialogDescription>
              Create a new banner for the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="banner-title">Title</Label>
              <Input
                id="banner-title"
                placeholder="Banner title"
                value={formState.title}
                onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-description">Description</Label>
              <Textarea
                id="banner-description"
                placeholder="Banner description (optional)"
                value={formState.description}
                onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-redirectUrl">Redirect URL</Label>
              <Input
                id="banner-redirectUrl"
                placeholder="https://example.com"
                value={formState.redirectUrl}
                onChange={(e) => setFormState((prev) => ({ ...prev, redirectUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formState.status}
                onValueChange={(value) =>
                  setFormState((prev) => ({ ...prev, status: value as "ongoing" | "upcoming" | "finished" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-startDate">Start Date</Label>
              <Input
                id="banner-startDate"
                type="datetime-local"
                value={formState.startDate}
                onChange={(e) => setFormState((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-endDate">End Date</Label>
              <Input
                id="banner-endDate"
                type="datetime-local"
                value={formState.endDate}
                onChange={(e) => setFormState((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formState.title.trim()}>
              Create Banner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}