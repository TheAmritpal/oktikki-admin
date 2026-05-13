import { useState } from "react";
import { useLoaderData, useFetcher, useParams, Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { room, roomMember, user, reportRoom } from "~/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { DataTable } from "~/components/data-table";
import { UserAvatar } from "~/components/user-avatar";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { ArrowLeft, Trash2, Shield, ShieldOff, Users, MessageSquare, Flag } from "lucide-react";

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const roomId = Number(params.id);

  const [roomData] = await db
    .select({
      id: room.id,
      userId: room.userId,
      title: room.title,
      privacy: room.privacy,
      created: room.created,
      creatorFirstName: user.firstName,
      creatorLastName: user.lastName,
      creatorUsername: user.username,
      creatorProfilePic: user.profilePicSmall,
    })
    .from(room)
    .leftJoin(user, eq(room.userId, user.id))
    .where(eq(room.id, roomId))
    .limit(1);

  if (!roomData) {
    throw new Response("Room not found", { status: 404 });
  }

  const members = await db
    .select({
      id: roomMember.id,
      userId: roomMember.userId,
      moderator: roomMember.moderator,
      created: roomMember.created,
      memberFirstName: user.firstName,
      memberLastName: user.lastName,
      memberUsername: user.username,
      memberProfilePic: user.profilePicSmall,
    })
    .from(roomMember)
    .leftJoin(user, eq(roomMember.userId, user.id))
    .where(eq(roomMember.roomId, roomId))
    .orderBy(desc(roomMember.moderator), desc(roomMember.created));

  const reports = await db
    .select({
      id: reportRoom.id,
      userId: reportRoom.userId,
      description: reportRoom.description,
      created: reportRoom.created,
      reporterFirstName: user.firstName,
      reporterLastName: user.lastName,
      reporterProfilePic: user.profilePicSmall,
      reasonTitle: reportRoom.reportReasonTitle,
    })
    .from(reportRoom)
    .leftJoin(user, eq(reportRoom.userId, user.id))
    .where(eq(reportRoom.roomId, roomId))
    .orderBy(desc(reportRoom.created));

  const moderatorCount = members.filter((m) => m.moderator > 0).length;
  const listenerCount = members.length - moderatorCount;

  return {
    session,
    room: roomData,
    members,
    reports,
    memberStats: { total: members.length, moderators: moderatorCount, listeners: listenerCount },
  };
}

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const roomId = Number(params.id);

  if (intent === "remove_member") {
    const memberId = Number(formData.get("memberId"));
    await db.delete(roomMember).where(eq(roomMember.id, memberId));

    await logAudit({
      adminId: session.adminId,
      action: "remove_room_member",
      entityType: "room_member",
      entityId: memberId,
      request,
    });

    return { success: true, intent: "remove_member" };
  }

  if (intent === "toggle_moderator") {
    const memberId = Number(formData.get("memberId"));
    const currentModerator = Number(formData.get("currentModerator"));
    const newModeratorValue = currentModerator > 0 ? 0 : 1;

    await db
      .update(roomMember)
      .set({ moderator: newModeratorValue })
      .where(eq(roomMember.id, memberId));

    await logAudit({
      adminId: session.adminId,
      action: newModeratorValue === 1 ? "assign_moderator" : "remove_moderator",
      entityType: "room_member",
      entityId: memberId,
      newValues: { moderator: newModeratorValue },
      request,
    });

    return { success: true, intent: "toggle_moderator" };
  }

  if (intent === "delete") {
    await db.delete(roomMember).where(eq(roomMember.roomId, roomId));
    await db.delete(room).where(eq(room.id, roomId));

    await logAudit({
      adminId: session.adminId,
      action: "delete_room",
      entityType: "room",
      entityId: roomId,
      request,
    });

    return { success: true, intent: "delete" };
  }

  return { errors: { general: ["Unknown action"] } };
}

export default function RoomDetailPage() {
  const { room, members, reports, memberStats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const params = useParams();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ open: false, title: "", description: "", action: () => {} });

  const memberColumns: ColumnDef<any>[] = [
    {
      accessorKey: "memberFirstName",
      header: "Member",
      cell: ({ row }) => (
        <Link
          to={`/admin/users/${row.original.userId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <UserAvatar
            src={row.original.memberProfilePic}
            name={`${row.original.memberFirstName} ${row.original.memberLastName}`}
            size="sm"
          />
          <span className="font-medium">
            {row.original.memberFirstName} {row.original.memberLastName}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: "moderator",
      header: "Role",
      cell: ({ row }) => (
        row.original.moderator > 0 ? (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <Shield className="h-3 w-3 mr-1" /> Moderator
          </Badge>
        ) : (
          <Badge variant="secondary">Listener</Badge>
        )
      ),
    },
    {
      accessorKey: "created",
      header: "Joined",
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
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() =>
              fetcher.submit(
                {
                  intent: "toggle_moderator",
                  memberId: String(row.original.id),
                  currentModerator: String(row.original.moderator),
                },
                { method: "post" }
              )
            }
          >
            {row.original.moderator > 0 ? (
              <><ShieldOff className="mr-1 h-3 w-3" /> Demote</>
            ) : (
              <><Shield className="mr-1 h-3 w-3" /> Promote</>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-destructive"
            onClick={() =>
              setConfirmDialog({
                open: true,
                title: "Remove Member",
                description: `Are you sure you want to remove this member from the room?`,
                action: () =>
                  fetcher.submit(
                    { intent: "remove_member", memberId: String(row.original.id) },
                    { method: "post" }
                  ),
              })
            }
          >
            <Trash2 className="mr-1 h-3 w-3" /> Remove
          </Button>
        </div>
      ),
    },
  ];

  const reportColumns: ColumnDef<any>[] = [
    {
      accessorKey: "reporterFirstName",
      header: "Reported By",
      cell: ({ row }) => (
        <Link
          to={`/admin/users/${row.original.userId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <UserAvatar
            src={row.original.reporterProfilePic}
            name={`${row.original.reporterFirstName} ${row.original.reporterLastName}`}
            size="sm"
          />
          <span className="font-medium">
            {row.original.reporterFirstName} {row.original.reporterLastName}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: "reasonTitle",
      header: "Reason",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.reasonTitle}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground max-w-[300px] truncate block">
          {row.original.description || "—"}
        </span>
      ),
    },
    {
      accessorKey: "created",
      header: "Reported At",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/rooms">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">{room.title}</h2>
          <p className="text-muted-foreground">
            Room #{params.id} created by {room.creatorFirstName} {room.creatorLastName}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() =>
            setConfirmDialog({
              open: true,
              title: "Delete Room",
              description: `Are you sure you want to permanently delete this room and remove all members?`,
              action: () =>
                fetcher.submit(
                  { intent: "delete" },
                  { method: "post" }
                ),
            })
          }
        >
          <Trash2 className="h-4 w-4 mr-1" /> Delete Room
        </Button>
      </div>

      {/* Room Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Creator</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link to={`/admin/users/${room.userId}`} className="flex items-center gap-2">
              <UserAvatar
                src={room.creatorProfilePic}
                name={`${room.creatorFirstName} ${room.creatorLastName}`}
                size="sm"
              />
              <div className="flex flex-col">
                <span className="font-semibold">
                  {room.creatorFirstName} {room.creatorLastName}
                </span>
                {room.creatorUsername && (
                  <span className="text-xs text-muted-foreground">@{room.creatorUsername}</span>
                )}
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Privacy</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatusBadge status={room.privacy === 0 ? "active" : "blocked"} />
            <p className="text-xs text-muted-foreground mt-1">
              {room.privacy === 0 ? "Public room" : "Private room"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{memberStats.total}</p>
            <p className="text-xs text-muted-foreground">
              {memberStats.moderators} moderators, {memberStats.listeners} listeners
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {new Date(room.created).toLocaleDateString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(room.created).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members
            <Badge variant="secondary" className="ml-2">{members.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={memberColumns}
            data={members}
            page={1}
            totalPages={1}
            total={members.length}
            onPageChange={() => {}}
            emptyMessage="No members in this room."
          />
        </CardContent>
      </Card>

      {/* Reports */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Reports
              <Badge variant="secondary" className="ml-2">{reports.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={reportColumns}
              data={reports}
              page={1}
              totalPages={1}
              total={reports.length}
              onPageChange={() => {}}
              emptyMessage="No reports for this room."
            />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.action}
        variant="danger"
      />
    </div>
  );
}
