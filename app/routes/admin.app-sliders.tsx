import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { appSlider } from "~/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const orderBy = desc(appSlider.id);

  const [sliders, [{ total }]] = await Promise.all([
    db.select({
      id: appSlider.id,
      image: appSlider.image,
      url: appSlider.url,
      ecommerce: appSlider.ecommerce,
    })
      .from(appSlider)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(appSlider),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    sliders,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "delete") {
    const sliderId = Number(formData.get("sliderId"));
    await db.delete(appSlider).where(eq(appSlider.id, sliderId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_app_slider",
      entityType: "app_slider",
      entityId: sliderId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type SliderRow = {
  id: number;
  image: string;
  url: string;
  ecommerce: number;
};

export default function AppSlidersListPage() {
  const { sliders, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    sliderId: number;
  }>({ open: false, title: "", description: "", intent: "", sliderId: 0 });

  const handlePageChange = (page: number) => {
    setSearchParams((prev) => {
      prev.set("page", String(page));
      return prev;
    });
  };

  const handleConfirm = () => {
    const { intent, sliderId } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", sliderId: String(sliderId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<SliderRow>[] = [
    {
      accessorKey: "image",
      header: "Image",
      cell: ({ row }) => (
        row.original.image ? (
          <img src={row.original.image} alt="" className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">N/A</div>
        )
      ),
    },
    {
      accessorKey: "url",
      header: "URL",
      cell: ({ row }) => (
        <span className="text-sm max-w-[200px] truncate block" title={row.original.url}>
          {row.original.url}
        </span>
      ),
    },
    {
      accessorKey: "ecommerce",
      header: "Ecommerce",
      cell: ({ row }) => (
        <StatusBadge status={row.original.ecommerce === 1 ? "active" : "inactive"} />
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
                title: "Delete App Slider",
                description: "Are you sure you want to permanently delete this app slider? This action cannot be undone.",
                intent: "delete",
                sliderId: row.original.id,
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
        <h2 className="text-2xl font-bold tracking-tight">App Sliders</h2>
        <p className="text-muted-foreground">
          Manage app sliders. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={sliders}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No app sliders found."
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