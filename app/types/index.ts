export interface SessionData {
  adminId: number;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort: string;
  order: "asc" | "desc";
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}