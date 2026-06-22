# List page shell

The `app/(admin)/<entity>/page.tsx` that the `advanced-data-table` skill stops
short of (it produces `columns.tsx` + the `<DataTable>` snippet; this is the
surrounding page). It fetches the list, derives role from `adminUser`, computes
stat cards, renders the header actions, and wires `<DataTable>`.

Adapt `widget` / `Widget` / `widgets` and the stats/filters. Export & Import
buttons are optional — include them only if the module has the import/export
helpers.

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Boxes, CheckCircle, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getWidgetColumns, type WidgetRow } from './columns';

export default function WidgetsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [widgets, setWidgets] = useState<WidgetRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = localStorage.getItem('adminUser');
    if (u) setUser(JSON.parse(u));
  }, []);

  useEffect(() => {
    fetchWidgets();
  }, []);

  const fetchWidgets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/widgets');
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch widgets');
      setWidgets(result.data || []);
    } catch (e) {
      console.error('Error fetching widgets:', e);
      toast.error('Failed to load widgets');
      setWidgets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (widget: WidgetRow) => {
    if (!confirm(`Delete widget "${widget.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/widgets?id=${widget.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete');
      toast.success('Widget deleted');
      await fetchWidgets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete widget');
    }
  };

  const handleBulkDelete = async (rows: WidgetRow[], reset: () => void) => {
    if (!confirm(`Delete ${rows.length} widget(s)?\n\nThis cannot be undone.`)) return;
    try {
      await Promise.all(rows.map((r) => fetch(`/api/admin/widgets?id=${r.id}`, { method: 'DELETE' })));
      toast.success(`Deleted ${rows.length} widget(s)`);
      reset();
      await fetchWidgets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete selected');
      await fetchWidgets();
    }
  };

  const handleView = (w: WidgetRow) => router.push(`/widgets/${w.id}`);
  const handleEdit = (w: WidgetRow) => router.push(`/widgets/${w.id}/edit`);

  const userRole = user?.role;
  const canManage = ['super_admin', 'transport_manager'].includes(userRole);
  const canDelete = userRole === 'super_admin';

  const columns = useMemo(
    () => getWidgetColumns(handleView, handleEdit, handleDelete, canManage, canDelete),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canDelete]
  );

  // Stat cards — compute from the loaded rows.
  const total = widgets.length;
  const active = widgets.filter((w) => w.status === 'active').length;
  const archived = widgets.filter((w) => w.status === 'archived').length;
  const stats = [
    { title: 'Total Widgets', value: total, subtitle: 'All widgets', icon: Boxes, color: 'blue' as const },
    { title: 'Active', value: active, subtitle: 'In use', icon: CheckCircle, color: 'green' as const },
    { title: 'Archived', value: archived, subtitle: 'Retired', icon: Archive, color: 'gray' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Widgets Management</h1>
          <p className="text-gray-600">Manage widgets</p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Optional: <Export/> and <Import/> buttons go here if the module has them. */}
            <button
              onClick={() => router.push('/widgets/new')}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" /> Add Widget
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {stats.map((s, i) => (
          <UniversalStatCard
            key={s.title}
            title={s.title}
            value={s.value}
            subtitle={s.subtitle}
            icon={s.icon}
            color={s.color}
            variant="default"
            loading={loading}
            delay={i}
          />
        ))}
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={widgets}
        entityName="widgets"
        isLoading={loading}
        searchPlaceholder="Search name, code..."
        enableRowSelection={canManage}
        getRowId={(w) => w.id}
        filters={[
          { columnId: 'status', title: 'Status', options: [
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
            { label: 'Archived', value: 'archived' },
          ]},
        ]}
        toolbarActions={({ selectedRows, resetSelection }) =>
          canDelete && selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => handleBulkDelete(selectedRows, resetSelection)}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Delete Selected ({selectedRows.length})
            </button>
          ) : null
        }
      />
    </div>
  );
}
```

## Notes

- **Role from `adminUser`.** The list page reads the role from localStorage (the
  legacy admin-shell pattern) for show/hide of buttons. This is *UI gating only*
  — the real authorization is `requirePerm` in the API route. Both exist on
  purpose (defense in depth); never rely on the client check alone.
- **`UniversalStatCard`** props used here: `title`, `value`, `subtitle`, `icon`
  (a lucide component), `color`, `variant`, `loading`, `delay`. Some modules keep
  a `create<Entity>Stats()` helper in `lib/stat-utils.ts` instead of inlining the
  array — follow the module if one exists, otherwise inline is fine.
- **Filters must match column ids.** Each `filters[].columnId` has to equal a
  filterable column's `id` in `columns.tsx` — see the `advanced-data-table` skill.
- **Delete by query param.** `DELETE /api/admin/widgets?id=…` matches the API
  route skill's handler (id from the query string, not the body).
