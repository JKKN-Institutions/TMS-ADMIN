'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, KanbanSquare, RefreshCw, Table2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards, useCardFilters } from '@/components/ui/summary-cards';
import { AgeBadge } from '@/components/ui/display-bits';
import { ageInDays, isActiveTicket, isOverdueTicket } from '@/lib/format/display';
import { type BugReportRow } from '@/lib/bug-reports/shared';
import { getBugColumns, PriorityBadge } from './columns';

// Status board: one column per stage, oldest first, so a pile-up in "Open"
// with nothing "In progress" is visible at a glance.
const BOARD_COLUMNS: { key: string; title: string; match: (s: string) => boolean; accent: string }[] = [
  { key: 'open', title: 'Open', match: (s) => s === 'open', accent: 'border-t-amber-500' },
  { key: 'in_progress', title: 'In progress', match: (s) => s === 'in_progress', accent: 'border-t-sky-500' },
  { key: 'done', title: 'Resolved / closed', match: (s) => s === 'resolved' || s === 'closed', accent: 'border-t-green-500' },
];
const BOARD_LIMIT = 50;

function StatusBoard({ rows, onOpen }: { rows: BugReportRow[]; onOpen: (b: BugReportRow) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {BOARD_COLUMNS.map((col) => {
        const items = rows
          .filter((b) => col.match(b.status))
          .sort((a, b) => (col.key === 'done' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
        return (
          <section key={col.key} className={`flex min-h-[8rem] flex-col rounded-xl border border-t-4 border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 ${col.accent}`}>
            <header className="flex items-center justify-between px-3 py-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{col.title}</h3>
              <span className="rounded-full bg-white px-2 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{items.length}</span>
            </header>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto px-2 pb-2">
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-gray-500">Nothing here.</p>}
              {items.slice(0, BOARD_LIMIT).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpen(b)}
                  className={`block w-full rounded-lg border bg-white p-2.5 text-left text-sm shadow-sm transition-colors hover:border-green-600/50 dark:bg-gray-900 ${
                    isOverdueTicket(b) ? 'border-red-300 dark:border-red-500/40' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <span className="line-clamp-2 font-medium text-gray-900 dark:text-gray-100">{b.title}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={b.priority} />
                    <AgeBadge status={b.status} priority={b.priority} createdAt={b.createdAt} />
                  </span>
                </button>
              ))}
              {items.length > BOARD_LIMIT && (
                <p className="px-1 py-2 text-center text-xs text-gray-500">+{items.length - BOARD_LIMIT} more — use the table view</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

async function fetchList(): Promise<{
  rows: BugReportRow[];
  configured: boolean;
  indexedFrom: string | null;
}> {
  const res = await fetch('/api/admin/bug-reports', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load');
  const json = await res.json();
  return {
    rows: (json.data ?? []) as BugReportRow[],
    configured: json.configured !== false,
    indexedFrom: (json.indexedFrom as string | null) ?? null,
  };
}

/**
 * Walk the sync endpoint chunk by chunk.
 *
 * The reporter platform only answers "reports by THIS one address", so recovering
 * history means asking about every address we know (~6.4k profiles). That can't
 * fit in one serverless request, so the server hands back a `nextOffset` and we
 * keep going until it's null — reporting progress as we do, because this takes
 * minutes rather than seconds.
 */
// Annotated explicitly: `offset` is reassigned from the response, so without this
// TypeScript can't infer the response type without referring to itself (TS7022).
interface SyncChunkResponse {
  scanned?: number;
  upserted?: number;
  errors?: number;
  totalCandidates?: number;
  nextOffset?: number | null;
  writeError?: string;
  error?: string;
}

async function runSync(onProgress: (scanned: number, total: number, found: number) => void) {
  let offset: number | null = 0;
  let scanned = 0;
  let found = 0;
  let errors = 0;

  while (offset !== null) {
    const res: Response = await fetch('/api/admin/bug-reports/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ offset }),
    });
    const json: SyncChunkResponse = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Sync failed');
    if (json.writeError) throw new Error(`Couldn't save results: ${json.writeError}`);

    scanned += json.scanned ?? 0;
    found += json.upserted ?? 0;
    errors += json.errors ?? 0;
    onProgress(scanned, json.totalCandidates ?? 0, found);
    offset = json.nextOffset ?? null;
  }
  return { scanned, found, errors };
}

export default function BugReportsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<'table' | 'board'>('table');
  // Opens on what still needs action; clearing the chip shows everything.
  const cf = useCardFilters([{ id: 'status', value: 'active' }]);
  const [progress, setProgress] = useState<{ scanned: number; total: number; found: number } | null>(null);

  const onSync = async () => {
    setSyncing(true);
    setProgress({ scanned: 0, total: 0, found: 0 });
    try {
      const { scanned, found, errors } = await runSync((s, total, f) =>
        setProgress({ scanned: s, total, found: f })
      );
      await qc.invalidateQueries({ queryKey: ['admin-bug-reports'] });
      toast.success(
        `Synced ${found} report${found === 1 ? '' : 's'} from ${scanned.toLocaleString()} addresses` +
          (errors ? ` (${errors} lookups failed)` : '')
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  };

  const { data, isLoading, error } = useQuery({ queryKey: ['admin-bug-reports'], queryFn: fetchList });
  const list = useMemo(() => data?.rows ?? [], [data]);
  const configured = data?.configured ?? true;

  // Row / "View" action opens the dedicated detail page.
  const columns = useMemo(() => getBugColumns((b) => router.push(`/bug-reports/${b.id}`)), [router]);

  const stats = useMemo(
    () => ({
      total: list.length,
      active: list.filter((b) => isActiveTicket(b.status)).length,
      overdue: list.filter((b) => isOverdueTicket(b)).length,
      inProgress: list.filter((b) => b.status === 'in_progress').length,
      done: list.filter((b) => b.status === 'resolved' || b.status === 'closed').length,
      oldestOpenDays: Math.max(0, ...list.filter((b) => b.status === 'open').map((b) => ageInDays(b.createdAt))),
    }),
    [list]
  );

  if (error) return <div className="p-4 text-destructive">{(error as Error).message}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        description="Problems reported from every portal (admin, student, driver, boarding) through the Report a bug button."
        actions={
          configured && (
            <Button onClick={onSync} disabled={syncing} variant="outline" className="shrink-0">
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing
                ? progress && progress.total
                  ? `Syncing ${progress.scanned.toLocaleString()}/${progress.total.toLocaleString()} — ${progress.found} found`
                  : 'Syncing…'
                : 'Sync from platform'}
            </Button>
          )
        }
      />

      {/* The reporter platform can only answer "reports by ONE address", so this
          list is assembled locally: new reports are captured as they're submitted
          (app/api/v1/public/[...path]/route.ts) and older ones are recovered by
          Sync, which asks the platform about every address we know. Only show the
          prompt when the list is actually empty — once synced it's just noise. */}
      {configured && list.length === 0 && !isLoading && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">No reports here yet.</p>
            <p className="mt-0.5">
              The reporter platform returns bugs one reporter at a time, so this console builds its own list.
              New reports land here automatically as they&apos;re submitted — press{' '}
              <span className="font-medium">Sync from platform</span> to pull in everything reported earlier.
            </p>
          </div>
        </div>
      )}

      {!configured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Bug Reporter isn&apos;t configured yet.</p>
            <p className="mt-0.5">
              Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">NEXT_PUBLIC_BUG_REPORTER_API_URL</code> to
              your real platform URL in <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">.env</code> (it&apos;s
              still the placeholder), then restart the server. Reports will appear here once it&apos;s set.
            </p>
          </div>
        </div>
      )}

      <SummaryCards>
        <SummaryCard label="Needs action" value={stats.active} tone={stats.active ? 'warn' : 'neutral'} title="Open or in progress" {...cf.card('status', 'active')} />
        <SummaryCard label="Overdue" value={stats.overdue} tone={stats.overdue ? 'danger' : 'neutral'} title="Waiting more than 3 days (high/critical) or 7 days" {...cf.card('age', 'overdue')} />
        <SummaryCard
          label="In progress"
          value={stats.inProgress}
          tone="info"
          hint={stats.inProgress === 0 && stats.active > 0 ? 'Nobody is working on any' : undefined}
          {...cf.card('status', 'in_progress')}
        />
        <SummaryCard label="Resolved / closed" value={stats.done} tone="good" {...cf.card('status', 'done')} />
        <SummaryCard label="All reports" value={stats.total} hint={stats.oldestOpenDays ? `Oldest open: ${stats.oldestOpenDays} days` : undefined} {...cf.allCard()} />
      </SummaryCards>

      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700" role="group" aria-label="View">
          {([['table', 'Table', Table2], ['board', 'Status board', KanbanSquare]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === key ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'board' ? (
        <StatusBoard rows={list} onOpen={(b) => router.push(`/bug-reports/${b.id}`)} />
      ) : (
      <DataTable
        columns={columns}
        data={list}
        entityName="bug reports"
        isLoading={isLoading}
        columnFilters={cf.filters}
        onColumnFiltersChange={cf.setFilters}
        searchPlaceholder="Search title, reporter…"
        filters={[
          {
            columnId: 'portal',
            title: 'Portal',
            options: [
              { label: 'Admin', value: 'admin' },
              { label: 'Student', value: 'student' },
              { label: 'Driver', value: 'driver' },
              { label: 'Boarding', value: 'boarding' },
              { label: 'Other', value: 'other' },
            ],
          },
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Needs action', value: 'active' },
              { label: 'Open', value: 'open' },
              { label: 'In progress', value: 'in_progress' },
              { label: 'Resolved', value: 'resolved' },
              { label: 'Closed', value: 'closed' },
            ],
          },
          {
            columnId: 'category',
            title: 'Category',
            options: [
              { label: 'Bug', value: 'bug' },
              { label: 'Feature', value: 'feature_request' },
              { label: 'UI / Design', value: 'ui_design' },
              { label: 'Performance', value: 'performance' },
              { label: 'Security', value: 'security' },
              { label: 'Other', value: 'other' },
            ],
          },
          {
            columnId: 'priority',
            title: 'Priority',
            options: [
              { label: 'Critical', value: 'critical' },
              { label: 'High', value: 'high' },
              { label: 'Medium', value: 'medium' },
              { label: 'Low', value: 'low' },
            ],
          },
        ]}
      />
      )}
    </div>
  );
}
