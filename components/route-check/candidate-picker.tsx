'use client';

import type { Candidate } from '@/lib/route-check/resolve';

const KIND_LABEL: Record<Candidate['personKind'], string> = { learner: 'Learner', staff: 'Staff' };

export function CandidatePicker({
  code, candidates, routeId, onPick, onCancel, busy,
}: {
  code: string;
  candidates: Candidate[];
  routeId: string;
  onPick: (c: Candidate) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Card <span className="font-medium text-gray-900 dark:text-gray-100">{code}</span> matches more than one person. Pick who scanned in:
      </p>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {candidates.map((c) => (
          <li key={`${c.personKind}-${c.id}`}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(c)}
              className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-900"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {KIND_LABEL[c.personKind]}
                  </span>
                  {c.routeId === routeId && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      This bus
                    </span>
                  )}
                  {c.active === false && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      Inactive
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                  {c.name}
                  {c.code && <span className="font-normal text-gray-500 dark:text-gray-400"> · {c.code}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
      >
        Cancel
      </button>
    </div>
  );
}
