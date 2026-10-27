'use client';

import React from 'react';
import { entityDisplay, entityName } from '@/lib/activity/entity-names';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { moduleLabel, type ActivityRow } from './columns';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{value ?? '—'}</dd>
    </div>
  );
}

export function ActivityDetailsDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: ActivityRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="capitalize">{entry.action}</span> · {moduleLabel(entry.module)}
          </DialogTitle>
          <DialogDescription>{entry.description ?? 'Activity entry details'}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-4">
          <Field label="Time" value={new Date(entry.created_at).toLocaleString()} />
          <Field label="Actor" value={entry.actor_email ?? 'System'} />
          <Field label="Role" value={entry.actor_role} />
          <Field label="IP Address" value={entry.ip_address} />
          <Field label="Record" value={entityDisplay(entry) || null} />
          <Field
            label="Record type"
            value={
              entry.entity_type ? (
                <span>
                  {entityName(entry.entity_type)}
                  {entry.entity_id ? <span className="block font-mono text-xs text-gray-500">{entry.entity_id}</span> : null}
                </span>
              ) : null
            }
          />
        </dl>

        {entry.changes && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Changes</h4>
            <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
              {JSON.stringify(entry.changes, null, 2)}
            </pre>
          </div>
        )}

        {entry.metadata && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Metadata</h4>
            <pre className="max-h-40 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
