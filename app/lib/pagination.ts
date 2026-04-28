import { paginationSchema } from "./validation";

export function parsePagination(request: Request) {
  const url = new URL(request.url);
  const result = paginationSchema.safeParse({
    page: url.searchParams.get("page") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    sort: url.searchParams.get("sort") || undefined,
    order: url.searchParams.get("order") || undefined,
    search: url.searchParams.get("search") || undefined,
  });

  if (!result.success) {
    return {
      page: 1,
      limit: 20,
      sort: "created",
      order: "desc" as const,
      search: undefined,
    };
  }

  return result.data;
}

export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function getTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

export type PaginationResult = ReturnType<typeof parsePagination>;