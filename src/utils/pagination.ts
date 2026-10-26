export interface Pagination {
  page: number;
  perPage: number;
  skip: number;
  limit: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

const MAX_PER_PAGE = 100;

/** Read `page` / `perPage` from a query string. */
export function parsePagination(query: { page?: unknown; perPage?: unknown }): Pagination {
  const rawPage = Number.parseInt(String(query.page ?? '1'), 10);
  const rawPerPage = Number.parseInt(String(query.perPage ?? '20'), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const perPage = Number.isFinite(rawPerPage) && rawPerPage > 0 ? Math.min(rawPerPage, MAX_PER_PAGE) : 20;

  return { page, perPage, skip: (page - 1) * perPage, limit: perPage };
}

/** The `meta` block of a paginated answer. */
export function pageMeta(total: number, pagination: Pagination): PaginationMeta {
  return {
    total,
    page: pagination.page,
    perPage: pagination.perPage,
    pages: Math.max(1, Math.ceil(total / pagination.perPage)),
  };
}
