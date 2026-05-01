# Graph Report - .  (2026-05-01)

## Corpus Check
- Corpus is ~47,012 words - fits in a single context window. You may not need a graph.

## Summary
- 560 nodes · 635 edges · 71 communities detected
- Extraction: 64% EXTRACTED · 36% INFERRED · 0% AMBIGUOUS · INFERRED: 228 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Paginated CRUD Routes|Paginated CRUD Routes]]
- [[_COMMUNITY_Auth-Gated Admin Routes|Auth-Gated Admin Routes]]
- [[_COMMUNITY_Authentication & Sessions|Authentication & Sessions]]
- [[_COMMUNITY_Content & Commerce Schema|Content & Commerce Schema]]
- [[_COMMUNITY_RBAC & Database Core|RBAC & Database Core]]
- [[_COMMUNITY_Admin Route Patterns & Schemas|Admin Route Patterns & Schemas]]
- [[_COMMUNITY_Users & Withdrawals|Users & Withdrawals]]
- [[_COMMUNITY_Pagination Pattern|Pagination Pattern]]
- [[_COMMUNITY_Business Submissions|Business Submissions]]
- [[_COMMUNITY_Settings CRUD|Settings CRUD]]
- [[_COMMUNITY_Banners CRUD|Banners CRUD]]
- [[_COMMUNITY_Orders CRUD|Orders CRUD]]
- [[_COMMUNITY_Documents Management|Documents Management]]
- [[_COMMUNITY_Promotions CRUD|Promotions CRUD]]
- [[_COMMUNITY_Sounds Management|Sounds Management]]
- [[_COMMUNITY_Topics CRUD|Topics CRUD]]
- [[_COMMUNITY_Verification Requests|Verification Requests]]
- [[_COMMUNITY_Videos Listing|Videos Listing]]
- [[_COMMUNITY_Admin Actions & Firebase|Admin Actions & Firebase]]
- [[_COMMUNITY_Header & Theme|Header & Theme]]
- [[_COMMUNITY_Composite UI Dialogs|Composite UI Dialogs]]
- [[_COMMUNITY_Coupons & Stores Schema|Coupons & Stores Schema]]
- [[_COMMUNITY_Firebase Push|Firebase Push]]
- [[_COMMUNITY_Admin Shell Layout|Admin Shell Layout]]
- [[_COMMUNITY_Form Controls|Form Controls]]
- [[_COMMUNITY_Root App Composition|Root App Composition]]
- [[_COMMUNITY_Data Table Components|Data Table Components]]
- [[_COMMUNITY_Status Badge|Status Badge]]
- [[_COMMUNITY_Confirm Dialog|Confirm Dialog]]
- [[_COMMUNITY_React Hook Form|React Hook Form]]
- [[_COMMUNITY_Payments Schema|Payments Schema]]
- [[_COMMUNITY_Geography Schema|Geography Schema]]
- [[_COMMUNITY_Sound Sections Schema|Sound Sections Schema]]
- [[_COMMUNITY_Build Config|Build Config]]
- [[_COMMUNITY_Image Upload & Editor|Image Upload & Editor]]
- [[_COMMUNITY_Route Navigation Labels|Route Navigation Labels]]
- [[_COMMUNITY_Dashboard Widgets|Dashboard Widgets]]
- [[_COMMUNITY_Avatar Integration|Avatar Integration]]
- [[_COMMUNITY_Password Hashing|Password Hashing]]
- [[_COMMUNITY_Session Encryption|Session Encryption]]
- [[_COMMUNITY_Social & Promotions Schema|Social & Promotions Schema]]
- [[_COMMUNITY_Coupon Validation|Coupon Validation]]
- [[_COMMUNITY_Banner Validation|Banner Validation]]
- [[_COMMUNITY_Analytics & Dashboard Loaders|Analytics & Dashboard Loaders]]
- [[_COMMUNITY_Document & Business Actions|Document & Business Actions]]
- [[_COMMUNITY_Gift Validation|Gift Validation]]
- [[_COMMUNITY_RBAC Schema|RBAC Schema]]
- [[_COMMUNITY_Stickers Schema|Stickers Schema]]
- [[_COMMUNITY_React Router Config Entity|React Router Config Entity]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Root Error Boundary|Root Error Boundary]]
- [[_COMMUNITY_Flat Routes|Flat Routes]]
- [[_COMMUNITY_HTML Page Schema|HTML Page Schema]]
- [[_COMMUNITY_Session Cookie Destroy|Session Cookie Destroy]]
- [[_COMMUNITY_AWS Delete File|AWS Delete File]]
- [[_COMMUNITY_AWS Get File URL|AWS Get File URL]]
- [[_COMMUNITY_AWS Generate Key|AWS Generate Key]]
- [[_COMMUNITY_Utils CN Function|Utils CN Function]]
- [[_COMMUNITY_Admin Admins Loader|Admin Admins Loader]]
- [[_COMMUNITY_App Sliders Action|App Sliders Action]]
- [[_COMMUNITY_Categories Action|Categories Action]]
- [[_COMMUNITY_Hashtags Action|Hashtags Action]]
- [[_COMMUNITY_HTML Pages Detail Loader|HTML Pages Detail Loader]]
- [[_COMMUNITY_HTML Pages Detail Action|HTML Pages Detail Action]]
- [[_COMMUNITY_Nudity Detection Action|Nudity Detection Action]]
- [[_COMMUNITY_Orders Action|Orders Action]]
- [[_COMMUNITY_Permissions Loader|Permissions Loader]]
- [[_COMMUNITY_Promotions Action|Promotions Action]]
- [[_COMMUNITY_Push Notification Schema|Push Notification Schema]]
- [[_COMMUNITY_Pagination Params Type|Pagination Params Type]]
- [[_COMMUNITY_Paginated Response Type|Paginated Response Type]]

## God Nodes (most connected - your core abstractions)
1. `requireAuth()` - 67 edges
2. `logAudit()` - 33 edges
3. `parsePagination()` - 24 edges
4. `getOffset()` - 24 edges
5. `getTotalPages()` - 24 edges
6. `parsePagination` - 14 edges
7. `getOffset` - 13 edges
8. `getTotalPages` - 13 edges
9. `getSession()` - 6 edges
10. `Product Table` - 6 edges

## Surprising Connections (you probably didn't know these)
- `loader()` --calls--> `requireAuth()`  [INFERRED]
  app\routes\admin.admins.tsx → app\lib\auth.server.ts
- `action()` --calls--> `logAudit()`  [INFERRED]
  app\routes\admin.admins.tsx → app\lib\audit.server.ts
- `action()` --calls--> `logAudit()`  [INFERRED]
  app\routes\admin.banners.tsx → app\lib\audit.server.ts
- `action()` --calls--> `logAudit()`  [INFERRED]
  app\routes\admin.business-submissions.tsx → app\lib\audit.server.ts
- `action()` --calls--> `logAudit()`  [INFERRED]
  app\routes\admin.categories.tsx → app\lib\audit.server.ts

## Hyperedges (group relationships)
- **Admin Page Shell Layout** — admin-layout_AdminLayout, sidebar_Sidebar, header_Header [EXTRACTED 1.00]
- **Duplicated Route Path Registry** — sidebar_navGroups, header_routeLabels [INFERRED 0.85]
- **Root App Composition Pattern** — root_App, theme-provider_ThemeProvider, root_NavigationProgress [EXTRACTED 1.00]
- **RBAC Permission Resolution** — lib_auth_getAdminPermissions, db_schema_adminRole, db_schema_role, db_schema_rolePermission, db_schema_permission [EXTRACTED 0.95]
- **Audit Trail Logging Flow** — lib_audit_logAudit, db_schema_auditLog, db_schema_admin [INFERRED 0.85]
- **Session Cookie Encryption Pipeline** — lib_auth_encrypt, lib_auth_decrypt, lib_auth_createSessionCookie, lib_auth_getSession [EXTRACTED 0.90]
- **Paginated CRUD Admin Route Pattern** — pagination_parsePagination, pagination_getOffset, pagination_getTotalPages, validation_paginationSchema [EXTRACTED 1.00]
- **Audit-Logged Mutation Pattern** — admin.admins_action, admin.banners_action, admin.categories_action, admin.coupons_action [INFERRED 0.85]
- **Document Verification Workflow** — admin.documents_action, admin.business-submissions_action, admin.nudity-detection_action [INFERRED 0.80]
- **Content Moderation System** — admin_report-reasons_crud_pattern, admin_reported-users_report_dismissal, admin_reported-videos_report_dismissal [INFERRED 0.85]
- **Authentication Session Lifecycle** — login_authentication_flow, logout_session_destroy, admin_layout_auth_guard [INFERRED 0.90]
- **User Management Ecosystem** — admin_users_list_filter, admin_users-id_composite_detail, admin_verification-requests_approval [INFERRED 0.80]

## Communities

### Community 0 - "Paginated CRUD Routes"
Cohesion: 0.04
Nodes (19): getOffset(), getTotalPages(), parsePagination(), loader(), loader(), action(), loader(), action() (+11 more)

### Community 1 - "Auth-Gated Admin Routes"
Cohesion: 0.04
Nodes (24): logAudit(), requireAuth(), loader(), action(), loader(), action(), loader(), loader() (+16 more)

### Community 2 - "Authentication & Sessions"
Cohesion: 0.1
Nodes (14): createSessionCookie(), decrypt(), destroySessionCookie(), encrypt(), getSession(), hashPassword(), requirePermission(), verifyPassword() (+6 more)

### Community 3 - "Content & Commerce Schema"
Cohesion: 0.09
Nodes (23): Withdrawal Approval/Rejection Flow, Gift Send Table, Hashtag Table, Hashtag Favourite Table, Hashtag Video Join Table, Live Streaming Table, Notification Table, Order Table (+15 more)

### Community 4 - "RBAC & Database Core"
Cohesion: 0.15
Nodes (20): Admin Layout Auth Guard, Database Connection, Admin Table, Admin Role Join Table, Audit Log Table, Permission Table, Role Table, Role Permission Join Table (+12 more)

### Community 5 - "Admin Route Patterns & Schemas"
Cohesion: 0.13
Nodes (18): Push Notification Action, Report Reasons CRUD Pattern, Reported User Dismissal and Blocking, Reported Video Dismissal and Deletion, Settings Key-Value CRUD, Topics CRUD Pattern, User Detail Composite Page, Users List With Multi-Filter (+10 more)

### Community 6 - "Users & Withdrawals"
Cohesion: 0.11
Nodes (4): action(), loader(), action(), loader()

### Community 7 - "Pagination Pattern"
Cohesion: 0.3
Nodes (17): App Sliders loader, Audit Logs loader, Banners loader, Business Submissions loader, Categories loader, Coupons loader, Documents loader, Gifts loader (+9 more)

### Community 9 - "Business Submissions"
Cohesion: 0.22
Nodes (4): action(), docStatus(), loader(), overallDocStatus()

### Community 10 - "Settings CRUD"
Cohesion: 0.2
Nodes (2): action(), loader()

### Community 11 - "Banners CRUD"
Cohesion: 0.22
Nodes (2): action(), loader()

### Community 12 - "Orders CRUD"
Cohesion: 0.22
Nodes (2): action(), loader()

### Community 13 - "Documents Management"
Cohesion: 0.25
Nodes (2): action(), loader()

### Community 14 - "Promotions CRUD"
Cohesion: 0.25
Nodes (2): action(), loader()

### Community 15 - "Sounds Management"
Cohesion: 0.25
Nodes (2): action(), loader()

### Community 16 - "Topics CRUD"
Cohesion: 0.25
Nodes (2): action(), loader()

### Community 17 - "Verification Requests"
Cohesion: 0.25
Nodes (2): action(), loader()

### Community 18 - "Videos Listing"
Cohesion: 0.25
Nodes (2): action(), loader()

### Community 20 - "Admin Actions & Firebase"
Cohesion: 0.29
Nodes (7): Admins action (CRUD), Notifications action (delete), batchSend, sendPushToAll, sendPushToUsers, changePasswordSchema, createAdminSchema

### Community 22 - "Header & Theme"
Cohesion: 0.4
Nodes (2): Header(), useTheme()

### Community 26 - "Composite UI Dialogs"
Cohesion: 0.4
Nodes (5): CommandDialog Component, DialogContent Component, DialogFooter Component, SheetContent Component, Sheet Radix Primitive

### Community 27 - "Coupons & Stores Schema"
Cohesion: 0.4
Nodes (5): Coupon Table, Coupon Used Table, Store Table, Store Address Table, Store Coupon Table

### Community 34 - "Firebase Push"
Cohesion: 0.83
Nodes (3): batchSend(), sendPushToAll(), sendPushToUsers()

### Community 35 - "Admin Shell Layout"
Cohesion: 0.5
Nodes (4): Admin Layout Component, Header Component, Sidebar Component, useTheme Hook

### Community 36 - "Form Controls"
Cohesion: 0.5
Nodes (4): FormControl Component, FormLabel Component, useFormField Hook, Label Component

### Community 40 - "Root App Composition"
Cohesion: 0.67
Nodes (3): Root App Component, Navigation Progress Bar, Theme Provider Component

### Community 41 - "Data Table Components"
Cohesion: 0.67
Nodes (3): Data Table Component, Pagination Component, Search Filter Bar Component

### Community 42 - "Status Badge"
Cohesion: 0.67
Nodes (3): Status Badge Component, Status Variants CSS Mapping, Badge UI Primitive

### Community 43 - "Confirm Dialog"
Cohesion: 0.67
Nodes (3): Confirm Dialog Component, Alert Dialog UI Primitive Set, Button UI Primitive

### Community 44 - "React Hook Form"
Cohesion: 0.67
Nodes (3): Controller (react-hook-form), FormField Component, FormProvider (react-hook-form)

### Community 45 - "Payments Schema"
Cohesion: 0.67
Nodes (3): Card (Payment) Table, Payment Card Table, Purchase Coin Table

### Community 46 - "Geography Schema"
Cohesion: 0.67
Nodes (3): Cities Table, Countries Table, States Table

### Community 47 - "Sound Sections Schema"
Cohesion: 0.67
Nodes (3): Sound Section Grouping, Sound Publish/Unpublish Toggle, soundSection/sound DB Schemas

### Community 64 - "Build Config"
Cohesion: 1.0
Nodes (2): Drizzle ORM MySQL Configuration, Vite Build Configuration

### Community 65 - "Image Upload & Editor"
Cohesion: 1.0
Nodes (2): Image Upload Component, Rich Text Editor Component

### Community 66 - "Route Navigation Labels"
Cohesion: 1.0
Nodes (2): Header Route Labels Map, Sidebar Navigation Groups Configuration

### Community 67 - "Dashboard Widgets"
Cohesion: 1.0
Nodes (2): Chart Widget Component, Stat Card Component

### Community 68 - "Avatar Integration"
Cohesion: 1.0
Nodes (2): Avatar UI Primitive Set, User Avatar Component

### Community 69 - "Password Hashing"
Cohesion: 1.0
Nodes (2): hashPassword Function, verifyPassword Function

### Community 70 - "Session Encryption"
Cohesion: 1.0
Nodes (2): createSessionCookie Function, encrypt Function

### Community 71 - "Social & Promotions Schema"
Cohesion: 1.0
Nodes (2): Follower Table, Promotion Table

### Community 72 - "Coupon Validation"
Cohesion: 1.0
Nodes (2): Coupons action (create/delete), createCouponSchema

### Community 73 - "Banner Validation"
Cohesion: 1.0
Nodes (2): Banners action (CRUD), createBannerSchema

### Community 74 - "Analytics & Dashboard Loaders"
Cohesion: 1.0
Nodes (2): Analytics loader, Dashboard loader

### Community 75 - "Document & Business Actions"
Cohesion: 1.0
Nodes (2): Business Submissions action (approve/reject), Documents action (approve/reject)

### Community 76 - "Gift Validation"
Cohesion: 1.0
Nodes (2): Gifts action (toggle featured/delete), createGiftSchema

### Community 77 - "RBAC Schema"
Cohesion: 1.0
Nodes (2): Role-Based Access Control Management, role/rolePermission/permission DB Schemas

### Community 78 - "Stickers Schema"
Cohesion: 1.0
Nodes (2): Stickers Delete-Only Management, sticker DB Schema

### Community 94 - "React Router Config Entity"
Cohesion: 1.0
Nodes (1): React Router SSR Configuration

### Community 95 - "Root Layout"
Cohesion: 1.0
Nodes (1): Root Layout Component

### Community 96 - "Root Error Boundary"
Cohesion: 1.0
Nodes (1): Root Error Boundary

### Community 97 - "Flat Routes"
Cohesion: 1.0
Nodes (1): Flat Routes Configuration

### Community 98 - "HTML Page Schema"
Cohesion: 1.0
Nodes (1): HTML Page Table

### Community 99 - "Session Cookie Destroy"
Cohesion: 1.0
Nodes (1): destroySessionCookie Function

### Community 100 - "AWS Delete File"
Cohesion: 1.0
Nodes (1): deleteFile Function

### Community 101 - "AWS Get File URL"
Cohesion: 1.0
Nodes (1): getFileUrl Function

### Community 102 - "AWS Generate Key"
Cohesion: 1.0
Nodes (1): generateKey Function

### Community 103 - "Utils CN Function"
Cohesion: 1.0
Nodes (1): cn (classname merge utility)

### Community 104 - "Admin Admins Loader"
Cohesion: 1.0
Nodes (1): Admins loader

### Community 105 - "App Sliders Action"
Cohesion: 1.0
Nodes (1): App Sliders action

### Community 106 - "Categories Action"
Cohesion: 1.0
Nodes (1): Categories action (create/delete)

### Community 107 - "Hashtags Action"
Cohesion: 1.0
Nodes (1): Hashtags action (delete)

### Community 108 - "HTML Pages Detail Loader"
Cohesion: 1.0
Nodes (1): HTML Page Editor loader

### Community 109 - "HTML Pages Detail Action"
Cohesion: 1.0
Nodes (1): HTML Page Editor action (update)

### Community 110 - "Nudity Detection Action"
Cohesion: 1.0
Nodes (1): Nudity Detection action (approve/block/delete)

### Community 111 - "Orders Action"
Cohesion: 1.0
Nodes (1): Orders action (update status)

### Community 112 - "Permissions Loader"
Cohesion: 1.0
Nodes (1): Permissions loader

### Community 113 - "Promotions Action"
Cohesion: 1.0
Nodes (1): Promotions action (toggle/delete)

### Community 114 - "Push Notification Schema"
Cohesion: 1.0
Nodes (1): Official Notification DB Entity

### Community 115 - "Pagination Params Type"
Cohesion: 1.0
Nodes (1): PaginationParams Type

### Community 116 - "Paginated Response Type"
Cohesion: 1.0
Nodes (1): PaginatedResponse Generic Type

## Ambiguous Edges - Review These
- `createGiftSchema` → `Gifts action (toggle featured/delete)`  [AMBIGUOUS]
  app/lib/validation.ts · relation: conceptually_related_to

## Knowledge Gaps
- **99 isolated node(s):** `Drizzle ORM MySQL Configuration`, `React Router SSR Configuration`, `Vite Build Configuration`, `Root Layout Component`, `Navigation Progress Bar` (+94 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Settings CRUD`** (10 nodes): `admin.settings.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleCreate()`, `handleEdit()`, `handlePageChange()`, `handleSearch()`, `loader()`, `openEditDialog()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Banners CRUD`** (9 nodes): `admin.banners.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleCreate()`, `handleFilterChange()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Orders CRUD`** (9 nodes): `admin.orders.tsx`, `action()`, `getNextStatus()`, `handleClear()`, `handleConfirm()`, `handleFilterChange()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Documents Management`** (8 nodes): `admin.documents.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleFilterChange()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Promotions CRUD`** (8 nodes): `admin.promotions.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleFilterChange()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sounds Management`** (8 nodes): `admin.sounds.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleFilterChange()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Topics CRUD`** (8 nodes): `admin.topics.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleCreate()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Verification Requests`** (8 nodes): `admin.verification-requests.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleFilterChange()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Videos Listing`** (8 nodes): `admin.videos.tsx`, `action()`, `handleClear()`, `handleConfirm()`, `handleFilterChange()`, `handlePageChange()`, `handleSearch()`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Header & Theme`** (5 nodes): `header.tsx`, `theme-provider.tsx`, `Header()`, `ThemeProvider()`, `useTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Build Config`** (2 nodes): `Drizzle ORM MySQL Configuration`, `Vite Build Configuration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Image Upload & Editor`** (2 nodes): `Image Upload Component`, `Rich Text Editor Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Route Navigation Labels`** (2 nodes): `Header Route Labels Map`, `Sidebar Navigation Groups Configuration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dashboard Widgets`** (2 nodes): `Chart Widget Component`, `Stat Card Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Avatar Integration`** (2 nodes): `Avatar UI Primitive Set`, `User Avatar Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Password Hashing`** (2 nodes): `hashPassword Function`, `verifyPassword Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Encryption`** (2 nodes): `createSessionCookie Function`, `encrypt Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Social & Promotions Schema`** (2 nodes): `Follower Table`, `Promotion Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Coupon Validation`** (2 nodes): `Coupons action (create/delete)`, `createCouponSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Banner Validation`** (2 nodes): `Banners action (CRUD)`, `createBannerSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Analytics & Dashboard Loaders`** (2 nodes): `Analytics loader`, `Dashboard loader`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Document & Business Actions`** (2 nodes): `Business Submissions action (approve/reject)`, `Documents action (approve/reject)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Gift Validation`** (2 nodes): `Gifts action (toggle featured/delete)`, `createGiftSchema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `RBAC Schema`** (2 nodes): `Role-Based Access Control Management`, `role/rolePermission/permission DB Schemas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Stickers Schema`** (2 nodes): `Stickers Delete-Only Management`, `sticker DB Schema`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `React Router Config Entity`** (1 nodes): `React Router SSR Configuration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Root Layout`** (1 nodes): `Root Layout Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Root Error Boundary`** (1 nodes): `Root Error Boundary`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Flat Routes`** (1 nodes): `Flat Routes Configuration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Page Schema`** (1 nodes): `HTML Page Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Cookie Destroy`** (1 nodes): `destroySessionCookie Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AWS Delete File`** (1 nodes): `deleteFile Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AWS Get File URL`** (1 nodes): `getFileUrl Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AWS Generate Key`** (1 nodes): `generateKey Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utils CN Function`** (1 nodes): `cn (classname merge utility)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Admin Admins Loader`** (1 nodes): `Admins loader`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Sliders Action`** (1 nodes): `App Sliders action`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Categories Action`** (1 nodes): `Categories action (create/delete)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Hashtags Action`** (1 nodes): `Hashtags action (delete)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Pages Detail Loader`** (1 nodes): `HTML Page Editor loader`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Pages Detail Action`** (1 nodes): `HTML Page Editor action (update)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Nudity Detection Action`** (1 nodes): `Nudity Detection action (approve/block/delete)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Orders Action`** (1 nodes): `Orders action (update status)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Permissions Loader`** (1 nodes): `Permissions loader`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Promotions Action`** (1 nodes): `Promotions action (toggle/delete)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Push Notification Schema`** (1 nodes): `Official Notification DB Entity`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pagination Params Type`** (1 nodes): `PaginationParams Type`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Paginated Response Type`** (1 nodes): `PaginatedResponse Generic Type`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `createGiftSchema` and `Gifts action (toggle featured/delete)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `requireAuth()` connect `Auth-Gated Admin Routes` to `Paginated CRUD Routes`, `Authentication & Sessions`, `Users & Withdrawals`, `Business Submissions`, `Settings CRUD`, `Banners CRUD`, `Orders CRUD`, `Documents Management`, `Promotions CRUD`, `Sounds Management`, `Topics CRUD`, `Verification Requests`, `Videos Listing`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `logAudit()` connect `Auth-Gated Admin Routes` to `Paginated CRUD Routes`, `Authentication & Sessions`, `Users & Withdrawals`, `Business Submissions`, `Settings CRUD`, `Banners CRUD`, `Orders CRUD`, `Documents Management`, `Promotions CRUD`, `Sounds Management`, `Topics CRUD`, `Verification Requests`, `Videos Listing`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `parsePagination()` connect `Paginated CRUD Routes` to `Auth-Gated Admin Routes`, `Users & Withdrawals`, `Business Submissions`, `Settings CRUD`, `Banners CRUD`, `Orders CRUD`, `Documents Management`, `Promotions CRUD`, `Sounds Management`, `Topics CRUD`, `Verification Requests`, `Videos Listing`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 64 inferred relationships involving `requireAuth()` (e.g. with `loader()` and `action()`) actually correct?**
  _`requireAuth()` has 64 INFERRED edges - model-reasoned connections that need verification._
- **Are the 32 inferred relationships involving `logAudit()` (e.g. with `action()` and `action()`) actually correct?**
  _`logAudit()` has 32 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `parsePagination()` (e.g. with `loader()` and `loader()`) actually correct?**
  _`parsePagination()` has 23 INFERRED edges - model-reasoned connections that need verification._