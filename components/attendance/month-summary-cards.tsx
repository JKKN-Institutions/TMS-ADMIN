'use client';

import { CalendarCheck2, Clock, Moon, Repeat, Sun, XCircle } from 'lucide-react';
import { SummaryCard, SummaryCards } from '@/components/ui/summary-cards';
import { AUTO_MARK_TITLE } from '@/lib/boarding/auto-mark';
import { summarizeMonth, type MonthRow } from '@/lib/attendance/month-summary';

/**
 * Days present / morning / evening / both trips / absent / auto-absent for a
 * set of trips. "Days present" counts each date once, even with both trips.
 */
export function MonthSummaryCards({ rows, loading = false }: { rows: MonthRow[]; loading?: boolean }) {
  const s = summarizeMonth(rows);
  const v = (n: number) => (loading ? '—' : n);
  return (
    <SummaryCards>
      <SummaryCard icon={CalendarCheck2} label="Days present" value={v(s.daysPresent)} tone="good" hint="a day counts once" />
      <SummaryCard icon={Sun} label="Morning trips" value={v(s.onwardPresent)} />
      <SummaryCard icon={Moon} label="Evening trips" value={v(s.returnPresent)} />
      <SummaryCard icon={Repeat} label="Both trips" value={v(s.bothTripDays)} hint="days with morning + evening" />
      <SummaryCard
        icon={XCircle}
        label="Absent"
        value={v(s.staffAbsent)}
        tone={s.staffAbsent > 0 ? 'danger' : 'neutral'}
        hint="marked by staff"
      />
      <SummaryCard
        icon={Clock}
        label="Auto-absent"
        value={v(s.autoAbsent)}
        tone={s.autoAbsent > 0 ? 'warn' : 'neutral'}
        hint="not marked before closing"
        title={AUTO_MARK_TITLE}
      />
    </SummaryCards>
  );
}
