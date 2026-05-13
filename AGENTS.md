# AGENTS.md

## Commands

```bash
npm run dev          # Dev server (port 5173)
npm run build        # Production build → ./build/
npm run start        # Production server (port 3000)
npm run typecheck    # react-router typegen && tsc
npx drizzle-kit generate   # Generate DB migrations
npx drizzle-kit push       # Push schema to DB
npx shadcn@latest add <c>  # Add shadcn component
```

No `lint`, `format`, or `test` commands exist. No test framework is configured.

**Always run `npm run typecheck` after changes.** This first generates route types into `.react-router/types/` (gitignored but required for tsc), then type-checks.

## Architecture Gotchas

- **React Router v7 SSR** — not Remix v2, not React Router v6. Uses `@react-router/fs-routes` with flat route filenames: `admin.users._index.tsx` → `/admin/users`, `admin.users.$id.tsx` → `/admin/users/:id`.
- **Zod v4** — this project uses Zod 4.x, not v3. API differences exist (e.g. `z.coerce` behavior).
- **`verbatimModuleSyntax: true`** in tsconfig — you **must** use `import type` for type-only imports.
- **`~/*`** maps to `./app/*`. Always use `~/` imports, never relative paths for cross-module references.

## Server-Only Modules

Files with the `.server.ts` suffix are automatically stripped from client bundles by React Router v7. **Always use this suffix for server-only code** (`auth.server.ts`, `aws.server.ts`, `audit.server.ts`, `firebase.server.ts`, `db/index.server.ts`).

## Route Conventions

Every admin route's `loader` must start with `await requireAuth(request)` — no exceptions.

Mutations follow the **intent pattern**: all forms use `<Form method="post">` with a hidden `intent` field (e.g. "block", "delete", "create", "update"). No client-side `fetch()` for mutations — everything goes through the React Router action pipeline.

Action error returns: `{ errors: { fieldName: ["message"] } }`. Success returns: `{ success: true }` or `{ success: true, ...data }`.

Pagination: use `parsePagination(request)` → `{ page, limit, sort, order, search }` with defaults (page=1, limit=20, sort="created", order="desc").

Validation schemas live in `~/lib/validation.ts`. Import from there rather than defining inline Zod schemas.

## Styling

- **Tailwind CSS v4** — no `tailwind.config.js` exists. Theme is defined entirely in `app/app.css` via `@theme { }` directives and CSS custom properties. Uses `@tailwindcss/vite` plugin (not PostCSS).
- Theme colors use **oklch()** notation, not hex or hsl.
- **shadcn/ui** (new-york style, zinc base, CSS variables mode). Primitives in `app/components/ui/`, composites in `app/components/`.

## Database

MySQL (`oktikki_shorts`) via Drizzle ORM, `mode: "default"` (standard MySQL, not PlanetScale). Entire schema is in `app/db/schema.ts` (60+ tables, ~1200 lines). Connection pool: limit 10.

**User role enum values** (MySQL ENUM, also in Zod): `"user"`, `"svip"`, `"svip2"`, `"svip3"`, `"host"`, `"coin_seller"`, `"sub_agency"`, `"agency"`, `"bd"`, `"bd_head"`, `"official"`.

Passwords: hashed with `bcryptjs` (CakePHP Blowfish compat). Admin `password` column is `varchar(500)`.

## File Uploads

`uploadFile(key, buffer, contentType)` returns the **full CloudFront CDN URL** (not just the S3 key). Use `generateKey(prefix, filename)` for unique keys. Delete with `deleteFile(key)`.

## Auth

AES-256-CBC encrypted session stored in `oktikki_admin_session` cookie. Key derived via `crypto.scryptSync(SESSION_SECRET, "salt", 32)` with hardcoded salt `"salt"`. The `SESSION_MAX_AGE` env var from `.env.example` is **not actually used** — hardcoded to 12 hours in `auth.server.ts`.

## Firebase

Push notifications are **stubbed** — `firebase.server.ts` logs to console and returns token count but does not send actual notifications. The Firebase env vars are required but the send logic is TODO.

## Build Output

`./build/client/` (static assets) and `./build/server/index.js` (server bundle). Docker: multi-stage Node 24 Alpine build, production image contains only `package.json`, `node_modules`, and `build/`.