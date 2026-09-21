// lib/fees/payment-notice/messages.ts
export const FINE_REASON = 'Transport Maintenance Fee unpaid 48 hours after notice';

export interface LearnerMessage {
  learnerId: string;
  title: string;
  body: string;
  idempotencyKey: string;
  expiresAt?: string | null;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function formatIstDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function startMessage(noticeId: string, learnerId: string, expiresAt: string, amount: number): LearnerMessage {
  return {
    learnerId,
    title: 'Pay your Transport Maintenance Fee within 48 hours',
    body: `Pay your Transport Maintenance Fee by ${formatIstDateTime(expiresAt)} or a Transport Fee of ${inr(amount)} will be added.`,
    idempotencyKey: `payment-notice-start:${noticeId}`,
    expiresAt,
  };
}

export function reminderMessage(noticeId: string, learnerId: string, expiresAt: string, amount: number): LearnerMessage {
  return {
    learnerId,
    title: 'Last few hours to pay your Transport Maintenance Fee',
    body: `Pay by ${formatIstDateTime(expiresAt)} to avoid a Transport Fee of ${inr(amount)}.`,
    idempotencyKey: `payment-notice-remind:${noticeId}`,
    expiresAt,
  };
}
