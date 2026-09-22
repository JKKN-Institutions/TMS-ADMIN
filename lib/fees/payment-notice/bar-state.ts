// Pure display logic for the learner countdown. The browser clock decides only
// what the bar SHOWS; the sweep alone decides when a fine is raised.

export interface PaymentNoticePayload {
  status: 'running' | 'fined';
  expires_at: string;
  amount: number;
  urgent_hours: number;
}

export type BarState = 'hidden' | 'running' | 'urgent' | 'processing' | 'fined';

export function barState(notice: PaymentNoticePayload | null | undefined, remaining: number): BarState {
  if (!notice) return 'hidden';
  if (notice.status === 'fined') return 'fined';
  if (remaining <= 0) return 'processing';
  return remaining <= notice.urgent_hours * 3_600_000 ? 'urgent' : 'running';
}

/** server_now − client now, captured when the response arrives. */
export function clockOffset(serverNowIso: string, clientNowMs: number): number {
  return Date.parse(serverNowIso) - clientNowMs;
}

export function remainingMs(expiresAt: string, clientNowMs: number, offsetMs: number): number {
  return Date.parse(expiresAt) - (clientNowMs + offsetMs);
}

export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
