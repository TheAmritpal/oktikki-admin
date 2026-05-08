import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { sticker } from "~/db/schema";
import { count, eq, like, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { uploadFile, deleteFile, generateKey } from "~/lib/aws.server";
import { createStickerSchema, updateStickerSchema } from "~/lib/validation";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { ImageUpload } from "~/components/image-upload";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [];
  if (pagination.search) {
    conditions.push(like(sticker.title, `%${pagination.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn =
    pagination.sort === "usedCount"
      ? sticker.usedCount
      : pagination.sort === "created"
        ? sticker.created
        : sticker.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [stickers, [{ total }]] = await Promise.all([
    db
      .select({
        id: sticker.id,
        image: sticker.image,
        title: sticker.title,
        type: sticker.type,
        usedCount: sticker.usedCount,
        created: sticker.created,
      })
      .from(sticker)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(sticker).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    stickers,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const data = {
      title: String(formData.get("title") || ""),
      type: Number(formData.get("type") || 0),
    };

    const result = createStickerSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const imageFile = formData.get("image") as File | null;
    if (!imageFile || imageFile.size === 0) {
      return { errors: { image: ["Image is required"] } };
    }

    const key = generateKey("stickers", imageFile.name);
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const imageUrl = await uploadFile(key, buffer, imageFile.type);

    await db.insert(sticker).values({
      image: imageUrl,
      title: result.data.title,
      type: result.data.type,
      usedCount: 0,
      created: new Date(),
    });

    await logAudit({
      adminId: session.adminId,
      action: "create_sticker",
      entityType: "sticker",
      newValues: { ...result.data, image: imageUrl },
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "update") {
    const stickerId = Number(formData.get("stickerId"));
    const data = {
      stickerId,
      title: String(formData.get("title") || ""),
      type: Number(formData.get("type") || 0),
    };

    const result = updateStickerSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldSticker] = await db
      .select({ image: sticker.image, title: sticker.title, type: sticker.type })
      .from(sticker)
      .where(eq(sticker.id, stickerId))
      .limit(1);

    const imageFile = formData.get("image") as File | null;
    let imageUrl: string | undefined;

    if (imageFile && imageFile.size > 0) {
      // Upload new image
      const key = generateKey("stickers", imageFile.name);
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      imageUrl = await uploadFile(key, buffer, imageFile.type);

      // Delete old image from S3
      if (oldSticker?.image?.includes("cloudfront.net")) {
        const oldKey = oldSticker.image.split(".cloudfront.net/")[1];
        if (oldKey) {
          await deleteFile(oldKey).catch(() => {});
        }
      }
    }

    const updateValues: Record<string, unknown> = {
      title: result.data.title,
      type: result.data.type,
    };
    if (imageUrl) updateValues.image = imageUrl;

    await db.update(sticker).set(updateValues).where(eq(sticker.id, stickerId));

    await logAudit({
      adminId: session.adminId,
      action: "update_sticker",
      entityType: "sticker",
      entityId: stickerId,
      oldValues: { title: oldSticker?.title, type: oldSticker?.type },
      newValues: { ...result.data, ...(imageUrl ? { image: imageUrl } : {}) },
      request,
    });
    return { success: true, intent: "update" };
  }

  if (intent === "delete") {
    const stickerId = Number(formData.get("stickerId"));

    const [oldSticker] = await db
      .select({ image: sticker.image })
      .from(sticker)
      .where(eq(sticker.id, stickerId))
      .limit(1);

    await db.delete(sticker).where(eq(sticker.id, stickerId));

    // Delete image from S3
    if (oldSticker?.image?.includes("cloudfront.net")) {
      const oldKey = oldSticker.image.split(".cloudfront.net/")[1];
      if (oldKey) {
        await deleteFile(oldKey).catch(() => {});
      }
    }

    await logAudit({
      adminId: session.adminId,
      action: "delete_sticker",
      entityType: "sticker",
      entityId: stickerId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type StickerRow = {
  id: number;
  image: string;
  title: string;
  type: number;
  usedCount: number;
  created: Date;
};

export default function StickersListPage() {
  const { stickers, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    stickerId: number;
  }>({ open: false, title: "", description: "", intent: "", stickerId: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogStickerId, setDialogStickerId] = useState<number>(0);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogType, setDialogType] = useState("0");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogStickerId(0);
    setDialogTitle("");
    setDialogType("0");
    setImageFile(null);
    setExistingImageUrl("");
    setDialogOpen(true);
  };

  const openEditDialog = (sticker: StickerRow) => {
    setDialogMode("edit");
    setDialogStickerId(sticker.id);
    setDialogTitle(sticker.title);
    setDialogType(String(sticker.type));
    setImageFile(null);
    setExistingImageUrl(sticker.image);
    setDialogOpen(true);
  };

  const handleDialogSubmit = () => {
    if (!dialogTitle.trim()) return;
    if (dialogMode === "create") {
      const fd = new FormData();
      fd.set("intent", "create");
      fd.set("title", dialogTitle.trim());
      fd.set("type", dialogType);
      if (imageFile) fd.set("image", imageFile);
      fetcher.submit(fd, { method: "post" });
    } else {
      const fd = new FormData();
      fd.set("intent", "update");
      fd.set("stickerId", String(dialogStickerId));
      fd.set("title", dialogTitle.trim());
      fd.set("type", dialogType);
      if (imageFile) fd.set("image", imageFile);
      fetcher.submit(fd, { method: "post" });
    }
    setDialogOpen(false);
  };

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
    const { intent, stickerId } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit(
        { intent: "delete", stickerId: String(stickerId) },
        { method: "post" },
      );
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<StickerRow>[] = [
    {
      accessorKey: "image",
      header: "Image",
      cell: ({ row }) =>
        row.original.image ? (
          <img
            src={row.original.image}
            alt=""
            className="h-10 w-10 rounded object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
            N/A
          </div>
        ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <StatusBadge status={String(row.original.type)} />,
    },
    {
      accessorKey: "usedCount",
      header: "Used Count",
      cell: ({ row }) => <span>{row.original.usedCount.toLocaleString()}</span>,
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
            <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  title: "Delete Sticker",
                  description: `Are you sure you want to permanently delete the sticker "${row.original.title}"? This action cannot be undone.`,
                  intent: "delete",
                  stickerId: row.original.id,
                })
              }
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
          <h2 className="text-2xl font-bold tracking-tight">Stickers</h2>
          <p className="text-muted-foreground">
            Manage platform stickers. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" /> Add Sticker
        </Button>
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
        data={stickers}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No stickers found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant="danger"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "Add Sticker" : "Edit Sticker"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Create a new sticker for the platform."
                : "Update the sticker details. Leave the image empty to keep the existing one."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Image</Label>
              {dialogMode === "edit" && existingImageUrl && !imageFile && (
                <div className="mb-2">
                  <img
                    src={existingImageUrl}
                    alt="Current sticker"
                    className="h-32 w-32 rounded-lg object-cover border"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Current image</p>
                </div>
              )}
              <ImageUpload
                onChange={(file) => setImageFile(file)}
                accept="image/*"
                maxSize={5 * 1024 * 1024}
              />
              {dialogMode === "create" && (
                <p className="text-xs text-muted-foreground">
                  Required. Recommended a square image (PNG with transparency).
                </p>
              )}
              {dialogMode === "edit" && (
                <p className="text-xs text-muted-foreground">
                  Leave empty to keep existing image.
                </p>
              )}
              {fetcher.data?.errors?.image && (
                <p className="text-sm text-destructive">{fetcher.data.errors.image[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sticker-title">Title</Label>
              <Input
                id="sticker-title"
                placeholder="Sticker title"
                value={dialogTitle}
                onChange={(e) => setDialogTitle(e.target.value)}
              />
              {fetcher.data?.errors?.title && (
                <p className="text-sm text-destructive">{fetcher.data.errors.title[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sticker-type">Type</Label>
              <Input
                id="sticker-type"
                type="number"
                placeholder="Sticker type"
                value={dialogType}
                onChange={(e) => setDialogType(e.target.value)}
              />
              {fetcher.data?.errors?.type && (
                <p className="text-sm text-destructive">{fetcher.data.errors.type[0]}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDialogSubmit} disabled={!dialogTitle.trim()}>
              {dialogMode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
