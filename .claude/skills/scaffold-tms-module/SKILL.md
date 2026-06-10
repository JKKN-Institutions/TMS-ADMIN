---
name: scaffold-tms-module
description: >-
  Scaffold a complete TMS-ADMIN admin module end to end — the full vertical
  slice for a new entity: migration (tms_ table), permissions, API route +
  field whitelist, columns, list page, create/edit form, detail page, and the
  sidebar nav entry. Use this skill whenever the user wants a WHOLE module rather
  than one piece: when they say "create a new module for <entity>", "scaffold the
  <entity> module", "build a full CRUD module", "add <entity> management
  end-to-end", "I need a new admin section for <entity>", "set up everything for
  <entity>", or list several pieces (table + form + API + detail) at once. This
  is the ORCHESTRATOR: it sequences the focused skills (admin-api-route,
  advanced-data-table, admin-form, admin-detail-page) in dependency order
  and fills the glue they don't own — the migration, permission seeding, the list
  page shell that wires the DataTable, and the navigation entry. For a single
  piece (just the API, just the table, just the form), use that focused skill
  directly instead.
---

# Scaffold a TMS Admin Module

Build a new admin entity as one coherent vertical slice. This skill is the
conductor: it **invokes the focused skills in the right order** and supplies the
connective tissue none of them own. Read it top to bottom, then work the steps —
invoking each focused skill as you reach it (each loads its own templates).

## What a module is (file inventory)

```
supabase/migrations/<ts>_create_tms_<entity>_schema.sql   # the table
lib/constants/tms-permissions.ts                          # + new permission keys
lib/<entity>/fields.ts                                    # write whitelist  ┐ api skill
app/api/admin/<entity>/route.ts                           # CRUD             │
app/api/admin/<entity>/[id]/route.ts                      # single record    ┘
app/(admin)/<entity>/columns.tsx                          # table columns    ┐ table skill
app/(admin)/<entity>/page.tsx                             # list page shell  ┘ (+ this skill)
app/(admin)/<entity>/<entity>-form.tsx                    # shared form      ┐ form skill
app/(admin)/<entity>/<entity>-api.ts                      # client fetcher   │
app/(admin)/<entity>/new/page.tsx                         # add page         │
app/(admin)/<entity>/[id]/edit/page.tsx                   # edit page        ┘
app/(admin)/<entity>/[id]/page.tsx                        # detail page      — detail skill
lib/navigation.ts                                         # + sidebar entry
```

## Build order (and why)

Build **back to front** — data → API → UI — because each layer consumes the one
below, and you want to be able to verify as you go.

### 1. Migration — the `tms_<entity>` table

Create the table first (everything else reads/writes it). Use the
`supabase-expert` skill / Supabase MCP `apply_migration`. Include the columns the
app relies on:

- `id uuid primary key default gen_random_uuid()`
- the entity's own columns
- audit columns: `created_by uuid`, `updated_by uuid`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`

Commit the migration file under `supabase/migrations/` even though the MCP
applies it to the live DB — the file is the record of the change.

### 2. Permissions — register and seed `tms.<entity>.*`

The API gates writes on `tms.<entity>.create|edit|delete` (and `.view` if you
gate reads). Two parts:

- **Add the constants** to `lib/constants/tms-permissions.ts`:
  ```ts
  WIDGETS_VIEW: 'tms.widgets.view',
  WIDGETS_CREATE: 'tms.widgets.create',
  WIDGETS_EDIT: 'tms.widgets.edit',
  WIDGETS_DELETE: 'tms.widgets.delete',
  ```
- **Seed them** into the roles that should have them (mainly `transport_manager`)
  by adding the keys to the `permissions` jsonb in a permission migration — mirror
  `supabase/migrations/*_add_tms_permission_keys.sql`.

> ⚠️ Permission seeding writes to the **shared MyJKKN `custom_roles` table**, not
> a TMS-only DB. Until the keys are seeded, **only super-admins pass the check —
> every other user gets 403**, which looks like a broken module but is just a
> missing seed. Seed early, and review carefully before applying to the shared
> project.

### 3. API + field whitelist → **`admin-api-route` skill**

Invoke it to produce `lib/<entity>/fields.ts`, `app/api/admin/<entity>/route.ts`,
and `app/api/admin/<entity>/[id]/route.ts`. This is the contract the whole UI
depends on, so do it before any pages.

### 4. Columns → **`advanced-data-table` skill**

Invoke it for `app/(admin)/<entity>/columns.tsx` and the `<DataTable>` usage
snippet. It intentionally stops at the columns — the page shell is step 5.

### 5. List page shell — `app/(admin)/<entity>/page.tsx`

This is the glue the table skill leaves to you: fetch the list, derive role from
`adminUser`, compute stat cards, render the header's Add button, and drop in the
`<DataTable>` from step 4. Full template: **`references/list-page-shell.md`**.

### 6. Create/Edit form → **`admin-form` skill**

Invoke it for `<entity>-form.tsx`, `<entity>-api.ts`, `new/page.tsx`, and
`[id]/edit/page.tsx`. It reuses `fields.ts` (step 3) and the row type (step 4).

### 7. Detail page → **`admin-detail-page` skill**

Invoke it for `app/(admin)/<entity>/[id]/page.tsx`. It reuses the `<entity>-api.ts`
fetcher and the React Query key from step 6, and the badge from step 4.

### 8. Navigation entry — `lib/navigation.ts`

Add one item to `allNavigation` so the module appears in the sidebar:

```ts
{ name: 'Widgets', href: '/widgets', icon: Boxes, permission: TMS_PERMISSIONS.WIDGETS_VIEW, group: 'transport' },
```

Pick an existing `group` (`overview` | `passengers` | `transport` | `services` |
…) and a `lucide-react` icon. The `permission` controls who sees the link.

### 9. Verify

ESLint is unreliable in this repo — verify with the type-checker and route probes
instead (see the project's `env_eslint_broken` / `project_auth_verification`
notes):

- `npx tsc --noEmit` and confirm no new errors in the files you touched.
- With the dev server running, probe the API: an unauthenticated `curl` to
  `/api/admin/<entity>` should give 307/401 (proxy gate working), not 500.
- The agent's browser is unauthenticated, so ask the user to click through the
  live pages (list → detail → edit → create) for the visual pass.

---

## Checklist

- [ ] `tms_<entity>` migration applied + committed (incl. audit columns)
- [ ] `tms.<entity>.*` constants added to `tms-permissions.ts` **and** seeded into `custom_roles`
- [ ] `lib/<entity>/fields.ts` + `route.ts` + `[id]/route.ts`  *(admin-api-route)*
- [ ] `columns.tsx`  *(advanced-data-table)*
- [ ] `page.tsx` list shell  *(references/list-page-shell.md)*
- [ ] `<entity>-form.tsx` + `<entity>-api.ts` + `new/page.tsx` + `[id]/edit/page.tsx`  *(admin-form)*
- [ ] `[id]/page.tsx` detail  *(admin-detail-page)*
- [ ] nav entry in `lib/navigation.ts`
- [ ] `tsc` clean on touched files; API route probe returns 307/401 not 500

## Notes

- **Keep names consistent across all files**: table `tms_<entity>`, route
  `/api/admin/<entity>`, pages `/(admin)/<entity>`, factory `get<Entity>Columns`,
  payload `build<Entity>Payload`, fetcher `fetch<Entity>`, query key
  `['<entity>', id]`. The skills assume this so the pieces connect with no extra
  wiring.
- **Don't skip the focused skills and freehand it.** They carry the non-obvious
  details (the Radix focus-race `setTimeout`, the `42P01` guard, `use(params)`,
  the date/checkbox recipes). Invoking them is faster and more correct than
  re-deriving.
- **MODERN pattern only.** This builds the withAuth + service-role + `tms_` +
  DataTable + in-module-pages stack — not the legacy DatabaseService /
  localStorage-table style. Match this for any new module.
