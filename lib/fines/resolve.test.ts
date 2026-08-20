import { describe, it, expect } from 'vitest';
import { resolveFine, FINE_SKIP_LABEL } from './resolve';

describe('resolveFine', () => {
  const rates = new Map<string, number>([['stop-a', 500]]);

  it('prices a learner from their own stop', () => {
    expect(resolveFine({ transport_stop_id: 'stop-a' }, rates)).toEqual({
      ok: true,
      amount: 500,
      stop_id: 'stop-a',
    });
  });

  it('skips a learner with no stop', () => {
    expect(resolveFine({ transport_stop_id: null }, rates)).toEqual({ ok: false, reason: 'no_stop' });
  });

  it('skips a stop that has no fine configured — never defaults to zero', () => {
    expect(resolveFine({ transport_stop_id: 'stop-b' }, rates)).toEqual({
      ok: false,
      reason: 'no_stop_rate',
    });
  });

  it('skips a stop priced at zero rather than raising a ₹0 fine', () => {
    expect(resolveFine({ transport_stop_id: 'stop-z' }, new Map([['stop-z', 0]]))).toEqual({
      ok: false,
      reason: 'no_stop_rate',
    });
  });

  it('has a human label for every skip reason', () => {
    expect(FINE_SKIP_LABEL.no_stop).toBeTruthy();
    expect(FINE_SKIP_LABEL.no_stop_rate).toBeTruthy();
  });
});
