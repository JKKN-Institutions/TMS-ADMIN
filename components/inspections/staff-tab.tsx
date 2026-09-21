import { Phone } from 'lucide-react';
import type { InspectionOverview } from '@/lib/inspections/types';
import { fmtIST } from '@/lib/inspections/format';

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-green-700 hover:underline dark:text-green-400">
      <Phone className="h-3.5 w-3.5" />{phone}
    </a>
  );
}

export function StaffTab({ overview }: { overview: InspectionOverview }) {
  const { incharges, otherMarkers, staffRiders } = overview;
  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Boarding in-charge</h3>
        {incharges.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No in-charge assigned to this route</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {incharges.map((ic) => (
              <li key={ic.staffEmail} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate font-medium">{ic.name}</span>
                  <PhoneLink phone={ic.phone} />
                </span>
                <span className="text-sm">
                  {ic.absent ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      Declared absent{ic.coveredBy ? ` · covered by ${ic.coveredBy}` : ''}
                    </span>
                  ) : ic.marks > 0 ? (
                    <span className="text-green-700 dark:text-green-400">
                      ✅ Marked {ic.marks} learner{ic.marks === 1 ? '' : 's'}
                      {ic.firstAt && ic.lastAt ? `, ${fmtIST(ic.firstAt)}–${fmtIST(ic.lastAt)}` : ''}
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">⚠️ Not marked yet</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {otherMarkers.length > 0 && (
        <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Also marked this bus</h3>
          <ul className="space-y-1">
            {otherMarkers.map((m) => (
              <li key={m.name} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">{m.name}</span>
                <span className="text-gray-500 dark:text-gray-400">{m.marks} mark{m.marks === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Staff who ride this bus</h3>
        {staffRiders.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No staff riders recorded for this route</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {staffRiders.map((s) => (
                <li key={s.staffId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{s.name}</span>
                    {s.designation && <span className="text-gray-500 dark:text-gray-400"> · {s.designation}</span>}
                  </span>
                  <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{s.stopName ?? '—'}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 dark:text-gray-500">Staff boarding is not recorded in TMS</p>
          </>
        )}
      </section>
    </div>
  );
}
