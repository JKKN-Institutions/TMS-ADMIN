# Settings Phase 4 — Real Notifications / Security / System Tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three decorative Settings tabs with controls that genuinely affect behaviour and data that is genuinely real — and delete every fake number and dead button.

**Architecture:** One new read endpoint (`GET /api/admin/system-info`) supplies real system + activity data. Each tab becomes its own component under `components/admin/`, following the existing `AttendanceWindowSettings` pattern, which shrinks the 864-line settings page by roughly 490 lines.

**Tech Stack:** Next.js 15 route handlers, React client components, Supabase service-role, Vitest.

## Global Constraints

- **The guiding principle is HONESTY.** This phase exists because the tabs show fabricated data (`v2.1.0`, `68% memory`, `99.9% uptime`, `1,234 active sessions`, `Security Score 94/100`) and buttons that only fire a toast. A control that appears to work but changes nothing — or a number that looks measured but is invented — is worse than showing nothing. **If a value cannot be measured, do not display it.** Never substitute a plausible-looking placeholder.
- **Do NOT reimplement things this app cannot do.** Authentication (sessions, 2FA, password policy, IP restriction) is owned by the parent MyJKKN identity provider — this app cannot enforce any of it. Say so in the UI rather than shipping toggles that lie. Likewise drop CDN purge, DB optimize, maintenance mode, and schedule-restart: this is a serverless Next.js app with no such capability.
- **No duplicate source of truth for the reminder flag.** `autoNotifyPassengers` already lives in the `admin_settings` scheduling blob and is read by `lib/booking/reminders.ts`. The Notifications tab reads/writes THAT existing key via the existing `/api/admin/settings`. **Do NOT add a second `notifications` setting_type** — a second flag would drift from the one the cron actually obeys.
- Permissions: the settings surface uses `TMS_PERMISSIONS.SETTINGS_VIEW` / `SETTINGS_MANAGE`. **Do not gate the new endpoint on `ACTIVITY_VIEW`** — a settings-only admin would 403. That is exactly why we are not reusing `/api/admin/activity-log`.
- Response envelope is the project standard `{ success, data }` / `{ error }`, matching `app/api/admin/attendance-windows/route.ts`.
- Verify with `npm run test -- <path>` (NOT `npx vitest run`); test files use RELATIVE imports (vitest cannot resolve `@/`). `npm run lint` is BROKEN. Type gate = `npx tsc --noEmit 2>&1 | grep <file>` returning ZERO lines (~530 pre-existing unrelated errors).
- Commit per task, LOCAL ONLY, explicit `git add <paths>`, never `-A`/`-u`. No history rewrites.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `lib/settings/system-info.ts` | Pure shaping/formatting of system data | Create |
| `lib/settings/system-info.test.ts` | Unit tests for the pure parts | Create |
| `app/api/admin/system-info/route.ts` | Real system + activity read endpoint | Create |
| `components/admin/notifications-settings.tsx` | Notifications tab | Create |
| `components/admin/security-settings.tsx` | Security tab | Create |
| `components/admin/system-settings.tsx` | System tab | Create |
| `app/(admin)/settings/page.tsx` | Tab shell | Modify — delete ~490 lines, mount the 3 components |

---

### Task 1: System-info endpoint + pure helpers

**Files:**
- Create: `lib/settings/system-info.ts`, `lib/settings/system-info.test.ts`
- Create: `app/api/admin/system-info/route.ts`

**Interfaces produced:**
- `formatUptimeish` is NOT included — we cannot measure uptime; do not invent it.
- `interface SystemInfo { app: {...}; database: {...}; activity: {...}; security: {...} }`
- `classifyLatency(ms: number): 'good' | 'slow' | 'critical'` (pure)
- `GET /api/admin/system-info` → `{ success: true, data: SystemInfo }`

- [ ] **Step 1: Write the failing test**

Create `lib/settings/system-info.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyLatency } from './system-info';

describe('classifyLatency', () => {
  it('classifies a fast round-trip as good', () => {
    expect(classifyLatency(0)).toBe('good');
    expect(classifyLatency(199)).toBe('good');
  });
  it('classifies a sluggish round-trip as slow', () => {
    expect(classifyLatency(200)).toBe('slow');
    expect(classifyLatency(999)).toBe('slow');
  });
  it('classifies a very slow round-trip as critical', () => {
    expect(classifyLatency(1000)).toBe('critical');
    expect(classifyLatency(5000)).toBe('critical');
  });
  it('treats a negative reading as good rather than throwing', () => {
    expect(classifyLatency(-1)).toBe('good');
  });
});
```

- [ ] **Step 2: Run and confirm FAIL**

Run: `npm run test -- lib/settings/system-info.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/settings/system-info.ts`**

```typescript
/**
 * Shapes for the Settings > System / Security panels.
 *
 * Every field here must be MEASURED, never invented. The tabs these feed
 * previously displayed fabricated figures (a hardcoded version, "68% memory",
 * "99.9% uptime", "1,234 active sessions"); the whole point of this module is
 * that anything we cannot actually measure is simply absent.
 */

export type LatencyClass = 'good' | 'slow' | 'critical';

export interface SystemInfo {
  app: {
    version: string;        // from package.json
    environment: string;    // NODE_ENV / VERCEL_ENV
    region: string | null;  // VERCEL_REGION when deployed, null locally
    nodeVersion: string;
    nextVersion: string;
  };
  database: {
    connected: boolean;
    latencyMs: number | null; // null when the probe failed
  };
  activity: {
    last24h: number;
    last7d: number;
    total: number;
  };
  security: {
    distinctActors7d: number;
    distinctIps7d: number;
    recent: Array<{
      actorEmail: string | null;
      actorRole: string | null;
      module: string | null;
      action: string | null;
      description: string | null;
      ipAddress: string | null;
      createdAt: string | null;
    }>;
  };
}

/** Bucket a DB round-trip time. Pure. Thresholds: <200ms good, <1000ms slow, else critical. */
export function classifyLatency(ms: number): LatencyClass {
  if (ms < 200) return 'good';
  if (ms < 1000) return 'slow';
  return 'critical';
}
```

- [ ] **Step 4: Run and confirm PASS**

Run: `npm run test -- lib/settings/system-info.test.ts` — expect PASS (4 tests).

- [ ] **Step 5: Create the route**

Create `app/api/admin/system-info/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import type { SystemInfo } from '@/lib/settings/system-info';
import pkg from '@/package.json';

/**
 * Real system + activity signals for the Settings > System and Security tabs.
 *
 * Gated on SETTINGS_VIEW rather than ACTIVITY_VIEW on purpose: this serves the
 * settings screen, and a settings-only admin must not 403 here. Everything
 * returned is measured — if a probe fails we report that honestly (connected:false,
 * latencyMs:null) instead of substituting a plausible number.
 */
export const dynamic = 'force-dynamic';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface LogRow {
  actor_email: string | null;
  actor_role: string | null;
  module: string | null;
  action: string | null;
  description: string | null;
  ip_address: string | null;
  created_at: string | null;
}

async function getSystemInfo(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();

    const now = Date.now();
    const iso24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const iso7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Time a real query for the DB health probe.
    const probeStart = Date.now();
    const totalRes = await svc.from('tms_activity_log').select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - probeStart;
    const connected = !totalRes.error;

    const [res24h, res7d, recentRes] = await Promise.all([
      svc.from('tms_activity_log').select('id', { count: 'exact', head: true }).gte('created_at', iso24h),
      svc.from('tms_activity_log').select('id', { count: 'exact', head: true }).gte('created_at', iso7d),
      svc
        .from('tms_activity_log')
        .select('actor_email, actor_role, module, action, description, ip_address, created_at')
        .gte('created_at', iso7d)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Distinct actors / IPs over 7d — derived from a wider slice than `recent`
    // so the counts aren't silently capped by the 10-row display limit.
    const distinctRes = await svc
      .from('tms_activity_log')
      .select('actor_email, ip_address')
      .gte('created_at', iso7d)
      .limit(1000);
    const actors = new Set<string>();
    const ips = new Set<string>();
    for (const r of (distinctRes.data ?? []) as { actor_email: string | null; ip_address: string | null }[]) {
      if (r.actor_email) actors.add(r.actor_email);
      if (r.ip_address) ips.add(r.ip_address);
    }

    const data: SystemInfo = {
      app: {
        version: pkg.version,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        region: process.env.VERCEL_REGION ?? null,
        nodeVersion: process.version,
        nextVersion: pkg.dependencies?.next ?? 'unknown',
      },
      database: { connected, latencyMs: connected ? latencyMs : null },
      activity: {
        last24h: res24h.count ?? 0,
        last7d: res7d.count ?? 0,
        total: totalRes.count ?? 0,
      },
      security: {
        distinctActors7d: actors.size,
        distinctIps7d: ips.size,
        recent: ((recentRes.data ?? []) as LogRow[]).map((r) => ({
          actorEmail: r.actor_email,
          actorRole: r.actor_role,
          module: r.module,
          action: r.action,
          description: r.description,
          ipAddress: r.ip_address,
          createdAt: r.created_at,
        })),
      },
    };

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('admin/system-info GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getSystemInfo(auth));
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "system-info"` — expect ZERO lines.

```bash
git add lib/settings/system-info.ts lib/settings/system-info.test.ts app/api/admin/system-info/route.ts
git commit -m "feat(settings): real system-info endpoint (version, db health, activity, security)"
```

---

### Task 2: Notifications tab component

**Files:**
- Create: `components/admin/notifications-settings.tsx`

**What it must do:**
- Load the scheduling blob from `GET /api/admin/settings` (envelope: `json.data.settings`) and render ONE real toggle: **Automatic booking reminders** bound to `autoNotifyPassengers`.
- Save via `POST /api/admin/settings` with `{ settings: {...loaded, autoNotifyPassengers: next} }` — **send the whole blob back** so the cutoff/horizon keys are not dropped. Toast on success/failure.
- Explain what the toggle actually does: a daily reminder to transport learners who have **not** booked for tomorrow, sent in-app before the configured cutoff.
- **Replace the fake channel toggles.** Email / SMS / Push do not exist in this app (the notification module is in-app only; web-push is deferred). Either omit them or render them as a clearly-labelled "not available" note — never as working switches.
- Link to the existing notifications module: `/notifications` (list) and `/notifications/new` (compose) via `next/link`.
- Follow `components/admin/attendance-window-settings.tsx` for structure, loading state, and toast usage.

- [ ] **Step 1: Build the component** per the above.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep notifications-settings` — ZERO lines.
- [ ] **Step 3: Commit**

```bash
git add components/admin/notifications-settings.tsx
git commit -m "feat(settings): Notifications tab controls the real booking-reminder toggle"
```

---

### Task 3: Security tab component

**Files:**
- Create: `components/admin/security-settings.tsx`

**What it must do:**
- Read `GET /api/admin/system-info`, render from `data.security` + `data.activity`.
- Show REAL read-only signals: distinct admin actors (7d), distinct IP addresses (7d), admin actions (24h / 7d), and the 10 most recent admin actions (actor, role, module/action, IP, time).
- **Lead with an honest capability note:** authentication — sessions, 2FA, password policy, IP allow-listing — is managed by the parent **MyJKKN identity provider**, not this app, so it cannot be configured here. This replaces the old Session Timeout / Max Login Attempts / Password Expiry / 2FA / IP Restriction controls, which were never enforced by anything.
- Link to `/activity-log` for the full log.
- **Do NOT invent a "security score" or "failed logins" figure** — this app has no login data (auth is external). The old tab showed `94/100` and `12 failed logins`; both were fabricated.
- Handle loading and error states; if the fetch fails, say so rather than rendering zeros as if measured.

- [ ] **Step 1: Build the component.**
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep security-settings` — ZERO lines.
- [ ] **Step 3: Commit**

```bash
git add components/admin/security-settings.tsx
git commit -m "feat(settings): Security tab shows real activity signals, drops unenforced toggles"
```

---

### Task 4: System tab component + wire the page

**Files:**
- Create: `components/admin/system-settings.tsx`
- Modify: `app/(admin)/settings/page.tsx`

**System component must do:**
- Read `GET /api/admin/system-info`, render `data.app`, `data.database`, `data.activity`.
- Application: real version (from package.json), environment, region, Node version, Next version.
- Database: connected badge + measured latency, coloured via `classifyLatency` from `lib/settings/system-info`.
- Activity: real counts (24h / 7d / total).
- **A single real action:** a "Re-run health check" button that simply refetches the endpoint and reports the new latency. No other buttons.
- **DELETE, do not port:** Performance Metrics (avg response time, uptime, memory usage, active sessions), Storage & Files (all bars/sizes), Cache Management (clear app/DB cache, purge CDN), Database Tools (optimize, backup, refresh analytics), System Maintenance (health check toast, maintenance mode, schedule restart), Security & Monitoring (score, alerts, failed logins, scan/monitor/export buttons). Every one of those was fabricated data or a toast-only button.
- Handle loading/error states honestly.

**Page changes (`app/(admin)/settings/page.tsx`):**
- Import the three new components alongside the existing `AttendanceWindowSettings`.
- In `renderTabContent`, return `<NotificationsSettings />`, `<SecuritySettings />`, `<SystemSettings />` for their tabs.
- **Delete** `renderNotificationSettings` (~306-351), `renderSecuritySettings` (~351-437) and `renderSystemSettings` (~437-797), plus the now-unused `notificationSettings` / `securitySettings` state hooks and any icon imports left orphaned. The file should drop by roughly 490 lines.
- Leave the General and Scheduling tabs and the Attendance tab mount ALONE.

- [ ] **Step 1: Build the System component.**
- [ ] **Step 2: Wire the page and delete the dead render functions + state.**
- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "system-settings|settings/page"` — ZERO lines.
Run: `grep -nE "99\.9|1,234|68%|94/100|v2\.1\.0|Purge CDN|Maintenance Mode|Schedule Restart" "app/(admin)/settings/page.tsx"` — expect ZERO hits (all fabricated content gone).
Run: `wc -l "app/(admin)/settings/page.tsx"` — expect a large reduction from 864.

- [ ] **Step 4: Commit**

```bash
git add components/admin/system-settings.tsx "app/(admin)/settings/page.tsx"
git commit -m "feat(settings): System tab shows real data; delete ~490 lines of fabricated UI"
```

---

### Task 5: Verification

- [ ] **Step 1:** `npm run test` — all passing.
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -E "settings|system-info"` — ZERO lines.
- [ ] **Step 3:** `npm run build` — reaches "Compiled successfully" and registers `/api/admin/system-info`.
- [ ] **Step 4: Repo-wide honesty sweep.** Run:
  `grep -rnE "99\.9%|1,234|Security Score|Purge CDN|Optimize Database|Schedule Restart" app components --include=*.tsx | grep -v node_modules`
  Every remaining hit must be justified in the report, or removed.
- [ ] **Step 5: Human smoke checklist** (needs an authenticated browser — the agent's is not):
  1. Settings → Notifications: toggling **Automatic booking reminders** off then reloading shows it still off; the booking-reminder cron then reports `skipped`.
  2. Settings → Security: shows real recent admin actions with IPs, and states that auth is managed by MyJKKN.
  3. Settings → System: version matches `package.json`, DB shows connected with a plausible latency, activity counts are non-zero.
  4. A user with `tms.settings.view` but NOT `tms.activity.view` can still load Security and System (this is why the endpoint uses SETTINGS_VIEW).
