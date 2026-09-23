import { describe, it, expect } from 'vitest';
import { startMessage } from './messages';

describe('startMessage', () => {
  const msg = startMessage('n1', 'l1', '2026-09-25T08:41:33.000Z', 20000);

  it('uses the approved payment reminder title and wording', () => {
    expect(msg.title).toBe('Transport Maintenance Fee – Payment Reminder');
    expect(msg.body).toBe(
      'Dear Learner,\n\n' +
        'Your Transport Maintenance Fee is currently unpaid. A 48-hour countdown has now started.\n\n' +
        'Kindly pay the pending Transport Maintenance Fee within 48 hours. If the payment is not completed within this period, the Transport Maintenance Fee will be automatically waived off and adjusted to the Transport Fee.\n\n' +
        'Please complete the payment within the given time to avoid any issues with your transport services.\n\n' +
        'Thank you.',
    );
  });

  it('keeps the once-per-notice idempotency key and expiry', () => {
    expect(msg.learnerId).toBe('l1');
    expect(msg.idempotencyKey).toBe('payment-notice-start:n1');
    expect(msg.expiresAt).toBe('2026-09-25T08:41:33.000Z');
  });
});
