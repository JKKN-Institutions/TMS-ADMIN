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

// Wording approved by the transport office (2026-09-23) — keep it verbatim.
const START_BODY = [
  'Dear Learner,',
  'Your Transport Maintenance Fee is currently unpaid. A 48-hour countdown has now started.',
  'Kindly pay the pending Transport Maintenance Fee within 48 hours. If the payment is not completed within this period, the Transport Maintenance Fee will be automatically waived off and adjusted to the Transport Fee.',
  'Please complete the payment within the given time to avoid any issues with your transport services.',
  'Thank you.',
].join('\n\n');

export function startMessage(noticeId: string, learnerId: string, expiresAt: string, _amount: number): LearnerMessage {
  return {
    learnerId,
    title: 'Transport Maintenance Fee – Payment Reminder',
    body: START_BODY,
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
