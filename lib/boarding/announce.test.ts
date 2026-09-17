import { describe, it, expect, vi, afterEach } from 'vitest';
import { withoutBookingPhrase, bookedOnBusPhrase, belongsToBusPhrase, scanAnnouncement, otherBusFromReply, spokenName, speak, primeSpeech, isVoiceMuted, setVoiceMuted } from './announce';

describe('spokenName', () => {
  it('turns stored capitals into a name the voice reads as a word, not letters', () => {
    expect(spokenName('AJAY P')).toBe('Ajay P');
    expect(spokenName('SRI PRASATH P')).toBe('Sri Prasath P');
  });

  it('keeps initials as single capitals and drops their dots', () => {
    expect(spokenName('KARTHIK R V')).toBe('Karthik R V');
    expect(spokenName('KARTHIK R.V.')).toBe('Karthik R V');
  });

  it('tidies stray spaces', () => {
    expect(spokenName('  ARUN   kumar ')).toBe('Arun Kumar');
  });
});

describe('withoutBookingPhrase', () => {
  it('says the full name, then "without booking"', () => {
    expect(withoutBookingPhrase('KANMANIPRIYAN M')).toBe('Kanmanipriyan M, without booking');
  });

  it('still announces when the name is unknown', () => {
    expect(withoutBookingPhrase(null)).toBe('Learner, without booking');
    expect(withoutBookingPhrase('')).toBe('Learner, without booking');
    // The scan route's own fallback name.
    expect(withoutBookingPhrase('Learner')).toBe('Learner, without booking');
  });
});

describe('wrong bus phrases', () => {
  it('names the bus the learner booked', () => {
    expect(bookedOnBusPhrase('SRI PRASATH P', '24')).toBe('Sri Prasath P, booked on bus 24');
  });

  it('names the bus the learner belongs to', () => {
    expect(belongsToBusPhrase('AJAY P', '24')).toBe('Ajay P, belongs to bus 24');
  });

  it('says a zero-padded number as a number', () => {
    expect(bookedOnBusPhrase('KAVIN', '06')).toBe('Kavin, booked on bus 6');
  });

  it('keeps a non-numeric route label as it is', () => {
    expect(belongsToBusPhrase('KAVIN', '24A')).toBe('Kavin, belongs to bus 24A');
  });

  it('falls back when the name or number is missing', () => {
    expect(bookedOnBusPhrase(null, null)).toBe('Learner, booked on another bus');
    expect(belongsToBusPhrase('', '  ')).toBe('Learner, belongs to another bus');
  });
});

describe('scanAnnouncement', () => {
  it('is silent for a booked learner on the right bus', () => {
    expect(scanAnnouncement({ name: 'PRIYA S', booked: true })).toBeNull();
  });

  it('says "without booking" for an unbooked learner', () => {
    expect(scanAnnouncement({ name: 'PRIYA S', booked: false })).toBe('Priya S, without booking');
  });

  it('a booking on another bus beats "without booking"', () => {
    expect(scanAnnouncement({ name: 'SRI PRASATH P', booked: false, otherBus: { kind: 'booked', routeNumber: '24' } }))
      .toBe('Sri Prasath P, booked on bus 24');
  });

  it('a learner from another bus is named with their bus', () => {
    expect(scanAnnouncement({ name: 'AJAY P', booked: false, otherBus: { kind: 'from', routeNumber: '24' } }))
      .toBe('Ajay P, belongs to bus 24');
  });

  it('"boarded another bus" earlier changes nothing about this scan', () => {
    expect(scanAnnouncement({ name: 'A', booked: true, otherBus: { kind: 'boarded', routeNumber: '6' } })).toBeNull();
    expect(scanAnnouncement({ name: 'A', booked: false, otherBus: { kind: 'boarded', routeNumber: '6' } }))
      .toBe('A, without booking');
  });

  it('reads the server reply the same way', () => {
    expect(otherBusFromReply({ kind: 'booked_other_bus', routeNumber: '24' })).toEqual({ kind: 'booked', routeNumber: '24' });
    expect(otherBusFromReply({ kind: 'foreign_learner', routeNumber: '24' })).toEqual({ kind: 'from', routeNumber: '24' });
    expect(otherBusFromReply(undefined)).toBeNull();
  });
});

describe('speak / primeSpeech without a browser', () => {
  it('does nothing and does not throw', () => {
    expect(() => speak('hello')).not.toThrow();
    expect(() => primeSpeech()).not.toThrow();
  });
});

describe('mute', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setVoiceMuted(false);
  });

  function stubBrowser(speaking = false) {
    const store = new Map<string, string>();
    const spoken: string[] = [];
    let cancelled = 0;
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      speechSynthesis: {
        speaking,
        pending: false,
        getVoices: () => [],
        cancel: () => void cancelled++,
        speak: (u: { text: string }) => void spoken.push(u.text),
      },
    });
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      text: string; voice: unknown = null; lang = ''; rate = 1; volume = 1;
      constructor(t: string) { this.text = t; }
    });
    return { store, spoken, cancelled: () => cancelled };
  }

  it('speaks when not muted, without a needless cancel first', () => {
    const b = stubBrowser();
    speak('Priya S, without booking');
    expect(b.spoken).toEqual(['Priya S, without booking']);
    expect(b.cancelled()).toBe(0);
  });

  it('cuts off an earlier sentence that is still playing', () => {
    const b = stubBrowser(true);
    speak('Ajay P, without booking');
    expect(b.cancelled()).toBe(1);
    expect(b.spoken).toEqual(['Ajay P, without booking']);
  });

  it('stays silent when muted, and the choice is remembered on the phone', () => {
    const b = stubBrowser();
    setVoiceMuted(true);
    expect(b.store.get('tms.boarding.voiceMuted')).toBe('1');
    expect(isVoiceMuted()).toBe(true);
    speak('Priya S, without ticket');
    expect(b.spoken).toEqual([]);
  });

  it('muting stops a sentence already being said', () => {
    const b = stubBrowser();
    setVoiceMuted(true);
    expect(b.cancelled()).toBe(1);
  });

  it('unmuting speaks again', () => {
    const b = stubBrowser();
    setVoiceMuted(true);
    setVoiceMuted(false);
    expect(isVoiceMuted()).toBe(false);
    speak('Arun, without ticket');
    expect(b.spoken).toEqual(['Arun, without ticket']);
  });

  it('falls back to memory when storage is blocked', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    setVoiceMuted(true);
    expect(isVoiceMuted()).toBe(true);
  });
});
