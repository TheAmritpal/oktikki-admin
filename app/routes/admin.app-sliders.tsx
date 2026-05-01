import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { appSlider } from "~/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { uploadFile, deleteFile, generateKey } from "~/lib/aws.server";
import { createAppSliderSchema, updateAppSliderSchema } from "~/lib/validation";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { ImageUpload } from "~/components/image-upload";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

const OLD_IMAGE_BASE = "https://oktikki.com/oktikki_api/";

function resolveImageUrl(imagePath: string): string {
  if (!imagePath) return imagePath;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  return OLD_IMAGE_BASE + imagePath;
}

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

  const resolvedSliders = sliders.map((s) => ({
    ...s,
    image: resolveImageUrl(s.image),
  }));

  return {
    session,
    sliders: resolvedSliders,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const data = {
      url: String(formData.get("url") || ""),
      ecommerce: Number(formData.get("ecommerce") || 0),
    };

    const result = createAppSliderSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const imageFile = formData.get("image") as File | null;
    if (!imageFile || imageFile.size === 0) {
      return { errors: { image: ["Image is required"] } };
    }

    const key = generateKey("app-sliders", imageFile.name);
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const imageUrl = await uploadFile(key, buffer, imageFile.type);

    await db.insert(appSlider).values({
      image: imageUrl,
      url: result.data.url,
      ecommerce: result.data.ecommerce,
    });

    await logAudit({
      adminId: session.adminId,
      action: "create_app_slider",
      entityType: "app_slider",
      newValues: { image: imageUrl, url: result.data.url, ecommerce: result.data.ecommerce },
      request,
    });

    return { success: true, intent: "create" };
  }

  if (intent === "update") {
    const sliderId = Number(formData.get("sliderId"));
    const data = {
      sliderId,
      url: String(formData.get("url") || ""),
      ecommerce: Number(formData.get("ecommerce") || 0),
    };

    const result = updateAppSliderSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldSlider] = await db.select({
      image: appSlider.image,
      url: appSlider.url,
      ecommerce: appSlider.ecommerce,
    }).from(appSlider).where(eq(appSlider.id, sliderId)).limit(1);

    if (!oldSlider) return { errors: { general: ["Slider not found"] } };

    const imageFile = formData.get("image") as File | null;
    let newImageUrl = oldSlider.image;

    if (imageFile && imageFile.size > 0) {
      const key = generateKey("app-sliders", imageFile.name);
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      newImageUrl = await uploadFile(key, buffer, imageFile.type);

      if (oldSlider.image.includes("cloudfront.net")) {
        const oldKey = oldSlider.image.split(".cloudfront.net/")[1];
        if (oldKey) {
          await deleteFile(oldKey).catch(() => {});
        }
      }
    }

    await db.update(appSlider).set({
      image: newImageUrl,
      url: result.data.url,
      ecommerce: result.data.ecommerce,
    }).where(eq(appSlider.id, sliderId));

    await logAudit({
      adminId: session.adminId,
      action: "update_app_slider",
      entityType: "app_slider",
      entityId: sliderId,
      oldValues: { image: oldSlider.image, url: oldSlider.url, ecommerce: oldSlider.ecommerce },
      newValues: { image: newImageUrl, url: result.data.url, ecommerce: result.data.ecommerce },
      request,
    });

    return { success: true, intent: "update" };
  }

  if (intent === "delete") {
    const sliderId = Number(formData.get("sliderId"));

    const [oldSlider] = await db.select({ image: appSlider.image })
      .from(appSlider).where(eq(appSlider.id, sliderId)).limit(1);

    await db.delete(appSlider).where(eq(appSlider.id, sliderId));

    if (oldSlider?.image?.includes("cloudfront.net")) {
      const oldKey = oldSlider.image.split(".cloudfront.net/")[1];
      if (oldKey) {
        await deleteFile(oldKey).catch(() => {});
      }
    }

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogSliderId, setDialogSliderId] = useState(0);
  const [formState, setFormState] = useState({ url: "", ecommerce: "0" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    sliderId: number;
  }>({ open: false, title: "", description: "", intent: "", sliderId: 0 });

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogSliderId(0);
    setFormState({ url: "", ecommerce: "0" });
    setImageFile(null);
    setExistingImageUrl("");
    setDialogOpen(true);
  };

  const openEditDialog = (id: number, url: string, ecommerce: number, imageUrl: string) => {
    setDialogMode("edit");
    setDialogSliderId(id);
    setFormState({ url, ecommerce: String(ecommerce) });
    setImageFile(null);
    setExistingImageUrl(imageUrl);
    setDialogOpen(true);
  };

  const handleDialogSubmit = () => {
    const formData = new FormData();
    if (dialogMode === "create") {
      if (!imageFile) return;
      formData.append("intent", "create");
      formData.append("url", formState.url);
      formData.append("ecommerce", formState.ecommerce);
      formData.append("image", imageFile);
    } else {
      formData.append("intent", "update");
      formData.append("sliderId", String(dialogSliderId));
      formData.append("url", formState.url);
      formData.append("ecommerce", formState.ecommerce);
      if (imageFile) {
        formData.append("image", imageFile);
      }
    }
    fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    setDialogOpen(false);
    setFormState({ url: "", ecommerce: "0" });
    setImageFile(null);
    setExistingImageUrl("");
  };

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
              onClick={() => openEditDialog(row.original.id, row.original.url, row.original.ecommerce, row.original.image)}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">App Sliders</h2>
          <p className="text-muted-foreground">
            Manage app sliders. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" /> Add App Slider
        </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "Add App Slider" : "Edit App Slider"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Create a new app slider with an image."
                : "Update the app slider details. Leave the image empty to keep the existing one."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Image</Label>
              {dialogMode === "edit" && existingImageUrl && !imageFile && (
                <div className="mb-2">
                  <img
                    src={existingImageUrl}
                    alt="Current slider"
                    className="h-32 w-auto rounded-lg object-cover border"
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
                <p className="text-xs text-muted-foreground">Required. Recommended size: 610 x 350px.</p>
              )}
              {dialogMode === "edit" && (
                <p className="text-xs text-muted-foreground">Leave empty to keep existing image.</p>
              )}
              {fetcher.data?.errors?.image && (
                <p className="text-sm text-destructive">{fetcher.data.errors.image[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slider-url">URL</Label>
              <Input
                id="slider-url"
                placeholder="https://example.com"
                value={formState.url}
                onChange={(e) => setFormState((prev) => ({ ...prev, url: e.target.value }))}
              />
              {fetcher.data?.errors?.url && (
                <p className="text-sm text-destructive">{fetcher.data.errors.url[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ecommerce</Label>
              <Select
                value={formState.ecommerce}
                onValueChange={(value) =>
                  setFormState((prev) => ({ ...prev, ecommerce: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select ecommerce flag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No</SelectItem>
                  <SelectItem value="1">Yes</SelectItem>
                </SelectContent>
              </Select>
              {fetcher.data?.errors?.ecommerce && (
                <p className="text-sm text-destructive">{fetcher.data.errors.ecommerce[0]}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleDialogSubmit}
              disabled={dialogMode === "create" ? !formState.url.trim() || !imageFile : !formState.url.trim()}
            >
              {dialogMode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}