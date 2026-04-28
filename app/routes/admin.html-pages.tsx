import { Link, useLoaderData } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { db } from "~/db/index.server";
import { htmlPage } from "~/db/schema";
import { desc } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { DataTable } from "~/components/data-table";
import { Button } from "~/components/ui/button";
import { Pencil } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);

  const pages = await db.select({
    id: htmlPage.id,
    name: htmlPage.name,
    created: htmlPage.created,
  })
    .from(htmlPage)
    .orderBy(desc(htmlPage.created));

  return {
    session,
    pages,
  };
}

type HtmlPageRow = {
  id: number;
  name: string;
  created: Date;
};

export default function HtmlPagesListPage() {
  const { pages } = useLoaderData<typeof loader>();

  const columns: ColumnDef<HtmlPageRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "created",
      header: "Last Modified",
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
        <Link to={`/admin/html-pages/${row.original.id}`}>
          <Button variant="outline" size="sm">
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">HTML Pages</h2>
        <p className="text-muted-foreground">
          Manage static HTML pages. {pages.length.toLocaleString()} total pages.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={pages}
        page={1}
        totalPages={1}
        total={pages.length}
        onPageChange={() => {}}
        emptyMessage="No HTML pages found."
      />
    </div>
  );
}