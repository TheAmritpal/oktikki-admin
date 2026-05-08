import { useState, useCallback, useEffect, useRef } from "react";
import {
  useLoaderData,
  useFetcher,
  useSearchParams,
  Link,
} from "react-router";
import { db } from "~/db/index.server";
import { video, user } from "~/db/schema";
import { eq, like, or, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import {
  Search,
  ArrowRightLeft,
  UserPlus,
  Check,
  ChevronRight,
  AlertCircle,
  Clock,
  Eye,
  Film,
  Loader2,
} from "lucide-react";

// ── Validation ───────────────────────────────────────────────

const reassignSchema = z.object({
  videoId: z.coerce.number().int().positive("Select a video"),
  targetUserId: z.coerce.number().int().positive("Select a target user"),
  intent: z.literal("reassign"),
});

// ── Types ────────────────────────────────────────────────────

type VideoResult = {
  id: number;
  description: string;
  thum: string | null;
  view: number;
  duration: number;
  created: Date;
  userId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  profilePicSmall: string | null;
  verified: number | null;
  role: string | null;
};

type UserResult = {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  profilePicSmall: string | null;
  email: string | null;
  verified: number | null;
  role: string | null;
  active: number | null;
  videoCount: number;
};

// ── Helpers ─────────────────────────────────────────────────

function displayName(
  firstName: string | null,
  lastName: string | null,
  username: string | null
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  if (name) return name;
  if (username) return `@${username}`;
  return "Unknown";
}

function displayOwner(v: VideoResult): string {
  if (v.username) return `@${v.username}`;
  return displayName(v.firstName, v.lastName, null);
}

// ── Loader ──────────────────────────────────────────────────

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const url = new URL(request.url);
  const preSelectedVideoId = url.searchParams.get("videoId");
  const videoSearch = url.searchParams.get("vq") || "";
  const userSearch = url.searchParams.get("uq") || "";

  let videoResults: VideoResult[] = [];
  let selectedVideo: VideoResult | null = null;
  let userResults: UserResult[] = [];

  // Search videos
  if (videoSearch) {
    videoResults = await db
      .select({
        id: video.id,
        description: video.description,
        thum: video.thum,
        view: video.view,
        duration: video.duration,
        created: video.created,
        userId: video.userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicSmall: user.profilePicSmall,
        verified: user.verified,
        role: user.role,
      })
      .from(video)
      .leftJoin(user, eq(video.userId, user.id))
      .where(
        or(
          like(video.description, `%${videoSearch}%`),
          like(user.username, `%${videoSearch}%`),
          like(user.firstName, `%${videoSearch}%`),
          like(user.lastName, `%${videoSearch}%`)
        )
      )
      .orderBy(desc(video.created))
      .limit(15);
  }

  // If videoId pre-selected or from URL, fetch it
  if (preSelectedVideoId) {
    const [found] = await db
      .select({
        id: video.id,
        description: video.description,
        thum: video.thum,
        view: video.view,
        duration: video.duration,
        created: video.created,
        userId: video.userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicSmall: user.profilePicSmall,
        verified: user.verified,
        role: user.role,
      })
      .from(video)
      .leftJoin(user, eq(video.userId, user.id))
      .where(eq(video.id, Number(preSelectedVideoId)))
      .limit(1);

    if (found) selectedVideo = found;
  }

  // Search users (for target selection)
  if (userSearch) {
    const raw = await db
      .select({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicSmall: user.profilePicSmall,
        email: user.email,
        verified: user.verified,
        role: user.role,
        active: user.active,
      })
      .from(user)
      .where(
        or(
          like(user.username, `%${userSearch}%`),
          like(user.firstName, `%${userSearch}%`),
          like(user.lastName, `%${userSearch}%`),
          like(user.email, `%${userSearch}%`)
        )
      )
      .orderBy(desc(user.created))
      .limit(20);

    userResults = raw.map((u) => ({ ...u, videoCount: 0 }));
  }

  return {
    session,
    videoResults,
    selectedVideo,
    userResults,
    searches: { videoSearch, userSearch },
  };
}

// ── Action ──────────────────────────────────────────────────

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();

  const parsed = reassignSchema.safeParse({
    videoId: formData.get("videoId"),
    targetUserId: formData.get("targetUserId"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) {
    return {
      errors: Object.fromEntries(
        parsed.error.issues.map((e) => [e.path.join("."), e.message])
      ),
    };
  }

  const { videoId, targetUserId } = parsed.data;

  // Fetch old video owner
  const [oldVideo] = await db
    .select({ userId: video.userId, description: video.description })
    .from(video)
    .where(eq(video.id, videoId))
    .limit(1);

  if (!oldVideo) {
    return { errors: { general: "Video not found" } };
  }

  if (oldVideo.userId === targetUserId) {
    return {
      errors: { general: "Video is already owned by the target user" },
    };
  }

  // Fetch target user to confirm existence
  const [targetUser] = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(eq(user.id, targetUserId))
    .limit(1);

  if (!targetUser) {
    return { errors: { general: "Target user not found" } };
  }

  // Fetch old owner info for audit
  const [oldOwner] = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(eq(user.id, oldVideo.userId))
    .limit(1);

  // Perform the reassignment
  await db
    .update(video)
    .set({ userId: targetUserId })
    .where(eq(video.id, videoId));

  // Audit log
  await logAudit({
    adminId: session.adminId,
    action: "reassign_video",
    entityType: "video",
    entityId: videoId,
    oldValues: {
      userId: oldVideo.userId,
      previousOwner: oldOwner?.username || `User#${oldVideo.userId}`,
    },
    newValues: {
      userId: targetUserId,
      newOwner: targetUser.username || `User#${targetUserId}`,
    },
    request,
  });

  return {
    success: true,
    data: {
      videoId,
      previousOwnerId: oldVideo.userId,
      previousOwnerName: oldOwner?.username || `User#${oldVideo.userId}`,
      newOwnerId: targetUserId,
      newOwnerName: targetUser.username || `User#${targetUserId}`,
    },
  };
}

// ── Page Component ──────────────────────────────────────────

export default function VideoReassignmentPage() {
  const { videoResults, selectedVideo, userResults, searches } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [, setSearchParams] = useSearchParams();

  // Local state
  const [selectedVideoState, setSelectedVideoState] =
    useState<VideoResult | null>(selectedVideo);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [videoSearchText, setVideoSearchText] = useState(
    searches.videoSearch || ""
  );
  const [userSearchText, setUserSearchText] = useState(
    searches.userSearch || ""
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Debounce refs
  const videoDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const userDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync success from action
  useEffect(() => {
    if (fetcher.data?.success) {
      const d = fetcher.data.data;
      setSuccessMessage(
        `Video #${d.videoId} reassigned from @${d.previousOwnerName} to @${d.newOwnerName}`
      );
      setSelectedVideoState(null);
      setSelectedUser(null);
      setSearchParams({});
      setTimeout(() => setSuccessMessage(null), 6000);
    }
  }, [fetcher.data, setSearchParams]);

  // Debounced video search
  const handleVideoSearch = useCallback(
    (value: string) => {
      setVideoSearchText(value);
      if (videoDebounce.current) clearTimeout(videoDebounce.current);
      videoDebounce.current = setTimeout(() => {
        setSearchParams((prev) => {
          if (value) prev.set("vq", value);
          else prev.delete("vq");
          prev.delete("uq");
          prev.delete("videoId");
          return prev;
        });
        setSelectedVideoState(null);
      }, 350);
    },
    [setSearchParams]
  );

  // Debounced user search
  const handleUserSearch = useCallback(
    (value: string) => {
      setUserSearchText(value);
      if (userDebounce.current) clearTimeout(userDebounce.current);
      userDebounce.current = setTimeout(() => {
        setSearchParams((prev) => {
          if (value) prev.set("uq", value);
          else prev.delete("uq");
          prev.delete("vq");
          return prev;
        });
        setSelectedUser(null);
      }, 350);
    },
    [setSearchParams]
  );

  const errors = fetcher.data?.errors || {};

  // ── Handlers ──────────────────────────────────────────

  const selectVideo = (v: VideoResult) => {
    setSelectedVideoState(v);
    setVideoSearchText("");
    setSearchParams((prev) => {
      prev.set("videoId", String(v.id));
      prev.delete("vq");
      return prev;
    });
  };

  const deselectVideo = () => {
    setSelectedVideoState(null);
    setSelectedUser(null);
    setVideoSearchText("");
    setSearchParams({});
  };

  const selectUser = (u: UserResult) => {
    setSelectedUser(u);
    setUserSearchText("");
    setSearchParams((prev) => {
      prev.delete("uq");
      return prev;
    });
  };

  const handleReassign = () => {
    if (!selectedVideoState || !selectedUser) return;
    fetcher.submit(
      {
        intent: "reassign",
        videoId: String(selectedVideoState.id),
        targetUserId: String(selectedUser.id),
      },
      { method: "post" }
    );
    setConfirmOpen(false);
  };

  const isSubmitting = fetcher.state === "submitting";

  // ── Error accessor ────────────────────────────────────
  const generalError: string | undefined = errors.general as string | undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Video Reassignment
        </h2>
        <p className="text-muted-foreground">
          Change video ownership — reassign a video from one user to another.
        </p>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          <Check className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* General error */}
      {generalError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {generalError}
        </div>
      )}

      {/* ── Step 1: Select Video ───────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Film className="h-5 w-5" />
            Step 1 — Select Video
            {selectedVideoState && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                <Check className="h-3 w-3" /> Selected
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedVideoState ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search videos by description or owner username..."
                  value={videoSearchText}
                  onChange={(e) => handleVideoSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {videoResults.length > 0 && (
                <div className="divide-y rounded-lg border">
                  {videoResults.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => selectVideo(v)}
                      className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      {v.thum ? (
                        <img
                          src={v.thum}
                          alt=""
                          className="h-16 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-10 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                          N/A
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium">
                          {v.description || `Video #${v.id}`}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Number(v.duration).toFixed(1)}s
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {v.view.toLocaleString()}
                          </span>
                          <span>
                            Owner:{" "}
                            <span className="font-medium text-foreground">
                              {displayOwner(v)}
                            </span>
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {videoSearchText &&
                searches.videoSearch &&
                videoResults.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No videos found for &ldquo;{searches.videoSearch}&rdquo;
                  </p>
                )}

              {!videoSearchText && videoResults.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Search for a video by description or owner username to get
                  started.
                </p>
              )}
            </>
          ) : (
            /* Selected video info */
            <div>
              <div className="flex items-start gap-4">
                {selectedVideoState.thum ? (
                  <img
                    src={selectedVideoState.thum}
                    alt=""
                    className="h-24 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    N/A
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    Video #{selectedVideoState.id}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {selectedVideoState.description || "No description"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {Number(selectedVideoState.duration).toFixed(1)}s
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {selectedVideoState.view.toLocaleString()} views
                    </span>
                    <span>
                      Created:{" "}
                      {new Date(
                        selectedVideoState.created
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Current owner */}
                  <div className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                    {selectedVideoState.profilePicSmall ? (
                      <img
                        src={selectedVideoState.profilePicSmall}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs">
                        ?
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Current Owner
                      </p>
                      <Link
                        to={`/admin/users/${selectedVideoState.userId}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {displayName(
                          selectedVideoState.firstName,
                          selectedVideoState.lastName,
                          selectedVideoState.username
                        )}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <StatusBadge
                          status={
                            selectedVideoState.verified === 1
                              ? "verified"
                              : "unverified"
                          }
                        />
                        <span className="capitalize">
                          {selectedVideoState.role ?? "user"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectVideo}
                    className="mt-2"
                  >
                    &larr; Choose a different video
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Select Target User ─────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5" />
            Step 2 — Select Target User
            {selectedUser && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                <Check className="h-3 w-3" /> Selected
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedVideoState ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              First select a video above to proceed.
            </p>
          ) : !selectedUser ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search users by name, username, or email..."
                  value={userSearchText}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {userResults.length > 0 && (
                <div className="divide-y rounded-lg border">
                  {userResults
                    .filter((u) => u.id !== selectedVideoState.userId)
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => selectUser(u)}
                        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        {u.profilePicSmall ? (
                          <img
                            src={u.profilePicSmall}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                            ?
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {displayName(
                              u.firstName,
                              u.lastName,
                              u.username
                            )}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {u.email && <span>{u.email}</span>}
                            <StatusBadge
                              status={
                                u.active === 1 ? "active" : "blocked"
                              }
                            />
                            <span className="capitalize">{u.role ?? "user"}</span>
                            {u.verified === 1 && (
                              <span className="text-blue-500">
                                &check; Verified
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  {userResults.filter(
                    (u) => u.id !== selectedVideoState.userId
                  ).length === 0 &&
                    userResults.filter(
                      (u) => u.id === selectedVideoState.userId
                    ).length > 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No other users found. Try a different search.
                      </p>
                    )}
                </div>
              )}

              {userSearchText &&
                searches.userSearch &&
                userResults.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No users found for &ldquo;{searches.userSearch}&rdquo;
                  </p>
                )}

              {!userSearchText && userResults.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Search for a user by name, username, or email to select the
                  new owner.
                </p>
              )}
            </>
          ) : (
            /* Selected user info */
            <div>
              <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
                {selectedUser.profilePicSmall ? (
                  <img
                    src={selectedUser.profilePicSmall}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm">
                    ?
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">
                    New Owner (Target User)
                  </p>
                  <Link
                    to={`/admin/users/${selectedUser.id}`}
                    className="text-base font-semibold text-primary hover:underline"
                  >
                    {displayName(
                      selectedUser.firstName,
                      selectedUser.lastName,
                      selectedUser.username
                    )}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge
                      status={
                        selectedUser.active === 1 ? "active" : "blocked"
                      }
                    />
                    <span className="capitalize">
                      {selectedUser.role ?? "user"}
                    </span>
                    {selectedUser.email && (
                      <span>{selectedUser.email}</span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUser(null)}
                className="mt-2"
              >
                &larr; Choose a different user
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 3: Confirm & Reassign ─────────────────── */}
      {selectedVideoState && selectedUser && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowRightLeft className="h-5 w-5" />
              Step 3 — Confirm Reassignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center justify-center gap-4 rounded-lg bg-muted/50 p-4 text-sm">
              {/* From */}
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground">From</span>
                <span className="font-semibold">
                  {displayOwner(selectedVideoState)}
                </span>
                <span className="text-xs text-muted-foreground">
                  User #{selectedVideoState.userId}
                </span>
              </div>

              <ArrowRightLeft className="h-5 w-5 text-primary" />

              {/* To */}
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground">To</span>
                <span className="font-semibold">
                  {selectedUser.username
                    ? `@${selectedUser.username}`
                    : displayName(
                        selectedUser.firstName,
                        selectedUser.lastName,
                        null
                      )}
                </span>
                <span className="text-xs text-muted-foreground">
                  User #{selectedUser.id}
                </span>
              </div>
            </div>

            <p className="mb-4 text-center text-sm text-muted-foreground">
              This will permanently change the owner of Video #
              {selectedVideoState.id}. The video&apos;s views, likes,
              comments, and other data will remain intact.
            </p>

            <div className="text-center">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={isSubmitting}
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reassigning...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Reassign Video #{selectedVideoState.id}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Confirm Dialog ─────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Video Reassignment"
        description={
          selectedVideoState && selectedUser
            ? `Are you sure you want to reassign Video #${
                selectedVideoState.id
              } from ${displayOwner(selectedVideoState)} to ${displayName(
                selectedUser.firstName,
                selectedUser.lastName,
                selectedUser.username
              )}? This action will be logged for audit purposes.`
            : "Confirm the reassignment."
        }
        onConfirm={handleReassign}
        variant="default"
        confirmLabel="Reassign Video"
        cancelLabel="Cancel"
      />
    </div>
  );
}
