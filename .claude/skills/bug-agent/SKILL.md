---
name: bug-agent
description: Use when you have exported bug report markdown files (.md) from the bug reports module and want to systematically analyze, validate, plan, and fix bugs with automatic status updates. Triggers on phrases like "run bug agent", "fix these bugs", "analyze bug reports", sharing .md files from the export system.
---

# Bug Agent — Automated Bug Resolution Workflow

## Overview

A 5-agent team that takes exported bug markdown files, analyzes the codebase, validates which bugs are real, creates a human-approved fix plan, implements fixes with TDD, and auto-updates bug statuses.

**Core principle:** Human approval is MANDATORY before any implementation. Never implement without explicit "approved" reply.

**Announce at start:** "I'm running the Bug Agent workflow."

## Quick Reference

| Phase | Agent | Output | Gate |
|-------|-------|--------|------|
| 1. Codebase Analysis | `./codebase-analyst-prompt.md` | Codebase snapshot | — |
| 2. Bug Validation | `./bug-validator-prompt.md` | Validated bug list with severity | — |
| 3. Implementation Plan | `./implementation-planner-prompt.md` | Bite-sized fix plan | ⚠️ HUMAN APPROVAL |
| 4. Implementation | `./implementer-prompt.md` | Committed fixes | — |
| 5. Status Update | `./status-updater-prompt.md` | Bugs marked resolved | — |

---

## The Process

### Step 0: Parse Input

Accept one or more markdown files (e.g., `@docs/academic-periods-bugs-2026-03-23.md`).

Extract from the file header:
- **Module**: from `# Bug Reports — academic › periods` → `module=academic`, `sub_module=periods`
- **Bug IDs**: collect all `## Bug Report: BUG-XXXXXX` display_ids and their UUID `id:` from YAML frontmatter
- **Bug count**: total bugs in file

If multiple files passed, group by module. Run Agent #1 once per unique module.

### Step 1: Dispatch Codebase Analyst

Use `./codebase-analyst-prompt.md`.

Pass:
- `module_name` (e.g., `academic`)
- `sub_module_name` (e.g., `periods`)
- Working directory: `D:/Projects/MyJKKN`

Wait for structured codebase snapshot before proceeding.

### Step 2: Dispatch Bug Validator

Use `./bug-validator-prompt.md`.

Pass:
- Full markdown file content
- Codebase snapshot from Step 1

Wait for validated bug list with classifications and severity scores.

### Step 3: Dispatch Implementation Planner

Use `./implementation-planner-prompt.md`.

Pass:
- Validated bugs (VALID only)
- Codebase snapshot

Wait for full implementation plan document.

### Step 4: ⚠️ HUMAN APPROVAL GATE

**STOP. Show the plan. Wait.**

Display the implementation plan in full, then show:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Bug Fix Plan Ready

Valid bugs: [N]   Skipped (invalid/feature): [M]
Files to change: [list]

To APPROVE ALL: reply "approved"
To APPROVE PARTIAL: reply "approved, only fix 1 and 3"
To CANCEL: reply "cancel"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**DO NOT dispatch Agent #4 until you receive an explicit approval reply.**
**DO NOT interpret "ok", "sounds good", or "let's go" as approval — wait for "approved".**

### Step 5: Dispatch Implementer (per approved fix)

Use `./implementer-prompt.md`. One sub-agent per fix (fresh context each time).

Pass:
- The specific fix task from the approved plan (full task text)
- Codebase snapshot (relevant files only)
- Commit message format: `fix(module/sub): description [BUG-XXXXXX]`

After each fix, run spec compliance review then code quality review before moving to next.

If a fix is BLOCKED, escalate to user — never skip or auto-improvise.

### Step 6: Dispatch Status Updater

Use `./status-updater-prompt.md`.

Pass:
- List of fixed bugs: `[{ display_id, uuid_id, fix_commit_sha }]`
- List of skipped bugs: `[{ display_id, reason }]`

Wait for confirmation that statuses were updated in the database.

### Step 7: Final Report

Show:

```
Bug Agent Complete ✓

Fixed:   [N] bugs — statuses updated to "resolved"
Skipped: [M] bugs — [reason summary]
Commits: [list of commit SHAs with messages]
```

---

## Advanced Options

| Option | Usage | Effect |
|--------|-------|--------|
| **Direct mode** | `"run bug agent on academic/periods"` | Calls `/api/bug-reports/export` directly, no manual export needed |
| **Severity filter** | `"only fix P0 and P1 bugs"` | Lower severity bugs included in plan but skipped in implementation |
| **Partial approval** | `"approved, only fix 1 and 3"` | Only specified fix IDs implemented |
| **Batch mode** | Share multiple `.md` files | Analyst runs once per unique module |
| **Status-only mode** | `"only update statuses for these bugs"` | Skips analysis/implementation, only runs Agent #5 |

---

## Module → Codebase Mapping

| Module | Routes | Services | Hooks | API |
|--------|--------|----------|-------|-----|
| `academic` | `app/(routes)/academic/` | `lib/services/academic/` | `hooks/academic/` | `app/api/academic/` |
| `billing` | `app/(routes)/billing/` | `lib/services/billing/` | `hooks/billing/` | `app/api/billing/` |
| `organization` | `app/(routes)/organization/` | `lib/services/organization/` | `hooks/organization/` | `app/api/organization/` |
| `learners` | `app/(routes)/learners/` | `lib/services/learners/` | `hooks/learners/` | `app/api/learners/` |
| `staff` | `app/(routes)/staff/` | `lib/services/staff/` | `hooks/staff/` | `app/api/staff/` |
| `admissions` | `app/(routes)/admissions/` | `lib/services/admissions/` | `hooks/admissions/` | `app/api/admissions/` |
| `startup-studio` | `app/(routes)/startup-studio/` | `lib/services/startup-studio/` | `hooks/startup-studio/` | `app/api/startup-studio/` |
| `bug-reports` | `app/(routes)/admin/bug-reports/` | `lib/services/` | `hooks/bug-reports/` | `app/api/bug-reports/` |

**Supabase files** (always read for the relevant module):
- Tables: `supabase/setup/01_tables.sql`
- Functions: `supabase/setup/02_functions.sql`
- Policies: `supabase/setup/03_policies.sql`
- Triggers: `supabase/setup/04_triggers.sql`
- Views: `supabase/setup/05_views.sql`

---

## Red Flags — STOP Immediately

- About to dispatch Agent #4 without seeing "approved" in the last user message → **STOP**
- Plan has a fix that touches billing calculations, RLS policies, or auth → **Flag to user before dispatching**
- Bug validator returned 0 valid bugs → **Report to user, do not continue**
- Implementer sub-agent returns BLOCKED → **Escalate to user, do not retry same approach**
