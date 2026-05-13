import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { sound, soundSection, video } from "~/db/schema";
import { count, eq, like, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { uploadFile, deleteFile, generateKey } from "~/lib/aws.server";
import { createSoundSchema, updateSoundSchema } from "~/lib/validation";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { ImageUpload } from "~/components/image-upload";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Eye, CheckCircle2, XCircle, Pencil, Plus, Play } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const publishFilter = url.searchParams.get("publish") || "";
  const sectionFilter = url.searchParams.get("section") || "";

  const conditions = [];
  if (pagination.search) {
    conditions.push(like(sound.name, `%${pagination.search}%`));
  }
  if (publishFilter === "1") conditions.push(eq(sound.publish, 1));
  if (publishFilter === "0") conditions.push(eq(sound.publish, 0));
  if (sectionFilter) conditions.push(eq(sound.soundSectionId, Number(sectionFilter)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let sortColumn, orderBy;
  if (pagination.sort === "videoCount") {
    sortColumn = sql<number>`(${db.select({ count: count() }).from(video).where(eq(video.soundId, sound.id))})`;
    orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);
  } else if (pagination.sort === "name") {
    sortColumn = sound.name;
    orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);
  } else {
    sortColumn = sound.created;
    orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);
  }

  const [sounds, [{ total }], sections] = await Promise.all([
    db.select({
      id: sound.id,
      name: sound.name,
      description: sound.description,
      duration: sound.duration,
      publish: sound.publish,
      soundSectionId: sound.soundSectionId,
      created: sound.created,
      audio: sound.audio,
      thum: sound.thum,
      videoCount: sql<number>`(${db.select({ count: count() }).from(video).where(eq(video.soundId, sound.id))})`,
      sectionName: soundSection.name,
    })
      .from(sound)
      .leftJoin(soundSection, eq(sound.soundSectionId, soundSection.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(sound).where(whereClause),
    db.select({ id: soundSection.id, name: soundSection.name }).from(soundSection).orderBy(soundSection.name),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    sounds,
    pagination: { ...pagination, total, totalPages },
    filters: { publish: publishFilter, section: sectionFilter },
    sections,
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const data = {
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      soundSectionId: Number(formData.get("soundSectionId") || 0),
    };

    const result = createSoundSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const audioFile = formData.get("audio") as File | null;
    const thumFile = formData.get("thum") as File | null;
    if (!audioFile || audioFile.size === 0) {
      return { errors: { audio: ["Audio file is required"] } };
    }
    if (!thumFile || thumFile.size === 0) {
      return { errors: { thum: ["Thumbnail is required"] } };
    }

    const audioKey = generateKey("sounds/audio", audioFile.name);
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const audioUrl = await uploadFile(audioKey, audioBuffer, audioFile.type);

    const thumKey = generateKey("sounds/thumbnails", thumFile.name);
    const thumBuffer = Buffer.from(await thumFile.arrayBuffer());
    const thumUrl = await uploadFile(thumKey, thumBuffer, thumFile.type);

    const duration = "0:00";

    await db.insert(sound).values({
      audio: audioUrl,
      duration,
      name: result.data.name,
      description: result.data.description || "",
      thum: thumUrl,
      soundSectionId: result.data.soundSectionId,
      uploadedBy: "admin",
      publish: 1,
      created: new Date(),
    });

    await logAudit({
      adminId: session.adminId,
      action: "create_sound",
      entityType: "sound",
      newValues: { ...result.data, audio: audioUrl, thum: thumUrl },
      request,
    });
    return { success: true, intent: "create" };
  }

  if (intent === "update") {
    const soundId = Number(formData.get("soundId"));
    const data = {
      soundId,
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      soundSectionId: Number(formData.get("soundSectionId") || 0),
    };

    const result = updateSoundSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    const [oldSound] = await db
      .select({ audio: sound.audio, thum: sound.thum, name: sound.name, description: sound.description, soundSectionId: sound.soundSectionId })
      .from(sound)
      .where(eq(sound.id, soundId))
      .limit(1);

    const audioFile = formData.get("audio") as File | null;
    const thumFile = formData.get("thum") as File | null;

    let audioUrl: string | undefined;
    let thumUrl: string | undefined;

    if (audioFile && audioFile.size > 0) {
      const audioKey = generateKey("sounds/audio", audioFile.name);
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      audioUrl = await uploadFile(audioKey, audioBuffer, audioFile.type);

      if (oldSound?.audio?.includes("cloudfront.net")) {
        const oldAudioKey = oldSound.audio.split(".cloudfront.net/")[1];
        if (oldAudioKey) {
          await deleteFile(oldAudioKey).catch(() => {});
        }
      }
    }

    if (thumFile && thumFile.size > 0) {
      const thumKey = generateKey("sounds/thumbnails", thumFile.name);
      const thumBuffer = Buffer.from(await thumFile.arrayBuffer());
      thumUrl = await uploadFile(thumKey, thumBuffer, thumFile.type);

      if (oldSound?.thum?.includes("cloudfront.net")) {
        const oldThumKey = oldSound.thum.split(".cloudfront.net/")[1];
        if (oldThumKey) {
          await deleteFile(oldThumKey).catch(() => {});
        }
      }
    }

    const updateValues: Record<string, unknown> = {
      name: result.data.name,
      description: result.data.description || "",
      soundSectionId: result.data.soundSectionId,
    };
    if (audioUrl) updateValues.audio = audioUrl;
    if (thumUrl) updateValues.thum = thumUrl;

    await db.update(sound).set(updateValues).where(eq(sound.id, soundId));

    await logAudit({
      adminId: session.adminId,
      action: "update_sound",
      entityType: "sound",
      entityId: soundId,
      oldValues: { name: oldSound?.name, description: oldSound?.description, soundSectionId: oldSound?.soundSectionId },
      newValues: { ...result.data, ...(audioUrl ? { audio: audioUrl } : {}), ...(thumUrl ? { thum: thumUrl } : {}) },
      request,
    });
    return { success: true, intent: "update" };
  }

  if (intent === "delete") {
    const soundId = Number(formData.get("soundId"));
    const [oldSound] = await db.select({ audio: sound.audio, thum: sound.thum }).from(sound).where(eq(sound.id, soundId)).limit(1);

    await db.update(video).set({ soundId: 0 }).where(eq(video.soundId, soundId));
    await db.delete(sound).where(eq(sound.id, soundId));

    if (oldSound?.audio?.includes("cloudfront.net")) {
      const audioKey = oldSound.audio.split(".cloudfront.net/")[1];
      if (audioKey) {
        await deleteFile(audioKey).catch(() => {});
      }
    }
    if (oldSound?.thum?.includes("cloudfront.net")) {
      const thumKey = oldSound.thum.split(".cloudfront.net/")[1];
      if (thumKey) {
        await deleteFile(thumKey).catch(() => {});
      }
    }

    await logAudit({
      adminId: session.adminId,
      action: "delete_sound",
      entityType: "sound",
      entityId: soundId,
      oldValues: { audio: oldSound?.audio, thum: oldSound?.thum },
      request,
    });
    return { success: true, intent: "delete" };
  }

  if (intent === "publish") {
    const soundId = Number(formData.get("soundId"));
    const publishValue = Number(formData.get("publish"));

    const [oldSound] = await db.select({ publish: sound.publish }).from(sound).where(eq(sound.id, soundId)).limit(1);
    await db.update(sound).set({ publish: publishValue }).where(eq(sound.id, soundId));
    await logAudit({
      adminId: session.adminId,
      action: publishValue === 1 ? "publish_sound" : "unpublish_sound",
      entityType: "sound",
      entityId: soundId,
      oldValues: { publish: oldSound?.publish },
      newValues: { publish: publishValue },
      request,
    });
    return { success: true, intent: "publish", publish: publishValue };
  }

  return { errors: { general: ["Unknown action"] } };
}

type SoundRow = {
  id: number;
  name: string;
  description: string;
  duration: string;
  publish: number;
  soundSectionId: number;
  created: Date;
  audio: string;
  thum: string;
  videoCount: number;
  sectionName: string | null;
};

export default function SoundsListPage() {
  const { sounds, pagination, filters, sections } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    soundId: number;
    publishValue?: number;
  }>({ open: false, title: "", description: "", intent: "", soundId: 0 });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogSoundId, setDialogSoundId] = useState<number>(0);
  const [dialogName, setDialogName] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogSectionId, setDialogSectionId] = useState<string>("0");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [thumFile, setThumFile] = useState<File | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState("");
  const [existingThumUrl, setExistingThumUrl] = useState("");

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogSoundId(0);
    setDialogName("");
    setDialogDescription("");
    setDialogSectionId(sections.length > 0 ? String(sections[0].id) : "0");
    setAudioFile(null);
    setThumFile(null);
    setExistingAudioUrl("");
    setExistingThumUrl("");
    setDialogOpen(true);
  };

  const openEditDialog = (sound: SoundRow) => {
    setDialogMode("edit");
    setDialogSoundId(sound.id);
    setDialogName(sound.name);
    setDialogDescription(sound.description || "");
    setDialogSectionId(String(sound.soundSectionId));
    setAudioFile(null);
    setThumFile(null);
    setExistingAudioUrl(sound.audio);
    setExistingThumUrl(sound.thum);
    setDialogOpen(true);
  };

  const handleDialogSubmit = () => {
    if (!dialogName.trim() || !dialogSectionId || dialogSectionId === "0") return;
    if (dialogMode === "create") {
      const fd = new FormData();
      fd.set("intent", "create");
      fd.set("name", dialogName.trim());
      fd.set("description", dialogDescription.trim());
      fd.set("soundSectionId", dialogSectionId);
      if (audioFile) fd.set("audio", audioFile);
      if (thumFile) fd.set("thum", thumFile);
      fetcher.submit(fd, { method: "post" });
    } else {
      const fd = new FormData();
      fd.set("intent", "update");
      fd.set("soundId", String(dialogSoundId));
      fd.set("name", dialogName.trim());
      fd.set("description", dialogDescription.trim());
      fd.set("soundSectionId", dialogSectionId);
      if (audioFile) fd.set("audio", audioFile);
      if (thumFile) fd.set("thum", thumFile);
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
      prev.delete("publish");
      prev.delete("section");
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
    const { intent, soundId, publishValue } = confirmDialog;
    if (intent === "delete") {
      fetcher.submit({ intent: "delete", soundId: String(soundId) }, { method: "post" });
    } else if (intent === "publish" && publishValue !== undefined) {
      fetcher.submit({ intent: "publish", soundId: String(soundId), publish: String(publishValue) }, { method: "post" });
    }
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<SoundRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "thum",
      header: "Thumbnail",
      cell: ({ row }) =>
        row.original.thum ? (
          <img
            src={row.original.thum}
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
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="line-clamp-2 text-sm">{row.original.description || "—"}</span>
      ),
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.duration || "—"}</span>
      ),
    },
    {
      accessorKey: "sectionName",
      header: "Section",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.sectionName || "—"}</span>
      ),
    },
    {
      accessorKey: "videoCount",
      header: "Videos",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.videoCount.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "publish",
      header: "Publish Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.publish === 1 ? "active" : "blocked"} />
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
            <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDialog({
                open: true,
                title: row.original.publish === 1 ? "Unpublish Sound" : "Publish Sound",
                description: row.original.publish === 1
                  ? "Are you sure you want to unpublish this sound? It will no longer be available to users."
                  : "Are you sure you want to publish this sound? It will become available to users.",
                intent: "publish",
                soundId: row.original.id,
                publishValue: row.original.publish === 1 ? 0 : 1,
              })}
            >
              {row.original.publish === 1 ? (
                <><XCircle className="mr-2 h-4 w-4" /> Unpublish</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" /> Publish</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDialog({
                open: true,
                title: "Delete Sound",
                description: "Are you sure you want to permanently delete this sound? This action cannot be undone. Videos using this sound will lose their sound assignment.",
                intent: "delete",
                soundId: row.original.id,
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
          <h2 className="text-2xl font-bold tracking-tight">Sounds</h2>
          <p className="text-muted-foreground">
            Manage platform sounds. {pagination.total.toLocaleString()} total records.
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" /> Add Sound
        </Button>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by name..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "publish",
            label: "Publish Status",
            options: [
              { value: "all", label: "All Status" },
              { value: "1", label: "Published" },
              { value: "0", label: "Unpublished" },
            ],
          },
          {
            name: "section",
            label: "Section",
            options: [
              { value: "all", label: "All Sections" },
              ...sections.map((s) => ({ value: String(s.id), label: s.name })),
            ],
          },
        ]}
        filterValues={{
          publish: filters.publish || "all",
          section: filters.section || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={sounds}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No sounds found."
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        variant={confirmDialog.intent === "delete" ? "danger" : "default"}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "Add Sound" : "Edit Sound"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Upload a new sound with audio and thumbnail to the platform."
                : "Update the sound details. Leave audio and thumbnail empty to keep the existing ones."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sound-name">Name</Label>
              <Input
                id="sound-name"
                placeholder="Sound name"
                value={dialogName}
                onChange={(e) => setDialogName(e.target.value)}
              />
              {fetcher.data?.errors?.name && (
                <p className="text-sm text-destructive">{fetcher.data.errors.name[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sound-description">Description</Label>
              <Input
                id="sound-description"
                placeholder="Sound description (optional)"
                value={dialogDescription}
                onChange={(e) => setDialogDescription(e.target.value)}
              />
              {fetcher.data?.errors?.description && (
                <p className="text-sm text-destructive">{fetcher.data.errors.description[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sound-section">Section</Label>
              <select
                id="sound-section"
                value={dialogSectionId}
                onChange={(e) => setDialogSectionId(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
              {fetcher.data?.errors?.soundSectionId && (
                <p className="text-sm text-destructive">{fetcher.data.errors.soundSectionId[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Audio File</Label>
              {dialogMode === "edit" && existingAudioUrl && !audioFile && (
                <div className="mb-2">
                  <audio controls src={existingAudioUrl} className="w-full max-w-sm h-8" />
                  <p className="text-xs text-muted-foreground mt-1">Current audio</p>
                </div>
              )}
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs"
              />
              {dialogMode === "create" && (
                <p className="text-xs text-muted-foreground">Required. Supported formats: MP3, WAV, M4A, etc.</p>
              )}
              {dialogMode === "edit" && (
                <p className="text-xs text-muted-foreground">Leave empty to keep existing audio.</p>
              )}
              {fetcher.data?.errors?.audio && (
                <p className="text-sm text-destructive">{fetcher.data.errors.audio[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Thumbnail</Label>
              {dialogMode === "edit" && existingThumUrl && !thumFile && (
                <div className="mb-2">
                  <img src={existingThumUrl} alt="Current thumbnail" className="h-32 w-32 rounded-lg object-cover border" />
                  <p className="text-xs text-muted-foreground mt-1">Current thumbnail</p>
                </div>
              )}
              <ImageUpload
                value={thumFile ? URL.createObjectURL(thumFile) : undefined}
                onChange={(file) => setThumFile(file)}
                accept="image/*"
                maxSize={5 * 1024 * 1024}
              />
              {dialogMode === "create" && (
                <p className="text-xs text-muted-foreground">Required. Recommended: Square image (1:1 ratio).</p>
              )}
              {dialogMode === "edit" && (
                <p className="text-xs text-muted-foreground">Leave empty to keep existing thumbnail.</p>
              )}
              {fetcher.data?.errors?.thum && (
                <p className="text-sm text-destructive">{fetcher.data.errors.thum[0]}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDialogSubmit} disabled={!dialogName.trim() || !dialogSectionId || dialogSectionId === "0" || (dialogMode === "create" && (!audioFile || !thumFile))}>
              {dialogMode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
