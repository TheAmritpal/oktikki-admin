import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { room, roomMember, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { StatusBadge } from "~/components/status-badge";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Trash2, MessageSquare } from "lucide-react";
import { Link } from "react-router";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);

  const conditions = [eq(room.delete, 0)];

  if (pagination.search) {
    conditions.push(
      or(
        like(room.title, `%${pagination.search}%`),
        like(user.firstName, `%${pagination.search}%`),
        like(user.lastName, `%${pagination.search}%`)
      )!
    );
  }

  const url = new URL(request.url);
  const privacy = url.searchParams.get("privacy");
  if (privacy === "public") {
    conditions.push(eq(room.privacy, 0));
  } else if (privacy === "private") {
    conditions.push(sql`${room.privacy} > 0`);
  } else if (privacy === "all" || !privacy) {
    // show all
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "title" ? room.title : room.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [rooms, [{ total }]] = await Promise.all([
    db.select({
      id: room.id,
      userId: room.userId,
      title: room.title,
      privacy: room.privacy,
      created: room.created,
      creatorFirstName: user.firstName,
      creatorLastName: user.lastName,
      creatorUsername: user.username,
      creatorProfilePic: user.profilePicSmall,
      memberCount: sql<number>`(SELECT COUNT(*) FROM ${roomMember} WHERE ${roomMember.roomId} = ${room.id})`,
    })
      .from(room)
      .leftJoin(user, eq(room.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(room).leftJoin(user, eq(room.userId, user.id)).where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    rooms,
    pagination: { ...pagination, total, totalPages },
  };
}

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "delete") {
    const roomId = Number(formData.get("roomId"));

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

export default function RoomsListPage() {
  const { rooms, pagination } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    roomId: number;
  }>({ open: false, title: "", description: "", roomId: 0 });

  const currentPrivacy = searchParams.get("privacy") || "all";

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
      prev.delete("privacy");
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

  const handleFilterChange = (name: string, value: string) => {
    setSearchParams((prev) => {
      if (value && value !== "all") prev.set(name, value);
      else prev.delete(name);
      prev.set("page", "1");
      return prev;
    });
  };

  const handleConfirm = () => {
    fetcher.submit(
      { intent: "delete", roomId: String(confirmDialog.roomId) },
      { method: "post" }
    );
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <Link
          to={`/admin/rooms/${row.original.id}`}
          className="font-medium hover:underline flex items-center gap-2"
        >
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: "creatorFirstName",
      header: "Creator",
      cell: ({ row }) => (
        <Link
          to={`/admin/users/${row.original.userId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <UserAvatar
            src={row.original.creatorProfilePic}
            name={`${row.original.creatorFirstName} ${row.original.creatorLastName}`}
            size="sm"
          />
          <span className="truncate max-w-[150px]">
            {row.original.creatorFirstName} {row.original.creatorLastName}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: "memberCount",
      header: "Members",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.memberCount}</span>
      ),
    },
    {
      accessorKey: "privacy",
      header: "Privacy",
      cell: ({ row }) => (
        <StatusBadge status={row.original.privacy === 0 ? "active" : "blocked"} />
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
            <DropdownMenuItem asChild>
              <Link to={`/admin/rooms/${row.original.id}`}>
                <Eye className="mr-2 h-4 w-4" /> View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  title: "Delete Room",
                  description: `Are you sure you want to permanently delete room "${row.original.title}"? All members will be removed.`,
                  roomId: row.original.id,
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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Voice Rooms</h2>
        <p className="text-muted-foreground">
          Manage voice chat rooms. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by room title or creator..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "privacy",
            label: "Privacy",
            options: [
              { value: "all", label: "All" },
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
            ],
          },
        ]}
        filterValues={{ privacy: currentPrivacy }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={rooms}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No voice rooms found."
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
