---
name: tab-refocus-state-loss-fix
description: Diagnose and fix the bug class where form data, unsaved input, dialog state, selected rows, or stateful component state is cleared/reset when a user switches browser tabs and returns to the MyJKKN app. Use this skill whenever the user reports ANY of these symptoms — "form cleared when I switch tabs", "data gone after tab switch", "input lost when I come back", "page auto-refreshes on focus", "dialog resets", "filters lost", "selection cleared", "component re-renders on tab return", "modal closes by itself", "unsaved changes disappeared", or any behavior where visible UI state vanishes after the browser tab loses and regains focus. Also use proactively when modifying authentication guards, permission wrappers, or tab-sensitive components. Covers MyJKKN's Next.js + Supabase + react-hook-form + TanStack Query stack.
---

# Tab Refocus State Loss — Diagnostic & Fix Skill

## Purpose

In the MyJKKN app, a recurring bug class causes user-visible state to be destroyed when the browser tab loses focus and regains it. This skill helps identify the root cause quickly and apply the right fix.

The fundamental problem is **component unmounting during tab refocus**. When React unmounts a component, all its internal state (including `react-hook-form` form state, dialog open/close state, selected rows, scroll position, etc.) is lost. If something causes the component to unmount and remount during a tab switch, the user sees their data disappear.

## Why This Happens (Mental Model)

The MyJKKN stack has several layers that can react to browser visibility events:

1. **Supabase auth (`supabase-js` v2.x)** — re-fires `SIGNED_IN` on `document.visibilitychange` even though the user didn't actually sign in again. This is a known upstream behavior.
2. **TanStack Query (React Query)** — `refetchOnWindowFocus: true` (default) causes queries to re-run when the tab becomes visible.
3. **Supabase Realtime** — channels reconnect when the tab regains focus, sometimes firing change events.
4. **Custom `visibilitychange` listeners** — any `window.addEventListener('visibilitychange', ...)` can trigger arbitrary state updates.

The actual data loss comes from **one of these events triggering a state change that makes an ancestor component return a different tree** (loading spinner, fallback, null). That different tree unmounts the subtree containing the form/dialog/selection, and React-managed state dies with it.

Understanding this mental model is more valuable than memorizing fix recipes — once you see the unmount-remount chain, the fix is usually obvious.

## Diagnostic Workflow

Follow these steps in order. Stop when you find the cause — don't apply fixes speculatively.

### Step 1: Confirm the symptom category

Ask the user (or infer from their message) which of these matches:

| Symptom | Most likely cause |
|---------|-------------------|
| Form fields clear on tab switch | Auth guard unmounts during `SIGNED_IN` refire (most common) |
| Data table refetches and shows spinner | React Query `refetchOnWindowFocus` |
| Dialog/modal closes itself | Parent component re-renders and resets `open` state |
| Selected rows disappear | Data table re-fetches and recreates rows |
| Filters reset to defaults | URL/state sync lost during re-render |
| Page fully reloads (URL flash) | Middleware redirect from stale auth |

### Step 2: Identify the protected page's guard chain

Almost every MyJKKN page is wrapped in one or more auth guards. Read the page file and note every wrapper:

```tsx
// Common guards to look for
<SuperAdminOnly>          // components/auth/admin-permission-guard.tsx
<AdminPermissionGuard>    // components/auth/admin-permission-guard.tsx
<PermissionGuard>         // components/auth/permission-guard.tsx
<InstitutionAccessGuard>  // components/auth/institution-access-guard.tsx
<CanView> / <CanEdit>     // components/auth/permission-guard.tsx
```

Each guard typically has this shape:
```tsx
if (isLoading) return <>{loading}</>;      // ← returns null or spinner
if (!hasAccess) return <>{fallback}</>;    // ← returns null or "access denied"
return <>{children}</>;
```

**The problem**: when `isLoading` flips to `true` after the component has already loaded successfully once, the guard returns a different tree and **unmounts `children`**. This is the #1 root cause.

### Step 3: Trace where `isLoading` flips

The guards read `isLoading` from `usePermissions()` or `useAuth()`. Check these files in order:

1. **`hooks/use-auth-provider.tsx`** — The auth context. Look at the `onAuthStateChange` handler. Does it call `setIsLoading(true)` on `SIGNED_IN` events?
2. **`hooks/use-permissions.ts`** — React Query for permissions. Check `refetchOnWindowFocus` (should be `false`).
3. **`hooks/use-user-institution-access.ts`** — Similar query patterns.

The canonical fix for the auth provider lives at `hooks/use-auth-provider.tsx` (see **Fix Pattern A** below). If this file doesn't already have the `profileRef` deduplication, that's almost certainly the bug.

### Step 4: Check React Query configuration

If the symptom is "data refetches on focus" rather than "form clears", the problem is TanStack Query:

```bash
grep -rn "refetchOnWindowFocus" hooks/ lib/
```

Queries that should NOT refetch on focus (forms, lookups, permissions, reference data) should have:
```ts
useQuery({
  queryKey: [...],
  queryFn: ...,
  refetchOnWindowFocus: false,
  staleTime: 5 * 60 * 1000,
});
```

### Step 5: Check for custom visibility listeners

```bash
grep -rn "visibilitychange\|onfocus\|addEventListener.*focus" hooks/ components/ app/
```

Any custom listener can be a culprit. Review each for whether it correctly guards against duplicate firing.

### Step 6: Check Supabase Realtime subscriptions

```bash
grep -rn "channel\|subscribe\|postgres_changes" hooks/ lib/
```

If a realtime subscription is on the page, it may re-fire events after reconnection. Ensure the handler is idempotent.

## Fix Patterns

Apply only the fix that matches what Step 2–6 found. Don't apply all of them.

### Fix Pattern A: Deduplicate SIGNED_IN in auth provider (MOST COMMON)

**When to use**: Step 3 showed `setIsLoading(true)` being called on every non-refresh auth event, including the redundant `SIGNED_IN` that fires on tab refocus.

**File**: `hooks/use-auth-provider.tsx`

**Why it works**: Supabase re-fires `SIGNED_IN` for the *same user* when the tab regains visibility. If we already have that user's profile in memory, there's nothing to reload — we can safely short-circuit. We use a `useRef` because the `onAuthStateChange` callback closes over the initial `profile` value and won't see updates otherwise.

**The fix** (apply if not already present):

```tsx
import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ref mirrors profile so the callback closure sees the latest value
  const profileRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    // ... existing loadUserAndProfile setup ...

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT' && !session) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      // Supabase re-fires SIGNED_IN on tab refocus. Skip if we already have
      // this user loaded — prevents flipping isLoading=true and unmounting
      // protected page content.
      if (event === 'SIGNED_IN' && session?.user?.id && profileRef.current?.id === session.user.id) {
        return;
      }

      setIsLoading(true);
      loadUserAndProfile();
    });
    // ...
  }, [supabase]);
}
```

This single fix resolves state loss on the vast majority of MyJKKN pages because virtually all of them are downstream of the auth provider.

### Fix Pattern B: Stabilize guard components against loading flips

**When to use**: You've confirmed `isLoading` flips briefly but the root cause in the auth provider can't be fixed (e.g., it's a new event type). You want the guard itself to resist unmounting.

**Pattern**: Cache the last-known-good answer so the guard doesn't render `null` during transient loading.

```tsx
export function SuperAdminOnly({ children, fallback = null }) {
  const { isSuperAdmin, isLoading } = usePermissions();
  const lastKnownRef = useRef<boolean | null>(null);

  // Capture answer whenever we have a definite value
  if (!isLoading) lastKnownRef.current = isSuperAdmin;

  // During loading, trust the last answer we had. If we've never had one,
  // we can't decide yet — render loading state.
  const effective = isLoading ? lastKnownRef.current : isSuperAdmin;

  if (effective === null) return null;    // first-ever load
  return <>{effective ? children : fallback}</>;
}
```

This keeps `children` mounted across brief loading flips. Only the first-ever load shows a blank screen.

### Fix Pattern C: Disable `refetchOnWindowFocus` for non-critical queries

**When to use**: Step 4 showed a query that refetches on focus, and that refetch triggers a loading state that unmounts stuff (or is just annoying).

```tsx
useQuery({
  queryKey: ['institution-names'],
  queryFn: fetchInstitutionNames,
  refetchOnWindowFocus: false,  // ← add this
  staleTime: 5 * 60 * 1000,     // 5 min is usually fine for lookups
});
```

**Do keep `refetchOnWindowFocus: true`** for:
- Live dashboards showing counters/alerts
- Real-time monitoring pages
- Anything where staleness matters more than form preservation

**Do set it to `false`** for:
- Lookup lists (institutions, departments, roles)
- Permission/RBAC queries
- Reference data
- Any query whose result is rendered inside a form

### Fix Pattern D: Use `keepValues` when resetting react-hook-form

**When to use**: A form explicitly calls `form.reset()` somewhere that fires on focus. Check for `useEffect` blocks that reset forms on some dependency change.

```tsx
// BAD — wipes user input
form.reset(newDefaults);

// GOOD — merges defaults but keeps user's current input where they've typed
form.reset(newDefaults, { keepValues: true, keepDirty: true });
```

### Fix Pattern E: Auto-save long forms to localStorage

**When to use**: Fix Patterns A-D are applied but the user still wants belt-and-suspenders protection for long forms (institution creation, staff onboarding, etc.). This is a defensive measure — not a root-cause fix.

Pattern:
```tsx
const FORM_STORAGE_KEY = 'institution-form-draft';

// Auto-save on every change (throttled)
useEffect(() => {
  const subscription = form.watch((values) => {
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(values));
  });
  return () => subscription.unsubscribe();
}, [form]);

// Restore on mount
useEffect(() => {
  if (!isEditing) {
    const draft = localStorage.getItem(FORM_STORAGE_KEY);
    if (draft) {
      try { form.reset(JSON.parse(draft)); } catch {}
    }
  }
}, []);

// Clear on successful submit
await service.create(values);
localStorage.removeItem(FORM_STORAGE_KEY);
```

Only use this for forms that take >30 seconds to fill. It adds complexity and can surprise users who expect a fresh form.

### Fix Pattern F: Make custom visibility listeners idempotent

**When to use**: Step 5 found a custom `visibilitychange` handler that's causing damage.

```tsx
useEffect(() => {
  let lastRun = 0;
  const handler = () => {
    if (document.visibilityState !== 'visible') return;
    // Debounce to avoid rapid re-runs
    const now = Date.now();
    if (now - lastRun < 5000) return;
    lastRun = now;
    // ... do whatever needed to do ...
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}, []);
```

## Verification Steps

After applying a fix, verify in this order:

1. **Rebuild the dev server** (`npm run dev` restart).
2. **Navigate to the affected page** and reproduce the original input.
3. **Switch to another tab for 10+ seconds**, then switch back.
4. **Verify** the form data / dialog / selection is intact.
5. **Check Chrome DevTools Console** — you should NOT see a flash of loading spinner or any error logs during the tab switch.
6. **Check DevTools → React DevTools → Components tab** — the suspect component should remain mounted across the tab switch. If it unmounts and remounts, the fix didn't take.

If verification fails, re-run the diagnostic workflow from Step 2. The initial guess may have been wrong — there could be multiple guard layers, or a different chain of state updates.

## Anti-Patterns to Avoid

- **Don't globally disable `refetchOnWindowFocus`** in the QueryClient default — live dashboards will break. Do it per-query.
- **Don't use `useLocalStorage` for primary form state** — localStorage is sync and slow on large objects; use it only for auto-save snapshots.
- **Don't call `form.reset()` inside `useEffect` with broad dependencies** — this is often the bug itself, not a fix.
- **Don't wrap every form in an `ErrorBoundary` thinking it will help** — error boundaries don't preserve state on unmount.
- **Don't remove the auth guards** — those exist for security; fix the loading-state flip, not the guard itself.

## Quick Reference — Where to Look

| File | What it controls |
|------|------------------|
| `hooks/use-auth-provider.tsx` | Global auth state, `SIGNED_IN` handling (Fix Pattern A lives here) |
| `hooks/use-permissions.ts` | Permission query config (check `refetchOnWindowFocus`) |
| `hooks/use-user-institution-access.ts` | Institution access query config |
| `hooks/organization/use-institutions-with-access.ts` | Institution dropdown data fetching |
| `components/auth/admin-permission-guard.tsx` | `SuperAdminOnly`, `AdminPermissionGuard` |
| `components/auth/permission-guard.tsx` | `PermissionGuard`, `CanView`, `CanEdit` |
| `components/auth/institution-access-guard.tsx` | `InstitutionAccessGuard` |
| `components/providers/*` | `QueryClient` configuration |

## The One-Page Summary

1. **Symptom**: UI state disappears on tab refocus.
2. **Cause 90% of the time**: Auth guard unmounts during a redundant `SIGNED_IN` event.
3. **Fix 90% of the time**: Apply Fix Pattern A to `hooks/use-auth-provider.tsx`.
4. **If that's already applied**: Work through Steps 2–6 to find the specific chain, then apply the matching fix pattern.
5. **Verify**: Reproduce the scenario and confirm the component stays mounted.
