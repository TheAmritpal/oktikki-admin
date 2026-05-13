import { useState } from "react";
import { Link, useLoaderData, useFetcher, useNavigate } from "react-router";
import { redirect } from "react-router";
import { db } from "~/db/index.server";
import {
  video,
  user,
  sound,
  hashtagVideo,
  hashtag,
  videoLike,
  videoComment,
  videoCommentLike,
  videoFavourite,
  videoProduct,
  videoWatch,
  repostVideo,
  notInterestedVideo,
  reportVideo,
  promotion,
  giftSend,
  transaction,
  product,
} from "~/db/schema";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  ArrowLeft,
  ShieldOff,
  ShieldCheck,
  Trash2,
  Star,
  StarOff,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Repeat2,
  Eye,
  EyeOff,
  Clock,
  Music,
  Hash,
  MapPin,
  ShoppingBag,
  Gift,
  AlertTriangle,
  DollarSign,
  Users,
  ThumbsUp,
  Pin,
  Flame,
  History,
  Camera,
  ArrowRightLeft,
  TrendingUp,
} from "lucide-react";

// ── Loader ───────────────────────────────────────────────────

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  const session = await requireAuth(request);
  const videoId = Number(params.id);

  // Main video data
  const [videoData] = await db
    .select()
    .from(video)
    .where(eq(video.id, videoId))
    .limit(1);

  if (!videoData) {
    throw new Response("Video not found", { status: 404 });
  }

  // Owner
  const [ownerData] = await db
    .select()
    .from(user)
    .where(eq(user.id, videoData.userId))
    .limit(1);

  // Sound
  const [soundData] = videoData.soundId
    ? await db.select().from(sound).where(eq(sound.id, videoData.soundId)).limit(1)
    : [null];

  // Hashtags
  const hashtagRows = await db
    .select({ id: hashtag.id, name: hashtag.name })
    .from(hashtagVideo)
    .innerJoin(hashtag, eq(hashtagVideo.hashtagId, hashtag.id))
    .where(eq(hashtagVideo.videoId, videoId));

  // Engagement counts
  const [[likeRow], [commentRow], [favouriteRow], [repostRow], [watchRow], [notInterestedRow], [reportRow]] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(videoLike)
        .where(and(eq(videoLike.videoId, videoId), eq(videoLike.like, 1))),
      db
        .select({ count: count() })
        .from(videoComment)
        .where(eq(videoComment.videoId, videoId)),
      db
        .select({ count: count() })
        .from(videoFavourite)
        .where(eq(videoFavourite.videoId, videoId)),
      db
        .select({ count: count() })
        .from(repostVideo)
        .where(eq(repostVideo.videoId, videoId)),
      db
        .select({ count: count() })
        .from(videoWatch)
        .where(eq(videoWatch.videoId, videoId)),
      db
        .select({ count: count() })
        .from(notInterestedVideo)
        .where(eq(notInterestedVideo.videoId, videoId)),
      db
        .select({ count: count() })
        .from(reportVideo)
        .where(eq(reportVideo.videoId, videoId)),
    ]);

  // Recent comments (latest 10)
  const recentComments = await db
    .select({
      id: videoComment.id,
      comment: videoComment.comment,
      pin: videoComment.pin,
      created: videoComment.created,
      userId: videoComment.userId,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    })
    .from(videoComment)
    .leftJoin(user, eq(videoComment.userId, user.id))
    .where(eq(videoComment.videoId, videoId))
    .orderBy(desc(videoComment.created))
    .limit(10);

  // Promotion details
  const promotionData = await db
    .select()
    .from(promotion)
    .where(eq(promotion.videoId, videoId))
    .orderBy(desc(promotion.created))
    .limit(5);

  // Products tagged
  const productRows = await db
    .select({
      id: product.id,
      title: product.title,
      price: product.price,
      brand: product.brand,
    })
    .from(videoProduct)
    .innerJoin(product, eq(videoProduct.productId, product.id))
    .where(eq(videoProduct.videoId, videoId));

  // Gifts received
  const giftRows = await db
    .select({
      id: giftSend.id,
      title: giftSend.title,
      coin: giftSend.coin,
      totalCoins: giftSend.totalCoins,
      created: giftSend.created,
      senderUsername: user.username,
    })
    .from(giftSend)
    .leftJoin(user, eq(giftSend.senderId, user.id))
    .where(eq(giftSend.videoId, videoId))
    .orderBy(desc(giftSend.created))
    .limit(10);

  // Related transactions
  const txRows = await db
    .select()
    .from(transaction)
    .where(eq(transaction.videoId, videoId))
    .orderBy(desc(transaction.createdAt))
    .limit(10);

  // Watchers (recent)
  const watcherRows = await db
    .select({
      id: videoWatch.id,
      duration: videoWatch.duration,
      created: videoWatch.created,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    })
    .from(videoWatch)
    .leftJoin(user, eq(videoWatch.userId, user.id))
    .where(eq(videoWatch.videoId, videoId))
    .orderBy(desc(videoWatch.created))
    .limit(10);

  // Recent likers (latest 10)
  const recentLikers = await db
    .select({
      id: videoLike.id,
      created: videoLike.created,
      userId: videoLike.userId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicSmall: user.profilePicSmall,
    })
    .from(videoLike)
    .leftJoin(user, eq(videoLike.userId, user.id))
    .where(and(eq(videoLike.videoId, videoId), eq(videoLike.like, 1)))
    .orderBy(desc(videoLike.created))
    .limit(10);

  // Recent reposters (latest 10)
  const recentReposters = await db
    .select({
      id: repostVideo.id,
      created: repostVideo.created,
      userId: repostVideo.userId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicSmall: user.profilePicSmall,
    })
    .from(repostVideo)
    .leftJoin(user, eq(repostVideo.userId, user.id))
    .where(eq(repostVideo.videoId, videoId))
    .orderBy(desc(repostVideo.created))
    .limit(10);

  // Report details (latest 10)
  const reportDetails = await db
    .select({
      id: reportVideo.id,
      reportReasonTitle: reportVideo.reportReasonTitle,
      description: reportVideo.description,
      created: reportVideo.created,
      userId: reportVideo.userId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicSmall: user.profilePicSmall,
    })
    .from(reportVideo)
    .leftJoin(user, eq(reportVideo.userId, user.id))
    .where(eq(reportVideo.videoId, videoId))
    .orderBy(desc(reportVideo.created))
    .limit(10);

  // Recent favouriters (latest 10)
  const recentFavouriters = await db
    .select({
      id: videoFavourite.id,
      created: videoFavourite.created,
      userId: videoFavourite.userId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicSmall: user.profilePicSmall,
    })
    .from(videoFavourite)
    .leftJoin(user, eq(videoFavourite.userId, user.id))
    .where(eq(videoFavourite.videoId, videoId))
    .orderBy(desc(videoFavourite.created))
    .limit(10);

  return {
    session,
    video: videoData,
    owner: ownerData || null,
    sound: soundData || null,
    hashtags: hashtagRows,
    engagement: {
      likes: likeRow.count,
      comments: commentRow.count,
      favourites: favouriteRow.count,
      reposts: repostRow.count,
      watches: watchRow.count,
      notInterested: notInterestedRow.count,
      reports: reportRow.count,
    },
    recentComments,
    recentLikers,
    recentReposters,
    reportDetails,
    recentFavouriters,
    promotions: promotionData,
    products: productRows,
    gifts: giftRows,
    transactions: txRows,
    watchers: watcherRows,
  };
}

// ── Action ───────────────────────────────────────────────────

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  const session = await requireAuth(request);
  const videoId = Number(params.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "block") {
    const blockValue = Number(formData.get("block"));
    const [oldVideo] = await db
      .select({ block: video.block })
      .from(video)
      .where(eq(video.id, videoId))
      .limit(1);
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
    // Delete cascade: related records
    await db.delete(videoLike).where(eq(videoLike.videoId, videoId));
    await db.delete(videoCommentLike).where(eq(videoCommentLike.commentId, videoId)); // no direct videoId; handled via comments
    await db.delete(videoFavourite).where(eq(videoFavourite.videoId, videoId));
    await db.delete(videoProduct).where(eq(videoProduct.videoId, videoId));
    await db.delete(videoWatch).where(eq(videoWatch.videoId, videoId));
    await db.delete(repostVideo).where(eq(repostVideo.videoId, videoId));
    await db.delete(notInterestedVideo).where(eq(notInterestedVideo.videoId, videoId));
    await db.delete(reportVideo).where(eq(reportVideo.videoId, videoId));
    await db.delete(hashtagVideo).where(eq(hashtagVideo.videoId, videoId));
    // Delete comments and their likes
    const commentIds = await db
      .select({ id: videoComment.id })
      .from(videoComment)
      .where(eq(videoComment.videoId, videoId));
    for (const c of commentIds) {
      await db.delete(videoCommentLike).where(eq(videoCommentLike.commentId, c.id));
    }
    await db.delete(videoComment).where(eq(videoComment.videoId, videoId));
    // Finally delete the video
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
    const [oldVideo] = await db
      .select({ promote: video.promote })
      .from(video)
      .where(eq(video.id, videoId))
      .limit(1);
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

  if (intent === "boost") {
    const boostAmount = Number(formData.get("boostAmount")) || 100;
    const [oldVideo] = await db
      .select({ viral: video.viral })
      .from(video)
      .where(eq(video.id, videoId))
      .limit(1);
    const newViral = (oldVideo?.viral || 0) + boostAmount;
    await db.update(video).set({ viral: newViral }).where(eq(video.id, videoId));
    await logAudit({
      adminId: session.adminId,
      action: "boost_video",
      entityType: "video",
      entityId: videoId,
      oldValues: { viral: oldVideo?.viral },
      newValues: { viral: newViral },
      request,
    });
    return { success: true, intent: "boost", viral: newViral };
  }

  return { errors: { general: ["Unknown action"] } };
}

// ── Component ────────────────────────────────────────────────

export default function VideoDetailPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const v = data.video;
  const owner = data.owner;

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    intent: string;
    blockValue?: number;
    promoteValue?: number;
    boostAmount?: number;
  }>({ open: false, title: "", description: "", intent: "" });

  const handleConfirm = () => {
    const { intent, blockValue, promoteValue, boostAmount } = confirmState;
    if (intent === "block" && blockValue !== undefined) {
      fetcher.submit({ intent: "block", block: String(blockValue) }, { method: "post" });
    } else if (intent === "delete") {
      fetcher.submit({ intent: "delete" }, { method: "post" });
    } else if (intent === "promote" && promoteValue !== undefined) {
      fetcher.submit(
        { intent: "promote", promote: String(promoteValue) },
        { method: "post" }
      );
    } else if (intent === "boost" && boostAmount !== undefined) {
      fetcher.submit(
        { intent: "boost", boostAmount: String(boostAmount) },
        { method: "post" }
      );
    }
    setConfirmState((prev) => ({ ...prev, open: false }));
  };

  // ── Helpers ─────────────────────────────────────────────

  const StatBadge = ({ icon: Icon, label, value, colorClass = "" }: any) => (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
      <Icon className={`h-4 w-4 ${colorClass}`} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</p>
      </div>
    </div>
  );

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        to="/admin/videos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Videos
      </Link>

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {v.video ? (
            <video
              src={v.video}
              poster={v.thum || undefined}
              controls
              className="h-56 w-auto rounded-lg bg-black object-contain"
              preload="metadata"
            />
          ) : v.gif ? (
            <img
              src={v.gif}
              alt="Video GIF"
              className="h-56 w-auto rounded-lg object-cover"
            />
          ) : v.thum ? (
            <img
              src={v.thum}
              alt="Video thumbnail"
              className="h-56 w-auto rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-56 w-44 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
              No media
            </div>
          )}
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={v.block === 1 ? "blocked" : "active"} />
              {v.promote === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <Star className="h-3 w-3" /> Promoted
                </span>
              )}
              {v.pin === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  <Pin className="h-3 w-3" /> Pinned
                </span>
              )}
              {v.viral === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  <Flame className="h-3 w-3" /> Viral
                </span>
              )}
              {v.story === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  <Camera className="h-3 w-3" /> Story
                </span>
              )}
              {v.nudityFound === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" /> Nudity
                </span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-bold">Video #{v.id}</h2>
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
              {v.description || "No description"}
            </p>

            {/* Quick stats inline */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" /> {v.view.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-rose-500">
                <Heart className="h-3 w-3" /> {data.engagement.likes.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                <MessageCircle className="h-3 w-3" /> {data.engagement.comments.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Share2 className="h-3 w-3" /> {v.share.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={v.block === 1 ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setConfirmState({
                open: true,
                title: v.block === 1 ? "Unblock Video" : "Block Video",
                description:
                  v.block === 1
                    ? "Are you sure you want to unblock this video? It will be visible to users again."
                    : "Are you sure you want to block this video? It will be hidden from users.",
                intent: "block",
                blockValue: v.block === 1 ? 0 : 1,
              })
            }
          >
            {v.block === 1 ? (
              <>
                <ShieldCheck className="mr-1 h-4 w-4" /> Unblock
              </>
            ) : (
              <>
                <ShieldOff className="mr-1 h-4 w-4" /> Block
              </>
            )}
          </Button>
          <Button
            variant={v.promote === 1 ? "outline" : "secondary"}
            size="sm"
            onClick={() =>
              setConfirmState({
                open: true,
                title: v.promote === 1 ? "Unpromote Video" : "Promote Video",
                description:
                  v.promote === 1
                    ? "Are you sure you want to remove promotion from this video?"
                    : "Are you sure you want to promote this video? It will get more visibility.",
                intent: "promote",
                promoteValue: v.promote === 1 ? 0 : 1,
              })
            }
          >
            {v.promote === 1 ? (
              <>
                <StarOff className="mr-1 h-4 w-4" /> Unpromote
              </>
            ) : (
              <>
                <Star className="mr-1 h-4 w-4" /> Promote
              </>
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() =>
              setConfirmState({
                open: true,
                title: "Boost Video",
                description: `Boost this video by adding 100 to its viral score? Current viral score: ${v.viral}. This will increase its visibility in the feed.`,
                intent: "boost",
                boostAmount: 100,
              })
            }
          >
            <TrendingUp className="mr-1 h-4 w-4" /> Boost (+100)
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              setConfirmState({
                open: true,
                title: "Delete Video",
                description:
                  "Are you sure you want to permanently delete this video and all associated data? This action cannot be undone.",
                intent: "delete",
              })
            }
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(`/admin/video-reassignment?videoId=${v.id}`)
            }
          >
            <ArrowRightLeft className="mr-1 h-4 w-4" /> Reassign
          </Button>
        </div>
      </div>

      {/* ── Engagement Stats ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Engagement Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <StatBadge icon={Eye} label="Views" value={v.view} colorClass="text-muted-foreground" />
            <StatBadge icon={Heart} label="Likes" value={data.engagement.likes} colorClass="text-rose-500" />
            <StatBadge icon={MessageCircle} label="Comments" value={data.engagement.comments} colorClass="text-blue-500" />
            <StatBadge icon={Share2} label="Shares" value={v.share} colorClass="text-muted-foreground" />
            <StatBadge icon={Bookmark} label="Favourites" value={data.engagement.favourites} colorClass="text-yellow-500" />
            <StatBadge icon={Repeat2} label="Reposts" value={data.engagement.reposts} colorClass="text-green-500" />
            <StatBadge
              icon={Eye}
              label="Watch Events"
              value={data.engagement.watches}
              colorClass="text-violet-500"
            />
            <StatBadge icon={TrendingUp} label="Viral Score" value={v.viral} colorClass="text-orange-600 dark:text-orange-400" />
          </div>
          {/* Secondary row */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatBadge icon={EyeOff} label="Not Interested" value={data.engagement.notInterested} colorClass="text-gray-500" />
            <StatBadge icon={AlertTriangle} label="Reports" value={data.engagement.reports} colorClass="text-red-500" />
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Duet Source</p>
                <p className="text-sm font-semibold">{v.duetVideoId || "—"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Video Information ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Video Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Field label="Video ID" value={v.id} />
            <Field label="Duration" value={`${Number(v.duration).toFixed(1)}s`} />
            <Field label="Dimensions" value={`${v.width}×${v.height}`} />
            <Field label="Quality Check" value={v.qualityCheck === 1 ? "Passed" : v.qualityCheck === -1 ? "Failed" : "Pending"} />

            <Field label="Privacy" value={<span className="capitalize">{v.privacyType}</span>} />
            <Field label="Allow Comments" value={v.allowComments === "true" ? "Yes" : "No"} />
            <Field label="Allow Duet" value={v.allowDuet === 1 ? "Yes" : "No"} />
            <Field label="Compression" value={v.compression} />

            <Field label="Repost From User" value={v.repostUserId || "—"} />
            <Field label="Repost Video ID" value={v.repostVideoId || "—"} />
            <Field label="Old Video ID" value={v.oldVideoId || "—"} />
            <Field label="Pin Comment ID" value={v.pinCommentId || "—"} />

            <Field label="Has Watermark" value={v.videoWithWatermark ? "Yes" : "No"} />
            <Field label="User Thumbnail" value={v.userThumbnail ? "✓" : "—"} />
            <Field label="Default Thumbnail" value={v.defaultThumbnail ? "✓" : "—"} />
            <Field label="Error State" value={v.error === 1 ? "⚠️ Error" : "OK"} />

            <Field label="Country" value={v.country || "—"} />
            <Field label="State" value={v.state || "—"} />
            <Field label="City" value={v.city || "—"} />
            <Field label="Region" value={v.region || "—"} />

            <Field label="Latitude" value={v.lat || "—"} />
            <Field label="Longitude" value={v.long || "—"} />
            <Field label="Location" value={v.locationString || "—"} />
            <Field label="Country ID" value={v.countryId || "—"} />

            <Field
              label="Created"
              value={new Date(v.created).toLocaleString()}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Sound ─────────────────────────────────────────── */}
      {data.sound && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-4 w-4" /> Sound
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {data.sound.thum && (
                <img
                  src={data.sound.thum}
                  alt={data.sound.name}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Name" value={data.sound.name} />
                <Field label="Duration" value={data.sound.duration || "—"} />
                <Field label="Description" value={data.sound.description || "—"} />
                <Field label="Published" value={data.sound.publish === 1 ? "Yes" : "No"} />
                <Field label="Uploaded By" value={data.sound.uploadedBy || "—"} />
                {data.sound.soundSectionId && (
                  <Field label="Section ID" value={data.sound.soundSectionId} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Hashtags ──────────────────────────────────────── */}
      {data.hashtags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4" /> Hashtags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.hashtags.map((h) => (
                <Link
                  key={h.id}
                  to={`/admin/hashtags`}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-medium hover:bg-muted/80"
                >
                  <Hash className="h-3 w-3" />
                  {h.name}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Owner ─────────────────────────────────────────── */}
      {owner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Video Owner
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {owner.profilePicSmall && (
                <img
                  src={owner.profilePicSmall}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover"
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="User"
                  value={
                    <Link
                      to={`/admin/users/${owner.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {owner.firstName} {owner.lastName}
                      {owner.username && (
                        <span className="ml-1 text-muted-foreground">
                          @{owner.username}
                        </span>
                      )}
                    </Link>
                  }
                />
                <Field label="Status" value={<StatusBadge status={owner.active === 1 ? "active" : "blocked"} />} />
                <Field label="Role" value={owner.role} />
                <Field label="Gender" value={owner.gender || "—"} />
                <Field label="Email" value={owner.email || "—"} />
                <Field label="Phone" value={owner.phone || "—"} />
                <Field label="Country" value={owner.country || "—"} />
                <Field
                  label="Profile Views"
                  value={owner.profileView?.toLocaleString() || "—"}
                />
                <Field label="Business" value={owner.business === 1 ? "Yes" : "No"} />
                <Field label="Verified" value={owner.verified === 1 ? "✓" : "✗"} />
                <Field label="Level" value={`${owner.formattedLevel} (${owner.level})`} />
                <Field
                  label="Total Flems"
                  value={owner.totalFlems?.toLocaleString() || "0"}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Products Tagged ───────────────────────────────── */}
      {data.products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Products Tagged ({data.products.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.products.map((p) => (
                <div key={p.id} className="rounded-lg border p-3">
                  <p className="font-medium line-clamp-1">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.brand && `${p.brand} · `}${p.price}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Promotions ────────────────────────────────────── */}
      {data.promotions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MegaphoneIcon className="h-4 w-4" /> Promotions ({data.promotions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.promotions.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {p.destination || "Promotion"} ({p.active ? "Active" : "Inactive"})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Coins: {p.coin} · Reach: {p.reach?.toLocaleString()} · Clicks:{" "}
                      {p.clicks?.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.startDatetime ? new Date(p.startDatetime).toLocaleDateString() : "—"}{" "}
                    →{" "}
                    {p.endDatetime ? new Date(p.endDatetime).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gifts Received ────────────────────────────────── */}
      {data.gifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-4 w-4" /> Gifts Received ({data.gifts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.gifts.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    <strong>{g.title}</strong>{" "}
                    {g.senderUsername && (
                      <span className="text-muted-foreground">
                        from @{g.senderUsername}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(g.totalCoins ?? 0) > 0 ? `${g.totalCoins} coins` : `${g.coin}c`} ·{" "}
                    {new Date(g.created).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Transactions ──────────────────────────────────── */}
      {data.transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Related Transactions ({data.transactions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{tx.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.transactionType} · {tx.transactionDirection} · {tx.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${
                        tx.transactionDirection === "credit"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {tx.transactionDirection === "credit" ? "+" : "−"}
                      {(tx.amount ?? 0).toLocaleString()} coins
                    </p>
                    {tx.usdValue && (
                      <p className="text-xs text-muted-foreground">
                        ${tx.usdValue}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Comments ───────────────────────────────── */}
      {data.recentComments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Recent Comments ({data.recentComments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.recentComments.map((c) => (
                <div key={c.id} className="flex items-start gap-3 py-3">
                  {c.profilePicSmall ? (
                    <img
                      src={c.profilePicSmall}
                      alt=""
                      className="mt-0.5 h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">
                      ?
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">
                        {c.username ? `@${c.username}` : `User #${c.userId}`}
                      </span>
                      {c.pin === 1 && (
                        <span className="text-[10px] text-blue-500">
                          <Pin className="inline h-2.5 w-2.5" /> Pinned
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.created).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm">{c.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Likers ────────────────────────────────── */}
      {data.recentLikers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-rose-500" /> Who Liked ({data.engagement.likes.toLocaleString()} total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.recentLikers.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2.5">
                  {l.profilePicSmall ? (
                    <img src={l.profilePicSmall} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">?</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/users/${l.userId}`} className="text-sm font-medium text-primary hover:underline">
                      {l.username ? `@${l.username}` : `${l.firstName} ${l.lastName}`}
                    </Link>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.created).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Reposters ─────────────────────────────── */}
      {data.recentReposters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat2 className="h-4 w-4 text-green-500" /> Who Reposted ({data.engagement.reposts.toLocaleString()} total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.recentReposters.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2.5">
                  {r.profilePicSmall ? (
                    <img src={r.profilePicSmall} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">?</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/users/${r.userId}`} className="text-sm font-medium text-primary hover:underline">
                      {r.username ? `@${r.username}` : `${r.firstName} ${r.lastName}`}
                    </Link>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Reports ───────────────────────────────────────── */}
      {data.reportDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Reports ({data.engagement.reports.toLocaleString()} total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.reportDetails.map((r) => (
                <div key={r.id} className="flex items-start gap-3 py-3">
                  {r.profilePicSmall ? (
                    <img src={r.profilePicSmall} alt="" className="mt-0.5 h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">?</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/admin/users/${r.userId}`} className="text-sm font-medium text-primary hover:underline">
                        {r.username ? `@${r.username}` : `${r.firstName} ${r.lastName}`}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-0.5">
                      Reason: {r.reportReasonTitle}
                    </p>
                    {r.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Bookmarks ─────────────────────────────── */}
      {data.recentFavouriters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-yellow-500" /> Who Bookmarked ({data.engagement.favourites.toLocaleString()} total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.recentFavouriters.map((f) => (
                <div key={f.id} className="flex items-center gap-3 py-2.5">
                  {f.profilePicSmall ? (
                    <img src={f.profilePicSmall} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">?</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/users/${f.userId}`} className="text-sm font-medium text-primary hover:underline">
                      {f.username ? `@${f.username}` : `${f.firstName} ${f.lastName}`}
                    </Link>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(f.created).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Watchers ───────────────────────────────── */}
      {data.watchers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Recent Watchers ({data.watchers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.watchers.map((w) => (
                <div key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">
                    {w.username ? `@${w.username}` : "Anonymous"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {w.duration}s · {new Date(w.created).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Confirm Dialog ────────────────────────────────── */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={handleConfirm}
        variant={confirmState.intent === "delete" ? "danger" : "default"}
        confirmLabel={confirmState.intent === "delete" ? "Delete Video" : "Confirm"}
      />
    </div>
  );
}

// ── Missing icon inline ─────────────────────────────────────
function MegaphoneIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
