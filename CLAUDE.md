# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Oktikki Admin Panel — a full-stack admin dashboard for managing the Oktikki short-video social platform. Built with React Router v7 (SSR mode), MySQL via Drizzle ORM, and AWS S3 for file storage.

## Commands

```bash
npm run dev          # Start dev server (react-router dev)
npm run build        # Production build (react-router build)
npm run start        # Start production server
npm run typecheck    # Type check (react-router typegen && tsc)
```

No test framework is configured.

## Architecture

**Routing:** File-system based via `@react-router/fs-routes` (flatRoutes). Route filenames map directly to URLs: `admin.users.tsx` → `/admin/users`. All admin routes nest under `admin.tsx` which provides the layout shell and auth guard.

**Data Loading:** Every route exports a `loader` (server-side) that:
1. Calls `requireAuth(request)` — redirects to `/login` if unauthenticated
2. Calls `parsePagination(request)` — extracts page/limit/sort/order/search from URL search params
3. Queries MySQL via Drizzle ORM with conditional `where` clauses for filters
4. Returns data + pagination metadata via `useLoaderData`

**Mutations:** Routes export an `action` function that:
1. Authenticates via `requireAuth(request)`
2. Parses `formData` and validates with Zod schemas from `~/lib/validation`
3. Performs DB operations via Drizzle
4. Calls `logAudit()` to record changes in the `audit_log` table
5. Returns success/error objects

**Form submissions:** Use React Router's `<Form method="post">` or `useFetcher().submit()` with an `intent` field to distinguish actions (e.g., "block", "delete", "create", "update"). No client-side fetch calls — all mutations go through the React Router action pipeline.

## Key Files

| Purpose | Path |
|---------|------|
| Root layout + providers | `app/root.tsx` |
| Admin auth guard + layout | `app/routes/admin.tsx` |
| Full DB schema (60+ tables) | `app/db/schema.ts` |
| DB connection pool | `app/db/index.server.ts` |
| Session encrypt/decrypt + auth guards | `app/lib/auth.server.ts` |
| Audit logging | `app/lib/audit.server.ts` |
| S3 upload/delete helpers | `app/lib/aws.server.ts` |
| Zod validation schemas | `app/lib/validation.ts` |
| Pagination parser | `app/lib/pagination.ts` |
| Theme CSS variables | `app/app.css` |

## Auth & RBAC

Custom cookie-based sessions stored as AES-256-CBC encrypted JSON in an `oktikki_admin_session` cookie. `requireAuth()` decrypts the cookie; `requirePermission()` checks RBAC permissions (super_admin bypasses all). Four RBAC tables: `role`, `permission`, `role_permission`, `admin_role`.

## UI & Styling

- Tailwind CSS v4 with `@theme` directives and CSS custom properties for light/dark themes
- shadcn/ui (new-york style, zinc base, CSS variables mode) — 22 component primitives in `app/components/ui/`
- Reusable composites: `DataTable`, `SearchFilterBar`, `ConfirmDialog`, `StatCard`, `StatusBadge`, `UserAvatar`, `ImageUpload`
- Icons from `lucide-react`, toasts via `sonner`

## Database

MySQL database `oktikki_shorts` via Drizzle ORM with mysql2 driver. Schema is defined entirely in `app/db/schema.ts`. Drizzle Kit is available for migrations (`drizzle-kit` in devDependencies, configured in `drizzle.config.ts`).

## Environment Variables

Required (see `.env.example`): `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `SESSION_SECRET`, `SESSION_MAX_AGE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`, `CLOUDFRONT_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `DEEPENGIN_KEY`, `APP_ENV`, `APP_URL`.

## Deployment

Multi-stage Docker build via `Dockerfile` (Node 20 Alpine). Production serves with `react-router-serve`.