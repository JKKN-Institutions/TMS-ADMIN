import { describe, it, expect } from 'vitest';
import { checkAnnouncement, CHECK_ERROR_PHRASE } from './announce';

describe('checkAnnouncement (what the inspector hears after a scan)', () => {
  const base = { name: 'AJAY P', alreadyChecked: false };

  it('says the name in normal case, not capitals, with OK', () => {
    expect(checkAnnouncement({ ...base, outcome: 'ok' })).toBe('Ajay P, OK');
  });
  it('says each problem outcome after the name', () => {
    expect(checkAnnouncement({ ...base, outcome: 'not_on_route' })).toBe('Ajay P, not on this bus');
    expect(checkAnnouncement({ ...base, outcome: 'no_booking' })).toBe('Ajay P, no booking');
    expect(checkAnnouncement({ ...base, outcome: 'fee_unpaid' })).toBe('Ajay P, fee unpaid');
  });
  it('an unknown card has no name to say', () => {
    expect(checkAnnouncement({ ...base, name: null, outcome: 'unknown_card' })).toBe('Card not recognised');
  });
  it('a re-scan says already checked, whatever the outcome', () => {
    expect(checkAnnouncement({ ...base, outcome: 'fee_unpaid', alreadyChecked: true })).toBe('Ajay P, already checked');
  });
  it('a re-scanned unknown card is still just not recognised', () => {
    expect(checkAnnouncement({ ...base, name: null, outcome: 'unknown_card', alreadyChecked: true })).toBe('Card not recognised');
  });
  it('falls back to "Person" when the name is missing', () => {
    expect(checkAnnouncement({ ...base, name: null, outcome: 'no_booking' })).toBe('Person, no booking');
    expect(checkAnnouncement({ ...base, name: '  ', outcome: 'ok' })).toBe('Person, OK');
  });
  it('a manual entry is announced as checked', () => {
    expect(checkAnnouncement({ ...base, outcome: 'manual' })).toBe('Ajay P, checked');
  });
  it('has a short phrase for a failed check', () => {
    expect(CHECK_ERROR_PHRASE).toBe('Not checked, try again');
  });
});
