/**
 * Display metadata for Route Check outcomes — shared by the check page, the
 * scan verdict and (later) the admin report. Pure data.
 */
import type { CheckOutcome } from './outcome';

export interface CheckOutcomeMeta { label: string; icon: string; chip: string; card: string }

const GREEN = {
  chip: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  card: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200',
};
const AMBER = {
  chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  card: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
};
const RED = {
  chip: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  card: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
};
const GREY = {
  chip: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  card: 'border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
};

export const CHECK_OUTCOME_META: Record<CheckOutcome, CheckOutcomeMeta> = {
  ok:           { label: 'OK',              icon: '✅', ...GREEN },
  not_on_route: { label: 'Not on this bus', icon: '⚠️', ...AMBER },
  no_booking:   { label: 'No booking',      icon: '⚠️', ...AMBER },
  fee_unpaid:   { label: 'Fee unpaid',      icon: '⚠️', ...AMBER },
  unknown_card: { label: 'Unknown card',    icon: '❌', ...RED },
  manual:       { label: 'Added manually',  icon: '📝', ...GREY },
};
