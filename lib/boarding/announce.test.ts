import { describe, it, expect, vi, afterEach } from 'vitest';
import { withoutBookingPhrase, spokenName, speak, primeSpeech, isVoiceMuted, setVoiceMuted } from './announce';

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
