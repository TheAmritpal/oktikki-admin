import { useState } from "react";
import { Link, useLoaderData, useFetcher, useNavigate } from "react-router";
import { redirect } from "react-router";
import { db } from "~/db/index.server";
import { video, user } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ArrowLeft, ShieldOff, ShieldCheck, Trash2, Star, StarOff } from "lucide-react";

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const videoId = Number(params.id);

  const [videoData] = await db.select({
    id: video.id,
    userId: video.userId,
    description: video.description,
    videoUrl: video.video,
    thum: video.thum,
    gif: video.gif,
    view: video.view,
    duration: video.duration,
    soundId: video.soundId,
    privacyType: video.privacyType,
    allowComments: video.allowComments,
    allowDuet: video.allowDuet,
    block: video.block,
    promote: video.promote,
    pin: video.pin,
    viral: video.viral,
    story: video.story,
    country: video.country,
    city: video.city,
    state: video.state,
    share: video.share,
    created: video.created,
  }).from(video).where(eq(video.id, videoId)).limit(1);

  if (!videoData) {
    throw new Response("Video not found", { status: 404 });
  }

  const [ownerData] = await db.select({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    profilePicSmall: user.profilePicSmall,
    active: user.active,
  }).from(user).where(eq(user.id, videoData.userId)).limit(1);

  return {
    session,
    video: videoData,
    owner: ownerData || null,
  };
}

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const videoId = Number(params.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "block") {
    const blockValue = Number(formData.get("block"));

    const [oldVideo] = await db.select({ block: video.block }).from(video).where(eq(video.id, videoId)).limit(1);
    await db.update(video).set({ block: blockValue }).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: blockValue === 1 ? "block_video" : "unblock_video",
      entityType: "video",
      entityId: videoId,
      oldValues: { block: oldVideo?.block },
      newValues: { block: blockValue },
      request,
    });
    return { success: true, intent: "block", block: blockValue };
  }

  if (intent === "delete") {
    await db.delete(video).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: "delete_video",
      entityType: "video",
      entityId: videoId,
      request,
    });
    throw redirect("/admin/videos");
  }

  if (intent === "promote") {
    const promoteValue = Number(formData.get("promote"));

    const [oldVideo] = await db.select({ promote: video.promote }).from(video).where(eq(video.id, videoId)).limit(1);
    await db.update(video).set({ promote: promoteValue }).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: promoteValue === 1 ? "promote_video" : "unpromote_video",
      entityType: "video",
      entityId: videoId,
      oldValues: { promote: oldVideo?.promote },
      newValues: { promote: promoteValue },
      request,
    });
    return { success: true, intent: "promote", promote: promoteValue };
  }

  return { errors: { general: ["Unknown action"] } };
}

export default function VideoDetailPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const videoData = data.video;
  const ownerData = data.owner;

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    blockValue?: number;
    promoteValue?: number;
  }>({ open: false, title: "", description: "", intent: "" });

  const handleConfirm = () => {
    const { intent, blockValue, promoteValue } = confirmState;
    if (intent === "block" && blockValue !== undefined) {
      fetcher.submit({ intent: "block", block: String(blockValue) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete" }, { method: "post" });
    } else if (intent === "promote" && promoteValue !== undefined) {
      fetcher.submit({ intent: "promote", promote: String(promoteValue) }, { method: "post" });
    }
    setConfirmState((prev) => ({ ...prev, open: false }));
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link to="/admin/videos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Videos
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {/* Video player / thumbnail */}
          {videoData.videoUrl ? (
            <video
              src={videoData.videoUrl}
              poster={videoData.thum || undefined}
              controls
              className="h-48 w-auto rounded-lg bg-black object-contain"
            />
          ) : videoData.thum ? (
            <img
              src={videoData.thum}
              alt="Video thumbnail"
              className="h-48 w-auto rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
              No media
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={videoData.block === 1 ? "blocked" : "active"} />
              {videoData.promote === 1 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <Star className="h-3 w-3" /> Promoted
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold mt-2">Video #{videoData.id}</h2>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
              {videoData.description || "No description"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={videoData.block === 1 ? "default" : "outline"}
            size="sm"
            onClick={() => setConfirmState({
              open: true,
              title: videoData.block === 1 ? "Unblock Video" : "Block Video",
              description: videoData.block === 1
                ? "Are you sure you want to unblock this video? It will be visible to users again."
                : "Are you sure you want to block this video? It will be hidden from users.",
              intent: "block",
              blockValue: videoData.block === 1 ? 0 : 1,
            })}
          >
            {videoData.block === 1 ? (
              <><ShieldCheck className="mr-1 h-4 w-4" /> Unblock</>
            ) : (
              <><ShieldOff className="mr-1 h-4 w-4" /> Block</>
            )}
          </Button>
          <Button
            variant={videoData.promote === 1 ? "outline" : "secondary"}
            size="sm"
            onClick={() => setConfirmState({
              open: true,
              title: videoData.promote === 1 ? "Unpromote Video" : "Promote Video",
              description: videoData.promote === 1
                ? "Are you sure you want to remove promotion from this video?"
                : "Are you sure you want to promote this video? It will get more visibility.",
              intent: "promote",
              promoteValue: videoData.promote === 1 ? 0 : 1,
            })}
          >
            {videoData.promote === 1 ? (
              <><StarOff className="mr-1 h-4 w-4" /> Unpromote</>
            ) : (
              <><Star className="mr-1 h-4 w-4" /> Promote</>
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmState({
              open: true,
              title: "Delete Video",
              description: "Are you sure you want to permanently delete this video? This action cannot be undone.",
              intent: "delete",
            })}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Video Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Video ID</p>
              <p className="font-medium">{videoData.id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Views</p>
              <p className="font-medium">{(videoData.view as number).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Duration</p>
              <p className="font-medium">{videoData.duration ? `${Number(videoData.duration).toFixed(1)}s` : "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Privacy</p>
              <p className="font-medium capitalize">{videoData.privacyType || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Allow Comments</p>
              <p className="font-medium capitalize">{videoData.allowComments || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Allow Duet</p>
              <p className="font-medium">{videoData.allowDuet === 1 ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Shares</p>
              <p className="font-medium">{(videoData.share as number).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Viral</p>
              <p className="font-medium">{videoData.viral === 1 ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Story</p>
              <p className="font-medium">{videoData.story === 1 ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pinned</p>
              <p className="font-medium">{videoData.pin === 1 ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="font-medium">{[videoData.city, videoData.state, videoData.country].filter(Boolean).join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">{new Date(videoData.created).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Owner info */}
      {ownerData && (
        <Card>
          <CardHeader>
            <CardTitle>Video Owner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">User</p>
                <Link to={`/admin/users/${ownerData.id}`} className="font-medium text-primary hover:underline">
                  {ownerData.firstName} {ownerData.lastName}
                  {ownerData.username && <span className="text-muted-foreground ml-1">@{ownerData.username}</span>}
                </Link>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <StatusBadge status={ownerData.active === 1 ? "active" : "blocked"} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={handleConfirm}
        variant={confirmState.intent === "delete" ? "danger" : "default"}
      />
    </div>
  );
}