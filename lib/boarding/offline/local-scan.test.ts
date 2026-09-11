import { describe, expect, it } from 'vitest';
import { resolveScanOffline } from './local-scan';

const ID = '0f3b6c1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b';
const roster = {
  rows: [
    { learner_id: ID, name: 'Priya', booked: true, status: 'unmarked' },
    { learner_id: 'b1', name: 'Ravi', booked: false, status: 'unmarked' },
    { learner_id: 'c1', name: 'Anu', booked: true, status: 'present' },
  ],
  cards: { '348295-7': 'b1', '111111-1': 'c1' },
};

describe('resolveScanOffline', () => {
  it('resolves a camera-read JKKN ID through the saved card map', () => {
    expect(resolveScanOffline('348295-7', 'camera', roster)).toEqual({
      kind: 'resolved', learnerId: 'b1', name: 'Ravi', booked: false, verified: true, alreadyPresent: false,
    });
  });

  it('refuses a typed JKKN ID, exactly as the server does', () => {
    expect(resolveScanOffline('348295-7', 'typed', roster)).toMatchObject({ kind: 'refused' });
  });

  it('reads the learner id out of a pass QR but marks it unverified', () => {
    const token = `${ID.toUpperCase()}.${'a'.repeat(32)}`;
    expect(resolveScanOffline(token, 'camera', roster)).toEqual({
      kind: 'resolved', learnerId: ID, name: 'Priya', booked: true, verified: false, alreadyPresent: false,
    });
  });

  it('flags a learner already present on the saved list', () => {
    expect(resolveScanOffline('111111-1', 'camera', roster)).toMatchObject({ kind: 'resolved', alreadyPresent: true });
  });

  it('queues an unknown card or pass rather than dropping it', () => {
    expect(resolveScanOffline('999999-9', 'camera', roster)).toMatchObject({ kind: 'unknown' });
    const other = `${'1'.repeat(8)}-1111-1111-1111-${'1'.repeat(12)}.${'b'.repeat(32)}`;
    expect(resolveScanOffline(other, 'camera', roster)).toMatchObject({ kind: 'unknown' });
  });

  it('refuses 6-digit codes and unrecognised input offline', () => {
    expect(resolveScanOffline('123456', 'typed', roster)).toEqual({
      kind: 'refused', message: '6-digit codes need signal. Scan the QR or the ID card instead.',
    });
    expect(resolveScanOffline('hello', 'camera', roster)).toMatchObject({ kind: 'refused' });
  });
});
