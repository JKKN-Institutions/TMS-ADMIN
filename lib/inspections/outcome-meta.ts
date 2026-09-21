/**
 * Display metadata for learner ID-check verdicts (label, emoji, Tailwind tone
 * classes). Pure data — shared by the scan dialog and the report so the report
 * does not bundle the camera library.
 */
import type { LearnerOutcome } from './overview';

export interface OutcomeMeta { label: string; icon: string; chip: string; card: string }

export const OUTCOME_META: Record<LearnerOutcome, OutcomeMeta> = {
  ok: {
    label: 'OK', icon: '✅',
    chip: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    card: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200',
  },
  wrong_bus: {
    label: 'Wrong bus', icon: '⚠️',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    card: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  },
  not_booked: {
    label: 'Not booked today', icon: '⚠️',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    card: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  },
  fee_due: {
    label: 'Fee due', icon: '⚠️',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    card: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  },
  unknown_card: {
    label: 'Unknown card', icon: '❌',
    chip: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    card: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
  },
};
