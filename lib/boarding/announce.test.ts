import { describe, it, expect, vi, afterEach } from 'vitest';
import { withoutTicketPhrase, speak, primeSpeech, isVoiceMuted, setVoiceMuted } from './announce';

describe('withoutTicketPhrase', () => {
  it('names the learner', () => {
    expect(withoutTicketPhrase('Priya S')).toBe('Priya S, without ticket');
  });

  it('tidies stray spaces', () => {
    expect(withoutTicketPhrase('  Arun   Kumar ')).toBe('Arun Kumar, without ticket');
  });

  it('still announces when the name is unknown', () => {
    expect(withoutTicketPhrase(null)).toBe('Learner without ticket');
    expect(withoutTicketPhrase('')).toBe('Learner without ticket');
    // The scan route's own fallback name.
    expect(withoutTicketPhrase('Learner')).toBe('Learner without ticket');
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

  function stubBrowser() {
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

  it('speaks when not muted', () => {
    const b = stubBrowser();
    speak('Priya S, without ticket');
    expect(b.spoken).toEqual(['Priya S, without ticket']);
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
