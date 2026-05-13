import { Link, useLoaderData, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { purchaseCoin, user } from "~/db/schema";
import { count, eq, like, or, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { parsePagination, getOffset, getTotalPages } from "~/lib/pagination";
import { DataTable } from "~/components/data-table";
import { SearchFilterBar } from "~/components/search-filter-bar";
import { StatusBadge } from "~/components/status-badge";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { AlertCircle } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const pagination = parsePagination(request);
  const url = new URL(request.url);

  const deviceFilter = url.searchParams.get("device") || "";
  const suspiciousFilter = url.searchParams.get("suspicious") || "";

  const conditions = [];
  if (pagination.search) {
    const s = `%${pagination.search}%`;
    conditions.push(
      or(
        like(user.username, s),
        like(purchaseCoin.title, s),
        like(purchaseCoin.transactionId, s)
      )!
    );
  }
  if (deviceFilter && deviceFilter !== "all") {
    conditions.push(eq(purchaseCoin.device, deviceFilter));
  }
  if (suspiciousFilter === "true") {
    conditions.push(
      or(
        eq(purchaseCoin.transactionId, ""),
        eq(purchaseCoin.price, 0)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = pagination.sort === "coin" ? purchaseCoin.coin
    : pagination.sort === "price" ? purchaseCoin.price
    : pagination.sort === "title" ? purchaseCoin.title
    : purchaseCoin.created;
  const orderBy = pagination.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [recharges, [{ total }]] = await Promise.all([
    db.select({
      id: purchaseCoin.id,
      userId: purchaseCoin.userId,
      title: purchaseCoin.title,
      coin: purchaseCoin.coin,
      price: purchaseCoin.price,
      transactionId: purchaseCoin.transactionId,
      device: purchaseCoin.device,
      created: purchaseCoin.created,
      username: user.username,
      profilePicSmall: user.profilePicSmall,
    })
      .from(purchaseCoin)
      .leftJoin(user, eq(purchaseCoin.userId, user.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(getOffset(pagination.page, pagination.limit)),
    db.select({ total: count() }).from(purchaseCoin)
      .leftJoin(user, eq(purchaseCoin.userId, user.id))
      .where(whereClause),
  ]);

  const totalPages = getTotalPages(total, pagination.limit);

  return {
    session,
    recharges,
    pagination: { ...pagination, total, totalPages },
    filters: { device: deviceFilter, suspicious: suspiciousFilter },
  };
}

type RechargeRow = {
  id: number;
  userId: number;
  title: string;
  coin: number;
  price: number;
  transactionId: string;
  device: string;
  created: Date;
  username: string | null;
  profilePicSmall: string | null;
};

function isSuspicious(recharge: RechargeRow): boolean {
  return recharge.transactionId === "" || recharge.price <= 0;
}

export default function RechargesPage() {
  const { recharges, pagination, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

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
      prev.delete("device");
      prev.delete("suspicious");
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

  const columns: ColumnDef<RechargeRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="text-sm font-medium">#{row.original.id}</span>
      ),
    },
    {
      accessorKey: "userId",
      header: "User",
      cell: ({ row }) => (
        row.original.username ? (
          <Link to={`/admin/users/${row.original.userId}`} className="flex items-center gap-2 hover:underline">
            <UserAvatar
              src={row.original.profilePicSmall}
              name={row.original.username}
              size="sm"
            />
            <span className="text-sm font-medium">@{row.original.username}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">User #{row.original.userId}</span>
        )
      ),
    },
    {
      accessorKey: "title",
      header: "Package",
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "coin",
      header: "Coins",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.coin.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">${Number(row.original.price).toFixed(2)}</span>
          {row.original.price <= 0 && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      ),
    },
    {
      accessorKey: "transactionId",
      header: "Transaction ID",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono max-w-[150px] truncate">{row.original.transactionId || "—"}</span>
          {!row.original.transactionId && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      ),
    },
    {
      accessorKey: "device",
      header: "Device",
      cell: ({ row }) => (
        <StatusBadge status={row.original.device} />
      ),
    },
    {
      accessorKey: "created",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created).toLocaleString()}
        </span>
      ),
    },
    {
      id: "suspicious",
      header: "Suspicious",
      cell: ({ row }) => (
        isSuspicious(row.original) ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
            <AlertCircle className="h-3 w-3 mr-1" /> Yes
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No</span>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Recharge History</h2>
        <p className="text-muted-foreground">
          View all coin purchases and suspicious activity. {pagination.total.toLocaleString()} total records.
        </p>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by username, package, or transaction ID..."
        searchValue={pagination.search || ""}
        onSearchChange={handleSearch}
        filters={[
          {
            name: "device",
            label: "Device",
            options: [
              { value: "all", label: "All Devices" },
              { value: "ios", label: "iOS" },
              { value: "android", label: "Android" },
            ],
          },
          {
            name: "suspicious",
            label: "Flag",
            options: [
              { value: "all", label: "All" },
              { value: "true", label: "Suspicious Only" },
            ],
          },
        ]}
        filterValues={{
          device: filters.device || "all",
          suspicious: filters.suspicious || "all",
        }}
        onFilterChange={handleFilterChange}
        onClear={handleClear}
      />

      <DataTable
        columns={columns}
        data={recharges}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
        emptyMessage="No recharge records found."
      />
    </div>
  );
}
