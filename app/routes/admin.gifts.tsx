import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher, Form } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { gift } from "~/db/schema";
import { count, eq, like, or, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { createGiftSchema, updateGiftSchema } from "~/lib/validation";
import { uploadFile, generateKey } from "~/lib/aws.server";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { ImageUpload } from "~/components/image-upload";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Star, Trash2, Plus, Edit } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const url = new URL(request.url);
  const editId = url.searchParams.get("edit");
  const pagination = parsePagination(request);

  const conditions = [];
  if (pagination.search) {
    conditions.push(
      or(
        like(gift.title, `%${pagination.search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "title" ? gift.title
    : pagination.sort === "coin" ? gift.coin
    : pagination.sort === "position" ? gift.position
    : gift.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [gifts, [{ total }], giftForEdit] = await Promise.all([
    db.select({
      id: gift.id,
      title: gift.title,
      image: gift.image,
      coin: gift.coin,
      icon: gift.icon,
      position: gift.position,
      featured: gift.featured,
      created: gift.created,
    })
      .from(gift)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(gift).where(whereClause),
    editId ? db.select().from(gift).where(eq(gift.id, Number(editId))).limit(1) : Promise.resolve([null]),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    gifts,
    giftForEdit: giftForEdit[0] || null,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const validation = createGiftSchema.safeParse({
      title: formData.get("title"),
      coin: formData.get("coin"),
      position: formData.get("position") || "",
    });

    if (!validation.success) {
      return { errors: validation.error.flatten().fieldErrors };
    }

    const imageFile = formData.get("image") as File;
    const iconFile = formData.get("icon") as File;
    const soundFile = formData.get("sound") as File | null;

    if (!imageFile || imageFile.size === 0) {
      return { errors: { image: ["Gift image is required"] } };
    }
    if (!iconFile || iconFile.size === 0) {
      return { errors: { icon: ["Gift icon is required"] } };
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const iconBuffer = Buffer.from(await iconFile.arrayBuffer());

    const isGif = imageFile.name.toLowerCase().endsWith(".gif");
    const imageKey = generateKey("images", imageFile.name);
    const iconKey = generateKey("images", iconFile.name);

    const [imageUrl, iconUrl] = await Promise.all([
      uploadFile(imageKey, imageBuffer, imageFile.type),
      uploadFile(iconKey, iconBuffer, iconFile.type),
    ]);

    let soundUrl = "";
    if (soundFile && soundFile.size > 0) {
      const soundBuffer = Buffer.from(await soundFile.arrayBuffer());
      const soundKey = generateKey("audio", soundFile.name);
      soundUrl = await uploadFile(soundKey, soundBuffer, soundFile.type);
    }

    const [insertResult] = await db.insert(gift).values({
      title: validation.data.title,
      coin: validation.data.coin,
      position: validation.data.position,
      image: imageUrl,
      icon: iconUrl,
      featured: 0,
      created: new Date(),
    }).$returningId();

    await logAudit({
      adminId: session.adminId,
      action: "create_gift",
      entityType: "gift",
      entityId: insertResult.id,
      newValues: { title: validation.data.title, coin: validation.data.coin, position: validation.data.position },
      request,
    });

    return { success: true, intent: "create", gift: insertResult };
  }

  if (intent === "update") {
    const validation = updateGiftSchema.safeParse({
      giftId: formData.get("giftId"),
      title: formData.get("title"),
      coin: formData.get("coin"),
      position: formData.get("position"),
      time: formData.get("time") || "",
    });

    if (!validation.success) {
      return { errors: validation.error.flatten().fieldErrors };
    }

    const imageFile = formData.get("image") as File | null;
    const iconFile = formData.get("icon") as File | null;
    const soundFile = formData.get("sound") as File | null;

    const [existingGift] = await db.select().from(gift).where(eq(gift.id, validation.data.giftId)).limit(1);

    if (!existingGift) {
      return { errors: { general: ["Gift not found"] } };
    }

    let imageUrl = existingGift.image;
    let iconUrl = existingGift.icon;
    let soundUrl = existingGift.image?.toLowerCase().endsWith(".gif") ? "" : "";

    if (imageFile && imageFile.size > 0) {
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
      const imageKey = generateKey("images", imageFile.name);
      imageUrl = await uploadFile(imageKey, imageBuffer, imageFile.type);
    }

    if (iconFile && iconFile.size > 0) {
      const iconBuffer = Buffer.from(await iconFile.arrayBuffer());
      const iconKey = generateKey("images", iconFile.name);
      iconUrl = await uploadFile(iconKey, iconBuffer, iconFile.type);
    }

    if (soundFile && soundFile.size > 0) {
      const soundBuffer = Buffer.from(await soundFile.arrayBuffer());
      const soundKey = generateKey("audio", soundFile.name);
      soundUrl = await uploadFile(soundKey, soundBuffer, soundFile.type);
    }

    await db.update(gift).set({
      title: validation.data.title,
      coin: validation.data.coin,
      position: validation.data.position,
      image: imageUrl,
      icon: iconUrl,
    }).where(eq(gift.id, validation.data.giftId));

    await logAudit({
      adminId: session.adminId,
      action: "update_gift",
      entityType: "gift",
      entityId: validation.data.giftId,
      oldValues: { title: existingGift.title, coin: existingGift.coin, position: existingGift.position },
      newValues: { title: validation.data.title, coin: validation.data.coin, position: validation.data.position },
      request,
    });

    return { success: true, intent: "update" };
  }

  if (intent === "load_for_edit") {
    const giftId = Number(formData.get("giftId"));
    const [giftData] = await db.select().from(gift).where(eq(gift.id, giftId)).limit(1);
    if (!giftData) {
      return { errors: { general: ["Gift not found"] } };
    }
    return { success: true, intent: "load_for_edit", gift: giftData };
  }

  if (intent === "toggle_featured") {
    const giftId = Number(formData.get("giftId"));
    const featuredValue = Number(formData.get("featured"));

    const [oldGift] = await db.select({ featured: gift.featured }).from(gift).where(eq(gift.id, giftId)).limit(1);
    await db.update(gift).set({ featured: featuredValue }).where(eq(gift.id, giftId));
    await logAudit({
      adminId: session.adminId,
      action: featuredValue === 1 ? "feature_gift" : "unfeature_gift",
      entityType: "gift",
      entityId: giftId,
      oldValues: { featured: oldGift?.featured },
      newValues: { featured: featuredValue },
      request,
    });
    return { success: true, intent: "toggle_featured", featured: featuredValue };
  }

  if (intent === "delete") {
    const giftId = Number(formData.get("giftId"));
    await db.delete(gift).where(eq(gift.id, giftId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_gift",
      entityType: "gift",
      entityId: giftId,
      request,
    });
    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

type GiftRow = {
  id: number;
  title: string;
  image: string;
  coin: number;
  icon: string;
  position: string;
  featured: number;
  created: Date;
};

type GiftFormData = {
  title: string;
  coin: string;
  position: string;
  time: string;
};

export default function GiftsListPage() {
  const { gifts, giftForEdit, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    giftId: number;
    featuredValue?: number;
  }>({ open: false, title: "", description: "", intent: "", giftId: 0 });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editGiftId, setEditGiftId] = useState<number | null>(null);

  if (giftForEdit && !editGiftId) {
    setEditGiftId(giftForEdit.id);
    setEditDialogOpen(true);
  }

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

  const handleLoadForEdit = (giftId: number) => {
    fetcher.submit({ intent: "load_for_edit", giftId: String(giftId) }, { method: "post" });
  };

  const handleEditClick = (giftId: number) => {
    setEditGiftId(giftId);
    setEditDialogOpen(true);
  };

  const handleConfirm = () => {
    const { intent, giftId, featuredValue } = confirmDialog;
    if (intent === "toggle_featured" && featuredValue !== undefined) {
      fetcher.submit({ intent: "toggle_featured", giftId: String(giftId), featured: String(featuredValue) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete", giftId: String(giftId) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<GiftRow>[] = [
    {
      accessorKey: "image",
      header: "Image",
      cell: ({ row }) => (
        row.original.image ? (
          <img src={row.original.image} alt={row.original.title} className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">N/A</div>
        )
      ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.title}</span>
          <div className="flex items-center gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${row.original.image?.toLowerCase().endsWith(".gif") ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
              {row.original.image?.toLowerCase().endsWith(".gif") ? "GIF" : "Image"}
            </span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "coin",
      header: "Coin Price",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.coin.toLocaleString()} coins</span>
      ),
    },
    {
      accessorKey: "position",
      header: "Position",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.position || "-"}</span>
      ),
    },
    {
      accessorKey: "featured",
      header: "Featured",
      cell: ({ row }) => (
        <StatusBadge status={row.original.featured === 1 ? "active" : "blocked"} />
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
              onClick={() => handleEditClick(row.original.id)}
            >
              <Edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: row.original.featured === 1 ? "Unfeature Gift" : "Feature Gift",
                description: row.original.featured === 1
                  ? `Are you sure you want to remove "${row.original.title}" from featured gifts?`
                  : `Are you sure you want to feature "${row.original.title}"? It will be highlighted to users.`,
                intent: "toggle_featured",
                giftId: row.original.id,
                featuredValue: row.original.featured === 1 ? 0 : 1,
              })}
            >
              {row.original.featured === 1 ? (
                <><Star className="mr-2 h-4 w-4" /> Unfeature</>
              ) : (
                <><Star className="mr-2 h-4 w-4" /> Feature</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Gift",
                description: `Are you sure you want to permanently delete gift "${row.original.title}"? This action cannot be undone.`,
                intent: "delete",
                giftId: row.original.id,
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
          <h2 className="text-2xl font-bold tracking-tight">Gifts</h2>
          <p className="text-muted-foreground">
            Manage virtual gifts. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Gift
        </Button>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by title..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={gifts}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No gifts found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "delete" ? "danger" : "default"}
      />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Gift</DialogTitle>
            <DialogDescription>
              Create a new virtual gift with image, icon, and optional sound.
            </DialogDescription>
          </DialogHeader>
          <GiftForm
            mode="create"
            onSuccess={() => setCreateDialogOpen(false)}
            fetcher={fetcher}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) setEditGiftId(null);
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Gift</DialogTitle>
            <DialogDescription>
              Update gift details and media files.
            </DialogDescription>
          </DialogHeader>
          {editGiftId && (
            <GiftForm
              mode="edit"
              giftId={editGiftId}
              giftData={gifts.find((g) => g.id === editGiftId)}
              onSuccess={() => {
                setEditDialogOpen(false);
                setEditGiftId(null);
              }}
              fetcher={fetcher}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type GiftFormProps = {
  mode: "create" | "edit";
  giftId?: number;
  giftData?: GiftRow | undefined;
  onSuccess: () => void;
  fetcher: ReturnType<typeof useFetcher>;
};

function GiftForm({ mode, giftId, giftData, onSuccess, fetcher }: GiftFormProps) {
  const [formData, setFormData] = useState<GiftFormData>({
    title: giftData?.title || "",
    coin: giftData?.coin?.toString() || "",
    position: giftData?.position || "",
    time: "",
  });

  const errors = (fetcher.data as any)?.errors || {};
  const isLoading = fetcher.state === "submitting";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fetcher.submit(Object.entries(formData).reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}), {
      method: "post",
      encType: "multipart/form-data",
    });
    if ((fetcher.data as any)?.success) {
      onSuccess();
    }
  };

  return (
    <Form method="post" encType="multipart/form-data" onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="intent" value={mode === "create" ? "create" : "update"} />
      {mode === "edit" && <input type="hidden" name="giftId" value={giftId} />}

      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          value={formData.title}
          onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          required
        />
        {errors.title && <p className="text-sm text-destructive">{errors.title[0]}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="coin">Coin Price</Label>
        <Input
          id="coin"
          name="coin"
          type="number"
          min="1"
          value={formData.coin}
          onChange={(e) => setFormData((prev) => ({ ...prev, coin: e.target.value }))}
          required
        />
        {errors.coin && <p className="text-sm text-destructive">{errors.coin[0]}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="position">Position (Display Order)</Label>
        <Input
          id="position"
          name="position"
          value={formData.position}
          onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
        />
        {errors.position && <p className="text-sm text-destructive">{errors.position[0]}</p>}
      </div>

      {mode === "edit" && (
        <div className="grid gap-2">
          <Label htmlFor="time">Animation Duration (ms)</Label>
          <Input
            id="time"
            name="time"
            value={formData.time}
            onChange={(e) => setFormData((prev) => ({ ...prev, time: e.target.value }))}
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="image">Gift Image/Animation</Label>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/*,.gif"
          required={mode === "create"}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {mode === "edit" && giftData?.image && (
          <p className="text-xs text-muted-foreground">Current: {giftData.image}</p>
        )}
        {errors.image && <p className="text-sm text-destructive">{errors.image[0]}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="icon">Icon/Thumbnail</Label>
        <input
          id="icon"
          name="icon"
          type="file"
          accept="image/*"
          required={mode === "create"}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {mode === "edit" && giftData?.icon && (
          <p className="text-xs text-muted-foreground">Current: {giftData.icon}</p>
        )}
        {errors.icon && <p className="text-sm text-destructive">{errors.icon[0]}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="sound">Sound Effect (Optional)</Label>
        <input
          id="sound"
          name="sound"
          type="file"
          accept="audio/*"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">MP3 format recommended</p>
      </div>

      {errors.general && <p className="text-sm text-destructive">{errors.general[0]}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onSuccess} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : mode === "create" ? "Create Gift" : "Update Gift"}
        </Button>
      </DialogFooter>
    </Form>
  );
}